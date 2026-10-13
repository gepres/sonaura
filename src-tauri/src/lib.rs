use std::sync::OnceLock;
use std::time::Duration;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_http::reqwest;
use tokio::sync::Semaphore;

/// Sonaura de escritorio: la app web de Expo dentro de WebView2, con tres plugins:
/// - http: lee la carpeta pública de Drive (sin CORS) y descarga canciones con progreso.
/// - fs: guarda las descargas en la carpeta de datos de la app.
/// - dialog: confirmaciones nativas (quitar descargas).
///
/// Y un protocolo propio, `drive://`, para el streaming (ver `proxy_drive`).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                fit_to_screen(&window);
                #[cfg(windows)]
                paint_title_bar(&window);
                // Nace oculta (tauri.conf.json) para no verla saltar de tamaño al abrir.
                let _ = window.show();
            }
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("drive", |_ctx, request, responder| {
            tauri::async_runtime::spawn(async move {
                responder.respond(proxy_drive(request).await);
            });
        })
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Sonaura");
}

/// Tamaño inicial según la pantalla: ~1280×860 en un monitor grande y, en uno pequeño,
/// el 90 % del área útil (sin la barra de tareas), siempre centrada en ella.
fn fit_to_screen(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else { return };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = (1280.0 * scale).min(f64::from(area.size.width) * 0.9);
    let height = (860.0 * scale).min(f64::from(area.size.height) * 0.9);
    let _ = window.set_size(PhysicalSize::new(width as u32, height as u32));
    let x = area.position.x + ((f64::from(area.size.width) - width) / 2.0) as i32;
    let y = area.position.y + ((f64::from(area.size.height) - height) / 2.0) as i32;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Barra de título con el color de la app (Windows 11; en Windows 10 queda el tema oscuro).
#[cfg(windows)]
fn paint_title_bar(window: &WebviewWindow) {
    use windows::Win32::Foundation::COLORREF;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };
    let Ok(hwnd) = window.hwnd() else { return };
    // COLORREF es 0x00BBGGRR: fondo #0A0717 (el de la app) y texto #F5F2FF.
    let background = COLORREF(0x0017_070A);
    let text = COLORREF(0x00FF_F2F5);
    for (attribute, color) in [
        (DWMWA_CAPTION_COLOR, background),
        (DWMWA_BORDER_COLOR, background),
        (DWMWA_TEXT_COLOR, text),
    ] {
        // Falla sin consecuencias en Windows 10 (atributos no soportados).
        let _ = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                attribute,
                std::ptr::from_ref(&color).cast(),
                std::mem::size_of::<COLORREF>() as u32,
            )
        };
    }
}

/// Bytes por respuesta: el reproductor pide el resto con nuevos rangos, así suena enseguida
/// sin esperar a que baje el archivo entero.
const CHUNK: u64 = 1024 * 1024;
/// Transferencias simultáneas como máximo (cambiar de pista o buscar deja peticiones viejas).
const MAX_IN_FLIGHT: usize = 6;

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            // Un trozo de 1 MiB: si en 30 s no llegó, la petición se abandona.
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default()
    })
}

fn in_flight() -> &'static Semaphore {
    static SLOTS: OnceLock<Semaphore> = OnceLock::new();
    SLOTS.get_or_init(|| Semaphore::new(MAX_IN_FLIGHT))
}

fn valid_drive_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[derive(Debug, PartialEq, Eq)]
enum ByteRange {
    /// `bytes=START-` o `bytes=START-END`.
    From(u64, Option<u64>),
    /// `bytes=-N`: los últimos N bytes (metadatos al final del archivo).
    Suffix(u64),
}

fn parse_range(value: &str) -> Option<ByteRange> {
    let (start, end) = value.trim().strip_prefix("bytes=")?.split_once('-')?;
    match (start.trim(), end.trim()) {
        ("", "") => None,
        ("", n) => Some(ByteRange::Suffix(n.parse().ok()?)),
        (s, "") => Some(ByteRange::From(s.parse().ok()?, None)),
        (s, e) => Some(ByteRange::From(s.parse().ok()?, Some(e.parse().ok()?))),
    }
}

/// Rango a pedir a Drive, recortado a un trozo. `None` si no es satisfacible.
fn upstream_range(range: &ByteRange) -> Option<(String, u64)> {
    match *range {
        ByteRange::From(start, end) => {
            let last = start.saturating_add(CHUNK - 1);
            let end = end.map_or(last, |e| e.min(last));
            (end >= start).then(|| (format!("bytes={start}-{end}"), end - start + 1))
        }
        ByteRange::Suffix(n) if n > 0 => {
            let n = n.min(CHUNK);
            Some((format!("bytes=-{n}"), n))
        }
        ByteRange::Suffix(_) => None,
    }
}

/// Total del archivo según `Content-Range: bytes A-B/TOTAL`.
fn total_from_content_range(value: &str) -> Option<u64> {
    value.rsplit_once('/')?.1.trim().parse().ok()
}

fn empty(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder().status(status).body(Vec::new()).unwrap_or_default()
}

/// Lee el cuerpo hasta `limit` bytes; al salir se suelta la respuesta y se corta la descarga.
async fn read_limited(mut response: reqwest::Response, limit: u64) -> Option<Vec<u8>> {
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        let room = (limit as usize).saturating_sub(body.len());
        body.extend_from_slice(&chunk[..chunk.len().min(room)]);
        if body.len() as u64 >= limit {
            break;
        }
    }
    Some(body)
}

fn partial(body: Vec<u8>, start: u64, total: Option<u64>, content_type: Option<Vec<u8>>) -> Response<Vec<u8>> {
    if body.is_empty() {
        return empty(StatusCode::RANGE_NOT_SATISFIABLE);
    }
    let end = start + body.len() as u64 - 1;
    let total = total.map_or_else(|| "*".to_string(), |t| t.to_string());
    let mut builder = Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{total}"))
        .header(header::CONTENT_LENGTH, body.len());
    if let Some(content_type) = content_type {
        builder = builder.header(header::CONTENT_TYPE, content_type);
    }
    builder.body(body).unwrap_or_else(|_| empty(StatusCode::BAD_GATEWAY))
}

/// `drive://localhost/<id>` (en Windows, `http://drive.localhost/<id>`) → audio de Drive.
///
/// Drive responde 403 a cualquier petición de navegador con `Sec-Fetch-Site: cross-site`
/// (protección anti-hotlinking), y WebView2 la añade siempre a un `<audio>` que apunte a Drive.
/// Desde Rust la petición no lleva esa cabecera. Se respetan los rangos para poder buscar.
async fn proxy_drive(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let id = request.uri().path().trim_start_matches('/');
    if !valid_drive_id(id) {
        return empty(StatusCode::BAD_REQUEST);
    }
    let range = match request.headers().get(header::RANGE) {
        None => ByteRange::From(0, None),
        Some(value) => match value.to_str().ok().and_then(parse_range) {
            Some(range) => range,
            None => return empty(StatusCode::RANGE_NOT_SATISFIABLE),
        },
    };
    let Some((upstream_header, wanted)) = upstream_range(&range) else {
        return empty(StatusCode::RANGE_NOT_SATISFIABLE);
    };

    let Ok(_slot) = in_flight().acquire().await else {
        return empty(StatusCode::SERVICE_UNAVAILABLE);
    };
    let url = format!("https://drive.usercontent.google.com/download?id={id}&export=download");
    // Un reintento ante fallos momentáneos de Drive (red, 5xx o 429 por exceso de peticiones).
    let mut attempt = 0;
    let upstream = loop {
        attempt += 1;
        match client().get(&url).header(header::RANGE, &upstream_header).send().await {
            Ok(r) if attempt < 2 && (r.status().is_server_error() || r.status().as_u16() == 429) => {}
            Ok(r) => break r,
            Err(_) if attempt < 2 => {}
            Err(_) => return empty(StatusCode::BAD_GATEWAY),
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    };
    let content_type = upstream.headers().get(header::CONTENT_TYPE).map(|v| v.as_bytes().to_vec());

    match upstream.status().as_u16() {
        206 => {
            let content_range = upstream
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned);
            let total = content_range.as_deref().and_then(total_from_content_range);
            // Inicio real según Drive (en un sufijo, lo calcula el servidor).
            let start = content_range
                .as_deref()
                .and_then(|v| v.trim().strip_prefix("bytes ")?.split_once('-')?.0.parse().ok());
            let (Some(start), Some(body)) = (start, read_limited(upstream, wanted).await) else {
                return empty(StatusCode::BAD_GATEWAY);
            };
            partial(body, start, total, content_type)
        }
        200 => {
            // Drive ignoró el rango y manda el archivo entero: se lee solo hasta lo pedido.
            let ByteRange::From(start, _) = range else {
                return empty(StatusCode::BAD_GATEWAY);
            };
            let total = upstream.content_length();
            let Some(mut body) = read_limited(upstream, start.saturating_add(wanted)).await else {
                return empty(StatusCode::BAD_GATEWAY);
            };
            if (body.len() as u64) <= start {
                return empty(StatusCode::RANGE_NOT_SATISFIABLE);
            }
            body.drain(..start as usize);
            partial(body, start, total, content_type)
        }
        status => empty(StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rangos() {
        assert_eq!(parse_range("bytes=0-"), Some(ByteRange::From(0, None)));
        assert_eq!(parse_range("bytes=100-199"), Some(ByteRange::From(100, Some(199))));
        assert_eq!(parse_range("bytes=-500"), Some(ByteRange::Suffix(500)));
        assert_eq!(parse_range("bytes=-"), None);
        assert_eq!(parse_range("items=0-1"), None);
        assert_eq!(parse_range("bytes=a-b"), None);
    }

    #[test]
    fn rango_pedido_a_drive() {
        assert_eq!(upstream_range(&ByteRange::From(0, None)), Some(("bytes=0-1048575".into(), CHUNK)));
        assert_eq!(upstream_range(&ByteRange::From(10, Some(19))), Some(("bytes=10-19".into(), 10)));
        assert_eq!(upstream_range(&ByteRange::Suffix(500)), Some(("bytes=-500".into(), 500)));
        assert_eq!(upstream_range(&ByteRange::Suffix(10 * CHUNK)), Some((format!("bytes=-{CHUNK}"), CHUNK)));
        // Rango invertido, sufijo vacío y desbordamiento: no se piden a Drive.
        assert_eq!(upstream_range(&ByteRange::From(20, Some(10))), None);
        assert_eq!(upstream_range(&ByteRange::Suffix(0)), None);
        assert!(upstream_range(&ByteRange::From(u64::MAX, None)).is_some());
    }

    #[test]
    fn total_de_content_range() {
        assert_eq!(total_from_content_range("bytes 0-1023/4997880"), Some(4_997_880));
        assert_eq!(total_from_content_range("bytes 0-1023/*"), None);
    }

    #[test]
    fn ids_de_drive() {
        assert!(valid_drive_id("1ClGiQrrhzPN2-usxTK1VDDm4ZwOhoZPu"));
        assert!(!valid_drive_id(""));
        assert!(!valid_drive_id("../etc/passwd"));
        assert!(!valid_drive_id("abc?x=1"));
    }
}

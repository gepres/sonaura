import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

/**
 * Cliente mínimo de la API de captura de PostHog (`POST /batch/`), sin el SDK: es el mismo
 * código en el navegador, en Windows (Tauri) y en Android, no añade módulos nativos y pesa unas
 * líneas en vez de los ~100 KB de posthog-js. Solo hacen falta eventos: nada de grabaciones ni
 * mapas de calor.
 *
 * - Anónimo: un identificador aleatorio por instalación y sin perfiles de persona.
 * - Los eventos esperan en una cola guardada: lo que se escucha sin conexión se envía al volver
 *   la red, y lo que no se envió antes de cerrar la app sale en la siguiente apertura.
 */

/** Resultado de un envío: `drop` = PostHog lo rechaza (clave mala, cuerpo inválido): no se reintenta. */
export type SendResult = 'ok' | 'retry' | 'drop';
export type Transport = (url: string, body: string, opts: { keepalive: boolean }) => Promise<SendResult>;

export type ClientConfig = {
  apiKey: string;
  /** Base de la API: `https://us.i.posthog.com` o el proxy del propio dominio en la web. */
  endpoint: string;
  /** Propiedades que llevan todos los eventos (app, plataforma, versión…). */
  superProperties: Record<string, unknown>;
  storageKey?: string;
  transport?: Transport;
  now?: () => number;
};

type Pending = { uuid: string; event: string; timestamp: string; properties: Record<string, unknown> };
type Saved = { id?: string; queue?: Pending[] };

const MAX_QUEUE = 1000;
const BATCH_SIZE = 50;
/** Espera antes de enviar, para juntar varios eventos en una petición. */
const FLUSH_DELAY = 5_000;
const MAX_BACKOFF = 10 * 60_000;

export function uuid(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const fetchTransport: Transport = async (url, body, { keepalive }) => {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive });
    if (res.ok) return 'ok';
    return res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? 'drop' : 'retry';
  } catch {
    return 'retry';
  }
};

export function createClient(config: ClientConfig) {
  const storageKey = config.storageKey ?? 'sonaura.analytics.v1';
  const transport = config.transport ?? fetchTransport;
  const now = config.now ?? Date.now;

  let queue: Pending[] = [];
  let distinctId: string | null = null;
  let ready = false;
  let sending = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (!ready) return;
    const data: Saved = { id: distinctId ?? undefined, queue };
    AsyncStorage.setItem(storageKey, JSON.stringify(data)).catch(() => {});
  };

  const saveSoon = () => {
    if (!saveTimer) saveTimer = setTimeout(save, 1_000);
  };

  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  };

  async function flush(keepalive = false): Promise<void> {
    if (!ready || sending || queue.length === 0) return;
    if (timer) clearTimeout(timer);
    timer = null;
    sending = true;
    const batch = queue.slice(0, BATCH_SIZE);
    const body = JSON.stringify({
      api_key: config.apiKey,
      batch: batch.map((e) => ({
        event: e.event,
        uuid: e.uuid,
        timestamp: e.timestamp,
        distinct_id: distinctId,
        properties: { ...e.properties, $process_person_profile: false },
      })),
    });
    const result = await transport(`${config.endpoint}/batch/`, body, { keepalive }).catch((): SendResult => 'retry');
    sending = false;
    if (result === 'retry') {
      failures++;
      schedule(Math.min(30_000 * 2 ** (failures - 1), MAX_BACKOFF));
      return;
    }
    failures = 0;
    const done = new Set(batch.map((e) => e.uuid));
    queue = queue.filter((e) => !done.has(e.uuid));
    save();
    if (queue.length > 0) schedule(0);
  }

  return {
    /** Lee el identificador y la cola guardados. Lo capturado antes se conserva. */
    async init() {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const saved = raw ? (JSON.parse(raw) as Saved) : null;
        if (typeof saved?.id === 'string' && saved.id) distinctId = saved.id;
        if (Array.isArray(saved?.queue)) queue = [...saved.queue, ...queue].slice(-MAX_QUEUE);
      } catch {
        // Datos corruptos: se empieza de cero.
      }
      distinctId ??= uuid();
      ready = true;
      save();
      if (queue.length > 0) schedule(FLUSH_DELAY);
      // Al pasar a segundo plano (o al ocultar la pestaña en la web) se envía lo pendiente.
      AppState.addEventListener('change', (status) => {
        if (status !== 'active') void flush(true);
      });
    },

    capture(event: string, properties: Record<string, unknown> = {}) {
      queue.push({
        uuid: uuid(),
        event,
        timestamp: new Date(now()).toISOString(),
        properties: { ...config.superProperties, ...properties },
      });
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      saveSoon();
      // Sin reiniciar la espera en cada evento (no se aplaza para siempre) ni adelantar un reintento.
      if (sending || failures > 0) return;
      if (queue.length >= BATCH_SIZE) schedule(0);
      else if (!timer) schedule(FLUSH_DELAY);
    },

    flush,

    /** Para las pruebas. */
    pending: () => queue.length,
    distinctId: () => distinctId,
  };
}

export type AnalyticsClient = ReturnType<typeof createClient>;

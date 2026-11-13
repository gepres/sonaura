/**
 * Cuenta las escuchas de verdad, no los clics: suma solo el tiempo que la pista avanza
 * reproduciéndose (un salto con la barra no cuenta) y decide qué evento merece cada pista.
 *
 * - `cancion_escuchada`: 30 s de escucha, o la mitad si la canción dura menos de un minuto
 *   (el mismo criterio que usan los servicios de streaming para contar una reproducción).
 * - `cancion_completa`: llegó al final habiendo escuchado al menos el 80 %.
 * - `cancion_saltada`: se cambió de pista antes de contarla como escuchada.
 *
 * Es lógica pura: el reproductor le avisa y ella emite.
 */

export type ListenEvent = 'cancion_escuchada' | 'cancion_completa' | 'cancion_saltada';

export type ListenExtra = { segundos: number; duracion: number; sin_conexion: boolean };

export type ListenEmit<T> = (event: ListenEvent, item: T, extra: ListenExtra) => void;

/** Segundos que hacen falta para contar una escucha. */
export const LISTEN_SECONDS = 30;
/** Parte de la canción que hay que oír para contarla como completa. */
export const COMPLETE_RATIO = 0.8;
/** Margen entre lo que avanza la pista y lo que avanza el reloj antes de tomarlo por un salto. */
const SEEK_TOLERANCE = 1.5;

type Session<T> = {
  item: T;
  offline: boolean;
  listened: number;
  duration: number;
  lastPos: number | null;
  lastAt: number;
  lastPlaying: boolean;
  counted: boolean;
  finished: boolean;
};

export function createListenTracker<T extends { id: string }>(emit: ListenEmit<T>, now: () => number = Date.now) {
  let s: Session<T> | null = null;

  const extra = (x: Session<T>): ListenExtra => ({
    segundos: Math.round(x.listened),
    duracion: Math.round(x.duration),
    sin_conexion: x.offline,
  });

  const threshold = (x: Session<T>) => (x.duration > 0 ? Math.min(LISTEN_SECONDS, x.duration / 2) : LISTEN_SECONDS);

  const countIfDue = (x: Session<T>) => {
    if (x.counted || x.listened < threshold(x)) return;
    x.counted = true;
    emit('cancion_escuchada', x.item, extra(x));
  };

  /** Lo que avanzó la pista desde la muestra anterior, si fue sonando y no un salto. */
  const played = (x: Session<T>, position: number, at: number) => {
    if (x.lastPos === null || !x.lastPlaying) return 0;
    const advanced = position - x.lastPos;
    const elapsed = (at - x.lastAt) / 1000;
    return advanced > 0 && advanced <= elapsed + SEEK_TOLERANCE ? advanced : 0;
  };

  const leave = () => {
    if (s && !s.finished && !s.counted && s.listened >= 1) emit('cancion_saltada', s.item, extra(s));
  };

  return {
    /**
     * Se cargó `item` para sonar. Si es la misma pista y no había terminado (reintento, reanudar
     * la sesión), sigue la misma escucha; si es otra, la anterior se da por saltada si no contó.
     */
    start(item: T, offline: boolean) {
      if (s && s.item.id === item.id && !s.finished) {
        s.lastPos = null;
        s.offline = offline;
        return;
      }
      leave();
      s = {
        item,
        offline,
        listened: 0,
        duration: 0,
        lastPos: null,
        lastAt: 0,
        lastPlaying: false,
        counted: false,
        finished: false,
      };
    },

    /** Cada actualización de estado del reproductor (cada ~500 ms). */
    progress(position: number, duration: number, playing: boolean) {
      if (!s || s.finished) return;
      const at = now();
      if (duration > 0) s.duration = duration;
      if (playing) s.listened += played(s, position, at);
      s.lastPos = position;
      s.lastAt = at;
      s.lastPlaying = playing;
      countIfDue(s);
    },

    /** La pista llegó al final por sí sola. */
    finish() {
      if (!s || s.finished) return;
      // El último tramo, entre la última actualización y el final, también sonó.
      if (s.duration > 0) s.listened += played(s, s.duration, now());
      countIfDue(s);
      if (s.duration > 0 && s.listened >= s.duration * COMPLETE_RATIO) emit('cancion_completa', s.item, extra(s));
      s.finished = true;
    },
  };
}

export type ListenTracker<T extends { id: string }> = ReturnType<typeof createListenTracker<T>>;

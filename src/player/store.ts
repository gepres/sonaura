import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Track } from '@/catalog';
import { streamSource } from '@/lib/streamSource';
import { localCoverUri, localTrackUri } from '@/state/downloads';
import { useNetwork } from '@/state/network';
import { safeStorage } from '@/state/storage';

import {
  createQueue,
  currentTrackId,
  nextPosition,
  nextRepeatMode,
  previousPosition,
  setShuffle,
  type Queue,
  type RepeatMode,
} from './queue';

type PlayerState = {
  queue: Queue | null;
  /** Pistas de la cola indexadas por id (se persisten para reanudar la sesión). */
  queueTracks: Record<string, Track>;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Intención de reproducir (lo que pidió el usuario), no solo el estado nativo instantáneo. */
  playing: boolean;
  buffering: boolean;
  /** La fuente actual está preparada en el reproductor nativo. */
  loaded: boolean;
  position: number;
  duration: number;
  /** Pista cargada en el reproductor nativo; null tras reabrir la app. */
  loadedTrackId: string | null;
  /** Segundo donde reanudar la última sesión. */
  resumeAt: number;
  /** Temporizador de apagado: epoch ms o null. */
  sleepAt: number | null;
  /** Minutos que faltan, recalculado con cada actualización de estado. */
  sleepMinutesLeft: number | null;
  notice: string | null;
  /** Volumen 0..1 y silencio (en escritorio; en el móvil mandan los botones del teléfono). */
  volume: number;
  muted: boolean;

  playTracks: (tracks: Track[], startIndex: number, opts?: { shuffle?: boolean }) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  skipTo: (position: number) => void;
  seekTo: (seconds: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setSleepTimer: (minutes: number | null) => void;
  clearNotice: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
};

let player: AudioPlayer | null = null;
let lockScreenActive = false;
let askedNotifications = false;

function audio(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(null, { updateInterval: 500 });
    player.addListener('playbackStatusUpdate', onStatus);
    applyVolume(player);
  }
  return player;
}

function applyVolume(p: AudioPlayer) {
  const { volume, muted } = usePlayer.getState();
  p.volume = volume;
  p.muted = muted;
}

/** Configura la sesión de audio: suena en silencio, en segundo plano y toma el foco. */
export async function initPlayer() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });
}

function trackAt(state: PlayerState, queue: Queue): Track | null {
  const id = currentTrackId(queue);
  return id ? state.queueTracks[id] ?? null : null;
}

function isPlayable(track: Track): boolean {
  return useNetwork.getState().online || localTrackUri(track.id) !== null;
}

function showOnLockScreen(track: Track) {
  const metadata = {
    title: track.title,
    artist: track.albumTitle,
    albumTitle: track.albumTitle,
    artworkUrl: localCoverUri(track.albumId) ?? track.artworkUrl ?? undefined,
  };
  const p = audio();
  if (!lockScreenActive) {
    p.setActiveForLockScreen(true, metadata, { showSeekBackward: true, showSeekForward: true });
    lockScreenActive = true;
  } else {
    p.updateLockScreenMetadata(metadata);
  }
}

async function ensureNotificationPermission() {
  // Android 13+ necesita permiso para mostrar los controles en la notificación.
  if (Platform.OS !== 'android' || askedNotifications) return;
  askedNotifications = true;
  try {
    await requestNotificationPermissionsAsync();
  } catch {}
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      /**
       * Carga la pista en `position`. Sin conexión salta a la siguiente pista descargada;
       * si no hay ninguna, se detiene con un aviso.
       */
      const loadAt = (position: number, autoplay: boolean, seekSeconds = 0) => {
        const state = get();
        if (!state.queue) return;
        let queue: Queue = { ...state.queue, position };
        let track = trackAt(state, queue);
        let seek = seekSeconds;
        let guard = queue.order.length;
        while (track && !isPlayable(track) && guard-- > 0) {
          const nextPos = nextPosition(queue, state.repeat === 'one' ? 'all' : state.repeat, false);
          if (nextPos === null || nextPos === position) {
            track = null;
            break;
          }
          queue = { ...queue, position: nextPos };
          track = trackAt(state, queue);
          // La posición guardada era de otra pista.
          seek = 0;
        }
        if (!track || !isPlayable(track)) {
          audio().pause();
          set({ playing: false, notice: 'Sin conexión: descarga pistas para escucharlas offline.' });
          return;
        }
        const p = audio();
        // replace() conserva el estado de reproducción: si no hay autoplay hay que pausar antes.
        if (!autoplay) p.pause();
        p.replace({ uri: localTrackUri(track.id) ?? streamSource(track), name: track.title });
        // En web replace() crea un <audio> nuevo con el volumen por defecto.
        applyVolume(p);
        if (seek > 0) void p.seekTo(seek);
        if (autoplay) {
          p.play();
          void ensureNotificationPermission();
        }
        set({
          queue,
          loadedTrackId: track.id,
          position: seek,
          duration: 0,
          playing: autoplay,
          buffering: autoplay,
          loaded: false,
          resumeAt: seek,
          notice: null,
        });
        showOnLockScreen(track);
      };

      return {
        queue: null,
        queueTracks: {},
        shuffle: false,
        repeat: 'off',
        playing: false,
        buffering: false,
        loaded: false,
        position: 0,
        duration: 0,
        loadedTrackId: null,
        resumeAt: 0,
        sleepAt: null,
        sleepMinutesLeft: null,
        notice: null,
        volume: 1,
        muted: false,

        playTracks: (tracks, startIndex, opts) => {
          if (tracks.length === 0) return;
          const shuffle = opts?.shuffle ?? get().shuffle;
          const queueTracks: Record<string, Track> = {};
          for (const t of tracks) queueTracks[t.id] = t;
          const queue = createQueue(
            tracks.map((t) => t.id),
            startIndex,
            shuffle,
          );
          set({ queue, queueTracks, shuffle, notice: null });
          loadAt(queue.position, true);
        },

        togglePlay: () => {
          const { queue, playing, loadedTrackId, resumeAt, loaded, position } = get();
          if (!queue) return;
          const sameTrack = loadedTrackId === currentTrackId(queue);
          // Sin pista cargada (sesión restaurada) o con la fuente caída: se vuelve a preparar.
          if (!sameTrack || (!playing && !loaded)) {
            loadAt(queue.position, true, sameTrack ? position : resumeAt);
            return;
          }
          const p = audio();
          if (playing) p.pause();
          else {
            // Al terminar la cola el reproductor queda al final: se reinicia la pista.
            if (get().duration > 0 && get().position >= get().duration - 0.5) void p.seekTo(0);
            p.play();
          }
          set({ playing: !playing });
        },

        next: () => {
          const { queue, repeat } = get();
          if (!queue) return;
          const pos = nextPosition(queue, repeat, false);
          if (pos === null) loadAt(0, false);
          else loadAt(pos, true);
        },

        previous: () => {
          const { queue, repeat, position } = get();
          if (!queue) return;
          if (position > 3) {
            get().seekTo(0);
            return;
          }
          loadAt(previousPosition(queue, repeat), true);
        },

        skipTo: (position) => loadAt(position, true),

        seekTo: (seconds) => {
          const { loadedTrackId, queue } = get();
          if (queue && loadedTrackId !== currentTrackId(queue)) {
            set({ resumeAt: seconds, position: seconds });
            return;
          }
          void audio().seekTo(seconds);
          set({ position: seconds });
        },

        toggleShuffle: () => {
          const { queue, shuffle } = get();
          set({ shuffle: !shuffle, queue: queue ? setShuffle(queue, !shuffle) : null });
        },

        cycleRepeat: () => set({ repeat: nextRepeatMode(get().repeat) }),

        setSleepTimer: (minutes) =>
          set({ sleepAt: minutes ? Date.now() + minutes * 60_000 : null, sleepMinutesLeft: minutes }),

        clearNotice: () => set({ notice: null }),

        setVolume: (value) => {
          const volume = Math.min(Math.max(value, 0), 1);
          // Subir el volumen quita el silencio, como en cualquier reproductor.
          set({ volume, muted: volume > 0 ? false : get().muted });
          if (player) applyVolume(player);
        },

        toggleMute: () => {
          const { muted, volume } = get();
          set(muted && volume === 0 ? { muted: false, volume: 0.5 } : { muted: !muted });
          if (player) applyVolume(player);
        },
      };
    },
    {
      name: 'sonaura.player.v1',
      // La posición cambia cada 500 ms: se agrupan las escrituras.
      storage: safeStorage(2000),
      partialize: (s) => ({
        queue: s.queue,
        queueTracks: s.queueTracks,
        shuffle: s.shuffle,
        repeat: s.repeat,
        resumeAt: s.resumeAt,
        volume: s.volume,
        muted: s.muted,
      }),
    },
  ),
);

/** En Android, `onPlayerError` emite un status que solo trae `error`. */
type StatusEvent = Partial<AudioStatus> & { error?: string | null };

function onStatus(status: StatusEvent) {
  const state = usePlayer.getState();

  if (status.error) {
    // ExoPlayer necesita volver a preparar la fuente tras un error: el próximo play recarga.
    usePlayer.setState({
      playing: false,
      buffering: false,
      loaded: false,
      loadedTrackId: null,
      resumeAt: state.position,
      notice: useNetwork.getState().online
        ? 'No se pudo reproducir esta canción. Toca play para reintentar.'
        : 'Sin conexión: descarga pistas para escucharlas offline.',
    });
    return;
  }

  if (state.sleepAt) {
    const left = state.sleepAt - Date.now();
    if (left <= 0) {
      audio().pause();
      usePlayer.setState({ sleepAt: null, sleepMinutesLeft: null, playing: false });
      return;
    }
    const minutes = Math.ceil(left / 60_000);
    if (minutes !== state.sleepMinutesLeft) usePlayer.setState({ sleepMinutesLeft: minutes });
  }

  if (status.didJustFinish) {
    const { queue, repeat } = state;
    if (!queue) return;
    const pos = nextPosition(queue, repeat, true);
    if (pos === null) {
      usePlayer.setState({ playing: false, position: 0, resumeAt: 0 });
      void audio().seekTo(0);
      audio().pause();
    } else if (pos === queue.position) {
      void audio().seekTo(0);
      audio().play();
    } else {
      state.skipTo(pos);
    }
    return;
  }

  const nativePlaying = Boolean(status.playing);
  const loaded = Boolean(status.isLoaded);
  // iOS informa playing=false mientras espera datos, y la fuente nueva tarda en cargar:
  // eso no es una pausa del usuario, así que se conserva la intención.
  const waiting = !nativePlaying && (Boolean(status.isBuffering) || !loaded);
  const position = typeof status.currentTime === 'number' && Number.isFinite(status.currentTime) ? status.currentTime : state.position;
  const patch: Partial<PlayerState> = {
    playing: nativePlaying || (waiting && state.playing),
    buffering: Boolean(status.isBuffering) || (state.playing && !loaded),
    loaded,
    position,
    duration: status.duration && status.duration > 0 ? status.duration : state.duration,
  };
  // Se guarda la posición cada ~5 s para reanudar donde se quedó.
  if (Math.abs(position - state.resumeAt) >= 5) patch.resumeAt = position;
  usePlayer.setState(patch);
}

export function useCurrentTrack(): Track | null {
  return usePlayer((s) => {
    if (!s.queue) return null;
    const id = currentTrackId(s.queue);
    return id ? s.queueTracks[id] ?? null : null;
  });
}

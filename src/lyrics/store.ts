import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Track } from '@/catalog';
import { assertIsAudioHead } from '@/state/audioHead';
import { useDownloads } from '@/state/downloads';
import { fileStore } from '@/state/fileStore';
import { useNetwork } from '@/state/network';
import { safeStorage } from '@/state/storage';

import { id3TagSize, readId3Lyrics } from './id3';
import { parseLrc, plainLyricLines, type LyricLine } from './lines';
import { fetchDriveBytes, fetchDriveText } from './remote';

/** Lo que se pide del MP3: la etiqueta de Suno ocupa unos KB (sin portada incrustada). */
const HEAD_BYTES = 64 * 1024;
/** Tope si la etiqueta trae una portada grande delante de la letra. */
const MAX_TAG_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 300;
/** Una canción sin letra se vuelve a mirar al día siguiente (por si se cambió el archivo). */
const RECHECK_EMPTY_MS = 24 * 60 * 60_000;
/** Tras un fallo de red no se reintenta enseguida. */
const RETRY_AFTER_MS = 30_000;

export type LyricsEntry = {
  lines: LyricLine[];
  synced: boolean;
  /** El `.lrc` del que salió (null si es la letra del MP3). */
  lrcId: string | null;
  at: number;
};

async function readAudioHead(track: Track): Promise<Uint8Array> {
  const record = useDownloads.getState().items[track.id];
  const remote = (n: number) => fetchDriveBytes(track.id, n);
  // Descargada: del archivo (también sin conexión). Si falla, de Drive.
  const read = record
    ? (n: number) => fileStore.readHead('tracks', record.fileName, n).catch(() => remote(n))
    : remote;
  let head = await read(HEAD_BYTES);
  const size = id3TagSize(head);
  if (size && size > head.length && head.length >= HEAD_BYTES) head = await read(Math.min(size, MAX_TAG_BYTES));
  return head;
}

/** La letra de `track`: la sincronizada del `.lrc` si lo hay y, si no, la que trae el MP3. */
export async function loadLyrics(track: Track, now = Date.now()): Promise<LyricsEntry> {
  const lrcId = track.lyricsFileId ?? null;
  if (lrcId) {
    try {
      const lines = parseLrc(await fetchDriveText(lrcId));
      if (lines.length > 0) return { lines, synced: true, lrcId, at: now };
    } catch {
      // Sin conexión o sin permiso: queda la letra del MP3 y se reintenta la próxima vez.
    }
  }
  const head = await readAudioHead(track);
  // Drive devuelve una página HTML cuando limita: eso no es «sin letra».
  assertIsAudioHead(head);
  const text = readId3Lyrics(head);
  return { lines: text ? plainLyricLines(text) : [], synced: false, lrcId: null, at: now };
}

/** Si hay que (re)cargar la letra guardada de `track`. */
export function needsLoad(entry: LyricsEntry | undefined, track: Track, now = Date.now()): boolean {
  if (!entry) return true;
  // undefined = pista guardada antes de que existiera el campo: no se sabe, se conserva lo que hay.
  if (track.lyricsFileId !== undefined) {
    const lrcId = track.lyricsFileId ?? null;
    // Apareció, cambió o se quitó el .lrc en Drive.
    if (lrcId !== entry.lrcId) return true;
  }
  return entry.lines.length === 0 && now - entry.at > RECHECK_EMPTY_MS;
}

type LyricsState = {
  entries: Record<string, LyricsEntry>;
  loading: Record<string, boolean>;
  /** id → momento del último fallo. */
  failed: Record<string, number>;
  load: (track: Track, opts?: { force?: boolean }) => Promise<void>;
};

export const useLyricsStore = create<LyricsState>()(
  persist(
    (set, get) => ({
      entries: {},
      loading: {},
      failed: {},
      load: async (track, opts) => {
        const { loading, failed } = get();
        if (loading[track.id]) return;
        if (!opts?.force && failed[track.id] && Date.now() - failed[track.id] < RETRY_AFTER_MS) return;
        set((s) => ({ loading: { ...s.loading, [track.id]: true } }));
        try {
          const entry = await loadLyrics(track);
          set((s) => {
            const entries = { ...s.entries, [track.id]: entry };
            const ids = Object.keys(entries);
            if (ids.length > MAX_ENTRIES) {
              ids.sort((a, b) => entries[a].at - entries[b].at);
              for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) delete entries[id];
            }
            const nextFailed = { ...s.failed };
            delete nextFailed[track.id];
            return { entries, failed: nextFailed };
          });
        } catch {
          set((s) => ({ failed: { ...s.failed, [track.id]: Date.now() } }));
        } finally {
          set((s) => {
            const next = { ...s.loading };
            delete next[track.id];
            return { loading: next };
          });
        }
      },
    }),
    { name: 'sonaura.lyrics.v1', storage: safeStorage(), partialize: (s) => ({ entries: s.entries }) },
  ),
);

/** La letra de la pista, cargándola si hace falta (y otra vez al volver la conexión). */
export function useLyrics(track: Track | null) {
  const id = track?.id ?? '';
  const entry = useLyricsStore((s) => s.entries[id]);
  const loading = useLyricsStore((s) => Boolean(s.loading[id]));
  const failed = useLyricsStore((s) => s.failed[id] !== undefined);
  const online = useNetwork((s) => s.online);

  useEffect(() => {
    if (!track) return;
    const state = useLyricsStore.getState();
    if (needsLoad(state.entries[track.id], track)) void state.load(track, { force: online });
  }, [track, online]);

  return { entry, loading, failed, retry: () => (track ? useLyricsStore.getState().load(track, { force: true }) : undefined) };
}

/** Si el reproductor muestra la letra en lugar de la portada (se recuerda mientras la app está abierta). */
export const useLyricsView = create<{ visible: boolean; toggle: () => void }>()((set) => ({
  visible: false,
  toggle: () => set((s) => ({ visible: !s.visible })),
}));

import Constants from 'expo-constants';

import type { Track } from '@/catalog';

import { createClient } from './client';
import { createListenTracker } from './listens';
import { describePlatform } from './platform';

/**
 * Estadísticas de uso (PostHog): qué canciones y álbumes se escuchan, se completan, se saltan,
 * se marcan como favoritas o se guardan sin conexión. Eventos y propiedades: docs/estadisticas.md.
 *
 * Se mide si hay clave (`EXPO_PUBLIC_POSTHOG_KEY`), fuera del modo desarrollo y, en el navegador,
 * solo en la web publicada y sin «no rastrear».
 */

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() ?? '';
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com').replace(/\/+$/, '');

const platform = describePlatform();
const version = Constants.expoConfig?.version ?? 'desconocida';

export const analyticsEnabled = Boolean(KEY) && !__DEV__ && platform.allowed;

const client = analyticsEnabled
  ? createClient({
      apiKey: KEY,
      endpoint: platform.proxyBase ?? HOST,
      superProperties: {
        app: 'sonaura',
        plataforma: platform.plataforma,
        version,
        $os: platform.os,
        $device_type: platform.deviceType,
        $lib: 'sonaura',
        $lib_version: version,
        ...platform.extra,
      },
    })
  : null;

export function track(event: string, properties?: Record<string, unknown>) {
  client?.capture(event, properties);
}

/** Propiedades de una canción: el título y el álbum para leer las tablas, y los ids para agrupar. */
export function songProperties(song: Track) {
  return { cancion: song.title, album: song.albumTitle, cancion_id: song.id, album_id: song.albumId };
}

export function trackSong(event: string, song: Track, extra?: Record<string, unknown>) {
  track(event, { ...songProperties(song), ...extra });
}

/** Lo llama el reproductor: decide cuándo una pista cuenta como escuchada, completa o saltada. */
export const listens = createListenTracker<Track>((event, song, extra) => trackSong(event, song, extra));

let started = false;

export function initAnalytics() {
  if (!client || started) return;
  started = true;
  void client.init();
  track('app_abierta');
}

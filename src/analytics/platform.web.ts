import { isTauri } from '@tauri-apps/api/core';

import { osFromUserAgent } from '@/lib/userAgent';

import type { PlatformInfo } from './platform';

export type { PlatformInfo } from './platform';

/** Dominios de la web publicada: solo ahí se mide y los envíos pasan por el proxy `/pulso`. */
export const PRODUCTION_HOSTS = ['sonaura.genaropretill.com', 'sonaura-app.netlify.app'];

/**
 * Preferencia guardada en este navegador: `no` = no medir; `forzar` = medir fuera del dominio
 * publicado (para probar un build en local). Se cambia desde la consola.
 */
const PREFERENCE_KEY = 'sonaura.analytics';

function preference(): string | null {
  try {
    return window.localStorage.getItem(PREFERENCE_KEY);
  } catch {
    return null;
  }
}

export function describePlatform(): PlatformInfo {
  // App de Windows: directo a PostHog (la CSP de Tauri lo permite) y siempre se mide.
  if (isTauri()) {
    return { plataforma: 'windows', os: 'Windows', deviceType: 'Desktop', proxyBase: null, allowed: true, extra: {} };
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const doNotTrack = nav.doNotTrack === '1' || (window as Window & { doNotTrack?: string }).doNotTrack === '1' || nav.globalPrivacyControl === true;
  const host = window.location.hostname;
  const published = PRODUCTION_HOSTS.includes(host);
  const pref = preference();
  return {
    plataforma: 'web',
    ...osFromUserAgent(nav.userAgent),
    // Por el propio dominio (netlify.toml): los bloqueadores cortan us.i.posthog.com.
    proxyBase: published ? `${window.location.origin}/pulso` : null,
    allowed: (published || pref === 'forzar') && pref !== 'no' && !doNotTrack,
    extra: { $host: host },
  };
}

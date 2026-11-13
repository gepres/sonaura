import { Platform } from 'react-native';

export type PlatformInfo = {
  /** Cómo se agrupa en las estadísticas: android, ios, windows o web. */
  plataforma: string;
  os: string;
  deviceType: 'Mobile' | 'Desktop';
  /** Base de la API si hay que pasar por un proxy propio (la web publicada); null = directo. */
  proxyBase: string | null;
  /** Si en este entorno se mide. */
  allowed: boolean;
  extra: Record<string, unknown>;
};

/** Android e iOS: siempre directo a PostHog (no hay bloqueadores de anuncios en la app). */
export function describePlatform(): PlatformInfo {
  return {
    plataforma: Platform.OS,
    os: Platform.OS === 'ios' ? 'iOS' : 'Android',
    deviceType: 'Mobile',
    proxyBase: null,
    allowed: true,
    extra: {},
  };
}

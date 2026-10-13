export const colors = {
  bg: '#0A0717',
  bgElevated: '#140E2B',
  surface: '#1C1538',
  surfacePressed: '#261D4A',
  border: 'rgba(255,255,255,0.08)',
  text: '#F5F2FF',
  textMuted: '#A79FC7',
  textFaint: '#6E6690',
  amber: '#FFB547',
  magenta: '#FF4F9A',
  violet: '#7C5CFF',
  success: '#4ADE80',
  danger: '#FF6B6B',
} as const;

/** Degradado de marca (ámbar → magenta → violeta), el mismo del anillo del icono. */
export const auraGradient = [colors.amber, colors.magenta, colors.violet] as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const typo = {
  hero: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  subtitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, fontWeight: '500', color: colors.text },
  caption: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  overline: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted },
} as const;

/** Altura del mini-reproductor; las listas la usan como margen inferior. */
export const MINI_PLAYER_HEIGHT = 64;

import { Platform } from 'react-native';

/** La web abierta como app instalada (PWA), no en una pestaña del navegador. */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true; // Safari en iPhone
  const display = (mode: string) => window.matchMedia?.(`(display-mode: ${mode})`).matches ?? false;
  return display('standalone') || display('fullscreen') || display('minimal-ui');
}

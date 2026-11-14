export type VisitorOs = 'Android' | 'iOS' | 'Windows' | 'macOS' | 'ChromeOS' | 'Linux' | 'Otro';

/** Sistema y tipo de dispositivo a partir del user agent del navegador. */
export function osFromUserAgent(ua: string): { os: VisitorOs; deviceType: 'Mobile' | 'Desktop' } {
  if (/android/i.test(ua)) return { os: 'Android', deviceType: 'Mobile' };
  if (/iphone|ipad|ipod/i.test(ua)) return { os: 'iOS', deviceType: 'Mobile' };
  if (/windows/i.test(ua)) return { os: 'Windows', deviceType: 'Desktop' };
  if (/mac os x|macintosh/i.test(ua)) return { os: 'macOS', deviceType: 'Desktop' };
  if (/cros/i.test(ua)) return { os: 'ChromeOS', deviceType: 'Desktop' };
  if (/linux/i.test(ua)) return { os: 'Linux', deviceType: 'Desktop' };
  return { os: 'Otro', deviceType: /mobile/i.test(ua) ? 'Mobile' : 'Desktop' };
}

/** Celular o tableta: donde la web se instala en la pantalla de inicio. */
export const isPhone = (os: VisitorOs): boolean => os === 'Android' || os === 'iOS';

export function visitorOs(): VisitorOs {
  if (typeof navigator === 'undefined') return 'Otro';
  const { os } = osFromUserAgent(navigator.userAgent ?? '');
  // Safari en iPad se presenta como un Mac de escritorio; lo delata la pantalla táctil.
  if (os === 'macOS' && (navigator.maxTouchPoints ?? 0) > 1) return 'iOS';
  return os;
}

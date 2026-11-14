import { chromeIntentUrl, downloadUrl } from '../releases';

describe('chromeIntentUrl', () => {
  it('abre el APK de la última release en Chrome, con la misma URL de respaldo', () => {
    const url = downloadUrl('android');
    expect(url).toBe('https://github.com/gepres/sonaura/releases/latest/download/Sonaura-android.apk');
    expect(chromeIntentUrl(url)).toBe(
      'intent://github.com/gepres/sonaura/releases/latest/download/Sonaura-android.apk' +
        '#Intent;scheme=https;package=com.android.chrome;' +
        'S.browser_fallback_url=https%3A%2F%2Fgithub.com%2Fgepres%2Fsonaura%2Freleases%2Flatest%2Fdownload%2FSonaura-android.apk;end',
    );
  });

  it('respeta la consulta de la URL', () => {
    expect(chromeIntentUrl('https://example.test/a.apk?v=2')).toMatch(/^intent:\/\/example\.test\/a\.apk\?v=2#Intent;/);
  });
});

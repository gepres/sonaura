import { albumDescription } from '../seo';
import { isPhone, osFromUserAgent } from '../userAgent';

const tracks = (...titles: string[]) => titles.map((title) => ({ title }));

describe('albumDescription', () => {
  it('nombra el álbum y sus tres primeras canciones', () => {
    expect(albumDescription({ title: 'Esistenza', isRoot: false, tracks: tracks('Caminar descalzo', 'Deja de huir', 'Recordando quién soy', 'Mi Ego es el Insurrecto') })).toBe(
      'Escucha el álbum «Esistenza» en Sonaura: Caminar descalzo, Deja de huir, Recordando quién soy y 1 más. Gratis, con letra.',
    );
  });

  it('las sueltas no son un álbum, y sin «y N más» si caben todas', () => {
    expect(albumDescription({ title: 'Sueltos', isRoot: true, tracks: tracks('Track 1 salsa', 'Track 2 salsa') })).toBe(
      'Escucha las canciones sueltas de Sonaura: Track 1 salsa, Track 2 salsa. Gratis, con letra.',
    );
  });
});

describe('isPhone (dónde se destaca instalar la web)', () => {
  test.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1', true],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36', false],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', false],
  ])('%s → %s', (ua, phone) => expect(isPhone(osFromUserAgent(ua).os)).toBe(phone));
});

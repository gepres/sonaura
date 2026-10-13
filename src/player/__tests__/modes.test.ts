import { playbackModeHint, repeatLabel } from '../modes';

it('la etiqueta de repetir dice el modo actual', () => {
  expect(repeatLabel('off')).toBe('Repetir: desactivado');
  expect(repeatLabel('all')).toBe('Repetir: toda la lista');
  expect(repeatLabel('one')).toBe('Repetir: esta canción');
});

it('el rótulo resume los modos activos', () => {
  expect(playbackModeHint(false, 'off')).toBeNull();
  expect(playbackModeHint(false, 'all')).toBe('Repitiendo la lista');
  expect(playbackModeHint(false, 'one')).toBe('Repitiendo esta canción');
  expect(playbackModeHint(true, 'off')).toBe('Aleatorio');
  expect(playbackModeHint(true, 'one')).toBe('Aleatorio · Repitiendo esta canción');
});

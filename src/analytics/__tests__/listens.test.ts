import { createListenTracker, type ListenEvent, type ListenExtra } from '../listens';

type Song = { id: string };
const a: Song = { id: 'a' };
const b: Song = { id: 'b' };

function setup() {
  let clock = 0;
  const events: { event: ListenEvent; id: string; extra: ListenExtra }[] = [];
  const tracker = createListenTracker<Song>(
    (event, item, extra) => events.push({ event, id: item.id, extra }),
    () => clock,
  );
  /** Simula el reproductor: actualizaciones cada 500 ms mientras suena desde `from`. */
  const play = (from: number, seconds: number, duration = 200) => {
    for (let t = 0; t <= seconds * 2; t++) {
      tracker.progress(from + t / 2, duration, true);
      if (t < seconds * 2) clock += 500;
    }
  };
  const advance = (ms: number) => {
    clock += ms;
  };
  return { tracker, events, play, advance, names: () => events.map((e) => `${e.event}:${e.id}`) };
}

it('cuenta una escucha a los 30 segundos, una sola vez', () => {
  const { tracker, play, names, events } = setup();
  tracker.start(a, false);
  play(0, 29);
  expect(names()).toEqual([]);
  play(29, 40);
  expect(names()).toEqual(['cancion_escuchada:a']);
  expect(events[0].extra).toEqual({ segundos: 30, duracion: 200, sin_conexion: false });
});

it('saltar con la barra no suma tiempo de escucha', () => {
  const { tracker, play, names } = setup();
  tracker.start(a, false);
  play(0, 10);
  // Salto a 2:30: la posición avanza 140 s en medio segundo.
  play(150, 10);
  expect(names()).toEqual([]);
  play(160, 10);
  expect(names()).toEqual(['cancion_escuchada:a']);
});

it('pausar, mover la barra y reanudar no cuenta el salto', () => {
  const { tracker, play, advance, names } = setup();
  tracker.start(a, false);
  play(0, 10);
  tracker.progress(10, 200, false);
  advance(60_000);
  tracker.progress(60, 200, false); // se movió la barra en pausa
  play(60, 15);
  expect(names()).toEqual([]);
});

it('con la app en segundo plano las actualizaciones llegan espaciadas y aun así se cuentan', () => {
  const { tracker, advance, names } = setup();
  tracker.start(a, true);
  tracker.progress(0, 200, true);
  advance(20_000);
  tracker.progress(20, 200, true);
  advance(20_000);
  tracker.progress(40, 200, true);
  expect(names()).toEqual(['cancion_escuchada:a']);
});

it('cambiar de canción antes de contarla la da por saltada', () => {
  const { tracker, play, events } = setup();
  tracker.start(a, false);
  play(0, 12);
  tracker.start(b, false);
  expect(events).toEqual([{ event: 'cancion_saltada', id: 'a', extra: { segundos: 12, duracion: 200, sin_conexion: false } }]);
});

it('cambiar sin que llegara a sonar no es un salto', () => {
  const { tracker, names } = setup();
  tracker.start(a, false);
  tracker.progress(0, 0, false);
  tracker.start(b, false);
  expect(names()).toEqual([]);
});

it('volver a cargar la misma canción (reintento) sigue la misma escucha', () => {
  const { tracker, play, names } = setup();
  tracker.start(a, false);
  play(0, 20);
  tracker.start(a, false);
  play(20, 15);
  expect(names()).toEqual(['cancion_escuchada:a']);
});

it('una canción escuchada hasta el final cuenta como completa', () => {
  const { tracker, play, advance, names } = setup();
  tracker.start(a, false);
  play(0, 99.5, 100);
  advance(500);
  tracker.finish();
  expect(names()).toEqual(['cancion_escuchada:a', 'cancion_completa:a']);
  // Lo que venga después no es un salto.
  tracker.start(b, false);
  expect(names()).toHaveLength(2);
});

it('llegar al final saltando con la barra no es una canción completa', () => {
  const { tracker, play, names } = setup();
  tracker.start(a, false);
  play(0, 35);
  play(190, 10);
  tracker.finish();
  expect(names()).toEqual(['cancion_escuchada:a']);
});

it('una canción corta cuenta como escuchada a la mitad', () => {
  const { tracker, play, names } = setup();
  tracker.start(a, false);
  play(0, 21, 40);
  expect(names()).toEqual(['cancion_escuchada:a']);
});

it('repetir una canción: cada vuelta es otra escucha', () => {
  const { tracker, play, advance, names } = setup();
  tracker.start(a, false);
  play(0, 59.5, 60);
  advance(500);
  tracker.finish();
  tracker.start(a, false);
  play(0, 59.5, 60);
  advance(500);
  tracker.finish();
  expect(names()).toEqual(['cancion_escuchada:a', 'cancion_completa:a', 'cancion_escuchada:a', 'cancion_completa:a']);
});

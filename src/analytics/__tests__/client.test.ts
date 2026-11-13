import AsyncStorage from '@react-native-async-storage/async-storage';

import { createClient, uuid, type SendResult, type Transport } from '../client';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- mock oficial de la librería
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

type Sent = { url: string; body: { api_key: string; batch: { event: string; uuid: string; distinct_id: string; properties: Record<string, unknown> }[] } };

function setup(results: SendResult[] = []) {
  const sent: Sent[] = [];
  const transport: Transport = jest.fn(async (url: string, body: string) => {
    sent.push({ url, body: JSON.parse(body) });
    return results.shift() ?? 'ok';
  });
  const client = createClient({
    apiKey: 'phc_prueba',
    endpoint: 'https://posthog.test',
    superProperties: { app: 'sonaura', plataforma: 'android' },
    storageKey: 'analytics.test',
    transport,
  });
  return { client, sent, transport };
}

/** Deja correr los temporizadores y las promesas que encadenan. */
async function settle(ms: number) {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

it('genera UUID v4', () => {
  expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

it('junta los eventos y los manda en un lote anónimo con las propiedades comunes', async () => {
  const { client, sent } = setup();
  await client.init();
  client.capture('cancion_escuchada', { cancion: 'La Maschera' });
  client.capture('favorito_agregado', { cancion: 'La Maschera' });
  expect(sent).toHaveLength(0);
  await settle(5_000);
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe('https://posthog.test/batch/');
  expect(sent[0].body.api_key).toBe('phc_prueba');
  expect(sent[0].body.batch.map((e) => e.event)).toEqual(['cancion_escuchada', 'favorito_agregado']);
  const [first] = sent[0].body.batch;
  expect(first.distinct_id).toBe(client.distinctId());
  expect(first.properties).toEqual({
    app: 'sonaura',
    plataforma: 'android',
    cancion: 'La Maschera',
    $process_person_profile: false,
  });
  expect(client.pending()).toBe(0);
});

it('lo capturado antes de leer la cola guardada no se pierde', async () => {
  const { client, sent } = setup();
  client.capture('app_abierta');
  await client.init();
  await settle(5_000);
  expect(sent[0].body.batch.map((e) => e.event)).toEqual(['app_abierta']);
});

it('sin red reintenta más tarde y no pierde ni duplica eventos', async () => {
  const { client, sent } = setup(['retry', 'retry']);
  await client.init();
  client.capture('cancion_escuchada');
  await settle(5_000);
  expect(sent).toHaveLength(1);
  expect(client.pending()).toBe(1);
  // Mientras espera el reintento, un evento nuevo no lo adelanta.
  client.capture('cancion_completa');
  await settle(29_000);
  expect(sent).toHaveLength(1);
  await settle(1_000);
  expect(sent).toHaveLength(2);
  await settle(60_000);
  expect(sent).toHaveLength(3);
  expect(sent[2].body.batch.map((e) => e.event)).toEqual(['cancion_escuchada', 'cancion_completa']);
  // El mismo uuid en cada reintento: PostHog descarta los duplicados.
  expect(sent[2].body.batch[0].uuid).toBe(sent[0].body.batch[0].uuid);
  expect(client.pending()).toBe(0);
});

it('lo que no se envió se manda en la siguiente apertura, con el mismo identificador', async () => {
  const first = setup(['retry']);
  await first.client.init();
  first.client.capture('cancion_escuchada', { cancion: 'Präsenz eins' });
  await settle(5_000);
  const id = first.client.distinctId();
  // Se cierra la app con el evento pendiente.

  const second = setup();
  await second.client.init();
  await settle(5_000);
  expect(second.sent).toHaveLength(1);
  expect(second.sent[0].body.batch[0].properties.cancion).toBe('Präsenz eins');
  expect(second.client.distinctId()).toBe(id);
});

it('si PostHog rechaza el lote (clave mala) no reintenta para siempre', async () => {
  const { client, sent } = setup(['drop']);
  await client.init();
  client.capture('cancion_escuchada');
  await settle(5_000);
  expect(client.pending()).toBe(0);
  await settle(10 * 60_000);
  expect(sent).toHaveLength(1);
});

it('una cola grande sale en lotes de 50', async () => {
  const { client, sent } = setup();
  await client.init();
  for (let i = 0; i < 120; i++) client.capture('cancion_guardada', { n: i });
  await settle(5_000);
  expect(sent.map((s) => s.body.batch.length)).toEqual([50, 50, 20]);
});

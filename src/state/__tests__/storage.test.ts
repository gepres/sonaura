import AsyncStorage from '@react-native-async-storage/async-storage';

import { safeStorage } from '../storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- mock oficial de la librería
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useRealTimers();
});

it('un JSON corrupto hidrata como vacío en vez de bloquear la app', async () => {
  await AsyncStorage.setItem('roto', '{no es json');
  await expect(safeStorage().getItem('roto')).resolves.toBeNull();
});

it('un fallo de lectura de AsyncStorage también hidrata como vacío', async () => {
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disco'));
  await expect(safeStorage().getItem('x')).resolves.toBeNull();
});

it('lee lo que escribió', async () => {
  const storage = safeStorage<{ n: number }>();
  await storage.setItem('ok', { state: { n: 1 }, version: 0 });
  await expect(storage.getItem('ok')).resolves.toEqual({ state: { n: 1 }, version: 0 });
});

it('con throttle agrupa escrituras seguidas y guarda solo la última', async () => {
  jest.useFakeTimers();
  const spy = jest.spyOn(AsyncStorage, 'setItem');
  spy.mockClear();
  const storage = safeStorage<{ n: number }>(2000);
  for (let n = 1; n <= 5; n++) storage.setItem('player', { state: { n }, version: 0 });
  expect(spy).not.toHaveBeenCalled();
  jest.advanceTimersByTime(2000);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(JSON.parse(spy.mock.calls[0][1] as string).state.n).toBe(5);
  spy.mockRestore();
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware';

const json = createJSONStorage<unknown>(() => AsyncStorage)!;
const pending = new Map<string, { value: StorageValue<unknown>; timer: ReturnType<typeof setTimeout> }>();

function write(name: string, value: StorageValue<unknown>) {
  Promise.resolve(json.setItem(name, value)).catch(() => {});
}

function flushPending() {
  for (const [name, entry] of pending) {
    clearTimeout(entry.timer);
    write(name, entry.value);
  }
  pending.clear();
}

// Antes de que el sistema congele o mate la app se escribe lo que estaba agrupado.
AppState.addEventListener('change', (status) => {
  if (status !== 'active') flushPending();
});

/**
 * Almacenamiento de los stores persistidos.
 * - Tolerante a fallos: un JSON corrupto o un error de lectura no bloquea la hidratación;
 *   el store arranca vacío en lugar de dejar la app en el splash.
 * - `throttleMs` agrupa escrituras frecuentes (la posición de reproducción cambia cada
 *   500 ms) y solo serializa la última versión.
 */
export function safeStorage<S>(throttleMs = 0): PersistStorage<S> {
  return {
    getItem: async (name) => {
      try {
        return ((await json.getItem(name)) ?? null) as StorageValue<S> | null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      if (throttleMs <= 0) return write(name, value);
      const entry = pending.get(name);
      if (entry) {
        entry.value = value;
        return;
      }
      const timer = setTimeout(() => {
        const latest = pending.get(name);
        pending.delete(name);
        if (latest) write(name, latest.value);
      }, throttleMs);
      pending.set(name, { value, timer });
    },
    removeItem: async (name) => {
      const entry = pending.get(name);
      if (entry) clearTimeout(entry.timer);
      pending.delete(name);
      try {
        await json.removeItem(name);
      } catch {}
    },
  };
}

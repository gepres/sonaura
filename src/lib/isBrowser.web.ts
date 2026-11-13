import { isTauri } from '@tauri-apps/api/core';

/** La app abierta en un navegador: la web, no la ventana de Windows (Tauri), que es el mismo código. */
export const isBrowser = (): boolean => !isTauri();

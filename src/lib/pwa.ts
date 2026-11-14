export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export type PwaInstall = {
  /** La web en un navegador, donde se puede instalar como app. */
  supported: boolean;
  /** El navegador ofrece su aviso de instalación (Chrome, Edge, Samsung Internet en Android y escritorio). */
  canPrompt: boolean;
  /** Ya se está usando como app instalada. */
  installed: boolean;
  /** Muestra el aviso del navegador; `origen` es la pantalla desde la que se pidió (estadísticas). */
  install: (origen: string) => Promise<InstallOutcome>;
};

/** En Android y Windows ya es una app: no hay nada que instalar desde la web. */
export function initPwa() {}

const NATIVE: PwaInstall = { supported: false, canPrompt: false, installed: false, install: async () => 'unavailable' };

export function usePwaInstall(): PwaInstall {
  return NATIVE;
}

import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';

import { track } from '@/analytics';
import { isStandalone } from '@/lib/standalone';

import type { InstallOutcome, PwaInstall } from './pwa';

export type { InstallOutcome, PwaInstall } from './pwa';

/** El evento `beforeinstallprompt` (no está en los tipos del DOM). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const usePwa = create<{ prompt: InstallPromptEvent | null; installed: boolean }>()(() => ({
  prompt: null,
  installed: false,
}));

let started = false;

/**
 * Solo en el navegador (la app de Windows usa el mismo export, pero ya está instalada): guarda el
 * aviso de instalación para mostrarlo desde un botón propio y registra el service worker.
 * Se llama al cargar el módulo de la app, antes de que el navegador lance el aviso.
 */
export function initPwa() {
  if (started || typeof window === 'undefined' || isTauri()) return;
  started = true;
  usePwa.setState({ installed: isStandalone() });

  window.addEventListener('beforeinstallprompt', (event) => {
    // Sin la barra del navegador: lo ofrecen el aviso de Inicio y la página de descargas.
    event.preventDefault();
    usePwa.setState({ prompt: event as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    usePwa.setState({ prompt: null, installed: true });
    track('pwa_instalada');
  });

  // En desarrollo no: guardaría los paquetes de Metro.
  if (!__DEV__ && 'serviceWorker' in navigator && window.isSecureContext) {
    const register = () => void navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

async function install(origen: string): Promise<InstallOutcome> {
  const event = usePwa.getState().prompt;
  if (!event) return 'unavailable';
  // Cada aviso sirve una sola vez; si se rechaza, el navegador lo vuelve a ofrecer más adelante.
  usePwa.setState({ prompt: null });
  await event.prompt();
  const { outcome } = await event.userChoice;
  track('pwa_instalar', { origen, resultado: outcome });
  return outcome;
}

export function usePwaInstall(): PwaInstall {
  const canPrompt = usePwa((s) => s.prompt !== null);
  const installed = usePwa((s) => s.installed);
  return { supported: !isTauri(), canPrompt, installed, install };
}

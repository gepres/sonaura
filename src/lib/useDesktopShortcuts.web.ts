import { useEffect } from 'react';

import { usePlayer } from '@/player/store';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Atajos de escritorio. Las teclas multimedia del teclado ya llegan por Media Session.
 * Espacio: reproducir/pausar · Ctrl+→ / Ctrl+←: siguiente/anterior ·
 * Ctrl+↑ / Ctrl+↓: volumen · M: silenciar.
 *
 * Se escucha en fase de captura: tras hacer clic en una canción el foco queda en ese botón y,
 * sin esto, Espacio lo "pulsaría" otra vez (reinicia la canción). Enter sigue activando botones.
 */
export function useDesktopShortcuts() {
  useEffect(() => {
    let swallowSpaceUp = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.metaKey) return;
      const player = usePlayer.getState();
      if (e.code === 'Space' && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        swallowSpaceUp = true;
        if (!e.repeat) player.togglePlay();
      } else if (e.ctrlKey && e.code === 'ArrowRight') {
        e.preventDefault();
        player.next();
      } else if (e.ctrlKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        player.previous();
      } else if (e.ctrlKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        e.preventDefault();
        const step = e.code === 'ArrowUp' ? 0.1 : -0.1;
        player.setVolume(Math.round(((player.muted ? 0 : player.volume) + step) * 10) / 10);
      } else if (e.code === 'KeyM' && !e.ctrlKey) {
        e.preventDefault();
        player.toggleMute();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && swallowSpaceUp) {
        swallowSpaceUp = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, []);
}

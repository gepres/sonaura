import { colors } from '@/theme';

let installed = false;

/**
 * Barras de scroll y controles nativos del WebView con los colores de la app:
 * `color-scheme: dark` los pasa a tema oscuro y `scrollbar-color` las tiñe con la paleta.
 */
export function installDesktopChrome() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const style = document.createElement('style');
  style.id = 'sonaura-desktop-chrome';
  style.textContent = `
    :root { color-scheme: dark; }
    html, body { background: ${colors.bg}; }
    * { scrollbar-width: thin; scrollbar-color: rgba(167, 159, 199, 0.35) transparent; }
    *:hover { scrollbar-color: rgba(167, 159, 199, 0.6) transparent; }
  `;
  document.head.appendChild(style);
}

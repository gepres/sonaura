import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Fracción 0..1 del puntero sobre un elemento, medida con su geometría real en el momento
 * del evento (solo web). Sin anchos guardados ni medidas previas que puedan quedar viejas.
 */
export function pointerRatio(e: ReactPointerEvent<HTMLElement>): number | null {
  const rect = e.currentTarget.getBoundingClientRect();
  if (rect.width <= 0) return null;
  return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
}

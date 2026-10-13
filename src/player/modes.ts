import type { RepeatMode } from './queue';

/** Etiqueta del botón de repetir: dice el modo actual (se pulsa para pasar al siguiente). */
export function repeatLabel(repeat: RepeatMode): string {
  if (repeat === 'one') return 'Repetir: esta canción';
  if (repeat === 'all') return 'Repetir: toda la lista';
  return 'Repetir: desactivado';
}

/** Rótulo visible con los modos activos, o null si no hay ninguno. */
export function playbackModeHint(shuffle: boolean, repeat: RepeatMode): string | null {
  const parts: string[] = [];
  if (shuffle) parts.push('Aleatorio');
  if (repeat === 'all') parts.push('Repitiendo la lista');
  if (repeat === 'one') parts.push('Repitiendo esta canción');
  return parts.length > 0 ? parts.join(' · ') : null;
}

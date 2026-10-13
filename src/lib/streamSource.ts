import type { Track } from '@/catalog';

/** URL de streaming. En móvil el reproductor nativo pide a Drive directamente. */
export const streamSource = (track: Track): string => track.streamUrl;

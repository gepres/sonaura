import { useWindowDimensions } from 'react-native';

import { space } from '@/theme';

/** Ancho máximo del contenido: en escritorio no se estira de lado a lado. */
export const CONTENT_MAX_WIDTH = 1100;

/** Estilo para centrar el contenido de una pantalla con el ancho máximo. */
export const contentFrame = { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' } as const;

/** Columnas y tamaño de las tarjetas de álbum según el ancho disponible. */
export function useAlbumGrid() {
  const { width } = useWindowDimensions();
  const content = Math.min(width, CONTENT_MAX_WIDTH);
  const columns = content >= 1000 ? 5 : content >= 800 ? 4 : content >= 560 ? 3 : 2;
  const gap = space.md;
  const cardSize = Math.floor((content - space.lg * 2 - gap * (columns - 1)) / columns);
  return { columns, cardSize, gap };
}

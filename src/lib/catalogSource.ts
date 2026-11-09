import { createDefaultSource, type FolderSource } from '@/catalog';
import { appFetch } from '@/lib/http';

/** Fuente del catálogo de la plataforma. En móvil no hay CORS: la de siempre. */
export const catalogSource = (): FolderSource => createDefaultSource(appFetch);

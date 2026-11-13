export type DriveEntry = { id: string; name: string; kind: 'folder' | 'file' };

export type FolderListing = { title: string | null; entries: DriveEntry[] };

export interface FolderSource {
  listFolder(folderId: string): Promise<FolderListing>;
}

export type Track = {
  id: string;
  title: string;
  fileName: string;
  trackNumber: number | null;
  albumId: string;
  albumTitle: string;
  streamUrl: string;
  artworkUrl: string | null;
  /**
   * `.lrc` con la letra sincronizada, junto al audio en Drive y con el mismo nombre.
   * Opcional: las pistas guardadas antes (favoritos, descargas) no lo traen.
   */
  lyricsFileId?: string | null;
};

export type Album = {
  id: string;
  title: string;
  coverUrl: string | null;
  tracks: Track[];
  isRoot: boolean;
};

export type Library = {
  rootId: string;
  rootTitle: string;
  albums: Album[];
  fetchedAt: number;
};

export type CatalogErrorCode = 'network' | 'not_public' | 'parse' | 'http';

export class CatalogError extends Error {
  code: CatalogErrorCode;
  status?: number;

  constructor(code: CatalogErrorCode, message: string = code, status?: number) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

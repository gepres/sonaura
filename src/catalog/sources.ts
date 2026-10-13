import { parseEmbeddedFolderView } from './embeddedFolderView';
import { CatalogError, type DriveEntry, type FolderSource } from './types';

async function request(fetchImpl: typeof fetch, url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new CatalogError('network', 'Could not reach Google Drive.');
  }
  if (!response.ok) {
    const code = response.status === 403 || response.status === 404 ? 'not_public' : 'http';
    throw new CatalogError(code, `Google Drive returned HTTP ${response.status}.`, response.status);
  }
  return response;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new CatalogError('parse', 'Invalid Google Drive JSON.');
    throw new CatalogError('network', 'Could not read the Google Drive response.');
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function apiUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries(params).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&');
  return `https://www.googleapis.com/drive/v3/files${path}?${query}`;
}

export function createEmbeddedSource(fetchImpl: typeof fetch = fetch): FolderSource {
  return {
    async listFolder(folderId) {
      const response = await request(fetchImpl, `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`);
      let html: string;
      try {
        html = await response.text();
      } catch {
        throw new CatalogError('network', 'Could not read the Drive folder page.');
      }
      return parseEmbeddedFolderView(html);
    },
  };
}

export function createApiSource(apiKey: string, fetchImpl: typeof fetch = fetch): FolderSource {
  return {
    async listFolder(folderId) {
      const metadata = await readJson(await request(fetchImpl, apiUrl(`/${encodeURIComponent(folderId)}`, {
        fields: 'name', key: apiKey,
      })));
      if (!isObject(metadata) || typeof metadata.name !== 'string') {
        throw new CatalogError('parse', 'Missing Drive folder name.');
      }

      const entries: DriveEntry[] = [];
      const seenTokens = new Set<string>();
      let pageToken: string | undefined;
      do {
        const params: Record<string, string> = {
          q: `'${folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' in parents and trashed=false`,
          fields: 'nextPageToken,files(id,name,mimeType)',
          pageSize: '1000',
          key: apiKey,
        };
        if (pageToken) params.pageToken = pageToken;
        const page = await readJson(await request(fetchImpl, apiUrl('', params)));
        if (!isObject(page) || (page.files !== undefined && !Array.isArray(page.files))) {
          throw new CatalogError('parse', 'Invalid Drive file list.');
        }
        for (const file of (page.files ?? []) as unknown[]) {
          if (!isObject(file) || typeof file.id !== 'string' || !file.id || typeof file.name !== 'string' || typeof file.mimeType !== 'string') {
            throw new CatalogError('parse', 'Invalid Drive file metadata.');
          }
          entries.push({
            id: file.id,
            name: file.name,
            kind: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
          });
        }
        if (page.nextPageToken !== undefined && typeof page.nextPageToken !== 'string') {
          throw new CatalogError('parse', 'Invalid Drive pagination token.');
        }
        pageToken = page.nextPageToken as string | undefined;
        if (pageToken) {
          if (seenTokens.has(pageToken)) throw new CatalogError('parse', 'Repeated Drive pagination token.');
          seenTokens.add(pageToken);
        }
      } while (pageToken);
      return { title: metadata.name, entries };
    },
  };
}

/** `fetchImpl` permite usar el fetch de la plataforma (en escritorio, el de Tauri sin CORS). */
export function createDefaultSource(fetchImpl: typeof fetch = fetch): FolderSource {
  const apiKey = process.env.EXPO_PUBLIC_DRIVE_API_KEY?.trim();
  return apiKey ? createApiSource(apiKey, fetchImpl) : createEmbeddedSource(fetchImpl);
}

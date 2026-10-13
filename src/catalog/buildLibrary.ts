import { coverUrl, streamUrl } from './driveUrls';
import type { Album, FolderListing, FolderSource, Library, Track } from './types';

const audioExtension = /\.(mp3|m4a|aac|wav|flac)$/i;
const imageExtension = /\.(jpg|jpeg|png|webp)$/i;
const preferredCover = /^(cover|folder|front|portada|artwork)\.(jpg|jpeg|png|webp)$/i;

export function cleanTrackTitle(fileName: string): { title: string; trackNumber: number | null } {
  let title = fileName.trim().replace(/\.[^.]+$/, '');
  const leadingNumber = /^(\d+)(?:\s*[-._)]\s*|\s+)/.exec(title);
  const trackNumber = leadingNumber ? Number(leadingNumber[1]) : null;
  if (leadingNumber) title = title.slice(leadingNumber[0].length);
  title = title.trim();
  if (!/\s/.test(title)) title = title.replace(/[-_]/g, ' ');
  title = title.replace(/\s+/g, ' ').trim();
  return { title: title.charAt(0).toUpperCase() + title.slice(1), trackNumber };
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function compareTracks(left: Track, right: Track): number {
  const leftNumber = left.trackNumber ?? Infinity;
  const rightNumber = right.trackNumber ?? Infinity;
  return leftNumber !== rightNumber ? leftNumber - rightNumber : naturalCompare(left.fileName, right.fileName);
}

type FolderTask = { id: string; name: string; parents: string[]; depth: number };

export async function buildLibrary(
  rootId: string,
  source: FolderSource,
  opts: { maxDepth?: number; rootAlbumTitle?: string; now?: () => number } = {},
): Promise<Library> {
  // Root errors propagate; rejected subfolder listings are collected below.
  const rootListing = await source.listFolder(rootId);
  const maxDepth = opts.maxDepth ?? 3;
  const albums: Album[] = [];
  const pending: FolderTask[] = [];
  const visited = new Set([rootId]);

  function collect(task: FolderTask, listing: FolderListing): void {
    const isRoot = task.depth === 0;
    const titles = isRoot ? [] : [...task.parents, listing.title ?? task.name];
    const title = isRoot ? (opts.rootAlbumTitle ?? 'Sueltos') : titles.join(' · ');
    const images = listing.entries.filter((entry) => entry.kind === 'file' && imageExtension.test(entry.name));
    const image = images.find((entry) => preferredCover.test(entry.name)) ?? images[0];
    const artworkUrl = image ? coverUrl(image.id) : null;
    const tracks: Track[] = listing.entries
      .filter((entry) => entry.kind === 'file' && audioExtension.test(entry.name))
      .map((entry) => ({
        id: entry.id,
        ...cleanTrackTitle(entry.name),
        fileName: entry.name,
        albumId: task.id,
        albumTitle: title,
        streamUrl: streamUrl(entry.id),
        artworkUrl,
      }))
      .sort(compareTracks);
    if (tracks.length > 0) albums.push({ id: task.id, title, coverUrl: artworkUrl, tracks, isRoot });

    if (task.depth >= maxDepth) return;
    for (const entry of listing.entries) {
      if (entry.kind !== 'folder' || visited.has(entry.id)) continue;
      // Reserve IDs when enqueuing, before concurrent requests can see a duplicate.
      visited.add(entry.id);
      pending.push({ id: entry.id, name: entry.name, parents: titles, depth: task.depth + 1 });
    }
  }

  collect({ id: rootId, name: rootListing.title ?? rootId, parents: [], depth: 0 }, rootListing);
  while (pending.length > 0) {
    const batch = pending.splice(0, 4);
    const results = await Promise.allSettled(batch.map(async (task) => source.listFolder(task.id)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') collect(batch[index], result.value);
    });
  }

  albums.sort((left, right) => Number(left.isRoot) - Number(right.isRoot) || naturalCompare(left.title, right.title));
  return {
    rootId,
    rootTitle: rootListing.title ?? rootId,
    albums,
    fetchedAt: (opts.now ?? Date.now)(),
  };
}

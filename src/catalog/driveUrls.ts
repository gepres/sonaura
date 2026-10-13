export function streamUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download`;
}

export function coverUrl(fileId: string, size = 600): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}`;
}

export function extractFolderId(input: string): string | null {
  const value = input.trim();
  const validId = /^[A-Za-z0-9_-]+$/;
  if (validId.test(value)) return value;

  // String parsing also works on Hermes without a URL/DOM polyfill.
  let path = value;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path)) {
    const origin = /^https?:\/\/drive\.google\.com(?=\/|[?#]|$)/i.exec(path);
    if (!origin) return null;
    path = path.slice(origin[0].length);
  }

  const folder = /^\/(?:drive\/)?(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/.exec(path);
  if (folder) return folder[1];

  const query = /[?&]id=([^&#]*)/.exec(path);
  if (!query) return null;
  try {
    const id = decodeURIComponent(query[1]);
    return validId.test(id) ? id : null;
  } catch {
    return null;
  }
}

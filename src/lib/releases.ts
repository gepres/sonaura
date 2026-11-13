import Constants from 'expo-constants';
import { useEffect, useState } from 'react';

/**
 * Las apps para descargar viven en GitHub Releases. Los archivos se llaman siempre igual, así
 * que `/releases/latest/download/<archivo>` sirve siempre la última versión publicada y la web
 * no hay que tocarla en cada versión (ver docs/publicar-version.md).
 */
export const RELEASES_REPO = 'gepres/sonaura';
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases`;

export const ASSETS = {
  /** Teléfonos de 64 bits (arm64-v8a): casi todos los Android actuales. */
  android: 'Sonaura-android.apk',
  /** Todas las arquitecturas: teléfonos de 32 bits, Chromebooks y emuladores. */
  androidUniversal: 'Sonaura-android-universal.apk',
  windows: 'Sonaura-windows-setup.exe',
} as const;

export type AssetKey = keyof typeof ASSETS;

export const downloadUrl = (key: AssetKey) => `${RELEASES_PAGE}/latest/download/${ASSETS[key]}`;

export type ReleaseInfo = {
  version: string;
  publishedAt: Date | null;
  sizes: Partial<Record<AssetKey, number>>;
};

type GithubRelease = { tag_name?: string; published_at?: string; assets?: { name?: string; size?: number }[] };

/** Versión, fecha y tamaños de la última release (API pública de GitHub, con CORS). */
export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<ReleaseInfo> {
  const res = await fetchImpl(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
  const data = (await res.json()) as GithubRelease;
  const sizes: ReleaseInfo['sizes'] = {};
  for (const key of Object.keys(ASSETS) as AssetKey[]) {
    const asset = data.assets?.find((a) => a.name === ASSETS[key]);
    if (typeof asset?.size === 'number') sizes[key] = asset.size;
  }
  return {
    version: (data.tag_name ?? '').replace(/^v/i, '') || fallbackVersion(),
    publishedAt: data.published_at ? new Date(data.published_at) : null,
    sizes,
  };
}

const fallbackVersion = () => Constants.expoConfig?.version ?? '';

/** La última release; mientras carga (o si GitHub no responde), la versión de esta web, sin tamaños. */
export function useLatestRelease(): ReleaseInfo {
  const [info, setInfo] = useState<ReleaseInfo>(() => ({ version: fallbackVersion(), publishedAt: null, sizes: {} }));
  useEffect(() => {
    let alive = true;
    fetchLatestRelease()
      .then((latest) => alive && setInfo(latest))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

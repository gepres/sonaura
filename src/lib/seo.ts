import { useFocusEffect, usePathname } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import { APP_NAME } from '@/config';

/** Dominio publicado: el de las URL canónicas, el sitemap y las tarjetas al compartir. */
export const SITE_URL = 'https://sonaura.genaropretill.com';

export const DEFAULT_TITLE = `${APP_NAME} · Escucha música con letra sincronizada`;
export const DEFAULT_DESCRIPTION =
  'Escucha gratis la música de Sonaura, con letra sincronizada: álbumes, favoritos y mezcla aleatoria. En la web, instalada en tu celular o con la app para Android y Windows.';

export type SeoPage = {
  /** Título propio de la pantalla; se le añade « · Sonaura». Sin él, el de la portada. */
  title?: string;
  description?: string;
  /** Pantallas personales (favoritos, descargas, reproductor): fuera de los buscadores. */
  noindex?: boolean;
};

/** «Escucha el álbum «Esistenza» en Sonaura: Caminar descalzo, Deja de huir, Mi Ego… y 1 más. Gratis, con letra.» */
export function albumDescription(album: { title: string; isRoot: boolean; tracks: { title: string }[] }): string {
  const names = album.tracks.slice(0, 3).map((t) => t.title);
  const rest = album.tracks.length - names.length;
  const list = names.join(', ') + (rest > 0 ? ` y ${rest} más` : '');
  const what = album.isRoot ? `las canciones sueltas de ${APP_NAME}` : `el álbum «${album.title}» en ${APP_NAME}`;
  return `Escucha ${what}: ${list}. Gratis, con letra.`;
}

function setTag(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const meta = (key: 'name' | 'property', id: string) => () => {
  const el = document.createElement('meta');
  el.setAttribute(key, id);
  return el;
};

/**
 * Título, descripción y URL canónica de la pantalla enfocada. La web es una SPA: un solo
 * index.html (con los valores de la portada para quien no ejecuta JavaScript) que cada pantalla
 * pone al día. Se editan las etiquetas existentes en vez de añadir otras, para no duplicarlas.
 */
export function applySeo(page: SeoPage, path: string) {
  const title = page.title ? `${page.title} · ${APP_NAME}` : DEFAULT_TITLE;
  const description = page.description ?? DEFAULT_DESCRIPTION;
  const url = `${SITE_URL}${path === '/' ? '/' : path.replace(/\/+$/, '')}`;
  document.title = title;
  setTag('meta[name="description"]', meta('name', 'description'), 'content', description);
  setTag('meta[name="robots"]', meta('name', 'robots'), 'content', page.noindex ? 'noindex' : 'index, follow');
  setTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', url);
  setTag('meta[property="og:title"]', meta('property', 'og:title'), 'content', title);
  setTag('meta[property="og:description"]', meta('property', 'og:description'), 'content', description);
  setTag('meta[property="og:url"]', meta('property', 'og:url'), 'content', url);
  setTag('meta[name="twitter:title"]', meta('name', 'twitter:title'), 'content', title);
  setTag('meta[name="twitter:description"]', meta('name', 'twitter:description'), 'content', description);
}

/** En la web, aplica el SEO de la pantalla mientras está enfocada. En las apps no hace nada. */
export function useSeo(page: SeoPage) {
  const path = usePathname();
  const { title, description, noindex } = page;
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return;
      applySeo({ title, description, noindex }, path);
    }, [title, description, noindex, path]),
  );
}

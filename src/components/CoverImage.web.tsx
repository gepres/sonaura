import { useState, type CSSProperties } from 'react';
import { StyleSheet } from 'react-native';

import type { CoverImageProps } from './CoverImage';

/**
 * Las miniaturas de Drive redirigen a lh3.googleusercontent.com, que responde 429 (HTML) si la
 * petición trae el Referer de otro dominio, y el navegador la bloquea (ERR_BLOCKED_BY_ORB).
 * Sin Referer sirve la imagen. expo-image no deja elegir la política de referrer, así que aquí
 * va un `<img>` directo. Solo las portadas: la API de Drive sí necesita el Referer (su clave
 * está restringida por dominio), por eso no se quita para toda la página.
 */
export function CoverImage({ uri, style, blurRadius }: CoverImageProps) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const flat = (StyleSheet.flatten(style) ?? {}) as CSSProperties;
  return (
    <img
      src={uri}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(uri)}
      style={{
        // Un <img> absoluto no se estira con left/right/top/bottom (absoluteFill): usa su
        // tamaño natural. Por defecto ocupa su caja; un width/height explícito manda.
        width: '100%',
        height: '100%',
        ...flat,
        display: 'block',
        objectFit: 'cover',
        filter: blurRadius ? `blur(${blurRadius}px)` : undefined,
        opacity: loaded === uri ? 1 : 0,
        transition: 'opacity 200ms ease-out',
      }}
    />
  );
}

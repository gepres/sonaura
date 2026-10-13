import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text } from 'react-native';

import { useCoverUri } from '@/state/downloads';
import { colors, radius } from '@/theme';

type Props = {
  albumId: string;
  coverUrl: string | null;
  title: string;
  size: number;
  rounded?: number;
};

// Paletas para el arte generado de álbumes sin portada (p. ej. "Sueltos").
const PALETTES: [string, string][] = [
  ['#FF4F9A', '#7C5CFF'],
  ['#FFB547', '#FF4F9A'],
  ['#7C5CFF', '#2EC5FF'],
  ['#2EE59D', '#7C5CFF'],
];

function paletteFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(h) % PALETTES.length];
}

export function AlbumArt({ albumId, coverUrl, title, size, rounded = radius.md }: Props) {
  const source = useCoverUri(albumId, coverUrl);
  const box = { width: size, height: size, borderRadius: rounded };

  if (source) {
    return (
      <Image
        source={{ uri: source }}
        style={[box, styles.base]}
        contentFit="cover"
        transition={200}
        cachePolicy="disk"
        recyclingKey={albumId}
      />
    );
  }

  return (
    <LinearGradient colors={paletteFor(albumId)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[box, styles.base, styles.center]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{title.trim().charAt(0).toUpperCase() || '♪'}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surface, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: 'rgba(255,255,255,0.92)', fontWeight: '800' },
});

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Track } from '@/catalog';
import { AlbumArt } from '@/components/AlbumArt';
import { DownloadButton } from '@/components/DownloadButton';
import { EqualizerBars } from '@/components/EqualizerBars';
import { FavoriteButton } from '@/components/FavoriteButton';
import { usePlayer } from '@/player/store';
import { currentTrackId } from '@/player/queue';
import { useIsDownloaded } from '@/state/downloads';
import { useNetwork } from '@/state/network';
import { colors, space, typo } from '@/theme';

type Props = {
  track: Track;
  onPress: () => void;
  /** Muestra portada (listas mixtas) o número de pista (vista de álbum). */
  variant?: 'art' | 'number';
  subtitle?: string;
};

export const TrackRow = memo(function TrackRow({ track, onPress, variant = 'art', subtitle }: Props) {
  const isCurrent = usePlayer((s) => (s.queue ? currentTrackId(s.queue) === track.id : false));
  const playing = usePlayer((s) => s.playing);
  const online = useNetwork((s) => s.online);
  const downloaded = useIsDownloaded(track.id);
  const unavailable = !online && !downloaded;

  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, unavailable && styles.dimmed]}
      accessibilityRole="button"
      accessibilityLabel={`${track.title}, ${track.albumTitle}`}
      accessibilityHint={unavailable ? 'No disponible sin conexión' : 'Reproducir'}>
      <View style={styles.lead}>
        {variant === 'art' ? (
          <AlbumArt albumId={track.albumId} coverUrl={track.artworkUrl} title={track.albumTitle} size={48} rounded={8} />
        ) : isCurrent ? (
          <EqualizerBars playing={playing} />
        ) : (
          <Text style={styles.number}>{track.trackNumber ?? '•'}</Text>
        )}
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, isCurrent && styles.current]} numberOfLines={1}>
          {track.title}
        </Text>
        <View style={styles.subRow}>
          {variant === 'art' && isCurrent ? <EqualizerBars playing={playing} /> : null}
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle ?? track.albumTitle}
          </Text>
        </View>
      </View>
      <FavoriteButton track={track} />
      <DownloadButton track={track} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  dimmed: { opacity: 0.4 },
  lead: { width: 48, alignItems: 'center', justifyContent: 'center' },
  number: { ...typo.caption, fontVariant: ['tabular-nums'] },
  text: { flex: 1, gap: 2 },
  title: { ...typo.body },
  current: { color: colors.magenta },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subtitle: { ...typo.caption, flexShrink: 1 },
});

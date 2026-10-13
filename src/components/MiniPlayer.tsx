import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AlbumArt } from '@/components/AlbumArt';
import { Icon } from '@/components/Icon';
import { useCurrentTrack, usePlayer } from '@/player/store';
import { colors, MINI_PLAYER_HEIGHT, radius, space, typo } from '@/theme';

export function MiniPlayer() {
  const track = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering && s.playing);
  const ratio = usePlayer((s) => (s.duration > 0 ? Math.min(s.position / s.duration, 1) : 0));

  if (!track) return null;

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.wrap}>
      <Pressable
        onPress={() => router.push('/player')}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`Abrir reproductor: ${track.title}`}>
        <AlbumArt albumId={track.albumId} coverUrl={track.artworkUrl} title={track.albumTitle} size={44} rounded={8} />
        <View style={styles.text}>
          <Text style={typo.body} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={typo.caption} numberOfLines={1}>
            {track.albumTitle}
          </Text>
        </View>
        <Pressable
          onPress={() => usePlayer.getState().togglePlay()}
          hitSlop={12}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}>
          {buffering ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Icon name={playing ? 'pause' : 'play'} size={26} />
          )}
        </Pressable>
        <Pressable
          onPress={() => usePlayer.getState().next()}
          hitSlop={12}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel="Siguiente">
          <Icon name="next" size={24} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.sm, paddingBottom: space.xs },
  card: {
    height: MINI_PLAYER_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    gap: space.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  text: { flex: 1, gap: 2 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: colors.border },
  progressFill: { height: 2, backgroundColor: colors.magenta },
});

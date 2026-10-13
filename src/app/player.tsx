import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/AlbumArt';
import { DownloadButton } from '@/components/DownloadButton';
import { FavoriteButton } from '@/components/FavoriteButton';
import { Icon } from '@/components/Icon';
import { SeekBar } from '@/components/SeekBar';
import { EmptyState, SectionTitle } from '@/components/ui';
import { VolumeControl } from '@/components/VolumeControl';
import { contentFrame } from '@/lib/layout';
import { upcomingIds } from '@/player/queue';
import { useCurrentTrack, usePlayer } from '@/player/store';
import { useCoverUri } from '@/state/downloads';
import { auraGradient, colors, radius, space, typo } from '@/theme';

const SLEEP_OPTIONS = [15, 30, 60];

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function SleepTimer() {
  const sleepAt = usePlayer((s) => s.sleepAt);
  const minutesLeft = usePlayer((s) => s.sleepMinutesLeft);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.sleepWrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.sleepBtn}
        accessibilityRole="button"
        accessibilityLabel="Temporizador de apagado">
        <Icon name="sleep" size={20} color={sleepAt ? colors.amber : colors.textMuted} />
        <Text style={[typo.caption, sleepAt ? { color: colors.amber } : null]}>
          {minutesLeft ? `${minutesLeft} min` : 'Temporizador'}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.chips}>
          {SLEEP_OPTIONS.map((m) => (
            <Pressable
              key={m}
              style={styles.chip}
              onPress={() => {
                usePlayer.getState().setSleepTimer(m);
                setOpen(false);
              }}>
              <Text style={typo.caption}>{m} min</Text>
            </Pressable>
          ))}
          {sleepAt ? (
            <Pressable
              style={styles.chip}
              onPress={() => {
                usePlayer.getState().setSleepTimer(null);
                setOpen(false);
              }}>
              <Text style={[typo.caption, { color: colors.danger }]}>Apagar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const track = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering && s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const queue = usePlayer((s) => s.queue);
  const queueTracks = usePlayer((s) => s.queueTracks);
  const notice = usePlayer((s) => s.notice);
  // Las acciones del store son estables: se seleccionan como hooks, no con getState() en render.
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const seekTo = usePlayer((s) => s.seekTo);
  const skipTo = usePlayer((s) => s.skipTo);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const clearNotice = usePlayer((s) => s.clearNotice);
  const cover = useCoverUri(track?.albumId ?? '', track?.artworkUrl ?? null);

  if (!track || !queue) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.xl }]}>
        <EmptyState title="Nada sonando" message="Elige una canción para empezar." />
      </View>
    );
  }

  // La portada se ajusta al ancho y también al alto: en una ventana baja de escritorio
  // deja sitio a título, barra y controles sin obligar a hacer scroll.
  const artSize = Math.max(140, Math.min(width - space.xl * 2, width > 900 ? 420 : 360, height - 470));
  const upcoming = upcomingIds(queue, 20)
    .map((id) => queueTracks[id])
    .filter(Boolean);

  return (
    <View style={styles.screen}>
      {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} blurRadius={60} contentFit="cover" /> : null}
      <LinearGradient colors={['rgba(10,7,23,0.55)', 'rgba(10,7,23,0.92)', colors.bg]} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[contentFrame, { maxWidth: 640, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl }]}>
        <View style={styles.topBar}>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar reproductor">
            <Icon name="chevronDown" size={28} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={typo.overline}>REPRODUCIENDO DESDE</Text>
            <Text style={typo.body} numberOfLines={1}>
              {track.albumTitle}
            </Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <View style={[styles.artWrap, { width: artSize, height: artSize }]}>
          <AlbumArt albumId={track.albumId} coverUrl={track.artworkUrl} title={track.albumTitle} size={artSize} rounded={radius.lg} />
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={typo.title} numberOfLines={2}>
                {track.title}
              </Text>
              <Text style={[typo.body, { color: colors.textMuted }]} numberOfLines={1}>
                {track.albumTitle}
              </Text>
            </View>
            <DownloadButton track={track} size={26} />
            <FavoriteButton track={track} size={28} />
          </View>

          <SeekBar position={position} duration={duration} onSeek={seekTo} />

          <View style={styles.controls}>
            <Pressable onPress={toggleShuffle} hitSlop={10} accessibilityRole="button" accessibilityLabel="Aleatorio" accessibilityState={{ selected: shuffle }}>
              <Icon name="shuffle" size={24} color={shuffle ? colors.magenta : colors.textMuted} />
            </Pressable>
            <Pressable onPress={previous} hitSlop={10} accessibilityRole="button" accessibilityLabel="Anterior">
              <Icon name="previous" size={34} />
            </Pressable>
            <Pressable onPress={togglePlay} accessibilityRole="button" accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}>
              <LinearGradient colors={auraGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.playBtn}>
                {buffering ? <ActivityIndicator color="#1A0B2E" /> : <Icon name={playing ? 'pause' : 'play'} size={36} color="#1A0B2E" />}
              </LinearGradient>
            </Pressable>
            <Pressable onPress={next} hitSlop={10} accessibilityRole="button" accessibilityLabel="Siguiente">
              <Icon name="next" size={34} />
            </Pressable>
            <Pressable
              onPress={cycleRepeat}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={repeat === 'one' ? 'Repetir una' : repeat === 'all' ? 'Repetir todo' : 'Repetir desactivado'}>
              <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} size={24} color={repeat === 'off' ? colors.textMuted : colors.magenta} />
            </Pressable>
          </View>

          {notice ? (
            <Text style={styles.notice} onPress={clearNotice}>
              {notice}
            </Text>
          ) : null}

          {Platform.OS === 'web' ? (
            <View style={styles.volume}>
              <VolumeControl width={220} />
            </View>
          ) : null}

          <SleepTimer />
        </View>

        {upcoming.length > 0 ? (
          <>
            <SectionTitle>A continuación</SectionTitle>
            {upcoming.map((t, i) => (
              <Pressable
                key={`${t.id}-${i}`}
                onPress={() => skipTo(queue.position + i + 1)}
                style={({ pressed }) => [styles.upNext, pressed && { backgroundColor: colors.surfacePressed }]}>
                <AlbumArt albumId={t.albumId} coverUrl={t.artworkUrl} title={t.albumTitle} size={40} rounded={6} />
                <View style={{ flex: 1 }}>
                  <Text style={typo.body} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={typo.caption} numberOfLines={1}>
                    {t.albumTitle}
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, marginBottom: space.xl },
  artWrap: {
    alignSelf: 'center',
    shadowColor: colors.violet,
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
    elevation: 24,
    borderRadius: radius.lg,
  },
  body: { paddingHorizontal: space.xl, marginTop: space.xl, gap: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playBtn: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  notice: { ...typo.caption, color: colors.amber, textAlign: 'center' },
  volume: { alignItems: 'center' },
  sleepWrap: { alignItems: 'center', gap: space.sm },
  sleepBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  upNext: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
});

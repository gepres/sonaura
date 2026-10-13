import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Track } from '@/catalog';
import { TrackRow } from '@/components/TrackRow';
import { EmptyState, PillButton, SectionTitle } from '@/components/ui';
import { confirmAction } from '@/lib/confirm';
import { formatBytes, pluralize } from '@/lib/format';
import { contentFrame } from '@/lib/layout';
import { playAll, playFrom } from '@/player/actions';
import { totalDownloadedBytes, useDownloads } from '@/state/downloads';
import { useLibrary } from '@/state/library';
import { colors, space, typo } from '@/theme';

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const items = useDownloads((s) => s.items);
  const progress = useDownloads((s) => s.progress);
  const tracksById = useLibrary((s) => s.tracksById);

  const tracks = useMemo(
    () =>
      Object.values(items)
        .sort((a, b) => a.track.albumTitle.localeCompare(b.track.albumTitle) || (a.track.trackNumber ?? 0) - (b.track.trackNumber ?? 0))
        .map((r) => r.track),
    [items],
  );
  const inFlight = useMemo(
    () => Object.keys(progress).map((id) => tracksById[id]).filter((t): t is Track => Boolean(t)),
    [progress, tracksById],
  );

  const clearAll = () =>
    void confirmAction('Borrar descargas', 'Se eliminarán todas las canciones guardadas en este dispositivo.', 'Borrar todo').then(
      (ok) => ok && useDownloads.getState().remove(Object.keys(items)),
    );

  return (
    <FlatList
      style={styles.screen}
      data={tracks}
      keyExtractor={(t) => t.id}
      contentContainerStyle={[contentFrame, { paddingTop: insets.top + space.md, paddingBottom: space.xxl }]}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <Text style={typo.hero}>Sin conexión</Text>
            <Text style={typo.caption}>
              {pluralize(tracks.length, 'canción', 'canciones')} · {formatBytes(totalDownloadedBytes(items))}
            </Text>
          </View>
          {tracks.length > 0 ? (
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <PillButton label="Reproducir" icon="play" onPress={() => playAll(tracks)} />
              </View>
              <View style={{ flex: 1 }}>
                <PillButton label="Aleatorio" icon="shuffle" variant="ghost" onPress={() => playAll(tracks, true)} />
              </View>
            </View>
          ) : null}
          {inFlight.length > 0 ? (
            <>
              <SectionTitle>{`Descargando · ${inFlight.length}`}</SectionTitle>
              {inFlight.map((t) => (
                <TrackRow key={t.id} track={t} onPress={() => {}} />
              ))}
            </>
          ) : null}
          {tracks.length > 0 ? (
            <SectionTitle right={<Text style={styles.clear} onPress={clearAll}>Borrar todo</Text>}>Guardadas</SectionTitle>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        inFlight.length === 0 ? (
          <EmptyState
            title="Escucha sin conexión"
            message="Toca ⬇ en una canción o descarga un álbum completo. Sonará aunque estés en modo avión."
            action={<PillButton label="Ver álbumes" variant="ghost" onPress={() => router.navigate('/')} />}
          />
        ) : null
      }
      renderItem={({ item }) => <TrackRow track={item} onPress={() => playFrom(tracks, item)} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, marginBottom: space.lg, gap: space.xs },
  actions: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg },
  clear: { ...typo.caption, color: colors.danger, fontWeight: '700' },
});

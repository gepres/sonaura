import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumArt } from '@/components/AlbumArt';
import { Icon } from '@/components/Icon';
import { TrackRow } from '@/components/TrackRow';
import { EmptyState, PillButton, StatusBanner } from '@/components/ui';
import { pluralize } from '@/lib/format';
import { playAll, playFrom } from '@/player/actions';
import { useDownloads } from '@/state/downloads';
import { useAlbum } from '@/state/library';
import { colors, space, typo } from '@/theme';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const album = useAlbum(id);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const downloadedCount = useDownloads((s) => album?.tracks.filter((t) => s.items[t.id]).length ?? 0);
  const inFlight = useDownloads((s) => album?.tracks.some((t) => t.id in s.progress) ?? false);

  if (!album) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState title="Álbum no encontrado" message="Puede que ya no esté en la carpeta de Drive." />
      </View>
    );
  }

  const allDownloaded = downloadedCount === album.tracks.length;
  const toggleAlbumDownload = () => {
    const store = useDownloads.getState();
    if (inFlight) {
      album.tracks.forEach((t) => store.cancel(t.id));
    } else if (allDownloaded) {
      Alert.alert('Quitar descargas', `Se liberará el espacio de "${album.title}".`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => store.remove(album.tracks.map((t) => t.id)) },
      ]);
    } else {
      store.enqueue(album.tracks);
    }
  };

  const artSize = Math.min(width * 0.62, 280);
  const downloadLabel = inFlight ? 'Descargando…' : allDownloaded ? 'Descargado' : 'Descargar';

  return (
    <FlatList
      style={styles.screen}
      data={album.tracks}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      ListHeaderComponent={
        <View>
          <LinearGradient
            colors={['rgba(124,92,255,0.45)', 'rgba(10,7,23,0)']}
            style={[styles.headerBg, { paddingTop: insets.top + space.sm }]}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              hitSlop={12}
              style={styles.back}
              accessibilityRole="button"
              accessibilityLabel="Volver">
              <Icon name="back" size={24} />
            </Pressable>
            <View style={styles.artWrap}>
              <AlbumArt albumId={album.id} coverUrl={album.coverUrl} title={album.title} size={artSize} rounded={16} />
            </View>
            <Text style={[typo.hero, styles.title]} numberOfLines={2}>
              {album.title}
            </Text>
            <Text style={[typo.caption, styles.meta]}>
              {pluralize(album.tracks.length, 'canción', 'canciones')}
              {downloadedCount > 0 ? ` · ${downloadedCount} sin conexión` : ''}
            </Text>
          </LinearGradient>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <PillButton label="Reproducir" icon="play" onPress={() => playAll(album.tracks)} />
            </View>
            <View style={{ flex: 1 }}>
              <PillButton label="Aleatorio" icon="shuffle" variant="ghost" onPress={() => playAll(album.tracks, true)} />
            </View>
            <Pressable
              onPress={toggleAlbumDownload}
              style={styles.dl}
              accessibilityRole="button"
              accessibilityLabel={`${downloadLabel} álbum`}>
              <Icon
                name={allDownloaded ? 'downloaded' : inFlight ? 'cancel' : 'download'}
                size={26}
                color={allDownloaded ? colors.success : inFlight ? colors.amber : colors.text}
              />
            </Pressable>
          </View>
          <StatusBanner />
        </View>
      }
      renderItem={({ item }) => <TrackRow track={item} variant="number" subtitle={album.title} onPress={() => playFrom(album.tracks, item)} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBg: { alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.lg },
  back: { alignSelf: 'flex-start', padding: space.xs, marginBottom: space.sm },
  artWrap: {
    shadowColor: colors.magenta,
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
    borderRadius: 16,
  },
  title: { textAlign: 'center', marginTop: space.lg, fontSize: 28 },
  meta: { marginTop: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, marginBottom: space.lg },
  dl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});

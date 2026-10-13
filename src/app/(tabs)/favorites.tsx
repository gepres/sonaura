import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackRow } from '@/components/TrackRow';
import { EmptyState, PillButton, StatusBanner } from '@/components/ui';
import { pluralize } from '@/lib/format';
import { playAll, playFrom } from '@/player/actions';
import { sortedFavorites, useFavorites } from '@/state/favorites';
import { useLibrary } from '@/state/library';
import { colors, space, typo } from '@/theme';

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const items = useFavorites((s) => s.items);
  const tracksById = useLibrary((s) => s.tracksById);
  // Se prefiere la versión del catálogo actual (URLs y portada frescas) sobre la guardada.
  const tracks = useMemo(() => sortedFavorites(items).map((t) => tracksById[t.id] ?? t), [items, tracksById]);

  return (
    <FlatList
      style={styles.screen}
      data={tracks}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl }}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <Text style={typo.hero}>Favoritos</Text>
            <Text style={typo.caption}>{pluralize(tracks.length, 'canción guardada', 'canciones guardadas')}</Text>
          </View>
          <StatusBanner />
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
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title="Aún no tienes favoritos"
          message="Toca el corazón en cualquier canción para guardarla aquí."
          action={<PillButton label="Explorar música" variant="ghost" onPress={() => router.navigate('/')} />}
        />
      }
      renderItem={({ item }) => <TrackRow track={item} onPress={() => playFrom(tracks, item)} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, marginBottom: space.lg, gap: space.xs },
  actions: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, marginBottom: space.lg },
});

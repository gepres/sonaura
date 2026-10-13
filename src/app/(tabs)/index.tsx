import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Album } from '@/catalog';
import { AlbumArt } from '@/components/AlbumArt';
import { BrandMark } from '@/components/BrandMark';
import { Icon } from '@/components/Icon';
import { TrackRow } from '@/components/TrackRow';
import { EmptyState, PillButton, SectionTitle, StatusBanner } from '@/components/ui';
import { APP_NAME } from '@/config';
import { pluralize } from '@/lib/format';
import { playAll, playFrom } from '@/player/actions';
import { useDownloads } from '@/state/downloads';
import { useLibrary } from '@/state/library';
import { useNetwork } from '@/state/network';
import { colors, radius, space, typo } from '@/theme';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function AlbumCard({ album, size }: { album: Album; size: number }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/album/[id]', params: { id: album.id } })}
      style={({ pressed }) => [{ width: size }, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`Álbum ${album.title}, ${album.tracks.length} canciones`}>
      <AlbumArt albumId={album.id} coverUrl={album.coverUrl} title={album.title} size={size} rounded={radius.md} />
      <Text style={[typo.body, styles.cardTitle]} numberOfLines={1}>
        {album.title}
      </Text>
      <Text style={typo.caption}>{pluralize(album.tracks.length, 'canción', 'canciones')}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const library = useLibrary((s) => s.library);
  const loading = useLibrary((s) => s.loading);
  const error = useLibrary((s) => s.error);
  const online = useNetwork((s) => s.online);
  const downloadedCount = useDownloads((s) => Object.keys(s.items).length);
  const [query, setQuery] = useState('');
  // Solo el gesto de tirar muestra el indicador nativo; el refresco automático usa el de la cabecera.
  const [pulling, setPulling] = useState(false);

  const allTracks = useMemo(() => library?.albums.flatMap((a) => a.tracks) ?? [], [library]);
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return allTracks.filter((t) => normalize(`${t.title} ${t.albumTitle}`).includes(q));
  }, [allTracks, query]);

  const cardSize = (Math.min(width, 700) - space.lg * 2 - space.md) / 2;
  const refresh = () => void useLibrary.getState().refresh();
  const onPull = async () => {
    setPulling(true);
    await useLibrary.getState().refresh();
    setPulling(false);
  };

  const shuffleAll = () => playAll(allTracks, true);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={onPull}
          tintColor={colors.magenta}
          colors={[colors.magenta]}
          progressBackgroundColor={colors.surface}
        />
      }>
      <View style={styles.header}>
        <BrandMark size={40} />
        <View style={{ flex: 1 }}>
          <Text style={typo.caption}>{greeting()}</Text>
          <Text style={styles.brand}>{APP_NAME}</Text>
        </View>
        <Pressable onPress={refresh} hitSlop={10} accessibilityRole="button" accessibilityLabel="Actualizar biblioteca">
          {loading ? <ActivityIndicator color={colors.textMuted} /> : <Icon name="refresh" size={22} color={colors.textMuted} />}
        </Pressable>
      </View>

      <StatusBanner />

      {!library ? (
        loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.magenta} size="large" />
            <Text style={typo.caption}>Conectando con tu música en Drive…</Text>
          </View>
        ) : (
          <EmptyState
            title="No pudimos cargar la música"
            message={error ?? 'Revisa tu conexión e inténtalo de nuevo.'}
            action={<PillButton label="Reintentar" icon="refresh" onPress={refresh} />}
          />
        )
      ) : (
        <>
          <View style={styles.search}>
            <Icon name="search" size={18} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar canciones o álbumes"
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Buscar"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Borrar búsqueda">
                <Icon name="cancel" size={18} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>

          {query.trim() ? (
            <>
              <SectionTitle>{pluralize(results.length, 'resultado', 'resultados')}</SectionTitle>
              {results.map((t) => (
                <TrackRow key={t.id} track={t} onPress={() => playFrom(results, t)} />
              ))}
            </>
          ) : (
            <>
              <Pressable onPress={shuffleAll} style={styles.heroWrap} accessibilityRole="button" accessibilityLabel="Mezcla aleatoria de toda la biblioteca">
                <LinearGradient colors={['#FF4F9A', '#7C5CFF', '#2A1B5C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.heroOver}>MEZCLA PARA TI</Text>
                    <Text style={styles.heroTitle}>Déjate llevar</Text>
                    <Text style={styles.heroSub}>
                      {online
                        ? `${pluralize(allTracks.length, 'canción', 'canciones')} en aleatorio`
                        : `${pluralize(downloadedCount, 'canción descargada', 'canciones descargadas')}`}
                    </Text>
                  </View>
                  <View style={styles.heroPlay}>
                    <Icon name="shuffle" size={26} color="#1A0B2E" />
                  </View>
                </LinearGradient>
              </Pressable>

              <SectionTitle>Álbumes</SectionTitle>
              <View style={styles.grid}>
                {library.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} size={cardSize} />
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, marginBottom: space.lg },
  brand: { ...typo.title, fontSize: 26 },
  loading: { alignItems: 'center', gap: space.md, paddingVertical: 80 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  heroWrap: { marginHorizontal: space.lg, marginTop: space.lg, borderRadius: radius.lg, overflow: 'hidden' },
  hero: { flexDirection: 'row', alignItems: 'center', padding: space.xl, minHeight: 120 },
  heroOver: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroSub: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  heroPlay: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.lg, rowGap: space.xl },
  cardTitle: { marginTop: space.sm },
});

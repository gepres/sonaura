import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Track } from '@/catalog';
import { PillButton } from '@/components/ui';
import { activeLineIndex } from '@/lyrics/lines';
import { useLyrics } from '@/lyrics/store';
import { colors, radius, space, typo } from '@/theme';

type Props = {
  track: Track;
  width: number;
  height: number;
  position: number;
  onSeek: (seconds: number) => void;
};

/** Tras mover la letra a mano, el avance automático espera este tiempo. */
const MANUAL_SCROLL_PAUSE = 4_000;

/**
 * La letra en lugar de la portada. Si viene de un `.lrc`, resalta el verso que suena, avanza
 * sola y al tocar un verso salta a ese momento; si es la del MP3 (sin tiempos), se lee con scroll.
 */
export function LyricsPanel({ track, width, height, position, onSeek }: Props) {
  const { entry, loading, failed, retry } = useLyrics(track);
  const scrollRef = useRef<ScrollView>(null);
  const lineY = useRef<number[]>([]);
  const manualUntil = useRef(0);
  const programmaticUntil = useRef(0);

  const lines = entry?.lines ?? [];
  const synced = Boolean(entry?.synced);
  const active = synced ? activeLineIndex(lines, position) : -1;

  // Al cambiar de canción, la letra empieza arriba.
  useEffect(() => {
    lineY.current = [];
    manualUntil.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [track.id]);

  useEffect(() => {
    if (active < 0 || Date.now() < manualUntil.current) return;
    const y = lineY.current[active];
    if (y === undefined) return;
    programmaticUntil.current = Date.now() + 600;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - height * 0.35), animated: true });
  }, [active, height]);

  const box = [styles.box, { width, height }];

  if (!entry) {
    return (
      <View style={[box, styles.center]}>
        {loading || !failed ? (
          <>
            <ActivityIndicator color={colors.magenta} />
            <Text style={typo.caption}>Buscando la letra…</Text>
          </>
        ) : (
          <>
            <Text style={[typo.body, styles.centerText]}>No se pudo cargar la letra.</Text>
            <PillButton label="Reintentar" icon="refresh" variant="ghost" onPress={() => void retry()} />
          </>
        )}
      </View>
    );
  }

  if (lines.length === 0) {
    return (
      <View style={[box, styles.center]}>
        <Text style={[typo.body, styles.centerText]}>Esta canción no tiene letra.</Text>
      </View>
    );
  }

  return (
    <View style={box}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, synced && { paddingBottom: height * 0.6 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={100}
        onScroll={() => {
          // Un scroll que no hizo la app es de la persona: se le deja leer tranquila.
          if (Date.now() > programmaticUntil.current) manualUntil.current = Date.now() + MANUAL_SCROLL_PAUSE;
        }}>
        {lines.map((line, i) => {
          const style = line.section
            ? styles.section
            : [styles.line, synced && (i === active ? styles.lineActive : i < active ? styles.linePast : styles.lineNext)];
          const text = (
            <Text style={style} accessibilityRole={line.section ? 'header' : 'text'}>
              {line.text || '♪'}
            </Text>
          );
          return (
            <View
              key={`${i}-${line.text}`}
              style={line.gap ? styles.gap : null}
              onLayout={(e) => {
                lineY.current[i] = e.nativeEvent.layout.y;
              }}>
              {synced && line.time !== null && !line.section ? (
                <Pressable
                  onPress={() => {
                    manualUntil.current = 0;
                    onSeek(line.time!);
                  }}
                  accessibilityRole="button"
                  accessibilityHint="Salta a este verso">
                  {text}
                </Pressable>
              ) : (
                text
              )}
            </View>
          );
        })}
      </ScrollView>
      <LinearGradient pointerEvents="none" colors={['rgba(20,14,43,0.95)', 'rgba(20,14,43,0)']} style={[styles.fade, styles.fadeTop]} />
      <LinearGradient pointerEvents="none" colors={['rgba(20,14,43,0)', 'rgba(20,14,43,0.95)']} style={[styles.fade, styles.fadeBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(20,14,43,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  centerText: { color: colors.textMuted, textAlign: 'center' },
  content: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xxl },
  gap: { marginTop: space.lg },
  section: { ...typo.overline, color: colors.textFaint, textTransform: 'uppercase', marginBottom: space.xs },
  line: { fontSize: 21, lineHeight: 29, fontWeight: '700', color: colors.text, paddingVertical: 3 },
  lineActive: { color: colors.text },
  linePast: { color: 'rgba(245,242,255,0.35)' },
  lineNext: { color: 'rgba(245,242,255,0.5)' },
  fade: { position: 'absolute', left: 0, right: 0, height: space.xl },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
});

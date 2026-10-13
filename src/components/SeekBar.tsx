import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { formatTime } from '@/lib/format';
import { colors, typo } from '@/theme';

type Props = { position: number; duration: number; onSeek: (seconds: number) => void };

/** Barra de progreso arrastrable; mientras se arrastra muestra la posición objetivo. */
export function SeekBar({ position, duration, onSeek }: Props) {
  const [width, setWidth] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? position;
  const ratio = duration > 0 ? Math.min(Math.max(shown / duration, 0), 1) : 0;

  const toSeconds = (x: number) => Math.min(Math.max(x / width, 0), 1) * duration;
  const update = (x: number) => setScrub(toSeconds(x));
  const commit = (x: number) => {
    setScrub(null);
    if (duration > 0) onSeek(toSeconds(x));
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => update(e.x))
    .onUpdate((e) => update(e.x))
    .onEnd((e) => commit(e.x))
    .onFinalize((_, success) => {
      if (!success) setScrub(null);
    });

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          style={styles.hit}
          onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(e.nativeEvent.layout.width, 1))}
          accessibilityRole="adjustable"
          accessibilityLabel="Posición de reproducción"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown) }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
          </View>
          <View style={[styles.thumb, { left: ratio * width - 7 }, scrub !== null && styles.thumbActive]} />
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shown)}</Text>
        <Text style={styles.time}>{duration > 0 ? `-${formatTime(duration - shown)}` : '--:--'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.text },
  thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: colors.text },
  thumbActive: { transform: [{ scale: 1.3 }] },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { ...typo.caption, fontVariant: ['tabular-nums'] },
});

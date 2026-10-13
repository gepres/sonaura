import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme';

function Bar({ playing, delay, color }: { playing: boolean; delay: number; color: string }) {
  const h = useSharedValue(0.35);
  useEffect(() => {
    if (playing) {
      h.set(
        withRepeat(
        withSequence(withTiming(1, { duration: 320 + delay }), withTiming(0.25, { duration: 280 + delay })),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(h);
      h.set(withTiming(0.35, { duration: 200 }));
    }
  }, [playing, delay, h]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: h.get() }] }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

/** Indicador animado de "sonando ahora". */
export function EqualizerBars({ playing, color = colors.magenta }: { playing: boolean; color?: string }) {
  return (
    <View style={styles.row} accessibilityLabel={playing ? 'Reproduciendo' : 'En pausa'}>
      <Bar playing={playing} delay={0} color={color} />
      <Bar playing={playing} delay={90} color={color} />
      <Bar playing={playing} delay={40} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 16, width: 16 },
  bar: { width: 4, height: 16, borderRadius: 2 },
});

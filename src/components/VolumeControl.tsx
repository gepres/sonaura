import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Icon } from '@/components/Icon';
import { usePlayer } from '@/player/store';
import { colors } from '@/theme';

/**
 * Volumen de la app: icono (silenciar) + barra. Se usa en escritorio; en el móvil el volumen
 * se lleva con los botones del teléfono.
 */
export function VolumeControl({ width = 120 }: { width?: number }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const [trackWidth, setTrackWidth] = useState(width);

  const level = muted ? 0 : volume;
  const icon = level === 0 ? 'volumeOff' : level < 0.5 ? 'volumeLow' : 'volumeHigh';
  const toLevel = (x: number) => Math.min(Math.max(x / trackWidth, 0), 1);

  // Clic o arrastre: el volumen sigue al puntero desde el primer contacto.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => setVolume(toLevel(e.x)))
    .onUpdate((e) => setVolume(toLevel(e.x)));

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggleMute}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'}>
        <Icon name={icon} size={20} color={level === 0 ? colors.textFaint : colors.textMuted} />
      </Pressable>
      <GestureDetector gesture={pan}>
        <View
          style={[styles.hit, { width }]}
          onLayout={(e: LayoutChangeEvent) => setTrackWidth(Math.max(e.nativeEvent.layout.width, 1))}
          accessibilityRole="adjustable"
          accessibilityLabel="Volumen"
          // Props ARIA estándar: react-native-web no traduce accessibilityValue a aria-valuenow.
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${level * 100}%` }]} />
          </View>
          <View style={[styles.thumb, { left: level * trackWidth - 6 }]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hit: { height: 24, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.text },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text },
});

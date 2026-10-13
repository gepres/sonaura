import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { pointerRatio } from '@/lib/pointerRatio';
import { usePlayer } from '@/player/store';
import { colors } from '@/theme';

/**
 * Volumen de escritorio: icono (silenciar) + barra con eventos de puntero del DOM, medida en
 * el momento del clic (ver SeekBar.web.tsx).
 */
export function VolumeControl({ width = 120 }: { width?: number }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const [dragging, setDragging] = useState(false);

  const level = muted ? 0 : volume;
  const icon = level === 0 ? 'volumeOff' : level < 0.5 ? 'volumeLow' : 'volumeHigh';

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const k = pointerRatio(e);
    if (e.button !== 0 || k === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setVolume(k);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const k = pointerRatio(e);
    if (dragging && k !== null) setVolume(k);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.ctrlKey) return;
    e.preventDefault();
    setVolume(Math.round((level + (e.key === 'ArrowRight' ? 0.1 : -0.1)) * 10) / 10);
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggleMute}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'}>
        <Icon name={icon} size={20} color={level === 0 ? colors.textFaint : colors.textMuted} />
      </Pressable>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Volumen"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKeyDown}
        style={{ position: 'relative', width, height: 24, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', outline: 'none' }}>
        <div style={{ width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ width: `${level * 100}%`, height: 4, background: colors.text }} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: `calc(${level * 100}% - 6px)`,
            width: 12,
            height: 12,
            borderRadius: 6,
            background: colors.text,
            pointerEvents: 'none',
          }}
        />
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

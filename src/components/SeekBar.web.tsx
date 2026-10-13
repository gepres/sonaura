import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatTime } from '@/lib/format';
import { pointerRatio } from '@/lib/pointerRatio';
import { colors, typo } from '@/theme';

type Props = { position: number; duration: number; onSeek: (seconds: number) => void };

/**
 * Barra de progreso de escritorio: eventos de puntero del DOM y la geometría del elemento en
 * el momento del clic. (Con gestos y un ancho medido aparte, un clic llegó a calcularse como
 * 100 % y saltaba al final de la canción.)
 */
export function SeekBar({ position, duration, onSeek }: Props) {
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? position;
  const ratio = duration > 0 ? Math.min(Math.max(shown / duration, 0), 1) : 0;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const k = pointerRatio(e);
    if (duration <= 0 || e.button !== 0 || k === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrub(k * duration);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const k = pointerRatio(e);
    if (scrub !== null && k !== null) setScrub(k * duration);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (scrub === null) return;
    const k = pointerRatio(e);
    setScrub(null);
    if (k !== null) onSeek(k * duration);
  };
  // Con la barra enfocada, ← / → mueven 5 s.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.ctrlKey) return;
    e.preventDefault();
    onSeek(Math.min(Math.max(position + (e.key === 'ArrowRight' ? 5 : -5), 0), duration));
  };

  return (
    <View>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Posición de reproducción"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setScrub(null)}
        onKeyDown={onKeyDown}
        style={{ position: 'relative', height: 28, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', outline: 'none' }}>
        <div style={{ width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ width: `${ratio * 100}%`, height: 4, background: colors.text }} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: `calc(${ratio * 100}% - 7px)`,
            width: 14,
            height: 14,
            borderRadius: 7,
            background: colors.text,
            transform: scrub !== null ? 'scale(1.3)' : undefined,
            pointerEvents: 'none',
          }}
        />
      </div>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shown)}</Text>
        <Text style={styles.time}>{duration > 0 ? `-${formatTime(duration - shown)}` : '--:--'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { ...typo.caption, fontVariant: ['tabular-nums'] },
});

import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { Track } from '@/catalog';
import { Icon } from '@/components/Icon';
import { confirmAction } from '@/lib/confirm';
import { downloadsSupported, useDownloadProgress, useDownloads, useIsDownloaded } from '@/state/downloads';
import { colors } from '@/theme';

function ProgressRing({ value, size }: { value: number; size: number }) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.amber}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - Math.max(value, 0.03))}
      />
    </Svg>
  );
}

/** Estado de descarga de una pista: descargar · progreso (tocar cancela) · descargada (tocar borra). */
export function DownloadButton({ track, size = 22 }: { track: Track; size?: number }) {
  const downloaded = useIsDownloaded(track.id);
  const progress = useDownloadProgress(track.id);
  const failed = useDownloads((s) => s.failed[track.id]);

  const onPress = () => {
    const { enqueue, cancel, remove } = useDownloads.getState();
    if (progress !== undefined) return cancel(track.id);
    if (downloaded) {
      void confirmAction('Quitar descarga', `"${track.title}" dejará de estar disponible sin conexión.`, 'Quitar').then(
        (ok) => ok && remove([track.id]),
      );
      return;
    }
    enqueue([track]);
  };

  if (!downloadsSupported) return null;

  const label =
    progress !== undefined ? 'Cancelar descarga' : downloaded ? 'Quitar descarga' : 'Descargar para escuchar sin conexión';

  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={styles.btn}>
      {progress !== undefined ? (
        <View style={{ width: size, height: size }}>
          <ProgressRing value={progress} size={size} />
        </View>
      ) : (
        <Icon
          name={downloaded ? 'downloaded' : 'download'}
          size={size}
          color={downloaded ? colors.success : failed ? colors.danger : colors.textMuted}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 6 },
});

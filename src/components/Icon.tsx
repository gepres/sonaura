import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/** Iconos semánticos: SF Symbols en iOS y Material Symbols en Android. */
const ICONS = {
  play: { ios: 'play.fill', android: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause' },
  next: { ios: 'forward.fill', android: 'skip_next' },
  previous: { ios: 'backward.fill', android: 'skip_previous' },
  shuffle: { ios: 'shuffle', android: 'shuffle' },
  repeat: { ios: 'repeat', android: 'repeat' },
  repeatOne: { ios: 'repeat.1', android: 'repeat_one' },
  heart: { ios: 'heart', android: 'favorite' },
  heartFill: { ios: 'heart.fill', android: 'favorite' },
  download: { ios: 'arrow.down.circle', android: 'download_for_offline' },
  downloaded: { ios: 'checkmark.circle.fill', android: 'offline_pin' },
  offline: { ios: 'wifi.slash', android: 'wifi_off' },
  home: { ios: 'house.fill', android: 'home' },
  library: { ios: 'square.stack.fill', android: 'library_music' },
  trash: { ios: 'trash', android: 'delete' },
  chevronDown: { ios: 'chevron.down', android: 'keyboard_arrow_down' },
  back: { ios: 'chevron.left', android: 'arrow_back' },
  sleep: { ios: 'moon.zzz', android: 'bedtime' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  close: { ios: 'xmark', android: 'close' },
  search: { ios: 'magnifyingglass', android: 'search' },
  queue: { ios: 'list.bullet', android: 'queue_music' },
  cancel: { ios: 'xmark.circle.fill', android: 'cancel' },
} as const satisfies Record<string, { ios: SymbolViewProps['name'] & string; android: string }>;

export type IconName = keyof typeof ICONS;

type Props = { name: IconName; size?: number; color?: string };

export function Icon({ name, size = 24, color = colors.text }: Props) {
  // Material Symbols (Android y web) solo trae la variante de contorno: el corazón relleno se dibuja.
  if (name === 'heartFill' && Platform.OS !== 'ios') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill={color}
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      </Svg>
    );
  }
  const icon = ICONS[name];
  // En web (escritorio) se usan los mismos Material Symbols que en Android.
  return <SymbolView name={{ ...icon, web: icon.android }} size={size} tintColor={color} />;
}

import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import type { Track } from '@/catalog';
import { Icon } from '@/components/Icon';
import { useFavorites, useIsFavorite } from '@/state/favorites';
import { colors } from '@/theme';

export function FavoriteButton({ track, size = 22 }: { track: Track; size?: number }) {
  const favorite = useIsFavorite(track.id);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const onPress = () => {
    if (!favorite) scale.set(withSequence(withSpring(1.35, { damping: 6 }), withSpring(1)));
    void Haptics.selectionAsync();
    useFavorites.getState().toggle(track);
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityState={{ selected: favorite }}
      accessibilityLabel={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}>
      <Animated.View style={style}>
        <Icon name={favorite ? 'heartFill' : 'heart'} size={size} color={favorite ? colors.magenta : colors.textMuted} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 6 },
});

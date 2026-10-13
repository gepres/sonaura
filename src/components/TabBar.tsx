import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { MiniPlayer } from '@/components/MiniPlayer';
import { contentFrame } from '@/lib/layout';
import { colors, space } from '@/theme';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Inicio', icon: 'home' },
  { name: 'favorites', label: 'Favoritos', icon: 'heartFill' },
  { name: 'downloads', label: 'Sin conexión', icon: 'downloaded' },
];

/** Barra de pestañas propia: así el mini-reproductor vive encima en todas las pantallas. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      <View style={contentFrame}>
        <MiniPlayer />
      </View>
      <View style={[styles.row, contentFrame, { maxWidth: 560 }]}>
        {TABS.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          if (!route) return null;
          const focused = activeName === tab.name;
          const color = focused ? colors.text : colors.textFaint;
          return (
            <Pressable
              key={tab.name}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}>
              <Icon name={tab.icon} size={24} color={focused ? colors.magenta : color} />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  row: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.xs },
  label: { fontSize: 11, fontWeight: '600' },
});

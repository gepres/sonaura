import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { isBrowser } from '@/lib/isBrowser';
import { colors, radius, space, typo } from '@/theme';

/** En la web: invitación a instalar la app (Android o Windows). En las apps no se muestra. */
export function InstallBanner() {
  if (!isBrowser()) return null;
  return (
    <Pressable
      onPress={() => router.push('/descargar')}
      style={({ pressed }) => [styles.banner, pressed && { backgroundColor: colors.surfacePressed }]}
      accessibilityRole="link"
      accessibilityLabel="Descargar la app para Android o Windows">
      <View style={styles.icon}>
        <Icon name="install" size={22} color={colors.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={typo.body}>Descarga la app</Text>
        <Text style={typo.caption}>Android y Windows · escucha sin conexión</Text>
      </View>
      <Icon name="chevronRight" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,181,71,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

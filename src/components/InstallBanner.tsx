import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { isBrowser } from '@/lib/isBrowser';
import { usePwaInstall } from '@/lib/pwa';
import { isPhone, visitorOs } from '@/lib/userAgent';
import { colors, radius, space, typo } from '@/theme';

/**
 * En la web: invitación a instalar. En el celular, la propia web como app (PWA), destacada: con un
 * toque si el navegador ofrece su aviso; si no (iPhone, Firefox), la página con los pasos. En el
 * computador, las apps de Android y Windows. En las apps y en la web ya instalada no se muestra.
 */
export function InstallBanner() {
  const pwa = usePwaInstall();
  if (!isBrowser() || pwa.installed) return null;

  if (isPhone(visitorOs())) {
    const onPress = () => {
      if (pwa.canPrompt) void pwa.install('inicio');
      else router.push('/descargar');
    };
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.banner, styles.highlight, pressed && { backgroundColor: colors.surfacePressed }]}
        accessibilityRole="button"
        accessibilityLabel="Instalar Sonaura en el celular">
        <View style={[styles.icon, styles.iconHighlight]}>
          <Icon name="home" size={22} color={colors.magenta} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={typo.body}>Instala Sonaura en tu celular</Text>
          <Text style={typo.caption}>
            {pwa.canPrompt ? 'Un toque y queda en tu pantalla de inicio' : 'Desde esta web, sin descargar archivos'}
          </Text>
        </View>
        {pwa.canPrompt ? (
          <Text style={styles.cta}>Instalar</Text>
        ) : (
          <Icon name="chevronRight" size={22} color={colors.textMuted} />
        )}
      </Pressable>
    );
  }

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
  highlight: { borderWidth: 1.5, borderColor: colors.magenta },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,181,71,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHighlight: { backgroundColor: 'rgba(255,79,154,0.14)' },
  cta: {
    ...typo.caption,
    fontWeight: '800',
    color: '#1A0B2E',
    backgroundColor: colors.amber,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { isBrowser } from '@/lib/isBrowser';
import { usePwaInstall } from '@/lib/pwa';
import { isPhone, visitorOs } from '@/lib/userAgent';
import { colors, radius, space, typo } from '@/theme';

type Option = { key: 'web' | 'android' | 'windows'; label: string; a11y: string; icon: IconName; onPress: () => void };

/**
 * En la web: las tres formas de instalar, siempre juntas: la propia web como app (PWA), Android y
 * Windows. Se destaca la de este dispositivo (en el celular, la web). La web con un toque si el
 * navegador ofrece su aviso; si no, y para Android y Windows, la página con los pasos. Ya instalada
 * la web, quedan Android y Windows. En las apps no se muestra.
 */
export function InstallBanner() {
  const pwa = usePwaInstall();
  if (!isBrowser()) return null;

  const os = visitorOs();
  const phone = isPhone(os);
  const toDownloads = () => router.push('/descargar');

  const options: Option[] = [];
  if (!pwa.installed) {
    options.push({
      key: 'web',
      label: phone ? 'Celular' : 'Web',
      a11y: phone ? 'Instalar en el celular desde esta web' : 'Instalar esta web como app',
      icon: 'home',
      onPress: () => (pwa.canPrompt ? void pwa.install('inicio') : toDownloads()),
    });
  }
  options.push({ key: 'android', label: 'Android', a11y: 'Descargar la app para Android', icon: 'phone', onPress: toDownloads });
  options.push({ key: 'windows', label: 'Windows', a11y: 'Descargar la app para Windows', icon: 'desktop', onPress: toDownloads });

  const highlighted: Option['key'] | null = pwa.installed
    ? null
    : phone || (os !== 'Windows' && pwa.canPrompt)
      ? 'web'
      : os === 'Windows'
        ? 'windows'
        : null;

  const title = pwa.installed ? 'Descarga la app' : phone ? 'Instala Sonaura en tu celular' : 'Instala Sonaura';
  const caption = pwa.installed
    ? 'Android y Windows · escucha sin conexión'
    : phone
      ? pwa.canPrompt
        ? 'Un toque en «Celular» y queda en tu pantalla de inicio. O la app de Android o Windows.'
        : 'Desde esta web, sin descargar archivos, o con la app de Android o Windows.'
      : 'En tu celular desde esta web, o con la app de Android o Windows.';

  return (
    <View style={[styles.banner, highlighted === 'web' && phone && styles.highlight]}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Icon name="install" size={22} color={colors.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={typo.body}>{title}</Text>
          <Text style={typo.caption}>{caption}</Text>
        </View>
      </View>
      <View style={styles.options}>
        {options.map((option) => {
          const active = option.key === highlighted;
          return (
            <Pressable
              key={option.key}
              onPress={option.onPress}
              style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel={option.a11y}>
              <Icon name={option.icon} size={18} color={active ? '#1A0B2E' : colors.text} />
              <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
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
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,181,71,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optionActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  optionLabel: { ...typo.caption, fontWeight: '700', color: colors.text },
  optionLabelActive: { color: '#1A0B2E' },
});

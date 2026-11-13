import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/analytics';
import { BrandMark } from '@/components/BrandMark';
import { Icon, type IconName } from '@/components/Icon';
import { PillButton } from '@/components/ui';
import { APP_NAME } from '@/config';
import { formatBytes } from '@/lib/format';
import { RELEASES_PAGE, downloadUrl, useLatestRelease, type AssetKey } from '@/lib/releases';
import { visitorOs } from '@/lib/userAgent';
import { colors, radius, space, typo } from '@/theme';

function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function download(key: AssetKey) {
  track('app_descargada', { sistema: key });
  const url = downloadUrl(key);
  // En la web, la misma pestaña: GitHub responde con el archivo y la página se queda donde está.
  if (Platform.OS === 'web') window.location.assign(url);
  else void Linking.openURL(url);
}

const sizeLabel = (bytes: number | undefined) => (bytes ? ` · ${formatBytes(bytes)}` : '');

type CardProps = {
  icon: IconName;
  title: string;
  detail: string;
  recommended: boolean;
  action: ReactNode;
  steps: string[];
  footer?: ReactNode;
};

function PlatformCard({ icon, title, detail, recommended, action, steps, footer }: CardProps) {
  return (
    <View style={[styles.card, recommended && styles.cardRecommended]}>
      {recommended ? <Text style={styles.badge}>PARA ESTE DISPOSITIVO</Text> : null}
      <View style={styles.cardHead}>
        <View style={styles.iconWrap}>
          <Icon name={icon} size={28} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={typo.subtitle}>{title}</Text>
          <Text style={typo.caption}>{detail}</Text>
        </View>
      </View>
      {action}
      <View style={styles.steps}>
        {steps.map((step, i) => (
          <View key={step} style={styles.step}>
            <Text style={styles.stepNumber}>{i + 1}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>
      {footer}
    </View>
  );
}

/** Página para instalar la app: Android (APK) y Windows (instalador), desde la web. */
export default function DownloadScreen() {
  const insets = useSafeAreaInsets();
  const release = useLatestRelease();
  const os = visitorOs();

  useEffect(() => {
    track('descargas_vista', { sistema_visitante: os });
  }, [os]);

  const android = (
    <PlatformCard
      key="android"
      icon="phone"
      title="Android"
      detail={`Android 7 o superior · APK${sizeLabel(release.sizes.android)}`}
      recommended={os === 'Android'}
      action={<PillButton label="Descargar para Android" icon="install" onPress={() => download('android')} />}
      steps={[
        'Abre el archivo descargado, desde la notificación o desde la carpeta Descargas.',
        'Si Android lo pide, permite «Instalar apps desconocidas» para tu navegador.',
        'Si dice «App no instalada», desinstala la versión anterior de Sonaura y vuelve a abrirlo.',
      ]}
      footer={
        <Text style={styles.alt}>
          ¿Teléfono antiguo de 32 bits?{' '}
          <Text style={styles.link} onPress={() => download('androidUniversal')} accessibilityRole="link">
            Versión universal{sizeLabel(release.sizes.androidUniversal)}
          </Text>
        </Text>
      }
    />
  );

  const windows = (
    <PlatformCard
      key="windows"
      icon="desktop"
      title="Windows"
      detail={`Windows 10 y 11 · 64 bits${sizeLabel(release.sizes.windows)}`}
      recommended={os === 'Windows'}
      action={<PillButton label="Descargar para Windows" icon="install" onPress={() => download('windows')} />}
      steps={[
        'Abre «Sonaura-windows-setup.exe» y sigue el instalador (no pide permisos de administrador).',
        'Si aparece «Windows protegió su PC», pulsa «Más información» y luego «Ejecutar de todas formas»: el instalador aún no lleva firma digital.',
      ]}
    />
  );

  const cards = os === 'Windows' ? [windows, android] : [android, windows];
  const published = release.publishedAt?.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}>
      <Pressable onPress={back} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Volver">
        <Icon name="back" size={26} />
      </Pressable>

      <View style={styles.hero}>
        <BrandMark size={64} />
        <Text style={[typo.hero, styles.center]}>Lleva {APP_NAME} contigo</Text>
        <Text style={[typo.body, styles.lead]}>
          Con la app escuchas sin conexión, con la pantalla apagada y desde los controles del teléfono o del teclado.
        </Text>
      </View>

      {os === 'iOS' ? (
        <View style={[styles.card, styles.cardRecommended]}>
          <Text style={typo.subtitle}>iPhone y iPad</Text>
          <Text style={[typo.body, { color: colors.textMuted }]}>
            Todavía no hay app para iPhone. Puedes usar {APP_NAME} en esta web: en Safari, toca Compartir y luego «Añadir a
            pantalla de inicio».
          </Text>
        </View>
      ) : null}

      {cards}

      <Text style={styles.footer}>
        {release.version ? `Versión ${release.version}` : ''}
        {published ? ` · ${published}` : ''}
        {release.version ? ' · ' : ''}
        <Text style={styles.link} onPress={() => void Linking.openURL(RELEASES_PAGE)} accessibilityRole="link">
          Todas las versiones
        </Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: space.lg, gap: space.lg },
  back: { alignSelf: 'flex-start', padding: space.xs },
  hero: { alignItems: 'center', gap: space.md, marginBottom: space.sm },
  center: { textAlign: 'center' },
  lead: { color: colors.textMuted, textAlign: 'center', maxWidth: 460 },
  card: {
    gap: space.lg,
    padding: space.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardRecommended: { borderWidth: 1.5, borderColor: colors.magenta },
  badge: { ...typo.overline, color: colors.magenta, marginBottom: -space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: { gap: space.sm },
  step: { flexDirection: 'row', gap: space.sm },
  stepNumber: {
    ...typo.caption,
    width: 20,
    height: 20,
    lineHeight: 20,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    fontWeight: '800',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  stepText: { ...typo.caption, flex: 1, lineHeight: 19 },
  alt: { ...typo.caption },
  link: { color: colors.magenta, fontWeight: '700', textDecorationLine: 'underline' },
  footer: { ...typo.caption, textAlign: 'center', color: colors.textFaint },
});

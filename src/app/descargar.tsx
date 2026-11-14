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
import { usePwaInstall, type PwaInstall } from '@/lib/pwa';
import { RELEASES_PAGE, chromeIntentUrl, downloadUrl, useLatestRelease, type AssetKey } from '@/lib/releases';
import { isBraveBrowser, isPhone, visitorOs, type VisitorOs } from '@/lib/userAgent';
import { useSeo } from '@/lib/seo';
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

/** El APK abierto en Chrome (solo Android): otros navegadores, como Brave, a veces no terminan la descarga. */
function downloadWithChrome(key: AssetKey) {
  track('app_descargada', { sistema: key, via: 'chrome' });
  window.location.assign(chromeIntentUrl(downloadUrl(key)));
}

const sizeLabel = (bytes: number | undefined) => (bytes ? ` · ${formatBytes(bytes)}` : '');

type CardProps = {
  icon: IconName;
  title: string;
  detail: string;
  recommended: boolean;
  /** Texto de la etiqueta cuando es la recomendada. */
  badge?: string;
  action: ReactNode;
  steps: string[];
  footer?: ReactNode;
};

function PlatformCard({ icon, title, detail, recommended, badge = 'PARA ESTE DISPOSITIVO', action, steps, footer }: CardProps) {
  return (
    <View style={[styles.card, recommended && styles.cardRecommended]}>
      {recommended ? <Text style={styles.badge}>{badge}</Text> : null}
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

/** Los pasos para instalar la web como app, según el dispositivo y lo que ofrezca el navegador. */
function pwaSteps(os: VisitorOs, pwa: PwaInstall, phone: boolean): string[] {
  if (pwa.installed) return [];
  if (os === 'iOS') {
    return [
      'En Safari, toca Compartir: el cuadrado con una flecha hacia arriba.',
      'Elige «Añadir a pantalla de inicio». Si no aparece, desliza la lista hacia arriba.',
      'Toca «Añadir»: Sonaura queda en tu pantalla de inicio y se abre como una app.',
    ];
  }
  if (pwa.canPrompt) {
    return phone
      ? ['Toca «Instalar en este celular» y confirma.', 'Sonaura aparece entre tus apps y se abre a pantalla completa, sin la barra del navegador.']
      : ['Toca «Instalar en este equipo» y confirma.', 'Sonaura se abre en su propia ventana, como una app más.'];
  }
  if (os === 'Android') {
    return [
      'Abre el menú ⋮ del navegador (Chrome, Edge o Samsung Internet).',
      'Toca «Instalar app» o «Añadir a pantalla de inicio».',
      'Sonaura aparece entre tus apps y se abre a pantalla completa.',
    ];
  }
  const host = typeof window === 'undefined' ? 'esta web' : window.location.host;
  return [
    `Abre ${host} en el navegador de tu celular.`,
    'Android: menú ⋮ y «Instalar app». iPhone: en Safari, Compartir y «Añadir a pantalla de inicio».',
  ];
}

/** Página para instalar la app: la web en el celular (PWA), Android (APK) y Windows (instalador). */
export default function DownloadScreen() {
  useSeo({
    title: 'Descargar para Android, Windows o tu celular',
    description:
      'Instala Sonaura en tu celular desde la web (Android y iPhone) o descarga la app para Android y Windows. Gratis y sin crear cuenta.',
  });
  const insets = useSafeAreaInsets();
  const release = useLatestRelease();
  const pwa = usePwaInstall();
  const os = visitorOs();
  const phone = isPhone(os);
  // En el celular, instalar la web es lo más rápido (y en iPhone, lo único). En un computador
  // que no es Windows, también, si el navegador lo ofrece.
  const pwaFirst = phone || (os !== 'Windows' && pwa.canPrompt);
  // En Android con Brave, el APK se baja con Chrome: Brave a veces lo deja en «Descargando…».
  const braveOnAndroid = Platform.OS === 'web' && os === 'Android' && isBraveBrowser();
  const getApk = (key: AssetKey) => (braveOnAndroid ? downloadWithChrome(key) : download(key));

  useEffect(() => {
    track('descargas_vista', { sistema_visitante: os });
  }, [os]);

  const android = (
    <PlatformCard
      key="android"
      icon="phone"
      title="Android"
      detail={`Android 7 o superior · APK${sizeLabel(release.sizes.android)}`}
      recommended={os === 'Android' && !pwaFirst}
      action={
        braveOnAndroid ? (
          <View style={styles.actionStack}>
            <Text style={styles.warn}>
              Estás en Brave, que a veces deja el APK en «Descargando…» sin terminar. Descárgalo con Chrome.
            </Text>
            <PillButton label="Descargar con Chrome" icon="install" onPress={() => downloadWithChrome('android')} />
            <Text style={styles.alt}>
              ¿No tienes Chrome?{' '}
              <Text style={styles.link} onPress={() => download('android')} accessibilityRole="link">
                Descargar con Brave
              </Text>
            </Text>
          </View>
        ) : (
          <PillButton label="Descargar para Android" icon="install" onPress={() => download('android')} />
        )
      }
      steps={[
        'Abre el archivo descargado, desde la notificación o desde la carpeta Descargas.',
        'Si Android lo pide, permite «Instalar apps desconocidas» para tu navegador.',
        'Si dice «App no instalada», desinstala la versión anterior de Sonaura y vuelve a abrirlo.',
      ]}
      footer={
        <View style={styles.actionStack}>
          <Text style={styles.alt}>
            ¿Teléfono antiguo de 32 bits?{' '}
            <Text style={styles.link} onPress={() => getApk('androidUniversal')} accessibilityRole="link">
              Versión universal{sizeLabel(release.sizes.androidUniversal)}
            </Text>
          </Text>
          {os === 'Android' && !braveOnAndroid ? (
            <Text style={styles.alt}>
              ¿Se queda en «Descargando…» y no termina? Pasa con algunos navegadores, como Brave:{' '}
              <Text style={styles.link} onPress={() => downloadWithChrome('android')} accessibilityRole="link">
                descárgalo con Chrome
              </Text>
              .
            </Text>
          ) : null}
        </View>
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

  const web = (
    <PlatformCard
      key="pwa"
      icon="home"
      title={phone ? 'Instálala en este celular' : pwa.canPrompt ? 'Instálala en este equipo' : 'En tu celular, desde esta web'}
      detail="Sin descargar archivos · se actualiza sola · Android y iPhone"
      recommended={pwaFirst}
      badge={phone ? 'RECOMENDADO PARA TU CELULAR' : undefined}
      action={
        pwa.installed ? (
          <Text style={styles.done}>Ya la tienes instalada: ábrela desde el icono de {APP_NAME}.</Text>
        ) : pwa.canPrompt ? (
          <PillButton label={phone ? 'Instalar en este celular' : 'Instalar en este equipo'} icon="install" onPress={() => void pwa.install('descargas')} />
        ) : null
      }
      steps={pwaSteps(os, pwa, phone)}
      footer={
        os === 'Android' ? (
          <Text style={styles.alt}>¿Quieres guardar canciones para escucharlas sin conexión? Para eso está la app de Android, más abajo.</Text>
        ) : os === 'iOS' ? (
          <Text style={styles.alt}>Todavía no hay app de iPhone en la App Store: así la tienes en tu pantalla de inicio.</Text>
        ) : null
      }
    />
  );

  const cards = pwaFirst
    ? [web, ...(os === 'Windows' ? [windows, android] : [android, windows])]
    : os === 'Windows'
      ? [windows, android, web]
      : [android, windows, web];
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
          Instálala en tu celular desde esta web en un momento, o descarga la app de Android o Windows para escuchar
          también sin conexión.
        </Text>
      </View>

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
  done: { ...typo.body, color: colors.textMuted },
  actionStack: { gap: space.sm },
  warn: { ...typo.caption, color: colors.amber, lineHeight: 19 },
  link: { color: colors.magenta, fontWeight: '700', textDecorationLine: 'underline' },
  footer: { ...typo.caption, textAlign: 'center', color: colors.textFaint },
});

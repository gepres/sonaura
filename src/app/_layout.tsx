import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { installDesktopChrome } from '@/lib/desktopChrome';
import { useDesktopShortcuts } from '@/lib/useDesktopShortcuts';
import { initPlayer } from '@/player/store';
import { useDownloads } from '@/state/downloads';
import { fileStore } from '@/state/fileStore';
import { useLibrary } from '@/state/library';
import { startNetworkWatcher } from '@/state/network';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();
installDesktopChrome();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bgElevated, primary: colors.magenta },
};

type Persisted = { persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } };

/**
 * Resuelve al terminar la hidratación. safeStorage ya convierte los fallos de lectura en
 * estado vacío; el plazo máximo es la última red para no dejar la app en el splash.
 */
function whenHydrated(store: Persisted, timeoutMs = 3000) {
  return new Promise<void>((resolve) => {
    if (store.persist.hasHydrated()) return resolve();
    const timer = setTimeout(resolve, timeoutMs);
    const unsub = store.persist.onFinishHydration(() => {
      clearTimeout(timer);
      unsub();
      resolve();
    });
  });
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useDesktopShortcuts();

  useEffect(() => {
    startNetworkWatcher();
    void initPlayer();
    // Se muestra lo guardado en cuanto está en memoria y se refresca desde Drive en segundo plano.
    // En escritorio, además, las rutas de las descargas se resuelven antes de pintar.
    void Promise.all([
      fileStore.init().catch(() => {}),
      whenHydrated(useLibrary),
      whenHydrated(useDownloads),
    ]).then(() => {
      setReady(true);
      void SplashScreen.hideAsync();
      void useDownloads.getState().reconcile();
      void useLibrary.getState().refresh();
    });
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="player" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

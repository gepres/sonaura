import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initPlayer } from '@/player/store';
import { useDownloads } from '@/state/downloads';
import { useLibrary } from '@/state/library';
import { startNetworkWatcher } from '@/state/network';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

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
  useEffect(() => {
    startNetworkWatcher();
    void initPlayer();
    // Se muestra lo guardado en cuanto está en memoria y se refresca desde Drive en segundo plano.
    void Promise.all([whenHydrated(useLibrary), whenHydrated(useDownloads)]).then(() => {
      void SplashScreen.hideAsync();
      useDownloads.getState().reconcile();
      void useLibrary.getState().refresh();
    });
  }, []);

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

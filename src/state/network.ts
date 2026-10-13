import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { create } from 'zustand';

type NetworkStore = { online: boolean };

const isOnline = (s: NetworkState) => Boolean(s.isConnected) && s.isInternetReachable !== false;

export const useNetwork = create<NetworkStore>(() => ({ online: true }));

let started = false;

/** Mantiene `useNetwork().online` al día. Se llama una vez al arrancar la app. */
export function startNetworkWatcher() {
  if (started) return;
  started = true;
  let gotEvent = false;
  addNetworkStateListener((s) => {
    gotEvent = true;
    useNetwork.setState({ online: isOnline(s) });
  });
  // La consulta inicial puede resolver después de un evento más nuevo: entonces se descarta.
  getNetworkStateAsync()
    .then((s) => {
      if (!gotEvent) useNetwork.setState({ online: isOnline(s) });
    })
    .catch(() => {});
}

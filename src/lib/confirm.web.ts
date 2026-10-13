import { isTauri } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

/**
 * En web, Alert.alert de react-native-web no muestra nada: en escritorio se usa el diálogo
 * nativo de Windows y en un navegador, window.confirm.
 */
export async function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (isTauri()) {
    return ask(message, { title, kind: 'warning', okLabel: confirmLabel, cancelLabel: 'Cancelar' });
  }
  return window.confirm(`${title}\n\n${message}`);
}

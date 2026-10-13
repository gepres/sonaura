import * as Haptics from 'expo-haptics';

/** Pequeña vibración de confirmación (favoritos). */
export function tapFeedback() {
  void Haptics.selectionAsync().catch(() => {});
}

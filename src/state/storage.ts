import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Almacenamiento persistente compartido por todos los stores. */
export const persistStorage = createJSONStorage(() => AsyncStorage);

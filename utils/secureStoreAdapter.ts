import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Adapter implementing Supabase's expected custom storage interface
 * wrapping Expo's hardware-encrypted keychain/keystore.
 */
export const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    // Avoid SecureStore on web (fallback to localStorage if ever deployed to web)
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    }
    
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }
    
    return SecureStore.deleteItemAsync(key);
  },
};

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// SecureStore n'existe que sur iOS/Android. Le rendu web/SSR de Metro importe
// aussi ce module : sans ce garde, il crashe (getValueWithKeyAsync is not a
// function) et fait tourner un auto-refresh en boucle dans le process Node.
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: isNative ? ExpoSecureStoreAdapter : undefined,
      autoRefreshToken: isNative,
      persistSession: isNative,
      detectSessionInUrl: false,
      // PKCE : requis pour l'OAuth mobile (échange de code), sans effet sur
      // email/password et invités
      flowType: 'pkce',
    },
  }
);

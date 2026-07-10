import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { supabase } from '@/lib/supabase';
import { getOnboarded } from '@/lib/onboarding';
import { loadLocaleOverride } from '@/lib/i18n';
import { initPurchasesListener } from '@/lib/purchases';
import { registerPushToken } from '@/lib/push';
import { Brand } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [onboarded, setOnboardedState] = useState<boolean | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    getOnboarded().then(setOnboardedState);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Ré-enregistrement silencieux du jeton push (no-op sans permission) :
    // couvre la rotation de jeton et les utilisateurs ayant déjà accepté
    if (session) registerPushToken();
  }, [session]);

  useEffect(() => {
    if (session === undefined || onboarded === undefined) return;
    const first = segments[0] as string | undefined;
    const inAuth = first === '(auth)';
    const inOnboarding = first === '(onboarding)';
    // Route racine (index) : rien ne redirige sinon — l'app resterait sur le spinner.
    // (cast : les typed routes d'expo-router excluent la racine, le runtime non)
    const atRoot = !first || first === 'index';

    if (!session && !inAuth && !inOnboarding) {
      // L'accueil d'onboarding est le hub d'auth (premier lancement ET déconnexion)
      router.replace('/(onboarding)');
    } else if (session && (inAuth || atRoot)) {
      // Connexion faite : continuer le parcours si pas encore terminé
      router.replace(onboarded ? '/(app)/collection' : '/(onboarding)/source');
    }
    // session && inOnboarding : le parcours avance tout seul, ne pas interférer
  }, [session, onboarded, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    IBMPlexMono_400Regular,
  });

  // Locale chargée avant de cacher le splash — pas de flash de langue au premier rendu
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    loadLocaleOverride().finally(() => setLocaleReady(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded && localeReady) SplashScreen.hideAsync();
  }, [fontsLoaded, localeReady]);

  // Achats/renouvellements détectés par le SDK RevenueCat → rafraîchir les
  // données dépendantes du plan sans attendre le webhook serveur
  useEffect(() => {
    initPurchasesListener(() => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    });
  }, []);

  if (!fontsLoaded || !localeReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <AuthGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Brand.bgTop },
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen
            name="legal/[doc]"
            options={{
              headerShown: true,
              headerTransparent: true,
              headerTitle: '',
              headerBackButtonDisplayMode: 'minimal',
              headerTintColor: Brand.ink,
            }}
          />
          <Stack.Screen
            name="paywall"
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="profile-edit"
            options={{
              presentation: 'modal',
              headerShown: true,
              headerTransparent: true,
              headerTitle: '',
              headerBackButtonDisplayMode: 'minimal',
              headerTintColor: Brand.ink,
            }}
          />
          <Stack.Screen
            name="watch/add"
            options={{
              presentation: 'fullScreenModal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="watch/[id]/index"
            options={{
              headerShown: true,
              headerTransparent: true,
              headerTitle: '',
              headerBackButtonDisplayMode: 'minimal',
              headerTintColor: Brand.ink,
            }}
          />
          <Stack.Screen
            name="watch/[id]/edit"
            options={{
              presentation: 'modal',
              headerShown: true,
              headerTransparent: true,
              headerTitle: '',
              headerBackButtonDisplayMode: 'minimal',
              headerTintColor: Brand.ink,
            }}
          />
          <Stack.Screen
            name="watch/[id]/market"
            options={{
              headerShown: true,
              headerTransparent: true,
              headerTitle: '',
              headerBackButtonDisplayMode: 'minimal',
              headerTintColor: Brand.ink,
            }}
          />
        </Stack>
      </AuthGate>
      <AnimatedSplashOverlay />
    </QueryClientProvider>
  );
}

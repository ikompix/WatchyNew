import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { getOnboarded, signInAsGuest } from '@/lib/onboarding';
import { signInWithApple, signInWithGoogle } from '@/lib/oauth';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { WatchDial } from '@/components/watch-dial';

type Provider = 'apple' | 'google' | 'guest';

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<Provider | null>(null);
  // Apple Sign-In existe sur tout iOS 13+ — isAvailableAsync peut mentir en
  // Expo Go/simulateur, on affiche donc toujours le bouton sur iOS et on
  // laisse le flux remonter une erreur propre le cas échéant
  const showApple = Platform.OS === 'ios';

  // Après n'importe quelle connexion : reprendre le parcours ou aller à la collection
  async function postAuth() {
    const onboarded = await getOnboarded();
    router.replace(onboarded ? '/(app)/collection' : '/(onboarding)/camera');
  }

  async function run(provider: Provider, action: () => Promise<unknown>) {
    setPending(provider);
    try {
      const outcome = await action();
      if (outcome !== 'cancelled') await postAuth();
    } catch (err) {
      Alert.alert('Connexion impossible', err instanceof Error ? err.message : 'Réessayez.');
    } finally {
      setPending(null);
    }
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.five, paddingBottom: insets.bottom + Spacing.three },
      ]}
    >
      <ScreenBackground chamber />

      {/* Hero */}
      <View style={styles.hero}>
        <WatchDial size={118} />
        <ThemedText type="overline" style={styles.wordmark}>
          Watchy
        </ThemedText>
        <ThemedText type="title" style={styles.tagline}>
          Votre collection,{'\n'}suivie et estimée.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Photographiez, l'IA identifie, vous suivez la cote.
        </ThemedText>
      </View>

      {/* Auth — Apple en premier (guideline 4.8) */}
      <View style={styles.buttons}>
        {showApple ? (
          <Pressable
            style={styles.appleButton}
            onPress={() => run('apple', signInWithApple)}
            disabled={pending !== null}
          >
            {pending === 'apple' ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <SymbolView name="apple.logo" size={17} tintColor="#ffffff" />
                <ThemedText type="link" style={styles.appleLabel}>
                  Continuer avec Apple
                </ThemedText>
              </>
            )}
          </Pressable>
        ) : null}

        <Pressable
          style={styles.lightButton}
          onPress={() => run('google', signInWithGoogle)}
          disabled={pending !== null}
        >
          {pending === 'google' ? (
            <ActivityIndicator color={Brand.accent} size="small" />
          ) : (
            <>
              <ThemedText type="link" style={styles.googleG}>
                G
              </ThemedText>
              <ThemedText type="link" style={styles.lightLabel}>
                Continuer avec Google
              </ThemedText>
            </>
          )}
        </Pressable>

        <Pressable
          style={styles.lightButton}
          onPress={() => router.push('/(auth)/sign-in')}
          disabled={pending !== null}
        >
          <SymbolView name="envelope" size={16} tintColor={Brand.ink} />
          <ThemedText type="link" style={styles.lightLabel}>
            Continuer avec e-mail
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => run('guest', signInAsGuest)}
          disabled={pending !== null}
          style={styles.guestLink}
        >
          {pending === 'guest' ? (
            <ActivityIndicator color={Brand.accent} size="small" />
          ) : (
            <ThemedText type="link" themeColor="interactive">
              Continuer sans compte
            </ThemedText>
          )}
        </Pressable>

        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          Compte facultatif · création et suppression possibles à tout moment depuis votre
          profil.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
    paddingHorizontal: Gutter,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    marginTop: Spacing.five,
    gap: Spacing.two,
  },
  wordmark: {
    marginTop: Spacing.three,
    letterSpacing: 3,
    color: Brand.accentDark,
  },
  tagline: {
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  subtitle: {
    textAlign: 'center',
  },
  buttons: {
    gap: 10,
  },
  appleButton: {
    height: 50,
    borderRadius: Radii.button,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  appleLabel: {
    color: '#ffffff',
    fontSize: 15,
  },
  lightButton: {
    height: 50,
    borderRadius: Radii.button,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  lightLabel: {
    color: Brand.ink,
    fontSize: 15,
  },
  googleG: {
    fontFamily: Fonts?.bold ?? 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: Brand.accentDark,
  },
  guestLink: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    minHeight: 36,
    justifyContent: 'center',
  },
  footnote: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
  },
});

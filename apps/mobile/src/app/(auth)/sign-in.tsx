import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { supabase } from '@/lib/supabase';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message);
    // Redirect handled by AuthGate in root _layout
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.four },
      ]}
    >
      <ScreenBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <ThemedText style={styles.wordmark}>Watchy</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Votre collection de montres
        </ThemedText>

        <GlassCard glow style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Brand.inkTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.divider} />
          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor={Brand.inkTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </GlassCard>

        {error && (
          <ThemedText type="small" themeColor="negative" style={styles.errorText}>
            {error}
          </ThemedText>
        )}

        <Pressable
          style={[styles.buttonWrap, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          <LinearGradient
            colors={[Brand.accentLight, Brand.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.button}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="link" style={styles.buttonText}>
                Se connecter
              </ThemedText>
            )}
          </LinearGradient>
        </Pressable>

        <Link href="/(auth)/sign-up" asChild>
          <Pressable style={styles.linkRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Pas encore de compte ?{' '}
            </ThemedText>
            <ThemedText type="small" themeColor="interactive">
              Créer un compte
            </ThemedText>
          </Pressable>
        </Link>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
    paddingHorizontal: Gutter,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: Fonts?.bold ?? 'SpaceGrotesk_700Bold',
    fontSize: 38,
    lineHeight: 46,
    color: Brand.ink,
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: Spacing.one,
    marginBottom: Spacing.five,
  },
  card: {
    width: '100%',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: Radii.field,
  },
  input: {
    width: '100%',
    height: 52,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Brand.ink,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(27,37,49,0.08)',
    marginHorizontal: Spacing.three,
  },
  errorText: {
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  buttonWrap: {
    width: '100%',
    marginTop: Spacing.three,
    borderRadius: Radii.button,
    shadowColor: Brand.accentDark,
    shadowOpacity: 0.35,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  button: {
    height: 52,
    borderRadius: Radii.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
  },
  linkRow: {
    flexDirection: 'row',
    marginTop: Spacing.three,
    alignItems: 'center',
  },
});

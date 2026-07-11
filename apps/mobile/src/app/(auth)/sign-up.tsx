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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { WatchyMark } from '@/components/watchy-mark';

export default function SignUp() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSignUp() {
    setError(null);
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + Spacing.six }]}>
        <ScreenBackground />
        <View style={styles.lockup}>
          <WatchyMark width={64} />
          <ThemedText style={styles.wordmark}>watchy</ThemedText>
        </View>
        <GlassCard style={styles.successCard}>
          <ThemedText type="default" style={{ textAlign: 'center' }}>
            {t('auth.checkEmail')}
          </ThemedText>
        </GlassCard>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.four }]}>
      <ScreenBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <View style={styles.lockup}>
          <WatchyMark width={64} />
          <ThemedText style={styles.wordmark}>watchy</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {t('auth.createAccountLink')}
        </ThemedText>

        <GlassCard glow style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder={t('auth.emailPlaceholder')}
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
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor={Brand.inkTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <View style={styles.divider} />
          <TextInput
            style={styles.input}
            placeholder={t('auth.confirmPasswordPlaceholder')}
            placeholderTextColor={Brand.inkTertiary}
            value={confirm}
            onChangeText={setConfirm}
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
          onPress={handleSignUp}
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
              <ThemedText type="link" style={styles.buttonText}>{t('auth.createMyAccount')}</ThemedText>
            )}
          </LinearGradient>
        </Pressable>

        <Link href="/(auth)/sign-in" asChild>
          <Pressable style={styles.linkRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('auth.haveAccount')}{' '}
            </ThemedText>
            <ThemedText type="small" themeColor="interactive">
              {t('auth.signIn')}
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
    alignItems: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  wordmark: {
    fontFamily: Fonts?.medium ?? 'SpaceGrotesk_500Medium',
    fontSize: 32,
    lineHeight: 40,
    color: Brand.ink,
    letterSpacing: -0.6,
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
  successCard: {
    marginTop: Spacing.four,
    width: '100%',
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
    backgroundColor: 'rgba(22,24,43,0.08)',
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

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';

/**
 * Cible du deep link watchy://reset-password?code=… (lien de l'e-mail de
 * récupération). Le code PKCE est échangé contre une session de récupération,
 * puis l'utilisateur choisit son nouveau mot de passe.
 */
export default function ResetPassword() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [ready, setReady] = useState(false);
  // Sans code dans l'URL, le lien est invalide dès le premier rendu
  const [error, setError] = useState<string | null>(() =>
    code ? null : t('resetPassword.invalidLink')
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!code) return;
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: err }) => {
        if (err) setError(t('resetPassword.invalidLink'));
        else setReady(true);
      })
      .catch(() => setError(t('resetPassword.invalidLink')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function save() {
    if (password.length < 8) {
      setError(t('resetPassword.minChars'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setError(null);
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    Alert.alert(t('resetPassword.changedTitle'), t('resetPassword.changedMessage'));
    router.replace('/(app)/collection');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenBackground />
      <View style={[styles.inner, { paddingTop: insets.top }]}>
        <ThemedText type="title">{t('resetPassword.title')}</ThemedText>

        {!ready && !error ? (
          <ActivityIndicator color={Brand.accent} style={styles.spinner} />
        ) : null}

        {ready ? (
          <>
            <GlassCard style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder={t('resetPassword.newPasswordPlaceholder')}
                placeholderTextColor={Brand.inkTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoFocus
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
            <PrimaryButton
              label={saving ? t('watchEdit.saving') : t('resetPassword.cta')}
              onPress={save}
              disabled={saving}
            />
          </>
        ) : null}

        {error ? (
          <ThemedText type="small" themeColor="negative" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Gutter,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  spinner: {
    marginTop: Spacing.four,
  },
  card: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: Radii.field,
  },
  input: {
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
  error: {
    textAlign: 'center',
  },
});

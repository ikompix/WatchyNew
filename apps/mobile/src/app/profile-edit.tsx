import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AgeRange, Expertise, UserProfile } from '@watchy/types';

import { apiGet, apiPatch, unwrap } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/premium-gate';
import { Brand, Gutter, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';

const EXPERTISE_KEYS: Expertise[] = ['novice', 'passionne', 'collectionneur', 'metier'];
const AGES: AgeRange[] = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

/**
 * « Mes informations » — profil déclaratif entièrement facultatif.
 * Volontairement minimal : tranche d'âge (pas de date de naissance),
 * ville/pays (pas d'adresse postale).
 */
export default function ProfileEdit() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<UserProfile>('/me/profile')
      .then((r) => setProfile(unwrap(r)))
      .catch(() => setProfile({ ageRange: null, city: null, country: null, expertise: null }));
  }, []);

  function set<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      unwrap(await apiPatch<UserProfile>('/me/profile', profile));
      router.back();
    } catch (err) {
      Alert.alert(t('watchEdit.saveErrorTitle'), apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 56 }]}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText type="title">{t('profile.myInfo')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {t('profileEdit.hint')}
        </ThemedText>

        <GlassCard style={styles.card}>
          <ThemedText type="smallBold">{t('profileEdit.expertise')}</ThemedText>
          <View style={styles.chips}>
            {EXPERTISE_KEYS.map((key) => (
              <Chip
                key={key}
                label={t(`labels.expertise.${key}`)}
                on={profile?.expertise === key}
                onPress={() => set('expertise', profile?.expertise === key ? null : key)}
              />
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.card}>
          <ThemedText type="smallBold">{t('profileEdit.ageRange')}</ThemedText>
          <View style={styles.chips}>
            {AGES.map((a) => (
              <Chip
                key={a}
                label={a}
                on={profile?.ageRange === a}
                onPress={() => set('ageRange', profile?.ageRange === a ? null : a)}
              />
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.card}>
          <ThemedText type="smallBold">{t('profileEdit.location')}</ThemedText>
          <TextInput
            style={styles.input}
            placeholder={t('profileEdit.cityPlaceholder')}
            placeholderTextColor={Brand.inkSecondary}
            value={profile?.city ?? ''}
            onChangeText={(v) => set('city', v)}
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            placeholder={t('profileEdit.countryPlaceholder')}
            placeholderTextColor={Brand.inkSecondary}
            value={profile?.country ?? ''}
            onChangeText={(v) => set('country', v)}
            autoCapitalize="words"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('profileEdit.locationHint')}
          </ThemedText>
        </GlassCard>

        <PrimaryButton
          label={saving ? t('watchEdit.saving') : t('common.save')}
          onPress={save}
          disabled={saving || !profile}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <ThemedText
        type="smallBold"
        themeColor={on ? undefined : 'textSecondary'}
        style={on ? styles.chipTextOn : undefined}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
  },
  content: {
    paddingHorizontal: Gutter,
    paddingBottom: 48,
    gap: Spacing.three,
  },
  hint: {
    lineHeight: 18,
  },
  card: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.field,
    borderWidth: 1,
    borderColor: 'rgba(27,37,49,0.14)',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  chipOn: {
    borderColor: Brand.accent,
    backgroundColor: Brand.accent,
  },
  chipTextOn: {
    color: '#ffffff',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(27,37,49,0.14)',
    borderRadius: Radii.field,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 15,
    color: Brand.ink,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});

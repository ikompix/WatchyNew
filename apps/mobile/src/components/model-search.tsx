import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { WatchModel } from '@watchy/types';

import { useWatchModelSearch } from '@/hooks/use-watch-models';
import { Brand, Fonts, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { WatchDial } from '@/components/watch-dial';
import { Image } from 'expo-image';

/**
 * Recherche catalogue + saisie libre — partagée entre l'ajout de montre
 * (fallback de add.tsx) et la wishlist. Le parent gère l'écran autour.
 */
export function ModelSearch({
  onSelectModel,
  onManualSubmit,
  submitLabel,
  busy,
}: {
  onSelectModel: (m: WatchModel) => void;
  onManualSubmit: (brand: string, model: string, reference: string) => void;
  submitLabel: string;
  busy: boolean;
}) {
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [reference, setReference] = useState('');
  const search = useWatchModelSearch(query);
  const suggestions = (search.data ?? []).slice(0, 4);

  if (manual) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.body}>
        <GlassCard style={styles.manualCard}>
          <TextInput
            style={styles.manualInput}
            placeholder="Marque *"
            placeholderTextColor={Brand.inkTertiary}
            value={brand}
            onChangeText={setBrand}
          />
          <View style={styles.manualDivider} />
          <TextInput
            style={styles.manualInput}
            placeholder="Modèle *"
            placeholderTextColor={Brand.inkTertiary}
            value={model}
            onChangeText={setModel}
          />
          <View style={styles.manualDivider} />
          <TextInput
            style={styles.manualInput}
            placeholder="Référence"
            placeholderTextColor={Brand.inkTertiary}
            value={reference}
            onChangeText={setReference}
            autoCapitalize="characters"
          />
        </GlassCard>
        <Pressable
          onPress={() => onManualSubmit(brand.trim(), model.trim(), reference.trim())}
          disabled={!brand.trim() || !model.trim() || busy}
          style={[styles.ctaWrap, (!brand.trim() || !model.trim()) && styles.ctaDisabled]}
        >
          <LinearGradient
            colors={[Brand.accentLight, Brand.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cta}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="link" style={styles.ctaText}>
                {submitLabel}
              </ThemedText>
            )}
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => setManual(false)} style={styles.manualLink} hitSlop={8}>
          <ThemedText type="link" themeColor="interactive">
            Revenir à la recherche
          </ThemedText>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.body}>
      <GlassCard style={styles.searchCard}>
        <SymbolView name="magnifyingglass" size={15} tintColor={Brand.inkTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Marque, modèle ou référence…"
          placeholderTextColor={Brand.inkTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoFocus
        />
      </GlassCard>

      {suggestions.length > 0 ? (
        <>
          <ThemedText type="overline" themeColor="textSecondary" style={styles.suggestionsLabel}>
            Suggestions de la base
          </ThemedText>
          {suggestions.map((m) => (
            <GlassCard key={m.id} style={styles.suggestionCard}>
              <Pressable
                style={styles.suggestionRow}
                onPress={() => onSelectModel(m)}
                disabled={busy}
              >
                {m.photoUrl ? (
                  <Image source={{ uri: m.photoUrl }} style={styles.suggestionPhoto} contentFit="cover" />
                ) : (
                  <WatchDial size={38} />
                )}
                <View style={styles.suggestionText}>
                  <ThemedText type="subtitle" style={styles.suggestionBrand}>
                    {m.brand}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {m.model}
                    {m.nickname ? ` “${m.nickname}”` : ''}
                    {m.reference ? ` · ${m.reference}` : ''}
                  </ThemedText>
                </View>
                <SymbolView name="chevron.right" size={13} tintColor={Brand.inkTertiary} />
              </Pressable>
            </GlassCard>
          ))}
        </>
      ) : query.trim().length >= 2 && !search.isLoading ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.noResult}>
          Aucun modèle trouvé
        </ThemedText>
      ) : null}

      <Pressable onPress={() => setManual(true)} style={styles.manualLink} hitSlop={8}>
        <ThemedText type="link" themeColor="interactive">
          Saisir manuellement
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

// Styles hérités du fallback historique de add.tsx — même rendu aux deux endroits
const styles = StyleSheet.create({
  body: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radii.field,
    paddingVertical: 0,
    paddingHorizontal: Spacing.three,
    height: 50,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Brand.ink,
  },
  suggestionsLabel: {
    marginTop: Spacing.two,
  },
  suggestionCard: {
    padding: 0,
    borderRadius: Radii.field,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + 4,
  },
  suggestionPhoto: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Brand.dialBorder,
  },
  suggestionText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  suggestionBrand: {
    fontSize: 15,
    lineHeight: 20,
  },
  noResult: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  manualLink: {
    alignSelf: 'center',
    marginTop: Spacing.three,
  },
  manualCard: {
    padding: 0,
    borderRadius: Radii.field,
  },
  manualInput: {
    height: 50,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Brand.ink,
  },
  manualDivider: {
    height: 1,
    backgroundColor: 'rgba(27,37,49,0.08)',
    marginHorizontal: Spacing.three,
  },
  ctaWrap: {
    borderRadius: Radii.button,
    shadowColor: Brand.accentDark,
    shadowOpacity: 0.35,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  cta: {
    height: 52,
    borderRadius: Radii.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 15,
  },
});

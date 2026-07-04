import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { CONDITION_LABELS, WATCH_CONDITIONS } from '@watchy/types';
import type { UpdateWatchDto, WatchCondition } from '@watchy/types';

import { useWatch, useUpdateWatch, useDeleteWatch } from '@/hooks/use-watches';
import { useMarketPrices } from '@/hooks/use-market-prices';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { CompletionBar } from '@/components/completion-bar';
import { ExpertReportCard } from '@/components/expert-report-card';
import { WatchDial } from '@/components/watch-dial';
import { DateField } from '@/components/date-field';

const euro = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);

export default function WatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: watch, isLoading } = useWatch(id);
  const updateWatch = useUpdateWatch();
  const deleteWatch = useDeleteWatch();
  const market = useMarketPrices(id);

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState({ brand: '', model: '', reference: '' });
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [colorDraft, setColorDraft] = useState('');
  const [yearOpen, setYearOpen] = useState(false);
  const [yearDraft, setYearDraft] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  if (isLoading || !watch) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ScreenBackground />
        <ActivityIndicator color={Brand.accent} />
      </View>
    );
  }

  // Chaque champ sauvegarde seul — complétion progressive, jamais bloquante
  function save(dto: UpdateWatchDto) {
    updateWatch.mutate({ id, dto }, { onError: (err) => Alert.alert('Erreur', err.message) });
  }

  function startIdentityEdit() {
    setIdentityDraft({
      brand: watch!.brand,
      model: watch!.model,
      reference: watch!.reference ?? '',
    });
    setEditingIdentity(true);
  }

  function saveIdentity() {
    if (!identityDraft.brand.trim() || !identityDraft.model.trim()) return;
    save({
      brand: identityDraft.brand.trim(),
      model: identityDraft.model.trim(),
      reference: identityDraft.reference.trim() || undefined,
    });
    setEditingIdentity(false);
  }

  function confirmDelete() {
    Alert.alert(
      'Supprimer cette montre ?',
      `${watch!.brand} ${watch!.model} sera retirée de votre collection. Cette action est définitive.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () =>
            deleteWatch.mutate(id, {
              // La fiche peut être la première route (arrivée par replace/reload)
              onSuccess: () =>
                router.canGoBack() ? router.back() : router.replace('/(app)/collection'),
              onError: (err) => Alert.alert('Erreur', err.message),
            }),
        },
      ]
    );
  }

  // Cote affichée : full set si papiers + boîte et cote full set connue
  const latest = market.data?.latest ?? null;
  const isFullSet = watch.hasPapers && watch.hasBox;
  const shownPrice =
    latest != null
      ? isFullSet && latest.fullSetPrice != null
        ? latest.fullSetPrice
        : latest.price
      : null;
  const trendPct = market.data?.trendPct ?? null;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <Stack.Screen
        options={{
          headerRight: () =>
            editingIdentity ? (
              <Pressable onPress={saveIdentity} hitSlop={8}>
                <ThemedText type="link" themeColor="interactive">
                  Enregistrer
                </ThemedText>
              </Pressable>
            ) : (
              <Pressable onPress={startIdentityEdit} hitSlop={8}>
                <ThemedText type="link" themeColor="interactive">
                  Modifier
                </ThemedText>
              </Pressable>
            ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.five }}
        showsVerticalScrollIndicator={false}
      >
        {/* Bandeau photo 238px */}
        <View style={styles.photoBand}>
          {watch.photoUrl ? (
            <Image source={{ uri: watch.photoUrl }} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={styles.dialHero}>
              <WatchDial size={132} />
            </View>
          )}
        </View>

        <View style={styles.content}>
          {/* Identité */}
          {editingIdentity ? (
            <GlassCard style={styles.identityCard}>
              <TextInput
                style={styles.identityInput}
                placeholder="Marque"
                placeholderTextColor={Brand.inkTertiary}
                value={identityDraft.brand}
                onChangeText={(v) => setIdentityDraft((p) => ({ ...p, brand: v }))}
              />
              <View style={styles.divider} />
              <TextInput
                style={styles.identityInput}
                placeholder="Modèle"
                placeholderTextColor={Brand.inkTertiary}
                value={identityDraft.model}
                onChangeText={(v) => setIdentityDraft((p) => ({ ...p, model: v }))}
              />
              <View style={styles.divider} />
              <TextInput
                style={styles.identityInput}
                placeholder="Référence"
                placeholderTextColor={Brand.inkTertiary}
                value={identityDraft.reference}
                onChangeText={(v) => setIdentityDraft((p) => ({ ...p, reference: v }))}
                autoCapitalize="characters"
              />
            </GlassCard>
          ) : (
            <View style={styles.titleBlock}>
              <ThemedText style={styles.brandTitle}>{watch.brand}</ThemedText>
              <View style={styles.modelRow}>
                <ThemedText type="default" themeColor="textSecondary">
                  {watch.model}
                </ThemedText>
                {watch.reference ? (
                  <ThemedText type="code"> · Réf. {watch.reference}</ThemedText>
                ) : null}
              </View>
            </View>
          )}

          {/* Complétion */}
          <CompletionBar value={watch.completionPct} />

          {/* Champs progressifs */}
          <GlassCard style={styles.fieldsCard}>
            {/* Date d'achat */}
            {watch.purchaseDate || dateOpen ? (
              <DateField
                label="Date d'achat"
                value={watch.purchaseDate ?? ''}
                onChange={(v) => {
                  save({ purchaseDate: v || undefined });
                  if (!v) setDateOpen(false);
                }}
              />
            ) : (
              <Pressable style={styles.fieldRow} onPress={() => setDateOpen(true)}>
                <ThemedText type="default" themeColor="textSecondary">
                  Date d'achat
                </ThemedText>
                <ThemedText type="link" themeColor="interactive">
                  + Ajouter
                </ThemedText>
              </Pressable>
            )}
            <View style={styles.divider} />

            {/* Prix d'achat */}
            {priceOpen ? (
              <View style={styles.fieldRow}>
                <ThemedText type="default" themeColor="textSecondary">
                  Prix d'achat
                </ThemedText>
                <View style={styles.priceEdit}>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0"
                    placeholderTextColor={Brand.inkTertiary}
                    value={priceDraft}
                    onChangeText={setPriceDraft}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  <ThemedText type="default" themeColor="textSecondary">
                    €
                  </ThemedText>
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      const n = Number(priceDraft.replace(',', '.'));
                      if (n > 0) save({ purchasePrice: n });
                      setPriceOpen(false);
                    }}
                  >
                    <SymbolView name="checkmark.circle.fill" size={22} tintColor={Brand.accent} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={styles.fieldRow}
                onPress={() => {
                  setPriceDraft(watch.purchasePrice != null ? String(watch.purchasePrice) : '');
                  setPriceOpen(true);
                }}
              >
                <ThemedText type="default" themeColor="textSecondary">
                  Prix d'achat
                </ThemedText>
                {watch.purchasePrice != null ? (
                  <ThemedText type="smallBold" style={styles.fieldValue}>
                    {euro(watch.purchasePrice)}
                  </ThemedText>
                ) : (
                  <ThemedText type="link" themeColor="interactive">
                    + Ajouter
                  </ThemedText>
                )}
              </Pressable>
            )}
            <View style={styles.divider} />

            {/* Papiers */}
            <View style={styles.fieldRow}>
              <ThemedText type="default" themeColor="textSecondary">
                Papiers
              </ThemedText>
              <Switch
                value={watch.hasPapers}
                onValueChange={(v) => save({ hasPapers: v })}
                trackColor={{ false: 'rgba(27,37,49,0.12)', true: Brand.accent }}
                thumbColor="#ffffff"
              />
            </View>
            <View style={styles.divider} />

            {/* Boîte */}
            <View style={styles.fieldRow}>
              <ThemedText type="default" themeColor="textSecondary">
                Boîte d'origine
              </ThemedText>
              <Switch
                value={watch.hasBox}
                onValueChange={(v) => save({ hasBox: v })}
                trackColor={{ false: 'rgba(27,37,49,0.12)', true: Brand.accent }}
                thumbColor="#ffffff"
              />
            </View>
            <View style={styles.divider} />

            {/* Couleur du cadran — critère de prix majeur, alimente la cote variante */}
            {colorOpen ? (
              <View style={styles.fieldRow}>
                <ThemedText type="default" themeColor="textSecondary">
                  Couleur du cadran
                </ThemedText>
                <View style={styles.priceEdit}>
                  <TextInput
                    style={styles.textEdit}
                    placeholder="ex. vert menthe"
                    placeholderTextColor={Brand.inkTertiary}
                    value={colorDraft}
                    onChangeText={setColorDraft}
                    autoFocus
                  />
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      const v = colorDraft.trim();
                      save({ dialColor: v || undefined });
                      setColorOpen(false);
                    }}
                  >
                    <SymbolView name="checkmark.circle.fill" size={22} tintColor={Brand.accent} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={styles.fieldRow}
                onPress={() => {
                  setColorDraft(watch.dialColor ?? '');
                  setColorOpen(true);
                }}
              >
                <ThemedText type="default" themeColor="textSecondary">
                  Couleur du cadran
                </ThemedText>
                {watch.dialColor ? (
                  <ThemedText type="smallBold" style={styles.fieldValue}>
                    {watch.dialColor}
                  </ThemedText>
                ) : (
                  <ThemedText type="link" themeColor="interactive">
                    + Ajouter
                  </ThemedText>
                )}
              </Pressable>
            )}
            <View style={styles.divider} />

            {/* Année */}
            {yearOpen ? (
              <View style={styles.fieldRow}>
                <ThemedText type="default" themeColor="textSecondary">
                  Année
                </ThemedText>
                <View style={styles.priceEdit}>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="2021"
                    placeholderTextColor={Brand.inkTertiary}
                    value={yearDraft}
                    onChangeText={setYearDraft}
                    keyboardType="number-pad"
                    maxLength={4}
                    autoFocus
                  />
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      const n = Number(yearDraft);
                      if (n >= 1900 && n <= new Date().getFullYear()) save({ productionYear: n });
                      setYearOpen(false);
                    }}
                  >
                    <SymbolView name="checkmark.circle.fill" size={22} tintColor={Brand.accent} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={styles.fieldRow}
                onPress={() => {
                  setYearDraft(watch.productionYear != null ? String(watch.productionYear) : '');
                  setYearOpen(true);
                }}
              >
                <ThemedText type="default" themeColor="textSecondary">
                  Année
                </ThemedText>
                {watch.productionYear != null ? (
                  <ThemedText type="smallBold" style={styles.fieldValue}>
                    {watch.productionYear}
                  </ThemedText>
                ) : (
                  <ThemedText type="link" themeColor="interactive">
                    + Ajouter
                  </ThemedText>
                )}
              </Pressable>
            )}
            <View style={styles.divider} />

            {/* État */}
            <View style={styles.fieldRowTall}>
              <ThemedText type="default" themeColor="textSecondary">
                État
              </ThemedText>
              <View style={styles.chipsRow}>
                {WATCH_CONDITIONS.map((cond) => {
                  const active = watch.condition === cond;
                  return (
                    <Pressable
                      key={cond}
                      onPress={() => save({ condition: active ? undefined : cond })}
                      style={[styles.chip, active && styles.chipActive]}
                      hitSlop={4}
                    >
                      <ThemedText
                        type="small"
                        style={active ? styles.chipTextActive : styles.chipText}
                      >
                        {CONDITION_LABELS[cond as WatchCondition]}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.divider} />

            {/* Notes */}
            {notesOpen ? (
              <View style={styles.notesEdit}>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Notes (historique, révision, particularités…)"
                  placeholderTextColor={Brand.inkTertiary}
                  value={notesDraft}
                  onChangeText={setNotesDraft}
                  multiline
                  autoFocus
                />
                <Pressable
                  hitSlop={8}
                  style={styles.notesConfirm}
                  onPress={() => {
                    save({ notes: notesDraft.trim() || undefined });
                    setNotesOpen(false);
                  }}
                >
                  <SymbolView name="checkmark.circle.fill" size={22} tintColor={Brand.accent} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.fieldRow}
                onPress={() => {
                  setNotesDraft(watch.notes ?? '');
                  setNotesOpen(true);
                }}
              >
                <ThemedText type="default" themeColor="textSecondary">
                  Notes
                </ThemedText>
                {watch.notes ? (
                  <ThemedText
                    type="small"
                    style={styles.notesPreview}
                    numberOfLines={1}
                  >
                    {watch.notes}
                  </ThemedText>
                ) : (
                  <ThemedText type="link" themeColor="interactive">
                    + Ajouter
                  </ThemedText>
                )}
              </Pressable>
            )}
          </GlassCard>

          {/* Bandeau cote → détail */}
          {watch.watchModelId ? (
            <GlassCard glow style={styles.coteCard}>
              <Pressable
                style={styles.coteRow}
                onPress={() => router.push(`/watch/${id}/market`)}
                disabled={shownPrice == null}
              >
                <View style={styles.coteText}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Cote actuelle{isFullSet && latest?.fullSetPrice != null ? ' · full set' : ''}
                  </ThemedText>
                  <View style={styles.coteValueRow}>
                    <ThemedText type="hero" style={styles.coteValue}>
                      {market.isLoading ? '…' : shownPrice != null ? euro(shownPrice) : '—'}
                    </ThemedText>
                    {trendPct != null ? (
                      <ThemedText
                        type="link"
                        themeColor={trendPct >= 0 ? 'positive' : 'negative'}
                        style={styles.coteDelta}
                      >
                        {trendPct >= 0 ? '+' : '−'}
                        {Math.abs(trendPct).toFixed(1)}%
                      </ThemedText>
                    ) : null}
                  </View>
                  {shownPrice == null && !market.isLoading ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Recherche de cote en cours — revenez un peu plus tard.
                    </ThemedText>
                  ) : null}
                </View>
                {shownPrice != null ? (
                  <SymbolView name="chevron.right" size={14} tintColor={Brand.inkTertiary} />
                ) : null}
              </Pressable>
            </GlassCard>
          ) : (
            <GlassCard style={styles.coteCard}>
              <ThemedText type="small" themeColor="textSecondary">
                Reliez cette montre à un modèle du catalogue pour suivre sa cote.
              </ThemedText>
            </GlassCard>
          )}

          {/* Rapport d'expert IA (premium) */}
          <ExpertReportCard watchId={id} />

          {/* Suppression */}
          <Pressable
            onPress={confirmDelete}
            disabled={deleteWatch.isPending}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
          >
            {deleteWatch.isPending ? (
              <ActivityIndicator color={Brand.negative} size="small" />
            ) : (
              <ThemedText type="link" themeColor="negative">
                Supprimer de ma collection
              </ThemedText>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoBand: {
    height: 238,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  dialHero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: Gutter,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  titleBlock: {
    gap: 3,
  },
  brandTitle: {
    fontFamily: Fonts?.bold ?? 'SpaceGrotesk_700Bold',
    fontSize: 23,
    lineHeight: 28,
    color: Brand.ink,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  identityCard: {
    padding: 0,
    borderRadius: Radii.field,
  },
  identityInput: {
    height: 48,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Brand.ink,
  },
  fieldsCard: {
    padding: 0,
    borderRadius: Radii.card,
  },
  fieldRow: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  fieldValue: {
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(27,37,49,0.06)',
    marginHorizontal: Spacing.three,
  },
  priceEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  textEdit: {
    minWidth: 120,
    textAlign: 'right',
    fontFamily: Fonts?.medium ?? 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: Brand.ink,
    paddingVertical: Spacing.two,
  },
  fieldRowTall: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    flexShrink: 1,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(27,37,49,0.14)',
  },
  chipActive: {
    borderColor: Brand.accent,
    backgroundColor: 'rgba(91,127,166,0.12)',
  },
  chipText: {
    color: Brand.inkSecondary,
  },
  chipTextActive: {
    color: Brand.accentDark,
  },
  notesEdit: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  notesInput: {
    flex: 1,
    minHeight: 64,
    fontFamily: Fonts?.regular ?? 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Brand.ink,
    textAlignVertical: 'top',
  },
  notesConfirm: {
    paddingBottom: 2,
  },
  notesPreview: {
    flexShrink: 1,
    textAlign: 'right',
    color: Brand.inkSecondary,
  },
  priceInput: {
    minWidth: 80,
    textAlign: 'right',
    fontFamily: Fonts?.semibold ?? 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    color: Brand.ink,
    paddingVertical: Spacing.two,
  },
  coteCard: {
    borderRadius: Radii.card,
  },
  coteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  coteText: {
    flex: 1,
    gap: 3,
  },
  coteValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  coteValue: {
    fontSize: 26,
    lineHeight: 31,
  },
  coteDelta: {
    marginBottom: 2,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  deletePressed: {
    opacity: 0.6,
  },
});

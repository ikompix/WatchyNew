import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { useWatch, useDeleteWatch } from '@/hooks/use-watches';
import { useMarketPrices } from '@/hooks/use-market-prices';
import { apiErrorMessage } from '@/lib/premium-gate';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { formatCurrency, formatDate } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { CompletionBar } from '@/components/completion-bar';
import { WatchDial } from '@/components/watch-dial';

const euro = formatCurrency;

const longDate = (iso: string) =>
  formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });

function FieldRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.fieldRow}>
      <ThemedText type="default" themeColor="textSecondary">
        {label}
      </ThemedText>
      {value ? (
        <ThemedText type="smallBold" style={styles.fieldValue}>
          {value}
        </ThemedText>
      ) : (
        <ThemedText type="default" themeColor="textSecondary">
          —
        </ThemedText>
      )}
    </View>
  );
}

export default function WatchDetail() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: watch, isLoading, isError, error } = useWatch(id);
  const deleteWatch = useDeleteWatch();
  const market = useMarketPrices(id);

  // 403 possible : montre verrouillée (free au-delà du quota) — pas de spinner infini
  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ScreenBackground />
        <ThemedText type="default" themeColor="textSecondary" style={styles.errorText}>
          {apiErrorMessage(error)}
        </ThemedText>
        <Pressable onPress={() => router.push('/paywall')} hitSlop={8}>
          <ThemedText type="link" themeColor="interactive">
            {t('premiumGate.seePremium')}
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  if (isLoading || !watch) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ScreenBackground />
        <ActivityIndicator color={Brand.accent} />
      </View>
    );
  }

  function confirmDelete() {
    Alert.alert(
      t('collection.deleteConfirmTitle'),
      t('collection.deleteConfirmMessage', { brand: watch!.brand, model: watch!.model }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            deleteWatch.mutate(id, {
              // La fiche peut être la première route (arrivée par replace/reload)
              onSuccess: () =>
                router.canGoBack() ? router.back() : router.replace('/(app)/collection'),
              onError: (err) => Alert.alert(t('common.errorTitle'), apiErrorMessage(err)),
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
          headerRight: () => (
            <Pressable onPress={() => router.push(`/watch/${id}/edit`)} hitSlop={8}>
              <ThemedText type="link" themeColor="interactive">
                {t('watchDetail.edit')}
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
          <View style={styles.titleBlock}>
            <ThemedText style={styles.brandTitle}>{watch.brand}</ThemedText>
            <View style={styles.modelRow}>
              <ThemedText type="default" themeColor="textSecondary">
                {watch.model}
                {watch.nickname ? ` “${watch.nickname}”` : ''}
              </ThemedText>
              {watch.reference ? (
                <ThemedText type="code"> · {t('addWatch.reference', { reference: watch.reference })}</ThemedText>
              ) : null}
            </View>
          </View>

          {/* Complétion */}
          <CompletionBar value={watch.completionPct} />

          {/* Champs — lecture seule, tout se modifie via la page Modifier */}
          <GlassCard style={styles.fieldsCard}>
            <FieldRow
              label={t('watchDetail.purchaseDate')}
              value={watch.purchaseDate ? longDate(watch.purchaseDate) : null}
            />
            <View style={styles.divider} />
            <FieldRow
              label={t('watchDetail.purchasePrice')}
              value={watch.purchasePrice != null ? euro(watch.purchasePrice) : null}
            />
            <View style={styles.divider} />
            <FieldRow
              label={t('watchDetail.papers')}
              value={watch.hasPapers ? t('common.yes') : t('common.no')}
            />
            <View style={styles.divider} />
            <FieldRow
              label={t('watchDetail.box')}
              value={watch.hasBox ? t('common.yes') : t('common.no')}
            />
            <View style={styles.divider} />
            <FieldRow label={t('watchDetail.dialColor')} value={watch.dialColor ?? null} />
            <View style={styles.divider} />
            <FieldRow
              label={t('watchDetail.year')}
              value={watch.productionYear != null ? String(watch.productionYear) : null}
            />
            <View style={styles.divider} />
            <FieldRow
              label={t('watchDetail.condition')}
              value={watch.condition ? t(`labels.conditions.${watch.condition}`) : null}
            />
            <View style={styles.divider} />
            {watch.notes ? (
              <View style={styles.notesBlock}>
                <ThemedText type="default" themeColor="textSecondary">
                  {t('watchDetail.notes')}
                </ThemedText>
                <ThemedText type="small" style={styles.notesText}>
                  {watch.notes}
                </ThemedText>
              </View>
            ) : (
              <FieldRow label={t('watchDetail.notes')} value={null} />
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
                    {t('watchDetail.currentValue')}
                    {isFullSet && latest?.fullSetPrice != null ? ' · full set' : ''}
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
                      {t('watchDetail.valuePending')}
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
                {t('watchDetail.linkModelHint')}
              </ThemedText>
            </GlassCard>
          )}

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
                {t('watchDetail.deleteFromCollection')}
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
    gap: Spacing.three,
    paddingHorizontal: Gutter,
  },
  errorText: {
    textAlign: 'center',
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
    flexShrink: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(27,37,49,0.06)',
    marginHorizontal: Spacing.three,
  },
  notesBlock: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    gap: 4,
  },
  notesText: {
    color: Brand.inkSecondary,
    lineHeight: 19,
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

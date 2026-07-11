import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import type { Watch } from '@watchy/types';

import { useWatches, useDeleteWatch } from '@/hooks/use-watches';
import { useCollectionMarket, type WatchValuation } from '@/hooks/use-collection-market';
import { useMe } from '@/hooks/use-entitlement';
import { usePortfolio } from '@/hooks/use-portfolio';
import { Brand, Gutter, Spacing } from '@/constants/theme';
import { apiErrorMessage } from '@/lib/premium-gate';
import { useT } from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { Sparkline } from '@/components/sparkline';
import { SegmentedText } from '@/components/segmented-text';
import { WatchDial } from '@/components/watch-dial';

const euro = formatCurrency;

const SORTS = ['value', 'recent'] as const;
type Sort = (typeof SORTS)[number];

function WatchRow({
  watch,
  valuation,
  onPress,
  last,
}: {
  watch: Watch;
  valuation: WatchValuation | undefined;
  onPress: () => void;
  last: boolean;
}) {
  const deltaPct = valuation?.deltaPct ?? null;
  const deltaColor = deltaPct != null && deltaPct < 0 ? 'negative' : 'positive';
  const locked = watch.locked === true;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}
    >
      {watch.photoUrl ? (
        <Image
          source={{ uri: watch.photoUrl }}
          style={[styles.rowPhoto, locked && styles.lockedDim]}
          contentFit="cover"
          blurRadius={locked ? 8 : 0}
        />
      ) : (
        <View style={locked ? styles.lockedDim : undefined}>
          <WatchDial size={44} />
        </View>
      )}
      <View style={[styles.rowText, locked && styles.lockedDim]}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.rowBrand}>
          {watch.brand}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {watch.model}
          {watch.nickname ? ` “${watch.nickname}”` : ''}
        </ThemedText>
      </View>
      {locked ? (
        <SymbolView name="lock.fill" size={15} tintColor={Brand.inkTertiary} />
      ) : valuation && valuation.series.length > 1 ? (
        <Sparkline values={valuation.series} width={40} height={20} />
      ) : (
        <View style={styles.sparkPlaceholder} />
      )}
      <View style={styles.rowRight}>
        {locked ? (
          <ThemedText type="smallBold" themeColor="textSecondary">
            ••• ••€
          </ThemedText>
        ) : (
          <>
            <ThemedText type="smallBold">
              {valuation?.value != null ? euro(valuation.value) : '—'}
            </ThemedText>
            {deltaPct != null ? (
              <ThemedText type="delta" themeColor={deltaColor}>
                {deltaPct >= 0 ? '+' : '−'}
                {Math.abs(deltaPct).toFixed(1)}%
              </ThemedText>
            ) : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

export default function Collection() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: watches, isLoading, isError, refetch, isRefetching } = useWatches();
  const deleteWatch = useDeleteWatch();
  const market = useCollectionMarket(watches);
  const [sort, setSort] = useState<Sort>('value');
  const { data: me } = useMe();
  const isPremium = me?.plan === 'premium';
  const portfolio = usePortfolio(isPremium);
  // Teaser seulement quand le plan free est confirmé — pas de flash pendant le chargement
  const gated = me != null && !isPremium;
  const totalGain = portfolio.data?.totalGain ?? null;

  const count = watches?.length ?? 0;
  const sorted = [...(watches ?? [])].sort((a, b) => {
    if (sort === 'value') {
      return (market.byWatchId[b.id]?.value ?? 0) - (market.byWatchId[a.id]?.value ?? 0);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const deltaUp = (market.totalDeltaPct ?? 0) >= 0;

  // Élément verrouillé (free au-delà du quota) : pas d'accès à la fiche —
  // repasser Premium ou libérer un emplacement
  function openLocked(watch: Watch) {
    Alert.alert(t('collection.lockedTitle'), t('collection.lockedMessage'), [
      { text: t('premiumGate.seePremium'), onPress: () => router.push('/paywall') },
      {
        text: t('collection.deleteEllipsis'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            t('collection.deleteConfirmTitle'),
            t('collection.deleteConfirmMessage', { brand: watch.brand, model: watch.model }),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('common.delete'),
                style: 'destructive',
                onPress: () =>
                  deleteWatch.mutate(watch.id, {
                    onError: (err) => Alert.alert(t('common.errorTitle'), apiErrorMessage(err)),
                  }),
              },
            ]
          ),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function Header() {
    return (
      <View>
        <View style={styles.titleRow}>
          <ThemedText type="title">{t('collection.title')}</ThemedText>
          <View style={styles.headerIcons}>
            <Pressable onPress={() => router.push('/(app)/community')} hitSlop={8} style={styles.profileButton}>
              <SymbolView name="bubble.left.and.bubble.right" size={23} tintColor={Brand.inkSecondary} />
            </Pressable>
            <Pressable onPress={() => router.push('/(app)/wishlist')} hitSlop={8} style={styles.profileButton}>
              <SymbolView name="heart" size={24} tintColor={Brand.inkSecondary} />
            </Pressable>
            <Pressable onPress={() => router.push('/(app)/profile')} hitSlop={8} style={styles.profileButton}>
              <SymbolView name="person.crop.circle" size={26} tintColor={Brand.inkSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Carte valeur totale — teaser verrouillé en free, dashboard patrimonial en premium */}
        {gated ? (
          <Pressable onPress={() => router.push('/paywall')}>
            <GlassCard glow style={styles.totalCard}>
              <View style={styles.teaserTitleRow}>
                <SymbolView name="lock.fill" size={13} tintColor={Brand.accent} />
                <ThemedText type="small" themeColor="textSecondary">
                  {t('collection.teaserTitle', { used: me!.slotsUsed, limit: me!.slotsLimit })}
                </ThemedText>
              </View>
              <ThemedText type="hero" style={styles.teaserValue}>
                ••• ••• €
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('collection.teaserSubtitle')}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="interactive">
                {t('collection.teaserCta')}
              </ThemedText>
            </GlassCard>
          </Pressable>
        ) : (
          <GlassCard glow style={styles.totalCard}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('collection.totalValue', { count })}
            </ThemedText>
            <View style={styles.totalRow}>
              <ThemedText type="hero">{euro(market.totalValue)}</ThemedText>
              {market.totalDeltaPct != null ? (
                <ThemedText
                  type="link"
                  themeColor={deltaUp ? 'positive' : 'negative'}
                  style={styles.totalDelta}
                >
                  {deltaUp ? '▲' : '▼'} {deltaUp ? '+' : '−'}
                  {Math.abs(market.totalDeltaPct).toFixed(1)}%
                </ThemedText>
              ) : null}
            </View>
            {totalGain != null ? (
              <ThemedText type="small" themeColor={totalGain >= 0 ? 'positive' : 'negative'}>
                {totalGain >= 0 ? '+' : '−'}
                {t('collection.sincePurchase', { amount: euro(Math.abs(totalGain)) })}
              </ThemedText>
            ) : null}
            {market.totalSeries.length > 1 ? (
              <View style={styles.totalSpark}>
                <Sparkline
                  values={market.totalSeries}
                  width={252}
                  height={44}
                  color={Brand.accent}
                  strokeWidth={1.8}
                  area
                />
              </View>
            ) : null}
          </GlassCard>
        )}

        {/* Tri */}
        <View style={styles.segmentedWrap}>
          <SegmentedText
            options={SORTS}
            value={sort}
            onChange={setSort}
            labels={{ value: t('collection.sortByValue'), recent: t('collection.sortRecent') }}
          />
        </View>
      </View>
    );
  }

  function Empty() {
    if (isLoading || market.isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={Brand.accent} />
        </View>
      );
    }
    if (isError) {
      return (
        <View style={styles.emptyContainer}>
          <WatchDial size={64} />
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            {t('collection.errorTitle')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtitle}>
            {t('collection.errorSubtitle')}
          </ThemedText>
          <Pressable style={styles.emptyButtonWrap} onPress={() => refetch()}>
            <LinearGradient
              colors={[Brand.accentLight, Brand.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.emptyButton}
            >
              <ThemedText type="link" style={styles.emptyButtonText}>
                {t('common.retry')}
              </ThemedText>
            </LinearGradient>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <WatchDial size={64} />
        <ThemedText type="subtitle" style={styles.emptyTitle}>
          {t('collection.emptyTitle')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubtitle}>
          {t('collection.emptySubtitle')}
        </ThemedText>
        <Pressable style={styles.emptyButtonWrap} onPress={() => router.push('/watch/add')}>
          <LinearGradient
            colors={[Brand.accentLight, Brand.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.emptyButton}
          >
            <ThemedText type="link" style={styles.emptyButtonText}>
              {t('collection.addWatch')}
            </ThemedText>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <WatchRow
            watch={item}
            valuation={market.byWatchId[item.id]}
            onPress={() => (item.locked ? openLocked(item) : router.push(`/watch/${item.id}`))}
            last={index === sorted.length - 1}
          />
        )}
        ListHeaderComponent={Header}
        ListEmptyComponent={Empty}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + Spacing.two, paddingBottom: 120 },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Brand.accent} />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB capture — Ø58, dégradé accent */}
      <Animated.View
        entering={FadeIn.duration(400)}
        style={[styles.fab, { bottom: insets.bottom + Spacing.four }]}
      >
        <Pressable onPress={() => router.push('/watch/add')}>
          <LinearGradient
            colors={[Brand.accentLight, Brand.accentDark]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.fabButton}
          >
            <SymbolView name="camera.fill" size={22} tintColor="#ffffff" />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
  },
  listContent: {
    paddingHorizontal: Gutter,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  profileButton: {
    padding: 2,
  },
  totalCard: {
    gap: Spacing.two,
  },
  teaserTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teaserValue: {
    color: Brand.inkSecondary,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  totalDelta: {
    marginBottom: 3,
  },
  totalSpark: {
    marginTop: Spacing.one,
  },
  segmentedWrap: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 11,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(22,24,43,0.06)',
  },
  rowPressed: {
    opacity: 0.6,
  },
  lockedDim: {
    opacity: 0.45,
  },
  rowPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Brand.dialBorder,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowBrand: {
    fontSize: 14,
  },
  sparkPlaceholder: {
    width: 40,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 64,
    gap: Spacing.two,
  },
  emptyTitle: {
    marginTop: Spacing.three,
  },
  emptySubtitle: {
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyButtonWrap: {
    marginTop: Spacing.three,
    borderRadius: 16,
    shadowColor: Brand.accentDark,
    shadowOpacity: 0.35,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  emptyButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: 14,
    borderRadius: 16,
  },
  emptyButtonText: {
    color: '#ffffff',
  },
  fab: {
    position: 'absolute',
    right: Gutter,
  },
  fabButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgb(74,111,151)',
    shadowOpacity: 0.45,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
});

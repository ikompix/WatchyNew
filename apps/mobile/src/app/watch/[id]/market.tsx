import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWatch } from '@/hooks/use-watches';
import { useMarketPrices } from '@/hooks/use-market-prices';
import { Brand, CardGap, Gutter, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { formatCurrency, formatDate } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { Sparkline } from '@/components/sparkline';
import { SegmentedText } from '@/components/segmented-text';

const euro = (value: number, signed = false) =>
  formatCurrency(value, signed ? { signDisplay: 'always' } : undefined);

const PERIODS = ['1M', '6M', '1A', 'MAX'] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_DAYS: Record<Period, number | null> = {
  '1M': 30,
  '6M': 182,
  '1A': 365,
  MAX: null,
};

export default function MarketDetail() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: watch } = useWatch(id);
  const market = useMarketPrices(id);
  const [period, setPeriod] = useState<Period | null>(null);
  // Instant de référence figé au montage : les coupures de période restent
  // stables d'un rendu à l'autre
  const [now] = useState(() => Date.now());

  if (!watch || market.isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ScreenBackground />
        <ActivityIndicator color={Brand.accent} />
      </View>
    );
  }

  // history : du plus récent au plus ancien → chronologique
  const chronological = [...(market.data?.history ?? [])].reverse();
  const pointsFor = (p: Period) => {
    const days = PERIOD_DAYS[p];
    const cutoff = days != null ? now - days * 24 * 60 * 60 * 1000 : 0;
    return chronological.filter((pt) => new Date(pt.fetchedAt).getTime() >= cutoff);
  };

  // Sélecteur honnête : une période est inutilisable si < 2 points, ou si elle
  // montre exactement la même chose qu'une période plus courte déjà utilisable
  const usable: Period[] = [];
  for (const p of PERIODS) {
    const count = pointsFor(p).length;
    if (count < 2) continue;
    const prev = usable[usable.length - 1];
    if (prev && pointsFor(prev).length === count) continue;
    usable.push(p);
  }
  const disabledPeriods = PERIODS.filter((p) => !usable.includes(p));
  const activePeriod = period && usable.includes(period) ? period : (usable[0] ?? 'MAX');

  const points = pointsFor(activePeriod);
  const values = points.map((p) => p.price);
  const historySince = chronological[0] ? formatDate(chronological[0].fetchedAt) : null;

  const latest = market.data?.latest ?? null;
  const first = values[0] ?? null;
  const deltaPct =
    latest != null && first != null && first > 0 && values.length > 1
      ? ((latest.price - first) / first) * 100
      : null;
  const deltaUp = (deltaPct ?? 0) >= 0;

  const plusValue =
    latest != null && watch.purchasePrice != null ? latest.price - watch.purchasePrice : null;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + Spacing.five },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identité */}
        <View style={styles.titleBlock}>
          <ThemedText type="subtitle">{watch.brand}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {watch.model}
            {watch.nickname ? ` “${watch.nickname}”` : ''}
            {watch.reference ? ` · ${watch.reference}` : ''}
          </ThemedText>
        </View>

        {/* Hero cote */}
        <View style={styles.heroBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('market.heroLabel')}
          </ThemedText>
          <View style={styles.heroRow}>
            <ThemedText type="hero" style={styles.heroValue}>
              {latest != null ? euro(latest.price) : '—'}
            </ThemedText>
            {deltaPct != null ? (
              <ThemedText
                type="link"
                themeColor={deltaUp ? 'positive' : 'negative'}
                style={styles.heroDelta}
              >
                {deltaUp ? '▲' : '▼'} {deltaUp ? '+' : '−'}
                {Math.abs(deltaPct).toFixed(1)}%
              </ThemedText>
            ) : null}
          </View>
          {plusValue != null ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('collection.sincePurchase', { amount: euro(plusValue, true) })}
              {watch.purchaseDate
                ? ` · ${t('market.sinceYear', { year: watch.purchaseDate.slice(0, 4) })}`
                : ''}
            </ThemedText>
          ) : null}
        </View>

        {/* Graphique */}
        <GlassCard glow style={styles.chartCard}>
          {values.length > 1 ? (
            <Sparkline
              values={values}
              width={280}
              height={140}
              color={Brand.accent}
              strokeWidth={2}
              area
              endDot
            />
          ) : (
            <View style={styles.chartEmpty}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.chartEmptyText}>
                {t('market.chartEmpty')}
              </ThemedText>
            </View>
          )}
          <View style={styles.periodWrap}>
            <SegmentedText
              options={PERIODS}
              value={activePeriod}
              onChange={setPeriod}
              disabledOptions={disabledPeriods}
              labels={{ '1A': t('market.periodYear') }}
            />
          </View>
          {historySince && values.length > 1 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.historyNote}>
              {t('market.historySince', { date: historySince })}
            </ThemedText>
          ) : null}
        </GlassCard>

        {/* Mini-cartes */}
        <View style={styles.miniRow}>
          <GlassCard style={styles.miniCard}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('watchDetail.purchasePrice')}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.miniValue}>
              {watch.purchasePrice != null ? euro(watch.purchasePrice) : '—'}
            </ThemedText>
          </GlassCard>
          <GlassCard style={styles.miniCard}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('market.capitalGain')}
            </ThemedText>
            <ThemedText
              type="smallBold"
              themeColor={plusValue != null && plusValue < 0 ? 'negative' : 'positive'}
              style={styles.miniValue}
            >
              {plusValue != null ? euro(plusValue, true) : '—'}
            </ThemedText>
          </GlassCard>
        </View>

        {/* Full set si connu */}
        {latest?.fullSetPrice != null ? (
          <GlassCard style={styles.fullSetCard}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('market.fullSet')}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.miniValue}>
              {euro(latest.fullSetPrice)}
            </ThemedText>
          </GlassCard>
        ) : null}

        {latest?.source ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.sourceNote}>
            {t('market.source', { source: latest.source.replace(/^web:/, '') })} ·{' '}
            {formatDate(latest.fetchedAt)}
          </ThemedText>
        ) : null}

        <ThemedText type="delta" themeColor="textSecondary" style={styles.sourceNote}>
          {t('market.aiDisclaimer')}
        </ThemedText>
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
  content: {
    paddingHorizontal: Gutter,
    gap: Spacing.three,
  },
  titleBlock: {
    gap: 2,
  },
  heroBlock: {
    gap: 4,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  heroValue: {
    fontSize: 38,
    lineHeight: 44,
  },
  heroDelta: {
    marginBottom: 5,
  },
  chartCard: {
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radii.card,
  },
  chartEmpty: {
    height: 140,
    justifyContent: 'center',
  },
  chartEmptyText: {
    textAlign: 'center',
    lineHeight: 18,
  },
  periodWrap: {
    alignSelf: 'center',
  },
  historyNote: {
    textAlign: 'center',
    lineHeight: 16,
    fontSize: 11,
  },
  miniRow: {
    flexDirection: 'row',
    gap: CardGap,
  },
  miniCard: {
    flex: 1,
    gap: Spacing.one,
    borderRadius: Radii.field,
  },
  miniValue: {
    fontSize: 15,
  },
  fullSetCard: {
    gap: Spacing.one,
    borderRadius: Radii.field,
  },
  sourceNote: {
    textAlign: 'center',
  },
});

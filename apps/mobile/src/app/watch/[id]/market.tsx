import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWatch } from '@/hooks/use-watches';
import { useMarketPrices } from '@/hooks/use-market-prices';
import { Brand, CardGap, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { Sparkline } from '@/components/sparkline';
import { SegmentedText } from '@/components/segmented-text';

const euro = (value: number, signed = false) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    ...(signed ? { signDisplay: 'always' as const } : null),
  }).format(value);

const PERIODS = ['1M', '6M', '1A', 'MAX'] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_DAYS: Record<Period, number | null> = {
  '1M': 30,
  '6M': 182,
  '1A': 365,
  MAX: null,
};

export default function MarketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: watch } = useWatch(id);
  const market = useMarketPrices(id);
  const [period, setPeriod] = useState<Period | null>(null);

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
    const cutoff = days != null ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
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
  const historySince = chronological[0]
    ? new Date(chronological[0].fetchedAt).toLocaleDateString('fr-FR')
    : null;

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
            {watch.reference ? ` · ${watch.reference}` : ''}
          </ThemedText>
        </View>

        {/* Hero cote */}
        <View style={styles.heroBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            Cote de marché · aujourd'hui
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
              {euro(plusValue, true)} depuis l'achat
              {watch.purchaseDate ? ` · depuis ${watch.purchaseDate.slice(0, 4)}` : ''}
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
                Pas encore assez d'historique.{'\n'}La cote s'enrichit à chaque mise à jour.
              </ThemedText>
            </View>
          )}
          <View style={styles.periodWrap}>
            <SegmentedText
              options={PERIODS}
              value={activePeriod}
              onChange={setPeriod}
              disabledOptions={disabledPeriods}
            />
          </View>
          {historySince && values.length > 1 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.historyNote}>
              Historique depuis le {historySince} — il s'étoffe à chaque mise à jour de cote.
            </ThemedText>
          ) : null}
        </GlassCard>

        {/* Mini-cartes */}
        <View style={styles.miniRow}>
          <GlassCard style={styles.miniCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Prix d'achat
            </ThemedText>
            <ThemedText type="smallBold" style={styles.miniValue}>
              {watch.purchasePrice != null ? euro(watch.purchasePrice) : '—'}
            </ThemedText>
          </GlassCard>
          <GlassCard style={styles.miniCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Plus-value
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
              Cote full set (boîte + papiers)
            </ThemedText>
            <ThemedText type="smallBold" style={styles.miniValue}>
              {euro(latest.fullSetPrice)}
            </ThemedText>
          </GlassCard>
        ) : null}

        {latest?.source ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.sourceNote}>
            Source : {latest.source.replace(/^web:/, '')} ·{' '}
            {new Date(latest.fetchedAt).toLocaleDateString('fr-FR')}
          </ThemedText>
        ) : null}
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

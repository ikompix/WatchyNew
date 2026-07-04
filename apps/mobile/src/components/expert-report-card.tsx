import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useMe } from '@/hooks/use-entitlement';
import { useExpertReport, useGenerateExpertReport } from '@/hooks/use-expert-report';
import { Brand, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';

/**
 * Rendu léger du markdown contrôlé du rapport (titres ## + paragraphes) —
 * le format est imposé par le prompt serveur, pas besoin d'une lib markdown.
 */
function ReportBody({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <View style={styles.body}>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        // Un bloc peut contenir un titre suivi de son paragraphe
        const lines = trimmed.split('\n');
        if (lines[0].startsWith('## ') && lines.length === 1) {
          return (
            <ThemedText key={i} type="smallBold" style={styles.heading}>
              {lines[0].slice(3)}
            </ThemedText>
          );
        }
        if (lines[0].startsWith('## ')) {
          return (
            <View key={i} style={styles.body}>
              <ThemedText type="smallBold" style={styles.heading}>
                {lines[0].slice(3)}
              </ThemedText>
              <ThemedText type="small" style={styles.paragraph}>
                {lines.slice(1).join('\n').replace(/\*\*/g, '')}
              </ThemedText>
            </View>
          );
        }
        return (
          <ThemedText key={i} type="small" style={styles.paragraph}>
            {trimmed.replace(/\*\*/g, '')}
          </ThemedText>
        );
      })}
    </View>
  );
}

/** Rapport d'expert IA (premium) — carte de la fiche montre. */
export function ExpertReportCard({ watchId }: { watchId: string }) {
  const { data: me } = useMe();
  const isPremium = me?.plan === 'premium';
  const report = useExpertReport(watchId, isPremium);
  const generate = useGenerateExpertReport(watchId);

  // Plan inconnu (chargement) : ne rien afficher plutôt qu'un flash de teaser
  if (me == null) return null;

  if (!isPremium) {
    return (
      <GlassCard style={styles.card}>
        <Pressable style={styles.lockedRow} onPress={() => router.push('/paywall')}>
          <SymbolView name="lock.fill" size={14} tintColor={Brand.accent} />
          <View style={styles.lockedText}>
            <ThemedText type="smallBold">Rapport d'expert IA</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Histoire, authenticité, facteurs de cote, entretien.
            </ThemedText>
          </View>
          <ThemedText type="smallBold" themeColor="interactive">
            Premium
          </ThemedText>
        </Pressable>
      </GlassCard>
    );
  }

  const status = report.data;
  const generating = status?.generating || generate.isPending;

  function runGeneration() {
    generate.mutate(undefined, {
      onError: (err) => Alert.alert('Génération impossible', err.message),
    });
  }

  return (
    <GlassCard style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold">Rapport d'expert IA</ThemedText>
        {status?.report && !generating ? (
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(status.report.createdAt).toLocaleDateString('fr-FR')}
          </ThemedText>
        ) : null}
      </View>

      {generating ? (
        <View style={styles.generatingRow}>
          <ActivityIndicator color={Brand.accent} size="small" />
          <ThemedText type="small" themeColor="textSecondary">
            Rédaction en cours — environ deux minutes, l'analyse consulte le web.
          </ThemedText>
        </View>
      ) : status?.report ? (
        <>
          {status.stale ? (
            <Pressable style={styles.staleRow} onPress={runGeneration}>
              <SymbolView name="arrow.clockwise" size={12} tintColor={Brand.accent} />
              <ThemedText type="small" themeColor="interactive">
                Montre modifiée depuis — régénérer le rapport
              </ThemedText>
            </Pressable>
          ) : null}
          <ReportBody content={status.report.content} />
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Histoire du modèle, points de contrôle d'authenticité, facteurs de cote et conseils
            d'entretien — rédigé pour cette montre.
          </ThemedText>
          <Pressable style={styles.generateButton} onPress={runGeneration}>
            <SymbolView name="sparkles" size={14} tintColor={Brand.accent} />
            <ThemedText type="smallBold" themeColor="interactive">
              Générer le rapport
            </ThemedText>
          </Pressable>
        </>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lockedText: {
    flex: 1,
    gap: 1,
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.two,
  },
  body: {
    gap: Spacing.two,
  },
  heading: {
    marginTop: Spacing.one,
  },
  paragraph: {
    lineHeight: 19,
  },
});

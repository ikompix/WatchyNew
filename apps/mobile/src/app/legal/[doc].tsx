import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEGAL_UPDATED, PRIVACY_TEXT, TERMS_TEXT } from '@/constants/legal';
import { Brand, Gutter, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';

const DOCS = {
  terms: { title: "Conditions d'utilisation et de vente", text: TERMS_TEXT },
  privacy: { title: 'Politique de confidentialité', text: PRIVACY_TEXT },
} as const;

/** Rendu du markdown léger des textes légaux (##, listes -, paragraphes). */
function LegalBody({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('## ')) {
          return (
            <ThemedText key={i} type="smallBold" style={styles.heading}>
              {trimmed.slice(3)}
            </ThemedText>
          );
        }
        if (trimmed.startsWith('- ')) {
          return (
            <View key={i} style={styles.list}>
              {trimmed.split('\n').map((line, j) => (
                <View key={j} style={styles.listItem}>
                  <ThemedText type="small" themeColor="textSecondary">
                    •
                  </ThemedText>
                  <ThemedText type="small" style={styles.paragraph}>
                    {line.replace(/^- /, '')}
                  </ThemedText>
                </View>
              ))}
            </View>
          );
        }
        return (
          <ThemedText key={i} type="small" style={styles.paragraph}>
            {trimmed}
          </ThemedText>
        );
      })}
    </>
  );
}

export default function LegalDoc() {
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = DOCS[doc === 'privacy' ? 'privacy' : 'terms'];

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + Spacing.four },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.title}>
          {content.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Dernière mise à jour : {LEGAL_UPDATED}
        </ThemedText>
        <View style={styles.body}>
          <LegalBody text={content.text} />
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
  content: {
    paddingHorizontal: Gutter,
  },
  title: {
    marginBottom: Spacing.one,
  },
  body: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  heading: {
    marginTop: Spacing.two,
  },
  paragraph: {
    lineHeight: 19,
    flex: 1,
  },
  list: {
    gap: 6,
  },
  listItem: {
    flexDirection: 'row',
    gap: 8,
  },
});

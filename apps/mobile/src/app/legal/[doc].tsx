import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEGAL } from '@/constants/legal';
import { Brand, Gutter, Spacing } from '@/constants/theme';
import { useLocaleStore, useT } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';

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
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const docs = LEGAL[locale];
  const content =
    doc === 'privacy'
      ? { title: t('legal.privacyTitle'), text: docs.privacy }
      : doc === 'mentions'
        ? { title: t('legal.noticeTitle'), text: docs.notice }
        : { title: t('legal.termsTitle'), text: docs.terms };

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
          {t('legal.updated', { date: docs.updated })}
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

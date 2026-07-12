import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';

import { useMe } from '@/hooks/use-entitlement';
import {
  useAddWatchDocument,
  useDeleteWatchDocument,
  useWatchDocuments,
} from '@/hooks/use-watch-documents';
import { apiErrorMessage } from '@/lib/premium-gate';
import { Brand, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';

/**
 * Coffre-fort documents (premium) : papiers, factures, certificats attachés à
 * la montre. Pour les comptes free, carte verrouillée qui renvoie au paywall.
 */
export function WatchDocumentsCard({ watchId }: { watchId: string }) {
  const t = useT();
  const router = useRouter();
  const { data: me } = useMe();
  const isPremium = me?.plan === 'premium';
  const documents = useWatchDocuments(watchId, isPremium);
  const addDocument = useAddWatchDocument(watchId);
  const deleteDocument = useDeleteWatchDocument(watchId);

  if (!isPremium) {
    return (
      <GlassCard style={styles.card}>
        <Pressable style={styles.lockedRow} onPress={() => router.push('/paywall')}>
          <SymbolView name="lock.fill" size={18} tintColor={Brand.inkTertiary} />
          <View style={styles.lockedText}>
            <ThemedText type="smallBold">{t('documents.title')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('documents.lockedHint')}
            </ThemedText>
          </View>
          <SymbolView name="chevron.right" size={14} tintColor={Brand.inkTertiary} />
        </Pressable>
      </GlassCard>
    );
  }

  async function pickAndUpload() {
    if (addDocument.isPending) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('wishlist.photoPermissionTitle'), t('wishlist.photoPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    addDocument.mutate(
      // Le serveur sniffe le vrai format — jpeg par défaut côté client
      { imageBase64: asset.base64, mimeType: 'image/jpeg' },
      { onError: (err) => Alert.alert(t('common.errorTitle'), apiErrorMessage(err)) }
    );
  }

  function confirmDelete(docId: string) {
    Alert.alert(t('documents.deleteTitle'), t('documents.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          deleteDocument.mutate(docId, {
            onError: (err) => Alert.alert(t('common.errorTitle'), apiErrorMessage(err)),
          }),
      },
    ]);
  }

  const docs = documents.data ?? [];

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="smallBold">{t('documents.title')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('documents.subtitle')}
        </ThemedText>
      </View>
      <View style={styles.grid}>
        {docs.map((doc) => (
          <Pressable key={doc.id} onLongPress={() => confirmDelete(doc.id)}>
            <Image source={{ uri: doc.url }} style={styles.thumb} contentFit="cover" />
          </Pressable>
        ))}
        <Pressable
          style={[styles.thumb, styles.addTile]}
          onPress={pickAndUpload}
          disabled={addDocument.isPending}
        >
          {addDocument.isPending || documents.isLoading ? (
            <ActivityIndicator color={Brand.accent} size="small" />
          ) : (
            <SymbolView name="plus" size={22} tintColor={Brand.accent} />
          )}
        </Pressable>
      </View>
      {docs.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('documents.deleteHint')}
        </ThemedText>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.card,
    gap: Spacing.two,
  },
  header: {
    gap: 2,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lockedText: {
    flex: 1,
    gap: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: Radii.card / 2,
    backgroundColor: 'rgba(22,24,43,0.05)',
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(22,24,43,0.18)',
  },
});

import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { WishlistItem } from '@watchy/types';

import { useAddToWishlist, useRemoveFromWishlist, useWishlist } from '@/hooks/use-wishlist';
import { useRecognizeWatch } from '@/hooks/use-recognition';
import { apiErrorMessage, handlePremiumGate } from '@/lib/premium-gate';
import { Brand, Gutter, Radii, Spacing } from '@/constants/theme';
import { t, useT } from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { ModelSearch } from '@/components/model-search';
import { WatchDial } from '@/components/watch-dial';

const euro = formatCurrency;

function WishlistRow({ item, onPress }: { item: WishlistItem; onPress: () => void }) {
  // Visuel : photo uploadée par l'utilisateur, sinon photo du modèle, sinon cadran
  const photo = item.photoUrl ?? item.model.photoUrl;
  const locked = item.locked === true;
  return (
    <GlassCard style={styles.rowCard}>
      <Pressable style={styles.row} onPress={onPress}>
        {photo ? (
          <Image
            source={{ uri: photo }}
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
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.model.brand}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.model.model}
            {item.model.nickname ? ` “${item.model.nickname}”` : ''}
            {item.model.reference ? ` · ${item.model.reference}` : ''}
          </ThemedText>
        </View>
        {locked ? <SymbolView name="lock.fill" size={15} tintColor={Brand.inkTertiary} /> : null}
        <View style={styles.rowRight}>
          {locked ? (
            <ThemedText type="smallBold" themeColor="textSecondary">
              ••• ••€
            </ThemedText>
          ) : (
            <>
              <ThemedText type="smallBold">
                {item.currentPrice != null ? euro(item.currentPrice) : '—'}
              </ThemedText>
              <ThemedText type="delta" themeColor="textSecondary">
                {t('wishlist.marketPriceLabel')}
              </ThemedText>
            </>
          )}
        </View>
      </Pressable>
    </GlassCard>
  );
}

export default function Wishlist() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: items, isLoading } = useWishlist();
  const addItem = useAddToWishlist();
  const removeItem = useRemoveFromWishlist();
  const recognize = useRecognizeWatch();
  const [adding, setAdding] = useState(false);
  // Photo identifiée en attente d'attachement à l'item ajouté
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);

  function add(dto: Parameters<typeof addItem.mutate>[0]) {
    addItem.mutate(
      { ...dto, photoUrl: dto.photoUrl ?? pendingPhoto ?? undefined },
      {
        onSuccess: () => {
          setAdding(false);
          setPendingPhoto(null);
        },
        onError: (err) => {
          if (!handlePremiumGate(err, t('wishlist.watchLimitTitle'))) {
            Alert.alert(t('wishlist.addErrorTitle'), apiErrorMessage(err));
          }
        },
      }
    );
  }

  // Photo facultative → identification vision (même mécanisme que l'ajout
  // collection, quota scans partagé) → ajout direct ou saisie préremplie
  async function identifyByPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('wishlist.photoPermissionTitle'), t('wishlist.photoPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.7,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;

    recognize.mutate(
      { imageBase64: asset.base64, mimeType: 'image/jpeg' },
      {
        onSuccess: (data) => {
          setPendingPhoto(data.photoUrl);
          if (data.matched) {
            add({ watchModelId: data.matched.id, photoUrl: data.photoUrl });
          } else if (data.brand || data.model) {
            add({
              brand: data.brand ?? t('wishlist.unknownBrand'),
              model: data.model ?? t('wishlist.unknownModel'),
              reference: data.reference ?? undefined,
              photoUrl: data.photoUrl,
            });
          } else {
            Alert.alert(t('wishlist.notRecognizedTitle'), t('wishlist.notRecognizedMessage'));
          }
        },
        onError: (err) => {
          if (!handlePremiumGate(err, t('wishlist.scanLimitTitle'))) {
            Alert.alert(t('wishlist.analysisErrorTitle'), apiErrorMessage(err));
          }
        },
      }
    );
  }

  function openActions(item: WishlistItem) {
    // Item verrouillé (free au-delà du quota) : repasser Premium ou libérer l'emplacement
    if (item.locked) {
      Alert.alert(t('collection.lockedTitle'), t('wishlist.lockedMessage'), [
        { text: t('premiumGate.seePremium'), onPress: () => router.push('/paywall') },
        {
          text: t('wishlist.remove'),
          style: 'destructive',
          onPress: () => removeItem.mutate(item.id),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    Alert.alert(item.model.canonicalName, undefined, [
      {
        text: t('wishlist.remove'),
        style: 'destructive',
        onPress: () => removeItem.mutate(item.id),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <View style={{ paddingTop: insets.top + 56, flex: 1 }}>
        <View style={styles.titleRow}>
          <ThemedText type="title">{t('wishlist.title')}</ThemedText>
          <Pressable onPress={() => setAdding((v) => !v)} hitSlop={8} style={styles.addButton}>
            <SymbolView
              name={adding ? 'xmark.circle.fill' : 'plus.circle.fill'}
              size={28}
              tintColor={Brand.accent}
            />
          </Pressable>
        </View>

        {adding ? (
          <View style={styles.addBody}>
            <Pressable
              style={styles.photoButton}
              onPress={identifyByPhoto}
              disabled={recognize.isPending || addItem.isPending}
            >
              {recognize.isPending ? (
                <ActivityIndicator color={Brand.accent} size="small" />
              ) : (
                <>
                  <SymbolView name="camera.viewfinder" size={16} tintColor={Brand.accent} />
                  <ThemedText type="smallBold" themeColor="interactive">
                    {t('wishlist.identifyByPhoto')}
                  </ThemedText>
                </>
              )}
            </Pressable>
            {pendingPhoto ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.pendingPhoto}>
                {t('wishlist.photoAttached')}
              </ThemedText>
            ) : null}
            <ModelSearch
              onSelectModel={(m) => add({ watchModelId: m.id })}
              onManualSubmit={(brand, model, reference) =>
                add({ brand, model, reference: reference || undefined })
              }
              submitLabel={t('wishlist.addSubmit')}
              busy={addItem.isPending}
            />
          </View>
        ) : (
          <FlatList
            data={items ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <WishlistRow item={item} onPress={() => openActions(item)} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.empty}>
                  <ActivityIndicator color={Brand.accent} />
                </View>
              ) : (
                <View style={styles.empty}>
                  <SymbolView name="heart" size={44} tintColor={Brand.accent} />
                  <ThemedText type="subtitle" style={styles.emptyTitle}>
                    {t('wishlist.emptyTitle')}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                    {t('wishlist.emptySubtitle')}
                  </ThemedText>
                  <Pressable onPress={() => setAdding(true)} style={styles.emptyCta} hitSlop={8}>
                    <ThemedText type="link" themeColor="interactive">
                      {t('collection.addWatch')}
                    </ThemedText>
                  </Pressable>
                </View>
              )
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
    paddingHorizontal: Gutter,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  addButton: {
    padding: 2,
  },
  addBody: {
    flex: 1,
    gap: Spacing.two,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: Radii.field,
    borderWidth: 1,
    borderColor: 'rgba(76,111,255,0.30)',
    backgroundColor: 'rgba(76,111,255,0.07)',
  },
  pendingPhoto: {
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 120,
    gap: Spacing.two,
  },
  rowCard: {
    padding: 0,
    borderRadius: Radii.field,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + 4,
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
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  lockedDim: {
    opacity: 0.45,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 72,
    gap: Spacing.two,
  },
  emptyTitle: {
    marginTop: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCta: {
    marginTop: Spacing.two,
  },
});

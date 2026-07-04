import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { WishlistItem } from '@watchy/types';

import {
  useAddToWishlist,
  useRemoveFromWishlist,
  useUpdateWishlistItem,
  useWishlist,
} from '@/hooks/use-wishlist';
import { useMe } from '@/hooks/use-entitlement';
import { registerPushToken } from '@/lib/push';
import { handlePremiumGate } from '@/lib/premium-gate';
import { Brand, Gutter, Radii, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { ModelSearch } from '@/components/model-search';
import { WatchDial } from '@/components/watch-dial';

const euro = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);

function WishlistRow({ item, onPress }: { item: WishlistItem; onPress: () => void }) {
  const reached =
    item.targetPrice != null && item.currentPrice != null && item.currentPrice <= item.targetPrice;
  return (
    <GlassCard style={styles.rowCard}>
      <Pressable style={styles.row} onPress={onPress}>
        {item.model.photoUrl ? (
          <Image source={{ uri: item.model.photoUrl }} style={styles.rowPhoto} contentFit="cover" />
        ) : (
          <WatchDial size={44} />
        )}
        <View style={styles.rowText}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.model.brand}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.model.model}
            {item.model.nickname ? ` “${item.model.nickname}”` : ''}
            {item.model.reference ? ` · ${item.model.reference}` : ''}
          </ThemedText>
          {item.targetPrice != null ? (
            <ThemedText type="delta" themeColor={reached ? 'positive' : 'textSecondary'}>
              🎯 objectif ≤ {euro(item.targetPrice)}
              {reached ? ' — atteint !' : ''}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.rowRight}>
          <ThemedText type="smallBold">
            {item.currentPrice != null ? euro(item.currentPrice) : '—'}
          </ThemedText>
          <ThemedText type="delta" themeColor="textSecondary">
            cote
          </ThemedText>
        </View>
      </Pressable>
    </GlassCard>
  );
}

export default function Wishlist() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: items, isLoading } = useWishlist();
  const { data: me } = useMe();
  const addItem = useAddToWishlist();
  const updateItem = useUpdateWishlistItem();
  const removeItem = useRemoveFromWishlist();
  const [adding, setAdding] = useState(false);

  // Sans effet en Expo Go — prêt pour le dev build
  useEffect(() => {
    registerPushToken();
  }, []);

  function add(dto: Parameters<typeof addItem.mutate>[0]) {
    addItem.mutate(dto, {
      onSuccess: () => setAdding(false),
      onError: (err) => Alert.alert('Impossible', err.message),
    });
  }

  function promptTarget(item: WishlistItem) {
    if (me != null && me.plan !== 'premium') {
      Alert.alert(
        'Alerte de prix',
        'Soyez notifié dès que la cote passe sous votre prix cible — une exclusivité Premium.',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Voir Premium', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }
    Alert.prompt(
      'Alerte de prix',
      `Vous serez notifié quand la cote de ${item.model.brand} ${item.model.model} passera sous ce montant (en euros).`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Activer',
          onPress: (value?: string) => {
            const target = Number((value ?? '').replace(/[^\d]/g, ''));
            if (!target) return;
            updateItem.mutate(
              { id: item.id, dto: { targetPrice: target } },
              {
                onError: (err) => {
                  if (!handlePremiumGate(err, 'Alerte de prix')) Alert.alert('Erreur', err.message);
                },
              }
            );
          },
        },
      ],
      'plain-text',
      item.targetPrice != null ? String(item.targetPrice) : '',
      'number-pad'
    );
  }

  function openActions(item: WishlistItem) {
    Alert.alert(item.model.canonicalName, undefined, [
      {
        text: item.targetPrice != null ? "Modifier l'alerte de prix" : 'Créer une alerte de prix',
        onPress: () => promptTarget(item),
      },
      ...(item.targetPrice != null
        ? [
            {
              text: "Désactiver l'alerte",
              onPress: () => updateItem.mutate({ id: item.id, dto: { targetPrice: null } }),
            },
          ]
        : []),
      {
        text: 'Retirer de la wishlist',
        style: 'destructive' as const,
        onPress: () => removeItem.mutate(item.id),
      },
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <View style={{ paddingTop: insets.top + 56, flex: 1 }}>
        <View style={styles.titleRow}>
          <ThemedText type="title">Wishlist</ThemedText>
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
            <ModelSearch
              onSelectModel={(m) => add({ watchModelId: m.id })}
              onManualSubmit={(brand, model, reference) =>
                add({ brand, model, reference: reference || undefined })
              }
              submitLabel="Ajouter à la wishlist"
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
                    Vos montres de rêve
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                    Suivez la cote des montres que vous convoitez{'\n'}et soyez alerté quand le prix
                    devient intéressant.
                  </ThemedText>
                  <Pressable onPress={() => setAdding(true)} style={styles.emptyCta} hitSlop={8}>
                    <ThemedText type="link" themeColor="interactive">
                      Ajouter une montre
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

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import Animated, {
  Easing,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { RecognizeWatchResult, WatchModel } from '@watchy/types';

import { useCreateWatch } from '@/hooks/use-watches';
import { useRecognizeWatch } from '@/hooks/use-recognition';
import { useModelEstimate } from '@/hooks/use-market-prices';
import { ModelSearch } from '@/components/model-search';
import { apiErrorMessage, blockIfPoolFull, handlePremiumGate } from '@/lib/premium-gate';
import { useMe } from '@/hooks/use-entitlement';
import { Brand, Fonts, Gutter, Radii, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { GlassCard } from '@/components/glass-card';
import { ScreenBackground } from '@/components/screen-background';
import { WatchDial } from '@/components/watch-dial';

const CONFIDENCE_THRESHOLD = 0.7;

const euro = formatCurrency;

type Step =
  | { name: 'viewfinder' }
  | { name: 'result'; result: RecognizeWatchResult }
  | { name: 'fallback'; photoUrl: string | null };

/** Ligne de scan animée (2.6s, ease-in-out, aller-retour) */
function ScanLine({ height }: { height: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [y]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value * height }],
  }));
  return (
    <Animated.View style={[styles.scanLine, style]}>
      <LinearGradient
        colors={['transparent', `${Brand.accent}cc`, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.scanLineFill}
      />
    </Animated.View>
  );
}

/** Un point qui clignote, avec un décalage de départ */
function AnalysisDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
        -1
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

/** Trois points qui clignotent, décalés (0/.2/.4s) */
function AnalysisDots() {
  return (
    <View style={styles.dots}>
      {[0, 200, 400].map((delay) => (
        <AnalysisDot key={delay} delay={delay} />
      ))}
    </View>
  );
}

export default function AddWatch() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const createWatch = useCreateWatch();
  const recognize = useRecognizeWatch();
  const { data: me } = useMe();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>({ name: 'viewfinder' });
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [reticleHeight, setReticleHeight] = useState(280);

  const hasCamera = Device.isDevice && permission?.granted;

  // Après un reload/deep link, cet écran peut être la première route :
  // back() n'aurait rien à dépiler → retour explicite à la collection
  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/collection');
  }

  useEffect(() => {
    if (Device.isDevice && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  function handleImage(base64: string, mimeType: 'image/jpeg' | 'image/png' | 'image/webp') {
    recognize.mutate(
      { imageBase64: base64, mimeType, target: 'collection' },
      {
        onSuccess: (data) => {
          const identified = data.isWatch && (data.brand || data.model);
          if (identified && data.confidence >= CONFIDENCE_THRESHOLD) {
            setStep({ name: 'result', result: data });
          } else {
            setStep({ name: 'fallback', photoUrl: data.photoUrl });
          }
        },
        onError: (err) => {
          // Collection pleine → alerte premium / +1 slot ; la saisie manuelle reste ouverte
          if (!handlePremiumGate(err, t('wishlist.watchLimitTitle'), 'collection')) {
            Alert.alert(t('wishlist.analysisErrorTitle'), apiErrorMessage(err));
          }
          setStep({ name: 'fallback', photoUrl: null });
        },
      }
    );
  }

  async function takePicture() {
    if (!cameraRef || recognize.isPending) return;
    // Collection pleine : on bloque avant la prise de vue (le scan coûte un appel IA)
    if (blockIfPoolFull(me, 'collection')) return;
    const photo = await cameraRef.takePictureAsync({ base64: true, quality: 0.7 });
    if (!photo?.base64) return;
    setPhotoUri(photo.uri);
    handleImage(photo.base64, 'image/jpeg');
  }

  async function pickFromLibrary() {
    if (recognize.isPending) return;
    if (blockIfPoolFull(me, 'collection')) return;
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
    setPhotoUri(asset.uri);
    // Le serveur sniffe le vrai format — jpeg par défaut côté client
    handleImage(asset.base64, 'image/jpeg');
  }

  function createFromResult(result: RecognizeWatchResult) {
    createWatch.mutate(
      {
        brand: (result.matched?.brand ?? result.brand)!,
        model: (result.matched?.model ?? result.model)!,
        reference: result.matched?.reference ?? result.reference ?? undefined,
        // Le surnom (« Pepsi », « Hulk »…) affine l'affichage et la cote
        nickname: result.matched?.nickname ?? result.nickname ?? undefined,
        // La couleur vue par l'IA nourrit la cote de variante dès la création
        dialColor: result.dialColor ?? undefined,
        watchModelId: result.matched?.id,
        photoUrl: result.photoUrl,
      },
      {
        onSuccess: (w) => router.replace(`/watch/${w.id}`),
        onError: (err) => {
          if (!handlePremiumGate(err, t('wishlist.watchLimitTitle'), 'collection'))
            Alert.alert(t('common.errorTitle'), apiErrorMessage(err));
        },
      }
    );
  }

  function createFromModel(m: WatchModel, photoUrl: string | null) {
    createWatch.mutate(
      {
        brand: m.brand,
        model: m.model,
        reference: m.reference ?? undefined,
        nickname: m.nickname ?? undefined,
        watchModelId: m.id,
        photoUrl: photoUrl ?? undefined,
      },
      {
        onSuccess: (w) => router.replace(`/watch/${w.id}`),
        onError: (err) => {
          if (!handlePremiumGate(err, t('wishlist.watchLimitTitle'), 'collection'))
            Alert.alert(t('common.errorTitle'), apiErrorMessage(err));
        },
      }
    );
  }

  // ——— État viewfinder ———
  if (step.name === 'viewfinder') {
    return (
      <View style={styles.container}>
        {hasCamera ? (
          <CameraView ref={setCameraRef} style={StyleSheet.absoluteFill} facing="back" />
        ) : (
          <ScreenBackground chamber />
        )}

        {/* Réticule — cadran/photo centrés dedans */}
        <View style={styles.reticleWrap} pointerEvents="none">
          <View
            style={styles.reticle}
            onLayout={(e) => setReticleHeight(e.nativeEvent.layout.height)}
          >
            <View style={styles.reticleCenter}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.chamberPhoto} contentFit="cover" />
              ) : !hasCamera ? (
                <WatchDial size={148} />
              ) : null}
            </View>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {recognize.isPending ? <ScanLine height={reticleHeight - 8} /> : null}
          </View>
        </View>

        {/* Fermer */}
        <Pressable
          onPress={close}
          style={[styles.closeButton, { top: insets.top + Spacing.two }]}
          hitSlop={8}
        >
          <SymbolView name="xmark" size={16} tintColor={Brand.ink} />
        </Pressable>

        {/* Bas : analyse en cours OU commandes */}
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + Spacing.three }]}>
          {recognize.isPending ? (
            <GlassCard style={styles.analysisCard}>
              <AnalysisDots />
              <ThemedText type="subtitle" style={styles.analysisTitle}>
                {t('addWatch.analyzing')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('addWatch.analyzingSubtitle')}
              </ThemedText>
            </GlassCard>
          ) : hasCamera ? (
            <View style={styles.controls}>
              <Pressable onPress={pickFromLibrary} style={styles.galleryButton} hitSlop={8}>
                <SymbolView name="photo.on.rectangle" size={22} tintColor={Brand.ink} />
              </Pressable>
              <Pressable onPress={takePicture}>
                <LinearGradient
                  colors={[Brand.accentLight, Brand.accentDark]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.shutter}
                >
                  <View style={styles.shutterInner} />
                </LinearGradient>
              </Pressable>
              {/* Espaceur invisible : garde le déclencheur centré */}
              <View style={styles.controlSpacer} />
            </View>
          ) : (
            <View style={styles.controlsCentered}>
              <Pressable onPress={pickFromLibrary}>
                <LinearGradient
                  colors={[Brand.accentLight, Brand.accentDark]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.chamberCta}
                >
                  <ThemedText type="link" style={styles.chamberCtaText}>
                    {t('addWatch.choosePhoto')}
                  </ThemedText>
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ——— État reconnu : sheet de résultat ———
  if (step.name === 'result') {
    return (
      <ResultSheet
        result={step.result}
        photoUri={photoUri}
        isCreating={createWatch.isPending}
        onConfirm={() => createFromResult(step.result)}
        onReject={() => setStep({ name: 'fallback', photoUrl: step.result.photoUrl })}
        onClose={close}
      />
    );
  }

  // ——— État non reconnu : fallback recherche ———
  return (
    <FallbackSearch
      photoUrl={step.photoUrl}
      isCreating={createWatch.isPending}
      onSelect={(m) => createFromModel(m, step.photoUrl)}
      onManualCreate={(brand, model, reference) =>
        createWatch.mutate(
          {
            brand,
            model,
            reference: reference || undefined,
            photoUrl: step.photoUrl ?? undefined,
          },
          {
            onSuccess: (w) => router.replace(`/watch/${w.id}`),
            onError: (err) => {
              if (!handlePremiumGate(err, t('wishlist.watchLimitTitle'), 'collection'))
                Alert.alert(t('common.errorTitle'), apiErrorMessage(err));
            },
          }
        )
      }
      onClose={close}
    />
  );
}

function ResultSheet({
  result,
  photoUri,
  isCreating,
  onConfirm,
  onReject,
  onClose,
}: {
  result: RecognizeWatchResult;
  photoUri: string | null;
  isCreating: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const market = useModelEstimate(result.matched?.id);
  const estimate = market.data?.latest?.price ?? null;
  const brand = result.matched?.brand ?? result.brand;
  const model = result.matched?.model ?? result.model;
  const reference = result.matched?.reference ?? result.reference;

  return (
    <View style={styles.container}>
      <ScreenBackground chamber />
      <Pressable
        onPress={onClose}
        style={[styles.closeButton, { top: insets.top + Spacing.two }]}
        hitSlop={8}
      >
        <SymbolView name="xmark" size={16} tintColor={Brand.ink} />
      </Pressable>

      {/* Photo / cadran en haut */}
      <View style={styles.resultDial}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.resultPhoto} contentFit="cover" />
        ) : (
          <WatchDial size={148} />
        )}
      </View>

      {/* Feuille de résultat */}
      <Animated.View
        entering={SlideInDown.duration(350)}
        style={[styles.sheetWrap, { paddingBottom: insets.bottom + Spacing.three }]}
      >
        <GlassCard glow style={styles.sheet}>
          <View style={styles.confidenceBadge}>
            <ThemedText type="delta" style={styles.confidenceText}>
              {t('addWatch.identified', { confidence: Math.round(result.confidence * 100) })}
            </ThemedText>
          </View>

          <ThemedText style={styles.sheetBrand}>{brand}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.sheetModel}>
            {model}
            {(result.matched?.nickname ?? result.nickname) ? ` “${result.matched?.nickname ?? result.nickname}”` : ''}
          </ThemedText>
          {reference ? (
            <ThemedText type="code">{t('addWatch.reference', { reference })}</ThemedText>
          ) : null}

          <View style={styles.sheetDivider} />

          <View style={styles.estimateRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('addWatch.estimatedValue')}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.estimateValue}>
              {market.isLoading ? '…' : estimate != null ? `≈ ${euro(estimate)}` : '—'}
            </ThemedText>
          </View>

          <Pressable onPress={onConfirm} disabled={isCreating} style={styles.ctaWrap}>
            <LinearGradient
              colors={[Brand.accentLight, Brand.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cta}
            >
              {isCreating ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText type="link" style={styles.ctaText}>
                  {t('addWatch.addToCollection')}
                </ThemedText>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={onReject} hitSlop={8} style={styles.rejectLink}>
            <ThemedText type="link" themeColor="interactive">
              {t('addWatch.notThisOne')}
            </ThemedText>
          </Pressable>
        </GlassCard>
      </Animated.View>
    </View>
  );
}

function FallbackSearch({
  photoUrl: _photoUrl,
  isCreating,
  onSelect,
  onManualCreate,
  onClose,
}: {
  photoUrl: string | null;
  isCreating: boolean;
  onSelect: (m: WatchModel) => void;
  onManualCreate: (brand: string, model: string, reference: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <Pressable
        onPress={onClose}
        style={[styles.closeButton, { top: insets.top + Spacing.two }]}
        hitSlop={8}
      >
        <SymbolView name="xmark" size={16} tintColor={Brand.ink} />
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.fallbackContent,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + Spacing.four },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.fallbackIcon}>
          <LinearGradient
            colors={[Brand.accentLight, Brand.accentDark]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.fallbackIconTile}
          >
            <SymbolView name="magnifyingglass" size={22} tintColor="#ffffff" />
          </LinearGradient>
        </View>
        <ThemedText type="subtitle" style={styles.fallbackTitle}>
          {t('wishlist.notRecognizedTitle')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fallbackSubtitle}>
          {t('addWatch.fallbackSubtitle')}
        </ThemedText>

        <View style={styles.fallbackBody}>
          <ModelSearch
            onSelectModel={onSelect}
            onManualSubmit={onManualCreate}
            submitLabel={t('addWatch.addToCollection')}
            busy={isCreating}
          />
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
  chamberPhoto: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1,
    borderColor: Brand.dialBorder,
  },
  reticleCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticleWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticle: {
    width: '68%',
    aspectRatio: 1,
    marginTop: -40,
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: Brand.accent,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 },
  scanLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 4,
    height: 2,
  },
  scanLineFill: {
    flex: 1,
    borderRadius: 1,
  },
  closeButton: {
    position: 'absolute',
    left: Gutter,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomArea: {
    position: 'absolute',
    left: Gutter,
    right: Gutter,
    bottom: 0,
  },
  analysisCard: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
  },
  analysisTitle: {
    marginTop: Spacing.one,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Brand.accent,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlsCentered: {
    alignItems: 'center',
  },
  controlSpacer: {
    width: 46,
  },
  galleryButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgb(74,111,151)',
    shadowOpacity: 0.45,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  chamberCta: {
    paddingHorizontal: Spacing.five,
    paddingVertical: 15,
    borderRadius: Radii.button,
  },
  chamberCtaText: {
    color: '#ffffff',
  },
  resultDial: {
    position: 'absolute',
    top: '14%',
    alignSelf: 'center',
  },
  resultPhoto: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1,
    borderColor: Brand.dialBorder,
  },
  sheetWrap: {
    position: 'absolute',
    left: Gutter,
    right: Gutter,
    bottom: 0,
  },
  sheet: {
    borderRadius: Radii.sheet,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  confidenceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(64,128,90,0.14)',
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: Spacing.two,
  },
  confidenceText: {
    color: Brand.positive,
  },
  sheetBrand: {
    fontFamily: Fonts?.bold ?? 'SpaceGrotesk_700Bold',
    fontSize: 24,
    lineHeight: 29,
    color: Brand.ink,
  },
  sheetModel: {
    fontSize: 15,
    marginBottom: Spacing.one,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: 'rgba(22,24,43,0.08)',
    marginVertical: Spacing.three,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  estimateValue: {
    fontSize: 15,
  },
  ctaWrap: {
    borderRadius: Radii.button,
    shadowColor: Brand.accentDark,
    shadowOpacity: 0.35,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cta: {
    height: 52,
    borderRadius: Radii.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 15,
  },
  rejectLink: {
    alignSelf: 'center',
    marginTop: Spacing.three,
  },
  fallbackContent: {
    paddingHorizontal: Gutter,
  },
  fallbackIcon: {
    alignItems: 'center',
  },
  fallbackIconTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackTitle: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  fallbackSubtitle: {
    textAlign: 'center',
    marginTop: Spacing.one,
    lineHeight: 18,
  },
  fallbackBody: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
});

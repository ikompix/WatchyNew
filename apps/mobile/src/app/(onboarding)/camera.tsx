import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

import { Brand, Gutter, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ScreenBackground } from '@/components/screen-background';
import { PrimaryButton } from '@/components/primary-button';

export default function CameraPrimer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [, requestPermission] = useCameraPermissions();

  function next() {
    router.push('/(onboarding)/notifications');
  }

  async function enableCamera() {
    // Le primer précède le vrai prompt système iOS (non stylable)
    await requestPermission();
    next();
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.six, paddingBottom: insets.bottom + Spacing.three },
      ]}
    >
      <ScreenBackground />
      <View style={styles.body}>
        <LinearGradient
          colors={[Brand.accentLight, Brand.accentDark]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.iconTile}
        >
          <SymbolView name="camera.fill" size={26} tintColor="#ffffff" />
        </LinearGradient>

        <ThemedText type="title" style={styles.title}>
          Identifiez vos montres en un instant
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Watchy utilise l'appareil photo uniquement pour analyser vos montres et remplir leur
          fiche. Aucune image n'est partagée sans votre accord.
        </ThemedText>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Activer l'appareil photo" onPress={enableCamera} />
        <Pressable onPress={next} style={styles.skipLink} hitSlop={8}>
          <ThemedText type="link" themeColor="textSecondary">
            Pas maintenant
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bgTop,
    paddingHorizontal: Gutter,
    justifyContent: 'space-between',
  },
  body: {
    alignItems: 'center',
    marginTop: Spacing.six,
    gap: Spacing.three,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 26,
    lineHeight: 31,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  skipLink: {
    paddingVertical: Spacing.two,
  },
});

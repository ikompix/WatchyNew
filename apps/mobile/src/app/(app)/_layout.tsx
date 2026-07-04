import { Stack } from 'expo-router';
import { Brand } from '@/constants/theme';

// Direction 1b : pas de barre d'onglets — grand titre + FAB.
// Le profil est poussé depuis l'icône en haut de la collection.
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Brand.bgTop },
      }}
    >
      <Stack.Screen name="collection/index" />
      <Stack.Screen
        name="community/index"
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: Brand.ink,
        }}
      />
      <Stack.Screen
        name="wishlist/index"
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: Brand.ink,
        }}
      />
      <Stack.Screen
        name="profile/index"
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: Brand.ink,
        }}
      />
    </Stack>
  );
}

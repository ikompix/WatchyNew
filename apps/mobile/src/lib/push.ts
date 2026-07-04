import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiPost } from './api-client';

let registered = false;

/**
 * Enregistre le jeton Expo Push auprès de l'API. Silencieusement no-op quand
 * indisponible : Expo Go ne supporte plus les push distants (SDK 53+) et
 * getExpoPushTokenAsync exige un projectId EAS — même approche stub que les
 * achats, le vrai test se fera sur dev build.
 */
export async function registerPushToken(): Promise<void> {
  if (registered) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) return;
    await apiPost('/me/push-token', { token });
    registered = true;
  } catch {
    // Environnement sans push (Expo Go, simulateur, pas de projet EAS)
  }
}

import { useRouter } from 'expo-router';

import { setOnboarded } from '@/lib/onboarding';
import { PaywallView } from '@/components/paywall-view';

/** Dernier écran d'onboarding — même paywall que la modal /paywall de l'app. */
export default function Premium() {
  const router = useRouter();

  async function finish() {
    await setOnboarded();
    router.replace('/(app)/collection');
  }

  return <PaywallView onDone={finish} />;
}

import { useRouter } from 'expo-router';

import { PaywallView } from '@/components/paywall-view';

/** Paywall en modal — ouvert par les gates (quota, teaser patrimonial, profil). */
export default function Paywall() {
  const router = useRouter();
  return <PaywallView onDone={() => router.back()} />;
}

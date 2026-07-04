import { Redirect } from 'expo-router';

// Cible du deep link watchy://auth-callback. L'échange du code OAuth est déjà
// géré dans lib/oauth.ts (openAuthSessionAsync capture l'URL de retour) ;
// cette route évite seulement l'écran « Unmatched Route » si le système ouvre
// le lien directement dans l'app (cas dev build).
export default function AuthCallback() {
  return <Redirect href="/" />;
}

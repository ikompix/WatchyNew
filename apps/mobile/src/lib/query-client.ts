import { QueryClient } from '@tanstack/react-query';

// Instance partagée : le layout racine la fournit au provider, et les modules
// hors composant (premium-gate) peuvent invalider des queries après un achat
export const queryClient = new QueryClient();

import { supabase } from './supabase';

export type PlanId = 'monthly' | 'annual';
export type PurchaseResult = 'done' | 'cancelled' | 'stub';
export type RestoreResult = 'done' | 'none' | 'stub';

type PurchasesModule = typeof import('react-native-purchases').default;
type Offerings = import('react-native-purchases').PurchasesOfferings;
type Package = import('react-native-purchases').PurchasesPackage;

/**
 * Module natif RevenueCat, ou null en mode stub (Expo Go où le module natif
 * n'existe pas, ou clé API absente). En stub, le paywall affiche l'alerte
 * « gratuit pendant la bêta » et les prix de repli.
 * Clé `test_…` = Test Store RevenueCat (achats simulés, sans App Store
 * Connect) ; la prod utilisera une clé `appl_…`.
 */
function nativePurchases(): PurchasesModule | null {
  if (!process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY) return null;
  try {
    // require gardé — un import statique planterait au chargement en Expo Go
    return require('react-native-purchases').default as PurchasesModule;
  } catch {
    return null;
  }
}

let configured = false;
// Listeners demandés avant la configuration (RC exige configure() d'abord)
const pendingListeners: (() => void)[] = [];

async function configuredPurchases(): Promise<PurchasesModule | null> {
  const Purchases = nativePurchases();
  if (!Purchases) return null;
  if (!configured) {
    if (__DEV__) {
      const { LOG_LEVEL } = require('react-native-purchases');
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    // appUserID = user id Supabase : c'est lui que le webhook RevenueCat
    // renvoie à l'API pour mettre à jour l'entitlement — jamais d'ID anonyme
    const { data } = await supabase.auth.getSession();
    Purchases.configure({
      apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!,
      appUserID: data.session?.user.id,
    });
    configured = true;
    for (const cb of pendingListeners.splice(0)) {
      Purchases.addCustomerInfoUpdateListener(() => cb());
    }
  }
  return Purchases;
}

/**
 * Notifie à chaque changement d'abonnement détecté par le SDK (achat,
 * renouvellement, expiration) — l'UI se rafraîchit sans attendre le webhook.
 * No-op en stub ; le listener s'attache dès que RC est configuré.
 */
export function initPurchasesListener(onChange: () => void): void {
  const Purchases = nativePurchases();
  if (!Purchases) return;
  if (configured) {
    Purchases.addCustomerInfoUpdateListener(() => onChange());
  } else {
    pendingListeners.push(onChange);
  }
}

/**
 * Packages de l'offering courant — propriétés standard d'abord, sinon par
 * type, sinon par identifiant du dashboard (« monthly »/« yearly »).
 */
function resolvePackages(offerings: Offerings): { monthly: Package | null; annual: Package | null } {
  const current = offerings.current;
  if (!current) return { monthly: null, annual: null };
  const byType = (type: string) =>
    current.availablePackages.find((p) => String(p.packageType) === type) ?? null;
  const byId = (id: string) =>
    current.availablePackages.find((p) => p.identifier === id) ?? null;
  return {
    monthly: current.monthly ?? byType('MONTHLY') ?? byId('monthly'),
    annual: current.annual ?? byType('ANNUAL') ?? byId('yearly') ?? byId('annual'),
  };
}

export interface OfferingPrices {
  monthly: string;
  annual: string;
  /** Prix mensuel équivalent de l'annuel, dans la devise du store */
  annualPerMonth: string;
}

/**
 * Prix réels et localisés du store — null en mode stub, le paywall retombe
 * alors sur ses valeurs par défaut. Indispensable hors zone euro : les prix
 * affichés doivent être ceux facturés.
 */
export async function getOfferingPrices(): Promise<OfferingPrices | null> {
  const Purchases = await configuredPurchases();
  if (!Purchases) return null;
  try {
    const { monthly, annual } = resolvePackages(await Purchases.getOfferings());
    if (!monthly?.product || !annual?.product) return null;
    const annualPerMonth = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: annual.product.currencyCode,
    }).format(annual.product.price / 12);
    return {
      monthly: monthly.product.priceString,
      annual: annual.product.priceString,
      annualPerMonth,
    };
  } catch {
    return null;
  }
}

export async function purchasePlan(plan: PlanId): Promise<PurchaseResult> {
  const Purchases = await configuredPurchases();
  if (!Purchases) return 'stub';

  const packages = resolvePackages(await Purchases.getOfferings());
  const pkg = plan === 'annual' ? packages.annual : packages.monthly;
  if (!pkg) throw new Error('Offre indisponible pour le moment — réessayez plus tard.');

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo.entitlements.active['premium'] ? 'done' : 'cancelled';
  } catch (err) {
    if ((err as { userCancelled?: boolean }).userCancelled) return 'cancelled';
    throw err;
  }
}

export async function restorePurchases(): Promise<RestoreResult> {
  const Purchases = await configuredPurchases();
  if (!Purchases) return 'stub';
  const info = await Purchases.restorePurchases();
  return info.entitlements.active['premium'] ? 'done' : 'none';
}

/**
 * Customer Center RevenueCat (gestion d'abonnement, remboursements, annulation
 * in-app). Retourne false si indisponible (Expo Go/stub) — l'appelant garde
 * son fallback vers les Réglages iOS.
 */
export async function presentCustomerCenter(): Promise<boolean> {
  if (!(await configuredPurchases())) return false;
  try {
    const RevenueCatUI = require('react-native-purchases-ui').default;
    await RevenueCatUI.presentCustomerCenter();
    return true;
  } catch {
    return false;
  }
}

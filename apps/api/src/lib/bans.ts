import { db } from '../db/index.js';
import { bannedUsers } from '../db/schema.js';

// Cache mémoire de l'ensemble des bannis — l'API tourne en instance unique
// (même hypothèse que le rate-limit in-memory). Le TTL est une ceinture de
// sécurité : les routes admin invalident le cache à chaque ban/débannissement.
let cache: { ids: Set<string>; at: number } | null = null;
const TTL_MS = 60_000;

export async function isBanned(userId: string): Promise<boolean> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    try {
      const rows = await db.select({ userId: bannedUsers.userId }).from(bannedUsers);
      cache = { ids: new Set(rows.map((r) => r.userId)), at: Date.now() };
    } catch (err) {
      // Fail-open : une panne DB ne doit pas transformer chaque requête en 403
      console.warn('[bans] lecture banned_users impossible', err);
      return cache?.ids.has(userId) ?? false;
    }
  }
  return cache.ids.has(userId);
}

export function invalidateBanCache(): void {
  cache = null;
}

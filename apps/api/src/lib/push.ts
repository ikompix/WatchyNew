const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushResult {
  /** Tickets acceptés par Expo (≠ délivrés : Apple peut encore filtrer). */
  sent: number;
  /** Jetons à purger (appareil désinscrit ou jeton rejeté). */
  invalid: string[];
}

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

/** Envoi Expo Push en fetch direct (chunks de 100, le max accepté par l'API). */
export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<PushResult> {
  const valid = tokens.filter((t) => t.startsWith('ExponentPushToken'));
  let sent = 0;
  const invalid: string[] = [];
  for (let i = 0; i < valid.length; i += 100) {
    const batch = valid.slice(i, i + 100);
    const messages = batch.map((to) => ({ to, title, body, data, sound: 'default' as const }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error(`[push] envoi échoué: ${res.status} ${await res.text()}`);
      continue;
    }
    // Les tickets reviennent dans l'ordre des messages du chunk
    const json = (await res.json()) as { data?: ExpoTicket[] };
    (json.data ?? []).forEach((ticket, idx) => {
      if (ticket.status === 'ok') sent++;
      else if (ticket.details?.error === 'DeviceNotRegistered') invalid.push(batch[idx]);
    });
  }
  return { sent, invalid };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Envoi Expo Push en fetch direct (chunks de 100, le max accepté par l'API). */
export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const valid = tokens.filter((t) => t.startsWith('ExponentPushToken'));
  for (let i = 0; i < valid.length; i += 100) {
    const messages = valid
      .slice(i, i + 100)
      .map((to) => ({ to, title, body, data, sound: 'default' as const }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error(`[push] envoi échoué: ${res.status} ${await res.text()}`);
    }
  }
}

import type { ApiResponse } from '@watchy/types';
import { supabase } from './supabase';
import { getActiveLocale } from './i18n';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

async function getHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) throw new Error('Unauthenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    // L'API adapte les sorties IA (reconnaissance…) à la langue de l'app
    'Accept-Language': getActiveLocale(),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const headers = await getHeaders();
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const json = await res.json();
  if (!res.ok) {
    return {
      data: null,
      error: json.error ?? { code: 'UNKNOWN', message: res.statusText },
    };
  }
  return json as ApiResponse<T>;
}

/** Erreur API avec son code métier (QUOTA_EXCEEDED, PREMIUM_REQUIRED…) — le message seul ne suffit pas aux gates. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function unwrap<T>(response: ApiResponse<T>): T {
  if (response.error) throw new ApiRequestError(response.error.message, response.error.code);
  return response.data!;
}

export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => request<T>(path, { method: 'DELETE' });

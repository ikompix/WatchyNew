import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase.js';

const BUCKET = 'watch-photos';
// Bucket PRIVÉ (documents sensibles : papiers, factures) — accès uniquement
// par URL signée courte durée, jamais d'URL publique
const DOCUMENTS_BUCKET = 'watch-documents';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Détecte le format réel depuis les magic bytes. Le mimeType client n'est pas
 * fiable : l'ImagePicker Expo renvoie du base64 JPEG même quand l'asset
 * d'origine est PNG/WebP, et Anthropic rejette toute incohérence type/octets.
 */
export function sniffImageMime(buffer: Buffer): ImageMime | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

export async function uploadWatchPhoto(
  userId: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const ext = EXTENSIONS[mimeType] ?? 'jpg';
  const path = `${userId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(imageBase64, 'base64');

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
  });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload d'un document de coffre-fort dans le bucket privé. Chemin PLAT
 * `${userId}/${uuid}.ext` — la purge de compte réutilise ainsi le même
 * `list(userId)` non récursif que pour les photos.
 */
export async function uploadWatchDocument(
  userId: string,
  imageBase64: string,
  mimeType: string
): Promise<{ path: string; sizeBytes: number }> {
  const ext = EXTENSIONS[mimeType] ?? 'jpg';
  const path = `${userId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(imageBase64, 'base64');

  const { error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, {
    contentType: mimeType,
  });
  if (error) throw new Error(`Document upload failed: ${error.message}`);

  return { path, sizeBytes: buffer.length };
}

/** URL signée courte durée (1 h) — générée à chaque lecture, jamais persistée. */
export async function signDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data) throw new Error(`Document sign failed: ${error?.message}`);
  return data.signedUrl;
}

/** Suppression best-effort de fichiers du coffre-fort (l'appelant logge). */
export async function deleteDocuments(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove(paths);
  if (error) console.error(`[storage] purge documents: ${error.message}`);
}

/** Purge le dossier documents d'un utilisateur (suppression de compte). */
export async function deleteUserDocuments(userId: string): Promise<void> {
  const { data: files } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).list(userId);
  if (files?.length) {
    await deleteDocuments(files.map((f) => `${userId}/${f.name}`));
  }
}

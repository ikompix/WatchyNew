import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase.js';

const BUCKET = 'watch-photos';

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

/** Photo de référence d'un modèle du catalogue (préfixe models/, upsert). */
export async function uploadModelPhoto(
  watchModelId: string,
  buffer: Buffer,
  mimeType: ImageMime
): Promise<string> {
  const path = `models/${watchModelId}.${EXTENSIONS[mimeType]}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`Model photo upload failed: ${error.message}`);
  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
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

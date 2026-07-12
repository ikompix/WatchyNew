import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { adminTokens } from '../db/schema.js';
import { supabaseAdmin } from '../lib/supabase.js';

// Helpers partagés du back office (admin.ts + admin-marketing.ts) : auth par
// jeton, gabarits HTML et accès aux comptes Supabase. Zéro dépendance front.

export const COOKIE = 'watchy_admin';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// Jeton maître (env) = tous les droits ; jetons d'équipe (DB, hachés,
// révocables) = lecture des dashboards uniquement
export const isMaster = (c: Context) =>
  Boolean(process.env.ADMIN_TOKEN) && getCookie(c, COOKIE) === process.env.ADMIN_TOKEN;

export async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.ADMIN_TOKEN) return false;
  if (token === process.env.ADMIN_TOKEN) return true;
  const [row] = await db
    .select({ id: adminTokens.id })
    .from(adminTokens)
    .where(and(eq(adminTokens.tokenHash, sha256(token)), isNull(adminTokens.revokedAt)))
    .limit(1);
  return Boolean(row);
}

export interface AuthUser {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string;
}

export async function listAllUsers(): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    users.push(...(data.users as AuthUser[]));
    if (data.users.length < 500) break;
  }
  return users;
}

export const isGuest = (u: AuthUser) => u.email?.endsWith('@guest.watchy') ?? false;
export const isTest = (u: AuthUser) => u.email?.endsWith('@watchy.test') ?? false;
export const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);
export const maskEmail = (email?: string) => {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}…@${domain}`;
};

export const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Gabarits ----------------------------------------------------------------

export function kpis(items: Array<[string, string, string]>): string {
  return `<div class="kpis">${items
    .map(
      ([label, value, hint]) =>
        `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-hint">${hint}</div></div>`
    )
    .join('')}</div>`;
}

export const NAV: Array<[string, string, string]> = [
  ['overview', '/admin', "Vue d'ensemble"],
  ['acquisition', '/admin/acquisition', 'Acquisition'],
  ['revenue', '/admin/revenue', 'Revenus'],
  ['costs', '/admin/costs', 'Coûts & ROI'],
  ['users', '/admin/users', 'Utilisateurs'],
  ['push', '/admin/push', 'Notifications'],
  ['marketing', '/admin/marketing', 'Marketing'],
  ['team', '/admin/team', 'Équipe'],
];

// Marque du handoff v3 (cadrans empilés) — inline pour éviter tout asset statique.
export const MARK = `<svg class="mark" width="23" height="20" viewBox="0 0 72 64" aria-hidden="true"><circle cx="22" cy="32" r="15" fill="#B9C4FF"/><circle cx="36" cy="32" r="16.5" fill="#FFFFFF"/><circle cx="36" cy="32" r="15" fill="#6E7CFF"/><circle cx="50" cy="32" r="16.5" fill="#FFFFFF"/><circle cx="50" cy="32" r="15" fill="#4C6FFF"/><path d="M50 32 L50 23" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/><path d="M50 32 L57 34.5" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/></svg>`;

export function layout(active: string, body: string, opts?: { autoRefresh?: boolean }): string {
  // autoRefresh désactivable sur les pages avec édition (un refresh viderait un textarea)
  const autoRefresh = opts?.autoRefresh ?? true;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
${autoRefresh ? '<meta http-equiv="refresh" content="300"/>' : ''}
<title>Watchy — Back office</title><style>${CSS}</style></head><body>
<header><span class="logo">${MARK}watchy <em>admin</em></span>
<nav>${NAV.map(([k, href, label]) => `<a href="${href}" class="${k === active ? 'on' : ''}">${label}</a>`).join('')}</nav></header>
<main>${body}</main>
<footer>Actualisé ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}${autoRefresh ? ' · rafraîchissement auto 5 min' : ''}</footer>
</body></html>`;
}

export function loginPage(error = ''): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Watchy — Back office</title><style>${CSS}</style></head><body class="login">
<main class="login-card"><span class="logo">${MARK}watchy <em>admin</em></span>
${error ? `<div class="alert">${error}</div>` : ''}
<form method="post" action="/admin/login">
<input type="password" name="token" placeholder="Jeton d'administration" autofocus/>
<button type="submit">Entrer</button></form></main></body></html>`;
}

export const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0;
  background: #F7F8FC; color: #16182B; }
header { display: flex; align-items: center; gap: 24px; padding: 14px 20px;
  background: #16182B; color: #fff; flex-wrap: wrap; }
.logo { font-weight: 500; letter-spacing: -0.2px; font-size: 16px;
  display: inline-flex; align-items: center; gap: 8px; }
.logo em { font-style: normal; color: #B9C4FF; font-weight: 400; letter-spacing: 1px; font-size: 13px; }
nav { display: flex; gap: 4px; flex-wrap: wrap; }
nav a { color: #c5d2e0; text-decoration: none; font-size: 13px; padding: 6px 12px; border-radius: 8px; }
nav a.on, nav a:hover { background: rgba(76,111,255,.30); color: #fff; }
main { max-width: 960px; margin: 0 auto; padding: 20px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 14px 0; }
.kpi { background: #fff; border-radius: 14px; padding: 14px 16px; box-shadow: 0 2px 10px rgba(22,24,43,.06); }
.kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #7180936; color: #718093; }
.kpi-value { font-size: 26px; font-weight: 700; margin: 4px 0 2px; }
.kpi-hint { font-size: 12px; color: #718093; }
section { background: #fff; border-radius: 14px; padding: 16px 18px; margin: 14px 0;
  box-shadow: 0 2px 10px rgba(22,24,43,.06); }
h2 { font-size: 14px; margin: 0 0 12px; letter-spacing: .3px; }
.chart { width: 100%; height: 110px; background: #f6f8fa; border-radius: 10px; }
.chart-max { font-size: 9px; fill: #718093; }
.bars { display: flex; flex-direction: column; gap: 8px; }
.bar-row { display: grid; grid-template-columns: 160px 1fr 110px; gap: 10px; align-items: center; font-size: 13px; }
.bar-track { background: #f0f3f6; border-radius: 6px; height: 14px; overflow: hidden; display: block; }
.bar-fill { background: #4C6FFF; height: 100%; display: block; border-radius: 6px; }
.bar-value { color: #718093; font-size: 12px; text-align: right; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #718093;
  padding: 6px 8px; border-bottom: 1px solid #e6eaf0; }
td { padding: 7px 8px; border-bottom: 1px solid #f0f3f6; }
.alert { background: #fdf0ef; color: #a4453f; border: 1px solid #f2d6d3; border-radius: 12px;
  padding: 12px 16px; margin: 14px 0; font-size: 14px; }
.muted { color: #718093; font-size: 12px; }
.alert.ok { background: #eef7f0; color: #2f6a45; border-color: #cfe8d6; word-break: break-all; }
.alert.ok code { font-size: 13px; font-weight: 700; }
.inline-form { display: flex; gap: 8px; }
.inline-form input { flex: 1; border: 1px solid #d7dee6; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
.push-form { display: flex; flex-direction: column; gap: 8px; }
.push-form input, .push-form textarea, .push-form select { border: 1px solid #d7dee6;
  border-radius: 10px; padding: 10px 12px; font-size: 14px; font-family: inherit; }
.push-form textarea { resize: vertical; }
.push-form button { align-self: flex-start; padding: 10px 18px; font-size: 14px; }
.push-row { display: flex; gap: 8px; }
.push-row input { flex: 1; }
button { background: #4C6FFF; color: #fff; border: 0; border-radius: 8px; padding: 7px 12px;
  font-size: 12px; cursor: pointer; }
button.danger { background: #a4453f; }
button.ghost { background: #eef1fb; color: #33406e; }
footer { text-align: center; color: #9aa4b0; font-size: 11px; padding: 20px; }
body.login { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-card { background: #fff; border-radius: 18px; padding: 36px 32px; width: 340px; text-align: center;
  box-shadow: 0 4px 24px rgba(22,24,43,.08); display: flex; flex-direction: column; gap: 16px; }
.login-card .logo { color: #16182B; }
.login-card input { border: 1px solid #d7dee6; border-radius: 10px; padding: 12px 14px; font-size: 15px; width: 100%; }
.login-card button { background: #4C6FFF; color: #fff; border: 0; border-radius: 10px; padding: 12px; font-size: 15px; cursor: pointer; width: 100%; }
`;

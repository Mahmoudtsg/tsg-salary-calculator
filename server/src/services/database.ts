// ============================================================
// TSG Salary Calculator - Database Service
// Falls back to in-memory store when no DB is configured.
// Set ADMIN_USERNAME + ADMIN_PASSWORD env vars for fallback login.
// ============================================================

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// ---- Types ----

export interface User {
  id: number;
  username: string;
  full_name: string;
  is_admin: number;
  must_change_password: number;
  created_at: string;
}

export interface ActivityEntry {
  id: number;
  user_id: number | null;
  full_name: string;
  action: string;
  detail: string | null;
  ip_address: string | null;
  timestamp: string;
}

// ============================================================
// NEON POSTGRES (primary)
// ============================================================

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let sql: any = null;
let useNeon = false;

if (connectionString) {
  try {
    const { neon } = require('@neondatabase/serverless');
    sql = neon(connectionString);
    useNeon = true;
    console.log('✅ Using Neon PostgreSQL database');
  } catch (e) {
    console.warn('⚠️  Neon init failed, falling back to in-memory store:', e);
  }
} else {
  console.warn('⚠️  No DATABASE_URL / POSTGRES_URL set — using in-memory store (data resets on restart)');
}

// ---- Neon init ----

export async function initDb(): Promise<void> {
  if (!useNeon) {
    await initMemory();
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      username  TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      is_admin  INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      full_name  TEXT NOT NULL,
      action     TEXT NOT NULL,
      detail     TEXT,
      ip_address TEXT,
      timestamp  TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
    )
  `;

  const rows = await sql`SELECT COUNT(*) AS count FROM users`;
  if (Number(rows[0].count) === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await sql`
      INSERT INTO users (username, password_hash, full_name, is_admin, must_change_password)
      VALUES ('admin', ${hash}, 'Administrator', 1, 1)
    `;
    console.log('✅ Default admin created — username: admin  password: admin123');
  }
}

// ============================================================
// IN-MEMORY FALLBACK
// Credentials come from env vars:
//   ADMIN_USERNAME  (default: "admin")
//   ADMIN_PASSWORD  (default: "admin123")
// ============================================================

interface MemUser extends User { password_hash: string; }
interface MemSession { token: string; user_id: number; expires_at: string; }
interface MemActivity extends ActivityEntry {}

const memUsers   = new Map<number, MemUser>();
const memSessions = new Map<string, MemSession>();
const memActivity: MemActivity[] = [];
let   memNextUserId = 1;
let   memNextActivityId = 1;
let   memReady = false;

async function initMemory(): Promise<void> {
  if (memReady) return;
  memReady = true;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 10);
  const id = memNextUserId++;

  memUsers.set(id, {
    id,
    username,
    password_hash: hash,
    full_name: 'Administrator',
    is_admin: 1,
    must_change_password: 0,
    created_at: new Date().toISOString(),
  });
  console.log(`✅ In-memory admin ready — username: ${username}`);
}

// ============================================================
// User helpers
// ============================================================

export async function getUserByUsername(username: string): Promise<(User & { password_hash: string }) | undefined> {
  if (!useNeon) {
    return Array.from(memUsers.values()).find(u => u.username === username);
  }
  const rows = await sql`SELECT * FROM users WHERE username = ${username}`;
  return rows[0] as any;
}

export async function getUserById(id: number): Promise<User | undefined> {
  if (!useNeon) {
    const u = memUsers.get(id);
    if (!u) return undefined;
    const { password_hash, ...rest } = u;
    return rest;
  }
  const rows = await sql`
    SELECT id, username, full_name, is_admin, must_change_password, created_at
    FROM users WHERE id = ${id}
  `;
  return rows[0] as any;
}

export async function getAllUsers(): Promise<User[]> {
  if (!useNeon) {
    return Array.from(memUsers.values()).map(({ password_hash, ...u }) => u);
  }
  const rows = await sql`
    SELECT id, username, full_name, is_admin, must_change_password, created_at
    FROM users ORDER BY created_at ASC
  `;
  return rows as any[];
}

export async function createUser(username: string, tempPassword: string, fullName: string, isAdmin: boolean): Promise<User> {
  if (!useNeon) {
    const hash = bcrypt.hashSync(tempPassword, 10);
    const id = memNextUserId++;
    const user: MemUser = {
      id, username, password_hash: hash, full_name: fullName,
      is_admin: isAdmin ? 1 : 0, must_change_password: 1,
      created_at: new Date().toISOString(),
    };
    memUsers.set(id, user);
    const { password_hash, ...rest } = user;
    return rest;
  }
  const hash = bcrypt.hashSync(tempPassword, 10);
  const rows = await sql`
    INSERT INTO users (username, password_hash, full_name, is_admin, must_change_password)
    VALUES (${username}, ${hash}, ${fullName}, ${isAdmin ? 1 : 0}, 1)
    RETURNING id
  `;
  return (await getUserById(rows[0].id))!;
}

export async function updateUser(id: number, updates: { full_name?: string; is_admin?: boolean }): Promise<User | undefined> {
  if (!useNeon) {
    const u = memUsers.get(id);
    if (!u) return undefined;
    if (updates.full_name !== undefined) u.full_name = updates.full_name;
    if (updates.is_admin !== undefined) u.is_admin = updates.is_admin ? 1 : 0;
    return getUserById(id);
  }
  if (updates.full_name !== undefined) {
    await sql`UPDATE users SET full_name = ${updates.full_name} WHERE id = ${id}`;
  }
  if (updates.is_admin !== undefined) {
    await sql`UPDATE users SET is_admin = ${updates.is_admin ? 1 : 0} WHERE id = ${id}`;
  }
  return getUserById(id);
}

export async function resetUserPassword(id: number): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const hash = bcrypt.hashSync(tempPassword, 10);
  if (!useNeon) {
    const u = memUsers.get(id);
    if (u) { u.password_hash = hash; u.must_change_password = 1; }
  } else {
    await sql`UPDATE users SET password_hash = ${hash}, must_change_password = 1 WHERE id = ${id}`;
  }
  return tempPassword;
}

export async function changePassword(id: number, newPassword: string): Promise<void> {
  const hash = bcrypt.hashSync(newPassword, 10);
  if (!useNeon) {
    const u = memUsers.get(id);
    if (u) { u.password_hash = hash; u.must_change_password = 0; }
  } else {
    await sql`UPDATE users SET password_hash = ${hash}, must_change_password = 0 WHERE id = ${id}`;
  }
}

export async function deleteUser(id: number): Promise<void> {
  if (!useNeon) {
    memUsers.delete(id);
    return;
  }
  await sql`DELETE FROM users WHERE id = ${id}`;
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

// ============================================================
// Session helpers
// ============================================================

const SESSION_TTL_HOURS = 24;

export async function createSession(userId: number): Promise<string> {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  if (!useNeon) {
    memSessions.set(token, { token, user_id: userId, expires_at: expiresAt });
  } else {
    await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAt})`;
  }
  return token;
}

export async function getSessionUser(token: string): Promise<User | undefined> {
  if (!useNeon) {
    const s = memSessions.get(token);
    if (!s) return undefined;
    if (new Date(s.expires_at) < new Date()) { memSessions.delete(token); return undefined; }
    return getUserById(s.user_id);
  }
  const rows = await sql`SELECT user_id, expires_at FROM sessions WHERE token = ${token}`;
  if (!rows[0]) return undefined;
  const { user_id, expires_at } = rows[0] as any;
  if (new Date(expires_at) < new Date()) {
    await sql`DELETE FROM sessions WHERE token = ${token}`;
    return undefined;
  }
  return getUserById(user_id);
}

export async function deleteSession(token: string): Promise<void> {
  if (!useNeon) { memSessions.delete(token); return; }
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

// ============================================================
// Activity log helpers
// ============================================================

export async function logActivity(
  userId: number | null,
  fullName: string,
  action: string,
  detail?: string,
  ipAddress?: string
): Promise<void> {
  if (!useNeon) {
    memActivity.unshift({
      id: memNextActivityId++,
      user_id: userId,
      full_name: fullName,
      action,
      detail: detail ?? null,
      ip_address: ipAddress ?? null,
      timestamp: new Date().toISOString(),
    });
    if (memActivity.length > 500) memActivity.pop();
    return;
  }
  await sql`
    INSERT INTO activity_log (user_id, full_name, action, detail, ip_address)
    VALUES (${userId}, ${fullName}, ${action}, ${detail ?? null}, ${ipAddress ?? null})
  `;
}

export async function getActivityLog(limit = 500): Promise<ActivityEntry[]> {
  if (!useNeon) return memActivity.slice(0, limit);
  const rows = await sql`SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ${limit}`;
  return rows as any[];
}

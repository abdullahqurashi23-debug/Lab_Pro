import type Database from 'better-sqlite3';
import type { PublicUser, Role, User } from './types';

const PUBLIC_COLUMNS = 'id, username, full_name, role, is_active, must_change_password, created_at';

export function listUsers(db: Database.Database): PublicUser[] {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY username`).all() as PublicUser[];
}

export function getUserById(db: Database.Database, id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByUsername(db: Database.Database, username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function createUser(
  db: Database.Database,
  input: {
    username: string;
    password_hash: string;
    full_name: string;
    role: Role;
    must_change_password?: boolean;
  }
): PublicUser {
  const existing = getUserByUsername(db, input.username);
  if (existing) throw new Error(`Username "${input.username}" is already taken.`);
  const info = db
    .prepare(
      'INSERT INTO users (username, password_hash, full_name, role, must_change_password) VALUES (?, ?, ?, ?, ?)'
    )
    .run(input.username, input.password_hash, input.full_name, input.role, input.must_change_password ? 1 : 0);
  return getUserById(db, info.lastInsertRowid as number) as PublicUser;
}

export function updateUser(
  db: Database.Database,
  id: number,
  fields: Partial<Pick<User, 'full_name' | 'role' | 'is_active'>>
): PublicUser {
  const current = getUserById(db, id);
  if (!current) throw new Error('User not found.');
  const merged = { ...current, ...fields };
  db.prepare('UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?').run(
    merged.full_name,
    merged.role,
    merged.is_active,
    id
  );
  return getUserById(db, id) as PublicUser;
}

export function setPassword(db: Database.Database, id: number, passwordHash: string, mustChangePassword = false) {
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(
    passwordHash,
    mustChangePassword ? 1 : 0,
    id
  );
}

export function toPublicUser(user: User): PublicUser {
  const { password_hash: _password_hash, ...rest } = user;
  return rest;
}

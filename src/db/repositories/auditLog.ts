import type Database from 'better-sqlite3';
import type { AuditLogEntry } from './types';

export function recordAudit(
  db: Database.Database,
  entry: { user_id: number | null; action: string; entity: string; entity_id: number | null; details?: unknown }
) {
  db.prepare(
    'INSERT INTO audit_log (user_id, action, entity, entity_id, details_json) VALUES (?, ?, ?, ?, ?)'
  ).run(entry.user_id, entry.action, entry.entity, entry.entity_id, entry.details !== undefined ? JSON.stringify(entry.details) : '');
}

export interface AuditLogFilters {
  action?: string;
  entity?: string;
  entity_id?: number;
  user_id?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogPageResult {
  rows: AuditLogEntry[];
  total: number;
}

export function listAuditLogPage(db: Database.Database, filters: AuditLogFilters = {}): AuditLogPageResult {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));

  const whereClauses: string[] = ['1=1'];
  const params: (string | number)[] = [];
  if (filters.action) {
    whereClauses.push('audit_log.action = ?');
    params.push(filters.action);
  }
  if (filters.entity) {
    whereClauses.push('audit_log.entity = ?');
    params.push(filters.entity);
  }
  if (filters.entity_id) {
    whereClauses.push('audit_log.entity_id = ?');
    params.push(filters.entity_id);
  }
  if (filters.user_id) {
    whereClauses.push('audit_log.user_id = ?');
    params.push(filters.user_id);
  }
  if (filters.from) {
    whereClauses.push('date(audit_log.created_at) >= date(?)');
    params.push(filters.from);
  }
  if (filters.to) {
    whereClauses.push('date(audit_log.created_at) <= date(?)');
    params.push(filters.to);
  }

  const fromAndWhere = `FROM audit_log LEFT JOIN users ON users.id = audit_log.user_id WHERE ${whereClauses.join(' AND ')}`;
  const total = (db.prepare(`SELECT COUNT(*) as n ${fromAndWhere}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT audit_log.*, users.username, users.full_name as user_full_name
       ${fromAndWhere}
       ORDER BY audit_log.created_at DESC, audit_log.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize) as AuditLogEntry[];

  return { rows, total };
}

// Populates the Action/Entity filter dropdowns with only values that
// actually occur, rather than a hardcoded list that would drift out of
// sync with whatever audit() calls exist across the codebase.
export function listDistinctAuditActions(db: Database.Database): string[] {
  return (db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all() as { action: string }[]).map((r) => r.action);
}
export function listDistinctAuditEntities(db: Database.Database): string[] {
  return (db.prepare('SELECT DISTINCT entity FROM audit_log ORDER BY entity').all() as { entity: string }[]).map((r) => r.entity);
}

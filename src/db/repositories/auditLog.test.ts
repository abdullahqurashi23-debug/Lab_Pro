import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { recordAudit, listAuditLogPage, listDistinctAuditActions } from './auditLog';

describe('audit log — filters and pagination', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
    recordAudit(ctx.db, { user_id: null, action: 'LOGIN', entity: 'user', entity_id: 1 });
    recordAudit(ctx.db, { user_id: null, action: 'BACKUP', entity: 'database', entity_id: null, details: { kind: 'manual' } });
    recordAudit(ctx.db, { user_id: null, action: 'RESTORE_BACKUP', entity: 'database', entity_id: null });
    recordAudit(ctx.db, { user_id: null, action: 'FINALIZE', entity: 'report', entity_id: 7 });
  });
  afterEach(() => ctx.cleanup());

  it('lists distinct actions that have actually occurred', () => {
    const actions = listDistinctAuditActions(ctx.db);
    expect(actions).toEqual(expect.arrayContaining(['LOGIN', 'BACKUP', 'RESTORE_BACKUP', 'FINALIZE']));
  });

  it('filters by action', () => {
    const page = listAuditLogPage(ctx.db, { action: 'BACKUP' });
    expect(page.total).toBe(1);
    expect(page.rows[0].action).toBe('BACKUP');
  });

  it('filters by entity', () => {
    const page = listAuditLogPage(ctx.db, { entity: 'database' });
    expect(page.total).toBe(2);
  });

  it('filters by entity_id', () => {
    const page = listAuditLogPage(ctx.db, { entity: 'report', entity_id: 7 });
    expect(page.total).toBe(1);
  });

  it('paginates results', () => {
    const page1 = listAuditLogPage(ctx.db, { page: 1, pageSize: 2 });
    const page2 = listAuditLogPage(ctx.db, { page: 2, pageSize: 2 });
    expect(page1.total).toBe(4);
    expect(page1.rows).toHaveLength(2);
    expect(page2.rows).toHaveLength(2);
    const allIds = [...page1.rows, ...page2.rows].map((r) => r.id);
    expect(new Set(allIds).size).toBe(4);
  });
});

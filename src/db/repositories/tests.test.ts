import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../testUtils';
import { createTest, updateTest } from './tests';

describe('duplicate test prevention', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.cleanup());

  it('allows creating a test with a unique name and short code', () => {
    const t = createTest(ctx.db, { name: 'Complete Blood Count', short_code: 'CBC' });
    expect(t.id).toBeGreaterThan(0);
  });

  it('rejects a duplicate test name, case-insensitively', () => {
    createTest(ctx.db, { name: 'Complete Blood Count', short_code: 'CBC' });
    expect(() => createTest(ctx.db, { name: 'complete blood count', short_code: 'CBC2' })).toThrow(/already exists/i);
  });

  it('rejects a duplicate short code, case-insensitively, even with a different name', () => {
    createTest(ctx.db, { name: 'Complete Blood Count', short_code: 'CBC' });
    expect(() => createTest(ctx.db, { name: 'Something Else', short_code: 'cbc' })).toThrow(/already used/i);
  });

  it('lets a test keep its own name/code when editing it (does not clash with itself)', () => {
    const t = createTest(ctx.db, { name: 'Complete Blood Count', short_code: 'CBC' });
    expect(() => updateTest(ctx.db, t.id, { name: 'Complete Blood Count', short_code: 'CBC', price: 500 })).not.toThrow();
  });

  it('still rejects an edit that would clash with a DIFFERENT existing test', () => {
    createTest(ctx.db, { name: 'Complete Blood Count', short_code: 'CBC' });
    const other = createTest(ctx.db, { name: 'Lipid Profile', short_code: 'LIPID' });
    expect(() => updateTest(ctx.db, other.id, { name: 'complete blood count', short_code: 'LIPID' })).toThrow(/already exists/i);
  });

  it('rejects duplicate parameter codes within the same test', () => {
    expect(() =>
      createTest(ctx.db, {
        name: 'Liver Panel',
        short_code: 'LFT',
        parameters: [
          { name: 'ALT', code: 'ALT' },
          { name: 'Alanine Transaminase', code: 'alt' },
        ],
      })
    ).toThrow(/used more than once/i);
  });
});

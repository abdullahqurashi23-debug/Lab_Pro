import type Database from 'better-sqlite3';
import { getSetting, setSetting } from './settings';
import { mergePrintLayout, type PrintLayout } from '../printLayout';

const KEY = 'print_layout';

export function getPrintLayout(db: Database.Database): PrintLayout {
  const raw = getSetting(db, KEY);
  if (!raw) return mergePrintLayout(null);
  try {
    return mergePrintLayout(JSON.parse(raw));
  } catch {
    return mergePrintLayout(null);
  }
}

export function setPrintLayout(db: Database.Database, layout: PrintLayout): PrintLayout {
  const merged = mergePrintLayout(layout);
  setSetting(db, KEY, JSON.stringify(merged));
  return merged;
}

// Excel import/export via SheetJS. This lives outside the repositories
// because it only ever runs in the main process (it needs fs + dialogs),
// not because it's part of the data model.
//
// Note: bulk import/export here only covers the flat test fields (name,
// short code, category, price, sample type) — a test's parameters (units,
// reference ranges, formulas) are nested/relational and aren't part of this
// round trip. Add parameters per-test from the Test Catalog UI.

import * as XLSX from 'xlsx';
import type { OutstandingBalanceRow, ReportListRow, RevenuePeriodReport, TestWithParameters } from './repositories/types';

export function buildTestCatalogWorkbook(tests: TestWithParameters[]): Buffer {
  const rows = tests.map((t) => ({
    'Short Code': t.short_code,
    Name: t.name,
    Category: t.category_name || '',
    Price: t.price,
    'Sample Type': t.sample_type,
    Active: t.is_active ? 'Yes' : 'No',
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Test Catalog');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export interface ParsedTestRow {
  short_code: string;
  name: string;
  category?: string;
  price?: number;
  sample_type?: string;
}

// Accepts either the exact export header names, or plain lowercase column
// names, so a hand-made spreadsheet works without matching the export
// format exactly.
export function parseTestCatalogWorkbook(buffer: Buffer): ParsedTestRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = wb.Sheets[firstSheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const headerMap: Record<string, keyof ParsedTestRow> = {
    'short code': 'short_code',
    short_code: 'short_code',
    name: 'name',
    'full name': 'name',
    category: 'category',
    price: 'price',
    'sample type': 'sample_type',
    sample_type: 'sample_type',
  };

  return raw.map((row) => {
    const mapped: ParsedTestRow = { short_code: '', name: '' };
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = headerMap[key.trim().toLowerCase()];
      if (!normalizedKey) continue;
      if (normalizedKey === 'price') {
        const n = Number(value);
        mapped.price = Number.isFinite(n) ? n : 0;
      } else {
        (mapped as unknown as Record<string, string>)[normalizedKey] = String(value ?? '').trim();
      }
    }
    return mapped;
  });
}

export function buildReportsWorkbook(reports: ReportListRow[]): Buffer {
  const rows = reports.map((r) => ({
    'Report #': r.report_no,
    Patient: r.patient_name,
    'Patient Code': r.patient_code,
    Doctor: r.doctor_name || '',
    Date: r.created_at.slice(0, 10),
    Status: r.status,
    Total: r.total,
    Paid: r.paid,
    Balance: r.balance,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Reports');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function buildRevenueWorkbook(report: RevenuePeriodReport, outstanding: OutstandingBalanceRow[]): Buffer {
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet([
    { Metric: 'Period', Value: `${report.from} to ${report.to}` },
    { Metric: 'Previous Period', Value: `${report.prevFrom} to ${report.prevTo}` },
    { Metric: 'Revenue', Value: report.current.revenue },
    { Metric: 'Previous Period Revenue', Value: report.previous.revenue },
    { Metric: 'Revenue Change %', Value: report.changePct.revenue == null ? 'N/A' : report.changePct.revenue.toFixed(1) },
    { Metric: 'Finalized Reports', Value: report.current.count },
    { Metric: 'Previous Period Reports', Value: report.previous.count },
    { Metric: 'Reports Change %', Value: report.changePct.count == null ? 'N/A' : report.changePct.count.toFixed(1) },
    { Metric: 'Total Discounts Given', Value: report.current.discounts },
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const trendSheet = XLSX.utils.json_to_sheet(report.trend.map((t) => ({ Period: t.bucket, Revenue: t.revenue, Reports: t.count })));
  XLSX.utils.book_append_sheet(wb, trendSheet, 'Trend');

  const breakdownSheet = (rows: { label: string; revenue: number; count: number }[], name: string) => {
    const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({ [name]: r.label, Revenue: r.revenue, Count: r.count })));
    return sheet;
  };
  XLSX.utils.book_append_sheet(wb, breakdownSheet(report.topTestsByCount, 'Test'), 'Top Tests (Count)');
  XLSX.utils.book_append_sheet(wb, breakdownSheet(report.topTestsByRevenue, 'Test'), 'Top Tests (Revenue)');
  XLSX.utils.book_append_sheet(wb, breakdownSheet(report.byDoctor, 'Doctor'), 'By Doctor');
  XLSX.utils.book_append_sheet(wb, breakdownSheet(report.byCategory, 'Category'), 'By Category');
  XLSX.utils.book_append_sheet(wb, breakdownSheet(report.byPaymentMethod, 'Payment Method'), 'By Payment Method');

  const outstandingSheet = XLSX.utils.json_to_sheet(
    outstanding.map((o) => ({
      'Report #': o.report_no,
      Patient: o.patient_name,
      Phone: o.patient_phone,
      Total: o.total,
      Paid: o.paid_total,
      Balance: o.balance,
      'Finalized At': o.finalized_at ? o.finalized_at.slice(0, 10) : '',
    }))
  );
  XLSX.utils.book_append_sheet(wb, outstandingSheet, 'Outstanding Balances');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

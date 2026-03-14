/**
 * CSVService — Import and export tenant data as CSV.
 *
 * Import: parseTenantsCSV(csvText) → validated rows ready for Database.addTenant()
 * Export: exportTenantsCSV(tenants, payments?) → triggers share sheet with a .csv file
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Payment, Tenant } from '../libs/types';
import { Logger } from './logger/index';
import { captureException } from './logger/monitoring';

// ── CSV column definitions (import) ────────────────────────────────────────
const REQUIRED_COLUMNS = ['name', 'room_number', 'start_date', 'monthly_rent'] as const;
const OPTIONAL_COLUMNS = ['phone', 'rent_cycle', 'contract_end_date', 'notes', 'total_paid', 'last_payment_date'] as const;

export interface ParsedTenantRow {
  name: string;
  phone: string;
  roomNumber: string;
  startDate: string;
  contractEndDate: string;
  monthlyRent: number;
  rentCycle: 'monthly' | 'biweekly' | 'quarterly';
  notes?: string;
  totalPaid?: number;
  lastPaymentDate?: string;
}

export interface CSVImportResult {
  imported: ParsedTenantRow[];
  skipped: number;
  errors: { row: number; reason: string }[];
}

// ── Shared helpers ──────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function validateRentCycle(raw: string): 'monthly' | 'biweekly' | 'quarterly' {
  const v = raw.toLowerCase().trim();
  if (v === 'biweekly' || v === 'quarterly') return v;
  return 'monthly';
}

function formatCSVCell(value: string | number | undefined | null): string {
  const s = String(value ?? '');
  // Quote if contains comma, newline or double-quote
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── IMPORT ──────────────────────────────────────────────────────────────────
export const CSVService = {
  /**
   * Parse a raw CSV string into validated tenant rows.
   * Returns imported rows and a list of per-row errors for display.
   */
  parseTenantsCSV(csvText: string): CSVImportResult {
    // Robust split: handle \r\n, \n, and \r
    const rawLines = csvText.split(/\r\n|\n|\r/);
    const lines = rawLines
      .map(l => l.trim())
      .filter(l => l.length > 0);

    console.log(`📊 CSV Parse: lines=${rawLines.length}, non-empty=${lines.length}`);

    if (lines.length < 2) {
      return { imported: [], skipped: 0, errors: [{ row: 0, reason: 'File has no data rows' }] };
    }

    const headers = parseCsvLine(lines[0]).map(h =>
      h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    );

    const missing = REQUIRED_COLUMNS.filter(c => !headers.includes(c));
    if (missing.length) {
      return {
        imported: [],
        skipped: lines.length - 1,
        errors: [{ row: 0, reason: `Missing required columns: ${missing.join(', ')}` }],
      };
    }

    const imported: ParsedTenantRow[] = [];
    const errors: { row: number; reason: string }[] = [];
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = i + 1; // 1-based for display
      const cells = parseCsvLine(lines[i]);
      const get = (col: string) => cells[headers.indexOf(col)] ?? '';

      const name = get('name').trim();
      const roomNumber = get('room_number').trim();
      const startDate = get('start_date').trim();
      const monthlyRentRaw = get('monthly_rent').replace(/[^0-9.]/g, '');

      if (!name) { errors.push({ row, reason: 'Missing name' }); skipped++; continue; }
      if (!roomNumber) { errors.push({ row, reason: 'Missing room_number' }); skipped++; continue; }
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        errors.push({ row, reason: `Invalid start_date (expected YYYY-MM-DD): "${startDate}"` });
        skipped++;
        continue;
      }

      const monthlyRent = parseFloat(monthlyRentRaw);
      if (isNaN(monthlyRent) || monthlyRent <= 0) {
        errors.push({ row, reason: `Invalid monthly_rent: "${get('monthly_rent')}"` });
        skipped++;
        continue;
      }

      const totalPaidRaw = get('total_paid').replace(/[^0-9.]/g, '');
      const totalPaid = totalPaidRaw ? parseFloat(totalPaidRaw) : 0;
      const lastPaymentDate = get('last_payment_date').trim();

      // Derive contract_end_date: 12 months after start if not provided
      const contractEndDate = (() => {
        const raw = get('contract_end_date').trim();
        if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        const d = new Date(startDate);
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().split('T')[0];
      })();

      imported.push({
        name,
        phone: get('phone').trim(),
        roomNumber,
        startDate,
        contractEndDate,
        monthlyRent,
        rentCycle: validateRentCycle(get('rent_cycle')),
        notes: get('notes').trim() || undefined,
        totalPaid: isNaN(totalPaid) ? 0 : totalPaid,
        lastPaymentDate: /^\d{4}-\d{2}-\d{2}$/.test(lastPaymentDate) ? lastPaymentDate : undefined,
      });
    }

    Logger.info('CSV parsed', {
      actionType: 'CSV_IMPORT_PARSED',
      imported: imported.length,
      skipped,
      errors: errors.length,
    });

    return { imported, skipped, errors };
  },

  // ── EXPORT ────────────────────────────────────────────────────────────────
  /**
   * Generate a CSV of all tenants (with optional latest-payment column),
   * save to device cache, and open the system share sheet.
   */
  async exportTenantsCSV(
    tenants: Tenant[],
    paymentsByTenant?: Map<number, Payment>
  ): Promise<void> {
    try {
      const header = [
        'name', 'phone', 'room_number', 'start_date', 'contract_end_date',
        'monthly_rent', 'rent_cycle', 'status', 'credit_balance', 'notes',
        ...(paymentsByTenant ? ['last_payment_date', 'last_payment_amount', 'next_due_date'] : []),
      ].join(',');

      const rows = tenants.map(t => {
        const p = paymentsByTenant?.get(t.tenant_id);
        const base = [
          t.name, t.phone, t.room_number, t.start_date,
          t.contract_end_date ?? '', t.monthly_rent, t.rent_cycle ?? 'monthly',
          t.status, t.credit_balance ?? 0, t.notes ?? '',
        ].map(formatCSVCell);

        if (paymentsByTenant) {
          base.push(
            formatCSVCell(p?.payment_date ?? ''),
            formatCSVCell(p?.amount_paid ?? ''),
            formatCSVCell(p?.next_due_date ?? ''),
          );
        }
        return base.join(',');
      });

      const csvContent = [header, ...rows].join('\n');
      const dateTag = new Date().toISOString().split('T')[0];
      const filename = `rentaltrack_export_${dateTag}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: 'utf8',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error('Sharing is not available on this device');
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Tenant Data',
        UTI: 'public.comma-separated-values-text',
      });

      Logger.info('CSV exported', { actionType: 'CSV_EXPORTED', count: tenants.length });
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        actionType: 'CSV_EXPORT_FAILED',
      });
      throw err;
    }
  },

  // ── SAMPLE TEMPLATE ───────────────────────────────────────────────────────
  /** Returns a ready-to-copy CSV template for end-users */
  getSampleCSV(): string {
    return [
      'name,phone,room_number,start_date,monthly_rent,rent_cycle,contract_end_date,notes,total_paid,last_payment_date',
      'Alice Nakato,+256700000001,A1,2025-01-01,500000,monthly,2026-01-01,Quiet tenant,1500000,2025-03-01',
      'Bob Mukasa,+256700000002,B2,2025-03-01,750000,monthly,,,750000,2025-03-01',
    ].join('\n');
  },
};

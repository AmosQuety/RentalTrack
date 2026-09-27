/**
 * ReportGenerator — Professional PDF reports via expo-print + expo-sharing.
 *
 * Template A: Tenant Statement   → payment history + current balance
 * Template B: Tax Summary         → monthly income / expense breakdown for a date range
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Payment, Tenant } from '../libs/types';
import { captureException } from './logger/monitoring';
import { Logger } from './logger/index';

// ── Shared helpers ──────────────────────────────────────────────────────────
function fmt(n: number, currency = 'UGX'): string {
  return `${n.toLocaleString()} ${currency}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const BRAND_BLUE = '#1E40AF';
const BRAND_LIGHT = '#EFF6FF';

// ── Shared HTML head (fonts + reset) ───────────────────────────────────────
const htmlHead = `
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, -apple-system, sans-serif; font-size: 13px; color: #1F2937; line-height: 1.5; padding: 32px; }
    h1 { font-size: 22px; font-weight: 700; color: ${BRAND_BLUE}; margin-bottom: 4px; }
    h2 { font-size: 15px; font-weight: 600; color: #374151; margin: 20px 0 8px; border-bottom: 2px solid ${BRAND_LIGHT}; padding-bottom: 4px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid ${BRAND_BLUE}; }
    .logo { font-size: 11px; color: #6B7280; margin-top: 4px; }
    .meta { text-align: right; font-size: 11px; color: #6B7280; }
    .meta strong { font-size: 13px; color: #1F2937; display: block; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: ${BRAND_LIGHT}; color: ${BRAND_BLUE}; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 8px 10px; border-bottom: 1px solid #F3F4F6; font-size: 12px; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #FAFAFA; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-paid { background: #D1FAE5; color: #065F46; }
    .badge-overdue { background: #FEE2E2; color: #991B1B; }
    .badge-due { background: #FEF3C7; color: #92400E; }
    .summary-grid { display: flex; gap: 16px; margin: 16px 0; }
    .summary-card { flex: 1; background: ${BRAND_LIGHT}; border-radius: 8px; padding: 14px 16px; }
    .summary-card .label { font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-card .value { font-size: 18px; font-weight: 700; color: ${BRAND_BLUE}; margin-top: 4px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 10px; color: #9CA3AF; }
    .text-right { text-align: right; }
    .text-bold { font-weight: 600; }
    .total-row td { font-weight: 700; background: ${BRAND_LIGHT}; color: ${BRAND_BLUE}; }
  </style>
</head>`;

// ══════════════════════════════════════════════════════════════════════════════
//  TEMPLATE A — Tenant Statement
// ══════════════════════════════════════════════════════════════════════════════
function buildTenantStatementHTML(
  tenant: Tenant,
  payments: Payment[],
  currency: string
): string {
  const badgeClass =
    tenant.status === 'Paid' ? 'badge-paid'
    : tenant.status === 'Overdue' ? 'badge-overdue'
    : 'badge-due';

  const totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0);
  const latestPayment = payments[0];

  const paymentRows = payments
    .map(
      (p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${fmtDate(p.payment_date)}</td>
        <td>${p.payment_method}</td>
        <td class="text-right">${fmt(p.amount_paid, currency)}</td>
        <td class="text-right">${p.months_paid_for} month${p.months_paid_for !== 1 ? 's' : ''}</td>
        <td>${fmtDate(p.next_due_date)}</td>
        ${p.notes ? `<td><em>${p.notes}</em></td>` : '<td>—</td>'}
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
${htmlHead}
<body>
  <div class="header">
    <div>
      <h1>Tenant Statement</h1>
      <p class="logo">RentalTrack · Property Management</p>
    </div>
    <div class="meta">
      <strong>${tenant.name}</strong>
      Room ${tenant.room_number} &nbsp;·&nbsp; Generated ${fmtDate(new Date().toISOString())}
    </div>
  </div>

  <h2>Tenant Information</h2>
  <table>
    <tr><td class="text-bold">Name</td><td>${tenant.name}</td>
        <td class="text-bold">Phone</td><td>${tenant.phone || '—'}</td></tr>
    <tr><td class="text-bold">Room</td><td>${tenant.room_number}</td>
        <td class="text-bold">Move-in Date</td><td>${fmtDate(tenant.start_date)}</td></tr>
    <tr><td class="text-bold">Monthly Rent</td><td>${fmt(tenant.monthly_rent, currency)}</td>
        <td class="text-bold">Rent Cycle</td><td>${tenant.rent_cycle ?? 'Monthly'}</td></tr>
    <tr><td class="text-bold">Contract End</td><td>${fmtDate(tenant.contract_end_date ?? '')}</td>
        <td class="text-bold">Status</td>
        <td><span class="badge ${badgeClass}">${tenant.status}</span></td></tr>
  </table>

  <h2>Account Summary</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Total Paid</div>
      <div class="value">${fmt(totalPaid, currency)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Credit / Balance</div>
      <div class="value">${fmt(Math.abs(tenant.credit_balance ?? 0), currency)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Next Due Date</div>
      <div class="value" style="font-size:15px">${latestPayment ? fmtDate(latestPayment.next_due_date) : '—'}</div>
    </div>
  </div>

  <h2>Payment History (${payments.length} record${payments.length !== 1 ? 's' : ''})</h2>
  ${payments.length === 0
    ? '<p style="color:#6B7280;padding:16px 0">No payment records found.</p>'
    : `<table>
        <thead>
          <tr>
            <th>#</th><th>Date</th><th>Method</th>
            <th class="text-right">Amount</th><th class="text-right">Coverage</th>
            <th>Next Due</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>${paymentRows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="3">Total</td>
            <td class="text-right">${fmt(totalPaid, currency)}</td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>`
  }

  <div class="footer">
    This statement was generated automatically by RentalTrack on ${new Date().toLocaleString()}.
    It is for informational purposes only.
  </div>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  TEMPLATE B — Tax Summary
// ══════════════════════════════════════════════════════════════════════════════
export interface LedgerSummaryRow {
  month: string;        // 'YYYY-MM'
  income: number;       // sum of RENT_PAYMENT entries
  charges: number;      // sum of RENT_CHARGE entries (negative in ledger)
}

function buildTaxSummaryHTML(
  rows: LedgerSummaryRow[],
  fromDate: string,
  toDate: string,
  currency: string
): string {
  const totalIncome  = rows.reduce((s, r) => s + r.income,  0);
  const totalCharges = rows.reduce((s, r) => s + r.charges, 0);
  const net          = totalIncome - totalCharges;

  const tableRows = rows
    .map(r => {
      const [y, m] = r.month.split('-');
      const label = new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
      return `<tr>
        <td>${label}</td>
        <td class="text-right">${fmt(r.income, currency)}</td>
        <td class="text-right">${fmt(r.charges, currency)}</td>
        <td class="text-right text-bold" style="color:${net >= 0 ? '#065F46' : '#991B1B'}">
          ${fmt(r.income - r.charges, currency)}
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
${htmlHead}
<body>
  <div class="header">
    <div>
      <h1>Tax & Income Summary</h1>
      <p class="logo">RentalTrack · Property Management</p>
    </div>
    <div class="meta">
      <strong>Date Range</strong>
      ${fmtDate(fromDate)} — ${fmtDate(toDate)}<br/>
      Generated ${fmtDate(new Date().toISOString())}
    </div>
  </div>

  <h2>Period Overview</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Total Income</div>
      <div class="value" style="color:#065F46">${fmt(totalIncome, currency)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Charges</div>
      <div class="value" style="color:#991B1B">${fmt(totalCharges, currency)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Net</div>
      <div class="value" style="color:${net >= 0 ? '#065F46' : '#991B1B'}">${fmt(net, currency)}</div>
    </div>
  </div>

  <h2>Monthly Breakdown</h2>
  ${rows.length === 0
    ? '<p style="color:#6B7280;padding:16px 0">No transactions found for this period.</p>'
    : `<table>
        <thead>
          <tr>
            <th>Month</th>
            <th class="text-right">Income Collected</th>
            <th class="text-right">Charges Raised</th>
            <th class="text-right">Net</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td>Total</td>
            <td class="text-right">${fmt(totalIncome, currency)}</td>
            <td class="text-right">${fmt(totalCharges, currency)}</td>
            <td class="text-right">${fmt(net, currency)}</td>
          </tr>
        </tfoot>
      </table>`
  }

  <p style="margin-top:16px;font-size:11px;color:#6B7280">
    <strong>Note:</strong> "Income Collected" represents payments received from tenants.
    "Charges Raised" represents rent obligations recorded in the ledger.
    This report is generated from local device data and should be reviewed by your accountant
    before filing taxes.
  </p>

  <div class="footer">
    Generated by RentalTrack on ${new Date().toLocaleString()}.
  </div>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  Public API
// ══════════════════════════════════════════════════════════════════════════════
export const ReportGenerator = {
  /**
   * Generate and share a Tenant Statement PDF.
   * Opens the system print/share sheet automatically.
   */
  async generateTenantStatement(
    tenant: Tenant,
    payments: Payment[],
    currency = 'UGX'
  ): Promise<void> {
    try {
      Logger.info('Generating tenant statement PDF', {
        actionType: 'PDF_TENANT_STATEMENT',
        tenantId: tenant.tenant_id,
      });

      const html = buildTenantStatementHTML(tenant, payments, currency);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Statement — ${tenant.name}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ uri });
      }

      Logger.info('Tenant statement shared', { actionType: 'PDF_SHARED', tenantId: tenant.tenant_id });
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        actionType: 'PDF_TENANT_STATEMENT_FAILED',
        tenantId: tenant.tenant_id,
      });
      throw err;
    }
  },

  /**
   * Generate and share a Tax Summary PDF for the given date range.
   */
  async generateTaxSummary(
    rows: LedgerSummaryRow[],
    fromDate: string,
    toDate: string,
    currency = 'UGX'
  ): Promise<void> {
    try {
      Logger.info('Generating tax summary PDF', {
        actionType: 'PDF_TAX_SUMMARY',
        fromDate,
        toDate,
        months: rows.length,
      });

      const html = buildTaxSummaryHTML(rows, fromDate, toDate, currency);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Tax & Income Summary',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ uri });
      }

      Logger.info('Tax summary shared', { actionType: 'PDF_TAX_SHARED' });
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        actionType: 'PDF_TAX_SUMMARY_FAILED',
      });
      throw err;
    }
  },
};

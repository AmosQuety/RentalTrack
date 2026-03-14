// tests/v1_verification.test.ts
// V1 Production Readiness — verification suite for all 8 audit fixes.
// Run with: npx jest v1_verification --watchAll=false

import { calculatePaymentBreakdown, calculateTenantStatus } from '../domain/financial';
import { assertInteger, generateMissingRentCharges } from '../domain/ledger';

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1 — Integer arithmetic safety (credit_balance column type + assertInteger)
// ─────────────────────────────────────────────────────────────────────────────
describe('Integer arithmetic safety', () => {
  it('assertInteger rounds a float up and emits a warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assertInteger(450000.7)).toBe(450001);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not an integer'));
    warnSpy.mockRestore();
  });

  it('assertInteger rounds a float down correctly', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assertInteger(450000.2)).toBe(450000);
    warnSpy.mockRestore();
  });

  it('assertInteger passes integers through unchanged with no warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assertInteger(450000)).toBe(450000);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('float amountPaid is rounded before breakdown — 449999.9 rounds to 450000 → 1 full cycle', () => {
    // Before the fix, 449999.9 / 450000 = 0.999... → Math.floor = 0 (wrong)
    // After assertInteger rounds it: 450000 / 450000 = 1.0 → Math.floor = 1 (correct)
    const result = calculatePaymentBreakdown(449999.9, 0, 450000, new Date('2026-01-01'), 'monthly');
    expect(result.fullCyclesCovered).toBe(1);
    expect(result.newCreditBalance).toBe(0);
    expect(result.balanceDueForCurrentCycle).toBe(0);
  });

  it('exact integer payment covers exactly 1 cycle with zero credit', () => {
    const result = calculatePaymentBreakdown(450000, 0, 450000, new Date('2026-01-01'), 'monthly');
    expect(result.fullCyclesCovered).toBe(1);
    expect(result.newCreditBalance).toBe(0);
  });

  it('partial payment produces correct balance due and credit', () => {
    const result = calculatePaymentBreakdown(200000, 0, 450000, new Date('2026-01-01'), 'monthly');
    expect(result.fullCyclesCovered).toBe(0);
    expect(result.balanceDueForCurrentCycle).toBe(250000); // 450000 - 200000
    expect(result.newCreditBalance).toBe(200000);
  });

  it('overpayment spanning 3 months leaves correct credit remainder', () => {
    // Pay 1,000,000 UGX on a 450,000/month lease
    // 1,000,000 / 450,000 = 2 full cycles, 100,000 left over
    const result = calculatePaymentBreakdown(1000000, 0, 450000, new Date('2026-01-01'), 'monthly');
    expect(result.fullCyclesCovered).toBe(2);
    expect(result.newCreditBalance).toBe(100000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 2 — generateMissingRentCharges safety cap (60 cycles max)
// ─────────────────────────────────────────────────────────────────────────────
describe('generateMissingRentCharges safety cap', () => {
  it('caps at 60 entries when lastChargeDate is a corrupted ancient date', () => {
    // Without the cap, '2000-01-01' → today would generate ~300 monthly entries
    const charges = generateMissingRentCharges(
      1, 450000, 'monthly', '2000-01-01', new Date().toISOString()
    );
    expect(charges.length).toBe(60);
  });

  it('generates 0 entries when no period has passed (same date)', () => {
    const charges = generateMissingRentCharges(
      1, 450000, 'monthly',
      '2026-03-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z'
    );
    expect(charges.length).toBe(0);
  });

  it('generates correct entries for a normal 3-month gap', () => {
    const charges = generateMissingRentCharges(
      1, 450000, 'monthly',
      '2026-01-01T00:00:00.000Z',
      '2026-04-15T00:00:00.000Z'
    );
    expect(charges.length).toBe(3);
    expect(charges[0].reference_date).toBe('2026-02-01');
    expect(charges[1].reference_date).toBe('2026-03-01');
    expect(charges[2].reference_date).toBe('2026-04-01');
    expect(charges.every(c => c.amount === 450000)).toBe(true);
    expect(charges.every(c => c.type === 'RENT_CHARGE')).toBe(true);
  });

  it('all generated charges have the correct tenant_id', () => {
    const charges = generateMissingRentCharges(
      42, 300000, 'monthly',
      '2026-01-01T00:00:00.000Z',
      '2026-03-15T00:00:00.000Z'
    );
    expect(charges.every(c => c.tenant_id === 42)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1 (status) — calculateTenantStatus correctness
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateTenantStatus', () => {
  // Build date strings relative to today so tests never go stale
  const future30 = new Date();
  future30.setDate(future30.getDate() + 30);
  const futureStr = future30.toISOString().split('T')[0];

  const future2 = new Date();
  future2.setDate(future2.getDate() + 2);
  const dueSoonStr = future2.toISOString().split('T')[0];

  const past5 = new Date();
  past5.setDate(past5.getDate() - 5);
  const pastStr = past5.toISOString().split('T')[0];

  it('new tenant (no payments) with future due date is Due Soon — never Paid', () => {
    expect(calculateTenantStatus(futureStr, false)).toBe('Due Soon');
  });

  it('new tenant (no payments) with past due date is Overdue', () => {
    expect(calculateTenantStatus(pastStr, false)).toBe('Overdue');
  });

  it('new tenant (no payments) due in 2 days is Due Soon, not Paid', () => {
    expect(calculateTenantStatus(dueSoonStr, false)).toBe('Due Soon');
  });

  it('tenant with payments and due date 30 days away is Paid', () => {
    expect(calculateTenantStatus(futureStr, true)).toBe('Paid');
  });

  it('tenant with payments due in 2 days is Due Soon', () => {
    expect(calculateTenantStatus(dueSoonStr, true)).toBe('Due Soon');
  });

  it('tenant with payments whose due date has passed is Overdue', () => {
    expect(calculateTenantStatus(pastStr, true)).toBe('Overdue');
  });

  it('handles invalid/empty nextDueDate gracefully without throwing', () => {
    expect(() => calculateTenantStatus('', false)).not.toThrow();
    expect(() => calculateTenantStatus('not-a-date', true)).not.toThrow();
  });
});
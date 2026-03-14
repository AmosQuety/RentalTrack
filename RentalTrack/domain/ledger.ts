import { calculateNextDueDate, RentCycle, TenantStatus } from './financial';

export type LedgerEntryType = 'RENT_CHARGE' | 'PAYMENT' | 'REVERSAL' | 'ADJUSTMENT' | 'INITIAL_BALANCE';

export interface LedgerEntry {
  entry_id?: number;
  tenant_id: number;
  type: LedgerEntryType;
  /** Amount in smallest currency unit (e.g., cents or base UGX as integer) */
  amount: number;
  description: string;
  reference_date: string; // ISO Date string (YYYY-MM-DD)
  created_at?: string;
  original_payment_id?: number; // Optional link for reversals
}

/**
 * Validates that an amount is an integer to prevent floating point errors
 */
export const assertInteger = (amount: number): number => {
  if (!Number.isInteger(amount)) {
    console.warn(`Amount ${amount} is not an integer. Rounding to nearest integer.`);
    return Math.round(amount);
  }
  return amount;
};

/**
 * Calculates the current balance from a series of ledger entries.
 * Positive balance = Tenant is in credit/paid ahead.
 * Negative balance = Tenant owes money.
 */
export const calculateLedgerBalance = (entries: LedgerEntry[]): number => {
  return entries.reduce((acc, entry) => {
    const amt = assertInteger(entry.amount);
    if (entry.type === 'PAYMENT' || entry.type === 'INITIAL_BALANCE' || entry.type === 'ADJUSTMENT') {
      return acc + amt; // Payments increase credit
    } else if (entry.type === 'RENT_CHARGE') {
      return acc - Math.abs(amt); // Charges decrease credit (ensure we subtract)
    } else if (entry.type === 'REVERSAL') {
      // Reversals can be positive (reversing a charge) or negative (reversing a payment).
      // Standard practice: if we reverse a PAYMENT, amount is negative.
      return acc + amt; 
    }
    return acc;
  }, 0);
};

/**
 * Generates missing rent charges up to the target date.
 * Example: If last charge was Jan 1, and target is April 1 (monthly),
 * it returns charges for Feb 1, Mar 1, and Apr 1.
 */
export const generateMissingRentCharges = (
  tenantId: number,
  monthlyRent: number,
  rentCycle: RentCycle,
  lastChargeDateStr: string,
  targetDateStr: string = new Date().toISOString()
): LedgerEntry[] => {
  const charges: LedgerEntry[] = [];
  
  // Helper to safely parse YYYY-MM-DD to a UTC Date object
  const createUTCDate = (dateStr: string) => {
    const parts = dateStr.split('T')[0].split('-');
    return new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  };

  const currentDate = createUTCDate(lastChargeDateStr);
  const target = createUTCDate(targetDateStr);
  
  const cleanRent = assertInteger(monthlyRent);

  let nextChargeDate = calculateNextDueDate(currentDate, rentCycle);
  // Ensure the output of calculateNextDueDate is also stripped back to strict UTC midnight
  // since date-fns might perform local time math inside addMonths if we're deeply buried.
  nextChargeDate = new Date(Date.UTC(nextChargeDate.getUTCFullYear(), nextChargeDate.getUTCMonth(), nextChargeDate.getUTCDate()));

  const MAX_CYCLES = 60; // 5 years max — protects against corrupted dates
  let safetyCounter = 0;

  while (nextChargeDate.getTime() <= target.getTime() && safetyCounter < MAX_CYCLES) {
    safetyCounter++;
    // Format strictly from the UTC coordinates
    const formattedDate = nextChargeDate.toISOString().split('T')[0];
    
    charges.push({
      tenant_id: tenantId,
      type: 'RENT_CHARGE',
      amount: cleanRent, 
      description: `Rent charge for period starting ${formattedDate}`,
      reference_date: formattedDate
    });
    
    nextChargeDate = calculateNextDueDate(nextChargeDate, rentCycle);
    nextChargeDate = new Date(Date.UTC(nextChargeDate.getUTCFullYear(), nextChargeDate.getUTCMonth(), nextChargeDate.getUTCDate()));
  }

  if (safetyCounter >= MAX_CYCLES) {
    console.warn(
      `[generateMissingRentCharges] Safety cap hit for tenant ${tenantId}. ` +
      `lastChargeDate=${lastChargeDateStr}. Check for corrupted start_date.`
    );
  }

  return charges;
};

/**
 * Calculates Tenant Status based on ledger balance and the next scheduled charge date.
 * If balance >= 0 -> Paid (or Due Soon if next charge is within 3 days)
 * If balance < 0 -> Overdue
 */
export const calculateStatusFromLedger = (
  balance: number,
  nextPredictedChargeDateStr: string,
  currentDate: Date = new Date()
): TenantStatus => {
  if (balance < 0) return 'Overdue';
  
  const today = currentDate;
  today.setHours(0,0,0,0);
  
  const nextCharge = new Date(nextPredictedChargeDateStr.split('T')[0] + 'T00:00:00Z');
  nextCharge.setHours(0,0,0,0);
  
  const daysUntilDue = Math.ceil((nextCharge.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue <= 3 && daysUntilDue >= 0) {
    return 'Due Soon';
  }
  
  return 'Paid';
};

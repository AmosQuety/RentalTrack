import { addDays, addMonths, parseISO } from 'date-fns';
import { assertInteger } from './ledger';

export type RentCycle = 'monthly' | 'biweekly' | 'quarterly';
export type TenantStatus = 'Paid' | 'Due Soon' | 'Overdue' | 'Suspended';

/**
 * Calculate next due date strictly based on rent cycle
 */
export const calculateNextDueDate = (baseDate: Date, rentCycle: RentCycle = 'monthly'): Date => {
  const base = new Date(baseDate);
  
  switch (rentCycle) {
    case 'monthly':
      return addMonths(base, 1);
    case 'biweekly':
      return addDays(base, 14);
    case 'quarterly':
      return addMonths(base, 3);
    default:
      return addMonths(base, 1);
  }
};

/**
 * Advance a date repeatedly by the rent cycle
 */
export const advanceDueDate = (startDate: Date, rentCycle: RentCycle, cyclesToAdvance: number): Date => {
  let nextDate = new Date(startDate);
  for (let i = 0; i < cyclesToAdvance; i++) {
    nextDate = calculateNextDueDate(nextDate, rentCycle);
  }
  return nextDate;
};

/**
 * Pure calculation of tenant status based on next due date and payment history
 */
export const calculateTenantStatus = (nextDueDate: string, hasPayments: boolean, currentDate: Date = new Date()): TenantStatus => {
  try {
    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);
    
    if (!nextDueDate || typeof nextDueDate !== 'string') {
      return hasPayments ? 'Due Soon' : 'Overdue';
    }
    
    const dueDate = parseISO(nextDueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (!hasPayments) {
      return daysUntilDue >= 0 ? 'Due Soon' : 'Overdue';
    }
    
    if (daysUntilDue > 3) {
      return 'Paid';
    } else if (daysUntilDue >= 0) {
      return 'Due Soon';
    } else {
      return 'Overdue';
    }
  } catch (error) {
    return hasPayments ? 'Due Soon' : 'Overdue';
  }
};

export interface PaymentCalculationResult {
  fullCyclesCovered: number;
  newCreditBalance: number;
  nextDueDate: Date;
  isFullyPaid: boolean;
  balanceDueForCurrentCycle: number;
  totalAvailable: number;
}

/**
 * Deterministically calculate payment breakdown based on amount paid, current credit, and monthly rent
 */
export const calculatePaymentBreakdown = (
  amountPaid: number, 
  currentCredit: number, 
  monthlyRent: number, 
  baseDate: Date, 
  rentCycle: RentCycle
): PaymentCalculationResult => {
  amountPaid = assertInteger(amountPaid);
  currentCredit = assertInteger(currentCredit);
  monthlyRent = assertInteger(monthlyRent);

  // Ensure we don't divide by zero
  if (monthlyRent <= 0) monthlyRent = 1;

  const totalAvailable = amountPaid + currentCredit;
  const fullCyclesCovered = Math.floor(totalAvailable / monthlyRent);
  const newCreditBalance = totalAvailable % monthlyRent;
  
  const nextDueDate = advanceDueDate(baseDate, rentCycle, fullCyclesCovered);
  const isFullyPaid = fullCyclesCovered > 0 && newCreditBalance === 0;
  
  // If no full cycles were covered, there is a balance due for the current cycle
  const balanceDueForCurrentCycle = fullCyclesCovered === 0 ? monthlyRent - totalAvailable : 0;
  
  return {
    fullCyclesCovered,
    newCreditBalance,
    nextDueDate,
    isFullyPaid,
    balanceDueForCurrentCycle,
    totalAvailable
  };
};

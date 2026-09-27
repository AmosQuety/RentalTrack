/**
 * Notification Templates — Smart Notification System
 *
 * Each template defines the tier name, emoji, title factory, and body factory.
 * All formatting is centralised here so copy changes never touch scheduler logic.
 */

import { Tenant } from '../../libs/types';

export type NotificationTier =
  | 'EARLY_WARNING'   // 7 days before due
  | 'REMINDER'        // user-configured days before due
  | 'DUE_TODAY'       // on the due date
  | 'OVERDUE'         // after due, before auto-suspend
  | 'CONTRACT_EXPIRY' // N days before contract_end_date
  | 'MONTHLY_DIGEST'  // 1st of each month
  | 'BROADCAST';      // landlord-initiated

export type NotificationCategory =
  | 'RENT_REMINDER'
  | 'CONTRACT_ALERT'
  | 'DIGEST'
  | 'BROADCAST';

export interface NotificationTemplate {
  tier: NotificationTier;
  category: NotificationCategory;
  /** Colour hint for rich notification styling */
  accentColour: string;
  title: (
    tenant: Pick<Tenant, 'name' | 'room_number'>,
    extra: TemplateExtra
  ) => string;
  body: (
    tenant: Pick<Tenant, 'name' | 'room_number' | 'monthly_rent'>,
    extra: TemplateExtra
  ) => string;
}

export interface TemplateExtra {
  daysUntilDue?: number;
  daysOverdue?: number;
  daysUntilExpiry?: number;
  dueDateFormatted?: string;
  expiryDateFormatted?: string;
  currency?: string;
  digestSummary?: {
    totalTenants: number;
    paidCount: number;
    overdueCount: number;
    totalCollected: number;
  };
  broadcastTitle?: string;
  broadcastBody?: string;
}

// ─── Shared formatter ──────────────────────────────────────────────────────
export function formatCurrency(amount: number, currency = 'UGX'): string {
  return `${amount.toLocaleString()} ${currency}`;
}

// ─── Template registry ─────────────────────────────────────────────────────
export const NotificationTemplates: Record<NotificationTier, NotificationTemplate> = {
  EARLY_WARNING: {
    tier: 'EARLY_WARNING',
    category: 'RENT_REMINDER',
    accentColour: '#3B82F6', // blue
    title: (t, _x) => `📅 Upcoming Rent — ${t.name}`,
    body: (t, x) =>
      `Room ${t.room_number}: rent of ${formatCurrency(t.monthly_rent, x.currency)} is due on ${x.dueDateFormatted}. That's ${x.daysUntilDue} days away — get ready!`,
  },

  REMINDER: {
    tier: 'REMINDER',
    category: 'RENT_REMINDER',
    accentColour: '#F59E0B', // amber
    title: (t, _x) => `⏰ Rent Due Soon — ${t.name}`,
    body: (t, x) =>
      `Room ${t.room_number}: ${formatCurrency(t.monthly_rent, x.currency)} due in ${x.daysUntilDue} day${x.daysUntilDue === 1 ? '' : 's'} (${x.dueDateFormatted}). Tap to mark paid ✅`,
  },

  DUE_TODAY: {
    tier: 'DUE_TODAY',
    category: 'RENT_REMINDER',
    accentColour: '#EF4444', // red
    title: (t, _x) => `🔴 Rent Due TODAY — ${t.name}`,
    body: (t, x) =>
      `Room ${t.room_number}: ${formatCurrency(t.monthly_rent, x.currency)} is due today, ${x.dueDateFormatted}. Please collect or confirm payment.`,
  },

  OVERDUE: {
    tier: 'OVERDUE',
    category: 'RENT_REMINDER',
    accentColour: '#DC2626', // deep red
    title: (t, _x) => `⚠️ Rent Overdue — ${t.name}`,
    body: (t, x) =>
      `Room ${t.room_number}: payment of ${formatCurrency(t.monthly_rent, x.currency)} was due ${x.daysOverdue} day${x.daysOverdue === 1 ? '' : 's'} ago (${x.dueDateFormatted}). Contact tenant to avoid suspension.`,
  },

  CONTRACT_EXPIRY: {
    tier: 'CONTRACT_EXPIRY',
    category: 'CONTRACT_ALERT',
    accentColour: '#8B5CF6', // purple
    title: (t, _x) => `📋 Lease Expiring — ${t.name}`,
    body: (t, x) =>
      `Room ${t.room_number}: lease for ${t.name} expires on ${x.expiryDateFormatted} — ${x.daysUntilExpiry} day${x.daysUntilExpiry === 1 ? '' : 's'} away. Renew now to avoid gaps.`,
  },

  MONTHLY_DIGEST: {
    tier: 'MONTHLY_DIGEST',
    category: 'DIGEST',
    accentColour: '#10B981', // green
    title: (_t, _x) => `📊 Your Monthly Rent Summary`,
    body: (_t, x) => {
      const d = x.digestSummary;
      if (!d) return 'Open RentalTrack to see your monthly report.';
      return (
        `${d.paidCount}/${d.totalTenants} tenants paid · ` +
        `${d.overdueCount} overdue · ` +
        `Collected: ${formatCurrency(d.totalCollected, x.currency)}`
      );
    },
  },

  BROADCAST: {
    tier: 'BROADCAST',
    category: 'BROADCAST',
    accentColour: '#0EA5E9', // sky blue
    title: (_t, x) => x.broadcastTitle ?? '📢 Message from your Landlord',
    body: (_t, x) => x.broadcastBody ?? '',
  },
};

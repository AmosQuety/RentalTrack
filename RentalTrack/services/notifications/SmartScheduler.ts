/**
 * SmartScheduler — 6-Tier Notification Engine
 *
 * Replaces the simple single-trigger scheduleUpcomingReminders() with a comprehensive
 * engine that schedules ALL applicable notification tiers for every active tenant,
 * as well as contract expiry warnings and the monthly digest.
 *
 * Every tier is idempotent: a unique dedup_key prevents double-scheduling even if
 * the scheduler runs multiple times a day.
 */

import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { Database, initializeDatabase, getTenantNextDueDate } from '../../db/database';
import { Tenant } from '../../libs/types';
import { captureException } from '../logger/monitoring';
import { Logger } from '../logger/index';
import {
  NotificationTemplates,
  NotificationTier,
  TemplateExtra,
  formatCurrency,
} from './templates';
import { NotificationService } from '../notifications';

// ── DB singleton ─────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;
async function getDB(): Promise<SQLite.SQLiteDatabase> {
  await initializeDatabase();
  return Database.getDb();
}

// ── Dedup key format: TIER__tenantId__YYYY-MM-DD ────────────────────────────
function dedupKey(tier: NotificationTier, tenantId: number, dateTag: string): string {
  return `${tier}__${tenantId}__${dateTag}`;
}

async function isAlreadyScheduled(db: SQLite.SQLiteDatabase, key: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ dedup_key: string }>(
    `SELECT dedup_key FROM scheduled_notifications WHERE dedup_key = ?`,
    [key]
  );
  return !!row;
}

async function markScheduled(db: SQLite.SQLiteDatabase, key: string): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO scheduled_notifications (dedup_key, scheduled_at) VALUES (?, ?)`,
    [key, new Date().toISOString()]
  );
}

// ── Core: fire a single notification ────────────────────────────────────────
async function scheduleRich(
  tier: NotificationTier,
  tenant: Pick<Tenant, 'name' | 'room_number' | 'monthly_rent'>,
  extra: TemplateExtra,
  triggerDate: Date,
  androidChannelId = 'rent-reminders'
): Promise<string | null> {
  const tmpl = NotificationTemplates[tier];
  const title = tmpl.title(tenant, extra);
  const body = tmpl.body(tenant, extra);

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        color: tmpl.accentColour,
        data: {
          tier,
          tenantId: (tenant as Tenant).tenant_id ?? undefined,
          timestamp: new Date().toISOString(),
        },
        categoryIdentifier: tmpl.category === 'BROADCAST' ? undefined : 'RENT_REMINDER',
        ...(Platform.OS === 'android' ? { channelId: androidChannelId } : {}),
      },
      trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        } as Notifications.NotificationTriggerInput,
    });

    Logger.info('Smart notification scheduled', {
      actionType: 'SMART_NOTIFICATION_SCHEDULED',
      tier,
      tenantId: (tenant as Tenant).tenant_id ?? 'n/a',
      triggerDate: triggerDate.toISOString(),
      notificationId: id,
    });

    return id;
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      actionType: 'SMART_NOTIFICATION_FAILED',
      tier,
    });
    return null;
  }
}

// ── Helper: build a trigger date at the user's preferred reminder time ───────
function buildTriggerAt(date: Date, reminderTime: string): Date {
  const [h, m] = reminderTime.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function today0(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
export class SmartScheduler {
  // ── Ensure the dedup table exists ─────────────────────────────────────────
  static async ensureSchema(): Promise<void> {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS scheduled_notifications (
        dedup_key   TEXT PRIMARY KEY,
        scheduled_at TEXT NOT NULL
      )
    `);
  }

  // ── Main entry: schedule all tiers for all active tenants ─────────────────
  static async scheduleAll(userId: string): Promise<void> {
    await NotificationService.initialize();
    await this.ensureSchema();
    const db = await getDB();

    Logger.info('SmartScheduler: starting full scan', { actionType: 'SMART_SCHEDULER_START', userId });

    const settings = await Database.getSettings(userId);
    if (!settings || !settings.notification_enabled) {
      Logger.info('SmartScheduler: notifications disabled', {
        actionType: 'SMART_SCHEDULER_DISABLED',
        userId
      });
      return;
    }

    const tenants = await db.getAllAsync<Tenant>(
      `SELECT * FROM tenants WHERE status != 'Suspended' AND user_id = ? AND deleted_at IS NULL`,
      [userId]
    );

    let processed = 0;

    for (const tenant of tenants) {
      try {
        await this.scheduleAllForTenant(tenant, userId, settings, db);
        processed++;
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          actionType: 'SMART_SCHEDULER_TENANT_ERROR',
          tenantId: tenant.tenant_id,
          userId
        });
      }
    }

    // Contract expiry check (runs for all tenants including suspended ones)
    const allTenants = await db.getAllAsync<Tenant>(`SELECT * FROM tenants WHERE user_id = ? AND deleted_at IS NULL`, [userId]);
    for (const tenant of allTenants) {
      await this.scheduleContractExpiry(tenant, userId, settings, db).catch(() => {});
    }

    // Monthly digest on the 1st
    await this.scheduleMonthlyDigest(tenants, userId, settings, db).catch(() => {});

    Logger.info('SmartScheduler: scan complete', {
      actionType: 'SMART_SCHEDULER_COMPLETE',
      processed,
    });
  }

  // ── Per-tenant: EARLY_WARNING, REMINDER, DUE_TODAY, OVERDUE ──────────────
  static async scheduleAllForTenant(
    tenant: Tenant,
    userId: string,
    settings: Awaited<ReturnType<typeof Database.getSettings>>,
    db: SQLite.SQLiteDatabase
  ): Promise<void> {
    if (!settings) return;

    const nextDueDateStr = await getTenantNextDueDate(tenant.tenant_id, userId, db);
    const dueDate = new Date(nextDueDateStr);
    dueDate.setHours(0, 0, 0, 0);

    const now = today0();
    const daysUntil = daysBetween(now, dueDate);
    const currency = settings.currency ?? 'UGX';
    const reminderTime = settings.reminder_time ?? '09:00';
    const dueDateFormatted = formatDate(dueDate);

    const extra: TemplateExtra = { daysUntilDue: daysUntil, dueDateFormatted, currency };

    // EARLY_WARNING — 7 days out (always, regardless of user setting)
    if (daysUntil > 0 && daysUntil <= 7) {
      const key = dedupKey('EARLY_WARNING', tenant.tenant_id, nextDueDateStr);
      if (!(await isAlreadyScheduled(db, key))) {
        const trigger = buildTriggerAt(
          new Date(dueDate.getTime() - 7 * 86_400_000),
          reminderTime
        );
        if (trigger > new Date()) {
          await scheduleRich('EARLY_WARNING', tenant, extra, trigger);
          await markScheduled(db, key);
        }
      }
    }

    // REMINDER — user-configured N days before due
    const reminderDaysBefore = settings.reminder_days_before_due ?? 3;
    if (daysUntil > 0 && daysUntil <= reminderDaysBefore) {
      const key = dedupKey('REMINDER', tenant.tenant_id, nextDueDateStr);
      if (!(await isAlreadyScheduled(db, key))) {
        const trigger = buildTriggerAt(
          new Date(dueDate.getTime() - reminderDaysBefore * 86_400_000),
          reminderTime
        );
        if (trigger > new Date()) {
          await scheduleRich('REMINDER', tenant, extra, trigger);
          await markScheduled(db, key);
        }
      }
    }

    // DUE_TODAY — on the due date itself
    if (daysUntil === 0) {
      const key = dedupKey('DUE_TODAY', tenant.tenant_id, nextDueDateStr);
      if (!(await isAlreadyScheduled(db, key))) {
        const trigger = buildTriggerAt(new Date(), reminderTime);
        if (trigger > new Date()) {
          await scheduleRich('DUE_TODAY', tenant, extra, trigger);
        } else {
          // If reminder time already passed today, fire in 2 minutes
          const soon = new Date(Date.now() + 2 * 60_000);
          await scheduleRich('DUE_TODAY', tenant, extra, soon);
        }
        await markScheduled(db, key);
      }
    }

    // OVERDUE — fires halfway to the auto-suspend threshold
    const autoSuspendDays = settings.auto_suspend_days ?? 30;
    const overdueFireDay = Math.max(1, Math.floor(autoSuspendDays / 2));
    const daysOverdue = daysBetween(dueDate, now); // positive if past due

    if (daysOverdue > 0 && daysOverdue >= overdueFireDay) {
      const key = dedupKey('OVERDUE', tenant.tenant_id, nextDueDateStr);
      if (!(await isAlreadyScheduled(db, key))) {
        const overdueExtra: TemplateExtra = { daysOverdue, dueDateFormatted, currency };
        const soon = new Date(Date.now() + 3 * 60_000); // 3 minutes from now
        await scheduleRich('OVERDUE', tenant, overdueExtra, soon);
        await markScheduled(db, key);
      }
    }
  }

  // ── CONTRACT_EXPIRY ───────────────────────────────────────────────────────
  static async scheduleContractExpiry(
    tenant: Tenant,
    userId: string,
    settings: Awaited<ReturnType<typeof Database.getSettings>>,
    db: SQLite.SQLiteDatabase
  ): Promise<void> {
    if (!settings || !tenant.contract_end_date) return;

    const expiryDate = new Date(tenant.contract_end_date);
    expiryDate.setHours(0, 0, 0, 0);
    const daysUntilExpiry = daysBetween(today0(), expiryDate);
    const contractReminderDays = settings.contract_reminder_days ?? 30;

    if (daysUntilExpiry < 0 || daysUntilExpiry > contractReminderDays) return;

    const key = dedupKey('CONTRACT_EXPIRY', tenant.tenant_id, tenant.contract_end_date);
    if (await isAlreadyScheduled(db, key)) return;

    const extra: TemplateExtra = {
      daysUntilExpiry,
      expiryDateFormatted: formatDate(expiryDate),
      currency: settings.currency ?? 'UGX',
    };

    const trigger = buildTriggerAt(
      new Date(expiryDate.getTime() - contractReminderDays * 86_400_000),
      settings.reminder_time ?? '09:00'
    );

    const fireTrigger = trigger > new Date() ? trigger : new Date(Date.now() + 5 * 60_000);
    await scheduleRich('CONTRACT_EXPIRY', tenant, extra, fireTrigger, 'announcements');
    await markScheduled(db, key);
  }

  // ── MONTHLY_DIGEST — fires on the 1st of the month ─────────────────────
  static async scheduleMonthlyDigest(
    tenants: Tenant[],
    userId: string,
    settings: Awaited<ReturnType<typeof Database.getSettings>>,
    db: SQLite.SQLiteDatabase
  ): Promise<void> {
    if (!settings) return;

    const now = new Date();
    const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthTag = `${firstOfNextMonth.getFullYear()}-${String(firstOfNextMonth.getMonth() + 1).padStart(2, '0')}`;
    const key = `MONTHLY_DIGEST__${monthTag}`;

    if (await isAlreadyScheduled(db, key)) return;

    const paidCount = tenants.filter((t) => t.status === 'Paid').length;
    const overdueCount = tenants.filter((t) => t.status === 'Overdue').length;

    // We use a dummy tenant for MONTHLY_DIGEST as it's landlord-level
    const digestTenant = { name: '', room_number: '', monthly_rent: 0 } as Tenant;
    const extra: TemplateExtra = {
      currency: settings.currency ?? 'UGX',
      digestSummary: {
        totalTenants: tenants.length,
        paidCount,
        overdueCount,
        totalCollected: tenants
          .filter((t) => t.status === 'Paid')
          .reduce((sum, t) => sum + t.monthly_rent, 0),
      },
    };

    const trigger = buildTriggerAt(firstOfNextMonth, settings.reminder_time ?? '08:00');
    await scheduleRich('MONTHLY_DIGEST', digestTenant, extra, trigger, 'announcements');
    await markScheduled(db, key);
  }

  // ── BROADCAST — landlord sends a one-off message right now ───────────────
  static async broadcastNotification(title: string, body: string): Promise<void> {
    Logger.info('Broadcasting notification', {
      actionType: 'BROADCAST',
      title,
    });

    const db = await getDB();

    try {
      // Fire immediately (5 seconds for foreground apps to see it)
      const trigger = new Date(Date.now() + 5_000);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `📢 ${title}`,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          color: NotificationTemplates.BROADCAST.accentColour,
          data: { tier: 'BROADCAST', timestamp: new Date().toISOString() },
          ...(Platform.OS === 'android' ? { channelId: 'announcements' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger,
        } as Notifications.NotificationTriggerInput,
      });

      // Record in dedup table for audit
      if (db) {
        const key = `BROADCAST__${Date.now()}`;
        await markScheduled(db, key);
      }

      Logger.info('Broadcast sent', { actionType: 'BROADCAST_SENT', title });
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        actionType: 'BROADCAST_FAILED',
        title,
      });
      throw err;
    }
  }

  // ── DEV ONLY: send every tier immediately for testing ────────────────────
  static async __devFireAllTiersNow(tenant: Tenant): Promise<void> {
    if (!__DEV__) return;

    const extra: TemplateExtra = {
      daysUntilDue: 7,
      daysOverdue: 3,
      daysUntilExpiry: 30,
      dueDateFormatted: formatDate(new Date()),
      expiryDateFormatted: formatDate(new Date()),
      currency: 'UGX',
      digestSummary: { totalTenants: 5, paidCount: 3, overdueCount: 1, totalCollected: 1_500_000 },
    };

    const tiers: NotificationTier[] = [
      'EARLY_WARNING', 'REMINDER', 'DUE_TODAY', 'OVERDUE', 'CONTRACT_EXPIRY',
    ];

    for (let i = 0; i < tiers.length; i++) {
      const trigger = new Date(Date.now() + (i + 1) * 8_000); // stagger by 8s
      await scheduleRich(tiers[i], tenant, extra, trigger);
    }

    await SmartScheduler.broadcastNotification(
      'Test Broadcast',
      'This is a test announcement from your landlord app.'
    );

    Logger.debug('DEV: all notification tiers fired', { actionType: 'DEV_FIRE_ALL_TIERS' });
  }
}
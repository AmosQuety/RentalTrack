// services/notifications.ts — Phase 6: structured logging + hybrid network-aware scheduler
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { Alert, Platform } from 'react-native';
import { getTenantNextDueDate, initializeDatabase, Database } from '../db/database';
import { captureException } from './logger/monitoring';
import { Logger } from './logger/index';

// ─── optional NetInfo (gracefully degraded if not installed) ─────────────────
let netInfoAvailable = false;
let getNetInfo: (() => Promise<{ isConnected: boolean | null }>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const NetInfo = require('@react-native-community/netinfo');
  getNetInfo = NetInfo.fetch;
  netInfoAvailable = true;
} catch {
  // NetInfo not installed — fall back to local-only scheduling
}

async function isOnline(): Promise<boolean> {
  if (!netInfoAvailable || !getNetInfo) return false;
  try {
    const state = await getNetInfo();
    return state.isConnected === true;
  } catch {
    return false;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

let db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  await initializeDatabase();
  return Database.getDb();
}

// Configure notification handler — shown even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService {
  private static initialized = false;

  // ─── Initialise ────────────────────────────────────────────────────────────
  static async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      Logger.info('Initialising notifications…', { actionType: 'NOTIFICATION_INIT' });

      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          Logger.warn('Notification permission denied by user', {
            actionType: 'NOTIFICATION_PERMISSION_DENIED',
          });
          Alert.alert(
            'Notifications Disabled',
            'Please enable notifications in your device settings to receive rent reminders.',
            [{ text: 'OK' }]
          );
          return false;
        }
      } else {
        Logger.warn('Not a physical device — notifications may not work properly', {
          actionType: 'NOTIFICATION_INIT',
        });
      }

      await Notifications.setNotificationCategoryAsync('RENT_REMINDER', [
        {
          identifier: 'MARK_PAID',
          buttonTitle: '💰 Mark as Paid',
          options: { isDestructive: false, isAuthenticationRequired: false },
        },
        {
          identifier: 'SNOOZE_DAY',
          buttonTitle: '⏰ Snooze 1 Day',
          options: { isDestructive: false, isAuthenticationRequired: false },
        },
      ]);
      
      // Setup Android Channels
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('rent-reminders', {
          name: 'Rent Reminders',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#3B82F6',
          sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('announcements', {
          name: 'Announcements',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 150],
          lightColor: '#10B981',
          sound: 'default',
        });
      }

      this.initialized = true;
      Logger.info('Notifications initialised successfully', { actionType: 'NOTIFICATION_INIT' });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'NOTIFICATION_INIT_FAILED' });
      return false;
    }
  }

  // ─── Core scheduler ────────────────────────────────────────────────────────
  static async scheduleNotification(
    title: string,
    body: string,
    trigger: Notifications.NotificationTriggerInput,
    data: Record<string, unknown> = {}
  ): Promise<string | null> {
    try {
      if (!this.initialized) await this.initialize();

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { ...data, timestamp: new Date().toISOString() },
          categoryIdentifier: 'RENT_REMINDER',
        },
        trigger,
      });

      Logger.info('Notification scheduled', {
        actionType: 'NOTIFICATION_SCHEDULED',
        notificationId,
      });
      return notificationId;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'NOTIFICATION_SCHEDULE_FAILED', title });
      if (__DEV__) {
        Alert.alert(`[DEV] Notification Error`, `${title}\n${body}\n\nError: ${error}`);
      }
      return null;
    }
  }

  // ─── Hybrid: schedule for all upcoming due dates ───────────────────────────
  /**
   * Hybrid scheduler:
   *   • Online  → logs intent for server-side push (stub; extend when backend push is live)
   *   • Offline → schedules local Expo notification
   *
   * This prevents duplication: idempotency is enforced inside `createReminder`.
   */
  static async scheduleUpcomingReminders(userId: string): Promise<void> {
    try {
      Logger.info(`Checking upcoming due dates for ${userId}…`, {
        actionType: 'REMINDER_SCAN_START',
      });

      const dbInstance = await getDB();

      const online = await isOnline();
      Logger.info(`Network state: ${online ? 'online' : 'offline'}`, {
        actionType: 'NETWORK_CHECK',
      });

      const tenants = await dbInstance.getAllAsync<{
        tenant_id: number;
        name: string;
        room_number: string;
        monthly_rent: number;
        status: string;
        start_date: string;
      }>('SELECT tenant_id, name, room_number, monthly_rent, status, start_date FROM tenants WHERE user_id = ? AND deleted_at IS NULL', [userId]);

      let scheduled = 0;
      let skipped = 0;

      for (const tenant of tenants) {
        try {
            const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, userId, dbInstance);
            const dueDate = new Date(nextDueDate);

            if (dueDate > new Date()) {
              if (online) {
                // Server-push path: flag for backend scheduler (extend when /schedule endpoint exists)
                Logger.info('Online — flagging tenant for server-side push scheduling', {
                  actionType: 'SERVER_PUSH_FLAGGED',
                  tenantId: tenant.tenant_id,
                });
                // Future implementation: await api.scheduleServerPush(tenant.tenant_id, nextDueDate);
                // Fall through to local scheduling as offline backup
              }
              await this.createReminder(tenant.tenant_id, userId, nextDueDate);
              scheduled++;
            } else {
            skipped++;
          }
        } catch (tenantError) {
          const err = tenantError instanceof Error ? tenantError : new Error(String(tenantError));
          captureException(err, {
            actionType: 'REMINDER_SCAN_TENANT_ERROR',
            tenantId: tenant.tenant_id,
          });
        }
      }

      Logger.info('Upcoming reminder scan complete', {
        actionType: 'REMINDER_SCAN_COMPLETE',
        scheduled,
        skipped,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'REMINDER_SCAN_FAILED' });
    }
  }

  // ─── Create a single reminder (idempotent) ─────────────────────────────────
  static async createReminder(
    tenantId: number,
    userId: string,
    dueDate: string,
    customMessage?: string
  ): Promise<void> {
    try {
      const dbInstance = await getDB();

      const tenant = await Database.getTenant(tenantId, userId);
      const settings = await Database.getSettings(userId);
      if (!tenant || !settings) throw new Error('Tenant or settings not found');

      if (!settings.notification_enabled) {
        Logger.debug('Notifications disabled in settings — skipping', {
          actionType: 'REMINDER_CREATE_SKIP',
          tenantId,
        });
        return;
      }

      const dueDateObj = new Date(dueDate);
      const reminderDate = new Date(dueDateObj);
      reminderDate.setDate(reminderDate.getDate() - settings.reminder_days_before_due);
      const [hours, minutes] = settings.reminder_time.split(':');
      reminderDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      if (reminderDate < new Date()) {
        Logger.debug('Reminder date is in the past — skipping', {
          actionType: 'REMINDER_CREATE_SKIP',
          tenantId,
          reminderDate: reminderDate.toISOString(),
        });
        return;
      }

      // IDEMPOTENCY: check for existing reminder
      const existing = await dbInstance.getFirstAsync<{ reminder_id: number; status: string }>(
        `SELECT reminder_id, status FROM reminders WHERE tenant_id = ? AND due_date = ? AND user_id = ?`,
        [tenantId, dueDate, userId]
      );

      if (existing) {
        if (existing.status === 'Pending' || existing.status === 'Sent') {
          Logger.debug(`Reminder already ${existing.status.toLowerCase()} — skipping duplicate`, {
            actionType: 'REMINDER_DUPLICATE_SKIP',
            tenantId,
            dueDate,
          });
          return;
        }
        await dbInstance.runAsync(`DELETE FROM reminders WHERE reminder_id = ?`, [
          existing.reminder_id,
        ]);
      }

      const message =
        customMessage ??
        `Rent payment of ${tenant.monthly_rent.toLocaleString()} UGX is due on ${this.formatDisplayDate(dueDate)}`;

      await dbInstance.runAsync(
        `INSERT INTO reminders (tenant_id, due_date, reminder_date, message, status, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, dueDate, reminderDate.toISOString(), message, 'Pending', userId]
      );

      await this.scheduleNotification(
        `💰 Rent Due Soon: ${tenant.name}`,
        `Room ${tenant.room_number} — ${message}`,
        {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
        },
        {
          tenantId,
          tenantName: tenant.name,
          roomNumber: tenant.room_number,
          amount: tenant.monthly_rent,
          dueDate,
          reminderDate: reminderDate.toISOString(),
          type: 'rent_reminder',
        }
      );

      Logger.info('Reminder created', {
        actionType: 'REMINDER_CREATED',
        tenantId,
        tenantName: tenant.name,
        dueDate,
        reminderDate: reminderDate.toISOString(),
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'REMINDER_CREATE_FAILED', tenantId });
      throw err;
    }
  }

  private static formatDisplayDate(isoDate: string): string {
    const d = new Date(isoDate);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  // ─── Snooze ────────────────────────────────────────────────────────────────
  static async snoozeReminder(
    tenantId: number,
    userId: string,
    originalDueDate: string,
    snoozeDays = 1
  ): Promise<void> {
    try {
      const dbInstance = await getDB();

      const tenant = await Database.getTenant(tenantId, userId);
      const settings = await Database.getSettings(userId);
      if (!tenant || !settings) throw new Error('Tenant or settings not found');

      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + snoozeDays);
      snoozeDate.setHours(parseInt(settings.reminder_time.split(':')[0], 10));
      snoozeDate.setMinutes(parseInt(settings.reminder_time.split(':')[1], 10));
      snoozeDate.setSeconds(0, 0);

      const message = `⏰ Snoozed — Rent due for ${tenant.name} (Room ${tenant.room_number})`;

      await dbInstance.runAsync(
        `INSERT INTO reminders (tenant_id, due_date, reminder_date, message, status, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, originalDueDate, snoozeDate.toISOString(), message, 'Pending', userId]
      );

      await this.scheduleNotification(
        `⏰ Reminder: ${tenant.name}`,
        message,
        {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: snoozeDate,
        },
        {
          tenantId,
          tenantName: tenant.name,
          roomNumber: tenant.room_number,
          amount: tenant.monthly_rent,
          dueDate: originalDueDate,
          type: 'snoozed_reminder',
          snoozedUntil: snoozeDate.toISOString(),
        }
      );

      Logger.info('Reminder snoozed', {
        actionType: 'REMINDER_SNOOZED',
        tenantId,
        snoozeDays,
        snoozedUntil: snoozeDate.toISOString(),
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'REMINDER_SNOOZE_FAILED', tenantId });
      throw err;
    }
  }

  // ─── Cancel ────────────────────────────────────────────────────────────────
  static async cancelReminders(tenantId: number, userId: string): Promise<void> {
    try {
      const dbInstance = await getDB();

      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      let canceledCount = 0;
      for (const n of scheduled) {
        if ((n.content.data as Record<string, unknown>)?.tenantId === tenantId) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
          canceledCount++;
        }
      }

      await dbInstance.runAsync(
        `UPDATE reminders SET status = 'Cancelled' WHERE tenant_id = ? AND status = 'Pending' AND user_id = ?`,
        [tenantId, userId]
      );

      Logger.info('Reminders cancelled', {
        actionType: 'REMINDER_CANCELLED',
        tenantId,
        canceledCount,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'REMINDER_CANCEL_FAILED', tenantId });
    }
  }

  // ─── Check pending ─────────────────────────────────────────────────────────
  static async checkPendingReminders(userId: string): Promise<void> {
    try {
      const dbInstance = await getDB();

      const today = new Date().toISOString().split('T')[0];
      const pending = await dbInstance.getAllAsync<{ reminder_id: number; name: string; room_number: string }>(
        `SELECT r.reminder_id, t.name, t.room_number
         FROM reminders r
         JOIN tenants t ON r.tenant_id = t.tenant_id
         WHERE date(r.reminder_date) <= date(?) AND r.status = 'Pending' AND r.user_id = ?
         ORDER BY r.reminder_date ASC`,
        [today, userId]
      );

      Logger.info(`Found ${pending.length} pending reminder(s) to mark sent`, {
        actionType: 'REMINDER_CHECK',
        count: pending.length,
      });

      for (const reminder of pending) {
        try {
          await dbInstance.runAsync(
            `UPDATE reminders SET status = 'Sent' WHERE reminder_id = ?`,
            [reminder.reminder_id]
          );
        } catch (updateError) {
          const err = updateError instanceof Error ? updateError : new Error(String(updateError));
          captureException(err, {
            actionType: 'REMINDER_STATUS_UPDATE_FAILED',
            reminderId: reminder.reminder_id,
          });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'REMINDER_CHECK_FAILED' });
    }
  }

  // ─── Utility ───────────────────────────────────────────────────────────────
  static async getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'NOTIFICATION_GET_ALL_FAILED' });
      return [];
    }
  }

  static async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      Logger.info('All scheduled notifications cancelled', {
        actionType: 'NOTIFICATION_CANCEL_ALL',
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { actionType: 'NOTIFICATION_CANCEL_ALL_FAILED' });
    }
  }

  static setupNotificationResponseHandler(
    handler: (response: Notifications.NotificationResponse) => void
  ): () => void {
    const sub = Notifications.addNotificationResponseReceivedListener(handler);
    Logger.debug('Notification response handler registered', {
      actionType: 'NOTIFICATION_HANDLER_SETUP',
    });
    return () => sub.remove();
  }

  static setupForegroundNotificationHandler(
    handler: (notification: Notifications.Notification) => void
  ): () => void {
    const sub = Notifications.addNotificationReceivedListener(handler);
    Logger.debug('Foreground notification handler registered', {
      actionType: 'NOTIFICATION_HANDLER_SETUP',
    });
    return () => sub.remove();
  }
}
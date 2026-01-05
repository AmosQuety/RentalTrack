// services/notifications.ts
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { Alert, Platform } from 'react-native';
import { getTenantNextDueDate } from '../db/database';


let db: any = null;

async function getDB(): Promise<SQLite.SQLiteDatabase | null> {
  if (!db && Platform.OS !== 'web') {
    const SQLite = await import('expo-sqlite');
    db = SQLite.openDatabaseSync('RentReminderDB');
  }
  return db as SQLite.SQLiteDatabase;
}

// Configure notification handler - Shows notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,    // For when app is in foreground
    shouldShowList: true,      // For notification center
  }),
});

export class NotificationService {
  private static initialized = false;

  static async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      console.log('🔔 Initializing notifications...');

      // Request permissions (only on real devices)
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.log('🔕 Notification permissions denied');
          Alert.alert(
            'Notifications Disabled',
            'Please enable notifications in your device settings to receive rent reminders.',
            [{ text: 'OK' }]
          );
          return false;
        }
      } else {
        console.log('⚠️ Not a physical device - notifications may not work properly');
      }

      // Setup notification categories with actionable buttons
      await Notifications.setNotificationCategoryAsync('RENT_REMINDER', [
        {
          identifier: 'MARK_PAID',
          buttonTitle: '💰 Mark as Paid',
          options: {
            isDestructive: false,
            isAuthenticationRequired: false,
          },
        },
        {
          identifier: 'SNOOZE_DAY',
          buttonTitle: '⏰ Snooze 1 Day',
          options: {
            isDestructive: false,
            isAuthenticationRequired: false,
          },
        },
      ]);

      this.initialized = true;
      console.log('✅ Notifications initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Notification initialization failed:', error);
      return false;
    }
  }

  static async scheduleNotification(
    title: string,
    body: string,
    trigger: Notifications.NotificationTriggerInput,
    data: any = {}
  ): Promise<string | null> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            ...data,
            timestamp: new Date().toISOString(),
          },
          categoryIdentifier: 'RENT_REMINDER',
        },
        trigger,
      });

      console.log(`✅ Notification scheduled: ${notificationId}`);
      console.log(`📅 Scheduled for: ${trigger}`);
      return notificationId;
    } catch (error) {
      console.error('❌ Failed to schedule notification:', error);
      
      // Better error handling for production
      if (!__DEV__) {
        // Log to your error tracking service (e.g., Sentry)
        console.error('PRODUCTION ERROR - Notification scheduling failed:', {
          title,
          body,
          trigger,
          error: error instanceof Error ? error.message : String(error)
        });
      } else {
        // Show alert in development
        Alert.alert(`[DEV] Notification Error`, `${title}\n${body}\n\nError: ${error}`);
      }
      
      return null;
    }
  }

  // Add this method to the NotificationService class
static async scheduleUpcomingReminders(): Promise<void> {
  try {
    console.log('🔄 Checking for upcoming due dates to schedule reminders...');
    
    // const Database = (await import('../db/database')).Database;
    const dbInstance = await getDB();
    
    if (!dbInstance) {
      console.warn('⚠️ Database not available for scheduling reminders');
      return;
    }
    
    // Get all tenants with their next due dates
    const tenants = await dbInstance.getAllAsync<{
      tenant_id: number;
      name: string;
      room_number: string;
      monthly_rent: number;
      status: string;
      start_date: string;
    }>('SELECT tenant_id, name, room_number, monthly_rent, status, start_date FROM tenants');
    
    for (const tenant of tenants) {
      try {
        // Get tenant's current next due date
        const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, dbInstance);
        const dueDate = new Date(nextDueDate);
        const today = new Date();
        
        // Check if due date is in the future
        if (dueDate > today) {
          // Check if a reminder already exists for this due date
          const existingReminder = await dbInstance.getFirstAsync<{ reminder_id: number }>(
            `SELECT reminder_id FROM reminders 
             WHERE tenant_id = ? AND due_date = ? AND status = 'Pending'`,
            [tenant.tenant_id, nextDueDate]
          );
          
          // If no reminder exists, create one
          if (!existingReminder) {
            await this.createReminder(tenant.tenant_id, nextDueDate);
            console.log(`✅ Scheduled reminder for ${tenant.name} due on ${nextDueDate}`);
          }
        }
      } catch (tenantError) {
        console.error(`❌ Error processing tenant ${tenant.tenant_id}:`, tenantError);
      }
    }
    
    console.log('✅ Upcoming reminders scheduling completed');
  } catch (error) {
    console.error('❌ Error scheduling upcoming reminders:', error);
  }
}

  static async createReminder(
    tenantId: number,
    dueDate: string,
    customMessage?: string
  ): Promise<void> {
    try {
      // Import Database methods
      const Database = (await import('../db/database')).Database;
      const dbInstance = await getDB();
      
      if (!dbInstance) {
        throw new Error('Database not initialized');
      }
      
      const tenant = await Database.getTenant(tenantId);
      const settings = await Database.getSettings();

      if (!tenant || !settings) {
        throw new Error('Tenant or settings not found');
      }

      if (!settings.notification_enabled) {
        console.log('🔕 Notifications disabled in settings');
        return;
      }

      // Calculate reminder date based on settings
      const dueDateObj = new Date(dueDate);
      const reminderDate = new Date(dueDateObj);
      reminderDate.setDate(reminderDate.getDate() - settings.reminder_days_before_due);

      // Set reminder time from settings
      const [hours, minutes] = settings.reminder_time.split(':');
      reminderDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      // Skip if reminder date is in the past
      if (reminderDate < new Date()) {
        console.log('⏩ Reminder date in past, skipping');
        return;
      }

      // Create clear, informative message
      const message = customMessage || 
        `Rent payment of ${tenant.monthly_rent.toLocaleString()} UGX is due on ${this.formatDisplayDate(dueDate)}`;

      // Insert reminder into database
      await dbInstance.runAsync(
        `INSERT INTO reminders (tenant_id, due_date, reminder_date, message, status) 
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, dueDate, reminderDate.toISOString(), message, 'Pending']
      );

      // Schedule the actual notification
      await this.scheduleNotification(
          `💰 Rent Due Soon: ${tenant.name}`,
            `Room ${tenant.room_number} - Rent payment of ${tenant.monthly_rent.toLocaleString()} UGX is due on ${this.formatDisplayDate(dueDate)}`,
            { date: reminderDate },
        {
          tenantId,
          tenantName: tenant.name,
          roomNumber: tenant.room_number,
          amount: tenant.monthly_rent,
          dueDate: dueDate,
          reminderDate: reminderDate.toISOString(),
          type: 'rent_reminder'
        }
      );

      console.log(`✅ Reminder created for ${tenant.name} (Room ${tenant.room_number})`);
      console.log(`   Due: ${new Date(dueDate).toLocaleDateString()}`);
      console.log(`   Reminder: ${reminderDate.toLocaleDateString()} at ${settings.reminder_time}`);
    } catch (error) {
      console.error('❌ Failed to create reminder:', error);
      throw error;
    }
  }

  // Add this helper method to the NotificationService class:
private static formatDisplayDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}



  static async snoozeReminder(
    tenantId: number,
    originalDueDate: string,
    snoozeDays: number = 1
  ): Promise<void> {
    try {
      const Database = (await import('../db/database')).default;
      const dbInstance = await getDB();
      
      if (!dbInstance) {
        throw new Error('Database not initialized');
      }
      
      const tenant = await Database.getTenant(tenantId);
      const settings = await Database.getSettings();

      if (!tenant || !settings) {
        throw new Error('Tenant or settings not found');
      }

      // Calculate snooze date
      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + snoozeDays);
      snoozeDate.setHours(parseInt(settings.reminder_time.split(':')[0], 10));
      snoozeDate.setMinutes(parseInt(settings.reminder_time.split(':')[1], 10));
      snoozeDate.setSeconds(0);
      snoozeDate.setMilliseconds(0);

      const message = `⏰ Reminder snoozed - Rent payment due for ${tenant.name} (Room ${tenant.room_number})`;

      // Insert snoozed reminder
      await dbInstance.runAsync(
        `INSERT INTO reminders (tenant_id, due_date, reminder_date, message, status) 
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, originalDueDate, snoozeDate.toISOString(), message, 'Pending']
      );

      // Schedule notification
      await this.scheduleNotification(
        `⏰ Reminder: ${tenant.name}`,
        message,
        { date: snoozeDate },
        {
          tenantId,
          tenantName: tenant.name,
          roomNumber: tenant.room_number,
          amount: tenant.monthly_rent,
          dueDate: originalDueDate,
          type: 'snoozed_reminder',
          snoozedUntil: snoozeDate.toISOString()
        }
      );

      console.log(`✅ Reminder snoozed for ${tenant.name} until ${snoozeDate.toLocaleString()}`);
    } catch (error) {
      console.error('❌ Failed to snooze reminder:', error);
      throw error;
    }
  }

  static async cancelReminders(tenantId: number): Promise<void> {
    try {
      const dbInstance = await getDB();
      
      if (!dbInstance) {
        console.warn('⚠️ Database not available for canceling reminders');
        return;
      }

      // Cancel all scheduled notifications for this tenant
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      let canceledCount = 0;
      
      for (const notification of scheduledNotifications) {
        if (notification.content.data?.tenantId === tenantId) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
          canceledCount++;
        }
      }

      // Update database - mark reminders as cancelled
      await dbInstance.runAsync(
        `UPDATE reminders SET status = 'Cancelled' 
         WHERE tenant_id = ? AND status = 'Pending'`,
        [tenantId]
      );

      console.log(`✅ Cancelled ${canceledCount} scheduled notification(s) for tenant ${tenantId}`);
    } catch (error) {
      console.error('❌ Failed to cancel reminders:', error);
    }
  }

  static async checkPendingReminders(): Promise<void> {
    try {
      const dbInstance = await getDB();
      
      if (!dbInstance) {
        console.log('⚠️ Database not available for checking reminders');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      
      // Get pending reminders that should have been sent
      let pendingReminders: any[] = [];
      try {
        const result = await dbInstance.getAllAsync(
          `SELECT r.*, t.name, t.room_number 
           FROM reminders r 
           JOIN tenants t ON r.tenant_id = t.tenant_id 
           WHERE date(r.reminder_date) <= date(?) AND r.status = 'Pending'
           ORDER BY r.reminder_date ASC`,
          [today]
        );
        
        pendingReminders = result || [];
      } catch (queryError) {
        console.error('❌ Query error in checkPendingReminders:', queryError);
        return;
      }

      console.log(`🔍 Found ${pendingReminders.length} pending reminder(s) to process`);

      // Mark them as sent
      for (const reminder of pendingReminders) {
        try {
          await dbInstance.runAsync(
            'UPDATE reminders SET status = ? WHERE reminder_id = ?',
            ['Sent', reminder.reminder_id]
          );
          console.log(`✅ Marked reminder as sent for ${reminder.name} (Room ${reminder.room_number})`);
        } catch (updateError) {
          console.error('❌ Error updating reminder status:', updateError);
        }
      }
    } catch (error) {
      console.error('❌ Error checking pending reminders:', error);
    }
  }

  // Get all scheduled notifications (useful for debugging)
  static async getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('❌ Failed to get scheduled notifications:', error);
      return [];
    }
  }

  // Cancel all notifications (useful for testing/debugging)
  static async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('✅ Cancelled all scheduled notifications');
    } catch (error) {
      console.error('❌ Failed to cancel all notifications:', error);
    }
  }

  // Setup notification response handler - THIS IS CRITICAL FOR ACTIONABLE NOTIFICATIONS
  // This should be called in your root layout component
  static setupNotificationResponseHandler(
    handler: (response: Notifications.NotificationResponse) => void
  ): () => void {
    const subscription = Notifications.addNotificationResponseReceivedListener(handler);
    console.log('✅ Notification response handler registered');
    return () => {
      subscription.remove();
      console.log('🔕 Notification response handler removed');
    };
  }

  // Setup foreground notification listener (for when app is open)
  static setupForegroundNotificationHandler(
    handler: (notification: Notifications.Notification) => void
  ): () => void {
    const subscription = Notifications.addNotificationReceivedListener(handler);
    console.log('✅ Foreground notification handler registered');
    return () => {
      subscription.remove();
      console.log('🔕 Foreground notification handler removed');
    };
  }
}
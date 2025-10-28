// services/notifications.ts
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { Alert } from 'react-native';

// Get database instance directly
const db = SQLite.openDatabaseSync('RentReminderDB');

// Configure notification handler - UPDATED
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

      // Request permissions
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.log('🔕 Notification permissions denied');
          return false;
        }
      }

      // Setup notification categories for actions
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
      return notificationId;
    } catch (error) {
      console.error('❌ Failed to schedule notification:', error);
      
      // Fallback for development - show alert
      if (__DEV__) {
        Alert.alert(`[DEV] ${title}`, body);
      }
      
      return null;
    }
  }

  static async createReminder(
    tenantId: number,
    dueDate: string,
    customMessage?: string
  ): Promise<void> {
    try {
      // Import Database methods
      const Database = (await import('../db/database')).default;
      
      const tenant = await Database.getTenant(tenantId);
      const settings = await Database.getSettings();

      if (!tenant || !settings) {
        throw new Error('Tenant or settings not found');
      }

      if (!settings.notification_enabled) {
        console.log('🔕 Notifications disabled in settings');
        return;
      }

      // Calculate reminder date
      const dueDateObj = new Date(dueDate);
      const reminderDate = new Date(dueDateObj);
      reminderDate.setDate(reminderDate.getDate() - settings.reminder_days_before_due);

      // Set reminder time
      const [hours, minutes] = settings.reminder_time.split(':');
      reminderDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      // Skip if reminder date is in the past
      if (reminderDate < new Date()) {
        console.log('⏩ Reminder date in past, skipping');
        return;
      }

      const message = customMessage || 
        `Rent payment of UGX ${tenant.monthly_rent} due for ${tenant.name} (Room ${tenant.room_number})`;

      // Insert reminder directly using db
      await db.runAsync(
        `INSERT INTO reminders (tenant_id, due_date, reminder_date, message, status) 
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, dueDate, reminderDate.toISOString(), message, 'Pending']
      );

      // Schedule notification
      await this.scheduleNotification(
        `💰 Rent Due: ${tenant.name}`,
        message,
        { date: reminderDate },
        {
          tenantId,
          tenantName: tenant.name,
          roomNumber: tenant.room_number,
          amount: tenant.monthly_rent,
          dueDate: dueDate,
          type: 'rent_reminder'
        }
      );

      console.log(`✅ Reminder created for ${tenant.name} on ${reminderDate.toISOString()}`);
    } catch (error) {
      console.error('❌ Failed to create reminder:', error);
      throw error;
    }
  }

  // NEW: Snooze reminder
  static async snoozeReminder(
    tenantId: number,
    originalDueDate: string,
    snoozeDays: number = 1
  ): Promise<void> {
    try {
      const Database = (await import('../db/database')).default;
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

      const message = `⏰ Snoozed: Rent reminder for ${tenant.name} (Room ${tenant.room_number})`;

      // Insert snoozed reminder
      await db.runAsync(
        `INSERT INTO reminders (tenant_id, due_date, reminder_date, message, status) 
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, originalDueDate, snoozeDate.toISOString(), message, 'Pending']
      );

      // Schedule notification
      await this.scheduleNotification(
        `⏰ Snoozed: ${tenant.name}`,
        message,
        { date: snoozeDate },
        {
          tenantId,
          tenantName: tenant.name,
          roomNumber: tenant.room_number,
          dueDate: originalDueDate,
          type: 'snoozed_reminder'
        }
      );

      console.log(`✅ Reminder snoozed for ${tenant.name} until ${snoozeDate.toISOString()}`);
    } catch (error) {
      console.error('❌ Failed to snooze reminder:', error);
      throw error;
    }
  }

  static async cancelReminders(tenantId: number): Promise<void> {
    try {
      // Cancel scheduled notifications for this tenant
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      for (const notification of scheduledNotifications) {
        if (notification.content.data?.tenantId === tenantId) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        }
      }

      // Update database using direct db access
      await db.runAsync(
        `UPDATE reminders SET status = 'Cancelled' 
         WHERE tenant_id = ? AND status = 'Pending'`,
        [tenantId]
      );

      console.log(`✅ Cancelled reminders for tenant ${tenantId}`);
    } catch (error) {
      console.error('❌ Failed to cancel reminders:', error);
    }
  }

  static async checkPendingReminders(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get pending reminders using direct db access
      let pendingReminders: any[] = [];
      try {
        const result = await db.getAllAsync(
          `SELECT r.*, t.name, t.room_number 
           FROM reminders r 
           JOIN tenants t ON r.tenant_id = t.tenant_id 
           WHERE date(r.reminder_date) <= date(?) AND r.status = 'Pending'`,
          [`${today} 23:59:59`]
        );
        
        pendingReminders = result || [];
      } catch (queryError) {
        console.error('❌ Query error in checkPendingReminders:', queryError);
        return;
      }

      console.log(`🔍 Found ${pendingReminders.length} pending reminders`);

      for (const reminder of pendingReminders) {
        try {
          await db.runAsync(
            'UPDATE reminders SET status = ? WHERE reminder_id = ?',
            ['Sent', reminder.reminder_id]
          );
          console.log(`✅ Marked reminder as sent for ${reminder.name}`);
        } catch (updateError) {
          console.error('❌ Error updating reminder status:', updateError);
        }
      }
    } catch (error) {
      console.error('❌ Error checking pending reminders:', error);
    }
  }

  // Setup notification response handler
  static setupNotificationResponseHandler(
    handler: (response: Notifications.NotificationResponse) => void
  ): () => void {
    const subscription = Notifications.addNotificationResponseReceivedListener(handler);
    return () => subscription.remove();
  }
}

// services/notifications.ts
// Logic:
// Handles Expo notification setup, permissions, and scheduling.
// Configures a notification category with actionable buttons ("Mark as Paid", "Snooze"). This is an advanced and very useful feature.
// createReminder: Integrates with database settings to determine reminder date and message.
// snoozeReminder: Excellent addition to handle snoozing directly from a notification.
// cancelReminders: Good for cleaning up when a tenant is deleted or pays.
// checkPendingReminders: Checks for overdue reminders in the database and marks them as 'Sent'.
// Improvements for Production:
// Actionable Notifications (CRITICAL):
// You've set up the categories and actions, but the code to handle the response from these actions (Notifications.addNotificationResponseReceivedListener) is not shown in this file or elsewhere. This is the second biggest missing piece for production readiness.
// When a user taps "Mark as Paid" or "Snooze 1 Day" from a notification, your app needs to receive this event and trigger the corresponding recordPayment or snoozeReminder logic. This typically involves navigating to a specific screen, pre-filling data, and then executing the database operation.
// Foreground vs. Background Handling: Your Notifications.setNotificationHandler handles how notifications are presented when the app is in the foreground. You also need to consider how the app behaves when opened from a notification when it was killed or in the background. The setupNotificationResponseHandler is the right step, but its implementation needs to be present in your root app component.
// Error Handling for scheduleNotification: The Alert.alert in __DEV__ is useful, but ensure robust logging and user feedback in production if notifications fail.
// db.runAsync vs. Database.addReminder: You're directly using db.runAsync to insert reminders. While fine, if Database had a addReminder method that also emitted an event, it might be more consistent with the useDatabase hook pattern.
// Time Zone Issues: new Date().toISOString() is fine for storing, but when scheduleNotification uses { date: reminderDate }, ensure reminderDate is correct in the user's local time zone for scheduling purposes. Expo Notifications handles this fairly well, but be aware.
// Recurring Reminders: Your current system creates one-off reminders for the next due date. A robust system might need to manage recurring reminders or a chain of reminders more explicitly.
// Notification Content: Make sure notification messages are clear and contain all necessary information.
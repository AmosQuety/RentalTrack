// services/notifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert, ToastAndroid } from 'react-native';
import Database from '../db/database';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
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
        `Rent payment of ${settings.currency} ${tenant.monthly_rent} due for ${tenant.name} (Room ${tenant.room_number})`;

      // Store reminder in database
      await Database.executeQuery(
        `INSERT INTO reminders (tenant_id, due_date, reminder_date, message) 
         VALUES (?, ?, ?, ?)`,
        [tenantId, dueDate, reminderDate.toISOString(), message]
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
          currency: settings.currency,
          dueDate: dueDate,
          type: 'rent_reminder'
        }
      );

      console.log(`✅ Reminder created for ${tenant.name}`);
    } catch (error) {
      console.error('❌ Failed to create reminder:', error);
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

      // Update database
      await Database.executeQuery(
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
      
      // Use a try-catch and ensure we get an array
      let pendingReminders: any[] = [];
      try {
        const result = await Database.executeQuery(
          `SELECT r.*, t.name, t.room_number 
           FROM reminders r 
           JOIN tenants t ON r.tenant_id = t.tenant_id 
           WHERE date(r.reminder_date) <= date(?) AND r.status = 'Pending'`,
          [`${today} 23:59:59`]
        );
        
        // Handle different possible return types from executeQuery
        if (Array.isArray(result)) {
          pendingReminders = result;
        } else if (result && typeof result === 'object') {
          // If it returns an object with rows, extract them
          pendingReminders = result.rows || result._array || [];
        } else {
          // If it's null or undefined, use empty array
          pendingReminders = [];
        }
      } catch (queryError) {
        console.error('❌ Query error in checkPendingReminders:', queryError);
        return;
      }

      console.log(`🔍 Found ${pendingReminders.length} pending reminders`);

      for (const reminder of pendingReminders) {
        try {
          await Database.executeQuery(
            'UPDATE reminders SET status = ? WHERE reminder_id = ?',
            ['Sent', reminder.reminder_id || reminder.id]
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
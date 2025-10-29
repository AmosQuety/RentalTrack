// components/NotificationDebug.tsx (Optional - for testing)
// Add this to your settings screen to test notifications

import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NotificationService } from '../services/notifications';

export function NotificationDebugPanel() {
  const [scheduledNotifications, setScheduledNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadScheduledNotifications = async () => {
    setIsLoading(true);
    try {
      const notifications = await NotificationService.getAllScheduledNotifications();
      setScheduledNotifications(notifications);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScheduledNotifications();
  }, []);

  const testNotification = async () => {
    try {
      await NotificationService.scheduleNotification(
        '🧪 Test Notification',
        'This is a test notification. Tap to open the app!',
        { seconds: 5 }, // 5 seconds from now
        {
          tenantId: 1,
          tenantName: 'Test Tenant',
          roomNumber: 'Test Room',
          amount: 50000,
          dueDate: new Date().toISOString().split('T')[0],
          type: 'test_reminder'
        }
      );
      Alert.alert('✅ Success', 'Test notification will appear in 5 seconds');
    } catch (error) {
      Alert.alert('❌ Error', 'Failed to schedule test notification');
    }
  };

  const testImmediateNotification = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🧪 Immediate Test',
          body: 'This notification appears immediately!',
          data: { test: true }
        },
        trigger: null // Immediate
      });
      Alert.alert('✅ Success', 'Check your notifications!');
    } catch (error) {
      Alert.alert('❌ Error', 'Failed to send immediate notification');
    }
  };

  const cancelAllNotifications = async () => {
    Alert.alert(
      '⚠️ Cancel All Notifications',
      'Are you sure you want to cancel all scheduled notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Cancel All',
          style: 'destructive',
          onPress: async () => {
            await NotificationService.cancelAllNotifications();
            await loadScheduledNotifications();
            Alert.alert('✅ Done', 'All notifications cancelled');
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔔 Notification Debug</Text>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity onPress={testImmediateNotification} style={styles.button}>
          <Text style={styles.buttonText}>Test Immediate</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={testNotification} style={styles.button}>
          <Text style={styles.buttonText}>Test in 5s</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={loadScheduledNotifications} style={styles.button}>
          <Text style={styles.buttonText}>Refresh</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={cancelAllNotifications} style={[styles.button, styles.dangerButton]}>
          <Text style={[styles.buttonText, styles.dangerText]}>Cancel All</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Scheduled Notifications: {scheduledNotifications.length}
      </Text>

      <ScrollView style={styles.notificationsList}>
        {scheduledNotifications.map((notif, index) => (
          <View key={notif.identifier} style={styles.notificationItem}>
            <Text style={styles.notifTitle}>
              {index + 1}. {notif.content.title}
            </Text>
            <Text style={styles.notifBody}>{notif.content.body}</Text>
            <Text style={styles.notifTrigger}>
              Trigger: {JSON.stringify(notif.trigger, null, 2)}
            </Text>
            <Text style={styles.notifData}>
              Data: {JSON.stringify(notif.content.data, null, 2)}
            </Text>
          </View>
        ))}

        {scheduledNotifications.length === 0 && !isLoading && (
          <Text style={styles.emptyText}>No scheduled notifications</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#F9FAFB',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1F2937',
  },
  buttonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  dangerButton: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerText: {
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#374151',
  },
  notificationsList: {
    maxHeight: 400,
  },
  notificationItem: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  notifBody: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  notifTrigger: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  notifData: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    paddingVertical: 32,
  },
});
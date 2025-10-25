// app/(tabs)/reminders.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useDatabase } from '../../hooks/use-db';
import { Reminder } from '../../libs/types';

export default function RemindersScreen() {
  const { isInitialized, getUpcomingReminders } = useDatabase();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadReminders = async () => {
    if (!isInitialized) return;
    
    try {
      const upcomingReminders = await getUpcomingReminders(30);
      setReminders(upcomingReminders);
    } catch (error) {
      console.error('Failed to load reminders:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReminders();
    setRefreshing(false);
  };

  useEffect(() => {
    loadReminders();
  }, [isInitialized]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return '#F59E0B';
      case 'Sent': return '#10B981';
      case 'Cancelled': return '#6B7280';
      default: return '#6B7280';
    }
  };

  if (!isInitialized) {
    return (
      <View style={styles.centerContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Upcoming Reminders</Text>
      </View>

      {reminders.map(reminder => (
        <View 
          key={reminder.reminder_id}
          style={styles.reminderCard}
        >
          <View style={styles.reminderHeader}>
            <View style={styles.tenantInfo}>
              <Text style={styles.tenantName}>{reminder.name}</Text>
              <Text style={styles.tenantRoom}>Room {reminder.room_number}</Text>
            </View>
            <View 
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(reminder.status) + '20' }
              ]}
            >
              <Text 
                style={[
                  styles.statusText,
                  { color: getStatusColor(reminder.status) }
                ]}
              >
                {reminder.status}
              </Text>
            </View>
          </View>
          
          <Text style={styles.message}>{reminder.message}</Text>
          
          <View style={styles.datesContainer}>
            <Text style={styles.dateText}>
              Due: {new Date(reminder.due_date).toLocaleDateString()}
            </Text>
            <Text style={styles.dateText}>
              Reminder: {new Date(reminder.reminder_date).toLocaleDateString()}
            </Text>
          </View>
        </View>
      ))}

      {reminders.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No upcoming reminders.{'\n'}Reminders will appear here when rent is due soon.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  reminderCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  reminderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  tenantRoom: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  message: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  datesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyState: {
    backgroundColor: '#F3F4F6',
    padding: 32,
    borderRadius: 8,
    alignItems: 'center',
    margin: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});
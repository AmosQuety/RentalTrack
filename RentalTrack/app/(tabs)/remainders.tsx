// app/(tabs)/reminders.tsx
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDatabase } from '../../hooks/use-db';
import { useAuth } from '../../context/AuthContext';
import { Reminder } from '../../libs/types';
import { Logger } from '../../services/logger/index';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';

export default function RemindersScreen() {
  const { isInitialized, getUpcomingReminders } = useDatabase();
  const { user } = useAuth();
  const { colors, typography, isDark } = useTheme();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadReminders = async () => {
    if (!isInitialized || !user) return;
    
    try {
      const upcomingReminders = await getUpcomingReminders(user.user_id, 30);
      setReminders(upcomingReminders);
    } catch (error) {
      Logger.error('Failed to load reminders', { actionType: "REMINDERS_LOAD_ERROR", error });
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

  const formatDisplayDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return colors.warning;
      case 'Sent': return colors.success;
      case 'Cancelled': return colors.textSecondary;
      default: return colors.textSecondary;
    }
  };

  if (!isInitialized) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      }
    >
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.fonts.bold }]}>Upcoming Reminders</Text>
      </View>

      {reminders.map(reminder => (
        <Card 
          key={reminder.reminder_id}
          style={styles.reminderCard}
        >
          <View style={styles.reminderHeader}>
            <View style={styles.tenantInfo}>
              <Text style={[styles.tenantName, { color: colors.text, fontFamily: typography.fonts.semibold }]}>{reminder.name}</Text>
              <Text style={[styles.tenantRoom, { color: colors.textSecondary, fontFamily: typography.fonts.medium }]}>Room {reminder.room_number}</Text>
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
          
          <Text style={[styles.message, { color: colors.text, fontFamily: typography.fonts.regular }]}>{reminder.message}</Text>
          
          <View style={styles.datesContainer}>
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
               Due: {formatDisplayDate(reminder.due_date)}
            </Text>
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
              Reminder: {formatDisplayDate(reminder.reminder_date)}
            </Text>
          </View>
        </Card>
      ))}

      {reminders.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: isDark ? colors.card : '#F3F4F6' }]}>
          <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
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
    margin: 16,
    marginBottom: 0,
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

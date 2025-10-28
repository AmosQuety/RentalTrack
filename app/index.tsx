// app/index.tsx
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useDatabase } from '../hooks/use-db';

export default function Index() {
  const { isInitialized } = useDatabase();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isInitialized) {
      // Add small delay for smooth transition
      setTimeout(() => setIsReady(true), 500);
    }
  }, [isInitialized]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return <Redirect href="/(tabs)" />;
}


// Rent Logic Summary & Key Production Improvements
// The core rent logic revolves around:
// Tenant monthly_rent and start_date: These are the base.
// payments table: Records actual payments.
// next_due_date in payments: Crucial for tracking when the next payment is expected.
// calculateTenantStatus: Determines if a tenant is 'Paid', 'Due Soon', or 'Overdue' based on the next_due_date.
// tenants.status column: Stores the calculated status.
// The two most critical missing pieces for production:
// Automated Tenant Status Updates:
// Problem: The tenants.status is only updated when a new payment is recorded. If a tenant doesn't pay, their status won't automatically transition from 'Paid' -> 'Due Soon' -> 'Overdue'.
// Solution: You need a periodic background task (e.g., once a day, or when the app launches/resumes) that iterates through all tenants. For each tenant, it should:
// Determine their actual next_due_date by querying the latest payment record.
// Recalculate their status using calculateTenantStatus based on this next_due_date and the current date.
// Update the tenants.status column in the database if it has changed.
// This task can also be responsible for creating new reminders if one is not already scheduled for the upcoming due date.
// Handling Notification Responses:
// Problem: You've created actionable notifications, but the code to react to a user tapping "Mark as Paid" or "Snooze" is not present.
// Solution: In your root component (e.g., _layout.tsx or App.tsx), you need to:
// Subscribe to Notifications.addNotificationResponseReceivedListener.
// Inside the listener, check response.actionIdentifier.
// If MARK_PAID: Navigate to the record-payment screen, pre-fill tenantId and amount (from response.notification.request.content.data), then trigger the payment recording logic.
// If SNOOZE_DAY: Call NotificationService.snoozeReminder with the appropriate tenantId and dueDate (also from response.notification.request.content.data).
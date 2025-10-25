// app/_layout.tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NotificationService } from '../services/notifications';

export default function RootLayout() {
  useEffect(() => {
    // Setup notification handler
    const removeHandler = NotificationService.setupNotificationResponseHandler((response) => {
      const { actionIdentifier, notification } = response;
      const { tenantId, tenantName } = notification.request.content.data;

      console.log('Notification action:', actionIdentifier, 'for tenant:', tenantName);

      // Handle different actions
      switch (actionIdentifier) {
        case 'MARK_PAID':
          // Navigate to record payment screen
          console.log('Navigate to record payment for:', tenantId);
          break;
        case 'SNOOZE_DAY':
          // Snooze logic would go here
          console.log('Snooze reminder for:', tenantName);
          break;
        default:
          // Default tap action
          console.log('Notification tapped for:', tenantName);
          break;
      }
    });

    return removeHandler;
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tenant-details" options={{ title: 'Tenant Details' }} />
        <Stack.Screen name="record-payment" options={{ title: 'Record Payment' }} />
        <Stack.Screen name="add-tenant" options={{ title: 'Add Tenant' }} />
      </Stack>
    </>
  );
}




// # Install EAS CLI
// npm install -g @expo/eas-cli

// # Login to Expo
// eas login

// # Configure project
// eas build:configure

// # Build for Android
// eas build --profile development --platform android

// # Install on your device and test!
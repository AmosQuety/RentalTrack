// app/_layout.tsx

import * as NavigationBar from 'expo-navigation-bar';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotificationService } from '../services/notifications';


export default function RootLayout() {
  const router = useRouter();

   useEffect(() => {
    // Configure Android navigation bar
    const setupNavigationBar = async () => {
      try {
        if (Platform.OS === 'android') {
          await NavigationBar.setBackgroundColorAsync('#FFFFFF'); // White background
          await NavigationBar.setButtonStyleAsync('dark'); // Dark buttons (back, home, recent apps)
        }
      } catch (error) {
        console.log('Navigation bar setup error:', error);
      }
    };

    setupNavigationBar();
  }, []);

  useEffect(() => {
    const removeHandler = NotificationService.setupNotificationResponseHandler(async (response) => {
      const { actionIdentifier, notification } = response;
      const { tenantId, tenantName, dueDate } = notification.request.content.data;

      console.log('Notification action:', actionIdentifier, 'for tenant:', tenantName);

      switch (actionIdentifier) {
        case 'MARK_PAID':
          // Navigate to record payment screen
          router.push(`/record-payment?tenantId=${tenantId}`);
          break;
          
        case 'SNOOZE_DAY':
          // Snooze for 1 day
          try {
            await NotificationService.snoozeReminder(tenantId, dueDate, 1);
            Alert.alert('✅ Snoozed', `Reminder for ${tenantName} snoozed for 1 day`);
          } catch (error) {
            console.error('Failed to snooze:', error);
            Alert.alert('Error', 'Failed to snooze reminder');
          }
          break;
          
        default:
          // Default tap - go to tenant details
          router.push(`/tenant-details?tenantId=${tenantId}`);
          break;
      }
    });

     

    return removeHandler;


  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tenant-details" options={{ title: 'Tenant Details' }} />
        <Stack.Screen name="record-payment" options={{ title: 'Record Payment' }}  />
        <Stack.Screen name="add-tenant" options={{ title: 'Add Tenant' }} />
        <Stack.Screen name="edit-tenant" options={{ title: 'Edit Tenant' }} />
      </Stack>
    </SafeAreaProvider>
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
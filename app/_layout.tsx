// app/_layout.tsx
import * as NavigationBar from 'expo-navigation-bar';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotificationService } from '../services/notifications';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // EAS Update: Check for updates on app start
    const checkForUpdates = async () => {
      if (__DEV__) {
        // Don't check for updates in development
        return;
      }

      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          Alert.alert(
            'Update Available',
            'A new version of the app is available. Would you like to download it now?',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Update Now',
                onPress: async () => {
                  await Updates.fetchUpdateAsync();
                  Alert.alert(
                    'Update Downloaded',
                    'The update has been downloaded. Restart the app to apply changes.',
                    [
                      {
                        text: 'Restart Now',
                        onPress: () => Updates.reloadAsync(),
                      },
                    ]
                  );
                },
              },
            ]
          );
        }
      } catch (error) {
        console.log('Error checking for updates:', error);
      }
    };

    checkForUpdates();
  }, []);

  useEffect(() => {
    // Navigation Bar Styling with Error Handling
    const styleNavigationBar = async () => {
      if (Platform.OS === 'android') {
        try {
          // Check if NavigationBar methods are available
          if (NavigationBar && NavigationBar.setBackgroundColorAsync) {
            await NavigationBar.setBackgroundColorAsync('#FFFFFF');
            await NavigationBar.setButtonStyleAsync('dark');
            console.log('✅ Navigation bar styled successfully');
          }
        } catch (error) {
          console.log('⚠️ Navigation bar styling not available (likely Expo Go):', error);
          // This is fine - just means we're in Expo Go
        }
      }
    };

    styleNavigationBar();
  }, []);

  useEffect(() => {
    // EAS Update: Listen for updates in background
    const updateListener = Updates.addListener((updateEvent) => {
      if (updateEvent.type === Updates.UpdateEventType.UPDATE_AVAILABLE) {
        console.log('New update available in background');
        // You can choose to auto-update or notify user
      }
    });

    return () => {
      updateListener.remove();
    };
  }, []);

  useEffect(() => {
    const removeHandler = NotificationService.setupNotificationResponseHandler(async (response) => {
      const { actionIdentifier, notification } = response;
      const { tenantId, tenantName, dueDate, amount } = notification.request.content.data;

      console.log('🔔 Notification action:', actionIdentifier, 'for tenant:', tenantName);

      switch (actionIdentifier) {
        case 'MARK_PAID':
          // Navigate to record payment with pre-filled data
          router.push({
            pathname: '/record-payment',
            params: { 
              tenantId: tenantId.toString(),
              prefillAmount: amount?.toString()
            }
          });
          break;
          
        case 'SNOOZE_DAY':
          try {
            await NotificationService.snoozeReminder(parseInt(tenantId), dueDate, 1);
            Alert.alert('✅ Snoozed', `Reminder for ${tenantName} snoozed for 1 day`);
          } catch (error) {
            console.error('Failed to snooze:', error);
            Alert.alert('❌ Error', 'Failed to snooze reminder');
          }
          break;
          
        default:
          // Default tap - go to tenant details
          router.push(`/tenant-details?tenantId=${tenantId}`);
          break;
      }
    });

    return removeHandler;
  }, [router]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent={false} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tenant-details" options={{ title: 'Tenant Details' }} />
        <Stack.Screen name="record-payment" options={{ title: 'Record Payment' }} />
        <Stack.Screen name="add-tenant" options={{ title: 'Add Tenant' }} />
        <Stack.Screen name="edit-tenant" options={{ title: 'Edit Tenant' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
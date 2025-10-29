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

  // EAS Updates: Check for updates on app start
  useEffect(() => {
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
                  try {
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
                  } catch (error) {
                    console.error('Failed to fetch update:', error);
                    Alert.alert('Update Failed', 'Could not download the update. Please try again later.');
                  }
                },
              },
            ]
          );
        }
      } catch (error) {
        console.log('⚠️ Error checking for updates:', error);
      }
    };

    checkForUpdates();
  }, []);

  // Navigation Bar Styling (Android only)
  useEffect(() => {
    const styleNavigationBar = async () => {
      if (Platform.OS === 'android') {
        try {
          if (NavigationBar && NavigationBar.setBackgroundColorAsync) {
            await NavigationBar.setBackgroundColorAsync('#FFFFFF');
            await NavigationBar.setButtonStyleAsync('dark');
            console.log('✅ Navigation bar styled successfully');
          }
        } catch (error) {
          console.log('⚠️ Navigation bar styling not available (edge-to-edge or Expo Go)');
        }
      }
    };

    styleNavigationBar();
  }, []);

  // EAS Updates: Listen for background updates (production only)
  useEffect(() => {
    if (__DEV__) {
      return; // Skip in development
    }

    try {
      const updateListener = Updates.addListener((updateEvent) => {
        if (updateEvent.type === Updates.UpdateEventType.UPDATE_AVAILABLE) {
          console.log('📦 New update available in background');
          // Optionally show a subtle notification to the user
        } else if (updateEvent.type === Updates.UpdateEventType.ERROR) {
          console.error('❌ Update error:', updateEvent.message);
        }
      });

      return () => {
        updateListener.remove();
      };
    } catch (error) {
      console.log('⚠️ Updates listener not available:', error);
    }
  }, []);

  // CRITICAL: Handle notification actions (Mark as Paid, Snooze, etc.)
  useEffect(() => {
    const removeHandler = NotificationService.setupNotificationResponseHandler(async (response) => {
      const { actionIdentifier, notification } = response;
      const { tenantId, tenantName, dueDate, amount } = notification.request.content.data;

      console.log('🔔 Notification action received:', {
        action: actionIdentifier,
        tenant: tenantName,
        tenantId
      });

      try {
        switch (actionIdentifier) {
          case 'MARK_PAID':
            // Navigate to record payment screen with pre-filled data
            console.log('💰 Opening payment screen for tenant:', tenantName);
            router.push({
              pathname: '/record-payment',
              params: { 
                tenantId: tenantId.toString(),
                prefillAmount: amount?.toString() || ''
              }
            });
            break;
            
          case 'SNOOZE_DAY':
            // Snooze the reminder for 1 day
            console.log('⏰ Snoozing reminder for:', tenantName);
            try {
              await NotificationService.snoozeReminder(
                parseInt(tenantId.toString()), 
                dueDate, 
                1
              );
              Alert.alert(
                '✅ Reminder Snoozed', 
                `Reminder for ${tenantName} has been snoozed for 1 day.`,
                [{ text: 'OK' }]
              );
            } catch (snoozeError) {
              console.error('Failed to snooze:', snoozeError);
              Alert.alert(
                '❌ Snooze Failed', 
                'Could not snooze the reminder. Please try again.',
                [{ text: 'OK' }]
              );
            }
            break;
            
          default:
            // Default action - user tapped the notification (not an action button)
            console.log('👆 Opening tenant details for:', tenantName);
            router.push(`/tenant-details?tenantId=${tenantId}`);
            break;
        }
      } catch (error) {
        console.error('❌ Error handling notification action:', error);
        Alert.alert(
          'Error',
          'Failed to process notification action. Please try again.',
          [{ text: 'OK' }]
        );
      }
    });

    return removeHandler;
  }, [router]);

  // Optional: Handle notifications when app is in foreground
  useEffect(() => {
    const removeForegroundHandler = NotificationService.setupForegroundNotificationHandler((notification) => {
      console.log('📬 Notification received in foreground:', notification.request.content.title);
      
      // The notification will still be shown due to our handler configuration
      // but you could add custom logic here if needed
    });

    return removeForegroundHandler;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent={false} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="tenant-details" 
          options={{ 
            title: 'Tenant Details',
            headerShown: true,
            headerBackTitle: 'Back'
          }} 
        />
        <Stack.Screen 
          name="record-payment" 
          options={{ 
            title: 'Record Payment',
            headerShown: true,
            headerBackTitle: 'Back'
          }} 
        />
        <Stack.Screen 
          name="add-tenant" 
          options={{ 
            title: 'Add Tenant',
            headerShown: true,
            headerBackTitle: 'Back'
          }} 
        />
        <Stack.Screen 
          name="edit-tenant" 
          options={{ 
            title: 'Edit Tenant',
            headerShown: true,
            headerBackTitle: 'Back'
          }} 
        />
      </Stack>
    </SafeAreaProvider>
  );
}
// app/_layout.tsx
import * as NavigationBar from 'expo-navigation-bar';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, AppStateStatus, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotificationService } from '../services/notifications';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Update check retry configuration
const UPDATE_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds
  timeout: 10000, // 10 seconds
};

export default function RootLayout() {
  const router = useRouter();
  const [isUpdateChecking, setIsUpdateChecking] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);

  // Enhanced update check with retry logic
  const checkForUpdates = async (retryCount = 0): Promise<void> => {
    if (__DEV__ || isUpdateChecking) {
      return;
    }

    setIsUpdateChecking(true);

    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Update check timeout')), UPDATE_RETRY_CONFIG.timeout)
      );

      const updatePromise = Updates.checkForUpdateAsync();
      const update = await Promise.race([updatePromise, timeoutPromise]);

      if (update.isAvailable) {
        console.log('📦 Update available, downloading...');
        
        // Download update silently first
        try {
          await Updates.fetchUpdateAsync();
          console.log('✅ Update downloaded successfully');
          
          // Show restart dialog with better UX
          Alert.alert(
            'Update Ready',
            'A new version has been downloaded. Restart now to enjoy the latest features?',
            [
              {
                text: 'Later',
                style: 'cancel',
                onPress: () => {
                  // Schedule reminder for next app launch
                  console.log('Update deferred by user');
                },
              },
              {
                text: 'Restart Now',
                style: 'default',
                onPress: () => {
                  Updates.reloadAsync().catch(error => {
                    console.error('Failed to reload app:', error);
                    // Fallback: show manual restart instruction
                    Alert.alert(
                      'Restart Required',
                      'Please completely close and reopen the app to apply the update.',
                      [{ text: 'OK' }]
                    );
                  });
                },
              },
            ]
          );
        } catch (downloadError) {
          console.error('❌ Update download failed:', downloadError);
          // Don't show error to user for failed download - will retry next time
        }
      } else {
        console.log('✅ App is up to date');
      }
    } catch (error) {
      console.error(`❌ Update check failed (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < UPDATE_RETRY_CONFIG.maxRetries - 1) {
        console.log(`🔄 Retrying update check in ${UPDATE_RETRY_CONFIG.retryDelay}ms...`);
        setTimeout(() => checkForUpdates(retryCount + 1), UPDATE_RETRY_CONFIG.retryDelay);
      } else {
        console.log('⚠️ All update check attempts failed');
      }
    } finally {
      setIsUpdateChecking(false);
    }
  };

  // Load resources and prepare app
  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts, make API calls, etc.
        await Promise.all([
          // Add your font loading here if any
          // Font.loadAsync(...),
          
          // Initial update check (non-blocking)
          checkForUpdates().catch(error => {
            console.error('Initial update check failed:', error);
          }),
          
          // Simulate minimum splash screen time (optional)
          new Promise(resolve => setTimeout(resolve, 1000)),
        ]);
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  // Hide splash screen when app is ready
  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  // Don't render anything until app is ready
  if (!appIsReady) {
    return null;
  }

  // Check for updates when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Check for updates when app returns to foreground (with delay to avoid conflicts)
        setTimeout(() => {
          checkForUpdates();
        }, 1000);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  // Enhanced EAS Updates listener with better error handling
  useEffect(() => {
    if (__DEV__) {
      return;
    }

    let updateListener: any = null;

    const setupUpdateListener = () => {
      try {
        updateListener = Updates.addListener((updateEvent) => {
          switch (updateEvent.type) {
            case Updates.UpdateEventType.UPDATE_AVAILABLE:
              console.log('📦 Background update available');
              // Auto-download in background without user interaction
              Updates.fetchUpdateAsync().then(() => {
                console.log('✅ Background update downloaded successfully');
              }).catch(error => {
                console.error('❌ Background update download failed:', error);
              });
              break;

            case Updates.UpdateEventType.UPDATE_NOT_AVAILABLE:
              console.log('✅ No updates available (background check)');
              break;

            case Updates.UpdateEventType.ERROR:
              console.error('❌ Update error:', updateEvent.message);
              break;

            case Updates.UpdateEventType.NO_UPDATE_AVAILABLE:
              console.log('✅ No updates available');
              break;

            default:
              console.log('🔧 Unknown update event:', updateEvent.type);
          }
        });

        console.log('✅ EAS Updates listener registered');
      } catch (error) {
        console.error('❌ Failed to setup update listener:', error);
        
        // Retry listener setup after delay
        setTimeout(setupUpdateListener, 5000);
      }
    };

    setupUpdateListener();

    return () => {
      if (updateListener) {
        try {
          updateListener.remove();
          console.log('✅ EAS Updates listener removed');
        } catch (error) {
          console.error('❌ Error removing update listener:', error);
        }
      }
    };
  }, []);

  // Navigation Bar Styling (Android only) - unchanged
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

  // CRITICAL: Handle notification actions (Mark as Paid, Snooze, etc.) - unchanged
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

  // Optional: Handle notifications when app is in foreground - unchanged
  useEffect(() => {
    const removeForegroundHandler = NotificationService.setupForegroundNotificationHandler((notification) => {
      console.log('📬 Notification received in foreground:', notification.request.content.title);
    });

    return removeForegroundHandler;
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
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
      </View>
    </SafeAreaProvider>
  );
}
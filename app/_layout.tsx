// app/_layout.tsx - PRODUCTION-SAFE VERSION
import * as NavigationBar from 'expo-navigation-bar';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, AppStateStatus, Platform, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { NotificationService } from '../services/notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [isUpdateChecking, setIsUpdateChecking] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);

  const checkForUpdates = async (retryCount = 0): Promise<void> => {
    if (__DEV__ || isUpdateChecking) return;

    setIsUpdateChecking(true);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Update check timeout')), 10000)
      );

      const updatePromise = Updates.checkForUpdateAsync();
      const update = await Promise.race([updatePromise, timeoutPromise]);

      if (update.isAvailable) {
        console.log('📦 Update available, downloading...');
        
        try {
          await Updates.fetchUpdateAsync();
          console.log('✅ Update downloaded successfully');
          
          Alert.alert(
            'Update Ready',
            'A new version has been downloaded. Restart now to enjoy the latest features?',
            [
              {
                text: 'Later',
                style: 'cancel',
                onPress: () => {
                  console.log('Update deferred by user');
                },
              },
              {
                text: 'Restart Now',
                style: 'default',
                onPress: () => {
                  Updates.reloadAsync().catch(error => {
                    console.error('Failed to reload app:', error);
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
        }
      } else {
        console.log('✅ App is up to date');
      }
    } catch (error) {
      console.error(`❌ Update check failed (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < 2) {
        console.log(`🔄 Retrying update check in 2s...`);
        setTimeout(() => checkForUpdates(retryCount + 1), 2000);
      } else {
        console.log('⚠️ All update check attempts failed');
      }
    } finally {
      setIsUpdateChecking(false);
    }
  };

  useEffect(() => {
    async function prepare() {
      try {
        console.log('🚀 Preparing app...');
        
        // CRITICAL: Only check for updates, don't wait for it
        if (!__DEV__) {
          checkForUpdates().catch(error => {
            console.error('Initial update check failed:', error);
          });
        }
        
        // Minimum splash screen time
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ App prepared');
      } catch (e) {
        console.error('❌ App preparation failed:', e);
        setCriticalError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && !__DEV__) {
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

  useEffect(() => {
    if (__DEV__) return;

    let updateListener: any = null;

    const setupUpdateListener = () => {
      try {
        updateListener = Updates.addListener((updateEvent) => {
          switch (updateEvent.type) {
            case Updates.UpdateEventType.UPDATE_AVAILABLE:
              console.log('📦 Background update available');
              Updates.fetchUpdateAsync().then(() => {
                console.log('✅ Background update downloaded successfully');
              }).catch(error => {
                console.error('❌ Background update download failed:', error);
              });
              break;

            case Updates.UpdateEventType.ERROR:
              console.error('❌ Update error:', updateEvent.message);
              break;
          }
        });

        console.log('✅ EAS Updates listener registered');
      } catch (error) {
        console.error('❌ Failed to setup update listener:', error);
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
          console.log('⚠️ Navigation bar styling not available');
        }
      }
    };

    styleNavigationBar();
  }, []);

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

  useEffect(() => {
    const removeForegroundHandler = NotificationService.setupForegroundNotificationHandler((notification) => {
      console.log('📬 Notification received in foreground:', notification.request.content.title);
    });

    return removeForegroundHandler;
  }, []);

  if (!appIsReady) {
    return null;
  }

  if (criticalError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#EF4444' }}>
          🚨 Critical Error
        </Text>
        <Text style={{ textAlign: 'center', marginBottom: 20 }}>
          The app encountered a critical error during startup. Please restart the app.
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
          {criticalError}
        </Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
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
                headerShown: false,
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
    </ErrorBoundary>
  );
}
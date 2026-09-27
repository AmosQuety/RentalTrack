// app/_layout.tsx — Phase 6 Production-Safe Version
import { useDatabase } from '@/hooks/use-db';
import * as NavigationBar from 'expo-navigation-bar';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, AppStateStatus, Platform, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RepositoriesProvider } from '../repositories/RepositoryProvider';
import { Logger } from '../services/logger/index';
import { captureException, initErrorMonitoring } from '../services/logger/monitoring';
import { NotificationService } from '../services/notifications';
import { SmartScheduler } from '../services/notifications/SmartScheduler';
import { usePushToken } from '../services/notifications/usePushToken';
import { ThemeProvider } from '../theme/ThemeContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useSegments } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { isInitialized } = useDatabase();

  useEffect(() => {
    if (isLoading || !isInitialized) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/auth/login');
    } else if (user && inAuthGroup) {
      // Redirect to main app if already authenticated
      router.replace('/(tabs)');
    }
  }, [user, segments, isLoading, isInitialized]);

  // ─── Notification response handler ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    
    const remove = NotificationService.setupNotificationResponseHandler(async (response) => {
      const { actionIdentifier, notification } = response;
      const data = notification.request.content.data as {
        tenantId?: number | string;
        tenantName?: string;
        dueDate?: string;
        amount?: number | string;
      };
      const { tenantId, tenantName, dueDate, amount } = data;

      Logger.info('Notification action received', {
        actionType: 'NOTIFICATION_ACTION',
        action: actionIdentifier,
        tenantName,
        tenantId: Number(tenantId),
      });

      try {
        switch (actionIdentifier) {
          case 'MARK_PAID':
            router.push({
              pathname: '/record-payment',
              params: {
                tenantId: String(tenantId),
                prefillAmount: String(amount ?? ''),
              },
            });
            break;

          case 'SNOOZE_DAY':
            await NotificationService.snoozeReminder(Number(tenantId), user.user_id, dueDate ?? '', 1);
            Alert.alert(
              '✅ Reminder Snoozed',
              `Reminder for ${tenantName} snoozed for 1 day.`,
              [{ text: 'OK' }]
            );
            break;

          default:
            router.push(`/tenant-details?tenantId=${tenantId}`);
            break;
        }
      } catch (error) {
        captureException(
          error instanceof Error ? error : new Error(String(error)),
          { actionType: 'NOTIFICATION_ACTION_FAILED', action: actionIdentifier }
        );
        Alert.alert('Error', 'Failed to process notification action. Please try again.', [
          { text: 'OK' },
        ]);
      }
    });

    return remove;
  }, [router, user]);

  // ─── Foreground notification handler ──────────────────────────────────
  useEffect(() => {
    return NotificationService.setupForegroundNotificationHandler((notification) => {
      Logger.info('Notification received in foreground', {
        actionType: 'NOTIFICATION_FOREGROUND',
        title: notification.request.content.title ?? '(no title)',
      });
    });
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen
        name="tenant-details"
        options={{ title: 'Tenant Details', headerShown: true, headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="record-payment"
        options={{ title: 'Record Payment', headerShown: true, headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="add-tenant"
        options={{ title: 'Add Tenant', headerShown: false, headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="edit-tenant"
        options={{ title: 'Edit Tenant', headerShown: true, headerBackTitle: 'Back' }}
      />
    </Stack>
  );
}

// Initialise error monitoring as early as possible (before any component mounts)
initErrorMonitoring();

export default function RootLayout() {
  const router = useRouter();
  const [isUpdateChecking, setIsUpdateChecking] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);

  const { isInitialized } = useDatabase();

  // Register device push token with backend
  usePushToken();

  // ─── Global unhandled-promise rejection logger ──────────────────────────
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const err = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
      captureException(err, { actionType: 'UNHANDLED_PROMISE_REJECTION' });
    };

    if (typeof globalThis !== 'undefined') {
      (globalThis as unknown as Window).addEventListener?.('unhandledrejection', handleUnhandledRejection);
    }

    return () => {
      if (typeof globalThis !== 'undefined') {
        (globalThis as unknown as Window).removeEventListener?.('unhandledrejection', handleUnhandledRejection);
      }
    };
  }, []);

  // ─── OTA Update check ──────────────────────────────────────────────────
  const checkForUpdates = async (retryCount = 0): Promise<void> => {
    if (__DEV__ || isUpdateChecking) return;
    setIsUpdateChecking(true);

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Update check timeout')), 10_000)
      );
      const update = await Promise.race([Updates.checkForUpdateAsync(), timeoutPromise]);

      if (update.isAvailable) {
        Logger.info('OTA update available — downloading', { actionType: 'OTA_UPDATE_AVAILABLE' });
        try {
          await Updates.fetchUpdateAsync();
          Logger.info('OTA update downloaded', { actionType: 'OTA_UPDATE_DOWNLOADED' });
          Alert.alert(
            'Update Ready',
            'A new version has been downloaded. Restart now?',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Restart Now',
                style: 'default',
                onPress: () =>
                  Updates.reloadAsync().catch((err: Error) => {
                    captureException(err, { actionType: 'OTA_RELOAD_FAILED' });
                    Alert.alert('Restart Required', 'Please close and reopen the app.', [
                      { text: 'OK' },
                    ]);
                  }),
              },
            ]
          );
        } catch (downloadError) {
          captureException(
            downloadError instanceof Error ? downloadError : new Error(String(downloadError)),
            { actionType: 'OTA_DOWNLOAD_FAILED' }
          );
        }
      } else {
        Logger.debug('App is up to date', { actionType: 'OTA_UP_TO_DATE' });
      }
    } catch (error) {
      Logger.warn(`OTA check failed (attempt ${retryCount + 1})`, {
        actionType: 'OTA_CHECK_FAILED',
        retryCount,
      });
      if (retryCount < 2) {
        setTimeout(() => checkForUpdates(retryCount + 1), 2000);
      }
    } finally {
      setIsUpdateChecking(false);
    }
  };

  // ─── App startup ───────────────────────────────────────────────────────
  useEffect(() => {
    async function prepare() {
      try {
        Logger.info('App startup — preparing…', { actionType: 'APP_PREPARE_START' });
        if (!__DEV__) {
          checkForUpdates().catch((err: Error) =>
            captureException(err, { actionType: 'OTA_INITIAL_CHECK_FAILED' })
          );
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        Logger.info('App prepared', { actionType: 'APP_PREPARE_COMPLETE' });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        captureException(err, { actionType: 'APP_PREPARE_FAILED' });
        setCriticalError(err.message);
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  // ─── Splash screen ─────────────────────────────────────────────────────
  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) await SplashScreen.hideAsync();
  }, [appIsReady]);

  // ─── Resume update check ───────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && !__DEV__) {
        setTimeout(() => checkForUpdates(), 1000);
      }
    });
    return () => sub.remove();
  }, []);

  // ─── Background EAS Updates listener (SDK version-dependent) ───────────
  useEffect(() => {
    if (__DEV__) return;
    // expo-updates addListener / UpdateEventType are available from SDK 51+.
    // If your SDK version exposes them, un-comment the block below.
    // const sub = Updates.addListener((event) => { ... });
    // return () => sub.remove();
  }, []);

  // ─── Android navigation bar ────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        if (NavigationBar?.setBackgroundColorAsync) {
          await NavigationBar.setBackgroundColorAsync('#FFFFFF');
          await NavigationBar.setButtonStyleAsync('dark');
        }
      } catch {
        Logger.debug('Navigation bar styling not available', { actionType: 'NAV_BAR_STYLE' });
      }
    })();
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────
  if (!appIsReady) return null;

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
    <AuthProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <RepositoriesProvider>
            <SafeAreaProvider>
              <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
                <StatusBar style="auto" translucent={false} />
                <RootLayoutNav />
              </View>
            </SafeAreaProvider>
          </RepositoriesProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </AuthProvider>
  );
}

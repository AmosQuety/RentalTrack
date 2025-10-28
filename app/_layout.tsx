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
    if (Platform.OS === 'android') {
      
      NavigationBar.setBackgroundColorAsync('#FFFFFF');
      NavigationBar.setButtonStyleAsync('dark'); 
    }
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
            prefillAmount: amount?.toString() // Pass amount to pre-fill
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
      <StatusBar style="dark" 
       
        translucent={false} 
        />
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




// well , i already built for dev, but when i add this '// app/_layout.tsx
// import { useEffect } from 'react';
// import { Platform, Appearance } from 'react-native';
// import * as NavigationBar from 'expo-navigation-bar';

// export default function RootLayout() {
//   useEffect(() => {
//     if (Platform.OS === 'android') {
//       // This ONLY works in development builds
//       NavigationBar.setBackgroundColorAsync('#FFFFFF');
//       NavigationBar.setButtonStyleAsync('dark'); // or 'light'
//     }
//   }, []);

//   return (
//     // Your app content
//   );
// }' the app will fail . i had tried it before . for the status bar, it worked without needing any builds
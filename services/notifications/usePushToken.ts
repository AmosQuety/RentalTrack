// // services/notifications/usePushToken.ts
// import * as Device from 'expo-device';
// import * as Notifications from 'expo-notifications';
// import Constants from 'expo-constants';
// import { useEffect, useState } from 'react';
// import { Platform } from 'react-native';
// import { Logger } from '../logger/index';
// import { captureException } from '../logger/monitoring';

// const PUSH_TOKEN_KEY = 'EXPO_PUSH_TOKEN';
// const API_URL: string =
//   (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
//   process.env.EXPO_PUBLIC_API_URL ??
//   'http://localhost:3000';

// export function usePushToken(): string | null {
//   const [pushToken, setPushToken] = useState<string | null>(null);

//   useEffect(() => {
//     // 1. Check if physical device
//     if (!Device.isDevice) {
//       Logger.debug('Push token skipped — not a physical device', {
//         actionType: 'PUSH_TOKEN_SKIP',
//       });
//       return;
//     }

//     (async () => {
//       try {
//         // 2. Handle Permissions
//         const { status: existingStatus } = await Notifications.getPermissionsAsync();
//         let finalStatus = existingStatus;

//         if (existingStatus !== 'granted') {
//           const { status } = await Notifications.requestPermissionsAsync();
//           finalStatus = status;
//         }

//         if (finalStatus !== 'granted') {
//           Logger.warn('Push token: permission not granted', {
//             actionType: 'PUSH_TOKEN_PERMISSION_DENIED',
//           });
//           return;
//         }

//         // 3. Get Project ID (Required for EAS)
//         const projectId =
//           Constants.expoConfig?.extra?.eas?.projectId ??
//           Constants.easConfig?.projectId;

//         if (!projectId) {
//             Logger.warn('Push token: No projectId found in config', { actionType: 'PUSH_TOKEN_MISSING_ID' });
//         }

//         // 4. Get the Token
//         const tokenObj = await Notifications.getExpoPushTokenAsync({
//           projectId: projectId,
//         });
//         const token = tokenObj.data;

//         // ─── LOG FOR TESTING ──────────────────────────────────────────
//         // Copy this from your terminal to use in the Expo Push Tool!
//         console.log("🚀 YOUR EXPO PUSH TOKEN:", token);
//         // ──────────────────────────────────────────────────────────────

//         Logger.info('Push token registered', {
//           actionType: 'PUSH_TOKEN_REGISTERED',
//           platform: Platform.OS,
//         });

//         setPushToken(token);

//         // 5. Register with backend
//         try {
//           await fetch(`${API_URL}/push/token`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ token, platform: Platform.OS }),
//           });
//         } catch {
//           Logger.debug('Backend push token registration skipped (offline/local)', {
//             actionType: 'PUSH_TOKEN_BACKEND_SKIP',
//           });
//         }

//         // 6. Setup Android Channels
//         if (Platform.OS === 'android') {
//           await Notifications.setNotificationChannelAsync('rent-reminders', {
//             name: 'Rent Reminders',
//             importance: Notifications.AndroidImportance.MAX,
//             vibrationPattern: [0, 250, 250, 250],
//             lightColor: '#3B82F6',
//             sound: 'default',
//           });

//           await Notifications.setNotificationChannelAsync('announcements', {
//             name: 'Announcements',
//             importance: Notifications.AndroidImportance.HIGH,
//             vibrationPattern: [0, 150],
//             lightColor: '#10B981',
//             sound: 'default',
//           });
//         }
//       } catch (error) {
//         captureException(
//           error instanceof Error ? error : new Error(String(error)),
//           { actionType: 'PUSH_TOKEN_FAILED' }
//         );
//       }
//     })();
//   }, []);

//   return pushToken;
// }

// export { PUSH_TOKEN_KEY };

// services/notifications/usePushToken.ts
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Logger } from '../logger/index';
import { captureException } from '../logger/monitoring';

export function usePushToken(): string | null {
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    console.log("STEP 1: usePushToken Hook Mounted");

    (async () => {
      try {
        const isDevice = Device.isDevice;
        console.log("STEP 2: Is Physical Device?", isDevice);
        if (!isDevice) return;

        console.log("STEP 3: Requesting Permissions...");
        const { status } = await Notifications.requestPermissionsAsync();
        console.log("STEP 4: Permission Status:", status);
        if (status !== 'granted') return;

        console.log("STEP 5: Fetching Token...");
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        console.log("STEP 6: Project ID Found:", projectId);

        const tokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log("🚀 FINAL TOKEN:", tokenObj.data);
        
        setPushToken(tokenObj.data);

        // Setup Android Channels
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('rent-reminders', {
            name: 'Rent Reminders',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#3B82F6',
            sound: 'default',
          });

          await Notifications.setNotificationChannelAsync('announcements', {
            name: 'Announcements',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 150],
            lightColor: '#10B981',
            sound: 'default',
          });
        }
      } catch (error) {
        console.log("❌ ERROR IN HOOK:", error);
      }
    })();
  }, []);

  return pushToken;
}

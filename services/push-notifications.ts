import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { pushApi } from './api';

const isExpoGo = Constants.appOwnership === 'expo';

// Lazy load: static import would trigger DevicePushTokenAutoRegistration side effects
// at module load time even in Expo Go, crashing on SDK 53+.
const Notifications = !isExpoGo
  ? (require('expo-notifications') as typeof import('expo-notifications'))
  : null;

if (!isExpoGo) Notifications!.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
} as any);

/**
 * Requests permission, fetches the Expo push token, and registers it with the backend.
 * Returns the token string on success, or null if permission was denied / not a device.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo) {
    // Push notifications are not supported in Expo Go on SDK 53+
    return null;
  }
  if (!Device.isDevice) {
    // Simulators/emulators cannot receive push notifications
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications!.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications!.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B3A6B',
    });
  }

  const { status: existingStatus } = await Notifications!.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications!.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;

  let token: string;
  try {
    const result = await Notifications!.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    token = result.data;
  } catch {
    return null;
  }

  try {
    await pushApi.register(token);
  } catch {
    // Non-fatal: token still usable for local notification handling
  }

  return token;
}

/**
 * Removes the token from the backend (call on logout).
 */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await pushApi.remove(token);
  } catch {
    // Ignore errors during logout
  }
}

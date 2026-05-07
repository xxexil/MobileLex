// test-push.js
const { sendExpoPushNotification } = require('./expoPush');

// Replace with a real Expo push token from your device
const token = 'ExponentPushToken[PASTE_YOUR_TOKEN_HERE]';

sendExpoPushNotification(token, {
  title: 'Test Notification',
  body: 'This is a test push notification!',
  data: { custom: 'data' }
}).then(() => {
  console.log('Push sent!');
}).catch((err) => {
  console.error('Push failed:', err);
});

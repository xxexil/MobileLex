// backend/expoPush.js
const fetch = require('node-fetch');

async function sendExpoPushNotification(expoPushToken, message) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) return;
  const payload = {
    to: expoPushToken,
    sound: 'default',
    title: message.title || 'LexConnect',
    body: message.body,
    data: message.data || {},
  };
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

module.exports = { sendExpoPushNotification };
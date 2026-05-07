// Basic WebSocket server for real-time messaging
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 4050 });


const axios = require('axios');
// Set your Laravel API base URL (from .env or hardcoded for now)
const LARAVEL_API_BASE = process.env.LARAVEL_API_BASE || 'http://192.168.110.252:8000/api';


// Helper: get real-time stats from Laravel API
async function getStats() {
  try {
    // You must implement these endpoints in your Laravel API
    const [consultsRes, lawyersRes, groupsRes] = await Promise.all([
      axios.get(`${LARAVEL_API_BASE}/consults/count`),
      axios.get(`${LARAVEL_API_BASE}/lawyers/count`),
      axios.get(`${LARAVEL_API_BASE}/groups/count`),
    ]);
    return {
      consults: consultsRes.data.count,
      lawyers: lawyersRes.data.count,
      groups: groupsRes.data.count,
    };
  } catch (e) {
    return { consults: 0, lawyers: 0, groups: 0 };
  }
}

// Broadcast stats to all clients
async function broadcastStats() {
  const stats = await getStats();
  const payload = JSON.stringify({ type: 'stats_update', stats });
  for (const [, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}


// Map userId to { ws, lastActive, presence }
const clients = new Map();

// Presence timeouts (ms)
const IDLE_TIMEOUT = 60 * 1000; // 60s
const OFFLINE_TIMEOUT = 2 * 60 * 1000; // 2m

// Helper: broadcast presence to all clients
function broadcastPresence(userId, presence) {
  for (const [, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'presence',
        userId,
        presence,
      }));
    }
  }
}


wss.on('connection', (ws, req) => {
  let userId;
  let idleTimer = null;
  let offlineTimer = null;

  function setPresence(presence) {
    if (!userId) return;
    const client = clients.get(userId);
    if (client && client.presence !== presence) {
      client.presence = presence;
      broadcastPresence(userId, presence);
    }
  }

  function scheduleTimers() {
    if (idleTimer) clearTimeout(idleTimer);
    if (offlineTimer) clearTimeout(offlineTimer);
    idleTimer = setTimeout(() => setPresence('idle'), IDLE_TIMEOUT);
    offlineTimer = setTimeout(() => setPresence('offline'), OFFLINE_TIMEOUT);
  }

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'init' && data.userId) {
        userId = data.userId;
        clients.set(userId, { ws, lastActive: Date.now(), presence: 'online' });
        setPresence('online');
        scheduleTimers();
        // Send initial stats
        ws.send(JSON.stringify({ type: 'stats_update', stats: await getStats() }));
      } else {
        // Any message = user is active
        if (userId && clients.has(userId)) {
          clients.get(userId).lastActive = Date.now();
          setPresence('online');
          scheduleTimers();
        }
      }
      // Respond to stats request
      if (data.type === 'get_stats') {
        ws.send(JSON.stringify({ type: 'stats_update', stats: await getStats() }));
      }
        // After any group/user change, you may want to broadcast stats:
        // For demo, broadcast on every message (customize as needed)
        await broadcastStats();
      if (data.type === 'message') {
        // Group message delivery
        if (data.message && data.message.group_id) {
          // Fetch group participants from Laravel API
          try {
            const resp = await axios.get(`${LARAVEL_API_BASE}/groups/${data.message.group_id}/participants`);
            const participants = resp.data.participants || [];
            participants.forEach((gp) => {
              if (gp.user_id !== data.message.sender_id) {
                const target = clients.get(gp.user_id);
                if (target && target.ws.readyState === WebSocket.OPEN) {
                  target.ws.send(JSON.stringify({
                    type: 'message',
                    message: data.message,
                  }));
                }
              }
            });
          } catch (e) {
            // fail silently
          }
        } else if (data.recipientId) {
          // 1:1 message delivery
          const recipient = clients.get(data.recipientId);
          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({
              type: 'message',
              message: data.message,
            }));
          }
        }
      }
      // Reaction event: notify both sender and recipient
      if (data.type === 'reaction' && data.messageId && data.emoji) {
        [data.senderId, data.recipientId].forEach((uid) => {
          const target = clients.get(uid);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({
              type: 'reaction',
              messageId: data.messageId,
              emoji: data.emoji,
            }));
          }
        });
      }
      if (data.type === 'delivered' && data.senderId) {
        const sender = clients.get(data.senderId);
        if (sender && sender.ws.readyState === WebSocket.OPEN) {
          sender.ws.send(JSON.stringify({
            type: 'delivered',
            messageId: data.messageId,
          }));
        }
      }
      if (data.type === 'read' && data.senderId) {
        const sender = clients.get(data.senderId);
        if (sender && sender.ws.readyState === WebSocket.OPEN) {
          sender.ws.send(JSON.stringify({
            type: 'read',
            messageId: data.messageId,
          }));
        }
      }
      // Real-time file transfer
      if (data.type === 'file' && data.file && data.recipientId) {
        // Forward file metadata and chunk to recipient
        const recipient = clients.get(data.recipientId);
        if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify({
            type: 'file',
            file: data.file, // { name, size, type, chunk (base64), chunkIndex, totalChunks }
            senderId: userId,
          }));
        }
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    if (userId) {
      setPresence('offline');
      clients.delete(userId);
    }
    if (idleTimer) clearTimeout(idleTimer);
    if (offlineTimer) clearTimeout(offlineTimer);
  });
});

console.log('WebSocket server running on port 4050');

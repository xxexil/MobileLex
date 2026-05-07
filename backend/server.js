const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sequelize, User, PasswordResetToken, Message, Group, GroupParticipant } = require('./models');
const { sendExpoPushNotification } = require('./expoPush');
const { createCheckoutSession } = require('./paymongo');

// Payroll/Payment endpoint (PayMongo)
app.post(['/api/payroll-payment', '/payroll-payment'], async (req, res) => {
  const {
    amount,
    description,
    paymentMethodTypes,
    successUrl,
    cancelUrl,
    email,
    name,
  } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const amountInCentavos = Math.round(Number(amount) * 100);
    const session = await createCheckoutSession({
      amount: amountInCentavos,
      cancelUrl: cancelUrl || successUrl || 'lexconnectmobile://payroll',
      customerEmail: email,
      customerName: name,
      description,
      metadata: {
        amount_php: Number(amount),
        source: 'mobile-payroll',
      },
      paymentMethodTypes,
      referenceNumber: `payroll-${Date.now()}`,
      successUrl: successUrl || 'lexconnectmobile://payroll',
    });

    res.json({
      checkoutSession: session,
      checkoutUrl: session?.data?.attributes?.checkout_url || null,
    });
  } catch (err) {
    console.error('PayMongo error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create checkout session', details: err?.response?.data || err.message });
  }
});
const uploadRouter = require('./upload');
const { broadcastStats } = require('./ws-server');

// --- Push Notification Token Endpoint ---
// Save Expo push token for a user
app.post('/api/push-token', async (req, res) => {
  const { token, user_id } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  // You may want to authenticate the user in production
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
  const user = await User.findByPk(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.expoPushToken = token;
  await user.save();
  res.json({ success: true });
});

// --- Group Chat Endpoints ---

// Book a lawyer (create a consultation)
app.post('/book-lawyer', async (req, res) => {
  const { client_id, lawyer_id, scheduled_at, type, duration_minutes, price } = req.body;
  if (!client_id || !lawyer_id || !scheduled_at) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // Create a new group representing the consultation
  const group = await Group.create({ name: `Consultation`, avatar_url: null });
  await GroupParticipant.create({ group_id: group.id, user_id: client_id, is_admin: false });
  await GroupParticipant.create({ group_id: group.id, user_id: lawyer_id, is_admin: true });
  // Optionally, store additional consultation details in the group or another table
  // ...
  res.json({ group });
  broadcastStats();
});
// Create a group
app.post('/groups', async (req, res) => {
  const { name, user_ids, avatar_url, admin_ids } = req.body;
  if (!name || !Array.isArray(user_ids) || user_ids.length < 2) {
    return res.status(400).json({ error: 'Group name and at least 2 users required' });
  }
  const group = await Group.create({ name, avatar_url });
  await Promise.all(user_ids.map(uid => GroupParticipant.create({
    group_id: group.id,
    user_id: uid,
    is_admin: Array.isArray(admin_ids) ? admin_ids.includes(uid) : false
  })));
  res.json({ group });
  // Trigger real-time stats update
  broadcastStats();
});

// Edit group details (name, avatar)
app.put('/groups/:id', async (req, res) => {
  const { id } = req.params;
  const { name, avatar_url } = req.body;
  const group = await Group.findByPk(id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (name) group.name = name;
  if (avatar_url) group.avatar_url = avatar_url;
  await group.save();
  res.json({ group });
  broadcastStats();
});

// Set admin role for a member
app.post('/groups/:id/set-admin', async (req, res) => {
  const { id } = req.params;
  const { user_id, is_admin } = req.body;
  const gp = await GroupParticipant.findOne({ where: { group_id: id, user_id } });
  if (!gp) return res.status(404).json({ error: 'Member not found' });
  gp.is_admin = !!is_admin;
  await gp.save();
  res.json({ success: true });
});

// Leave group
app.post('/groups/:id/leave', async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  await GroupParticipant.destroy({ where: { group_id: id, user_id } });
  res.json({ success: true });
});

// Delete group (admin only)
app.delete('/groups/:id', async (req, res) => {
  const { id } = req.params;
  // Optionally: check if requester is admin
  await GroupParticipant.destroy({ where: { group_id: id } });
  await Group.destroy({ where: { id } });
  res.json({ success: true });
  broadcastStats();
});

// Add participant
app.post('/groups/:id/add', async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
  await GroupParticipant.create({ group_id: id, user_id });
  res.json({ success: true });
  broadcastStats();
});

// Remove participant
app.post('/groups/:id/remove', async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
  await GroupParticipant.destroy({ where: { group_id: id, user_id } });
  res.json({ success: true });
  broadcastStats();
});

// Get all groups for a user (with members and roles)
app.get('/groups', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
  const gps = await GroupParticipant.findAll({ where: { user_id }, include: Group });
  const groups = await Promise.all(gps.map(async gp => {
    const group = gp.Group.toJSON();
    const participants = await GroupParticipant.findAll({ where: { group_id: group.id }, include: User });
    group.members = participants.map(p => ({
      id: p.user_id,
      name: p.User?.name || p.User?.email || '',
      is_admin: p.is_admin
    }));
    group.admins = group.members.filter(m => m.is_admin);
    // Fetch the latest message for this group
    const lastMsg = await Message.findOne({
      where: { group_id: group.id },
      order: [['createdAt', 'DESC']],
    });
    group.last_message = lastMsg ? lastMsg.content : null;
    group.last_at = lastMsg ? lastMsg.createdAt : null;
    return group;
  }));
  res.json({ groups });
});

// Send a group message
app.post('/groups/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { sender_id, content, type, media_url } = req.body;
  if (!sender_id || !content) return res.status(400).json({ error: 'Missing fields' });
  const message = await Message.create({
    sender_id,
    group_id: id,
    content,
    type: type || 'text',
    media_url: media_url || null,
    delivered: false,
    read: false,
  });
  // Send push notifications to all group participants except sender
  const participants = await GroupParticipant.findAll({ where: { group_id: id } });
  for (const participant of participants) {
    if (participant.user_id !== sender_id) {
      const user = await User.findByPk(participant.user_id);
      if (user && user.expoPushToken) {
        await sendExpoPushNotification(user.expoPushToken, {
          title: 'New Group Message',
          body: content,
          data: { messageId: message.id, groupId: id },
        });
      }
    }
  }
  // TODO: Emit real-time event to group (WebSocket)
  res.json({ message });
});

// Fetch group messages
app.get('/groups/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { Message, MessageRead } = require('./models');
  const messages = await Message.findAll({
    where: { group_id: id },
    order: [['createdAt', 'ASC']],
    include: [
      {
        model: MessageRead,
        as: 'reads',
        attributes: ['user_id'],
      },
    ],
  });
  // Add readBy array to each message
  const messagesWithReadBy = messages.map(msg => {
    const msgJson = msg.toJSON();
    msgJson.readBy = msgJson.reads ? msgJson.reads.map(r => r.user_id) : [];
    delete msgJson.reads;
    return msgJson;
  });
  res.json({ messages: messagesWithReadBy });
});

// Media upload setup
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
// --- Media Upload Endpoint ---
app.post('/media/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Optionally: validate file type
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// --- Message Reactions ---
// Add a reaction to a message
app.post('/messages/:id/react', async (req, res) => {
  const { id } = req.params;
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Missing emoji' });
  const message = await Message.findByPk(id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  let reactions = {};
  try { reactions = message.reactions ? JSON.parse(message.reactions) : {}; } catch {}
  reactions[emoji] = (reactions[emoji] || 0) + 1;
  message.reactions = JSON.stringify(reactions);
  await message.save();
  // TODO: Emit real-time event to both users (WebSocket)
  res.json({ success: true, reactions });
});

// --- Messaging API ---

// Send a message
app.post('/messages', async (req, res) => {
  const { sender_id, recipient_id, content, type, media_url } = req.body;
  if (!sender_id || !recipient_id || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const message = await Message.create({
    sender_id,
    recipient_id,
    content,
    type: type || 'text',
    media_url: media_url || null,
    delivered: false,
    read: false,
  });
  // Send push notification to recipient if they have a token
  const recipient = await User.findByPk(recipient_id);
  if (recipient && recipient.expoPushToken) {
    await sendExpoPushNotification(recipient.expoPushToken, {
      title: 'New Message',
      body: content,
      data: { messageId: message.id },
    });
  }
  // TODO: Emit real-time event to recipient (WebSocket)
  res.json({ success: true, message });
});

// Fetch messages between two users
app.get('/messages', async (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'Missing user ids' });
  const messages = await Message.findAll({
    where: {
      [sequelize.Op.or]: [
        { sender_id: user1, recipient_id: user2 },
        { sender_id: user2, recipient_id: user1 },
      ],
    },
    order: [['createdAt', 'ASC']],
  });
  res.json({ messages });
});

// Mark message as delivered
app.post('/messages/:id/deliver', async (req, res) => {
  const { id } = req.params;
  const message = await Message.findByPk(id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  message.delivered = true;
  message.delivered_at = new Date();
  await message.save();
  // TODO: Emit real-time event to sender (WebSocket)
  res.json({ success: true });
});

// Mark message as read
app.post('/messages/:id/read', async (req, res) => {
  const { id } = req.params;
  const message = await Message.findByPk(id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  message.read = true;
  message.read_at = new Date();
  await message.save();
  // TODO: Emit real-time event to sender (WebSocket)
  res.json({ success: true });
});

const { sendEmail, sendSMS } = require('./mailer');

// Utility functions
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /auth/forgot-password
app.post('/auth/forgot-password', async (req, res) => {
  const { emailOrPhone, isMobile } = req.body;
  const user = await User.findOne({
    where: {
      [sequelize.Op.or]: [
        { email: emailOrPhone },
        { phone: emailOrPhone },
      ],
    },
  });
  // Always respond with success
  if (!user) return res.json({ message: "If that account exists, we've sent a code." });

  const rawToken = isMobile ? generateOTP() : generateToken();
  const tokenHash = await bcrypt.hash(rawToken, 10);
  await PasswordResetToken.create({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 1000 * 60 * 15),
    is_used: false,
  });
  // Send token via email or SMS
  if (isMobile && user.phone) {
    await sendSMS(user.phone, `Your password reset code is: ${rawToken}`);
  } else if (user.email) {
    const resetLink = `https://yourapp.com/reset?token=${rawToken}&emailOrPhone=${encodeURIComponent(user.email)}`;
    await sendEmail(user.email, 'Password Reset', `Click the link to reset your password: ${resetLink}\nOr use this code: ${rawToken}`);
  }
  res.json({ message: "If that account exists, we've sent a code.", rawToken: process.env.NODE_ENV === 'development' ? rawToken : undefined });
});

// POST /auth/verify-token
app.post('/auth/verify-token', async (req, res) => {
  const { emailOrPhone, token } = req.body;
  const user = await User.findOne({
    where: {
      [sequelize.Op.or]: [
        { email: emailOrPhone },
        { phone: emailOrPhone },
      ],
    },
  });
  if (!user) return res.status(400).json({ error: 'Invalid token' });
  const resetToken = await PasswordResetToken.findOne({
    where: {
      user_id: user.id,
      is_used: false,
      expires_at: { [sequelize.Op.gt]: new Date() },
    },
    order: [['createdAt', 'DESC']],
  });
  if (!resetToken || !(await bcrypt.compare(token, resetToken.token_hash))) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
  res.json({ success: true });
});

// POST /auth/reset-password
app.post('/auth/reset-password', async (req, res) => {
  const { emailOrPhone, token, newPassword } = req.body;
  const user = await User.findOne({
    where: {
      [sequelize.Op.or]: [
        { email: emailOrPhone },
        { phone: emailOrPhone },
      ],
    },
  });
  if (!user) return res.status(400).json({ error: 'Invalid request' });
  const resetToken = await PasswordResetToken.findOne({
    where: {
      user_id: user.id,
      is_used: false,
      expires_at: { [sequelize.Op.gt]: new Date() },
    },
    order: [['createdAt', 'DESC']],
  });
  if (!resetToken || !(await bcrypt.compare(token, resetToken.token_hash))) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  resetToken.is_used = true;
  await resetToken.save();
  res.json({ success: true });
});

// Sync DB and start server
const PORT = process.env.PORT || 8000;
sequelize.sync().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

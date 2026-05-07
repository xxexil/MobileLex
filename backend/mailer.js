// Production mailer.js using SendGrid and Twilio
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendEmail(to, subject, text) {
  await sgMail.send({
    to,
    from: process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com',
    subject,
    text,
  });
}

async function sendSMS(phone, text) {
  await twilioClient.messages.create({
    body: text,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
}

module.exports = { sendEmail, sendSMS };

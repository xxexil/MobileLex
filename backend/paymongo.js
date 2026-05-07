const axios = require('axios');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY;

const PAYMONGO_SUPPORTED_PAYMENT_METHODS = [
  'card',
  'gcash',
  'paymaya',
  'grab_pay',
  'shopee_pay',
  'dob',
];

const paymongoApi = axios.create({
  baseURL: 'https://api.paymongo.com/v1',
  auth: {
    username: PAYMONGO_SECRET_KEY,
    password: '',
  },
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

function ensurePayMongoConfigured() {
  if (!PAYMONGO_SECRET_KEY) {
    throw new Error('Missing PAYMONGO_SECRET_KEY');
  }
}

function normalizePaymentMethods(paymentMethodTypes) {
  const requested = Array.isArray(paymentMethodTypes) ? paymentMethodTypes : [];
  const filtered = requested.filter((method) => PAYMONGO_SUPPORTED_PAYMENT_METHODS.includes(method));
  return filtered.length ? [...new Set(filtered)] : ['card', 'gcash', 'paymaya', 'dob'];
}

async function createCheckoutSession({
  amount,
  currency = 'PHP',
  description,
  paymentMethodTypes,
  successUrl,
  cancelUrl,
  customerEmail,
  customerName,
  referenceNumber,
  metadata,
}) {
  ensurePayMongoConfigured();

  const normalizedAmount = Math.round(Number(amount));
  const normalizedMethods = normalizePaymentMethods(paymentMethodTypes);
  const lineItemName = description || 'LexConnect Payroll Payment';

  const payload = {
    data: {
      attributes: {
        billing: customerEmail || customerName ? {
          email: customerEmail || undefined,
          name: customerName || undefined,
        } : undefined,
        cancel_url: cancelUrl,
        description: lineItemName,
        line_items: [
          {
            amount: normalizedAmount,
            currency,
            description: lineItemName,
            name: lineItemName,
            quantity: 1,
          },
        ],
        metadata: metadata || undefined,
        payment_method_types: normalizedMethods,
        reference_number: referenceNumber || undefined,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        success_url: successUrl,
      },
    },
  };

  const response = await paymongoApi.post('/checkout_sessions', payload);
  return response.data;
}

module.exports = {
  PAYMONGO_PUBLIC_KEY,
  PAYMONGO_SUPPORTED_PAYMENT_METHODS,
  createCheckoutSession,
};

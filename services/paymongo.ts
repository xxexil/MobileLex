import { clientApi } from './api';

export interface PayMongoCheckoutSession {
  id: string;
  type: string;
  attributes: {
    checkout_url: string;
    status: string;
    reference_number?: string;
    amount?: number;
    currency?: string;
    description?: string;
    line_items?: Array<{
      amount: number;
      currency: string;
      description: string;
      name: string;
      quantity: number;
    }>;
    payment_method_types: string[];
    created_at?: string;
    updated_at?: string;
  };
}

export interface PayMongoPayment {
  id: number;
  status: 'pending' | 'paid' | 'downpayment_paid' | 'failed' | 'cancelled' | 'refunded' | string;
  amount: number;
  currency: string;
  type: string;
  consultation_code?: string;
  payment_method?: string;
  created_at?: string;
  paid_at?: string;
}

export interface ConsultationBookingPayload {
  lawyer_id: number;
  scheduled_at: string;
  type: string;
  duration_minutes: number;
  notes?: string | null;
  paymentMethodTypes?: string[];
  successUrl?: string;
  cancelUrl?: string;
}

export interface BookingWithPaymentResponse {
  consultation?: {
    id: number;
    code: string;
    status: string;
  };
  payment?: PayMongoPayment;
  checkout_url?: string;
}

const SUPPORTED_PAYMENT_METHODS = ['card', 'gcash', 'dob'];

export const paymongoService = {
  /**
   * Book a consultation and initialize payment
   */
  async bookConsultationWithPayment(
    payload: ConsultationBookingPayload
  ): Promise<BookingWithPaymentResponse> {
    const response = await clientApi.bookConsultation({
      ...payload,
      paymentMethodTypes: payload.paymentMethodTypes || SUPPORTED_PAYMENT_METHODS,
    });
    return response.data;
  },

  /**
   * Resume a payment session
   */
  async resumePayment(
    paymentId: number,
    options?: {
      paymentMethodTypes?: string[];
      successUrl?: string;
      cancelUrl?: string;
    }
  ): Promise<{ data: { checkout_url?: string } }> {
    const methods = (options?.paymentMethodTypes && options.paymentMethodTypes.length > 0)
      ? options.paymentMethodTypes
      : SUPPORTED_PAYMENT_METHODS;

    return clientApi.resumePayment(paymentId, {
      paymentMethodTypes: methods,
      successUrl: options?.successUrl,
      cancelUrl: options?.cancelUrl,
    });
  },

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: number): Promise<{ data: { payment: PayMongoPayment } }> {
    return clientApi.paymentStatus(paymentId);
  },

  /**
   * Poll payment status until completion or timeout
   */
  async pollPaymentStatus(
    paymentId: number,
    maxAttempts: number = 12,
    intervalMs: number = 2000
  ): Promise<PayMongoPayment | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await this.getPaymentStatus(paymentId);
        const payment = response?.data?.payment;

        if (payment?.status === 'paid' || payment?.status === 'downpayment_paid' || 
            payment?.status === 'failed' || payment?.status === 'cancelled') {
          return payment || null;
        }

        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        console.error('Error polling payment status:', error);
        if (attempt === maxAttempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    return null;
  },

  /**
   * Get list of all payments
   */
  async getPayments(): Promise<PayMongoPayment[]> {
    const response = await clientApi.payments();
    const payload = response?.data;
    const items = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.payments?.data)
        ? payload.payments.data
        : Array.isArray(payload)
          ? payload
          : [];
    return items;
  },

  /**
   * Find payment by consultation code
   */
  async findPaymentByConsultationCode(consultationCode: string): Promise<PayMongoPayment | null> {
    const payments = await this.getPayments();
    return payments.find((p) => p?.consultation_code === consultationCode) || null;
  },

  /**
   * Get latest pending downpayment
   */
  async getLatestPendingDownpayment(): Promise<PayMongoPayment | null> {
    const payments = await this.getPayments();
    return payments.find((p) =>
      p?.type === 'downpayment' &&
      !['paid', 'downpayment_paid', 'refunded', 'cancelled'].includes(String(p?.status || '').toLowerCase())
    ) || null;
  },

  /**
   * Check if payment status indicates success
   */
  isPaymentSuccessful(status?: string): boolean {
    return status === 'paid' || status === 'downpayment_paid';
  },

  /**
   * Check if payment status indicates failure
   */
  isPaymentFailed(status?: string): boolean {
    return status === 'failed' || status === 'cancelled';
  },

  /**
   * Get supported payment methods
   */
  getSupportedPaymentMethods(): string[] {
    return SUPPORTED_PAYMENT_METHODS;
  },
};

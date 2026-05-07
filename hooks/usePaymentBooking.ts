import { useCallback, useState } from 'react';
import { openAuthSessionAsync } from 'expo-web-browser';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { LARAVEL_API_BASE } from '@/services/endpoints';
import { paymongoService, ConsultationBookingPayload, BookingWithPaymentResponse } from '@/services/paymongo';

const WEB_APP_BASE_URL = LARAVEL_API_BASE.replace(/\/api\/?$/, '');

function getMobileCallbackUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (Constants.appOwnership === 'expo') {
    const owner = Constants.expoConfig?.owner || process.env.EXPO_PUBLIC_EXPO_OWNER;
    const slug = Constants.expoConfig?.slug || process.env.EXPO_PUBLIC_EXPO_SLUG;
    if (owner && slug) {
      return `https://auth.expo.io/@${owner}/${slug}`;
    }

    const target = ExpoLinking.createURL(normalizedPath);
    return `${WEB_APP_BASE_URL}/mobile-return?target=${encodeURIComponent(target)}`;
  }

  return ExpoLinking.createURL(normalizedPath, {
    scheme: 'lexconnectmobile',
    isTripleSlashed: true,
  });
}

interface UsePaymentBookingOptions {
  onSuccess?: (response: BookingWithPaymentResponse) => void;
  onError?: (error: Error | string) => void;
  onCheckoutStarted?: () => void;
  onCheckoutCompleted?: () => void;
}

export const usePaymentBooking = (options: UsePaymentBookingOptions = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingData, setBookingData] = useState<BookingWithPaymentResponse | null>(null);

  const resetState = useCallback(() => {
    setError(null);
    setLoading(false);
    setBookingData(null);
  }, []);

  const bookConsultation = useCallback(
    async (payload: ConsultationBookingPayload, successUrl?: string, cancelUrl?: string) => {
      try {
        setLoading(true);
        setError(null);

        const callbackUrl = successUrl || getMobileCallbackUrl('/consultations');
        const enhancedPayload = {
          ...payload,
          successUrl: callbackUrl,
          cancelUrl: cancelUrl || callbackUrl,
        };

        // Step 1: Create booking and payment
        const response = await paymongoService.bookConsultationWithPayment(enhancedPayload);
        setBookingData(response);

        const checkoutUrl = response?.checkout_url;
        let paymentId = Number(response?.payment?.id || 0);
        const consultationCode = String(response?.consultation?.code ?? '').trim();

        // Step 2: Handle payment checkout if URL is available
        if (checkoutUrl && paymentId > 0) {
          options.onCheckoutStarted?.();

          const result = await openAuthSessionAsync(checkoutUrl, callbackUrl);

          options.onCheckoutCompleted?.();

          if (result.type === 'success') {
            // Step 3: Poll payment status
            const payment = await paymongoService.pollPaymentStatus(paymentId);

            if (paymongoService.isPaymentSuccessful(payment?.status)) {
              options.onSuccess?.({ ...response, payment });
              setLoading(false);
              return { success: true, payment, response };
            }

            if (paymongoService.isPaymentFailed(payment?.status)) {
              const errorMsg = 'Payment processing failed. Please try again.';
              setError(errorMsg);
              options.onError?.(errorMsg);
              setLoading(false);
              return { success: false, error: errorMsg };
            }
          }

          if (result.type === 'cancel') {
            const errorMsg = 'Checkout was cancelled. Booking created but payment not completed.';
            setError(errorMsg);
            options.onError?.(errorMsg);
            setLoading(false);
            return { success: false, error: errorMsg };
          }
        } else if (consultationCode) {
          // Booking created but no checkout URL available
          options.onSuccess?.(response);
          setLoading(false);
          return { success: true, response };
        } else {
          const errorMsg = 'Unable to create payment session. Please try again.';
          setError(errorMsg);
          options.onError?.(errorMsg);
          setLoading(false);
          return { success: false, error: errorMsg };
        }
      } catch (err: any) {
        const errorMsg = err?.message || 'An error occurred while booking the consultation.';
        setError(errorMsg);
        options.onError?.(errorMsg);
        setLoading(false);
        return { success: false, error: errorMsg };
      }
    },
    [options]
  );

  const resumePayment = useCallback(
    async (paymentId: number, successUrl?: string, cancelUrl?: string) => {
      try {
        setLoading(true);
        setError(null);

        const callbackUrl = successUrl || getMobileCallbackUrl('/consultations');
        const response = await paymongoService.resumePayment(paymentId, {
          successUrl: callbackUrl,
          cancelUrl: cancelUrl || callbackUrl,
        });
        const checkoutUrl = response?.data?.checkout_url;

        if (!checkoutUrl) {
          throw new Error('Unable to resume payment session.');
        }

        options.onCheckoutStarted?.();
        const result = await openAuthSessionAsync(checkoutUrl, callbackUrl);
        options.onCheckoutCompleted?.();

        if (result.type === 'success') {
          const payment = await paymongoService.pollPaymentStatus(paymentId);

          if (paymongoService.isPaymentSuccessful(payment?.status)) {
            options.onSuccess?.(payment);
            setLoading(false);
            return { success: true, payment };
          }

          if (paymongoService.isPaymentFailed(payment?.status)) {
            const errorMsg = 'Payment processing failed. Please try again.';
            setError(errorMsg);
            options.onError?.(errorMsg);
            setLoading(false);
            return { success: false, error: errorMsg };
          }
        }

        if (result.type === 'cancel') {
          const errorMsg = 'Checkout was cancelled.';
          setError(errorMsg);
          options.onError?.(errorMsg);
          setLoading(false);
          return { success: false, error: errorMsg };
        }
      } catch (err: any) {
        const errorMsg = err?.message || 'An error occurred while resuming the payment.';
        setError(errorMsg);
        options.onError?.(errorMsg);
        setLoading(false);
        return { success: false, error: errorMsg };
      }
    },
    [options]
  );

  return {
    loading,
    error,
    bookingData,
    bookConsultation,
    resumePayment,
    resetState,
  };
};

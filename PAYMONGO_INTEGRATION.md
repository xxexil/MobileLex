# PayMongo Payment Integration for Booking Consultation

## Overview
This document outlines the PayMongo payment integration added to the LexConnect Mobile App for booking consultations.

## Files Created/Modified

### 1. **New Service: `services/paymongo.ts`**
A dedicated PayMongo service layer that handles all payment-related operations:
- `bookConsultationWithPayment()` - Book a consultation and initialize payment
- `resumePayment()` - Resume an interrupted payment session
- `getPaymentStatus()` - Check payment status by ID
- `pollPaymentStatus()` - Poll payment status until completion
- `getPayments()` - Retrieve all payments for the user
- `findPaymentByConsultationCode()` - Find payment by consultation code
- `getLatestPendingDownpayment()` - Get the latest pending payment
- Utility methods: `isPaymentSuccessful()`, `isPaymentFailed()`, `getSupportedPaymentMethods()`

**Supported Payment Methods:**
- Card (Debit/Credit)
- GCash
- PayMaya
- GrabPay
- ShopeePay
- Debit Online Banking

### 2. **New Component: `components/PaymentProcessingModal.tsx`**
A UI component that displays payment processing progress with step indicators:
- Shows booking submission status
- Shows payment processing status
- Shows payment confirmation status
- Displays loading indicators for each step
- Provides cancel option for users
- Accessible modal with proper styling

### 3. **New Hook: `hooks/usePaymentBooking.ts`**
A custom React hook for managing the payment booking flow:
- Manages loading and error states
- Handles booking creation and payment checkout
- Polls payment status and handles results
- Supports both full booking and resume payment flows
- Provides callbacks for success, error, checkout start/completion

**Usage:**
```typescript
const { 
  loading, 
  error, 
  bookingData, 
  bookConsultation, 
  resumePayment, 
  resetState 
} = usePaymentBooking({
  onSuccess: (response) => { /* handle success */ },
  onError: (error) => { /* handle error */ },
  onCheckoutStarted: () => { /* show loading */ },
  onCheckoutCompleted: () => { /* hide loading */ }
});

// Book consultation
await bookConsultation(bookingPayload, successUrl, cancelUrl);

// Resume payment
await resumePayment(paymentId, successUrl, cancelUrl);
```

### 4. **Enhanced: `app/(client)/consultations.tsx`**
Updated to integrate PayMongo payment flow:
- Added PaymentProcessingModal component
- Added payment state management (showPaymentProcessing, currentPaymentId, currentConsultationCode)
- Enhanced booking handler to show payment processing modal
- Using paymongoService for centralized payment operations

**New State Variables:**
- `showPaymentProcessing` - Shows/hides payment processing modal
- `currentPaymentId` - Current payment ID being processed
- `currentConsultationCode` - Current consultation code for reference

## Backend Requirements

The mobile app expects the following backend endpoints:

### Booking Consultation
- **Endpoint:** `POST /client/consultations`
- **Payload:**
```json
{
  "lawyer_id": number,
  "scheduled_at": "ISO 8601 datetime",
  "type": "video|audio|chat",
  "duration_minutes": number,
  "notes": string | null,
  "paymentMethodTypes": string[],
  "successUrl": string,
  "cancelUrl": string
}
```
- **Response:**
```json
{
  "consultation": {
    "id": number,
    "code": string,
    "status": string
  },
  "payment": {
    "id": number,
    "status": string,
    "amount": number,
    "currency": string
  },
  "checkout_url": string
}
```

### Resume Payment
- **Endpoint:** `POST /client/payments/{id}/resume` or `/payments/{id}/resume`
- **Payload:**
```json
{
  "paymentMethodTypes": string[]
}
```
- **Response:**
```json
{
  "checkout_url": string
}
```

### Payment Status
- **Endpoint:** `GET /client/payments/{id}/status` or `/payments/{id}/status`
- **Response:**
```json
{
  "payment": {
    "id": number,
    "status": "pending|paid|downpayment_paid|failed|cancelled|refunded",
    "amount": number,
    "currency": string,
    "type": "downpayment|full",
    "payment_method": string,
    "created_at": "ISO 8601 datetime",
    "paid_at": "ISO 8601 datetime"
  }
}
```

### Get Payments
- **Endpoint:** `GET /client/payments`
- **Response:**
```json
{
  "data": [
    {
      "id": number,
      "status": string,
      "amount": number,
      "type": string,
      "consultation_code": string,
      "payment_method": string,
      "created_at": string,
      "paid_at": string
    }
  ]
}
```

## Payment Flow

```
1. User selects lawyer and opens booking modal
   ↓
2. User fills in consultation details (date, duration, type)
   ↓
3. User clicks "Book" button
   ↓
4. handleBookConsultation() is called
   ↓
5. API creates consultation and payment record
   ↓
6. Payment processing modal shows with status steps
   ↓
7. openAuthSessionAsync opens PayMongo checkout URL
   ↓
8. User completes payment on PayMongo checkout page
   ↓
9. Redirects back to app
   ↓
10. pollPaymentStatus() checks payment status every 2 seconds (max 12 attempts)
    ↓
11. If payment successful → show success alert, refresh consultations
    If payment failed → show error alert
    If payment cancelled → show cancellation alert
```

## Using the PayMongo Service

### Book a Consultation with Payment
```typescript
import { paymongoService } from '@/services/paymongo';

const response = await paymongoService.bookConsultationWithPayment({
  lawyer_id: 5,
  scheduled_at: new Date().toISOString(),
  type: 'video',
  duration_minutes: 30,
  paymentMethodTypes: ['card', 'gcash', 'paymaya']
});

if (response.checkout_url) {
  // Open checkout
  const result = await openAuthSessionAsync(response.checkout_url, callbackUrl);
}
```

### Poll Payment Status
```typescript
const payment = await paymongoService.pollPaymentStatus(paymentId, 12, 2000);

if (paymongoService.isPaymentSuccessful(payment?.status)) {
  // Payment successful
} else if (paymongoService.isPaymentFailed(payment?.status)) {
  // Payment failed
}
```

### Utility Methods
```typescript
// Check if payment is successful
const isSuccess = paymongoService.isPaymentSuccessful('downpayment_paid'); // true

// Check if payment failed
const isFailed = paymongoService.isPaymentFailed('failed'); // true

// Get supported payment methods
const methods = paymongoService.getSupportedPaymentMethods();
// ['card', 'gcash', 'paymaya', 'grab_pay', 'shopee_pay', 'dob']
```

## Error Handling

The PayMongo service includes comprehensive error handling:

1. **Missing Configuration:** Ensures PayMongo API credentials are set
2. **Invalid Payment Methods:** Filters and normalizes payment methods
3. **Network Errors:** Included in try-catch blocks with user-friendly messages
4. **Checkout Cancellation:** Handles user cancellations gracefully
5. **Timeout Handling:** Polling has maximum attempts to prevent infinite loops

## Testing the Integration

### Local Testing
1. Set up local backend with PayMongo API credentials
2. Configure `.env` with `PAYMONGO_SECRET_KEY` and `PAYMONGO_PUBLIC_KEY`
3. Use test card numbers from PayMongo documentation
4. Monitor console logs for debug traces (development mode)

### Test Card Numbers
- Visa: `4242 4242 4242 4242`
- Mastercard: `5555 5555 5555 4444`
- See PayMongo docs for additional test methods

## Best Practices

1. **Always use secure callback URLs**: Use `ExpoLinking.createURL()` for mobile apps
2. **Handle network timeouts**: Payment polling has built-in timeout handling
3. **Show loading states**: Use the PaymentProcessingModal component
4. **Implement error recovery**: Show actionable error messages to users
5. **Log payment errors**: Use debugTrace for troubleshooting
6. **Currency validation**: Always use PHP for LexConnect
7. **Amount formatting**: Use `Math.round()` to avoid decimal precision issues

## Troubleshooting

### Payment checkout URL not opening
- Check if backend is returning valid checkout URL
- Verify callback URLs are set correctly
- Check device browser permissions

### Payment status not updating
- Verify polling is happening (check console logs)
- Check backend payment API endpoints
- Ensure payment ID is valid

### Consulting code not available
- Backend should return consultation code in booking response
- Check API response structure matches expected format

## Future Enhancements

1. Add webhook support for payment status updates
2. Implement payment retry logic with exponential backoff
3. Add payment history filtering and search
4. Implement partial payment/installment options
5. Add payment receipt download functionality
6. Implement payment analytics and reporting

## References

- [PayMongo Documentation](https://developers.paymongo.com/)
- [LexConnect API Documentation](../backend/README.md)
- [Mobile App Payment Integration](./payments.tsx)

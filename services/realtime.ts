import 'react-native-url-polyfill/auto';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { LARAVEL_API_BASE, REVERB_APP_KEY, REVERB_HOST, REVERB_PORT, REVERB_SCHEME } from '@/services/endpoints';

type PusherCtor = new (key: string, options: Record<string, unknown>) => unknown;

function resolvePusherConstructor(): PusherCtor {
  const mod = Pusher as unknown as { Pusher?: PusherCtor; default?: PusherCtor } | PusherCtor;
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod === 'object') {
    if (typeof mod.Pusher === 'function') return mod.Pusher;
    if (typeof mod.default === 'function') return mod.default;
  }

  throw new Error('Pusher constructor is unavailable from pusher-js import.');
}

type ConsultationEventPayload = {
  consultation?: {
    id: number;
    code?: string;
    status?: string;
    type?: string;
    scheduled_at?: string;
    duration_minutes?: number;
    client_id?: number;
    lawyer_id?: number;
    law_firm_id?: number;
    client_name?: string;
    lawyer_name?: string;
    balance_payment_id?: number;
    balance_payment_status?: string;
    can_join_video?: boolean;
    lawyer_in_video_call?: boolean;
  };
  changes?: string[];
};

type PaymentEventPayload = {
  payment?: {
    id: number;
    consultation_id?: number;
    status?: string;
    type?: string;
    amount?: number;
    checkout_url?: string | null;
    updated_at?: string;
  };
  consultation?: {
    id?: number;
    code?: string;
    status?: string;
  };
  changes?: string[];
};

type MessageEventPayload = {
  id?: number;
  conversation_id?: number;
  sender_id?: number;
  body?: string;
  time?: string;
  sender_name?: string;
  attachment_path?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
};

type FirmApplicationEventPayload = {
  application?: Record<string, any>;
  lawyer?: Record<string, any>;
  accepted_firm?: Record<string, any>;
  accepted_firm_name?: string;
  message?: string;
};

export function isReverbConfigured() {
  return Boolean(REVERB_APP_KEY && REVERB_HOST);
}

export function createReverbEcho(token: string, authEndpoint?: string) {
  const PusherCtor = resolvePusherConstructor();
  (globalThis as any).Pusher = PusherCtor;
  const broadcastAuthEndpoint = authEndpoint || `${LARAVEL_API_BASE.replace(/\/$/, '')}/broadcasting/auth`;

  const echoOptions: any = {
    broadcaster: 'reverb',
    Pusher: PusherCtor,
    key: REVERB_APP_KEY,
    wsHost: REVERB_HOST,
    wsPort: REVERB_PORT,
    wssPort: REVERB_PORT,
    forceTLS: REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
    disableStats: true,
    authEndpoint: broadcastAuthEndpoint,
    auth: {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
    authorizer: (channel: { name: string }) => ({
      authorize: async (socketId: string, callback: (error: Error | null, data?: unknown) => void) => {
        try {
          const response = await fetch(broadcastAuthEndpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              socket_id: socketId,
              channel_name: channel.name,
            }),
          });

          const data = await response.json().catch(() => null);
          if (!response.ok) {
            const message = data?.message || `Broadcast auth failed with status ${response.status}.`;
            callback(new Error(message));
            return;
          }

          callback(null, data);
        } catch (error) {
          callback(error instanceof Error ? error : new Error('Broadcast auth request failed.'));
        }
      },
    }),
  };

  return new Echo(echoOptions);
}

export function subscribeUserConsultationEvents(
  echo: Echo<any>,
  userId: number,
  handlers: {
    onCreated?: (payload: ConsultationEventPayload) => void;
    onUpdated?: (payload: ConsultationEventPayload) => void;
  }
) {
  const channel = echo.private(`user.${userId}.consultations`)
    .listen('.ConsultationCreated', (payload: ConsultationEventPayload) => {
      handlers.onCreated?.(payload);
    })
    .listen('.ConsultationUpdated', (payload: ConsultationEventPayload) => {
      handlers.onUpdated?.(payload);
    });

  return () => {
    channel.stopListening('.ConsultationCreated');
    channel.stopListening('.ConsultationUpdated');
    echo.leave(`private-user.${userId}.consultations`);
  };
}

export function subscribeUserPaymentEvents(
  echo: Echo<any>,
  userId: number,
  onUpdated: (payload: PaymentEventPayload) => void
) {
  const channel = echo.private(`user.${userId}.payments`)
    .listen('.PaymentStatusUpdated', (payload: PaymentEventPayload) => {
      onUpdated(payload);
    });

  return () => {
    channel.stopListening('.PaymentStatusUpdated');
    echo.leave(`private-user.${userId}.payments`);
  };
}

export function subscribeUserFirmApplicationEvents(
  echo: Echo<any>,
  userId: number,
  onAcceptedElsewhere: (payload: FirmApplicationEventPayload) => void
) {
  const channel = echo.private(`user.${userId}.firm-applications`)
    .listen('.LawFirmApplicationAcceptedElsewhere', (payload: FirmApplicationEventPayload) => {
      onAcceptedElsewhere(payload);
    })
    .listen('.FirmApplicationAcceptedElsewhere', (payload: FirmApplicationEventPayload) => {
      onAcceptedElsewhere(payload);
    });

  return () => {
    channel.stopListening('.LawFirmApplicationAcceptedElsewhere');
    channel.stopListening('.FirmApplicationAcceptedElsewhere');
    echo.leave(`private-user.${userId}.firm-applications`);
  };
}

export function subscribeUserMessageEvents(
  echo: Echo<any>,
  userId: number,
  onIncoming: (payload: MessageEventPayload) => void
) {
  const channel = echo.private(`user.${userId}.messages`)
    .listen('.MessageSent', (payload: MessageEventPayload) => {
      onIncoming(payload);
    })
    .listen('.message.sent', (payload: MessageEventPayload) => {
      onIncoming(payload);
    });

  return () => {
    channel.stopListening('.MessageSent');
    channel.stopListening('.message.sent');
    echo.leave(`private-user.${userId}.messages`);
  };
}

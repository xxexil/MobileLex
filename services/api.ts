import axios from 'axios/dist/browser/axios.cjs';
import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';
import { LARAVEL_API_BASE } from '@/services/endpoints';

// Change this to your Laravel server URL when running locally
// For Android emulator: http://10.0.2.2:8000/api
// For physical device: http://<your-PC-local-IP>:8000/api  (run ipconfig to find it)
const BASE_URL = LARAVEL_API_BASE;
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';
const AUTH_BACKEND_KEY = 'auth_backend_base';
const AUTH_SESSION_KEY = 'auth_session_key';

function isPrivateHost(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '10.0.2.2'
    || hostname.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function getUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function buildRequestId() {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `m-${Date.now().toString(36)}-${rand}`;
}

function isPublicAuthRoute(pathname: string) {
  return pathname === '/auth/login'
    || pathname === '/auth/register'
    || pathname.startsWith('/auth/reset-password')
    || pathname.startsWith('/auth/forgot-password')
    || pathname.startsWith('/auth/request-')
    || pathname.startsWith('/auth/verify-');
}

const parsedBaseUrl = getUrl(BASE_URL);
if (!__DEV__ && parsedBaseUrl && parsedBaseUrl.protocol !== 'https:' && !isPrivateHost(parsedBaseUrl.hostname)) {
  throw new Error('Insecure API base URL is blocked in production. Use HTTPS.');
}

const axiosClient = axios as any;
const api = axiosClient.create({  
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 15000,
});

function isRouteMissingError(error: any) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message ?? error?.response?.data?.error ?? '').toLowerCase();
  return status === 404 || message.includes('route') || message.includes('not found');
}

async function getWithFallback(paths: string[]) {
  let lastError: any = null;
  for (const path of paths) {
    try {
      return await api.get(path);
    } catch (error: any) {
      lastError = error;
      if (!isRouteMissingError(error)) throw error;
    }
  }
  throw lastError;
}

async function postWithFallback(paths: string[], data: Record<string, unknown>) {
  let lastError: any = null;
  for (const path of paths) {
    try {
      return await api.post(path, data);
    } catch (error: any) {
      lastError = error;
      if (!isRouteMissingError(error)) throw error;
    }
  }
  throw lastError;
}

// Attach token to every request
api.interceptors.request.use(async (config: any) => {
  const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  const sessionKey = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
  const requestUrl = getUrl(String(config.url ?? ''));
  const effectiveUrl = requestUrl ?? getUrl(`${BASE_URL}${config.url ?? ''}`);
  const pathname = effectiveUrl?.pathname ?? String(config.url ?? '');
  const skipAuthHeaders = isPublicAuthRoute(pathname);

  if (effectiveUrl && !__DEV__ && effectiveUrl.protocol !== 'https:' && !isPrivateHost(effectiveUrl.hostname)) {
    throw new Error('Blocked insecure request. HTTPS is required.');
  }

  if (!skipAuthHeaders && effectiveUrl && parsedBaseUrl && effectiveUrl.origin === parsedBaseUrl.origin && token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (config.headers?.Authorization) {
    delete config.headers.Authorization;
  }

  if (!skipAuthHeaders && sessionKey) {
    config.headers['X-Session-Key'] = sessionKey;
  } else if (config.headers?.['X-Session-Key']) {
    delete config.headers['X-Session-Key'];
  }

  config.headers['X-Mobile-Request-Id'] = buildRequestId();
  config.headers['X-Request-Timestamp'] = String(Date.now());
  config.headers['X-Client-Platform'] = 'expo-react-native';
  return config;
});

// Surface rate-limit errors as readable messages
api.interceptors.response.use(
  (response: any) => response,
  async (error: any) => {
    if (error?.response?.status === 429) {
      error.message = 'Too many requests. Please wait a moment before trying again.';
    }

    if (error?.response?.status === 401 || error?.response?.status === 419) {
      const serverMessage = String(error?.response?.data?.message ?? '');
      if (serverMessage.toLowerCase().includes('active on another device')) {
        DeviceEventEmitter.emit('session_kicked');
      }
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(AUTH_USER_KEY);
      await SecureStore.deleteItemAsync(AUTH_BACKEND_KEY);
      await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
    }

    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: Record<string, unknown>) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  resetPassword: (data: Record<string, unknown>) =>
    api.post('/auth/reset-password', data),
  requestEmailChange: (newEmail: string) =>
    api.post('/auth/request-email-change', { new_email: newEmail }),
  verifyEmailChange: (newEmail: string, code: string) =>
    api.post('/auth/verify-email-change', { new_email: newEmail, code }),
  requestPhoneChange: (newPhone: string) =>
    api.post('/auth/request-phone-change', { new_phone: newPhone }),
  verifyPhoneChange: (newPhone: string, code: string) =>
    api.post('/auth/verify-phone-change', { new_phone: newPhone, code }),
};

// Client
type PayrollPaymentPayload = {
  amount: number;
  cancelUrl?: string;
  description?: string;
  email?: string;
  name?: string;
  paymentMethodTypes?: string[];
  successUrl?: string;
};

export const clientApi = {
  payrollPay: (data: PayrollPaymentPayload) => api.post('/client/payroll-payment', data),
  // Book a lawyer (new backend endpoint)
  bookLawyer: (data: Record<string, unknown>) => api.post('/book-lawyer', data),
  dashboard: () => api.get('/client/dashboard'),
  lawyers: (params?: Record<string, unknown>) => api.get('/lawyers', { params }),
  lawyerDetail: (id: number) => api.get(`/lawyers/${id}`),
  lawyerAvailability: async (id: number, params?: Record<string, unknown>) => {
    try {
      return await api.get(`/lawyers/${id}/availability`, { params });
    } catch (error: any) {
      const status = error?.response?.status;
      const message = String(error?.response?.data?.message ?? '').toLowerCase();
      const routeMissing = status === 404 || message.includes('route') || message.includes('not found');

      if (!routeMissing) throw error;

      try {
        // Backward compatibility for older backend route layout.
        return await api.get(`/client/lawyers/${id}/availability`, { params });
      } catch (fallbackError: any) {
        const fallbackStatus = fallbackError?.response?.status;
        const fallbackMessage = String(fallbackError?.response?.data?.message ?? '').toLowerCase();
        const fallbackRouteMissing = fallbackStatus === 404 || fallbackMessage.includes('route') || fallbackMessage.includes('not found');

        if (!fallbackRouteMissing) throw fallbackError;

        // Last fallback for legacy singular route shape.
        return api.get(`/lawyer/${id}/availability`, { params });
      }
    }
  },
  consultations: (status?: string) => api.get('/client/consultations', { params: { status } }),
  bookConsultation: (data: Record<string, unknown> | FormData) => api.post('/client/consultations', data),
  cancelConsultation: (id: number) => api.post(`/client/consultations/${id}/cancel`),
  consultationVideo: (id: number) => api.get(`/client/consultations/${id}/video`),
  consultationStatus: (id: number) => api.get(`/client/consultations/${id}/status`),
  consultationHeartbeat: (id: number) => api.post(`/client/consultations/${id}/video/heartbeat`, { at: Date.now() }),
  consultationSignal: (id: number, data: Record<string, unknown>) => api.post(`/client/consultations/${id}/video/signal`, data),
  consultationSignals: (id: number) => api.get(`/client/consultations/${id}/video/signals`),
  payments: () => api.get('/client/payments'),
  paymentStatus: (paymentId: number) => getWithFallback([
    `/client/payments/${paymentId}/status`,
    `/payments/${paymentId}/status`,
    `/client/payment/${paymentId}/status`,
    `/payment/${paymentId}/status`,
  ]),
  resumePayment: (paymentId: number, data?: Record<string, unknown>) => postWithFallback([
    `/client/payments/${paymentId}/resume`,
    `/payments/${paymentId}/resume`,
    `/client/payment/${paymentId}/resume`,
    `/payment/${paymentId}/resume`,
  ], data ?? {}),
  conversations: () => api.get('/client/messages'),
  messages: (conversationId: number, params?: Record<string, unknown>) =>
    api.get(`/client/messages/${conversationId}`, { params }),
  startConversation: (lawyerId: number) => api.post('/client/messages/start', { lawyer_id: lawyerId }),
  sendMessage: (conversationId: number, body: string) =>
    api.post('/client/messages/send', { conversation_id: conversationId, body }),
  deleteMessage: (messageId: number, mode: 'me' | 'everyone') =>
    api.delete(`/client/messages/${messageId}`, { data: { mode } }),
  profile: () => api.get('/client/profile'),
    sendMessageWithAttachment: (conversationId: number, body: string, attachment: { uri: string; name: string; type: string }) => {
      const form = new FormData();
      form.append('conversation_id', String(conversationId));
      if (body.trim()) form.append('body', body.trim());
      form.append('attachment', { uri: attachment.uri, name: attachment.name, type: attachment.type } as any);
      return api.post('/client/messages/send', form);
    },
  updateProfile: (data: Record<string, unknown> | FormData) => api.put('/client/profile', data, {
    headers: typeof FormData !== 'undefined' && data instanceof FormData
      ? { 'Content-Type': 'multipart/form-data' } : undefined,
  }),
  unreadCount: () => api.get('/client/messages'),
  submitReview: (data: Record<string, unknown>) => api.post('/client/reviews', data),
};

// Lawyer
export const lawyerApi = {
  dashboard: () => api.get('/lawyer/dashboard'),
  consultations: (status?: string) => api.get('/lawyer/consultations', { params: { status } }),
  consultationsMonthly: () => api.get('/lawyer/consultations/monthly'),
  acceptConsultation: (id: number) => api.post(`/lawyer/consultations/${id}/accept`),
  declineConsultation: (id: number) => api.post(`/lawyer/consultations/${id}/decline`),
  completeConsultation: (id: number) => api.post(`/lawyer/consultations/${id}/complete`),
  consultationVideo: (id: number) => api.get(`/lawyer/consultations/${id}/video`),
  consultationStatus: (id: number) => api.get(`/lawyer/consultations/${id}/status`),
  consultationHeartbeat: (id: number) => api.post(`/lawyer/consultations/${id}/video/heartbeat`, { at: Date.now() }),
  consultationSignal: (id: number, data: Record<string, unknown>) => api.post(`/lawyer/consultations/${id}/video/signal`, data),
  consultationSignals: (id: number) => api.get(`/lawyer/consultations/${id}/video/signals`),
  conversations: () => api.get('/lawyer/messages'),
  messages: (conversationId: number, params?: Record<string, unknown>) =>
    api.get(`/lawyer/messages/${conversationId}`, { params }),
  startConversation: (clientId: number) => api.post('/lawyer/messages/start', { client_id: clientId }),
  sendMessage: (conversationId: number, body: string) =>
    api.post('/lawyer/messages/send', { conversation_id: conversationId, body }),
  deleteMessage: (messageId: number, mode: 'me' | 'everyone') =>
    api.delete(`/lawyer/messages/${messageId}`, { data: { mode } }),
  earnings: () => api.get('/lawyer/earnings', { params: { all: 1 } }),
      uploadDocs: (docs: { government_id?: { uri: string; name: string; type: string }; ibp_id?: { uri: string; name: string; type: string } }) => {
        const form = new FormData();
        if (docs.government_id) form.append('government_id', docs.government_id as any);
        if (docs.ibp_id) form.append('ibp_id', docs.ibp_id as any);
        return api.put('/lawyer/profile', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      },
    sendMessageWithAttachment: (conversationId: number, body: string, attachment: { uri: string; name: string; type: string }) => {
      const form = new FormData();
      form.append('conversation_id', String(conversationId));
      if (body.trim()) form.append('body', body.trim());
      form.append('attachment', { uri: attachment.uri, name: attachment.name, type: attachment.type } as any);
      return api.post('/lawyer/messages/send', form);
    },
  profile: () => api.get('/lawyer/profile'),
  updateProfile: (data: Record<string, unknown> | FormData) => api.put('/lawyer/profile', data, {
    headers: typeof FormData !== 'undefined' && data instanceof FormData
      ? { 'Content-Type': 'multipart/form-data' } : undefined,
  }),
  unreadCount: () => api.get('/lawyer/messages'),
  updateAvailability: (status: string) => api.put('/lawyer/profile/availability', { availability_status: status }),
  blockedDates: () => api.get('/lawyer/blocked-dates'),
  addBlockedDate: (data: Record<string, unknown>) => api.post('/lawyer/blocked-dates', data),
  removeBlockedDate: (id: number) => api.delete(`/lawyer/blocked-dates/${id}`),
    // Updated: Use lawfirm endpoints instead
    firms: () => api.get('/lawfirm/team'),
    applyFirm: (law_firm_id: number, message?: string) => api.post('/lawfirm/applications', { law_firm_id, message }),
    leaveFirm: () => api.post('/lawfirm/leave'),
  };

// Law Firm
export const lawFirmApi = {
  dashboard: () => api.get('/lawfirm/dashboard'),
  team: () => api.get('/lawfirm/team'),
  applications: () => api.get('/lawfirm/applications'),
  acceptApplication: (id: number) => api.post(`/lawfirm/applications/${id}/accept`),
  rejectApplication: (id: number) => api.post(`/lawfirm/applications/${id}/reject`),
  consultations: async () => {
    try {
      return await api.get('/lawfirm/consultations');
    } catch (error: any) {
      const serverMessage = String(error?.response?.data?.message ?? '').toLowerCase();
      const legacySchemaError =
        error?.response?.status === 500
        && serverMessage.includes("unknown column 'law_firm_id'")
        && serverMessage.includes('consultations');

      if (!legacySchemaError) {
        throw error;
      }

      const dashboardRes = await api.get('/lawfirm/dashboard');
      const payload = dashboardRes?.data;
      const recent = Array.isArray(payload?.recent_consultations)
        ? payload.recent_consultations
        : [];

      return {
        ...dashboardRes,
        data: recent,
      };
    }
  },
  earnings: async () => {
    const response = await api.get('/lawfirm/earnings', { params: { all: 1 } });
    const payload: any = response?.data ?? {};

    // Compatibility for older servers that return { stats, payments, lawyer_breakdown }.
    if (
      payload
      && payload.total_earned === undefined
      && payload.this_month === undefined
      && payload.pending === undefined
      && Array.isArray(payload.payments)
    ) {
      const stats = payload?.stats ?? {};
      const payments = Array.isArray(payload.payments) ? payload.payments : [];

      const normalizedRecent = payments.map((payment: any) => ({
        id: payment?.id,
        amount: Number(payment?.firm_cut ?? payment?.amount ?? 0),
        gross_amount: Number(payment?.amount ?? 0),
        status: payment?.status,
        client_name: payment?.client?.name ?? payment?.client_name,
        lawyer_name: payment?.lawyer?.name ?? payment?.lawyer_name,
        consult_code: payment?.consultation?.code ?? payment?.consult_code ?? payment?.type,
        date: payment?.created_at ?? payment?.date,
      }));

      return {
        ...response,
        data: {
          total_earned: Number(stats?.total_earned ?? 0),
          this_month: Number(stats?.this_month_earned ?? 0),
          pending: Number(stats?.pending_amount ?? 0),
          firm_cut_total: Number(stats?.total_earned ?? 0),
          recent_payments: normalizedRecent,
        },
      };
    }

    return response;
  },
  conversations: () => api.get('/lawfirm/messages'),
  messages: () => api.get('/lawfirm/messages'),
  threadMessages: (conversationId: number, params?: Record<string, unknown>) =>
    api.get(`/lawfirm/messages/${conversationId}`, { params }),
  conversationMessages: (conversationId: number, params?: Record<string, unknown>) =>
    api.get(`/lawfirm/messages/${conversationId}`, { params }),
  startConversation: (clientId: number) => api.post('/lawfirm/messages/start', { client_id: clientId }),
  sendMessage: (conversationId: number, body: string) =>
    api.post('/lawfirm/messages/send', { conversation_id: conversationId, body }),
  sendMessageWithAttachment: (conversationId: number, body: string, attachment: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append('conversation_id', String(conversationId));
    if (body.trim()) form.append('body', body.trim());
    form.append('attachment', { uri: attachment.uri, name: attachment.name, type: attachment.type } as any);
    return api.post('/lawfirm/messages/send', form);
  },
  deleteMessage: (messageId: number, mode: 'me' | 'everyone') =>
    api.delete(`/lawfirm/messages/${messageId}`, { data: { mode } }),
  profile: () => api.get('/lawfirm/profile'),
  updateProfile: (data: Record<string, unknown> | FormData) => api.put('/lawfirm/profile', data, {
    headers: typeof FormData !== 'undefined' && data instanceof FormData
      ? { 'Content-Type': 'multipart/form-data' } : undefined,
  }),
};

// Admin
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  users: () => api.get('/admin/users'),
  systemStatus: () => api.get('/admin/system-status'),
};

// Groups
export const groupApi = {
  users: () => api.get('/users'),
  groups: (userId: number) => api.get('/groups', { params: { user_id: userId } }),
  createGroup: (data: Record<string, unknown>) => api.post('/groups', data),
  updateGroup: (id: number, data: Record<string, unknown>) => api.put(`/groups/${id}`, data),
  deleteGroup: (id: number) => api.delete(`/groups/${id}`),
  addMember: (id: number, userId: number) => api.post(`/groups/${id}/members`, { user_id: userId }),
  removeMember: (id: number, userId: number) => api.delete(`/groups/${id}/members/${userId}`),
  addAdmin: (id: number, userId: number) => api.post(`/groups/${id}/admins/add`, { user_id: userId }),
  removeAdmin: (id: number, userId: number) => api.post(`/groups/${id}/admins/remove`, { user_id: userId }),
  leave: (id: number, userId: number) => api.post(`/groups/${id}/leave`, { user_id: userId }),
  messages: (id: number) => api.get(`/groups/${id}/messages`),
  sendMessage: (id: number, senderId: number, content: string) =>
    api.post(`/groups/${id}/messages`, { sender_id: senderId, content }),
};

// Push notifications
export const pushApi = {
  register: (token: string, platform = 'expo') =>
    api.post('/device-token', { token, platform }),
  remove: (token: string) =>
    api.delete('/device-token', { data: { token } }),
};

export default api;

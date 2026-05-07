import { useEffect, useRef, useState } from 'react';
import type { EventSubscription } from 'expo-notifications';
import Constants from 'expo-constants';
import LegalAcceptanceDialog from '@/components/LegalAcceptanceDialog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications, unregisterPushToken } from '@/services/push-notifications';
import { groupApi } from '@/services/api';
import { parseCallSignal } from '@/services/call-signals';
import {
  createReverbEcho,
  isReverbConfigured,
  subscribeUserConsultationEvents,
  subscribeUserMessageEvents,
  subscribeUserPaymentEvents,
} from '@/services/realtime';

const isExpoGo = Constants.appOwnership === 'expo';
// Lazy load to prevent DevicePushTokenAutoRegistration.fx.js from running in Expo Go.
const Notifications = !isExpoGo
  ? (require('expo-notifications') as typeof import('expo-notifications'))
  : null;
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import OfflineBanner from '@/components/OfflineBanner';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import 'react-native-reanimated';
import { ActivityIndicator, AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/auth';
import { OverlayProvider } from '@/context/overlay';
import { NotificationsProvider, useNotifications } from '@/context/notifications';
import { Colors, RoleColors } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import ActivityBanner from '@/components/ActivityBanner';
import SecurityLockScreen from '@/components/SecurityLockScreen';


function RootNavigator() {
  const [legalAccepted, setLegalAccepted] = useState<boolean | null>(null);
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const { user, token, isLoading, kickedOut, dismissKickedOut } = useAuth();
  const {
    addActivity,
    bannerActivity,
    dismissBanner,
    markActivityRead,
    triggerClientUnreadRefresh,
    triggerLawyerUnreadRefresh,
    triggerLawFirmUnreadRefresh,
  } = useNotifications();
  const pushTokenRef = useRef<string | null>(null);
  const notifResponseListener = useRef<EventSubscription | null>(null);
  const realtimeCleanupRef = useRef<(() => void) | null>(null);
  const recentRealtimeKeysRef = useRef<Record<string, number>>({});
  const completedPaymentRedirectsRef = useRef<Record<string, number>>({});
  const segments = useSegments();
  const router = useRouter();
  const roleTheme =
    user?.role === 'law_firm'
      ? RoleColors.lawFirm
      : user?.role === 'lawyer'
        ? RoleColors.lawyer
        : RoleColors.client;
  const roleLabel =
    user?.role === 'law_firm'
      ? 'Law Firm'
      : user?.role === 'lawyer'
        ? 'Lawyer'
        : 'Client';

  const scheduleRealtimeNotification = async ({
    title,
    body,
    type,
    consultationId,
    conversationId,
    groupId,
    mode,
    callTitle,
  }: {
    title: string;
    body: string;
    type: 'message' | 'consultation' | 'group' | 'call' | 'payment';
    consultationId?: number | string;
    conversationId?: number | string;
    groupId?: number | string;
    mode?: 'one-on-one' | 'group';
    callTitle?: string;
  }) => {
    const id = consultationId
      ? String(consultationId)
      : conversationId
        ? String(conversationId)
        : groupId
          ? String(groupId)
          : '';
    const dedupeKey = `${type}|${title}|${body}|${id}`;
    const now = Date.now();
    const last = recentRealtimeKeysRef.current[dedupeKey] ?? 0;
    if (now - last < 4000) return;
    recentRealtimeKeysRef.current[dedupeKey] = now;

    if (!isExpoGo && Notifications) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            type,
            ...(consultationId ? { consultationId: String(consultationId) } : {}),
            ...(conversationId ? { conversationId: String(conversationId) } : {}),
            ...(groupId ? { groupId: String(groupId) } : {}),
            ...(mode ? { mode } : {}),
            ...(callTitle ? { title: callTitle } : {}),
          },
        },
        trigger: null,
      });
    }
  };

  const openActivityRoute = (activity: {
    routeKind?: 'messages' | 'consultations' | 'group-chat' | 'video-call' | 'payments';
    conversationId?: number;
    consultationId?: number;
    groupId?: number;
    mode?: 'one-on-one' | 'group';
    title?: string;
  }) => {
    if (!user || !activity.routeKind) return;

    if (activity.routeKind === 'video-call') {
      if (user.role === 'law_firm') {
        router.push('/(lawfirm)/messages' as any);
        return;
      }

      const pathname = user.role === 'lawyer' ? '/(lawyer)/video-call' : '/(client)/video-call';
      router.push({
        pathname,
        params: {
          mode: activity.mode === 'group' ? 'group' : 'one-on-one',
          ...(activity.title ? { title: activity.title } : {}),
          ...(activity.conversationId ? { conversationId: String(activity.conversationId) } : {}),
          ...(activity.groupId ? { groupId: String(activity.groupId) } : {}),
        },
      } as any);
      return;
    }

    if (activity.routeKind === 'messages') {
      if (user.role === 'client') {
        router.push({ pathname: '/(client)/messages', params: activity.conversationId ? { conversationId: String(activity.conversationId) } : {} } as any);
      } else if (user.role === 'law_firm') {
        router.push('/(lawfirm)/messages' as any);
      } else {
        router.push({ pathname: '/(lawyer)/messages', params: activity.conversationId ? { conversationId: String(activity.conversationId) } : {} } as any);
      }
      return;
    }

    if (activity.routeKind === 'group-chat') {
      if (user.role === 'client') {
        router.push({ pathname: '/(client)/group-chat', params: activity.groupId ? { groupId: String(activity.groupId), fromNotification: '1' } : {} } as any);
      }
      return;
    }

    if (activity.routeKind === 'payments') {
      if (user.role === 'client') {
        router.push({ pathname: '/(client)/payments', params: activity.consultationId ? { consultationId: String(activity.consultationId) } : {} } as any);
      }
      return;
    }

    if (user.role === 'client') {
      router.push({ pathname: '/(client)/consultations', params: activity.consultationId ? { consultationId: String(activity.consultationId) } : {} } as any);
    } else if (user.role === 'law_firm') {
      router.push({ pathname: '/(lawfirm)/consultations', params: activity.consultationId ? { consultationId: String(activity.consultationId) } : {} } as any);
    } else {
      router.push({ pathname: '/(lawyer)/consultations', params: activity.consultationId ? { consultationId: String(activity.consultationId) } : {} } as any);
    }
  };

  const pushRealtimeActivity = async ({
    kind,
    title,
    body,
    tone,
    icon,
    routeKind,
    conversationId,
    consultationId,
    groupId,
    localNotificationType,
    mode,
    titleOverride,
  }: {
    kind: string;
    title: string;
    body: string;
    tone: 'info' | 'success' | 'warning' | 'error';
    icon: string;
    routeKind?: 'messages' | 'consultations' | 'group-chat' | 'video-call' | 'payments';
    conversationId?: number;
    consultationId?: number;
    groupId?: number;
    localNotificationType: 'message' | 'consultation' | 'group' | 'call' | 'payment';
    mode?: 'one-on-one' | 'group';
    titleOverride?: string;
  }) => {
    const activityTitle = titleOverride || title;
    addActivity({ kind, title: activityTitle, body, tone, icon, routeKind, conversationId, consultationId, groupId, mode });

    const isForeground = AppState.currentState === 'active';
    if (isForeground) {
      return;
    }

    await scheduleRealtimeNotification({
      title: activityTitle,
      body,
      type: localNotificationType,
      consultationId,
      conversationId,
      groupId,
      mode,
      callTitle: titleOverride,
    });
  };


  useEffect(() => {
    (async () => {
      const accepted = await AsyncStorage.getItem('legalAccepted');
      setLegalAccepted(accepted === 'true');
    })();
  }, []);

  // Register / deregister push token when auth state changes
  useEffect(() => {
    if (user) {
      registerForPushNotifications().then((token) => {
        if (token) pushTokenRef.current = token;
      });
    } else {
      if (pushTokenRef.current) {
        unregisterPushToken(pushTokenRef.current);
        pushTokenRef.current = null;
      }
    }
  }, [user?.id]);

  // Handle notification taps (app in background/killed) — not available in Expo Go
  useEffect(() => {
    if (isExpoGo || !Notifications) return;
    notifResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        const type = data?.type as string | undefined;
        const conversationId = data?.conversationId ? String(data.conversationId) : undefined;
        const consultationId = data?.consultationId ? String(data.consultationId) : undefined;
        const groupId = data?.groupId ? String(data.groupId) : undefined;
        if (!user) return;
        if (type === 'call') {
          const mode = data?.mode === 'group' ? 'group' : 'one-on-one';
          const title = data?.title ? String(data.title) : undefined;
          openActivityRoute({
            routeKind: 'video-call',
            conversationId: conversationId ? Number(conversationId) : undefined,
            groupId: groupId ? Number(groupId) : undefined,
            mode,
            title,
          });
        } else if (type === 'message') {
          if (user.role === 'client') {
            router.push({ pathname: '/(client)/messages', params: conversationId ? { conversationId } : {} } as any);
          } else if (user.role === 'law_firm') {
            router.push('/(lawfirm)/messages' as any);
          } else {
            router.push({ pathname: '/(lawyer)/messages', params: conversationId ? { conversationId } : {} } as any);
          }
        } else if (type === 'payment' && user.role === 'client') {
          router.push({ pathname: '/(client)/payments', params: consultationId ? { consultationId } : {} } as any);
        } else if (type === 'consultation') {
          if (user.role === 'client') {
            router.push({ pathname: '/(client)/consultations', params: consultationId ? { consultationId } : {} } as any);
          } else if (user.role === 'law_firm') {
            router.push({ pathname: '/(lawfirm)/consultations', params: consultationId ? { consultationId } : {} } as any);
          } else {
            router.push({ pathname: '/(lawyer)/consultations', params: consultationId ? { consultationId } : {} } as any);
          }
        } else if (type === 'group' && user.role === 'client') {
          router.push({ pathname: '/(client)/group-chat', params: groupId ? { groupId, fromNotification: '1' } : {} } as any);
        }
      });
    return () => {
      notifResponseListener.current?.remove();
    };
  }, [user?.role]);

  useEffect(() => {
    if (!bannerActivity) return;

    if (bannerActivity.tone === 'warning' || bannerActivity.tone === 'error') {
      return;
    }

    const timeout = setTimeout(() => {
      dismissBanner();
    }, 5500);

    return () => clearTimeout(timeout);
  }, [bannerActivity, dismissBanner]);

  // Global real-time consultation/payment notifications for both client and lawyer mobile apps.
  useEffect(() => {
    realtimeCleanupRef.current?.();
    realtimeCleanupRef.current = null;

    if (!user?.id || !token || !isReverbConfigured()) {
      return;
    }

    const echo = createReverbEcho(token);

    const offConsultations = subscribeUserConsultationEvents(echo, user.id, {
      onCreated: async (payload) => {
        const consultation = payload?.consultation;
        if (!consultation) return;

        if (user.role === 'client') {
          triggerClientUnreadRefresh();
        } else if (user.role === 'law_firm') {
          triggerLawFirmUnreadRefresh();
        } else {
          triggerLawyerUnreadRefresh();
        }

        const clientLabel = consultation.client_name || `Client #${consultation.client_id ?? ''}`;
        const typeLabel = consultation.type ? ` (${consultation.type})` : '';
        const schedLabel = consultation.scheduled_at
          ? ` on ${new Date(consultation.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
          : '';

        if (user.role === 'lawyer' && consultation.status === 'pending') {
          await pushRealtimeActivity({
            kind: 'consultation-created',
            title: 'New Booking Request',
            body: `${clientLabel} booked a${typeLabel} consultation${schedLabel}.`,
            tone: 'warning',
            icon: 'calendar-outline',
            routeKind: 'consultations',
            consultationId: consultation.id,
            localNotificationType: 'consultation',
          });
        }

        if (user.role === 'client' && consultation.status === 'pending') {
          await pushRealtimeActivity({
            kind: 'consultation-created',
            title: 'Booking Submitted',
            body: `Consultation ${consultation.code ?? `#${consultation.id}`}${typeLabel} is awaiting payment confirmation.`,
            tone: 'info',
            icon: 'document-text-outline',
            routeKind: 'consultations',
            consultationId: consultation.id,
            localNotificationType: 'consultation',
          });
        }

        if (user.role === 'law_firm') {
          await pushRealtimeActivity({
            kind: 'consultation-created',
            title: 'New Booking',
            body: `${clientLabel} booked with ${consultation.lawyer_name || 'a lawyer'}${typeLabel}${schedLabel}.`,
            tone: 'info',
            icon: 'briefcase-outline',
            routeKind: 'consultations',
            consultationId: consultation.id,
            localNotificationType: 'consultation',
          });
        }
      },
      onUpdated: async (payload) => {
        const consultation = payload?.consultation;
        if (!consultation) return;

        if (user.role === 'client') {
          triggerClientUnreadRefresh();
        } else if (user.role === 'law_firm') {
          triggerLawFirmUnreadRefresh();
        } else {
          triggerLawyerUnreadRefresh();
        }

        const clientLabel = consultation.client_name || `Client #${consultation.client_id ?? ''}`;
        const typeLabel = consultation.type ? ` (${consultation.type})` : '';
        const schedLabel = consultation.scheduled_at
          ? ` on ${new Date(consultation.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
          : '';

        if (user.role === 'client' && consultation.status === 'upcoming') {
          await pushRealtimeActivity({
            kind: 'consultation-updated',
            title: 'Consultation Confirmed',
            body: `Your consultation ${consultation.code ?? `#${consultation.id}`}${typeLabel}${schedLabel} has been confirmed.`,
            tone: 'success',
            icon: 'checkmark-circle-outline',
            routeKind: 'consultations',
            consultationId: consultation.id,
            localNotificationType: 'consultation',
          });
        }

        if (user.role === 'client' && consultation.status === 'completed') {
          const redirectKey = String(consultation.id);
          const now = Date.now();
          const lastRedirect = completedPaymentRedirectsRef.current[redirectKey] ?? 0;
          const shouldRedirect = now - lastRedirect > 8000;
          completedPaymentRedirectsRef.current[redirectKey] = now;

          await pushRealtimeActivity({
            kind: 'consultation-balance-due',
            title: 'Session Ended',
            body: `Your consultation ${consultation.code ?? `#${consultation.id}`} has ended. Please pay the remaining balance.`,
            tone: 'warning',
            icon: 'card-outline',
            routeKind: 'payments',
            consultationId: consultation.id,
            localNotificationType: 'payment',
          });

          if (shouldRedirect && AppState.currentState === 'active') {
            router.push({
              pathname: '/(client)/payments',
              params: { consultationId: String(consultation.id), fromSessionEnd: '1' },
            } as any);
          }
        }

        if (user.role === 'lawyer' && consultation.status === 'cancelled') {
          await pushRealtimeActivity({
            kind: 'consultation-updated',
            title: 'Consultation Cancelled',
            body: `${clientLabel}'s consultation ${consultation.code ?? `#${consultation.id}`} was cancelled.`,
            tone: 'error',
            icon: 'close-circle-outline',
            routeKind: 'consultations',
            consultationId: consultation.id,
            localNotificationType: 'consultation',
          });
        }

        if (user.role === 'law_firm' && consultation.status) {
          await pushRealtimeActivity({
            kind: 'consultation-updated',
            title: 'Consultation Updated',
            body: `${clientLabel}'s consultation with ${consultation.lawyer_name || 'a lawyer'} is now ${consultation.status}.`,
            tone: consultation.status === 'cancelled' ? 'error' : consultation.status === 'upcoming' ? 'success' : 'info',
            icon: consultation.status === 'cancelled' ? 'close-circle-outline' : 'calendar-outline',
            routeKind: 'consultations',
            consultationId: consultation.id,
            localNotificationType: 'consultation',
          });
        }
      },
    });

    const offPayments = subscribeUserPaymentEvents(echo, user.id, async (payload) => {
      const payment = payload?.payment;
      const consultation = payload?.consultation;
      if (!payment) return;

      if (payment.type === 'downpayment' && payment.status === 'downpayment_paid') {
        if (user.role === 'lawyer') {
          await pushRealtimeActivity({
            kind: 'payment-updated',
            title: 'Booking Ready to Confirm',
            body: `Downpayment received for ${consultation?.code ?? `consultation #${payment.consultation_id ?? ''}`}. You can now accept it.`,
            tone: 'success',
            icon: 'wallet-outline',
            routeKind: 'consultations',
            consultationId: consultation?.id ?? payment.consultation_id,
            localNotificationType: 'consultation',
          });
        }

        if (user.role === 'client') {
          await pushRealtimeActivity({
            kind: 'payment-updated',
            title: 'Downpayment Received',
            body: `Payment for ${consultation?.code ?? `consultation #${payment.consultation_id ?? ''}`} is successful.`,
            tone: 'success',
            icon: 'card-outline',
            routeKind: 'consultations',
            consultationId: consultation?.id ?? payment.consultation_id,
            localNotificationType: 'consultation',
          });
        }

        if (user.role === 'law_firm') {
          await pushRealtimeActivity({
            kind: 'payment-updated',
            title: 'Payment Activity',
            body: `Payment was posted for ${consultation?.code ?? `consultation #${payment.consultation_id ?? ''}`}.`,
            tone: 'success',
            icon: 'cash-outline',
            routeKind: 'consultations',
            consultationId: consultation?.id ?? payment.consultation_id,
            localNotificationType: 'consultation',
          });
        }
      }
    });

    const offMessages = subscribeUserMessageEvents(echo, user.id, (payload) => {
      if (Number(payload?.sender_id ?? 0) === Number(user.id)) return;

      const signal = parseCallSignal(payload?.body ?? '');
      if (signal?.type === 'invite') {
        void pushRealtimeActivity({
          kind: signal.mode === 'group' ? 'group-call-invite' : 'direct-call-invite',
          title: signal.mode === 'group' ? 'Incoming Group Call' : 'Incoming Video Call',
          body: signal.mode === 'group'
            ? `${signal.fromName || 'Someone'} is calling ${signal.title || 'your group'}.`
            : `${signal.fromName || 'Someone'} is inviting you to a video call.`,
          tone: 'warning',
          icon: 'videocam-outline',
          routeKind: 'video-call',
          conversationId: Number(signal.conversationId ?? payload?.conversation_id ?? 0) || undefined,
          groupId: Number(signal.groupId ?? 0) || undefined,
          localNotificationType: 'call',
          mode: signal.mode,
          titleOverride: signal.title,
        });
        return;
      }

      void pushRealtimeActivity({
        kind: 'message-received',
        title: 'New Message',
        body: `${payload?.sender_name || 'Someone'} sent you a message.`,
        tone: 'info',
        icon: 'chatbubble-ellipses-outline',
        routeKind: 'messages',
        conversationId: Number(payload?.conversation_id ?? 0) || undefined,
        localNotificationType: 'message',
      });

      if (user.role === 'client') {
        triggerClientUnreadRefresh();
      } else if (user.role === 'law_firm') {
        triggerLawFirmUnreadRefresh();
      } else if (user.role === 'lawyer') {
        triggerLawyerUnreadRefresh();
      }
    });

    const groupCleanupFns: Array<() => void> = [];
    let groupSubscriptionsDisposed = false;

    if (user.role === 'client') {
      void (async () => {
        try {
          const { data } = await groupApi.groups(user.id);
          if (groupSubscriptionsDisposed) return;

          const groups = Array.isArray(data?.groups) ? data.groups : [];

          groups.forEach((group: { id: number; name?: string }) => {
            const channelName = `group.${group.id}`;
            const channel = echo.private(channelName);

            const onIncomingGroupMessage = (event: any) => {
              const payload = event?.message ?? event;
              if (!payload?.id) return;
              if (Number(payload?.sender_id ?? 0) === Number(user.id)) return;

              const signal = parseCallSignal(payload.content ?? '');

              if (signal?.type === 'invite') {
                void pushRealtimeActivity({
                  kind: 'group-call-invite',
                  title: 'Incoming Group Call',
                  body: `${signal.fromName || 'Someone'} is calling ${signal.title || group.name || 'your group'}.`,
                  tone: 'warning',
                  icon: 'videocam-outline',
                  routeKind: 'group-chat',
                  groupId: Number(signal.groupId ?? group.id),
                  localNotificationType: 'group',
                });
                return;
              }

              if (signal?.type === 'decline') {
                void pushRealtimeActivity({
                  kind: 'group-call-decline',
                  title: 'Group Call Update',
                  body: `${signal.fromName || 'A participant'} declined the call in ${signal.title || group.name || 'your group'}.`,
                  tone: 'info',
                  icon: 'call-outline',
                  routeKind: 'group-chat',
                  groupId: Number(signal.groupId ?? group.id),
                  localNotificationType: 'group',
                });
                return;
              }

              void pushRealtimeActivity({
                kind: 'group-message-received',
                title: 'New Group Message',
                body: `${group.name || 'Your group'} has a new message.`,
                tone: 'info',
                icon: 'people-outline',
                routeKind: 'group-chat',
                groupId: Number(group.id),
                localNotificationType: 'group',
              });
            };

            channel.listen('.GroupMessageSent', onIncomingGroupMessage);
            groupCleanupFns.push(() => {
              try {
                channel.stopListening('.GroupMessageSent');
                echo.leave(channelName);
                echo.leave(`private-${channelName}`);
              } catch {
                // Ignore cleanup races
              }
            });
          });
        } catch {
          // Best effort only. Standard 1:1 notifications remain active.
        }
      })();
    }

    realtimeCleanupRef.current = () => {
      groupSubscriptionsDisposed = true;
      offConsultations();
      offPayments();
      offMessages();
      groupCleanupFns.forEach((cleanup) => cleanup());
      echo.disconnect();
    };

    return () => {
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
    };
  }, [
    token,
    user?.id,
    user?.role,
    triggerClientUnreadRefresh,
    triggerLawyerUnreadRefresh,
    triggerLawFirmUnreadRefresh,
    addActivity,
    dismissBanner,
  ]);

  useEffect(() => {
    if (isLoading || legalAccepted === false) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inClientGroup = segments[0] === '(client)';
    const inLawyerGroup = segments[0] === '(lawyer)';
    const inLawFirmGroup = segments[0] === '(lawfirm)';
    const inLawFirmSettings = segments[0] === 'lawfirm-settings';
    const inAdminGroup = segments[0] === '(admin)';
    const inLawyerDetail = segments[0] === 'lawyer'; // /lawyer/[id] detail page
    const inClientPayroll = segments[0] === 'payroll';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user) {
      if (user.role === 'client' && !inClientGroup && !inLawyerDetail && !inClientPayroll) {
        router.replace('/(client)');
      } else if (user.role === 'lawyer' && !inLawyerGroup) {
        router.replace('/(lawyer)');
      } else if (user.role === 'law_firm' && !inLawFirmGroup && !inLawFirmSettings) {
        router.replace('/(lawfirm)');
      } else if (user.role === 'admin' && !inAdminGroup) {
        router.replace('/(admin)');
      }
    }
  }, [user, isLoading, segments, legalAccepted]);

  if (isLoading || legalAccepted === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  if (!legalAccepted) {
    return (
      <>
        <LegalAcceptanceDialog
          visible
          onAccept={async () => {
            await AsyncStorage.setItem('legalAccepted', 'true');
            setLegalAccepted(true);
          }}
        />
      </>
    );
  }



  return (
    <>
      {(!isConnected || !isInternetReachable) && <OfflineBanner />}
      {bannerActivity ? (
        <ActivityBanner
          activity={bannerActivity}
          roleLabel={roleLabel}
          accentColor={roleTheme.accent}
          onPress={() => {
            markActivityRead(bannerActivity.id);
            dismissBanner();
            openActivityRoute(bannerActivity);
          }}
          onDismiss={() => {
            markActivityRead(bannerActivity.id);
            dismissBanner();
          }}
        />
      ) : null}
      <SecurityLockScreen />
      {/* Tab navigation is handled by Expo Router's Tabs in (tabs)/_layout.tsx */}
      <Slot />

      {/* Session kicked-out overlay */}
      <Modal transparent animationType="fade" visible={kickedOut} statusBarTranslucent>
        <View style={kickedOutStyles.overlay}>
          <LinearGradient
            colors={['#0f1c3f', '#1a2e5e', '#0d2137']}
            style={kickedOutStyles.card}
          >
            <View style={kickedOutStyles.iconWrap}>
              <Text style={kickedOutStyles.iconText}>🔒</Text>
            </View>
            <Text style={kickedOutStyles.title}>Account Signed Out</Text>
            <Text style={kickedOutStyles.message}>
              You were logged out because your account was signed in on another device.
            </Text>
            <TouchableOpacity style={kickedOutStyles.btn} onPress={dismissKickedOut} activeOpacity={0.85}>
              <Text style={kickedOutStyles.btnText}>Back to Login</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>
    </>
  );
}

const kickedOutStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    paddingVertical: 44,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 36,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },
  btn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 50,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.4,
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <View style={{ flex: 1, backgroundColor: Colors.primary }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <OverlayProvider>
            <NotificationsProvider>
              <RootNavigator />
            </NotificationsProvider>
          </OverlayProvider>
        </AuthProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </View>
  );
}

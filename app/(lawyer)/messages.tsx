import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutAnimation,
  Animated,
  Easing,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  AppState,
  Alert,
  Modal,
  Pressable,
  BackHandler,
  Image,
} from 'react-native';
import { Linking, ScrollView as RNScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import { useNotifications } from '@/context/notifications';
import { groupApi, lawyerApi } from '@/services/api';
import { createReverbEcho, isReverbConfigured } from '@/services/realtime';
import { toDisplayMessage } from '@/services/call-signals';
import { resolveStorageUrl } from '@/services/endpoints';
import { Colors } from '@/constants/theme';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';
import ChatAttachmentImage from '@/components/ChatAttachmentImage';
import ChatImageAlbum from '@/components/ChatImageAlbum';
import MessengerComposer from '@/components/chat/MessengerComposer';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';

interface Conversation {
  id: number;
  other_user: {
    id: number;
    name: string;
    avatar_url?: string | null;
    availability_status?: string | null;
    current_status?: string | null;
    current_status_label?: string | null;
    status?: string | null;
    last_seen_at?: string | null;
  };
  last_message?: string;
  last_sender_id?: number;
  last_at?: string;
  unread?: number;
}

interface Message {
  id: number;
  body: string;
  created_at: string;
  time?: string;
  sender_id?: number;
  is_mine?: boolean;
  attachment_url?: string;
  attachment_type?: string;
  attachment_name?: string;
  local_attachment_uri?: string;
  local_attachment_mime?: string;
  local_id?: string;
  delivery_state?: 'sending' | 'failed' | 'sent';
}

interface ContactUser {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

const MESSAGE_PAGE_SIZE = 30;
const KEYBOARD_COMPOSER_GAP = 12;
const Icon = Ionicons as any;
type PresenceStatus = 'active' | 'busy' | 'offline';
const LAWYER_TAB_BAR_STYLE = {
  backgroundColor: '#1E2D4D',
  borderTopWidth: 0,
  borderRadius: 26,
  left: 12,
  right: 12,
  bottom: 12,
  position: 'absolute' as const,
  paddingBottom: Platform.OS === 'ios' ? 12 : 10,
  paddingTop: 8,
  paddingHorizontal: 8,
  height: Platform.OS === 'ios' ? 86 : 74,
  elevation: 16,
  shadowColor: '#091226',
  shadowOpacity: 0.24,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.1)',
};

function toConversationActivityTimestamp(conversation: Conversation) {
  const parsed = Date.parse(conversation?.last_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Just now';
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return 'Just now';

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function inferPresenceStatus(conversation?: Conversation | null): PresenceStatus {
  const raw = String(
    conversation?.other_user?.availability_status
    ?? conversation?.other_user?.current_status
    ?? conversation?.other_user?.current_status_label
    ?? conversation?.other_user?.status
    ?? ''
  ).toLowerCase().trim();

  if (raw.includes('busy')) return 'busy';
  if (raw.includes('offline')) return 'offline';
  if (raw.includes('active') || raw.includes('available') || raw.includes('online') || raw.includes('open')) return 'active';

  const timestamp = Date.parse(String(conversation?.other_user?.last_seen_at ?? ''));
  if (Number.isFinite(timestamp)) {
    const minutes = (Date.now() - timestamp) / 60000;
    if (minutes <= 15) return 'active';
    if (minutes <= 180) return 'busy';
  }

  return 'offline';
}

function getConversationPriority(conversation: Conversation) {
  const presence = inferPresenceStatus(conversation);
  const presenceRank = presence === 'active' ? 0 : presence === 'busy' ? 1 : 2;
  const unreadRank = Number(conversation.unread ?? 0) > 0 ? 0 : 1;
  const recency = toConversationActivityTimestamp(conversation);
  return { presenceRank, unreadRank, recency };
}

function sortInboxConversations(source: Conversation[]) {
  return [...source].sort((a, b) => {
    const aRank = getConversationPriority(a);
    const bRank = getConversationPriority(b);
    if (aRank.presenceRank !== bRank.presenceRank) return aRank.presenceRank - bRank.presenceRank;
    if (aRank.unreadRank !== bRank.unreadRank) return aRank.unreadRank - bRank.unreadRank;
    if (aRank.recency !== bRank.recency) return bRank.recency - aRank.recency;
    return Number(b.id ?? 0) - Number(a.id ?? 0);
  });
}

function presenceCopy(status: PresenceStatus) {
  if (status === 'active') {
    return { label: 'Active now', hint: 'Usually replies quickly', icon: 'radio-button-on-outline' as const };
  }
  if (status === 'busy') {
    return { label: 'Busy right now', hint: 'Might respond a little later', icon: 'time-outline' as const };
  }
  return { label: 'Offline', hint: 'Not currently available', icon: 'ellipse-outline' as const };
}

function getConversationAvatarUri(conversation?: Conversation | null) {
  const avatarUrl = conversation?.other_user?.avatar_url;
  return avatarUrl ? resolveStorageUrl(avatarUrl) : null;
}

function getConversationInitial(conversation?: Conversation | null) {
  return (conversation?.other_user?.name || 'U').charAt(0).toUpperCase();
}

function sortConversationsByActivity(source: Conversation[]) {
  return sortInboxConversations(source);
}

function toConversationPreview(message: Message) {
  if (message.attachment_type === 'image') return 'Photo';
  if (message.attachment_type === 'audio') return 'Voice message';
  if (message.attachment_type === 'file') return message.attachment_name || 'Attachment';
  const body = (message.body || '').trim();
  return body || 'Sent an attachment';
}

export default function MessagesScreen() {
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ conversationId?: string; resetThreadAt?: string; fromNotification?: string }>();
  const { triggerLawyerUnreadRefresh } = useNotifications();
  const navigation = useNavigation();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageConversationId, setMessageConversationId] = useState<number | null>(null);
  const [loadedEmptyConversationId, setLoadedEmptyConversationId] = useState<number | null>(null);
  const [failedMessageConversationId, setFailedMessageConversationId] = useState<number | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [contactUsers, setContactUsers] = useState<ContactUser[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [addingContactId, setAddingContactId] = useState<number | null>(null);
  const [conversationQuery, setConversationQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const recording = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [threadSettling, setThreadSettling] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [pendingBottomCount, setPendingBottomCount] = useState(0);
  const [realtimeTick, setRealtimeTick] = useState(0);
  const listRef = useRef<FlatList>(null);
  const echoRef = useRef<any>(null);
  const shouldStickToBottomRef = useRef(true);
  const focusLatestAfterLoadRef = useRef(false);
  const pendingLatestSnapRef = useRef(false);
  const suppressAutoScrollRef = useRef(false);
  const isUserScrollingRef = useRef(false);
  const autoScrollLockUntilRef = useRef(0);
  const activeConversationIdRef = useRef<number | null>(null);
  const messageLoadRequestRef = useRef(0);
  const visibleLimitByConversationRef = useRef<Record<number, number>>({});
  const fullMessagesByConversationRef = useRef<Record<number, Message[]>>({});
  const olderLoadThrottleRef = useRef(0);
  const inFlightConversationRef = useRef<number | null>(null);
  const isPollingRef = useRef(false);
  const flushScheduledRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedDeepLinkConversationRef = useRef<number | null>(null);
  const handledResetThreadAtRef = useRef<string | null>(null);
  const outgoingSeedRef = useRef(0);
  const actionBackdropOpacity = useRef(new Animated.Value(0)).current;
  const actionSheetTranslateY = useRef(new Animated.Value(36)).current;
  const actionSheetScale = useRef(new Animated.Value(0.96)).current;
  const actionSheetOpacity = useRef(new Animated.Value(0)).current;
  const screenEntrance = useRef(new Animated.Value(0)).current;
  const openedFromNotification = params?.fromNotification === '1';
  const shouldReturnToNotifications = !!selected
    && openedFromNotification
    && Number(params?.conversationId || 0) === Number(selected?.id || 0);
  const isConversationOpen = !!selected;
  const selectedPresenceStatus = useMemo(() => inferPresenceStatus(selected), [selected]);
  const selectedPresence = useMemo(() => presenceCopy(selectedPresenceStatus), [selectedPresenceStatus]);
  const visibleMessages = useMemo(() => {
    if (!selected) return [];
    return messageConversationId === Number(selected.id) ? messages : [];
  }, [messageConversationId, messages, selected]);
  const [composerDockHeight, setComposerDockHeight] = useState(0);
  const [keyboardDockOffset, setKeyboardDockOffset] = useState(0);
  const [threadActionsVisible, setThreadActionsVisible] = useState(false);
  const tabBarHiddenRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (tabBarHiddenRef.current === isConversationOpen) return;

    tabBarHiddenRef.current = isConversationOpen;
    navigation.setOptions({
      tabBarStyle: isConversationOpen
        ? { ...LAWYER_TAB_BAR_STYLE, display: 'none' }
        : LAWYER_TAB_BAR_STYLE,
    });

    return () => {
      tabBarHiddenRef.current = null;
      navigation.setOptions({ tabBarStyle: LAWYER_TAB_BAR_STYLE });
    };
  }, [isConversationOpen, navigation]);

  const openThreadActions = useCallback(() => {
    if (!selected) return;
    setThreadActionsVisible(true);
  }, [selected]);

  const toggleEmojiPanel = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowEmoji((value) => !value);
  }, []);

  useEffect(() => {
    Animated.timing(screenEntrance, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [screenEntrance]);

  const bumpConversationToTop = useCallback((conversationId: number, message?: Message) => {
    setConversations((previous) => {
      const index = previous.findIndex((conversation) => Number(conversation.id) === conversationId);
      if (index < 0) return previous;

      const current = previous[index];
      const updated: Conversation = {
        ...current,
        ...(message
          ? {
              last_message: toConversationPreview(message),
              last_sender_id: message.sender_id,
              last_at: message.created_at ?? new Date().toISOString(),
            }
          : {}),
        unread: activeConversationIdRef.current === conversationId ? 0 : current.unread,
      };

      const next = [updated, ...previous.slice(0, index), ...previous.slice(index + 1)];
      return sortConversationsByActivity(next);
    });
  }, []);

  const flushMessageState = useCallback(() => {
    flushScheduledRef.current = false;
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const limit = visibleLimitByConversationRef.current[conversationId] ?? MESSAGE_PAGE_SIZE;
    const nextFull = fullMessagesByConversationRef.current[conversationId] ?? [];
    const start = Math.max(nextFull.length - limit, 0);
    setMessageConversationId(conversationId);
    setMessages(nextFull.slice(start));
    setHasMoreOlder(nextFull.length > limit);
  }, []);

  const isAutoScrollLocked = useCallback(() => Date.now() < autoScrollLockUntilRef.current, []);

  const scrollToThreadLatest = useCallback((animated = false) => {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }

    setPendingBottomCount(0);
    scrollTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated });
        });
      });
    }, 16);
  }, []);

  const prioritizeThreadLatest = useCallback((animated = false) => {
    shouldStickToBottomRef.current = true;
    pendingLatestSnapRef.current = true;
    focusLatestAfterLoadRef.current = false;
    suppressAutoScrollRef.current = false;
    isUserScrollingRef.current = false;
    autoScrollLockUntilRef.current = 0;

    scrollToThreadLatest(animated);
    setTimeout(() => scrollToThreadLatest(false), 90);
    setTimeout(() => scrollToThreadLatest(false), 220);
    setTimeout(() => scrollToThreadLatest(false), 380);
  }, [scrollToThreadLatest]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      pendingLatestSnapRef.current = true;
      const keyboardHeight = Number(event?.endCoordinates?.height ?? 0);
      setKeyboardDockOffset(Math.max(0, keyboardHeight - insets.bottom));
      if (!activeConversationIdRef.current) return;
      prioritizeThreadLatest(false);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      pendingLatestSnapRef.current = true;
      setKeyboardDockOffset(0);
      if (!activeConversationIdRef.current) return;
      prioritizeThreadLatest(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, prioritizeThreadLatest]);
  useEffect(() => {
    if (!selected) return;
    if (!shouldStickToBottomRef.current && !focusLatestAfterLoadRef.current) return;
    prioritizeThreadLatest(false);
  }, [composerDockHeight, keyboardDockOffset, prioritizeThreadLatest, selected]);

  const resetScrollGuards = useCallback(() => {
    shouldStickToBottomRef.current = true;
    suppressAutoScrollRef.current = false;
    isUserScrollingRef.current = false;
    autoScrollLockUntilRef.current = 0;
    focusLatestAfterLoadRef.current = false;
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
  }, []);

  const scheduleConversationSync = useCallback((conversationId: number, forceScroll = false, isMine = false) => {
    if (activeConversationIdRef.current !== conversationId) return;

    if (!flushScheduledRef.current) {
      flushScheduledRef.current = true;
      requestAnimationFrame(() => flushMessageState());
    }

    if (!suppressAutoScrollRef.current && !isAutoScrollLocked() && (forceScroll || shouldStickToBottomRef.current || isMine)) {
      prioritizeThreadLatest(false);
    }
  }, [flushMessageState, isAutoScrollLocked, prioritizeThreadLatest]);

  const appendIncomingMessage = useCallback((incoming: Message, forceScroll = false) => {
    if (!incoming?.id) return;
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;

    const cached = fullMessagesByConversationRef.current[conversationId] ?? [];
    if (!cached.some((m) => m.id === incoming.id)) {
      fullMessagesByConversationRef.current[conversationId] = [...cached, incoming];
    }

    bumpConversationToTop(conversationId, incoming);

    const isMine = Number(incoming.sender_id) === Number(user?.id) || incoming.is_mine;
    if (!suppressAutoScrollRef.current && !isAutoScrollLocked() && (forceScroll || shouldStickToBottomRef.current || isMine)) {
      scheduleConversationSync(conversationId, forceScroll, isMine);
    } else {
      if (!flushScheduledRef.current) {
        flushScheduledRef.current = true;
        requestAnimationFrame(() => flushMessageState());
      }
      setPendingBottomCount((count) => Math.min(99, count + 1));
    }
  }, [bumpConversationToTop, flushMessageState, isAutoScrollLocked, scheduleConversationSync, user?.id]);

  const createOptimisticMessage = useCallback((message: Omit<Message, 'id' | 'created_at' | 'time'>) => {
    outgoingSeedRef.current += 1;
    const localId = `local-${Date.now()}-${outgoingSeedRef.current}`;
    const createdAt = new Date().toISOString();
    return {
      localId,
      message: {
        ...message,
        id: -Date.now() - outgoingSeedRef.current,
        created_at: createdAt,
        time: new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        local_id: localId,
        delivery_state: 'sending' as const,
      },
    };
  }, []);

  const updateOptimisticMessage = useCallback((localId: string, nextMessage: Message) => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const cached = fullMessagesByConversationRef.current[conversationId] ?? [];
    const serverId = Number(nextMessage.id);
    const hasLocalMessage = cached.some((message) => message.local_id === localId);
    let replacedLocalMessage = false;
    const sentMessage: Message = { ...nextMessage, local_id: localId, delivery_state: 'sent' };

    const nextCached = cached.reduce<Message[]>((next, message) => {
      if (message.local_id === localId) {
        if (!replacedLocalMessage) {
          next.push(sentMessage);
          replacedLocalMessage = true;
        }
        return next;
      }

      // Realtime/polling can insert the server copy before POST resolves.
      // Drop that duplicate once we replace the matching optimistic bubble.
      if (hasLocalMessage && serverId > 0 && Number(message.id) === serverId) {
        return next;
      }

      next.push(message);
      return next;
    }, []);

    if (!replacedLocalMessage && !nextCached.some((message) => Number(message.id) === serverId)) {
      nextCached.push(serverId > 0 ? { ...nextMessage, delivery_state: 'sent' } : sentMessage);
    }

    fullMessagesByConversationRef.current[conversationId] = nextCached;
    flushScheduledRef.current = false;
    flushMessageState();
    setPendingBottomCount(0);
    requestAnimationFrame(() => prioritizeThreadLatest(false));
  }, [flushMessageState, prioritizeThreadLatest]);

  const markOptimisticFailed = useCallback((localId: string) => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    const cached = fullMessagesByConversationRef.current[conversationId] ?? [];
    fullMessagesByConversationRef.current[conversationId] = cached.map((message) =>
      message.local_id === localId ? { ...message, delivery_state: 'failed' as const } : message
    );
    scheduleConversationSync(conversationId, true, true);
  }, [scheduleConversationSync]);

  const retryFailedMessage = useCallback(async (message: Message) => {
    if (!selected || !message.local_id || message.delivery_state !== 'failed') return;

    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;

    const cached = fullMessagesByConversationRef.current[conversationId] ?? [];
    fullMessagesByConversationRef.current[conversationId] = cached.map((item) =>
      item.local_id === message.local_id ? { ...item, delivery_state: 'sending' as const } : item
    );
    scheduleConversationSync(conversationId, true, true);

    try {
      if (message.local_attachment_uri && message.attachment_name) {
        const mimeType = message.local_attachment_mime
          ?? (message.attachment_type === 'image'
            ? 'image/jpeg'
            : message.attachment_type === 'audio'
              ? 'audio/m4a'
              : 'application/octet-stream');
        const { data } = await lawyerApi.sendMessageWithAttachment(selected.id, message.body || '', {
          uri: message.local_attachment_uri,
          name: message.attachment_name,
          type: mimeType,
        });

        updateOptimisticMessage(message.local_id, {
          id: data?.id ?? Date.now(),
          body: data?.body ?? message.body,
          created_at: data?.created_at ?? new Date().toISOString(),
          time: data?.time,
          sender_id: data?.sender_id ?? user?.id,
          is_mine: true,
          attachment_url: data?.attachment_url,
          attachment_type: data?.attachment_type ?? message.attachment_type,
          attachment_name: data?.attachment_name ?? message.attachment_name,
          local_attachment_uri: message.local_attachment_uri,
          local_attachment_mime: mimeType,
        });
      } else {
        const { data } = await lawyerApi.sendMessage(selected.id, message.body || '');
        updateOptimisticMessage(message.local_id, {
          id: data?.id ?? Date.now(),
          body: data?.body ?? message.body,
          created_at: data?.created_at ?? new Date().toISOString(),
          time: data?.time,
          sender_id: data?.sender_id ?? user?.id,
          is_mine: true,
        });
      }

      loadConversations();
    } catch {
      markOptimisticFailed(message.local_id);
      Alert.alert('Retry failed', 'The message could not be delivered. Check your connection and try again.');
    }
  }, [loadConversations, markOptimisticFailed, scheduleConversationSync, selected, updateOptimisticMessage, user?.id]);

  const removeMessageLocally = useCallback((target: Message) => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;

    const cached = fullMessagesByConversationRef.current[conversationId] ?? [];
    fullMessagesByConversationRef.current[conversationId] = cached.filter((message) => {
      if (target.local_id && message.local_id === target.local_id) return false;
      return message.id !== target.id;
    });

    scheduleConversationSync(conversationId, true, true);
  }, [scheduleConversationSync]);

  const deleteMessage = useCallback(async (message: Message, mode: 'me' | 'everyone') => {
    if (message.id <= 0 || message.local_id) {
      removeMessageLocally(message);
      return;
    }

    try {
      await lawyerApi.deleteMessage(message.id, mode);
      removeMessageLocally(message);
      loadConversations();
    } catch (error: any) {
      Alert.alert('Delete failed', error?.response?.data?.message || 'Could not delete the message.');
    }
  }, [loadConversations, removeMessageLocally]);

  const animateActionSheetIn = useCallback(() => {
    actionBackdropOpacity.setValue(0);
    actionSheetTranslateY.setValue(36);
    actionSheetScale.setValue(0.96);
    actionSheetOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(actionBackdropOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(actionSheetTranslateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(actionSheetScale, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(actionSheetOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [actionBackdropOpacity, actionSheetOpacity, actionSheetScale, actionSheetTranslateY]);

  const openMessageActions = useCallback((message: Message) => {
    setActionMessage(message);
    setActionSheetVisible(true);
    animateActionSheetIn();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [animateActionSheetIn]);

  const closeMessageActions = useCallback((onClosed?: () => void) => {
    Animated.parallel([
      Animated.timing(actionBackdropOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(actionSheetTranslateY, {
        toValue: 22,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(actionSheetScale, {
        toValue: 0.98,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(actionSheetOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setActionSheetVisible(false);
      setActionMessage(null);
      onClosed?.();
    });
  }, [actionBackdropOpacity, actionSheetOpacity, actionSheetScale, actionSheetTranslateY]);

  const handleDeleteAction = useCallback((mode: 'me' | 'everyone') => {
    if (!actionMessage) return;
    const target = actionMessage;
    closeMessageActions(() => {
      void deleteMessage(target, mode);
    });
  }, [actionMessage, closeMessageActions, deleteMessage]);

  async function loadConversations() {
    try {
      const { data } = await lawyerApi.conversations();
      setConversations(sortConversationsByActivity(Array.isArray(data) ? data : []));
      triggerLawyerUnreadRefresh();
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const loadContactUsers = useCallback(async () => {
    if (contactsLoading) return;
    setContactsLoading(true);
    try {
      const { data } = await groupApi.users();
      const users = Array.isArray(data?.users) ? data.users : [];
      const normalized = users
        .filter((entry: any) => Number(entry?.id) !== Number(user?.id))
        .map((entry: any) => ({
          id: Number(entry?.id),
          name: String(entry?.name || 'Unknown User'),
          email: typeof entry?.email === 'string' ? entry.email : undefined,
          phone: typeof entry?.phone === 'string' ? entry.phone : undefined,
          role: typeof entry?.role === 'string' ? entry.role : undefined,
        }));

      setContactUsers(normalized);
    } catch {
      Alert.alert('Contacts unavailable', 'Unable to load contacts right now. Please try again.');
    } finally {
      setContactsLoading(false);
    }
  }, [contactsLoading, user?.id]);

  const existingConversationByUser = useMemo(() => {
    const map = new Map<number, Conversation>();
    for (const conversation of conversations) {
      const otherUserId = Number(conversation?.other_user?.id);
      if (otherUserId) map.set(otherUserId, conversation);
    }
    return map;
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const sorted = sortConversationsByActivity(conversations);
    const query = conversationQuery.trim().toLowerCase();
    if (!query) return sorted;

    return sorted.filter((conversation) => {
      const name = (conversation.other_user?.name || '').toLowerCase();
      const preview = (conversation.last_message || '').toLowerCase();
      return name.includes(query) || preview.includes(query);
    });
  }, [conversationQuery, conversations]);

  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    const source = query
      ? contactUsers.filter((entry) => {
        const name = entry.name?.toLowerCase() || '';
        const email = entry.email?.toLowerCase() || '';
        const phone = entry.phone?.toLowerCase() || '';
        return name.includes(query) || email.includes(query) || phone.includes(query);
      })
      : contactUsers;

    return [...source].sort((a, b) => {
      const aHasConversation = existingConversationByUser.has(a.id) ? 1 : 0;
      const bHasConversation = existingConversationByUser.has(b.id) ? 1 : 0;
      if (aHasConversation !== bHasConversation) return bHasConversation - aHasConversation;
      return a.name.localeCompare(b.name);
    });
  }, [contactQuery, contactUsers, existingConversationByUser]);

  const openContactModal = useCallback(() => {
    setShowContactModal(true);
    if (!contactUsers.length) {
      void loadContactUsers();
    }
  }, [contactUsers.length, loadContactUsers]);

  const loadMessages = useCallback(async (conv: Conversation) => {
    const conversationId = Number(conv.id);
    if (inFlightConversationRef.current === conversationId) {
      return;
    }
    const requestId = ++messageLoadRequestRef.current;

    const cached = fullMessagesByConversationRef.current[conversationId] ?? [];
    // For fresh conversations with no prior messages, skip spinner — show "No messages yet" immediately
    setConversationLoading(cached.length === 0);
    inFlightConversationRef.current = conversationId;
    if (messageLoadingTimerRef.current) clearTimeout(messageLoadingTimerRef.current);
    messageLoadingTimerRef.current = setTimeout(() => {
      if (activeConversationIdRef.current !== conversationId || requestId !== messageLoadRequestRef.current) return;
      setConversationLoading(false);
      setFailedMessageConversationId(conversationId);
      setThreadSettling(false);
      messageLoadingTimerRef.current = null;
    }, 8000);

    try {
      const { data } = await lawyerApi.messages(conv.id, { limit: 120 });
      const payload = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];

      if (activeConversationIdRef.current !== conversationId || requestId !== messageLoadRequestRef.current) return;

      const localPending = (fullMessagesByConversationRef.current[conversationId] ?? []).filter(
        (message) => message.local_id && message.delivery_state !== 'sent'
      );
      fullMessagesByConversationRef.current[conversationId] = [...payload, ...localPending];
      const currentLimit = visibleLimitByConversationRef.current[conversationId] ?? MESSAGE_PAGE_SIZE;
      const nextLimit = Math.max(MESSAGE_PAGE_SIZE, currentLimit);
      visibleLimitByConversationRef.current[conversationId] = nextLimit;

      const nextMessages = fullMessagesByConversationRef.current[conversationId];
      const start = Math.max(nextMessages.length - nextLimit, 0);
      setMessageConversationId(conversationId);
      setMessages(nextMessages.slice(start));
      setHasMoreOlder(nextMessages.length > nextLimit);
      setLoadedEmptyConversationId(nextMessages.length === 0 ? conversationId : null);
      setFailedMessageConversationId(null);
      setPendingBottomCount(0);

      if (shouldStickToBottomRef.current || focusLatestAfterLoadRef.current) {
        prioritizeThreadLatest(false);
        setTimeout(() => setThreadSettling(false), 80);
      }
    } catch {
      if (activeConversationIdRef.current !== conversationId || requestId !== messageLoadRequestRef.current) return;
      setMessageConversationId(conversationId);
      setMessages([]);
      setLoadedEmptyConversationId(null);
      setFailedMessageConversationId(conversationId);
    } finally {
      if (activeConversationIdRef.current === conversationId && requestId === messageLoadRequestRef.current) {
        setConversationLoading(false);
      }
      if (inFlightConversationRef.current === conversationId) {
        inFlightConversationRef.current = null;
      }
      if (
        activeConversationIdRef.current === conversationId
        && requestId === messageLoadRequestRef.current
        && messageLoadingTimerRef.current
      ) {
        clearTimeout(messageLoadingTimerRef.current);
        messageLoadingTimerRef.current = null;
      }
    }
  }, [prioritizeThreadLatest]);

  const scheduleConversationRefresh = useCallback(() => {
    if (convRefreshTimerRef.current) return;
    convRefreshTimerRef.current = setTimeout(() => {
      convRefreshTimerRef.current = null;
      loadConversations();
    }, 1500);
  }, [loadConversations]);

  const pollMessages = useCallback(async (conv: Conversation) => {
    const conversationId = Number(conv.id);
    if (activeConversationIdRef.current !== conversationId) return;
    if (isPollingRef.current) return;
    if (inFlightConversationRef.current === conversationId) return;
    isPollingRef.current = true;
    try {
      const { data } = await lawyerApi.messages(conv.id, { limit: 120 });
      if (activeConversationIdRef.current !== conversationId) return;
      const payload: Message[] = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
      const cached = fullMessagesByConversationRef.current[conversationId] ?? [];
      const cachedIds = new Set(cached.map((m) => m.id));
      const latestCachedTime = cached.reduce((latest, message) => {
        if (message.local_id) return latest;
        const parsed = Date.parse(message.created_at || '');
        return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
      }, 0);
      const newMsgs = payload
        .filter((message) => {
          if (cachedIds.has(message.id)) return false;
          const parsed = Date.parse(message.created_at || '');
          return !latestCachedTime || (Number.isFinite(parsed) && parsed >= latestCachedTime);
        })
        .sort((a, b) => Date.parse(a.created_at || '') - Date.parse(b.created_at || ''));
      if (newMsgs.length > 0) {
        fullMessagesByConversationRef.current[conversationId] = [...cached, ...newMsgs];
        flushScheduledRef.current = false;
        flushMessageState();
        if (shouldStickToBottomRef.current) {
          prioritizeThreadLatest(false);
        } else {
          setPendingBottomCount((count) => Math.min(99, count + newMsgs.length));
        }
      }
    } catch {
      // ignore poll errors
    } finally {
      isPollingRef.current = false;
    }
  }, [flushMessageState, prioritizeThreadLatest]);

  const openConversation = useCallback((conv: Conversation) => {
    const conversationId = Number(conv.id);
    if (messageLoadingTimerRef.current) {
      clearTimeout(messageLoadingTimerRef.current);
      messageLoadingTimerRef.current = null;
    }
    inFlightConversationRef.current = null;
    activeConversationIdRef.current = conversationId;
    resetScrollGuards();
    focusLatestAfterLoadRef.current = true;
    pendingLatestSnapRef.current = true;
    setPendingBottomCount(0);
    setThreadSettling(true);
    messageLoadRequestRef.current += 1;
    const visibleLimit = visibleLimitByConversationRef.current[conversationId] ?? MESSAGE_PAGE_SIZE;
    visibleLimitByConversationRef.current[conversationId] = visibleLimit;

    const cached = fullMessagesByConversationRef.current[conversationId] ?? [];
    const start = Math.max(cached.length - visibleLimit, 0);
    setMessageConversationId(conversationId);
    setMessages(cached.slice(start));
    setHasMoreOlder(cached.length > visibleLimit);
    setLoadedEmptyConversationId(null);
    setFailedMessageConversationId(null);
    setConversationLoading(cached.length === 0);
    prioritizeThreadLatest(false);
    setTimeout(() => setThreadSettling(false), 110);

    setSelected(conv);
    triggerLawyerUnreadRefresh();
    loadMessages(conv);
  }, [loadMessages, prioritizeThreadLatest, resetScrollGuards, triggerLawyerUnreadRefresh]);

  const openOrStartConversationFromContact = useCallback(async (contact: ContactUser) => {
    const existing = existingConversationByUser.get(contact.id);
    if (existing) {
      setShowContactModal(false);
      setContactQuery('');
      openConversation(existing);
      return;
    }

    if (contact.role && contact.role !== 'client') {
      Alert.alert('Unavailable', 'Lawyers can only start direct chats with client accounts.');
      return;
    }

    setAddingContactId(contact.id);
    try {
      await lawyerApi.startConversation(contact.id);
      const { data } = await lawyerApi.conversations();
      const latestConversations: Conversation[] = Array.isArray(data) ? data : [];
      setConversations(sortConversationsByActivity(latestConversations));

      const target = latestConversations.find((entry) => Number(entry?.other_user?.id) === Number(contact.id));
      setShowContactModal(false);
      setContactQuery('');

      if (target) {
        openConversation(target);
      } else {
        Alert.alert('Started', 'Contact added. Pull to refresh if it does not appear immediately.');
      }

      triggerLawyerUnreadRefresh();
    } catch (error: any) {
      Alert.alert('Unable to start chat', error?.response?.data?.message || 'Please check the contact and try again.');
    } finally {
      setAddingContactId(null);
    }
  }, [existingConversationByUser, openConversation, triggerLawyerUnreadRefresh]);

  const closeConversation = useCallback(() => {
    if (messageLoadingTimerRef.current) {
      clearTimeout(messageLoadingTimerRef.current);
      messageLoadingTimerRef.current = null;
    }
    tabBarHiddenRef.current = false;
    navigation.setOptions({ tabBarStyle: LAWYER_TAB_BAR_STYLE });
    activeConversationIdRef.current = null;
    inFlightConversationRef.current = null;
    messageLoadRequestRef.current += 1;
    resetScrollGuards();
    focusLatestAfterLoadRef.current = false;
    setSelected(null);
    setMessageConversationId(null);
    setLoadedEmptyConversationId(null);
    setFailedMessageConversationId(null);
    setMessages([]);
    setHasMoreOlder(false);
    setPendingBottomCount(0);
    setLoadingOlder(false);
    setConversationLoading(false);
    loadConversations();
    triggerLawyerUnreadRefresh();
  }, [loadConversations, navigation, resetScrollGuards, triggerLawyerUnreadRefresh]);

  const handleConversationBack = useCallback(() => {
    if (shouldReturnToNotifications) {
      router.back();
      return;
    }

    closeConversation();
  }, [closeConversation, router, shouldReturnToNotifications]);

  const scrollToLatest = useCallback(() => {
    shouldStickToBottomRef.current = true;
    focusLatestAfterLoadRef.current = false;
    prioritizeThreadLatest(true);
  }, [prioritizeThreadLatest]);

  const handleComposerFocus = useCallback(() => {
    setShowEmoji(false);
    prioritizeThreadLatest(false);
  }, [prioritizeThreadLatest]);

  const loadOlderMessages = useCallback(() => {
    if (!selected || loadingOlder || !hasMoreOlder) return;

    const now = Date.now();
    if (now - olderLoadThrottleRef.current < 250) return;
    olderLoadThrottleRef.current = now;

    const conversationId = Number(selected.id);
    const full = fullMessagesByConversationRef.current[conversationId] ?? [];
    const currentLimit = visibleLimitByConversationRef.current[conversationId] ?? MESSAGE_PAGE_SIZE;

    if (full.length <= currentLimit) {
      setHasMoreOlder(false);
      return;
    }

    setLoadingOlder(true);
    setTimeout(() => {
      const nextLimit = currentLimit + MESSAGE_PAGE_SIZE;
      visibleLimitByConversationRef.current[conversationId] = nextLimit;
      const start = Math.max(full.length - nextLimit, 0);
      setMessageConversationId(conversationId);
      setMessages(full.slice(start));
      setLoadedEmptyConversationId(null);
      setFailedMessageConversationId(null);
      setHasMoreOlder(full.length > nextLimit);
      setLoadingOlder(false);
    }, 220);
  }, [hasMoreOlder, loadingOlder, selected]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const rawConversationId = params?.conversationId;
    if (!rawConversationId || !conversations.length) return;

    const targetId = Number(rawConversationId);
    if (!targetId) return;
    if (openedDeepLinkConversationRef.current === targetId) return;

    const target = conversations.find((conv) => Number(conv.id) === targetId);
    if (!target) return;

    openedDeepLinkConversationRef.current = targetId;
    openConversation(target);
  }, [conversations, openConversation, params?.conversationId]);

  const focusRefreshRef = useRef({ loadConversations, loadMessages, selected });

  useEffect(() => {
    focusRefreshRef.current = { loadConversations, loadMessages, selected };
  }, [loadConversations, loadMessages, selected]);

  useFocusEffect(
    useCallback(() => {
      const latest = focusRefreshRef.current;
      latest.loadConversations();
      if (latest.selected) {
        activeConversationIdRef.current = Number(latest.selected.id);
        latest.loadMessages(latest.selected);
        setRealtimeTick((value) => value + 1);
      }
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (!selected) return false;
        handleConversationBack();
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [handleConversationBack, selected])
  );

  useEffect(() => {
    const resetToken = typeof params?.resetThreadAt === 'string' ? params.resetThreadAt : null;
    if (!resetToken || handledResetThreadAtRef.current === resetToken) return;

    // Consume this reset token exactly once so stale params won't close future conversations.
    handledResetThreadAtRef.current = resetToken;

    if (selected) {
      closeConversation();
    }
  }, [closeConversation, params?.resetThreadAt, selected]);

  useEffect(() => {
    if (!selected) return;
    if (activeConversationIdRef.current !== Number(selected.id)) {
      activeConversationIdRef.current = Number(selected.id);
      shouldStickToBottomRef.current = true;
      setMessageConversationId(null);
      setLoadedEmptyConversationId(null);
      setFailedMessageConversationId(null);
      setMessages([]);
    }
    loadMessages(selected);
  }, [selected, loadMessages]);

  useEffect(() => {
    if (selected) return;

    const intervalId = setInterval(() => {
      loadConversations();
    }, 2500);

    return () => clearInterval(intervalId);
  }, [loadConversations, selected]);

  useEffect(() => {
    if (!selected) return;

    const intervalId = setInterval(() => {
      void pollMessages(selected);
    }, 450);

    return () => clearInterval(intervalId);
  }, [pollMessages, selected]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      loadConversations();
      if (selected) {
        loadMessages(selected);
        setRealtimeTick((value) => value + 1);
      }
    });

    return () => subscription.remove();
  }, [loadConversations, loadMessages, selected]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (messageLoadingTimerRef.current) clearTimeout(messageLoadingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selected || !token || !isReverbConfigured()) return;

    const echo = createReverbEcho(token);
    const channelName = `conversation.${selected.id}`;
    const channel = echo.private(channelName);

    echoRef.current = echo;

    const onIncoming = (event: any) => {
      const payload = event?.message ?? event;
      if (!payload?.id) return;

      const senderId = payload.sender_id ? Number(payload.sender_id) : undefined;
      const incomingConversationId = Number(payload.conversation_id ?? selected.id);

      if (incomingConversationId !== Number(selected.id)) return;

      appendIncomingMessage({
        id: Number(payload.id),
        body: String(payload.body ?? ''),
        created_at: payload.created_at ?? new Date().toISOString(),
        time: payload.time,
        sender_id: senderId,
        is_mine: senderId === Number(user?.id),
          attachment_url: payload.attachment_url ?? payload.attachment_path,
          attachment_type: payload.attachment_type,
          attachment_name: payload.attachment_name,
      }, senderId === Number(user?.id));

      scheduleConversationRefresh();
    };

    channel.listen('.MessageSent', onIncoming);
    channel.listen('.message.sent', onIncoming);

    return () => {
      try {
        channel.stopListening('.MessageSent');
        channel.stopListening('.message.sent');
        echo.leave(channelName);
        echo.leave(`private-${channelName}`);
        echo.disconnect();
      } catch {
        // Ignore cleanup issues when screen is disposed quickly.
      }
      echoRef.current = null;
    };
  }, [appendIncomingMessage, loadConversations, scheduleConversationRefresh, selected, token, user?.id, realtimeTick]);

  async function sendMessage(text?: string) {
    const body = (text ?? newMsg).trim();
    if (!selected || !body) return;
    setSending(true);
    setShowEmoji(false);
    const { localId, message } = createOptimisticMessage({
      body,
      sender_id: user?.id,
      is_mine: true,
    });
    appendIncomingMessage(message, true);
    setNewMsg('');
    setSending(false);
    try {
      const { data } = await lawyerApi.sendMessage(selected.id, body);
      updateOptimisticMessage(localId, {
        id: data?.id ?? Date.now(),
        body: data?.body ?? body,
        created_at: data?.created_at ?? new Date().toISOString(),
        time: data?.time,
        sender_id: data?.sender_id ?? user?.id,
        is_mine: true,
      });
      loadConversations();
    } catch {
      markOptimisticFailed(localId);
      Alert.alert('Message not delivered', 'Your message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  }

    async function sendAttachment(uri: string, name: string, mimeType: string) {
      if (!selected) return;
      setSending(true);
      setShowEmoji(false);
      const body = newMsg.trim();
      const attachmentType = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : 'file';
      const { localId, message } = createOptimisticMessage({
        body,
        sender_id: user?.id,
        is_mine: true,
        attachment_name: name,
        attachment_type: attachmentType,
        local_attachment_uri: uri,
        local_attachment_mime: mimeType,
      });
      appendIncomingMessage(message, true);
      setNewMsg('');
      try {
        const { data } = await lawyerApi.sendMessageWithAttachment(selected.id, body, { uri, name, type: mimeType });
        updateOptimisticMessage(localId, {
          id: data?.id ?? Date.now(),
          body: data?.body ?? body,
          created_at: data?.created_at ?? new Date().toISOString(),
          time: data?.time,
          sender_id: data?.sender_id ?? user?.id,
          is_mine: true,
          attachment_url: data?.attachment_url,
          attachment_type: data?.attachment_type,
          attachment_name: data?.attachment_name,
        });
        loadConversations();
      } catch {
        markOptimisticFailed(localId);
        Alert.alert('Upload failed', 'Could not send file. Please try again.');
      } finally {
        setSending(false);
      }
    }

    async function pickImage() {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to send images.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });
      if (!result.canceled && result.assets.length > 0) {
        for (const [index, asset] of result.assets.entries()) {
          const ext = asset.uri.split('.').pop() ?? 'jpg';
          const safeExt = ext.toLowerCase();
          const generatedName = `image-${Date.now()}-${index + 1}.${safeExt}`;
          const fileName = asset.fileName || generatedName;
          await sendAttachment(asset.uri, fileName, asset.mimeType ?? `image/${safeExt}`);
        }
      }
    }

    async function pickFile() {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        await sendAttachment(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
      }
    }

    async function startVoiceRecording() {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed', 'Allow microphone access to send voice messages.'); return; }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recording.prepareToRecordAsync();
        await recording.record();
        setRecordingSeconds(0);
        setIsRecording(true);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
      } catch {
        setIsRecording(false);
        setRecordingSeconds(0);
        Alert.alert('Error', 'Could not start recording.');
      }
    }

    async function stopAndSendVoice() {
      if (!isRecording) return;
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
      try {
        await recording.stop();
        await setAudioModeAsync({ allowsRecording: false });
        const uri = recording.uri;
        setIsRecording(false);
        setRecordingSeconds(0);
        if (uri) await sendAttachment(uri, 'voice-message.m4a', 'audio/m4a');
      } catch {
        setIsRecording(false);
        Alert.alert('Error', 'Could not send voice message.');
        setRecordingSeconds(0);
      }
    }

    const EMOJIS = ['😊','😂','❤️','👍','🙏','😍','🔥','✅','😭','🎉','😒','💪','🤔','😘','👀','🙌','💯','😅','🤣','😢','😏','💀','🤝','😁','🥹','😔','🥺','😀','😎','🤯','👏','🫶','🙂','😜','😆'];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (selected) {
    return (
      <SafeAreaView key={`thread-${selected.id}`} style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={handleConversationBack}>
            <Icon name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.chatHeaderAvatar}>
            {getConversationAvatarUri(selected) ? (
              <Image source={{ uri: getConversationAvatarUri(selected)! }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.chatHeaderAvatarText}>{getConversationInitial(selected)}</Text>
            )}
          </View>
          <Text style={styles.chatHeaderName} numberOfLines={1}>{selected.other_user?.name || 'Conversation'}</Text>
          <View style={{ marginLeft: 'auto' }}>
            <TouchableOpacity onPress={openThreadActions} accessibilityRole="button" accessibilityLabel="Open conversation actions">
              <Icon name="information-circle-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <Modal visible={threadActionsVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setThreadActionsVisible(false)}>
          <View style={styles.threadActionsOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setThreadActionsVisible(false)} />
            <View style={styles.threadActionsCard}>
              <View style={styles.threadActionsHandle} />
              <View style={styles.threadActionsHero}>
                <View style={styles.threadActionsAvatar}>
                  {getConversationAvatarUri(selected) ? (
                    <Image source={{ uri: getConversationAvatarUri(selected)! }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.threadActionsAvatarText}>{getConversationInitial(selected)}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.threadActionsTitle} numberOfLines={1}>{selected?.other_user?.name || 'Conversation'}</Text>
                  <Text style={styles.threadActionsSub}>Status: {selectedPresence.label} - {selectedPresence.hint}</Text>
                </View>
              </View>

              <View style={styles.threadActionsMetaGrid}>
                <View style={styles.threadActionsMetaItem}>
                  <Text style={styles.threadActionsMetaValue}>{Number(selected?.unread ?? 0)}</Text>
                  <Text style={styles.threadActionsMetaLabel}>Unread</Text>
                </View>
                <View style={styles.threadActionsMetaItem}>
                  <Text style={styles.threadActionsMetaValue}>{formatRelativeTime(selected?.last_at)}</Text>
                  <Text style={styles.threadActionsMetaLabel}>Last active</Text>
                </View>
              </View>

              <View style={styles.threadActionsList}>
                <TouchableOpacity
                  style={styles.threadActionsRow}
                  onPress={() => {
                    setThreadActionsVisible(false);
                    Alert.alert('Mute chat', 'Mute notifications for this conversation is not wired yet.');
                  }}
                >
                  <View style={styles.threadActionsRowIconWrap}>
                    <Icon name="notifications-off-outline" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.threadActionsRowTitle}>Mute chat</Text>
                    <Text style={styles.threadActionsRowSub}>Silence alerts for this thread</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={Colors.textLight} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.threadActionsRow}
                  onPress={() => {
                    setThreadActionsVisible(false);
                    Alert.alert('Report / block', 'This action is not wired yet.');
                  }}
                >
                  <View style={[styles.threadActionsRowIconWrap, styles.threadActionsDangerIconWrap]}>
                    <Icon name="shield-outline" size={16} color={Colors.error} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.threadActionsRowTitle}>Report / block</Text>
                    <Text style={styles.threadActionsRowSub}>Protect your account and conversation</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.threadActionsCloseBtn} onPress={() => setThreadActionsVisible(false)}>
                <Text style={styles.threadActionsCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
          <FlatList
            key={`conversation-${selected.id}`}
            ref={listRef}
            style={[{ flex: 1 }, threadSettling && styles.threadSettling]}
            data={visibleMessages}
            keyExtractor={(item) => String(item.local_id ?? item.id)}
            contentContainerStyle={[
              styles.messagesList,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            scrollEnabled={true}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={10}
            removeClippedSubviews={false}
            onScrollBeginDrag={() => {
              isUserScrollingRef.current = true;
              shouldStickToBottomRef.current = false;
              suppressAutoScrollRef.current = true;
              autoScrollLockUntilRef.current = Date.now() + 700;
            }}
            onScrollEndDrag={() => {
              autoScrollLockUntilRef.current = Date.now() + 300;
              setTimeout(() => {
                isUserScrollingRef.current = false;
              }, 120);
              requestAnimationFrame(() => {
                suppressAutoScrollRef.current = false;
              });
            }}
            onMomentumScrollEnd={() => {
              suppressAutoScrollRef.current = false;
              isUserScrollingRef.current = false;
            }}
            onScroll={({ nativeEvent }) => {
              const distanceFromBottom =
                nativeEvent.contentSize.height - (nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y);
              const atBottom = distanceFromBottom < 120;
              shouldStickToBottomRef.current = atBottom && !isAutoScrollLocked();
              if (atBottom && pendingBottomCount > 0) {
                setPendingBottomCount(0);
              }

              if (nativeEvent.contentOffset.y < 16) {
                loadOlderMessages();
              }
            }}
            scrollEventThrottle={16}
            onContentSizeChange={() => {
              if (pendingLatestSnapRef.current && shouldStickToBottomRef.current && !isAutoScrollLocked()) {
                pendingLatestSnapRef.current = false;
                focusLatestAfterLoadRef.current = false;
                prioritizeThreadLatest(false);
                return;
              }
              if (!suppressAutoScrollRef.current && shouldStickToBottomRef.current && !isAutoScrollLocked()) {
                prioritizeThreadLatest(false);
              }
            }}
            ListHeaderComponent={
              loadingOlder ? (
                <View style={styles.historyLoaderWrap}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.historyLoaderText}>Loading older messages...</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              failedMessageConversationId === Number(selected.id) ? (
                <View style={styles.threadLoaderWrap}>
                  <Ionicons name="warning-outline" size={18} color={Colors.error} />
                  <Text style={styles.threadLoaderTitle}>Could not load messages</Text>
                  <Text style={styles.threadLoaderSub}>Go back and open this conversation again.</Text>
                </View>
              ) : conversationLoading || loadedEmptyConversationId !== Number(selected.id) ? (
                <View style={styles.threadLoaderWrap}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.threadLoaderTitle}>Loading messages...</Text>
                  <Text style={styles.threadLoaderSub}>Please wait a moment</Text>
                </View>
              ) : (
                <View style={styles.threadLoaderWrap}>
                  <Text style={styles.threadLoaderSub}>No messages yet</Text>
                </View>
              )
            }
            ListFooterComponent={<View style={{ height: composerDockHeight + keyboardDockOffset + KEYBOARD_COMPOSER_GAP + 16 }} />}
            renderItem={({ item, index }) => {
              const hasBody = Boolean(toDisplayMessage(item.body));
              const isImageOnly = item.attachment_type === 'image' && !hasBody;
              const sameSender = (a?: Message, b?: Message) =>
                !!a
                && !!b
                && Number(a.sender_id ?? 0) === Number(b.sender_id ?? 0)
                && Boolean(a.is_mine) === Boolean(b.is_mine);
              const isImageOnlyMessage = (message?: Message) => {
                if (!message) return false;
                const bodyText = toDisplayMessage(message.body);
                return message.attachment_type === 'image'
                  && !bodyText
                  && Boolean(message.attachment_url || message.local_attachment_uri);
              };

              if (isImageOnly) {
                const previous = visibleMessages[index - 1];
                if (isImageOnlyMessage(previous) && sameSender(previous, item)) {
                  return null;
                }

                const albumMessages: Message[] = [item];
                  for (let cursor = index + 1; cursor < visibleMessages.length; cursor += 1) {
                    const next = visibleMessages[cursor];
                  if (!isImageOnlyMessage(next) || !sameSender(item, next)) {
                    break;
                  }
                  albumMessages.push(next);
                }

                if (albumMessages.length > 1) {
                  const failedMessage = albumMessages.find((message) => message.delivery_state === 'failed');
                  const hasSending = albumMessages.some((message) => message.delivery_state === 'sending');
                  const albumState: Message['delivery_state'] = failedMessage
                    ? 'failed'
                    : hasSending
                      ? 'sending'
                      : 'sent';
                  const tail = albumMessages[albumMessages.length - 1];
                  const actionTarget = failedMessage ?? tail;

                  const albumImages = albumMessages
                    .map((message, imageIndex) => {
                      const uri = message.attachment_url
                        ? resolveStorageUrl(message.attachment_url)
                        : message.local_attachment_uri;
                      if (!uri) return null;
                      return {
                        id: message.local_id ?? message.id ?? `${index}-${imageIndex}`,
                        uri,
                        canOpen: !!message.attachment_url,
                      };
                    })
                    .filter((entry): entry is { id: string | number; uri: string; canOpen: boolean } => Boolean(entry));

                  if (albumImages.length > 1) {
                    return (
                      <TouchableOpacity
                        activeOpacity={item.is_mine && albumState === 'failed' ? 0.85 : 1}
                        onPress={() => {
                          if (item.is_mine && failedMessage) {
                            void retryFailedMessage(failedMessage);
                          }
                        }}
                        onLongPress={() => openMessageActions(actionTarget)}
                      >
                        <View style={[styles.bubble, item.is_mine ? styles.myBubble : styles.theirBubble, albumState === 'failed' && styles.failedBubble]}>
                          <ChatImageAlbum
                            images={albumImages}
                            onPressImage={(imageIndex) => {
                              const image = albumImages[imageIndex];
                              if (image?.uri) {
                                Linking.openURL(image.uri);
                              }
                            }}
                            onLongPress={() => openMessageActions(actionTarget)}
                          />
                          <View style={styles.bubbleMetaRow}>
                            <Text style={[styles.bubbleTime, item.is_mine && { color: 'rgba(255,255,255,0.7)' }]}>
                              {tail.time || new Date(tail.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                            {item.is_mine && albumState !== 'sent' ? (
                              <View style={[
                                styles.deliveryStatePill,
                                albumState === 'failed' && styles.deliveryStatePillFailed,
                              ]}>
                                <Icon
                                  name={albumState === 'sending' ? 'time-outline' : albumState === 'failed' ? 'alert-circle-outline' : 'checkmark-done'}
                                  size={11}
                                  color={albumState === 'failed' ? '#fff' : item.is_mine ? '#ffffffdd' : Colors.primary}
                                />
                                <Text style={[
                                  styles.deliveryStateText,
                                  item.is_mine && styles.deliveryStateTextMine,
                                  albumState === 'failed' && styles.deliveryStateTextFailed,
                                ]} numberOfLines={1} ellipsizeMode="tail">
                                  {albumState === 'sending' ? 'Sending' : albumState === 'failed' ? 'Not delivered · Tap to retry' : 'Delivered'}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }
                }
              }

              return (
                <TouchableOpacity
                  activeOpacity={item.is_mine && item.delivery_state === 'failed' ? 0.85 : 1}
                  onPress={() => {
                    if (item.is_mine && item.delivery_state === 'failed') {
                      void retryFailedMessage(item);
                    }
                  }}
                  onLongPress={() => openMessageActions(item)}
                >
                <View style={[styles.bubble, item.is_mine ? styles.myBubble : styles.theirBubble, item.delivery_state === 'failed' && styles.failedBubble]}>
                  {(() => {
                    const attachmentUri = item.attachment_url
                      ? resolveStorageUrl(item.attachment_url)
                      : item.local_attachment_uri;

                    if (item.attachment_type === 'image' && attachmentUri) {
                      return (
                        <ChatAttachmentImage
                          uri={attachmentUri}
                          canOpen={!!item.attachment_url}
                          onPress={() => Linking.openURL(attachmentUri)}
                          onLongPress={() => openMessageActions(item)}
                        />
                      );
                    }

                    if (item.attachment_type === 'audio' && (attachmentUri || item.attachment_name)) {
                      return (
                        <TouchableOpacity disabled={!item.attachment_url} style={styles.audioRow} onPress={() => attachmentUri && Linking.openURL(attachmentUri)} onLongPress={() => openMessageActions(item)}>
                          <Icon name="play-circle" size={30} color={item.is_mine ? '#fff' : Colors.primary} />
                          <Text style={[styles.audioLabel, item.is_mine && { color: '#ffffffdd' }]}>Voice message</Text>
                        </TouchableOpacity>
                      );
                    }

                    if (item.attachment_type === 'file' && (attachmentUri || item.attachment_name)) {
                      return (
                        <TouchableOpacity disabled={!item.attachment_url} style={styles.fileRow} onPress={() => attachmentUri && Linking.openURL(attachmentUri)} onLongPress={() => openMessageActions(item)}>
                          <Icon name="document-attach" size={22} color={item.is_mine ? '#fff' : Colors.primary} />
                          <Text style={[styles.fileName, item.is_mine && { color: '#ffffffdd' }]} numberOfLines={1}>
                            {item.attachment_name ?? 'File'}
                          </Text>
                        </TouchableOpacity>
                      );
                    }

                    return null;
                  })()}
                  {!!toDisplayMessage(item.body) && (
                    <Text
                      style={[styles.bubbleText, item.is_mine && { color: '#fff' }]}
                      textBreakStrategy={Platform.OS === 'android' ? 'simple' : 'highQuality'}
                    >
                      {toDisplayMessage(item.body)}
                    </Text>
                  )}
                  <View style={styles.bubbleMetaRow}>
                    <Text style={[styles.bubbleTime, item.is_mine && { color: 'rgba(255,255,255,0.7)' }]}>
                      {item.time || new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {item.is_mine && item.delivery_state && item.delivery_state !== 'sent' ? (
                      <View style={[
                        styles.deliveryStatePill,
                        item.delivery_state === 'failed' && styles.deliveryStatePillFailed,
                      ]}>
                        <Icon
                          name={item.delivery_state === 'sending' ? 'time-outline' : item.delivery_state === 'failed' ? 'alert-circle-outline' : 'checkmark-done'}
                          size={11}
                          color={item.delivery_state === 'failed' ? '#fff' : item.is_mine ? '#ffffffdd' : Colors.primary}
                        />
                        <Text style={[
                          styles.deliveryStateText,
                          item.is_mine && styles.deliveryStateTextMine,
                          item.delivery_state === 'failed' && styles.deliveryStateTextFailed,
                        ]} numberOfLines={1} ellipsizeMode="tail">
                          {item.delivery_state === 'sending' ? 'Sending' : item.delivery_state === 'failed' ? 'Not delivered · Tap to retry' : 'Delivered'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                </TouchableOpacity>
              );
            }}
          />

          <View
            onLayout={(event) => {
              const nextHeight = event.nativeEvent.layout.height;
              setComposerDockHeight((current) => (current === nextHeight ? current : nextHeight));
              if (selected && (shouldStickToBottomRef.current || focusLatestAfterLoadRef.current)) {
                pendingLatestSnapRef.current = true;
                prioritizeThreadLatest(false);
              }
            }}
              style={[
                styles.composerDock,
                {
                  bottom: keyboardDockOffset > 0 ? keyboardDockOffset + KEYBOARD_COMPOSER_GAP : 0,
                  paddingBottom: Math.max(keyboardDockOffset > 0 ? 14 : insets.bottom, 8),
                },
              ]}
            >
            <MessengerComposer
              value={newMsg}
              onChangeText={setNewMsg}
              onSendText={() => void sendMessage()}
              onSendThumb={() => void sendMessage('\u{1F44D}')}
              onToggleEmojiPanel={toggleEmojiPanel}
              onStartVoiceRecording={startVoiceRecording}
              onPickImage={pickImage}
              onPickFile={pickFile}
              onStopAndSendVoice={stopAndSendVoice}
              onSelectEmoji={(emoji) => setNewMsg((m) => m + emoji)}
              onJumpToLatest={scrollToLatest}
              onFocusTextInput={handleComposerFocus}
              showEmoji={showEmoji}
              isRecording={isRecording}
              recordingSeconds={recordingSeconds}
              sending={sending}
              pendingBottomCount={pendingBottomCount}
            />
          </View>
        </KeyboardAvoidingView>
        <Modal visible={actionSheetVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => closeMessageActions()}>
          <View style={styles.actionOverlay}>
            <Animated.View pointerEvents="none" style={[styles.actionBackdrop, { opacity: actionBackdropOpacity }]} />
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closeMessageActions()} />
            <Animated.View
              style={[
                styles.actionSheet,
                {
                  opacity: actionSheetOpacity,
                  transform: [{ translateY: actionSheetTranslateY }, { scale: actionSheetScale }],
                },
              ]}
            >
              <View style={styles.actionHandle} />
              <AnimatedBorderCard style={styles.actionHeroShell} contentStyle={styles.actionHero} borderRadius={18} borderWidth={1.1}>
                <View style={styles.actionHeroIconWrap}>
                  <Icon name="sparkles-outline" size={18} color={Colors.primary} />
                </View>
                <View style={styles.actionHeroCopy}>
                  <Text style={styles.actionEyebrow}>MESSAGE ACTIONS</Text>
                  <Text style={styles.actionTitle}>Manage this message</Text>
                  <Text style={styles.actionSub}>Choose how this message should be handled in the conversation.</Text>
                </View>
              </AnimatedBorderCard>

              <View style={styles.actionPreviewCard}>
                <View style={styles.actionPreviewTop}>
                  <View style={styles.actionPreviewBadge}>
                    <Icon name={getActionMessageIcon(actionMessage)} size={14} color={Colors.primary} />
                    <Text style={styles.actionPreviewBadgeText}>{getActionMessageKind(actionMessage)}</Text>
                  </View>
                  <Text style={styles.actionPreviewMeta}>
                    {actionMessage?.is_mine ? 'You' : selected?.other_user?.name || 'Participant'}
                    {' • '}
                    {getActionMessageTime(actionMessage)}
                  </Text>
                </View>
                <Text style={styles.actionPreviewText} numberOfLines={3}>
                  {getActionMessagePreview(actionMessage)}
                </Text>
              </View>

              <Text style={styles.actionSectionLabel}>Choose an action</Text>

              {actionMessage?.is_mine && actionMessage.id > 0 && !actionMessage.local_id ? (
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnOutline]} onPress={() => handleDeleteAction('everyone')}>
                  <View style={[styles.actionBtnIconWrap, styles.actionBtnIconOutline]}>
                    <Icon name="people-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.actionBtnCopy}>
                    <Text style={[styles.actionBtnTitle, styles.actionBtnTitleDark]}>Delete for everyone</Text>
                    <Text style={styles.actionBtnCaption}>Unsend it from both sides of the conversation</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleDeleteAction('everyone')}>
                <View style={styles.actionBtnIconWrap}>
                  <Icon name="trash-outline" size={18} color="#fff" />
                </View>
                <View style={styles.actionBtnCopy}>
                  <Text style={styles.actionBtnTitle}>Delete for everyone</Text>
                  <Text style={styles.actionBtnCaption}>Unsend it from both sides of the conversation</Text>
                </View>
                <Icon name="chevron-forward" size={18} color="rgba(255,255,255,0.82)" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionCancelBtn} onPress={() => closeMessageActions()}>
                <Text style={styles.actionCancelText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <Animated.View
        style={{
          opacity: screenEntrance,
          transform: [
            {
              translateY: screenEntrance.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        }}
      >
        <AnimatedBorderCard
          style={styles.headerCardShell}
          contentStyle={styles.headerCard}
          borderRadius={18}
          borderWidth={1.2}
          borderBaseColor="rgba(130, 174, 232, 0.62)"
          contentBackgroundColor={Colors.primaryDark}
        >
          <View style={styles.headerTopRow}>
            <Text style={styles.headerEyebrow}>LAWYER SPACE</Text>
            <Text style={styles.headerTitle}>Messages</Text>
            <Text style={styles.headerSub}>Manage conversations, availability, and client updates in one thread.</Text>
            <View style={styles.overviewRow}>
              <View style={styles.overviewChip}>
                <Text style={styles.overviewValue}>{filteredConversations.length}</Text>
                <Text style={styles.overviewLabel}>Threads</Text>
              </View>
              <View style={styles.overviewChip}>
                <Text style={styles.overviewValue}>{conversations.filter((item) => Number(item.unread || 0) > 0).length}</Text>
                <Text style={styles.overviewLabel}>Unread</Text>
              </View>
              <View style={styles.overviewChip}>
                <Text style={styles.overviewValue}>{conversations.filter((item) => !!item.last_message).length}</Text>
                <Text style={styles.overviewLabel}>Active</Text>
              </View>
            </View>
          </View>
        </AnimatedBorderCard>
      </Animated.View>

      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[
          filteredConversations.length ? styles.list : styles.emptyWrap,
          { paddingBottom: insets.bottom + 72 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadConversations(); }} />}
        ListHeaderComponent={
          <View style={styles.conversationSearchRow}>
            <Icon name="search" size={17} color={Colors.textMuted} />
            <TextInput
              style={styles.conversationSearchInput}
              value={conversationQuery}
              onChangeText={setConversationQuery}
              placeholder="Search conversations..."
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
            />
            {conversationQuery.trim().length ? (
              <TouchableOpacity onPress={() => setConversationQuery('')}>
                <Icon name="close-circle" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="chatbubbles-outline" size={44} color={Colors.textLight} />
            <Text style={styles.emptyText}>{conversationQuery.trim().length ? 'No conversations found' : 'No conversations yet'}</Text>
            <Text style={styles.emptySub}>
              {conversationQuery.trim().length
                ? 'Try another keyword or clear your search.'
                : 'Start by booking a consultation or messaging a lawyer profile.'}
            </Text>
            {!conversationQuery.trim().length ? (
              <TouchableOpacity style={styles.emptyCtaBtn} onPress={() => router.push('/(lawyer)/consultations')}>
                <Text style={styles.emptyCtaText}>View Consultations</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const isUnread = !!item.unread && item.unread > 0;
          const sentByMe = Number(item.last_sender_id) === Number(user?.id);
          const presenceStatus = inferPresenceStatus(item);
          const presence = presenceCopy(presenceStatus);
          const avatarUri = getConversationAvatarUri(item);
          return (
          <TouchableOpacity style={[styles.convCard, isUnread && styles.convCardUnread]} onPress={() => openConversation(item)}>
            <View style={styles.convAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.convAvatarText}>{getConversationInitial(item)}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.convTop}>
                <Text style={[styles.convName, isUnread && styles.convNameUnread]} numberOfLines={1}>{item.other_user?.name || 'Unknown User'}</Text>
                <Text style={[styles.convTime, isUnread && styles.convTimeUnread]}>{item.last_at ? new Date(item.last_at).toLocaleDateString() : ''}</Text>
              </View>
              <View style={styles.convPresenceRow}>
                <View style={[styles.convPresenceDot, presenceStatus === 'active' && styles.convPresenceDotActive, presenceStatus === 'busy' && styles.convPresenceDotBusy, presenceStatus === 'offline' && styles.convPresenceDotOffline]} />
                <Text style={[styles.convPresenceText, presenceStatus === 'active' && styles.convPresenceTextActive, presenceStatus === 'busy' && styles.convPresenceTextBusy, presenceStatus === 'offline' && styles.convPresenceTextOffline]}>
                  {presence.label}
                </Text>
                <Text style={styles.convActivityStamp}>{formatRelativeTime(item.last_at)}</Text>
              </View>
              <Text style={[styles.convLastMsg, isUnread && styles.convLastMsgUnread]} numberOfLines={2}>{
                (item.last_message && item.last_message.trim())
                  ? item.last_message
                  : 'No messages yet'
              }</Text>
              {isUnread ? (
                <Text style={[styles.convSeenState, styles.convSeenUnread]}>Unread</Text>
              ) : sentByMe ? (
                <View style={styles.seenIconRow}>
                  <Icon name="checkmark-done" size={14} color={Colors.primary} />
                  <Text style={[styles.convSeenState, styles.convSeenRead]}>Seen</Text>
                </View>
              ) : null}
            </View>
            {isUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread}</Text>
              </View>
            )}
          </TouchableOpacity>
          );
        }}
      />

      <Modal visible={showContactModal} transparent animationType="fade" onRequestClose={() => setShowContactModal(false)}>
        <View style={styles.contactModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowContactModal(false)} />
          <View style={styles.contactModalCard}>
            <Text style={styles.contactModalTitle}>Find Contact</Text>
            <Text style={styles.contactModalSub}>Search by name, phone number, or email.</Text>

            <View style={styles.contactSearchRow}>
              <Icon name="search" size={17} color={Colors.textMuted} />
              <TextInput
                style={styles.contactSearchInput}
                value={contactQuery}
                onChangeText={setContactQuery}
                placeholder="Type phone or email..."
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
              />
            </View>

            {contactsLoading ? (
              <View style={styles.contactLoaderWrap}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.contactLoaderText}>Loading contacts...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item.id.toString()}
                keyboardShouldPersistTaps="handled"
                style={styles.contactList}
                ListEmptyComponent={<Text style={styles.contactEmpty}>No contacts matched your search.</Text>}
                renderItem={({ item }) => {
                  const hasConversation = existingConversationByUser.has(item.id);
                  const subtitle = item.phone || item.email || (item.role ? item.role.toUpperCase() : 'USER');

                  return (
                    <TouchableOpacity style={styles.contactRow} onPress={() => openOrStartConversationFromContact(item)} disabled={addingContactId === item.id}>
                      <View style={styles.contactAvatar}>
                        <Text style={styles.contactAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contactName}>{item.name}</Text>
                        <Text style={styles.contactMeta} numberOfLines={1}>{subtitle}</Text>
                      </View>
                      {addingContactId === item.id ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : hasConversation ? (
                        <View style={styles.contactTagExisting}><Text style={styles.contactTagExistingText}>Open</Text></View>
                      ) : (
                        <View style={styles.contactTagNew}><Text style={styles.contactTagNewText}>Add</Text></View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity style={styles.contactCloseBtn} onPress={() => setShowContactModal(false)}>
              <Text style={styles.contactCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getActionMessageKind(message: Message | null) {
  if (!message) return 'Message';
  if (message.attachment_type === 'image') return 'Photo';
  if (message.attachment_type === 'audio') return 'Voice note';
  if (message.attachment_type === 'file') return 'Attachment';
  return 'Text message';
}

function getActionMessageIcon(message: Message | null) {
  if (!message) return 'chatbox-ellipses-outline';
  if (message.attachment_type === 'image') return 'image-outline';
  if (message.attachment_type === 'audio') return 'mic-outline';
  if (message.attachment_type === 'file') return 'document-text-outline';
  return 'chatbox-ellipses-outline';
}

function getActionMessagePreview(message: Message | null) {
  if (!message) return 'Selected message';
  if (message.attachment_type === 'image') return 'Photo attachment';
  if (message.attachment_type === 'audio') return 'Voice message';
  if (message.attachment_type === 'file') return message.attachment_name || 'File attachment';
  return toDisplayMessage(message.body || '') || 'Message';
}

function getActionMessageTime(message: Message | null) {
  if (!message) return 'Just now';
  if (message.time) return message.time;
  if (!message.created_at) return 'Just now';
  return new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  headerCardShell: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
  },
  headerCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.primaryDark,
  },
  historyLoaderWrap: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyLoaderText: {
    marginTop: 6,
    fontSize: 11,
    color: Colors.textMuted,
  },
  threadLoaderWrap: {
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadLoaderTitle: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.text,
    fontWeight: '700',
  },
  threadLoaderSub: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.textMuted,
  },
  headerEyebrow: { color: '#D7E1F4', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  headerSub: { color: '#D7E1F4', fontSize: 13, marginTop: 4, lineHeight: 18 },
  headerTopRow: { gap: 2 },
  headerActionsRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  overviewChip: {
    minWidth: 76,
    flexGrow: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  overviewValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  overviewLabel: { color: '#D7E1F4', fontSize: 11, fontWeight: '700', marginTop: 2 },
  newContactBtn: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 92,
  },
  newContactBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  conversationSearchRow: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  conversationSearchInput: { flex: 1, color: Colors.text, fontSize: 14 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  convCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 13,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#081423',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  convCardUnread: {
    backgroundColor: '#EAF1FF',
    borderColor: '#BFD3FF',
    shadowOpacity: 0.08,
  },
  convAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  convAvatarText: { color: '#fff', fontSize: 19, fontWeight: '800' },
  avatarImage: { width: '100%', height: '100%' },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { color: Colors.text, fontWeight: '800', fontSize: 16 },
  convNameUnread: { color: Colors.primaryDark },
  convTime: { color: Colors.textMuted, fontSize: 11 },
  convTimeUnread: { color: Colors.primaryDark, fontWeight: '700' },
  convPresenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  convPresenceDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#94A3B8' },
  convPresenceDotActive: { backgroundColor: '#16A34A' },
  convPresenceDotBusy: { backgroundColor: '#F59E0B' },
  convPresenceDotOffline: { backgroundColor: '#94A3B8' },
  convPresenceText: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  convPresenceTextActive: { color: '#15803D' },
  convPresenceTextBusy: { color: '#B45309' },
  convPresenceTextOffline: { color: '#64748B' },
  convActivityStamp: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginLeft: 'auto' },
  convLastMsg: { color: Colors.textMuted, marginTop: 4, fontSize: 14, lineHeight: 18 },
  convLastMsgUnread: { color: Colors.text, fontWeight: '700' },
  convSeenState: { marginTop: 5, fontSize: 11, fontWeight: '700' },
  convSeenRead: { color: Colors.textLight },
  convSeenUnread: { color: Colors.primaryDark },
  seenIconRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  empty: { alignItems: 'center', paddingHorizontal: 28 },
  emptyText: { color: Colors.text, fontSize: 17, fontWeight: '800', marginTop: 12 },
  emptySub: { color: Colors.textMuted, textAlign: 'center', marginTop: 6 },
  emptyCtaBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chatHeader: {
    backgroundColor: Colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  chatHeaderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chatHeaderAvatarText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  chatHeaderName: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  threadActionsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
    backgroundColor: 'rgba(8, 15, 29, 0.56)',
  },
  threadActionsCard: {
    backgroundColor: '#F7F9FC',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    shadowColor: '#061224',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  threadActionsHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D2DAE8',
    marginBottom: 14,
  },
  threadActionsHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  threadActionsAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EEF8',
    borderWidth: 1,
    borderColor: '#D4E0F0',
    overflow: 'hidden',
  },
  threadActionsAvatarText: { color: Colors.primary, fontSize: 16, fontWeight: '900' },
  threadActionsTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' },
  threadActionsSub: { color: Colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  threadActionsMetaGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  threadActionsMetaItem: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5ECF7',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  threadActionsMetaValue: { color: Colors.text, fontSize: 14, fontWeight: '900' },
  threadActionsMetaLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  threadActionsList: { gap: 10 },
  threadActionsRow: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5ECF7',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  threadActionsRowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FB',
  },
  threadActionsDangerIconWrap: {
    backgroundColor: '#FEEDEF',
  },
  threadActionsRowTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  threadActionsRowSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  threadActionsCloseBtn: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: Colors.primaryDark,
  },
  threadActionsCloseText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  messagesList: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#F7F9FD',
  },
  chatStage: { flex: 1, position: 'relative' },
  threadSettling: { opacity: 0 },
  bubble: {
    maxWidth: '78%',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 6,
    shadowColor: '#0B1633',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primaryDark, borderBottomRightRadius: 7 },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#EDF1F7', borderBottomLeftRadius: 7 },
  failedBubble: { backgroundColor: '#7A2030' },
  bubbleText: { color: Colors.text, fontSize: 16, lineHeight: 21, flexShrink: 1, minWidth: 0 },
  bubbleMetaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 2 },
  bubbleTime: { color: Colors.textMuted, fontSize: 10, textAlign: 'right' },
  deliveryStatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    width: 92,
    justifyContent: 'center',
    flexShrink: 0,
  },
  deliveryStatePillFailed: { backgroundColor: 'rgba(255,255,255,0.16)' },
  deliveryStateText: { color: Colors.textMuted, fontSize: 9, fontWeight: '700' },
  deliveryStateTextMine: { color: '#ffffffdd' },
  deliveryStateTextFailed: { color: '#fff' },
  actionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
  },
  actionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 15, 31, 0.48)',
  },
  actionSheet: {
    backgroundColor: '#F7F9FC',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#061224',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  actionHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D2DAE8',
    marginBottom: 14,
  },
  actionHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 18,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  actionHeroShell: {
    marginBottom: 16,
  },
  actionHeroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EEF8',
    borderWidth: 1,
    borderColor: '#D4E0F0',
  },
  actionHeroCopy: { flex: 1 },
  actionEyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  actionTitle: { color: Colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 },
  actionSub: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  actionPreviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2EAF4',
    marginBottom: 16,
  },
  actionPreviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  actionPreviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EEF3FA',
  },
  actionPreviewBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  actionPreviewMeta: {
    flexShrink: 1,
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  actionPreviewText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  actionSectionLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  actionBtn: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  actionBtnDanger: {
    backgroundColor: '#A1253A',
  },
  actionBtnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E3F0',
  },
  actionBtnIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  actionBtnIconOutline: {
    backgroundColor: '#EEF4FB',
  },
  actionBtnCopy: { flex: 1 },
  actionBtnTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  actionBtnTitleDark: { color: Colors.text },
  actionBtnCaption: { color: 'rgba(15, 23, 42, 0.62)', fontSize: 12, marginTop: 2, lineHeight: 17 },
  actionCancelBtn: {
    marginTop: 6,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#E9EEF7',
  },
  actionCancelText: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fileName: {
    flex: 1,
    color: Colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  audioLabel: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  composerDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E7EDF7',
    marginBottom: 0,
    paddingBottom: 0,
    zIndex: 20,
    elevation: 20,
  },
  contactModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'rgba(9, 18, 38, 0.4)',
  },
  contactModalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3EAF6',
    padding: 14,
    maxHeight: '80%',
  },
  contactModalTitle: { color: Colors.text, fontSize: 18, fontWeight: '800' },
  contactModalSub: { color: Colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 10 },
  contactSearchRow: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactSearchInput: { flex: 1, color: Colors.text, fontSize: 14 },
  contactList: { marginTop: 10, maxHeight: 360 },
  contactLoaderWrap: { paddingVertical: 24, alignItems: 'center', gap: 6 },
  contactLoaderText: { fontSize: 12, color: Colors.textMuted },
  contactEmpty: { textAlign: 'center', color: Colors.textMuted, fontSize: 13, paddingVertical: 24 },
  contactRow: {
    borderWidth: 1,
    borderColor: '#E7EDF7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  contactAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}18`,
  },
  contactAvatarText: { color: Colors.primaryDark, fontSize: 15, fontWeight: '800' },
  contactName: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  contactMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  contactTagExisting: {
    backgroundColor: '#EEF5FF',
    borderWidth: 1,
    borderColor: '#CFE0FA',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  contactTagExistingText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },
  contactTagNew: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  contactTagNewText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  contactCloseBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D8E2F1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  contactCloseText: { color: Colors.text, fontWeight: '700' },
});




















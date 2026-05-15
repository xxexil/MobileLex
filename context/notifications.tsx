import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type NotificationActivityTone = 'info' | 'success' | 'warning' | 'error';
export type NotificationActivityRouteKind = 'messages' | 'consultations' | 'group-chat' | 'video-call' | 'payments' | 'team';

export type NotificationActivity = {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: number;
  readAt?: number;
  tone: NotificationActivityTone;
  icon: string;
  routeKind?: NotificationActivityRouteKind;
  conversationId?: number;
  consultationId?: number;
  groupId?: number;
  mode?: 'one-on-one' | 'group';
};

type NewNotificationActivity = Omit<NotificationActivity, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: number;
};

type NotificationsContextValue = {
  unreadClient: number;
  unreadLawyer: number;
  unreadLawFirm: number;
  activities: NotificationActivity[];
  bannerActivity: NotificationActivity | null;
  unreadActivityCount: number;
  refreshClientUnreadTick: number;
  refreshLawyerUnreadTick: number;
  refreshLawFirmUnreadTick: number;
  addActivity: (activity: NewNotificationActivity) => NotificationActivity;
  markActivityRead: (activityId: string) => void;
  markAllActivitiesRead: () => void;
  dismissBanner: () => void;
  clearActivities: () => void;
  triggerClientUnreadRefresh: () => void;
  triggerLawyerUnreadRefresh: () => void;
  triggerLawFirmUnreadRefresh: () => void;
  setUnreadClient: (value: number) => void;
  setUnreadLawyer: (value: number) => void;
  setUnreadLawFirm: (value: number) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadClient, setUnreadClient] = useState(0);
  const [unreadLawyer, setUnreadLawyer] = useState(0);
  const [unreadLawFirm, setUnreadLawFirm] = useState(0);
  const [activities, setActivities] = useState<NotificationActivity[]>([]);
  const [bannerActivity, setBannerActivity] = useState<NotificationActivity | null>(null);
  const [refreshClientUnreadTick, setRefreshClientUnreadTick] = useState(0);
  const [refreshLawyerUnreadTick, setRefreshLawyerUnreadTick] = useState(0);
  const [refreshLawFirmUnreadTick, setRefreshLawFirmUnreadTick] = useState(0);

  const addActivity = useCallback((activity: NewNotificationActivity) => {
    const nextActivity: NotificationActivity = {
      ...activity,
      id: activity.id ?? `${activity.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: activity.createdAt ?? Date.now(),
    };

    setActivities((current) => {
      const deduped = current.filter((item) => {
        const sameEvent = item.kind === nextActivity.kind
          && item.title === nextActivity.title
          && item.body === nextActivity.body
          && item.routeKind === nextActivity.routeKind
          && item.conversationId === nextActivity.conversationId
          && item.consultationId === nextActivity.consultationId
          && item.groupId === nextActivity.groupId;

        return !sameEvent;
      });

      return [nextActivity, ...deduped].slice(0, 40);
    });
    setBannerActivity(nextActivity);
    return nextActivity;
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerActivity(null);
  }, []);

  const markActivityRead = useCallback((activityId: string) => {
    setActivities((current) => current.map((item) => (
      item.id === activityId && !item.readAt
        ? { ...item, readAt: Date.now() }
        : item
    )));
    setBannerActivity((current) => (current?.id === activityId ? null : current));
  }, []);

  const markAllActivitiesRead = useCallback(() => {
    const now = Date.now();
    setActivities((current) => current.map((item) => (
      item.readAt ? item : { ...item, readAt: now }
    )));
    setBannerActivity(null);
  }, []);

  const clearActivities = useCallback(() => {
    setActivities([]);
  }, []);

  const unreadActivityCount = useMemo(
    () => activities.reduce((sum, item) => sum + (item.readAt ? 0 : 1), 0),
    [activities]
  );

  const value = useMemo<NotificationsContextValue>(() => ({
    unreadClient,
    unreadLawyer,
    unreadLawFirm,
    activities,
    bannerActivity,
    unreadActivityCount,
    refreshClientUnreadTick,
    refreshLawyerUnreadTick,
    refreshLawFirmUnreadTick,
    addActivity,
    markActivityRead,
    markAllActivitiesRead,
    dismissBanner,
    clearActivities,
    triggerClientUnreadRefresh: () => setRefreshClientUnreadTick((tick) => tick + 1),
    triggerLawyerUnreadRefresh: () => setRefreshLawyerUnreadTick((tick) => tick + 1),
    triggerLawFirmUnreadRefresh: () => setRefreshLawFirmUnreadTick((tick) => tick + 1),
    setUnreadClient,
    setUnreadLawyer,
    setUnreadLawFirm,
  }), [
    unreadClient,
    unreadLawyer,
    unreadLawFirm,
    activities,
    bannerActivity,
    unreadActivityCount,
    refreshClientUnreadTick,
    refreshLawyerUnreadTick,
    refreshLawFirmUnreadTick,
    addActivity,
    markActivityRead,
    markAllActivitiesRead,
    dismissBanner,
    clearActivities,
  ]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

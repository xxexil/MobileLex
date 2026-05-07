/**
 * UnreadContext — tracks total unread message count across conversations.
 * Shared between the tab layout (for badge display) and message screens
 * (to reset on read).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { clientApi, lawyerApi } from '@/services/api';
import { useAuth } from '@/context/auth';

interface UnreadContextValue {
  unreadCount: number | undefined;
  refresh: () => void;
  clear: () => void;
}

const UnreadContext = createContext<UnreadContextValue>({
  unreadCount: undefined,
  refresh: () => {},
  clear: () => {},
});

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(undefined);
      return;
    }
    try {
      const apiCall =
        user.role === 'client'
          ? clientApi.unreadCount()
          : lawyerApi.unreadCount();
      const { data } = await apiCall;
      const convs: { unread?: number }[] = Array.isArray(data) ? data : [];
      const total = convs.reduce((sum, c) => sum + (c.unread ?? 0), 0);
      setUnreadCount(total > 0 ? total : undefined);
    } catch {
      // silently ignore network errors
    }
  }, [user]);

  const clear = useCallback(() => {
    setUnreadCount(undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchUnread();
    intervalRef.current = setInterval(fetchUnread, 10_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchUnread();
    });
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [fetchUnread, user]);

  return (
    <UnreadContext.Provider value={{ unreadCount, refresh: fetchUnread, clear }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}

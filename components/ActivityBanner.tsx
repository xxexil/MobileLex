import { Pressable, StyleSheet, Text, View, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import type { NotificationActivity } from '@/context/notifications';

function getToneColors(tone: NotificationActivity['tone']) {
  switch (tone) {
    case 'success':
      return { background: '#EAF8EF', border: '#B7E4C7', icon: Colors.success };
    case 'warning':
      return { background: '#FFF5E8', border: '#F5D5A5', icon: Colors.warning };
    case 'error':
      return { background: '#FDECEC', border: '#F5B5B5', icon: Colors.error };
    default:
      return { background: '#EEF4FF', border: '#B8D2FF', icon: Colors.info };
  }
}

function formatBannerTime(createdAt: number) {
  const deltaMs = Date.now() - createdAt;
  const seconds = Math.max(1, Math.floor(deltaMs / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(createdAt).toLocaleString();
}

function getActionLabel(activity: NotificationActivity) {
  switch (activity.routeKind) {
    case 'messages':
      return 'Open Chat';
    case 'consultations':
      return 'Review';
    case 'group-chat':
      return 'Open Group';
    case 'video-call':
      return 'Join Call';
    case 'payments':
      return 'Pay Now';
    case 'team':
      return 'Open Team';
    default:
      return 'View';
  }
}

export default function ActivityBanner({
  activity,
  roleLabel,
  accentColor,
  onPress,
  onDismiss,
}: {
  activity: NotificationActivity;
  roleLabel?: string;
  accentColor?: string;
  onPress: () => void;
  onDismiss?: () => void;
}) {
  const tone = getToneColors(activity.tone);
  const roleAccent = accentColor ?? tone.icon;
  const actionLabel = getActionLabel(activity);

  return (
    <Modal transparent visible={true} animationType="fade" statusBarTranslucent>
      <View style={styles.overlay} pointerEvents="box-none">
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.banner, { backgroundColor: tone.background, borderColor: tone.border }]}>
            <View style={[styles.bannerAccent, { backgroundColor: roleAccent }]} />
            <Pressable style={styles.dismissBtn} onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss notification">
              <Ionicons name="close" size={14} color={Colors.textMuted} />
            </Pressable>
            <Pressable style={styles.pressableArea} onPress={onPress}>
              <View style={[styles.iconWrap, { backgroundColor: `${roleAccent}18` }]}>
                <Ionicons name={activity.icon as any} size={19} color={roleAccent} />
              </View>
              <View style={styles.content}>
                {!!roleLabel ? <Text style={[styles.roleLabel, { color: roleAccent }]} numberOfLines={1}>{roleLabel.toUpperCase()}</Text> : null}
                <View style={styles.headerRow}>
                  <Text style={styles.title} numberOfLines={1}>{activity.title}</Text>
                  <Text style={styles.time}>{formatBannerTime(activity.createdAt)}</Text>
                </View>
                <Text style={styles.body} numberOfLines={2}>{activity.body}</Text>
              </View>
              <View style={[styles.viewBtn, { backgroundColor: roleAccent }]}>
                <Text style={styles.viewText}>{actionLabel}</Text>
              </View>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  safeArea: {
    paddingHorizontal: 14,
  },
  banner: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 13,
    paddingHorizontal: 13,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  bannerAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    backgroundColor: Colors.primary,
  },
  pressableArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    paddingRight: 8,
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  time: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 8,
  },
  body: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  viewBtn: {
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginLeft: 8,
  },
  viewText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  dismissBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
});

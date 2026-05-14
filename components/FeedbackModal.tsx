import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/theme';

type FeedbackTone = 'success' | 'warning' | 'danger' | 'info';

type FeedbackModalProps = {
  visible: boolean;
  title: string;
  message: string;
  tone?: FeedbackTone;
  icon?: keyof typeof Ionicons.glyphMap;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  onClose?: () => void;
};

const toneMap: Record<FeedbackTone, { accent: string; soft: string; border: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { accent: '#0E8F5A', soft: '#EAFBF3', border: '#BCEBD3', icon: 'checkmark-circle' },
  warning: { accent: '#B7791F', soft: '#FFF7E6', border: '#F8D78D', icon: 'alert-circle' },
  danger: { accent: '#B42318', soft: '#FFF1F0', border: '#F7C8C3', icon: 'close-circle' },
  info: { accent: Colors.primary, soft: '#EEF5FF', border: '#CFE2FF', icon: 'information-circle' },
};

export default function FeedbackModal({
  visible,
  title,
  message,
  tone = 'success',
  icon,
  primaryLabel = 'Done',
  secondaryLabel,
  onPrimary,
  onSecondary,
  onClose,
}: FeedbackModalProps) {
  const theme = toneMap[tone];
  const close = onClose ?? onPrimary;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={styles.card}>
          <View style={[styles.ringOuter, { backgroundColor: theme.soft, borderColor: theme.border }]}>
            <View style={[styles.ringInner, { backgroundColor: theme.accent }]}>
              <Ionicons name={icon ?? theme.icon} size={34} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={[styles.statusPill, { backgroundColor: theme.soft, borderColor: theme.border }]}>
            <Ionicons name="shield-checkmark-outline" size={15} color={theme.accent} />
            <Text style={[styles.statusText, { color: theme.accent }]}>Secure confirmation</Text>
          </View>

          <View style={styles.actions}>
            {secondaryLabel && onSecondary ? (
              <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.86} onPress={onSecondary}>
                <Text style={styles.secondaryText}>{secondaryLabel}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accent }]} activeOpacity={0.9} onPress={onPrimary}>
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(6, 15, 30, 0.62)',
  },
  card: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7EDF6',
    shadowColor: '#061224',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  ringOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 18,
  },
  message: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 20,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FA',
  },
  secondaryText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  primaryBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});

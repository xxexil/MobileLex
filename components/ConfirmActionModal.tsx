import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/theme';

type ConfirmActionModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'danger' | 'primary';
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmActionModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon = 'alert-circle-outline',
  tone = 'danger',
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  const isDanger = tone === 'danger';
  const accent = isDanger ? '#B42318' : Colors.primary;
  const accentSoft = isDanger ? '#FFF7F6' : '#F2F7FF';
  const accentBorder = isDanger ? '#FAD4D0' : '#D8E8FF';
  const iconBg = isDanger ? '#FEE4E2' : '#DDEBFF';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.card}>
          <View style={[styles.iconHalo, { backgroundColor: accentSoft, borderColor: accentBorder }]}>
            <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
              <Ionicons name={icon} size={28} color={accent} />
            </View>
          </View>

          <View style={[styles.hero, { backgroundColor: accentSoft, borderColor: accentBorder }]}>
            <View style={styles.copyWrap}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: accent }]} onPress={onConfirm} activeOpacity={0.85}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
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
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(7, 15, 31, 0.62)',
  },
  card: {
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7EDF6',
    shadowColor: '#061224',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 20,
  },
  iconHalo: {
    alignSelf: 'center',
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  hero: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyWrap: { alignItems: 'center' },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FA',
  },
  cancelText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});

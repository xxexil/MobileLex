import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, RoleColors } from '@/constants/theme';

type BannerRole = 'client' | 'lawyer' | 'lawFirm';

type DashboardPopupBannerProps = {
  role: BannerRole;
  storageKey: string;
  visible?: boolean;
  title: string;
  message: string;
  primaryLabel: string;
  onPrimaryPress: () => void;
  secondaryLabel?: string;
};

const roleTone = {
  client: {
    shell: RoleColors.client.shell,
    accent: RoleColors.client.accent,
    icon: 'search-outline' as const,
  },
  lawyer: {
    shell: RoleColors.lawyer.shell,
    accent: RoleColors.lawyer.accent,
    icon: 'ribbon-outline' as const,
  },
  lawFirm: {
    shell: RoleColors.lawFirm.shell,
    accent: RoleColors.lawFirm.accent,
    icon: 'business-outline' as const,
  },
};

export default function DashboardPopupBanner({
  role,
  storageKey,
  visible = true,
  title,
  message,
  primaryLabel,
  onPrimaryPress,
  secondaryLabel = 'Later',
}: DashboardPopupBannerProps) {
  const [dismissed, setDismissed] = useState(true);
  const tone = roleTone[role];

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (active) setDismissed(value === 'dismissed');
      })
      .catch(() => {
        if (active) setDismissed(false);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);

  async function dismiss() {
    setDismissed(true);
    await AsyncStorage.setItem(storageKey, 'dismissed');
  }

  async function handlePrimaryPress() {
    await dismiss();
    onPrimaryPress();
  }

  if (!visible || dismissed) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={styles.sheet}>
          <View style={[styles.iconWrap, { backgroundColor: `${tone.accent}24` }]}>
            <Ionicons name={tone.icon} size={24} color={tone.shell} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.86} onPress={dismiss}>
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: tone.shell }]} activeOpacity={0.9} onPress={handlePrimaryPress}>
              <Text style={styles.primaryText}>{primaryLabel}</Text>
              <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
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
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 22,
    backgroundColor: 'rgba(8, 14, 28, 0.48)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    shadowColor: '#061224',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  message: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#F3F6FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1.25,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});

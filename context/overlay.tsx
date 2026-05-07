import React, { createContext, useContext, useState, ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';

interface OverlayContextProps {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  showError: (message: string) => void;
  hideError: () => void;
}

const OverlayContext = createContext<OverlayContextProps | undefined>(undefined);

export function useOverlay() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlay must be used within OverlayProvider');
  return ctx;
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState<{ visible: boolean; message?: string }>({ visible: false });
  const [error, setError] = useState<{ visible: boolean; message?: string }>({ visible: false });

  const showLoading = (message?: string) => setLoading({ visible: true, message });
  const hideLoading = () => setLoading({ visible: false });
  const showError = (message: string) => setError({ visible: true, message });
  const hideError = () => setError({ visible: false });

  return (
    <OverlayContext.Provider value={{ showLoading, hideLoading, showError, hideError }}>
      {children}
      <Modal visible={loading.visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          {loading.message ? <Text style={styles.message}>{loading.message}</Text> : null}
        </View>
      </Modal>
      <Modal visible={error.visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity style={styles.dismissBtn} onPress={hideError} accessibilityLabel="Dismiss error">
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </OverlayContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  message: { color: Colors.primary, fontSize: 16, marginTop: 16, fontWeight: '600' },
  errorText: { color: Colors.error, fontSize: 18, fontWeight: '700', marginBottom: 24, textAlign: 'center', paddingHorizontal: 24 },
  dismissBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  dismissText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

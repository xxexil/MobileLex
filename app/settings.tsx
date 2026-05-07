import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import SecurityCenterCard from '@/components/SecurityCenterCard';

export default function SettingsScreen() {
  const systemScheme = useColorScheme();
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  // This would be persisted in a real app
  const effectiveTheme = theme === 'system' ? systemScheme : theme;

  // Ensure effectiveTheme is always a valid key for Colors
  const themeKey: 'light' | 'dark' = effectiveTheme === 'dark' ? 'dark' : 'light';
  return (
    <View style={[styles.container, { backgroundColor: (Colors[themeKey] && Colors[themeKey].background) ? Colors[themeKey].background : '#fff' }]}>
      <Text style={styles.header} accessibilityRole="header" accessibilityLabel="Settings">Settings</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Dark Mode</Text>
        <Switch
          value={theme === 'dark' || (theme === 'system' && systemScheme === 'dark')}
          onValueChange={v => setTheme(v ? 'dark' : 'light')}
          accessibilityRole="switch"
          accessibilityLabel="Dark mode toggle"
          accessibilityHint="Enable or disable dark mode."
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Use System Theme</Text>
        <Switch
          value={theme === 'system'}
          onValueChange={v => setTheme(v ? 'system' : (systemScheme === 'dark' ? 'dark' : 'light'))}
          accessibilityRole="switch"
          accessibilityLabel="System theme toggle"
          accessibilityHint="Enable or disable using the system theme."
        />
      </View>
      <SecurityCenterCard />
      <TouchableOpacity
        style={styles.saveBtn}
        accessibilityRole="button"
        accessibilityLabel="Save settings changes"
        accessibilityHint="Save your updated settings."
      >
        <Text style={styles.saveBtnText}>Save Changes</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 24, color: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  label: { fontSize: 16, color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 32 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

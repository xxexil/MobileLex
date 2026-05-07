import React, { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  StyleProp,
} from 'react-native';
import { Colors } from '@/constants/theme';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost';

interface AppButtonProps {
  label: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** Width of the button — defaults to '100%' */
  fullWidth?: boolean;
}

export default function AppButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = true,
}: AppButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  };

  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';

  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    isPrimary && styles.primary,
    isSecondary && styles.secondary,
    isGhost && styles.ghost,
    fullWidth ? styles.fullWidth : styles.autoWidth,
    (disabled || loading) && styles.disabledOverlay,
  ].filter(Boolean) as ViewStyle[];

  const labelStyle: StyleProp<TextStyle> = [
    styles.label,
    isPrimary && styles.labelPrimary,
    isSecondary && styles.labelSecondary,
    isGhost && styles.labelGhost,
  ].filter(Boolean) as TextStyle[];

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        hitSlop={8}
        accessibilityRole="button"
        style={[containerStyle, style]}
      >
        {loading ? (
          <ActivityIndicator
            color={isPrimary ? '#fff' : Colors.primary}
            size="small"
          />
        ) : (
          <Text style={[labelStyle, textStyle]}>{label}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  fullWidth: { alignSelf: 'stretch' },
  autoWidth: { paddingHorizontal: 28, alignSelf: 'flex-start' },
  // Primary — filled
  primary: {
    backgroundColor: Colors.primary,
  },
  // Secondary — outlined
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  // Ghost — no border, no fill
  ghost: {
    backgroundColor: 'transparent',
  },
  disabledOverlay: {
    opacity: 0.6,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  labelPrimary: { color: '#fff' },
  labelSecondary: { color: Colors.text },
  labelGhost: { color: Colors.text },
});

import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  // Optionally add accessibilityRole if passed in otherProps
  return (
    <View
      style={[{ backgroundColor }, style]}
      accessibilityRole={otherProps.accessibilityRole}
      accessibilityLabel={otherProps.accessibilityLabel}
      {...otherProps}
    />
  );
}

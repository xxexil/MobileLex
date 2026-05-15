import { useEffect, memo } from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface AnimatedTabIconProps {
  focused: boolean;
  color: string;
  size: number;
  name: ComponentProps<typeof Ionicons>['name'];
}

function AnimatedTabIcon({ focused, color, size, name }: AnimatedTabIconProps) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [focused, progress]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, 1.12]) },
      { translateY: interpolate(progress.value, [0, 1], [0, -1]) },
    ],
  }));

  return (
    <Animated.View style={styles.wrap}>
      <Animated.View style={iconStyle}>
        <Ionicons name={name} size={size} color={color} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(AnimatedTabIcon);

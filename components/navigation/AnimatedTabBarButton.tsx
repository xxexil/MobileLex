import { memo, useEffect } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimatedTabBarButton({
  accessibilityState,
  children,
  onLongPress,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: BottomTabBarButtonProps) {
  const isSelected = accessibilityState?.selected === true;
  const selectedProgress = useSharedValue(isSelected ? 1 : 0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    selectedProgress.value = withTiming(isSelected ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [isSelected, selectedProgress]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = 1 + selectedProgress.value * 0.02 - pressProgress.value * 0.04;
    const translateY = -selectedProgress.value * 1;
    return {
      transform: [{ scale }, { translateY }],
    };
  });

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      testID={testID}
      hitSlop={8}
      style={[style as StyleProp<ViewStyle>, animatedStyle]}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        pressProgress.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        pressProgress.value = withTiming(0, { duration: 130, easing: Easing.out(Easing.quad) });
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

export default memo(AnimatedTabBarButton);

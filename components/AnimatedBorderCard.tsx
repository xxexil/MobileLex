import { ReactNode, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type AnimatedBorderCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  borderRadius?: number;
  borderWidth?: number;
  duration?: number;
  sweepWidth?: number;
  borderBaseColor?: string;
  contentBackgroundColor?: string;
  colors?: [string, string, string];
  glowColor?: string;
  orbColor?: string;
  showOrbs?: boolean;
  enableBreathing?: boolean;
};

export default function AnimatedBorderCard({
  children,
  style,
  contentStyle,
  borderRadius = 18,
  borderWidth = 1.2,
  duration = 2600,
  sweepWidth = 140,
  borderBaseColor = 'rgba(188, 208, 236, 0.7)',
  contentBackgroundColor = '#FFFFFF',
  colors = ['rgba(255,255,255,0)', 'rgba(180, 223, 255, 0.95)', 'rgba(255,255,255,0)'],
  glowColor = 'rgba(124, 183, 247, 0.32)',
  orbColor = 'rgba(112, 172, 238, 0.2)',
  showOrbs = true,
  enableBreathing = true,
}: AnimatedBorderCardProps) {
  const progress = useSharedValue(0);
  const breathe = useSharedValue(0);
  const drift = useSharedValue(0);
  const [layoutWidth, setLayoutWidth] = useState(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    if (enableBreathing) {
      breathe.value = withRepeat(
        withTiming(1, {
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true
      );
    }

    if (showOrbs) {
      drift.value = withRepeat(
        withTiming(1, {
          duration: 3800,
          easing: Easing.inOut(Easing.cubic),
        }),
        -1,
        true
      );
    }

    return () => {
      cancelAnimation(progress);
      cancelAnimation(breathe);
      cancelAnimation(drift);
    };
  }, [duration, progress, breathe, drift, enableBreathing, showOrbs]);

  const travelDistance = useMemo(() => {
    const width = layoutWidth || 280;
    return width + sweepWidth * 2;
  }, [layoutWidth, sweepWidth]);

  const sweepStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [-sweepWidth, travelDistance - sweepWidth]);
    return {
      transform: [{ translateX }, { rotate: '16deg' }],
    };
  }, [sweepWidth, travelDistance]);

  const glowStyle = useAnimatedStyle(() => {
    const opacity = enableBreathing ? interpolate(breathe.value, [0, 1], [0.08, 0.24]) : 0.12;
    return { opacity };
  }, [enableBreathing]);

  const orbOneStyle = useAnimatedStyle(() => {
    const baseOpacity = showOrbs ? 1 : 0;
    return {
      opacity: baseOpacity * interpolate(drift.value, [0, 1], [0.3, 0.7]),
      transform: [{ translateX: interpolate(drift.value, [0, 1], [0, 10]) }, { translateY: interpolate(drift.value, [0, 1], [0, -8]) }],
    };
  }, [showOrbs]);

  const orbTwoStyle = useAnimatedStyle(() => {
    const baseOpacity = showOrbs ? 1 : 0;
    return {
      opacity: baseOpacity * interpolate(drift.value, [0, 1], [0.55, 0.28]),
      transform: [{ translateX: interpolate(drift.value, [0, 1], [0, -9]) }, { translateY: interpolate(drift.value, [0, 1], [0, 7]) }],
    };
  }, [showOrbs]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setLayoutWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.outer,
        {
          borderRadius,
          padding: borderWidth,
          backgroundColor: borderBaseColor,
        },
        style,
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.sweep, { width: sweepWidth }, sweepStyle]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.glow, { backgroundColor: glowColor }, glowStyle]} />
      <View
        style={[
          styles.inner,
          {
            borderRadius: Math.max(0, borderRadius - borderWidth),
            backgroundColor: contentBackgroundColor,
          },
          contentStyle,
        ]}
      >
        {showOrbs ? <Animated.View pointerEvents="none" style={[styles.orbOne, { backgroundColor: orbColor }, orbOneStyle]} /> : null}
        {showOrbs ? <Animated.View pointerEvents="none" style={[styles.orbTwo, { backgroundColor: orbColor }, orbTwoStyle]} /> : null}
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    overflow: 'hidden',
    position: 'relative',
  },
  sweep: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    left: 0,
    zIndex: 1,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  inner: {
    zIndex: 2,
  },
  orbOne: {
    position: 'absolute',
    top: -28,
    right: -20,
    width: 96,
    height: 96,
    borderRadius: 48,
    zIndex: 1,
  },
  orbTwo: {
    position: 'absolute',
    left: -18,
    bottom: -24,
    width: 72,
    height: 72,
    borderRadius: 36,
    zIndex: 1,
  },
  content: {
    zIndex: 2,
  },
});

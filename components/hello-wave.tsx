import Animated from 'react-native-reanimated';

export function HelloWave() {
  return (
    <Animated.Text
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel="Waving hand emoji"
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      👋
    </Animated.Text>
  );
}

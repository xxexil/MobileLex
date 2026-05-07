import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type BrandLogoProps = {
  size?: number;
  title?: string;
  subtitle?: string;
  titleColor?: string;
  subtitleColor?: string;
  align?: 'left' | 'center';
};

export default function BrandLogo({
  size = 72,
  title = 'LexConnect',
  subtitle,
  titleColor = '#FFFFFF',
  subtitleColor = 'rgba(255,255,255,0.72)',
  align = 'center',
}: BrandLogoProps) {
  const isCentered = align === 'center';

  return (
    <View style={[styles.container, isCentered ? styles.center : styles.left]}>
      <Image
        source={require('@/assets/images/shield-logo.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
      {title ? (
        <Text style={[styles.title, { color: titleColor }, isCentered ? styles.titleCenter : styles.titleLeft]}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={[styles.subtitle, { color: subtitleColor }, isCentered ? styles.subtitleCenter : styles.subtitleLeft]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  center: {
    alignItems: 'center',
  },
  left: {
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  titleCenter: {
    textAlign: 'center',
  },
  titleLeft: {
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  subtitleCenter: {
    textAlign: 'center',
  },
  subtitleLeft: {
    textAlign: 'left',
  },
});
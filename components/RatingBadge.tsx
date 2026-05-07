import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

type RatingBadgeProps = {
  rating?: number | null;
  reviewCount?: number | null;
};

const Icon = Ionicons as any;

export default function RatingBadge({ rating, reviewCount }: RatingBadgeProps) {
  const ratingValue = Number(rating || 0);
  const hasRating = Number.isFinite(ratingValue) && ratingValue > 0;
  const reviews = Number(reviewCount || 0);

  return (
    <View style={styles.row}>
      <Icon
        name={hasRating ? 'star' : 'star-outline'}
        size={13}
        color={hasRating ? '#F4B400' : Colors.textLight}
      />
      <Text style={[styles.text, !hasRating && styles.textMuted]}>
        {hasRating ? ratingValue.toFixed(1) : 'No ratings yet'}
        {hasRating && reviews > 0 ? ` (${reviews})` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  text: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  textMuted: {
    color: Colors.textMuted,
    fontWeight: '600',
  },
});
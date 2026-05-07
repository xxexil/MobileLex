import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

type Props = {
  uri: string;
  canOpen?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

const Icon = Ionicons as any;

export default function ChatAttachmentImage({ uri, canOpen = false, onPress, onLongPress }: Props) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
  }, [uri]);

  return (
    <TouchableOpacity activeOpacity={canOpen ? 0.92 : 1} onPress={canOpen ? onPress : undefined} onLongPress={onLongPress}>
      <View style={styles.frame}>
        {failed ? (
          <View style={styles.fallbackCard}>
            <View style={styles.fallbackIconWrap}>
              <Icon name="image-outline" size={26} color={Colors.primary} />
            </View>
            <Text style={styles.fallbackTitle}>Preview unavailable</Text>
            <Text style={styles.fallbackCaption}>
              {canOpen ? 'Tap to open the image directly.' : 'This image could not be rendered in the chat bubble.'}
            </Text>
          </View>
        ) : (
          <>
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="cover"
              onLoadStart={() => {
                setLoading(true);
                setFailed(false);
              }}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
            {loading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading image...</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 220,
    height: 160,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#DDE5F0',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#DDE5F0',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 247, 250, 0.88)',
  },
  loadingText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  fallbackCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#EEF3FA',
  },
  fallbackIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E3F0',
    marginBottom: 10,
  },
  fallbackTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  fallbackCaption: {
    marginTop: 6,
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
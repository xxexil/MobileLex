import { StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';

type AlbumImage = {
  id: string | number;
  uri: string;
  canOpen: boolean;
};

type Props = {
  images: AlbumImage[];
  onPressImage?: (index: number) => void;
  onLongPress?: () => void;
};

export default function ChatImageAlbum({ images, onPressImage, onLongPress }: Props) {
  const visible = images.slice(0, 4);
  const extraCount = Math.max(0, images.length - 4);

  return (
    <View style={styles.gridWrap}>
      {visible.map((image, index) => {
        const isLastVisible = index === 3;
        const showOverlay = isLastVisible && extraCount > 0;

        return (
          <TouchableOpacity
            key={`${image.id}-${index}`}
            activeOpacity={image.canOpen ? 0.9 : 1}
            disabled={!image.canOpen}
            onPress={() => onPressImage?.(index)}
            onLongPress={onLongPress}
            style={styles.tileBtn}
          >
            <Image source={{ uri: image.uri }} style={styles.tileImage} resizeMode="cover" />
            {showOverlay ? (
              <View style={styles.overlay}>
                <Text style={styles.overlayText}>+{extraCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gridWrap: {
    width: 220,
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#DDE5F0',
    marginBottom: 8,
  },
  tileBtn: {
    width: '50%',
    height: '50%',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  tileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#DDE5F0',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  overlayText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
});

import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

const EMOJIS = ['\u{1F44D}', '\u{1F60A}', '\u{1F602}', '\u{2764}\u{FE0F}', '\u{1F64F}', '\u{1F525}', '\u{1F389}', '\u{1F973}'];

type MessengerComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSendText: () => void;
  onSendThumb: () => void;
  onToggleEmojiPanel: () => void;
  onStartVoiceRecording: () => void;
  onPickImage: () => void;
  onPickFile: () => void;
  onStopAndSendVoice: () => void;
  onSelectEmoji: (emoji: string) => void;
  onJumpToLatest: () => void;
  onFocusTextInput?: () => void;
  showEmoji: boolean;
  isRecording: boolean;
  recordingSeconds: number;
  sending: boolean;
  pendingBottomCount: number;
};

export default function MessengerComposer({
  value,
  onChangeText,
  onSendText,
  onSendThumb,
  onToggleEmojiPanel,
  onStartVoiceRecording,
  onPickImage,
  onPickFile,
  onStopAndSendVoice,
  onSelectEmoji,
  onJumpToLatest,
  onFocusTextInput,
  showEmoji,
  isRecording,
  recordingSeconds,
  sending,
  pendingBottomCount,
}: MessengerComposerProps) {
  return (
    <SafeAreaView style={styles.wrapper} edges={['bottom', 'left', 'right']}>
      {pendingBottomCount > 0 && (
        <TouchableOpacity style={styles.jumpToLatestBtn} onPress={onJumpToLatest}>
          <Ionicons name="arrow-down-circle" size={16} color="#fff" />
          <Text style={styles.jumpToLatestText}>
            {pendingBottomCount > 1 ? `${pendingBottomCount} new messages` : '1 new message'}
          </Text>
        </TouchableOpacity>
      )}

      {showEmoji && (
        <View style={styles.emojiPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
            {EMOJIS.map((emoji) => (
              <TouchableOpacity key={emoji} onPress={() => onSelectEmoji(emoji)} style={styles.emojiBtn}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {isRecording ? (
        <View style={styles.recordingRow}>
          <View style={styles.recDot} />
          <Text style={styles.recTimer}>Recording {recordingSeconds}s - tap stop to send</Text>
          <TouchableOpacity style={[styles.sendBtn, styles.stopBtn]} onPress={onStopAndSendVoice}>
            <Ionicons name="stop" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.composerShell}>
          <View style={styles.composerRow}>
            <View style={styles.leftActionRow}>
              <TouchableOpacity onPress={onStartVoiceRecording} style={styles.actionIcon}>
                <Ionicons name="mic" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onPickImage} style={styles.actionIcon}>
                <Ionicons name="image-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onPickFile} style={styles.actionIcon}>
                <Ionicons name="document-attach" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.innerInputPill}>
              <TextInput
                style={styles.msgInput}
                value={value}
                onChangeText={onChangeText}
                onFocus={onFocusTextInput}
                placeholder="Message"
                placeholderTextColor={Colors.textLight}
                multiline
                scrollEnabled
                maxLength={500}
              />
              <TouchableOpacity onPress={onToggleEmojiPanel} style={styles.composerEmojiButton}>
                <Ionicons name="happy-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            {value.trim() ? (
              <TouchableOpacity style={styles.sendBtn} onPress={onSendText} disabled={sending}>
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.sendBtn} onPress={onSendThumb} disabled={sending}>
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="thumbs-up" size={18} color="#fff" />}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
  },
  jumpToLatestBtn: {
    alignSelf: 'center',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.primaryDark,
  },
  jumpToLatestText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  emojiPanel: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  emojiBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#F3F5FA',
    borderRadius: 16,
  },
  emojiText: {
    fontSize: 18,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  recDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: Colors.error,
  },
  recTimer: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  stopBtn: {
    backgroundColor: Colors.error,
  },
  composerShell: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: '#fff',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leftActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  innerInputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F2F5',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 48,
  },
  msgInput: {
    flex: 1,
    minWidth: 128,
    borderWidth: 0,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    maxHeight: 100,
    color: Colors.text,
    fontSize: 15,
  },
  composerEmojiButton: {
    marginLeft: 2,
    padding: 6,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDark,
  },
});

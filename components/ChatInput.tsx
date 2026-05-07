import React, { useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import type { FC } from 'react';

interface ChatInputProps {
  onSend: (msg: string) => void;
  onFileSelect: (file: any) => void;
}

const ChatInput: FC<ChatInputProps> = ({ onSend, onFileSelect }) => {
  const [message, setMessage] = React.useState('');
  const inputRef = useRef(null);

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const handleFilePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      onFileSelect(result.assets[0]);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleFilePick} style={styles.iconButton}>
        <Ionicons name="attach" size={24} color="#888" />
      </TouchableOpacity>
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder="Aa"
        value={message}
        onChangeText={setMessage}
        onSubmitEditing={handleSend}
        returnKeyType="send"
      />
      <TouchableOpacity onPress={handleSend} style={styles.iconButton}>
        <Ionicons name="send" size={24} color="#888" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#5f5a7d',
    borderRadius: 24,
    margin: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#191825',
    color: '#fff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  iconButton: {
    padding: 6,
  },
});

export default ChatInput;

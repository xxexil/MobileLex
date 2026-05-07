// Basic Agora call screen scaffold for 1:1 and group calls
import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
// import RtcEngine, { RtcLocalView, RtcRemoteView, VideoRenderMode } from 'react-native-agora';

// TODO: Replace with your Agora App ID
const AGORA_APP_ID = 'YOUR_AGORA_APP_ID';

export default function CallScreen({ route, navigation }) {
  // route.params.channelName, route.params.isGroup, route.params.userId
  // TODO: Integrate Agora SDK and call logic
  const [joined, setJoined] = useState(false);
  const [callType, setCallType] = useState<'video' | 'audio'>('video');

  useEffect(() => {
    // TODO: Initialize Agora engine, join channel, handle events
    // Example: engine.joinChannel(null, channelName, null, 0);
    setJoined(true);
    return () => {
      // TODO: Leave channel, cleanup
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{route.params?.isGroup ? 'Group' : '1:1'} {callType === 'video' ? 'Video' : 'Audio'} Call</Text>
      {/* TODO: Render local/remote video views here */}
      <Button title={callType === 'video' ? 'Switch to Audio' : 'Switch to Video'} onPress={() => setCallType(callType === 'video' ? 'audio' : 'video')} />
      <Button title="End Call" color="red" onPress={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  title: { color: '#fff', fontSize: 20, marginBottom: 24 },
});

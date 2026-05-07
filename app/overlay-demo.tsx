import React from 'react';
import { View, Button } from 'react-native';
import { useOverlay } from '@/context/overlay';

export default function OverlayDemo() {
  const { showLoading, hideLoading, showError } = useOverlay();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Button title="Show Loading" onPress={() => {
        showLoading('Loading, please wait...');
        setTimeout(hideLoading, 2000);
      }} />
      <Button title="Show Error" color="#B00020" onPress={() => showError('Something went wrong!')} />
    </View>
  );
}

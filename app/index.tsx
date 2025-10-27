// app/index.tsx
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useDatabase } from '../hooks/use-db';

export default function Index() {
  const { isInitialized } = useDatabase();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isInitialized) {
      // Add small delay for smooth transition
      setTimeout(() => setIsReady(true), 500);
    }
  }, [isInitialized]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return <Redirect href="/(tabs)" />;
}
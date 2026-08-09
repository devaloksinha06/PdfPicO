import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkAppVersion } from './src/utils/versionCheck';


export default function App() {
  useEffect(() => {
    checkAppVersion();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <HomeScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
});
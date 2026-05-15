import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SupportScreen = () => (
  <View style={styles.container}>
    <Text style={styles.text}>고객센터 — 준비 중</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  text: { color: '#94A3B8', fontSize: 16 },
});

export default SupportScreen;

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ROUTES } from '../../constants/routes';

const SignupScreen = ({ navigation }) => (
  <View style={styles.container}>
    <Text style={styles.title}>회원가입</Text>
    <Text style={styles.placeholder}>TODO: 회원가입 폼 구현 예정</Text>
    <TouchableOpacity onPress={() => navigation.navigate(ROUTES.LOGIN)}>
      <Text style={styles.link}>로그인으로 돌아가기</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1E293B', marginBottom: 16 },
  placeholder: { color: '#94A3B8', marginBottom: 24 },
  link: { color: '#2563EB', fontSize: 14 },
});

export default SignupScreen;

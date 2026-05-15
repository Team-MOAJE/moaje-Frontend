import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../../features/auth/authApi';
import { ROUTES } from '../../constants/routes';

const HomeScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const handleLogout = () => {
    dispatch(logoutUser());
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>안녕하세요,</Text>
        <Text style={styles.userName}>{user?.name ?? '사용자'}님 👋</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>총 자산</Text>
        <Text style={styles.cardValue}>₩0</Text>
      </View>

      <View style={styles.menuGrid}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate(ROUTES.ACCOUNT_LIST)}
        >
          <Text style={styles.menuIcon}>🏦</Text>
          <Text style={styles.menuLabel}>내 계좌</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate(ROUTES.TRANSFER)}
        >
          <Text style={styles.menuIcon}>💸</Text>
          <Text style={styles.menuLabel}>이체</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate(ROUTES.RECOMMENDATION)}
        >
          <Text style={styles.menuIcon}>💼</Text>
          <Text style={styles.menuLabel}>소득 추천</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate(ROUTES.DAILY_LIMIT)}
        >
          <Text style={styles.menuIcon}>📊</Text>
          <Text style={styles.menuLabel}>지출 한도</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>최근 거래 내역 - 준비 중</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 24 },
  greeting: { fontSize: 16, color: '#64748B' },
  userName: { fontSize: 24, fontWeight: 'bold', color: '#1E293B' },
  card: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  cardLabel: { color: '#BFDBFE', fontSize: 14, marginBottom: 8 },
  cardValue: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  menuItem: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuIcon: { fontSize: 28, marginBottom: 8 },
  menuLabel: { fontSize: 14, fontWeight: '500', color: '#374151' },
  placeholder: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  placeholderText: { color: '#94A3B8', fontSize: 14 },
  logoutButton: { alignItems: 'center', paddingVertical: 12 },
  logoutText: { color: '#EF4444', fontSize: 14 },
});

export default HomeScreen;

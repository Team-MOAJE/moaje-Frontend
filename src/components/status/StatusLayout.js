import React from 'react';
import { View, Text, StyleSheet, Pressable, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../constants/statusTheme';

const StatusLayout = ({ title, showBack = false, onBack, children }) => {
  const hasHeader = showBack || !!title;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />

      {hasHeader && (
        <View style={styles.header}>
          {showBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.forest} />
            </Pressable>
          ) : (
            <View style={styles.placeholder} />
          )}

          {title ? <Text style={styles.headerTitle}>{title}</Text> : <View />}

          <View style={styles.placeholder} />
        </View>
      )}

      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#3C5028',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  backBtnPressed: {
    backgroundColor: colors.hairline,
  },
  placeholder: {
    width: 36,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
});

export default StatusLayout;

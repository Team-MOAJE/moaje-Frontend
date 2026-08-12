import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import MoneyRecapEntry from '../../components/moneyRecap/MoneyRecapEntry';
import MoneyRecapStories from '../../components/moneyRecap/MoneyRecapStories';
import { ROUTES } from '../../constants/routes';

export default function MoneyRecapScreen({ navigation }) {
  const [phase, setPhase] = useState('entry');

  const exitToPreviousScreen = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  }, [navigation]);

  useEffect(() => {
    const onHardwareBack = () => {
      if (phase === 'stories') {
        setPhase('entry');
      } else {
        exitToPreviousScreen();
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [phase, exitToPreviousScreen]);

  return (
    <View style={styles.root}>
      {phase === 'entry' ? (
        <MoneyRecapEntry onStart={() => setPhase('stories')} />
      ) : (
        <MoneyRecapStories onClose={() => setPhase('entry')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

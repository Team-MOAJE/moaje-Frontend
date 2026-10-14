import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';

// 내 정보 수정(API-48)·PIN 변경(API-51)·회원 탈퇴(API-49) 입력 모달.
// 표시·입력만 담당한다. 요청·검증 결과 처리·오류 메시지는 ProfileScreen이 props로 전달한다.
// 호출하는 쪽이 열릴 때만 렌더링하므로(상태 초기화) 닫으면 입력값이 남지 않는다.

const onlyDigits = value => value.replace(/[^0-9]/g, '');

function ModalFrame({ title, description, errorMessage, children, actions, onRequestClose }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.desc}>{description}</Text> : null}
          {children}
          {errorMessage ? (
            <Text style={styles.error} accessibilityRole="alert">
              {errorMessage}
            </Text>
          ) : null}
          <View style={styles.btnRow}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({ label, onPress, disabled, loading, variant = 'primary' }) {
  const isCancel = variant === 'cancel';
  const isDanger = variant === 'danger';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.btn,
        isCancel ? styles.btnCancel : isDanger ? styles.btnDanger : styles.btnPrimary,
        disabled && !loading && styles.btnDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={[styles.btnText, isCancel && styles.btnCancelText]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function PinField({ label, value, onChangeText, editable }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={text => onChangeText(onlyDigits(text))}
        style={styles.input}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        editable={editable}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel={label}
      />
    </View>
  );
}

// user: { name, email }. onSubmit({ name?, email? }) — 바뀐 항목만 전달한다(email 삭제 = null).
export function ProfileEditModal({ user, loading, errorMessage, onSubmit, onClose }) {
  const initialName = user?.name ?? '';
  const initialEmail = user?.email ?? '';
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = () => {
    const input = {};
    if (name.trim() !== initialName) input.name = name;
    if (email.trim() !== initialEmail) input.email = email.trim() === '' ? null : email;

    if (Object.keys(input).length === 0) {
      setLocalError('변경된 내용이 없어요.');
      return;
    }
    setLocalError(null);
    onSubmit(input);
  };

  return (
    <ModalFrame
      title="내 정보 수정"
      errorMessage={localError ?? errorMessage}
      onRequestClose={loading ? undefined : onClose}
      actions={
        <>
          <ActionButton label="취소" variant="cancel" onPress={onClose} disabled={loading} />
          <ActionButton label="저장" onPress={handleSubmit} disabled={loading} loading={loading} />
        </>
      }
    >
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>이름</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          editable={!loading}
          autoCorrect={false}
          accessibilityLabel="이름"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>이메일 (선택)</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          accessibilityLabel="이메일"
        />
      </View>
    </ModalFrame>
  );
}

// onSubmit({ currentPin, newPin, newPinConfirm }). 일치·길이 검증은 thunk가 다시 수행한다.
export function PinChangeModal({ loading, errorMessage, onSubmit, onClose }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [localError, setLocalError] = useState(null);

  const handleSubmit = () => {
    if (currentPin.length !== 6 || newPin.length !== 6 || newPinConfirm.length !== 6) {
      setLocalError('PIN은 숫자 6자리로 입력해 주세요.');
      return;
    }
    if (newPin !== newPinConfirm) {
      setLocalError('새 PIN이 일치하지 않아요.');
      return;
    }
    setLocalError(null);
    onSubmit({ currentPin, newPin, newPinConfirm });
  };

  return (
    <ModalFrame
      title="PIN 변경"
      description={'변경하면 모든 기기에서 로그아웃돼요.\n새 PIN으로 다시 로그인해야 해요.'}
      errorMessage={localError ?? errorMessage}
      onRequestClose={loading ? undefined : onClose}
      actions={
        <>
          <ActionButton label="취소" variant="cancel" onPress={onClose} disabled={loading} />
          <ActionButton label="변경" onPress={handleSubmit} disabled={loading} loading={loading} />
        </>
      }
    >
      <PinField
        label="현재 PIN"
        value={currentPin}
        onChangeText={setCurrentPin}
        editable={!loading}
      />
      <PinField label="새 PIN" value={newPin} onChangeText={setNewPin} editable={!loading} />
      <PinField
        label="새 PIN 확인"
        value={newPinConfirm}
        onChangeText={setNewPinConfirm}
        editable={!loading}
      />
    </ModalFrame>
  );
}

// 1단계: 탈퇴 영향 안내 → 2단계: 현재 PIN 입력 후 최종 확인. onSubmit({ currentPin }).
export function DeleteAccountModal({ loading, errorMessage, onSubmit, onClose }) {
  const [step, setStep] = useState('notice');
  const [currentPin, setCurrentPin] = useState('');
  const [localError, setLocalError] = useState(null);

  if (step === 'notice') {
    return (
      <ModalFrame
        title="회원 탈퇴할까요?"
        description={
          '탈퇴하면 계정과 이용 정보를 되돌릴 수 없어요.\n같은 번호로 다시 가입해도 이전 정보는 복구되지 않아요.'
        }
        onRequestClose={onClose}
        actions={
          <>
            <ActionButton label="취소" variant="cancel" onPress={onClose} />
            <ActionButton label="계속" variant="danger" onPress={() => setStep('pin')} />
          </>
        }
      />
    );
  }

  const handleSubmit = () => {
    if (currentPin.length !== 6) {
      setLocalError('현재 PIN을 숫자 6자리로 입력해 주세요.');
      return;
    }
    setLocalError(null);
    onSubmit({ currentPin });
  };

  return (
    <ModalFrame
      title="현재 PIN을 입력해 주세요"
      description="본인 확인 후 탈퇴가 바로 진행돼요."
      errorMessage={localError ?? errorMessage}
      onRequestClose={loading ? undefined : onClose}
      actions={
        <>
          <ActionButton label="취소" variant="cancel" onPress={onClose} disabled={loading} />
          <ActionButton
            label="탈퇴하기"
            variant="danger"
            onPress={handleSubmit}
            disabled={loading}
            loading={loading}
          />
        </>
      }
    >
      <PinField
        label="현재 PIN"
        value={currentPin}
        onChangeText={setCurrentPin}
        editable={!loading}
      />
    </ModalFrame>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  sheet: {
    width: '100%',
    backgroundColor: redesign.bg,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    color: redesign.textSecondary,
    lineHeight: 21,
    marginBottom: 8,
  },
  field: {
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.textSecondary,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: redesign.textPrimary,
    backgroundColor: redesign.surfaceSoft,
  },
  error: {
    marginTop: 12,
    fontSize: 13,
    color: colors.red,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: redesign.accent,
  },
  btnDanger: {
    backgroundColor: colors.red,
  },
  btnCancel: {
    backgroundColor: redesign.surfaceSoft,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnCancelText: {
    fontWeight: '600',
    color: redesign.textPrimary,
  },
});

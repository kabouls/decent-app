import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, Platform, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { CheckIconSVG, ChevronLeftSVG } from '../ui/icons.js';
import { SUCCESS, GREEN_400, BRAND_DEEP, TEXT_SECONDARY, TEXT_PRIMARY, WHITE, RADIUS_9 } from '../theme/tokens.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hideScrollbarRefCallback } from '../ui/scroll.js';
import { useTheme } from '../theme.js';
import { supabase } from '../../supabase.js';

export default function ChangePasswordModal({ app = {} }) {
  const { theme, themeMode } = useTheme();
  const { AppKeyboardAwareScrollView, EyeClosedSVG, EyeOpenSVG, FocusableTextInput, changePasswordPageVisible, getPasswordRequirements, hasPasswordAuth, headerBottomY, isPasswordStrong, isWebWide, lightweightMode, session, setAccountSettingsModalVisible, setChangePasswordPageVisible, setPasswordPageDiscardWarningVisible, setSession, setSettingsModalVisible, setUserProfile, showAppAlert, showToast, styles } = app;

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // The page stays mounted (it is a Modal with a visible prop), so a fresh
  // open has to clear the previous attempt explicitly.
  useEffect(() => {
    if (changePasswordPageVisible) {
      setNewPassword('');
      setConfirmNewPassword('');
      setShowNewPassword(false);
      setShowConfirmNewPassword(false);
    }
  }, [changePasswordPageVisible]);

  const handleCloseChangePasswordPage = () => {
    if (newPassword.trim() !== '' || confirmNewPassword.trim() !== '') {
      setPasswordPageDiscardWarningVisible(true);
    } else {
      setChangePasswordPageVisible(false);
      if (Platform.OS !== 'web') setAccountSettingsModalVisible(true);
    }
  };

  const handleChangePassword = async () => {
    if (!isPasswordStrong(newPassword)) {
      showAppAlert('Password Too Weak', 'Your new password needs to meet all the requirements shown below the field.');
      return false;
    }
    if (newPassword !== confirmNewPassword) {
      showAppAlert("Passwords Don't Match", 'Please re-type the same password in both fields.');
      return false;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      showAppAlert('Error', error.message);
      return false;
    } else {
      setNewPassword('');
      setConfirmNewPassword('');
      // updateUser genuinely does set the password server-side (confirmed
      // by many reports of successfully logging in with it afterward), but
      // whether it actually links the 'email' identity is a real, longstanding
      // Supabase Auth bug - not reliable enough to depend on. Tracking this
      // ourselves instead: a flag directly on the profile row, which we
      // fully control and which reflects an update that genuinely
      // succeeded (this code only runs when the error check above passed).
      const wasAlreadySet = hasPasswordAuth;
      if (session && session.user) {
        const { error: flagError } = await supabase
          .from('profiles')
          .update({ has_password_auth: true })
          .eq('id', session.user.id);
        if (!flagError) setUserProfile((prev) => ({ ...prev, hasPasswordAuth: true }));
      }
      // Still attempt the session refresh too, in case identities linking
      // did work correctly this time - harmless either way, and covers
      // the direct email/password signup case, which was never affected
      // by this bug in the first place.
      const { data: refreshed } = await supabase.auth.getSession();
      if (refreshed && refreshed.session) setSession(refreshed.session);
      showToast(wasAlreadySet ? 'Password updated' : 'Password created');
      return true;
    }
  };


  return (
<Modal
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent={true}
        visible={changePasswordPageVisible}
        onRequestClose={handleCloseChangePasswordPage}
      >
        <View style={[styles.overlayModalBg, { justifyContent: 'flex-start', paddingTop: isWebWide ? 20 : headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={handleCloseChangePasswordPage}
        >
            {/* Backdrop blur - safe here since every one of these is its
                own native Modal, rendered on a separate OS-level surface
                from the main screen (header/bottom bar/category bar), so
                there's no GPU double-compositing with those. Falls back to
                a flat dim in Lightweight Mode, same as everywhere else. */}
            {Platform.OS !== 'web' && (
              lightweightMode ? (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 15, 23, 0.85)' }} />
              ) : (
                <BlurView
                  intensity={55}
                  tint={themeMode === 'light' ? 'light' : 'dark'}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              )
            )}
          <SafeAreaView style={[styles.overlayModalContainer, { maxHeight: isWebWide ? Dimensions.get('window').height - 60 : Dimensions.get('window').height - headerBottomY - 40 }]}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              <BouncyButton style={{ padding: 4 }} onPress={handleCloseChangePasswordPage} accessibilityRole="button" accessibilityLabel="Back">
                <ChevronLeftSVG color={themeMode === 'light' ? BRAND_DEEP : TEXT_PRIMARY} size={22} />
              </BouncyButton>
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>{hasPasswordAuth ? 'Change Password' : 'Create Password'}</Text>
              <BouncyButton
                style={styles.closeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                onPress={() => {
                  if (newPassword.trim() !== '' || confirmNewPassword.trim() !== '') {
                    setPasswordPageDiscardWarningVisible(true);
                  } else {
                    setChangePasswordPageVisible(false);
                    setSettingsModalVisible(false);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            <AppKeyboardAwareScrollView
              ref={hideScrollbarRefCallback(isWebWide)}
              contentContainerStyle={{ padding: 20 }}
              enableOnAndroid={true}
              extraScrollHeight={140}
              keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.formGroupLabel}>New Password</Text>
                <View style={{ position: 'relative' }}>
                  <FocusableTextInput
                    style={[styles.formInput, { marginBottom: 8, paddingRight: 44 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password"
                    placeholderTextColor={TEXT_SECONDARY}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    importantForAutofill="yes"
                    textContentType="newPassword"
                    autoFocus
                    accessibilityLabel="New Password"
                  />
                  <BouncyButton
                    style={{ position: 'absolute', right: 12, top: 12 }}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    accessibilityRole="button"
                    accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOpenSVG color={theme.textSecondary} size={18} /> : <EyeClosedSVG color={theme.textSecondary} size={18} />}
                  </BouncyButton>
                </View>
                <View style={{ marginBottom: 12 }}>
                  {getPasswordRequirements(newPassword).map((req) => (
                    <View key={req.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      {req.met ? <CheckIconSVG color={SUCCESS} /> : <View style={{ width: 18, height: 18, borderRadius: RADIUS_9, borderWidth: 1.5, borderColor: theme.border }} />}
                      <Text style={{ color: req.met ? GREEN_400 : theme.textSecondary, fontSize: 12 }}>{req.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.formGroupLabel}>Confirm New Password</Text>
                <View style={{ position: 'relative' }}>
                  <FocusableTextInput
                    style={[styles.formInput, { paddingRight: 44 }]}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor={TEXT_SECONDARY}
                    secureTextEntry={!showConfirmNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    importantForAutofill="yes"
                    textContentType="newPassword"
                    accessibilityLabel="Confirm New Password"
                  />
                  <BouncyButton
                    style={{ position: 'absolute', right: 12, top: 12 }}
                    onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    accessibilityRole="button"
                    accessibilityLabel={showConfirmNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmNewPassword ? <EyeOpenSVG color={theme.textSecondary} size={18} /> : <EyeClosedSVG color={theme.textSecondary} size={18} />}
                  </BouncyButton>
                </View>
                <BouncyButton
                  style={[styles.saveAccountSettingsBtn, { marginTop: 20 }]}
                  onPress={async () => {
                    const success = await handleChangePassword();
                    if (success) {
                      setChangePasswordPageVisible(false);
                      if (Platform.OS !== 'web') setAccountSettingsModalVisible(true);
                    }
                  }}
                  disabled={changingPassword || !newPassword}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: changingPassword || !newPassword, busy: changingPassword }}
                >
                  {changingPassword ? (
                    <ActivityIndicator color={WHITE} />
                  ) : (
                    <Text style={styles.submitBtnText}>{hasPasswordAuth ? 'Update Password' : 'Create Password'}</Text>
                  )}
                </BouncyButton>
            </AppKeyboardAwareScrollView>
          </SafeAreaView>
        </View>
      </Modal>
  );
}

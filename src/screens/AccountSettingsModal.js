import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Modal, Platform, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { ChevronLeftSVG } from '../ui/icons.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hideScrollbarRefCallback } from '../ui/scroll.js';
import { useTheme } from '../theme.js';
import { supabase } from '../../supabase.js';
import { BLACK, GREEN_400, TEXT_MUTED, BRAND_DEEP, BRAND_MID, BRAND_PRIMARY, TEXT_SECONDARY, DANGER, RED_300, TEXT_PRIMARY, ORANGE_500_5, WHITE, RADIUS_10, RADIUS_2, RADIUS_99 } from '../theme/tokens.js';

export default function AccountSettingsModal({ app = {} }) {
  const { theme, themeMode } = useTheme();
  const { AppKeyboardAwareScrollView, CameraIconSVG, ClearTextXSVG, FocusableTextInput, GripDotsIconSVG, RevertIconSVG, TrashIconSVG, accountSettingsModalVisible, contentModalWidth, createLinkDragResponder, draggingLinkIndex, editAvatar, editContactConsent, editContacts, editHandle, editLinks, getSocialLogoSVG, handleAddAccountLink, handleChangedAt, handleDeleteAccount, handleLinkTextChange, handleRemoveAccountLink, handleStatus, hasPasswordAuth, headerBottomY, isValidHandleFormat, isWebWide, lightweightMode, linkDragY, linkDropLineInterpRef, linkRowHeightRef, pickAvatarImage, pushProfileToSupabase, renderContactInfoSection, returnToOptionsOnClose, session, setAccountSaveSuccessModalVisible, setAccountSettingsDiscardWarningVisible, setAccountSettingsModalVisible, setChangePasswordPageVisible, setEditAvatar, setEditContactConsent, setEditContacts, setEditHandle, setEditLinks, setHandleChangedAt, setHandleStatus, setLogoutConfirmModalVisible, setReturnToOptionsOnClose, setSettingsModalVisible, setUserProfile, showAppAlert, showToast, styles, subPageSlideAnim, uploadImageChecked, userProfile } = app;

  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const accountSettingsStickyAnim = useRef(new Animated.Value(0)).current;
  const [stickySaveRendered, setStickySaveRendered] = useState(false);

  // Hydrate from the profile each time the modal opens. editHandle stays in
  // App (shared with onboarding's availability check), so it is not reset here.
  useEffect(() => {
    if (!accountSettingsModalVisible) return;
    setEditName(userProfile.name || '');
    setEditRole(userProfile.role || '');
    setEditLocation(userProfile.location || 'South Jakarta, Jakarta, Indonesia');
    setEditBio(userProfile.bio || '');
    setEditEmail(userProfile.email || '');
  }, [accountSettingsModalVisible]);

  const hasUnsavedAccountChanges = () => {
    return (
      editName !== userProfile.name ||
      editHandle !== (userProfile.handle || '') ||
      editRole !== userProfile.role ||
      editLocation !== userProfile.location ||
      editBio !== userProfile.bio ||
      editEmail !== userProfile.email ||
      editAvatar !== userProfile.avatar ||
      JSON.stringify(editLinks) !== JSON.stringify(userProfile.links || []) ||
      editContactConsent !== !!userProfile.contactConsent ||
      JSON.stringify(editContacts) !== JSON.stringify(userProfile.contacts || [])
    );
  };

  const handleSaveAccountSettings = async () => {
    // If avatar is a local file (freshly picked), upload it to Supabase Storage first
    let avatarUrl = editAvatar;
    if (avatarUrl && (avatarUrl.startsWith('file://') || avatarUrl.startsWith('content://') || avatarUrl.startsWith('blob:') || avatarUrl.startsWith('data:'))) {
      avatarUrl = await uploadImageChecked(avatarUrl, 'avatars');
    }

    // Handle change: validate format, availability, and 7-day cooldown
    const newHandle = editHandle.trim();
    const handleChanged = newHandle !== (userProfile.handle || '');
    if (handleChanged) {
      if (!isValidHandleFormat(newHandle)) {
        showAppAlert('Invalid Handle', 'Your handle must be 3-20 characters: letters, numbers, dots, underscores, and dashes only.');
        return;
      }
      if (handleStatus === 'taken') {
        showAppAlert('Handle Taken', 'That handle is already in use. Please choose another.');
        return;
      }
      if (handleStatus === 'checking') {
        showAppAlert('Please Wait', 'Still checking if that handle is available.');
        return;
      }
      if (handleChangedAt) {
        const daysSince = (Date.now() - new Date(handleChangedAt).getTime()) / 86400000;
        if (daysSince < 30) {
          const daysLeft = Math.ceil(30 - daysSince);
          showAppAlert('Too Soon', `You can change your handle again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);
          return;
        }
      }
    }

    // Handle email change: this changes the LOGIN email, needs confirmation
    const newEmail = editEmail.trim();
    if (session && newEmail && newEmail.toLowerCase() !== (session.user.email || '').toLowerCase()) {
      const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
      if (emailError) {
        showAppAlert('Email Update Failed', emailError.message);
      } else {
        showAppAlert(
          'Confirm Your New Email',
          'We sent a confirmation link to your new email address. Your login email stays the same until you confirm it there.'
        );
      }
    }

    const validLinks = editLinks.filter((l) => l.trim() !== '');
    const updated = {
      ...userProfile,
      name: editName.trim(),
      role: editRole.trim(),
      location: editLocation.trim(),
      bio: editBio.trim(),
      email: newEmail || (session ? session.user.email : ''),
      avatar: avatarUrl || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
      handle: newHandle,
      links: validLinks,
      contacts: editContacts,
      contactConsent: editContactConsent
    };
    setUserProfile(updated);
    setEditAvatar(updated.avatar);
    if (handleChanged) setHandleChangedAt(new Date().toISOString());
    await pushProfileToSupabase(updated, handleChanged);
    setAccountSettingsModalVisible(false);
    setAccountSaveSuccessModalVisible(true);
  };

  const handleRevertAccountChanges = () => {
    setEditName(userProfile.name);
    setEditHandle(userProfile.handle || '');
    setHandleStatus(null);
    setEditRole(userProfile.role);
    setEditLocation(userProfile.location || 'South Jakarta, Jakarta, Indonesia');
    setEditBio(userProfile.bio);
    setEditEmail(userProfile.email);
    setEditAvatar(userProfile.avatar);
    setEditLinks(userProfile.links || []);
    setEditContacts(userProfile.contacts || []);
    setEditContactConsent(!!userProfile.contactConsent);
    showToast('Changes reverted');
  };

  const handleCloseAccountSettings = () => {
    if (hasUnsavedAccountChanges()) {
      setAccountSettingsDiscardWarningVisible(true);
    } else {
      setAccountSettingsModalVisible(false);
      if (Platform.OS !== 'web' && returnToOptionsOnClose) {
        setSettingsModalVisible(true);
        setReturnToOptionsOnClose(false);
      }
    }
  };

  const showStickySaveButton = accountSettingsModalVisible && hasUnsavedAccountChanges();

  useEffect(() => {
    if (showStickySaveButton) {
      setStickySaveRendered(true);
      Animated.timing(accountSettingsStickyAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (stickySaveRendered) {
      Animated.timing(accountSettingsStickyAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setStickySaveRendered(false);
      });
    }
  }, [showStickySaveButton]);

  return (
<Modal
        animationType="none"
        transparent={true}
        visible={accountSettingsModalVisible}
        onRequestClose={handleCloseAccountSettings}
      >
        <View
          style={[styles.overlayModalBg, isWebWide ? { justifyContent: 'center', paddingHorizontal: 16 } : { justifyContent: 'flex-start', paddingTop: headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
          {...(Platform.OS === 'web' ? {
            onStartShouldSetResponder: () => true,
            onResponderRelease: handleCloseAccountSettings
          } : {})}
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
          <Animated.View
            style={{ flex: 1, transform: Platform.OS === 'web' ? [] : [{ translateX: subPageSlideAnim }], ...(isWebWide ? { justifyContent: 'center', alignItems: 'center' } : {}) }}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal. Web only - on native these
            // props are omitted entirely rather than just returning false,
            // to remove any doubt about how the responder system treats a
            // present-but-declining handler versus no handler at all.
            {...(Platform.OS === 'web' ? {
              onStartShouldSetResponder: () => true,
              onResponderRelease: () => {}
            } : {})}
          >
          <SafeAreaView style={[styles.overlayModalContainer, { maxHeight: isWebWide ? Math.min(640, Dimensions.get('window').height - 80) : Dimensions.get('window').height - headerBottomY - 40, ...(isWebWide ? { maxWidth: contentModalWidth } : {}) }]}>
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              {!isWebWide && (
                <BouncyButton style={{ padding: 4 }} onPress={handleCloseAccountSettings} accessibilityRole="button" accessibilityLabel="Back">
                  <ChevronLeftSVG color={themeMode === 'light' ? BRAND_DEEP : TEXT_PRIMARY} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>Account Settings</Text>
              <BouncyButton
                style={styles.closeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                onPress={() => {
                  if (hasUnsavedAccountChanges()) {
                    setAccountSettingsDiscardWarningVisible(true);
                  } else {
                    setAccountSettingsModalVisible(false);
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
              contentContainerStyle={styles.accountSettingsScrollContent}
              enableOnAndroid={true}
              extraScrollHeight={140}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.formGroupLabel}>Profile Picture</Text>
              <BouncyButton style={styles.avatarEditPickerBtn} activeOpacity={0.85} onPress={pickAvatarImage} accessibilityRole="button" accessibilityLabel="Change profile picture">
                <Image source={{ uri: editAvatar }} style={styles.avatarEditPreview} />
                <View style={styles.avatarEditOverlay}>
                  <CameraIconSVG />
                  <Text style={styles.avatarEditText}>Change Photo</Text>
                </View>
              </BouncyButton>

              <Text style={styles.formGroupLabel}>Full Name</Text>
              <View style={styles.inputWithClearRow}>
                <FocusableTextInput
                  style={[styles.formInput, { flex: 1 }]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Full Name"
                  placeholderTextColor={TEXT_SECONDARY}
                  maxLength={60}
                  accessibilityLabel="Full Name"
                />
                {editName.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setEditName('')} accessibilityRole="button" accessibilityLabel="Clear">
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>

              <Text style={styles.formGroupLabel}>Unique ID / Handle</Text>
              <View style={[styles.inputWithClearRow, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: RADIUS_10, paddingLeft: 14 }]}>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>@</Text>
                <FocusableTextInput
                  style={[styles.formInput, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
                  value={editHandle}
                  onChangeText={(t) => setEditHandle(t.replace(/[^A-Za-z0-9._-]/g, ''))}
                  placeholder="Enter your username here"
                  placeholderTextColor={TEXT_SECONDARY}
                  autoCapitalize="none"
                  maxLength={20}
                  accessibilityLabel="Unique ID / Handle"
                />
                {editHandle.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setEditHandle('')} accessibilityRole="button" accessibilityLabel="Clear">
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>
              <Text style={{ color: TEXT_MUTED, fontSize: 11, marginTop: -6, marginBottom: 4 }}>
                3-20 characters, letters, numbers, dots, underscores, and dashes only. Can only be changed once every 30 days.
              </Text>
              {editHandle.trim() !== (userProfile.handle || '') && (
                <>
                  {handleStatus === 'checking' && <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 6 }}>Checking availability...</Text>}
                  {handleStatus === 'available' && <Text style={{ color: GREEN_400, fontSize: 12, marginBottom: 6 }}>✓ Available</Text>}
                  {handleStatus === 'taken' && <Text style={{ color: RED_300, fontSize: 12, marginBottom: 6 }}>This handle is already taken</Text>}
                  {handleStatus === 'invalid' && <Text style={{ color: RED_300, fontSize: 12, marginBottom: 6 }}>3-20 chars: letters, numbers, . _ -</Text>}
                  {handleChangedAt && (Date.now() - new Date(handleChangedAt).getTime()) / 86400000 < 30 && (
                    <Text style={{ color: ORANGE_500_5, fontSize: 12, marginBottom: 6 }}>
                      You can change your handle again in {Math.ceil(30 - (Date.now() - new Date(handleChangedAt).getTime()) / 86400000)} day(s).
                    </Text>
                  )}
                </>
              )}

              <Text style={styles.formGroupLabel}>Specialties / Position</Text>
              <View style={styles.inputWithClearRow}>
                <FocusableTextInput
                  style={[styles.formInput, { flex: 1 }]}
                  value={editRole}
                  onChangeText={setEditRole}
                  placeholder="Specialties / Role"
                  placeholderTextColor={TEXT_SECONDARY}
                  maxLength={60}
                  accessibilityLabel="Specialties / Position"
                />
                {editRole.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setEditRole('')} accessibilityRole="button" accessibilityLabel="Clear">
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>

              {/* Added Location Field */}
              <Text style={styles.formGroupLabel}>Location / City</Text>
              <View style={styles.inputWithClearRow}>
                <FocusableTextInput
                  style={[styles.formInput, { flex: 1 }]}
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder="South Jakarta, Jakarta, Indonesia"
                  placeholderTextColor={TEXT_SECONDARY}
                  maxLength={80}
                  accessibilityLabel="Location / City"
                />
                {editLocation.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setEditLocation('')} accessibilityRole="button" accessibilityLabel="Clear">
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>

              <Text style={styles.formGroupLabel}>Short Brief / Bio</Text>
              <FocusableTextInput
                style={[styles.formInput, { height: 74, textAlignVertical: 'top' }]}
                multiline
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Short bio..."
                placeholderTextColor={TEXT_SECONDARY}
                maxLength={500}
                accessibilityLabel="Short Brief / Bio"
              />
              <Text style={{ color: TEXT_MUTED, fontSize: 11, marginTop: -4, marginBottom: 4, textAlign: 'right' }}>
                {editBio.length}/500
              </Text>

              <Text style={styles.formGroupLabel}>Email Address</Text>
              <View style={styles.inputWithClearRow}>
                <FocusableTextInput
                  style={[styles.formInput, { flex: 1 }]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Email Address"
                  placeholderTextColor={TEXT_SECONDARY}
                  autoCapitalize="none"
                  autoComplete="email"
                  importantForAutofill="yes"
                  textContentType="emailAddress"
                  accessibilityLabel="Email Address"
                />
                {editEmail.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setEditEmail('')} accessibilityRole="button" accessibilityLabel="Clear">
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>
              <Text style={[styles.settingItemSub, { marginTop: -6, marginBottom: 4 }]}>
                Changing this changes your login email. You'll get a confirmation link sent to the new address.
              </Text>

              <Text style={[styles.formGroupLabel, { marginTop: 10 }]}>
                Profile Links (Max 5)
              </Text>
              <View style={{ position: 'relative' }}>
                {draggingLinkIndex !== null && linkDropLineInterpRef.current && (
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute', left: 0, right: 0, top: 0, height: 3, borderRadius: RADIUS_2,
                      backgroundColor: themeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                      zIndex: 20,
                      transform: [{ translateY: linkDragY.interpolate(linkDropLineInterpRef.current) }]
                    }}
                  />
                )}
              {editLinks.map((lnk, idx) => {
                const dragResponder = createLinkDragResponder(idx);
                const isDragging = draggingLinkIndex === idx;
                return (
                <Animated.View
                  key={idx}
                  onLayout={(e) => { if (idx === 0) linkRowHeightRef.current = e.nativeEvent.layout.height + 8; }}
                  style={[
                    styles.videoInputRow,
                    isDragging && { transform: [{ translateY: linkDragY }], zIndex: 10, elevation: 8, opacity: 0.96 }
                  ]}
                >
                  {editLinks.length > 1 && (
                    <View {...dragResponder.panHandlers} style={{ padding: 6 }} accessibilityRole="adjustable" accessibilityLabel={`Reorder link ${idx + 1}`}>
                      <GripDotsIconSVG color={theme.textSecondary} />
                    </View>
                  )}
                  <View style={{ flex: 1, position: 'relative' }}>
                    <View style={{ position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center', zIndex: 5 }}>
                      {getSocialLogoSVG(lnk)}
                    </View>
                    <FocusableTextInput
                      style={[styles.formInput, { paddingLeft: 40, paddingRight: lnk.length > 0 ? 40 : 14 }]}
                      value={lnk}
                      onChangeText={(t) => handleLinkTextChange(t, idx)}
                      placeholder={`https://www.figma.com/@username (${idx + 1})`}
                      placeholderTextColor={TEXT_SECONDARY}
                      autoCapitalize="none"
                      accessibilityLabel={`Profile link ${idx + 1}`}
                    />
                    {lnk.length > 0 && (
                      <BouncyButton style={styles.clearFieldBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => handleLinkTextChange('', idx)} accessibilityRole="button" accessibilityLabel="Clear">
                        <ClearTextXSVG />
                      </BouncyButton>
                    )}
                  </View>
                  <BouncyButton
                    style={{ padding: 8 }}
                    onPress={() => handleRemoveAccountLink(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove link ${idx + 1}`}
                  >
                    <TrashIconSVG />
                  </BouncyButton>
                </Animated.View>
                );
              })}
              </View>

              {editLinks.length < 5 && (
                <BouncyButton style={styles.addMoreVideoBtn} onPress={handleAddAccountLink} accessibilityRole="button">
                  <Text style={styles.addMoreVideoText}>+ Add Profile Link ({editLinks.length}/5)</Text>
                </BouncyButton>
              )}

              {renderContactInfoSection()}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' }}>
                <BouncyButton
                  style={[styles.saveAccountSettingsBtn, { paddingHorizontal: 20, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: DANGER, marginTop: 0 }]}
                  onPress={() => setLogoutConfirmModalVisible(true)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.submitBtnText, { color: DANGER }]}>Log Out</Text>
                </BouncyButton>

                <BouncyButton
                  style={[styles.saveAccountSettingsBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: themeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY, marginTop: 0 }]}
                  onPress={() => {
                    setChangePasswordPageVisible(true);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.submitBtnText, { color: theme.accent }]}>{hasPasswordAuth ? 'Change Password' : 'Create Password'}</Text>
                </BouncyButton>
              </View>

              <BouncyButton
                style={{ marginTop: 20, alignItems: 'center' }}
                onPress={handleDeleteAccount}
                accessibilityRole="button"
              >
                <Text style={{ color: RED_300, fontWeight: '700', fontSize: 13 }}>Delete Account</Text>
              </BouncyButton>

              {hasUnsavedAccountChanges() && <View style={{ height: 76 }} />}
            </AppKeyboardAwareScrollView>

            {stickySaveRendered && (
              <Animated.View
                pointerEvents={showStickySaveButton ? 'auto' : 'none'}
                style={{
                  position: 'absolute', left: 20, right: 20, bottom: 20,
                  flexDirection: 'row', gap: 10, alignItems: 'center',
                  opacity: accountSettingsStickyAnim,
                  transform: [{
                    translateY: accountSettingsStickyAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] })
                  }]
                }}
              >
                <BouncyButton
                  style={{
                    width: 44, height: 44, borderRadius: RADIUS_99,
                    backgroundColor: WHITE,
                    borderWidth: 1.5, borderColor: themeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY,
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: BLACK, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10
                  }}
                  activeOpacity={0.85}
                  onPress={handleRevertAccountChanges}
                  accessibilityRole="button"
                  accessibilityLabel="Revert changes"
                >
                  <RevertIconSVG color={themeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} size={19} />
                </BouncyButton>

                <BouncyButton
                  style={[
                    styles.saveAccountSettingsBtn,
                    { flex: 1, marginTop: 0, shadowColor: BLACK, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10 }
                  ]}
                  activeOpacity={0.85}
                  onPress={handleSaveAccountSettings}
                  accessibilityRole="button"
                >
                  <Text style={styles.submitBtnText}>Save Changes</Text>
                </BouncyButton>
              </Animated.View>
            )}
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
  );
}

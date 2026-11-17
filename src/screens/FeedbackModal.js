import { useState } from 'react';
import { Animated, Dimensions, Modal, Platform, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { ChevronLeftSVG } from '../ui/icons.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hideScrollbarRefCallback } from '../ui/scroll.js';
import { useTheme } from '../theme.js';
import { supabase } from '../../supabase.js';
import { BRAND_DEEP, BRAND_PRIMARY, TEXT_SECONDARY, TEXT_PRIMARY, WHITE, RADIUS_5 } from '../theme/tokens.js';

export default function FeedbackModal({ app = {} }) {
  const { theme, themeMode } = useTheme();
  const { AnimatedPillTabs, AppKeyboardAwareScrollView, AppSwitch, FocusableTextInput, contentModalWidth, feedbackEmail, headerBottomY, isWebWide, lightweightMode, returnToOptionsOnClose, session, setFeedbackEmail, setFeedbackModalVisible, setFeedbackSuccessModalVisible, setReturnToOptionsOnClose, setSettingsModalVisible, showAppAlert, showToast, styles, subPageInteractive, subPageSlideAnim } = app;

  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackNotifyEmail, setFeedbackNotifyEmail] = useState(true);
  const [feedbackSupportTab, setFeedbackSupportTab] = useState('feedback');
  const [featureRequestTitle, setFeatureRequestTitle] = useState('');
  const [featureRequestDescription, setFeatureRequestDescription] = useState('');
  const [featureRequestHasLink, setFeatureRequestHasLink] = useState(false);
  const [featureRequestLink, setFeatureRequestLink] = useState('');

  const handleSubmitFeedback = async () => {
    if (!feedbackMessage.trim()) {
      showAppAlert('Message Required', 'Please enter your feedback message or issue description.');
      return;
    }
    const { error } = await supabase.from('feedback_messages').insert({
      user_id: session ? session.user.id : null,
      email: feedbackEmail.trim(),
      message: feedbackMessage.trim(),
      notify_email: feedbackNotifyEmail
    });
    if (error) {
      console.warn('Failed to save feedback:', error);
      showAppAlert('Error', 'Something went wrong submitting your feedback. Please try again.');
      return;
    }
    setFeedbackModalVisible(false);
    setFeedbackMessage('');
    setFeedbackSuccessModalVisible(true);
  };

  const handleSubmitFeatureRequest = async () => {
    if (!featureRequestTitle.trim() || !featureRequestDescription.trim()) {
      showAppAlert('Missing Info', 'Please enter both a title and description for your feature request.');
      return;
    }
    if (featureRequestHasLink && !featureRequestLink.trim()) {
      showAppAlert('Missing Link', 'You checked "reference link" but left it empty - add a link or uncheck it.');
      return;
    }
    const { error } = await supabase.from('feature_requests').insert({
      user_id: session ? session.user.id : null,
      email: feedbackEmail.trim(),
      title: featureRequestTitle.trim(),
      description: featureRequestDescription.trim(),
      reference_link: featureRequestHasLink ? featureRequestLink.trim() : null
    });
    if (error) {
      console.warn('Failed to save feature request:', error);
      showAppAlert('Error', 'Something went wrong submitting your feature request. Please try again.');
      return;
    }
    setFeatureRequestTitle('');
    setFeatureRequestDescription('');
    setFeatureRequestHasLink(false);
    setFeatureRequestLink('');
    showToast('Feature request submitted - thank you!');
  };


  return (
<Modal
        animationType="none"
        transparent={true}
        visible={true}
        onRequestClose={() => setFeedbackModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, isWebWide ? { justifyContent: 'center', paddingHorizontal: 16 } : { justifyContent: 'flex-start', paddingTop: headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setFeedbackModalVisible(false)}
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
            pointerEvents={Platform.OS !== 'web' && !subPageInteractive ? 'none' : 'auto'}
            style={{ flex: 1, transform: Platform.OS === 'web' ? [] : [{ translateX: subPageSlideAnim }], ...(isWebWide ? { justifyContent: 'center', alignItems: 'center' } : {}) }}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
          <SafeAreaView style={[styles.overlayModalContainer, { maxHeight: isWebWide ? Math.min(640, Dimensions.get('window').height - 80) : Dimensions.get('window').height - headerBottomY - 40, ...(isWebWide ? { maxWidth: contentModalWidth } : {}) }]}>
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              {!isWebWide && (
                <BouncyButton style={{ padding: 4 }} onPress={() => setFeedbackModalVisible(false)} accessibilityRole="button" accessibilityLabel="Back">
                  <ChevronLeftSVG color={themeMode === 'light' ? BRAND_DEEP : TEXT_PRIMARY} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>Feedback & Support</Text>
              <BouncyButton style={styles.closeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => {
                setFeedbackModalVisible(false);
                if (Platform.OS !== 'web' && returnToOptionsOnClose) {
                  setSettingsModalVisible(true);
                  setReturnToOptionsOnClose(false);
                } else {
                  setSettingsModalVisible(false);
                }
              }}>
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            <AppKeyboardAwareScrollView
              ref={hideScrollbarRefCallback(isWebWide)}
              contentContainerStyle={{ padding: 20, gap: 12 }}
              enableOnAndroid={true}
              extraScrollHeight={140}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.knownContactBox}>
                <Text style={styles.knownContactTitle}>Support Contact</Text>
                <Text style={styles.knownContactEmail}>iputra07@gmail.com</Text>
                <Text style={styles.knownContactSub}>Direct inquiries & platform feedback</Text>
              </View>

              <AnimatedPillTabs
                theme={theme}
                themeMode={themeMode}
                activeKey={feedbackSupportTab}
                onChange={setFeedbackSupportTab}
                tabs={[
                  { key: 'feedback', label: 'Feedback' },
                  { key: 'featureRequest', label: 'Request Feature' }
                ]}
              />

              {feedbackSupportTab === 'feedback' && (
                <>
                  <Text style={styles.formGroupLabel}>Your Email Address *</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="user@example.com"
                    placeholderTextColor={TEXT_SECONDARY}
                    value={feedbackEmail}
                    onChangeText={setFeedbackEmail}
                    accessibilityLabel="Your Email Address"
                  />

                  <Text style={styles.formGroupLabel}>Feedback Message or Issue Description *</Text>
                  <FocusableTextInput
                    style={[styles.formInput, { height: 90, textAlignVertical: 'top' }]}
                    multiline
                    placeholder="Describe your suggestion or technical issue in detail..."
                    placeholderTextColor={TEXT_SECONDARY}
                    value={feedbackMessage}
                    onChangeText={setFeedbackMessage}
                    maxLength={1000}
                    accessibilityLabel="Feedback Message or Issue Description"
                  />

                  <View style={styles.feedbackNotifyToggleRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.settingItemTitle}>Send Email Notification</Text>
                      <Text style={styles.settingItemSub}>
                        Receive an email alert when your reported issue is confirmed and being fixed.
                      </Text>
                    </View>
                    <AppSwitch
                      value={feedbackNotifyEmail}
                      onValueChange={setFeedbackNotifyEmail}
                      trackColor={{ false: theme.bg, true: themeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY }}
                      thumbColor={WHITE}
                      theme={theme}
                      accessibilityRole="switch"
                      accessibilityLabel="Send Email Notification"
                      accessibilityState={{ checked: feedbackNotifyEmail }}
                    />
                  </View>

                  <BouncyButton
                    style={[styles.confirmDeleteBtn, { flex: 0, width: '100%', marginTop: 10 }]}
                    onPress={handleSubmitFeedback}
                    accessibilityRole="button"
                  >
                    <Text style={styles.confirmDeleteText}>Submit Feedback</Text>
                  </BouncyButton>
                </>
              )}

              {feedbackSupportTab === 'featureRequest' && (
                <>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>
                    Have an idea for something DECENT should have? Tell us about it.
                  </Text>

                  <Text style={styles.formGroupLabel}>Title *</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="e.g. Dark mode for the block editor preview"
                    placeholderTextColor={TEXT_SECONDARY}
                    value={featureRequestTitle}
                    onChangeText={setFeatureRequestTitle}
                    maxLength={80}
                    accessibilityLabel="Title"
                  />

                  <Text style={styles.formGroupLabel}>Description *</Text>
                  <FocusableTextInput
                    style={[styles.formInput, { height: 90, textAlignVertical: 'top' }]}
                    multiline
                    placeholder="Describe what you'd like to see and why it'd help..."
                    placeholderTextColor={TEXT_SECONDARY}
                    value={featureRequestDescription}
                    onChangeText={setFeatureRequestDescription}
                    maxLength={1000}
                    accessibilityLabel="Description"
                  />

                  <BouncyButton
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}
                    onPress={() => setFeatureRequestHasLink(!featureRequestHasLink)}
                    accessibilityRole="checkbox"
                    accessibilityLabel="I have a reference link"
                    accessibilityState={{ checked: featureRequestHasLink }}
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: RADIUS_5, borderWidth: 1.5,
                      borderColor: featureRequestHasLink ? (themeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : theme.border,
                      backgroundColor: featureRequestHasLink ? (themeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : 'transparent',
                      alignItems: 'center', justifyContent: 'center'
                    }}>
                      {featureRequestHasLink && <Text style={{ color: WHITE, fontSize: 12, fontWeight: '800' }}>✓</Text>}
                    </View>
                    <Text style={styles.settingItemTitle}>I have a reference link</Text>
                  </BouncyButton>

                  {featureRequestHasLink && (
                    <FocusableTextInput
                      style={[styles.formInput, { marginTop: 4 }]}
                      placeholder="https://..."
                      placeholderTextColor={TEXT_SECONDARY}
                      autoCapitalize="none"
                      value={featureRequestLink}
                      onChangeText={setFeatureRequestLink}
                      accessibilityLabel="Reference link"
                    />
                  )}

                  <BouncyButton
                    style={[styles.confirmDeleteBtn, { flex: 0, width: '100%', marginTop: 10 }]}
                    onPress={handleSubmitFeatureRequest}
                    accessibilityRole="button"
                  >
                    <Text style={styles.confirmDeleteText}>Submit Feature Request</Text>
                  </BouncyButton>
                </>
              )}
            </AppKeyboardAwareScrollView>
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
  );
}

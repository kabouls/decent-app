import { Animated, Dimensions, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { ChevronLeftSVG, LockIconSVG } from '../ui/icons.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hideScrollbarRefCallback } from '../ui/scroll.js';
import { useTheme } from '../theme.js';
import { BLUE_900, SKY_800, SKY_800_2, TEXT_MUTED, BRAND_DEEP, BORDER_SOFT, SKY_50, WHITE, RADIUS_12, RADIUS_99 } from '../theme/tokens.js';

export default function PrivacyModal({ app = {} }) {
  const { themeMode } = useTheme();
  const { contentModalWidth, headerBottomY, isWebWide, lightweightMode, privacyModalVisible, returnToOptionsOnClose, setPrivacyModalVisible, setReturnToOptionsOnClose, setSettingsModalVisible, styles, subPageInteractive, subPageSlideAnim } = app;

  return (
<Modal
        animationType="none"
        transparent={true}
        visible={privacyModalVisible}
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, isWebWide ? { justifyContent: 'center', paddingHorizontal: 16 } : { justifyContent: 'flex-start', paddingTop: headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setPrivacyModalVisible(false)}
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
          <SafeAreaView style={[styles.overlayModalContainer, { backgroundColor: WHITE, borderColor: BORDER_SOFT, maxHeight: isWebWide ? Math.min(640, Dimensions.get('window').height - 80) : Dimensions.get('window').height - headerBottomY - 40, ...(isWebWide ? { maxWidth: contentModalWidth } : {}) }]}>
            <View style={[styles.modalTopBar, { backgroundColor: WHITE, borderBottomColor: BORDER_SOFT, justifyContent: 'flex-start', gap: 10 }]}>
              {!isWebWide && (
                <BouncyButton style={{ padding: 4 }} onPress={() => setPrivacyModalVisible(false)} accessibilityRole="button" accessibilityLabel="Back">
                  <ChevronLeftSVG color={BRAND_DEEP} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { color: BLUE_900, flex: 1 }, isWebWide && { fontSize: 20 }]}>Privacy Policy</Text>
              <BouncyButton style={[styles.closeBtn, { backgroundColor: SKY_50, borderColor: BORDER_SOFT }]} accessibilityRole="button" accessibilityLabel="Close" onPress={() => {
                setPrivacyModalVisible(false);
                if (Platform.OS !== 'web' && returnToOptionsOnClose) {
                  setSettingsModalVisible(true);
                  setReturnToOptionsOnClose(false);
                } else {
                  setSettingsModalVisible(false);
                }
              }}>
                <Text style={[styles.closeBtnText, { color: BLUE_900 }]}>✕</Text>
              </BouncyButton>
            </View>

            <ScrollView ref={hideScrollbarRefCallback(isWebWide)} contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={{ color: BLUE_900, fontSize: 20, fontWeight: '800' }}>Privacy Policy</Text>
              <Text style={{ color: TEXT_MUTED, fontSize: 13, fontStyle: 'italic' }}>
                Last updated: August 30, 2026.
              </Text>
              <Text style={{ color: SKY_800, fontSize: 14, lineHeight: 21 }}>
                DECENT ("we", "us", "our") is a portfolio-sharing platform for designers, operated from Indonesia by Iqbal Aprianda Putra. This policy explains what personal data we collect through the DECENT app and website, why we collect it, and the choices you have, in line with Indonesia's Personal Data Protection Law (UU No. 27 Tahun 2022).
              </Text>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Account & Profile Data</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Email address and password when you sign up directly</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• If you sign in with Google instead, your name, email, and profile photo as shared by Google</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Your display name, handle, bio, role/title, and location, if you choose to add them</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Your profile photo</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• External links you choose to add to your profile (e.g. LinkedIn, Dribbble)</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• A push notification token for your device, only if you allow notifications</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Content You Create</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Portfolio titles, briefs, and case-study descriptions you write</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Cover images and any images or content blocks you upload</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Figma prototype links and embeds you add</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• "Live" project links and labels you add</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• Category/type tags you assign (e.g. UI/UX, Graphic Design, Illustration)</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Social & Engagement Data</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Who you follow and who follows you</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Portfolios you like</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Which portfolios you view while signed in - used only to power view counts and avoid counting the same view twice within 24 hours; never shown publicly next to your account</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Notifications you receive and whether you've read them</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• Reports you submit about other content or accounts, and reports submitted about you - used only for moderation</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Automatically Collected / Technical Data</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Device platform and app version, so we know what you're running when troubleshooting</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Last-active timestamp</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Crash and error reports (via Sentry) - technical details like stack traces, device model, and OS version, used only to find and fix bugs</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• Basic connection metadata generated automatically by our hosting providers as part of normal web/server operation</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Photo Library Access</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, lineHeight: 19 }}>
                  If you upload a cover image or profile photo, the app asks for permission to access your photo library so you can pick one. We only ever access the specific photo you select and upload - we don't scan or access your library beyond that.
                </Text>
              </View>


              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Feature Interest ("I'm Interested" buttons)</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 6, lineHeight: 19 }}>
                  When you tap "I'm Interested" on an upcoming feature (like Frontend Development portfolios), we record that your account expressed interest in that specific feature. This is tied to your account, not anonymous.
                </Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, lineHeight: 19 }}>
                  We use this to gauge real demand before building something, and may reach out to people who registered interest for a short survey about it (e.g. which tools/platforms you'd want supported) before or while we build it. You can stop this at any time by requesting account deletion via Account Settings, same as any other data we hold.
                </Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>How We Use It</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: SKY_800_2, fontSize: 13, flex: 1 }}>To operate core features (profiles, portfolios, follows, likes, notifications)</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: SKY_800_2, fontSize: 13, flex: 1 }}>To show your public profile and work to other users, exactly as you've set them up</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: SKY_800_2, fontSize: 13, flex: 1 }}>To count and display deduplicated view counts on your portfolios</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: SKY_800_2, fontSize: 13, flex: 1 }}>To send push notifications you've opted into</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: SKY_800_2, fontSize: 13, flex: 1 }}>To review reports and enforce our Terms of Service (warnings, suspensions, bans)</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: SKY_800_2, fontSize: 13, flex: 1 }}>To diagnose and fix bugs or crashes</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: SKY_800_2, fontSize: 13, flex: 1 }}>We do not sell your data, and we do not use it for third-party advertising</Text>
                </View>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Who We Share Data With</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 6, lineHeight: 19 }}>
                  We use a small number of service providers to run DECENT. None of them are permitted to use your data for their own purposes:
                </Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Supabase - hosts our database, sign-in, and file storage (portfolio images, avatars)</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Vercel - hosts the DECENT website</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Expo / EAS - builds the app and delivers push notifications and app updates</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Google - provides optional sign-in</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 6 }}>• Sentry - provides crash/error monitoring</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, lineHeight: 19 }}>
                  Prototype content you embed from Figma is subject to Figma's own privacy practices, not ours.
                </Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Data Retention & Deletion</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You can edit or delete your own portfolios and profile info at any time</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Deleting your account via Account Settings permanently removes your profile, portfolios, likes, follows, and related records - this cannot be undone</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• We may retain limited records (e.g. moderation logs for reported content) as needed to enforce these policies or meet legal obligations, even after account deletion</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Your Rights</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Edit or delete your profile and portfolios anytime</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Request account deletion or a copy of your data via Account Settings or Feedback & Support</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Turn off push notifications anytime via your device settings</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• Lodge a complaint with Indonesia's data protection authority if you believe your rights have been violated</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Children's Privacy</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, lineHeight: 19 }}>
                  DECENT isn't directed at children under 13, and we don't knowingly collect data from them. If you believe a child has created an account, contact us via Feedback & Support so we can remove it.
                </Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Changes to This Policy</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, lineHeight: 19 }}>
                  We may update this policy as DECENT evolves. Material changes will be reflected here with an updated "Last updated" date.
                </Text>
              </View>

              <BouncyButton
                style={{ backgroundColor: BRAND_DEEP, borderRadius: RADIUS_99, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setPrivacyModalVisible(false)}
              >
                <Text style={{ color: WHITE, fontWeight: '700' }}>Close</Text>
              </BouncyButton>
            </ScrollView>
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
  );
}

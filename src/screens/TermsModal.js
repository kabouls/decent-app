import { Animated, Dimensions, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { ChevronLeftSVG } from '../ui/icons.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hideScrollbarRefCallback } from '../ui/scroll.js';
import { useTheme } from '../theme.js';
import { BLUE_900, SKY_800, SKY_800_2, TEXT_MUTED, BRAND_DEEP, BORDER_SOFT, SKY_50, WHITE, RADIUS_12, RADIUS_99 } from '../theme/tokens.js';

export default function TermsModal({ app = {} }) {
  const { themeMode } = useTheme();
  const { contentModalWidth, headerBottomY, isWebWide, lightweightMode, returnToOptionsOnClose, setReturnToOptionsOnClose, setSettingsModalVisible, setTermsModalVisible, styles, subPageInteractive, subPageSlideAnim } = app;

  return (
<Modal
        animationType="none"
        transparent={true}
        visible={true}
        onRequestClose={() => setTermsModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, isWebWide ? { justifyContent: 'center', paddingHorizontal: 16 } : { justifyContent: 'flex-start', paddingTop: headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setTermsModalVisible(false)}
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
                <BouncyButton style={{ padding: 4 }} onPress={() => setTermsModalVisible(false)} accessibilityRole="button" accessibilityLabel="Back">
                  <ChevronLeftSVG color={BRAND_DEEP} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { color: BLUE_900, flex: 1 }, isWebWide && { fontSize: 20 }]}>Terms of Service</Text>
              <BouncyButton style={[styles.closeBtn, { backgroundColor: SKY_50, borderColor: BORDER_SOFT }]} accessibilityRole="button" accessibilityLabel="Close" onPress={() => {
                setTermsModalVisible(false);
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
              <Text style={{ color: BLUE_900, fontSize: 20, fontWeight: '800' }}>Terms of Service</Text>
              <Text style={{ color: TEXT_MUTED, fontSize: 13, fontStyle: 'italic' }}>
                Last updated: August 30, 2026.
              </Text>
              <Text style={{ color: SKY_800, fontSize: 14, lineHeight: 21 }}>
                By creating an account or using DECENT, operated from Indonesia by Iqbal Aprianda Putra, you agree to these Terms of Service. If you don't agree, please don't use the app.
              </Text>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Eligibility</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You must be at least 13 years old to use DECENT</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• You must provide accurate information when creating your account</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Your Account</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You're responsible for keeping your login credentials secure</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You're responsible for all activity under your account</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• Your handle can't impersonate someone else or violate these terms</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Your Content</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You retain ownership of everything you upload</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• By posting content, you grant DECENT a non-exclusive, worldwide license to display and distribute it within the app and on your public DECENT link, for as long as it stays on DECENT</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You confirm you have the right to share what you post - including client work, so make sure you have permission before uploading it</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• Content linked via Figma or "live link" fields stays governed by those external platforms' own terms</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• We may remove content that violates these terms</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>AI-Generated Content</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You must disclose whether AI was used in any portfolio you upload</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• For Illustration portfolios specifically, fully AI-generated art is not allowed - only AI-assisted work (e.g. AI-generated textures, pose references) is permitted, and you must describe how AI was used when disclosing it</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• Illustration content found to be fully AI-generated will be removed immediately if identified, and may result in account action</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Acceptable Use</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• No spam, harassment, hate speech, or impersonation</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• No uploading content you don't have rights to</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• No NSFW content outside what's explicitly flagged and permitted by our NSFW settings</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• No manipulating likes, views, or follower counts</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• No scraping, reverse-engineering, or abusing the app</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• We may suspend or ban accounts that break these rules</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Reports & Moderation</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You can report content or accounts that violate these terms</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• We review reports and may take action including content removal, warnings, temporary suspension, or permanent bans</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• Moderation decisions are made at our discretion</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Intellectual Property</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• The DECENT name, logo, and app design belong to us</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• Nothing here transfers our IP to you, or your IP to us, beyond the content license described above</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Disclaimer</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• DECENT is provided "as is" and "as available," without warranties of any kind</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• We're not liable for content posted by users, or third-party content embedded via Figma or live links</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• To the fullest extent permitted by law, we're not liable for indirect or consequential damages arising from your use of DECENT</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Termination</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, marginBottom: 3 }}>• You may delete your account at any time via Account Settings</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13 }}>• We may suspend or terminate your account for violating these terms, at our discretion</Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Governing Law</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, lineHeight: 19 }}>
                  These terms are governed by the laws of Indonesia. Any disputes will be handled under Indonesian jurisdiction.
                </Text>
              </View>

              <View style={{ backgroundColor: SKY_50, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: BORDER_SOFT }}>
                <Text style={{ color: BLUE_900, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Changes to These Terms</Text>
                <Text style={{ color: SKY_800_2, fontSize: 13, lineHeight: 19 }}>
                  We may update these terms as DECENT evolves. Continued use of DECENT after changes means you accept the updated terms.
                </Text>
              </View>

              <BouncyButton
                style={{ backgroundColor: BRAND_DEEP, borderRadius: RADIUS_99, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setTermsModalVisible(false)}
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

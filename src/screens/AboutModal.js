import { Animated, Dimensions, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { ChevronLeftSVG } from '../ui/icons.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hideScrollbarRefCallback } from '../ui/scroll.js';
import { useTheme } from '../theme.js';
import { BRAND_DEEP, BRAND_MID, BRAND_ACCENT, TEXT_PRIMARY, WHITE, RADIUS_12, RADIUS_99 } from '../theme/tokens.js';

export default function AboutModal({ app = {} }) {
  const { theme, themeMode } = useTheme();
  const { APP_VERSION, BUILD_NUMBER, aboutModalVisible, contentModalWidth, headerBottomY, isWebWide, lightweightMode, returnToOptionsOnClose, setAboutModalVisible, setReturnToOptionsOnClose, setSettingsModalVisible, styles, subPageInteractive, subPageSlideAnim } = app;

  return (
<Modal
        animationType="none"
        transparent={true}
        visible={aboutModalVisible}
        onRequestClose={() => setAboutModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, isWebWide ? { justifyContent: 'center', paddingHorizontal: 16 } : { justifyContent: 'flex-start', paddingTop: headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setAboutModalVisible(false)}
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
                <BouncyButton style={{ padding: 4 }} onPress={() => setAboutModalVisible(false)} accessibilityRole="button" accessibilityLabel="Back">
                  <ChevronLeftSVG color={themeMode === 'light' ? BRAND_DEEP : TEXT_PRIMARY} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>About DECENT</Text>
              <BouncyButton style={styles.closeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Close" onPress={() => {
                setAboutModalVisible(false);
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

            <ScrollView ref={hideScrollbarRefCallback(isWebWide)} contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={{ fontSize: 18 }}>
                <Text style={{ color: themeMode === 'light' ? BRAND_DEEP : BRAND_ACCENT, fontWeight: '900' }}>DECENT</Text>
                <Text style={{ color: theme.text, fontWeight: '800' }}> v{APP_VERSION} (b{BUILD_NUMBER})</Text>
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>
                DECENT is a portfolio-sharing platform built for designers - UI/UX, Graphic Design, and Illustration - to showcase real, interactive work in one place instead of a static gallery.
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>
                Embed live, fully interactive Figma prototypes for UI/UX case studies. Upload showcase images with captions and cropping, or short videos, for Graphic Design and Illustration work.
              </Text>

              <View style={{ backgroundColor: theme.surface, borderRadius: RADIUS_12, padding: 14, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Platform Highlights</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ Live, interactive Figma prototype viewports for UI/UX</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ Video and image showcase for Graphic Design & Illustration</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ Real-usage-based category browsing and tagging</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ Transparent AI disclosure on every portfolio</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ Follows, likes, and a real notification hub</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ Shareable profile & portfolio links with QR codes</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>❖ Seamless dark mode design</Text>
              </View>

              <BouncyButton
                style={{ backgroundColor: themeMode === 'light' ? BRAND_DEEP : BRAND_MID, borderRadius: RADIUS_99, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setAboutModalVisible(false)}
                accessibilityRole="button"
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

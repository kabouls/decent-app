import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { CheckIconSVG } from '../ui/icons.js';
import { Modal, Platform, Text, View } from 'react-native';
import { useTheme } from '../theme.js';

export default function FeedbackSuccessModal({ app = {} }) {
  const { themeMode } = useTheme();
  const { fancyConfirmCardOverlay, feedbackSuccessModalVisible, isWebWide, lightweightMode, setFeedbackSuccessModalVisible, styles } = app;

  return (
<Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={feedbackSuccessModalVisible}
        onRequestClose={() => setFeedbackSuccessModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.45)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setFeedbackSuccessModalVisible(false)}
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
          <View style={[styles.customConfirmCard, fancyConfirmCardOverlay]}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={styles.successIconCircle}>
              <CheckIconSVG />
            </View>
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Feedback Submitted</Text>
            <Text style={styles.confirmSubText}>
              Thank you for helping improve DECENT! Our support team (iputra07@gmail.com) has received your submission.
            </Text>
            <BouncyButton
              style={[styles.confirmDeleteBtn, { flex: 0, width: '100%', marginTop: 8 }]}
              onPress={() => setFeedbackSuccessModalVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.confirmDeleteText}>Continue</Text>
            </BouncyButton>
          </View>
        </View>
      </Modal>
  );
}

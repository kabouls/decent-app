import { ActivityIndicator, Dimensions, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hideScrollbarRefCallback } from '../ui/scroll.js';
import { useTheme } from '../theme.js';
import { RADIUS_6 } from '../theme/tokens.js';

export default function ChangelogModal({ app = {} }) {
  const { theme, themeMode } = useTheme();
  const { changelogEntries, changelogLoading, changelogModalVisible, contentModalWidth, headerBottomY, isWebWide, lightweightMode, setChangelogModalVisible, styles } = app;

  return (
<Modal
        animationType="none"
        transparent={true}
        visible={changelogModalVisible}
        onRequestClose={() => setChangelogModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, isWebWide ? { justifyContent: 'center', paddingHorizontal: 16 } : { justifyContent: 'flex-start', paddingTop: headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setChangelogModalVisible(false)}
        >
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
          <SafeAreaView style={[styles.overlayModalContainer, { height: isWebWide ? Math.min(640, Dimensions.get('window').height - 80) : Dimensions.get('window').height - headerBottomY - 40, ...(isWebWide ? { maxWidth: contentModalWidth } : {}) }]}
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={styles.modalTopBar}>
              <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>What's New</Text>
              <BouncyButton style={styles.closeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={() => setChangelogModalVisible(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            {changelogLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : changelogEntries.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>No updates logged yet.</Text>
              </View>
            ) : (
              <ScrollView ref={hideScrollbarRefCallback(isWebWide)} contentContainerStyle={{ padding: 16, gap: 14 }}>
                {changelogEntries.map((entry) => (
                  <View
                    key={entry.id}
                    style={{ borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 14 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {entry.version && (
                        <View style={{ backgroundColor: theme.bg, borderRadius: RADIUS_6, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700' }}>{entry.version}</Text>
                        </View>
                      )}
                      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                        {new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, marginBottom: entry.description ? 4 : 0 }}>
                      {entry.title}
                    </Text>
                    {entry.description && (
                      <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
                        {entry.description}
                      </Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
  );
}

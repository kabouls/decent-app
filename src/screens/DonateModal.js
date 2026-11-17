import { useEffect, useState } from 'react';
import { BlurView } from 'expo-blur';
import { BouncyButton } from '../ui/BouncyButton.js';
import { CheckIconSVG, DownloadIconSVG, EyeViewIconSVG, GlobeIconSVG, LocationPinSVG } from '../ui/icons.js';
import { Dimensions, Image, Modal, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme.js';
import { BRAND_DEEP, BRAND_MID, BRAND_PRIMARY, KOFI_PINK, WHITE, RADIUS_10, RADIUS_16, RADIUS_20, RADIUS_4, RADIUS_5, RADIUS_99 } from '../theme/tokens.js';

// Region choice survives reopen (the modal remounts each time it is shown).
let cachedDonateRegion = 'id';
let donateRegionDetected = false;
let donateRegionUserChanged = false;

export default function DonateModal({ app = {} }) {
  const { theme, themeMode } = useTheme();
  const { AnimatedPillTabs, KO_FI_URL, contentModalWidth, donateModalContext, handleCloseDonateModal, handleDownloadPendingExport, handleDownloadQrisCode, handleOpenLastExportedPdf, handleToggleHideDonationToday, headerBottomY, isWebWide, lastExportedPdf, lightweightMode, openExternalLinkWithWarning, pdfPendingExport, setActiveTool, setDonateModalVisible, setTermsModalVisible, setToolsInterstitialSlim, showAppAlert, styles, toolsHideDonationChecked, toolsInterstitialOfferCompress, toolsInterstitialSlim, toolsThemeMode } = app;

  const [donateRegion, setDonateRegion] = useState(cachedDonateRegion);
  const [donateTermsAgreed, setDonateTermsAgreed] = useState(false);

  // Best-effort, IP-based default for the region tab. Runs once per session and
  // never overrides a choice the person made themselves.
  useEffect(() => {
    if (donateRegionDetected) return;
    donateRegionDetected = true;
    let cancelled = false;
    fetch('https://ipapi.co/json/')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || donateRegionUserChanged) return;
        if (data && data.country_code && data.country_code !== 'ID') {
          cachedDonateRegion = 'intl';
          setDonateRegion('intl');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleDonateRegionChange = (key) => {
    donateRegionUserChanged = true;
    cachedDonateRegion = key;
    setDonateRegion(key);
  };


  return (
<Modal
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent={true}
        visible={true}
        onRequestClose={handleCloseDonateModal}
      >
        <View style={[styles.overlayModalBg, isWebWide ? { justifyContent: 'center', paddingHorizontal: 16 } : (donateModalContext === 'tools' && toolsInterstitialSlim ? { justifyContent: 'center', paddingHorizontal: 16, backgroundColor: 'transparent' } : { justifyContent: 'flex-start', paddingTop: headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' })]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={handleCloseDonateModal}
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
          <SafeAreaView style={[styles.overlayModalContainer, {
            // Slim mode (donation ask already dismissed for today, only
            // the one-line "thanks" + Download PDF button shows) sizes to
            // its actual content instead of the full interstitial's tall
            // fixed height - previously it kept the same screen-filling
            // height regardless, which left a large empty gap below the
            // button once there was barely any content left to fill it.
            height: (donateModalContext === 'tools' && toolsInterstitialSlim)
              ? undefined
              : (isWebWide ? Math.min(640, Dimensions.get('window').height - 80) : Dimensions.get('window').height - headerBottomY - 40),
            maxHeight: undefined,
            ...(isWebWide ? { maxWidth: contentModalWidth } : {})
          }]}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={styles.modalTopBar}>
              <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>
                {donateModalContext === 'tools' ? 'Thanks for Using Tools' : 'Support DECENT'}
              </Text>
              <BouncyButton style={styles.closeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={handleCloseDonateModal} accessibilityRole="button" accessibilityLabel="Close">
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            <View style={{ padding: 18, flex: 1 }}>
              <View style={{ flex: 1 }}>
                {donateModalContext === 'tools' && toolsInterstitialSlim ? (
                  // SLIM MODE - collapses the whole donation ask down to
                  // one line with an inline link back to the full version,
                  // once the user's said they don't want to see it today.
                  // Toggling this only ever changes THIS block's content -
                  // never a second Modal stacked on top of this one, which
                  // is exactly the kind of stacking bug the comment above
                  // this whole Modal already warns about (the interstitial
                  // once portalled behind Tools for the same reason).
                  <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18, marginBottom: 4 }}>
                    Thanks for using this tool - you can{' '}
                    <Text style={{ color: theme.accent, fontWeight: '700' }} onPress={() => setToolsInterstitialSlim(false)}>
                      donate here
                    </Text>
                    {' '}if it saved you some time.
                  </Text>
                ) : (
                <>
                <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18, marginBottom: 16 }}>
                  {donateModalContext === 'tools'
                    ? "This tool is completely free, with every feature included - no premium tier, no locked features, no account required. If it saved you some time, a donation helps keep it free for everyone."
                    : "Hi, I'm Iqbal — a UI/UX designer focused on Figma prototyping and clean handovers for HR and dev teams. I built DECENT to give designers a simple place to showcase real, interactive portfolios instead of static screenshots. If it's been useful to you, a donation helps keep it running and improving."}
                </Text>

                <AnimatedPillTabs
                  theme={theme}
                  themeMode={themeMode}
                  activeKey={donateRegion}
                  onChange={handleDonateRegionChange}
                  containerStyle={{ marginBottom: 16 }}
                  tabs={[
                    { key: 'id', label: 'Indonesia', icon: (color) => <LocationPinSVG color={color} /> },
                    { key: 'intl', label: 'International', icon: (color) => <GlobeIconSVG color={color} /> }
                  ]}
                />

                <BouncyButton
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}
                  onPress={() => setDonateTermsAgreed(!donateTermsAgreed)}
                  accessibilityRole="checkbox"
                  accessibilityLabel="I agree to the Terms of Service, donations are voluntary and non-refundable"
                  accessibilityState={{ checked: donateTermsAgreed }}
                >
                  <View style={{
                    width: 20, height: 20, borderRadius: RADIUS_5, marginTop: 1,
                    borderWidth: 1.5, borderColor: donateTermsAgreed ? (themeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : theme.border,
                    backgroundColor: donateTermsAgreed ? (themeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : 'transparent',
                    alignItems: 'center', justifyContent: 'center'
                  }}>
                    {donateTermsAgreed && <CheckIconSVG />}
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>
                    I agree to the{' '}
                    <Text style={{ color: theme.accent, fontWeight: '700' }} onPress={() => setTermsModalVisible(true)}>
                      Terms of Service
                    </Text>
                    {' '}— donations are voluntary and non-refundable.
                  </Text>
                </BouncyButton>

                {donateRegion === 'id' ? (
                  <View style={{ alignItems: 'center' }}>
                    <View style={{
                      width: 240, height: 240, borderRadius: RADIUS_16, borderWidth: 1, borderColor: theme.border,
                      backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden'
                    }}>
                      <Image
                        source={require('../../assets/qris-code.png')}
                        style={{ width: 230, height: 230 }}
                        resizeMode="contain"
                      />
                      {/* Blurred + gated behind the same Terms checkbox
                          above, until agreed - reusing donateTermsAgreed
                          rather than a separate flag, so there's exactly
                          one "have they agreed" source of truth for the
                          whole donate modal, not two that could disagree
                          with each other. BlurView is already a proven
                          dependency in this file (modal backdrops
                          elsewhere), not something new being introduced. */}
                      {!donateTermsAgreed && (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                          <BlurView
                            intensity={80}
                            tint={themeMode === 'light' ? 'light' : 'dark'}
                            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                          />
                          <BouncyButton
                            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}
                            onPress={() => {
                              showAppAlert('Agreement Required', 'Please check the box agreeing to the Terms of Service above to reveal the QR code.');
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Tap to Reveal QR Code"
                          >
                            <View style={{ width: 40, height: 40, borderRadius: RADIUS_20, backgroundColor: 'rgba(139,92,246,0.85)', alignItems: 'center', justifyContent: 'center' }}>
                              <EyeViewIconSVG color={WHITE} size={20} />
                            </View>
                            <Text style={{ color: WHITE, fontWeight: '700', fontSize: 12.5, textAlign: 'center' }}>
                              Tap to Reveal QR Code
                            </Text>
                          </BouncyButton>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
                      Scan with any e-wallet or mobile banking app that supports QRIS.
                    </Text>
                    <BouncyButton
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
                        borderRadius: RADIUS_10, borderWidth: 1, borderColor: theme.border,
                        opacity: donateTermsAgreed ? 1 : 0.4
                      }}
                      disabled={!donateTermsAgreed}
                      onPress={handleDownloadQrisCode}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !donateTermsAgreed }}
                    >
                      <DownloadIconSVG color={theme.accent} size={16} />
                      <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>Download QRIS</Text>
                    </BouncyButton>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <BouncyButton
                      style={styles.contrastDonateBtnFull}
                      activeOpacity={0.88}
                      onPress={() => {
                        if (!donateTermsAgreed) {
                          showAppAlert('Agreement Required', 'Please check the box agreeing to the Terms of Service before donating.');
                          return;
                        }
                        openExternalLinkWithWarning(KO_FI_URL);
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.contrastDonateBtnText}>Donate via Ko-fi</Text>
                    </BouncyButton>

                    {/* GitHub Sponsors - was a cross-origin <iframe> embed of
                        GitHub's own fixed-size button (114x32, no documented
                        style/color/width customization API at all, since we
                        only control the outer iframe box, not its internal
                        cross-origin rendering) - replaced with a plain
                        themed button instead, matching the Ko-fi button's
                        exact full-width/fill treatment, just linking out to
                        the Sponsors page directly. This also fully replaces
                        the earlier blur-overlay workaround (needed only
                        because a cross-origin iframe's internal clicks were
                        otherwise impossible to gate behind Terms agreement)
                        with the same simple disabled-button pattern Ko-fi
                        already uses. */}
                    <BouncyButton
                      style={[styles.contrastDonateBtnFull, { backgroundColor: KOFI_PINK }]}
                      activeOpacity={0.88}
                      onPress={() => {
                        if (!donateTermsAgreed) {
                          showAppAlert('Agreement Required', 'Please check the box agreeing to the Terms of Service before donating.');
                          return;
                        }
                        openExternalLinkWithWarning('https://github.com/sponsors/kabouls');
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.contrastDonateBtnText, { color: WHITE }]}>Sponsor on GitHub</Text>
                    </BouncyButton>
                  </View>
                )}
                </>
                )}

                {donateModalContext === 'tools' && (
                  <>
                    {toolsInterstitialOfferCompress && (
                      <BouncyButton
                        style={{ marginTop: 16, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS_99, borderWidth: 1, borderColor: theme.border }}
                        onPress={() => {
                          setDonateModalVisible(false);
                          setActiveTool('imageCompressor');
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: theme.accent, fontSize: 12.5, fontWeight: '700' }}>Want to compress this image too?</Text>
                      </BouncyButton>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
                      <BouncyButton onPress={handleCloseDonateModal} accessibilityRole="button">
                        <Text style={{ color: theme.textSecondary, fontSize: 12.5, fontWeight: '600' }}>Dismiss</Text>
                      </BouncyButton>
                      {/* Only meaningful while donation content is actually
                          showing - slim mode has already made this choice
                          for THIS viewing, so there's nothing to toggle
                          here in that state. Checking this doesn't change
                          what's currently on screen - it only affects the
                          next time this interstitial opens. */}
                      {!toolsInterstitialSlim && (
                        <BouncyButton
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                          onPress={() => handleToggleHideDonationToday(!toolsHideDonationChecked)}
                          accessibilityRole="checkbox"
                          accessibilityLabel="Don't show donation again today"
                          accessibilityState={{ checked: toolsHideDonationChecked }}
                        >
                          <View style={{
                            width: 16, height: 16, borderRadius: RADIUS_4, borderWidth: 1.5,
                            borderColor: toolsHideDonationChecked ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : theme.border,
                            backgroundColor: toolsHideDonationChecked ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : 'transparent',
                            alignItems: 'center', justifyContent: 'center'
                          }}>
                            {toolsHideDonationChecked && <Text style={{ color: WHITE, fontSize: 11, fontWeight: '800', lineHeight: 12 }}>✓</Text>}
                          </View>
                          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>Don't show donation again today</Text>
                        </BouncyButton>
                      )}
                    </View>
                    {/* Nothing has actually downloaded/saved yet at this
                        point - Export only ever assembles the file and
                        gets here; "Download PDF" is what triggers the
                        real save, and only once that's done does "Open
                        PDF" appear as a second, separate explicit
                        action. Dismissing without pressing either one
                        means nothing gets saved. */}
                    {pdfPendingExport && (
                      <BouncyButton
                        style={{
                          marginTop: 'auto', width: '100%', paddingVertical: 12, borderRadius: RADIUS_99, alignItems: 'center',
                          backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID
                        }}
                        onPress={handleDownloadPendingExport}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: WHITE, fontSize: 13.5, fontWeight: '700' }}>
                          Download PDF{pdfPendingExport.length > 1 ? 's' : ''}
                        </Text>
                      </BouncyButton>
                    )}
                    {!pdfPendingExport && lastExportedPdf && (
                      <BouncyButton
                        style={{
                          marginTop: 'auto', width: '100%', paddingVertical: 12, borderRadius: RADIUS_99, alignItems: 'center',
                          backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID
                        }}
                        onPress={handleOpenLastExportedPdf}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: WHITE, fontSize: 13.5, fontWeight: '700' }}>Open PDF</Text>
                      </BouncyButton>
                    )}
                  </>
                )}
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
  );
}

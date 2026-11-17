import React from 'react';
import { ActivityIndicator, Dimensions, Image, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { BouncyButton } from '../ui/BouncyButton.js';
import { CheckIconSVG, ChevronLeftSVG } from '../ui/icons.js';
import { WebView as NativeWebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BLACK_SOLID, SUCCESS, SKY_400_2, BRAND_DEEP, BRAND_MID, BRAND_PRIMARY, TEXT_SECONDARY, PINK_400_3, DANGER, WARNING, TEXT_PRIMARY, WHITE, RADIUS_10, RADIUS_12, RADIUS_14, RADIUS_16, RADIUS_2, RADIUS_3, RADIUS_44, RADIUS_5, RADIUS_6, RADIUS_8, RADIUS_9, RADIUS_99 } from '../theme/tokens.js';

export default function ToolsScreen({ app = {} }) {
  const { ALL_TOOLS_LIST, AppKeyboardAwareScrollView, ArrowRightIconSVG, BetaTag, ChevronDownSVG, ChevronRightSVG, ChevronUpSVG, CompressIconSVG, DecentLogoSVG, FocusableTextInput, ImageIconSVG, MoreIconSVG, PDF_LARGE_UPLOAD_WARN_BYTES, PDF_NATIVE_GRID_PREVIEW_MAX_PAGES, PdfGridCardPreview, PdfIconSVG, QrIconSVG, RESUME_COMMON_SKILLS, ResumeIconSVG, RevertIconSVG, RotateCCWIconSVG, RotateCWIconSVG, RotateIconSVG, SwapIconSVG, ToolsQRCode, TrashIconSVG, activePdfContainer, activeTool, addResumeEducation, addResumeExperience, addResumeSkill, buildResumeHtml, cancelActivePdfEditorFlow, cancelContainerSelectFlow, compressOneFile, compressorAdvancedOpen, compressorFiles, compressorFormat, compressorLockAspect, compressorMaxHeight, compressorMaxWidth, compressorPanResponder, compressorProcessing, compressorReferenceKB, compressorSizePercentage, compressorSliderWidthRef, compressorTargetKB, containerPages, convertOneFile, converterFiles, converterFormat, converterProcessing, currentQrValue, editPdfWatermark, formatBytes, generateResumeDecentQr, handleAddPageNumbers, handleDownloadAllCompressed, handleDownloadAllConverted, handleDownloadQrPng, handleDownloadQrSvg, handleExportPdf, handleExportResume, handleExtractPage, handleLeaveTools, handleSingleCompressedDownload, handleSingleConvertedDownload, handleUndoPdfEdit, isPdfCompressActive, isPdfPageNumbersActive, isPdfWatermarkActive, isWebWide, mergeContainers, nativeQrCaptureRef, nativeQrCaptureRequest, openMediaViewer, openQrGeneratorForResume, pdfActivePageId, pdfBusyLabel, pdfBusyPercent, pdfCompressProgress, pdfCompressing, pdfContainerSelectModeTool, pdfContainers, pdfDragIndex, pdfEditorHasPendingChanges, pdfEditorLoading, pdfFullscreenHighResCache, pdfFullscreenHighResLoading, pdfMoreToolsButtonRef, pdfSelectModeTool, pdfSelectedContainerIds, pdfSelectedPageIds, pickCompressorImages, pickConverterFiles, pickConverterImages, pickPdfEditorImages, pickPdfEditorPdfs, pickQrLogo, pickResumePhoto, pickResumeQrUpload, qrAdvancedOpen, qrBackgroundColor, qrColor, qrContentType, qrDotStyle, qrExporting, qrFields, qrGeneratorReturnToResume, qrLogoUri, removeCompressorFile, removeConverterFile, removePdfEditorPage, removeResumeEducation, removeResumeExperience, removeResumeSkill, renderPdfReorderPill, reorderPdfEditorPages, requestSwitchTool, resumeData, resumeExporting, resumePreviewModalVisible, resumeQrGenerating, resumeSkillInput, resumeWizardStep, rotatePdfEditorPage, runCompressorBatch, runConverterBatch, session, setActiveTool, setClearFilesConfirmTarget, setCompressorAdvancedOpen, setCompressorFormat, setCompressorLockAspect, setCompressorMaxHeight, setCompressorMaxWidth, setCompressorSizeFromPercentage, setCompressorTargetKB, setConverterFormat, setPdfActiveContainerId, setPdfActivePageId, setPdfAddPageAfterIndex, setPdfAddPageMenuVisible, setPdfClearConfirmVisible, setPdfCompressOptionsVisible, setPdfCompressUndoConfirmVisible, setPdfDragIndex, setPdfFullscreenIndex, setPdfMoreToolsMenuPosition, setPdfMoreToolsMenuVisible, setPdfPageNumbersUndoConfirmVisible, setPdfSelectModeTool, setPdfSelectedPageIds, setPdfTabCloseConfirmId, setQrAdvancedOpen, setQrBackgroundColor, setQrColor, setQrContentType, setQrDotStyle, setQrFields, setQrGeneratorReturnToResume, setQrLogoUri, setResumeData, setResumePreviewModalVisible, setResumeSkillInput, setResumeWizardStep, setToolsMenuVisible, showAppAlert, startContainerSelectFlow, startPdfCropQueue, startSinglePageCrop, styles, toggleContainerSelected, togglePdfPageSelected, toolsQrExportRef, toolsTheme, toolsThemeMode, tt, undoSpecificPdfEdit, updateResumeEducation, updateResumeExperience, updateResumeField, updateResumeLink, useGeneratedQrForResume, userProfile } = app;

  return (
<Modal
          animationType={Platform.OS === 'web' ? 'none' : 'slide'}
          transparent={false}
          visible={true}
          onRequestClose={() => {
            if (cancelActivePdfEditorFlow()) return;
            if (activeTool !== 'hub') requestSwitchTool('hub');
            else handleLeaveTools();
          }}
        >
          <SafeAreaView style={[
            { flex: 1, backgroundColor: toolsTheme.bg },
            // Tools is built almost entirely with inline style={{...}}
            // objects rather than the shared getStyles() stylesheet, so
            // the app's normal font injection (which only reaches
            // styles.xxx-referenced styles - see the b593 comment near
            // getStyles) never touches it, and it was quietly rendering
            // in the browser's default sans-serif instead of Inter. Web
            // only: RN Text elements that don't set their own fontFamily
            // inherit this via ordinary CSS cascade, so nothing needs
            // touching per-component. This can't reach native (no CSS
            // inheritance there) and won't get every weight pixel-exact
            // on web either - bold text still renders as a synthetic
            // bold on the regular cut rather than Inter's true
            // semibold/bold files, since each Text's own inline
            // fontWeight isn't being remapped to the matching named
            // family the way getStyles does. Real fix for that is the
            // same per-style remap getStyles already does, just applied
            // to Tools' inline styles specifically - out of scope for a
            // single pass given how many there are.
            Platform.OS === 'web' && { fontFamily: 'Inter_400Regular' }
          ]}>
            {Platform.OS === 'web' ? (
              <>
                {/* WEB - genuine page-style header, not a modal chrome.
                    "Back to DECENT" always exits Tools entirely (same
                    action the ✕ used to do) - the hub<->tool navigation
                    lives in its own breadcrumb row below instead, so the
                    two navigation levels don't get conflated into one
                    button. */}
                <View style={[
                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: toolsTheme.bg },
                  isWebWide && { paddingHorizontal: 32 }
                ]}>
                  <BouncyButton
                    style={isWebWide ? {
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS_12,
                      borderWidth: 1, borderColor: toolsTheme.border, backgroundColor: 'transparent'
                    } : { padding: 6 }}
                    onPress={handleLeaveTools}
                    accessibilityRole="button"
                    accessibilityLabel="Back to DECENT"
                  >
                    {!isWebWide && <ChevronLeftSVG color={toolsThemeMode === 'light' ? BRAND_DEEP : TEXT_PRIMARY} size={22} />}
                    {isWebWide && <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '600' }}>Back to DECENT</Text>}
                  </BouncyButton>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                    <View style={{ width: 20, height: 20, borderRadius: RADIUS_6, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <DecentLogoSVG size={15} />
                    </View>
                    <Text style={{ color: toolsTheme.text, fontSize: isWebWide ? 18 : 15, fontWeight: '800' }}>ECENT Tools</Text>
                    <BetaTag themeMode={toolsThemeMode} />
                  </View>

                  <BouncyButton
                    style={{ padding: 6 }}
                    onPress={() => setToolsMenuVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="More options"
                  >
                    <MoreIconSVG color={toolsTheme.textSecondary} size={18} />
                  </BouncyButton>
                </View>

                {activeTool !== 'hub' && (
                  <View style={[
                    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: toolsTheme.bg },
                    isWebWide && { maxWidth: 1400, width: '100%', alignSelf: 'center' }
                  ]}>
                    <BouncyButton
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      onPress={() => requestSwitchTool('hub')}
                      accessibilityRole="button"
                      accessibilityLabel="Back to Tools"
                    >
                      <ChevronLeftSVG color={toolsTheme.textSecondary} size={14} />
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, fontWeight: '600' }}>{tt('tools')}</Text>
                    </BouncyButton>
                    <Text style={{ color: toolsTheme.textSecondary, fontSize: 12 }}>/</Text>
                    <Text style={{ color: toolsTheme.text, fontSize: 15, fontWeight: '800' }}>
                      {activeTool === 'imageCompressor' ? tt('imageCompressor') : activeTool === 'qrGenerator' ? tt('qrGenerator') : activeTool === 'imageConverter' ? tt('imageConverter') : activeTool === 'resumeMaker' ? tt('resumeMaker') : tt('pdfEditor')}
                    </Text>
                    {activeTool === 'pdfEditor' && pdfContainers.length > 0 && (
                      <BouncyButton
                        style={{
                          marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingVertical: 6, paddingHorizontal: 14, borderRadius: RADIUS_99,
                          backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                          opacity: pdfBusyLabel ? 0.6 : 1
                        }}
                        onPress={handleExportPdf}
                        disabled={!!pdfBusyLabel}
                        accessibilityRole="button"
                        accessibilityLabel="Export"
                        accessibilityState={{ disabled: !!pdfBusyLabel, busy: !!pdfBusyLabel }}
                      >
                        {pdfBusyLabel ? (
                          <><ActivityIndicator color={WHITE} size="small" /><Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>{pdfBusyLabel}{pdfBusyPercent != null ? ` ${pdfBusyPercent}%` : ''}</Text></>
                        ) : (
                          <><Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>{tt('exportPdf')}</Text><ArrowRightIconSVG size={13} color={WHITE} /></>
                        )}
                      </BouncyButton>
                    )}
                  </View>
                )}

              </>
            ) : (
              <>
                {/* NATIVE - existing modal-style header, unchanged in
                    structure (back-within-tools / centered tool name /
                    close). The "fully separate page" treatment above is
                    explicitly a web-only request. */}
                <View style={[styles.modalTopBar, { backgroundColor: toolsTheme.surface, borderBottomColor: toolsTheme.border }]}>
                  {activeTool !== 'hub' ? (
                    <BouncyButton
                      style={{ padding: 4 }}
                      onPress={() => requestSwitchTool('hub')}
                      accessibilityRole="button"
                      accessibilityLabel="Back"
                    >
                      <ChevronLeftSVG color={toolsThemeMode === 'light' ? BRAND_DEEP : TEXT_PRIMARY} size={22} />
                    </BouncyButton>
                  ) : <View style={{ width: 30 }} />}
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <View style={{ width: 20, height: 20, borderRadius: RADIUS_6, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <DecentLogoSVG size={15} />
                    </View>
                    <Text style={{ color: toolsTheme.text, fontSize: 15, fontWeight: '800' }}>ECENT Tools</Text>
                    <BetaTag themeMode={toolsThemeMode} />
                  </View>
                  <BouncyButton
                    style={{ padding: 6, marginRight: 4 }}
                    onPress={() => setToolsMenuVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="More options"
                  >
                    <MoreIconSVG color={toolsTheme.textSecondary} size={18} />
                  </BouncyButton>
                  <BouncyButton
                    style={[styles.closeBtn, { backgroundColor: toolsTheme.bg, borderColor: toolsTheme.border }]}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    onPress={handleLeaveTools}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Text style={[styles.closeBtnText, { color: toolsTheme.text }]}>✕</Text>
                  </BouncyButton>
                </View>

                {activeTool !== 'hub' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: toolsTheme.bg }}>
                    <Text style={{ color: toolsTheme.text, fontSize: 17, fontWeight: '800' }}>
                      {activeTool === 'imageCompressor' ? tt('imageCompressor') : activeTool === 'qrGenerator' ? tt('qrGenerator') : activeTool === 'imageConverter' ? tt('imageConverter') : activeTool === 'resumeMaker' ? tt('resumeMaker') : tt('pdfEditor')}
                    </Text>
                    {activeTool === 'pdfEditor' && pdfContainers.length > 0 && (
                      <BouncyButton
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingVertical: 6, paddingHorizontal: 14, borderRadius: RADIUS_99,
                          backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                          opacity: pdfBusyLabel ? 0.6 : 1
                        }}
                        onPress={handleExportPdf}
                        disabled={!!pdfBusyLabel}
                        accessibilityRole="button"
                        accessibilityLabel="Export"
                        accessibilityState={{ disabled: !!pdfBusyLabel, busy: !!pdfBusyLabel }}
                      >
                        {pdfBusyLabel ? (
                          <><ActivityIndicator color={WHITE} size="small" /><Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>{pdfBusyLabel}{pdfBusyPercent != null ? ` ${pdfBusyPercent}%` : ''}</Text></>
                        ) : (
                          <><Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>{tt('exportPdf')}</Text><ArrowRightIconSVG size={13} color={WHITE} /></>
                        )}
                      </BouncyButton>
                    )}
                  </View>
                )}
              </>
            )}

            <AppKeyboardAwareScrollView
              contentContainerStyle={[
                { padding: 20, gap: 14 },
                activeTool === 'imageCompressor' && compressorFiles.length > 0 && !isWebWide && { paddingBottom: 90 },
                isWebWide && { maxWidth: 1400, width: '100%', alignSelf: 'center' }
              ]}
              enableOnAndroid={true}
              extraScrollHeight={140}
              keyboardShouldPersistTaps="handled"
            >
              {activeTool === 'hub' && (
                <>
                  <Text style={{ color: toolsTheme.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 4 }}>
                    {tt('toolsHubIntro')}
                  </Text>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
                    <BouncyButton
                      style={[
                        {
                          flexDirection: 'row', alignItems: 'center', gap: 14,
                          backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                          borderRadius: RADIUS_16, padding: 16
                        },
                        isWebWide ? { width: '48.5%' } : { width: '100%' }
                      ]}
                      onPress={() => requestSwitchTool('imageCompressor')}
                      accessibilityRole="button"
                    >
                      <View style={{ width: 44, height: 44, borderRadius: RADIUS_12, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIconSVG size={22} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 15, fontWeight: '700' }}>{tt('imageCompressor')}</Text>
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, marginTop: 2 }}>{tt('imageCompressorDesc')}</Text>
                      </View>
                      <ChevronRightSVG color={toolsTheme.accent} size={18} />
                    </BouncyButton>

                    <BouncyButton
                      style={[
                        {
                          flexDirection: 'row', alignItems: 'center', gap: 14,
                          backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                          borderRadius: RADIUS_16, padding: 16
                        },
                        isWebWide ? { width: '48.5%' } : { width: '100%' }
                      ]}
                      onPress={() => requestSwitchTool('qrGenerator')}
                      accessibilityRole="button"
                    >
                      <View style={{ width: 44, height: 44, borderRadius: RADIUS_12, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <QrIconSVG size={22} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 15, fontWeight: '700' }}>{tt('qrGenerator')}</Text>
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, marginTop: 2 }}>{tt('qrGeneratorDesc')}</Text>
                      </View>
                      <ChevronRightSVG color={toolsTheme.accent} size={18} />
                    </BouncyButton>

                    <BouncyButton
                      style={[
                        {
                          flexDirection: 'row', alignItems: 'center', gap: 14,
                          backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                          borderRadius: RADIUS_16, padding: 16
                        },
                        isWebWide ? { width: '48.5%' } : { width: '100%' }
                      ]}
                      onPress={() => requestSwitchTool('imageConverter')}
                      accessibilityRole="button"
                    >
                      <View style={{ width: 44, height: 44, borderRadius: RADIUS_12, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <SwapIconSVG size={22} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 15, fontWeight: '700' }}>{tt('imageConverter')}</Text>
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, marginTop: 2 }}>{tt('imageConverterDesc')}</Text>
                      </View>
                      <ChevronRightSVG color={toolsTheme.accent} size={18} />
                    </BouncyButton>

                    <BouncyButton
                      style={[
                        {
                          flexDirection: 'row', alignItems: 'center', gap: 14,
                          backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                          borderRadius: RADIUS_16, padding: 16
                        },
                        isWebWide ? { width: '48.5%' } : { width: '100%' }
                      ]}
                      onPress={() => requestSwitchTool('pdfEditor')}
                      accessibilityRole="button"
                    >
                      <View style={{ width: 44, height: 44, borderRadius: RADIUS_12, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <PdfIconSVG size={22} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 15, fontWeight: '700' }}>{tt('pdfEditor')}</Text>
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, marginTop: 2 }}>{tt('pdfEditorDesc')}</Text>
                      </View>
                      <ChevronRightSVG color={toolsTheme.accent} size={18} />
                    </BouncyButton>

                    <BouncyButton
                      style={[
                        {
                          flexDirection: 'row', alignItems: 'center', gap: 14,
                          backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                          borderRadius: RADIUS_16, padding: 16
                        },
                        isWebWide ? { width: '48.5%' } : { width: '100%' }
                      ]}
                      onPress={() => requestSwitchTool('resumeMaker')}
                      accessibilityRole="button"
                    >
                      <View style={{ width: 44, height: 44, borderRadius: RADIUS_12, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <ResumeIconSVG size={22} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 15, fontWeight: '700' }}>{tt('resumeMaker')}</Text>
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, marginTop: 2 }}>{tt('resumeMakerDesc')}</Text>
                      </View>
                      <ChevronRightSVG color={toolsTheme.accent} size={18} />
                    </BouncyButton>
                  </View>
                </>
              )}

              {activeTool === 'imageCompressor' && (
                <View style={{ gap: 20 }}>
                <View style={[{ gap: 14 }, isWebWide && { flexDirection: 'row', alignItems: 'flex-start', gap: 24 }]}>
                  <View style={{ gap: 14, flex: isWebWide ? 1 : undefined }}>
                  <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                    {tt('compressorIntro')}
                  </Text>

                  <Text style={styles.formGroupLabel}>{tt('targetFileSize')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                    {[100, 200, 500, 1024].map((kb) => (
                      <BouncyButton
                        key={kb}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS_99,
                          backgroundColor: Number(compressorTargetKB) === kb ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID) : toolsTheme.surface,
                          borderWidth: 1, borderColor: Number(compressorTargetKB) === kb ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border
                        }}
                        onPress={() => setCompressorTargetKB(kb)}
                        accessibilityRole="button"
                        accessibilityLabel={kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
                        accessibilityState={{ selected: Number(compressorTargetKB) === kb }}
                      >
                        <Text style={{ color: Number(compressorTargetKB) === kb ? WHITE : toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>
                          {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
                        </Text>
                      </BouncyButton>
                    ))}
                  </View>
                  <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>{tt('customSizeLabel')}</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder={tt('customSizePlaceholder')}
                    placeholderTextColor={TEXT_SECONDARY}
                    value={String(compressorTargetKB)}
                    onChangeText={(t) => setCompressorTargetKB(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    accessibilityLabel="Custom target file size in KB"
                  />

                  <View style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                        {compressorSizePercentage}% {tt('ofOriginal')}
                      </Text>
                      {compressorReferenceKB ? (
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 11 }}>
                          ≈ {Math.round(compressorReferenceKB * (compressorSizePercentage / 100))} KB
                        </Text>
                      ) : (
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, fontStyle: 'italic' }}>{tt('addImagesForPreview')}</Text>
                      )}
                    </View>
                    {Platform.OS === 'web' ? (
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={compressorSizePercentage}
                        onChange={(e) => setCompressorSizeFromPercentage(Number(e.target.value))}
                        style={{ width: '100%', accentColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY }}
                        aria-label="Target size percentage"
                      />
                    ) : (
                      <View
                        onLayout={(e) => { compressorSliderWidthRef.current = e.nativeEvent.layout.width; }}
                        style={{ height: 26, justifyContent: 'center' }}
                        accessibilityRole="adjustable"
                        accessibilityLabel="Target size percentage"
                        accessibilityValue={{ min: 0, max: 100, now: compressorSizePercentage }}
                        {...compressorPanResponder.panHandlers}
                      >
                        <View style={{ height: 6, borderRadius: RADIUS_3, backgroundColor: toolsTheme.border }} />
                        <View style={{
                          position: 'absolute', left: 0, height: 6, borderRadius: RADIUS_3,
                          width: `${compressorSizePercentage}%`,
                          backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY
                        }} />
                        <View style={{
                          position: 'absolute', left: `${compressorSizePercentage}%`, marginLeft: -10,
                          width: 20, height: 20, borderRadius: RADIUS_10,
                          backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY
                        }} />
                      </View>
                    )}
                  </View>

                  <View style={{
                    backgroundColor: toolsThemeMode === 'light' ? 'rgba(109,40,217,0.06)' : 'rgba(125,82,221,0.10)',
                    borderRadius: RADIUS_12, overflow: 'hidden', marginTop: 14
                  }}>
                    <BouncyButton
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 }}
                      onPress={() => setCompressorAdvancedOpen((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel="Advanced options"
                      accessibilityState={{ expanded: compressorAdvancedOpen }}
                    >
                      <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>{tt('advanced')}</Text>
                      {compressorAdvancedOpen ? <ChevronUpSVG color={toolsTheme.textSecondary} size={16} /> : <ChevronDownSVG color={toolsTheme.textSecondary} size={16} />}
                    </BouncyButton>

                    {compressorAdvancedOpen && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                      <Text style={styles.formGroupLabel}>{tt('maxDimensions')}</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <FocusableTextInput
                          style={[styles.formInput, { flex: 1 }]}
                          placeholder={tt('maxWidthPlaceholder')}
                          placeholderTextColor={TEXT_SECONDARY}
                          value={compressorMaxWidth}
                          onChangeText={(t) => setCompressorMaxWidth(t.replace(/[^0-9]/g, ''))}
                          keyboardType="number-pad"
                          accessibilityLabel="Max width in pixels"
                        />
                        {!compressorLockAspect && (
                          <FocusableTextInput
                            style={[styles.formInput, { flex: 1 }]}
                            placeholder={tt('maxHeightPlaceholder')}
                            placeholderTextColor={TEXT_SECONDARY}
                            value={compressorMaxHeight}
                            onChangeText={(t) => setCompressorMaxHeight(t.replace(/[^0-9]/g, ''))}
                            keyboardType="number-pad"
                            accessibilityLabel="Max height in pixels"
                          />
                        )}
                      </View>
                      <BouncyButton
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        onPress={() => setCompressorLockAspect((v) => !v)}
                        accessibilityRole="checkbox"
                        accessibilityLabel="Lock aspect ratio"
                        accessibilityState={{ checked: compressorLockAspect }}
                      >
                        <View style={{
                          width: 18, height: 18, borderRadius: RADIUS_5, alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1.5, borderColor: compressorLockAspect ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border,
                          backgroundColor: compressorLockAspect ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID) : 'transparent'
                        }}>
                          {compressorLockAspect && <CheckIconSVG color={WHITE} />}
                        </View>
                        <Text style={{ color: toolsTheme.text, fontSize: 13 }}>{tt('lockAspectRatio')}</Text>
                      </BouncyButton>

                      <Text style={styles.formGroupLabel}>{tt('outputFormat')}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {[{ key: 'ORIGINAL', label: tt('keepOriginal') }, { key: 'JPEG', label: 'JPEG' }, { key: 'PNG', label: 'PNG' }, { key: 'WEBP', label: 'WEBP' }].map((fmt) => (
                          <BouncyButton
                            key={fmt.key}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS_99,
                              backgroundColor: compressorFormat === fmt.key ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID) : toolsTheme.bg,
                              borderWidth: 1, borderColor: compressorFormat === fmt.key ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border
                            }}
                            onPress={() => setCompressorFormat(fmt.key)}
                            accessibilityRole="button"
                            accessibilityLabel={fmt.label}
                            accessibilityState={{ selected: compressorFormat === fmt.key }}
                          >
                            <Text style={{ color: compressorFormat === fmt.key ? WHITE : toolsTheme.text, fontSize: 12, fontWeight: '700' }}>{fmt.label}</Text>
                          </BouncyButton>
                        ))}
                      </View>
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, lineHeight: 15 }}>
                        {tt('formatNote')}
                      </Text>
                    </View>
                    )}
                  </View>

                  {!isWebWide && (
                  <BouncyButton
                    style={{
                      marginTop: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: toolsTheme.border,
                      borderRadius: RADIUS_14, padding: 20, alignItems: 'center', gap: 8
                    }}
                    onPress={pickCompressorImages}
                    accessibilityRole="button"
                  >
                    <ImageIconSVG size={26} color={toolsTheme.textSecondary} />
                    <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>
                      {compressorFiles.length === 0 ? tt('chooseImages') : tt('addMoreImages')}
                    </Text>
                    <Text style={{ color: toolsTheme.textSecondary, fontSize: 11 }}>{tt('upTo10')}</Text>
                  </BouncyButton>
                  )}
                  </View>

                  <View style={{ gap: 14, flex: isWebWide ? 1 : undefined }}>
                  {isWebWide && (
                  <BouncyButton
                    style={{
                      backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                      borderRadius: RADIUS_14, padding: 20, alignItems: 'center', gap: 8
                    }}
                    onPress={pickCompressorImages}
                    accessibilityRole="button"
                  >
                    <ImageIconSVG size={26} color={WHITE} />
                    <Text style={{ color: WHITE, fontSize: 13, fontWeight: '700' }}>
                      {compressorFiles.length === 0 ? tt('chooseImages') : tt('addMoreImages')}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{tt('upTo10')}</Text>
                  </BouncyButton>
                  )}

                  {isWebWide && compressorFiles.length === 0 && (
                    <View style={{
                      flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 10,
                      borderWidth: 1.5, borderStyle: 'dashed', borderColor: toolsTheme.border, borderRadius: RADIUS_14, padding: 40
                    }}>
                      <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>{tt('nothingHereYet')}</Text>
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, textAlign: 'center' }}>{tt('addFilesToStart')}</Text>
                    </View>
                  )}

                  {compressorFiles.length > 0 && (
                    <BouncyButton
                      style={{ alignSelf: 'flex-start', marginTop: 4 }}
                      onPress={() => setClearFilesConfirmTarget('compressor')}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: DANGER, fontSize: 12, fontWeight: '600' }}>{tt('clearAll')}</Text>
                    </BouncyButton>
                  )}

                  {compressorFiles.map((file, fileIndex) => (
                    <View key={file.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: toolsTheme.surface, borderRadius: RADIUS_12, padding: 10 }}>
                      <BouncyButton
                        onPress={() => openMediaViewer(compressorFiles.map((f) => ({ type: 'image', uri: f.originalUri })), fileIndex)}
                        accessibilityRole="button"
                        accessibilityLabel="View image"
                      >
                        <Image source={{ uri: file.originalUri }} style={{ width: 48, height: 48, borderRadius: RADIUS_8 }} />
                      </BouncyButton>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 11 }}>
                          {tt('original')}: {(file.originalSize / 1024).toFixed(0)} KB
                        </Text>
                        {file.status === 'processing' && (
                          <Text style={{ color: toolsTheme.accent, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{tt('compressing')}</Text>
                        )}
                        {file.status === 'done' && (
                          <Text style={{ color: SUCCESS, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                            {(file.resultSize / 1024).toFixed(0)} KB {!file.hitTarget && `(${tt('closestPossible')})`}
                          </Text>
                        )}
                        {file.status === 'error' && (
                          <Text style={{ color: DANGER, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{file.error}</Text>
                        )}
                        {file.status === 'pending' && (
                          <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, marginTop: 2 }}>{tt('waitingToCompress')}</Text>
                        )}
                      </View>
                      {file.status === 'done' ? (
                        <BouncyButton
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                          onPress={() => handleSingleCompressedDownload(file)}
                          accessibilityRole="button"
                          accessibilityLabel="Download"
                        >
                          <Text style={{ color: toolsTheme.accent, fontSize: 11, fontWeight: '700' }}>{tt('download')}</Text>
                          <ArrowRightIconSVG size={11} color={toolsTheme.accent} />
                        </BouncyButton>
                      ) : file.status === 'processing' ? (
                        <ActivityIndicator color={toolsTheme.accent} size="small" />
                      ) : (
                        <>
                          <BouncyButton
                            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS_99, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID }}
                            onPress={() => compressOneFile(file)}
                            accessibilityRole="button"
                            accessibilityLabel="Compress this image"
                          >
                            <Text style={{ color: WHITE, fontSize: 11, fontWeight: '700' }}>{tt('compress')}</Text>
                          </BouncyButton>
                          <BouncyButton style={{ padding: 6 }} onPress={() => removeCompressorFile(file.id)} accessibilityRole="button" accessibilityLabel="Remove">
                            <TrashIconSVG />
                          </BouncyButton>
                        </>
                      )}
                    </View>
                  ))}

                  {isWebWide && compressorFiles.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <BouncyButton
                        style={[styles.saveAccountSettingsBtn, { flex: 1, marginTop: 0, opacity: compressorProcessing ? 0.6 : 1 }]}
                        onPress={runCompressorBatch}
                        disabled={compressorProcessing || !compressorFiles.some((f) => f.status === 'pending' || f.status === 'error')}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: compressorProcessing, busy: compressorProcessing }}
                      >
                        <Text style={styles.submitBtnText}>{compressorProcessing ? tt('compressing') : tt('compressAll')}</Text>
                      </BouncyButton>
                      <BouncyButton
                        style={[
                          styles.saveAccountSettingsBtn,
                          { flex: 1, marginTop: 0, backgroundColor: toolsTheme.bg, borderWidth: 1, borderColor: toolsTheme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
                          !compressorFiles.every((f) => f.status === 'done') && { opacity: 0.4 }
                        ]}
                        onPress={handleDownloadAllCompressed}
                        disabled={!compressorFiles.every((f) => f.status === 'done')}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !compressorFiles.every((f) => f.status === 'done') }}
                      >
                        <><Text style={[styles.submitBtnText, { color: toolsTheme.text }]}>{tt('downloadAll')}</Text><ArrowRightIconSVG size={13} color={toolsTheme.text} /></>
                      </BouncyButton>
                    </View>
                  )}
                  </View>
                </View>

                {isWebWide && (
                  <View>
                    <View style={{ height: 1, backgroundColor: toolsTheme.border, marginBottom: 20 }} />
                    <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                      {tt('moreTools')}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                      {ALL_TOOLS_LIST.filter((t) => t.key !== 'imageCompressor').map(({ key, label, Icon }) => (
                        <BouncyButton
                          key={key}
                          style={{
                            alignItems: 'center', gap: 8, width: '23%',
                            backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                            borderRadius: RADIUS_14, padding: 14
                          }}
                          onPress={() => requestSwitchTool(key)}
                          accessibilityRole="button"
                        >
                          <View style={{ width: 36, height: 36, borderRadius: RADIUS_10, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={18} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                          </View>
                          <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
                        </BouncyButton>
                      ))}
                    </View>
                  </View>
                )}
                </View>
              )}

              {activeTool === 'qrGenerator' && (() => {
                const previewBlock = (
                  <>
                  {!!currentQrValue() ? (
                    <View style={{ alignItems: 'center', marginVertical: 14, gap: 6 }}>
                      <View style={{ padding: 16, backgroundColor: WHITE, borderRadius: RADIUS_16 }}>
                        <ToolsQRCode
                          ref={toolsQrExportRef}
                          value={currentQrValue()}
                          size={220}
                          color={qrColor || BLACK_SOLID}
                          backgroundColor={qrBackgroundColor || WHITE}
                          dotStyle={qrDotStyle}
                          logoUri={qrLogoUri}
                        />
                      </View>
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, fontStyle: 'italic', textAlign: 'center' }}>
                        {tt('qrScanCaution')}
                      </Text>
                    </View>
                  ) : isWebWide && (
                    <View style={{
                      alignItems: 'center', justifyContent: 'center', marginVertical: 14, gap: 10,
                      minHeight: 252, borderWidth: 1.5, borderStyle: 'dashed', borderColor: toolsTheme.border,
                      borderRadius: RADIUS_16, padding: 40
                    }}>
                      <QrIconSVG size={36} color={toolsTheme.textSecondary} />
                      <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{tt('qrWillAppearHere')}</Text>
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, textAlign: 'center' }}>{tt('fillInDetailsToStart')}</Text>
                    </View>
                  )}
                  </>
                );

                const formFieldsBlock = (
                  <>
                  <Text style={styles.formGroupLabel}>{tt('contentType')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[
                      { key: 'url', label: 'URL' },
                      { key: 'text', label: 'Text' },
                      { key: 'wifi', label: 'WiFi' },
                      { key: 'vcard', label: 'Contact Card' },
                      { key: 'email', label: 'Email' }
                    ].map((t) => (
                      <BouncyButton
                        key={t.key}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS_99,
                          backgroundColor: qrContentType === t.key ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID) : toolsTheme.surface,
                          borderWidth: 1, borderColor: qrContentType === t.key ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border
                        }}
                        onPress={() => { setQrContentType(t.key); setQrFields({}); }}
                        accessibilityRole="button"
                        accessibilityLabel={t.label}
                        accessibilityState={{ selected: qrContentType === t.key }}
                      >
                        <Text style={{ color: qrContentType === t.key ? WHITE : toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>{t.label}</Text>
                      </BouncyButton>
                    ))}
                  </View>

                  {qrContentType === 'url' && (
                    <FocusableTextInput
                      style={styles.formInput}
                      placeholder="https://yoursite.com"
                      placeholderTextColor={TEXT_SECONDARY}
                      autoCapitalize="none"
                      value={qrFields.url || ''}
                      onChangeText={(t) => setQrFields((p) => ({ ...p, url: t }))}
                      accessibilityLabel="URL"
                    />
                  )}

                  {qrContentType === 'text' && (
                    <FocusableTextInput
                      style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                      multiline
                      placeholder="Any text..."
                      placeholderTextColor={TEXT_SECONDARY}
                      value={qrFields.text || ''}
                      onChangeText={(t) => setQrFields((p) => ({ ...p, text: t }))}
                      accessibilityLabel="Text"
                    />
                  )}

                  {qrContentType === 'wifi' && (
                    <>
                      <FocusableTextInput
                        style={styles.formInput}
                        placeholder="Network name (SSID)"
                        placeholderTextColor={TEXT_SECONDARY}
                        value={qrFields.ssid || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, ssid: t }))}
                        accessibilityLabel="WiFi network name"
                      />
                      <FocusableTextInput
                        style={styles.formInput}
                        placeholder="Password"
                        placeholderTextColor={TEXT_SECONDARY}
                        secureTextEntry
                        value={qrFields.password || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, password: t }))}
                        accessibilityLabel="WiFi password"
                      />
                    </>
                  )}

                  {qrContentType === 'vcard' && (
                    <>
                      <FocusableTextInput
                        style={styles.formInput}
                        placeholder="Full name"
                        placeholderTextColor={TEXT_SECONDARY}
                        value={qrFields.name || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, name: t }))}
                        accessibilityLabel="Full name"
                      />
                      <FocusableTextInput
                        style={styles.formInput}
                        placeholder="Phone number"
                        placeholderTextColor={TEXT_SECONDARY}
                        keyboardType="phone-pad"
                        value={qrFields.phone || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, phone: t }))}
                        accessibilityLabel="Phone number"
                      />
                      <FocusableTextInput
                        style={styles.formInput}
                        placeholder="Email"
                        placeholderTextColor={TEXT_SECONDARY}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={qrFields.email || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, email: t }))}
                        accessibilityLabel="Email"
                      />
                      <FocusableTextInput
                        style={styles.formInput}
                        placeholder="Company (optional)"
                        placeholderTextColor={TEXT_SECONDARY}
                        value={qrFields.org || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, org: t }))}
                        accessibilityLabel="Company"
                      />
                    </>
                  )}

                  {qrContentType === 'email' && (
                    <>
                      <FocusableTextInput
                        style={styles.formInput}
                        placeholder="Recipient email"
                        placeholderTextColor={TEXT_SECONDARY}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={qrFields.to || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, to: t }))}
                        accessibilityLabel="Recipient email"
                      />
                      <FocusableTextInput
                        style={styles.formInput}
                        placeholder="Subject (optional)"
                        placeholderTextColor={TEXT_SECONDARY}
                        value={qrFields.subject || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, subject: t }))}
                        accessibilityLabel="Subject"
                      />
                      <FocusableTextInput
                        style={[styles.formInput, { height: 70, textAlignVertical: 'top' }]}
                        multiline
                        placeholder="Message body (optional)"
                        placeholderTextColor={TEXT_SECONDARY}
                        value={qrFields.body || ''}
                        onChangeText={(t) => setQrFields((p) => ({ ...p, body: t }))}
                        accessibilityLabel="Message body"
                      />
                    </>
                  )}

                  <View style={{
                    backgroundColor: toolsThemeMode === 'light' ? 'rgba(109,40,217,0.06)' : 'rgba(125,82,221,0.10)',
                    borderRadius: RADIUS_12, overflow: 'hidden', marginTop: 14
                  }}>
                    <BouncyButton
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 }}
                      onPress={() => setQrAdvancedOpen((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel="Customization options"
                      accessibilityState={{ expanded: qrAdvancedOpen }}
                    >
                      <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>{tt('customization')}</Text>
                      {qrAdvancedOpen ? <ChevronUpSVG color={toolsTheme.textSecondary} size={16} /> : <ChevronDownSVG color={toolsTheme.textSecondary} size={16} />}
                    </BouncyButton>

                    {qrAdvancedOpen && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                      <Text style={styles.formGroupLabel}>{tt('colors')}</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, marginBottom: 4 }}>{tt('foreground')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {Platform.OS === 'web' ? (
                              <input
                                type="color"
                                value={/^#[0-9A-Fa-f]{6}$/.test(qrColor) ? qrColor : BLACK_SOLID}
                                onChange={(e) => setQrColor(e.target.value.toUpperCase())}
                                style={{ width: 36, height: 36, border: `1px solid ${toolsTheme.border}`, borderRadius: RADIUS_8, padding: 0, background: 'none', cursor: 'pointer', flexShrink: 0 }}
                                aria-label="Foreground color picker"
                              />
                            ) : (
                              <View style={{ width: 36, height: 36, borderRadius: RADIUS_8, backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(qrColor) ? qrColor : BLACK_SOLID, borderWidth: 1, borderColor: toolsTheme.border, flexShrink: 0 }} />
                            )}
                            <FocusableTextInput
                              style={[styles.formInput, { flex: 1 }]}
                              placeholder={BLACK_SOLID}
                              placeholderTextColor={TEXT_SECONDARY}
                              autoCapitalize="characters"
                              value={qrColor}
                              onChangeText={setQrColor}
                              accessibilityLabel="Foreground color"
                            />
                          </View>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, marginBottom: 4 }}>{tt('background')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {Platform.OS === 'web' ? (
                              <input
                                type="color"
                                value={/^#[0-9A-Fa-f]{6}$/.test(qrBackgroundColor) ? qrBackgroundColor : WHITE}
                                onChange={(e) => setQrBackgroundColor(e.target.value.toUpperCase())}
                                style={{ width: 36, height: 36, border: `1px solid ${toolsTheme.border}`, borderRadius: RADIUS_8, padding: 0, background: 'none', cursor: 'pointer', flexShrink: 0 }}
                                aria-label="Background color picker"
                              />
                            ) : (
                              <View style={{ width: 36, height: 36, borderRadius: RADIUS_8, backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(qrBackgroundColor) ? qrBackgroundColor : WHITE, borderWidth: 1, borderColor: toolsTheme.border, flexShrink: 0 }} />
                            )}
                            <FocusableTextInput
                              style={[styles.formInput, { flex: 1 }]}
                              placeholder={WHITE}
                              placeholderTextColor={TEXT_SECONDARY}
                              autoCapitalize="characters"
                              value={qrBackgroundColor}
                              onChangeText={setQrBackgroundColor}
                              accessibilityLabel="Background color"
                            />
                          </View>
                        </View>
                      </View>

                      {/* Native has no built-in color-picker UI equivalent
                          to a browser's <input type="color"> - a new
                          native dependency for this would need a real
                          rebuild (same issue as expo-store-review), so
                          this preset swatch row is the picker there,
                          alongside the hex field above for precise entry. */}
                      {Platform.OS !== 'web' && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {[BLACK_SOLID, WHITE, BRAND_MID, DANGER, SUCCESS, SKY_400_2, WARNING, PINK_400_3].map((swatch) => (
                            <BouncyButton
                              key={swatch}
                              style={{ width: 28, height: 28, borderRadius: RADIUS_8, backgroundColor: swatch, borderWidth: 1, borderColor: toolsTheme.border }}
                              onPress={() => {
                                showAppAlert('Set Which Color?', '', [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: tt('foreground'), onPress: () => setQrColor(swatch) },
                                  { text: tt('background'), onPress: () => setQrBackgroundColor(swatch) }
                                ]);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Swatch ${swatch}`}
                            />
                          ))}
                        </View>
                      )}

                      {qrColor.toUpperCase() === qrBackgroundColor.toUpperCase() && (
                        <Text style={{ color: DANGER, fontSize: 11, fontWeight: '600' }}>
                          Foreground and background are the same color - this won't scan.
                        </Text>
                      )}

                      <Text style={styles.formGroupLabel}>{tt('dotStyle')}</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[{ key: 'round', label: tt('round') }, { key: 'square', label: tt('square') }].map((opt) => (
                          <BouncyButton
                            key={opt.key}
                            style={{
                              flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADIUS_99,
                              backgroundColor: qrDotStyle === opt.key ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID) : toolsTheme.bg,
                              borderWidth: 1, borderColor: qrDotStyle === opt.key ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border
                            }}
                            onPress={() => setQrDotStyle(opt.key)}
                            accessibilityRole="button"
                            accessibilityLabel={opt.label}
                            accessibilityState={{ selected: qrDotStyle === opt.key }}
                          >
                            <Text style={{ color: qrDotStyle === opt.key ? WHITE : toolsTheme.text, fontSize: 12, fontWeight: '700' }}>{opt.label}</Text>
                          </BouncyButton>
                        ))}
                      </View>

                      <Text style={styles.formGroupLabel}>{tt('logoOptional')}</Text>
                      {qrLogoUri ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Image source={{ uri: qrLogoUri }} style={{ width: 40, height: 40, borderRadius: RADIUS_8 }} />
                          <BouncyButton
                            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                            onPress={() => setQrLogoUri(null)}
                            accessibilityRole="button"
                          >
                            <Text style={{ color: DANGER, fontSize: 11, fontWeight: '700' }}>Remove</Text>
                          </BouncyButton>
                        </View>
                      ) : (
                        <BouncyButton
                          style={{ alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                          onPress={pickQrLogo}
                          accessibilityRole="button"
                        >
                          <Text style={{ color: toolsTheme.accent, fontSize: 12, fontWeight: '700' }}>{tt('chooseLogo')}</Text>
                        </BouncyButton>
                      )}
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, lineHeight: 15 }}>
                        A small centered logo is safe to add - this QR code is generated with extra error correction specifically to allow for it.
                      </Text>
                    </View>
                    )}
                  </View>
                  </>
                );

                const downloadButtonsBlock = (
                  <>
                  {(!!currentQrValue() || isWebWide) && (
                    <View style={{ marginTop: 14, width: '100%' }}>
                      <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                        <BouncyButton
                          style={[styles.saveAccountSettingsBtn, { flex: 1, marginTop: 0, opacity: (qrExporting || !currentQrValue()) ? 0.4 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                          onPress={handleDownloadQrPng}
                          disabled={qrExporting || !currentQrValue()}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: qrExporting || !currentQrValue(), busy: qrExporting }}
                        >
                          <Text style={styles.submitBtnText}>{qrExporting ? tt('exporting') : tt('downloadPng')}</Text>
                          {!qrExporting && <ArrowRightIconSVG size={13} color={WHITE} />}
                        </BouncyButton>
                        {Platform.OS === 'web' && (
                          <BouncyButton
                            style={[styles.saveAccountSettingsBtn, { flex: 1, marginTop: 0, backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border, opacity: !currentQrValue() ? 0.4 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                            onPress={handleDownloadQrSvg}
                            disabled={!currentQrValue()}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !currentQrValue() }}
                          >
                            <Text style={[styles.submitBtnText, { color: toolsTheme.text }]}>{tt('downloadSvg')}</Text>
                            <ArrowRightIconSVG size={13} color={toolsTheme.text} />
                          </BouncyButton>
                        )}
                      </View>
                      {qrGeneratorReturnToResume && Platform.OS === 'web' && (
                        <BouncyButton
                          style={[styles.saveAccountSettingsBtn, { marginTop: 10, opacity: (resumeQrGenerating || !currentQrValue()) ? 0.4 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY }]}
                          onPress={useGeneratedQrForResume}
                          disabled={resumeQrGenerating || !currentQrValue()}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: resumeQrGenerating || !currentQrValue(), busy: resumeQrGenerating }}
                        >
                          <Text style={styles.submitBtnText}>{resumeQrGenerating ? 'Adding to resume...' : 'Use This QR in My Resume'}</Text>
                        </BouncyButton>
                      )}
                    </View>
                  )}
                  </>
                );

                return (
                  <>
                    {qrGeneratorReturnToResume && (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: RADIUS_10,
                        backgroundColor: toolsThemeMode === 'light' ? 'rgba(109,40,217,0.08)' : 'rgba(139,92,246,0.12)',
                        borderWidth: 1, borderColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY, marginBottom: 12
                      }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 12.5, flex: 1 }}>
                          Building a QR code for your resume - customize it below, then tap "Use This QR in My Resume". Your resume progress is saved.
                        </Text>
                        <BouncyButton
                          onPress={() => { setQrGeneratorReturnToResume(false); setActiveTool('resumeMaker'); }}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel and go back to resume"
                        >
                          <Text style={{ color: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY, fontSize: 12.5, fontWeight: '700' }}>Cancel</Text>
                        </BouncyButton>
                      </View>
                    )}
                    <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                      {tt('qrIntro')}
                    </Text>

                    {isWebWide ? (
                      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, gap: 14 }}>
                          {formFieldsBlock}
                        </View>
                        <View style={{ flex: 1, gap: 14 }}>
                          {previewBlock}
                          {downloadButtonsBlock}
                        </View>
                      </View>
                    ) : (
                      <>
                        {previewBlock}
                        {formFieldsBlock}
                        {downloadButtonsBlock}
                      </>
                    )}

                    {isWebWide && (
                      <View style={{ marginTop: 20 }}>
                        <View style={{ height: 1, backgroundColor: toolsTheme.border, marginBottom: 20 }} />
                        <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                          {tt('moreTools')}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                          {ALL_TOOLS_LIST.filter((t) => t.key !== 'qrGenerator').map(({ key, label, Icon }) => (
                            <BouncyButton
                              key={key}
                              style={{
                                alignItems: 'center', gap: 8, width: '23%',
                                backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                                borderRadius: RADIUS_14, padding: 14
                              }}
                              onPress={() => requestSwitchTool(key)}
                              accessibilityRole="button"
                            >
                              <View style={{ width: 36, height: 36, borderRadius: RADIUS_10, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={18} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                              </View>
                              <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
                            </BouncyButton>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                );
              })()}

              {activeTool === 'imageConverter' && (
                <View style={{ gap: 20 }}>
                <View style={[{ gap: 14 }, isWebWide && { flexDirection: 'row', alignItems: 'flex-start', gap: 24 }]}>
                  <View style={{ gap: 14, flex: isWebWide ? 1 : undefined }}>
                  <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                    {tt('converterIntro')}
                  </Text>

                  <Text style={styles.formGroupLabel}>{tt('convertTo')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['JPEG', 'PNG', 'WEBP'].map((fmt) => (
                      <BouncyButton
                        key={fmt}
                        style={{
                          flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADIUS_99,
                          backgroundColor: converterFormat === fmt ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID) : toolsTheme.bg,
                          borderWidth: 1, borderColor: converterFormat === fmt ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border
                        }}
                        onPress={() => setConverterFormat(fmt)}
                        accessibilityRole="button"
                        accessibilityLabel={fmt}
                        accessibilityState={{ selected: converterFormat === fmt }}
                      >
                        <Text style={{ color: converterFormat === fmt ? WHITE : toolsTheme.text, fontSize: 12, fontWeight: '700' }}>{fmt}</Text>
                      </BouncyButton>
                    ))}
                  </View>

                  {!isWebWide && (
                  <>
                  <BouncyButton
                    style={{
                      marginTop: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: toolsTheme.border,
                      borderRadius: RADIUS_14, padding: 20, alignItems: 'center', gap: 8
                    }}
                    onPress={pickConverterImages}
                    accessibilityRole="button"
                  >
                    <ImageIconSVG size={26} color={toolsTheme.textSecondary} />
                    <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>
                      {converterFiles.length === 0 ? tt('chooseImages') : tt('addMoreImages')}
                    </Text>
                    <Text style={{ color: toolsTheme.textSecondary, fontSize: 11 }}>{tt('upTo10')}</Text>
                  </BouncyButton>

                  <BouncyButton
                    style={{
                      marginTop: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: toolsTheme.border,
                      borderRadius: RADIUS_14, padding: 16, alignItems: 'center', gap: 6
                    }}
                    onPress={pickConverterFiles}
                    accessibilityRole="button"
                  >
                    <ImageIconSVG size={20} color={toolsTheme.textSecondary} />
                    <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>{tt('addFromFiles')}</Text>
                    <Text style={{ color: toolsTheme.textSecondary, fontSize: 10.5, textAlign: 'center' }}>{tt('addFromFilesDesc')}</Text>
                  </BouncyButton>
                  </>
                  )}
                  </View>

                  <View style={{ gap: 14, flex: isWebWide ? 1 : undefined }}>
                  {isWebWide && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <BouncyButton
                      style={{
                        flex: 1, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                        borderRadius: RADIUS_14, padding: 16, alignItems: 'center', gap: 6
                      }}
                      onPress={pickConverterImages}
                      accessibilityRole="button"
                    >
                      <ImageIconSVG size={22} color={WHITE} />
                      <Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>
                        {converterFiles.length === 0 ? tt('chooseImages') : tt('addMoreImages')}
                      </Text>
                    </BouncyButton>
                    <BouncyButton
                      style={{
                        flex: 1, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                        borderRadius: RADIUS_14, padding: 16, alignItems: 'center', gap: 6
                      }}
                      onPress={pickConverterFiles}
                      accessibilityRole="button"
                    >
                      <ImageIconSVG size={22} color={WHITE} />
                      <Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>{tt('addFromFiles')}</Text>
                    </BouncyButton>
                  </View>
                  )}

                  {isWebWide && converterFiles.length === 0 && (
                    <View style={{
                      flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 10,
                      borderWidth: 1.5, borderStyle: 'dashed', borderColor: toolsTheme.border, borderRadius: RADIUS_14, padding: 40
                    }}>
                      <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>{tt('nothingHereYet')}</Text>
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, textAlign: 'center' }}>{tt('addFilesToStart')}</Text>
                    </View>
                  )}

                  {converterFiles.map((file, fileIndex) => (
                    <View key={file.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: toolsTheme.surface, borderRadius: RADIUS_12, padding: 10 }}>
                      <BouncyButton
                        onPress={() => openMediaViewer(converterFiles.map((f) => ({ type: 'image', uri: f.originalUri })), fileIndex)}
                        accessibilityRole="button"
                        accessibilityLabel="View image"
                      >
                        <Image source={{ uri: file.originalUri }} style={{ width: 48, height: 48, borderRadius: RADIUS_8 }} />
                      </BouncyButton>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 11 }}>
                          {file.originalFormat} · {(file.originalSize / 1024).toFixed(0)} KB
                        </Text>
                        {file.status === 'processing' && (
                          <Text style={{ color: toolsTheme.accent, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{tt('converting')}</Text>
                        )}
                        {file.status === 'done' && (
                          <Text style={{ color: SUCCESS, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                            {converterFormat} · {(file.resultSize / 1024).toFixed(0)} KB
                          </Text>
                        )}
                        {file.status === 'error' && (
                          <Text style={{ color: DANGER, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{file.error}</Text>
                        )}
                        {file.status === 'pending' && (
                          <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, marginTop: 2 }}>{tt('waitingToProcess')}</Text>
                        )}
                      </View>
                      {file.status === 'done' ? (
                        <BouncyButton
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                          onPress={() => handleSingleConvertedDownload(file)}
                          accessibilityRole="button"
                          accessibilityLabel="Download"
                        >
                          <Text style={{ color: toolsTheme.accent, fontSize: 11, fontWeight: '700' }}>{tt('download')}</Text>
                          <ArrowRightIconSVG size={11} color={toolsTheme.accent} />
                        </BouncyButton>
                      ) : file.status === 'processing' ? (
                        <ActivityIndicator color={toolsTheme.accent} size="small" />
                      ) : (
                        <>
                          <BouncyButton
                            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS_99, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID }}
                            onPress={() => convertOneFile(file)}
                            accessibilityRole="button"
                            accessibilityLabel="Convert this image"
                          >
                            <Text style={{ color: WHITE, fontSize: 11, fontWeight: '700' }}>{tt('convert')}</Text>
                          </BouncyButton>
                          <BouncyButton style={{ padding: 6 }} onPress={() => removeConverterFile(file.id)} accessibilityRole="button" accessibilityLabel="Remove">
                            <TrashIconSVG />
                          </BouncyButton>
                        </>
                      )}
                    </View>
                  ))}

                  {converterFiles.length > 0 && (
                    <View style={{ gap: 10, marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <BouncyButton
                          style={[styles.saveAccountSettingsBtn, { flex: 1, marginTop: 0, opacity: converterProcessing ? 0.6 : 1 }]}
                          onPress={runConverterBatch}
                          disabled={converterProcessing || !converterFiles.some((f) => f.status === 'pending' || f.status === 'error')}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: converterProcessing, busy: converterProcessing }}
                        >
                          <Text style={styles.submitBtnText}>{converterProcessing ? tt('converting') : tt('convertAll')}</Text>
                        </BouncyButton>
                        <BouncyButton
                          style={[
                            styles.saveAccountSettingsBtn,
                            { flex: 1, marginTop: 0, backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
                            !converterFiles.every((f) => f.status === 'done') && { opacity: 0.4 }
                          ]}
                          onPress={handleDownloadAllConverted}
                          disabled={!converterFiles.every((f) => f.status === 'done')}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: !converterFiles.every((f) => f.status === 'done') }}
                        >
                          <><Text style={[styles.submitBtnText, { color: toolsTheme.text }]}>{tt('downloadAll')}</Text><ArrowRightIconSVG size={13} color={toolsTheme.text} /></>
                        </BouncyButton>
                      </View>
                      <BouncyButton
                        style={{ alignSelf: 'center' }}
                        onPress={() => setClearFilesConfirmTarget('converter')}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: DANGER, fontSize: 12, fontWeight: '600' }}>{tt('clearAll')}</Text>
                      </BouncyButton>
                    </View>
                  )}
                  </View>
                </View>

                {isWebWide && (
                  <View>
                    <View style={{ height: 1, backgroundColor: toolsTheme.border, marginBottom: 20 }} />
                    <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                      {tt('moreTools')}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                      {ALL_TOOLS_LIST.filter((t) => t.key !== 'imageConverter').map(({ key, label, Icon }) => (
                        <BouncyButton
                          key={key}
                          style={{
                            alignItems: 'center', gap: 8, width: '23%',
                            backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                            borderRadius: RADIUS_14, padding: 14
                          }}
                          onPress={() => requestSwitchTool(key)}
                          accessibilityRole="button"
                        >
                          <View style={{ width: 36, height: 36, borderRadius: RADIUS_10, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={18} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                          </View>
                          <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
                        </BouncyButton>
                      ))}
                    </View>
                  </View>
                )}
                </View>
              )}

              {/* RESUME MAKER - real wizard shell + Step 1 (Personal
                  Info). Steps 2-4 are still honest placeholders, staged
                  as separate follow-up work - see resumeWizardStep. */}
              {/* Hidden off-screen QR, mounted only while a native
                  capture is pending (see captureNativeQr) - real
                  content, position: absolute off the visible area
                  rather than opacity/size-zeroed, since the latter can
                  prevent the native view from actually laying out and
                  having real pixels for toDataURL to read. */}
              {nativeQrCaptureRequest && Platform.OS !== 'web' && (
                <View style={{ position: 'absolute', left: -9999, top: -9999 }}>
                  <ToolsQRCode
                    ref={nativeQrCaptureRef}
                    value={nativeQrCaptureRequest.value}
                    size={600}
                    color={nativeQrCaptureRequest.color}
                    backgroundColor={nativeQrCaptureRequest.backgroundColor}
                    dotStyle={nativeQrCaptureRequest.dotStyle}
                    logoUri={nativeQrCaptureRequest.logoUri}
                  />
                </View>
              )}

              {activeTool === 'resumeMaker' && (() => {
                const stepAndNavBlock = (
                <>
                  {resumeWizardStep === 1 && (
                    <View style={{ gap: 14 }}>
                      <BouncyButton
                        style={{ alignSelf: 'center', width: 88, height: 88, borderRadius: RADIUS_44, backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                        onPress={pickResumePhoto}
                        accessibilityRole="button"
                        accessibilityLabel="Add photo"
                      >
                        {resumeData.photoUri ? (
                          <Image source={{ uri: resumeData.photoUri }} style={{ width: 88, height: 88 }} />
                        ) : (
                          <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>Add{'\n'}Photo</Text>
                        )}
                      </BouncyButton>
                      <FocusableTextInput
                        style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 15 }}
                        placeholder="Full name"
                        placeholderTextColor={toolsTheme.textSecondary}
                        value={resumeData.name}
                        onChangeText={(t) => updateResumeField('name', t)}
                      />
                      <FocusableTextInput
                        style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 15 }}
                        placeholder="Professional title (e.g. UI/UX Designer)"
                        placeholderTextColor={toolsTheme.textSecondary}
                        value={resumeData.title}
                        onChangeText={(t) => updateResumeField('title', t)}
                      />
                      <FocusableTextInput
                        style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 15 }}
                        placeholder="Email"
                        placeholderTextColor={toolsTheme.textSecondary}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={resumeData.email}
                        onChangeText={(t) => updateResumeField('email', t)}
                      />
                      <FocusableTextInput
                        style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 15 }}
                        placeholder="Phone"
                        placeholderTextColor={toolsTheme.textSecondary}
                        keyboardType="phone-pad"
                        value={resumeData.phone}
                        onChangeText={(t) => updateResumeField('phone', t)}
                      />
                      <FocusableTextInput
                        style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 15 }}
                        placeholder="Location (e.g. Jakarta, Indonesia)"
                        placeholderTextColor={toolsTheme.textSecondary}
                        value={resumeData.location}
                        onChangeText={(t) => updateResumeField('location', t)}
                      />
                      <FocusableTextInput
                        style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 15, minHeight: 80, textAlignVertical: 'top' }}
                        placeholder="Summary - a few sentences about your background"
                        placeholderTextColor={toolsTheme.textSecondary}
                        multiline
                        value={resumeData.summary}
                        onChangeText={(t) => updateResumeField('summary', t)}
                      />
                    </View>
                  )}

                  {resumeWizardStep === 2 && (
                    <View style={{ gap: 24 }}>
                      <View style={{ gap: 12 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>Experience</Text>
                        {resumeData.experience.map((exp) => (
                          <View key={exp.id} style={{ gap: 8, backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border, borderRadius: RADIUS_12, padding: 14 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                              <BouncyButton onPress={() => removeResumeExperience(exp.id)} accessibilityRole="button" accessibilityLabel="Remove this experience entry">
                                <Text style={{ color: DANGER, fontSize: 12, fontWeight: '700' }}>Remove</Text>
                              </BouncyButton>
                            </View>
                            <FocusableTextInput
                              style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14 }}
                              placeholder="Company"
                              placeholderTextColor={toolsTheme.textSecondary}
                              value={exp.company}
                              onChangeText={(t) => updateResumeExperience(exp.id, 'company', t)}
                            />
                            <FocusableTextInput
                              style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14 }}
                              placeholder="Role / title"
                              placeholderTextColor={toolsTheme.textSecondary}
                              value={exp.role}
                              onChangeText={(t) => updateResumeExperience(exp.id, 'role', t)}
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <FocusableTextInput
                                style={{ flex: 1, borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14 }}
                                placeholder="Start (e.g. Jan 2020)"
                                placeholderTextColor={toolsTheme.textSecondary}
                                value={exp.startDate}
                                onChangeText={(t) => updateResumeExperience(exp.id, 'startDate', t)}
                              />
                              {!exp.current && (
                                <FocusableTextInput
                                  style={{ flex: 1, borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14 }}
                                  placeholder="End (e.g. Mar 2022)"
                                  placeholderTextColor={toolsTheme.textSecondary}
                                  value={exp.endDate}
                                  onChangeText={(t) => updateResumeExperience(exp.id, 'endDate', t)}
                                />
                              )}
                            </View>
                            <BouncyButton
                              style={{
                                alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS_99,
                                borderWidth: 1.5, borderColor: exp.current ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border,
                                backgroundColor: exp.current ? (toolsThemeMode === 'light' ? 'rgba(109,40,217,0.08)' : 'rgba(139,92,246,0.12)') : 'transparent'
                              }}
                              onPress={() => updateResumeExperience(exp.id, 'current', !exp.current)}
                              accessibilityRole="button"
                              accessibilityState={{ selected: exp.current }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: exp.current ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.text }}>I currently work here</Text>
                            </BouncyButton>
                            <FocusableTextInput
                              style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14, minHeight: 70, textAlignVertical: 'top' }}
                              placeholder="What did you do here?"
                              placeholderTextColor={toolsTheme.textSecondary}
                              multiline
                              value={exp.description}
                              onChangeText={(t) => updateResumeExperience(exp.id, 'description', t)}
                            />
                          </View>
                        ))}
                        <BouncyButton
                          style={{ paddingVertical: 10, borderRadius: RADIUS_10, alignItems: 'center', borderWidth: 1.5, borderColor: toolsTheme.border, borderStyle: 'dashed' }}
                          onPress={addResumeExperience}
                          accessibilityRole="button"
                        >
                          <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>+ Add Experience</Text>
                        </BouncyButton>
                      </View>

                      <View style={{ gap: 12 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>Education</Text>
                        {resumeData.education.map((edu) => (
                          <View key={edu.id} style={{ gap: 8, backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border, borderRadius: RADIUS_12, padding: 14 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                              <BouncyButton onPress={() => removeResumeEducation(edu.id)} accessibilityRole="button" accessibilityLabel="Remove this education entry">
                                <Text style={{ color: DANGER, fontSize: 12, fontWeight: '700' }}>Remove</Text>
                              </BouncyButton>
                            </View>
                            <FocusableTextInput
                              style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14 }}
                              placeholder="School"
                              placeholderTextColor={toolsTheme.textSecondary}
                              value={edu.school}
                              onChangeText={(t) => updateResumeEducation(edu.id, 'school', t)}
                            />
                            <FocusableTextInput
                              style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14 }}
                              placeholder="Degree"
                              placeholderTextColor={toolsTheme.textSecondary}
                              value={edu.degree}
                              onChangeText={(t) => updateResumeEducation(edu.id, 'degree', t)}
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <FocusableTextInput
                                style={{ flex: 1, borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14 }}
                                placeholder="Start year"
                                placeholderTextColor={toolsTheme.textSecondary}
                                value={edu.startDate}
                                onChangeText={(t) => updateResumeEducation(edu.id, 'startDate', t)}
                              />
                              <FocusableTextInput
                                style={{ flex: 1, borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 10, color: toolsTheme.text, fontSize: 14 }}
                                placeholder="End year"
                                placeholderTextColor={toolsTheme.textSecondary}
                                value={edu.endDate}
                                onChangeText={(t) => updateResumeEducation(edu.id, 'endDate', t)}
                              />
                            </View>
                          </View>
                        ))}
                        <BouncyButton
                          style={{ paddingVertical: 10, borderRadius: RADIUS_10, alignItems: 'center', borderWidth: 1.5, borderColor: toolsTheme.border, borderStyle: 'dashed' }}
                          onPress={addResumeEducation}
                          accessibilityRole="button"
                        >
                          <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>+ Add Education</Text>
                        </BouncyButton>
                      </View>
                    </View>
                  )}

                  {resumeWizardStep === 3 && (
                    <View style={{ gap: 24 }}>
                      <View style={{ gap: 10 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>Skills</Text>
                        {resumeData.skills.length > 0 && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {resumeData.skills.map((skill) => (
                              <View key={skill} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: RADIUS_99, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY }}>
                                <Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '600' }}>{skill}</Text>
                                <BouncyButton onPress={() => removeResumeSkill(skill)} accessibilityRole="button" accessibilityLabel={`Remove ${skill}`}>
                                  <Text style={{ color: WHITE, fontSize: 13, fontWeight: '700' }}>✕</Text>
                                </BouncyButton>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Tap-to-add common skills - reuses the same
                            software names already established elsewhere
                            in this app for this exact audience
                            (RESUME_COMMON_SKILLS), plus a small set of
                            design skill categories. Adding one is a
                            single tap, no typing or Enter key involved
                            at all - the free-text field below is only
                            for anything not already covered here. */}
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 11.5, fontWeight: '600' }}>TAP TO ADD</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {RESUME_COMMON_SKILLS.filter((s) => !resumeData.skills.includes(s)).map((skill) => (
                            <BouncyButton
                              key={skill}
                              style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                              onPress={() => addResumeSkill(skill)}
                              accessibilityRole="button"
                              accessibilityLabel={`Add ${skill}`}
                            >
                              <Text style={{ color: toolsTheme.text, fontSize: 12, fontWeight: '600' }}>+ {skill}</Text>
                            </BouncyButton>
                          ))}
                        </View>

                        {/* Custom entry - a visible Add button alongside
                            the field, not just Enter-to-submit. Typing
                            here with no visible confirmation of what
                            counts as "added" is exactly what caused
                            confusion earlier - text sitting in the
                            input isn't a skill yet until one of these
                            two things actually fires. */}
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 11.5, fontWeight: '600', marginTop: 4 }}>OR ADD YOUR OWN</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <FocusableTextInput
                            style={{ flex: 1, borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 14 }}
                            placeholder="Custom skill"
                            placeholderTextColor={toolsTheme.textSecondary}
                            value={resumeSkillInput}
                            onChangeText={setResumeSkillInput}
                            onSubmitEditing={() => { addResumeSkill(resumeSkillInput); setResumeSkillInput(''); }}
                            returnKeyType="done"
                            blurOnSubmit={false}
                          />
                          <BouncyButton
                            style={{ paddingHorizontal: 18, borderRadius: RADIUS_10, alignItems: 'center', justifyContent: 'center', backgroundColor: resumeSkillInput.trim() ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border }}
                            onPress={() => { addResumeSkill(resumeSkillInput); setResumeSkillInput(''); }}
                            disabled={!resumeSkillInput.trim()}
                            accessibilityRole="button"
                            accessibilityLabel="Add skill"
                          >
                            <Text style={{ color: WHITE, fontSize: 20, fontWeight: '700' }}>+</Text>
                          </BouncyButton>
                        </View>
                      </View>

                      <View style={{ gap: 10 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>Links</Text>
                        <FocusableTextInput
                          style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 14 }}
                          placeholder="Website"
                          placeholderTextColor={toolsTheme.textSecondary}
                          autoCapitalize="none"
                          value={resumeData.links.website}
                          onChangeText={(t) => updateResumeLink('website', t)}
                        />
                        <FocusableTextInput
                          style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 14 }}
                          placeholder="LinkedIn"
                          placeholderTextColor={toolsTheme.textSecondary}
                          autoCapitalize="none"
                          value={resumeData.links.linkedin}
                          onChangeText={(t) => updateResumeLink('linkedin', t)}
                        />
                        <FocusableTextInput
                          style={{ width: '100%', borderWidth: 1.5, borderColor: toolsTheme.border, borderRadius: RADIUS_10, padding: 12, color: toolsTheme.text, fontSize: 14 }}
                          placeholder="GitHub"
                          placeholderTextColor={toolsTheme.textSecondary}
                          autoCapitalize="none"
                          value={resumeData.links.github}
                          onChangeText={(t) => updateResumeLink('github', t)}
                        />
                      </View>

                      <View style={{ gap: 10 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>QR Code (optional)</Text>
                        {resumeData.qrImageUri ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border, borderRadius: RADIUS_12, padding: 12 }}>
                            <Image source={{ uri: resumeData.qrImageUri }} style={{ width: 56, height: 56, borderRadius: RADIUS_6 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>
                                {resumeData.qrSource === 'upload' ? 'Uploaded QR' : resumeData.qrSource === 'decent' ? 'DECENT portfolio QR' : 'Generated QR'}
                              </Text>
                              <Text style={{ color: toolsTheme.textSecondary, fontSize: 11.5 }}>Will be included on your resume</Text>
                            </View>
                            <BouncyButton onPress={() => setResumeData((prev) => ({ ...prev, qrImageUri: null, qrSource: null }))} accessibilityRole="button" accessibilityLabel="Remove QR code">
                              <Text style={{ color: DANGER, fontSize: 12, fontWeight: '700' }}>Remove</Text>
                            </BouncyButton>
                          </View>
                        ) : (
                          <View style={{ gap: 10 }}>
                            <BouncyButton
                              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: RADIUS_10, borderWidth: 1.5, borderColor: toolsTheme.border, opacity: resumeQrGenerating ? 0.5 : 1 }}
                              onPress={pickResumeQrUpload}
                              disabled={resumeQrGenerating}
                              accessibilityRole="button"
                            >
                              <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '600' }}>Upload a QR code I already have</Text>
                              <ChevronRightSVG color={toolsTheme.textSecondary} size={16} />
                            </BouncyButton>
                            <BouncyButton
                              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: RADIUS_10, borderWidth: 1.5, borderColor: toolsTheme.border, opacity: resumeQrGenerating ? 0.5 : 1 }}
                              onPress={openQrGeneratorForResume}
                              disabled={resumeQrGenerating}
                              accessibilityRole="button"
                            >
                              <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '600' }}>Generate a new QR code</Text>
                              <ChevronRightSVG color={toolsTheme.textSecondary} size={16} />
                            </BouncyButton>
                            {session && userProfile.handle && (
                              <View style={{ gap: 8 }}>
                                <BouncyButton
                                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: RADIUS_10, borderWidth: 1.5, borderColor: toolsTheme.border, opacity: resumeQrGenerating ? 0.5 : 1 }}
                                  onPress={() => generateResumeDecentQr('decent')}
                                  disabled={resumeQrGenerating}
                                  accessibilityRole="button"
                                >
                                  <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '600' }}>Use my DECENT portfolio QR - branded style</Text>
                                  <ChevronRightSVG color={toolsTheme.textSecondary} size={16} />
                                </BouncyButton>
                                <BouncyButton
                                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: RADIUS_10, borderWidth: 1.5, borderColor: toolsTheme.border, opacity: resumeQrGenerating ? 0.5 : 1 }}
                                  onPress={() => generateResumeDecentQr('plain')}
                                  disabled={resumeQrGenerating}
                                  accessibilityRole="button"
                                >
                                  <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '600' }}>Use my DECENT portfolio QR - plain style</Text>
                                  <ChevronRightSVG color={toolsTheme.textSecondary} size={16} />
                                </BouncyButton>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {resumeWizardStep === 4 && (
                    <View style={{ gap: 20 }}>
                      <View style={{ gap: 10, backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border, borderRadius: RADIUS_12, padding: 16 }}>
                        <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>{resumeData.name || 'Your Name'}</Text>
                        {!!resumeData.title && <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5 }}>{resumeData.title}</Text>}
                        <View style={{ height: 1, backgroundColor: toolsTheme.border, marginVertical: 4 }} />
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5 }}>
                          {resumeData.experience.length} experience {resumeData.experience.length === 1 ? 'entry' : 'entries'} &middot; {resumeData.education.length} education {resumeData.education.length === 1 ? 'entry' : 'entries'} &middot; {resumeData.skills.length} {resumeData.skills.length === 1 ? 'skill' : 'skills'}
                        </Text>
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5 }}>
                          {resumeData.qrImageUri ? 'QR code included' : 'No QR code'}
                        </Text>
                      </View>

                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, textAlign: 'center' }}>
                        {Platform.OS === 'web'
                          ? 'Exporting opens your browser\'s print dialog - choose "Save as PDF" there. To remove the browser\'s own header/footer (URL, date, page number), open "More settings" in that dialog and turn off "Headers and footers".'
                          : 'Exporting generates a PDF you can save or share.'}
                      </Text>

                      <BouncyButton
                        style={{ paddingVertical: 14, borderRadius: RADIUS_10, alignItems: 'center', backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY, opacity: resumeExporting ? 0.5 : 1 }}
                        onPress={handleExportResume}
                        disabled={resumeExporting}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: WHITE, fontSize: 14, fontWeight: '700' }}>{resumeExporting ? 'Exporting...' : 'Export as PDF'}</Text>
                      </BouncyButton>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {resumeWizardStep > 1 && (
                      <BouncyButton
                        style={{ flex: 1, paddingVertical: 12, borderRadius: RADIUS_10, alignItems: 'center', borderWidth: 1, borderColor: toolsTheme.border }}
                        onPress={() => setResumeWizardStep((s) => Math.max(1, s - 1))}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: toolsTheme.text, fontSize: 13.5, fontWeight: '700' }}>Back</Text>
                      </BouncyButton>
                    )}
                    {resumeWizardStep < 4 && (
                      <BouncyButton
                        style={{ flex: 1, paddingVertical: 12, borderRadius: RADIUS_10, alignItems: 'center', backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY }}
                        onPress={() => setResumeWizardStep((s) => Math.min(4, s + 1))}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: WHITE, fontSize: 13.5, fontWeight: '700' }}>Next</Text>
                      </BouncyButton>
                    )}
                  </View>
                </>
                );

                const progressIndicator = (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['Personal', 'Experience', 'Skills', 'Review'].map((label, i) => (
                      <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                        <View style={{
                          width: '100%', height: 4, borderRadius: RADIUS_2,
                          backgroundColor: resumeWizardStep > i ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border
                        }} />
                        <Text style={{
                          fontSize: 11, fontWeight: '600',
                          color: resumeWizardStep === i + 1 ? toolsTheme.text : toolsTheme.textSecondary
                        }}>{label}</Text>
                      </View>
                    ))}
                  </View>
                );

                // Wide web only - a live preview of the actual PDF
                // template, filled with whatever's been entered so far,
                // sitting next to the form instead of only appearing at
                // Review. srcDoc on a real iframe is the most literal,
                // genuinely WYSIWYG way to do this - it's rendering the
                // exact same buildResumeHtml() output the real export
                // uses, not an approximation of it, so there's no risk
                // of the preview and the actual PDF ever disagreeing.
                //
                // Native has no iframe and no room for a side-by-side
                // split on a phone screen either way - the equivalent
                // here is a manually-triggered full-screen modal
                // instead of an always-visible pane, using
                // NativeWebView with a local html source (not a URL -
                // nothing leaves the device, same as every other export
                // path). Available on every step, not just Review, so
                // checking progress doesn't require finishing the
                // wizard first.
                return (
                  <View style={{ gap: 20 }}>
                    {progressIndicator}
                    {isWebWide ? (
                      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, backgroundColor: WHITE, borderRadius: RADIUS_12, overflow: 'hidden', height: 720 }}>
                          {React.createElement('iframe', {
                            srcDoc: buildResumeHtml(resumeData),
                            title: 'Resume preview',
                            style: { width: '100%', height: '100%', border: 'none' }
                          })}
                        </View>
                        <View style={{ flex: 1 }}>
                          {stepAndNavBlock}
                        </View>
                      </View>
                    ) : (
                      <>
                        {Platform.OS !== 'web' && (
                          <BouncyButton
                            style={{ paddingVertical: 10, borderRadius: RADIUS_10, alignItems: 'center', borderWidth: 1.5, borderColor: toolsTheme.border }}
                            onPress={() => setResumePreviewModalVisible(true)}
                            accessibilityRole="button"
                          >
                            <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>Preview Resume</Text>
                          </BouncyButton>
                        )}
                        {stepAndNavBlock}
                      </>
                    )}
                  </View>
                );
              })()}

              {resumePreviewModalVisible && (
                <Modal animationType="slide" transparent={false} visible={true} onRequestClose={() => setResumePreviewModalVisible(false)}>
                  <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 12 }}>
                      <BouncyButton
                        style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS_10, backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border }}
                        onPress={() => setResumePreviewModalVisible(false)}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>Close</Text>
                      </BouncyButton>
                    </View>
                    <NativeWebView source={{ html: buildResumeHtml(resumeData) }} style={{ flex: 1 }} />
                  </SafeAreaView>
                </Modal>
              )}

              {activeTool === 'pdfEditor' && (
                <View style={{ gap: 20 }}>
                <View style={{ gap: 14 }}>
                  {pdfContainers.length === 0 && (
                  <View style={{ gap: 14 }}>
                  <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                    {tt('pdfEditorIntro')}
                  </Text>

                  {isWebWide ? (
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, alignItems: 'center' }}>
                      <BouncyButton
                        style={{
                          width: 96, height: 96, borderRadius: RADIUS_14, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                          alignItems: 'center', justifyContent: 'center', gap: 6
                        }}
                        onPress={pickPdfEditorPdfs}
                        disabled={pdfEditorLoading}
                        accessibilityRole="button"
                      >
                        <PdfIconSVG size={24} color={WHITE} />
                        <Text style={{ color: WHITE, fontSize: 11.5, fontWeight: '700' }}>{tt('addPdf')}</Text>
                      </BouncyButton>
                      <BouncyButton
                        style={{
                          width: 96, height: 96, borderRadius: RADIUS_14, borderWidth: 1, borderColor: toolsTheme.border,
                          alignItems: 'center', justifyContent: 'center', gap: 6
                        }}
                        onPress={pickPdfEditorImages}
                        disabled={pdfEditorLoading}
                        accessibilityRole="button"
                      >
                        <ImageIconSVG size={22} color={toolsTheme.textSecondary} />
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 11.5, fontWeight: '600' }}>{tt('addImages')}</Text>
                      </BouncyButton>
                      {pdfEditorLoading && <ActivityIndicator color={toolsTheme.accent} size="small" />}
                    </View>
                  ) : (
                    <>
                      <BouncyButton
                        style={{
                          marginTop: 14, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                          borderRadius: RADIUS_16, padding: 28, alignItems: 'center', gap: 10
                        }}
                        onPress={pickPdfEditorPdfs}
                        disabled={pdfEditorLoading}
                        accessibilityRole="button"
                      >
                        <PdfIconSVG size={32} color={WHITE} />
                        <Text style={{ color: WHITE, fontSize: 15, fontWeight: '800' }}>{tt('addPdf')}</Text>
                      </BouncyButton>

                      <BouncyButton
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                          marginTop: 10, borderWidth: 1, borderColor: toolsTheme.border,
                          borderRadius: RADIUS_12, paddingVertical: 10
                        }}
                        onPress={pickPdfEditorImages}
                        disabled={pdfEditorLoading}
                        accessibilityRole="button"
                      >
                        <ImageIconSVG size={16} color={toolsTheme.textSecondary} />
                        <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{tt('addImages')}</Text>
                      </BouncyButton>

                      {pdfEditorLoading && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
                          <ActivityIndicator color={toolsTheme.accent} size="small" />
                          <Text style={{ color: toolsTheme.textSecondary, fontSize: 12 }}>{tt('loadingPdf')}{pdfBusyPercent != null ? ` ${pdfBusyPercent}%` : ''}</Text>
                        </View>
                      )}
                    </>
                  )}
                  </View>
                  )}

                  {pdfContainers.length > 0 && !pdfSelectModeTool && !pdfContainerSelectModeTool && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' }}>
                      {isWebWide && (
                        <>
                          <BouncyButton
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14,
                              borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border, opacity: pdfEditorLoading ? 0.6 : 1
                            }}
                            onPress={pickPdfEditorPdfs}
                            disabled={pdfEditorLoading}
                            accessibilityRole="button"
                            accessibilityLabel="Add another PDF"
                          >
                            <PdfIconSVG color={toolsTheme.textSecondary} size={14} />
                            <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>{tt('addPdf')}</Text>
                          </BouncyButton>
                          <BouncyButton
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14,
                              borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border, opacity: pdfEditorLoading ? 0.6 : 1
                            }}
                            onPress={pickPdfEditorImages}
                            disabled={pdfEditorLoading}
                            accessibilityRole="button"
                            accessibilityLabel="Add photos as a new PDF"
                          >
                            <ImageIconSVG color={toolsTheme.textSecondary} size={14} />
                            <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>{tt('addImages')}</Text>
                          </BouncyButton>
                          <View style={{ width: 1, height: 20, backgroundColor: toolsTheme.border, marginHorizontal: 2 }} />
                        </>
                      )}
                      {/* Watermark has no toolbar button of its own (it
                          lives in More Tools) - this is its dedicated
                          "active" slot, positioned left of Compress since
                          that's the one fixed anchor point every layout
                          already has. Left side of the pill edits (reverts
                          then reopens pre-filled), the X undoes outright. */}
                      {isPdfWatermarkActive && (
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS_99, overflow: 'hidden',
                          backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID
                        }}>
                          <BouncyButton
                            style={{ paddingLeft: 12, paddingVertical: 8 }}
                            onPress={() => undoSpecificPdfEdit('Add watermark')}
                            accessibilityRole="button"
                            accessibilityLabel="Remove watermark"
                          >
                            <View style={{ width: 16, height: 16, borderRadius: RADIUS_8, borderWidth: 1.5, borderColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: WHITE, fontSize: 10, fontWeight: '800', lineHeight: 11 }}>✕</Text>
                            </View>
                          </BouncyButton>
                          <BouncyButton
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingLeft: 6, paddingRight: 14 }}
                            onPress={editPdfWatermark}
                            accessibilityRole="button"
                            accessibilityLabel="Edit watermark"
                          >
                            <Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>Watermark</Text>
                          </BouncyButton>
                        </View>
                      )}
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS_99, overflow: 'hidden',
                        backgroundColor: isPdfCompressActive ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID) : 'transparent',
                        borderWidth: isPdfCompressActive ? 0 : 1,
                        borderColor: toolsTheme.border
                      }}>
                        {isPdfCompressActive && (
                          <BouncyButton
                            style={{ paddingLeft: 12, paddingVertical: 8 }}
                            onPress={() => setPdfCompressUndoConfirmVisible(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Undo compress"
                          >
                            <View style={{ width: 16, height: 16, borderRadius: RADIUS_8, borderWidth: 1.5, borderColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: WHITE, fontSize: 10, fontWeight: '800', lineHeight: 11 }}>✕</Text>
                            </View>
                          </BouncyButton>
                        )}
                        <BouncyButton
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8,
                            paddingLeft: isPdfCompressActive ? 6 : 14, paddingRight: 14,
                            opacity: pdfCompressing ? 0.6 : 1
                          }}
                          onPress={() => (pdfContainers.length > 1 ? startContainerSelectFlow('compress') : setPdfCompressOptionsVisible(true))}
                          disabled={pdfCompressing}
                          accessibilityRole="button"
                          accessibilityLabel="Compress"
                          accessibilityState={{ disabled: pdfCompressing, busy: pdfCompressing, selected: isPdfCompressActive }}
                        >
                          {pdfCompressing ? (
                            <>
                              <ActivityIndicator color={isPdfCompressActive ? WHITE : toolsTheme.textSecondary} size="small" />
                              {pdfCompressProgress && (
                                <Text style={{ color: isPdfCompressActive ? WHITE : toolsTheme.text, fontSize: 12, fontWeight: '600' }}>
                                  {pdfCompressProgress.done}/{pdfCompressProgress.total} ({Math.round((pdfCompressProgress.done / pdfCompressProgress.total) * 100)}%)
                                </Text>
                              )}
                            </>
                          ) : (
                            <>
                              <CompressIconSVG color={isPdfCompressActive ? WHITE : toolsTheme.textSecondary} size={14} />
                              <Text style={{ color: isPdfCompressActive ? WHITE : toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>Compress</Text>
                            </>
                          )}
                        </BouncyButton>
                      </View>
                      {/* No separate "Reorder" toggle - every page
                          thumbnail (rail tile or list tile) always shows
                          its own up/down + typeable-number pill, see
                          renderPdfReorderPill. */}
                      <BouncyButton
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                        onPress={() => { cancelContainerSelectFlow(); setPdfSelectedPageIds([]); setPdfSelectModeTool('crop'); }}
                        accessibilityRole="button"
                        accessibilityLabel="Crop pages"
                      >
                        <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>Crop Pages</Text>
                      </BouncyButton>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS_99, overflow: 'hidden',
                        backgroundColor: isPdfPageNumbersActive ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID) : 'transparent',
                        borderWidth: isPdfPageNumbersActive ? 0 : 1,
                        borderColor: toolsTheme.border
                      }}>
                        {isPdfPageNumbersActive && (
                          <BouncyButton
                            style={{ paddingLeft: 12, paddingVertical: 8 }}
                            onPress={() => setPdfPageNumbersUndoConfirmVisible(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Undo page numbers"
                          >
                            <View style={{ width: 16, height: 16, borderRadius: RADIUS_8, borderWidth: 1.5, borderColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: WHITE, fontSize: 10, fontWeight: '800', lineHeight: 11 }}>✕</Text>
                            </View>
                          </BouncyButton>
                        )}
                        <BouncyButton
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8,
                            paddingLeft: isPdfPageNumbersActive ? 6 : 14, paddingRight: 14
                          }}
                          onPress={handleAddPageNumbers}
                          accessibilityRole="button"
                          accessibilityLabel="Add page numbers"
                          accessibilityState={{ selected: isPdfPageNumbersActive }}
                        >
                          <Text style={{ color: isPdfPageNumbersActive ? WHITE : toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>Page Numbers</Text>
                        </BouncyButton>
                      </View>
                      <View ref={pdfMoreToolsButtonRef} collapsable={false}>
                        <BouncyButton
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 14,
                            borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border
                          }}
                          onPress={() => {
                            if (pdfMoreToolsButtonRef.current) {
                              pdfMoreToolsButtonRef.current.measure((x, y, width, height, pageX, pageY) => {
                                setPdfMoreToolsMenuPosition({ top: pageY + height + 6, left: pageX });
                                setPdfMoreToolsMenuVisible(true);
                              });
                            } else {
                              setPdfMoreToolsMenuVisible(true);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="More PDF tools"
                        >
                          <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700' }}>More Tools</Text>
                          <ChevronDownSVG color={toolsTheme.textSecondary} size={13} />
                        </BouncyButton>
                      </View>
                      {/* Global undo - pops the most recent operation
                          regardless of which container it touched. */}
                      {pdfEditorHasPendingChanges && (
                        <BouncyButton
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          onPress={handleUndoPdfEdit}
                          accessibilityRole="button"
                          accessibilityLabel="Undo last change"
                        >
                          <RevertIconSVG color={toolsTheme.accent} size={14} />
                          <Text style={{ color: toolsTheme.accent, fontSize: 12, fontWeight: '600' }}>Undo</Text>
                        </BouncyButton>
                      )}
                      {isWebWide && (
                        <BouncyButton
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS_99, marginLeft: 'auto' }}
                          onPress={() => setPdfClearConfirmVisible(true)}
                          accessibilityRole="button"
                          accessibilityLabel="Clear loaded PDFs"
                        >
                          <TrashIconSVG />
                          <Text style={{ color: DANGER, fontSize: 12.5, fontWeight: '700' }}>Clear PDF{pdfContainers.length > 1 ? 's' : ''}</Text>
                        </BouncyButton>
                      )}
                    </View>
                  )}

                  {/* Ambient heads-up once cumulative loaded PDF size gets
                      large across the session - not a blocking dialog,
                      just a standing reminder to export/clear what's
                      already been dealt with, since nothing here evicts
                      memory automatically once a PDF's been loaded. */}
                  {(() => {
                    const totalLoadedSize = pdfContainers.reduce((sum, c) => sum + (c.originalSize || 0), 0);
                    if (totalLoadedSize <= PDF_LARGE_UPLOAD_WARN_BYTES * 2) return null;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: RADIUS_10, padding: 10, marginTop: 4 }}>
                        <Text style={{ color: WARNING, fontSize: 11.5, flex: 1 }}>
                          {formatBytes(totalLoadedSize)} loaded across {pdfContainers.length} PDF{pdfContainers.length === 1 ? '' : 's'} - export or clear ones you're done with to free up memory.
                        </Text>
                      </View>
                    );
                  })()}

                  {/* CONTAINER TABS - one uploaded PDF (or photo set) per
                      container, shown as its own tab once there's more
                      than one - the "x" removes just that container
                      (undo-able like everything else, no confirm dialog
                      needed). While pdfContainerSelectModeTool is active
                      (Compress with 2+ containers, or Merge), tapping a
                      tab toggles its checkbox instead of switching to it. */}
                  {pdfContainers.length > 1 && (
                    <View style={{ marginTop: 4, gap: 10 }}>
                      {pdfContainerSelectModeTool && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: toolsTheme.surface, borderRadius: RADIUS_12, padding: 12 }}>
                          <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>
                            {pdfSelectedContainerIds.length} PDF{pdfSelectedContainerIds.length === 1 ? '' : 's'} selected
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <BouncyButton style={{ paddingVertical: 6, paddingHorizontal: 12 }} onPress={cancelContainerSelectFlow} accessibilityRole="button">
                              <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5, fontWeight: '600' }}>Cancel</Text>
                            </BouncyButton>
                            <BouncyButton
                              style={{
                                paddingVertical: 6, paddingHorizontal: 14, borderRadius: RADIUS_99,
                                backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                                opacity: (pdfContainerSelectModeTool === 'merge' ? pdfSelectedContainerIds.length < 2 : pdfSelectedContainerIds.length === 0) ? 0.5 : 1
                              }}
                              onPress={() => {
                                if (pdfContainerSelectModeTool === 'merge') mergeContainers(pdfSelectedContainerIds);
                                else setPdfCompressOptionsVisible(true);
                              }}
                              disabled={pdfContainerSelectModeTool === 'merge' ? pdfSelectedContainerIds.length < 2 : pdfSelectedContainerIds.length === 0}
                              accessibilityRole="button"
                            >
                              <Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>Confirm</Text>
                            </BouncyButton>
                          </View>
                        </View>
                      )}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {pdfContainers.map((c) => {
                          const isActive = c.id === activePdfContainer?.id;
                          const isSelected = pdfSelectedContainerIds.includes(c.id);
                          return (
                            <View
                              key={c.id}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10,
                                borderRadius: RADIUS_10, borderWidth: 1.5,
                                borderColor: (pdfContainerSelectModeTool ? isSelected : isActive) ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border,
                                backgroundColor: (pdfContainerSelectModeTool ? isSelected : isActive) ? (toolsThemeMode === 'light' ? 'rgba(109,40,217,0.08)' : 'rgba(139,92,246,0.12)') : toolsTheme.surface
                              }}
                            >
                              <BouncyButton
                                onPress={() => {
                                  if (pdfContainerSelectModeTool) { toggleContainerSelected(c.id); return; }
                                  if (pdfSelectModeTool) return; // mid crop-page-select - don't let the active container shift under it
                                  setPdfActiveContainerId(c.id);
                                }}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                accessibilityRole="button"
                                accessibilityLabel={`Switch to ${c.name}`}
                                accessibilityState={{ selected: pdfContainerSelectModeTool ? isSelected : isActive }}
                              >
                                {pdfContainerSelectModeTool && (
                                  <View style={{
                                    width: 16, height: 16, borderRadius: RADIUS_8, alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: isSelected ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : 'transparent',
                                    borderWidth: isSelected ? 0 : 1.5, borderColor: toolsTheme.textSecondary
                                  }}>
                                    {isSelected && <Text style={{ color: WHITE, fontSize: 10, fontWeight: '800' }}>✓</Text>}
                                  </View>
                                )}
                                <View>
                                  <Text numberOfLines={1} style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700', maxWidth: 120 }}>{c.name}</Text>
                                  <Text style={{ color: toolsTheme.textSecondary, fontSize: 10 }}>{c.label}</Text>
                                </View>
                              </BouncyButton>
                              {!pdfContainerSelectModeTool && !pdfSelectModeTool && (
                                <BouncyButton onPress={() => setPdfTabCloseConfirmId(c.id)} style={{ padding: 2 }} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}>
                                  <Text style={{ color: toolsTheme.textSecondary, fontSize: 13, fontWeight: '700' }}>✕</Text>
                                </BouncyButton>
                              )}
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}

                  <View style={{ gap: 14 }}>
                  {containerPages.length > 0 && pdfSelectModeTool && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, backgroundColor: toolsTheme.surface, borderRadius: RADIUS_12, padding: 12 }}>
                      <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>
                        {pdfSelectedPageIds.length} page{pdfSelectedPageIds.length === 1 ? '' : 's'} selected
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <BouncyButton
                          style={{ paddingVertical: 6, paddingHorizontal: 12 }}
                          onPress={() => { setPdfSelectModeTool(null); setPdfSelectedPageIds([]); }}
                          accessibilityRole="button"
                        >
                          <Text style={{ color: toolsTheme.textSecondary, fontSize: 12.5, fontWeight: '600' }}>Cancel</Text>
                        </BouncyButton>
                        <BouncyButton
                          style={{
                            paddingVertical: 6, paddingHorizontal: 14, borderRadius: RADIUS_99,
                            backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_MID,
                            opacity: pdfSelectedPageIds.length === 0 ? 0.5 : 1
                          }}
                          onPress={startPdfCropQueue}
                          disabled={pdfSelectedPageIds.length === 0}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: pdfSelectedPageIds.length === 0 }}
                        >
                          <Text style={{ color: WHITE, fontSize: 12.5, fontWeight: '700' }}>Confirm</Text>
                        </BouncyButton>
                      </View>
                    </View>
                  )}
                  {!isWebWide && containerPages.length > 0 && (
                    <Text style={{ color: toolsTheme.textSecondary, fontSize: 11, marginTop: 8 }}>
                      {containerPages.length} {tt('pageCount')}
                    </Text>
                  )}

                  {isWebWide && containerPages.length === 0 && (
                    <View style={{
                      flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 10,
                      borderWidth: 1.5, borderStyle: 'dashed', borderColor: toolsTheme.border, borderRadius: RADIUS_14, padding: 40
                    }}>
                      <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '700' }}>{tt('nothingHereYet')}</Text>
                      <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, textAlign: 'center' }}>{tt('addFilesToStart')}</Text>
                    </View>
                  )}

                  {isWebWide ? (
                    containerPages.length > 0 && (() => {
                      const activePage = containerPages.find((p) => p.id === pdfActivePageId) || containerPages[0];
                      const activeIndex = containerPages.findIndex((p) => p.id === activePage.id);
                      const highResUri = pdfFullscreenHighResCache[`${activePage.sourceFileIndex}:${activePage.sourcePageIndex}`];
                      const displayUri = highResUri || activePage.thumbnailUri;
                      // Fills as much of the viewport height as this
                      // layout reasonably can - the image itself still
                      // uses resizeMode="contain" inside this box, so it
                      // always keeps its own aspect ratio and just grows
                      // to fit whichever dimension (height here, almost
                      // always) is the tighter constraint.
                      const pdfPreviewPaneHeight = Math.max(460, Dimensions.get('window').height - 260);
                      return (
                        <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, height: pdfPreviewPaneHeight }}>
                          {/* MAIN PREVIEW PANE - the big single-page view;
                              per-page tools (rotate, extract, insert,
                              delete, and the crop select-mode pill) all
                              act on whichever page is showing here, within
                              the active container only. */}
                          <View style={{ flex: 1, backgroundColor: toolsTheme.surface, borderRadius: RADIUS_14, borderWidth: 1, borderColor: toolsTheme.border, padding: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <Text style={{ color: toolsTheme.text, fontSize: 13, fontWeight: '700' }}>
                                Page {activeIndex + 1} of {containerPages.length}
                              </Text>
                            </View>

                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: toolsTheme.bg, borderRadius: RADIUS_10, overflow: 'hidden', position: 'relative' }}>
                              {pdfSelectModeTool && (
                                <BouncyButton
                                  onPress={() => togglePdfPageSelected(activePage.id)}
                                  style={{
                                    position: 'absolute', top: 10, right: 10, zIndex: 2, paddingVertical: 6, paddingHorizontal: 12,
                                    borderRadius: RADIUS_99, flexDirection: 'row', alignItems: 'center', gap: 5,
                                    backgroundColor: pdfSelectedPageIds.includes(activePage.id) ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : 'rgba(0,0,0,0.55)',
                                    borderWidth: pdfSelectedPageIds.includes(activePage.id) ? 0 : 1.5,
                                    borderColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY
                                  }}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Select page ${activeIndex + 1}`}
                                  accessibilityState={{ selected: pdfSelectedPageIds.includes(activePage.id) }}
                                >
                                  {pdfSelectedPageIds.includes(activePage.id) && <Text style={{ color: WHITE, fontSize: 12, fontWeight: '800' }}>✓</Text>}
                                  <Text style={{ color: WHITE, fontSize: 12, fontWeight: '700' }}>
                                    {pdfSelectedPageIds.includes(activePage.id) ? `Page ${activeIndex + 1} Selected` : `Select Page ${activeIndex + 1}`}
                                  </Text>
                                </BouncyButton>
                              )}
                              {displayUri ? (
                                <Image
                                  source={{ uri: displayUri }}
                                  style={{ width: '100%', height: '100%', transform: [{ rotate: `${activePage.rotation}deg` }] }}
                                  resizeMode="contain"
                                />
                              ) : (
                                <PdfIconSVG size={48} color={toolsTheme.textSecondary} />
                              )}
                              {pdfFullscreenHighResLoading && !highResUri && (
                                <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS_99, paddingVertical: 6, paddingHorizontal: 12 }}>
                                  <ActivityIndicator color={TEXT_PRIMARY} size="small" />
                                  <Text style={{ color: TEXT_PRIMARY, fontSize: 11 }}>Sharpening...</Text>
                                </View>
                              )}
                            </View>

                            {!pdfSelectModeTool && (
                              <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                                <BouncyButton
                                  style={{ width: 36, height: 36, borderRadius: RADIUS_99, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: toolsTheme.border }}
                                  onPress={() => rotatePdfEditorPage(activePage.id, -1)} accessibilityRole="button" accessibilityLabel="Rotate counter-clockwise"
                                >
                                  <RotateCCWIconSVG size={16} color={toolsTheme.textSecondary} />
                                </BouncyButton>
                                <BouncyButton
                                  style={{ width: 36, height: 36, borderRadius: RADIUS_99, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: toolsTheme.border }}
                                  onPress={() => rotatePdfEditorPage(activePage.id, 1)} accessibilityRole="button" accessibilityLabel="Rotate clockwise"
                                >
                                  <RotateCWIconSVG size={16} color={toolsTheme.textSecondary} />
                                </BouncyButton>
                                <BouncyButton
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                                  onPress={() => startSinglePageCrop(activePage.id)} accessibilityRole="button" accessibilityLabel="Crop this page"
                                >
                                  <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '600' }}>Crop</Text>
                                </BouncyButton>
                                <BouncyButton
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                                  onPress={() => handleExtractPage(activeIndex)} accessibilityRole="button" accessibilityLabel="Save this page as its own PDF"
                                >
                                  <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '600' }}>Extract Page</Text>
                                </BouncyButton>
                                <BouncyButton
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS_99, borderWidth: 1, borderColor: toolsTheme.border }}
                                  onPress={() => { setPdfAddPageAfterIndex(activeIndex); setPdfAddPageMenuVisible(true); }} accessibilityRole="button" accessibilityLabel="Add a page after this one"
                                >
                                  <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '600' }}>Add page</Text>
                                </BouncyButton>
                                <BouncyButton
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS_99, borderWidth: 1, borderColor: DANGER }}
                                  onPress={() => removePdfEditorPage(activePage.id)} accessibilityRole="button" accessibilityLabel="Remove page"
                                >
                                  <TrashIconSVG />
                                  <Text style={{ color: DANGER, fontSize: 12.5, fontWeight: '600' }}>Delete</Text>
                                </BouncyButton>
                              </View>
                            )}
                          </View>

                          {/* RIGHT RAIL - thumbnail navigation within the
                              active container. Drag to reorder, or use a
                              tile's own reorder pill (top-right, always
                              visible) for a precise typed position. */}
                          <View style={{ width: 168 }}>
                            <ScrollView style={{ height: pdfPreviewPaneHeight }} contentContainerStyle={{ gap: 10 }}>
                              {containerPages.map((page, index) => {
                                const isNewSourceBoundary = index > 0 && page.sourceFileIndex !== containerPages[index - 1].sourceFileIndex;
                                const isActive = page.id === activePage.id;
                                // Not true viewport-based virtualization
                                // (that would need scroll-position
                                // tracking, which risks interacting badly
                                // with the drag-to-reorder handlers below)
                                // - this is a simpler proxy that still
                                // catches the real cost for a large
                                // document: decoding and keeping resident
                                // potentially hundreds of thumbnail images
                                // at once. Pages far from whichever one is
                                // currently active show a plain number
                                // instead of decoding their image; jumping
                                // to that area (which changes the active
                                // page) brings the real thumbnails back.
                                // Small/typical documents never hit this
                                // at all - every page renders normally.
                                const isNearActive = containerPages.length <= 60 || Math.abs(index - activeIndex) <= 40;
                                return (
                                  <View
                                    key={page.id}
                                    style={{
                                      borderRadius: RADIUS_10, padding: 6, position: 'relative',
                                      backgroundColor: toolsTheme.surface,
                                      borderWidth: isActive ? 2 : (isNewSourceBoundary ? 2 : 1),
                                      borderColor: isActive
                                        ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY)
                                        : (isNewSourceBoundary ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border),
                                      borderStyle: isNewSourceBoundary && !isActive ? 'dashed' : 'solid'
                                    }}
                                    draggable
                                    onDragStart={() => setPdfDragIndex(index)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => { e.preventDefault(); if (pdfDragIndex !== null) reorderPdfEditorPages(pdfDragIndex, index); setPdfDragIndex(null); }}
                                    onDragEnd={() => setPdfDragIndex(null)}
                                  >
                                    {isNewSourceBoundary && (
                                      <Text style={{ color: toolsTheme.accent, fontSize: 8, fontWeight: '700', textAlign: 'center', marginBottom: 3 }}>NEW FILE</Text>
                                    )}
                                    <BouncyButton
                                      onPress={() => (pdfSelectModeTool ? togglePdfPageSelected(page.id) : setPdfActivePageId(page.id))}
                                      accessibilityRole="button"
                                      accessibilityLabel={pdfSelectModeTool ? `Select page ${index + 1}` : `Show page ${index + 1}`}
                                      accessibilityState={pdfSelectModeTool ? { selected: pdfSelectedPageIds.includes(page.id) } : { selected: isActive }}
                                    >
                                      <View style={{ width: '100%', aspectRatio: 0.75, borderRadius: RADIUS_6, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                        {page.thumbnailLoading ? (
                                          <ActivityIndicator color={toolsTheme.accent} size="small" />
                                        ) : page.thumbnailUri && isNearActive ? (
                                          <Image source={{ uri: page.thumbnailUri }} style={{ width: '100%', height: '100%', transform: [{ rotate: `${page.rotation}deg` }] }} resizeMode="contain" />
                                        ) : page.thumbnailUri ? (
                                          <Text style={{ color: toolsTheme.textSecondary, fontSize: 12, fontWeight: '700' }}>{index + 1}</Text>
                                        ) : (
                                          <PdfIconSVG size={20} color={toolsTheme.textSecondary} />
                                        )}
                                        {pdfSelectModeTool && pdfSelectedPageIds.includes(page.id) && (
                                          <View style={{ position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: RADIUS_9, backgroundColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY, alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ color: WHITE, fontSize: 11, fontWeight: '800' }}>✓</Text>
                                          </View>
                                        )}
                                        {!pdfSelectModeTool && renderPdfReorderPill(page, index, true)}
                                      </View>
                                    </BouncyButton>
                                  </View>
                                );
                              })}
                            </ScrollView>
                          </View>
                        </View>
                      );
                    })()
                  ) : (
                    <View style={{ gap: 12, marginTop: 10 }}>
                      {containerPages.map((page, index) => {
                        const isNewSourceBoundary = index > 0 && page.sourceFileIndex !== containerPages[index - 1].sourceFileIndex;
                        return (
                        <View
                          key={page.id}
                          style={{
                            width: '100%', backgroundColor: toolsTheme.surface, borderRadius: RADIUS_12, padding: 8, position: 'relative',
                            borderWidth: isNewSourceBoundary ? 2 : 1,
                            borderColor: isNewSourceBoundary ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY) : toolsTheme.border,
                            borderStyle: isNewSourceBoundary ? 'dashed' : 'solid'
                          }}
                        >
                          {isNewSourceBoundary && (
                            <Text style={{ color: toolsTheme.accent, fontSize: 9, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
                              NEW FILE
                            </Text>
                          )}
                          <BouncyButton
                            onPress={() => (pdfSelectModeTool ? togglePdfPageSelected(page.id) : setPdfFullscreenIndex(index))}
                            accessibilityRole="button"
                            accessibilityLabel={pdfSelectModeTool ? `Select page ${index + 1}` : `Open page ${index + 1}`}
                            accessibilityState={pdfSelectModeTool ? { selected: pdfSelectedPageIds.includes(page.id) } : undefined}
                          >
                          <View style={{
                            width: '100%', aspectRatio: 0.75, borderRadius: RADIUS_8, backgroundColor: toolsTheme.bg,
                            alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                          }}>
                            {page.thumbnailLoading ? (
                              <ActivityIndicator color={toolsTheme.accent} size="small" />
                            ) : page.thumbnailUri ? (
                              <Image
                                source={{ uri: page.thumbnailUri }}
                                style={{ width: '100%', height: '100%', transform: [{ rotate: `${page.rotation}deg` }] }}
                                resizeMode="contain"
                              />
                            ) : Platform.OS !== 'web' && containerPages.length <= PDF_NATIVE_GRID_PREVIEW_MAX_PAGES ? (
                              <PdfGridCardPreview container={activePdfContainer} page={page} />
                            ) : (
                              <PdfIconSVG size={28} color={toolsTheme.textSecondary} />
                            )}
                            {pdfSelectModeTool ? (
                              <View style={{
                                position: 'absolute', top: 10, right: 10, paddingVertical: 6, paddingHorizontal: 12,
                                borderRadius: RADIUS_99, flexDirection: 'row', alignItems: 'center', gap: 5,
                                backgroundColor: pdfSelectedPageIds.includes(page.id)
                                  ? (toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY)
                                  : 'rgba(0,0,0,0.55)',
                                borderWidth: pdfSelectedPageIds.includes(page.id) ? 0 : 1.5,
                                borderColor: toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY
                              }}>
                                {pdfSelectedPageIds.includes(page.id) && (
                                  <Text style={{ color: WHITE, fontSize: 12, fontWeight: '800' }}>✓</Text>
                                )}
                                <Text style={{ color: WHITE, fontSize: 12, fontWeight: '700' }}>
                                  {pdfSelectedPageIds.includes(page.id) ? `Page ${index + 1} Selected` : `Select Page ${index + 1}`}
                                </Text>
                              </View>
                            ) : renderPdfReorderPill(page, index, false)}
                          </View>
                          </BouncyButton>
                          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                            <BouncyButton onPress={() => rotatePdfEditorPage(page.id)} accessibilityRole="button" accessibilityLabel="Rotate page">
                              <RotateIconSVG size={15} color={toolsTheme.textSecondary} />
                            </BouncyButton>
                            <BouncyButton onPress={() => removePdfEditorPage(page.id)} accessibilityRole="button" accessibilityLabel="Remove page">
                              <TrashIconSVG />
                            </BouncyButton>
                          </View>
                        </View>
                        );
                      })}
                    </View>
                  )}
                  </View>
                </View>

                {isWebWide && (
                  <View>
                    <View style={{ height: 1, backgroundColor: toolsTheme.border, marginBottom: 20 }} />
                    <Text style={{ color: toolsTheme.text, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                      {tt('moreTools')}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                      {ALL_TOOLS_LIST.filter((t) => t.key !== 'pdfEditor').map(({ key, label, Icon }) => (
                        <BouncyButton
                          key={key}
                          style={{
                            alignItems: 'center', gap: 8, width: '23%',
                            backgroundColor: toolsTheme.surface, borderWidth: 1, borderColor: toolsTheme.border,
                            borderRadius: RADIUS_14, padding: 14
                          }}
                          onPress={() => requestSwitchTool(key)}
                          accessibilityRole="button"
                        >
                          <View style={{ width: 36, height: 36, borderRadius: RADIUS_10, backgroundColor: toolsTheme.bg, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={18} color={toolsThemeMode === 'light' ? BRAND_DEEP : BRAND_PRIMARY} />
                          </View>
                          <Text style={{ color: toolsTheme.text, fontSize: 12.5, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
                        </BouncyButton>
                      ))}
                    </View>
                  </View>
                )}
                </View>
              )}
            </AppKeyboardAwareScrollView>

            {/* Sticky footer - only the Compressor's Compress All/Download
                All, deliberately outside the ScrollView so it stays
                pinned to the bottom of the screen instead of scrolling
                away with the file list. PDF Editor no longer has a
                bottom footer - Export lives in the top header now. */}
            {activeTool === 'imageCompressor' && compressorFiles.length > 0 && !isWebWide && (
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 16, backgroundColor: toolsTheme.surface, borderTopWidth: 1, borderTopColor: toolsTheme.border }}>
                <BouncyButton
                  style={[styles.saveAccountSettingsBtn, { flex: 1, marginTop: 0, opacity: compressorProcessing ? 0.6 : 1 }]}
                  onPress={runCompressorBatch}
                  disabled={compressorProcessing || !compressorFiles.some((f) => f.status === 'pending' || f.status === 'error')}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: compressorProcessing, busy: compressorProcessing }}
                >
                  <Text style={styles.submitBtnText}>{compressorProcessing ? tt('compressing') : tt('compressAll')}</Text>
                </BouncyButton>
                <BouncyButton
                  style={[
                    styles.saveAccountSettingsBtn,
                    { flex: 1, marginTop: 0, backgroundColor: toolsTheme.bg, borderWidth: 1, borderColor: toolsTheme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
                    !compressorFiles.every((f) => f.status === 'done') && { opacity: 0.4 }
                  ]}
                  onPress={handleDownloadAllCompressed}
                  disabled={!compressorFiles.every((f) => f.status === 'done')}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !compressorFiles.every((f) => f.status === 'done') }}
                >
                  <><Text style={[styles.submitBtnText, { color: toolsTheme.text }]}>{tt('downloadAll')}</Text><ArrowRightIconSVG size={13} color={toolsTheme.text} /></>
                </BouncyButton>
              </View>
            )}
          </SafeAreaView>
        </Modal>
  );
}
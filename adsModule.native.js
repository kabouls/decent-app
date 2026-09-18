import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';

// Recomputed here rather than imported from App.js - this file is fully
// self-contained on purpose (same reasoning as pdfThumbnails.native.js:
// no import back into App.js, so there's no risk of this platform-split
// pair somehow pulling App.js's own dependency tree into the mix). One
// duplicated one-line constant is a fair trade for that isolation.
const ADS_ENABLED = process.env.EXPO_PUBLIC_DECENT_DISTRIBUTION === 'playstore';

// AdMob SDK init - once, on mount, called from App.js. Lazy require()
// inside the function body, not a top-level import - this project's own
// incident history (b752 era) is a direct lesson: a top-level import of
// a native module not linked on every build profile crashed the ENTIRE
// app on launch. That's about RUNTIME crashes though - the reason this
// code lives in its own .native.js file at all is a DIFFERENT, earlier
// problem: Metro's bundler statically walks into whatever a require()
// points at regardless of any runtime conditional around it, and for
// the WEB bundle specifically, react-native-google-mobile-ads' own
// internals import a React Native-only module Metro can't resolve on
// web at all. The .native.js/.web.js split is what actually keeps
// Metro from ever attempting that resolution for the web target - the
// lazy require() alone (still present below) only guards the runtime
// crash case on native builds where the plugin isn't linked.
export const initAds = () => {
  if (!ADS_ENABLED) return;
  try {
    const AdMob = require('react-native-google-mobile-ads');
    AdMob.default().initialize();
  } catch (e) {
    // Silently skip - a missing/broken native binding here should never
    // take down the rest of the app over an ads feature.
  }
};

// In-feed native ad card - For You only (see App.js's forYouProjectsWithAds
// for the interleaving logic; every other feed/grid never produces isAd
// items at all, so this component only ever mounts there).
//
// Asset API verified directly against the library's own docs (not
// guessed): nativeAd.headline / .body / .cta / .icon.url are the real
// property names, NativeAssetType.HEADLINE/BODY/CTA/ICON the real enum
// values. Critically, an asset view registered via NativeAsset must be a
// DIRECT child with no wrapping View/TouchableOpacity around it - the
// SDK's own click/impression tracking breaks if you do, per the
// library's explicit "Do/Don't" example. The CTA "button" look below is
// done by styling the Text itself (padding/backgroundColor/borderRadius
// all work directly on RN Text), not by wrapping it.
//
// The AD badge and dismiss X are deliberately siblings of NativeAdView,
// not descendants of it - keeping them completely outside the ad's own
// view hierarchy so there's no chance of interfering with its
// click/impression tracking, which would be a real policy problem, not
// just a bug.
//
// Uses plain TouchableOpacity for the dismiss button, not App.js's own
// BouncyButton - this file is self-contained and doesn't import
// anything back from App.js, same reasoning as the ADS_ENABLED constant
// above. A plain press affordance is a fair trade for that isolation.
export const NativeAdCard = React.memo(({ onDismiss, customWidth, styles, theme }) => {
  const [nativeAd, setNativeAd] = useState(null);
  const [AdMobModule, setAdMobModule] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ADS_ENABLED) return;
    let cancelled = false;
    let createdAd = null;
    try {
      const AdMob = require('react-native-google-mobile-ads');
      AdMob.NativeAd.createForAdRequest(AdMob.TestIds.NATIVE) // TODO: swap for the real Native ad unit ID once one exists in AdMob
        .then((ad) => {
          if (cancelled) { ad.destroy(); return; }
          createdAd = ad;
          setAdMobModule(AdMob);
          setNativeAd(ad);
        })
        .catch(() => { if (!cancelled) setFailed(true); });
    } catch (e) {
      setFailed(true);
    }
    return () => {
      cancelled = true;
      if (createdAd) createdAd.destroy(); // frees native resources - the docs are explicit this should always happen, not just on error paths
    };
  }, []);

  if (!ADS_ENABLED || failed || !nativeAd || !AdMobModule) return null;

  const { NativeAdView, NativeAsset, NativeMediaView, NativeAssetType } = AdMobModule;

  return (
    <View style={[styles.card, customWidth ? { width: customWidth } : null, { overflow: 'hidden' }]}>
      <View style={{
        position: 'absolute', top: 8, left: 8, zIndex: 2,
        backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
        flexDirection: 'row', alignItems: 'center', gap: 4
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>AD</Text>
      </View>
      <TouchableOpacity
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 2,
          width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.65)',
          alignItems: 'center', justifyContent: 'center'
        }}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss ad"
      >
        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>✕</Text>
      </TouchableOpacity>
      <NativeAdView nativeAd={nativeAd}>
        <NativeMediaView style={{ width: '100%', aspectRatio: 1.3 }} resizeMode="cover" />
        <View style={{ padding: 12, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {nativeAd.icon && (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image source={{ uri: nativeAd.icon.url }} style={{ width: 28, height: 28, borderRadius: 8 }} />
              </NativeAsset>
            )}
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{nativeAd.headline}</Text>
            </NativeAsset>
          </View>
          {nativeAd.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16 }} numberOfLines={2}>{nativeAd.body}</Text>
            </NativeAsset>
          ) : null}
          {nativeAd.cta ? (
            <NativeAsset assetType={NativeAssetType.CTA}>
              <Text style={{
                color: '#FFFFFF', fontSize: 12, fontWeight: '700', backgroundColor: '#8B5CF6',
                borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
                alignSelf: 'flex-start', marginTop: 6, overflow: 'hidden'
              }}>{nativeAd.cta}</Text>
            </NativeAsset>
          ) : null}
        </View>
      </NativeAdView>
    </View>
  );
});

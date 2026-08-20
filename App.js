import { supabase } from './supabase';
import * as Sentry from '@sentry/react-native';

// Crash reporting - confirmed working on a real build. Only reports in
// production builds now, not local dev/testing sessions.
Sentry.init({
  dsn: 'https://173e0ae3dd89b8d2a1c3b7e814f7a97c@o4511845362171904.ingest.us.sentry.io/4511845368725504',
  tracesSampleRate: 1.0,
  enabled: !__DEV__
});
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  StatusBar,
  Linking,
  ActivityIndicator,
  Alert,
  TextInput,
  Animated,
  PanResponder,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ToastAndroid,
  RefreshControl,
  AppState,
  Keyboard,
  Switch,
  Share,
  Appearance,
  BackHandler,
  Easing
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView as NativeWebView } from 'react-native-webview';
import { KeyboardAwareScrollView as NativeKeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Svg, { Rect, Path, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import qrcodeGenerator from 'qrcode-generator';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { BlurView } from 'expo-blur';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import NetInfo from '@react-native-community/netinfo';
import * as Updates from 'expo-updates';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import * as MediaLibrary from 'expo-media-library';

// KeyboardAwareScrollView is a mobile-only concept (compensating for a
// virtual keyboard covering content). On web there's no virtual keyboard to
// dodge, and the native lib doesn't support web, so this swaps in a plain
// ScrollView there and strips the mobile-only props (enableOnAndroid,
// extraScrollHeight) that ScrollView doesn't know about. Native behavior
// (NativeKeyboardAwareScrollView) is untouched.
const AppKeyboardAwareScrollView = Platform.OS === 'web'
  ? ({ enableOnAndroid, extraScrollHeight, ...rest }) => <ScrollView {...rest} />
  : NativeKeyboardAwareScrollView;

// react-native-webview has no web support at all. The only usage here is
// the Figma prototype embed, which is just a URL in an iframe - so on web
// this swaps in a plain <iframe>. Navigation interception
// (onShouldStartLoadWithRequest) has no iframe equivalent and is dropped;
// that's fine since it exists to catch links escaping the embed on native,
// and a cross-origin iframe can't navigate the parent page anyway.
const AppWebView = Platform.OS === 'web'
  ? ({ source, style, onLoadEnd }) => (
      <View style={style}>
        <iframe
          src={source && source.uri}
          onLoad={onLoadEnd}
          title="Prototype preview"
          style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#000' }}
        />
      </View>
    )
  : NativeWebView;

// NetInfo has no web implementation. This provides a matching-shape
// fallback backed by the browser's navigator.onLine + online/offline
// events, so the two NetInfo.addEventListener/.fetch call sites don't need
// to branch on Platform.OS themselves.
const NetInfoCompat = Platform.OS === 'web'
  ? {
      addEventListener: (callback) => {
        const notify = () => callback({ isConnected: navigator.onLine, isInternetReachable: navigator.onLine });
        window.addEventListener('online', notify);
        window.addEventListener('offline', notify);
        // Fire once immediately so initial state is correct, matching
        // NetInfo's behavior of calling back with current state on subscribe.
        notify();
        return () => {
          window.removeEventListener('online', notify);
          window.removeEventListener('offline', notify);
        };
      },
      fetch: () => Promise.resolve({ isConnected: navigator.onLine, isInternetReachable: navigator.onLine })
    }
  : NetInfo;

const RAW_WINDOW_WIDTH = Dimensions.get('window').width;
// On web the app is visually constrained to a 480px-wide column (see the
// wrapper added around the main app render and AuthScreen), but
// Dimensions.get('window') still reports the full, much wider browser
// window. Any layout math based on the raw value was sizing things for a
// browser-width canvas that doesn't actually exist visually, causing
// images/cards to overflow past the constrained column. Capping this at
// the source fixes every downstream calculation at once rather than
// hunting down each individual usage.
// Real live domain - was a placeholder until the app was actually deployed.
// If the Vercel team slug ever gets renamed, this needs updating to match
// (the URL includes that slug: <project>-<team-slug>.vercel.app).
const DECENT_APP_DOMAIN = 'https://decent-portfolio-decent6.vercel.app';
// Two deliberately separate numbers, each answering a different question:
// APP_VERSION mirrors app.json's real "version" field - only bump this
// alongside an actual native rebuild (it's what the update-banner system
// compares against app_config in Supabase, and it's tied to EAS Update's
// runtimeVersion compatibility - bumping it without rebuilding would break
// OTA eligibility for everyone already installed). BUILD_NUMBER bumps on
// every single change regardless of size, JS-only or native - it's purely
// "did the latest code actually reach this device", no functional meaning
// beyond that, safe to increment freely on every edit.
const APP_VERSION = '0.2.0';
const BUILD_NUMBER = 345;
// Fill these in with your real donation links before this goes live -
// paypal.me/yourname (create at paypal.me) and your Wise payment link
// (create at wise.com -> Get paid -> Share payment details). Both buttons
// below already open whichever URL is set here via openExternalLinkWithWarning.
const KO_FI_URL = 'https://ko-fi.com/iputra07';
const GITHUB_URL = 'https://github.com/kabouls/decent-app';

const SCREEN_WIDTH = Platform.OS === 'web' ? Math.min(RAW_WINDOW_WIDTH, 480) : RAW_WINDOW_WIDTH;
// Required by expo-web-browser so the native OAuth browser session (Google
// sign-in) properly closes and hands control back to the app once the
// redirect completes. No-op on web.
if (Platform.OS !== 'web') {
  WebBrowser.maybeCompleteAuthSession();
}
// Header toast pill: expands to reach the bell icon with the same gap the
// bell and gear icons have between each other. header paddingHorizontal
// (20*2) + bell (36) + gear (36) + gap between them (10) + matching gap
// before the pill (10).
const TOAST_PILL_WIDTH = SCREEN_WIDTH - 132;
// Web-only hamburger nav drawer width - slides in from the left, covering
// most but not all of the 480px mobile-web column so the backdrop is still
// visibly tappable to dismiss.
const HAMBURGER_DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.8);
const STORAGE_KEY = '@portfolio_projects_v1';
const FOLLOWED_KEY = '@followed_designers_v1';
const HIDE_LIKED_KEY = '@hide_liked_portfolios_v1';
const formatCount = (n) => {
  const num = n || 0;
  if (num < 1000) return String(num);
  if (num < 1000000) {
    const k = num / 1000;
    return (Number.isInteger(k) ? k : k.toFixed(1)) + 'k';
  }
  const m = num / 1000000;
  return (Number.isInteger(m) ? m : m.toFixed(1)) + 'm';
};

const formatHandleDisplay = (h) => (h ? `@${h.replace(/^@/, '')}` : '');

const getPasswordRequirements = (pw) => [
  { key: 'length', label: 'At least 8 characters', met: pw.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', met: /[A-Z]/.test(pw) },
  { key: 'lower', label: 'One lowercase letter', met: /[a-z]/.test(pw) },
  { key: 'number', label: 'One number', met: /[0-9]/.test(pw) },
  { key: 'symbol', label: 'One symbol (e.g. ! @ # $)', met: /[^A-Za-z0-9]/.test(pw) }
];

const isPasswordStrong = (pw) => getPasswordRequirements(pw).every((r) => r.met);

const formatCompactNumber = (num) => {
  const n = num || 0;
  if (n < 1000) return `${n}`;
  if (n < 1000000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  const m = n / 1000000;
  return `${m % 1 === 0 ? m : m.toFixed(1)}m`;
};

const formatRelativeTime = (isoString) => {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const USER_PROFILE_KEY = '@user_profile_v1';
const ONBOARDING_KEY = '@onboarding_done_v1';
const INTRO_SEEN_KEY = '@intro_carousel_seen_v1';
const CIRCLE_LAST_SEEN_KEY = '@circle_last_seen_v1';

const RESPONSIVE_PROFILE_CARD_WIDTH = (SCREEN_WIDTH - 40 - 16) / 2;

// Row(2-up) block images default to roughly a square footprint (matching
// the column's own width), and the text side of a row matches that same
// height so both halves read as one balanced row.
const ROW_BLOCK_IMAGE_HEIGHT = (SCREEN_WIDTH - 66) / 2;
const STANDALONE_IMAGE_WIDTH = SCREEN_WIDTH - 64;

// Image blocks only ever have two possible aspect ratios - square (the
// width) or 16:9 (width * 9/16) - toggled by dragging up/down on the block.
const getImageBlockHeight = (aspectMode, width) => (aspectMode === 'wide' ? width * (9 / 16) : width);

const ALL_UIUX_CATEGORIES_MASTER = [
  'AI & Machine Learning',
  'Adobe XD',
  'Android',
  'AR/VR Interface',
  'Automotive HMI',
  'Branding & Identity',
  'Crypto & Web3',
  'Dashboard & Analytics',
  'Design System',
  'Desktop App',
  'E-Commerce',
  'EdTech',
  'Entertainment',
  'Figma',
  'Figma Prototype',
  'Figma Tokens',
  'FinTech',
  'Fitness & Sports',
  'Food & Beverage',
  'Framer',
  'Gaming & Esports',
  'Healthcare',
  'InsurTech',
  'iOS',
  'IoT & Smart Home',
  'LegalTech',
  'Logistics & Supply Chain',
  'Micro-interactions',
  'Mobile App',
  'Protopie',
  'Real Estate',
  'Responsive Web',
  'Rive Animation',
  'SaaS',
  'Social Media',
  'Spatial Computing',
  'Spline 3D',
  'Telehealth',
  'Travel & Hospitality',
  'User Research & Persona',
  'VisionOS',
  'WatchOS & Wearables',
  'Web Design',
  'Wireframing & User Flow',
  '3D Assets & Animation'
].sort();

const DEFAULT_POPULAR_CATEGORY_CHIPS = [
  'Mobile App', 'Web Design', 'Design System', 'FinTech',
  'Healthcare', 'E-Commerce', 'SaaS', 'AI & Machine Learning',
  'Dashboard & Analytics', 'Figma Prototype'
];

// SVG Icons
const MobileFilledIconSVG = React.memo(({ color = '#C084FC', size = 14 }) => (
  <Svg width={size} height={size * 1.4} viewBox="0 0 18 26" fill="none">
    <Rect x="1" y="1" width="16" height="24" rx="3" fill={color} />
    <Circle cx="9" cy="21.5" r="1.1" fill="#0B0F17" />
  </Svg>
));

const DesktopFilledIconSVG = React.memo(({ color = '#C084FC', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="3" width="20" height="13" rx="2" fill={color} />
    <Rect x="9" y="18" width="6" height="3" rx="1" fill={color} />
  </Svg>
));

const ImageFilledIconSVG = React.memo(({ color = '#C084FC', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="3" width="20" height="18" rx="3" fill={color} />
    <Circle cx="8" cy="9" r="2" fill="#0B0F17" />
    <Path d="M4 18l6-6 4 4 6-7v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#0B0F17" />
  </Svg>
));

const VideoFilledIconSVG = React.memo(({ color = '#C084FC', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="5" width="15" height="14" rx="2" fill={color} />
    <Path d="M17 10L22 7V17L17 14Z" fill={color} />
  </Svg>
));

const MobileIconSVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Rect x="6" y="2" width="12" height="20" rx="2.5" stroke="#FFFFFF" strokeWidth="2" />
    <Path d="M12 18h.01" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
));

const DesktopIconSVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="3" width="20" height="13" rx="2" stroke="#FFFFFF" strokeWidth="2" />
    <Path d="M8 21h8M12 16v5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const HeartIconSVG = React.memo(({ liked, color = '#94A3B8', monochrome = false, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={liked && !monochrome ? '#EF4444' : 'none'}>
    <Path
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      stroke={liked && !monochrome ? '#EF4444' : color}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </Svg>
));

const GitHubIconSVG = React.memo(({ color = '#94A3B8', size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.85 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
  </Svg>
));

// Brief milestone easter eggs: the heart itself swaps to a meme/emoji for a
// moment when a like lands the count exactly on one of these numbers.
const getLikeMilestoneEgg = (newCount) => {
  if (newCount === 67) return { emoji: '🤚6️⃣7️⃣', fontSize: 14 };
  if (newCount === 69) return { text: 'nice', color: '#8B5CF6' };
  if (newCount === 420) return { emoji: '🌿', fontSize: 20 };
  return null;
};

// Reusable like button: pop animation on every tap, plus a very brief
// milestone easter egg (heart -> meme/emoji/text -> heart) when the like
// lands the count on 67 / 69 / 420.
// Per-chip translucent background for the category filter bar (For You tab).
// Deliberately per-button rather than one blur behind the whole horizontal
// row - each pill gets its own blur/tint respecting its own rounded shape.
const CategoryChipBg = React.memo(({ active }) => {
  const { themeMode } = useTheme();
  const { lightweightMode } = useLightweightMode();
  if (Platform.OS === 'web') return null;
  if (lightweightMode) {
    return (
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: active ? '#8B5CF6' : (themeMode === 'light' ? '#FFFFFF' : '#1E2330')
      }} />
    );
  }
  return (
    <>
      <BlurView
        intensity={30}
        tint={themeMode === 'light' ? 'light' : 'dark'}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {active && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(139, 92, 246, 0.55)' }} />
      )}
    </>
  );
});

const LikeButton = React.memo(({ liked, likesCount, onPress, showCount = false, countStyle, color = '#94A3B8', style, translucentBg = false, monochrome = false, size = 22 }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [egg, setEgg] = useState(null);
  const eggTimeoutRef = useRef(null);
  const { theme, themeMode } = useTheme();
  const { lightweightMode } = useLightweightMode();

  const handlePress = () => {
    scaleAnim.setValue(0.55);
    Animated.spring(scaleAnim, { toValue: 1, friction: 3.5, tension: 140, useNativeDriver: true }).start();

    if (!liked) {
      const milestone = getLikeMilestoneEgg((likesCount || 0) + 1);
      if (milestone) {
        if (eggTimeoutRef.current) clearTimeout(eggTimeoutRef.current);
        setEgg(milestone);
        eggTimeoutRef.current = setTimeout(() => setEgg(null), 900);
      }
    }
    onPress();
  };

  return (
    <TouchableOpacity style={[style, showCount && { alignItems: 'center' }]} onPress={handlePress}>
      {/* Opt-in translucent blur background - only the floating like button
          in the portfolio detail view uses this (native only); every other
          LikeButton usage (feed cards, grids, etc.) is unaffected since this
          defaults to false. */}
      {translucentBg && Platform.OS !== 'web' && (
        lightweightMode ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.surface }} />
        ) : (
          <BlurView
            intensity={45}
            tint={themeMode === 'light' ? 'light' : 'dark'}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        )
      )}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {egg ? (
          egg.text ? (
            <Text style={{ fontSize: 13, fontWeight: '800', color: egg.color }}>{egg.text}</Text>
          ) : (
            <Text style={{ fontSize: egg.fontSize }}>{egg.emoji}</Text>
          )
        ) : (
          <HeartIconSVG liked={liked} color={color} monochrome={monochrome} size={size} />
        )}
      </Animated.View>
      {showCount && <Text style={countStyle}>{formatCompactNumber(likesCount)}</Text>}
    </TouchableOpacity>
  );
});

const EyeOpenSVG = React.memo(({ color = '#FFFFFF', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2"/>
  </Svg>
));

const EyeClosedSVG = React.memo(({ color = '#C084FC', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 3l18 18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <Path d="M10.6 5.2A11 11 0 0 1 12 5c7 0 11 7 11 7a17.7 17.7 0 0 1-3.4 4.3M6.6 6.6C3.9 8.3 2 11 2 11s4 7 10 7a9.8 9.8 0 0 0 4.4-1M9.5 9.5a3 3 0 0 0 4.2 4.2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
));

const EyeViewIconSVG = React.memo(({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2"/>
  </Svg>
));

const BellSVG = React.memo(({ active = false, inactiveColor = '#D8B4FE' }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke={active ? '#FFFFFF' : inactiveColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

// Same bell shape as BellSVG above (notification icon), but with the
// standard flexible color/size prop pattern used elsewhere (EyeViewIconSVG,
// ChevronRightSVG, etc.) instead of that one's fixed size + boolean
// active/inactiveColor scheme - kept separate rather than changing
// BellSVG's props, since that one's already relied on exactly as-is by the
// notification icon.
const BellOutlineSVG = React.memo(({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const CodeBracketsSVG = React.memo(({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8 4L2 12l6 8M16 4l6 8-6 8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const PaintBrushSVG = React.memo(({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M7 17c-1.1 0-2 .9-2 2s-1 3-3 3c2.5 0 5-1 5-4 0-.55.45-1 1-1s1 .45 1 1c0 2 1.5 3 3 3 2 0 3-1.5 3-3.5 0-.83-.34-1.58-.88-2.12L9.6 10.9"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9.6 10.9L18 2.5c.83-.83 2.17-.83 3 0s.83 2.17 0 3L12.6 14"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
));

// Classic palette shape - used for Graphic Design specifically so it reads
// as visually distinct from Illustration's brush icon, and deliberately
// not Figma (that logo's now exclusively tied to UI/UX to avoid the two
// design-adjacent types looking interchangeable).
const PaletteSVG = React.memo(({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3C7.03 3 3 6.58 3 11c0 2.76 2.24 5 5 5h1a2 2 0 0 1 2 2v.5a1.5 1.5 0 0 0 1.5 1.5c4.42 0 8-3.58 8-8 0-5-4.03-9-9-9z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <Circle cx="7.5" cy="10.5" r="1.3" fill={color} />
    <Circle cx="11" cy="7" r="1.3" fill={color} />
    <Circle cx="15.5" cy="8" r="1.3" fill={color} />
  </Svg>
));

const CursorArrowSVG = React.memo(({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 3l16 6-6.5 2.5L11 18 4 3z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color === 'none' ? 'none' : color} fillOpacity="0.15" />
  </Svg>
));

const HamburgerSVG = React.memo(({ active = false, inactiveColor = '#D8B4FE', size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 6h18M3 12h18M3 18h18" stroke={active ? '#FFFFFF' : inactiveColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const CogWheelSVG = React.memo(({ active = false, inactiveColor = '#D8B4FE' }) => (
  <Svg width="19" height="19" viewBox="0 0 24 24" fill="none">
    <Path
      d="M19.14 12.94C19.18 12.63 19.2 12.32 19.2 12C19.2 11.68 19.18 11.37 19.14 11.06L21.16 9.48C21.34 9.34 21.39 9.09 21.28 8.89L19.36 5.56C19.25 5.36 19 5.28 18.79 5.36L16.41 6.22C15.92 5.84 15.39 5.53 14.81 5.29L14.45 2.76C14.41 2.54 14.22 2.38 14 2.38H10C9.78 2.38 9.59 2.54 9.55 2.76L9.19 5.29C8.61 5.53 8.08 5.85 7.59 6.22L5.21 5.36C5 5.28 4.75 5.36 4.64 5.56L2.72 8.89C2.61 9.09 2.66 9.34 2.84 9.48L4.86 11.06C4.82 11.37 4.8 11.69 4.8 12C4.8 12.31 4.82 12.63 4.86 12.94L2.84 14.52C2.66 14.66 2.61 14.91 2.72 15.11L4.64 18.44C4.75 18.64 5 18.72 5.21 18.64L7.59 17.78C8.08 18.16 8.61 18.47 9.19 18.71L9.55 21.24C9.59 21.46 9.78 21.62 10 21.62H14C14.22 21.62 14.41 21.46 14.45 21.24L14.81 18.71C15.39 18.47 15.92 18.16 16.41 17.78L18.79 18.64C19 18.72 19.25 18.64 19.36 18.44L21.28 15.11C21.39 14.91 21.34 14.66 21.16 14.52L19.14 12.94ZM12 15.5C10.34 15.5 9 14.16 9 12.5C9 10.84 10.34 9.5 12 9.5C13.66 9.5 15 10.84 15 12.5C15 14.16 13.66 15.5 12 15.5Z"
      fill={active ? '#FFFFFF' : inactiveColor}
    />
  </Svg>
));

const ChevronRightSVG = React.memo(({ color = "#8B5CF6", size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const ChevronDownSVG = React.memo(({ color = "#8B5CF6", size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

// DECENT app logo mark - the cursor/arrow shape in the center is a genuine
// cutout, not a colored overlay (two subpaths in one <Path>, default
// nonzero fill-rule creates the hole where they wind in opposite
// directions - preserved exactly as given, no fillRule override). Because
// it's a real hole, it shows whatever's directly behind it - so this needs
// to sit over a themed background (theme.bg or theme.surface, whichever
// the surrounding context actually uses) to read correctly in both light
// and dark mode, not a hardcoded color guess.
const DECENT_LOGO_PATH_D = "M48.5 0C75.2858 0 97 21.7142 97 48.5C97 75.2858 75.2858 97 48.5 97H20C8.95431 97 0 88.0457 0 77V20C6.44299e-07 8.95431 8.95431 0 20 0H48.5ZM36.7041 28.6562C33.7232 26.8301 29.9149 29.0382 30.001 32.542L30.8018 65.6719C30.9022 69.8452 36.1712 71.5734 38.7051 68.2617L46.9043 57.5459C47.2561 57.0851 47.6955 56.6985 48.1963 56.4082C48.697 56.118 49.2499 55.93 49.8232 55.8545L63.1641 54.083C67.2876 53.5382 68.4326 48.0903 64.8828 45.916L36.7041 28.6562Z";
const DecentLogoSVG = React.memo(({ size = 32, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 97 97" fill="none">
    <Path
      d={DECENT_LOGO_PATH_D}
      fill={color}
    />
  </Svg>
));

// Pure computation, no JSX - shared by CircularQRCode's on-screen render
// below AND the exact-match download path (web canvas / native svg
// export), so both draw from the exact same source of truth and can never
// visually drift apart from each other. Kept outside the component (module
// scope) since it has no reason to be recreated per-render or tied to any
// component instance - the qrcode-generator call itself is memoized inside
// CircularQRCode via useMemo already, this just factors out the reusable
// part.
const buildQrMatrix = (value) => {
  if (!value) return null;
  try {
    const qr = qrcodeGenerator(0, 'H');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const grid = [];
    for (let row = 0; row < count; row++) {
      const rowArr = [];
      for (let col = 0; col < count; col++) rowArr.push(qr.isDark(row, col));
      grid.push(rowArr);
    }
    return { grid, count };
  } catch (e) {
    console.warn('QR encoding failed:', e);
    return null;
  }
};

// Fixed, version-independent rule: the three finder patterns always sit in
// exactly these three 7x7 corners, regardless of how large the QR code
// grid is overall.
const isQrFinderZone = (row, col, count) => {
  if (row < 7 && col < 7) return true; // top-left
  if (row < 7 && col >= count - 7) return true; // top-right
  if (row >= count - 7 && col < 7) return true; // bottom-left
  return false;
};

// Draws one finder-pattern "eye" as 3 nested rounded squares (7x7 outer
// ring, 5x5 gap, 3x3 center) instead of rendering it cell-by-cell from the
// raw bit matrix - that's what actually allows the corners to be rounded
// cleanly as one shape rather than a cluster of individually-rounded tiny
// grid cells, which would look messy rather than like a smooth rounded
// square. The 7:5:3 nested proportions (the standard finder pattern ratio)
// are preserved exactly, only the corners are softened - scanners key off
// that ratio along their scan lines, not corner sharpness, so this stays
// safe unlike making the eyes fully circular would be.
const QrFinderEye = ({ gridX, gridY, cellSize, color, backgroundColor }) => {
  const outerSize = cellSize * 7;
  const outerRadius = outerSize * 0.22;
  const gapInset = cellSize * 1;
  const gapSize = outerSize - gapInset * 2;
  const gapRadius = gapSize * 0.22;
  const centerInset = cellSize * 2;
  const centerSize = outerSize - centerInset * 2;
  const centerRadius = centerSize * 0.28;
  const x0 = gridX * cellSize;
  const y0 = gridY * cellSize;

  return (
    <>
      <Rect x={x0} y={y0} width={outerSize} height={outerSize} rx={outerRadius} fill={color} />
      <Rect x={x0 + gapInset} y={y0 + gapInset} width={gapSize} height={gapSize} rx={gapRadius} fill={backgroundColor} />
      <Rect x={x0 + centerInset} y={y0 + centerInset} width={centerSize} height={centerSize} rx={centerRadius} fill={color} />
    </>
  );
};

// Renders a QR code with circular data dots instead of the default square
// modules, using qrcode-generator (a pure-JS, zero-dependency encoder - no
// native/canvas code, verified before adding) for the actual bit matrix,
// then drawing it manually with react-native-svg (already a dependency).
// The 3 corner finder patterns are deliberately kept as solid squares
// Reusable animated pill tab-switcher - same spring-slide mechanism as the
// original Portfolios/Liked Portfolios tab (profileTabSlideAnim), pulled
// out into one component so all the app's other tab switches (previously
// plain conditional-background, no motion) can share it instead of each
// having its own hand-rolled copy. Each tab's width is measured
// individually via its own onLayout rather than dividing the container
// evenly, so this correctly supports both uniform-width tab sets and
// intentionally asymmetric ones (e.g. a "hug content" tab next to a
// "flex:1" one) without needing separate code paths for each case. Width
// itself isn't animated (React Native's native driver can't animate layout
// properties, only transform/opacity) - only horizontal position slides,
// so switching between differently-sized tabs will snap-resize instantly
// while still sliding smoothly, which is barely noticeable in practice for
// a two-tab switcher used occasionally.
// Plain background image, no blur/fade/opacity effects applied in code -
// whatever the image file itself looks like is exactly what renders. Fade,
// blur, and any other visual treatment are expected to already be baked
// into the image files themselves before they're placed in
// assets/card-images/.
const PortfolioTypeCardWatermark = ({ imageSource }) => (
  <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
    <Image
      source={imageSource}
      resizeMode="cover"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    />
  </View>
);

const AnimatedPillTabs = React.memo(({ tabs, activeKey, onChange, theme, themeMode, containerStyle }) => {
  const [tabWidths, setTabWidths] = useState({});
  const activeIndex = tabs.findIndex((t) => t.key === activeKey);
  // Was hardcoded to 0, silently assuming the first tab is always the
  // initial default - broke any switcher (like the QR modal's Plain/DECENT
  // Style, which defaults to the second tab) where that's not true: the
  // pill's SIZE correctly reflected the real active tab, but its POSITION
  // stayed stuck at index 0 forever, since the correction animation below
  // only fires on an actual activeKey CHANGE, which never happens if the
  // initial tab was already correct from the start.
  const slideAnim = useRef(new Animated.Value(activeIndex)).current;
  const prevActiveKeyRef = useRef(activeKey);

  useEffect(() => {
    if (prevActiveKeyRef.current === activeKey) return;
    prevActiveKeyRef.current = activeKey;
    Animated.spring(slideAnim, {
      toValue: activeIndex,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6
    }).start();
  }, [activeKey]);

  const allWidthsKnown = tabs.length > 0 && tabs.every((t) => tabWidths[t.key] > 0);
  const offsets = [];
  let cumulative = 4; // starting inset matches the container's own padding:4
  for (let i = 0; i < tabs.length; i++) {
    offsets.push(cumulative);
    cumulative += (tabWidths[tabs[i].key] || 0);
  }

  return (
    <View style={[{ flexDirection: 'row', backgroundColor: theme.bg, borderRadius: 99, padding: 4 }, containerStyle]}>
      {allWidthsKnown && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 4, bottom: 4,
            width: tabWidths[tabs[activeIndex].key],
            borderRadius: 99,
            backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
            transform: [{
              translateX: tabs.length > 1
                ? slideAnim.interpolate({ inputRange: tabs.map((_, i) => i), outputRange: offsets })
                : offsets[0]
            }]
          }}
        />
      )}
      {tabs.map((tab) => (
        <BouncyButton
          key={tab.key}
          style={[tab.flex === false ? {} : { flex: 1 }, { paddingVertical: 9, paddingHorizontal: tab.flex === false ? 10 : 0, alignItems: 'center' }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setTabWidths((prev) => (prev[tab.key] === w ? prev : { ...prev, [tab.key]: w }));
          }}
          onPress={() => onChange(tab.key)}
        >
          {tab.icon ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
              {tab.icon(activeKey === tab.key ? '#FFFFFF' : theme.textSecondary)}
              <Text style={{ color: activeKey === tab.key ? '#FFFFFF' : theme.textSecondary, fontWeight: '700', fontSize: 12.5 }}>
                {tab.label}
              </Text>
            </View>
          ) : (
            <Text style={{ color: activeKey === tab.key ? '#FFFFFF' : theme.textSecondary, fontWeight: '700', fontSize: 12.5 }}>
              {tab.label}
            </Text>
          )}
        </BouncyButton>
      ))}
    </View>
  );
});

// Renders a QR code with circular data dots instead of the default square
// modules, using qrcode-generator (a pure-JS, zero-dependency encoder - no
// native/canvas code, verified before adding) for the actual bit matrix,
// then drawing it manually with react-native-svg (already a dependency).
// The 3 corner finder patterns are deliberately kept as solid squares
// rather than circles - scanners specifically rely on that exact square
// 1:1:3:1:1 ratio to detect a QR code exists at all before even attempting
// to read the data, so making those circular risks scan failures on
// stricter scanners. Everything else (data modules, alignment pattern,
// timing pattern) renders as circles for the dotted look.
// forwardRef so the download flow (native path specifically) can reach the
// underlying <Svg> to call its own .toDataURL() export method.
const CircularQRCode = React.memo(React.forwardRef(({ value, size = 160, color = '#8B5CF6', backgroundColor = '#FFFFFF', showLogo = false }, ref) => {

  const matrix = useMemo(() => buildQrMatrix(value), [value]);

  if (!matrix) return null;
  const { grid, count } = matrix;
  const cellSize = size / count;

  const dots = [];

  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!grid[row][col]) continue;
      if (isQrFinderZone(row, col, count)) continue; // drawn separately below as 3 clean eye shapes
      dots.push(
        <Circle
          key={`d-${row}-${col}`}
          cx={col * cellSize + cellSize / 2}
          cy={row * cellSize + cellSize / 2}
          r={cellSize * 0.42}
          fill={color}
        />
      );
    }
  }

  const eyePositions = [
    { gridX: 0, gridY: 0 },
    { gridX: count - 7, gridY: 0 },
    { gridX: 0, gridY: count - 7 }
  ];

  // Logo is drawn INSIDE this same <Svg> tree (not a separately overlaid
  // element) specifically so native's svg.toDataURL() export - which can
  // only capture this component's own SVG content, nothing layered on top
  // of it from outside - naturally includes the logo too. This also means
  // the on-screen preview and the downloaded file are guaranteed to be the
  // literal same render, not two separately-maintained approximations of
  // each other.
  const logoBadgeSize = size * 0.21;
  const logoIconSize = logoBadgeSize * 0.64;
  const logoCenter = size / 2;

  return (
    <Svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill={backgroundColor} />
      {dots}
      {eyePositions.map((pos, i) => (
        <QrFinderEye key={`eye-${i}`} gridX={pos.gridX} gridY={pos.gridY} cellSize={cellSize} color={color} backgroundColor={backgroundColor} />
      ))}
      {showLogo && (
        <>
          <Rect
            x={logoCenter - logoBadgeSize / 2}
            y={logoCenter - logoBadgeSize / 2}
            width={logoBadgeSize}
            height={logoBadgeSize}
            rx={logoBadgeSize * 0.27}
            fill={backgroundColor}
          />
          <G transform={`translate(${logoCenter - logoIconSize / 2}, ${logoCenter - logoIconSize / 2}) scale(${logoIconSize / 97})`}>
            <Path d={DECENT_LOGO_PATH_D} fill={color} />
          </G>
        </>
      )}
    </Svg>
  );
}));

const DShapeSVG = React.memo(({ size = 44, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 97 97" fill="none">
    <Path
      d="M0 20C0 8.95431 8.95431 0 20 0H48.5C75.2858 0 97 21.7142 97 48.5V48.5C97 75.2858 75.2858 97 48.5 97H20C8.95431 97 0 88.0457 0 77V20Z"
      fill={color}
    />
  </Svg>
));

const ChevronLeftSVG = React.memo(({ color = "#94A3B8", size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const CrossIconSVG = React.memo(({ color = "#94A3B8", size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const ChevronUpSVG = React.memo(({ color = "#FFFFFF", size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 15l-6-6-6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const ClearTextXSVG = React.memo(({ color = '#94A3B8' }) => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const ForYouSVG = React.memo(({ active }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
      stroke={active ? '#8B5CF6' : '#94A3B8'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
));

const FollowedTabSVG = React.memo(({ active }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="12" cy="12" r="4" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="12" cy="3" r="1.5" fill={active ? '#8B5CF6' : '#94A3B8'} />
    <Circle cx="12" cy="21" r="1.5" fill={active ? '#8B5CF6' : '#94A3B8'} />
    <Circle cx="3" cy="12" r="1.5" fill={active ? '#8B5CF6' : '#94A3B8'} />
    <Circle cx="21" cy="12" r="1.5" fill={active ? '#8B5CF6' : '#94A3B8'} />
  </Svg>
));

const PlusSVG = React.memo(({ strokeWidth = 2.5, offsetX = 0 }) => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ transform: [{ translateX: offsetX }] }}>
    <Path d="M12 5V19M5 12H19" stroke="#FFFFFF" strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
));

const SearchSVG = React.memo(({ active, eyesAnim }) => {
  // eyesAnim runs 0->1 once per tap (see playSearchEyes below): eyes fade
  // in, blink twice (opacity toggles), then fade out - brief, matching the
  // other nav icon animations (sparkle burst, spin, draw-in) in both scale
  // and duration.
  const eyesOpacity = eyesAnim
    ? eyesAnim.interpolate({
        inputRange: [0, 0.08, 0.22, 0.30, 0.44, 0.52, 0.66, 0.8, 1],
        outputRange: [0, 1, 1, 0, 0, 1, 1, 1, 0]
      })
    : 0;
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2" />
      <Path d="M20 20L16 16" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" />
      {eyesAnim && (
        <>
          <AnimatedCircle cx="8.3" cy="11" r="1.15" fill={active ? '#8B5CF6' : '#94A3B8'} opacity={eyesOpacity} />
          <AnimatedCircle cx="13.7" cy="11" r="1.15" fill={active ? '#8B5CF6' : '#94A3B8'} opacity={eyesOpacity} />
        </>
      )}
    </Svg>
  );
});

const PROFILE_HEAD_CIRCUMFERENCE = 25.13; // 2 * PI * 4
const PROFILE_BODY_LENGTH = 24; // approx length of the shoulder arc path

const ProfileSVG = React.memo(({ active, drawAnim }) => {
  const headOffset = drawAnim
    ? drawAnim.interpolate({ inputRange: [0, 1], outputRange: [PROFILE_HEAD_CIRCUMFERENCE, 0] })
    : 0;
  const bodyOffset = drawAnim
    ? drawAnim.interpolate({ inputRange: [0, 1], outputRange: [PROFILE_BODY_LENGTH, 0] })
    : 0;
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <AnimatedCircle
        cx="12" cy="7" r="4"
        stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2"
        strokeDasharray={drawAnim ? `${PROFILE_HEAD_CIRCUMFERENCE}` : undefined}
        strokeDashoffset={drawAnim ? headOffset : 0}
      />
      <AnimatedPath
        d="M4 21C4 17.134 7.58172 14 12 14C16.4183 14 20 17.134 20 21"
        stroke={active ? '#8B5CF6' : '#94A3B8'}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        strokeDasharray={drawAnim ? `${PROFILE_BODY_LENGTH}` : undefined}
        strokeDashoffset={drawAnim ? bodyOffset : 0}
      />
    </Svg>
  );
});

// Nav icon shown for the Profile tab when logged in - the user's own avatar
// in a circle with a purple ring, instead of the generic person icon. The
// ring uses the same stroke-trace technique as ProfileSVG above (animated
// strokeDashoffset drawing the circle in), just traced around a circle
// instead of a person shape. Falls back to the plain ProfileSVG icon when
// logged out (no avatar to show).
const PROFILE_AVATAR_RING_RADIUS = 10.2;
const PROFILE_AVATAR_RING_CIRCUMFERENCE = 2 * Math.PI * PROFILE_AVATAR_RING_RADIUS;
const ProfileNavIcon = React.memo(({ active, drawAnim, avatarUrl, themeMode, size = 22 }) => {
  if (!avatarUrl) {
    return <ProfileSVG active={active} drawAnim={drawAnim} />;
  }
  const ringColor = themeMode === 'light' ? '#6D28D9' : '#A855F7';
  const ringOffset = drawAnim
    ? drawAnim.interpolate({ inputRange: [0, 1], outputRange: [PROFILE_AVATAR_RING_CIRCUMFERENCE, 0] })
    : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={{ uri: avatarUrl }}
        style={{
          width: size - 4, height: size - 4, borderRadius: (size - 4) / 2
        }}
      />
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: 0, left: 0 }}>
        <AnimatedCircle
          cx="12" cy="12" r={PROFILE_AVATAR_RING_RADIUS}
          stroke={ringColor} strokeWidth="1.8"
          strokeDasharray={`${PROFILE_AVATAR_RING_CIRCUMFERENCE}`}
          strokeDashoffset={!active ? PROFILE_AVATAR_RING_CIRCUMFERENCE : (drawAnim ? ringOffset : 0)}
        />
      </Svg>
    </View>
  );
});

const Grid2x2SVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="8" height="8" rx="2" fill="#FFFFFF" />
    <Rect x="13" y="3" width="8" height="8" rx="2" fill="#FFFFFF" />
    <Rect x="13" y="13" width="8" height="8" rx="2" fill="#FFFFFF" />
    <Rect x="3" y="13" width="8" height="8" rx="2" fill="#FFFFFF" />
  </Svg>
));

const ShareIconSVG = React.memo(({ color = '#D8B4FE' }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Circle cx="18" cy="5" r="3" stroke={color} strokeWidth="2" />
    <Circle cx="6" cy="12" r="3" stroke={color} strokeWidth="2" />
    <Circle cx="18" cy="19" r="3" stroke={color} strokeWidth="2" />
    <Path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke={color} strokeWidth="2" />
  </Svg>
));

const EditIconSVG = React.memo(({ color = '#D8B4FE' }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
));

const DashCircleIconSVG = React.memo(({ size = 16, color = '#EF4444' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <Path d="M8 12H16" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const TrashIconSVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
));

const SearchChipSVG = React.memo(() => (
  <Svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="7" stroke="#D8B4FE" strokeWidth="2" />
    <Path d="M20 20L16 16" stroke="#D8B4FE" strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const LocationPinSVG = React.memo(({ color = '#94A3B8' }) => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="9" r="2.5" stroke={color} strokeWidth="2"/>
  </Svg>
));

const WarningTriangleSVG = React.memo(() => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path d="M10.29 3.86L1.82 18C1.64537 18.3024 1.55296 18.6453 1.55199 18.9945C1.55103 19.3437 1.64154 19.6874 1.81445 19.991C1.98737 20.2946 2.23652 20.5478 2.53684 20.7252C2.83716 20.9026 3.1783 20.9981 3.52 21H20.48C20.8217 20.9981 21.1628 20.9026 21.4632 20.7252C21.7635 20.5478 22.0126 20.2946 22.1855 19.991C22.3585 19.6874 22.449 19.3437 22.448 18.9945C22.447 18.6453 22.3546 18.3024 22.18 18L13.71 3.86C13.5317 3.56613 13.2807 3.32314 12.9812 3.15448C12.6817 2.98582 12.3437 2.89746 12 2.89746C11.6563 2.89746 11.3183 2.98582 11.0188 3.15448C10.7193 3.32314 10.4683 3.56613 10.29 3.86Z" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M12 9V13" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
    <Path d="M12 17H12.01" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
  </Svg>
));

const ImageIconSVG = React.memo(({ color = '#8B5CF6', size = 28 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="18" height="18" rx="3" stroke={color} strokeWidth="2" />
    <Circle cx="8.5" cy="8.5" r="1.5" fill={color} />
    <Path d="M21 15L16 10L5 21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const TextBlockIconSVG = React.memo(({ color = '#8B5CF6', size = 28 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 6h16M4 12h16M4 18h10" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const GripDotsIconSVG = React.memo(({ color = '#94A3B8', size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="8" cy="5" r="1.6" fill={color} />
    <Circle cx="16" cy="5" r="1.6" fill={color} />
    <Circle cx="8" cy="12" r="1.6" fill={color} />
    <Circle cx="16" cy="12" r="1.6" fill={color} />
    <Circle cx="8" cy="19" r="1.6" fill={color} />
    <Circle cx="16" cy="19" r="1.6" fill={color} />
  </Svg>
));

const CropIconSVG = React.memo(({ color = '#8B5CF6', size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 2v14a2 2 0 0 0 2 2h14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M18 22V8a2 2 0 0 0-2-2H2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const AlignIconSVG = React.memo(({ align = 'left', color = '#94A3B8', size = 16 }) => {
  const lines = {
    left: ['M3 6h18', 'M3 12h12', 'M3 18h16'],
    center: ['M3 6h18', 'M6 12h12', 'M4 18h16'],
    right: ['M3 6h18', 'M9 12h12', 'M5 18h16']
  }[align];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {lines.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth="2" strokeLinecap="round" />
      ))}
    </Svg>
  );
});

const RevertIconSVG = React.memo(({ color = '#8B5CF6', size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 14L4 9l5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M20 20v-7a4 4 0 0 0-4-4H4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const PinIconSVG = React.memo(({ pinned = false, size = 16, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"
      fill={pinned ? color : 'none'}
      stroke={color}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </Svg>
));

const RowBlockIconSVG = React.memo(({ color = '#8B5CF6', size = 28, filled = false }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="4" width="8" height="16" rx="2" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" />
    <Rect x="14" y="4" width="8" height="16" rx="2" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" />
  </Svg>
));

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// revealAnim is the shared 0(light)->1(dark) theme-toggle value. Sun's rays
// fade in as it approaches 0 (light active); moon's cutout circle slides in
// to carve a crescent as it approaches 1 (dark active). Passing no
// revealAnim just renders the resting state for `filled`.
// activateAnim only drives the brief "growing in" animation when this icon
// is becoming active - it's never used to animate the icon going inactive,
// so deactivating just snaps straight to the plain resting state.
const SunIconSVG = React.memo(({ color = '#94A3B8', filled = false, size = 16, activateAnim }) => {
  const rayOpacity = filled && activateAnim ? activateAnim : 1;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="5" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" />
      <AnimatedPath
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color} strokeWidth="2" strokeLinecap="round"
        opacity={rayOpacity}
      />
    </Svg>
  );
});

const MoonIconSVG = React.memo(({ color = '#94A3B8', filled = false, size = 16, cutoutColor = '#8B5CF6', activateAnim }) => {
  if (!filled) {
    // Resting inactive state: plain crescent outline, no fill/cutout tricks.
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </Svg>
    );
  }
  const cutoutCx = activateAnim
    ? activateAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 8.5] })
    : 8.5;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" fill={color} />
      <AnimatedCircle cx={cutoutCx} cy="9" r="7.2" fill={cutoutColor} />
    </Svg>
  );
});

const HelpCircleIconSVG = React.memo(({ color = '#94A3B8', size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="1.8" />
    <Path d="M9.3 9a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.2 1-1.2 1.9" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Circle cx="12" cy="16.6" r="1" fill={color} />
  </Svg>
));

const ExternalLinkSVG = React.memo(({ color = '#D8B4FE', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M15 3h6v6M10 14L21 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const LockIconSVG = React.memo(({ color = '#334155', size = 13 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="2" />
    <Path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const CameraIconSVG = React.memo(() => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 3H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="13" r="4" stroke="#8B5CF6" strokeWidth="2"/>
  </Svg>
));

const CopyIconSVG = React.memo(({ color = '#FFFFFF', size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="9" y="9" width="12" height="12" rx="2" stroke={color} strokeWidth="2" />
    <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={color} strokeWidth="2" />
  </Svg>
));

const DownloadIconSVG = React.memo(({ color = '#FFFFFF', size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3v12M7 10l5 5 5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M4 19h16" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const CheckIconSVG = React.memo(({ color = '#10B981' }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
));

// SOCIAL BRAND LOGO SVGS FOR AUTO DETECTED LINKS
// Lightweight markup parser for the portfolio long description field.
// Supports: # H1, ## H2, **bold**, *italic*, __underline__.
// Never auto-links URLs (plain Text, no dataDetectorTypes) so pasted links stay inert.
// Handle rules: only Roman letters and numbers, 3-20 chars, no spaces/symbols/@ etc.
// Show notifications with an alert + sound even while the app is open in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // This handler only runs while the app is in the foreground (the OS
    // handles display natively when backgrounded/killed, unaffected by
    // this). Since the in-app bell + header toast already surface new
    // notifications while the app is actively open, there's no need for a
    // duplicate system banner/sound on top of that - keep it silent but
    // still delivered/tracked.
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

// THEME SYSTEM
// Structural colors (background/surface/border/text) flip between modes.
// Brand purple and semantic colors (error/success/warning) stay mostly
// consistent, matching how most real apps handle light/dark - only the
// primary purple gets a deeper shade in light mode for proper contrast,
// per explicit request.
const THEME_DARK = {
  mode: 'dark',
  bg: '#0B0F17',
  surface: '#151D2A',
  border: '#26334D',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  primary: '#8B5CF6',
  accent: '#C084FC',
  accentLight: '#D8B4FE'
};

const THEME_LIGHT = {
  mode: 'light',
  bg: '#F4F2FA',
  surface: '#FFFFFF',
  border: '#E2DFF0',
  text: '#1A1625',
  textSecondary: '#6B6478',
  textTertiary: '#8B85A0',
  primary: '#7C3AED',
  accent: '#7C3AED',
  accentLight: '#9061F9'
};

const THEME_STORAGE_KEY = '@decent_theme_mode';
const ThemeContext = React.createContext({ theme: THEME_DARK, themeMode: 'dark', toggleTheme: () => {} });
const useTheme = () => React.useContext(ThemeContext);

const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setThemeMode(saved);
      } else {
        // No explicit preference saved yet (new install / fresh onboarding) -
        // follow the device's system theme until the user picks one
        // themselves via the toggle, at which point their choice persists
        // and takes over from here on.
        const systemScheme = Appearance.getColorScheme();
        if (systemScheme === 'light' || systemScheme === 'dark') setThemeMode(systemScheme);
      }
    });
  }, []);

  const toggleTheme = () => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  };

  const theme = themeMode === 'dark' ? THEME_DARK : THEME_LIGHT;

  return (
    <ThemeContext.Provider value={{ theme, themeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Admin-only "Lightweight Mode": shortens/skips animations and swaps blur
// backdrops for plain opacity, for lower-end devices or anyone who'd rather
// have snappier UI than motion polish. Persisted like the theme setting.
const LIGHTWEIGHT_MODE_STORAGE_KEY = '@decent_lightweight_mode';
const LightweightModeContext = React.createContext({ lightweightMode: true, setLightweightMode: () => {} });
const useLightweightMode = () => React.useContext(LightweightModeContext);

const LightweightModeProvider = ({ children }) => {
  // Defaults ON (experimental) until we get feedback; respects an explicit
  // saved choice either way once the user has toggled it themselves.
  const [lightweightMode, setLightweightModeState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(LIGHTWEIGHT_MODE_STORAGE_KEY).then((saved) => {
      if (saved === 'true' || saved === 'false') setLightweightModeState(saved === 'true');
    });
  }, []);

  const setLightweightMode = (value) => {
    setLightweightModeState(value);
    AsyncStorage.setItem(LIGHTWEIGHT_MODE_STORAGE_KEY, value ? 'true' : 'false').catch(() => {});
  };

  return (
    <LightweightModeContext.Provider value={{ lightweightMode, setLightweightMode }}>
      {children}
    </LightweightModeContext.Provider>
  );
};

const isValidHandleFormat = (h) => /^[A-Za-z0-9._-]{3,20}$/.test(h);

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// Drop-in replacement for TouchableOpacity that adds a subtle, brief
// press-in/press-out scale bounce. Forwards every prop through so it's a
// transparent swap wherever it's used.
const BouncyButton = React.memo(({ style, onPressIn, onPressOut, children, ...rest }) => {
  const bounceScale = useRef(new Animated.Value(1)).current;
  const handlePressIn = (e) => {
    Animated.spring(bounceScale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
    if (onPressIn) onPressIn(e);
  };
  const handlePressOut = (e) => {
    Animated.spring(bounceScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
    if (onPressOut) onPressOut(e);
  };
  return (
    <AnimatedTouchableOpacity
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, { transform: [{ scale: bounceScale }] }]}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
});

// --- Content blocks (WordPress-style block editor groundwork) -------------
// A block is one of:
//   { id, type: 'text', markdown }
//   { id, type: 'image', uri }
//   { id, type: 'row', columns: [block, block] }   // fixed 2-up, half+half
// content_blocks (jsonb) is the source of truth going forward. long_description
// (plain string) is kept as a legacy fallback/backup column - never overwritten
// by this wiring, only read from when content_blocks is empty.
const makeBlockId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MARKDOWN_TOOLBAR_BUTTONS = [
  { label: 'H1', markup: '# ', mode: 'prefix' },
  { label: 'H2', markup: '## ', mode: 'prefix' },
  { label: 'B', markup: '**', mode: 'wrap' },
  { label: 'I', markup: '*', mode: 'wrap' },
  { label: 'U', markup: '__', mode: 'wrap' }
];

const isLocalMediaUri = (uri) =>
  !!uri && (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://'));

const wrapMarkdownAsBlocks = (markdown) =>
  markdown && markdown.trim() ? [{ id: makeBlockId(), type: 'text', markdown }] : [];

// Inverse of wrapMarkdownAsBlocks-ish: flattens a block array back down to a
// plain markdown string, for keeping the legacy long_description column
// populated as a readable backup/search-friendly mirror of the blocks.
const flattenBlocksToMarkdown = (blocks) => {
  const parts = [];
  (blocks || []).forEach((block) => {
    if (block.type === 'text' && block.markdown && block.markdown.trim()) {
      parts.push(block.markdown);
    } else if (block.type === 'row') {
      (block.columns || []).forEach((col) => {
        if (col && col.type === 'text' && col.markdown && col.markdown.trim()) {
          parts.push(col.markdown);
        }
      });
    }
  });
  return parts.join('\n\n');
};

// Given a portfolios row (snake_case, straight from Supabase), return the
// block array to use: content_blocks if present, else long_description
// auto-wrapped as a single text block. Never mutates the row.
const getContentBlocksFromRow = (row) => {
  if (row && Array.isArray(row.content_blocks) && row.content_blocks.length > 0) {
    return row.content_blocks;
  }
  return wrapMarkdownAsBlocks(row ? row.long_description : '');
};

// Showcase images live in a separate portfolio_images table (joined via
// select('*, portfolio_images(image_url)')), not a column on portfolios
// itself - falls back to just the cover if the join comes back empty.
const getShowcaseImagesFromRow = (row) => {
  if (row && Array.isArray(row.portfolio_images) && row.portfolio_images.length > 0) {
    return row.portfolio_images.map((img) => img.image_url).filter(Boolean);
  }
  return [row && row.cover_url ? row.cover_url : ''];
};

const renderFormattedDescription = (raw, align = 'left', textColor = '#E2E8F0') => {
  if (!raw || !raw.trim()) return null;
  const lines = raw.split('\n');
  return lines.map((line, lineIdx) => {
    let fontSize = 14;
    let fontWeight = '400';
    let content = line;

    if (line.startsWith('## ')) {
      fontSize = 18;
      fontWeight = '700';
      content = line.slice(3);
    } else if (line.startsWith('# ')) {
      fontSize = 22;
      fontWeight = '800';
      content = line.slice(2);
    }

    const tokens = content.split(/(\*\*.*?\*\*|\*.*?\*|__.*?__)/g).filter((t) => t !== '');

    return (
      <Text key={lineIdx} style={{ color: textColor, fontSize, fontWeight, lineHeight: fontSize * 1.5, marginBottom: 6, textAlign: align }}>
        {tokens.map((tok, i) => {
          if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 3) {
            return <Text key={i} style={{ fontWeight: '800' }}>{tok.slice(2, -2)}</Text>;
          }
          if (tok.startsWith('__') && tok.endsWith('__') && tok.length > 3) {
            return <Text key={i} style={{ textDecorationLine: 'underline' }}>{tok.slice(2, -2)}</Text>;
          }
          if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 1) {
            return <Text key={i} style={{ fontStyle: 'italic' }}>{tok.slice(1, -1)}</Text>;
          }
          return <Text key={i}>{tok}</Text>;
        })}
      </Text>
    );
  });
};

// Renders a content_blocks array (text / image / row) for display. Row blocks
// render their two columns fixed half+half side by side. Falls back to a
// simple "nothing written" null when there's nothing to show.
const renderContentBlocks = (blocks, onImagePress, theme) => {
  if (!blocks || blocks.length === 0) return null;
  return blocks.map((block) => {
    if (!block) return null;
    if (block.type === 'text') {
      return <View key={block.id} style={{ marginBottom: 18 }}>{renderFormattedDescription(block.markdown, block.align || 'left', theme ? theme.text : '#E2E8F0')}</View>;
    }
    if (block.type === 'image') {
      if (!block.uri) return null;
      const img = (
        <Image
          source={{ uri: block.uri }}
          style={{ width: '100%', height: getImageBlockHeight(block.aspectMode, STANDALONE_IMAGE_WIDTH), borderRadius: 12, marginBottom: 18, backgroundColor: '#1E293B' }}
          resizeMode="cover"
        />
      );
      return onImagePress ? (
        <BouncyButton key={block.id} activeOpacity={0.9} onPress={() => onImagePress(block.uri)}>
          {img}
        </BouncyButton>
      ) : (
        <View key={block.id}>{img}</View>
      );
    }
    if (block.type === 'row') {
      return (
        <View
          key={block.id}
          style={{
            flexDirection: 'row', gap: 10, marginBottom: 18,
            backgroundColor: theme ? (theme.mode === 'light' ? '#EAE7F5' : theme.surface) : 'rgba(255,255,255,0.04)',
            borderRadius: 12, padding: 10
          }}
        >
          {(block.columns || []).map((col, colIdx) => {
            const colImg = col && col.type === 'image' && col.uri ? (
              <Image
                source={{ uri: col.uri }}
                style={{ width: '100%', height: getImageBlockHeight(col.aspectMode, ROW_BLOCK_IMAGE_HEIGHT), borderRadius: 10, backgroundColor: '#1E293B' }}
                resizeMode="cover"
              />
            ) : null;
            return (
              <View key={colIdx} style={{ flex: 1 }}>
                {col && col.type === 'text' && renderFormattedDescription(col.markdown, col.align || 'left', theme ? theme.text : '#E2E8F0')}
                {colImg && (onImagePress ? (
                  <BouncyButton activeOpacity={0.9} onPress={() => onImagePress(col.uri)}>
                    {colImg}
                  </BouncyButton>
                ) : colImg)}
              </View>
            );
          })}
        </View>
      );
    }
    return null;
  });
};

const SparkleIconSVG = React.memo(({ color = '#C084FC', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2l1.8 5.6L19.5 9l-5.7 1.4L12 16l-1.8-5.6L4.5 9l5.7-1.4L12 2z"
      fill={color}
    />
    <Path
      d="M19 14l0.7 2.1L22 17l-2.3 0.7L19 20l-0.7-2.3L16 17l2.3-0.9L19 14z"
      fill={color}
    />
  </Svg>
));

const TrendingUpSVG = React.memo(({ color = '#C084FC', size = 13 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 17L9 11L13 15L21 7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M15 7H21V13" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const LayoutToggleSVG = React.memo(({ mode = 'compact', color = '#C084FC', size = 18 }) => (
  mode === 'compact' ? (
    // Shows what tapping WILL switch TO: full-width rows
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="6" rx="1.5" stroke={color} strokeWidth="2" />
      <Rect x="3" y="14" width="18" height="6" rx="1.5" stroke={color} strokeWidth="2" />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="2" />
      <Rect x="13" y="3" width="8" height="8" rx="1.5" stroke={color} strokeWidth="2" />
      <Rect x="3" y="13" width="8" height="8" rx="1.5" stroke={color} strokeWidth="2" />
      <Rect x="13" y="13" width="8" height="8" rx="1.5" stroke={color} strokeWidth="2" />
    </Svg>
  )
));

const ClockSVG = React.memo(({ color = '#C084FC', size = 13 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <Path d="M12 7V12L15.5 14.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const FigmaLogoSVG = React.memo(() => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Path d="M12 12a3 3 0 1 1 6 0 3 3 0 0 1-6 0z" fill="#1ABCFE" />
    <Path d="M6 18a3 3 0 0 1 3-3h3v3a3 3 0 0 1-6 0z" fill="#0ACF83" />
    <Path d="M6 12a3 3 0 0 1 3-3h3v6H9a3 3 0 0 1-3-3z" fill="#A259FF" />
    <Path d="M6 6a3 3 0 0 1 3-3h3v6H9a3 3 0 0 1-3-3z" fill="#F24E1E" />
    <Path d="M12 3h3a3 3 0 0 1 0 6h-3V3z" fill="#FF7262" />
  </Svg>
));

const GoogleLogoSVG = React.memo(({ size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A10.99 10.99 0 0 0 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.12-1.43.34-2.09V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335" />
  </Svg>
));

const DribbbleLogoSVG = React.memo(() => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke="#EA4C89" strokeWidth="2" />
    <Path d="M12 3c3 3 5 7 5 9M3.6 9c3 1 7 2 11 0M4.5 16.5c3-2 7-3 12-1" stroke="#EA4C89" strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const LinkedInLogoSVG = React.memo(() => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" fill="#0A66C2" />
    <Circle cx="4" cy="4" r="2" fill="#0A66C2" />
  </Svg>
));

const GitHubLogoSVG = React.memo(() => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.258-1.11-1.594-1.11-1.594-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" fill="#FFFFFF" />
  </Svg>
));

const TwitterLogoSVG = React.memo(() => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.4 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" fill="#1DA1F2" />
  </Svg>
));

const YouTubeLogoSVG = React.memo(() => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 1.96A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-1.96 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.37z" fill="#FF0000" />
    <Path d="M9.75 15.02l5.75-3.27-5.75-3.27v6.54z" fill="#FFFFFF" />
  </Svg>
));

const GlobeIconSVG = React.memo(({ color = '#94A3B8' }) => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <Path d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" stroke={color} strokeWidth="2" />
  </Svg>
));

const extractDomainFromUrl = (url) => {
  try {
    let clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
    const { hostname } = new URL(clean);
    return hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
};

// Real favicon for links that aren't one of the known branded platforms
// below, with a graceful fallback to the plain globe icon if it fails to load.
const LinkFaviconIcon = React.memo(({ url, size = 18 }) => {
  const [failed, setFailed] = useState(false);
  const domain = extractDomainFromUrl(url);
  useEffect(() => {
    setFailed(false);
  }, [domain]);
  // Require at least one dot with something after it before firing a
  // network request - avoids a burst of throwaway lookups on every
  // keystroke while the user is still mid-typing the domain.
  const looksComplete = domain && /\.[a-z]{2,}$/i.test(domain);
  if (!looksComplete || failed) return <GlobeIconSVG />;
  // A small white backing chip so dark-on-transparent favicons (Framer,
  // Adobe, etc.) stay visible on a dark background - we can't reliably
  // detect and invert an arbitrary fetched image's colors, so a consistent
  // light backing is the practical fix instead.
  return (
    <View style={{ width: size, height: size, borderRadius: 4, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Image
        source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` }}
        style={{ width: size - 4, height: size - 4, borderRadius: 2 }}
        onError={() => setFailed(true)}
      />
    </View>
  );
});

const getSocialLogoSVG = (url) => {
  if (!url) return <GlobeIconSVG />;
  const lower = url.toLowerCase();
  if (lower.includes('figma.com')) return <FigmaLogoSVG />;
  if (lower.includes('dribbble.com')) return <DribbbleLogoSVG />;
  if (lower.includes('linkedin.com')) return <LinkedInLogoSVG />;
  if (lower.includes('github.com')) return <GitHubLogoSVG />;
  if (lower.includes('twitter.com') || lower.includes('x.com')) return <TwitterLogoSVG />;
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return <YouTubeLogoSVG />;
  return <LinkFaviconIcon url={url} />;
};

// Friendly display name for the press-and-hold link preview.
const getFriendlyLinkName = (url) => {
  if (!url) return 'Link';
  const lower = url.toLowerCase();
  if (lower.includes('figma.com')) return 'Figma';
  if (lower.includes('dribbble.com')) return 'Dribbble';
  if (lower.includes('linkedin.com')) return 'LinkedIn';
  if (lower.includes('github.com')) return 'GitHub';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'X (Twitter)';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  return extractDomainFromUrl(url) || 'Website';
};

// Popular Keywords
const INTRO_CAROUSEL_PAGES = [
  {
    icon: 'sparkle',
    title: 'Welcome to DECENT',
    body: "DECENT exists to put every UI/UX portfolio you've ever made under one roof — one link you can hand to a hiring manager, and one place to actually showcase the craft behind your work, not just static screenshots buried in a PDF."
  },
  {
    icon: 'image',
    title: 'Build a Real Case Study',
    body: "Each portfolio package can include a live Figma prototype, flat design pages, a cover thumbnail, extra showcase images, and a video link for a walkthrough or demo. Add a detailed, formatted write-up too — it shows right under your images."
  },
  {
    icon: 'share',
    title: 'Share It Anywhere',
    body: "Your unique handle is your identity on DECENT. Share it with anyone — recruiters, clients, fellow designers — and they can pull up your full profile and every portfolio you've published, all in one place."
  }
];

const POPULAR_KEYWORDS = [
  'Healthcare', 'E-Commerce', 'Design System',
  'FinTech', 'Dark Mode', 'Mobile Booking',
  'SaaS', 'AI Analytics', '3D Components'
];

// Initial Notifications
const INITIAL_NOTIFICATIONS = [
  { id: 'n1', type: 'like', user: 'Maya Lin', action: 'liked your portfolio package', target: 'The Vein Clinic & Ace Vantage', time: '2m ago', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80' },
  { id: 'n2', type: 'follow', user: 'Alex Rivera', action: 'started following your profile', target: '', time: '1h ago', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' },
  { id: 'n3', type: 'like', user: 'Elena Rostova', action: 'liked your portfolio package', target: 'Design System Tokens & Guidelines', time: '3h ago', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80' },
  { id: 'n4', type: 'follow', user: 'Marcus Chen', action: 'started following your profile', target: '', time: '1d ago', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80' }
];

// 15 Mockup Designers Profiles
const POPULAR_DESIGNERS = []; // Mockup designers removed — only real registered accounts show up now

// Initial projects (empty by default — real data comes from Supabase)
const INITIAL_PROJECTS = [];

// Memoized Project Card Component
const ProjectCard = React.memo(({
  item,
  onPress,
  onToggleLike,
  onOpenDesignerProfile,
  onToggleFollow,
  isFollowing,
  followsMe = false,
  isOwnContent = false,
  customWidth,
  hideBrief = false,
  isTwoRowCard = false,
  showPinControl = false,
  onTogglePin,
  styles
}) => (
  <BouncyButton
    style={[
      styles.card,
      customWidth ? { width: customWidth } : null,
      isTwoRowCard && styles.cardCompactProfile
    ]}
    activeOpacity={0.88}
    onPress={() => onPress(item)}
  >
    <View style={[styles.thumbnailContainer, isTwoRowCard && styles.thumbnailContainerCompact]}>
      <Image source={{ uri: item.cover }} style={styles.cardCover} blurRadius={item.isNsfw ? 25 : 0} />
      {item.isNsfw && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)'
        }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>NSFW</Text>
          </View>
        </View>
      )}
      <View style={styles.prototypeBadgesRow}>
        {item.figmaProto ? (
          <View style={styles.protoBadgeIconOnly}>
            <MobileIconSVG />
          </View>
        ) : null}
        {item.desktopProto ? (
          <View style={styles.protoBadgeIconOnly}>
            <DesktopIconSVG />
          </View>
        ) : null}
      </View>
      {item.isAiGenerated === true && (
        <View style={{
          position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 8,
          backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', zIndex: 10
        }}>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '900' }}>AI</Text>
        </View>
      )}
      {showPinControl ? (
        <BouncyButton
          style={{
            position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14,
            backgroundColor: 'rgba(11, 15, 23, 0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 10
          }}
          onPress={(e) => { e.stopPropagation && e.stopPropagation(); onTogglePin && onTogglePin(item.id); }}
        >
          <PinIconSVG pinned={!!item.pinned} size={15} color={item.pinned ? '#C084FC' : '#FFFFFF'} />
        </BouncyButton>
      ) : (
        // Read-only indicator when viewing someone else's profile - viewers
        // can see a portfolio is pinned/featured, just can't toggle it.
        // Previously this was invisible entirely outside your own profile,
        // not just non-editable.
        item.pinned && (
          <View
            style={{
              position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14,
              backgroundColor: 'rgba(11, 15, 23, 0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 10
            }}
          >
            <PinIconSVG pinned size={15} color="#C084FC" />
          </View>
        )
      )}
    </View>

    <View style={[styles.cardBody, isTwoRowCard && styles.cardBodyCompact]}>
      <View style={styles.titleRow}>
        <Text style={[styles.cardTitle, isTwoRowCard && styles.cardTitleCompact]} numberOfLines={2}>{item.title}</Text>
        {onToggleLike ? (
          <LikeButton
            liked={item.liked}
            likesCount={item.likesCount}
            onPress={() => onToggleLike(item.id)}
            showCount
            style={styles.likeButtonRightAligned}
            countStyle={{ color: '#94A3B8', fontSize: 10, fontWeight: '700', marginTop: 1 }}
          />
        ) : null}
      </View>

      {!hideBrief && (
        <Text style={styles.cardDesc} numberOfLines={2}>{item.brief}</Text>
      )}

      <View style={styles.designerRowWithFollow}>
        <BouncyButton
          style={styles.designerRowLeftCol}
          activeOpacity={0.7}
          onPress={() => onOpenDesignerProfile && onOpenDesignerProfile(item.ownerId)}
        >
          <Image source={{ uri: item.designerAvatar }} style={styles.designerAvatar} />
          <Text style={styles.cardDesignerName} numberOfLines={2}>{item.designerHandle ? formatHandleDisplay(item.designerHandle) : item.designer}</Text>
        </BouncyButton>

        {onToggleFollow && !isOwnContent && (
          <BouncyButton
            style={[styles.cardFollowBtnRight, isFollowing && styles.cardFollowBtnRightActive]}
            onPress={() => onToggleFollow(item.ownerId)}
          >
            <Text style={[styles.cardFollowBtnText, isFollowing && styles.cardFollowBtnTextActive]}>
              {isFollowing ? 'Following' : (followsMe ? 'Follow Back' : '+ Follow')}
            </Text>
          </BouncyButton>
        )}
      </View>
    </View>
  </BouncyButton>
));

const ProjectGrid = React.memo(({ items, onPress, onToggleLike, onOpenDesignerProfile, onToggleFollow, followedDesigners, currentUserId, showPinControl, onTogglePin, styles }) => (
  <View style={styles.grid}>
    {items.map((item) => (
      <ProjectCard
        key={item.id}
        item={item}
        onPress={onPress}
        onToggleLike={onToggleLike}
        onOpenDesignerProfile={onOpenDesignerProfile}
        onToggleFollow={onToggleFollow}
        isFollowing={followedDesigners ? followedDesigners.includes(item.ownerId) : false}
        followsMe={!!item.followsMe}
        isOwnContent={!!currentUserId && item.ownerId === currentUserId}
        showPinControl={showPinControl}
        onTogglePin={onTogglePin}
        styles={styles}
      />
    ))}
  </View>
));

// Wraps any content with a swipe-left-to-dismiss gesture. Built with core
// React Native (PanResponder + Animated) so it doesn't need any new native
// package - no rebuild required to use it.
const SwipeToDismiss = ({ onDismiss, children }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -80) {
          Animated.timing(translateX, {
            toValue: -400,
            duration: 200,
            useNativeDriver: true
          }).start(() => onDismiss());
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true
          }).start();
        }
      }
    })
  ).current;

  return (
    <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
      {children}
    </Animated.View>
  );
};

const TwoRowHorizontalGrid = React.memo(({ items, onPress, onToggleLike, onOpenDesignerProfile, onToggleFollow, followedDesigners, currentUserId, showPinControl, onTogglePin, styles }) => {
  if (items.length === 0) {
    return (
      <View style={styles.emptyTabContainer}>
        <Text style={styles.emptySearchText}>No portfolios found in this section.</Text>
      </View>
    );
  }

  const columns = [];
  for (let i = 0; i < items.length; i += 4) {
    const block = items.slice(i, i + 4);
    const col1 = [];
    if (block[0]) col1.push(block[0]);
    if (block[2]) col1.push(block[2]);
    columns.push(col1);

    if (block[1]) {
      const col2 = [];
      col2.push(block[1]);
      if (block[3]) col2.push(block[3]);
      columns.push(col2);
    }
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
      <View style={styles.twoRowContainer}>
        {columns.map((col, colIdx) => (
          <View key={colIdx} style={styles.twoRowColumn}>
            {col.map((item) => (
              <ProjectCard
                key={item.id}
                item={item}
                onPress={onPress}
                onToggleLike={onToggleLike}
                onOpenDesignerProfile={onOpenDesignerProfile}
                onToggleFollow={onToggleFollow}
                isFollowing={followedDesigners ? followedDesigners.includes(item.ownerId) : false}
                isOwnContent={!!currentUserId && item.ownerId === currentUserId}
                customWidth={RESPONSIVE_PROFILE_CARD_WIDTH}
                hideBrief={true}
                isTwoRowCard={true}
                showPinControl={showPinControl}
                onTogglePin={onTogglePin}
                styles={styles}
              />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
});


// Helper to upload image URIs to Supabase Storage
// Resizes down to a max width (only if the image is actually bigger than that,
// so small images are never upscaled) and compresses quality - invisible to the
// user, no manual file-size limits or errors, just smaller uploads automatically.
const compressImageForUpload = async (uri) => {
  try {
    const originalWidth = await new Promise((resolve, reject) => {
      Image.getSize(uri, (w) => resolve(w), (err) => reject(err));
    });

    const MAX_WIDTH = 1600;
    const actions = originalWidth > MAX_WIDTH ? [{ resize: { width: MAX_WIDTH } }] : [];

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG
    });
    return result.uri;
  } catch (e) {
    console.warn('Image compression failed, using original:', e);
    return uri;
  }
};

// Lightweight wrapper adding a subtle focus highlight to any text field
// without needing separate focus state wired up at every call site.
const FocusableTextInput = React.memo(({ style, onFocus, onBlur, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      importantForAutofill="no"
      autoComplete="off"
      {...props}
      style={[style, focused && { borderColor: '#8B5CF6', borderWidth: 1.5 }]}
      onFocus={(e) => { setFocused(true); if (onFocus) onFocus(e); }}
      onBlur={(e) => { setFocused(false); if (onBlur) onBlur(e); }}
    />
  );
});

const uploadImageToSupabase = async (uri, path) => {
  if (!uri || !uri.startsWith('file://') && !uri.startsWith('content://')) {
    return uri; // Already a remote web URL
  }
  try {
    const compressedUri = await compressImageForUpload(uri);
    const base64 = await FileSystem.readAsStringAsync(compressedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileExt = 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${path}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('portfolio-media')
      .upload(filePath, decode(base64), {
        contentType: `image/${fileExt}`,
        upsert: true
      });

    if (error) {
      console.warn('Supabase storage upload error:', error);
      return uri; // Fallback to local URI
    }

    const { data: publicUrlData } = supabase.storage
      .from('portfolio-media')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl || uri;
  } catch (err) {
    console.warn('Image upload exception:', err);
    return uri;
  }
};

function AuthScreen({ onCancel } = {}) {
  const { theme, themeMode } = useTheme();
  const { lightweightMode } = useLightweightMode();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [emailOrHandle, setEmailOrHandle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [authTermsPreviewVisible, setAuthTermsPreviewVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null); // { title, message }

  const showAppAlert = (title, message, showBackToLogin = false) => {
    Keyboard.dismiss();
    setAlertConfig({ title, message, showBackToLogin });
  };

  // Resolves a handle to its account email via the public profiles table.
  // Untouched if the input already looks like an email.
  const resolveLoginEmail = async (input) => {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;

    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .ilike('handle', trimmed)
      .maybeSingle();

    if (error || !data || !data.email) return null;
    return data.email;
  };

  const handleSubmit = async () => {
    if (!emailOrHandle || !password) {
      showAppAlert('Missing info', mode === 'login' ? 'Enter your email/handle and password.' : 'Enter both email and password.');
      return;
    }

    if (mode === 'signup') {
      if (!isPasswordStrong(password)) {
        showAppAlert('Password Too Weak', 'Your password needs to meet all the requirements shown below the password field.');
        return;
      }
      if (password !== confirmPassword) {
        showAppAlert("Passwords Don't Match", 'Please re-type the same password in both fields.');
        return;
      }
      if (!termsAgreed) {
        showAppAlert('Agreement Required', 'Please check the box agreeing to the Terms of Service to create an account.');
        return;
      }
    }

    setLoading(true);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email: emailOrHandle.trim(), password });
      setLoading(false);
      if (error) {
        showAppAlert('Error', error.message);
      } else {
        showAppAlert('Confirm Your Email', 'We have sent you an email confirmation. Confirm it before logging in!', true);
      }
      return;
    }

    const loginEmail = await resolveLoginEmail(emailOrHandle);
    if (!loginEmail) {
      setLoading(false);
      showAppAlert('Error', 'No account found with that email or handle.');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setLoading(false);
    if (error) {
      showAppAlert('Error', error.message);
    }
  };

  const handleForgotPassword = async () => {
    if (!emailOrHandle) {
      showAppAlert('Enter your email or handle', 'Type it above first, then tap "Forgot password?" again.');
      return;
    }
    setLoading(true);
    const resolvedEmail = await resolveLoginEmail(emailOrHandle);
    if (!resolvedEmail) {
      setLoading(false);
      showAppAlert('Error', 'No account found with that email or handle.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(resolvedEmail);
    setLoading(false);
    if (error) {
      showAppAlert('Error', error.message);
    } else {
      showAppAlert('Check your email', 'We sent a password reset link. Open it in your browser to set a new password, then come back and log in.');
    }
  };

  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      if (Platform.OS === 'web') {
        // On web, Supabase's default flow just navigates the browser to
        // Google and back - no extra library needed. The existing
        // supabase.auth.onAuthStateChange listener elsewhere in the app
        // picks up the session once the redirect completes.
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin }
        });
        if (error) {
          setGoogleLoading(false);
          showAppAlert('Google Sign-In Failed', error.message);
        }
        // No setGoogleLoading(false) on success - the page navigates away.
        return;
      }

      // Native: Supabase can't redirect a browser back into the app on its
      // own, so this opens the OAuth URL in an in-app browser session
      // (expo-web-browser) and waits for it to redirect to a URL scheme
      // registered to this app (expo-linking), then hands the resulting
      // tokens to Supabase directly.
      const redirectUrl = ExpoLinking.createURL('auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true }
      });
      if (error || !data?.url) {
        setGoogleLoading(false);
        showAppAlert('Google Sign-In Failed', error?.message || 'Could not start sign-in.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type === 'success' && result.url) {
        const params = new URLSearchParams(result.url.split('#')[1] || result.url.split('?')[1] || '');
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
          if (sessionError) showAppAlert('Google Sign-In Failed', sessionError.message);
        } else {
          showAppAlert('Google Sign-In Failed', 'No session returned - please try again.');
        }
      }
      setGoogleLoading(false);
    } catch (e) {
      setGoogleLoading(false);
      showAppAlert('Google Sign-In Failed', e.message || 'Something went wrong.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
    >
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: 24 }, Platform.OS === 'web' && { backgroundColor: theme.bg, padding: 0 }]}>
    <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: theme.bg, justifyContent: 'center', padding: 24 } : { flex: 1, justifyContent: 'center' }}>
      {onCancel && (
        <BouncyButton
          style={{
            position: 'absolute', top: 8, left: 0, width: 36, height: 36, borderRadius: 18,
            backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
            alignItems: 'center', justifyContent: 'center', zIndex: 10
          }}
          onPress={onCancel}
        >
          <ChevronLeftSVG color={theme.accentLight} size={20} />
        </BouncyButton>
      )}
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
          <DecentLogoSVG size={44} />
        </View>
      </View>
      <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800', marginBottom: 24, textAlign: 'center' }}>
        {mode === 'login' ? 'Log In' : 'Sign Up'}
      </Text>
      <FocusableTextInput
        style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, color: theme.text, marginBottom: 12 }}
        placeholder={mode === 'login' ? 'Email or Handle' : 'Email'}
        placeholderTextColor="#94A3B8"
        autoCapitalize="none"
        keyboardType={mode === 'login' ? 'default' : 'email-address'}
        autoComplete="email"
        importantForAutofill="yes"
        textContentType="emailAddress"
        value={emailOrHandle}
        onChangeText={setEmailOrHandle}
      />
      <View style={{ position: 'relative' }}>
        <FocusableTextInput
          style={{
            backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10,
            padding: 12, paddingRight: 44, color: theme.text, marginBottom: mode === 'signup' ? 8 : 20
          }}
          placeholder="Password"
          placeholderTextColor="#94A3B8"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === 'signup' ? 'new-password' : 'password'}
          importantForAutofill="yes"
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
          value={password}
          onChangeText={setPassword}
          returnKeyType={mode === 'login' ? 'go' : 'next'}
          onSubmitEditing={mode === 'login' ? handleSubmit : undefined}
        />
        <BouncyButton
          style={{ position: 'absolute', right: 12, top: 12 }}
          onPress={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <EyeOpenSVG color={theme.textSecondary} size={18} /> : <EyeClosedSVG color={theme.textSecondary} size={18} />}
        </BouncyButton>
      </View>

      {mode === 'signup' && (
        <View style={{ marginBottom: 12 }}>
          {getPasswordRequirements(password).map((req) => (
            <View key={req.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              {req.met ? <CheckIconSVG /> : <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: theme.border }} />}
              <Text style={{ color: req.met ? '#4ADE80' : theme.textSecondary, fontSize: 12 }}>{req.label}</Text>
            </View>
          ))}
        </View>
      )}

      {mode === 'signup' && (
        <View style={{ position: 'relative' }}>
          <FocusableTextInput
            style={{
              backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10,
              padding: 12, paddingRight: 44, color: theme.text, marginBottom: 16
            }}
            placeholder="Confirm Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            importantForAutofill="yes"
            textContentType="newPassword"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <BouncyButton
            style={{ position: 'absolute', right: 12, top: 12 }}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            {showConfirmPassword ? <EyeOpenSVG color={theme.textSecondary} size={18} /> : <EyeClosedSVG color={theme.textSecondary} size={18} />}
          </BouncyButton>
        </View>
      )}

      {mode === 'signup' && (
        <BouncyButton
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 20 }}
          onPress={() => setTermsAgreed(!termsAgreed)}
        >
          <View style={{
            width: 20, height: 20, borderRadius: 5, marginTop: 1,
            borderWidth: 1.5, borderColor: termsAgreed ? '#8B5CF6' : theme.border,
            backgroundColor: termsAgreed ? '#8B5CF6' : 'transparent',
            alignItems: 'center', justifyContent: 'center'
          }}>
            {termsAgreed && <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>✓</Text>}
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>
            I agree to the{' '}
            <Text style={{ color: theme.accent, fontWeight: '700' }} onPress={() => setAuthTermsPreviewVisible(true)}>
              Terms of Service
            </Text>
          </Text>
        </BouncyButton>
      )}
      <BouncyButton
        style={{ backgroundColor: '#8B5CF6', height: 44, borderRadius: 99, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#FFF" /> : (
          <Text style={{ color: '#FFF', fontWeight: '800' }}>{mode === 'login' ? 'Log In' : 'Sign Up'}</Text>
        )}
      </BouncyButton>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
        <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600', marginHorizontal: 10 }}>OR</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
      </View>

      <BouncyButton
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
          backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
          height: 44, borderRadius: 12, marginBottom: 16
        }}
        onPress={handleGoogleSignIn}
        disabled={googleLoading || loading}
      >
        {googleLoading ? <ActivityIndicator color={theme.text} /> : (
          <>
            <GoogleLogoSVG />
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Continue with Google</Text>
          </>
        )}
      </BouncyButton>
      {mode === 'login' && (
        <BouncyButton onPress={handleForgotPassword} style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.textSecondary, textAlign: 'center', fontWeight: '600', fontSize: 13 }}>
            Forgot password?
          </Text>
        </BouncyButton>
      )}
      <BouncyButton onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        <Text style={{ color: theme.accent, textAlign: 'center', fontWeight: '600' }}>
          {mode === 'login' ? "No account? Sign up" : 'Already have an account? Log in'}
        </Text>
      </BouncyButton>

      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={!!alertConfig}
        onRequestClose={() => setAlertConfig(null)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setAlertConfig(null)}
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
          <View style={[styles.customConfirmCard, { position: 'relative' }]}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <BouncyButton
              style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 99, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
              onPress={() => setAlertConfig(null)}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>✕</Text>
            </BouncyButton>
            <Text style={[styles.confirmTitle, { marginTop: 10 }]}>{alertConfig?.title}</Text>
            {alertConfig?.message ? <Text style={styles.confirmSubText}>{alertConfig.message}</Text> : null}
            <BouncyButton
              style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 8, backgroundColor: '#8B5CF6' }]}
              onPress={() => setAlertConfig(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.confirmDeleteText, { fontSize: 15 }]}>OK, Got It</Text>
            </BouncyButton>
            {alertConfig?.showBackToLogin && (
              <BouncyButton
                style={{ width: '100%', marginTop: 10, alignItems: 'center', paddingVertical: 6 }}
                onPress={() => {
                  setAlertConfig(null);
                  setMode('login');
                  setPassword('');
                  setConfirmPassword('');
                  setTermsAgreed(false);
                }}
              >
                <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Back to Login</Text>
              </BouncyButton>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={authTermsPreviewVisible}
        onRequestClose={() => setAuthTermsPreviewVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setAuthTermsPreviewVisible(false)}
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
          <View style={[styles.customConfirmCard, { maxHeight: '75%' }]}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 4 }}>
              <Text style={[styles.confirmTitle, { flex: 1, marginBottom: 0, textAlign: 'left' }]}>Terms of Service</Text>
              <BouncyButton style={{ padding: 4 }} onPress={() => setAuthTermsPreviewVisible(false)}>
                <Text style={{ color: theme.textSecondary, fontSize: 18, fontWeight: '700' }}>✕</Text>
              </BouncyButton>
            </View>
            <ScrollView style={{ marginBottom: 16, marginTop: 8 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 20 }}>
                By using DECENT, operated from Indonesia, you agree to these terms.{'\n\n'}
                <Text style={{ fontWeight: '700', color: theme.text }}>Your Content{'\n'}</Text>
                You retain ownership of everything you upload. You confirm you have the right to share what you post. We may remove content that violates these terms.{'\n\n'}
                <Text style={{ fontWeight: '700', color: theme.text }}>Acceptable Use{'\n'}</Text>
                No spam, harassment, or impersonation. No uploading content you don't have rights to. We may suspend accounts that break these rules.{'\n\n'}
                <Text style={{ fontWeight: '700', color: theme.text }}>Disclaimer{'\n'}</Text>
                DECENT is provided "as is" without warranties. We're not liable for content posted by users.{'\n\n'}
                This is a placeholder for testing purposes and should be reviewed by a legal professional before public release.
              </Text>
            </ScrollView>
            <BouncyButton
              style={[styles.confirmDeleteBtn, { width: '100%' }]}
              onPress={() => setAuthTermsPreviewVisible(false)}
            >
              <Text style={styles.confirmDeleteText}>Close</Text>
            </BouncyButton>
          </View>
        </View>
      </Modal>
    </View>
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function App() {
  const { theme, themeMode, toggleTheme } = useTheme();
  const { lightweightMode, setLightweightMode } = useLightweightMode();
  const styles = useMemo(() => getStyles(theme), [theme]);

  // --- Responsive breakpoints (web only) ---
  // Native ignores all of this entirely (viewportWidth stays at the device
  // width from launch, isDesktop/isTablet are always false there since
  // RAW_WINDOW_WIDTH already reflects the actual native screen).
  // Tracks live window width so resizing the browser actually reflows the
  // layout, rather than only reacting to the width captured at first load
  // (which is all the existing SCREEN_WIDTH constant does).
  const [viewportWidth, setViewportWidth] = useState(RAW_WINDOW_WIDTH);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setViewportWidth(window.width);
    });
    return () => sub && sub.remove && sub.remove();
  }, []);
  const isWebTablet = Platform.OS === 'web' && viewportWidth >= 768 && viewportWidth < 1024;
  const isWebDesktop = Platform.OS === 'web' && viewportWidth >= 1024;
  const isWebWide = isWebTablet || isWebDesktop; // sidebar layout applies to both
  // Sidebar: collapsed = icon-only rail, expanded = icons + labels.
  // Defaults open on desktop (more room), collapsed on tablet (less room).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setSidebarCollapsed(isWebTablet);
    // Only meant to set a sensible default the moment a screen crosses into
    // tablet/desktop width, not fight the user's manual toggle afterwards -
    // hence depending on the boundary flags rather than every pixel change.
  }, [isWebTablet, isWebDesktop]);
  const sidebarWidth = sidebarCollapsed ? 68 : 220;
  const sidebarWidthAnim = useRef(new Animated.Value(sidebarWidth)).current;
  useEffect(() => {
    if (!isWebWide) return;
    Animated.timing(sidebarWidthAnim, { toValue: sidebarWidth, duration: 220, useNativeDriver: false }).start();
  }, [sidebarWidth, isWebWide]);
  // Icon sizes scale down a step on wider viewports so the mobile-sized
  // hamburger/header icons don't look oversized once there's a full desktop
  // sidebar and header bar around them.
  const headerIconSize = isWebDesktop ? 15 : isWebTablet ? 16 : 18;
  const headerIconBtnSize = isWebDesktop ? 32 : isWebTablet ? 34 : 36;
  // Main content column: mobile stays the existing fixed 480px "phone in a
  // browser" column; tablet/desktop instead get a fluid centered column
  // (Supabase-dashboard-style) that grows with the viewport up to a
  // readable cap so text/cards don't stretch edge-to-edge on ultrawide
  // monitors.
  const mainContentMaxWidth = isWebDesktop ? 820 : isWebTablet ? 620 : 480;
  // Much wider card for the 6 "content" popups (Account Settings, About,
  // Privacy Policy, Terms, Feedback, Donate) now that they're centered
  // dialogs on web rather than mobile-style full-page slides - the shared
  // overlayModalContainer style still defaults every other (smaller) popup
  // to 480px, this only overrides those six specifically.
  const contentModalWidth = isWebDesktop ? 560 : isWebTablet ? 520 : 480;
  // The Add Portfolio wizard has multi-column media grids and longer forms
  // across its 4 steps, so unlike the simpler content modals above it
  // benefits from going as wide as comfortably fits the viewport.
  const wizardModalWidth = isWebDesktop ? 1040 : isWebTablet ? 760 : 480;
  // Width for the notification/settings dropdowns when pinned to the true
  // top-right of the viewport on web (see headerRightActionsRow below) -
  // fixed comfortable width, not a left/right stretch like the mobile-app
  // full-width version.
  const utilityDropdownWidth = Math.min(320, viewportWidth - 32);
  // The Options/settings popup carries more content (Account, Privacy,
  // Support & Legal rows, the donate button) than the notification list, so
  // it gets a bit more breathing room than the shared dropdown width above -
  // still hugging its content rather than the much-wider content-modal
  // sizing, just slightly roomier than the notification dropdown.
  const settingsDropdownWidth = Math.min(360, viewportWidth - 32);
  // Matches the fixed-position bell/gear cluster below (top:16, sized by
  // headerIconBtnSize) so the dropdown sits directly under the icons
  // instead of at a guessed fixed offset - stays correct as the icon size
  // itself scales down per breakpoint.
  const utilityDropdownTop = 16 + headerIconBtnSize + 8;
  // The outer page canvas color (visible in the gutter beside the centered
  // content column on tablet/desktop, and around the auth screen).
  // Previously a separately-hardcoded value ('#E2E0EC'/'#000000') that was
  // meant to match theme.bg everywhere, but plenty of places (sidebar,
  // portfolio detail page, etc.) reference theme.bg directly instead of
  // this constant - any of those being even slightly different from the
  // hardcoded value here created a visible seam between the content card
  // and the page background around it. Now it's literally the same value
  // as theme.bg, so there's nothing left to drift out of sync - regardless
  // of which of the two any given component happens to reference, they're
  // always identical.
  const webCanvasColor = theme.bg;

  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const projectsRef = useRef(projects);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  const [session, setSession] = useState(null);
  // Mirrors `session` for use inside the mount-only auth effect below
  // (empty deps array - the AppState listener and interval it sets up are
  // created once and would otherwise always see `session` as it was at
  // mount, i.e. always null, permanently - not what's actually happening
  // right now).
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const [authChecked, setAuthChecked] = useState(false);
  // Guest browsing: the app is viewable without an account. This only
  // controls whether the sign-in screen is shown ON TOP of/instead of the
  // main app - it does NOT gate rendering the app itself anymore (that gate
  // was removed below, where `if (!session) return <AuthScreen />;` used to
  // live). Set to true either by tapping "Sign In" in Options, or by
  // requireAuth() below when a guest taps something that needs an account.
  const [guestAuthPromptVisible, setGuestAuthPromptVisible] = useState(false);
  // Call at the top of any handler that requires a signed-in user (follow,
  // like, upload, comment, account settings, notifications, etc). Returns
  // true if already signed in (handler should proceed normally); if not,
  // it prompts sign-in and returns false (handler should bail out).
  const requireAuth = () => {
    if (session) return true;
    setGuestAuthPromptVisible(true);
    return false;
  };

  // --- Mobile app promo / interest prompts (web only) ------------------
  // Platform.OS is just 'web' regardless of the underlying device, so this
  // sniffs the browser's user agent to tell Android/iOS apart.
  const [mobileOS, setMobileOS] = useState(null); // 'android' | 'ios' | null
  const [showAndroidPromo, setShowAndroidPromo] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);
  const [iosAlreadyAsked, setIosAlreadyAsked] = useState(true); // safe default until checked
  const iosEngagementCountRef = useRef(0);
  const IOS_ENGAGEMENT_THRESHOLD = 17; // within the requested 15-20 range

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      setMobileOS('android');
      AsyncStorage.getItem('decent_android_promo_dismissed').then((dismissed) => {
        if (!dismissed) setShowAndroidPromo(true);
      });
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      setMobileOS('ios');
      AsyncStorage.getItem('decent_ios_interest_answered').then((answered) => {
        if (answered) { setIosAlreadyAsked(true); return; }
        setIosAlreadyAsked(false);
        AsyncStorage.getItem('decent_ios_engagement_count').then((saved) => {
          iosEngagementCountRef.current = saved ? (parseInt(saved, 10) || 0) : 0;
        });
      });
    }
  }, []);

  // Engagement counter for the iOS prompt - counts taps anywhere in the app
  // via a document-level listener rather than instrumenting every individual
  // button (which would mean touching handlers throughout the whole file).
  // Stops listening once the prompt has fired or already been answered.
  useEffect(() => {
    if (Platform.OS !== 'web' || mobileOS !== 'ios' || iosAlreadyAsked || showIosPrompt) return;
    if (typeof document === 'undefined') return;
    const handleEngagement = () => {
      iosEngagementCountRef.current += 1;
      AsyncStorage.setItem('decent_ios_engagement_count', String(iosEngagementCountRef.current)).catch(() => {});
      if (iosEngagementCountRef.current >= IOS_ENGAGEMENT_THRESHOLD) {
        setShowIosPrompt(true);
      }
    };
    document.addEventListener('click', handleEngagement);
    return () => document.removeEventListener('click', handleEngagement);
  }, [mobileOS, iosAlreadyAsked, showIosPrompt]);

  const handleDismissAndroidPromo = () => {
    setShowAndroidPromo(false);
    AsyncStorage.setItem('decent_android_promo_dismissed', 'true').catch(() => {});
  };

  // Answer is stored in the same analytics_events table other tracking
  // already uses (event_name/metadata pattern), so it's queryable from the
  // same place - e.g. SELECT metadata->>'response', count(*) FROM
  // analytics_events WHERE event_name = 'ios_app_interest' GROUP BY 1.
  const handleIosInterestResponse = async (answer) => {
    setShowIosPrompt(false);
    setIosAlreadyAsked(true);
    AsyncStorage.setItem('decent_ios_interest_answered', 'true').catch(() => {});
    try {
      await supabase.from('analytics_events').insert({
        user_id: session ? session.user.id : null,
        event_name: 'ios_app_interest',
        metadata: { response: answer }
      });
    } catch (e) {
      console.warn('iOS interest tracking failed:', e);
    }
  };

  const [followedDesigners, setFollowedDesigners] = useState([]);
  const followedDesignersRef = useRef(followedDesigners);
  useEffect(() => { followedDesignersRef.current = followedDesigners; }, [followedDesigners]);
  const [liveDesigners, setLiveDesigners] = useState([]);
  const liveDesignersRef = useRef(liveDesigners);
  useEffect(() => { liveDesignersRef.current = liveDesigners; }, [liveDesigners]);
  const [myFollowStats, setMyFollowStats] = useState({ followersCount: 0, followingCount: 0 });
  const [myWeeklyViews, setMyWeeklyViews] = useState(null); // null = not loaded yet, distinct from 0
  const [hideLikedPortfolios, setHideLikedPortfolios] = useState(false);
  
  const [userProfile, setUserProfile] = useState({
    name: '',
    role: '',
    location: '',
    bio: '',
    email: '',
    avatar: 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
    links: []
  });

  const [notificationsList, setNotificationsList] = useState([]);
  const [notificationHistoryList, setNotificationHistoryList] = useState([]);
  const [notificationHistoryLoading, setNotificationHistoryLoading] = useState(false);
  const [notificationHistoryLoadingMore, setNotificationHistoryLoadingMore] = useState(false);
  const [notificationHistoryHasMore, setNotificationHistoryHasMore] = useState(true);
  const NOTIFICATION_HISTORY_PAGE_SIZE = 30;
  const unreadNotifications = notificationsList.some((n) => !n.read);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  // Tap-to-enlarge lightbox for images inside posted portfolios
  const [lightboxImageUri, setLightboxImageUri] = useState(null);
  // Press-and-hold preview for profile link buttons
  const [linkPreview, setLinkPreview] = useState(null); // { url, name } | null
  // Press-and-hold on a profile link (self or others') opens an in-app
  // preview instead of leaving the app right away.
  // Shrink/expand-to-icon animation (lightweight scale+fade, native driver)
  const [notificationPopupRendered, setNotificationPopupRendered] = useState(false);
  const notificationPopupAnim = useRef(new Animated.Value(0)).current;

  const [hydrated, setHydrated] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  // Separate from updateAvailable above - that one is for OTA (JS-only)
  // updates, applied in-app via handleApplyUpdate. This one is for real
  // native rebuilds (new native modules, app.json changes, etc.) - those
  // can't be applied in-app at all, the person has to actually leave and
  // download/install a new APK, so this needs its own banner with its own
  // "go download it" action instead of an in-app apply button.
  const [nativeUpdateInfo, setNativeUpdateInfo] = useState(null); // { message, url } | null
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return; // web is always current - every deploy ships live, no separate install step exists to nag about
    (async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('latest_native_version, update_message, update_url')
        .eq('id', 1)
        .maybeSingle();
      if (error || !data) return;

      // Application.nativeApplicationVersion reads the real installed
      // version directly from Android's package info - Constants.expoConfig
      // reflects the embedded JS manifest instead, which isn't reliably
      // populated in production standalone builds. That gap was exactly
      // the bug: expoConfig came back undefined, fell through to the
      // '0.0.0' fallback, and looked "older" than the real version no
      // matter what - showing the banner even on a genuinely current build.
      const installedVersion = Application.nativeApplicationVersion || Constants.expoConfig?.version || '0.0.0';
      // Simple dotted-version compare (e.g. "0.2.0" vs "0.3.0") - this
      // app's version scheme doesn't need full semver handling (no
      // pre-release tags, no build metadata), just numeric segment
      // comparison left to right.
      const isOlder = (a, b) => {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const x = partsA[i] || 0;
          const y = partsB[i] || 0;
          if (x < y) return true;
          if (x > y) return false;
        }
        return false;
      };

      if (isOlder(installedVersion, data.latest_native_version)) {
        setNativeUpdateInfo({
          message: data.update_message || 'A new version of DECENT is available.',
          url: data.update_url || null
        });
      }
    })();
  }, []);

  const [externalLinkModalVisible, setExternalLinkModalVisible] = useState(false);
  const [targetExternalUrl, setTargetExternalUrl] = useState('');
  // Distinguishes DECENT's own trusted links (currently just Ko-fi) from
  // arbitrary user-generated ones (portfolio live links, designer socials)
  // - only the latter get the full suspicious-link treatment (generic
  // wording, report option). Derived automatically from the URL itself
  // rather than a separate flag threaded through every call site, so any
  // future call to openExternalLinkWithWarning(KO_FI_URL) picks this up
  // for free without needing to remember to pass anything extra.
  const isTrustedExternalLink = targetExternalUrl === KO_FI_URL || targetExternalUrl === GITHUB_URL;

  const [accountSettingsModalVisible, setAccountSettingsModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePasswordPageVisible, setChangePasswordPageVisible] = useState(false);
  const [accountSettingsDiscardWarningVisible, setAccountSettingsDiscardWarningVisible] = useState(false);
  const [passwordPageDiscardWarningVisible, setPasswordPageDiscardWarningVisible] = useState(false);
  const [accountSaveSuccessModalVisible, setAccountSaveSuccessModalVisible] = useState(false);
  // Sticky Save button: always floats at the bottom while there are unsaved
  // changes (simpler and avoids the earlier scroll-direction based bug).
  const accountSettingsStickyAnim = useRef(new Animated.Value(0)).current;

  const [editName, setEditName] = useState(userProfile.name);
  const [editHandle, setEditHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
  const [handleChangedAt, setHandleChangedAt] = useState(null);
  const [editRole, setEditRole] = useState(userProfile.role);
  const [editLocation, setEditLocation] = useState(userProfile.location);
  const [editBio, setEditBio] = useState(userProfile.bio);
  const [editEmail, setEditEmail] = useState(userProfile.email);
  const [editAvatar, setEditAvatar] = useState(userProfile.avatar);
  const [editLinks, setEditLinks] = useState(userProfile.links);
  // Drag-to-reorder for profile links: uniform row height, single active
  // drag at a time, reorder resolves on release (not live during drag) to
  // keep it simple and avoid the jank a live-reorder had for variable-height
  // content elsewhere.
  const [draggingLinkIndex, setDraggingLinkIndex] = useState(null);
  const linkDragY = useRef(new Animated.Value(0)).current;
  const linkDragStartIndexRef = useRef(0);
  const linkRowHeightRef = useRef(56);

  // Settings Secondary Modals
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [changelogModalVisible, setChangelogModalVisible] = useState(false);
  const [changelogEntries, setChangelogEntries] = useState([]);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const changelogFetchedRef = useRef(false); // only fetch once per session, not every time the modal reopens
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  // Safe search: on by default (hides NSFW everywhere including search).
  // Turning it off requires an explicit warning + countdown before it takes
  // effect - see handleDisableSafeSearch.
  const [safeSearchEnabled, setSafeSearchEnabled] = useState(true);
  const [disableSafeSearchModalVisible, setDisableSafeSearchModalVisible] = useState(false);
  const [disableSafeSearchCountdown, setDisableSafeSearchCountdown] = useState(5);
  const [fancyModeConfirmVisible, setFancyModeConfirmVisible] = useState(false);
  const [fancyModeCountdown, setFancyModeCountdown] = useState(5);
  const [optionsView, setOptionsView] = useState('root'); // 'root' | 'privacy' | 'supportLegal'
  // Options sub-items (About, Privacy, Terms, Feedback, Reports, Admin
  // Panel, Change Password, Account Settings, Donate) previously closed
  // Options and then, when THEY closed, went straight to the feed -
  // skipping back past Options entirely instead of returning to it. This
  // tracks whether the current sub-item was opened from Options, so its
  // close button can reopen Options instead. Native only - web doesn't use
  // Options as a popup in the same way.
  const [returnToOptionsOnClose, setReturnToOptionsOnClose] = useState(false);
  const [blockedUsersList, setBlockedUsersList] = useState([]);

  // Feedback & Support Modal
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);

  // Shared slide-from-right transition for the 6 "sub-page" screens reached
  // from Options, so they feel like drilling into a page rather than a
  // separate popup. One shared Animated.Value instead of six, since only
  // one of these is ever open at a time.
  const subPageSlideAnim = useRef(new Animated.Value(0)).current;
  // Animation removed entirely (was a translateX slide-in) - despite fixing
  // a real stale-closure race in the interactive-gating around it, the
  // touch/scroll bug persisted per direct testing. Rather than keep
  // patching around an animated transform on the same view a ScrollView
  // lives inside, removing the transform outright eliminates this whole
  // class of "touch during/after animation" issues at the source. Content
  // now always renders at rest (translateX: 0) and is always interactive -
  // no animation to wait for, so nothing to gate.
  const subPageInteractive = true;

  // Web-only hamburger nav drawer - replaces the floating bottom tab bar on
  // web (see floatingBottomBar render below, native-only there). Slides in
  // from the left; backdrop fades in alongside it.
  const [hamburgerMenuVisible, setHamburgerMenuVisible] = useState(false);
  const hamburgerSlideAnim = useRef(new Animated.Value(-HAMBURGER_DRAWER_WIDTH)).current;
  const hamburgerBackdropOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    Animated.timing(hamburgerSlideAnim, {
      toValue: hamburgerMenuVisible ? 0 : -HAMBURGER_DRAWER_WIDTH,
      duration: 260,
      useNativeDriver: true
    }).start();
    Animated.timing(hamburgerBackdropOpacity, {
      toValue: hamburgerMenuVisible ? 1 : 0,
      duration: 260,
      useNativeDriver: true
    }).start();
  }, [hamburgerMenuVisible]);
  const [feedbackEmail, setFeedbackEmail] = useState(userProfile.email);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackNotifyEmail, setFeedbackNotifyEmail] = useState(true);
  // Request a Feature section (Feedback & Support)
  const [featureRequestTitle, setFeatureRequestTitle] = useState('');
  const [featureRequestDescription, setFeatureRequestDescription] = useState('');
  const [featureRequestHasLink, setFeatureRequestHasLink] = useState(false);
  const [featureRequestLink, setFeatureRequestLink] = useState('');
  const [feedbackSupportTab, setFeedbackSupportTab] = useState('feedback');
  const [feedbackSuccessModalVisible, setFeedbackSuccessModalVisible] = useState(false);

  // Donate Modal
  const [donateModalVisible, setDonateModalVisible] = useState(false);
  const [donateSuccessModalVisible, setDonateSuccessModalVisible] = useState(false);
  const [donateRegion, setDonateRegion] = useState('id');
  const [donateTermsAgreed, setDonateTermsAgreed] = useState(false);

  const [selectedFollowedDesigner, setSelectedFollowedDesigner] = useState(null);
  const selectedFollowedDesignerRef = useRef(selectedFollowedDesigner);
  useEffect(() => { selectedFollowedDesignerRef.current = selectedFollowedDesigner; }, [selectedFollowedDesigner]);

  const [activeProject, setActiveProject] = useState(null);
  const activeProjectRef = useRef(activeProject);
  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  const [selectedDesigner, setSelectedDesigner] = useState(null);
  const selectedDesignerRef = useRef(selectedDesigner);
  useEffect(() => { selectedDesignerRef.current = selectedDesigner; }, [selectedDesigner]);
  // Was previously computed with projects.filter(...) inline in 3 separate
  // places every render (the tab count, the full-width grid, and the
  // compact grid) - consolidated into one memoized value.
  const selectedDesignerProjects = useMemo(() => {
    if (!selectedDesigner) return [];
    return projects.filter((p) => p.ownerId === selectedDesigner.id);
  }, [projects, selectedDesigner]);
  const [modalVisible, setModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const wizardStepSpinnerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // useNativeDriver was unconditionally true here, which should work on
    // web too in theory - but a continuous native-driver loop combined with
    // a dashed border transform is exactly the kind of thing that's
    // historically been unreliable on react-native-web depending on
    // version. JS-driven (useNativeDriver: false) is slightly less
    // performant but far more reliably renders correctly on web for a tiny
    // spinning dot like this.
    Animated.loop(
      Animated.timing(wizardStepSpinnerAnim, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' })
    ).start();
  }, []);
  const [isSubmittingPortfolio, setIsSubmittingPortfolio] = useState(false);
  const [discardConfirmModalVisible, setDiscardConfirmModalVisible] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);

  const [deleteConfirmModalVisible, setDeleteConfirmModalVisible] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);

  const [designerModalVisible, setDesignerModalVisible] = useState(false);
  // Lets openProjectModal below read this without listing it as a
  // useCallback dependency - same reasoning as selectedDesignerRef just
  // above (openProjectModal needs both together, to decide whether to
  // remember "came from a designer profile" for the back button).
  const designerModalVisibleRef = useRef(false);
  useEffect(() => { designerModalVisibleRef.current = designerModalVisible; }, [designerModalVisible]);
  // Back-navigation stack, scoped to the Portfolio<->Designer Profile
  // relationship specifically - that's the primary "drill deeper" pattern
  // in this app (view a designer's portfolios, tap one, want to go back to
  // that same designer's page; or view a portfolio, tap the author, want
  // to go back to that same portfolio). Rather than a generic multi-level
  // router, both screens can now stay mounted underneath each other
  // (visibility toggled, not torn down), which means whichever one you
  // return to keeps its scroll position for free - React never unmounted
  // it, so there's nothing to restore.
  const [cameFromPortfolioId, setCameFromPortfolioId] = useState(null); // set when Designer Profile was opened from a Portfolio Detail
  const [cameFromDesignerId, setCameFromDesignerId] = useState(null); // set when Portfolio Detail was opened from a Designer Profile
  // Multi-level designer-to-designer navigation (e.g. viewing someone's
  // profile, opening their Followers list, tapping into a follower, tapping
  // into THEIR follower, and so on) - back walks through the whole trail,
  // not just one level. designerNavIsGoingBackRef prevents the "push onto
  // stack" logic in openDesignerProfileById from re-pushing when it's
  // actually being called AS PART OF a back navigation (popping and then
  // re-opening the popped designer would otherwise look identical to a
  // forward navigation and push again, undoing the pop).
  const [designerBackStack, setDesignerBackStack] = useState([]);
  const designerNavIsGoingBackRef = useRef(false);
  // Guards the initial-load deep-link effect below so it only ever processes
  // the URL's incoming route ONCE. Without this, since handleIncomingRoute's
  // identity changes on every unrelated designer-profile open (it depends on
  // openDesignerProfileById, which depends on [designerModalVisible,
  // selectedDesigner]), that effect was re-firing on every single profile
  // navigation and unconditionally resetting the URL to '/' in its .finally()
  // - permanently stomping the separate URL-sync effect's correct output
  // right after it ran.
  const initialRouteHandledRef = useRef(false);
  // Designer Profile is declared earlier in this file than Portfolio Detail,
  // so with equal zIndex, normal stacking rules mean Portfolio Detail
  // always paints on top regardless of which actually opened more recently
  // - fine for the common case (drilling from designer into a portfolio),
  // wrong for the reverse (opening a designer's page from within an
  // already-open portfolio, where the designer page should now be on top).
  // This tracks whichever one is genuinely topmost so it can get a boosted
  // zIndex dynamically instead of relying on source order.
  const [topStackedPage, setTopStackedPage] = useState(null); // 'designer' | 'portfolio' | null


  const handleBackFromPortfolioDetail = useCallback(() => {
    if (cameFromDesignerId) {
      setModalVisible(false);
      setCameFromDesignerId(null);
      setTopStackedPage('designer');
    } else {
      setModalVisible(false);
    }
  }, [cameFromDesignerId]);
  const [designerOptionsMenuVisible, setDesignerOptionsMenuVisible] = useState(false);
  // Discover Designers list has multiple rows at once, unlike the single
  // designer-profile context above - tracks which specific row's menu is
  // open by id (or null) instead of one shared boolean, and each row's own
  // dots-button ref is stored in this plain object (not useRef-per-row,
  // which would violate the rules of hooks inside a .map()).
  const [discoverDotsMenuOpenId, setDiscoverDotsMenuOpenId] = useState(null);
  const [discoverDotsMenuPos, setDiscoverDotsMenuPos] = useState({ top: 0, right: 0 });
  const discoverDotsRefsMap = useRef({}).current;
  const [portfolioOptionsMenuVisible, setPortfolioOptionsMenuVisible] = useState(false);
  // These popups render through a real <Modal> (portals straight to
  // document.body on web) rather than a plain absolutely-positioned View,
  // because on wide web layout the whole designer-profile page itself
  // renders inside a plain View (not a Modal - that's intentional, so
  // portfolio+profile can be shown stacked at once), which traps any
  // z-index inside it to that page's own local stacking context no matter
  // how high the value is. A real Modal escapes that entirely. Since a
  // portal has no natural relationship to the button that opened it, the
  // button's on-screen position is measured on open and used to place the
  // popup where it visually belongs.
  const designerDotsWrapRef = useRef(null);
  const portfolioDotsWrapRef = useRef(null);
  const [designerMenuPos, setDesignerMenuPos] = useState({ top: 90, right: 20 });
  const [portfolioMenuPos, setPortfolioMenuPos] = useState({ top: 60, right: 16 });
  const [designerProfileTab, setDesignerProfileTab] = useState('myWork');

  const [allCategoriesModalVisible, setAllCategoriesModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsPopupRendered, setSettingsPopupRendered] = useState(false);
  const settingsPopupAnim = useRef(new Animated.Value(0)).current;
  // Theme-toggle pill (sun/moon) sliding highlight - subtle, native-driven
  const themeToggleAnim = useRef(new Animated.Value(themeMode === 'dark' ? 1 : 0)).current;
  // Icon-level "growing in" animations - only ever play for whichever icon
  // is becoming active, never for the one becoming inactive.
  const sunActivateAnim = useRef(new Animated.Value(1)).current;
  const moonActivateAnim = useRef(new Animated.Value(1)).current;
  const prevThemeModeRef = useRef(themeMode);

  const [userListModalVisible, setUserListModalVisible] = useState(false);
  const [userListItems, setUserListItems] = useState([]);
  // Which designer's followers/following this modal is currently showing -
  // separate from userListTitle (a display string) so switching tabs can
  // refetch the OTHER list for the SAME person without needing to parse
  // that back out of a "Followers of X" / "X is Following" string.
  const [userListTargetDesigner, setUserListTargetDesigner] = useState(null);
  const [userListTab, setUserListTab] = useState('followers'); // 'followers' | 'following'
  const [userListLoading, setUserListLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('case');
  const [loadingWebView, setLoadingWebView] = useState(true);

  const mainScrollViewRef = useRef(null);
  // Per-tab remembered scroll position. Previously this was a single shared
  // ScrollView with no memory at all between tab switches - scrolling deep
  // into For You, then switching to Search, would leave the ScrollView at
  // that same raw offset rather than resetting or remembering anything
  // meaningful, since it's genuinely the same ScrollView instance under
  // both tabs' content, not four separate ones.
  const tabScrollOffsetsRef = useRef({ forYou: 0, followed: 0, search: 0, profile: 0 });
  const bellButtonRef = useRef(null);
  const [notifDropdownPos, setNotifDropdownPos] = useState({ top: 60, left: 16, right: 16 });
  const [headerBottomY, setHeaderBottomY] = useState(70);
  // Sticky category chip bar (For You tab, native) height - measured so the
  // ScrollView's top padding can compensate exactly, same approach as
  // headerBottomY above.
  const [categoryBarHeight, setCategoryBarHeight] = useState(62);
  // Left/right scroll arrows for the category bar, web only - mouse/trackpad
  // users don't have the natural horizontal swipe a touchscreen gives, so
  // arrows fill that gap. Hidden entirely when there's nothing to scroll to
  // in that direction.
  const categoryScrollRef = useRef(null);
  const [categoryCanScrollLeft, setCategoryCanScrollLeft] = useState(false);
  const [categoryCanScrollRight, setCategoryCanScrollRight] = useState(false);
  const categoryScrollContentWidthRef = useRef(0);
  const categoryScrollContainerWidthRef = useRef(0);
  const categoryScrollXRef = useRef(0);
  const updateCategoryScrollArrows = (scrollX) => {
    categoryScrollXRef.current = scrollX;
    const contentW = categoryScrollContentWidthRef.current;
    const containerW = categoryScrollContainerWidthRef.current;
    setCategoryCanScrollLeft(scrollX > 4);
    setCategoryCanScrollRight(scrollX < contentW - containerW - 4);
  };

  // Same left/right arrow treatment for the portfolio detail page's
  // horizontal showcase image gallery, web only.
  const galleryScrollRef = useRef(null);
  const [galleryCanScrollLeft, setGalleryCanScrollLeft] = useState(false);
  const [galleryCanScrollRight, setGalleryCanScrollRight] = useState(false);
  const galleryScrollContentWidthRef = useRef(0);
  const galleryScrollContainerWidthRef = useRef(0);
  const galleryScrollXRef = useRef(0);
  const updateGalleryScrollArrows = (scrollX) => {
    galleryScrollXRef.current = scrollX;
    const contentW = galleryScrollContentWidthRef.current;
    const containerW = galleryScrollContainerWidthRef.current;
    setGalleryCanScrollLeft(scrollX > 4);
    setGalleryCanScrollRight(scrollX < contentW - containerW - 4);
  };
  const [showBackToTop, setShowBackToTop] = useState(false);

  const modalScrollViewRef = useRef(null);
  const [showModalBackToTop, setShowModalBackToTop] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const bellRotateAnim = useRef(new Animated.Value(0)).current;
  const [bellFlash, setBellFlash] = useState(false);

  // Header flip-toast: briefly flips the DECENT/version/Admin area over to
  // show an incoming notification, then flips back.
  const [headerToast, setHeaderToast] = useState(null); // { avatar, name, action }
  const headerFlipAnim = useRef(new Animated.Value(0)).current; // 0 = front (branding), 1 = back (toast)
  const headerToastTimeoutRef = useRef(null);

  const showHeaderToast = (avatar, name, action) => {
    if (headerToastTimeoutRef.current) clearTimeout(headerToastTimeoutRef.current);
    setHeaderToast({ avatar, name, action });
    headerFlipAnim.setValue(0);
    Animated.timing(headerFlipAnim, { toValue: TOAST_PILL_WIDTH, duration: 320, useNativeDriver: false }).start();
    headerToastTimeoutRef.current = setTimeout(() => {
      Animated.timing(headerFlipAnim, { toValue: 0, duration: 320, useNativeDriver: false }).start(() => {
        setHeaderToast(null);
      });
    }, 5000);
  };

  // Bell "pill" intro: on app open / just after login, the bell briefly
  // widens into a pill showing the unread count, wiggles twice, then
  // collapses back to its normal circle shape.
  const [bellIntroCount, setBellIntroCount] = useState(0);
  const bellPillWidthAnim = useRef(new Animated.Value(36)).current;
  const bellPillCountOpacity = useRef(new Animated.Value(0)).current;
  const bellIntroTimeoutsRef = useRef([]);
  const cogRotateAnim = useRef(new Animated.Value(0)).current;
  const tabScaleAnims = useRef({
    forYou: new Animated.Value(1),
    followed: new Animated.Value(1),
    search: new Animated.Value(1),
    profile: new Animated.Value(1),
    plus: new Animated.Value(1)
  }).current;

  // Short, subtle per-tab flourishes played once when switching TO that tab
  // (not on every render). Search and Add Portfolio are left plain.
  const forYouSparkleAnim = useRef(new Animated.Value(0)).current;
  const followedContinuousSpinAnim = useRef(new Animated.Value(0)).current;
  const profileDrawAnim = useRef(new Animated.Value(1)).current;

  const playForYouSparkle = () => {
    forYouSparkleAnim.setValue(0);
    Animated.timing(forYouSparkleAnim, { toValue: 1, duration: 550, useNativeDriver: true }).start();
  };

  const playProfileDraw = () => {
    profileDrawAnim.setValue(0);
    Animated.timing(profileDrawAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start();
  };

  const searchEyesAnim = useRef(new Animated.Value(0)).current;
  const playSearchEyes = () => {
    searchEyesAnim.setValue(0);
    Animated.timing(searchEyesAnim, { toValue: 1, duration: 650, useNativeDriver: false }).start();
  };

  // Short, lightweight fade for switching between My Portfolios / Liked
  // Portfolios within the profile page - same cheap opacity-only approach
  // as the main tab switch.
  const profileTabContentAnim = useRef(new Animated.Value(1)).current;
  const profileTabSlideAnim = useRef(new Animated.Value(0)).current; // 0 = myWork, 1 = likedWork
  const switchProfileTab = (tab) => {
    if (tab === profileTab) return;
    Animated.spring(profileTabSlideAnim, {
      toValue: tab === 'myWork' ? 0 : 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6
    }).start();
    if (!lightweightMode) {
      Animated.sequence([
        Animated.timing(profileTabContentAnim, { toValue: 0.3, duration: 90, useNativeDriver: true }),
        Animated.timing(profileTabContentAnim, { toValue: 1, duration: 150, useNativeDriver: true })
      ]).start();
    }
    setProfileTab(tab);
  };

  const playBellWiggle = () => {
    bellRotateAnim.setValue(0);
    Animated.sequence([
      Animated.timing(bellRotateAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(bellRotateAnim, { toValue: -1, duration: 100, useNativeDriver: true }),
      Animated.timing(bellRotateAnim, { toValue: 0.6, duration: 90, useNativeDriver: true }),
      Animated.timing(bellRotateAnim, { toValue: 0, duration: 90, useNativeDriver: true })
    ]).start();
  };

  // Plays once per app open / just after login: bell widens into a pill
  // showing the unread count, wiggles twice, then collapses back after a
  // couple seconds. No-ops when there's nothing to announce.
  const triggerBellIntroAnimation = (count) => {
    if (!count || count <= 0) return;
    bellIntroTimeoutsRef.current.forEach(clearTimeout);
    bellIntroTimeoutsRef.current = [];
    setBellIntroCount(count);

    // Hug content: bell icon slot + even left/right padding + a tight
    // estimate of the count text's rendered width.
    const introText = `${count}`;
    const estimatedTextWidth = introText.length * 7;
    const pillTargetWidth = Math.round(30 + 16 + estimatedTextWidth);

    Animated.timing(bellPillWidthAnim, { toValue: pillTargetWidth, duration: 280, useNativeDriver: false }).start();
    Animated.timing(bellPillCountOpacity, { toValue: 1, duration: 200, delay: 150, useNativeDriver: true }).start();

    playBellWiggle();
    bellIntroTimeoutsRef.current.push(setTimeout(() => playBellWiggle(), 500));

    bellIntroTimeoutsRef.current.push(setTimeout(() => {
      Animated.timing(bellPillCountOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      Animated.timing(bellPillWidthAnim, { toValue: 36, duration: 260, delay: 80, useNativeDriver: false }).start(() => {
        setBellIntroCount(0);
      });
    }, 2600));
  };

  useEffect(() => {
    return () => bellIntroTimeoutsRef.current.forEach(clearTimeout);
  }, []);

  // "Shrink to icon" open/close: scale + fade, all native-driven so it stays
  // smooth without extra libraries. The popup stays mounted for the closing
  // animation, then unmounts. Kept on even in Lightweight Mode - it's cheap
  // (native driver, ~150ms) and users specifically wanted it preserved.
  useEffect(() => {
    if (notificationModalVisible) {
      setNotificationPopupRendered(true);
      if (Platform.OS === 'web') {
        notificationPopupAnim.setValue(1);
      } else {
        Animated.spring(notificationPopupAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      }
    } else if (notificationPopupRendered) {
      Animated.timing(notificationPopupAnim, { toValue: 0, duration: Platform.OS === 'web' ? 0 : 150, useNativeDriver: true }).start(() => {
        setNotificationPopupRendered(false);
      });
    }
  }, [notificationModalVisible]);

  useEffect(() => {
    if (settingsModalVisible) {
      setSettingsPopupRendered(true);
      if (Platform.OS !== 'web') {
        Animated.spring(settingsPopupAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      } else {
        settingsPopupAnim.setValue(1);
      }
    } else if (settingsPopupRendered) {
      Animated.timing(settingsPopupAnim, { toValue: 0, duration: Platform.OS === 'web' ? 0 : 150, useNativeDriver: true }).start(() => {
        setSettingsPopupRendered(false);
        setOptionsView('root');
      });
    }
  }, [settingsModalVisible]);

  useEffect(() => {
    Animated.spring(themeToggleAnim, {
      toValue: themeMode === 'dark' ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8
    }).start();

    if (prevThemeModeRef.current !== themeMode) {
      if (themeMode === 'light') {
        sunActivateAnim.setValue(0);
        Animated.timing(sunActivateAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      } else {
        moonActivateAnim.setValue(0);
        Animated.timing(moonActivateAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
      prevThemeModeRef.current = themeMode;
    }
  }, [themeMode]);

  const playCogSpin = () => {
    cogRotateAnim.setValue(0);
    Animated.timing(cogRotateAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  };

  const playTabBounce = (tabKey) => {
    const anim = tabScaleAnims[tabKey];
    if (!anim) return;
    anim.setValue(0.82);
    Animated.spring(anim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

  const [bottomNav, setBottomNav] = useState('forYou');

  // Continuous rotation while the Circle tab is the active one.
  useEffect(() => {
    if (bottomNav === 'followed') {
      followedContinuousSpinAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(followedContinuousSpinAnim, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
      );
      loop.start();
      return () => loop.stop();
    }
  }, [bottomNav]);

  // Tab visit history - which of the 4 main tabs were visited before the
  // current one, in order. Android hardware back (and, separately, the web
  // browser's own back button) walks through this instead of always
  // jumping straight to For You regardless of where you actually came
  // from. isGoingBackRef prevents handleNavChange's normal push logic from
  // re-pushing when it's being called AS PART OF a back navigation (the
  // same pattern already used for the designer profile back stack).
  const [tabVisitStack, setTabVisitStack] = useState([]);
  const tabNavIsGoingBackRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [discoverSectionY, setDiscoverSectionY] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [profileTab, setProfileTab] = useState('myWork');
  const [profileTabBarWidth, setProfileTabBarWidth] = useState(0);
  // Same sliding-pill treatment as self-profile's tab bar, for the
  // Portfolios/Liked Portfolios toggle when viewing someone else's
  // profile - previously used plain per-button active styling with no
  // animation at all, inconsistent with self-profile's version.
  const [designerProfileTabBarWidth, setDesignerProfileTabBarWidth] = useState(0);
  const designerProfileTabSlideAnim = useRef(new Animated.Value(0)).current; // 0 = myWork, 1 = likedWork
  const designerProfileTabContentAnim = useRef(new Animated.Value(1)).current;
  const switchDesignerProfileTab = (tab) => {
    if (tab === designerProfileTab) return;
    Animated.spring(designerProfileTabSlideAnim, {
      toValue: tab === 'myWork' ? 0 : 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6
    }).start();
    if (!lightweightMode) {
      Animated.sequence([
        Animated.timing(designerProfileTabContentAnim, { toValue: 0.3, duration: 90, useNativeDriver: true }),
        Animated.timing(designerProfileTabContentAnim, { toValue: 1, duration: 150, useNativeDriver: true })
      ]).start();
    }
    setDesignerProfileTab(tab);
  };
  const [portfolioLayoutMode, setPortfolioLayoutMode] = useState('full'); // 'compact' | 'full'
  // Same toggle for the For You feed, native only - web already always
  // shows the 2-column grid there (no toggle needed), this brings native up
  // to having the same option web has, just switchable rather than fixed.
  // Independent from portfolioLayoutMode above since it's a different
  // screen and shouldn't couple its state to Profile's own toggle.
  // Defaults to all 4 selected ("All Portfolios") - only ui_ux has real,
  // creatable portfolios right now, but the other 3 stay selectable here
  // too so the filter is already correct and complete the moment any of
  // them go live, with no further changes needed to this piece.
  const PORTFOLIO_TYPE_OPTIONS = [
    { key: 'ui_ux', label: 'UI/UX' },
    { key: 'graphic_design', label: 'Graphic Design' },
    { key: 'illustration', label: 'Illustration' },
    { key: 'frontend', label: 'Frontend' }
  ];
  const [forYouTypeFilter, setForYouTypeFilter] = useState(new Set(PORTFOLIO_TYPE_OPTIONS.map((t) => t.key)));
  const [forYouTypeFilterOpen, setForYouTypeFilterOpen] = useState(false);
  const [forYouAiFilter, setForYouAiFilter] = useState(true); // true = "With AI", false = "No AI" - default per explicit instruction
  const forYouFiltersLoadedRef = useRef(false); // guards against the save-effect below firing on the initial default values, before the real saved ones (if any) have been loaded in

  // Load any previously-saved filter choices once on mount - once a person
  // changes either filter, it should stay that way indefinitely across
  // app opens, never silently reverting to the hardcoded defaults above.
  useEffect(() => {
    (async () => {
      try {
        const savedType = await AsyncStorage.getItem('forYouTypeFilter');
        if (savedType) setForYouTypeFilter(new Set(JSON.parse(savedType)));
        const savedAi = await AsyncStorage.getItem('forYouAiFilter');
        if (savedAi !== null) setForYouAiFilter(JSON.parse(savedAi));
      } catch (e) {
        console.warn('Failed to load saved For You filters:', e);
      } finally {
        forYouFiltersLoadedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!forYouFiltersLoadedRef.current) return; // skip the initial mount, before saved values (if any) have loaded
    AsyncStorage.setItem('forYouTypeFilter', JSON.stringify(Array.from(forYouTypeFilter))).catch(() => {});
  }, [forYouTypeFilter]);

  useEffect(() => {
    if (!forYouFiltersLoadedRef.current) return;
    AsyncStorage.setItem('forYouAiFilter', JSON.stringify(forYouAiFilter)).catch(() => {});
  }, [forYouAiFilter]);

  const [formStep, setFormStep] = useState(1);
  const [fTitle, setFTitle] = useState('');
  const [fDesigner, setFDesigner] = useState('');
  
  const [fCategories, setFCategories] = useState([]);
  const [fIsNsfw, setFIsNsfw] = useState(false);
  const [fIsAiGenerated, setFIsAiGenerated] = useState(null); // null = not yet chosen (required), true = With AI, false = No AI
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [categoryPickerModalVisible, setCategoryPickerModalVisible] = useState(false);
  const [masterCategoriesList, setMasterCategoriesList] = useState(ALL_UIUX_CATEGORIES_MASTER);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('custom_categories').select('name');
      if (!error && data && data.length > 0) {
        setMasterCategoriesList((prev) => {
          const existingLower = new Set(prev.map((c) => c.toLowerCase()));
          const additions = data.map((r) => r.name).filter((name) => !existingLower.has(name.toLowerCase()));
          return additions.length > 0 ? [...prev, ...additions].sort() : prev;
        });
      } else if (error) {
        console.warn('Failed to fetch custom categories:', error);
      }
    })();
  }, []);

  const [fBrief, setFBrief] = useState('');
  const [fLongDescription, setFLongDescription] = useState('');
  const [fullscreenDescEditorVisible, setFullscreenDescEditorVisible] = useState(false);
  const [descEditorMode, setDescEditorMode] = useState('edit'); // 'edit' | 'preview'
  // Block editor state (WordPress-style text/image/row blocks for the case study)
  const [fContentBlocks, setFContentBlocks] = useState([]);
  const [blockSelections, setBlockSelections] = useState({}); // per-block text selection, keyed by block id or `${rowId}:${colIdx}`
  // Typed/tapped block order (main blocks only, not row columns)
  const [orderInputDrafts, setOrderInputDrafts] = useState({}); // block id -> in-progress typed order text
  const fContentBlocksRef = useRef([]);
  fContentBlocksRef.current = fContentBlocks; // always fresh for commitOrderInputDraft, synced every render
  const [formattingGuideVisible, setFormattingGuideVisible] = useState(false);
  const [showIntroCarousel, setShowIntroCarousel] = useState(false);
  const [introPageIndex, setIntroPageIndex] = useState(0);
  const introScrollRef = useRef(null);
  const [fFigmaProto, setFFigmaProto] = useState('');
  const [fDesktopProto, setFDesktopProto] = useState('');
  const [fComponentProto, setFComponentProto] = useState('');
  const [fFigmaFile, setFFigmaFile] = useState('');
  const [fFigmaProfile, setFFigmaProfile] = useState('');
  const [fHasLiveLink, setFHasLiveLink] = useState(false);
  const [fLiveLinks, setFLiveLinks] = useState([{ label: '', url: '' }]);
  const [fCover, setFCover] = useState('');
  
  const [fShowcaseImages, setFShowcaseImages] = useState(['', '']);
  // Applied as a display-time crop (aspectRatio + resizeMode:'cover'), not
  // an actual file crop - expo-image-picker doesn't support allowsEditing/
  // aspect when allowsMultipleSelection is true, so there's no way to force
  // a crop during the multi-select picker flow itself. This also avoids
  // destructively modifying the original uploaded files.
  const [fShowcaseAspectRatio, setFShowcaseAspectRatio] = useState('16:9'); // '16:9' | '9:16'
  const [fVideoLinks, setFVideoLinks] = useState(['']);
  const [errors, setErrors] = useState({});
  const [toastMessage, setToastMessage] = useState(null);
  const [appAlertConfig, setAppAlertConfig] = useState(null); // { title, message, buttons }
  const [autoSuccessConfig, setAutoSuccessConfig] = useState(null); // { title, message }
  const [autoSuccessCountdown, setAutoSuccessCountdown] = useState(5);
  const autoSuccessTimeoutRef = useRef(null);
  const autoSuccessIntervalRef = useRef(null);
  const autoSuccessPresentTimeoutRef = useRef(null);

  const showAppAlert = (title, message, buttons) => {
    setAppAlertConfig({
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }]
    });
  };

  const showAutoSuccess = (title, message) => {
    if (autoSuccessTimeoutRef.current) clearTimeout(autoSuccessTimeoutRef.current);
    if (autoSuccessIntervalRef.current) clearInterval(autoSuccessIntervalRef.current);
    if (autoSuccessPresentTimeoutRef.current) clearTimeout(autoSuccessPresentTimeoutRef.current);
    // Small delay before actually presenting: if this is called in the same
    // tick as another modal closing (e.g. right after posting/deleting/
    // updating a portfolio), showing it immediately can race with that
    // modal's native dismiss on Android - two overlapping native Modal
    // windows transitioning at once can leave the second one rendered but
    // not actually visible/interactive on top. Letting the first one fully
    // close first avoids that entirely.
    autoSuccessPresentTimeoutRef.current = setTimeout(() => {
      setAutoSuccessConfig({ title, message });
      setAutoSuccessCountdown(5);
      autoSuccessIntervalRef.current = setInterval(() => {
        setAutoSuccessCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
      autoSuccessTimeoutRef.current = setTimeout(() => {
        setAutoSuccessConfig(null);
        if (autoSuccessIntervalRef.current) clearInterval(autoSuccessIntervalRef.current);
      }, 5000);
    }, 350);
  };
  const toastTimeoutRef = useRef(null);

  const showToast = (message) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    // iOS/web has no native toast API - fall back to the simple banner below,
    // no custom animation, just shown then cleared after a timeout.
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3500);
  };

  // Lightweight, fire-and-forget analytics. Never blocks the UI and never
  // throws - a failed analytics write should never break a real user action.
  const trackEvent = (eventName, metadata = {}) => {
    supabase
      .from('analytics_events')
      .insert({
        user_id: session ? session.user.id : null,
        event_name: eventName,
        metadata
      })
      .then(({ error }) => {
        if (error) console.warn('Analytics tracking failed:', error);
      });
  };

  const registerForPushNotifications = async (uid) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('Push notification permission not granted');
        setPushRegistrationStatus('Permission not granted');
        return;
      }

      const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.warn('No EAS projectId found - push token cannot be generated');
        setPushRegistrationStatus('No EAS project linked (missing projectId)');
        return;
      }
      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenResponse.data;

      const { data: updatedRows, error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: uid, push_token: token }, { onConflict: 'id' })
        .select();

      if (updateError) {
        setPushRegistrationStatus('Save failed: ' + updateError.message);
        return;
      }
      if (!updatedRows || updatedRows.length === 0) {
        // Belt-and-suspenders check - upsert should always affect a row, but
        // if this ever fires again it means a genuine RLS/permission block,
        // not a missing-row issue.
        setPushRegistrationStatus('Token generated but NOT saved - check profiles table permissions');
        return;
      }
      setPushRegistrationStatus('Registered: ' + token.slice(0, 24) + '...');
    } catch (e) {
      console.warn('Push notification registration failed:', e);
      setPushRegistrationStatus('Failed: ' + (e.message || 'unknown error'));
    }
  };

  // Sends a real push notification via Expo's push service to a specific user,
  // looked up by their stored push token. Returns a result object so callers
  // (like the admin test button) can show what actually happened instead of
  // assuming success.
  const sendPushNotification = async (recipientId, title, body) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', recipientId)
        .maybeSingle();

      if (error) return { ok: false, reason: 'Could not look up recipient profile.' };
      if (!data || !data.push_token) return { ok: false, reason: 'This account has no push token registered yet. Make sure notification permission was granted and you are on a real build, not Expo Go.' };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: data.push_token,
          title,
          body,
          sound: 'default'
        })
      });

      const result = await response.json();
      const ticket = result && result.data;
      if (ticket && ticket.status === 'error') {
        console.warn('Expo push API returned an error:', ticket);
        return { ok: false, reason: ticket.message || ticket.details?.error || 'Expo push API rejected the request.' };
      }
      return { ok: true };
    } catch (e) {
      console.warn('Push notification send failed:', e);
      return { ok: false, reason: e.message || 'Network or unexpected error.' };
    }
  };
  const PAGE_SIZE = 30;
  const [hasMoreProjects, setHasMoreProjects] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfoCompat.addEventListener((state) => {
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Skip entirely in local dev (Updates isn't meaningful outside a real
    // published build) so this never interferes with normal testing. Also
    // skip on web: OTA update checks are a native-build concept and
    // expo-updates has no meaningful web behavior to check for.
    if (__DEV__ || Platform.OS === 'web') return;

    const checkForUpdate = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) setUpdateAvailable(true);
      } catch (e) {
        console.warn('Update check failed:', e);
      }
    };

    // Was only ever checking once on initial mount - meant a person already
    // using the app when a new eas update went out would never see the
    // banner until they fully force-closed and relaunched, since nothing
    // ever re-checked mid-session. Now also re-checks periodically while
    // the app stays open, and immediately whenever it returns to the
    // foreground (covers the far more common case of switching away and
    // back rather than a true process restart) - between the two, a real
    // restart should no longer be necessary to find out an update exists.
    checkForUpdate();
    const intervalId = setInterval(checkForUpdate, 5 * 60 * 1000);
    const foregroundSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdate();
    });

    return () => {
      clearInterval(intervalId);
      foregroundSub.remove();
    };
  }, []);

  const handleApplyUpdate = async () => {
    // On web this banner can never actually show (the check above never
    // sets updateAvailable there), but guard anyway in case that changes.
    if (Platform.OS === 'web') return;
    setUpdateDownloading(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (e) {
      console.warn('Update download/apply failed:', e);
      setUpdateDownloading(false);
      showToast('Update failed — please try again later');
    }
  };

  // The `likes` table already gets written to correctly on toggleLike, but
  // every fetch below was hardcoding liked:false instead of checking it -
  // meaning liked state reset on every refresh/reboot. This fixes that.
  const fetchLikedPortfolioIds = async () => {
    if (!session) return new Set();
    const { data, error } = await supabase.from('likes').select('portfolio_id').eq('user_id', session.user.id);
    if (error || !data) return new Set();
    return new Set(data.map((r) => r.portfolio_id));
  };

  const fetchInitialProjects = async () => {
    try {
      // Try fetching online portfolios from Supabase
      const { data: onlinePortfolios, error } = await supabase
        .from('portfolios')
        .select('*, portfolio_images(image_url)')
        .or('is_nsfw.eq.false,is_nsfw.is.null')
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (!error && onlinePortfolios && onlinePortfolios.length > 0) {
        setHasMoreProjects(onlinePortfolios.length === PAGE_SIZE);
        const likedIds = await fetchLikedPortfolioIds();
        const mapped = onlinePortfolios.map((p) => ({
          id: p.id,
          ownerId: p.user_id || null,
          portfolioType: p.portfolio_type || 'ui_ux',
          isAiGenerated: p.is_ai_generated,
          title: p.title,
          designer: p.user_name || 'Unknown Designer',
          designerHandle: p.user_handle || '',
          designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
          category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
          categories: p.categories || ['Mobile App'],
          liked: likedIds.has(p.id),
          likesCount: p.likes_count ?? 0,
          visitsCount: p.visits_count || 120,
          figmaProfile: p.figma_profile || '',
        liveLinks: p.live_links || [],
        isNsfw: !!p.is_nsfw,
          liveLinks: p.live_links || [],
          isNsfw: !!p.is_nsfw,
          showcaseAspectRatio: p.showcase_aspect_ratio || '16:9',
          figmaProto: p.figma_proto || '',
          componentProto: p.component_proto || '',
          desktopProto: p.desktop_proto || '',
          figmaFile: p.figma_file || '',
          brief: p.brief || '',
          longDescription: p.long_description || '',
          contentBlocks: getContentBlocksFromRow(p),
          pinned: !!p.is_pinned,
          cover: p.cover_url || '',
          images: getShowcaseImagesFromRow(p),
          videoLinks: [],
          caseStudy: p.brief || ''
        }));
        setProjects(mapped);
      } else {
        const savedProjects = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedProjects) setProjects(JSON.parse(savedProjects));
      }
    } catch (e) {
      console.warn('Failed to load storage', e);
      showToast('Could not load the feed — check your connection');
    } finally {
      setHydrated(true);
    }
  };

  useEffect(() => {
    fetchInitialProjects();
  }, []);

  const loadMoreProjects = async () => {
    if (loadingMore || !hasMoreProjects) return;
    setLoadingMore(true);
    try {
      const { data: morePortfolios, error } = await supabase
        .from('portfolios')
        .select('*, portfolio_images(image_url)')
        .or('is_nsfw.eq.false,is_nsfw.is.null')
        .order('created_at', { ascending: false })
        .range(projects.length, projects.length + PAGE_SIZE - 1);

      if (!error && morePortfolios) {
        setHasMoreProjects(morePortfolios.length === PAGE_SIZE);
        const likedIds = await fetchLikedPortfolioIds();
        const mapped = morePortfolios.map((p) => ({
          id: p.id,
          ownerId: p.user_id || null,
          portfolioType: p.portfolio_type || 'ui_ux',
          isAiGenerated: p.is_ai_generated,
          title: p.title,
          designer: p.user_name || 'Unknown Designer',
            designerHandle: p.user_handle || '',
          designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
          category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
          categories: p.categories || ['Mobile App'],
          liked: likedIds.has(p.id),
          likesCount: p.likes_count ?? 0,
          visitsCount: p.visits_count || 120,
          figmaProfile: p.figma_profile || '',
          liveLinks: p.live_links || [],
          isNsfw: !!p.is_nsfw,
          showcaseAspectRatio: p.showcase_aspect_ratio || '16:9',
          componentProto: p.component_proto || '',
          figmaProto: p.figma_proto || '',
          desktopProto: p.desktop_proto || '',
          figmaFile: p.figma_file || '',
          brief: p.brief || '',
          cover: p.cover_url || '',
          longDescription: p.long_description || '',
          contentBlocks: getContentBlocksFromRow(p),
          pinned: !!p.is_pinned,
          images: getShowcaseImagesFromRow(p),
          videoLinks: [],
          caseStudy: p.brief || ''
        }));
        setProjects((prev) => [...prev, ...mapped]);
      }
    } catch (e) {
      console.warn('Failed to load more projects', e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecked(true);
      if (session) {
        validateSessionStillExists();
      }
      // Fires for guests too now (previously only logged-in users, which
      // misses most traffic since guest browsing became the default entry
      // point). Includes current theme/lightweight-mode/detected mobile OS
      // so the admin analytics dashboard has an actual snapshot to
      // aggregate, instead of an empty metadata object.
      supabase.from('analytics_events').insert({
        user_id: session ? session.user.id : null,
        event_name: 'app_opened',
        metadata: {
          theme_mode: themeMode,
          lightweight_mode: lightweightMode,
          mobile_os: Platform.OS === 'web' && typeof navigator !== 'undefined'
            ? (/Android/i.test(navigator.userAgent) ? 'android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'desktop')
            : Platform.OS,
          platform: Platform.OS
        }
      }).then(({ error }) => {
        if (error) console.warn('Analytics tracking failed:', error);
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN') {
        // Strips the #access_token=...&refresh_token=...&... fragment the
        // OAuth redirect leaves in the address bar. Supabase has already
        // read it by this point (that's how session got populated) - purely
        // cosmetic/hygiene, but leaving raw tokens sitting in a visible,
        // bookmarkable, shareable URL is worth cleaning up regardless.
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
        // Reset UI position so a fresh login always starts clean,
        // instead of remembering wherever the previous session left off.
        setBottomNav('forYou');
        setCategoryFilter('all');
        setProfileTab('myWork');
        profileTabSlideAnim.setValue(0);
        setSearchQuery('');
        setModalVisible(false);
        setAddModalVisible(false);
        setDesignerModalVisible(false);
        setDesignerBackStack([]);
        setSettingsModalVisible(false);
        setReturnToOptionsOnClose(false);
        setNotificationModalVisible(false);
        setAccountSettingsModalVisible(false);
        setAccountSaveSuccessModalVisible(false);
        setExternalLinkModalVisible(false);
        setAboutModalVisible(false);
        setPrivacyModalVisible(false);
        setTermsModalVisible(false);
        setReportsModalVisible(false);
        setDisableSafeSearchModalVisible(false);
        setAdminPasswordModalVisible(false);
        setFeedbackModalVisible(false);
        setFeedbackSuccessModalVisible(false);
        setDonateModalVisible(false);
        setDonateSuccessModalVisible(false);
        setDiscardConfirmModalVisible(false);
        setDeleteConfirmModalVisible(false);
        setAllCategoriesModalVisible(false);
        setUserListModalVisible(false);
        setCategoryPickerModalVisible(false);
        setShareModalVisible(false);
        setDeleteAccountModalVisible(false);
        setLogoutConfirmModalVisible(false);
        mainScrollViewRef.current?.scrollTo({ y: 0, animated: false });

        // Synchronously clear profile edit fields too - the async per-user data
        // effect will correctly repopulate these for an existing account, but
        // this closes the race-condition window where a brand new account
        // could briefly show the previous account's stale handle/name.
        setEditHandle('');
        setEditName('');
        setHandleStatus(null);

        // Admin unlock and other session-only UI state must NOT carry over
        // between accounts - previously, unlocking admin on one account kept
        // it unlocked even after switching to a non-admin account.
        setAdminUnlocked(false);
        setVersionTapCount(0);
        setOptionsView('root');
        setActiveProject(null);
        setSelectedDesigner(null);
        setNotificationsList([]);
        setFeedbackMessagesList([]);
        setPortfolioLayoutMode('full');
      }
    });

    const validateSessionStillExists = async () => {
    const { error } = await supabase.auth.getUser();
    if (error) {
      // Don't sign out immediately on the first failure. A cached session
      // restored fresh on page load can have an access token that's
      // already expired by the time this check runs - autoRefreshToken is
      // supposed to silently refresh it, but that's a background process
      // that hasn't necessarily finished yet at this exact moment. Signing
      // out here jumps the gun on a perfectly valid session that was about
      // to refresh itself - this was very likely the actual cause of
      // "every refresh logs me out." Give the refresh a moment, then
      // check again before concluding the session (not just the access
      // token) is genuinely invalid.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const retry = await supabase.auth.getUser();
      if (retry.error) {
        // The account no longer exists (or the token is otherwise invalid
        // server-side) even though a session was still cached locally -
        // force a clean logout rather than continuing to run on a stale
        // session pointing at a deleted account.
        console.warn('Session no longer valid, signing out:', retry.error.message);
        await supabase.auth.signOut();
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.reload();
        } else {
          try {
            await Updates.reloadAsync();
          } catch (e) {
            console.warn('Updates.reloadAsync unavailable (expected in dev):', e.message);
          }
        }
      }
    }
  };

  const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        // Guests have no session to validate - supabase.auth.getUser()
        // always errors with nothing to fetch, which was falling straight
        // into the "session no longer valid" branch and reloading the page
        // every time a guest switched back to this tab. sessionRef (not
        // the closured `session` above) since this listener is set up once
        // on mount and needs the CURRENT session, not whatever it was at
        // that moment.
        if (sessionRef.current) validateSessionStillExists();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    // Also check periodically while the app stays continuously open in the
    // foreground - the checks above only fire on boot and on foreground
    // transitions, so an account deleted while the app is never
    // backgrounded would otherwise go undetected indefinitely.
    const sessionCheckInterval = setInterval(() => {
      if (AppState.currentState === 'active' && sessionRef.current) validateSessionStillExists();
    }, 60000);

    return () => {
      listener.subscription.unsubscribe();
      appStateSub.remove();
      clearInterval(sessionCheckInterval);
    };
  }, []);

  const [userDataLoaded, setUserDataLoaded] = useState(false);

  useEffect(() => {
    if (!session || projects.length === 0) return;
    (async () => {
      const { data: likedRows } = await supabase
        .from('likes')
        .select('portfolio_id')
        .eq('user_id', session.user.id);
      if (likedRows) {
        const likedIds = new Set(likedRows.map((r) => r.portfolio_id));
        setProjects((prev) => prev.map((p) => ({ ...p, liked: likedIds.has(p.id) })));
      }
    })();
  }, [session, projects.length]);

  const [followersOfMe, setFollowersOfMe] = useState(new Set());
  const [blockedIds, setBlockedIds] = useState(new Set());
  // Muting hides a designer's posts from the main feed without unfollowing
  // or blocking them - they're not notified and can still see/interact
  // with you normally, unlike a block.
  const [mutedIds, setMutedIds] = useState(new Set());

  // "Views this week" stat on the own Profile tab - two-step because
  // Supabase JS doesn't support a subquery + count in one call: first get
  // which portfolios are mine, then count how many portfolio_views rows
  // for those IDs fall inside the last 7 days.
  useEffect(() => {
    if (!session) {
      setMyWeeklyViews(null);
      return;
    }
    (async () => {
      const { data: myPortfolios } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', session.user.id);
      const ids = (myPortfolios || []).map((p) => p.id);
      if (ids.length === 0) {
        setMyWeeklyViews(0);
        return;
      }
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('portfolio_views')
        .select('id', { count: 'exact', head: true })
        .in('portfolio_id', ids)
        .gte('viewed_at', sevenDaysAgo);
      if (error) {
        console.warn('Weekly views fetch failed:', error.message);
        setMyWeeklyViews(0);
        return;
      }
      setMyWeeklyViews(count || 0);
    })();
  }, [session, projects.length]);

  useEffect(() => {
    if (!session) {
      setBlockedIds(new Set());
      return;
    }
    (async () => {
      const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', session.user.id);
      setBlockedIds(new Set((data || []).map((r) => r.blocked_id)));
    })();
  }, [session]);

  useEffect(() => {
    if (!session) {
      setMutedIds(new Set());
      return;
    }
    (async () => {
      const { data } = await supabase.from('muted_designers').select('muted_id').eq('muter_id', session.user.id);
      setMutedIds(new Set((data || []).map((r) => r.muted_id)));
    })();
  }, [session]);

  useEffect(() => {
    // Used to bail out entirely for guests (`if (!session) return`), which
    // is why Discover Designers showed (0) when logged out - profiles is a
    // publicly readable table (confirmed no RLS restriction), this was
    // purely a client-side gate that had no reason to exist. Now runs for
    // everyone; only the session-specific pieces (excluding your own
    // profile, your follow counts, who follows you) are conditional.
    (async () => {
      let profileQuery = supabase.from('profiles').select('*').neq('name', '');
      if (session) profileQuery = profileQuery.neq('id', session.user.id);
      const { data: profileRows } = await profileQuery;

      const { data: followRows } = await supabase.from('follows').select('follower_id, following_id');

      const followerCounts = {};
      const followingCounts = {};
      const myFollowers = new Set();
      (followRows || []).forEach((r) => {
        followerCounts[r.following_id] = (followerCounts[r.following_id] || 0) + 1;
        followingCounts[r.follower_id] = (followingCounts[r.follower_id] || 0) + 1;
        if (session && r.following_id === session.user.id) myFollowers.add(r.follower_id);
      });

      if (session) {
        setFollowersOfMe(myFollowers);
        setProjects((prev) => prev.map((p) => ({ ...p, followsMe: p.ownerId ? myFollowers.has(p.ownerId) : false })));
        setMyFollowStats({
          followersCount: followerCounts[session.user.id] || 0,
          followingCount: followingCounts[session.user.id] || 0
        });
      }

      if (!profileRows || profileRows.length === 0) {
        setLiveDesigners([]);
        return;
      }

      const mapped = profileRows.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role || '',
        location: p.location || '',
        avatar: p.avatar_url || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
        figma: (p.links && p.links[0]) || '',
        handle: p.handle || '',
        bio: p.bio || '',
        followersCount: followerCounts[p.id] || 0,
        followingCount: followingCounts[p.id] || 0,
        followsMe: myFollowers.has(p.id),
        createdAt: p.created_at || null,
        links: p.links || []
      }));

      setLiveDesigners(mapped.filter((d) => !blockedIds.has(d.id)));
    })();
  }, [session, blockedIds]);

  const allDesigners = useMemo(() => {
    const combined = [...liveDesigners, ...POPULAR_DESIGNERS];
    // Discovery algorithm: newest accounts first for now, since there's no
    // engagement signal yet to rank by. Once likes/follows have real volume,
    // this is the natural place to switch to an engagement-weighted score
    // like the "Highlighted" feed algorithm.
    return combined.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [liveDesigners]);

  const DISCOVER_PAGE_SIZE = 10;
  const [discoverDesignersLimit, setDiscoverDesignersLimit] = useState(DISCOVER_PAGE_SIZE);

  const [popularKeywords, setPopularKeywords] = useState([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('portfolios').select('categories');
      if (error || !data) return;

      // Count how many portfolios use each category/tag, then rank by real frequency.
      const counts = {};
      data.forEach((row) => {
        (row.categories || []).forEach((cat) => {
          if (!cat) return;
          counts[cat] = (counts[cat] || 0) + 1;
        });
      });

      const ranked = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 9)
        .map(([cat]) => cat);

      setPopularKeywords(ranked);
    })();
  }, [projects.length]);

  useEffect(() => {
    const h = editHandle.trim();
    if (!h) {
      setHandleStatus(null);
      return;
    }
    if (!isValidHandleFormat(h)) {
      setHandleStatus('invalid');
      return;
    }
    setHandleStatus('checking');
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .ilike('handle', h)
        .maybeSingle();
      if (data && (!session || data.id !== session.user.id)) {
        setHandleStatus('taken');
      } else {
        setHandleStatus('available');
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [editHandle, session]);

  const [notificationsJustCleared, setNotificationsJustCleared] = useState(false);
  const clearBtnAnim = useRef(new Animated.Value(1)).current;

  const handleClearAllNotifications = async () => {
    if (!session) return;
    const { data: deletedRows, error } = await supabase
      .from('notifications')
      .delete()
      .eq('recipient_id', session.user.id)
      .select('id');

    if (error) {
      showToast('Failed to clear notifications');
      console.warn('Clear notifications error:', error);
      return;
    }

    // Supabase doesn't error when RLS silently blocks a delete - it just
    // reports success with 0 rows affected. Catch that so the UI doesn't
    // show "cleared" while the rows are still sitting on the server (they'll
    // just reappear on the next fetch otherwise).
    if (notificationsList.length > 0 && (!deletedRows || deletedRows.length === 0)) {
      showToast('Could not clear notifications - check delete permissions');
      console.warn('Clear notifications: 0 rows deleted despite a non-empty list (likely missing/blocking RLS delete policy on notifications)');
      return;
    }

    setNotificationsList([]);

    Animated.sequence([
      Animated.timing(clearBtnAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(clearBtnAnim, { toValue: 1, duration: 180, useNativeDriver: true })
    ]).start();
    setNotificationsJustCleared(true);
    showToast('Notifications cleared');

    setTimeout(() => {
      Animated.sequence([
        Animated.timing(clearBtnAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(clearBtnAnim, { toValue: 1, duration: 180, useNativeDriver: true })
      ]).start();
      setNotificationsJustCleared(false);
    }, 1300);
  };

  const dismissNotification = async (notifId) => {
    const previousList = notificationsList;
    setNotificationsList((prev) => prev.filter((n) => n.id !== notifId));
    const { data: deletedRows, error } = await supabase.from('notifications').delete().eq('id', notifId).select('id');
    if (error || !deletedRows || deletedRows.length === 0) {
      // Delete didn't actually persist server-side - revert the optimistic
      // removal instead of showing a false "gone" state.
      setNotificationsList(previousList);
      showToast('Could not remove notification');
    }
  };

  const markNotificationsRead = async () => {
    if (!session) return;
    // Optimistic local update so the badge clears immediately.
    setNotificationsList((prev) => prev.map((n) => ({ ...n, read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', session.user.id)
      .eq('is_read', false);
    if (error) console.warn('Failed to mark notifications read:', error);
  };

  const mapNotificationRow = (n) => ({
    id: n.id,
    type: n.type,
    user: n.actor ? n.actor.name : 'Someone',
    actorId: n.actor ? n.actor.id : null,
    portfolioId: n.portfolio_id || null,
    action: n.type === 'like' ? 'liked your portfolio package' : n.type === 'follow' ? 'started following your profile' : 'sent a test notification from the Admin Panel',
    target: n.portfolio ? n.portfolio.title : '',
    time: formatRelativeTime(n.created_at),
    avatar: (n.actor && n.actor.avatar_url) || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
    read: !!n.is_read
  });

  // Full notification history (Privacy > Notification History) - unlike the
  // bell dropdown's capped list of 50, this paginates through everything.
  const fetchNotificationHistory = async (reset) => {
    if (!session) return;
    if (reset) {
      setNotificationHistoryLoading(true);
      setNotificationHistoryHasMore(true);
    }
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, created_at, portfolio_id, is_read, actor:profiles!notifications_actor_id_fkey(id, name, avatar_url), portfolio:portfolios(title)')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(0, NOTIFICATION_HISTORY_PAGE_SIZE - 1);

    if (!error && data) {
      setNotificationHistoryList(data.map(mapNotificationRow));
      setNotificationHistoryHasMore(data.length === NOTIFICATION_HISTORY_PAGE_SIZE);
    } else if (error) {
      console.warn('Failed to fetch notification history:', error);
    }
    setNotificationHistoryLoading(false);
  };

  const loadMoreNotificationHistory = async () => {
    if (!session || notificationHistoryLoadingMore || !notificationHistoryHasMore) return;
    setNotificationHistoryLoadingMore(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, created_at, portfolio_id, is_read, actor:profiles!notifications_actor_id_fkey(id, name, avatar_url), portfolio:portfolios(title)')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(notificationHistoryList.length, notificationHistoryList.length + NOTIFICATION_HISTORY_PAGE_SIZE - 1);

    if (!error && data) {
      setNotificationHistoryList((prev) => [...prev, ...data.map(mapNotificationRow)]);
      setNotificationHistoryHasMore(data.length === NOTIFICATION_HISTORY_PAGE_SIZE);
    } else if (error) {
      console.warn('Failed to load more notification history:', error);
    }
    setNotificationHistoryLoadingMore(false);
  };

  const fetchNotifications = async () => {
    if (!session) return [];
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, created_at, portfolio_id, is_read, actor:profiles!notifications_actor_id_fkey(id, name, avatar_url), portfolio:portfolios(title)')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      const mapped = data.map(mapNotificationRow);
      setNotificationsList(mapped);
      return mapped;
    } else if (error) {
      console.warn('Failed to fetch notifications:', error);
    }
    return [];
  };

  // Fires on app open (existing session restored) and right after login
  // (session goes from null to a value) - both cases the bell plays its
  // pill-expand intro if there are unread items to show.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const list = await fetchNotifications();
      if (!cancelled) triggerBellIntroAnimation(list.length);
    })();
    return () => { cancelled = true; };
  }, [session]);

  // Listens for new notifications arriving while the app is open, so the
  // bell can flash/wiggle immediately instead of only updating on next fetch.
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${session.user.id}` },
        () => {
          playBellWiggle();
          setBellFlash(true);
          setTimeout(() => setBellFlash(false), 900);
          fetchNotifications().then((list) => {
            if (list.length > 0) {
              const latest = list[0];
              showHeaderToast(latest.avatar, latest.user, latest.action);
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      setUserDataLoaded(false);

      if (!session) {
        // Logged out: clear local state back to blank
        setFollowedDesigners([]);
        setHideLikedPortfolios(false);
        setNeedsOnboarding(false);
        setUserProfile({
          name: '',
          role: '',
          location: '',
          bio: '',
          email: '',
          avatar: 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
          links: []
        });
        setEditName('');
        setEditRole('');
        setEditLocation('');
        setEditBio('');
        setEditEmail('');
        setEditAvatar('');
        setEditLinks([]);
        setUserDataLoaded(true);
        return;
      }

      const uid = session.user.id;
      const userEmail = session.user.email || '';
      registerForPushNotifications(uid);

      try {
        const savedFollowed = await AsyncStorage.getItem(`${FOLLOWED_KEY}_${uid}`);
        setFollowedDesigners(savedFollowed ? JSON.parse(savedFollowed) : []);
        // AsyncStorage above is just an instant-paint cache so the UI doesn't
        // flash empty on load - the follows table is the actual source of
        // truth and always overwrites it once this resolves. This also
        // means follow state now correctly carries over to a new device or
        // fresh install, which the AsyncStorage-only version never did.
        supabase.from('follows').select('following_id').eq('follower_id', uid).then(({ data, error }) => {
          if (!error && data) {
            const ids = data.map((r) => r.following_id);
            setFollowedDesigners(ids);
            AsyncStorage.setItem(`${FOLLOWED_KEY}_${uid}`, JSON.stringify(ids)).catch(() => {});
          }
        });

        const savedHideLiked = await AsyncStorage.getItem(`${HIDE_LIKED_KEY}_${uid}`);
        setHideLikedPortfolios(savedHideLiked !== null ? JSON.parse(savedHideLiked) : false);

        const { data: cloudProfile, error: profileFetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (cloudProfile) {
          const parsed = {
            name: cloudProfile.name || '',
            role: cloudProfile.role || '',
            location: cloudProfile.location || '',
            bio: cloudProfile.bio || '',
            email: cloudProfile.email || userEmail,
            avatar: cloudProfile.avatar_url || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
            handle: cloudProfile.handle || '',
            links: cloudProfile.links || []
          };
          setUserProfile(parsed);
          setEditName(parsed.name);
          setEditRole(parsed.role);
          setEditLocation(parsed.location);
          setEditBio(parsed.bio);
          setEditEmail(parsed.email);
          setEditAvatar(parsed.avatar);
          setEditHandle(parsed.handle);
          setHandleChangedAt(cloudProfile.handle_changed_at || null);
          setEditLinks(parsed.links);
          setFeedbackEmail(parsed.email);
          AsyncStorage.setItem(`${USER_PROFILE_KEY}_${uid}`, JSON.stringify(parsed)).catch(() => {});

          // Cloud flag is the source of truth (survives reinstalls/new devices).
          // Mirror it locally so we still have a sensible fallback if offline next time.
          setNeedsOnboarding(!cloudProfile.onboarding_completed);
          AsyncStorage.setItem(`${ONBOARDING_KEY}_${uid}`, cloudProfile.onboarding_completed ? 'true' : 'false').catch(() => {});
        } else {
          // No cloud profile yet (offline, or brand new account) - fall back to local cache
          const savedProfile = await AsyncStorage.getItem(`${USER_PROFILE_KEY}_${uid}`);
          if (savedProfile) {
            const parsed = JSON.parse(savedProfile);
            setUserProfile(parsed);
            setEditName(parsed.name || '');
            setEditRole(parsed.role || '');
            setEditLocation(parsed.location || '');
            setEditBio(parsed.bio || '');
            setEditEmail(parsed.email || userEmail);
            setEditAvatar(parsed.avatar || '');
            setEditLinks(parsed.links || []);
            setFeedbackEmail(parsed.email || userEmail);

            // No cloud profile reachable right now (offline) - fall back to the
            // locally cached onboarding flag from the last successful sync.
            const cachedOnboarding = await AsyncStorage.getItem(`${ONBOARDING_KEY}_${uid}`);
            setNeedsOnboarding(cachedOnboarding !== 'true');
          } else {
            // Brand new account. If this came from Google (or any OAuth
            // provider), Supabase already has name/avatar in
            // session.user.user_metadata - use it instead of leaving the
            // form blank, since the user already handed that info to
            // Google and re-typing it is pure friction.
            setNeedsOnboarding(true);
            const googleName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
            const googleAvatar = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '';
            const blankProfile = {
              name: googleName,
              role: '',
              location: '',
              bio: '',
              email: userEmail,
              avatar: googleAvatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
              links: []
            };
            setUserProfile(blankProfile);
            setEditName(googleName);
            setEditRole('');
            setEditLocation('');
            setEditBio('');
            setEditEmail(userEmail);
            setEditAvatar(blankProfile.avatar);
            setEditLinks([]);
            setFeedbackEmail(userEmail);

            // Safety net: guarantees a profiles row exists regardless of
            // whether a DB trigger creates one automatically. If a trigger
            // already created it moments ago (race with this fetch), this
            // upsert just harmlessly updates the same row instead of
            // erroring - upsert, not insert.
            supabase.from('profiles').upsert({
              id: uid,
              name: googleName,
              email: userEmail,
              avatar_url: googleAvatar || null,
              onboarding_completed: false
            }).then(({ error: upsertError }) => {
              if (upsertError) console.warn('Profile safety-net upsert failed:', upsertError);
            });
          }
        }
      } catch (e) {
        console.warn('Failed to load account data', e);
      } finally {
        setUserDataLoaded(true);
      }
    })();
  }, [session]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(projects)).catch((e) => console.warn('Save error', e));
  }, [projects, hydrated]);

  useEffect(() => {
    if (!session || !userDataLoaded) return;
    AsyncStorage.setItem(`${FOLLOWED_KEY}_${session.user.id}`, JSON.stringify(followedDesigners)).catch((e) => console.warn('Save error', e));
  }, [followedDesigners, session, userDataLoaded]);

  useEffect(() => {
    if (!session || !userDataLoaded) return;
    AsyncStorage.setItem(`${HIDE_LIKED_KEY}_${session.user.id}`, JSON.stringify(hideLikedPortfolios)).catch((e) => console.warn('Save error', e));
  }, [hideLikedPortfolios, session, userDataLoaded]);

  useEffect(() => {
    if (!session || !userDataLoaded) return;
    AsyncStorage.setItem(`${USER_PROFILE_KEY}_${session.user.id}`, JSON.stringify(userProfile)).catch((e) => console.warn('Save error', e));
  }, [userProfile, session, userDataLoaded]);

  const openExternalLinkWithWarning = (url) => {
    if (!url) return;
    setTargetExternalUrl(url);
    setExternalLinkModalVisible(true);
  };

  const handleReportExternalLink = async () => {
    if (!session || !targetExternalUrl) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: session.user.id,
      target_type: 'external_link',
      target_url: targetExternalUrl,
      reason: 'reported_as_suspicious'
    });
    setExternalLinkModalVisible(false);
    showToast(error ? 'Failed to submit report' : 'Link reported — thank you');
  };

  const confirmProceedToExternalLink = () => {
    if (targetExternalUrl) {
      if (Platform.OS === 'web') {
        // window.open specifically (not Linking.openURL) for two reasons:
        // this is the only reliable way to force a genuinely new tab on
        // web (Linking.openURL's web implementation just navigates the
        // current tab away, losing all app state), and it also sidesteps
        // whatever was silently swallowing the click before - opening a
        // new tab from directly inside this synchronous click handler,
        // with no intervening await, keeps it unambiguously tied to the
        // user's actual click so browsers won't treat it as an
        // unrequested popup and block it.
        window.open(targetExternalUrl, '_blank', 'noopener,noreferrer');
      } else {
        Linking.openURL(targetExternalUrl).catch((err) => console.warn("Failed to open link", err));
      }
    }
    setExternalLinkModalVisible(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchInitialProjects();
      if (session) await fetchNotifications();
    } finally {
      setRefreshing(false);
    }
  };

  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    tabScrollOffsetsRef.current[bottomNav] = offsetY;
    if (offsetY > 220) {
      if (!showBackToTop) setShowBackToTop(true);
    } else {
      if (showBackToTop) setShowBackToTop(false);
    }

    const { layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (offsetY + layoutMeasurement.height);
    if (distanceFromBottom < 400 && bottomNav === 'forYou' && hasMoreProjects && !loadingMore) {
      loadMoreProjects();
    }
    if (
      distanceFromBottom < 400 &&
      bottomNav === 'search' &&
      searchQuery.trim() === '' &&
      discoverDesignersLimit < searchedDesigners.length
    ) {
      setDiscoverDesignersLimit((prev) => prev + DISCOVER_PAGE_SIZE);
    }
  };

  const scrollToTop = () => {
    mainScrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Restores whatever scroll position this tab was at last time it was
  // active. Runs after bottomNav changes (not inside handleNavChange
  // itself) so the new tab's content has actually rendered first - jumping
  // to a remembered Y offset before the taller/shorter new content is in
  // the tree wouldn't land in the right place.
  useEffect(() => {
    const remembered = tabScrollOffsetsRef.current[bottomNav] || 0;
    if (remembered > 0) {
      const raf = requestAnimationFrame(() => {
        mainScrollViewRef.current?.scrollTo({ y: remembered, animated: false });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [bottomNav]);

  const handleModalScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY > 220) {
      if (!showModalBackToTop) setShowModalBackToTop(true);
    } else {
      if (showModalBackToTop) setShowModalBackToTop(false);
    }
  };

  const scrollModalToTop = () => {
    modalScrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleNavChange = (newNav) => {
    // Viewing another designer's profile, or a portfolio's detail page, are
    // now "pages" on wide web (still Modals elsewhere) - navigating
    // anywhere else should exit them, same as leaving any other page would.
    if (designerModalVisible) setDesignerModalVisible(false);
    if (Platform.OS === 'web' && isWebWide && modalVisible) setModalVisible(false);
    setCameFromPortfolioId(null);
    setCameFromDesignerId(null);
    setTopStackedPage(null);
    setDesignerBackStack([]);

    playTabBounce(newNav);
    if (newNav === 'forYou') playForYouSparkle();
    if (newNav === 'followed') { /* continuous rotation handles this now, see followedContinuousSpinAnim effect */ }
    if (newNav === 'profile') playProfileDraw();
    if (newNav === 'search') playSearchEyes();

    if (newNav === bottomNav) {
      if (newNav === 'forYou') {
        setCategoryFilter('all');
      } else if (newNav === 'followed') {
        setSelectedFollowedDesigner(null);
      } else if (newNav === 'search') {
        setSearchQuery('');
      } else if (newNav === 'profile') {
        switchProfileTab('myWork');
      }
      tabScrollOffsetsRef.current[newNav] = 0;
      scrollToTop();
      return;
    }

    // Lightweight fade only (opacity, native-driven) - the previous full
    // off-screen slide-out/slide-in was heavier since it animated the whole
    // tab content (including large lists) through two extra transform
    // passes on every switch. A quick fade reads just as intentional for a
    // fraction of the cost. Lightweight Mode skips even that.
    if (!lightweightMode) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 90, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true })
      ]).start();
    }
    if (!tabNavIsGoingBackRef.current) {
      setTabVisitStack((prevStack) => [...prevStack, bottomNav]);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.pushState({ decentNavStep: true }, '', window.location.href);
      }
    }
    tabNavIsGoingBackRef.current = false;
    setBottomNav(newNav);
    setShowBackToTop(false);
  };

  // Pin up to 2 own portfolios - shown first on the own profile page only.
  const togglePinProject = useCallback(async (id) => {
    if (!session) return;
    const proj = projectsRef.current.find((p) => p.id === id);
    if (!proj || proj.ownerId !== session.user.id) return;

    const currentlyPinnedCount = projectsRef.current.filter((p) => p.ownerId === session.user.id && p.pinned).length;
    if (!proj.pinned && currentlyPinnedCount >= 2) {
      showToast('You can only pin up to 2 portfolios');
      return;
    }

    const newPinned = !proj.pinned;
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, pinned: newPinned } : p)));
    if (activeProjectRef.current && activeProjectRef.current.id === id) {
      setActiveProject((prev) => ({ ...prev, pinned: newPinned }));
    }

    const { error } = await supabase.from('portfolios').update({ is_pinned: newPinned }).eq('id', id);
    if (error) {
      // Revert on failure
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, pinned: !newPinned } : p)));
      showToast('Could not update pin status');
    }
  }, [session]);

  const toggleLike = useCallback(async (id) => {
    if (!requireAuth()) return;
    const proj = projectsRef.current.find((p) => p.id === id);
    if (!proj) return;
    const wasLiked = proj.liked;
    const newCount = wasLiked ? Math.max(0, (proj.likesCount || 1) - 1) : (proj.likesCount || 0) + 1;

    // Optimistic UI update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, liked: !wasLiked, likesCount: newCount } : p))
    );
    if (activeProjectRef.current && activeProjectRef.current.id === id) {
      setActiveProject((prev) => ({ ...prev, liked: !wasLiked, likesCount: newCount }));
    }

    if (wasLiked) {
      const { error } = await supabase.from('likes').delete().eq('user_id', session.user.id).eq('portfolio_id', id);
      if (error) {
        console.warn('Failed to unlike (reverting UI):', error);
        showToast(`Unlike failed: ${error.message}`);
        setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, liked: wasLiked, likesCount: proj.likesCount } : p)));
        if (activeProjectRef.current && activeProjectRef.current.id === id) {
          setActiveProject((prev) => ({ ...prev, liked: wasLiked, likesCount: proj.likesCount }));
        }
      }
    } else {
      const { error } = await supabase.from('likes').insert({
        user_id: session.user.id,
        user_name: userProfile.name || '',
        portfolio_id: id
      });
      if (error) {
        console.warn('Failed to like (reverting UI):', error);
        showToast(`Like failed: ${error.message}`);
        setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, liked: wasLiked, likesCount: proj.likesCount } : p)));
        if (activeProjectRef.current && activeProjectRef.current.id === id) {
          setActiveProject((prev) => ({ ...prev, liked: wasLiked, likesCount: proj.likesCount }));
        }
        return;
      }
      if (proj.ownerId && proj.ownerId !== session.user.id) {
        await supabase.from('notifications').insert({
          recipient_id: proj.ownerId,
          actor_id: session.user.id,
          type: 'like',
          portfolio_id: id
        });
        sendPushNotification(proj.ownerId, 'New Like', `${userProfile.name || 'Someone'} liked "${proj.title}"`);
      }
    }
  }, [session, userProfile.name]);

  const toggleFollowDesigner = useCallback(async (designerId) => {
    if (!requireAuth()) return;
    const wasFollowing = followedDesignersRef.current.includes(designerId);

    if (wasFollowing) {
      setFollowedDesigners(followedDesignersRef.current.filter((id) => id !== designerId));
      if (selectedFollowedDesignerRef.current === designerId) {
        setSelectedFollowedDesigner(null);
      }
      if (session) {
        const { error } = await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', designerId);
        if (error) {
          console.warn('Failed to unfollow (reverting UI):', error);
          showToast(`Unfollow failed: ${error.message}`);
          setFollowedDesigners((prev) => (prev.includes(designerId) ? prev : [...prev, designerId]));
        } else {
          setMyFollowStats((prev) => ({ ...prev, followingCount: Math.max(0, prev.followingCount - 1) }));
          setLiveDesigners((prev) =>
            prev.map((d) => (d.id === designerId ? { ...d, followersCount: Math.max(0, (d.followersCount || 0) - 1) } : d))
          );
          if (selectedDesignerRef.current && selectedDesignerRef.current.id === designerId) {
            setSelectedDesigner((prev) => ({ ...prev, followersCount: Math.max(0, (prev.followersCount || 0) - 1) }));
          }
        }
      }
    } else {
      setFollowedDesigners([...followedDesignersRef.current, designerId]);
      if (session && designerId !== session.user.id) {
        const { error } = await supabase.from('follows').insert({ follower_id: session.user.id, following_id: designerId });
        if (error) {
          console.warn('Failed to follow (reverting UI):', error);
          showToast(`Follow failed: ${error.message}`);
          setFollowedDesigners((prev) => prev.filter((id) => id !== designerId));
        } else {
          await supabase.from('notifications').insert({
            recipient_id: designerId,
            actor_id: session.user.id,
            type: 'follow'
          });
          sendPushNotification(designerId, 'New Follower', `${userProfile.name || 'Someone'} started following you`);
          setMyFollowStats((prev) => ({ ...prev, followingCount: prev.followingCount + 1 }));
          setLiveDesigners((prev) =>
            prev.map((d) => (d.id === designerId ? { ...d, followersCount: (d.followersCount || 0) + 1 } : d))
          );
          if (selectedDesignerRef.current && selectedDesignerRef.current.id === designerId) {
            setSelectedDesigner((prev) => ({ ...prev, followersCount: (prev.followersCount || 0) + 1 }));
          }
        }
      }
    }
  }, [session, userProfile.name]);

  const [shareModalVisible, setShareModalVisible] = useState(false);
  // Ref to the actual on-screen styled QR's <Svg> - used by
  // handleDownloadStyledQr on native to export exactly what's rendered,
  // via react-native-svg's own toDataURL rather than re-deriving the image
  // separately, so preview and downloaded file can't drift apart.
  const styledQrExportRef = useRef(null);
  const [shareModalUrl, setShareModalUrl] = useState('');
  const [shareType, setShareType] = useState('profile'); // 'profile' | 'portfolio'
  const [shareIsOwnProfile, setShareIsOwnProfile] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [qrPreviewMode, setQrPreviewMode] = useState('decent'); // 'decent' | 'plain' - which QR is shown/downloaded in the Share Profile modal

  const handleShareDesigner = (designer) => {
    // Was copying the designer's own linked-elsewhere URL (their Figma/
    // portfolio link) instead of a link back to their DECENT profile -
    // fixed to build a proper profile URL. DECENT_APP_DOMAIN is a
    // placeholder until the real domain is live - update that one constant
    // and every share link (this one, and handleSharePortfolio below)
    // picks it up automatically.
    const shareUrl = `${DECENT_APP_DOMAIN}/@${designer.handle || designer.id}`;
    setShareModalUrl(shareUrl);
    setShareType('profile');
    // QR code is only shown when sharing your own profile - showing one
    // for someone else's profile makes it look like the QR is "theirs" to
    // scan-and-follow, which isn't the intent (there's no comparable use
    // case for someone else's profile QR the way there is for your own).
    setShareIsOwnProfile(!!(session && designer.id === session.user.id));
    setShareCopied(false);
    setShareModalVisible(true);
  };

  // Uses the exact same /p/:id format the URL-sync effect displays in the
  // address bar while viewing a portfolio, and that the initial-load
  // routing effect knows how to open - so a shared link and the URL you'd
  // see by just copying the address bar while on that page are always
  // identical, and both actually work when opened fresh.
  const handleSharePortfolio = (portfolio) => {
    const shareUrl = `${DECENT_APP_DOMAIN}/p/${portfolio.id}`;
    setShareModalUrl(shareUrl);
    setShareType('portfolio');
    setShareIsOwnProfile(false);
    setShareCopied(false);
    setShareModalVisible(true);
  };

  const handleCopyShareLink = async () => {
    await Clipboard.setStringAsync(shareModalUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

  const handleDownloadPlainQr = async () => {
    // True plain black-on-white, no color/logo styling at all - a
    // separate, deliberately unstyled URL rather than the accent-purple
    // one used elsewhere, for anyone who wants a plain version (printing,
    // accessibility, just personal preference).
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(shareModalUrl)}`;
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(qrUrl);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `decent-profile-qr-plain-${userProfile.handle || 'code'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch (e) {
        console.warn('QR download failed:', e);
        showToast('Could not download QR code - try again.');
      }
    } else {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          showToast('Photo library permission needed to save the QR code.');
          return;
        }
        const localUri = `${FileSystem.cacheDirectory}decent-profile-qr-plain-${Date.now()}.png`;
        const { uri: downloadedUri } = await FileSystem.downloadAsync(qrUrl, localUri);
        await MediaLibrary.saveToLibraryAsync(downloadedUri);
        showToast('QR code saved to your photos.');
      } catch (e) {
        console.warn('QR save failed:', e);
        showToast('Could not save QR code - try again.');
      }
    }
  };

  // Draws the exact same matrix + finder-zone logic used by CircularQRCode
  // (shared via buildQrMatrix/isQrFinderZone, not re-derived) directly onto
  // a real browser <canvas> - this is a completely different, far more
  // reliable API than react-native-svg's own toDataURL bridge (which has
  // open, unresolved bugs - see the native branch below), so web
  // deliberately doesn't reuse that path at all.
  const renderStyledQrToCanvas = (value, size) => {
    const matrix = buildQrMatrix(value);
    if (!matrix) return null;
    const { grid, count } = matrix;
    const cellSize = size / count;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Small local helper matching the moveTo/arcTo rounded-rect technique
    // already used below for the logo badge - reused here for the finder
    // eyes so both share one drawing approach instead of two different
    // rounding techniques living side by side in the same function.
    const fillRoundedRect = (x, y, w, h, r, fillColor) => {
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    };

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#8B5CF6';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!grid[row][col]) continue;
        if (isQrFinderZone(row, col, count)) continue; // drawn separately below as 3 clean rounded eye shapes
        const cx = col * cellSize + cellSize / 2;
        const cy = row * cellSize + cellSize / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Same 7:5:3 nested-rounded-square proportions as QrFinderEye (the SVG
    // version used for on-screen preview and native export) - kept in sync
    // manually since Canvas2D and react-native-svg are two different
    // drawing APIs that can't literally share the same component.
    [[0, 0], [count - 7, 0], [0, count - 7]].forEach(([gridX, gridY]) => {
      const x0 = gridX * cellSize;
      const y0 = gridY * cellSize;
      const outerSize = cellSize * 7;
      fillRoundedRect(x0, y0, outerSize, outerSize, outerSize * 0.22, '#8B5CF6');
      const gapInset = cellSize;
      const gapSize = outerSize - gapInset * 2;
      fillRoundedRect(x0 + gapInset, y0 + gapInset, gapSize, gapSize, gapSize * 0.22, '#FFFFFF');
      const centerInset = cellSize * 2;
      const centerSize = outerSize - centerInset * 2;
      fillRoundedRect(x0 + centerInset, y0 + centerInset, centerSize, centerSize, centerSize * 0.28, '#8B5CF6');
    });

    // Logo badge - same proportions (0.21 badge, 0.64 icon-within-badge,
    // 0.27 corner radius) as CircularQRCode's own showLogo rendering, kept
    // in sync manually since these are two different drawing APIs (SVG
    // primitives vs Canvas2D) that can't literally share JSX.
    const logoBadgeSize = size * 0.21;
    const logoIconSize = logoBadgeSize * 0.64;
    const center = size / 2;
    const badgeRadius = logoBadgeSize * 0.27;
    const bx = center - logoBadgeSize / 2;
    const by = center - logoBadgeSize / 2;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(bx + badgeRadius, by);
    ctx.arcTo(bx + logoBadgeSize, by, bx + logoBadgeSize, by + logoBadgeSize, badgeRadius);
    ctx.arcTo(bx + logoBadgeSize, by + logoBadgeSize, bx, by + logoBadgeSize, badgeRadius);
    ctx.arcTo(bx, by + logoBadgeSize, bx, by, badgeRadius);
    ctx.arcTo(bx, by, bx + logoBadgeSize, by, badgeRadius);
    ctx.closePath();
    ctx.fill();

    // Path2D accepts the exact same SVG path string used by DecentLogoSVG
    // directly - genuine pixel-shape match, not a redrawn approximation.
    ctx.save();
    ctx.translate(center - logoIconSize / 2, center - logoIconSize / 2);
    ctx.scale(logoIconSize / 97, logoIconSize / 97);
    ctx.fillStyle = '#8B5CF6';
    ctx.fill(new Path2D(DECENT_LOGO_PATH_D));
    ctx.restore();

    return canvas;
  };

  const handleDownloadStyledQr = async () => {
    if (Platform.OS === 'web') {
      try {
        const canvas = renderStyledQrToCanvas(shareModalUrl, 800);
        if (!canvas) throw new Error('QR render failed');
        canvas.toBlob((blob) => {
          if (!blob) {
            showToast('Could not download QR code - try again.');
            return;
          }
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = `decent-profile-qr-${userProfile.handle || 'code'}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
        }, 'image/png');
      } catch (e) {
        console.warn('Styled QR download failed:', e);
        showToast('Could not download QR code - try again.');
      }
    } else {
      // react-native-svg's toDataURL has a couple of known, documented
      // quirks on some versions (notably an output-size scaling bug, and a
      // callback-timing issue that's specifically iOS-only - not relevant
      // here since this project only ever builds for Android). Exports
      // exactly what's on screen (styledQrExportRef points at the same
      // <Svg> already rendered in the modal, logo included since it's
      // drawn inside that same SVG tree, not layered separately on top).
      try {
        if (!styledQrExportRef.current) {
          showToast('QR code not ready yet - try again in a moment.');
          return;
        }
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          showToast('Photo library permission needed to save the QR code.');
          return;
        }
        styledQrExportRef.current.toDataURL(async (base64) => {
          try {
            const localUri = `${FileSystem.cacheDirectory}decent-profile-qr-styled-${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 });
            await MediaLibrary.saveToLibraryAsync(localUri);
            showToast('QR code saved to your photos.');
          } catch (innerErr) {
            console.warn('Styled QR save failed:', innerErr);
            showToast('Could not save QR code - try again.');
          }
        });
      } catch (e) {
        console.warn('Styled QR export failed:', e);
        showToast('Could not save QR code - try again.');
      }
    }
  };

  const handleDownloadQrisCode = async () => {
    // Same pattern as handleDownloadPlainQr above, but the source is a
    // bundled local asset (require'd, not a remote API) - Image.
    // resolveAssetSource gives back a usable URL either way (a Metro dev
    // server URL locally, a packaged/CDN URL in production), so the same
    // fetch-then-save logic works unchanged for both.
    const qrisUrl = Image.resolveAssetSource(require('./assets/qris-code.png')).uri;
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(qrisUrl);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'decent-qris-code.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch (e) {
        console.warn('QRIS download failed:', e);
        showToast('Could not download QRIS code - try again.');
      }
    } else {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          showToast('Photo library permission needed to save the QRIS code.');
          return;
        }
        const localUri = `${FileSystem.cacheDirectory}decent-qris-${Date.now()}.png`;
        const { uri: downloadedUri } = await FileSystem.downloadAsync(qrisUrl, localUri);
        await MediaLibrary.saveToLibraryAsync(downloadedUri);
        showToast('QRIS code saved to your photos.');
      } catch (e) {
        console.warn('QRIS save failed:', e);
        showToast('Could not save QRIS code - try again.');
      }
    }
  };

  const handleOpenAccountSettingsModal = () => {
    setEditName(userProfile.name);
    setEditHandle(userProfile.handle || '');
    setHandleStatus(null);
    setEditRole(userProfile.role);
    setEditLocation(userProfile.location || 'South Jakarta, Jakarta, Indonesia');
    setEditBio(userProfile.bio);
    setEditEmail(userProfile.email);
    setEditAvatar(userProfile.avatar);
    setEditLinks(userProfile.links || []);
    setAccountSettingsModalVisible(true);
    // Content items get their own centered view on web - the small
    // top-right menu popup underneath should close, not stay open behind it.
    setSettingsModalVisible(false);
    setOptionsView('root');
    if (Platform.OS !== 'web') setReturnToOptionsOnClose(true);
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
    showToast('Changes reverted');
  };

  const hasUnsavedAccountChanges = () => {
    return (
      editName !== userProfile.name ||
      editHandle !== (userProfile.handle || '') ||
      editRole !== userProfile.role ||
      editLocation !== userProfile.location ||
      editBio !== userProfile.bio ||
      editEmail !== userProfile.email ||
      editAvatar !== userProfile.avatar ||
      JSON.stringify(editLinks) !== JSON.stringify(userProfile.links || [])
    );
  };

  // True if this account has an email/password identity linked - false for
  // an account that only ever signed in via Google (or another OAuth
  // provider) and has never set a password. Supabase's own updateUser()
  // call works identically either way (it doesn't require the old password
  // client-side), so no functional change is needed there - only the label
  // shown to the user needs to reflect which case they're in.
  const hasPasswordAuth = !!(session && session.user && session.user.identities && session.user.identities.some((i) => i.provider === 'email'));

  const showStickySaveButton = accountSettingsModalVisible && hasUnsavedAccountChanges();
  const [stickySaveRendered, setStickySaveRendered] = useState(false);

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

  const handleCloseChangePasswordPage = () => {
    if (newPassword.trim() !== '' || confirmNewPassword.trim() !== '') {
      setPasswordPageDiscardWarningVisible(true);
    } else {
      setChangePasswordPageVisible(false);
      if (Platform.OS !== 'web') setAccountSettingsModalVisible(true);
    }
  };

  const handleCloseDonateModal = () => {
    setDonateModalVisible(false);
    if (Platform.OS !== 'web' && returnToOptionsOnClose) {
      setSettingsModalVisible(true);
      setReturnToOptionsOnClose(false);
    } else {
      setSettingsModalVisible(false);
    }
  };

  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);
  const [logoutConfirmModalVisible, setLogoutConfirmModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const handleDeleteAccount = () => {
    setDeleteConfirmText('');
    setDeleteAccountModalVisible(true);
  };

  const handleExportMyData = async () => {
    if (!session) return;
    showToast('Preparing your data...');
    const uid = session.user.id;

    const [profileRes, portfoliosRes, likesRes, followsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('portfolios').select('*').eq('user_id', uid),
      supabase.from('likes').select('portfolio_id').eq('user_id', uid),
      supabase.from('follows').select('following_id').eq('follower_id', uid)
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      profile: profileRes.data || null,
      portfolios: portfoliosRes.data || [],
      liked_portfolio_ids: (likesRes.data || []).map((r) => r.portfolio_id),
      following_ids: (followsRes.data || []).map((r) => r.following_id)
    };

    try {
      await Share.share({
        title: 'My DECENT Data',
        message: JSON.stringify(exportData, null, 2)
      });
    } catch (e) {
      console.warn('Data export share failed:', e);
    }
  };

  const executeAccountDeletion = async () => {
    if (!session) return;
    const uid = session.user.id;
    setDeleteAccountModalVisible(false);
    try {
      const { data: myPortfolios } = await supabase.from('portfolios').select('id').eq('user_id', uid);
      const myIds = (myPortfolios || []).map((p) => p.id);
      if (myIds.length > 0) {
        await supabase.from('portfolio_images').delete().in('portfolio_id', myIds);
        await supabase.from('portfolios').delete().eq('user_id', uid);
      }
      await supabase.from('likes').delete().eq('user_id', uid);
      await supabase.from('follows').delete().eq('follower_id', uid);
      await supabase.from('follows').delete().eq('following_id', uid);
      await supabase.from('notifications').delete().eq('recipient_id', uid);
      await supabase.from('notifications').delete().eq('actor_id', uid);
      await supabase.from('profiles').delete().eq('id', uid);

      await AsyncStorage.multiRemove([
        `${FOLLOWED_KEY}_${uid}`,
        `${HIDE_LIKED_KEY}_${uid}`,
        `${USER_PROFILE_KEY}_${uid}`,
        `${ONBOARDING_KEY}_${uid}`
      ]);

      const { error: fnError } = await supabase.functions.invoke('delete-account');

      await supabase.auth.signOut();

      // Restart/reload fires when the user dismisses this alert, not
      // immediately after signOut - doing it immediately would cut the
      // message off before they ever saw it.
      const restartApp = async () => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.reload();
        } else {
          try {
            await Updates.reloadAsync();
          } catch (e) {
            console.warn('Updates.reloadAsync unavailable (expected in dev):', e.message);
          }
        }
      };

      if (fnError) {
        showAppAlert(
          'Data Deleted',
          'Your data has been removed, but your login could not be fully deleted automatically. Contact support if you want it fully gone.',
          [{ text: 'OK', onPress: restartApp }]
        );
      } else {
        showAppAlert('Account Deleted', 'Your account and all data have been permanently removed.', [{ text: 'OK', onPress: restartApp }]);
      }
    } catch (e) {
      console.warn('Delete account error:', e);
      showAppAlert('Error', 'Something went wrong deleting your data. Please try again.');
    }
  };

  const uploadImageChecked = async (uri, path) => {
    const result = await uploadImageToSupabase(uri, path);
    if (result && (result.startsWith('file://') || result.startsWith('content://'))) {
      showToast('Image upload failed — using local copy for now');
    }
    return result;
  };

  // Walks a content_blocks array and uploads any local (freshly picked)
  // image URIs to Supabase Storage, including images nested inside row
  // columns. Already-uploaded (remote) URIs are left untouched.
  const uploadContentBlockImages = async (blocks) => {
    return Promise.all(
      (blocks || []).map(async (block) => {
        if (block.type === 'image' && isLocalMediaUri(block.uri)) {
          const uploaded = await uploadImageChecked(block.uri, 'showcase');
          return { ...block, uri: uploaded };
        }
        if (block.type === 'row') {
          const columns = await Promise.all(
            (block.columns || []).map(async (col) => {
              if (col && col.type === 'image' && isLocalMediaUri(col.uri)) {
                const uploaded = await uploadImageChecked(col.uri, 'showcase');
                return { ...col, uri: uploaded };
              }
              return col;
            })
          );
          return { ...block, columns };
        }
        return block;
      })
    );
  };

  const fetchBlockedUsers = async () => {
    if (!session) return;
    const { data } = await supabase
      .from('blocks')
      .select('blocked_id, profiles!blocks_blocked_id_fkey(name, avatar_url)')
      .eq('blocker_id', session.user.id);
    setBlockedUsersList(
      (data || []).map((r) => ({
        id: r.blocked_id,
        name: r.profiles ? r.profiles.name : 'Unknown User',
        avatar: r.profiles && r.profiles.avatar_url ? r.profiles.avatar_url : 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png'
      }))
    );
  };

  const handleUnblockUser = async (targetId) => {
    if (!session) return;
    const { error } = await supabase.from('blocks').delete().eq('blocker_id', session.user.id).eq('blocked_id', targetId);
    if (!error) {
      setBlockedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      setBlockedUsersList((prev) => prev.filter((u) => u.id !== targetId));
      showToast('User unblocked');
    } else {
      showToast('Failed to unblock user');
    }
  };

  const handleChangePassword = async () => {
    if (!isPasswordStrong(newPassword)) {
      showAppAlert('Password Too Weak', 'Your new password needs to meet all the requirements shown below the field.');
      return false;
    }
    if (newPassword !== confirmNewPassword) {
      showAppAlert("Passwords Don't Match", 'Please re-type the same password in both fields.');
      return false;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      showAppAlert('Error', error.message);
      return false;
    } else {
      setNewPassword('');
      setConfirmNewPassword('');
      showToast(hasPasswordAuth ? 'Password updated' : 'Password created');
      return true;
    }
  };

  const handleBlockUser = (targetId, targetName) => {
    if (!session || !targetId) return;
    showAppAlert(
      `Block ${targetName}?`,
      "You won't see their portfolios or profile anymore.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('blocks').insert({ blocker_id: session.user.id, blocked_id: targetId });
            if (!error) {
              setBlockedIds((prev) => new Set([...prev, targetId]));
              showToast(`${targetName} has been blocked`);
              setModalVisible(false);
              setDesignerModalVisible(false);
            } else {
              showToast('Failed to block user');
            }
          }
        }
      ]
    );
  };

  // Mute: hides their posts from the main feed only. Unlike block, they're
  // not notified, still follow/interact normally, and their profile still
  // shows up in search - it just stops surfacing in the feed for you.
  const handleMuteDesigner = async (targetId, targetName) => {
    if (!session || !targetId) return;
    const { error } = await supabase.from('muted_designers').insert({ muter_id: session.user.id, muted_id: targetId });
    if (!error) {
      setMutedIds((prev) => new Set([...prev, targetId]));
      showToast(`${targetName}'s posts are muted`);
    } else {
      showToast('Failed to mute designer');
    }
  };

  const handleUnmuteDesigner = async (targetId, targetName) => {
    if (!session || !targetId) return;
    const { error } = await supabase.from('muted_designers').delete().eq('muter_id', session.user.id).eq('muted_id', targetId);
    if (!error) {
      setMutedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      if (targetName) showToast(`${targetName} unmuted`);
    } else {
      showToast('Failed to unmute designer');
    }
  };

  const submitReport = async (targetType, targetId, reason, detail) => {
    if (!session) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: session.user.id,
      target_type: targetType,
      target_id: targetId,
      target_detail: detail || null,
      reason
    });
    showToast(error ? 'Failed to submit report' : 'Report submitted — thank you');
  };

  const handleSubmitPortfolioReport = async () => {
    if (!portfolioReportSelectedReason || !activeProject) return;
    if (portfolioReportSelectedReason === 'other' && !portfolioReportOtherText.trim()) {
      showToast('Please describe the issue before submitting.');
      return;
    }
    await submitReport(
      'portfolio',
      activeProject.id,
      portfolioReportSelectedReason,
      portfolioReportSelectedReason === 'other' ? portfolioReportOtherText.trim() : 'this portfolio'
    );
    setPortfolioReportModalVisible(false);
    setPortfolioReportSelectedReason(null);
    setPortfolioReportOtherText('');
  };

  const handleReportContent = (targetType, targetId, targetLabel, detail) => {
    showAppAlert(
      `Report ${targetLabel}?`,
      'Choose a reason:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Spam', onPress: () => submitReport(targetType, targetId, 'spam', detail) },
        { text: 'Inappropriate', onPress: () => submitReport(targetType, targetId, 'inappropriate', detail) },
        { text: 'Other', onPress: () => submitReport(targetType, targetId, 'other', detail) }
      ]
    );
  };

  const pushProfileToSupabase = async (profile, handleChanged = false, markOnboardingComplete = false) => {
    if (!session) return;
    try {
      const payload = {
        id: session.user.id,
        name: profile.name,
        role: profile.role,
        location: profile.location,
        bio: profile.bio,
        email: profile.email,
        avatar_url: profile.avatar,
        links: profile.links,
        updated_at: new Date().toISOString()
      };
      if (profile.handle) payload.handle = profile.handle;
      if (handleChanged) payload.handle_changed_at = new Date().toISOString();
      if (markOnboardingComplete) payload.onboarding_completed = true;

      const { error } = await supabase.from('profiles').upsert(payload);
      if (error) {
        console.warn('Failed to sync profile to Supabase:', error);
        if (error.message && error.message.toLowerCase().includes('handle')) {
          showToast('That handle was just taken — please pick another');
        } else {
          showAppAlert('Profile Save Failed', error.message || 'Unknown error saving your profile to the database.');
        }
      }
    } catch (e) {
      console.warn('Failed to sync profile to Supabase:', e);
      showAppAlert('Profile Save Failed', e.message || 'Unknown error saving your profile to the database.');
    }
  };

  const handleSaveAccountSettings = async () => {
    // If avatar is a local file (freshly picked), upload it to Supabase Storage first
    let avatarUrl = editAvatar;
    if (avatarUrl && (avatarUrl.startsWith('file://') || avatarUrl.startsWith('content://'))) {
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
      links: validLinks
    };
    setUserProfile(updated);
    setEditAvatar(updated.avatar);
    if (handleChanged) setHandleChangedAt(new Date().toISOString());
    await pushProfileToSupabase(updated, handleChanged);
    setAccountSettingsModalVisible(false);
    setAccountSaveSuccessModalVisible(true);
  };

  const handleCloseIntroCarousel = async () => {
    setShowIntroCarousel(false);
    if (session) {
      await AsyncStorage.setItem(`${INTRO_SEEN_KEY}_${session.user.id}`, 'true');
    }
  };

  const handleFinishOnboarding = async (skip = false) => {
    let updated = userProfile;
    if (!skip) {
      if (!editName.trim()) {
        showAppAlert('Name Required', 'Please enter your name to continue.');
        return;
      }
      const handle = editHandle.trim();
      if (!isValidHandleFormat(handle)) {
        showAppAlert('Invalid Handle', 'Your handle must be 3-20 characters: letters, numbers, dots, underscores, and dashes only.');
        return;
      }
      if (handleStatus === 'taken') {
        showAppAlert('Handle Taken', 'That handle is already in use. Please choose another.');
        return;
      }
      if (handleStatus === 'checking') {
        showAppAlert('Please Wait', "Still checking if that handle is available.");
        return;
      }
      let avatarUrl = editAvatar;
      if (avatarUrl && (avatarUrl.startsWith('file://') || avatarUrl.startsWith('content://'))) {
        avatarUrl = await uploadImageChecked(avatarUrl, 'avatars');
      }
      const validLinks = editLinks.filter((l) => l.trim() !== '');
      updated = {
        ...userProfile,
        name: editName.trim(),
        role: editRole.trim(),
        location: editLocation.trim(),
        bio: editBio.trim(),
        email: editEmail.trim() || (session ? session.user.email : ''),
        avatar: avatarUrl || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
        handle,
        links: validLinks
      };
      setUserProfile(updated);
      setEditAvatar(updated.avatar);
      setHandleChangedAt(new Date().toISOString());
    }
    await pushProfileToSupabase(updated, true, true);
    if (session) {
      trackEvent('onboarding_completed');
      // Cloud flag (onboarding_completed on profiles) is the source of truth so a
      // reinstall / new device doesn't re-trigger onboarding. AsyncStorage is kept
      // only as an offline fallback cache, mirrored here.
      await AsyncStorage.setItem(`${ONBOARDING_KEY}_${session.user.id}`, 'true');
      const introSeen = await AsyncStorage.getItem(`${INTRO_SEEN_KEY}_${session.user.id}`);
      if (introSeen !== 'true' && Platform.OS !== 'web') {
        setIntroPageIndex(0);
        setShowIntroCarousel(true);
      }
    }
    setNeedsOnboarding(false);
  };

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

  const handleCloseDonateSuccess = () => {
    setDonateSuccessModalVisible(false);
    if (Platform.OS !== 'web' && returnToOptionsOnClose) {
      setSettingsModalVisible(true);
      setReturnToOptionsOnClose(false);
    }
  };

  const handleCloseAccountSaveSuccess = () => {
    setAccountSaveSuccessModalVisible(false);
    if (Platform.OS !== 'web' && returnToOptionsOnClose) {
      setSettingsModalVisible(true);
      setReturnToOptionsOnClose(false);
    }
  };

  const pickAvatarImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAppAlert('Permission Denied', 'Media library access is required to pick a profile photo.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setEditAvatar(result.assets[0].uri);
    }
  };

  const handleAddAccountLink = () => {
    if (editLinks.length >= 5) {
      showAppAlert('Maximum Links Reached', 'You can add up to 5 profile links max.');
      return;
    }
    setEditLinks([...editLinks, '']);
  };

  const handleRemoveAccountLink = (index) => {
    const updated = editLinks.filter((_, i) => i !== index);
    setEditLinks(updated);
  };

  // Builds a "staircase" interpolation config directly off linkDragY, so the
  // drop-line snaps between row boundaries purely via the Animated graph -
  // no React state during the drag, which is what kept the earlier live
  // sibling-shift feature from being smooth.
  const buildDropLineInterpolation = (startIndex, rowCount, rowHeight) => {
    const inputRange = [-999999];
    const outputRange = [0];
    for (let k = 1; k < rowCount; k++) {
      const bp = rowHeight * (k - startIndex - 0.5);
      inputRange.push(bp - 0.01, bp + 0.01);
      outputRange.push((k - 1) * rowHeight, k * rowHeight);
    }
    inputRange.push(999999);
    outputRange.push((rowCount - 1) * rowHeight);
    return { inputRange, outputRange };
  };
  const linkDropLineInterpRef = useRef(null);

  const createLinkDragResponder = (idx) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        linkDragStartIndexRef.current = idx;
        linkDropLineInterpRef.current = buildDropLineInterpolation(idx, editLinks.length, linkRowHeightRef.current || 56);
        setDraggingLinkIndex(idx);
        linkDragY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Pure imperative update - no React state/re-render here, which is
        // what was causing the twitchy/dropped-frame drag before (every
        // move event was triggering a full re-render that recreated every
        // row's PanResponder mid-gesture).
        linkDragY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        const rowHeight = linkRowHeightRef.current || 56;
        const startIndex = linkDragStartIndexRef.current;
        const delta = Math.round(gestureState.dy / rowHeight);
        const targetIndex = Math.max(0, Math.min(editLinks.length - 1, startIndex + delta));
        if (targetIndex !== startIndex) {
          setEditLinks((prev) => {
            const updated = [...prev];
            const [moved] = updated.splice(startIndex, 1);
            updated.splice(targetIndex, 0, moved);
            return updated;
          });
        }
        Animated.spring(linkDragY, { toValue: 0, useNativeDriver: true }).start();
        setDraggingLinkIndex(null);
      },
      onPanResponderTerminate: () => {
        Animated.spring(linkDragY, { toValue: 0, useNativeDriver: true }).start();
        setDraggingLinkIndex(null);
      }
    });

  const handleLinkTextChange = (text, index) => {
    const updated = [...editLinks];
    updated[index] = text;
    setEditLinks(updated);
  };

  const fetchUserListTab = async (designer, tab) => {
    setUserListLoading(true);
    setUserListItems([]);
    if (!designer.id) {
      setUserListLoading(false);
      return;
    }
    const query = tab === 'followers'
      ? supabase.from('follows').select('follower_id, profiles!follows_follower_id_fkey(id, name, role, avatar_url, handle)').eq('following_id', designer.id)
      : supabase.from('follows').select('following_id, profiles!follows_following_id_fkey(id, name, role, avatar_url, handle)').eq('follower_id', designer.id);
    const { data, error } = await query;
    setUserListLoading(false);
    if (error) {
      console.warn(`Failed to fetch ${tab}:`, error);
      return;
    }
    const mapped = (data || [])
      .filter((r) => r.profiles)
      .map((r) => ({
        id: r.profiles.id,
        name: r.profiles.name,
        role: r.profiles.role || '',
        avatar: r.profiles.avatar_url || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
        handle: r.profiles.handle || '',
        followsMe: false
      }));
    setUserListItems(mapped);
  };

  const handleSwitchUserListTab = (tab) => {
    setUserListTab(tab);
    fetchUserListTab(userListTargetDesigner, tab);
  };

  const openFollowersModal = async (designer) => {
    setUserListTargetDesigner(designer);
    setUserListTab('followers');
    setUserListModalVisible(true);
    fetchUserListTab(designer, 'followers');
  };

  const openFollowingModal = async (designer) => {
    setUserListTargetDesigner(designer);
    setUserListTab('following');
    setUserListModalVisible(true);
    fetchUserListTab(designer, 'following');
  };

  // Passed as `onPress` into every ProjectCard in every grid across the
  // whole app (For You, Search, Profile, Liked, Designer profile) via
  // ProjectGrid/TwoRowHorizontalGrid, both React.memo'd - as a plain
  // function (not useCallback), this was a new reference every single
  // App() render, which defeated ProjectCard's memoization for literally
  // every portfolio card everywhere, on every unrelated state change
  // anywhere in the app. useCallback with an empty dependency array (reads
  // designerModalVisible/selectedDesigner via their existing refs instead
  // of closing over the state directly) makes this permanently stable.
  const openProjectModal = useCallback((proj) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({ decentNavStep: true }, '', window.location.href);
    }
    const newVisits = (proj.visitsCount || 0) + 1;
    const updatedProj = { ...proj, visitsCount: newVisits };

    // If a Designer Profile is currently open, remember it so this
    // portfolio's back button can return to it - Designer Profile already
    // stays mounted underneath (never explicitly closed here), so this is
    // just tracking which one to reveal again on back, not closing/
    // reopening anything.
    if (designerModalVisibleRef.current && selectedDesignerRef.current) {
      setCameFromDesignerId(selectedDesignerRef.current.id);
    } else {
      setCameFromDesignerId(null);
    }
    setTopStackedPage('portfolio');

    // Reset gallery scroll-arrow tracking for the new portfolio. Seeded
    // optimistically from image count rather than left at false and waiting
    // entirely on onLayout/onContentSizeChange to fire - those can lag
    // behind the very first paint, showing no arrow at all momentarily even
    // when there's clearly more than fits. The real measurement still
    // corrects this shortly after via the normal callbacks either way.
    galleryScrollXRef.current = 0;
    setGalleryCanScrollLeft(false);
    setGalleryCanScrollRight((proj.images || []).length > 2);

    setProjects((prev) =>
      prev.map((p) => (p.id === proj.id ? updatedProj : p))
    );
    setActiveProject(updatedProj);
    setShowModalBackToTop(false);
    trackEvent('portfolio_viewed', { portfolio_id: proj.id });

    supabase.rpc('increment_portfolio_views', { pid: proj.id }).then(({ error }) => {
      if (error) console.warn('View count increment failed:', error);
    });
    // Logs a timestamped row alongside the existing all-time counter above -
    // that counter alone can't answer "how many views this week", only a
    // running total. Fire-and-forget, same as the increment call - a
    // failed insert here shouldn't block or slow down opening the
    // portfolio.
    supabase.from('portfolio_views').insert({ portfolio_id: proj.id }).then(({ error }) => {
      if (error) console.warn('View event log failed:', error);
    });

    if (proj.caseStudy || proj.brief || proj.images) {
      setActiveTab('case');
    } else if (proj.figmaProto) {
      setActiveTab('mobile');
    } else if (proj.desktopProto) {
      setActiveTab('desktop');
    } else {
      setActiveTab('case');
    }
    setModalVisible(true);
  }, []);

  const [designerLikedProjects, setDesignerLikedProjects] = useState([]);
  const [loadingDesignerLikes, setLoadingDesignerLikes] = useState(false);

  const fetchDesignerLikedProjects = async (designerId) => {
    if (!designerId) {
      setDesignerLikedProjects([]);
      return;
    }
    setLoadingDesignerLikes(true);
    const { data: likedRows } = await supabase.from('likes').select('portfolio_id').eq('user_id', designerId);
    const likedIds = (likedRows || []).map((r) => r.portfolio_id);
    if (likedIds.length === 0) {
      setDesignerLikedProjects([]);
      setLoadingDesignerLikes(false);
      return;
    }
    const { data: portfolioRows } = await supabase.from('portfolios').select('*, portfolio_images(image_url)').in('id', likedIds);
    const mapped = (portfolioRows || []).map((p) => ({
      id: p.id,
      ownerId: p.user_id || null,
          portfolioType: p.portfolio_type || 'ui_ux',
          isAiGenerated: p.is_ai_generated,
      title: p.title,
      designer: p.user_name || 'Unknown Designer',
      designerHandle: p.user_handle || '',
      designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
      category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
      categories: p.categories || ['Mobile App'],
      liked: true,
      figmaFile: p.figma_file || '',
      brief: p.brief || '',
      longDescription: p.long_description || '',
      contentBlocks: getContentBlocksFromRow(p),
      pinned: !!p.is_pinned,
      cover: p.cover_url || '',
      images: getShowcaseImagesFromRow(p),
      videoLinks: [],
      caseStudy: p.brief || ''
    }));
    setDesignerLikedProjects(mapped);
    setLoadingDesignerLikes(false);
  };

  const openDesignerModal = useCallback((designer) => {
    // Always resolve the canonical record from liveDesigners (the one place
    // with accurate follower/following counts) rather than trusting
    // whatever object the caller happened to build - different entry points
    // (search, followers list, portfolio cards, etc) were independently
    // constructing partial designer objects, which is exactly what caused
    // inconsistent counts depending on where you tapped in from. Falls back
    // to whatever was passed in if the designer genuinely isn't in
    // liveDesigners yet (e.g. a brand new account not yet in that list).
    const canonical = liveDesignersRef.current.find((d) => d.id === designer.id) || designer;
    setDesignerProfileTab('myWork');
    // designerProfileTabSlideAnim/designerProfileTabContentAnim are
    // useRef'd Animated.Values that live for the component's whole
    // lifetime, not per-designer - without resetting them here too, the
    // sliding pill stays wherever it was left from the PREVIOUS designer's
    // profile (e.g. sitting on "Liked") even though designerProfileTab
    // state above is already correctly back to 'myWork'. That mismatch is
    // exactly what made the tab look stuck: the first tap did nothing
    // because state already silently matched, and only a second tap onto
    // the other tab actually changed state, which happened to also
    // re-sync the pill.
    designerProfileTabSlideAnim.setValue(0);
    designerProfileTabContentAnim.setValue(1);
    setSelectedDesigner(canonical);
    setDesignerModalVisible(true);
    fetchDesignerLikedProjects(canonical.id);
  }, []);

  const openDesignerProfileById = useCallback((designerId, preloadedData = null) => {
    if (session && designerId === session.user.id) {
      setModalVisible(false);
      setDesignerModalVisible(false);
      setCameFromPortfolioId(null);
      setCameFromDesignerId(null);
      setDesignerBackStack([]);
      setTabVisitStack([]);
      setBottomNav('profile');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.pushState({ decentNavStep: true }, '', window.location.href);
      }
      return;
    }

    // If a portfolio is currently open, remember it so the back button on
    // this designer's page can return to it - previously this always
    // closed the portfolio outright (a swap, not a stack), losing that
    // context entirely.
    if (modalVisible && activeProject) {
      setCameFromPortfolioId(activeProject.id);
    } else {
      setCameFromPortfolioId(null);
    }
    setTopStackedPage('designer');
    // Same tab-state and pill-animation reset as openDesignerModal above -
    // this function is the far more common way profiles actually get
    // opened (portfolio owner tap, followers/following list, deep links),
    // so leaving this reset out of it entirely is why the stuck-tab bug
    // showed up so often: without it, a brand new designer's profile
    // inherits whichever tab (and stale pill position) was left over from
    // whatever profile was viewed before.
    setDesignerProfileTab('myWork');
    designerProfileTabSlideAnim.setValue(0);
    designerProfileTabContentAnim.setValue(1);

    // Designer-to-designer chaining: if you're already viewing someone's
    // profile and tap into a DIFFERENT designer (e.g. from their Followers/
    // Following list), push the one you're currently on so the back button
    // can walk back through the whole trail, not just the single most
    // recent one. Doesn't push when this is itself a "go back" call
    // (handleBackFromDesignerProfile pops first, then calls this directly
    // with the popped ID - pushing again here would just undo the pop).
    const isGoingBack = designerNavIsGoingBackRef.current;
    setDesignerBackStack((prevStack) => {
      if (designerModalVisible && selectedDesigner && selectedDesigner.id && selectedDesigner.id !== designerId && !isGoingBack) {
        return [...prevStack, selectedDesigner.id];
      }
      return prevStack;
    });
    if (!isGoingBack && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({ decentNavStep: true }, '', window.location.href);
    }
    designerNavIsGoingBackRef.current = false;

    const found = liveDesignersRef.current.find((d) => d.id === designerId);
    if (found) {
      openDesignerModal(found);
    } else if (preloadedData) {
      openDesignerModal(preloadedData);
    } else {
      // Portfolio owner not in liveDesigners yet (e.g. very new account) -
      // pass a minimal object; openDesignerModal will try liveDesigners
      // again internally and fall back to this if still not found there.
      openDesignerModal({ id: designerId, name: '', role: '', avatar: '', followersCount: 0, followingCount: 0, links: [] });
    }
  }, [session, openDesignerModal, modalVisible, activeProject, designerModalVisible, selectedDesigner]);

  // Shared route-matching logic for both web (parses window.location) and
  // native (parses incoming Linking URLs, added below) - one definition of
  // what each URL shape means, rather than duplicating this across two
  // platform-specific effects that could drift out of sync with each
  // other.
  const openPortfolioById = useCallback(async (portfolioId) => {
    if (!portfolioId) return;
    const found = projectsRef.current.find((p) => p.id === portfolioId);
    if (found) {
      setDesignerModalVisible(false);
      openProjectModal(found);
      return;
    }
    // Not in the currently-loaded feed (e.g. opened from a notification for
    // a portfolio outside whatever's paginated in right now) - fetch it
    // directly instead. Same field shape as mapPortfolioRow used elsewhere,
    // kept local here rather than extracting a shared helper to avoid
    // touching that already-working call site.
    const [{ data: p, error }, { data: likeRow }] = await Promise.all([
      supabase.from('portfolios').select('*').eq('id', portfolioId).single(),
      session
        ? supabase.from('likes').select('id').eq('user_id', session.user.id).eq('portfolio_id', portfolioId).maybeSingle()
        : Promise.resolve({ data: null })
    ]);
    if (error || !p) {
      showToast('Portfolio not found - it may have been removed.');
      return;
    }
    setDesignerModalVisible(false);
    openProjectModal({
      id: p.id,
      ownerId: p.user_id || null,
          portfolioType: p.portfolio_type || 'ui_ux',
          isAiGenerated: p.is_ai_generated,
      title: p.title,
      designer: p.user_name || 'Unknown Designer',
      designerHandle: p.user_handle || '',
      designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
      category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
      categories: p.categories || ['Mobile App'],
      liked: !!likeRow,
      likesCount: p.likes_count ?? 0,
      visitsCount: p.visits_count || 0,
      figmaProfile: p.figma_profile || '',
      liveLinks: p.live_links || [],
      isNsfw: !!p.is_nsfw,
          componentProto: p.component_proto || '',
      showcaseAspectRatio: p.showcase_aspect_ratio || '16:9',
      figmaProto: p.figma_proto || '',
      desktopProto: p.desktop_proto || '',
      figmaFile: p.figma_file || '',
      brief: p.brief || '',
      longDescription: p.long_description || '',
      contentBlocks: getContentBlocksFromRow(p),
      pinned: !!p.is_pinned,
      cover: p.cover_url || '',
      images: getShowcaseImagesFromRow(p),
      videoLinks: [],
      caseStudy: p.brief || ''
    });
  }, [session, openProjectModal]);

  const handleIncomingRoute = useCallback(async (path) => {
    const tabRoutes = { '/for-you': 'forYou', '/circle': 'followed', '/search': 'search', '/profile': 'profile' };
    if (tabRoutes[path]) {
      setBottomNav(tabRoutes[path]);
      return;
    }

    const portfolioMatch = path.match(/^\/p\/([^/]+)$/);
    if (portfolioMatch) {
      const portfolioId = decodeURIComponent(portfolioMatch[1]);
      await openPortfolioById(portfolioId);
      return;
    }

    const designerMatch = path.match(/^\/@([^/]+)$/);
    if (!designerMatch) return;
    const handleOrId = decodeURIComponent(designerMatch[1]);
    // Skips openDesignerProfileById's own history.pushState (web) - this
    // deep link already IS the current history entry (the page just
    // loaded at this URL) - without this it'd push a redundant second
    // entry. Harmless no-op on native, which doesn't have browser history.
    designerNavIsGoingBackRef.current = true;

    try {
      // Fetching complete fields here (not just id) - this data becomes
      // the fallback openDesignerProfileById uses when liveDesigners
      // hasn't loaded yet (very likely on a fresh deep-link visit,
      // especially as a guest, since that fetch is gated behind a
      // session in some paths). Without this, the profile page was
      // opening with an empty name/avatar/stats - technically "working"
      // but visually broken.
      let { data: profile, error } = await supabase
        .from('profiles')
        .select('id, name, role, location, avatar_url, handle, bio, links')
        .eq('handle', handleOrId)
        .maybeSingle();

      if (!profile && !error) {
        const byId = await supabase
          .from('profiles')
          .select('id, name, role, location, avatar_url, handle, bio, links')
          .eq('id', handleOrId)
          .maybeSingle();
        profile = byId.data;
        error = byId.error;
      }

      if (error) {
        console.warn('Deep-link profile lookup failed:', error.message);
        return;
      }
      if (!profile) {
        console.warn('Deep-link: no profile found for', handleOrId);
        return;
      }

      // Follower/following counts fetched separately since they're
      // derived (counted from the follows table), not stored directly on
      // the profile row.
      const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id)
      ]);

      openDesignerProfileById(profile.id, {
        id: profile.id,
        name: profile.name || '',
        role: profile.role || '',
        location: profile.location || '',
        avatar: profile.avatar_url || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
        handle: profile.handle || '',
        bio: profile.bio || '',
        followersCount: followersCount || 0,
        followingCount: followingCount || 0,
        links: profile.links || []
      });
    } catch (e) {
      console.warn('Deep-link handling failed:', e);
    }
  }, [openPortfolioById, openDesignerProfileById]);

  // Initial-load routing for all page types this app has real URLs for:
  // /for-you, /circle, /search, /profile (tabs), /p/:id (portfolio),
  // /@:handleOrId (designer profile). Runs once on mount, web only - the
  // native equivalent is the Linking-based effect further below. Deliberately
  // does NOT reset the URL afterward (used to unconditionally replaceState
  // back to '/' here) - that raced against the separate URL-sync effect
  // above, which runs once this handler's state changes land and correctly
  // derives the final URL from state instead. Letting both effects write
  // was the source of the "shared link opens then bounces to the homepage"
  // bug - now there's a single writer for steady-state URL display.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Wait for the initial supabase.auth.getSession() restore to finish
    // before handling the deep link. Without this, a shared link opened in
    // a fresh tab races ahead of session restoration - openPortfolioById /
    // openDesignerProfileById read `session` while it's still null, so the
    // page opens looking logged-out even though a valid session exists.
    // authChecked flips true only after that restore resolves, and this
    // effect re-runs on that flip (handleIncomingRoute's identity changes
    // because openPortfolioById depends on [session]) - so the first real
    // invocation below now always has the correct, resolved session.
    if (!authChecked) return;
    if (initialRouteHandledRef.current) return;
    initialRouteHandledRef.current = true;
    handleIncomingRoute(window.location.pathname);
  }, [handleIncomingRoute, authChecked]);

  // Same routing, for native - Android App Links (configured in app.json's
  // android.intentFilters) hand the app a full https:// URL when the link
  // is tapped and the app is installed; Linking.parse normalizes that (and
  // the custom decent:// scheme) into a consistent {path} shape regardless
  // of which form it arrived in. getInitialURL covers a cold start (app
  // wasn't running, launched directly via the link); the 'url' event
  // covers the app already being open/backgrounded when the link is
  // tapped.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    ExpoLinking.getInitialURL().then((url) => {
      if (!url) return;
      const { path } = ExpoLinking.parse(url);
      if (path) handleIncomingRoute(`/${path}`);
    });

    const subscription = ExpoLinking.addEventListener('url', ({ url }) => {
      const { path } = ExpoLinking.parse(url);
      if (path) handleIncomingRoute(`/${path}`);
    });

    return () => subscription.remove();
  }, [handleIncomingRoute]);

  // Skips this effect's very first run on mount - without this, it fires
  // immediately with default state (bottomNav: 'forYou', nothing open) and
  // overwrites the real incoming URL (e.g. a shared /@handle link) to
  // /for-you before the auth-gated deep-link effect below even gets a
  // chance to read window.location.pathname. Every subsequent run (once
  // real state changes happen) behaves normally.
  const urlSyncSkippedInitialRef = useRef(false);

  // Keeps the visible URL bar in sync with whatever's actually on screen,
  // for readability/shareability while browsing - NOT a routing system.
  // Uses replaceState (never pushState) specifically so this never creates
  // history entries or interacts with the existing back-button stack logic
  // (tabVisitStack, designerBackStack, the pushState calls already in
  // handleNavChange/openDesignerProfileById/openProjectModal) - those
  // remain the sole source of truth for what the browser back button does.
  // This effect only ever changes what the address bar displays.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!urlSyncSkippedInitialRef.current) {
      urlSyncSkippedInitialRef.current = true;
      return;
    }
    let path = '/for-you';
    // Portfolio and designer-profile modals can both be mounted at once
    // (e.g. opening a designer's profile from on top of an already-open
    // portfolio, kept mounted underneath for the back stack) - topStackedPage
    // is the existing source of truth for which one is actually visible on
    // screen, so it decides the URL here too. Without this, the portfolio
    // branch always won since it was checked first, permanently masking the
    // profile URL any time a profile was opened from on top of a portfolio.
    const portfolioOnTop = modalVisible && activeProject && (!designerModalVisible || topStackedPage === 'portfolio');
    const designerOnTop = designerModalVisible && selectedDesigner && selectedDesigner.id && (!modalVisible || topStackedPage === 'designer');
    if (portfolioOnTop) {
      path = `/p/${activeProject.id}`;
    } else if (designerOnTop) {
      path = `/@${selectedDesigner.handle || selectedDesigner.id}`;
    } else if (bottomNav === 'followed') {
      path = '/circle';
    } else if (bottomNav === 'search') {
      path = '/search';
    } else if (bottomNav === 'profile') {
      path = '/profile';
    }
    if (window.location.pathname !== path) {
      window.history.replaceState(window.history.state, document.title, path);
    }
  }, [bottomNav, modalVisible, activeProject, designerModalVisible, selectedDesigner, topStackedPage]);

  const handleBackFromDesignerProfile = useCallback(() => {
    if (designerBackStack.length > 0) {
      const prevDesignerId = designerBackStack[designerBackStack.length - 1];
      setDesignerBackStack((prevStack) => prevStack.slice(0, -1));
      designerNavIsGoingBackRef.current = true;
      openDesignerProfileById(prevDesignerId);
      return;
    }
    if (cameFromPortfolioId) {
      // A portfolio is still mounted underneath (stacked, not swapped) -
      // just hide this page and let it come back into view with whatever
      // scroll position it already had, since it was never torn down.
      setDesignerModalVisible(false);
      setCameFromPortfolioId(null);
      setTopStackedPage('portfolio');
    } else {
      setDesignerModalVisible(false);
    }
  }, [cameFromPortfolioId, designerBackStack, openDesignerProfileById]);

  const promptDeletePortfolio = (proj) => {
    setProjectToDelete(proj);
    setDeleteConfirmModalVisible(true);
  };

  const confirmDeletePortfolio = async () => {
    if (projectToDelete) {
      const { error: imgErr } = await supabase.from('portfolio_images').delete().eq('portfolio_id', projectToDelete.id);
      const { data: deletedRows, error: delErr } = await supabase
        .from('portfolios')
        .delete()
        .eq('id', projectToDelete.id)
        .select();

      if (delErr) {
        console.warn('Supabase delete error:', delErr);
        showAppAlert('Delete Failed', delErr.message);
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        // The delete "succeeded" with no error, but nothing was actually removed -
        // this means the database's permission rules silently blocked it rather
        // than deleting the row.
        showAppAlert(
          'Delete Blocked',
          "This didn't delete anything, even though no error was returned. This usually means the database's delete permission rule isn't set up correctly - check that the 'users delete own portfolio' policy exists on the portfolios table."
        );
        return;
      }

      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setDeleteConfirmModalVisible(false);
      setModalVisible(false);
      setProjectToDelete(null);
      showAutoSuccess('Deleted', 'Portfolio package removed successfully.');
    }
  };

  const getDesignerRole = (designerName) => {
    const found = allDesigners.find(
      (d) => d.name.toLowerCase() === designerName.toLowerCase()
    );
    return found ? found.role : userProfile.role;
  };

  const toggleCategorySelection = (cat) => {
    if (fCategories.includes(cat)) {
      setFCategories(fCategories.filter((c) => c !== cat));
    } else {
      if (fCategories.length >= 10) {
        showAppAlert('Category Limit Reached', 'You can select up to 10 categories max per portfolio package.');
        return;
      }
      setFCategories([...fCategories, cat]);
    }
  };

  const handleAddCustomCategory = async () => {
    // Normalize: collapse whitespace, cap length, reject junk so we don't
    // accumulate near-duplicate variants ("UI", "ui", "U I") or garbage.
    const trimmed = categorySearchQuery.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!trimmed || trimmed.length < 2 || !/[a-zA-Z]/.test(trimmed)) {
      showAppAlert('Invalid Tag', 'Tags need at least 2 characters and some letters.');
      return;
    }
    if (fCategories.length >= 10) {
      showAppAlert('Category Limit Reached', 'You can select up to 10 categories max per portfolio package.');
      return;
    }

    // Case-insensitive match against everything already known (premade +
    // previously-added custom tags) so this reuses an existing tag instead
    // of creating a near-duplicate.
    const existingMatch = masterCategoriesList.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    const finalName = existingMatch || trimmed;

    if (!existingMatch) {
      setMasterCategoriesList((prev) => [...prev, finalName].sort());
      // Persist so this tag is available to everyone, not just this
      // session - upsert with an incrementing usage_count means multiple
      // users independently "creating" the same tag just merges into one
      // shared row instead of erroring or duplicating.
      const { error } = await supabase.rpc('upsert_custom_category', { tag_name: finalName });
      if (error) {
        console.warn('Failed to persist custom category:', error);
      }
    }

    if (!fCategories.includes(finalName)) {
      setFCategories([...fCategories, finalName]);
    }
    setCategorySearchQuery('');
  };

  const openEditWizard = (proj) => {
    setEditingProjectId(proj.id);
    setFTitle(proj.title || '');
    setFDesigner(proj.designer || userProfile.name);
    setFCategories(Array.isArray(proj.categories) && proj.categories.length > 0 ? proj.categories : [proj.category || 'Mobile App']);
    setFIsNsfw(!!proj.isNsfw);
    setFIsAiGenerated(proj.isAiGenerated === undefined ? null : proj.isAiGenerated);
    setFBrief(proj.brief || '');
    setFLongDescription(proj.longDescription || '');
    setFContentBlocks(
      proj.contentBlocks && proj.contentBlocks.length > 0
        ? proj.contentBlocks
        : wrapMarkdownAsBlocks(proj.longDescription || '')
    );
    setFFigmaProto(proj.figmaProto || '');
    setFDesktopProto(proj.desktopProto || '');
    setFComponentProto(proj.componentProto || '');
    setFFigmaFile(proj.figmaFile || '');
    setFFigmaProfile(proj.figmaProfile || '');
    setFHasLiveLink(!!(proj.liveLinks && proj.liveLinks.length > 0));
    setFLiveLinks(proj.liveLinks && proj.liveLinks.length > 0 ? proj.liveLinks : [{ label: '', url: '' }]);
    setFCover(proj.cover || '');
    setFShowcaseImages(proj.images && proj.images.length >= 2 ? proj.images : [proj.cover || '', '']);
    setFVideoLinks(proj.videoLinks && proj.videoLinks.length > 0 ? proj.videoLinks : ['']);
    setFormStep(1);
    setModalVisible(false);
    setAddModalVisible(true);
  };

  const handleRemoveShowcaseImage = (index) => {
    if (fShowcaseImages.length <= 2) {
      showAppAlert('Minimum Required', 'At least 2 showcase images are required.');
      return;
    }
    const updated = fShowcaseImages.filter((_, i) => i !== index);
    setFShowcaseImages(updated);
  };

  // Lets the user pick several images in one go instead of one slot at a
  // time. Note: expo-image-picker doesn't support the crop/edit step when
  // multiple images are selected at once, so multi-pick images keep their
  // original aspect ratio.
  const pickMultipleShowcaseImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAppAlert('Permission Denied', 'Media library access is required to upload local photos.');
      return;
    }

    const existingFilled = fShowcaseImages.filter((img) => img.trim() !== '');
    const remainingSlots = 10 - existingFilled.length;
    if (remainingSlots <= 0) {
      showAppAlert('Maximum Limit Reached', 'You can upload up to 10 showcase images.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.8
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newUris = result.assets.map((a) => a.uri);
      const combined = [...existingFilled, ...newUris].slice(0, 10);
      setFShowcaseImages(combined.length >= 2 ? combined : [...combined, '']);
      setErrors({ ...errors, showcaseImages: null });
    }
  };

  const pickCoverImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAppAlert('Permission Denied', 'Media library access is required to upload local photos.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setFCover(result.assets[0].uri);
      setErrors({ ...errors, fCover: null });
    }
  };

  // --- Block editor helpers (text / image / row) ---------------------------
  const pickBlockImageUri = async (aspect = [16, 9]) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAppAlert('Permission Denied', 'Media library access is required to upload local photos.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect,
      quality: 0.8
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0].uri;
    }
    return null;
  };

  const addTextBlock = () => {
    setFContentBlocks((prev) => [...prev, { id: makeBlockId(), type: 'text', markdown: '' }]);
  };

  const addImageBlock = async () => {
    const uri = await pickBlockImageUri([16, 9]);
    if (uri) setFContentBlocks((prev) => [...prev, { id: makeBlockId(), type: 'image', uri }]);
  };

  const addRowBlock = () => {
    setFContentBlocks((prev) => [...prev, { id: makeBlockId(), type: 'row', columns: [null, null] }]);
  };

  const deleteBlock = (blockId) => {
    showAppAlert(
      'Remove this block?',
      'This will permanently remove this block from your case study.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => setFContentBlocks((prev) => prev.filter((b) => b.id !== blockId))
        }
      ]
    );
  };

  const updateTextBlockMarkdown = (blockId, markdown) => {
    setFContentBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, markdown } : b)));
  };

  const setTextBlockAlign = (blockId, align) => {
    setFContentBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, align } : b)));
  };

  const replaceImageBlock = async (blockId) => {
    const uri = await pickBlockImageUri([16, 9]);
    if (!uri) return;
    setFContentBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, uri } : b)));
  };

  const setImageBlockAspect = (blockId, aspectMode) => {
    setFContentBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, aspectMode } : b)));
  };

  // Re-crop: expo-image-picker can't re-edit an already-picked image in
  // place, so this re-opens the picker with the crop aspect matched to the
  // block's current mode, ready to reselect/recrop against it.
  const recropImageBlock = async (blockId, aspectMode) => {
    const aspect = aspectMode === 'wide' ? [16, 9] : [1, 1];
    const uri = await pickBlockImageUri(aspect);
    if (!uri) return;
    setFContentBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, uri } : b)));
  };

  // Applies an H1/H2/B/I/U markdown button to a top-level text block, using
  // that block's own tracked selection (mirrors the old single-textarea logic,
  // just scoped per block).
  const applyMarkdownToBlock = (blockId, btn) => {
    const sel = blockSelections[blockId] || { start: 0, end: 0 };
    setFContentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId || b.type !== 'text') return b;
        const text = b.markdown || '';
        let updated;
        if (btn.mode === 'prefix') {
          const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
          updated = text.slice(0, lineStart) + btn.markup + text.slice(lineStart);
        } else {
          const selected = text.slice(sel.start, sel.end);
          updated = text.slice(0, sel.start) + btn.markup + selected + btn.markup + text.slice(sel.end);
        }
        return { ...b, markdown: updated };
      })
    );
  };

  // --- Row block (fixed 2-up, half + half) column helpers ------------------
  const setRowColumn = (rowId, colIdx, colBlock) => {
    setFContentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== rowId) return b;
        const columns = [...b.columns];
        columns[colIdx] = colBlock;
        return { ...b, columns };
      })
    );
  };

  const addTextToRowColumn = (rowId, colIdx) => {
    setRowColumn(rowId, colIdx, { id: makeBlockId(), type: 'text', markdown: '' });
  };

  const addImageToRowColumn = async (rowId, colIdx) => {
    const uri = await pickBlockImageUri([6, 5]);
    if (uri) setRowColumn(rowId, colIdx, { id: makeBlockId(), type: 'image', uri });
  };

  const replaceRowColumnImage = async (rowId, colIdx) => {
    const uri = await pickBlockImageUri([6, 5]);
    if (!uri) return;
    setFContentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== rowId) return b;
        const columns = [...b.columns];
        columns[colIdx] = { ...columns[colIdx], uri };
        return { ...b, columns };
      })
    );
  };

  const setRowColumnImageAspect = (rowId, colIdx, aspectMode) => {
    setFContentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== rowId) return b;
        const columns = [...b.columns];
        columns[colIdx] = { ...columns[colIdx], aspectMode };
        return { ...b, columns };
      })
    );
  };

  const recropRowColumnImage = async (rowId, colIdx, aspectMode) => {
    const aspect = aspectMode === 'wide' ? [16, 9] : [1, 1];
    const uri = await pickBlockImageUri(aspect);
    if (!uri) return;
    setFContentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== rowId) return b;
        const columns = [...b.columns];
        columns[colIdx] = { ...columns[colIdx], uri };
        return { ...b, columns };
      })
    );
  };

  const toggleAspectMode = (currentMode) => (currentMode === 'wide' ? 'square' : 'wide');

  const updateRowColumnMarkdown = (rowId, colIdx, markdown) => {
    setFContentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== rowId) return b;
        const columns = [...b.columns];
        columns[colIdx] = { ...columns[colIdx], markdown };
        return { ...b, columns };
      })
    );
  };

  const setRowColumnAlign = (rowId, colIdx, align) => {
    setFContentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== rowId) return b;
        const columns = [...b.columns];
        columns[colIdx] = { ...columns[colIdx], align };
        return { ...b, columns };
      })
    );
  };

  const clearRowColumn = (rowId, colIdx) => setRowColumn(rowId, colIdx, null);

  const swapRowColumns = (rowId) => {
    setFContentBlocks((prev) =>
      prev.map((b) => (b.id === rowId ? { ...b, columns: [b.columns[1] || null, b.columns[0] || null] } : b))
    );
  };

  const applyMarkdownToRowColumn = (rowId, colIdx, btn) => {
    const selKey = `${rowId}:${colIdx}`;
    const sel = blockSelections[selKey] || { start: 0, end: 0 };
    setFContentBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== rowId) return b;
        const columns = [...b.columns];
        const col = columns[colIdx];
        if (!col || col.type !== 'text') return b;
        const text = col.markdown || '';
        let updated;
        if (btn.mode === 'prefix') {
          const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
          updated = text.slice(0, lineStart) + btn.markup + text.slice(lineStart);
        } else {
          const selected = text.slice(sel.start, sel.end);
          updated = text.slice(0, sel.start) + btn.markup + selected + btn.markup + text.slice(sel.end);
        }
        columns[colIdx] = { ...col, markdown: updated };
        return { ...b, columns };
      })
    );
  };

  // --- Main-block reorder (up/down arrows + typed order number) ------------
  // Row-block internal columns are never reorderable this way, only the
  // top-level blocks array.
  const moveBlockToIndex = (fromIndex, toIndex) => {
    setFContentBlocks((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      const clampedTo = Math.max(0, Math.min(prev.length - 1, toIndex));
      if (fromIndex === clampedTo) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(clampedTo, 0, moved);
      return updated;
    });
  };

  const commitOrderInputDraft = (blockId) => {
    const draft = orderInputDrafts[blockId];
    setOrderInputDrafts((prev) => {
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
    if (draft === undefined || draft === '') return;
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed)) return;
    const currentIndex = fContentBlocksRef.current.findIndex((b) => b.id === blockId);
    if (currentIndex === -1) return;
    moveBlockToIndex(currentIndex, parsed - 1);
  };

  const handleAddMoreVideo = () => {
    setFVideoLinks([...fVideoLinks, '']);
  };


  const handleRemoveVideoLink = (index) => {
    if (fVideoLinks.length <= 1) return;
    const updated = fVideoLinks.filter((_, i) => i !== index);
    setFVideoLinks(updated);
  };

  const handleVideoUrlChange = (text, index) => {
    const updated = [...fVideoLinks];
    updated[index] = text;
    setFVideoLinks(updated);
  };

  const handleNextFromStep1 = () => {
    let errs = {};
    if (!fTitle.trim()) errs.fTitle = 'Please enter a portfolio title';
    if (!fBrief.trim()) errs.fBrief = 'Please enter a short brief or summary';
    if (fCategories.length < 3) errs.fCategories = 'Please select at least 3 categories/tags.';
    if (fIsAiGenerated === null) errs.fAiGenerated = 'Please select whether AI was used.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setFormStep(2);
  };

  const handleNextFromStep2 = (skip = false) => {
    setFormStep(3);
  };

  const handleNextFromStep3 = () => {
    let errs = {};
    if (!fCover.trim()) errs.fCover = 'Please select a cover thumbnail photo from your phone or PC';
    
    const validShowcase = fShowcaseImages.filter((img) => img.trim() !== '');
    if (validShowcase.length < 2) {
      errs.showcaseImages = 'Please pick at least 2 showcase images.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setFormStep(4);
  };

  const performPortfolioSubmit = async () => {
    const validVideos = fVideoLinks.filter((v) => v.trim() !== '');
    const validShowcaseImgs = fShowcaseImages.filter((img) => img.trim() !== '');

    // Upload any freshly-picked local images inside the block editor
    // (standalone image blocks and row-column images) before saving.
    const finalContentBlocks = await uploadContentBlockImages(fContentBlocks);
    const flattenedDescription = flattenBlocksToMarkdown(finalContentBlocks) || fLongDescription;

    if (!editingProjectId && session) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from('portfolios')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('created_at', oneHourAgo);

      if (!countError && count !== null && count >= 5) {
        showAppAlert('Slow Down', "You've published the max of 5 portfolios per hour. Please try again later.");
        return;
      }
    }

    if (editingProjectId) {
      // 1. Upload any newly-picked local images
      let finalCoverUrl = fCover;
      if (fCover && (fCover.startsWith('file://') || fCover.startsWith('content://') || fCover.startsWith('ph://'))) {
        finalCoverUrl = await uploadImageChecked(fCover, 'covers');
      }

      const uploadedShowcase = await Promise.all(
        validShowcaseImgs.map((img) =>
          (img.startsWith('file://') || img.startsWith('content://') || img.startsWith('ph://'))
            ? uploadImageChecked(img, 'showcase')
            : Promise.resolve(img)
        )
      );
      const finalImages = uploadedShowcase.length > 0 ? uploadedShowcase : [finalCoverUrl];

      // 2. Update the portfolios row in Supabase
      const { error: updateError } = await supabase
        .from('portfolios')
        .update({
          title: fTitle,
          user_name: fDesigner || userProfile.name,
            user_handle: userProfile.handle || '',
          brief: fBrief,
          long_description: flattenedDescription,
          content_blocks: finalContentBlocks,
          cover_url: finalCoverUrl,
          is_ai_generated: fIsAiGenerated,
          figma_proto: fFigmaProto,
          component_proto: fComponentProto,
          desktop_proto: fDesktopProto,
          figma_file: fFigmaFile,
          figma_profile: fFigmaProfile,
          live_links: fHasLiveLink ? fLiveLinks.filter((l) => l.url.trim()) : [],
          categories: fCategories,
          is_nsfw: fIsNsfw,
          showcase_aspect_ratio: fShowcaseAspectRatio
        })
        .eq('id', editingProjectId);

      if (updateError) {
        console.warn('Supabase update error:', updateError);
        showAppAlert('Update Failed', updateError.message);
        return;
      }

      // 3. Replace showcase images: delete old rows, insert new ones.
      // If the delete silently fails (e.g. a missing RLS policy on
      // portfolio_images), inserting on top of the old rows would
      // accumulate duplicates on every single edit - so we now check this
      // and stop rather than making it worse.
      const { error: imgDeleteError } = await supabase
        .from('portfolio_images')
        .delete()
        .eq('portfolio_id', editingProjectId);
      if (imgDeleteError) {
        console.warn('Failed to clear old showcase images before update:', imgDeleteError);
        showAppAlert(
          'Update Partially Failed',
          'Your portfolio details were updated, but the old showcase images could not be cleared, so new ones were not added either to avoid duplicating them. Please try updating again.'
        );
        return;
      }
      if (finalImages.length > 0) {
        const imgRows = finalImages.map((url) => ({ portfolio_id: editingProjectId, image_url: url }));
        const { error: imgInsertError } = await supabase.from('portfolio_images').insert(imgRows);
        if (imgInsertError) {
          console.warn('Failed to insert new showcase images:', imgInsertError);
        }
      }

      // 4. Update local state to match
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingProjectId
            ? {
                ...p,
                title: fTitle,
                designer: fDesigner || userProfile.name,
        designerHandle: userProfile.handle || '',
                category: fCategories[0] || 'Mobile App',
                categories: fCategories,
                isNsfw: fIsNsfw,
                figmaProfile: fFigmaProfile,
                liveLinks: fHasLiveLink ? fLiveLinks.filter((l) => l.url.trim()) : [],
                figmaProto: fFigmaProto,
                componentProto: fComponentProto,
                desktopProto: fDesktopProto,
                figmaFile: fFigmaFile,
                brief: fBrief,
                longDescription: flattenedDescription,
                contentBlocks: finalContentBlocks,
                cover: finalCoverUrl,
                images: finalImages,
                videoLinks: validVideos,
                showcaseAspectRatio: fShowcaseAspectRatio
              }
            : p
        )
      );
      setAddModalVisible(false);
      resetFormWizard();
      showAutoSuccess('Updated', 'Portfolio package updated successfully!');
      return;
    } else {
      // 1. Upload Cover Image to Supabase Storage
      let finalCoverUrl = fCover;
      if (fCover && (fCover.startsWith('file://') || fCover.startsWith('content://') || fCover.startsWith('ph://'))) {
        finalCoverUrl = await uploadImageChecked(fCover, 'covers');
      }

      // 2. Upload Showcase Images to Supabase Storage
      const uploadedShowcase = await Promise.all(
        validShowcaseImgs.map((img) =>
          (img.startsWith('file://') || img.startsWith('content://') || img.startsWith('ph://'))
            ? uploadImageChecked(img, 'showcase')
            : Promise.resolve(img)
        )
      );

      const finalImages = uploadedShowcase.length > 0 ? uploadedShowcase : [finalCoverUrl];

      // 3. Insert into Supabase 'portfolios' table
      let insertedId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        const { data: dbData, error: dbError } = await supabase
          .from('portfolios')
          .insert([{
            user_id: session.user.id,
            user_name: fDesigner || userProfile.name,
            user_handle: userProfile.handle || '',
            user_avatar: userProfile.avatar,
            title: fTitle,
            brief: fBrief,
            long_description: flattenedDescription,
            content_blocks: finalContentBlocks,
            cover_url: finalCoverUrl,
            portfolio_type: selectedPortfolioType,
            is_ai_generated: fIsAiGenerated,
            figma_proto: fFigmaProto,
            component_proto: fComponentProto,
            desktop_proto: fDesktopProto,
            figma_file: fFigmaFile,
            figma_profile: fFigmaProfile,
            live_links: fHasLiveLink ? fLiveLinks.filter((l) => l.url.trim()) : [],
            categories: fCategories,
            is_nsfw: fIsNsfw,
            likes_count: 0,
            visits_count: 1,
            showcase_aspect_ratio: fShowcaseAspectRatio
          }])
          .select();

        if (dbError) {
          console.warn('Supabase DB Insert Error:', dbError);
          showAppAlert('Notice', `Saved locally. Supabase error: ${dbError.message}`);
        } else if (dbData && dbData.length > 0) {
          insertedId = dbData[0].id;

          // Insert showcase images into portfolio_images table
          if (finalImages.length > 0) {
            const imgRows = finalImages.map(url => ({
              portfolio_id: insertedId,
              image_url: url
            }));
            await supabase.from('portfolio_images').insert(imgRows);
          }
        }
      } catch (err) {
        console.warn('Supabase Exception:', err);
      }

      const newProject = {
        id: insertedId,
        ownerId: session ? session.user.id : null,
        title: fTitle,
        designer: fDesigner || userProfile.name,
        designerHandle: userProfile.handle || '',
        designerAvatar: userProfile.avatar,
        category: fCategories[0] || 'Mobile App',
        categories: fCategories,
        isNsfw: fIsNsfw,
        liked: false,
        likesCount: 0,
        visitsCount: 1,
        figmaProfile: fFigmaProfile || '',
        liveLinks: fHasLiveLink ? fLiveLinks.filter((l) => l.url.trim()) : [],
        figmaProto: fFigmaProto,
        componentProto: fComponentProto,
        desktopProto: fDesktopProto,
        figmaFile: fFigmaFile,
        brief: fBrief,
        longDescription: flattenedDescription,
        contentBlocks: finalContentBlocks,
        cover: finalCoverUrl,
        images: finalImages,
        videoLinks: validVideos,
        caseStudy: fBrief,
        showcaseAspectRatio: fShowcaseAspectRatio
      };

      setProjects([newProject, ...projects]);
      trackEvent('portfolio_published');
      setAddModalVisible(false);
      resetFormWizard();
      showAutoSuccess('Success!', 'Your portfolio is successfully uploaded!');
    }
  };

  // Wraps the actual submit work with a hard timeout so a stalled/very slow
  // connection can never leave the UI stuck on "Uploading..." forever with
  // no way out - surfaces a clear error and re-enables the button instead.
  const handleFinalPostPackage = async () => {
    setIsSubmittingPortfolio(true);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setIsSubmittingPortfolio(false);
      showAppAlert(
        'Taking Longer Than Expected',
        "This is taking much longer than usual, likely a slow connection. It may still finish in the background — check back in a bit before trying again to avoid a duplicate post."
      );
    }, 60000);

    try {
      await performPortfolioSubmit();
    } catch (err) {
      console.warn('Portfolio submit failed:', err);
      if (!timedOut) {
        showAppAlert('Something Went Wrong', 'Could not finish posting your portfolio. Please check your connection and try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      if (!timedOut) setIsSubmittingPortfolio(false);
    }
  };

  const handleCloseUploadWizard = () => {
    setDiscardConfirmModalVisible(true);
  };

  // Mirrors handleNavChange/handleCloseUploadWizard for performBackNavigation
  // below to read, instead of closing over the functions directly. Both are
  // plain functions redefined every render (used in 40+ places throughout
  // the UI as normal - not touching that), which meant performBackNavigation
  // had to list them as useCallback deps and therefore got a new identity on
  // every single render too - and since it backs a BackHandler/popstate
  // listener, that meant tearing down and re-registering that native
  // listener every render, not just when back-navigation logic actually
  // changes. Reading through a ref (updated every render via the effect
  // below, no dependency array needed for that) breaks that chain without
  // changing what either function actually does anywhere else.
  const handleNavChangeRef = useRef(null);
  const handleCloseUploadWizardRef = useRef(null);

  // Shared "go back one step" decision logic - same priority order used by
  // both Android's hardware back button and, further below, the web
  // browser's back button. Kept as one function rather than duplicated
  // logic in two places, so the two platforms can't silently drift out of
  // sync with each other.
  const performBackNavigation = useCallback(() => {
    if (linkPreview) {
      setLinkPreview(null);
      return true;
    }
    if (lightboxImageUri) {
      setLightboxImageUri(null);
      return true;
    }
    if (settingsModalVisible) {
      setSettingsModalVisible(false);
      return true;
    }
    if (notificationModalVisible) {
      setNotificationModalVisible(false);
      return true;
    }
    if (fullscreenDescEditorVisible) {
      setFullscreenDescEditorVisible(false);
      return true;
    }
    if (addModalVisible) {
      handleCloseUploadWizardRef.current();
      return true;
    }
    if (designerModalVisible) {
      handleBackFromDesignerProfile();
      return true;
    }
    if (modalVisible) {
      handleBackFromPortfolioDetail();
      return true;
    }
    if (allCategoriesModalVisible) {
      setAllCategoriesModalVisible(false);
      return true;
    }
    if (tabVisitStack.length > 0) {
      const prevTab = tabVisitStack[tabVisitStack.length - 1];
      setTabVisitStack((prevStack) => prevStack.slice(0, -1));
      tabNavIsGoingBackRef.current = true;
      handleNavChangeRef.current(prevTab);
      return true;
    }
    if (bottomNav !== 'forYou') {
      tabNavIsGoingBackRef.current = true;
      handleNavChangeRef.current('forYou');
      return true;
    }
    return false;
  }, [
    linkPreview, lightboxImageUri, settingsModalVisible, notificationModalVisible,
    fullscreenDescEditorVisible, addModalVisible, designerModalVisible, modalVisible,
    allCategoriesModalVisible, bottomNav, tabVisitStack,
    handleBackFromDesignerProfile, handleBackFromPortfolioDetail
  ]);

  useEffect(() => {
    handleNavChangeRef.current = handleNavChange;
    handleCloseUploadWizardRef.current = handleCloseUploadWizard;
  });

  // Android hardware back: close whatever's on top first (checked in a
  // rough "most recently likely opened" order), otherwise treat For You as
  // home - only actually exits the app from there.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => performBackNavigation();
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [performBackNavigation]);

  // Web browser back button (and swipe-back gesture on mobile browsers) -
  // same shared performBackNavigation logic as Android's hardware back
  // above, so the two platforms can't drift apart. Doesn't attempt to
  // distinguish the browser's forward button from back - popstate fires for
  // both, and there's no direction info on the event itself. Treating
  // forward-button clicks the same as back is a minor imperfection (rare
  // interaction, worst case it just repeats a back step) rather than
  // broken behavior, and correctly handling both directions would mean
  // reimplementing a real state machine against pushed history entries for
  // a case that's unlikely to come up in practice.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPopState = () => {
      performBackNavigation();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [performBackNavigation]);

  const resetFormWizard = () => {
    setEditingProjectId(null);
    setFormStep(1);
    setFTitle('');
    setFBrief('');
    setFLongDescription('');
    setFContentBlocks([]);
    setBlockSelections({});
    setFCategories([]);
    setFIsNsfw(false);
    setFIsAiGenerated(null);
    setCategorySearchQuery('');
    setFFigmaProto('');
    setFDesktopProto('');
    setFFigmaFile('');
    setFFigmaProfile('');
    setFHasLiveLink(false);
    setFLiveLinks([{ label: '', url: '' }]);
    setFCover('');
    setFShowcaseImages(['', '']);
    setFShowcaseAspectRatio('16:9');
    setFVideoLinks(['']);
    setErrors({});
  };

  // "App icon expanding into the app" style open animation for the wizard,
  // native only. Re-added after being removed as a debugging step while
  // chasing the touch/scroll bug - that bug turned out to be a responder-
  // negotiation race in the backdrop-dismiss mechanism (fixed separately,
  // see the overlayModalBg / card-wrapper responder props throughout this
  // file), completely unrelated to this animation. Uses the ghost-shape
  // technique: a simple, childless rounded rectangle carries the scale/
  // translate animation - cheap regardless of wizard complexity, since
  // there's nothing inside it to also transform. The real content renders
  // at full size the entire time (never transformed), starting transparent
  // and crossfading in as the ghost fades out near the end. No touch-
  // safety gating this time - the ghost never affects the real content's
  // interactivity since it's a separate, non-transformed sibling.
  const nativePlusBtnRef = useRef(null);
  const [wizardOriginRect, setWizardOriginRect] = useState(null);
  const wizardExpandAnim = useRef(new Animated.Value(0)).current;

  const [portfolioTypeModalVisible, setPortfolioTypeModalVisible] = useState(false);
  const [selectedPortfolioType, setSelectedPortfolioType] = useState('ui_ux');
  const [myFeatureInterests, setMyFeatureInterests] = useState(new Set());
  const [interestConfirmTarget, setInterestConfirmTarget] = useState(null); // feature_name string, or null if no confirm popup showing
  const [interestConfirmMode, setInterestConfirmMode] = useState('add'); // 'add' | 'remove' - which action interestConfirmTarget is for
  const [portfolioReportModalVisible, setPortfolioReportModalVisible] = useState(false);
  const [portfolioReportSelectedReason, setPortfolioReportSelectedReason] = useState(null); // 'ai_undisclosed' | 'nsfw_misuse' | 'other' | null
  const [portfolioReportOtherText, setPortfolioReportOtherText] = useState('');

  // Fetched once per session (not re-fetched every time the type-select
  // step opens) so returning to it repeatedly in one sitting doesn't
  // re-query needlessly - session change (login/logout) is the only thing
  // that should invalidate this.
  useEffect(() => {
    if (!session) {
      setMyFeatureInterests(new Set());
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('feature_interest')
        .select('feature_name')
        .eq('user_id', session.user.id);
      if (error || !data) return;
      setMyFeatureInterests(new Set(data.map((r) => r.feature_name)));
    })();
  }, [session]);

  const handleConfirmFeatureInterest = async () => {
    const featureName = interestConfirmTarget;
    const mode = interestConfirmMode;
    setInterestConfirmTarget(null);
    if (!featureName || !session) return;

    if (mode === 'remove') {
      const { error } = await supabase
        .from('feature_interest')
        .delete()
        .eq('user_id', session.user.id)
        .eq('feature_name', featureName);
      if (error) {
        showToast('Could not remove interest - try again.');
        return;
      }
      setMyFeatureInterests((prev) => {
        const next = new Set(prev);
        next.delete(featureName);
        return next;
      });
      showToast("You're off the list for this one.");
      return;
    }

    // Insert is expected to occasionally hit the unique(user_id,
    // feature_name) constraint if this somehow fires twice (e.g. a fast
    // double-tap before state updates) - that's fine, treat it as success
    // either way rather than surfacing a confusing error for something
    // that's already true.
    const { error } = await supabase
      .from('feature_interest')
      .insert({ user_id: session.user.id, feature_name: featureName });
    if (error && error.code !== '23505') {
      showToast('Could not register interest - try again.');
      return;
    }
    setMyFeatureInterests((prev) => new Set(prev).add(featureName));
    showToast("Thanks! We'll let you know when it's ready.");
  };

  const handleOpenChangelog = async () => {
    setChangelogModalVisible(true);
    if (changelogFetchedRef.current) return;
    changelogFetchedRef.current = true;
    setChangelogLoading(true);
    const { data, error } = await supabase
      .from('changelog_entries')
      .select('id, version, title, description, created_at')
      .order('created_at', { ascending: false });
    setChangelogLoading(false);
    if (error) {
      console.warn('Failed to fetch changelog:', error);
      changelogFetchedRef.current = false; // allow retry on next open
      return;
    }
    setChangelogEntries(data || []);
  };

  const handleOpenAddPortfolio = () => {
    if (!requireAuth()) return;
    playTabBounce('plus');
    resetFormWizard();
    if (designerModalVisible) setDesignerModalVisible(false);
    if (Platform.OS === 'web' && isWebWide && modalVisible) setModalVisible(false);
    setCameFromPortfolioId(null);
    setCameFromDesignerId(null);
    setTopStackedPage(null);
    setDesignerBackStack([]);
    setSelectedPortfolioType('ui_ux');
    setPortfolioTypeModalVisible(true);
  };

  // Split out of handleOpenAddPortfolio above - this is the part that
  // actually opens the wizard (native plus-button expand animation
  // included), now triggered once a type is picked in the new type-select
  // step rather than immediately on tapping the + button. Kept as its own
  // function so the animation/native-measurement logic isn't duplicated or
  // at risk of drifting if touched again later.
  const proceedToPortfolioWizard = () => {
    setPortfolioTypeModalVisible(false);
    if (Platform.OS === 'web' || !nativePlusBtnRef.current) {
      setAddModalVisible(true);
      return;
    }

    nativePlusBtnRef.current.measureInWindow((x, y, width, height) => {
      setWizardOriginRect({ x, y, width, height });
      wizardExpandAnim.setValue(0);
      setAddModalVisible(true);
      Animated.timing(wizardExpandAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
    });
  };

  const getFigmaEmbedUrl = (url) => {
    if (!url) return '';
    if (!url.includes('figma.com/embed')) {
      return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const handleWebViewNavigation = (request) => {
    const { url } = request;
    if (!url) return true;

    const isFigmaInternal =
      url.includes('figma.com') ||
      url.includes('figmame.com') ||
      url.startsWith('about:blank') ||
      url.startsWith('blob:') ||
      url.startsWith('data:');

    if (isFigmaInternal) {
      return true;
    } else {
      openExternalLinkWithWarning(url);
      return false;
    }
  };

  // Pinned once per session instead of recomputed on every re-sort - using a
  // fresh Date.now() each time the list re-renders let two close-scoring
  // items swap places from one render to the next, which reads as the feed
  // randomly reshuffling/refreshing while scrolling.
  const feedRankingNowRef = useRef(Date.now());

  const forYouCategoryFilteredProjects = useMemo(() => {
    const specialModes = ['all', 'popularity', 'newest'];
    const filtered = projects.filter((p) => {
      if (p.ownerId && blockedIds.has(p.ownerId)) return false;
      if (p.ownerId && mutedIds.has(p.ownerId)) return false;
      if (!forYouTypeFilter.has(p.portfolioType || 'ui_ux')) return false;
      // "With AI" (true) = inclusive, no AI-based filtering at all - shows
      // everything (AI-tagged or not), same as if this filter didn't
      // exist. "No AI" (false) = exclusive, hides anything tagged
      // isAiGenerated===true. NOT a strict either/or split - that was the
      // original (wrong) implementation, which would've hidden almost the
      // entire feed by default since most content isn't AI-tagged.
      if (!forYouAiFilter && p.isAiGenerated === true) return false;
      if (!specialModes.includes(categoryFilter)) {
        if (Array.isArray(p.categories)) {
          return p.categories.includes(categoryFilter);
        }
        return p.category === categoryFilter;
      }
      return true;
    });

    if (categoryFilter === 'newest') {
      // Newest: pure chronological, most recently published first.
      // Projects already arrive from Supabase ordered by created_at desc,
      // so array order itself is the newest-first ordering.
      return filtered;
    }

    if (categoryFilter === 'popularity') {
      // Popularity: pure all-time engagement ranking, no recency weighting.
      // Likes count 3x more than views since a like is a stronger signal of quality
      // than a passive view.
      const scored = filtered.map((p) => ({
        ...p,
        _popularityScore: (p.likesCount || 0) * 3 + (p.visitsCount || 0)
      }));
      return scored.sort((a, b) => b._popularityScore - a._popularityScore);
    }

    if (categoryFilter !== 'all') return filtered;

    // "Highlighted" scoring: engagement (likes weighted higher than views) plus a
    // recency boost that decays over 7 days, so new posts get a fair chance
    // without letting old popular ones permanently dominate the feed.
    const now = feedRankingNowRef.current;
    const scored = filtered.map((p, idx) => {
      const likes = p.likesCount || 0;
      const views = p.visitsCount || 0;
      const ageMs = p.createdAt ? now - new Date(p.createdAt).getTime() : idx * 86400000;
      const ageDays = ageMs / 86400000;
      const recencyBoost = Math.max(0, 50 - ageDays * (50 / 7));
      const score = likes * 3 + views * 1 + recencyBoost;
      return { ...p, _highlightScore: score };
    });

    return scored.sort((a, b) => b._highlightScore - a._highlightScore);
  }, [projects, categoryFilter, blockedIds, mutedIds, forYouTypeFilter, forYouAiFilter]);

  const followedProjects = useMemo(() => {
    return projects.filter((p) => {
      if (selectedFollowedDesigner) {
        return p.ownerId === selectedFollowedDesigner;
      }
      if (p.ownerId && mutedIds.has(p.ownerId)) return false;
      return followedDesigners.includes(p.ownerId);
    });
  }, [projects, selectedFollowedDesigner, followedDesigners, mutedIds]);

  const followedDesignersObjects = useMemo(() => {
    return allDesigners.filter((d) => followedDesigners.includes(d.id));
  }, [followedDesigners, allDesigners]);

  // Circle "new post" red dot indicator. Tracked locally (AsyncStorage,
  // per-device) rather than in Supabase - simpler, and "have I personally
  // looked at this yet" is a reasonable thing to keep per-device rather
  // than syncing across every device someone uses. Newly-followed designers
  // get an immediate seen-baseline of "now" so their existing back-catalog
  // doesn't show as a false "new post" the moment you follow them - only
  // posts uploaded after you started following (or after you last checked)
  // count.
  const [circleLastSeen, setCircleLastSeen] = useState({});
  const [circleHasNewPost, setCircleHasNewPost] = useState({});

  useEffect(() => {
    AsyncStorage.getItem(CIRCLE_LAST_SEEN_KEY).then((raw) => {
      if (raw) {
        try { setCircleLastSeen(JSON.parse(raw)); } catch (e) { /* ignore malformed cache */ }
      }
    });
  }, []);

  const markCircleDesignerSeen = useCallback((designerId) => {
    setCircleLastSeen((prev) => {
      const next = { ...prev, [designerId]: new Date().toISOString() };
      AsyncStorage.setItem(CIRCLE_LAST_SEEN_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setCircleHasNewPost((prev) => ({ ...prev, [designerId]: false }));
  }, []);

  useEffect(() => {
    if (followedDesigners.length === 0) {
      setCircleHasNewPost({});
      return;
    }
    let cancelled = false;
    // One query for the latest post per followed designer, rather than one
    // query per designer - fetches everyone's most recent portfolio at
    // once and reduces to a max-per-owner map client-side, since Supabase's
    // JS client doesn't have a simple GROUP BY without a Postgres function.
    supabase
      .from('portfolios')
      .select('user_id, created_at')
      .in('user_id', followedDesigners)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const latestByOwner = {};
        data.forEach((row) => {
          if (!latestByOwner[row.user_id]) latestByOwner[row.user_id] = row.created_at;
        });
        const next = {};
        followedDesigners.forEach((id) => {
          const latest = latestByOwner[id];
          const seenAt = circleLastSeen[id];
          // Never checked before AND has existing posts - establish a seen
          // baseline of "now" silently instead of showing every existing
          // post as new the first time this ever runs for that designer.
          if (latest && !seenAt) {
            markCircleDesignerSeen(id);
            return;
          }
          next[id] = !!(latest && seenAt && new Date(latest) > new Date(seenAt));
        });
        if (!cancelled) setCircleHasNewPost((prev) => ({ ...prev, ...next }));
      });
    return () => { cancelled = true; };
  }, [followedDesigners, circleLastSeen]);

  const [searchedProjects, setSearchedProjects] = useState([]);
  const [searchFilterTab, setSearchFilterTab] = useState('all'); // 'all' | 'portfolios' | 'designers'
  const [searchedDesigners, setSearchedDesigners] = useState([]);

  useEffect(() => {
    const q = searchQuery.trim().replace(/^@/, '');
    if (q === '') {
      setSearchedProjects([]);
      setSearchedDesigners(allDesigners);
      return;
    }

    const timeout = setTimeout(async () => {
      const [projectsRes, profilesRes, tagMatchRes] = await Promise.all([
        (() => {
          let q1 = supabase
            .from('portfolios')
            .select('*, portfolio_images(image_url)')
            .or(`title.ilike.%${q}%,user_name.ilike.%${q}%,brief.ilike.%${q}%,user_handle.ilike.%${q}%`);
          if (safeSearchEnabled) q1 = q1.or('is_nsfw.eq.false,is_nsfw.is.null');
          return q1.limit(30);
        })(),
        supabase
          .from('profiles')
          .select('*')
          .or(`name.ilike.%${q}%,role.ilike.%${q}%,location.ilike.%${q}%,handle.ilike.%${q}%`)
          .neq('name', '')
          .limit(30),
        supabase.rpc('search_portfolios_by_tag', { search_term: q })
      ]);

      trackEvent('search_performed', { query: q });

      const likedIds = await fetchLikedPortfolioIds();
      const mapPortfolioRow = (p) => ({
        id: p.id,
        ownerId: p.user_id || null,
          portfolioType: p.portfolio_type || 'ui_ux',
          isAiGenerated: p.is_ai_generated,
        title: p.title,
        designer: p.user_name || 'Unknown Designer',
        designerHandle: p.user_handle || '',
        designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
        category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
        categories: p.categories || ['Mobile App'],
        liked: likedIds.has(p.id),
        likesCount: p.likes_count ?? 0,
        visitsCount: p.visits_count || 120,
        figmaProfile: p.figma_profile || '',
        liveLinks: p.live_links || [],
          componentProto: p.component_proto || '',
        isNsfw: !!p.is_nsfw,
        showcaseAspectRatio: p.showcase_aspect_ratio || '16:9',
        figmaProto: p.figma_proto || '',
        desktopProto: p.desktop_proto || '',
        figmaFile: p.figma_file || '',
        brief: p.brief || '',
        longDescription: p.long_description || '',
        contentBlocks: getContentBlocksFromRow(p),
        pinned: !!p.is_pinned,
        cover: p.cover_url || '',
        images: getShowcaseImagesFromRow(p),
        videoLinks: [],
        caseStudy: p.brief || ''
      });

      let allProjectRows = [];
      if (projectsRes.data) allProjectRows = allProjectRows.concat(projectsRes.data);
      if (tagMatchRes.data) {
        const existingIds = new Set(allProjectRows.map((p) => p.id));
        tagMatchRes.data.forEach((p) => {
          if (!existingIds.has(p.id)) {
            allProjectRows.push(p);
            existingIds.add(p.id);
          }
        });
      } else if (tagMatchRes.error) {
        console.warn('Tag search RPC failed:', tagMatchRes.error);
      }

      if (allProjectRows.length > 0) {
        const mapped = allProjectRows.map(mapPortfolioRow);
        setSearchedProjects(mapped.filter((p) => !p.ownerId || !blockedIds.has(p.ownerId)));
      } else {
        setSearchedProjects([]);
      }

      let mappedDesigners = [];
      if (profilesRes.data) {
        mappedDesigners = profilesRes.data
          .filter((p) => p.id !== (session ? session.user.id : null))
          .map((p) => {
            const liveMatch = liveDesigners.find((d) => d.id === p.id);
            return {
              id: p.id,
              name: p.name,
              role: p.role || '',
              location: p.location || '',
              avatar: p.avatar_url || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
              figma: (p.links && p.links[0]) || '',
              handle: p.handle || '',
              bio: p.bio || '',
              followersCount: liveMatch ? liveMatch.followersCount : 0,
              followingCount: liveMatch ? liveMatch.followingCount : 0,
              followsMe: followersOfMe.has(p.id),
              links: p.links || []
            };
          });
      }

      // Designers who show up ONLY because they've published portfolios matching
      // this tag, not because their own profile text matched anything.
      if (tagMatchRes.data && tagMatchRes.data.length > 0) {
        const alreadyIncluded = new Set(mappedDesigners.map((d) => d.id));
        const tagOwnerIds = [...new Set(tagMatchRes.data.map((p) => p.user_id).filter((id) => id && !alreadyIncluded.has(id) && id !== (session ? session.user.id : null)))];
        if (tagOwnerIds.length > 0) {
          const { data: tagOwnerProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', tagOwnerIds);
          if (tagOwnerProfiles) {
            tagOwnerProfiles.forEach((p) => {
              if (!p.name) return;
              mappedDesigners.push({
                id: p.id,
                name: p.name,
                role: p.role || '',
                location: p.location || '',
                avatar: p.avatar_url || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
                figma: (p.links && p.links[0]) || '',
                handle: p.handle || '',
                bio: p.bio || '',
                followersCount: 0,
                followingCount: 0,
                followsMe: followersOfMe.has(p.id),
                links: p.links || [],
                matchedViaTag: q
              });
            });
          }
        }
      }

      const mockMatches = POPULAR_DESIGNERS.filter((d) =>
        d.name.toLowerCase().includes(q.toLowerCase()) ||
        d.role.toLowerCase().includes(q.toLowerCase()) ||
        d.location.toLowerCase().includes(q.toLowerCase())
      );
      setSearchedDesigners([...mappedDesigners, ...mockMatches].filter((d) => !blockedIds.has(d.id)));
    }, 350);

    return () => clearTimeout(timeout);
  }, [searchQuery, allDesigners, session, followersOfMe, blockedIds]);

  const exactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return null;

    const designerMatch = searchedDesigners.find(
      (d) => d.name.toLowerCase() === q || (d.handle && d.handle.toLowerCase() === q)
    );
    if (designerMatch) return { type: 'designer', item: designerMatch };

    const portfolioMatch = searchedProjects.find((p) => p.title.toLowerCase() === q);
    if (portfolioMatch) return { type: 'portfolio', item: portfolioMatch };

    return null;
  }, [searchQuery, searchedDesigners, searchedProjects]);

  const relatedProjects = useMemo(() => {
    if (!exactMatch || exactMatch.type !== 'portfolio') return searchedProjects;
    return searchedProjects.filter((p) => p.id !== exactMatch.item.id);
  }, [searchedProjects, exactMatch]);

  const relatedDesigners = useMemo(() => {
    if (!exactMatch || exactMatch.type !== 'designer') return searchedDesigners;
    return searchedDesigners.filter((d) => d.id !== exactMatch.item.id);
  }, [searchedDesigners, exactMatch]);

  const myUploadedProjects = useMemo(() => {
    if (!session) return [];
    return projects
      .filter((p) => p.ownerId === session.user.id)
      .slice()
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [projects, session]);

  const myLikedProjects = useMemo(() => {
    return projects.filter((p) => p.liked === true);
  }, [projects]);

  const filteredCategoriesForWizard = useMemo(() => {
    if (!categorySearchQuery.trim()) return masterCategoriesList;
    const q = categorySearchQuery.toLowerCase();
    return masterCategoriesList.filter((cat) => cat.toLowerCase().includes(q));
  }, [masterCategoriesList, categorySearchQuery]);

  if (!authChecked) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </SafeAreaView>
    );
  }

  // Guest browsing: no forced login. AuthScreen only shows when the guest
  // explicitly asks for it (Sign In in Options, or requireAuth() from a
  // gated action like follow/like/upload/comment/notifications). Once
  // session becomes truthy this naturally stops rendering, since
  // guestAuthPromptVisible only matters in the !session case below.
  if (!session && guestAuthPromptVisible) {
    return <AuthScreen onCancel={() => setGuestAuthPromptVisible(false)} />;
  }

  if (!userDataLoaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </SafeAreaView>
    );
  }

  if (needsOnboarding) {
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor: theme.bg }, Platform.OS === 'web' && { alignItems: 'center', backgroundColor: webCanvasColor }]}>
        <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 480, backgroundColor: theme.bg } : { flex: 1 }}>
        <AppKeyboardAwareScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          enableOnAndroid={true}
          extraScrollHeight={140}
          keyboardShouldPersistTaps="handled"
        >
            <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
              Set Up Your Profile
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 24 }}>
              Tell other designers who you are. You can always edit this later in Account Settings.
            </Text>

            <BouncyButton style={[styles.avatarEditPickerBtn, { marginBottom: 24 }]} activeOpacity={0.85} onPress={pickAvatarImage}>
              <Image source={{ uri: editAvatar }} style={styles.avatarEditPreview} />
              <View style={styles.avatarEditOverlay}>
              <CameraIconSVG />
              <Text style={styles.avatarEditText}>Add Photo</Text>
            </View>
          </BouncyButton>

          <Text style={styles.formGroupLabel}>Full Name *</Text>
          <FocusableTextInput
            style={styles.formInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Your full name"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.formGroupLabel}>Unique ID / Handle *</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingLeft: 14 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>@</Text>
            <FocusableTextInput
              style={[styles.formInput, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
              value={editHandle}
              onChangeText={(t) => setEditHandle(t.replace(/[^A-Za-z0-9._-]/g, ''))}
              placeholder="Enter your username here"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              maxLength={20}
            />
          </View>
          <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 4 }}>
            3-20 characters. Letters, numbers, dots, underscores, and dashes only — no spaces or other symbols. This shows under your portfolios instead of your name, and can be changed once every 30 days.
          </Text>
          {handleStatus === 'checking' && <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 8 }}>Checking availability...</Text>}
          {handleStatus === 'available' && <Text style={{ color: '#4ADE80', fontSize: 12, marginBottom: 8 }}>✓ Available</Text>}
          {handleStatus === 'taken' && <Text style={{ color: '#F87171', fontSize: 12, marginBottom: 8 }}>This handle is already taken</Text>}
          {handleStatus === 'invalid' && <Text style={{ color: '#F87171', fontSize: 12, marginBottom: 8 }}>3-20 chars: letters, numbers, . _ -</Text>}

          <Text style={styles.formGroupLabel}>Specialties / Role</Text>
          <FocusableTextInput
            style={styles.formInput}
            value={editRole}
            onChangeText={setEditRole}
            placeholder="e.g. UI/UX Designer"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.formGroupLabel}>Location / City</Text>
          <FocusableTextInput
            style={styles.formInput}
            value={editLocation}
            onChangeText={setEditLocation}
            placeholder="e.g. Jakarta, Indonesia"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.formGroupLabel}>Short Bio</Text>
          <FocusableTextInput
            style={[styles.formInput, { height: 74, textAlignVertical: 'top' }]}
            multiline
            value={editBio}
            onChangeText={setEditBio}
            placeholder="A short intro about your work..."
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.formGroupLabel}>Email</Text>
          <FocusableTextInput
            style={styles.formInput}
            value={editEmail}
            onChangeText={setEditEmail}
            placeholder="Email address"
            placeholderTextColor="#94A3B8"
          />

          <Text style={[styles.formGroupLabel, { marginTop: 10 }]}>Profile Links (optional, max 5)</Text>
          <View style={{ position: 'relative' }}>
            {draggingLinkIndex !== null && linkDropLineInterpRef.current && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute', left: 0, right: 0, top: 0, height: 3, borderRadius: 2,
                  backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
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
                <View {...dragResponder.panHandlers} style={{ padding: 6 }}>
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
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                />
                {lnk.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} onPress={() => handleLinkTextChange('', idx)}>
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>
              <BouncyButton style={{ padding: 8 }} onPress={() => handleRemoveAccountLink(idx)}>
                <TrashIconSVG />
              </BouncyButton>
            </Animated.View>
            );
          })}
          </View>
          {editLinks.length < 5 && (
            <BouncyButton style={styles.addMoreVideoBtn} onPress={handleAddAccountLink}>
              <Text style={styles.addMoreVideoText}>+ Add Profile Link ({editLinks.length}/5)</Text>
            </BouncyButton>
          )}

          <BouncyButton
            style={[styles.saveAccountSettingsBtn, { marginTop: 24 }]}
            activeOpacity={0.85}
            onPress={() => handleFinishOnboarding(false)}
          >
            <Text style={styles.submitBtnText}>Finish Setup</Text>
          </BouncyButton>
        </AppKeyboardAwareScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, Platform.OS === 'web' && { backgroundColor: webCanvasColor }]}>
      <View style={{ flex: 1, flexDirection: isWebWide ? 'row' : 'column' }}>
        {isWebWide && (
          <Animated.View
            style={{
              width: sidebarWidthAnim,
              backgroundColor: theme.bg,
              borderRightWidth: 1, borderRightColor: theme.border,
              paddingTop: 16
            }}
          >
            <SafeAreaView style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between', paddingHorizontal: 16, marginBottom: sidebarCollapsed ? 20 : 8 }}>
                {!sidebarCollapsed && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <DecentLogoSVG size={15} />
                    </View>
                    <Text style={styles.logoText}>ECENT</Text>
                  </View>
                )}
                <BouncyButton
                  style={{ width: headerIconBtnSize, height: headerIconBtnSize, borderRadius: headerIconBtnSize / 2, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => setSidebarCollapsed(!sidebarCollapsed)}
                >
                  <View style={{ transform: [{ scale: headerIconSize / 18 }, { rotate: sidebarCollapsed ? '180deg' : '0deg' }] }}>
                    <ChevronLeftSVG color={theme.accentLight} />
                  </View>
                </BouncyButton>
              </View>

              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  marginHorizontal: sidebarCollapsed ? 12 : 16, marginBottom: 16,
                  paddingVertical: sidebarCollapsed ? 0 : 10, paddingHorizontal: sidebarCollapsed ? 0 : 12,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  ...(sidebarCollapsed
                    ? {}
                    : { borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface })
                }}
                onPress={handleOpenAddPortfolio}
              >
                <View style={[styles.plusContainerBtn, { width: 32, height: 32, borderRadius: 10, marginHorizontal: 0, backgroundColor: 'transparent', shadowColor: 'transparent', elevation: 0 }]}>
                  <View style={{ position: 'absolute', top: 0, left: 0 }}>
                    <DShapeSVG size={32} color="#8B5CF6" />
                  </View>
                  <View style={{ transform: [{ scale: 0.7 }] }}><PlusSVG strokeWidth={5} offsetX={-1} /></View>
                </View>
                {!sidebarCollapsed && <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: '700' }}>Add Portfolio</Text>}
              </BouncyButton>

              <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 16, marginBottom: 8 }} />

              {/* Explicit per-icon blocks (not a generic .map()) so each one
                  can carry the same "fancy" animation the native bottom bar
                  has - press-scale (tabScaleAnims) plus the per-icon extras
                  (sparkle burst on For You, continuous spin on Circle, draw
                  animation on Profile). These Animated.Values are already
                  driven by handleNavChange regardless of which nav UI
                  triggered it, they just weren't being rendered here before -
                  the sidebar was using a fixed, non-animated scale. */}
              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingVertical: 6, paddingHorizontal: sidebarCollapsed ? 0 : 16,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
                }}
                onPress={() => handleNavChange('forYou')}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: bottomNav === 'forYou' ? (theme.mode === 'light' ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.15)') : 'transparent'
                }}>
                  <View style={{ transform: [{ scale: isWebDesktop ? 0.72 : 0.8 }] }}>
                    <Animated.View style={{ transform: [{ scale: tabScaleAnims.forYou }] }}>
                      <ForYouSVG active={bottomNav === 'forYou'} />
                    </Animated.View>
                    {[
                      { top: -4, left: -4 },
                      { top: -6, right: -2 },
                      { bottom: -3, right: -5 }
                    ].map((pos, i) => (
                      <Animated.Text
                        key={i}
                        style={{
                          position: 'absolute', ...pos, fontSize: 9, color: '#C084FC',
                          opacity: forYouSparkleAnim.interpolate({
                            inputRange: [0, 0.15 + i * 0.15, 0.5 + i * 0.15, 1],
                            outputRange: [0, 1, 1, 0]
                          }),
                          transform: [{
                            scale: forYouSparkleAnim.interpolate({
                              inputRange: [0, 0.15 + i * 0.15, 1],
                              outputRange: [0.3, 1, 0.3]
                            })
                          }]
                        }}
                      >
                        ✦
                      </Animated.Text>
                    ))}
                  </View>
                </View>
                {!sidebarCollapsed && (
                  <Text style={{ color: bottomNav === 'forYou' ? '#8B5CF6' : theme.text, fontSize: 12.5, fontWeight: bottomNav === 'forYou' ? '700' : '600' }}>
                    For You
                  </Text>
                )}
              </BouncyButton>

              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingVertical: 6, paddingHorizontal: sidebarCollapsed ? 0 : 16,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
                }}
                onPress={() => handleNavChange('followed')}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: bottomNav === 'followed' ? (theme.mode === 'light' ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.15)') : 'transparent'
                }}>
                  <View style={{ transform: [{ scale: isWebDesktop ? 0.72 : 0.8 }] }}>
                    <Animated.View style={{
                      transform: [
                        { scale: tabScaleAnims.followed },
                        { rotate: followedContinuousSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }
                      ]
                    }}>
                      <FollowedTabSVG active={bottomNav === 'followed'} />
                    </Animated.View>
                  </View>
                </View>
                {!sidebarCollapsed && (
                  <Text style={{ color: bottomNav === 'followed' ? '#8B5CF6' : theme.text, fontSize: 12.5, fontWeight: bottomNav === 'followed' ? '700' : '600' }}>
                    Circle
                  </Text>
                )}
              </BouncyButton>

              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingVertical: 6, paddingHorizontal: sidebarCollapsed ? 0 : 16,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
                }}
                onPress={() => handleNavChange('search')}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: bottomNav === 'search' ? (theme.mode === 'light' ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.15)') : 'transparent'
                }}>
                  <View style={{ transform: [{ scale: isWebDesktop ? 0.72 : 0.8 }] }}>
                    <Animated.View style={{ transform: [{ scale: tabScaleAnims.search }] }}>
                      <SearchSVG active={bottomNav === 'search'} eyesAnim={searchEyesAnim} />
                    </Animated.View>
                  </View>
                </View>
                {!sidebarCollapsed && (
                  <Text style={{ color: bottomNav === 'search' ? '#8B5CF6' : theme.text, fontSize: 12.5, fontWeight: bottomNav === 'search' ? '700' : '600' }}>
                    Search
                  </Text>
                )}
              </BouncyButton>

              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingVertical: 6, paddingHorizontal: sidebarCollapsed ? 0 : 16,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
                }}
                onPress={() => handleNavChange('profile')}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: bottomNav === 'profile' ? (theme.mode === 'light' ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.15)') : 'transparent'
                }}>
                  <View style={{ transform: [{ scale: isWebDesktop ? 0.72 : 0.8 }] }}>
                    <Animated.View style={{ transform: [{ scale: tabScaleAnims.profile }] }}>
                      <ProfileNavIcon active={bottomNav === 'profile'} drawAnim={profileDrawAnim} avatarUrl={session ? userProfile.avatar : null} themeMode={themeMode} />
                    </Animated.View>
                  </View>
                </View>
                {!sidebarCollapsed && (
                  <Text style={{ color: bottomNav === 'profile' ? '#8B5CF6' : theme.text, fontSize: 12.5, fontWeight: bottomNav === 'profile' ? '700' : '600' }}>
                    Profile
                  </Text>
                )}
              </BouncyButton>

              {/* GitHub - same placement/behavior pattern as Donate below it. */}
              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  marginTop: 'auto', marginHorizontal: sidebarCollapsed ? 12 : 16, marginBottom: 8,
                  paddingVertical: 10, paddingHorizontal: sidebarCollapsed ? 0 : 12,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
                }}
                onPress={() => openExternalLinkWithWarning(GITHUB_URL)}
              >
                <GitHubIconSVG color={theme.textSecondary} size={18} />
                {!sidebarCollapsed && (
                  <Text style={{ color: theme.textSecondary, fontSize: 12.5, fontWeight: '600' }}>Visit GitHub</Text>
                )}
              </BouncyButton>

              {/* Donate - desktop/tablet sidebar only, anchored to the very
                  bottom via marginTop: 'auto' regardless of how many nav
                  items sit above it. Shown in both expanded and collapsed
                  states, same conditional-label pattern as the nav items
                  above (icon always visible, text only when expanded). */}
              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  marginHorizontal: sidebarCollapsed ? 12 : 16, marginBottom: 8,
                  paddingVertical: 10, paddingHorizontal: sidebarCollapsed ? 0 : 12,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  borderRadius: 10, backgroundColor: themeMode === 'light' ? '#EDE9FE' : 'rgba(139,92,246,0.12)'
                }}
                onPress={() => { setDonateTermsAgreed(false); setDonateModalVisible(true); }}
              >
                <HeartIconSVG liked={true} />
                {!sidebarCollapsed && (
                  <Text style={{ color: theme.accent, fontSize: 12.5, fontWeight: '700' }}>Support & Donate</Text>
                )}
              </BouncyButton>
            </SafeAreaView>
          </Animated.View>
        )}
        <View style={{ flex: 1, alignItems: isWebWide ? 'center' : 'stretch' }}>
      <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: mainContentMaxWidth, backgroundColor: webCanvasColor } : { flex: 1 }}>
      <StatusBar barStyle={themeMode === 'light' ? 'dark-content' : 'light-content'} backgroundColor={theme.bg} translucent={false} />

      {isOffline && (
        <View style={{
          position: 'absolute',
          top: 12,
          left: 16,
          right: 16,
          zIndex: 1000,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: '#EF4444',
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 20
        }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 }}>You're offline</Text>
          <BouncyButton
            style={{ backgroundColor: '#EF4444', borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12 }}
            onPress={() => {
              NetInfoCompat.fetch().then((state) => {
                const stillOffline = state.isConnected === false || state.isInternetReachable === false;
                setIsOffline(stillOffline);
                if (!stillOffline) handleRefresh();
              });
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Reload</Text>
          </BouncyButton>
        </View>
      )}

      {updateAvailable && (
        <View style={{
          position: 'absolute',
          top: isOffline ? 68 : 12,
          left: 16,
          right: 16,
          zIndex: 999,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: '#8B5CF6',
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          shadowColor: '#8B5CF6',
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 20
        }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 }}>A new version is available</Text>
          <BouncyButton
            style={{ backgroundColor: '#8B5CF6', borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12, minWidth: 64, alignItems: 'center' }}
            onPress={handleApplyUpdate}
            disabled={updateDownloading}
          >
            {updateDownloading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Update</Text>
            )}
          </BouncyButton>
        </View>
      )}

      {nativeUpdateInfo && (
        <View style={{
          position: 'absolute',
          top: (isOffline ? 68 : 12) + (updateAvailable ? 56 : 0),
          left: 16,
          right: 16,
          zIndex: 998,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: '#F59E0B',
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          shadowColor: '#F59E0B',
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 20
        }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{nativeUpdateInfo.message}</Text>
          <BouncyButton
            style={{ backgroundColor: '#F59E0B', borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12 }}
            onPress={() => {
              // Opens directly instead of routing through
              // openExternalLinkWithWarning - that confirmation modal
              // exists to protect people from arbitrary portfolio/profile
              // links other users control, which doesn't apply here since
              // this URL is the app's own official update link, always
              // set by the app owner via app_config. Toast gives immediate
              // feedback that the tap registered before the browser/
              // download UI actually appears, which can take a beat.
              if (nativeUpdateInfo.url) {
                showToast('Opening download…');
                Linking.openURL(nativeUpdateInfo.url).catch((err) => {
                  console.warn('Failed to open update link:', err);
                  showToast('Could not open the download link');
                });
              }
            }}
          >
            <Text style={{ color: '#1F1300', fontSize: 12, fontWeight: '700' }}>Download</Text>
          </BouncyButton>
          <BouncyButton
            style={{ paddingVertical: 6, paddingHorizontal: 8 }}
            onPress={() => setNativeUpdateInfo(null)}
          >
            <Text style={{ color: theme.textSecondary, fontSize: 16, fontWeight: '700' }}>✕</Text>
          </BouncyButton>
        </View>
      )}

      {toastMessage && (
        <View style={{
          position: 'absolute',
          top: isWebWide ? 20 : headerBottomY + 8,
          right: 16,
          width: '33%',
          minWidth: 110,
          zIndex: 999,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: '#8B5CF6',
          borderRadius: 10,
          paddingVertical: 8,
          paddingHorizontal: 10,
          shadowColor: '#8B5CF6',
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 20
        }}>
          <Text style={{ color: theme.text, fontSize: 11, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>{toastMessage}</Text>
        </View>
      )}


      {/* SAFE SEARCH DISABLE WARNING - 5s countdown. Zero shared style/
          component dependencies, matching the approach that finally fixed
          the success popup's missing-button issue. */}
      {disableSafeSearchModalVisible && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 30 }}
        >
          <View
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.75)',
              alignItems: 'center', justifyContent: 'center',
              padding: 24
            }}
          >
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 24,
                width: '100%',
                maxWidth: 340,
                alignItems: 'center'
              }}
            >
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <WarningTriangleSVG />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' }}>
                Turn Off Safe Search?
              </Text>
              <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 18 }}>
                You will start seeing NSFW designers and portfolios in search results. This does not affect For You, which never shows NSFW content regardless of this setting.
              </Text>
              <TouchableOpacity
                style={{
                  height: 48,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  backgroundColor: disableSafeSearchCountdown > 0 ? '#F1F5F9' : '#EF4444',
                  borderWidth: disableSafeSearchCountdown > 0 ? 1.5 : 0,
                  borderColor: '#CBD5E1'
                }}
                activeOpacity={0.8}
                disabled={disableSafeSearchCountdown > 0}
                onPress={confirmDisableSafeSearch}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: disableSafeSearchCountdown > 0 ? '#64748B' : '#FFFFFF' }}>
                  {disableSafeSearchCountdown > 0 ? `Wait ${disableSafeSearchCountdown}s...` : 'Turn Off Safe Search'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ width: '100%', marginTop: 10, alignItems: 'center', paddingVertical: 8 }}
                activeOpacity={0.6}
                onPress={() => setDisableSafeSearchModalVisible(false)}
              >
                <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {fancyModeConfirmVisible && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 30 }}
        >
          <View
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.75)',
              alignItems: 'center', justifyContent: 'center',
              padding: 24
            }}
          >
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 24,
                width: '100%',
                maxWidth: 340,
                alignItems: 'center'
              }}
            >
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <WarningTriangleSVG />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' }}>
                Enable Fancy Mode?
              </Text>
              <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 18 }}>
                This turns on blur backdrops, translucent effects, and extra animations throughout the app. It's still experimental - performance may lag or behave unexpectedly, especially on lower-end devices. You can turn it back off anytime.
              </Text>
              <TouchableOpacity
                style={{
                  height: 48,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  backgroundColor: fancyModeCountdown > 0 ? '#F1F5F9' : '#8B5CF6',
                  borderWidth: fancyModeCountdown > 0 ? 1.5 : 0,
                  borderColor: '#CBD5E1'
                }}
                activeOpacity={0.8}
                disabled={fancyModeCountdown > 0}
                onPress={confirmEnableFancyMode}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: fancyModeCountdown > 0 ? '#64748B' : '#FFFFFF' }}>
                  {fancyModeCountdown > 0 ? `Wait ${fancyModeCountdown}s...` : 'Enable Fancy Mode'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ width: '100%', marginTop: 10, alignItems: 'center', paddingVertical: 8 }}
                activeOpacity={0.6}
                onPress={() => setFancyModeConfirmVisible(false)}
              >
                <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* AUTO-DISMISSING SUCCESS POPUP (5s). Deliberately has ZERO shared
          style/component dependencies (no styles.X, no BouncyButton) - every
          value is inline and hardcoded. This is the most defensive version
          possible: if the button still doesn't render after this, the cause
          is not a stale/broken shared style or a modal-stacking conflict
          (both already ruled out), which points somewhere else entirely -
          see the note left for the person testing this. */}
      {!!autoSuccessConfig && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 30 }}
        >
          <View
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.75)',
              alignItems: 'center', justifyContent: 'center',
              padding: 24
            }}
          >
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 24,
                width: '100%',
                maxWidth: 340,
                alignItems: 'center'
              }}
            >
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <CheckIconSVG />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' }}>
                {autoSuccessConfig?.title}
              </Text>
              <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 18 }}>
                {autoSuccessConfig?.message}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: '#8B5CF6',
                  height: 48,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%'
                }}
                activeOpacity={0.8}
                onPress={() => {
                  if (autoSuccessTimeoutRef.current) clearTimeout(autoSuccessTimeoutRef.current);
                  if (autoSuccessIntervalRef.current) clearInterval(autoSuccessIntervalRef.current);
                  setAutoSuccessConfig(null);
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>
                  Continue ({autoSuccessCountdown}s)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* FIRST-TIME APP INTRODUCTION CAROUSEL */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={false}
        visible={showIntroCarousel}
        onRequestClose={handleCloseIntroCarousel}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16 }}>
            <BouncyButton onPress={handleCloseIntroCarousel}>
              <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '700' }}>Skip</Text>
            </BouncyButton>
          </View>

          <ScrollView
            ref={introScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setIntroPageIndex(idx);
            }}
            style={{ flex: 1 }}
          >
            {INTRO_CAROUSEL_PAGES.map((page, i) => (
              <View key={i} style={{ width: SCREEN_WIDTH, padding: 32, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ marginBottom: 24 }}>
                  {page.icon === 'sparkle' && <SparkleIconSVG color="#8B5CF6" size={56} />}
                  {page.icon === 'image' && <ImageIconSVG />}
                  {page.icon === 'share' && <ShareIconSVG color={themeMode === 'light' ? '#6D28D9' : '#D8B4FE'} />}
                </View>
                <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800', marginBottom: 16, textAlign: 'center' }}>
                  {page.title}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 23, textAlign: 'center' }}>
                  {page.body}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
            {INTRO_CAROUSEL_PAGES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: introPageIndex === i ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: introPageIndex === i ? '#8B5CF6' : theme.border
                }}
              />
            ))}
          </View>

          <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
            <BouncyButton
              style={{ backgroundColor: '#8B5CF6', height: 50, borderRadius: 99, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => {
                if (introPageIndex < INTRO_CAROUSEL_PAGES.length - 1) {
                  const nextIndex = introPageIndex + 1;
                  introScrollRef.current?.scrollTo({ x: nextIndex * SCREEN_WIDTH, animated: true });
                  setIntroPageIndex(nextIndex);
                } else {
                  handleCloseIntroCarousel();
                }
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
                {introPageIndex < INTRO_CAROUSEL_PAGES.length - 1 ? 'Next' : 'Get Started'}
              </Text>
            </BouncyButton>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Header with App Name DECENT Text Only (Removed Mockup Icon) & Switched Header Icons.
          On wide web (tablet/desktop) this whole bar is removed - the DECENT
          logo, App Version, and Admin badge now live in the sidebar instead,
          and the notification/settings icons are already position:'fixed'
          so they don't need this container to lay out correctly. The outer
          View collapses to zero visual footprint there (no padding/border)
          rather than being unmounted, so headerBottomY's onLayout measurement
          and the bell/gear render path stay untouched.

          On native, this is now a true absolute overlay (was previously a
          normal-flow element pushing the ScrollView down) so content
          actually scrolls underneath it and the blur below shows something
          real through it. The ScrollView's contentContainerStyle below adds
          matching top padding (headerBottomY) so content still starts
          visually below the header on first render - it's just that
          scrolling now moves content up underneath the header rather than
          the header being a fixed ceiling above a shorter scroll area.
          headerBottomY itself is unaffected: onLayout still reports this
          View's real rendered height/position regardless of position type,
          so every dropdown/toast/banner that already depends on it needs no
          changes. Same applies to the bell/gear icons - they're laid out via
          the header's own internal flexbox row, which works identically
          whether the row's outer container is relatively or absolutely
          positioned. */}
      <View
        style={isWebWide
          ? { position: 'relative' }
          : [
              styles.header,
              Platform.OS !== 'web' && {
                backgroundColor: 'transparent',
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100
              }
            ]}
        onLayout={(e) => setHeaderBottomY(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        {Platform.OS !== 'web' && (
          lightweightMode ? (
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: theme.bg
            }} />
          ) : (
            <BlurView
              intensity={45}
              tint={themeMode === 'light' ? 'light' : 'dark'}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
          )
        )}
        {!isWebWide && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {Platform.OS === 'web' && !isWebWide && (
            <BouncyButton
              style={[styles.headerIconBtn, hamburgerMenuVisible && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }]}
              onPress={() => setHamburgerMenuVisible(true)}
            >
              <HamburgerSVG active={hamburgerMenuVisible} inactiveColor={theme.accentLight} size={headerIconSize} />
            </BouncyButton>
          )}
        <View style={{ minWidth: 140, height: 36, justifyContent: 'center' }}>
          <View style={styles.logoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
                <DecentLogoSVG size={15} />
              </View>
              <Text style={styles.logoText}>ECENT</Text>
            </View>
            <View style={styles.versionBadge}>
              <Text style={styles.versionText}>b{BUILD_NUMBER}</Text>
            </View>
          </View>

          {headerToast && (
            <Animated.View
              style={{
                position: 'absolute', top: 0, left: 0,
                width: headerFlipAnim,
                overflow: 'hidden'
              }}
            >
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: theme.surface, borderWidth: 0.75, borderColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
                  borderRadius: 99, height: 36, minHeight: 36, maxHeight: 36, paddingVertical: 0, paddingHorizontal: 8,
                  width: TOAST_PILL_WIDTH, overflow: 'hidden'
                }}
              >
                <Image source={{ uri: headerToast.avatar }} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.bg }} />
                <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  <Text style={{ color: themeMode === 'light' ? '#6D28D9' : '#C084FC', fontWeight: '800' }}>{headerToast.name}</Text>
                  {' '}{headerToast.action}
                </Text>
              </View>
            </Animated.View>
          )}
        </View>
        </View>
        )}

        <View style={[
          styles.headerRightActionsRow,
          Platform.OS === 'web' && { position: 'fixed', top: 16, right: 16, zIndex: 1000 }
        ]}>
          <View style={{ width: 36, height: 36 }}>
            <AnimatedTouchableOpacity
              ref={bellButtonRef}
              style={[
                styles.headerIconBtnWithBadge,
                {
                  position: 'absolute', top: 0, right: 0,
                  width: bellPillWidthAnim, borderRadius: 18,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
                  paddingHorizontal: 8, overflow: 'hidden'
                },
                notificationModalVisible && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
                bellFlash && { backgroundColor: theme.accent, borderColor: theme.accent },
                bellIntroCount > 0 && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }
              ]}
              onPress={() => {
                if (notificationModalVisible) {
                  setNotificationModalVisible(false);
                  return;
                }
                if (!requireAuth()) return;
                playBellWiggle();
                setSettingsModalVisible(false);
                (async () => {
                  await markNotificationsRead();
                  fetchNotifications();
                })();
                setNotifDropdownPos(
                  Platform.OS === 'web'
                    ? { top: utilityDropdownTop, right: 16, width: utilityDropdownWidth }
                    : { top: headerBottomY + 8, left: 16, right: 16 }
                );
                setNotificationModalVisible(true);
              }}
            >
              {bellIntroCount > 0 && (
                <Animated.Text
                  style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800', opacity: bellPillCountOpacity, marginRight: 6 }}
                  numberOfLines={1}
                >
                  {bellIntroCount}
                </Animated.Text>
              )}
              <Animated.View style={{
                transform: [{
                  rotate: bellRotateAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] })
                }]
              }}>
                <BellSVG active={notificationModalVisible || bellIntroCount > 0 || bellFlash} inactiveColor={theme.accentLight} />
              </Animated.View>
            </AnimatedTouchableOpacity>
            {unreadNotifications && notificationsList.length > 0 && <View style={styles.unreadRedBadgeDot} />}
          </View>

          <BouncyButton
            style={[styles.headerIconBtn, settingsModalVisible && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }]}
            onPress={() => {
              playCogSpin();
              if (settingsModalVisible) {
                setSettingsModalVisible(false);
                return;
              }
              setNotificationModalVisible(false);
              setSettingsModalVisible(true);
            }}
          >
            <Animated.View style={{
              transform: [{
                rotate: cogRotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })
              }]
            }}>
              <CogWheelSVG active={settingsModalVisible} inactiveColor={theme.accentLight} />
            </Animated.View>
          </BouncyButton>
        </View>
      </View>

      {/* Category chip bar, extracted out of the ScrollView so it can float
          above scrolled content on native (sticky, content scrolls behind
          it - matches the header/bottom bar treatment). On web this just
          sits in normal flow right above the feed, same as before; no
          sticky behavior there. */}
      {bottomNav === 'forYou' && (
        <View
          onLayout={(e) => setCategoryBarHeight(e.nativeEvent.layout.height)}
          style={Platform.OS !== 'web'
            ? { position: 'absolute', top: headerBottomY, left: 0, right: 0, zIndex: 90 }
            : (isWebWide ? { paddingTop: utilityDropdownTop } : undefined)}
        >
              <View style={[styles.topCategoryBarWrapper, { position: 'relative' }]}>
                <ScrollView
                  ref={categoryScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.topCategoryScrollView}
                  onScroll={Platform.OS === 'web' ? (e) => updateCategoryScrollArrows(e.nativeEvent.contentOffset.x) : undefined}
                  scrollEventThrottle={16}
                  onContentSizeChange={Platform.OS === 'web' ? (w) => {
                    categoryScrollContentWidthRef.current = w;
                    updateCategoryScrollArrows(categoryScrollXRef.current);
                  } : undefined}
                  onLayout={Platform.OS === 'web' ? (e) => {
                    categoryScrollContainerWidthRef.current = e.nativeEvent.layout.width;
                    updateCategoryScrollArrows(categoryScrollXRef.current);
                  } : undefined}
                >
                  <BouncyButton
                    style={[styles.topCategoryChip, categoryFilter === 'all' && styles.topCategoryChipActive]}
                    onPress={() => setCategoryFilter('all')}
                  >
                    <CategoryChipBg active={categoryFilter === 'all'} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <SparkleIconSVG color={categoryFilter === 'all' ? '#FFFFFF' : theme.accent} size={13} />
                      <Text style={[styles.topCategoryText, categoryFilter === 'all' && styles.topCategoryTextActive]}>
                        Highlighted
                      </Text>
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={[styles.topCategoryChip, categoryFilter === 'popularity' && styles.topCategoryChipActive]}
                    onPress={() => setCategoryFilter('popularity')}
                  >
                    <CategoryChipBg active={categoryFilter === 'popularity'} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <TrendingUpSVG color={categoryFilter === 'popularity' ? '#FFFFFF' : theme.accent} size={13} />
                      <Text style={[styles.topCategoryText, categoryFilter === 'popularity' && styles.topCategoryTextActive]}>
                        Popularity
                      </Text>
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={[styles.topCategoryChip, categoryFilter === 'newest' && styles.topCategoryChipActive]}
                    onPress={() => setCategoryFilter('newest')}
                  >
                    <CategoryChipBg active={categoryFilter === 'newest'} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <ClockSVG color={categoryFilter === 'newest' ? '#FFFFFF' : theme.accent} size={13} />
                      <Text style={[styles.topCategoryText, categoryFilter === 'newest' && styles.topCategoryTextActive]}>
                        Newest
                      </Text>
                    </View>
                  </BouncyButton>

                  {['Mobile App', 'Web Design', 'Design System', 'FinTech', 'Healthcare', 'E-Commerce', 'SaaS'].map((cat) => (
                    <BouncyButton
                      key={cat}
                      style={[styles.topCategoryChip, categoryFilter === cat && styles.topCategoryChipActive]}
                      onPress={() => setCategoryFilter(cat)}
                    >
                      <CategoryChipBg active={categoryFilter === cat} />
                      <Text style={[styles.topCategoryText, categoryFilter === cat && styles.topCategoryTextActive]}>
                        {cat}
                      </Text>
                    </BouncyButton>
                  ))}

                  <BouncyButton
                    style={styles.grid2x2CategoryBtn}
                    activeOpacity={0.8}
                    onPress={() => setAllCategoriesModalVisible(true)}
                  >
                    <Grid2x2SVG />
                  </BouncyButton>
                </ScrollView>

                {Platform.OS === 'web' && categoryCanScrollLeft && (
                  <BouncyButton
                    style={{
                      position: 'absolute', left: 0, top: 20, width: 38, height: 38,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(20,24,34,0.95)',
                      borderRadius: 19, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4
                    }}
                    onPress={() => {
                      const target = Math.max(0, categoryScrollXRef.current - (categoryScrollContainerWidthRef.current || 200) * 0.7);
                      categoryScrollRef.current?.scrollTo({ x: target, animated: true });
                    }}
                  >
                    <ChevronLeftSVG color={theme.accentLight} size={16} />
                  </BouncyButton>
                )}

                {Platform.OS === 'web' && categoryCanScrollRight && (
                  <BouncyButton
                    style={{
                      position: 'absolute', right: 0, top: 20, width: 38, height: 38,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(20,24,34,0.95)',
                      borderRadius: 19, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4
                    }}
                    onPress={() => {
                      const maxX = Math.max(0, categoryScrollContentWidthRef.current - categoryScrollContainerWidthRef.current);
                      const target = Math.min(maxX, categoryScrollXRef.current + (categoryScrollContainerWidthRef.current || 200) * 0.7);
                      categoryScrollRef.current?.scrollTo({ x: target, animated: true });
                    }}
                  >
                    <ChevronRightSVG color={theme.accentLight} size={16} />
                  </BouncyButton>
                )}
              </View>
        </View>
      )}

      <Animated.View style={[styles.mainViewContainer, { opacity: fadeAnim }]}>
        <ScrollView
          ref={mainScrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            Platform.OS !== 'web' && !isWebWide && { paddingTop: headerBottomY + 20 },
            Platform.OS !== 'web' && !isWebWide && bottomNav === 'forYou' && { paddingTop: headerBottomY + categoryBarHeight }
          ]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8B5CF6"
              colors={['#8B5CF6']}
              progressViewOffset={
                Platform.OS === 'android' && !isWebWide
                  ? headerBottomY + (bottomNav === 'forYou' ? categoryBarHeight : 0) + 10
                  : 0
              }
            />
          }
        >

          {/* TAB PAGE 1: FOR YOU Feed */}
          {bottomNav === 'forYou' && (
            <View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View>
                  <BouncyButton
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
                      paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99,
                      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface
                    }}
                    onPress={() => setForYouTypeFilterOpen((v) => !v)}
                  >
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
                      {forYouTypeFilter.size === PORTFOLIO_TYPE_OPTIONS.length
                        ? 'All Portfolios'
                        : forYouTypeFilter.size === 0
                          ? 'None Selected'
                          : PORTFOLIO_TYPE_OPTIONS.filter((t) => forYouTypeFilter.has(t.key)).map((t) => t.label).join(', ')}
                    </Text>
                    <ChevronDownSVG color={theme.textSecondary} size={13} />
                  </BouncyButton>

                {/* Dropdown panel - plain absolutely-positioned View rather
                    than a full Modal, since it only needs to sit below its
                    own trigger button and close on an outside tap, not
                    escape into its own top-level layer the way a real
                    modal would. */}
                {forYouTypeFilterOpen && (
                  <>
                    <TouchableOpacity
                      style={{ position: 'absolute', top: -1000, left: -1000, right: -1000, bottom: -1000, zIndex: 99 }}
                      activeOpacity={1}
                      onPress={() => setForYouTypeFilterOpen(false)}
                    />
                    <View style={{
                      position: 'absolute', top: 34, left: 0, width: 200, zIndex: 100,
                      backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border,
                      padding: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 12
                    }}>
                      <BouncyButton
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 10, borderRadius: 99 }}
                        onPress={() => {
                          setForYouTypeFilter((prev) =>
                            prev.size === PORTFOLIO_TYPE_OPTIONS.length
                              ? new Set()
                              : new Set(PORTFOLIO_TYPE_OPTIONS.map((t) => t.key))
                          );
                        }}
                      >
                        <View style={{
                          width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1.5, borderColor: forYouTypeFilter.size === PORTFOLIO_TYPE_OPTIONS.length ? theme.accent : theme.border,
                          backgroundColor: forYouTypeFilter.size === PORTFOLIO_TYPE_OPTIONS.length ? theme.accent : 'transparent'
                        }}>
                          {forYouTypeFilter.size === PORTFOLIO_TYPE_OPTIONS.length && <CheckIconSVG color="#FFFFFF" />}
                        </View>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>All Portfolios</Text>
                      </BouncyButton>

                      <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} />

                      {PORTFOLIO_TYPE_OPTIONS.map((type) => (
                        <BouncyButton
                          key={type.key}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 10, borderRadius: 99 }}
                          onPress={() => {
                            setForYouTypeFilter((prev) => {
                              const next = new Set(prev);
                              if (next.has(type.key)) next.delete(type.key);
                              else next.add(type.key);
                              return next;
                            });
                          }}
                        >
                          <View style={{
                            width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
                            borderWidth: 1.5, borderColor: forYouTypeFilter.has(type.key) ? theme.accent : theme.border,
                            backgroundColor: forYouTypeFilter.has(type.key) ? theme.accent : 'transparent'
                          }}>
                            {forYouTypeFilter.has(type.key) && <CheckIconSVG color="#FFFFFF" />}
                          </View>
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>{type.label}</Text>
                        </BouncyButton>
                      ))}
                    </View>
                  </>
                )}
              </View>

              {/* Simple binary flip, not a dropdown like the type filter -
                  tapping anywhere on it toggles between the two states
                  directly, no intermediate menu. */}
              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99,
                  borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface
                }}
                onPress={() => setForYouAiFilter((v) => !v)}
              >
                <View style={{
                  width: 16, height: 16, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: forYouAiFilter ? '#10B981' : '#EF4444'
                }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 7, fontWeight: '900' }}>AI</Text>
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                  {forYouAiFilter ? 'With AI' : 'No AI'}
                </Text>
              </BouncyButton>
              </View>

              <ProjectGrid
                items={forYouCategoryFilteredProjects}
                onPress={openProjectModal}
                onToggleLike={toggleLike}
                onOpenDesignerProfile={openDesignerProfileById}
                onToggleFollow={toggleFollowDesigner}
                followedDesigners={followedDesigners}
                currentUserId={session ? session.user.id : null}
                // For You specifically: mobile web stays single-column,
                // tablet/desktop web default to the shared 2-column grid.
                // Scoped to this one instance rather than changing
                // styles.grid/card themselves, since those are shared by
                // Profile, Designer Profile, and Liked Portfolios too -
                // this request was about For You only, those should keep
                // their existing 2-column-on-all-web-widths behavior.
                styles={Platform.OS === 'web' && !isWebWide
                  ? { ...styles, grid: { gap: 20 }, card: { ...styles.card, width: '100%' } }
                  : styles}
              />

              {loadingMore && (
                <View style={{ marginTop: 16, marginBottom: 24, alignSelf: 'center' }}>
                  <ActivityIndicator color="#8B5CF6" />
                </View>
              )}
            </View>
          )}

          {/* TAB PAGE 2: FOLLOWING Feed (Renamed from Followed) */}
          {bottomNav === 'followed' && (
            <View>
              <View style={styles.pageHeaderBox}>
                <Text style={[styles.pageHeaderTitle, isWebWide && { fontSize: 24 }]}>Your Circle</Text>
                <Text style={styles.pageHeaderSubtitle}>
                  {selectedFollowedDesigner
                    ? `Showing releases by ${(followedDesignersObjects.find((d) => d.id === selectedFollowedDesigner) || {}).name || 'this designer'}`
                    : `Latest portfolio releases from designers you follow (${followedDesigners.length}).`}
                </Text>
              </View>

              {followedDesignersObjects.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesBarScroll}>
                  {followedDesignersObjects.map((des) => {
                    const isSelected = selectedFollowedDesigner === des.id;
                    return (
                      <BouncyButton
                        key={des.id}
                        style={styles.storyCircleWrapper}
                        onPress={() => {
                          if (circleHasNewPost[des.id]) markCircleDesignerSeen(des.id);
                          if (selectedFollowedDesigner === des.id) {
                            setSelectedFollowedDesigner(null);
                          } else {
                            setSelectedFollowedDesigner(des.id);
                          }
                        }}
                      >
                        <View style={{ position: 'relative' }}>
                          <View style={[styles.storyRing, isSelected && styles.storyRingActive]}>
                            <Image source={{ uri: des.avatar }} style={styles.storyAvatar} />
                          </View>
                          {circleHasNewPost[des.id] && (
                            <View style={{
                              position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7,
                              backgroundColor: '#EF4444', borderWidth: 2, borderColor: theme.bg
                            }} />
                          )}
                        </View>
                        <Text style={[styles.storyNameText, isSelected && styles.storyNameTextActive]} numberOfLines={1}>
                          {des.name.split(' ')[0]}
                        </Text>
                      </BouncyButton>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={{ paddingHorizontal: 4, marginBottom: 4 }}>
                  <BouncyButton
                    style={styles.storyCircleWrapper}
                    onPress={() => {
                      handleNavChange('search');
                      setTimeout(() => {
                        Keyboard.dismiss();
                        if (discoverSectionY !== null) {
                          mainScrollViewRef.current?.scrollTo({ y: discoverSectionY, animated: true });
                        }
                      }, 300);
                    }}
                  >
                    <View style={[styles.storyRing, { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' }]}>
                      <Text style={{ color: theme.accent, fontSize: 24, fontWeight: '700', lineHeight: 26 }}>+</Text>
                    </View>
                    <Text style={styles.storyNameText} numberOfLines={1}>Discover</Text>
                  </BouncyButton>
                </View>
              )}

              {followedProjects.length > 0 ? (
                <ProjectGrid
                  items={followedProjects}
                  onPress={openProjectModal}
                  onToggleLike={toggleLike}
                  onOpenDesignerProfile={openDesignerProfileById}
                  onToggleFollow={toggleFollowDesigner}
                  followedDesigners={followedDesigners}
                  currentUserId={session ? session.user.id : null}
                styles={styles}
                />
              ) : (
                <View style={styles.emptyFollowedBox}>
                  <Text style={styles.emptyFollowedTitle}>
                    {selectedFollowedDesigner ? `No Releases from ${(followedDesignersObjects.find((d) => d.id === selectedFollowedDesigner) || {}).name || 'this designer'}` : 'No Posts from Following Designers'}
                  </Text>
                  <Text style={styles.emptyFollowedSub}>
                    {selectedFollowedDesigner
                      ? 'Tap their story circle again to clear filter and view all followed designers.'
                      : "You aren't following any designers with recent releases yet. Go to Search to discover and follow designers!"}
                  </Text>
                  <BouncyButton
                    style={styles.discoverDesignersBtn}
                    onPress={() => {
                      if (selectedFollowedDesigner) {
                        setSelectedFollowedDesigner(null);
                        return;
                      }
                      handleNavChange('search');
                      setTimeout(() => {
                        Keyboard.dismiss();
                        if (discoverSectionY !== null) {
                          mainScrollViewRef.current?.scrollTo({ y: discoverSectionY, animated: true });
                        }
                      }, 300);
                    }}
                  >
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.discoverBtnText}>
                        {selectedFollowedDesigner ? 'Clear Filter' : 'Discover Designers'}
                      </Text>
                      <ChevronRightSVG color="#FFFFFF" size={16} />
                    </View>
                  </BouncyButton>
                </View>
              )}
            </View>
          )}

          {/* TAB PAGE 3: SEARCH */}
          {bottomNav === 'search' && (
            <View>
              <View style={styles.inputWithClearRow}>
                <FocusableTextInput
                  style={[styles.searchInput, { flex: 1 }]}
                  placeholder="Search by project name, designer, or topic..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus={true}
                />
                {searchQuery.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} onPress={() => setSearchQuery('')}>
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>

              {searchQuery.trim() !== '' ? (
                <View>
                  <Text style={styles.sectionHeader}>TOP RESULT</Text>
                  {exactMatch ? (
                    exactMatch.type === 'designer' ? (
                      <BouncyButton
                        style={[styles.designerItemCard, { borderColor: '#8B5CF6', borderWidth: 1.5 }]}
                        onPress={() => openDesignerModal(exactMatch.item)}
                      >
                        <Image source={{ uri: exactMatch.item.avatar }} style={styles.designerListAvatar} />
                        <View style={styles.designerInfoCol}>
                          <Text style={styles.designerListName}>{exactMatch.item.name}</Text>
                          {exactMatch.item.handle ? (
                            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>{formatHandleDisplay(exactMatch.item.handle)}</Text>
                          ) : null}
                          <Text style={styles.designerListRole}>{exactMatch.item.role}</Text>
                        </View>
                        <ChevronRightSVG color="#8B5CF6" size={20} />
                      </BouncyButton>
                    ) : (
                      <ProjectGrid
                        items={[exactMatch.item]}
                        onPress={openProjectModal}
                        onToggleLike={toggleLike}
                        onOpenDesignerProfile={openDesignerProfileById}
                        onToggleFollow={toggleFollowDesigner}
                        followedDesigners={followedDesigners}
                        currentUserId={session ? session.user.id : null}
                      styles={styles}
                      />
                    )
                  ) : (
                    <Text style={styles.emptySearchText}>No exact match for "{searchQuery}".</Text>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 6 }}>
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'portfolios', label: 'Portfolios' },
                      { key: 'designers', label: 'Designers' }
                    ].map((tab) => (
                      <BouncyButton
                        key={tab.key}
                        style={[styles.topCategoryChip, searchFilterTab === tab.key && styles.topCategoryChipActive]}
                        onPress={() => setSearchFilterTab(tab.key)}
                      >
                        <Text style={[styles.topCategoryText, searchFilterTab === tab.key && styles.topCategoryTextActive]}>
                          {tab.label}
                        </Text>
                      </BouncyButton>
                    ))}
                  </View>

                  <Text style={[styles.sectionHeader, { marginTop: 12 }]}>YOU MIGHT ALSO LOOK FOR...</Text>

                  {(searchFilterTab === 'all' || searchFilterTab === 'portfolios') && relatedProjects.length > 0 && (
                    <ProjectGrid
                      items={relatedProjects}
                      onPress={openProjectModal}
                      onToggleLike={toggleLike}
                      onOpenDesignerProfile={openDesignerProfileById}
                      onToggleFollow={toggleFollowDesigner}
                      followedDesigners={followedDesigners}
                      currentUserId={session ? session.user.id : null}
                    styles={styles}
                    />
                  )}

                  {(searchFilterTab === 'all' || searchFilterTab === 'designers') && (
                    <View style={[styles.designersList, { marginTop: 20 }]}>
                      {relatedDesigners.map((des) => {
                        const isFollowing = followedDesigners.includes(des.id);
                        return (
                          <BouncyButton
                            key={des.id}
                            style={styles.designerItemCard}
                            onPress={() => openDesignerModal(des)}
                          >
                            <Image source={{ uri: des.avatar }} style={styles.designerListAvatar} />
                            <View style={styles.designerInfoCol}>
                              <Text style={styles.designerListName}>{des.name}</Text>
                              <Text style={styles.designerListRole}>{des.role}</Text>
                              <View style={styles.iconTextInlineRow}>
                                <LocationPinSVG />
                                <Text style={styles.designerListLoc}>{des.location}</Text>
                              </View>

                              {des.matchedViaTag && (
                                <Text style={{ color: '#64748B', fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>
                                  Shows up because they've published a portfolio tagged "{des.matchedViaTag}"
                                </Text>
                              )}

                              <View style={styles.designerCardActionsRow}>
                                <BouncyButton
                                  style={[styles.smallFollowBtn, isFollowing && styles.smallFollowBtnActive]}
                                  onPress={() => toggleFollowDesigner(des.id)}
                                >
                                  <Text style={[styles.smallFollowText, isFollowing && styles.smallFollowTextActive]}>
                                    {isFollowing ? 'Following' : (des.followsMe ? 'Follow Back' : '+ Follow')}
                                  </Text>
                                </BouncyButton>

                                <BouncyButton
                                  style={styles.smallShareBtnIconOnly}
                                  onPress={() => handleShareDesigner(des)}
                                >
                                  <ShareIconSVG color={themeMode === 'light' ? '#6D28D9' : '#D8B4FE'} />
                                </BouncyButton>
                              </View>
                            </View>
                            <ChevronRightSVG color="#8B5CF6" size={20} />
                          </BouncyButton>
                        );
                      })}
                    </View>
                  )}

                  {relatedProjects.length === 0 && relatedDesigners.length === 0 && (
                    <Text style={styles.emptySearchText}>No related results found.</Text>
                  )}
                </View>
              ) : (
                <View>
                  <Text style={styles.sectionHeader}>POPULAR KEYWORDS</Text>
                  {popularKeywords.length > 0 ? (
                    <View style={styles.keywordsRow}>
                      {popularKeywords.map((kw) => (
                        <BouncyButton
                          key={kw}
                          style={styles.keywordChip}
                          onPress={() => setSearchQuery(kw)}
                        >
                          <View style={styles.iconTextInlineRow}>
                            <SearchChipSVG />
                            <Text style={styles.keywordText}>{kw}</Text>
                          </View>
                        </BouncyButton>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptySearchText}>No popular tags yet — be the first to publish!</Text>
                  )}

                  <Text
                    style={[styles.sectionHeader, { marginTop: 28 }]}
                    onLayout={(e) => setDiscoverSectionY(e.nativeEvent.layout.y)}
                  >
                    DISCOVER DESIGNERS ({searchedDesigners.length})
                  </Text>
                  <View style={[styles.designersList, isWebWide && { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }]}>
                    {searchedDesigners.slice(0, discoverDesignersLimit).map((des) => {
                      const isFollowing = followedDesigners.includes(des.id);
                      return (
                        <BouncyButton
                          key={des.id}
                          style={[styles.designerItemCard, isWebWide && { width: '48%' }]}
                          onPress={() => openDesignerModal(des)}
                        >
                          <Image source={{ uri: des.avatar }} style={styles.designerListAvatar} />
                          <View style={styles.designerInfoCol}>
                            <Text style={styles.designerListName}>{des.name}</Text>
                            <Text style={styles.designerListRole}>{des.role}</Text>
                            <View style={styles.iconTextInlineRow}>
                              <LocationPinSVG />
                              <Text style={styles.designerListLoc}>{des.location}</Text>
                            </View>

                            <View style={styles.designerCardActionsRow}>
                              <BouncyButton
                                style={[styles.smallFollowBtn, isFollowing && styles.smallFollowBtnActive]}
                                onPress={() => toggleFollowDesigner(des.id)}
                              >
                                <Text style={[styles.smallFollowText, isFollowing && styles.smallFollowTextActive]}>
                                  {isFollowing ? 'Following' : (des.followsMe ? 'Follow Back' : '+ Follow')}
                                </Text>
                              </BouncyButton>

                              <BouncyButton
                                style={styles.smallShareBtnIconOnly}
                                onPress={() => handleShareDesigner(des)}
                              >
                                <ShareIconSVG color={themeMode === 'light' ? '#6D28D9' : '#D8B4FE'} />
                              </BouncyButton>

                              <View ref={(el) => { discoverDotsRefsMap[des.id] = el; }} style={{ zIndex: 100 }}>
                                <BouncyButton
                                  style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                                  onPress={() => {
                                    const next = discoverDotsMenuOpenId === des.id ? null : des.id;
                                    if (next && discoverDotsRefsMap[des.id]) {
                                      discoverDotsRefsMap[des.id].measureInWindow((x, y, width, height) => {
                                        const screenWidth = Platform.OS === 'web' ? window.innerWidth : Dimensions.get('window').width;
                                        setDiscoverDotsMenuPos({ top: y + height + 8, right: Math.max(8, screenWidth - (x + width)) });
                                      });
                                    }
                                    setDiscoverDotsMenuOpenId(next);
                                  }}
                                >
                                  <Text style={{ color: theme.accentLight, fontSize: 20, fontWeight: '900', lineHeight: 20 }}>⋮</Text>
                                </BouncyButton>

                                <Modal
                                  transparent
                                  visible={discoverDotsMenuOpenId === des.id}
                                  animationType="none"
                                  onRequestClose={() => setDiscoverDotsMenuOpenId(null)}
                                >
                                  <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                                    <TouchableOpacity
                                      style={{ flex: 1 }}
                                      activeOpacity={1}
                                      onPress={() => setDiscoverDotsMenuOpenId(null)}
                                    />
                                    <View style={{
                                      position: 'absolute', top: discoverDotsMenuPos.top, right: discoverDotsMenuPos.right, width: 220,
                                      backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border,
                                      padding: 6,
                                      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 12
                                    }}>
                                      <BouncyButton
                                        style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                                        onPress={() => {
                                          setDiscoverDotsMenuOpenId(null);
                                          handleReportContent('user', des.id, des.name);
                                        }}
                                      >
                                        <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>Report Profile</Text>
                                      </BouncyButton>
                                      <BouncyButton
                                        style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                                        onPress={() => {
                                          setDiscoverDotsMenuOpenId(null);
                                          mutedIds.has(des.id)
                                            ? handleUnmuteDesigner(des.id, des.name)
                                            : handleMuteDesigner(des.id, des.name);
                                        }}
                                      >
                                        <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>
                                          {mutedIds.has(des.id) ? 'Unmute Posts' : 'Mute Posts'}
                                        </Text>
                                      </BouncyButton>
                                      <BouncyButton
                                        style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                                        onPress={() => {
                                          setDiscoverDotsMenuOpenId(null);
                                          handleBlockUser(des.id, des.name);
                                        }}
                                      >
                                        <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Block User</Text>
                                      </BouncyButton>
                                    </View>
                                  </View>
                                </Modal>
                              </View>
                            </View>
                          </View>
                        </BouncyButton>
                      );
                    })}
                  </View>

                  {discoverDesignersLimit < searchedDesigners.length && (
                    <BouncyButton
                      style={{ marginTop: 14, marginBottom: 10, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24, backgroundColor: theme.surface, borderRadius: 99, borderWidth: 1, borderColor: theme.border }}
                      onPress={() => setDiscoverDesignersLimit((prev) => prev + DISCOVER_PAGE_SIZE)}
                    >
                      <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Show More</Text>
                    </BouncyButton>
                  )}
                </View>
              )}
            </View>
          )}

          {/* TAB PAGE 4: PROFILE */}
          {bottomNav === 'profile' && (
            !session ? (
              <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <ProfileSVG active={false} />
                </View>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', marginBottom: 6, textAlign: 'center' }}>
                  Sign in to view your profile
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 19 }}>
                  Create an account to build your portfolio, follow designers, and track your activity.
                </Text>
                <BouncyButton
                  style={{ backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 99 }}
                  onPress={() => setGuestAuthPromptVisible(true)}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Sign In / Register</Text>
                </BouncyButton>
              </View>
            ) : (
            <View>
              <View style={styles.profileCard}>
                <BouncyButton
                  style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                  onPress={() => handleShareDesigner({ id: session.user.id, name: userProfile.name, handle: userProfile.handle })}
                >
                  <ShareIconSVG color={themeMode === 'light' ? '#6D28D9' : '#D8B4FE'} />
                </BouncyButton>

                <BouncyButton activeOpacity={0.9} onPress={() => setLightboxImageUri(userProfile.avatar)}>
                  <Image
                    source={{ uri: userProfile.avatar }}
                    style={styles.profileLargeAvatar}
                  />
                </BouncyButton>
                <Text style={[styles.profileName, isWebWide && { fontSize: 24 }]}>{userProfile.name}</Text>
                {userProfile.handle ? (
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600', marginBottom: 2 }}>{formatHandleDisplay(userProfile.handle)}</Text>
                ) : null}
                <Text style={styles.profileRole}>{userProfile.role}</Text>
                
                <View style={[styles.iconTextInlineRow, { marginBottom: 8 }]}>
                  <LocationPinSVG />
                  <Text style={styles.profileLocText}>{userProfile.location}</Text>
                </View>

                <Text style={styles.profileBio}>{userProfile.bio}</Text>

                <View style={styles.statsRow}>
                  <BouncyButton
                    style={styles.statItem}
                    onPress={() => openFollowersModal({ id: session ? session.user.id : null, name: userProfile.name })}
                  >
                    <Text style={styles.statNum}>{myFollowStats.followersCount}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </BouncyButton>

                  <View style={styles.statDivider} />

                  <BouncyButton
                    style={styles.statItem}
                    onPress={() => openFollowingModal({ id: session ? session.user.id : null, name: userProfile.name })}
                  >
                    <Text style={styles.statNum}>{myFollowStats.followingCount}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </BouncyButton>
                </View>

                {myWeeklyViews !== null && (
                  <View style={[styles.iconTextInlineRow, { marginBottom: 8 }]}>
                    <EyeViewIconSVG size={14} color={theme.textSecondary} />
                    <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
                      {myWeeklyViews} view{myWeeklyViews === 1 ? '' : 's'} this week
                    </Text>
                  </View>
                )}

                {userProfile.links && userProfile.links.length > 0 && (
                  <View style={styles.socialCircularLinksRow}>
                    {userProfile.links.map((linkUrl, idx) => (
                      <BouncyButton
                        key={idx}
                        style={styles.socialCircleBtn}
                        onPress={() => openExternalLinkWithWarning(linkUrl)}
                        onLongPress={() => setLinkPreview({
                          url: linkUrl,
                          name: getFriendlyLinkName(linkUrl),
                          ownerId: session ? session.user.id : null,
                          ownerLabel: userProfile.name
                        })}
                        delayLongPress={350}
                      >
                        {getSocialLogoSVG(linkUrl)}
                      </BouncyButton>
                    ))}
                  </View>
                )}
              </View>

              <View
                style={[styles.profileTabsBar, { position: 'relative' }]}
                onLayout={(e) => setProfileTabBarWidth(e.nativeEvent.layout.width)}
              >
                {profileTabBarWidth > 0 && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      top: 4, bottom: 4, left: 4,
                      width: (profileTabBarWidth - 12) / 2,
                      borderRadius: 99,
                      backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
                      transform: [{
                        translateX: profileTabSlideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, (profileTabBarWidth - 12) / 2 + 4]
                        })
                      }]
                    }}
                  />
                )}
                <BouncyButton
                  style={styles.profileTabBtn}
                  onPress={() => switchProfileTab('myWork')}
                >
                  <Text style={[styles.profileTabBtnText, profileTab === 'myWork' && styles.profileTabBtnTextActive]}>
                    My Portfolios ({myUploadedProjects.length})
                  </Text>
                </BouncyButton>

                <BouncyButton
                  style={styles.profileTabBtn}
                  onPress={() => switchProfileTab('likedWork')}
                >
                  <Text style={[styles.profileTabBtnText, profileTab === 'likedWork' && styles.profileTabBtnTextActive]}>
                    Liked Portfolios ({myLikedProjects.length})
                  </Text>
                </BouncyButton>
              </View>

              {profileTab === 'myWork' && (
                <BouncyButton
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginBottom: 10 }}
                  onPress={() => setPortfolioLayoutMode(portfolioLayoutMode === 'compact' ? 'full' : 'compact')}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    {portfolioLayoutMode === 'compact' ? 'Compact View' : 'Full Width View'}
                  </Text>
                  <LayoutToggleSVG mode={portfolioLayoutMode} size={15} />
                </BouncyButton>
              )}

              <Animated.View style={{ opacity: profileTabContentAnim }}>
                {profileTab === 'likedWork' || (profileTab === 'myWork' && portfolioLayoutMode === 'full') ? (
                  <ProjectGrid
                    items={profileTab === 'myWork' ? myUploadedProjects : myLikedProjects}
                    onPress={openProjectModal}
                    onToggleLike={toggleLike}
                    onOpenDesignerProfile={openDesignerProfileById}
                    onToggleFollow={toggleFollowDesigner}
                    followedDesigners={followedDesigners}
                    currentUserId={session ? session.user.id : null}
                    showPinControl={profileTab === 'myWork'}
                    onTogglePin={togglePinProject}
                  styles={styles}
                  />
                ) : (
                  <TwoRowHorizontalGrid
                    items={profileTab === 'myWork' ? myUploadedProjects : myLikedProjects}
                    onPress={openProjectModal}
                    onToggleLike={toggleLike}
                    onOpenDesignerProfile={openDesignerProfileById}
                    onToggleFollow={toggleFollowDesigner}
                    followedDesigners={followedDesigners}
                    currentUserId={session ? session.user.id : null}
                    showPinControl={profileTab === 'myWork'}
                    onTogglePin={togglePinProject}
                  styles={styles}
                  />
                )}
              </Animated.View>
            </View>
            )
          )}

        </ScrollView>
      </Animated.View>

      {/* STICKY BACK TO TOP FLOATING BUTTON */}
      {showBackToTop && (
        <BouncyButton
          style={[styles.stickyBackToTopBtn, Platform.OS !== 'web' && { backgroundColor: 'transparent', overflow: 'hidden' }]}
          activeOpacity={0.85}
          onPress={scrollToTop}
        >
          {Platform.OS !== 'web' && (
            lightweightMode ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#8B5CF6' }} />
            ) : (notificationPopupRendered || settingsPopupRendered) ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(139, 92, 246, 0.75)' }} />
            ) : (
              <>
                <BlurView
                  intensity={45}
                  tint={themeMode === 'light' ? 'light' : 'dark'}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(139, 92, 246, 0.55)' }} />
              </>
            )
          )}
          <ChevronUpSVG />
        </BouncyButton>
      )}

      {/* FLOATING ROUNDED RECTANGLE BOTTOM MENU BAR WITH FOLLOWING LABEL
          Native only - web uses the hamburger drawer instead (see below). */}
      {Platform.OS !== 'web' && (
      <View style={[styles.floatingBottomBar, { overflow: 'hidden', backgroundColor: 'transparent' }]}>
        {/* Translucent bar: BlurView is GPU-composited (not per-frame JS
            work) so it's cheap as long as it's not stacked/re-rendered
            constantly - this is the "go with the cheapest option" pick.
            Falls back to a flat semi-transparent tint in Lightweight Mode,
            same fallback pattern already used for the notification/settings
            dropdown backdrops elsewhere in this file.

            Also falls back to flat whenever the notification/settings
            dropdown backdrop is open: that backdrop is itself a full-screen
            BlurView reaching all the way to the bottom of the screen (see
            notificationPopupRendered/settingsPopupRendered below), which
            would otherwise sit directly on top of this bar's own blur -
            two GPU-composited blur layers stacked on the same pixels. That
            actually happens (not just a theoretical case), so this bar
            drops its own blur for as long as either of those is rendered,
            leaving only the flat backdrop tint at the effective blur point. */}
        {lightweightMode ? (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: theme.surface
          }} />
        ) : (notificationPopupRendered || settingsPopupRendered) ? (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: themeMode === 'light' ? 'rgba(255, 255, 255, 0.82)' : 'rgba(17, 21, 31, 0.82)'
          }} />
        ) : (
          <BlurView
            intensity={45}
            tint={themeMode === 'light' ? 'light' : 'dark'}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        )}
        <TouchableOpacity style={styles.uniformTabItem} onPress={() => handleNavChange('forYou')}>
          <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ transform: [{ scale: tabScaleAnims.forYou }] }}>
              <ForYouSVG active={bottomNav === 'forYou'} />
            </Animated.View>
            {[
              { top: -4, left: -4 },
              { top: -6, right: -2 },
              { bottom: -3, right: -5 }
            ].map((pos, i) => (
              <Animated.Text
                key={i}
                style={{
                  position: 'absolute', ...pos, fontSize: 9, color: '#C084FC',
                  opacity: forYouSparkleAnim.interpolate({
                    inputRange: [0, 0.15 + i * 0.15, 0.5 + i * 0.15, 1],
                    outputRange: [0, 1, 1, 0]
                  }),
                  transform: [{
                    scale: forYouSparkleAnim.interpolate({
                      inputRange: [0, 0.15 + i * 0.15, 1],
                      outputRange: [0.3, 1, 0.3]
                    })
                  }]
                }}
              >
                ✦
              </Animated.Text>
            ))}
          </View>
          <Text style={[styles.menuLabel, bottomNav === 'forYou' && styles.menuLabelActive]}>For You</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uniformTabItem} onPress={() => handleNavChange('followed')}>
          <Animated.View style={{
            transform: [
              { scale: tabScaleAnims.followed },
              {
                rotate: followedContinuousSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
              }
            ]
          }}>
            <FollowedTabSVG active={bottomNav === 'followed'} />
          </Animated.View>
          <Text style={[styles.menuLabel, bottomNav === 'followed' && styles.menuLabelActive]}>Circle</Text>
        </TouchableOpacity>

        <TouchableOpacity
          ref={nativePlusBtnRef}
          style={[styles.plusContainerBtn, { backgroundColor: 'transparent', shadowColor: 'transparent', elevation: 0 }]}
          activeOpacity={0.85}
          onPress={handleOpenAddPortfolio}
        >
          <View style={{ position: 'absolute', top: 0, left: 0 }}>
            <DShapeSVG size={44} color="#8B5CF6" />
          </View>
          <Animated.View style={{ transform: [{ scale: tabScaleAnims.plus }] }}>
            <PlusSVG strokeWidth={5} offsetX={-1} />
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uniformTabItem} onPress={() => handleNavChange('search')}>
          <Animated.View style={{ transform: [{ scale: tabScaleAnims.search }] }}>
            <SearchSVG active={bottomNav === 'search'} eyesAnim={searchEyesAnim} />
          </Animated.View>
          <Text style={[styles.menuLabel, bottomNav === 'search' && styles.menuLabelActive]}>Search</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uniformTabItem} onPress={() => handleNavChange('profile')}>
          <Animated.View style={{ transform: [{ scale: tabScaleAnims.profile }] }}>
            <ProfileNavIcon active={bottomNav === 'profile'} drawAnim={profileDrawAnim} avatarUrl={session ? userProfile.avatar : null} themeMode={themeMode} />
          </Animated.View>
          <Text style={[styles.menuLabel, bottomNav === 'profile' && styles.menuLabelActive]}>Profile</Text>
        </TouchableOpacity>
      </View>
      )}

      {/* WEB-ONLY HAMBURGER NAV DRAWER - replaces the floating bottom bar
          above on web. Always mounted (not conditionally rendered on
          hamburgerMenuVisible) so the close slide-out animation can play;
          the backdrop's pointerEvents is toggled instead so it doesn't
          block taps elsewhere while closed. */}
      {Platform.OS === 'web' && !isWebWide && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 30 }}>
          <Animated.View
            pointerEvents={hamburgerMenuVisible ? 'auto' : 'none'}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(11, 15, 23, 0.6)',
              opacity: hamburgerBackdropOpacity
            }}
            onStartShouldSetResponder={() => hamburgerMenuVisible}
            onResponderRelease={() => setHamburgerMenuVisible(false)}
          />
          <Animated.View
            style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: HAMBURGER_DRAWER_WIDTH,
              backgroundColor: theme.bg,
              borderRightWidth: 1, borderRightColor: theme.border,
              transform: [{ translateX: hamburgerSlideAnim }],
              shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 20
            }}
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <SafeAreaView style={{ flex: 1, paddingTop: 8 }}>
              {/* Add Portfolio - pinned at the very top of the drawer per request */}
              <BouncyButton
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  marginHorizontal: 16, marginBottom: 16, paddingVertical: 10, paddingHorizontal: 12,
                  borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface
                }}
                onPress={() => {
                  setHamburgerMenuVisible(false);
                  handleOpenAddPortfolio();
                }}
              >
                <View style={[styles.plusContainerBtn, { width: 38, height: 38, borderRadius: 12, marginHorizontal: 0, backgroundColor: 'transparent', shadowColor: 'transparent', elevation: 0 }]}>
                  <View style={{ position: 'absolute', top: 0, left: 0 }}>
                    <DShapeSVG size={38} color="#8B5CF6" />
                  </View>
                  <View style={{ transform: [{ scale: 0.82 }] }}><PlusSVG strokeWidth={5} offsetX={-1} /></View>
                </View>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Add Portfolio</Text>
              </BouncyButton>

              <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 16, marginBottom: 8 }} />

              {[
                { key: 'forYou', label: 'For You', Icon: ForYouSVG, extraProps: {} },
                { key: 'followed', label: 'Circle', Icon: FollowedTabSVG, extraProps: {} },
                { key: 'search', label: 'Search', Icon: SearchSVG, extraProps: {} },
                { key: 'profile', label: 'Profile', Icon: ProfileNavIcon, extraProps: { avatarUrl: session ? userProfile.avatar : null, themeMode } }
              ].map(({ key, label, Icon, extraProps }) => {
                const active = bottomNav === key;
                return (
                  <BouncyButton
                    key={key}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 14,
                      paddingVertical: 12, paddingHorizontal: 16
                    }}
                    onPress={() => {
                      setHamburgerMenuVisible(false);
                      handleNavChange(key);
                    }}
                  >
                    <View style={{ transform: [{ scale: 0.85 }] }}>
                      <Icon active={active} {...extraProps} />
                    </View>
                    <Text style={{ color: active ? '#8B5CF6' : theme.text, fontSize: 13, fontWeight: active ? '700' : '600' }}>
                      {label}
                    </Text>
                  </BouncyButton>
                );
              })}
            </SafeAreaView>
          </Animated.View>
        </View>
      )}

      {/* EXTERNAL LINK LEAVING WARNING CONFIRMATION MODAL */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={externalLinkModalVisible}
        onRequestClose={() => setExternalLinkModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }, Platform.OS === 'web' && { zIndex: 99999 }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setExternalLinkModalVisible(false)}
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
          <View style={styles.customConfirmCard}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={styles.confirmIconCircle}>
              <WarningTriangleSVG />
            </View>
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Leaving DECENT</Text>
            <Text style={styles.confirmSubText}>
              {isTrustedExternalLink
                ? (targetExternalUrl === GITHUB_URL
                    ? "You'll be directed to the DECENT source code on GitHub."
                    : "You'll be directed to my Ko-fi page to leave a tip.")
                : 'You are about to open an external website:'}
            </Text>

            <View style={styles.linkUrlBox}>
              <Text style={styles.linkUrlText} numberOfLines={2}>{targetExternalUrl}</Text>
            </View>

            <View style={styles.confirmActionsRow}>
              <BouncyButton
                style={styles.confirmCancelBtn}
                onPress={() => setExternalLinkModalVisible(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </BouncyButton>

              <BouncyButton
                style={styles.confirmDeleteBtn}
                onPress={confirmProceedToExternalLink}
              >
                <View style={styles.iconTextInlineRow}>
                  <Text style={styles.confirmDeleteText}>Continue</Text>
                  <ChevronRightSVG color="#FFFFFF" size={16} />
                </View>
              </BouncyButton>
            </View>

            {!isTrustedExternalLink && (
              <BouncyButton style={{ marginTop: 14, alignItems: 'center' }} onPress={handleReportExternalLink}>
                <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '700' }}>Report this link as suspicious</Text>
              </BouncyButton>
            )}
          </View>
        </View>
      </Modal>

      {/* NOTIFICATIONS DROPDOWN - anchored under the bell icon, blurs content below header only */}
      {notificationPopupRendered && (
        <View pointerEvents="box-none" style={{ position: Platform.OS === 'web' ? 'fixed' : 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: isWebWide ? 0 : Math.max(notifDropdownPos.top - 8, 0), left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setNotificationModalVisible(false)}
          >
            {/* On tablet/desktop web the full mobile dim/blur covered the
                sidebar and rest of the wide layout too, which read as too
                heavy for what's really just a small corner menu - so it's
                swapped for a much lighter flat dim there instead of the full
                blur/rgba(...0.75) treatment. No blur (expensive over a wide
                layout, and not needed at this low an opacity anyway). The
                TouchableOpacity above still covers the full screen either
                way, so click-outside-to-close is unaffected. */}
            {isWebWide ? (
              <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.12)', opacity: notificationPopupAnim }} />
            ) : (
              <Animated.View style={{ flex: 1, opacity: notificationPopupAnim }}>
                {lightweightMode ? (
                  <View style={{ flex: 1, backgroundColor: themeMode === 'light' ? 'rgba(244, 242, 250, 0.6)' : 'rgba(11, 15, 23, 0.75)' }} />
                ) : (
                  <BlurView
                    intensity={65}
                    tint={themeMode === 'light' ? 'light' : 'dark'}
                    style={{ flex: 1 }}
                  />
                )}
              </Animated.View>
            )}
          </TouchableOpacity>

          <Animated.View
            style={{
              position: Platform.OS === 'web' ? 'fixed' : 'absolute',
              top: notifDropdownPos.top,
              left: notifDropdownPos.left,
              right: notifDropdownPos.right,
              ...(notifDropdownPos.width ? { width: notifDropdownPos.width } : {}),
              ...(notificationsList.length > 5
                ? { bottom: 16 }
                : { maxHeight: 420 }),
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              shadowColor: '#8B5CF6',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 12,
              overflow: 'hidden',
              opacity: notificationPopupAnim,
              transform: [
                { scale: notificationPopupAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                { translateY: notificationPopupAnim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }
              ]
            }}
          >
            <View style={[styles.modalTopBar, { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>Notifications</Text>
              <BouncyButton
                style={{
                  paddingVertical: 6, paddingHorizontal: 14, borderRadius: 99,
                  borderWidth: 1, borderColor: '#8B5CF6', minWidth: 66, alignItems: 'center'
                }}
                onPress={handleClearAllNotifications}
                disabled={notificationsList.length === 0}
              >
                <Animated.View style={{ transform: [{ scale: clearBtnAnim }] }}>
                  {notificationsJustCleared ? (
                    <CheckIconSVG />
                  ) : (
                    <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700' }}>Clear</Text>
                  )}
                </Animated.View>
              </BouncyButton>
            </View>

            {notificationsList.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>No notifications</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
                {notificationsList.map((notif) => {
                  const isFollowingUser = followedDesigners.includes(notif.actorId);
                  return (
                    <SwipeToDismiss key={notif.id} onDismiss={() => dismissNotification(notif.id)}>
                      <View style={styles.notificationCard}>
                        <BouncyButton
                          onPress={() => {
                            setNotificationModalVisible(false);
                            openDesignerProfileById(notif.actorId);
                          }}
                        >
                          <Image source={{ uri: notif.avatar }} style={styles.notifAvatar} />
                        </BouncyButton>
                        <BouncyButton
                          style={{ flex: 1, marginRight: 6 }}
                          onPress={() => {
                            setNotificationModalVisible(false);
                            if (notif.type === 'like' && notif.portfolioId) {
                              openPortfolioById(notif.portfolioId);
                            } else if (notif.type === 'follow') {
                              openDesignerProfileById(notif.actorId);
                            }
                          }}
                        >
                          <Text style={styles.notifText}>
                            <Text style={styles.notifUserBold}>{notif.user}</Text> {notif.action}{' '}
                            {notif.target ? <Text style={styles.notifTargetBold}>"{notif.target}"</Text> : null}
                          </Text>
                          <Text style={styles.notifTimeText}>{notif.time}</Text>
                        </BouncyButton>

                        {notif.type === 'follow' ? (
                          <BouncyButton
                            style={[styles.notifFollowBackBtn, isFollowingUser && styles.notifFollowBackBtnActive]}
                            onPress={() => toggleFollowDesigner(notif.actorId)}
                          >
                            <Text style={[styles.notifFollowBackText, isFollowingUser && styles.notifFollowBackTextActive]}>
                              {isFollowingUser ? 'Following' : 'Follow Back'}
                            </Text>
                          </BouncyButton>
                        ) : (
                          <View style={styles.notifTypeIconBox}>
                            <HeartIconSVG liked={true} />
                          </View>
                        )}
                      </View>
                    </SwipeToDismiss>
                  );
                })}
              </ScrollView>
            )}

            <BouncyButton
              style={{ paddingVertical: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.border }}
              onPress={() => {
                setNotificationModalVisible(false);
                fetchNotificationHistory(true);
                setOptionsView('notificationHistory');
                setSettingsModalVisible(true);
              }}
            >
              <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>Notification History</Text>
            </BouncyButton>
          </Animated.View>
        </View>
      )}

      {/* IMAGE LIGHTBOX - tap-to-enlarge for portfolio images */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={!!lightboxImageUri}
        onRequestClose={() => setLightboxImageUri(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={1}
          onPress={() => setLightboxImageUri(null)}
        >
          {lightboxImageUri && (
            <Image
              source={{ uri: lightboxImageUri }}
              style={{ width: '100%', height: '80%' }}
              resizeMode="contain"
            />
          )}
          <BouncyButton
            style={{ position: 'absolute', top: 50, right: 20, width: 40, height: 40, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setLightboxImageUri(null)}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>✕</Text>
          </BouncyButton>
        </TouchableOpacity>
      </Modal>

      {/* LINK PREVIEW - press-and-hold on a profile link button */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={!!linkPreview}
        onRequestClose={() => setLinkPreview(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(11, 15, 23, 0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 }}
          activeOpacity={1}
          onPress={() => setLinkPreview(null)}
        >
          {linkPreview && (
            <View style={{
              backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border,
              padding: 20, width: '100%', maxWidth: 320, alignItems: 'center'
            }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                {getSocialLogoSVG(linkPreview.url)}
              </View>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 4 }}>{linkPreview.name}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 16, textAlign: 'center' }} numberOfLines={2}>
                {linkPreview.url}
              </Text>
              <BouncyButton
                style={[styles.saveAccountSettingsBtn, { width: '100%', marginTop: 0 }]}
                onPress={() => {
                  const url = linkPreview.url;
                  setLinkPreview(null);
                  openExternalLinkWithWarning(url);
                }}
              >
                <Text style={styles.submitBtnText}>Open Link</Text>
              </BouncyButton>
              <BouncyButton
                style={{ width: '100%', alignItems: 'center', marginTop: 12 }}
                onPress={() => {
                  const { url, name, ownerId, ownerLabel } = linkPreview;
                  setLinkPreview(null);
                  handleReportContent('link', ownerId, `${ownerLabel}'s ${name} link`, url);
                }}
              >
                <Text style={{ color: '#F87171', fontSize: 13, fontWeight: '700' }}>Report Link</Text>
              </BouncyButton>
            </View>
          )}
        </TouchableOpacity>
      </Modal>


      {/* DELETE PORTFOLIO CONFIRMATION MODAL - was previously missing */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={deleteConfirmModalVisible}
        onRequestClose={() => setDeleteConfirmModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setDeleteConfirmModalVisible(false)}
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
          <View style={styles.customConfirmCard}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
              <TrashIconSVG />
            </View>
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Delete Portfolio?</Text>
            <Text style={styles.confirmSubText}>
              {projectToDelete ? `"${projectToDelete.title}" will be permanently deleted. This can't be undone.` : "This can't be undone."}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => {
                  setDeleteConfirmModalVisible(false);
                  setProjectToDelete(null);
                }}
              >
                <Text style={[styles.confirmDeleteText, { color: theme.text }]}>Cancel</Text>
              </BouncyButton>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                onPress={confirmDeletePortfolio}
              >
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </BouncyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ACCOUNT SETTINGS SAVE SUCCESS CUSTOM POP-UP - rebuilt with explicit styles */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={accountSaveSuccessModalVisible}
        onRequestClose={handleCloseAccountSaveSuccess}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(11,15,23,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 20, borderWidth: 1, borderColor: theme.border, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <CheckIconSVG />
            </View>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 6, textAlign: 'center' }}>Settings Saved</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 18, lineHeight: 19 }}>
              Your account profile, location, and preferences have been updated successfully!
            </Text>
            <BouncyButton
              style={{ backgroundColor: '#8B5CF6', borderRadius: 99, paddingVertical: 14, width: '100%', alignItems: 'center' }}
              onPress={handleCloseAccountSaveSuccess}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>Continue</Text>
            </BouncyButton>
          </View>
        </View>
      </Modal>

      {/* ACCOUNT SETTINGS EDIT MODAL WITH LOCATION FIELD */}
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
                <BouncyButton style={{ padding: 4 }} onPress={handleCloseAccountSettings}>
                  <ChevronLeftSVG color={themeMode === 'light' ? '#6D28D9' : '#F8FAFC'} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>Account Settings</Text>
              <BouncyButton
                style={styles.closeBtn}
                onPress={() => {
                  if (hasUnsavedAccountChanges()) {
                    setAccountSettingsDiscardWarningVisible(true);
                  } else {
                    setAccountSettingsModalVisible(false);
                    setSettingsModalVisible(false);
                  }
                }}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            <AppKeyboardAwareScrollView
              contentContainerStyle={styles.accountSettingsScrollContent}
              enableOnAndroid={true}
              extraScrollHeight={140}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.formGroupLabel}>Profile Picture</Text>
              <BouncyButton style={styles.avatarEditPickerBtn} activeOpacity={0.85} onPress={pickAvatarImage}>
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
                  placeholderTextColor="#94A3B8"
                />
                {editName.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} onPress={() => setEditName('')}>
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>

              <Text style={styles.formGroupLabel}>Unique ID / Handle</Text>
              <View style={[styles.inputWithClearRow, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingLeft: 14 }]}>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>@</Text>
                <FocusableTextInput
                  style={[styles.formInput, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
                  value={editHandle}
                  onChangeText={(t) => setEditHandle(t.replace(/[^A-Za-z0-9._-]/g, ''))}
                  placeholder="Enter your username here"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  maxLength={20}
                />
                {editHandle.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} onPress={() => setEditHandle('')}>
                    <ClearTextXSVG />
                  </BouncyButton>
                )}
              </View>
              <Text style={{ color: '#64748B', fontSize: 11, marginTop: -6, marginBottom: 4 }}>
                3-20 characters, letters, numbers, dots, underscores, and dashes only. Can only be changed once every 30 days.
              </Text>
              {editHandle.trim() !== (userProfile.handle || '') && (
                <>
                  {handleStatus === 'checking' && <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 6 }}>Checking availability...</Text>}
                  {handleStatus === 'available' && <Text style={{ color: '#4ADE80', fontSize: 12, marginBottom: 6 }}>✓ Available</Text>}
                  {handleStatus === 'taken' && <Text style={{ color: '#F87171', fontSize: 12, marginBottom: 6 }}>This handle is already taken</Text>}
                  {handleStatus === 'invalid' && <Text style={{ color: '#F87171', fontSize: 12, marginBottom: 6 }}>3-20 chars: letters, numbers, . _ -</Text>}
                  {handleChangedAt && (Date.now() - new Date(handleChangedAt).getTime()) / 86400000 < 30 && (
                    <Text style={{ color: '#FBBF24', fontSize: 12, marginBottom: 6 }}>
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
                  placeholderTextColor="#94A3B8"
                />
                {editRole.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} onPress={() => setEditRole('')}>
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
                  placeholderTextColor="#94A3B8"
                />
                {editLocation.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} onPress={() => setEditLocation('')}>
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
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.formGroupLabel}>Email Address</Text>
              <View style={styles.inputWithClearRow}>
                <FocusableTextInput
                  style={[styles.formInput, { flex: 1 }]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Email Address"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoComplete="email"
                  importantForAutofill="yes"
                  textContentType="emailAddress"
                />
                {editEmail.length > 0 && (
                  <BouncyButton style={styles.clearFieldBtn} onPress={() => setEditEmail('')}>
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
                      position: 'absolute', left: 0, right: 0, top: 0, height: 3, borderRadius: 2,
                      backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
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
                    <View {...dragResponder.panHandlers} style={{ padding: 6 }}>
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
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                    />
                    {lnk.length > 0 && (
                      <BouncyButton style={styles.clearFieldBtn} onPress={() => handleLinkTextChange('', idx)}>
                        <ClearTextXSVG />
                      </BouncyButton>
                    )}
                  </View>
                  <BouncyButton
                    style={{ padding: 8 }}
                    onPress={() => handleRemoveAccountLink(idx)}
                  >
                    <TrashIconSVG />
                  </BouncyButton>
                </Animated.View>
                );
              })}
              </View>

              {editLinks.length < 5 && (
                <BouncyButton style={styles.addMoreVideoBtn} onPress={handleAddAccountLink}>
                  <Text style={styles.addMoreVideoText}>+ Add Profile Link ({editLinks.length}/5)</Text>
                </BouncyButton>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' }}>
                <BouncyButton
                  style={[styles.saveAccountSettingsBtn, { paddingHorizontal: 20, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#EF4444', marginTop: 0 }]}
                  onPress={() => setLogoutConfirmModalVisible(true)}
                >
                  <Text style={[styles.submitBtnText, { color: '#EF4444' }]}>Log Out</Text>
                </BouncyButton>

                <BouncyButton
                  style={[styles.saveAccountSettingsBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6', marginTop: 0 }]}
                  onPress={() => {
                    setNewPassword('');
                    setConfirmNewPassword('');
                    setChangePasswordPageVisible(true);
                  }}
                >
                  <Text style={[styles.submitBtnText, { color: theme.accent }]}>{hasPasswordAuth ? 'Change Password' : 'Create Password'}</Text>
                </BouncyButton>
              </View>

              <BouncyButton
                style={{ marginTop: 20, alignItems: 'center' }}
                onPress={handleDeleteAccount}
              >
                <Text style={{ color: '#F87171', fontWeight: '700', fontSize: 13 }}>Delete Account</Text>
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
                    width: 44, height: 44, borderRadius: 99,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5, borderColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10
                  }}
                  activeOpacity={0.85}
                  onPress={handleRevertAccountChanges}
                >
                  <RevertIconSVG color={themeMode === 'light' ? '#6D28D9' : '#8B5CF6'} size={19} />
                </BouncyButton>

                <BouncyButton
                  style={[
                    styles.saveAccountSettingsBtn,
                    { flex: 1, marginTop: 0, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10 }
                  ]}
                  activeOpacity={0.85}
                  onPress={handleSaveAccountSettings}
                >
                  <Text style={styles.submitBtnText}>Save Changes</Text>
                </BouncyButton>
              </Animated.View>
            )}
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>

      {/* CHANGE PASSWORD - deeper page with back/X and unsaved-changes warning */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent={true}
        visible={changePasswordPageVisible}
        onRequestClose={handleCloseChangePasswordPage}
      >
        <View style={[styles.overlayModalBg, { justifyContent: 'flex-start', paddingTop: isWebWide ? 20 : headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={handleCloseChangePasswordPage}
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
          <SafeAreaView style={[styles.overlayModalContainer, { maxHeight: isWebWide ? Dimensions.get('window').height - 60 : Dimensions.get('window').height - headerBottomY - 40 }]}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              <BouncyButton style={{ padding: 4 }} onPress={handleCloseChangePasswordPage}>
                <ChevronLeftSVG color={themeMode === 'light' ? '#6D28D9' : '#F8FAFC'} size={22} />
              </BouncyButton>
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>{hasPasswordAuth ? 'Change Password' : 'Create Password'}</Text>
              <BouncyButton
                style={styles.closeBtn}
                onPress={() => {
                  if (newPassword.trim() !== '' || confirmNewPassword.trim() !== '') {
                    setPasswordPageDiscardWarningVisible(true);
                  } else {
                    setChangePasswordPageVisible(false);
                    setSettingsModalVisible(false);
                  }
                }}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            <AppKeyboardAwareScrollView
              contentContainerStyle={{ padding: 20 }}
              enableOnAndroid={true}
              extraScrollHeight={140}
              keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.formGroupLabel}>New Password</Text>
                <View style={{ position: 'relative' }}>
                  <FocusableTextInput
                    style={[styles.formInput, { marginBottom: 8, paddingRight: 44 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    importantForAutofill="yes"
                    textContentType="newPassword"
                    autoFocus
                  />
                  <BouncyButton
                    style={{ position: 'absolute', right: 12, top: 12 }}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOpenSVG color={theme.textSecondary} size={18} /> : <EyeClosedSVG color={theme.textSecondary} size={18} />}
                  </BouncyButton>
                </View>
                <View style={{ marginBottom: 12 }}>
                  {getPasswordRequirements(newPassword).map((req) => (
                    <View key={req.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      {req.met ? <CheckIconSVG /> : <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: theme.border }} />}
                      <Text style={{ color: req.met ? '#4ADE80' : theme.textSecondary, fontSize: 12 }}>{req.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.formGroupLabel}>Confirm New Password</Text>
                <View style={{ position: 'relative' }}>
                  <FocusableTextInput
                    style={[styles.formInput, { paddingRight: 44 }]}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showConfirmNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    importantForAutofill="yes"
                    textContentType="newPassword"
                  />
                  <BouncyButton
                    style={{ position: 'absolute', right: 12, top: 12 }}
                    onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                  >
                    {showConfirmNewPassword ? <EyeOpenSVG color={theme.textSecondary} size={18} /> : <EyeClosedSVG color={theme.textSecondary} size={18} />}
                  </BouncyButton>
                </View>
                <BouncyButton
                  style={[styles.saveAccountSettingsBtn, { marginTop: 20 }]}
                  onPress={async () => {
                    const success = await handleChangePassword();
                    if (success) {
                      setChangePasswordPageVisible(false);
                      if (Platform.OS !== 'web') setAccountSettingsModalVisible(true);
                    }
                  }}
                  disabled={changingPassword || !newPassword}
                >
                  {changingPassword ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>{hasPasswordAuth ? 'Update Password' : 'Create Password'}</Text>
                  )}
                </BouncyButton>
            </AppKeyboardAwareScrollView>
          </SafeAreaView>
        </View>
      </Modal>


      {/* LOG OUT CONFIRMATION - simple confirm, unlike delete account this is fully reversible */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={logoutConfirmModalVisible}
        onRequestClose={() => setLogoutConfirmModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setLogoutConfirmModalVisible(false)}
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
          <View style={styles.customConfirmCard}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
              <WarningTriangleSVG />
            </View>
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Log Out?</Text>
            <Text style={styles.confirmSubText}>
              You'll need to sign back in with your email and password to use DECENT again.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => setLogoutConfirmModalVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: theme.text }]}>Cancel</Text>
              </BouncyButton>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                onPress={async () => {
                  setLogoutConfirmModalVisible(false);
                  await supabase.auth.signOut();
                  // Web only: resets every bit of in-memory navigation state
                  // (which tab, which modal was open, scroll position, etc.)
                  // in one guaranteed-clean move, rather than tracking down
                  // and manually resetting each individual piece of state
                  // that could have been left mid-navigation at logout time.
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.location.reload();
                  } else {
                    // Native equivalent of the web reload above - re-executes
                    // the JS bundle fresh, resetting all in-memory state
                    // (which modal was open, scroll position, etc.) the same
                    // guaranteed-clean way, rather than trying to manually
                    // track down and reset each individual piece of state.
                    // Only works in standalone/production builds using
                    // expo-updates - no-ops (or throws) in Expo Go/dev
                    // client, so this is wrapped defensively rather than
                    // left to crash during local testing.
                    try {
                      await Updates.reloadAsync();
                    } catch (e) {
                      console.warn('Updates.reloadAsync unavailable (expected in dev):', e.message);
                    }
                  }
                }}
              >
                <Text style={styles.confirmDeleteText}>Log Out</Text>
              </BouncyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* DELETE ACCOUNT - requires typing DELETE, real failsafe for a destructive action */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={deleteAccountModalVisible}
        onRequestClose={() => setDeleteAccountModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setDeleteAccountModalVisible(false)}
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
          <View style={styles.customConfirmCard}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
              <TrashIconSVG />
            </View>
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Delete Account</Text>
            <Text style={styles.confirmSubText}>
              This permanently deletes your portfolios, profile, likes, and follows. This cannot be undone.
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 8, alignSelf: 'flex-start' }}>
              Type <Text style={{ color: '#EF4444', fontWeight: '800' }}>DELETE</Text> to confirm:
            </Text>
            <FocusableTextInput
              style={[styles.formInput, { width: '100%', marginBottom: 14 }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Type DELETE"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
            />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => setDeleteAccountModalVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: theme.text }]}>Cancel</Text>
              </BouncyButton>
              <BouncyButton
                style={[
                  styles.confirmDeleteBtn,
                  { flex: 1, backgroundColor: deleteConfirmText.trim().toUpperCase() === 'DELETE' ? '#EF4444' : '#3A2222' }
                ]}
                onPress={executeAccountDeletion}
                disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
              >
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </BouncyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ACCOUNT SETTINGS - UNSAVED CHANGES WARNING */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={accountSettingsDiscardWarningVisible}
        onRequestClose={() => setAccountSettingsDiscardWarningVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setAccountSettingsDiscardWarningVisible(false)}
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
          <View style={styles.customConfirmCard}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
              <WarningTriangleSVG />
            </View>
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Discard Changes?</Text>
            <Text style={styles.confirmSubText}>You have unsaved changes to your account. Are you sure you want to leave without saving?</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => setAccountSettingsDiscardWarningVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: theme.text }]}>Keep Editing</Text>
              </BouncyButton>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                onPress={() => {
                  setAccountSettingsDiscardWarningVisible(false);
                  setAccountSettingsModalVisible(false);
                  if (Platform.OS !== 'web' && returnToOptionsOnClose) {
                    setSettingsModalVisible(true);
                    setReturnToOptionsOnClose(false);
                  }
                }}
              >
                <Text style={styles.confirmDeleteText}>Discard</Text>
              </BouncyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* CHANGE PASSWORD - UNSAVED CHANGES WARNING */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={passwordPageDiscardWarningVisible}
        onRequestClose={() => setPasswordPageDiscardWarningVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setPasswordPageDiscardWarningVisible(false)}
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
          <View style={styles.customConfirmCard}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
              <WarningTriangleSVG />
            </View>
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Discard Password Change?</Text>
            <Text style={styles.confirmSubText}>You've typed a new password but haven't saved it. Are you sure you want to leave?</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => setPasswordPageDiscardWarningVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: theme.text }]}>Keep Editing</Text>
              </BouncyButton>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                onPress={() => {
                  setPasswordPageDiscardWarningVisible(false);
                  setNewPassword('');
                  setConfirmNewPassword('');
                  setChangePasswordPageVisible(false);
                  if (Platform.OS !== 'web') setAccountSettingsModalVisible(true);
                }}
              >
                <Text style={styles.confirmDeleteText}>Discard</Text>
              </BouncyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ABOUT DECENT CUSTOM DARK OVERLAY MODAL */}
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
                <BouncyButton style={{ padding: 4 }} onPress={() => setAboutModalVisible(false)}>
                  <ChevronLeftSVG color={themeMode === 'light' ? '#6D28D9' : '#F8FAFC'} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>About DECENT</Text>
              <BouncyButton style={styles.closeBtn} onPress={() => {
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

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={{ fontSize: 18 }}>
                <Text style={{ color: themeMode === 'light' ? '#6D28D9' : '#C084FC', fontWeight: '900' }}>DECENT</Text>
                <Text style={{ color: theme.text, fontWeight: '800' }}> v{APP_VERSION} (b{BUILD_NUMBER})</Text>
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>
                DECENT is an interactive UI/UX portfolio platform designed for creators, product designers, and design system architects.
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>
                Showcase mobile design systems, responsive web prototypes, case studies, and live interactive Figma canvas viewports natively in one unified application.
              </Text>

              <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Platform Highlights</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ Interactive Figma Prototype Viewports</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ 45+ UI/UX Specialized Tagging</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 3 }}>❖ Seamless Dark Mode Design</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>❖ Direct Follower & Notification Hub</Text>
              </View>

              <BouncyButton
                style={{ backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6', borderRadius: 99, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setAboutModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close</Text>
              </BouncyButton>
            </ScrollView>
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>

      {/* CHANGELOG / WHAT'S NEW - entries come from Supabase (changelog_entries
          table), not hardcoded, so new entries don't need an app update to
          show up - just an insert. Lazy-fetched once per session via
          changelogFetchedRef, same pattern as the followers/following and
          feature-interest lists elsewhere. */}
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
              <BouncyButton style={styles.closeBtn} onPress={() => setChangelogModalVisible(false)}>
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
              <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
                {changelogEntries.map((entry) => (
                  <View
                    key={entry.id}
                    style={{ borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 14 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {entry.version && (
                        <View style={{ backgroundColor: theme.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
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

      {/* PRIVACY POLICY - WHITE THEME FOR READABILITY */}
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
          <SafeAreaView style={[styles.overlayModalContainer, { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', maxHeight: isWebWide ? Math.min(640, Dimensions.get('window').height - 80) : Dimensions.get('window').height - headerBottomY - 40, ...(isWebWide ? { maxWidth: contentModalWidth } : {}) }]}>
            <View style={[styles.modalTopBar, { backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0', justifyContent: 'flex-start', gap: 10 }]}>
              {!isWebWide && (
                <BouncyButton style={{ padding: 4 }} onPress={() => setPrivacyModalVisible(false)}>
                  <ChevronLeftSVG color="#6D28D9" size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { color: '#0F172A', flex: 1 }, isWebWide && { fontSize: 20 }]}>Privacy Policy</Text>
              <BouncyButton style={[styles.closeBtn, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]} onPress={() => {
                setPrivacyModalVisible(false);
                if (Platform.OS !== 'web' && returnToOptionsOnClose) {
                  setSettingsModalVisible(true);
                  setReturnToOptionsOnClose(false);
                } else {
                  setSettingsModalVisible(false);
                }
              }}>
                <Text style={[styles.closeBtnText, { color: '#0F172A' }]}>✕</Text>
              </BouncyButton>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '800' }}>Privacy Policy</Text>
              <Text style={{ color: '#64748B', fontSize: 13, fontStyle: 'italic' }}>
                Last updated: August 2026. This is a placeholder policy for testing purposes and should be reviewed by a legal professional before public release.
              </Text>
              <Text style={{ color: '#1E293B', fontSize: 14, lineHeight: 21 }}>
                DECENT ("we", "us") is operated from Indonesia. This policy explains what data we collect and how it's used, in line with Indonesia's Personal Data Protection Law (UU No. 27 Tahun 2022).
              </Text>

              <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Data We Collect</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• Account info: email, name, role, bio, location, profile photo</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• Content you upload: portfolio images, links, descriptions</Text>
                <Text style={{ color: '#334155', fontSize: 13 }}>• Usage data: likes, follows, views, notifications</Text>
              </View>

              <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Feature Interest ("I'm Interested" buttons)</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 6, lineHeight: 19 }}>
                  When you tap "I'm Interested" on an upcoming feature (like Frontend Development portfolios), we record that your account expressed interest in that specific feature. This is tied to your account, not anonymous.
                </Text>
                <Text style={{ color: '#334155', fontSize: 13, lineHeight: 19 }}>
                  We use this to gauge real demand before building something, and may reach out to people who registered interest for a short survey about it (e.g. which tools/platforms you'd want supported) before or while we build it. You can stop this at any time by requesting account deletion via Account Settings, same as any other data we hold.
                </Text>
              </View>

              <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>How We Use It</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: '#334155', fontSize: 13, flex: 1 }}>To operate core features (profiles, portfolios, follows)</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: '#334155', fontSize: 13, flex: 1 }}>To show your public profile and work to other users</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <View style={{ marginTop: 2 }}><LockIconSVG /></View>
                  <Text style={{ color: '#334155', fontSize: 13, flex: 1 }}>We do not sell your data to third parties</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Your Rights</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• Edit or delete your profile and portfolios anytime</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• Request account deletion via Account Settings</Text>
                <Text style={{ color: '#334155', fontSize: 13 }}>• Contact us with data requests via Feedback & Support</Text>
              </View>

              <BouncyButton
                style={{ backgroundColor: '#6D28D9', borderRadius: 99, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setPrivacyModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close</Text>
              </BouncyButton>
            </ScrollView>
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>

      {/* TERMS OF SERVICE - WHITE THEME FOR READABILITY */}
      <Modal
        animationType="none"
        transparent={true}
        visible={termsModalVisible}
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
          <SafeAreaView style={[styles.overlayModalContainer, { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', maxHeight: isWebWide ? Math.min(640, Dimensions.get('window').height - 80) : Dimensions.get('window').height - headerBottomY - 40, ...(isWebWide ? { maxWidth: contentModalWidth } : {}) }]}>
            <View style={[styles.modalTopBar, { backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0', justifyContent: 'flex-start', gap: 10 }]}>
              {!isWebWide && (
                <BouncyButton style={{ padding: 4 }} onPress={() => setTermsModalVisible(false)}>
                  <ChevronLeftSVG color="#6D28D9" size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { color: '#0F172A', flex: 1 }, isWebWide && { fontSize: 20 }]}>Terms of Service</Text>
              <BouncyButton style={[styles.closeBtn, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]} onPress={() => {
                setTermsModalVisible(false);
                if (Platform.OS !== 'web' && returnToOptionsOnClose) {
                  setSettingsModalVisible(true);
                  setReturnToOptionsOnClose(false);
                } else {
                  setSettingsModalVisible(false);
                }
              }}>
                <Text style={[styles.closeBtnText, { color: '#0F172A' }]}>✕</Text>
              </BouncyButton>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '800' }}>Terms of Service</Text>
              <Text style={{ color: '#64748B', fontSize: 13, fontStyle: 'italic' }}>
                Last updated: August 2026. This is a placeholder for testing purposes and should be reviewed by a legal professional before public release.
              </Text>
              <Text style={{ color: '#1E293B', fontSize: 14, lineHeight: 21 }}>
                By using DECENT, operated from Indonesia, you agree to these terms.
              </Text>

              <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Your Content</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• You retain ownership of everything you upload</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• You confirm you have the right to share what you post</Text>
                <Text style={{ color: '#334155', fontSize: 13 }}>• We may remove content that violates these terms</Text>
              </View>

              <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Acceptable Use</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• No spam, harassment, or impersonation</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• No uploading content you don't have rights to</Text>
                <Text style={{ color: '#334155', fontSize: 13 }}>• We may suspend accounts that break these rules</Text>
              </View>

              <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Disclaimer</Text>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 3 }}>• DECENT is provided "as is" without warranties</Text>
                <Text style={{ color: '#334155', fontSize: 13 }}>• We're not liable for content posted by users</Text>
              </View>

              <BouncyButton
                style={{ backgroundColor: '#6D28D9', borderRadius: 99, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setTermsModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close</Text>
              </BouncyButton>
            </ScrollView>
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>


      {/* FEEDBACK & SUPPORT CUSTOM DARK OVERLAY MODAL WITH FORM & NOTIFY SWITCH */}
      <Modal
        animationType="none"
        transparent={true}
        visible={feedbackModalVisible}
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
                <BouncyButton style={{ padding: 4 }} onPress={() => setFeedbackModalVisible(false)}>
                  <ChevronLeftSVG color={themeMode === 'light' ? '#6D28D9' : '#F8FAFC'} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>Feedback & Support</Text>
              <BouncyButton style={styles.closeBtn} onPress={() => {
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
                    placeholderTextColor="#94A3B8"
                    value={feedbackEmail}
                    onChangeText={setFeedbackEmail}
                  />

                  <Text style={styles.formGroupLabel}>Feedback Message or Issue Description *</Text>
                  <FocusableTextInput
                    style={[styles.formInput, { height: 90, textAlignVertical: 'top' }]}
                    multiline
                    placeholder="Describe your suggestion or technical issue in detail..."
                    placeholderTextColor="#94A3B8"
                    value={feedbackMessage}
                    onChangeText={setFeedbackMessage}
                  />

                  <View style={styles.feedbackNotifyToggleRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.settingItemTitle}>Send Email Notification</Text>
                      <Text style={styles.settingItemSub}>
                        Receive an email alert when your reported issue is confirmed and being fixed.
                      </Text>
                    </View>
                    <Switch
                      value={feedbackNotifyEmail}
                      onValueChange={setFeedbackNotifyEmail}
                      trackColor={{ false: theme.border, true: themeMode === 'light' ? '#6D28D9' : '#8B5CF6' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <BouncyButton
                    style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 10 }]}
                    onPress={handleSubmitFeedback}
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
                    placeholderTextColor="#94A3B8"
                    value={featureRequestTitle}
                    onChangeText={setFeatureRequestTitle}
                  />

                  <Text style={styles.formGroupLabel}>Description *</Text>
                  <FocusableTextInput
                    style={[styles.formInput, { height: 90, textAlignVertical: 'top' }]}
                    multiline
                    placeholder="Describe what you'd like to see and why it'd help..."
                    placeholderTextColor="#94A3B8"
                    value={featureRequestDescription}
                    onChangeText={setFeatureRequestDescription}
                  />

                  <BouncyButton
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}
                    onPress={() => setFeatureRequestHasLink(!featureRequestHasLink)}
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
                      borderColor: featureRequestHasLink ? (themeMode === 'light' ? '#6D28D9' : '#8B5CF6') : theme.border,
                      backgroundColor: featureRequestHasLink ? (themeMode === 'light' ? '#6D28D9' : '#8B5CF6') : 'transparent',
                      alignItems: 'center', justifyContent: 'center'
                    }}>
                      {featureRequestHasLink && <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                    </View>
                    <Text style={styles.settingItemTitle}>I have a reference link</Text>
                  </BouncyButton>

                  {featureRequestHasLink && (
                    <FocusableTextInput
                      style={[styles.formInput, { marginTop: 4 }]}
                      placeholder="https://..."
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                      value={featureRequestLink}
                      onChangeText={setFeatureRequestLink}
                    />
                  )}

                  <BouncyButton
                    style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 10 }]}
                    onPress={handleSubmitFeatureRequest}
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

      {/* FEEDBACK SUCCESS POPUP MODAL */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={feedbackSuccessModalVisible}
        onRequestClose={() => setFeedbackSuccessModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
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
          <View style={styles.customConfirmCard}
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
              style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 8 }]}
              onPress={() => setFeedbackSuccessModalVisible(false)}
            >
              <Text style={styles.confirmDeleteText}>Continue</Text>
            </BouncyButton>
          </View>
        </View>
      </Modal>

      {/* DONATE MODAL - single screen, no scroll, Indonesia (QRIS) / International (PayPal, Wise) */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent={true}
        visible={donateModalVisible}
        onRequestClose={handleCloseDonateModal}
      >
        <View style={[styles.overlayModalBg, isWebWide ? { justifyContent: 'center', paddingHorizontal: 16 } : { justifyContent: 'flex-start', paddingTop: headerBottomY + 8, paddingHorizontal: 16, backgroundColor: 'transparent' }]}
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
          <SafeAreaView style={[styles.overlayModalContainer, { height: isWebWide ? Math.min(640, Dimensions.get('window').height - 80) : Dimensions.get('window').height - headerBottomY - 40, maxHeight: undefined, ...(isWebWide ? { maxWidth: contentModalWidth } : {}) }]}
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
              <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>Support DECENT</Text>
              <BouncyButton style={styles.closeBtn} onPress={handleCloseDonateModal}>
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            <View style={{ padding: 18 }}>
              <View>
                <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18, marginBottom: 16 }}>
                  Hi, I'm Iqbal — a UI/UX designer focused on Figma prototyping and clean handovers for HR and dev teams. I built DECENT to give designers a simple place to showcase real, interactive portfolios instead of static screenshots. If it's been useful to you, a donation helps keep it running and improving.
                </Text>

                <AnimatedPillTabs
                  theme={theme}
                  themeMode={themeMode}
                  activeKey={donateRegion}
                  onChange={setDonateRegion}
                  containerStyle={{ marginBottom: 16 }}
                  tabs={[
                    { key: 'id', label: 'Indonesia', icon: (color) => <LocationPinSVG color={color} /> },
                    { key: 'intl', label: 'International', icon: (color) => <GlobeIconSVG color={color} /> }
                  ]}
                />

                <BouncyButton
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}
                  onPress={() => setDonateTermsAgreed(!donateTermsAgreed)}
                >
                  <View style={{
                    width: 20, height: 20, borderRadius: 5, marginTop: 1,
                    borderWidth: 1.5, borderColor: donateTermsAgreed ? (themeMode === 'light' ? '#6D28D9' : '#8B5CF6') : theme.border,
                    backgroundColor: donateTermsAgreed ? (themeMode === 'light' ? '#6D28D9' : '#8B5CF6') : 'transparent',
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
                      width: 190, height: 190, borderRadius: 16, borderWidth: 1, borderColor: theme.border,
                      backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden'
                    }}>
                      <Image
                        source={require('./assets/qris-code.png')}
                        style={{ width: 180, height: 180 }}
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
                          >
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(139,92,246,0.85)', alignItems: 'center', justifyContent: 'center' }}>
                              <EyeViewIconSVG color="#FFFFFF" size={20} />
                            </View>
                            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12.5, textAlign: 'center' }}>
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
                        borderRadius: 10, borderWidth: 1, borderColor: theme.border,
                        opacity: donateTermsAgreed ? 1 : 0.4
                      }}
                      disabled={!donateTermsAgreed}
                      onPress={handleDownloadQrisCode}
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
                    >
                      <Text style={styles.contrastDonateBtnText}>Donate via Ko-fi</Text>
                    </BouncyButton>
                  </View>
                )}
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* DONATE SUCCESS POPUP MODAL */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={donateSuccessModalVisible}
        onRequestClose={handleCloseDonateSuccess}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={handleCloseDonateSuccess}
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
          <View style={styles.customConfirmCard}
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
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Thank You!</Text>
            <Text style={styles.confirmSubText}>
              Your generosity keeps DECENT independent and growing. We greatly appreciate your support!
            </Text>
            <BouncyButton
              style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 8 }]}
              onPress={handleCloseDonateSuccess}
            >
              <Text style={styles.confirmDeleteText}>Continue</Text>
            </BouncyButton>
          </View>
        </View>
      </Modal>

      {/* APP SETTINGS - blurs content below header only, header stays visible */}
      {settingsPopupRendered && (
        <View pointerEvents="box-none" style={{ position: Platform.OS === 'web' ? 'fixed' : 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: isWebWide ? 0 : headerBottomY, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => { setSettingsModalVisible(false); setOptionsView('root'); }}
          >
            {isWebWide ? (
              <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.12)', opacity: settingsPopupAnim }} />
            ) : (
              <Animated.View style={{ flex: 1, opacity: settingsPopupAnim }}>
                {lightweightMode ? (
                  <View style={{ flex: 1, backgroundColor: themeMode === 'light' ? 'rgba(244, 242, 250, 0.6)' : 'rgba(11, 15, 23, 0.75)' }} />
                ) : (
                  <BlurView
                    intensity={65}
                    tint={themeMode === 'light' ? 'light' : 'dark'}
                    style={{ flex: 1 }}
                  />
                )}
              </Animated.View>
            )}
          </TouchableOpacity>

          <Animated.View
            style={{
              position: Platform.OS === 'web' ? 'fixed' : 'absolute',
              top: Platform.OS === 'web' ? utilityDropdownTop : headerBottomY + 8,
              ...(Platform.OS === 'web' ? { right: 16, width: settingsDropdownWidth } : { left: 16, right: 16 }),
              maxHeight: Dimensions.get('window').height - (headerBottomY + 8) - 16,
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              shadowColor: '#8B5CF6',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 12,
              overflow: 'hidden',
              opacity: settingsPopupAnim,
              transform: [
                { scale: settingsPopupAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                { translateY: settingsPopupAnim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }
              ]
            }}
          >
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              {optionsView !== 'root' && (
                <BouncyButton
                  style={{ padding: 4 }}
                  onPress={() => setOptionsView(optionsView === 'blockedUsers' || optionsView === 'notificationHistory' ? 'privacy' : 'root')}
                >
                  <ChevronLeftSVG color={themeMode === 'light' ? '#6D28D9' : '#F8FAFC'} size={22} />
                </BouncyButton>
              )}
              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]}>
                {optionsView === 'privacy' ? 'Privacy' : optionsView === 'supportLegal' ? 'Support & Legal' : optionsView === 'blockedUsers' ? 'Blocked Users' : optionsView === 'notificationHistory' ? 'Notification History' : 'Options'}
              </Text>
              {optionsView === 'root' && (
                <BouncyButton
                  activeOpacity={0.8}
                  onPress={toggleTheme}
                  style={{
                    flexDirection: 'row', alignItems: 'center', position: 'relative',
                    backgroundColor: theme.bg, borderRadius: 20, borderWidth: 1, borderColor: theme.border,
                    padding: 3, overflow: 'hidden'
                  }}
                >
                  <Animated.View
                    style={{
                      position: 'absolute', top: 3, left: 3, width: 30, height: 30, borderRadius: 15,
                      backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
                      transform: [{
                        translateX: themeToggleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] })
                      }]
                    }}
                  />
                  <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                    <SunIconSVG
                      color={themeMode === 'light' ? '#FFFFFF' : '#94A3B8'}
                      filled={themeMode === 'light'}
                      size={16}
                      activateAnim={sunActivateAnim}
                    />
                  </View>
                  <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                    <MoonIconSVG
                      color={themeMode === 'dark' ? '#FFFFFF' : '#94A3B8'}
                      filled={themeMode === 'dark'}
                      size={16}
                      cutoutColor={themeMode === 'light' ? '#6D28D9' : '#8B5CF6'}
                      activateAnim={moonActivateAnim}
                    />
                  </View>
                </BouncyButton>
              )}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
              {optionsView === 'root' && (
                <>
                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => {
                      if (!session) {
                        setSettingsModalVisible(false);
                        setOptionsView('root');
                        setGuestAuthPromptVisible(true);
                        return;
                      }
                      handleOpenAccountSettingsModal();
                    }}
                  >
                    <Text style={styles.settingItemTitle}>{session ? 'Account' : 'Sign In'}</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>{session ? 'Edit Profile' : 'Log In / Register'}</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => setOptionsView('privacy')}
                  >
                    <Text style={styles.settingItemTitle}>Privacy</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Manage</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => setOptionsView('supportLegal')}
                  >
                    <Text style={styles.settingItemTitle}>Support & Legal</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>View</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => { handleOpenChangelog(); setSettingsModalVisible(false); setOptionsView('root'); if (Platform.OS !== 'web') setReturnToOptionsOnClose(true); }}
                  >
                    <Text style={styles.settingItemTitle}>What's New</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Changelog</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => openExternalLinkWithWarning(GITHUB_URL)}
                  >
                    <Text style={styles.settingItemTitle}>Visit GitHub</Text>
                    <View style={styles.iconTextInlineRow}>
                      <GitHubIconSVG color={theme.textSecondary} size={16} />
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <View style={styles.settingItemRow}>
                    <Text style={styles.settingItemTitle}>App Version</Text>
                    <Text style={styles.settingItemValue}>v{APP_VERSION} (build {BUILD_NUMBER})</Text>
                  </View>

                  {session && Platform.OS === 'web' && (
                    <BouncyButton
                      style={styles.settingItemRow}
                      onPress={() => setLogoutConfirmModalVisible(true)}
                    >
                      <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Sign Out</Text>
                    </BouncyButton>
                  )}

                  {/* Contrast Donate Button at Very Bottom */}
                  <BouncyButton
                    style={[styles.donateSettingBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
                    activeOpacity={0.88}
                    onPress={() => { setDonateTermsAgreed(false); setDonateModalVisible(true); setSettingsModalVisible(false); setOptionsView('root'); if (Platform.OS !== 'web') setReturnToOptionsOnClose(true); }}
                  >
                    <HeartIconSVG liked={true} />
                    <Text style={styles.donateSettingBtnText}>Support & Donate to DECENT</Text>
                  </BouncyButton>
                </>
              )}

              {optionsView === 'privacy' && (
                <>
                  <View style={styles.settingToggleRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.settingItemTitle}>Hide Liked Portfolios from Public</Text>
                      <Text style={styles.settingItemSub}>
                        When enabled, visitors can only see your uploaded portfolios on your profile page.
                      </Text>
                    </View>
                    <Switch
                      value={hideLikedPortfolios}
                      onValueChange={setHideLikedPortfolios}
                      trackColor={{ false: theme.border, true: themeMode === 'light' ? '#6D28D9' : '#8B5CF6' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => {
                      fetchBlockedUsers();
                      setOptionsView('blockedUsers');
                    }}
                  >
                    <Text style={styles.settingItemTitle}>Blocked Users</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Manage</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => {
                      fetchNotificationHistory(true);
                      setOptionsView('notificationHistory');
                    }}
                  >
                    <Text style={styles.settingItemTitle}>Notification History</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>View All</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <View style={styles.settingToggleRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.settingItemTitle}>Safe Search</Text>
                      <Text style={styles.settingItemSub}>
                        When on, NSFW designers and portfolios never appear in search. NSFW content never appears on For You regardless of this setting.
                      </Text>
                    </View>
                    <Switch
                      value={safeSearchEnabled}
                      onValueChange={handleSafeSearchToggle}
                      trackColor={{ false: theme.border, true: themeMode === 'light' ? '#6D28D9' : '#8B5CF6' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.settingToggleRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.settingItemTitle}>Fancy Mode</Text>
                        <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                          <Text style={{ color: '#F59E0B', fontSize: 9, fontWeight: '800' }}>EXPERIMENTAL</Text>
                        </View>
                      </View>
                      <Text style={styles.settingItemSub}>
                        Adds blur backdrops, translucent effects, and extra animation flourish throughout the app. Off by default - performance with this on is still experimental and may lag or behave unexpectedly on some devices.
                      </Text>
                    </View>
                    <Switch
                      value={!lightweightMode}
                      onValueChange={(v) => {
                        if (v) {
                          setFancyModeCountdown(5);
                          setFancyModeConfirmVisible(true);
                        } else {
                          setLightweightMode(true);
                        }
                      }}
                      trackColor={{ false: theme.border, true: themeMode === 'light' ? '#6D28D9' : '#8B5CF6' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <BouncyButton
                    style={[styles.settingItemRow, { borderBottomWidth: 0 }]}
                    onPress={handleExportMyData}
                  >
                    <Text style={styles.settingItemTitle}>Export My Data</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Download</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>
                </>
              )}

              {optionsView === 'blockedUsers' && (
                <>
                  {blockedUsersList.length === 0 ? (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>You haven't blocked anyone.</Text>
                    </View>
                  ) : (
                    blockedUsersList.map((u) => (
                      <View key={u.id} style={styles.notificationCard}>
                        <Image source={{ uri: u.avatar }} style={styles.notifAvatar} />
                        <Text style={[styles.notifText, { flex: 1 }]}>{u.name}</Text>
                        <BouncyButton
                          style={styles.notifFollowBackBtn}
                          onPress={() => handleUnblockUser(u.id)}
                        >
                          <Text style={styles.notifFollowBackText}>Unblock</Text>
                        </BouncyButton>
                      </View>
                    ))
                  )}
                </>
              )}

              {optionsView === 'notificationHistory' && (
                <>
                  {notificationHistoryLoading ? (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={theme.accent} />
                    </View>
                  ) : notificationHistoryList.length === 0 ? (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>No notifications yet.</Text>
                    </View>
                  ) : (
                    <>
                      {notificationHistoryList.map((notif) => (
                        <View key={notif.id} style={[styles.notificationCard, { opacity: notif.read ? 0.65 : 1 }]}>
                          <BouncyButton
                            style={{ position: 'relative' }}
                            onPress={() => {
                              setSettingsModalVisible(false);
                              openDesignerProfileById(notif.actorId);
                            }}
                          >
                            <Image source={{ uri: notif.avatar }} style={styles.notifAvatar} />
                            {!notif.read && (
                              <View style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: theme.surface }} />
                            )}
                          </BouncyButton>
                          <BouncyButton
                            style={{ flex: 1, marginRight: 6 }}
                            onPress={() => {
                              setSettingsModalVisible(false);
                              if (notif.type === 'like' && notif.portfolioId) {
                                openPortfolioById(notif.portfolioId);
                              } else if (notif.type === 'follow') {
                                openDesignerProfileById(notif.actorId);
                              }
                            }}
                          >
                            <Text style={styles.notifText}>
                              <Text style={styles.notifUserBold}>{notif.user}</Text> {notif.action}{' '}
                              {notif.target ? <Text style={styles.notifTargetBold}>"{notif.target}"</Text> : null}
                            </Text>
                            <Text style={styles.notifTimeText}>{notif.time}</Text>
                          </BouncyButton>
                        </View>
                      ))}
                      {notificationHistoryHasMore && (
                        <BouncyButton
                          style={{ paddingVertical: 14, alignItems: 'center' }}
                          onPress={loadMoreNotificationHistory}
                          disabled={notificationHistoryLoadingMore}
                        >
                          {notificationHistoryLoadingMore ? (
                            <ActivityIndicator size="small" color={theme.accent} />
                          ) : (
                            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Load More</Text>
                          )}
                        </BouncyButton>
                      )}
                    </>
                  )}
                </>
              )}

              {optionsView === 'supportLegal' && (
                <>
                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => { setAboutModalVisible(true); setSettingsModalVisible(false); setOptionsView('root'); if (Platform.OS !== 'web') setReturnToOptionsOnClose(true); }}
                  >
                    <Text style={styles.settingItemTitle}>About DECENT</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Information</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => { setPrivacyModalVisible(true); setSettingsModalVisible(false); setOptionsView('root'); if (Platform.OS !== 'web') setReturnToOptionsOnClose(true); }}
                  >
                    <Text style={styles.settingItemTitle}>Privacy Policy</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>View Policy</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => { setTermsModalVisible(true); setSettingsModalVisible(false); setOptionsView('root'); if (Platform.OS !== 'web') setReturnToOptionsOnClose(true); }}
                  >
                    <Text style={styles.settingItemTitle}>Terms of Service</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>View Terms</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>

                  <BouncyButton
                    style={styles.settingItemRow}
                    onPress={() => { setFeedbackModalVisible(true); setSettingsModalVisible(false); setOptionsView('root'); if (Platform.OS !== 'web') setReturnToOptionsOnClose(true); }}
                  >
                    <Text style={styles.settingItemTitle}>Feedback & Support</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Send Message</Text>
                      <ChevronRightSVG color={theme.accent} size={16} />
                    </View>
                  </BouncyButton>
                </>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      )}



      {/* ALL 20 CATEGORIES POPUP OVERLAY MODAL */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={allCategoriesModalVisible}
        onRequestClose={() => setAllCategoriesModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setAllCategoriesModalVisible(false)}
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
          <SafeAreaView style={styles.overlayModalContainer}
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
              <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>All Categories</Text>
              <BouncyButton style={styles.closeBtn} onPress={() => setAllCategoriesModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            <ScrollView contentContainerStyle={styles.allCategoriesGrid}>
              {ALL_UIUX_CATEGORIES_MASTER.slice(0, 20).map((cat) => (
                <BouncyButton
                  key={cat}
                  style={[styles.overlayCategoryCard, categoryFilter === cat && styles.overlayCategoryCardActive]}
                  onPress={() => {
                    setCategoryFilter(cat);
                    setAllCategoriesModalVisible(false);
                  }}
                >
                  <Text style={[styles.overlayCategoryText, categoryFilter === cat && styles.overlayCategoryTextActive]}>
                    {cat}
                  </Text>
                </BouncyButton>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>


      {/* DESIGNER PROFILE MODAL */}
      {/* DESIGNER PROFILE - page instead of popup on wide web (sidebar/header
          stay visible), still a native Modal everywhere else. Content is
          built once as a local JSX value inside this IIFE (only evaluated
          when selectedDesigner is truthy, since the content below reads
          selectedDesigner.id/.name directly without optional chaining) and
          referenced from whichever wrapper applies - avoids duplicating the
          ~200 lines of content for two different wrapper elements. */}
      {selectedDesigner && (() => {
        const designerProfileContent = (
          <View style={{ flex: 1, width: '100%', backgroundColor: theme.bg }}>
          <SafeAreaView style={[styles.modalContainer, Platform.OS === 'web' && { maxWidth: mainContentMaxWidth }]}>
            {Platform.OS !== 'web' && (
            <View style={[styles.modalTopBar, { backgroundColor: 'transparent', overflow: 'hidden' }]}>
              {lightweightMode ? (
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: theme.surface
                }} />
              ) : (
                <BlurView
                  intensity={45}
                  tint={themeMode === 'light' ? 'light' : 'dark'}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              )}
              <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>Designer Profile</Text>
              {session && selectedDesigner.id && selectedDesigner.id !== session.user.id && (
                <View ref={designerDotsWrapRef} style={{ zIndex: 100 }}>
                  <BouncyButton
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      const next = !designerOptionsMenuVisible;
                      if (next && designerDotsWrapRef.current) {
                        designerDotsWrapRef.current.measureInWindow((x, y, width, height) => {
                          const screenWidth = Platform.OS === 'web' ? window.innerWidth : Dimensions.get('window').width;
                          setDesignerMenuPos({ top: y + height + 8, right: Math.max(8, screenWidth - (x + width)) });
                        });
                      }
                      setDesignerOptionsMenuVisible(next);
                    }}
                  >
                    <Text style={{ color: theme.accentLight, fontSize: 20, fontWeight: '900', lineHeight: 20 }}>⋮</Text>
                  </BouncyButton>

                  <Modal
                    transparent
                    visible={designerOptionsMenuVisible}
                    animationType="none"
                    onRequestClose={() => setDesignerOptionsMenuVisible(false)}
                  >
                    <View
                      pointerEvents="box-none"
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    >
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={1}
                        onPress={() => setDesignerOptionsMenuVisible(false)}
                      />
                      <View style={{
                        position: 'absolute', top: designerMenuPos.top, right: designerMenuPos.right, width: 220,
                        backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border,
                        padding: 6,
                        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 12
                      }}>
                        <BouncyButton
                          style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                          onPress={() => {
                            setDesignerOptionsMenuVisible(false);
                            handleReportContent('user', selectedDesigner.id, selectedDesigner.name);
                          }}
                        >
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>Report Profile</Text>
                        </BouncyButton>
                        <BouncyButton
                          style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                          onPress={() => {
                            setDesignerOptionsMenuVisible(false);
                            mutedIds.has(selectedDesigner.id)
                              ? handleUnmuteDesigner(selectedDesigner.id, selectedDesigner.name)
                              : handleMuteDesigner(selectedDesigner.id, selectedDesigner.name);
                          }}
                        >
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>
                            {mutedIds.has(selectedDesigner.id) ? 'Unmute Posts' : 'Mute Posts'}
                          </Text>
                        </BouncyButton>
                        <BouncyButton
                          style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                          onPress={() => {
                            setDesignerOptionsMenuVisible(false);
                            handleBlockUser(selectedDesigner.id, selectedDesigner.name);
                          }}
                        >
                          <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Block User</Text>
                        </BouncyButton>
                      </View>
                    </View>
                  </Modal>
                </View>
              )}
              <BouncyButton style={styles.closeBtn} onPress={handleBackFromDesignerProfile}>
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>
            )}

            <ScrollView style={styles.caseScrollView} contentContainerStyle={styles.caseContent}>
              {Platform.OS === 'web' && (
                // position:'sticky' (not 'fixed') deliberately - this needs to
                // stay pinned to the top of THIS card's own scroll area and
                // respect the card's own bounds/padding, not the whole
                // viewport. 'fixed' was tried first and looked right on a
                // full-screen mobile modal, but on the wide-web layout this
                // page is really a bounded card next to a sidebar - 'fixed'
                // anchored to the viewport's edges instead of the card's,
                // floating outside it. 'sticky' stays within the card
                // because it's a normal in-flow child (inherits caseContent's
                // padding automatically) that only stops scrolling once it
                // reaches the top - exactly the "in-card, not viewport" fix
                // that was actually being asked for.
                <View style={{
                  position: 'sticky', top: 0, zIndex: 30, marginHorizontal: -20, marginTop: -20, marginBottom: 12,
                  paddingHorizontal: 20, paddingVertical: 12,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: theme.bg
                }}>
                  <BouncyButton
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                    onPress={handleBackFromDesignerProfile}
                  >
                    <ChevronLeftSVG color={theme.accentLight} size={22} />
                  </BouncyButton>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <BouncyButton
                      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => handleShareDesigner(selectedDesigner)}
                    >
                      <ShareIconSVG color={theme.accentLight} />
                    </BouncyButton>
                    {session && selectedDesigner.id && selectedDesigner.id !== session.user.id && (
                      <View ref={designerDotsWrapRef} style={{ zIndex: 100 }}>
                        <BouncyButton
                          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => {
                            const next = !designerOptionsMenuVisible;
                            if (next && designerDotsWrapRef.current) {
                              designerDotsWrapRef.current.measureInWindow((x, y, width, height) => {
                                const screenWidth = Platform.OS === 'web' ? window.innerWidth : Dimensions.get('window').width;
                                setDesignerMenuPos({ top: y + height + 8, right: Math.max(8, screenWidth - (x + width)) });
                              });
                            }
                            setDesignerOptionsMenuVisible(next);
                          }}
                        >
                          <Text style={{ color: theme.accentLight, fontSize: 20, fontWeight: '900', lineHeight: 20 }}>⋮</Text>
                        </BouncyButton>

                        <Modal
                          transparent
                          visible={designerOptionsMenuVisible}
                          animationType="none"
                          onRequestClose={() => setDesignerOptionsMenuVisible(false)}
                        >
                          <View
                            pointerEvents="box-none"
                            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                          >
                            <TouchableOpacity
                              style={{ flex: 1 }}
                              activeOpacity={1}
                              onPress={() => setDesignerOptionsMenuVisible(false)}
                            />
                            <View style={{
                              position: 'absolute', top: designerMenuPos.top, right: designerMenuPos.right, width: 220,
                              backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border,
                              padding: 6,
                              shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 12
                            }}>
                              <BouncyButton
                                style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                                onPress={() => {
                                  setDesignerOptionsMenuVisible(false);
                                  handleReportContent('user', selectedDesigner.id, selectedDesigner.name);
                                }}
                              >
                                <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>Report Profile</Text>
                              </BouncyButton>
                              <BouncyButton
                                style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                                onPress={() => {
                                  setDesignerOptionsMenuVisible(false);
                                  mutedIds.has(selectedDesigner.id)
                                    ? handleUnmuteDesigner(selectedDesigner.id, selectedDesigner.name)
                                    : handleMuteDesigner(selectedDesigner.id, selectedDesigner.name);
                                }}
                              >
                                <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>
                                  {mutedIds.has(selectedDesigner.id) ? 'Unmute Posts' : 'Mute Posts'}
                                </Text>
                              </BouncyButton>
                              <BouncyButton
                                style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                                onPress={() => {
                                  setDesignerOptionsMenuVisible(false);
                                  handleBlockUser(selectedDesigner.id, selectedDesigner.name);
                                }}
                              >
                                <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Block User</Text>
                              </BouncyButton>
                            </View>
                          </View>
                        </Modal>
                      </View>
                    )}
                  </View>
                </View>
              )}
              <View style={styles.profileCard}>
                {Platform.OS !== 'web' && (
                <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 10 }}>
                    <BouncyButton
                      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => handleShareDesigner(selectedDesigner)}
                    >
                      <ShareIconSVG color={theme.accentLight} />
                    </BouncyButton>
                  </View>
                )}
                <BouncyButton activeOpacity={0.9} onPress={() => setLightboxImageUri(selectedDesigner.avatar)}>
                  <Image source={{ uri: selectedDesigner.avatar }} style={styles.profileLargeAvatar} />
                </BouncyButton>
                <Text style={[styles.profileName, isWebWide && { fontSize: 24 }]}>{selectedDesigner.name}</Text>
                {selectedDesigner.handle ? (
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600', marginBottom: 2 }}>{formatHandleDisplay(selectedDesigner.handle)}</Text>
                ) : null}
                <Text style={styles.profileRole}>{selectedDesigner.role}</Text>
                
                <View style={[styles.iconTextInlineRow, { marginBottom: 12 }]}>
                  <LocationPinSVG />
                  <Text style={styles.profileLocText}>{selectedDesigner.location}</Text>
                </View>

                <Text style={styles.profileBio}>{selectedDesigner.bio}</Text>

                <View style={styles.statsRow}>
                  <BouncyButton
                    style={styles.statItem}
                    onPress={() => openFollowersModal(selectedDesigner)}
                  >
                    <Text style={styles.statNum}>{selectedDesigner.followersCount ?? 0}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </BouncyButton>

                  <View style={styles.statDivider} />

                  <BouncyButton
                    style={styles.statItem}
                    onPress={() => openFollowingModal(selectedDesigner)}
                  >
                    <Text style={styles.statNum}>{selectedDesigner.followingCount ?? 0}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </BouncyButton>
                </View>

                {selectedDesigner.links && selectedDesigner.links.length > 0 && (
                  <View style={styles.socialCircularLinksRow}>
                    {selectedDesigner.links.map((linkUrl, idx) => (
                      <BouncyButton
                        key={idx}
                        style={styles.socialCircleBtn}
                        onPress={() => openExternalLinkWithWarning(linkUrl)}
                        onLongPress={() => setLinkPreview({
                          url: linkUrl,
                          name: getFriendlyLinkName(linkUrl),
                          ownerId: selectedDesigner.id,
                          ownerLabel: selectedDesigner.name
                        })}
                        delayLongPress={350}
                      >
                        {getSocialLogoSVG(linkUrl)}
                      </BouncyButton>
                    ))}
                  </View>
                )}

                <View style={[styles.designerProfileActionsRow, { marginTop: 14 }]}>
                  {!(session && selectedDesigner.id === session.user.id) && (
                    <BouncyButton
                      style={[
                        styles.modalFollowBtn,
                        followedDesigners.includes(selectedDesigner.id) && styles.modalFollowBtnActive
                      ]}
                      onPress={() => toggleFollowDesigner(selectedDesigner.id)}
                    >
                      <Text style={[
                        styles.modalFollowText,
                        followedDesigners.includes(selectedDesigner.id) && styles.modalFollowTextActive
                      ]}>
                        {followedDesigners.includes(selectedDesigner.id) ? 'Following' : (selectedDesigner.followsMe ? 'Follow Back' : '+ Follow')}
                      </Text>
                    </BouncyButton>
                  )}
                </View>
              </View>

              <View
                style={[styles.profileTabsBar, { position: 'relative' }]}
                onLayout={(e) => setDesignerProfileTabBarWidth(e.nativeEvent.layout.width)}
              >
                {designerProfileTabBarWidth > 0 && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      top: 4, bottom: 4, left: 4,
                      width: (designerProfileTabBarWidth - 12) / 2,
                      borderRadius: 99,
                      backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
                      transform: [{
                        translateX: designerProfileTabSlideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, (designerProfileTabBarWidth - 12) / 2 + 4]
                        })
                      }]
                    }}
                  />
                )}
                <BouncyButton
                  style={styles.profileTabBtn}
                  onPress={() => switchDesignerProfileTab('myWork')}
                >
                  <Text style={[styles.profileTabBtnText, designerProfileTab === 'myWork' && styles.profileTabBtnTextActive]}>
                    Portfolios ({selectedDesignerProjects.length})
                  </Text>
                </BouncyButton>

                <BouncyButton
                  style={styles.profileTabBtn}
                  onPress={() => switchDesignerProfileTab('likedWork')}
                >
                  <Text style={[styles.profileTabBtnText, designerProfileTab === 'likedWork' && styles.profileTabBtnTextActive]}>
                    Liked Portfolios ({designerLikedProjects.length})
                  </Text>
                </BouncyButton>
              </View>

              <Animated.View style={{ opacity: designerProfileTabContentAnim }}>
              {designerProfileTab === 'myWork' && (
                <BouncyButton
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginBottom: 10 }}
                  onPress={() => setPortfolioLayoutMode(portfolioLayoutMode === 'compact' ? 'full' : 'compact')}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    {portfolioLayoutMode === 'compact' ? 'Compact View' : 'Full Width View'}
                  </Text>
                  <LayoutToggleSVG mode={portfolioLayoutMode} size={15} />
                </BouncyButton>
              )}

              {designerProfileTab === 'likedWork' && loadingDesignerLikes && (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color="#8B5CF6" />
                </View>
              )}

              {designerProfileTab === 'likedWork' || (designerProfileTab === 'myWork' && portfolioLayoutMode === 'full') ? (
                <ProjectGrid
                  items={designerProfileTab === 'myWork' ? selectedDesignerProjects : designerLikedProjects}
                  onPress={(item) => {
                    setDesignerModalVisible(false);
                    openProjectModal(item);
                  }}
                  onToggleLike={toggleLike}
                  onOpenDesignerProfile={openDesignerProfileById}
                  onToggleFollow={toggleFollowDesigner}
                  followedDesigners={followedDesigners}
                  currentUserId={session ? session.user.id : null}
                styles={styles}
                />
              ) : (
                <TwoRowHorizontalGrid
                  items={
                    designerProfileTab === 'myWork'
                      ? selectedDesignerProjects
                      : designerLikedProjects
                  }
                  onPress={(item) => {
                    setDesignerModalVisible(false);
                    openProjectModal(item);
                  }}
                  onOpenDesignerProfile={openDesignerProfileById}
                  onToggleFollow={toggleFollowDesigner}
                  followedDesigners={followedDesigners}
                  currentUserId={session ? session.user.id : null}
                styles={styles}
                />
              )}
              </Animated.View>
            </ScrollView>
          </SafeAreaView>
          </View>
        );

        if (Platform.OS === 'web' && isWebWide) {
          return designerModalVisible && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: topStackedPage === 'designer' ? 160 : 150, elevation: 10, backgroundColor: theme.bg }}>
              {designerProfileContent}
            </View>
          );
        }

        return (
          <Modal
            animationType={Platform.OS === 'web' ? 'none' : 'slide'}
            transparent={false}
            visible={designerModalVisible}
            onRequestClose={handleBackFromDesignerProfile}
          >
            {designerProfileContent}
          </Modal>
        );
      })()}

      {/* PORTFOLIO TYPE SELECTOR - new first step before the wizard itself
          opens. Only UI/UX is actually functional right now; the other
          three show as visibly muted "coming soon" cards with their own
          full-opacity interest button, so the disabled state doesn't
          accidentally suppress the one thing that IS actionable on them. */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent={true}
        visible={portfolioTypeModalVisible}
        onRequestClose={() => setPortfolioTypeModalVisible(false)}
      >
        {/* Matches the main wizard's own popup treatment exactly on
            desktop/tablet (same backdrop, same wizardModalWidth/880 sizing)
            rather than using its own separate one-off dimensions - this is
            a step in that same wizard flow, so it should look like it
            belongs to it. Mobile/narrow web stays genuinely fullscreen,
            unchanged from before - only the isWebWide branch is new here. */}
        <View
          style={isWebWide
            ? { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)', padding: 20 }
            : { flex: 1 }}
          onStartShouldSetResponder={() => isWebWide}
          onResponderRelease={() => { if (isWebWide) setPortfolioTypeModalVisible(false); }}
        >
          <View
            style={isWebWide
              ? { width: '100%', maxWidth: wizardModalWidth, height: Math.min(880, Dimensions.get('window').height - 48), borderRadius: 20, overflow: 'hidden', backgroundColor: theme.bg }
              : { flex: 1, width: '100%' }}
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
          <View style={styles.modalTopBar}>
            <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>What are you sharing?</Text>
            <BouncyButton style={styles.closeBtn} onPress={() => setPortfolioTypeModalVisible(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </BouncyButton>
          </View>

          {/* 2-column grid on desktop/tablet (2 rows of 2, each card at
              ~48% width so a gap can sit between them), single stacked
              column on mobile - same as before. Each card still sizes to
              its own content height either way, nothing forces height. */}
          <View style={{ flex: 1, padding: 20, flexDirection: isWebWide ? 'row' : 'column', flexWrap: isWebWide ? 'wrap' : 'nowrap', gap: 12 }}>
            {/* UI/UX - the only functional type right now. Whole-card tap
                removed in favor of an explicit Continue button, matching
                how the coming-soon cards below only have their own inner
                button as the actionable element - consistent interaction
                model across all 4 cards instead of "tap anywhere" on just
                this one. */}
            <View
              style={{
                width: isWebWide ? '48%' : '100%',
                borderWidth: 1.5, borderColor: theme.accent, borderRadius: 14, padding: 16,
                backgroundColor: themeMode === 'light' ? '#EDE9FE' : 'rgba(139,92,246,0.1)',
                overflow: 'hidden'
              }}
            >
              <PortfolioTypeCardWatermark
                imageSource={themeMode === 'light'
                  ? require('./assets/card-images/card-ui-ux-light.png')
                  : require('./assets/card-images/card-ui-ux-dark.png')}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <CursorArrowSVG size={17} color={theme.accent} />
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14.5 }}>UI/UX Design</Text>
                {isWebWide && <FigmaLogoSVG />}
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16, marginBottom: 10, maxWidth: '55%' }} numberOfLines={2}>
                Interactive app and web design with Figma prototypes.
              </Text>
              {isWebWide ? (
                <BouncyButton
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'flex-end',
                    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, marginTop: 8,
                    backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6'
                  }}
                  onPress={() => {
                    setSelectedPortfolioType('ui_ux');
                    proceedToPortfolioWizard();
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12.5 }}>Continue</Text>
                  <ChevronRightSVG color="#FFFFFF" size={15} />
                </BouncyButton>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FigmaLogoSVG />
                  <BouncyButton
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                      paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99,
                      backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6'
                    }}
                    onPress={() => {
                      setSelectedPortfolioType('ui_ux');
                      proceedToPortfolioWizard();
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12.5 }}>Continue</Text>
                    <ChevronRightSVG color="#FFFFFF" size={15} />
                  </BouncyButton>
                </View>
              )}
            </View>

            {/* Graphic Design, Illustration, Frontend - coming soon */}
            {[
              { key: 'graphic_design', title: 'Graphic Design', desc: 'Branding and visual design work.', icon: <PaletteSVG size={16} color={theme.textSecondary} />, image: themeMode === 'light' ? require('./assets/card-images/card-graphic-design-light.png') : require('./assets/card-images/card-graphic-design-dark.png') },
              { key: 'illustration', title: 'Illustration', desc: 'Digital art and character illustration.', icon: <PaintBrushSVG size={16} color={theme.textSecondary} />, image: themeMode === 'light' ? require('./assets/card-images/card-illustration-light.png') : require('./assets/card-images/card-illustration-dark.png') },
              { key: 'frontend', title: 'Frontend Development', desc: 'Live code demos alongside your source.', icon: <CodeBracketsSVG size={16} color={theme.textSecondary} />, image: themeMode === 'light' ? require('./assets/card-images/card-frontend-light.png') : require('./assets/card-images/card-frontend-dark.png') }
            ].map((type) => (
              <View
                key={type.key}
                style={{
                  width: isWebWide ? '48%' : '100%',
                  borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 16,
                  overflow: 'hidden', opacity: 0.6
                }}
              >
                <PortfolioTypeCardWatermark
                  imageSource={type.image}
                />
                {/* Constrained to ~50% width - the image itself dominates
                    roughly the right half of the card, so text spanning
                    the full width was overlapping/competing with it rather
                    than sitting clearly on the readable left portion. */}
                <View style={{ maxWidth: '55%' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {type.icon}
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14.5 }}>{type.title}</Text>
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16, marginBottom: 6 }} numberOfLines={2}>
                    {type.desc}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Coming Soon
                  </Text>
                </View>

                {/* Deliberately outside the opacity:0.5 View above - stays
                    fully visible/normal opacity so it doesn't read as
                    disabled along with everything else on the card. Same
                    hug-content, right-aligned placement as the UI/UX card's
                    Continue button above, for a consistent "action sits
                    bottom-right under the description" pattern across all
                    4 cards. */}
                <BouncyButton
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-end',
                    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, marginTop: 8,
                    backgroundColor: myFeatureInterests.has(type.key) ? '#10B981' : theme.accent
                  }}
                  onPress={() => {
                    if (!requireAuth()) return;
                    setInterestConfirmMode(myFeatureInterests.has(type.key) ? 'remove' : 'add');
                    setInterestConfirmTarget(type.key);
                  }}
                >
                  {myFeatureInterests.has(type.key) ? (
                    <>
                      <CheckIconSVG color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>Interested</Text>
                    </>
                  ) : (
                    <>
                      <BellOutlineSVG size={14} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>I'm Interested</Text>
                    </>
                  )}
                </BouncyButton>
              </View>
            ))}
          </View>
        </SafeAreaView>
          </View>
        </View>
      </Modal>

      {/* Confirmation before actually registering interest - a quick
          "are you sure, not a misclick" step, matching how other
          one-way/committing actions in this app confirm first. */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!interestConfirmTarget}
        onRequestClose={() => setInterestConfirmTarget(null)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={styles.confirmIconCircle}>
              <BellOutlineSVG size={22} color={theme.accent} />
            </View>
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>{interestConfirmMode === 'remove' ? 'Remove Interest?' : 'Register Interest?'}</Text>
            <Text style={styles.confirmSubText}>
              {interestConfirmMode === 'remove'
                ? "You'll be taken off the list for this feature. You can always register interest again later if you change your mind."
                : "This ties your account to this feature so we know real demand exists before building it - not anonymous. We may reach out with a short survey (e.g. which tools you'd want supported). See Privacy Policy for details."}
            </Text>
            <View style={[styles.confirmActionsRow, { justifyContent: 'flex-end' }]}>
              <BouncyButton
                style={[styles.confirmCancelBtn, { flex: 0, paddingHorizontal: 20 }]}
                onPress={() => setInterestConfirmTarget(null)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </BouncyButton>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 0, paddingHorizontal: 20 }]}
                onPress={handleConfirmFeatureInterest}
              >
                <View style={styles.iconTextInlineRow}>
                  <CheckIconSVG color="#FFFFFF" />
                  <Text style={styles.confirmDeleteText}>{interestConfirmMode === 'remove' ? 'Yes, Remove Me' : "Yes, I'm Interested"}</Text>
                </View>
              </BouncyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* PORTFOLIO REPORT MODAL - 2 one-tap preselected reasons plus a
          freeform "something else" option with its own text input, instead
          of the generic Spam/Inappropriate/Other alert used for reporting
          users/tags elsewhere. Reuses the same reports table/submitReport
          function - just a friendlier, more specific front-end for
          portfolios specifically. */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={portfolioReportModalVisible}
        onRequestClose={() => setPortfolioReportModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={[styles.customConfirmCard, isWebWide && { maxWidth: 420 }]}>
            <Text style={styles.confirmTitle}>Report This Portfolio</Text>
            <Text style={[styles.confirmSubText, { marginBottom: 16 }]}>
              Help us keep DECENT accurate and safe. What's the issue?
            </Text>

            <View style={{ width: '100%', gap: 8 }}>
              <BouncyButton
                style={{
                  padding: 12, borderRadius: 12, borderWidth: 1.5,
                  borderColor: portfolioReportSelectedReason === 'ai_undisclosed' ? theme.accent : theme.border,
                  backgroundColor: portfolioReportSelectedReason === 'ai_undisclosed' ? (themeMode === 'light' ? '#EDE9FE' : 'rgba(139,92,246,0.1)') : 'transparent'
                }}
                onPress={() => setPortfolioReportSelectedReason('ai_undisclosed')}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13.5, marginBottom: 2 }}>Undisclosed AI Use</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16 }}>
                  This looks like it was made with AI, but wasn't marked that way.
                </Text>
              </BouncyButton>

              <BouncyButton
                style={{
                  padding: 12, borderRadius: 12, borderWidth: 1.5,
                  borderColor: portfolioReportSelectedReason === 'nsfw_misuse' ? theme.accent : theme.border,
                  backgroundColor: portfolioReportSelectedReason === 'nsfw_misuse' ? (themeMode === 'light' ? '#EDE9FE' : 'rgba(139,92,246,0.1)') : 'transparent'
                }}
                onPress={() => setPortfolioReportSelectedReason('nsfw_misuse')}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13.5, marginBottom: 2 }}>NSFW Tag Misuse</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16 }}>
                  This content's NSFW tag doesn't match what's actually shown.
                </Text>
              </BouncyButton>

              <BouncyButton
                style={{
                  padding: 12, borderRadius: 12, borderWidth: 1.5,
                  borderColor: portfolioReportSelectedReason === 'other' ? theme.accent : theme.border,
                  backgroundColor: portfolioReportSelectedReason === 'other' ? (themeMode === 'light' ? '#EDE9FE' : 'rgba(139,92,246,0.1)') : 'transparent'
                }}
                onPress={() => setPortfolioReportSelectedReason('other')}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13.5 }}>Something Else</Text>
                {portfolioReportSelectedReason === 'other' && (
                  <FocusableTextInput
                    style={[styles.formInput, { marginTop: 8 }]}
                    placeholder="Tell us what's wrong..."
                    placeholderTextColor={theme.textSecondary}
                    value={portfolioReportOtherText}
                    onChangeText={setPortfolioReportOtherText}
                    multiline
                  />
                )}
              </BouncyButton>
            </View>

            <View style={[styles.confirmActionsRow, { marginTop: 16, justifyContent: 'flex-end' }]}>
              <BouncyButton
                style={[styles.confirmCancelBtn, { flex: 0, paddingHorizontal: 20 }]}
                onPress={() => { setPortfolioReportModalVisible(false); setPortfolioReportSelectedReason(null); setPortfolioReportOtherText(''); }}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </BouncyButton>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 0, paddingHorizontal: 20, opacity: portfolioReportSelectedReason ? 1 : 0.4 }]}
                disabled={!portfolioReportSelectedReason}
                onPress={handleSubmitPortfolioReport}
              >
                <Text style={styles.confirmDeleteText}>Submit Report</Text>
              </BouncyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4-STEP WIZARD MODAL FOR ADDING/EDITING PORTFOLIO PACKAGE */}
      <Modal
        animationType="none"
        transparent={true}
        visible={addModalVisible}
        onRequestClose={handleCloseUploadWizard}
      >
        {/* transparent is now always true (was false) so a dim backdrop can
            show behind the centered card on wide web. On native/narrow web
            the inner wrapper below fills the screen with a solid
            theme.bg-colored View, which looks visually identical to the old
            opaque Modal - nothing changes there. */}
        <View
          style={isWebWide
            ? { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)', padding: 20 }
            : { flex: 1 }}
          onStartShouldSetResponder={() => isWebWide}
          onResponderRelease={() => { if (isWebWide) handleCloseUploadWizard(); }}
        >
          <View
            style={isWebWide
              ? { width: '100%', maxWidth: wizardModalWidth, maxHeight: Math.min(880, Dimensions.get('window').height - 48), borderRadius: 20, overflow: 'hidden' }
              : { flex: 1, width: '100%' }}
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
        {/* "App icon expanding into the app" illusion, native only -
            REWORKED from a single-tree scale transform to a cheap ghost
            shape + crossfade, because the previous version was scale-
            transforming the ENTIRE wizard content tree (ScrollViews, every
            form field, every icon) for the whole 600ms - transforming a
            large, complex view hierarchy like that is expensive to keep at
            60fps on real hardware, which is almost certainly what read as
            "skipping frames" rather than a smooth expand.

            Now: a simple, childless rounded rectangle (the ghost) carries
            the scale/translate animation - cheap regardless of how complex
            the real wizard is, since there's nothing inside it to also
            transform. The real content renders at full size the entire
            time (never transformed, so never re-rasterized due to scale),
            starting fully transparent. Near the end of the animation the
            ghost fades out while the real content fades in - a crossfade
            handoff instead of the previous hard 55%-then-jump opacity
            curve, which read as an abrupt pop rather than a reveal. */}
        {Platform.OS !== 'web' && wizardOriginRect && (() => {
          const winW = Dimensions.get('window').width;
          const winH = Dimensions.get('window').height;
          const originCenterX = wizardOriginRect.x + wizardOriginRect.width / 2;
          const originCenterY = wizardOriginRect.y + wizardOriginRect.height / 2;
          const targetCenterX = winW / 2;
          const targetCenterY = winH / 2;
          return (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: theme.bg,
                opacity: wizardExpandAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: wizardExpandAnim.interpolate({ inputRange: [0, 1], outputRange: [originCenterX - targetCenterX, 0] }) },
                  { translateY: wizardExpandAnim.interpolate({ inputRange: [0, 1], outputRange: [originCenterY - targetCenterY, 0] }) },
                  { scaleX: wizardExpandAnim.interpolate({ inputRange: [0, 1], outputRange: [Math.max(wizardOriginRect.width / winW, 0.01), 1] }) },
                  { scaleY: wizardExpandAnim.interpolate({ inputRange: [0, 1], outputRange: [Math.max(wizardOriginRect.height / winH, 0.01), 1] }) }
                ]
              }}
            />
          );
        })()}
        <View style={{ flex: 1, width: '100%', backgroundColor: theme.bg }}>
        <Animated.View
          style={{
            flex: 1,
            opacity: Platform.OS !== 'web' && wizardOriginRect
              ? wizardExpandAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1] })
              : 1
          }}
        >
        <SafeAreaView style={[styles.modalContainer, isWebWide && { maxWidth: '100%', alignSelf: 'stretch' }]}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border
          }}>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>
              {formStep === 1 ? 'Details' : formStep === 2 ? 'Links' : formStep === 3 ? 'Media' : 'Review'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {[1, 2, 3, 4].map((step) => (
                <React.Fragment key={step}>
                  {step > 1 && (
                    <View style={{ width: 12, height: 1.5, backgroundColor: theme.border }} />
                  )}
                  {formStep === step ? (
                    <Animated.View
                      style={{
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: 'transparent',
                        borderWidth: 1.5, borderStyle: 'dashed',
                        borderColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6',
                        transform: [{
                          rotate: wizardStepSpinnerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
                        }]
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 10, height: 10, borderRadius: 5,
                        backgroundColor: formStep > step ? '#22C55E' : 'transparent',
                        borderWidth: formStep > step ? 0 : 1.5,
                        borderColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6'
                      }}
                    />
                  )}
                </React.Fragment>
              ))}
              </View>
              {/* Exits the wizard via the same handleCloseUploadWizard ->
                  discardConfirmModalVisible flow used everywhere else. Now
                  shown on every platform, not just web - step 1 has no
                  "Back" button on native either, so this is the only way to
                  back out of the wizard entirely without relying on
                  Android's hardware back (which iOS doesn't have an
                  equivalent for inside this modal). */}
              <BouncyButton
                onPress={handleCloseUploadWizard}
                style={{
                  width: 32, height: 32, borderRadius: 16,
                  borderWidth: 1.5, borderColor: theme.border,
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <CrossIconSVG color={theme.textSecondary} size={14} />
              </BouncyButton>
            </View>
          </View>

          <AppKeyboardAwareScrollView
            style={styles.caseScrollView}
            contentContainerStyle={[styles.caseContent, { paddingBottom: 110 }]}
            enableOnAndroid={true}
            extraScrollHeight={140}
            keyboardShouldPersistTaps="handled"
          >
              {formStep === 1 && (
                <View>
                  <Text style={styles.formGroupLabel}>Project Title *</Text>
                  <FocusableTextInput
                    style={[styles.formInput, errors.fTitle && styles.inputErrorBorder]}
                    placeholder="e.g. Smart FinTech App"
                    placeholderTextColor="#94A3B8"
                    value={fTitle}
                    onChangeText={(t) => { setFTitle(t); setErrors({ ...errors, fTitle: null }); }}
                  />
                  {errors.fTitle ? <Text style={styles.errorText}>{errors.fTitle}</Text> : null}

                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.formGroupLabel}>
                      Categories & Tags * (Selected: {fCategories.length}/10, min 3)
                    </Text>

                    <BouncyButton
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: theme.surface, borderWidth: 1, borderColor: errors.fCategories ? '#EF4444' : theme.border,
                        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12
                      }}
                      onPress={() => {
                        setCategorySearchQuery('');
                        setCategoryPickerModalVisible(true);
                      }}
                    >
                      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                        {fCategories.length > 0 ? 'Tap to edit selection' : 'Tap to select categories & tags'}
                      </Text>
                      <ChevronRightSVG color="#8B5CF6" size={16} />
                    </BouncyButton>

                    {fCategories.length > 0 && (
                      <View style={[styles.selectedCategoriesRow, { marginTop: 10, marginBottom: 0 }]}>
                        {fCategories.map((cat) => (
                          <BouncyButton
                            key={cat}
                            style={styles.selectedCategoryPill}
                            onPress={() => toggleCategorySelection(cat)}
                          >
                            <Text style={styles.selectedCategoryText}>{cat} ✕</Text>
                          </BouncyButton>
                        ))}
                      </View>
                    )}

                    {errors.fCategories ? <Text style={styles.errorText}>{errors.fCategories}</Text> : null}
                  </View>

                  <View style={{
                    marginTop: 12, backgroundColor: theme.surface, borderRadius: 12,
                    borderWidth: 1, borderColor: fIsNsfw ? '#EF4444' : theme.border, padding: 10
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[styles.settingItemTitle, { flex: 1, fontSize: 13 }]}>Mark as NSFW</Text>
                      <Switch
                        value={fIsNsfw}
                        onValueChange={setFIsNsfw}
                        trackColor={{ false: theme.border, true: '#EF4444' }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, lineHeight: 15, marginTop: 4 }}>
                      Explicit/sensitive content. Hidden from For You; only shown in search with Safe Search off.
                    </Text>
                  </View>

                  {/* AI disclosure - deliberately starts with NEITHER option
                      selected (fIsAiGenerated is null, not defaulted to
                      false) so the uploader has to make an active choice
                      rather than a toggle silently defaulting to "No AI"
                      for them. Validated as required before Step 1 can
                      advance, same as Categories above. */}
                  <View style={{
                    marginTop: 10, backgroundColor: theme.surface, borderRadius: 12,
                    borderWidth: 1, borderColor: errors.fAiGenerated ? '#EF4444' : theme.border, padding: 10
                  }}>
                    <Text style={[styles.settingItemTitle, { fontSize: 13, marginBottom: 3 }]}>AI-Generated Content *</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, lineHeight: 15, marginBottom: 8 }}>
                      Used AI for any part of this work - a few steps, most of it, or all of it? Select "With AI". Misrepresenting this will be acted on.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <BouncyButton
                        style={{
                          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                          paddingVertical: 8, borderRadius: 99,
                          borderWidth: 1.5, borderColor: fIsAiGenerated === false ? '#EF4444' : theme.border,
                          backgroundColor: fIsAiGenerated === false ? 'rgba(239,68,68,0.1)' : 'transparent'
                        }}
                        onPress={() => setFIsAiGenerated(false)}
                      >
                        <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 7, fontWeight: '900' }}>AI</Text>
                        </View>
                        <Text style={{ color: fIsAiGenerated === false ? '#EF4444' : theme.textSecondary, fontWeight: '700', fontSize: 12.5 }}>No AI</Text>
                      </BouncyButton>
                      <BouncyButton
                        style={{
                          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                          paddingVertical: 8, borderRadius: 99,
                          borderWidth: 1.5, borderColor: fIsAiGenerated === true ? '#10B981' : theme.border,
                          backgroundColor: fIsAiGenerated === true ? 'rgba(16,185,129,0.1)' : 'transparent'
                        }}
                        onPress={() => setFIsAiGenerated(true)}
                      >
                        <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 7, fontWeight: '900' }}>AI</Text>
                        </View>
                        <Text style={{ color: fIsAiGenerated === true ? '#10B981' : theme.textSecondary, fontWeight: '700', fontSize: 12.5 }}>With AI</Text>
                      </BouncyButton>
                    </View>
                    {errors.fAiGenerated ? <Text style={[styles.errorText, { marginTop: 6 }]}>{errors.fAiGenerated}</Text> : null}
                  </View>

                  <Modal
                    animationType={Platform.OS === 'web' ? 'none' : 'slide'}
                    transparent={true}
                    visible={categoryPickerModalVisible}
                    onRequestClose={() => setCategoryPickerModalVisible(false)}
                  >
                    <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
                      onStartShouldSetResponder={() => Platform.OS === 'web'}
                      onResponderRelease={() => setCategoryPickerModalVisible(false)}
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
                      <SafeAreaView style={[styles.overlayModalContainer, { height: '75%' }]}
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
                          <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>Categories & Tags</Text>
                          <BouncyButton style={styles.closeBtn} onPress={() => setCategoryPickerModalVisible(false)}>
                            <Text style={styles.closeBtnText}>✕</Text>
                          </BouncyButton>
                        </View>

                        <View style={{ padding: 16, paddingBottom: 8 }}>
                          <FocusableTextInput
                            style={styles.categorySearchInput}
                            placeholder="Search or add custom category/tag..."
                            placeholderTextColor="#94A3B8"
                            value={categorySearchQuery}
                            onChangeText={setCategorySearchQuery}
                          />
                          <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                            Selected: {fCategories.length}/10 (minimum 3 required)
                          </Text>

                          {fCategories.length > 0 && (
                            <View style={[styles.selectedCategoriesRow, { marginTop: 10, marginBottom: 0 }]}>
                              {fCategories.map((cat) => (
                                <BouncyButton
                                  key={cat}
                                  style={styles.selectedCategoryPill}
                                  onPress={() => toggleCategorySelection(cat)}
                                >
                                  <Text style={styles.selectedCategoryText}>{cat} ✕</Text>
                                </BouncyButton>
                              ))}
                            </View>
                          )}
                        </View>

                        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}>
                          {filteredCategoriesForWizard.map((cat) => {
                            const isSelected = fCategories.includes(cat);
                            return (
                              <BouncyButton
                                key={cat}
                                style={[
                                  styles.categoryVerticalItem,
                                  isSelected && styles.categoryVerticalItemActive
                                ]}
                                onPress={() => toggleCategorySelection(cat)}
                              >
                                <Text style={[
                                  styles.categoryVerticalText,
                                  isSelected && styles.categoryVerticalTextActive
                                ]}>
                                  {isSelected ? '✓ ' : ''}{cat}
                                </Text>
                              </BouncyButton>
                            );
                          })}

                          {filteredCategoriesForWizard.length === 0 && categorySearchQuery.trim() !== '' && (
                            <BouncyButton
                              style={styles.addCustomCategoryItemBtn}
                              onPress={handleAddCustomCategory}
                            >
                              <Text style={styles.addCustomCategoryItemText}>
                                + Create Custom Tag "{categorySearchQuery.trim()}"
                              </Text>
                            </BouncyButton>
                          )}
                        </ScrollView>

                        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
                          <BouncyButton
                            style={styles.saveAccountSettingsBtn}
                            onPress={() => setCategoryPickerModalVisible(false)}
                          >
                            <Text style={styles.submitBtnText}>Done ({fCategories.length} selected)</Text>
                          </BouncyButton>
                        </View>
                      </SafeAreaView>
                    </View>
                  </Modal>

                  <Text style={[styles.formGroupLabel, { marginTop: 14 }]}>Short Brief / Summary *</Text>
                  <FocusableTextInput
                    style={[styles.formInput, { height: 80 }, errors.fBrief && styles.inputErrorBorder]}
                    multiline
                    placeholder="1-2 sentences summarizing goals and outcome..."
                    placeholderTextColor="#94A3B8"
                    value={fBrief}
                    onChangeText={(t) => { setFBrief(t); setErrors({ ...errors, fBrief: null }); }}
                  />
                  {errors.fBrief ? <Text style={styles.errorText}>{errors.fBrief}</Text> : null}

                  <Text style={styles.formGroupLabel}>Detailed Description (Optional)</Text>
                  <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 8 }}>
                    Build your case study from text, image, and side-by-side row blocks.
                  </Text>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={[styles.formGroupLabel, { marginBottom: 0 }]}>Preview</Text>
                    {fContentBlocks.length > 0 && (
                      <BouncyButton
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
                          backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6'
                        }}
                        onPress={() => setFullscreenDescEditorVisible(true)}
                      >
                        <EditIconSVG color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Edit</Text>
                      </BouncyButton>
                    )}
                  </View>

                  <View style={[styles.formInput, { minHeight: 60, height: 'auto', paddingVertical: 10, borderRadius: 12 }]}>
                    {fContentBlocks.length > 0 ? (
                      renderContentBlocks(fContentBlocks, undefined, theme)
                    ) : (
                      <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
                        <BouncyButton
                          style={{ backgroundColor: '#8B5CF6', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 99 }}
                          onPress={() => setFullscreenDescEditorVisible(true)}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Start Editing</Text>
                        </BouncyButton>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Nested inside the wizard's own Modal (not a separate
                  <Modal>) so it stays within the same popup bounds - on web
                  wide that's the wizard's centered card, not the full
                  viewport. Matches the same technique used for the discard
                  confirmation elsewhere in this wizard. */}
              {fullscreenDescEditorVisible && (
              <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 8000, elevation: 28 }}>
                <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
                  <View style={[styles.modalTopBar, { justifyContent: 'space-between' }]}>
                    <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>Detailed Description</Text>
                    <BouncyButton onPress={() => setFormattingGuideVisible(true)}>
                      <HelpCircleIconSVG />
                    </BouncyButton>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
                      Build your case study from blocks
                    </Text>

                    <BouncyButton
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto',
                        height: 32, paddingHorizontal: 12, borderRadius: 8,
                        borderWidth: 1, borderColor: '#8B5CF6',
                        backgroundColor: descEditorMode === 'preview' ? '#8B5CF6' : 'transparent'
                      }}
                      onPress={() => setDescEditorMode(descEditorMode === 'edit' ? 'preview' : 'edit')}
                    >
                      {descEditorMode === 'preview' ? <EyeOpenSVG color="#FFFFFF" /> : <EyeClosedSVG />}
                      <Text style={{ color: descEditorMode === 'preview' ? '#FFFFFF' : theme.accent, fontSize: 12, fontWeight: '700' }}>
                        Preview
                      </Text>
                    </BouncyButton>

                    <BouncyButton
                      style={{
                        alignItems: 'center', justifyContent: 'center',
                        height: 32, width: 32, borderRadius: 8, marginLeft: 8,
                        backgroundColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6'
                      }}
                      onPress={() => setFullscreenDescEditorVisible(false)}
                    >
                      <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <Path d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </BouncyButton>
                  </View>

                  {descEditorMode === 'preview' ? (
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                      {fContentBlocks.length > 0 ? (
                        renderContentBlocks(fContentBlocks, undefined, theme)
                      ) : (
                        <Text style={{ color: '#64748B', fontSize: 13 }}>Nothing written yet - switch to Edit to start.</Text>
                      )}
                    </ScrollView>
                  ) : (
                    <AppKeyboardAwareScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
                      keyboardShouldPersistTaps="handled"
                      enableOnAndroid={true}
                      extraScrollHeight={140}
                    >
                        {fContentBlocks.map((block, idx) => (
                          <View
                            key={block.id}
                            style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12 }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                              <BouncyButton
                                style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', opacity: idx === 0 ? 0.35 : 1 }}
                                disabled={idx === 0}
                                onPress={() => moveBlockToIndex(idx, idx - 1)}
                              >
                                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700' }}>▲</Text>
                              </BouncyButton>
                              <TextInput
                                style={{
                                  width: 32, height: 24, textAlign: 'center', color: theme.text, fontSize: 12, fontWeight: '700',
                                  backgroundColor: theme.bg, borderRadius: 6, borderWidth: 1, borderColor: theme.border, padding: 0
                                }}
                                keyboardType="number-pad"
                                value={orderInputDrafts[block.id] !== undefined ? orderInputDrafts[block.id] : String(idx + 1)}
                                onChangeText={(t) =>
                                  setOrderInputDrafts((prev) => ({ ...prev, [block.id]: t.replace(/[^0-9]/g, '') }))
                                }
                                onEndEditing={() => commitOrderInputDraft(block.id)}
                              />
                              <BouncyButton
                                style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', opacity: idx === fContentBlocks.length - 1 ? 0.35 : 1 }}
                                disabled={idx === fContentBlocks.length - 1}
                                onPress={() => moveBlockToIndex(idx, idx + 1)}
                              >
                                <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700' }}>▼</Text>
                              </BouncyButton>
                              <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginLeft: 4 }}>
                                {block.type === 'text' ? 'Text' : block.type === 'image' ? 'Image' : 'Row (2-up)'}
                              </Text>
                              <BouncyButton style={{ marginLeft: 'auto', padding: 4 }} onPress={() => deleteBlock(block.id)}>
                                <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '700' }}>Remove</Text>
                              </BouncyButton>
                            </View>

                            {block.type === 'text' && (
                              <View>
                                <FocusableTextInput
                                  style={{
                                    minHeight: 90, color: theme.text, fontSize: 14, lineHeight: 20,
                                    padding: 10, textAlignVertical: 'top', textAlign: block.align || 'left',
                                    backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: 10
                                  }}
                                  multiline
                                  placeholder="Write this block's text..."
                                  placeholderTextColor="#94A3B8"
                                  value={block.markdown}
                                  onChangeText={(t) => updateTextBlockMarkdown(block.id, t)}
                                  onSelectionChange={(e) => {
                                    const selection = e.nativeEvent.selection;
                                    setBlockSelections((prev) => ({ ...prev, [block.id]: selection }));
                                  }}
                                  dataDetectorTypes="none"
                                  autoCorrect={false}
                                />
                                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                  {MARKDOWN_TOOLBAR_BUTTONS.map((btn) => (
                                    <BouncyButton
                                      key={btn.label}
                                      style={{ backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12 }}
                                      onPress={() => applyMarkdownToBlock(block.id, btn)}
                                    >
                                      <Text style={{
                                        color: theme.accent,
                                        fontWeight: '800',
                                        fontStyle: btn.label === 'I' ? 'italic' : 'normal',
                                        textDecorationLine: btn.label === 'U' ? 'underline' : 'none'
                                      }}>{btn.label}</Text>
                                    </BouncyButton>
                                  ))}
                                </View>
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                                  {['left', 'center', 'right'].map((alignOpt) => (
                                    <BouncyButton
                                      key={alignOpt}
                                      style={{
                                        backgroundColor: (block.align || 'left') === alignOpt ? (themeMode === 'light' ? '#6D28D9' : '#8B5CF6') : theme.bg,
                                        borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12
                                      }}
                                      onPress={() => setTextBlockAlign(block.id, alignOpt)}
                                    >
                                      <AlignIconSVG align={alignOpt} color={(block.align || 'left') === alignOpt ? '#FFFFFF' : theme.textSecondary} size={15} />
                                    </BouncyButton>
                                  ))}
                                </View>
                              </View>
                            )}

                            {block.type === 'image' && (
                              <View>
                                {block.uri ? (
                                  <View>
                                    <View style={{ position: 'relative' }}>
                                      <Image
                                        source={{ uri: block.uri }}
                                        style={{ width: '100%', height: getImageBlockHeight(block.aspectMode, STANDALONE_IMAGE_WIDTH), borderRadius: 10, backgroundColor: theme.bg }}
                                        resizeMode="cover"
                                      />
                                      <BouncyButton
                                        style={{
                                          position: 'absolute', bottom: 8, right: 8,
                                          width: 32, height: 32, borderRadius: 16,
                                          backgroundColor: 'rgba(11,15,23,0.65)',
                                          alignItems: 'center', justifyContent: 'center'
                                        }}
                                        onPress={() => recropImageBlock(block.id, block.aspectMode)}
                                      >
                                        <CropIconSVG color="#FFFFFF" size={16} />
                                      </BouncyButton>
                                    </View>
                                  </View>
                                ) : (
                                  <View style={{ width: '100%', height: 100, borderRadius: 10, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: '#64748B', fontSize: 12 }}>No image selected</Text>
                                  </View>
                                )}
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                  <BouncyButton
                                    style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: '#8B5CF6' }}
                                    onPress={() => replaceImageBlock(block.id)}
                                  >
                                    <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>
                                      {block.uri ? 'Replace Image' : 'Choose Image'}
                                    </Text>
                                  </BouncyButton>
                                  {block.uri && (
                                    <BouncyButton
                                      style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, borderColor: theme.border }}
                                      onPress={() => setImageBlockAspect(block.id, toggleAspectMode(block.aspectMode))}
                                    >
                                      <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
                                        Change Size ({block.aspectMode === 'wide' ? '16:9' : 'Square'})
                                      </Text>
                                    </BouncyButton>
                                  )}
                                </View>
                              </View>
                            )}

                            {block.type === 'row' && (
                              <View>
                                <BouncyButton
                                  style={{
                                    alignSelf: 'center', marginBottom: 8,
                                    flexDirection: 'row', alignItems: 'center', gap: 6,
                                    paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8,
                                    borderWidth: 1, borderColor: themeMode === 'light' ? '#6D28D9' : '#8B5CF6'
                                  }}
                                  onPress={() => swapRowColumns(block.id)}
                                >
                                  <Text style={{ color: themeMode === 'light' ? '#6D28D9' : theme.accent, fontSize: 12, fontWeight: '700' }}>⇄ Swap</Text>
                                </BouncyButton>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                {[0, 1].map((colIdx) => {
                                  const col = block.columns[colIdx];
                                  return (
                                    <View key={colIdx} style={{ flex: 1 }}>
                                      {!col ? (
                                        <View style={{ flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 8, backgroundColor: theme.bg }}>
                                          <BouncyButton
                                            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 99 }}
                                            onPress={() => addTextToRowColumn(block.id, colIdx)}
                                          >
                                            <TextBlockIconSVG size={26} />
                                            <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '700', marginTop: 4 }}>Text</Text>
                                          </BouncyButton>
                                          <BouncyButton
                                            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 99 }}
                                            onPress={() => addImageToRowColumn(block.id, colIdx)}
                                          >
                                            <ImageIconSVG size={26} />
                                            <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '700', marginTop: 4 }}>Image</Text>
                                          </BouncyButton>
                                        </View>
                                      ) : col.type === 'text' ? (
                                        <View>
                                          <FocusableTextInput
                                            style={{
                                              minHeight: ROW_BLOCK_IMAGE_HEIGHT, color: theme.text, fontSize: 13, lineHeight: 18,
                                              padding: 8, textAlignVertical: 'top', textAlign: col.align || 'left',
                                              backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: 8
                                            }}
                                            multiline
                                            placeholder="Text..."
                                            placeholderTextColor="#94A3B8"
                                            value={col.markdown}
                                            onChangeText={(t) => updateRowColumnMarkdown(block.id, colIdx, t)}
                                            onSelectionChange={(e) => {
                                              const selection = e.nativeEvent.selection;
                                              setBlockSelections((prev) => ({ ...prev, [`${block.id}:${colIdx}`]: selection }));
                                            }}
                                            dataDetectorTypes="none"
                                            autoCorrect={false}
                                          />
                                          <View style={{ flexDirection: 'row', marginTop: 6 }}>
                                            {MARKDOWN_TOOLBAR_BUTTONS.map((btn) => (
                                              <BouncyButton
                                                key={btn.label}
                                                style={{ flex: 1, marginRight: 3, alignItems: 'center', backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: 99, paddingVertical: 5 }}
                                                onPress={() => applyMarkdownToRowColumn(block.id, colIdx, btn)}
                                              >
                                                <Text style={{
                                                  color: theme.accent,
                                                  fontWeight: '800',
                                                  fontSize: 11,
                                                  fontStyle: btn.label === 'I' ? 'italic' : 'normal',
                                                  textDecorationLine: btn.label === 'U' ? 'underline' : 'none'
                                                }}>{btn.label}</Text>
                                              </BouncyButton>
                                            ))}
                                          </View>
                                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                                            {['left', 'center', 'right'].map((alignOpt) => (
                                              <BouncyButton
                                                key={alignOpt}
                                                style={{
                                                  backgroundColor: (col.align || 'left') === alignOpt ? (themeMode === 'light' ? '#6D28D9' : '#8B5CF6') : theme.bg,
                                                  borderWidth: 1, borderColor: theme.border, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8
                                                }}
                                                onPress={() => setRowColumnAlign(block.id, colIdx, alignOpt)}
                                              >
                                                <AlignIconSVG align={alignOpt} color={(col.align || 'left') === alignOpt ? '#FFFFFF' : theme.textSecondary} size={13} />
                                              </BouncyButton>
                                            ))}
                                            <BouncyButton style={{ marginLeft: 'auto', padding: 2 }} onPress={() => clearRowColumn(block.id, colIdx)}>
                                              <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '700' }}>✕</Text>
                                            </BouncyButton>
                                          </View>
                                        </View>
                                      ) : (
                                        <View>
                                          {col.uri ? (
                                            <View>
                                              <View style={{ position: 'relative' }}>
                                                <Image
                                                  source={{ uri: col.uri }}
                                                  style={{ width: '100%', height: getImageBlockHeight(col.aspectMode, ROW_BLOCK_IMAGE_HEIGHT), borderRadius: 8, backgroundColor: theme.bg }}
                                                  resizeMode="cover"
                                                />
                                                <BouncyButton
                                                  style={{
                                                    position: 'absolute', bottom: 5, right: 5,
                                                    width: 24, height: 24, borderRadius: 12,
                                                    backgroundColor: 'rgba(11,15,23,0.65)',
                                                    alignItems: 'center', justifyContent: 'center'
                                                  }}
                                                  onPress={() => recropRowColumnImage(block.id, colIdx, col.aspectMode)}
                                                >
                                                  <CropIconSVG color="#FFFFFF" size={12} />
                                                </BouncyButton>
                                              </View>
                                            </View>
                                          ) : (
                                            <View style={{ width: '100%', height: ROW_BLOCK_IMAGE_HEIGHT, borderRadius: 8, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
                                              <Text style={{ color: '#64748B', fontSize: 11 }}>No image</Text>
                                            </View>
                                          )}
                                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                                            <BouncyButton onPress={() => replaceRowColumnImage(block.id, colIdx)}>
                                              <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700' }}>
                                                {col.uri ? 'Replace' : 'Choose Image'}
                                              </Text>
                                            </BouncyButton>
                                            {col.uri && (
                                              <BouncyButton onPress={() => setRowColumnImageAspect(block.id, colIdx, toggleAspectMode(col.aspectMode))}>
                                                <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>
                                                  Size ({col.aspectMode === 'wide' ? '16:9' : 'Sq'})
                                                </Text>
                                              </BouncyButton>
                                            )}
                                            <BouncyButton style={{ marginLeft: 'auto', padding: 2 }} onPress={() => clearRowColumn(block.id, colIdx)}>
                                              <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '700' }}>✕</Text>
                                            </BouncyButton>
                                          </View>
                                        </View>
                                      )}
                                    </View>
                                  );
                                })}
                                </View>
                              </View>
                            )}
                          </View>
                        ))}

                        <View style={{
                          backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
                          borderRadius: 12, padding: 12
                        }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', gap: 12 }}>
                            <BouncyButton
                              style={{
                                flex: 1, aspectRatio: 1, maxWidth: 100,
                                backgroundColor: theme.bg, borderRadius: 12,
                                borderWidth: 1.5, borderColor: theme.border,
                                alignItems: 'center', justifyContent: 'center'
                              }}
                              onPress={addTextBlock}
                            >
                              <TextBlockIconSVG size={24} color={theme.accent} />
                              <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 6 }}>Add Text</Text>
                            </BouncyButton>
                            <BouncyButton
                              style={{
                                flex: 1, aspectRatio: 1, maxWidth: 100,
                                backgroundColor: theme.bg, borderRadius: 12,
                                borderWidth: 1.5, borderColor: theme.border,
                                alignItems: 'center', justifyContent: 'center'
                              }}
                              onPress={addImageBlock}
                            >
                              <ImageIconSVG size={24} color={theme.accent} />
                              <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 6 }}>Add Image</Text>
                            </BouncyButton>
                            <BouncyButton
                              style={{
                                flex: 1, aspectRatio: 1, maxWidth: 100,
                                backgroundColor: theme.bg, borderRadius: 12,
                                borderWidth: 1.5, borderColor: theme.border,
                                alignItems: 'center', justifyContent: 'center'
                              }}
                              onPress={addRowBlock}
                            >
                              <RowBlockIconSVG size={24} color={theme.accent} filled />
                              <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 6, textAlign: 'center' }}>Add 2 Row</Text>
                            </BouncyButton>
                          </View>
                        </View>
                      </AppKeyboardAwareScrollView>
                  )}
                </SafeAreaView>
              </View>
              )}

              {formStep === 2 && (
                <View>
                  <View style={styles.warningNoteBox}>
                    <View style={styles.iconTextInlineRow}>
                      <WarningTriangleSVG />
                      <Text style={styles.warningTitle}>Prototype Compatibility Note</Text>
                    </View>
                    <Text style={styles.warningText}>
                      Embedded prototype viewports currently support Figma share/embed links. All fields in this step are optional.
                    </Text>
                  </View>

                  <View style={[styles.warningNoteBox, { borderColor: theme.accent, backgroundColor: themeMode === 'light' ? '#EDE9FE' : 'rgba(139,92,246,0.1)', marginTop: 10 }]}>
                    <View style={styles.iconTextInlineRow}>
                      <HelpCircleIconSVG color={theme.accent} size={18} />
                      <Text style={[styles.warningTitle, { color: theme.accent }]}>Not using Figma?</Text>
                    </View>
                    <Text style={[styles.warningText, { color: theme.text }]}>
                      This whole step is safe to skip if you design in Sketch, Adobe XD, Framer, or anything else - just tap Next below. Your portfolio still works great with just the showcase images you'll add in the next step.
                    </Text>
                  </View>

                  <Text style={styles.formGroupLabel}>Figma Mobile Prototype Share Link</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/proto/..."
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    value={fFigmaProto}
                    onChangeText={setFFigmaProto}
                  />

                  <Text style={styles.formGroupLabel}>Figma Desktop Prototype Share Link</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/proto/... (1440px canvas)"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    value={fDesktopProto}
                    onChangeText={setFDesktopProto}
                  />

                  <Text style={styles.formGroupLabel}>Component Showcase Prototype Link</Text>
                  <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 6, marginTop: -4 }}>
                    Optional - a focused prototype demonstrating how a single component works (e.g. a dropdown, toggle, or interaction pattern), separate from the full mobile/desktop flow above.
                  </Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/proto/..."
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    value={fComponentProto}
                    onChangeText={setFComponentProto}
                  />

                  <Text style={styles.formGroupLabel}>Figma Design File Canvas Link (Inspect Mode)</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/design/..."
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    value={fFigmaFile}
                    onChangeText={setFFigmaFile}
                  />

                  <Text style={styles.formGroupLabel}>Figma Profile Link</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/@username"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    value={fFigmaProfile}
                    onChangeText={setFFigmaProfile}
                  />

                  <BouncyButton
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}
                    onPress={() => setFHasLiveLink(!fHasLiveLink)}
                  >
                    <View style={{
                      width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                      borderColor: fHasLiveLink ? '#8B5CF6' : theme.border,
                      backgroundColor: fHasLiveLink ? '#8B5CF6' : 'transparent',
                      alignItems: 'center', justifyContent: 'center'
                    }}>
                      {fHasLiveLink && <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>✓</Text>}
                    </View>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 }}>
                      I have finished product for this portfolio
                    </Text>
                  </BouncyButton>

                  {fHasLiveLink && (
                    <View style={{ marginTop: 10 }}>
                      {fLiveLinks.map((link, idx) => (
                        <View key={idx} style={{ backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 12, marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={[styles.formGroupLabel, { marginTop: 0 }]}>Link {idx + 1}</Text>
                            {fLiveLinks.length > 1 && (
                              <BouncyButton
                                onPress={() => setFLiveLinks(fLiveLinks.filter((_, i) => i !== idx))}
                              >
                                <TrashIconSVG />
                              </BouncyButton>
                            )}
                          </View>
                          <Text style={[styles.formGroupLabel, { marginTop: 8 }]}>Button Label</Text>
                          <FocusableTextInput
                            style={styles.formInput}
                            placeholder="e.g. Live Website, App Download Page, Try It Live"
                            placeholderTextColor="#94A3B8"
                            value={link.label}
                            onChangeText={(t) => {
                              const updated = [...fLiveLinks];
                              updated[idx] = { ...updated[idx], label: t };
                              setFLiveLinks(updated);
                            }}
                          />
                          <Text style={styles.formGroupLabel}>Link URL</Text>
                          <View style={{ position: 'relative' }}>
                            <View style={{ position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center', zIndex: 5 }}>
                              {getSocialLogoSVG(link.url)}
                            </View>
                            <FocusableTextInput
                              style={[styles.formInput, { paddingLeft: 40 }]}
                              placeholder="https://..."
                              placeholderTextColor="#94A3B8"
                              autoCapitalize="none"
                              value={link.url}
                              onChangeText={(t) => {
                                const updated = [...fLiveLinks];
                                updated[idx] = { ...updated[idx], url: t };
                                setFLiveLinks(updated);
                              }}
                            />
                          </View>
                        </View>
                      ))}

                      {fLiveLinks.length < 5 && (
                        <BouncyButton
                          style={styles.addMoreVideoBtn}
                          onPress={() => setFLiveLinks([...fLiveLinks, { label: '', url: '' }])}
                        >
                          <Text style={styles.addMoreVideoText}>+ Add Another Link ({fLiveLinks.length}/5)</Text>
                        </BouncyButton>
                      )}
                    </View>
                  )}
                </View>
              )}

              {formStep === 3 && (
                <View>
                  <Text style={styles.formGroupLabel}>Cover Thumbnail Photo * (Big Rectangle)</Text>
                  <BouncyButton
                    style={[styles.bigRectanglePicker, errors.fCover && styles.inputErrorBorder]}
                    activeOpacity={0.8}
                    onPress={pickCoverImage}
                  >
                    {fCover ? (
                      <Image source={{ uri: fCover }} style={styles.bigRectanglePreview} />
                    ) : (
                      <View style={styles.pickerPlaceholderCol}>
                        <ImageIconSVG />
                        <Text style={styles.pickerTextMain}>Tap to Pick Cover Thumbnail Photo</Text>
                        <Text style={styles.pickerSubText}>Browse local photos from your Phone or PC</Text>
                      </View>
                    )}
                  </BouncyButton>
                  {errors.fCover ? <Text style={styles.errorText}>{errors.fCover}</Text> : null}

                  <Text style={[styles.formGroupLabel, { marginTop: 20 }]}>
                    Showcase Images * (min 2, max 10)
                  </Text>

                  <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 8 }}>
                    How these display in your portfolio's gallery - applies to all images together.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <BouncyButton
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 10, borderRadius: 10,
                        borderWidth: 1, borderColor: fShowcaseAspectRatio === '16:9' ? theme.accent : theme.border,
                        backgroundColor: fShowcaseAspectRatio === '16:9' ? (themeMode === 'light' ? '#EDE9FE' : 'rgba(139,92,246,0.15)') : 'transparent'
                      }}
                      onPress={() => setFShowcaseAspectRatio('16:9')}
                    >
                      <View style={{ width: 18, height: 10.1, borderRadius: 2, borderWidth: 1.5, borderColor: fShowcaseAspectRatio === '16:9' ? theme.accent : theme.textSecondary }} />
                      <Text style={{ color: fShowcaseAspectRatio === '16:9' ? theme.accent : theme.textSecondary, fontSize: 13, fontWeight: '700' }}>Landscape</Text>
                    </BouncyButton>
                    <BouncyButton
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 10, borderRadius: 10,
                        borderWidth: 1, borderColor: fShowcaseAspectRatio === '9:16' ? theme.accent : theme.border,
                        backgroundColor: fShowcaseAspectRatio === '9:16' ? (themeMode === 'light' ? '#EDE9FE' : 'rgba(139,92,246,0.15)') : 'transparent'
                      }}
                      onPress={() => setFShowcaseAspectRatio('9:16')}
                    >
                      <View style={{ width: 10.1, height: 18, borderRadius: 2, borderWidth: 1.5, borderColor: fShowcaseAspectRatio === '9:16' ? theme.accent : theme.textSecondary }} />
                      <Text style={{ color: fShowcaseAspectRatio === '9:16' ? theme.accent : theme.textSecondary, fontSize: 13, fontWeight: '700' }}>Portrait</Text>
                    </BouncyButton>
                  </View>

                  <View style={styles.smallSquaresGrid}>
                    {fShowcaseImages.filter((img) => img.trim() !== '').length === 0 && (
                      <BouncyButton
                        style={[styles.smallSquarePicker, errors.showcaseImages && styles.inputErrorBorder]}
                        onPress={pickMultipleShowcaseImages}
                      >
                        <View style={styles.pickerPlaceholderCol}>
                          <CameraIconSVG />
                          <Text style={styles.squarePickerText}>Add Image(s)</Text>
                        </View>
                      </BouncyButton>
                    )}

                    {fShowcaseImages.filter((img) => img.trim() !== '').map((imgUri, index) => (
                      <View key={index} style={styles.squarePickerWrapper}>
                        <View style={[styles.smallSquarePicker, errors.showcaseImages && styles.inputErrorBorder]}>
                          <Image source={{ uri: imgUri }} style={styles.smallSquarePreview} />
                        </View>

                        {fShowcaseImages.filter((img) => img.trim() !== '').length > 2 && (
                          <BouncyButton
                            style={{
                              position: 'absolute', top: -4, right: -4, width: 24, height: 24, borderRadius: 12,
                              backgroundColor: 'rgba(11, 15, 23, 0.55)',
                              alignItems: 'center', justifyContent: 'center', zIndex: 10
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => handleRemoveShowcaseImage(index)}
                          >
                            <DashCircleIconSVG size={16} />
                          </BouncyButton>
                        )}
                      </View>
                    ))}

                    {fShowcaseImages.filter((img) => img.trim() !== '').length > 0 &&
                     fShowcaseImages.filter((img) => img.trim() !== '').length < 10 && (
                      <BouncyButton
                        style={styles.smallSquarePicker}
                        onPress={pickMultipleShowcaseImages}
                      >
                        <PlusSVG />
                      </BouncyButton>
                    )}
                  </View>

                  {errors.showcaseImages ? (
                    <Text style={styles.errorText}>{errors.showcaseImages}</Text>
                  ) : null}

                  <Text style={[styles.formGroupLabel, { marginTop: 20 }]}>Video Demo Links (Optional - YouTube/Vimeo)</Text>
                  {fVideoLinks.map((vid, idx) => (
                    <View key={idx} style={styles.videoInputRow}>
                      <FocusableTextInput
                        style={[styles.formInput, { flex: 1 }]}
                        placeholder={`https://www.youtube.com/watch?v=... (${idx + 1})`}
                        placeholderTextColor="#94A3B8"
                        value={vid}
                        onChangeText={(t) => handleVideoUrlChange(t, idx)}
                      />
                      {fVideoLinks.length > 1 && (
                        <BouncyButton
                          style={styles.removeVideoBtn}
                          onPress={() => handleRemoveVideoLink(idx)}
                        >
                          <TrashIconSVG />
                        </BouncyButton>
                      )}
                    </View>
                  ))}

                  <BouncyButton style={styles.addMoreVideoBtn} onPress={handleAddMoreVideo}>
                    <Text style={styles.addMoreVideoText}>+ Add More Video Links</Text>
                  </BouncyButton>
                </View>
              )}

              {formStep === 4 && (
                <View>
                  <View style={styles.confirmReviewCard}>
                    {fCover ? <Image source={{ uri: fCover }} style={styles.reviewCover} /> : null}
                    <Text style={styles.reviewTitle}>{fTitle}</Text>
                    <Text style={styles.reviewDesigner}>By {userProfile.name}</Text>
                    <Text style={styles.reviewCategory}>Categories: {fCategories.join(', ')}</Text>
                    <Text style={styles.reviewBrief}>{fBrief}</Text>

                    <View style={styles.reviewSummaryRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 13, alignItems: 'center' }}>
                          <MobileFilledIconSVG size={10} />
                        </View>
                        <Text style={styles.reviewStat}>Mobile Proto: <Text style={{ fontWeight: '800', color: theme.text }}>{fFigmaProto ? 'Attached' : 'None'}</Text></Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <DesktopFilledIconSVG size={13} />
                        <Text style={styles.reviewStat}>Desktop Proto: <Text style={{ fontWeight: '800', color: theme.text }}>{fDesktopProto ? 'Attached' : 'None'}</Text></Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 13, alignItems: 'center' }}>
                          <FigmaLogoSVG />
                        </View>
                        <Text style={styles.reviewStat}>Component Proto: <Text style={{ fontWeight: '800', color: theme.text }}>{fComponentProto ? 'Attached' : 'None'}</Text></Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <ImageFilledIconSVG size={13} />
                        <Text style={styles.reviewStat}>Showcase Images: <Text style={{ fontWeight: '800', color: theme.text }}>{fShowcaseImages.filter(v => v.trim()).length}</Text> Picked</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <VideoFilledIconSVG size={13} />
                        <Text style={styles.reviewStat}>Video Demos: <Text style={{ fontWeight: '800', color: theme.text }}>{fVideoLinks.filter(v => v.trim()).length}</Text> Attached</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

            </AppKeyboardAwareScrollView>

            <View style={styles.stickyWizardBottomBar}>
              {formStep > 1 && (
                <BouncyButton style={styles.uniformWizardBtnBack} onPress={() => setFormStep(formStep - 1)}>
                  <View style={styles.iconTextInlineRow}>
                    <ChevronLeftSVG color="#94A3B8" size={16} />
                    <Text style={styles.backBtnText}>Back</Text>
                  </View>
                </BouncyButton>
              )}

              <BouncyButton
                style={[styles.uniformWizardBtnPrimary, isSubmittingPortfolio && { opacity: 0.7 }]}
                disabled={isSubmittingPortfolio}
                onPress={() => {
                  if (formStep === 1) handleNextFromStep1();
                  else if (formStep === 2) handleNextFromStep2(false);
                  else if (formStep === 3) handleNextFromStep3();
                  else if (formStep === 4) handleFinalPostPackage();
                }}
              >
                {formStep === 4 && isSubmittingPortfolio ? (
                  <View style={styles.iconTextInlineRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>
                      {editingProjectId ? 'Updating...' : 'Uploading...'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.iconTextInlineRow}>
                    <Text style={styles.submitBtnText}>
                      {formStep === 1 ? 'Next: Add Links' :
                       formStep === 2 ? 'Next: Media' :
                       formStep === 3 ? 'Review & Confirm' :
                       editingProjectId ? 'Update Portfolio Package' : 'Post Portfolio Package'}
                    </Text>
                    <ChevronRightSVG color="#FFFFFF" size={18} />
                  </View>
                )}
              </BouncyButton>
            </View>
        </SafeAreaView>

        {/* DISCARD UPLOAD WIZARD CONFIRMATION - nested inside this same
            Modal/portal, not a separate top-level element. A previous
            version rendered this as its own absolutely-positioned sibling
            elsewhere in the tree, which still didn't reliably layer above
            this Modal's own portaled content on web (react-native-web
            portals each Modal's content to document.body in mount order;
            content living outside that portal can't out-stack it via
            z-index alone, regardless of the z-index value used). Living
            inside this Modal's own subtree sidesteps that entirely - it's
            guaranteed to paint above this Modal's own content. */}
        {discardConfirmModalVisible && (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 30 }}
          >
            <View style={styles.overlayModalBg}
              onStartShouldSetResponder={() => Platform.OS === 'web'}
              onResponderRelease={() => setDiscardConfirmModalVisible(false)}
            >
              <View style={styles.customConfirmCard}
                onStartShouldSetResponder={() => Platform.OS === 'web'}
                onResponderRelease={() => {}}
              >
                <View style={[styles.successIconCircle, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                  <WarningTriangleSVG />
                </View>
                <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Discard This Portfolio?</Text>
                <Text style={styles.confirmSubText}>
                  Are you sure? What you've entered so far won't be saved.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <BouncyButton
                    style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                    onPress={() => setDiscardConfirmModalVisible(false)}
                  >
                    <Text style={[styles.confirmDeleteText, { color: theme.text }]}>Keep Editing</Text>
                  </BouncyButton>
                  <BouncyButton
                    style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                    onPress={() => {
                      setDiscardConfirmModalVisible(false);
                      setAddModalVisible(false);
                      resetFormWizard();
                    }}
                  >
                    <Text style={styles.confirmDeleteText}>Discard</Text>
                  </BouncyButton>
                </View>
              </View>
            </View>
          </View>
        )}
        </Animated.View>
        </View>
          </View>
        </View>
      </Modal>

      {/* FORMATTING GUIDE - quick reference for typing markup directly instead of tapping buttons */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={formattingGuideVisible}
        onRequestClose={() => setFormattingGuideVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlayModalBg}
          activeOpacity={1}
          onPress={() => setFormattingGuideVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.customConfirmCard, { position: 'relative' }]}>
            <BouncyButton
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 1, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 99, backgroundColor: theme.bg }}
              onPress={() => setFormattingGuideVisible(false)}
            >
              <Text style={{ color: theme.textSecondary, fontSize: 16, fontWeight: '700', lineHeight: 16 }}>✕</Text>
            </BouncyButton>

            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Editor Help</Text>

            <View style={{ width: '100%', gap: 8, marginBottom: 16 }}>
              {[
                'Tap "+ Text", "+ Image", or "+ Row (2-up)" at the bottom to add a block.',
                'Row (2-up) splits into two side-by-side halves — pick Text or Image for each side.',
                'Use ▲ / ▼ or type a number next to a block to reorder it.',
                'Tap "Remove" on a block to delete it.'
              ].map((tip, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '800' }}>•</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }}>{tip}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.confirmSubText, { textAlign: 'left', marginBottom: 4, fontWeight: '700', color: theme.text }]}>
              Formatting Shortcuts
            </Text>
            <Text style={[styles.confirmSubText, { textAlign: 'left', marginBottom: 16 }]}>
              You can type these directly instead of tapping the buttons:
            </Text>

            <View style={{ width: '100%', gap: 10, marginBottom: 16 }}>
              {[
                { symbol: '# text', desc: 'Big heading (H1)' },
                { symbol: '## text', desc: 'Smaller heading (H2)' },
                { symbol: '**text**', desc: 'Bold' },
                { symbol: '*text*', desc: 'Italic' },
                { symbol: '__text__', desc: 'Underline' }
              ].map((item) => (
                <View key={item.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, minWidth: 90, alignItems: 'center' }}>
                    <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>{item.symbol}</Text>
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }}>{item.desc}</Text>
                </View>
              ))}
            </View>

            <BouncyButton
              style={[styles.confirmDeleteBtn, { width: '100%' }]}
              onPress={() => setFormattingGuideVisible(false)}
            >
              <Text style={styles.confirmDeleteText}>Got It</Text>
            </BouncyButton>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Native Fullscreen Showcase Modal with Sticky Title Bar and Jump-to-Top
          Button - page instead of popup on wide web (sidebar/header stay
          visible), still a native Modal everywhere else. Same technique as
          the Designer Profile conversion above: content built once inside
          this IIFE (only evaluated when activeProject is truthy, since the
          content reads activeProject.* directly) and referenced from
          whichever wrapper applies. */}
      {activeProject && (() => {
        const portfolioDetailContent = (
          <View style={{ flex: 1, width: '100%', backgroundColor: theme.bg }}>
          <SafeAreaView style={[styles.modalContainer, Platform.OS === 'web' && { maxWidth: mainContentMaxWidth }]}>
            <View style={[styles.modalTopBar, { backgroundColor: 'transparent' }]}>
              {Platform.OS !== 'web' && (
                lightweightMode ? (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.surface }} />
                ) : (
                  <BlurView
                    intensity={45}
                    tint={themeMode === 'light' ? 'light' : 'dark'}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                )
              )}

              {Platform.OS === 'web' && (
                <BouncyButton style={{ padding: 4, marginRight: 8 }} onPress={handleBackFromPortfolioDetail}>
                  <ChevronLeftSVG color={theme.accentLight} size={20} />
                </BouncyButton>
              )}

              <Text style={[styles.modalTopTitle, { flex: 1 }, isWebWide && { fontSize: 20 }]} numberOfLines={1}>
                {activeProject.title}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <BouncyButton
                  style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => handleSharePortfolio(activeProject)}
                >
                  <ShareIconSVG color={theme.accentLight} />
                </BouncyButton>

                <View ref={portfolioDotsWrapRef} style={{ zIndex: 100 }}>
                  <BouncyButton
                    style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      const next = !portfolioOptionsMenuVisible;
                      if (next && portfolioDotsWrapRef.current) {
                        portfolioDotsWrapRef.current.measureInWindow((x, y, width, height) => {
                          const screenWidth = Platform.OS === 'web' ? window.innerWidth : Dimensions.get('window').width;
                          setPortfolioMenuPos({ top: y + height + 8, right: Math.max(8, screenWidth - (x + width)) });
                        });
                      }
                      setPortfolioOptionsMenuVisible(next);
                    }}
                  >
                    <Text style={{ color: theme.textSecondary, fontSize: 20, fontWeight: '900', lineHeight: 20 }}>⋮</Text>
                  </BouncyButton>
                </View>

                {!(Platform.OS === 'web') && (
                  <BouncyButton style={styles.closeBtn} onPress={handleBackFromPortfolioDetail}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </BouncyButton>
                )}

                <Modal
                  transparent
                  visible={portfolioOptionsMenuVisible}
                  animationType="none"
                  onRequestClose={() => setPortfolioOptionsMenuVisible(false)}
                >
                  <View
                    pointerEvents="box-none"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  >
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      activeOpacity={1}
                      onPress={() => setPortfolioOptionsMenuVisible(false)}
                    />
                    <View style={{
                      position: 'absolute', top: portfolioMenuPos.top, right: portfolioMenuPos.right, width: 220,
                      backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border,
                      padding: 6,
                      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 12
                    }}>
                      {session && activeProject.ownerId === session.user.id ? (
                        <>
                          <BouncyButton
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 12, borderRadius: 99 }}
                            onPress={() => {
                              setPortfolioOptionsMenuVisible(false);
                              openEditWizard(activeProject);
                            }}
                          >
                            <EditIconSVG color={theme.text} />
                            <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>Edit Portfolio</Text>
                          </BouncyButton>
                          <BouncyButton
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 12, borderRadius: 99 }}
                            onPress={() => {
                              setPortfolioOptionsMenuVisible(false);
                              promptDeletePortfolio(activeProject);
                            }}
                          >
                            <TrashIconSVG color="#EF4444" />
                            <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Delete Portfolio</Text>
                          </BouncyButton>
                        </>
                      ) : (
                        <>
                          <BouncyButton
                            style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                            onPress={() => {
                              setPortfolioOptionsMenuVisible(false);
                              setPortfolioReportModalVisible(true);
                            }}
                          >
                            <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>Report Portfolio</Text>
                          </BouncyButton>
                          <BouncyButton
                            style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                            onPress={() => {
                              setPortfolioOptionsMenuVisible(false);
                              mutedIds.has(activeProject.ownerId)
                                ? handleUnmuteDesigner(activeProject.ownerId, activeProject.designer)
                                : handleMuteDesigner(activeProject.ownerId, activeProject.designer);
                            }}
                          >
                            <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>
                              {mutedIds.has(activeProject.ownerId) ? 'Unmute Posts' : 'Mute Posts'}
                            </Text>
                          </BouncyButton>
                          <BouncyButton
                            style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 99 }}
                            onPress={() => {
                              setPortfolioOptionsMenuVisible(false);
                              handleBlockUser(activeProject.ownerId, activeProject.designer);
                            }}
                          >
                            <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Block User</Text>
                          </BouncyButton>
                        </>
                      )}
                    </View>
                  </View>
                </Modal>
              </View>
            </View>

            {/* Tab bar hidden in split-layout mode (web wide, has a
                prototype) - case study and prototype are both visible at
                once there, side by side, so switching tabs doesn't apply.
                The right pane gets its own small Mobile/Desktop switcher
                instead, only when both links exist.

                This whole block is now isWebWide-only - app/narrow-web gets
                a relocated version further down (under the category tags,
                inside the scrollable case study content) with different
                styling when there's only one tab. Desktop/tablet web keeps
                this exact original position/styling unchanged for now,
                pending a separate wider redesign later. */}
            {(
              (Platform.OS === 'web' && isWebWide && !(activeProject.figmaProto || activeProject.desktopProto || activeProject.componentProto)) ||
              (!(Platform.OS === 'web' && isWebWide) && (activeTab === 'mobile' || activeTab === 'desktop' || activeTab === 'component'))
            ) && (
            <View style={styles.tabBar}>
              <BouncyButton
                style={[styles.tabBtn, activeTab === 'case' && styles.tabBtnActive]}
                onPress={() => setActiveTab('case')}
              >
                <Text style={[styles.tabBtnText, activeTab === 'case' && styles.tabBtnTextActive]}>
                  Case Study
                </Text>
              </BouncyButton>

              {activeProject.figmaProto ? (
                <BouncyButton
                  style={[styles.tabBtn, activeTab === 'mobile' && styles.tabBtnActive]}
                  onPress={() => { setActiveTab('mobile'); setLoadingWebView(true); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <FigmaLogoSVG />
                    <Text style={[styles.tabBtnText, activeTab === 'mobile' && styles.tabBtnTextActive]}>
                      Mobile Proto
                    </Text>
                  </View>
                </BouncyButton>
              ) : null}

              {activeProject.desktopProto ? (
                <BouncyButton
                  style={[styles.tabBtn, activeTab === 'desktop' && styles.tabBtnActive]}
                  onPress={() => { setActiveTab('desktop'); setLoadingWebView(true); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <FigmaLogoSVG />
                    <Text style={[styles.tabBtnText, activeTab === 'desktop' && styles.tabBtnTextActive]}>
                      Desktop Proto
                    </Text>
                  </View>
                </BouncyButton>
              ) : null}

              {activeProject.componentProto ? (
                <BouncyButton
                  style={[styles.tabBtn, activeTab === 'component' && styles.tabBtnActive]}
                  onPress={() => { setActiveTab('component'); setLoadingWebView(true); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <FigmaLogoSVG />
                    <Text style={[styles.tabBtnText, activeTab === 'component' && styles.tabBtnTextActive]}>
                      Component Proto
                    </Text>
                  </View>
                </BouncyButton>
              ) : null}
            </View>
            )}

            <View style={styles.modalBody}>
              {(() => {
                const hasPrototype = !!(activeProject.figmaProto || activeProject.desktopProto || activeProject.componentProto);
                const showSplitLayout = Platform.OS === 'web' && isWebWide && hasPrototype;
                const protoUri = getFigmaEmbedUrl(
                  activeTab === 'component'
                    ? activeProject.componentProto
                    : activeTab === 'desktop'
                    ? (activeProject.desktopProto || activeProject.figmaProto || activeProject.componentProto)
                    : (activeProject.figmaProto || activeProject.desktopProto || activeProject.componentProto)
                );

                const prototypePane = (
                  <View style={styles.webViewWrapper}>
                    {loadingWebView && (
                      <View style={styles.loaderOverlay}>
                        <ActivityIndicator size="large" color="#8B5CF6" />
                        <Text style={styles.loaderText}>Loading Figma Prototype...</Text>
                      </View>
                    )}
                    <AppWebView
                      source={{ uri: protoUri }}
                      style={styles.webView}
                      onLoadEnd={() => setLoadingWebView(false)}
                      onShouldStartLoadWithRequest={handleWebViewNavigation}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                    />
                  </View>
                );

                const caseStudyPane = (
                <ScrollView
                  ref={modalScrollViewRef}
                  style={styles.caseScrollView}
                  contentContainerStyle={[styles.caseContent, { paddingBottom: 110 }]}
                  onScroll={handleModalScroll}
                  scrollEventThrottle={16}
                >
                  {/* Small monochrome engagement stats, centered - moved here
                      from the top bar (was left-aligned, colored). Lives in
                      normal scroll flow at the very top of the content, not
                      in the sticky/fixed top bar area. */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <LikeButton
                        liked={activeProject.liked}
                        likesCount={activeProject.likesCount}
                        onPress={() => toggleLike(activeProject.id)}
                        color={theme.textSecondary}
                        monochrome
                        size={18}
                      />
                      <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{activeProject.likesCount || 1}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <EyeViewIconSVG size={18} color={theme.textSecondary} />
                      <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{activeProject.visitsCount || 120}</Text>
                    </View>
                  </View>

                  {/* Designer Row with Right-Aligned Follow/Following Button */}
                  <View style={styles.designerRowModal}>
                    <BouncyButton
                      style={styles.designerRowModalLeftCol}
                      activeOpacity={0.7}
                      onPress={() => openDesignerProfileById(activeProject.ownerId)}
                    >
                      <Image
                        source={{ uri: activeProject.designerAvatar }}
                        style={styles.designerAvatarModal}
                      />
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.caseDesigner}>By {activeProject.designer}</Text>
                        <Text style={styles.caseDesignerRole}>{getDesignerRole(activeProject.designer)}</Text>
                      </View>
                    </BouncyButton>

                    {/* Follow/Following Button Aligned Right */}
                    {!(session && activeProject.ownerId === session.user.id) && (
                      <BouncyButton
                        style={[
                          styles.modalDesignerFollowBtnRight,
                          followedDesigners.includes(activeProject.ownerId) && styles.modalDesignerFollowBtnRightActive
                        ]}
                        onPress={() => toggleFollowDesigner(activeProject.ownerId)}
                      >
                        <Text style={[
                          styles.modalDesignerFollowTextRight,
                          followedDesigners.includes(activeProject.ownerId) && styles.modalDesignerFollowTextRightActive
                        ]}>
                          {followedDesigners.includes(activeProject.ownerId) ? 'Following' : (activeProject.followsMe ? 'Follow Back' : '+ Follow')}
                        </Text>
                      </BouncyButton>
                    )}
                  </View>

                  {/* ONLY Show Figma Design Canvas Link If Included by User */}
                  {activeProject.figmaFile && activeProject.figmaFile.trim() !== '' ? (
                    <View style={styles.chipRow}>
                      <BouncyButton
                        style={styles.linkChip}
                        onPress={() => openExternalLinkWithWarning(activeProject.figmaFile)}
                      >
                        <Text style={styles.linkChipText}>❖ Open Figma Design Canvas ↗</Text>
                      </BouncyButton>
                    </View>
                  ) : null}

                  {activeProject.liveLinks && activeProject.liveLinks.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {activeProject.liveLinks.map((link, idx) => (
                        link.url && link.url.trim() !== '' ? (
                          <BouncyButton
                            key={idx}
                            style={{
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                              backgroundColor: '#8B5CF6', borderRadius: 99, paddingVertical: 10, paddingHorizontal: 16
                            }}
                            onPress={() => openExternalLinkWithWarning(link.url)}
                          >
                            {getSocialLogoSVG(link.url)}
                            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                              {link.label && link.label.trim() !== '' ? link.label : 'Visit Live Link'}
                            </Text>
                            <ExternalLinkSVG color="#FFFFFF" size={15} />
                          </BouncyButton>
                        ) : null
                      ))}
                    </View>
                  )}

                  <View style={styles.briefBox}>
                    <Text style={styles.briefText}>{activeProject.brief}</Text>
                  </View>

                  {activeProject.categories && activeProject.categories.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                      {activeProject.isAiGenerated === true && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#10B981', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 }}>
                          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '900' }}>AI</Text>
                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>AI-Generated</Text>
                        </View>
                      )}
                      {activeProject.categories.map((cat, idx) => (
                        <BouncyButton
                          key={idx}
                          style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 }}
                          onPress={() => {
                            setModalVisible(false);
                            setSearchQuery(cat);
                            handleNavChange('search');
                          }}
                          onLongPress={() => handleReportContent('tag', cat, `the tag "${cat}"`)}
                        >
                          <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '600' }}>{cat}</Text>
                        </BouncyButton>
                      ))}
                    </View>
                  )}

                  {/* Relocated tab bar for app/narrow-web only - desktop/
                      tablet web keeps the original tab bar in its old
                      position above, unchanged for now pending a wider
                      redesign later. When there's only one tab (no
                      prototype links uploaded), it's plain text - no
                      purple-fill button chrome, since a single tab isn't
                      really a "choice" and looked like an unnecessary
                      button. Once a prototype exists, this keeps the same
                      button-styled tabs as before, just relocated. */}
                  {!(Platform.OS === 'web' && isWebWide) && (
                    !(activeProject.figmaProto || activeProject.desktopProto || activeProject.componentProto) ? (
                      <Text style={[styles.sectionHeader, { marginBottom: 16 }]}>Case Study</Text>
                    ) : (
                      <View style={[styles.tabBar, { marginBottom: 16 }]}>
                        <BouncyButton
                          style={[styles.tabBtn, activeTab === 'case' && styles.tabBtnActive]}
                          onPress={() => setActiveTab('case')}
                        >
                          <Text style={[styles.tabBtnText, activeTab === 'case' && styles.tabBtnTextActive]}>
                            Case Study
                          </Text>
                        </BouncyButton>

                        {activeProject.figmaProto ? (
                          <BouncyButton
                            style={[styles.tabBtn, activeTab === 'mobile' && styles.tabBtnActive]}
                            onPress={() => { setActiveTab('mobile'); setLoadingWebView(true); }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <FigmaLogoSVG />
                              <Text style={[styles.tabBtnText, activeTab === 'mobile' && styles.tabBtnTextActive]}>
                                Mobile Proto
                              </Text>
                            </View>
                          </BouncyButton>
                        ) : null}

                        {activeProject.desktopProto ? (
                          <BouncyButton
                            style={[styles.tabBtn, activeTab === 'desktop' && styles.tabBtnActive]}
                            onPress={() => { setActiveTab('desktop'); setLoadingWebView(true); }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <FigmaLogoSVG />
                              <Text style={[styles.tabBtnText, activeTab === 'desktop' && styles.tabBtnTextActive]}>
                                Desktop Proto
                              </Text>
                            </View>
                          </BouncyButton>
                        ) : null}

                        {activeProject.componentProto ? (
                          <BouncyButton
                            style={[styles.tabBtn, activeTab === 'component' && styles.tabBtnActive]}
                            onPress={() => { setActiveTab('component'); setLoadingWebView(true); }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <FigmaLogoSVG />
                              <Text style={[styles.tabBtnText, activeTab === 'component' && styles.tabBtnTextActive]}>
                                Component Proto
                              </Text>
                            </View>
                          </BouncyButton>
                        ) : null}
                      </View>
                    )
                  )}

                  <Text style={styles.sectionHeader}>UI SCREENSHOTS & HIGHLIGHTS</Text>
                  <View style={{ position: 'relative' }}>
                    <ScrollView
                      ref={galleryScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.galleryScroll}
                      onScroll={Platform.OS === 'web' ? (e) => updateGalleryScrollArrows(e.nativeEvent.contentOffset.x) : undefined}
                      scrollEventThrottle={16}
                      onContentSizeChange={Platform.OS === 'web' ? (w) => {
                        galleryScrollContentWidthRef.current = w;
                        updateGalleryScrollArrows(galleryScrollXRef.current);
                      } : undefined}
                      onLayout={Platform.OS === 'web' ? (e) => {
                        galleryScrollContainerWidthRef.current = e.nativeEvent.layout.width;
                        updateGalleryScrollArrows(galleryScrollXRef.current);
                      } : undefined}
                    >
                      {activeProject.images.map((imgUrl, index) => {
                        const galleryHeight = 220;
                        const galleryWidth = activeProject.showcaseAspectRatio === '9:16'
                          ? galleryHeight * (9 / 16)
                          : galleryHeight * (16 / 9);
                        return (
                          <BouncyButton key={index} activeOpacity={0.9} onPress={() => setLightboxImageUri(imgUrl)}>
                            <Image source={{ uri: imgUrl }} style={[styles.galleryImage, { width: galleryWidth, height: galleryHeight }]} resizeMode="cover" />
                          </BouncyButton>
                        );
                      })}
                    </ScrollView>

                    {Platform.OS === 'web' && galleryCanScrollLeft && (
                      <BouncyButton
                        style={{
                          position: 'absolute', left: 0, top: '50%', marginTop: -19, width: 38, height: 38,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(20,24,34,0.95)',
                          borderRadius: 19, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4
                        }}
                        onPress={() => {
                          const target = Math.max(0, galleryScrollXRef.current - (galleryScrollContainerWidthRef.current || 200) * 0.7);
                          galleryScrollRef.current?.scrollTo({ x: target, animated: true });
                        }}
                      >
                        <ChevronLeftSVG color={theme.accentLight} size={16} />
                      </BouncyButton>
                    )}

                    {Platform.OS === 'web' && galleryCanScrollRight && (
                      <BouncyButton
                        style={{
                          position: 'absolute', right: 0, top: '50%', marginTop: -19, width: 38, height: 38,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(20,24,34,0.95)',
                          borderRadius: 19, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4
                        }}
                        onPress={() => {
                          const maxX = Math.max(0, galleryScrollContentWidthRef.current - galleryScrollContainerWidthRef.current);
                          const target = Math.min(maxX, galleryScrollXRef.current + (galleryScrollContainerWidthRef.current || 200) * 0.7);
                          galleryScrollRef.current?.scrollTo({ x: target, animated: true });
                        }}
                      >
                        <ChevronRightSVG color={theme.accentLight} size={16} />
                      </BouncyButton>
                    )}
                  </View>

                  <Text style={styles.sectionHeader}>CASE STUDY OVERVIEW</Text>
                  {activeProject.contentBlocks && activeProject.contentBlocks.length > 0 ? (
                    <View>{renderContentBlocks(activeProject.contentBlocks, setLightboxImageUri, theme)}</View>
                  ) : (
                    <Text style={styles.caseBodyText}>{activeProject.brief}</Text>
                  )}
                </ScrollView>
                );

                // Split layout (web wide, has at least one prototype link):
                // case study always visible on the left, prototype viewer on
                // the right, half/half. If both mobile and desktop links
                // exist, a small switcher picks which one shows on the
                // right - unlike native/narrow-web, which keeps the
                // original tab-switching single-pane behavior entirely
                // unchanged below.
                if (showSplitLayout) {
                  return (
                    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.bg }}>
                      <View style={{ flex: 1, backgroundColor: theme.bg, borderRightWidth: 1, borderRightColor: theme.border }}>
                        {caseStudyPane}
                      </View>
                      <View style={{ flex: 1, backgroundColor: theme.bg }}>
                        {activeProject.figmaProto && activeProject.desktopProto && (
                          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.border }}>
                            <BouncyButton
                              style={{ flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: activeTab === 'desktop' ? 'transparent' : theme.surface }}
                              onPress={() => { setActiveTab('mobile'); setLoadingWebView(true); }}
                            >
                              <Text style={{ color: activeTab === 'desktop' ? theme.textSecondary : theme.accent, fontWeight: '700', fontSize: 12 }}>Mobile</Text>
                            </BouncyButton>
                            <BouncyButton
                              style={{ flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: activeTab === 'desktop' ? theme.surface : 'transparent' }}
                              onPress={() => { setActiveTab('desktop'); setLoadingWebView(true); }}
                            >
                              <Text style={{ color: activeTab === 'desktop' ? theme.accent : theme.textSecondary, fontWeight: '700', fontSize: 12 }}>Desktop</Text>
                            </BouncyButton>
                          </View>
                        )}
                        {prototypePane}
                      </View>
                    </View>
                  );
                }

                // Original behavior, unchanged: single pane, switched via
                // the tab bar above (Case Study / Mobile Proto / Desktop Proto).
                return (activeTab === 'mobile' || activeTab === 'desktop' || activeTab === 'component') ? prototypePane : caseStudyPane;
              })()}

              {/* Showcase Jump To Top Floating Button (On Top of Sticky Like Button, Shows on Scroll) */}
              {showModalBackToTop && (
                <BouncyButton
                  style={[styles.stickyModalBackToTopBtn, Platform.OS !== 'web' && { backgroundColor: 'transparent', overflow: 'hidden' }]}
                  activeOpacity={0.85}
                  onPress={scrollModalToTop}
                >
                  {Platform.OS !== 'web' && (
                    lightweightMode ? (
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#8B5CF6' }} />
                    ) : (
                      <>
                        <BlurView
                          intensity={45}
                          tint={themeMode === 'light' ? 'light' : 'dark'}
                          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        />
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(139, 92, 246, 0.55)' }} />
                      </>
                    )
                  )}
                  <ChevronUpSVG />
                </BouncyButton>
              )}

              {/* Floating Circle Like Button (Full Opacity Container, Only Heart Icon Turns Red) */}
              <LikeButton
                liked={activeProject.liked}
                likesCount={activeProject.likesCount}
                onPress={() => toggleLike(activeProject.id)}
                style={[styles.floatingLikeCircleBtn, Platform.OS !== 'web' && { backgroundColor: 'transparent' }]}
                translucentBg
              />

            </View>
          </SafeAreaView>
          </View>
        );

        if (Platform.OS === 'web' && isWebWide) {
          return modalVisible && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: topStackedPage === 'portfolio' ? 160 : 150, elevation: 10, backgroundColor: theme.bg }}>
              {portfolioDetailContent}
            </View>
          );
        }

        return (
          <Modal
            animationType={Platform.OS === 'web' ? 'none' : 'slide'}
            transparent={false}
            visible={modalVisible}
            onRequestClose={handleBackFromPortfolioDetail}
          >
            {portfolioDetailContent}
          </Modal>
        );
      })()}

      {/* ANDROID: "get the app" popup - shown once, dismiss persists via
          AsyncStorage so it doesn't nag on every visit. Points to the
          GitHub repo's install instructions/APK since DECENT isn't on the
          Play Store yet - swap this for the real Play Store link if/when
          it ever gets published there. */}
      {Platform.OS === 'web' && showAndroidPromo && (
        <View pointerEvents="box-none" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
          <View style={[styles.overlayModalBg, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={handleDismissAndroidPromo}
          >
            <View style={styles.customConfirmCard}
              onStartShouldSetResponder={() => Platform.OS === 'web'}
              onResponderRelease={() => {}}
            >
              <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '800' }}>D</Text>
              </View>
              <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Get the DECENT App</Text>
              <Text style={styles.confirmSubText}>
                For a smoother experience, download the DECENT Android app from GitHub.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <BouncyButton
                  style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                  onPress={handleDismissAndroidPromo}
                >
                  <Text style={[styles.confirmDeleteText, { color: theme.text }]}>Not Now</Text>
                </BouncyButton>
                <BouncyButton
                  style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#8B5CF6' }]}
                  onPress={() => {
                    handleDismissAndroidPromo();
                    openExternalLinkWithWarning(GITHUB_URL);
                  }}
                >
                  <Text style={styles.confirmDeleteText}>Get App</Text>
                </BouncyButton>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* iOS: simple yes/no demand-check, only after ~15-20 taps of actual
          engagement (not shown to someone who just landed and bounced).
          Auto-closes on either answer via handleIosInterestResponse. */}
      {Platform.OS === 'web' && showIosPrompt && (
        <View pointerEvents="box-none" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
          <View style={[styles.overlayModalBg, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={styles.customConfirmCard}>
              <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>Want DECENT on iOS?</Text>
              <Text style={styles.confirmSubText}>
                We're deciding whether to build an iOS app. Your answer helps us gauge demand.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <BouncyButton
                  style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                  onPress={() => handleIosInterestResponse('no')}
                >
                  <Text style={[styles.confirmDeleteText, { color: theme.text }]}>No</Text>
                </BouncyButton>
                <BouncyButton
                  style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#8B5CF6' }]}
                  onPress={() => handleIosInterestResponse('yes')}
                >
                  <Text style={styles.confirmDeleteText}>Yes</Text>
                </BouncyButton>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Moved to render last (after every other modal in this return) so its
          portal mounts last on web - react-native-web stacks Modal portals
          in mount order, not by which one opened more recently, so a
          generic alert declared earlier in source (like this one used to
          be) can end up buried underneath whatever page/profile modal is
          currently open, invisible until that other modal closes. Since
          this is used for confirmations/alerts from all over the app, it
          needs to reliably win that race regardless of what triggered it. */}
      {/* GENERIC APP-STYLED ALERT/CONFIRM - replaces Alert.alert everywhere in the app */}
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={!!appAlertConfig}
        onRequestClose={() => setAppAlertConfig(null)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setAppAlertConfig(null)}
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
          <View style={styles.customConfirmCard}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>{appAlertConfig?.title}</Text>
            {appAlertConfig?.message ? (
              <Text style={styles.confirmSubText}>{appAlertConfig.message}</Text>
            ) : null}
            <View style={{
              flexDirection: (appAlertConfig?.buttons?.length || 1) > 2 ? 'column' : 'row',
              gap: 10,
              width: '100%'
            }}>
              {appAlertConfig?.buttons.map((btn, i) => (
                <BouncyButton
                  key={i}
                  style={[
                    styles.confirmDeleteBtn,
                    { flex: (appAlertConfig?.buttons?.length || 1) > 2 ? undefined : 1 },
                    btn.style === 'cancel'
                      ? { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }
                      : btn.style === 'destructive'
                      ? { backgroundColor: '#EF4444' }
                      : { backgroundColor: '#8B5CF6' }
                  ]}
                  onPress={() => {
                    setAppAlertConfig(null);
                    btn.onPress && btn.onPress();
                  }}
                >
                  <Text style={[
                    styles.confirmDeleteText,
                    btn.style === 'cancel' && { color: theme.text }
                  ]}>{btn.text}</Text>
                </BouncyButton>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* SHARE PROFILE - copyable field, copy button with checkmark transition, Close/Share buttons.
          Only mounts while actually visible (was always in the tree, with
          just the `visible` prop toggling) - on web, a Modal's portal
          appears to stack by when it was actually mounted into the tree,
          not by its source code position. Since this used to mount once at
          app boot and just stay there, it could end up UNDER a modal like
          Designer Profile that mounts later (only when opened), regardless
          of which one is declared first in this file. Mounting it fresh
          only when needed means it's always the most-recently-mounted
          modal whenever it's actually shown. */}
      {shareModalVisible && (
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'fade'}
        transparent={true}
        visible={true}
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }, Platform.OS === 'web' && { zIndex: 500 }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setShareModalVisible(false)}
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
          <View style={[styles.customConfirmCard, isWebWide && { maxWidth: 420 }]}
            // Claims the touch responder so a tap that starts inside the card
            // (e.g. focusing a text field) never bubbles up to the backdrop's
            // dismiss handler. Needed because react-native-web's TextInput
            // (a plain DOM <input>) doesn't itself claim the responder the way
            // native TextInput does, so without this the touch would otherwise
            // propagate up and close the modal.
            onStartShouldSetResponder={() => Platform.OS === 'web'}
            onResponderRelease={() => {}}
          >
            <Text style={[styles.confirmTitle, isWebWide && { fontSize: 20 }]}>{shareType === 'portfolio' ? 'Share Portfolio' : 'Share Profile'}</Text>
            <Text style={[styles.confirmSubText, { marginBottom: 16 }]}>
              {shareType === 'portfolio' ? 'Anyone with this link can view this portfolio.' : 'Anyone with this link can view this profile.'}
            </Text>

            {shareType === 'profile' && shareIsOwnProfile && shareModalUrl ? (
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                {/* Tab switcher sized to match the QR box below it (160
                    content + 10*2 padding = 180) rather than stretching
                    full-width, so it visually reads as "controls for this
                    specific box" rather than a page-wide toggle. Switching
                    tabs swaps the actual live preview, not just which file
                    downloads - both branches source from the exact same
                    URL/component used by the download handlers below, so
                    preview and downloaded file can never drift apart. */}
                <AnimatedPillTabs
                  theme={theme}
                  themeMode={themeMode}
                  activeKey={qrPreviewMode}
                  onChange={setQrPreviewMode}
                  containerStyle={{ width: isWebWide ? 240 : 180, marginBottom: 10, padding: 3 }}
                  tabs={[
                    { key: 'plain', label: 'Plain QR', flex: false },
                    { key: 'decent', label: 'DECENT Style' }
                  ]}
                />

                <View style={{ width: isWebWide ? 240 : 180, height: isWebWide ? 240 : 180, alignItems: 'center', justifyContent: 'center', padding: 10, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
                  {qrPreviewMode === 'decent' ? (
                    <CircularQRCode
                      ref={styledQrExportRef}
                      value={shareModalUrl}
                      size={isWebWide ? 220 : 160}
                      color="#8B5CF6"
                      backgroundColor="#FFFFFF"
                      showLogo
                    />
                  ) : (
                    <Image
                      source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(shareModalUrl)}` }}
                      style={{ width: isWebWide ? 220 : 160, height: isWebWide ? 220 : 160 }}
                    />
                  )}
                </View>

                <Text style={{ color: theme.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 8, maxWidth: 220 }}>
                  Tip: add this to your resume or business card so people can pull up your portfolio instantly.
                </Text>

                <BouncyButton
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, marginTop: 10, borderRadius: 99, borderWidth: 1, borderColor: theme.border }}
                  onPress={qrPreviewMode === 'decent' ? handleDownloadStyledQr : handleDownloadPlainQr}
                >
                  <DownloadIconSVG color={theme.accent} size={15} />
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Download</Text>
                </BouncyButton>
              </View>
            ) : null}

            <BouncyButton
              style={{
                width: '100%', flexDirection: 'row', alignItems: 'center',
                backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border,
                borderRadius: 10, paddingLeft: 12, marginBottom: 20, overflow: 'hidden'
              }}
              onPress={handleCopyShareLink}
              activeOpacity={0.7}
            >
              <Text style={{ flex: 1, color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                {shareModalUrl}
              </Text>
              <View style={{
                width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
                backgroundColor: shareCopied ? '#10B981' : theme.primary, marginLeft: 8
              }}>
                {shareCopied ? <CheckIconSVG color="#FFFFFF" /> : <CopyIconSVG />}
              </View>
            </BouncyButton>

            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => setShareModalVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: theme.text }]}>Close</Text>
              </BouncyButton>
              <BouncyButton
                style={[styles.confirmDeleteBtn, { flex: 1 }]}
                onPress={() => {
                  setShareModalVisible(false);
                  Share.share({ message: shareModalUrl });
                }}
              >
                <Text style={styles.confirmDeleteText}>Share</Text>
              </BouncyButton>
            </View>
          </View>
        </View>
      </Modal>
      )}

      {/* FOLLOWERS / FOLLOWING USER LIST MODAL - same fix as Share above:
          only mounts while actually visible, so its portal is always
          created fresh (and later) than whatever page it's opened on top
          of. */}
      {userListModalVisible && (
      <Modal
        animationType={Platform.OS === 'web' ? 'none' : 'slide'}
        transparent={true}
        visible={true}
        onRequestClose={() => setUserListModalVisible(false)}
      >
        <View style={[styles.overlayModalBg, Platform.OS !== 'web' && { backgroundColor: 'rgba(11, 15, 23, 0.35)' }, Platform.OS === 'web' && { zIndex: 500 }]}
          onStartShouldSetResponder={() => Platform.OS === 'web'}
          onResponderRelease={() => setUserListModalVisible(false)}
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
          <SafeAreaView style={[styles.overlayModalContainer, { height: Math.min(560, Dimensions.get('window').height * 0.75), maxHeight: undefined }]}
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
              <Text style={[styles.modalTopTitle, isWebWide && { fontSize: 20 }]}>{userListTargetDesigner ? userListTargetDesigner.name : ''}</Text>
              <BouncyButton style={styles.closeBtn} onPress={() => setUserListModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </BouncyButton>
            </View>

            <AnimatedPillTabs
              theme={theme}
              themeMode={themeMode}
              activeKey={userListTab}
              onChange={handleSwitchUserListTab}
              containerStyle={{ marginHorizontal: 16, marginTop: 12 }}
              tabs={[
                { key: 'followers', label: 'Followers' },
                { key: 'following', label: 'Following' }
              ]}
            />

            {userListLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : userListItems.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {userListTab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
                </Text>
              </View>
            ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {userListItems.map((usr) => {
                const isFollowing = followedDesigners.includes(usr.id);
                return (
                  <BouncyButton
                    key={usr.id}
                    style={styles.designerItemCard}
                    onPress={() => {
                      setUserListModalVisible(false);
                      openDesignerModal(usr);
                    }}
                  >
                    <Image source={{ uri: usr.avatar }} style={styles.designerListAvatar} />
                    <View style={styles.designerInfoCol}>
                      <Text style={styles.designerListName}>{usr.name}</Text>
                      <Text style={styles.designerListRole}>{usr.role}</Text>
                    </View>

                    {!(session && usr.id === session.user.id) && (
                      <BouncyButton
                        style={[styles.smallFollowBtn, isFollowing && styles.smallFollowBtnActive]}
                        onPress={() => toggleFollowDesigner(usr.id)}
                      >
                        <Text style={[styles.smallFollowText, isFollowing && styles.smallFollowTextActive]}>
                          {isFollowing ? 'Following' : (usr.followsMe ? 'Follow Back' : '+ Follow')}
                        </Text>
                      </BouncyButton>
                    )}
                  </BouncyButton>
                );
              })}
            </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
      )}

      </View>
      </View>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme) => StyleSheet.create({
  thumbnailContainerCompact: {
    height: 120,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden'
  },
  cardBodyCompact: {
    padding: 8
  },
  cardTitleCompact: {
    fontSize: 13,
    lineHeight: 17
  },
  donateSettingBtn: {
    backgroundColor: '#F59E0B',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10
  },
  donateSettingBtnText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: '700'
  },
  donateIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  donateTiersRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 12
  },
  donateTierChip: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderRadius: 14.4,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center'
  },
  donateTierChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#F59E0B'
  },
  donateTierText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700'
  },
  donateTierTextActive: {
    color: '#F59E0B',
    fontSize: 16,
    fontWeight: '700'
  },
  donateTierSub: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 2
  },
  donateTierSubActive: {
    color: '#F59E0B',
    fontSize: 11,
    marginTop: 2
  },
  contrastDonateBtnFull: {
    width: '100%',
    backgroundColor: '#F59E0B',
    height: 44,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  contrastDonateBtnText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: '700'
  },
  knownContactBox: {
    padding: 14,
    backgroundColor: theme.mode === 'light' ? '#EAE7F5' : '#1E293B',
    borderRadius: 14.4,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10
  },
  knownContactTitle: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  knownContactEmail: {
    color: theme.accent,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2
  },
  knownContactSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2
  },
  feedbackNotifyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: 10
  },

  container: {
    flex: 1,
    backgroundColor: theme.bg
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: theme.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.mode === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)'
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoText: { fontSize: 18, fontWeight: '800', color: '#8B5CF6' },
  versionBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7.2,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)'
  },
  versionText: { color: theme.accent, fontSize: 11, fontWeight: '700' },
  headerRightActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 99, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  headerIconBtnWithBadge: { width: 36, height: 36, borderRadius: 99, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  unreadRedBadgeDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: theme.bg },

  notificationCard: { backgroundColor: theme.bg, borderRadius: 16.8, borderWidth: 1, borderColor: theme.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.border },
  notifText: { color: theme.mode === 'light' ? '#4C1D95' : '#CBD5E1', fontSize: 13, lineHeight: 18 },
  notifUserBold: { color: theme.text, fontWeight: '800' },
  notifTargetBold: { color: theme.accent, fontWeight: '700' },
  notifTimeText: { color: theme.textSecondary, fontSize: 11, marginTop: 3 },
  notifTypeIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },

  notifFollowBackBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  notifFollowBackBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#8B5CF6' },
  notifFollowBackText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  notifFollowBackTextActive: { color: theme.accent },

  mainViewContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 110 },
  hero: { marginBottom: 16, alignItems: 'center' },
  heroBadge: {
    color: theme.accent,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: theme.text, textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  
  pageHeaderBox: { marginBottom: 12 },
  pageHeaderTitle: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 4 },
  pageHeaderSubtitle: { fontSize: 13, color: theme.textSecondary },

  iconTextInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  inputWithClearRow: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  clearFieldBtn: { position: 'absolute', right: 12, top: '50%', marginTop: -14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', zIndex: 10 },

  storiesBarScroll: { flexDirection: 'row', marginBottom: 20 },
  storyCircleWrapper: { alignItems: 'center', marginRight: 14, width: 62 },
  storyRing: {
    width: 58, height: 58, borderRadius: 29, padding: 2.5,
    borderWidth: 2, borderColor: theme.border, backgroundColor: theme.bg
  },
  storyRingActive: { borderColor: '#8B5CF6' },
  storyAvatar: { width: '100%', height: '100%', borderRadius: 31.2 },
  storyNameText: { color: theme.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  storyNameTextActive: { color: theme.accent, fontWeight: '800' },

  topCategoryBarWrapper: { marginBottom: 20, paddingTop: 20, paddingLeft: 20, paddingRight: 20 },
  topCategoryScrollView: { flexDirection: 'row' },
  topCategoryChip: {
    backgroundColor: Platform.OS !== 'web' ? 'transparent' : theme.surface, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 99, borderWidth: 1, borderColor: theme.border, marginRight: 8, overflow: 'hidden'
  },
  topCategoryChipActive: { backgroundColor: Platform.OS !== 'web' ? 'transparent' : '#8B5CF6', borderColor: '#8B5CF6' },
  topCategoryText: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' },
  topCategoryTextActive: { color: '#FFFFFF', fontWeight: '700' },
  grid2x2CategoryBtn: {
    backgroundColor: '#8B5CF6', width: 34, height: 34, borderRadius: 99,
    alignItems: 'center', justifyContent: 'center', marginRight: 16
  },

  categorySearchInput: {
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, color: theme.text, fontSize: 13, marginBottom: 10
  },
  selectedCategoriesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  selectedCategoryPill: {
    backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99
  },
  selectedCategoryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  categoryVerticalListContainer: {
    backgroundColor: theme.surface, borderRadius: 14.4, borderWidth: 1, borderColor: theme.border, padding: 8, marginBottom: 14
  },
  categoryVerticalItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  categoryVerticalItemActive: { backgroundColor: 'rgba(139, 92, 246, 0.2)' },
  categoryVerticalText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  categoryVerticalTextActive: { color: theme.accent, fontWeight: '800' },
  addCustomCategoryItemBtn: { paddingVertical: 12, alignItems: 'center', backgroundColor: theme.bg, borderRadius: 99, marginTop: 4 },
  addCustomCategoryItemText: { color: '#8B5CF6', fontSize: 12, fontWeight: '700' },
  moreCategoriesChip: { backgroundColor: theme.bg, borderWidth: 1, borderColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99 },
  moreCategoriesText: { color: theme.accent, fontSize: 11, fontWeight: '700' },

  leftAlignedEngagementStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statInlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.border },
  statInlineNumText: { color: theme.text, fontSize: 12, fontWeight: '700' },

  stickyModalTitleBar: {
    backgroundColor: theme.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: 'center'
  },
  stickyModalTitleText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800'
  },

  stickyModalBackToTopBtn: {
    position: 'absolute', bottom: 90, right: 20,
    width: 44, height: 44, borderRadius: 99,
    backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center',
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 6, zIndex: 99
  },

  floatingLikeCircleBtn: {
    position: 'absolute', bottom: 28, right: 20,
    width: 52, height: 52, borderRadius: 99,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 10, zIndex: 99,
    opacity: 1
  },

  customConfirmCard: {
    backgroundColor: theme.surface, borderRadius: 24, borderWidth: 1, borderColor: theme.border,
    padding: 24, width: '100%', maxWidth: 340, alignItems: 'center'
  },
  confirmIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(239, 68, 68, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  successIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(16, 185, 129, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 8, textAlign: 'center' },
  confirmSubText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  linkUrlBox: { backgroundColor: theme.bg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.border, width: '100%', marginBottom: 20 },
  linkUrlText: { color: '#8B5CF6', fontSize: 12, textAlign: 'center', fontWeight: '600' },
  confirmActionsRow: { flexDirection: 'row', gap: 10, width: '100%' },
  confirmCancelBtn: { flex: 1, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, height: 44, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  confirmCancelText: { color: theme.textSecondary, fontSize: 13, fontWeight: '700' },
  confirmDeleteBtn: { flex: 1, backgroundColor: theme.mode === 'light' ? '#6D28D9' : '#8B5CF6', height: 44, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  confirmDeleteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  overlayModalBg: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(11, 15, 23, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  overlayModalContainer: {
    backgroundColor: theme.surface, borderRadius: 24, borderWidth: 1, borderColor: theme.border,
    maxHeight: '85%', width: '100%', overflow: 'hidden',
    ...(Platform.OS === 'web' ? { maxWidth: 480, alignSelf: 'center' } : {})
  },
  accountSettingsScrollContent: { padding: 20, gap: 12 },
  saveAccountSettingsBtn: { backgroundColor: theme.mode === 'light' ? '#6D28D9' : '#8B5CF6', height: 44, borderRadius: 99, alignItems: 'center', justifyContent: 'center', marginTop: 16 },

  allCategoriesGrid: { padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  overlayCategoryCard: { width: '48%', backgroundColor: theme.bg, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 14.4, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  overlayCategoryCardActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  overlayCategoryText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  overlayCategoryTextActive: { color: '#FFFFFF' },

  stickyBackToTopBtn: {
    position: 'absolute', bottom: 100, right: 20, width: 42, height: 42,
    borderRadius: 99, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center',
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, zIndex: 99
  },

  emptyFollowedBox: { backgroundColor: theme.surface, borderRadius: 19.2, borderWidth: 1, borderColor: theme.border, padding: 24, alignItems: 'center', marginTop: 10 },
  emptyFollowedTitle: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 8, textAlign: 'center' },
  emptyFollowedSub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  discoverDesignersBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 99 },
  discoverBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  grid: Platform.OS === 'web'
    ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 20 }
    : { gap: 20 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 19.2,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { width: '48.5%' } : {})
  },
  thumbnailContainer: { position: 'relative', width: '100%', aspectRatio: 16 / 9, backgroundColor: '#070A10' },
  cardCover: { width: '100%', height: '100%' },
  prototypeBadgesRow: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8, zIndex: 10 },
  protoBadgeIconOnly: {
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardBody: { padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1, marginRight: 8 },
  likeButtonRightAligned: { padding: 4, alignSelf: 'flex-start' },
  cardDesc: { fontSize: 13, color: theme.textSecondary, marginBottom: 16, lineHeight: 18 },
  
  designerRowWithFollow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 },
  designerRowLeftCol: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  designerAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.border },
  cardDesignerName: { color: theme.accent, fontSize: 12, fontWeight: '600', flex: 1, flexWrap: 'wrap' },
  cardFollowBtnRight: { backgroundColor: '#8B5CF6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  cardFollowBtnRightActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#8B5CF6' },
  cardFollowBtnText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  cardFollowBtnTextActive: { color: theme.accent },

  profileTabsBar: {
    flexDirection: 'row', backgroundColor: theme.surface, borderRadius: 99, padding: 4,
    marginVertical: 20, borderWidth: 1, borderColor: theme.border, gap: 4
  },
  profileTabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 99 },
  profileTabBtnActive: { backgroundColor: '#8B5CF6' },
  profileTabBtnText: { fontSize: 12, color: theme.textSecondary, fontWeight: '700' },
  profileTabBtnTextActive: { color: '#FFFFFF' },

  twoRowContainer: { flexDirection: 'row', gap: 16 },
  twoRowColumn: { gap: 16 },
  emptyTabContainer: { paddingVertical: 24, alignItems: 'center' },

  floatingBottomBar: {
    position: 'absolute', bottom: 14, left: 20, right: 20, height: 64,
    backgroundColor: theme.surface, borderRadius: 28.8, borderWidth: 1, borderColor: theme.border,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 12, zIndex: 100
  },
  uniformTabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  menuLabel: { fontSize: 10, fontWeight: '600', color: theme.textSecondary, marginTop: 2 },
  menuLabelActive: { color: '#8B5CF6', fontWeight: '700' },
  plusContainerBtn: {
    width: 44, height: 44, borderRadius: 99, backgroundColor: '#8B5CF6',
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 4,
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6
  },

  searchContainer: { marginBottom: 20 },
  searchInput: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 14.4, paddingHorizontal: 16, paddingVertical: 12, color: theme.text, fontSize: 14 },
  keywordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  keywordChip: { backgroundColor: theme.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: theme.border },
  keywordText: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  designersList: { gap: 12 },
  designerItemCard: { backgroundColor: theme.surface, borderRadius: 16.8, borderWidth: 1, borderColor: theme.border, padding: 14, flexDirection: 'row', alignItems: 'center' },
  designerListAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  designerInfoCol: { flex: 1 },
  designerListName: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 2 },
  designerListRole: { fontSize: 12, color: theme.accent, fontWeight: '600', marginBottom: 2 },
  designerListLoc: { fontSize: 11, color: theme.textSecondary },
  emptySearchText: { color: theme.textSecondary, fontSize: 13, marginTop: 20 },

  designerCardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  smallFollowBtn: { flex: 1, backgroundColor: '#8B5CF6', paddingVertical: 6, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  smallFollowBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#8B5CF6' },
  smallFollowText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  smallFollowTextActive: { color: theme.accent },
  smallShareBtnIconOnly: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 14, backgroundColor: theme.bg, borderRadius: 14.4, paddingVertical: 10, paddingHorizontal: 20, gap: 20, borderWidth: 1, borderColor: theme.border },
  statItem: { alignItems: 'center', paddingHorizontal: 12 },
  statNum: { fontSize: 16, fontWeight: '800', color: theme.text },
  statLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: theme.border },

  designerProfileActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12, width: '100%', alignItems: 'center' },
  modalFollowBtn: { flex: 1, backgroundColor: '#8B5CF6', paddingVertical: 12, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  modalFollowBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#8B5CF6' },
  modalFollowText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalFollowTextActive: { color: theme.accent },
  modalShareBtnIconOnly: { width: 44, height: 44, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },

  categoryPillsRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  categoryPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  categoryPillActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  categoryPillText: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' },
  categoryPillTextActive: { color: '#FFFFFF' },

  profileCard: { backgroundColor: theme.surface, borderRadius: 19.2, borderWidth: 1, borderColor: theme.border, padding: 24, alignItems: 'center', position: 'relative' },
  profileTopRightShareBtn: { position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 99, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  profileLargeAvatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  profileName: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 4, textAlign: 'center' },
  profileRole: { fontSize: 13, color: theme.accent, fontWeight: '600', marginBottom: 2 },
  profileLocText: { fontSize: 12, color: theme.textSecondary },
  profileBio: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 8 },

  socialCircularLinksRow: { flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'center' },
  socialCircleBtn: { width: 38, height: 38, borderRadius: 99, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  socialCirclePreviewBtn: { width: 42, height: 42, borderRadius: 99, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },

  avatarEditPickerBtn: { alignSelf: 'center', width: 90, height: 90, borderRadius: 99, overflow: 'hidden', position: 'relative', marginBottom: 10 },
  avatarEditPreview: { width: '100%', height: '100%' },
  avatarEditOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(11, 15, 23, 0.75)', paddingVertical: 4, alignItems: 'center' },
  avatarEditText: { color: theme.accent, fontSize: 9, fontWeight: '700' },

  settingItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  settingToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  settingItemTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
  settingItemSub: { color: theme.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 16 },
  settingItemValue: { color: theme.accent, fontSize: 13, fontWeight: '600' },

  smallSquaresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  squarePickerWrapper: { position: 'relative' },
  removeImageBadge: { position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: theme.bg, borderWidth: 1, borderColor: '#EF4444', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  videoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  removeVideoBtn: { width: 42, height: 42, backgroundColor: theme.bg, borderWidth: 1, borderColor: '#EF4444', borderRadius: 99, alignItems: 'center', justifyContent: 'center' },

  ownerActionsRow: { flexDirection: 'row', gap: 8, marginRight: 10 },
  ownerIconBtn: { width: 32, height: 32, borderRadius: 99, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },

  warningNoteBox: {
    backgroundColor: 'rgba(234, 179, 8, 0.12)', borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.3)',
    borderRadius: 12, padding: 12, marginBottom: 16
  },
  warningTitle: { color: '#FACC15', fontSize: 13, fontWeight: '700' },
  warningText: { color: theme.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },

  inputErrorBorder: { borderColor: '#EF4444' },
  errorText: { color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 4, marginBottom: 8 },

  bigRectanglePicker: {
    width: '100%', aspectRatio: 16 / 9, backgroundColor: theme.surface, borderRadius: 16.8,
    borderWidth: 1.5, borderColor: theme.border,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center'
  },
  bigRectanglePreview: { width: '100%', height: '100%' },
  pickerPlaceholderCol: { alignItems: 'center', padding: 12, gap: 4 },
  pickerTextMain: { color: theme.text, fontSize: 13, fontWeight: '700' },
  pickerSubText: { color: theme.textSecondary, fontSize: 11 },

  smallSquarePicker: {
    width: (SCREEN_WIDTH - 40 - 24) / 3, height: (SCREEN_WIDTH - 40 - 24) / 3,
    backgroundColor: theme.surface, borderRadius: 14.4,
    borderWidth: 1.5, borderColor: theme.border,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center'
  },
  smallSquarePreview: { width: '100%', height: '100%' },
  squarePickerText: { color: theme.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  addMoreVideoBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)', borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)',
    paddingVertical: 10, borderRadius: 99, alignItems: 'center', justifyContent: 'center', marginTop: 4
  },
  addMoreVideoText: { color: theme.accent, fontSize: 12, fontWeight: '700' },

  stickyWizardBottomBar: {
    height: 72,
    backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10
  },
  uniformWizardBtnBack: {
    height: 44, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border,
    borderRadius: 99, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    paddingHorizontal: 16
  },
  uniformWizardBtnPrimary: {
    height: 44, backgroundColor: '#8B5CF6', flex: 1,
    borderRadius: 99, alignItems: 'center', justifyContent: 'center'
  },
  backBtnText: { color: theme.textSecondary, fontSize: 13, fontWeight: '700' },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  confirmReviewCard: {
    backgroundColor: theme.surface, borderRadius: 16.8, borderWidth: 1, borderColor: theme.border,
    padding: 16, marginBottom: 16
  },
  reviewCover: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, marginBottom: 12 },
  reviewTitle: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 2 },
  reviewDesigner: { fontSize: 12, color: theme.accent, fontWeight: '600', marginBottom: 8 },
  reviewCategory: { fontSize: 12, color: theme.textSecondary, marginBottom: 8 },
  reviewBrief: { fontSize: 13, color: theme.textSecondary, lineHeight: 18, marginBottom: 14 },
  reviewSummaryRow: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, gap: 4 },
  reviewStat: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },

  modalContainer: {
    flex: 1, backgroundColor: theme.bg,
    ...(Platform.OS === 'web' ? { maxWidth: 480, width: '100%', alignSelf: 'center' } : {})
  },
  modalTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface },
  modalTopTitle: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 99, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: theme.mode === 'light' ? '#6D28D9' : '#FFF', fontSize: 16, fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: theme.surface, padding: 6, marginHorizontal: 16, marginVertical: 10, borderRadius: 14.4, gap: 6 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 99 },
  tabBtnActive: { backgroundColor: '#8B5CF6' },
  tabBtnText: { color: theme.textSecondary, fontSize: 12, fontWeight: '700' },
  tabBtnTextActive: { color: '#FFF' },
  modalBody: { flex: 1 },
  webViewWrapper: { flex: 1, position: 'relative' },
  webView: { flex: 1, backgroundColor: '#000' },
  loaderOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  loaderText: { color: theme.textSecondary, fontSize: 13, marginTop: 12, fontWeight: '600' },
  caseScrollView: { flex: 1 },
  caseContent: { padding: 20 },
  caseTitle: { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 4 },
  designerRowModal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  designerRowModalLeftCol: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  designerAvatarModal: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.border },
  caseDesigner: { fontSize: 14, color: theme.accent, fontWeight: '700' },
  caseDesignerRole: { fontSize: 11, color: theme.textSecondary, fontWeight: '600' },
  modalDesignerFollowBtnRight: { backgroundColor: '#8B5CF6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99 },
  modalDesignerFollowBtnRightActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#8B5CF6' },
  modalDesignerFollowTextRight: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  modalDesignerFollowTextRightActive: { color: theme.accent },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  linkChip: { backgroundColor: theme.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9.6, borderWidth: 1, borderColor: theme.border },
  linkChipText: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  briefBox: { backgroundColor: theme.mode === 'light' ? 'rgba(109, 40, 217, 0.06)' : 'rgba(30, 41, 59, 0.5)', borderLeftWidth: 4, borderLeftColor: '#8B5CF6', padding: 14, borderRadius: 9.6, marginBottom: 20 },
  briefText: { color: theme.text, fontSize: 14, lineHeight: 20 },
  sectionHeader: { fontSize: 12, fontWeight: '800', color: theme.textSecondary, letterSpacing: 1, marginBottom: 12, marginTop: 10 },
  galleryScroll: { marginBottom: 24 },
  galleryImage: { width: 200, height: 320, borderRadius: 14.4, marginRight: 12 },
  caseBodyText: { color: theme.textSecondary, fontSize: 14, lineHeight: 22 },
  formGroupLabel: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 6, marginTop: 12 },
  formInput: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: theme.text, fontSize: 13 }
});

// SafeAreaProvider gives every SafeAreaView in the app access to real device
// insets (status bar, camera cutout, gesture bar), which React Native's own
// built-in SafeAreaView doesn't provide on Android.
const AppWithSafeArea = () => (
  <SafeAreaProvider>
    <App />
  </SafeAreaProvider>
);

// Error boundaries must be class components - React doesn't support this
// with hooks. Catches any render crash, reports it to Sentry automatically
// (matching how crash reporting already works everywhere else in the app -
// no extra consent prompt, consistent with existing behavior), and shows a
// simple recovery screen instead of a blank/frozen app.
class CrashFallbackBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    Sentry.captureException(error);
    console.warn('Caught by CrashFallbackBoundary:', error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0F17', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <WarningTriangleSVG />
            </View>
            <Text style={{ color: '#F8FAFC', fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>
              Something Went Wrong
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
              We've automatically been notified and are looking into it. Try restarting - your data is safe.
            </Text>
            <BouncyButton
              style={{ backgroundColor: '#8B5CF6', height: 48, paddingHorizontal: 32, borderRadius: 99, alignItems: 'center', justifyContent: 'center' }}
              onPress={this.handleRestart}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>Restart</Text>
            </BouncyButton>
          </SafeAreaView>
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

// Wrapping with Sentry gives automatic crash reporting and a basic
// performance trace for the whole app, on top of the manual error
// logging already scattered through the code via console.warn.
export default Sentry.wrap(() => (
  <ThemeProvider>
    <LightweightModeProvider>
      <CrashFallbackBoundary>
        <AppWithSafeArea />
      </CrashFallbackBoundary>
    </LightweightModeProvider>
  </ThemeProvider>
));
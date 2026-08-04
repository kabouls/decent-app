import { supabase } from './supabase';
import * as Sentry from '@sentry/react-native';

// Crash reporting. Replace this DSN with your own from sentry.io (free tier).
// Enabled everywhere for now so you can verify the test button works -
// once confirmed, change enabled back to !__DEV__ so it only reports
// real crashes in production builds, not local testing noise.
Sentry.init({
  dsn: 'https://YOUR_SENTRY_DSN_HERE@oXXXXXX.ingest.sentry.io/XXXXXXX',
  tracesSampleRate: 1.0,
  enabled: true
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
  SafeAreaView,
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
  RefreshControl,
  AppState,
  Keyboard,
  Switch
} from 'react-native';
import { WebView } from 'react-native-webview';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { BlurView } from 'expo-blur';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
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

const RESPONSIVE_PROFILE_CARD_WIDTH = (SCREEN_WIDTH - 40 - 16) / 2;

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

const HeartIconSVG = React.memo(({ liked }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill={liked ? '#EF4444' : 'none'}>
    <Path
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      stroke={liked ? '#EF4444' : '#FFFFFF'}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </Svg>
));

const EyeViewIconSVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="12" r="3" stroke="#94A3B8" strokeWidth="2"/>
  </Svg>
));

const UserFollowIconSVG = React.memo(({ following }) => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={following ? '#C084FC' : '#FFFFFF'} strokeWidth="2" strokeLinecap="round" />
    <Circle cx="8.5" cy="7" r="4" stroke={following ? '#C084FC' : '#FFFFFF'} strokeWidth="2" />
    <Path d={following ? "M17 11l2 2 4-4" : "M20 8v6M23 11h-6"} stroke={following ? '#10B981' : '#FFFFFF'} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const BellSVG = React.memo(({ active = false }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke={active ? '#FFFFFF' : '#D8B4FE'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const CogWheelSVG = React.memo(({ active = false }) => (
  <Svg width="19" height="19" viewBox="0 0 24 24" fill="none">
    <Path
      d="M19.14 12.94C19.18 12.63 19.2 12.32 19.2 12C19.2 11.68 19.18 11.37 19.14 11.06L21.16 9.48C21.34 9.34 21.39 9.09 21.28 8.89L19.36 5.56C19.25 5.36 19 5.28 18.79 5.36L16.41 6.22C15.92 5.84 15.39 5.53 14.81 5.29L14.45 2.76C14.41 2.54 14.22 2.38 14 2.38H10C9.78 2.38 9.59 2.54 9.55 2.76L9.19 5.29C8.61 5.53 8.08 5.85 7.59 6.22L5.21 5.36C5 5.28 4.75 5.36 4.64 5.56L2.72 8.89C2.61 9.09 2.66 9.34 2.84 9.48L4.86 11.06C4.82 11.37 4.8 11.69 4.8 12C4.8 12.31 4.82 12.63 4.86 12.94L2.84 14.52C2.66 14.66 2.61 14.91 2.72 15.11L4.64 18.44C4.75 18.64 5 18.72 5.21 18.64L7.59 17.78C8.08 18.16 8.61 18.47 9.19 18.71L9.55 21.24C9.59 21.46 9.78 21.62 10 21.62H14C14.22 21.62 14.41 21.46 14.45 21.24L14.81 18.71C15.39 18.47 15.92 18.16 16.41 17.78L18.79 18.64C19 18.72 19.25 18.64 19.36 18.44L21.28 15.11C21.39 14.91 21.34 14.66 21.16 14.52L19.14 12.94ZM12 15.5C10.34 15.5 9 14.16 9 12.5C9 10.84 10.34 9.5 12 9.5C13.66 9.5 15 10.84 15 12.5C15 14.16 13.66 15.5 12 15.5Z"
      fill={active ? '#FFFFFF' : '#D8B4FE'}
    />
  </Svg>
));

const ChevronRightSVG = React.memo(({ color = "#8B5CF6", size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const ChevronLeftSVG = React.memo(({ color = "#94A3B8", size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const ChevronUpSVG = React.memo(({ color = "#FFFFFF", size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 15l-6-6-6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const ClearTextXSVG = React.memo(() => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
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
      fill={active ? 'rgba(139, 92, 246, 0.25)' : 'none'}
    />
  </Svg>
));

const FollowedTabSVG = React.memo(({ active }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="7.5" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2.8" />
    <Circle cx="12" cy="3.6" r="2.3" fill={active ? '#8B5CF6' : '#94A3B8'} />
    <Circle cx="19.8" cy="16.2" r="2.3" fill={active ? '#8B5CF6' : '#94A3B8'} />
    <Circle cx="4.2" cy="16.2" r="2.3" fill={active ? '#8B5CF6' : '#94A3B8'} />
  </Svg>
));

const PlusSVG = React.memo(() => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path d="M12 5V19M5 12H19" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
));

const SearchSVG = React.memo(({ active }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="7" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2" />
    <Path d="M20 20L16 16" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const ProfileSVG = React.memo(({ active }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="7" r="4" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2" />
    <Path d="M4 21C4 17.134 7.58172 14 12 14C16.4183 14 20 17.134 20 21" stroke={active ? '#8B5CF6' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const Grid2x2SVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="8" height="8" rx="2" fill="#FFFFFF" />
    <Rect x="13" y="3" width="8" height="8" rx="2" fill="#FFFFFF" />
    <Rect x="13" y="13" width="8" height="8" rx="2" fill="#FFFFFF" />
    <Rect x="3" y="13" width="8" height="8" rx="2" fill="#FFFFFF" />
  </Svg>
));

const ShareIconSVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Circle cx="18" cy="5" r="3" stroke="#D8B4FE" strokeWidth="2" />
    <Circle cx="6" cy="12" r="3" stroke="#D8B4FE" strokeWidth="2" />
    <Circle cx="18" cy="19" r="3" stroke="#D8B4FE" strokeWidth="2" />
    <Path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="#D8B4FE" strokeWidth="2" />
  </Svg>
));

const EditIconSVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#D8B4FE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#D8B4FE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

const LocationPinSVG = React.memo(() => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="9" r="2.5" stroke="#94A3B8" strokeWidth="2"/>
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

const ExpandIconSVG = React.memo(({ color = '#C084FC', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const CollapseIconSVG = React.memo(({ color = '#C084FC', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 8V5a2 2 0 0 1 2-2h3M19 8V5a2 2 0 0 0-2-2h-3M19 16v3a2 2 0 0 1-2 2h-3M5 16v3a2 2 0 0 0 2 2h3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

const VideoIconSVG = React.memo(({ color = '#94A3B8', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="5" width="15" height="14" rx="2" stroke={color} strokeWidth="2" />
    <Path d="M17 10L22 7V17L17 14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const CameraIconSVG = React.memo(() => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 3H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="13" r="4" stroke="#8B5CF6" strokeWidth="2"/>
  </Svg>
));

const DetailsStepSVG = React.memo(({ color }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M14 2V8H20" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M16 13H8" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <Path d="M16 17H8" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </Svg>
));

const LinksStepSVG = React.memo(({ color }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
));

const MediaStepSVG = React.memo(({ color }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth="2" />
    <Circle cx="8.5" cy="8.5" r="1.5" fill={color} />
    <Path d="M21 15l-5-5L5 21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const ReviewStepSVG = React.memo(({ color }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M22 4L12 14.01l-3-3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
));

const CheckIconSVG = React.memo(() => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
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
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

const isValidHandleFormat = (h) => /^[A-Za-z0-9._-]{3,20}$/.test(h);

const renderFormattedDescription = (raw) => {
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
      <Text key={lineIdx} style={{ color: '#E2E8F0', fontSize, fontWeight, lineHeight: fontSize * 1.5, marginBottom: 6 }}>
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

const GlobeIconSVG = React.memo(() => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke="#94A3B8" strokeWidth="2" />
    <Path d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" stroke="#94A3B8" strokeWidth="2" />
  </Svg>
));

const getSocialLogoSVG = (url) => {
  if (!url) return <GlobeIconSVG />;
  const lower = url.toLowerCase();
  if (lower.includes('figma.com')) return <FigmaLogoSVG />;
  if (lower.includes('dribbble.com')) return <DribbbleLogoSVG />;
  if (lower.includes('linkedin.com')) return <LinkedInLogoSVG />;
  if (lower.includes('github.com')) return <GitHubLogoSVG />;
  if (lower.includes('twitter.com') || lower.includes('x.com')) return <TwitterLogoSVG />;
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return <YouTubeLogoSVG />;
  return <GlobeIconSVG />;
};

// Popular Keywords
const INTRO_CAROUSEL_PAGES = [
  {
    icon: 'sparkle',
    title: 'Welcome to DECENT',
    body: "DECENT exists to put every UI/UX portfolio you've ever made under one roof \u2014 one link you can hand to a hiring manager, and one place to actually showcase the craft behind your work, not just static screenshots buried in a PDF."
  },
  {
    icon: 'image',
    title: 'Build a Real Case Study',
    body: "Each portfolio package can include a live Figma prototype, flat design pages, a cover thumbnail, extra showcase images, and a video link for a walkthrough or demo. Add a detailed, formatted write-up too \u2014 it shows right under your images."
  },
  {
    icon: 'share',
    title: 'Share It Anywhere',
    body: "Your unique handle is your identity on DECENT. Share it with anyone \u2014 recruiters, clients, fellow designers \u2014 and they can pull up your full profile and every portfolio you've published, all in one place."
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
  isTwoRowCard = false
}) => (
  <TouchableOpacity
    style={[
      styles.card,
      customWidth ? { width: customWidth } : null,
      isTwoRowCard && styles.cardCompactProfile
    ]}
    activeOpacity={0.88}
    onPress={() => onPress(item)}
  >
    <View style={[styles.thumbnailContainer, isTwoRowCard && styles.thumbnailContainerCompact]}>
      <Image source={{ uri: item.cover }} style={styles.cardCover} />
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
    </View>

    <View style={[styles.cardBody, isTwoRowCard && styles.cardBodyCompact]}>
      <View style={styles.titleRow}>
        <Text style={[styles.cardTitle, isTwoRowCard && styles.cardTitleCompact]} numberOfLines={2}>{item.title}</Text>
        {onToggleLike ? (
          <TouchableOpacity style={[styles.likeButtonRightAligned, { alignItems: 'center' }]} onPress={() => onToggleLike(item.id)}>
            <HeartIconSVG liked={item.liked} />
            <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '700', marginTop: 1 }}>{formatCompactNumber(item.likesCount)}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!hideBrief && (
        <Text style={styles.cardDesc} numberOfLines={2}>{item.brief}</Text>
      )}

      <View style={styles.designerRowWithFollow}>
        <TouchableOpacity
          style={styles.designerRowLeftCol}
          activeOpacity={0.7}
          onPress={() => onOpenDesignerProfile && onOpenDesignerProfile(item.designer)}
        >
          <Image source={{ uri: item.designerAvatar }} style={styles.designerAvatar} />
          <Text style={styles.cardDesignerName} numberOfLines={2}>{item.designerHandle ? formatHandleDisplay(item.designerHandle) : item.designer}</Text>
        </TouchableOpacity>

        {onToggleFollow && !isOwnContent && (
          <TouchableOpacity
            style={[styles.cardFollowBtnRight, isFollowing && styles.cardFollowBtnRightActive]}
            onPress={() => onToggleFollow(item.designer)}
          >
            <Text style={[styles.cardFollowBtnText, isFollowing && styles.cardFollowBtnTextActive]}>
              {isFollowing ? 'Following' : (followsMe ? 'Follow Back' : '+ Follow')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  </TouchableOpacity>
));

const ProjectGrid = React.memo(({ items, onPress, onToggleLike, onOpenDesignerProfile, onToggleFollow, followedDesigners, currentUserId }) => (
  <View style={styles.grid}>
    {items.map((item) => (
      <ProjectCard
        key={item.id}
        item={item}
        onPress={onPress}
        onToggleLike={onToggleLike}
        onOpenDesignerProfile={onOpenDesignerProfile}
        onToggleFollow={onToggleFollow}
        isFollowing={followedDesigners ? followedDesigners.includes(item.designer) : false}
        followsMe={!!item.followsMe}
        isOwnContent={!!currentUserId && item.ownerId === currentUserId}
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

const TwoRowHorizontalGrid = React.memo(({ items, onPress, onToggleLike, onOpenDesignerProfile, onToggleFollow, followedDesigners, currentUserId }) => {
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
                isFollowing={followedDesigners ? followedDesigners.includes(item.designer) : false}
                isOwnContent={!!currentUserId && item.ownerId === currentUserId}
                customWidth={RESPONSIVE_PROFILE_CARD_WIDTH}
                hideBrief={true}
                isTwoRowCard={true}
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

function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [emailOrHandle, setEmailOrHandle] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null); // { title, message }

  const showAppAlert = (title, message) => {
    Keyboard.dismiss();
    setAlertConfig({ title, message });
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
    setLoading(true);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email: emailOrHandle.trim(), password });
      setLoading(false);
      if (error) {
        showAppAlert('Error', error.message);
      } else {
        showAppAlert('Confirm Your Email', 'We have sent you an email confirmation. Confirm it before logging in!');
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
    >
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0F17', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#F8FAFC', fontSize: 24, fontWeight: '800', marginBottom: 24, textAlign: 'center' }}>
        {mode === 'login' ? 'Log In' : 'Sign Up'}
      </Text>
      <FocusableTextInput
        style={{ backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 10, padding: 12, color: '#F8FAFC', marginBottom: 12 }}
        placeholder={mode === 'login' ? 'Email or Handle' : 'Email'}
        placeholderTextColor="#94A3B8"
        autoCapitalize="none"
        keyboardType={mode === 'login' ? 'default' : 'email-address'}
        value={emailOrHandle}
        onChangeText={setEmailOrHandle}
      />
      <FocusableTextInput
        style={{ backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 10, padding: 12, color: '#F8FAFC', marginBottom: 20 }}
        placeholder="Password"
        placeholderTextColor="#94A3B8"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity
        style={{ backgroundColor: '#8B5CF6', height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#FFF" /> : (
          <Text style={{ color: '#FFF', fontWeight: '800' }}>{mode === 'login' ? 'Log In' : 'Sign Up'}</Text>
        )}
      </TouchableOpacity>
      {mode === 'login' && (
        <TouchableOpacity onPress={handleForgotPassword} style={{ marginBottom: 16 }}>
          <Text style={{ color: '#94A3B8', textAlign: 'center', fontWeight: '600', fontSize: 13 }}>
            Forgot password?
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        <Text style={{ color: '#C084FC', textAlign: 'center', fontWeight: '600' }}>
          {mode === 'login' ? "No account? Sign up" : 'Already have an account? Log in'}
        </Text>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent={true}
        visible={!!alertConfig}
        onRequestClose={() => setAlertConfig(null)}
      >
        <View style={styles.overlayModalBg}>
          <View style={[styles.customConfirmCard, { position: 'relative' }]}>
            <TouchableOpacity
              style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
              onPress={() => setAlertConfig(null)}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <Text style={[styles.confirmTitle, { marginTop: 10 }]}>{alertConfig?.title}</Text>
            {alertConfig?.message ? <Text style={styles.confirmSubText}>{alertConfig.message}</Text> : null}
            <TouchableOpacity
              style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 8, backgroundColor: '#8B5CF6' }]}
              onPress={() => setAlertConfig(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.confirmDeleteText, { fontSize: 15 }]}>OK, Got It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function App() {
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [followedDesigners, setFollowedDesigners] = useState([]);
  const [liveDesigners, setLiveDesigners] = useState([]);
  const [myFollowStats, setMyFollowStats] = useState({ followersCount: 0, followingCount: 0 });
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
  const [unreadNotifications, setUnreadNotifications] = useState(true);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [externalLinkModalVisible, setExternalLinkModalVisible] = useState(false);
  const [targetExternalUrl, setTargetExternalUrl] = useState('');

  const [accountSettingsModalVisible, setAccountSettingsModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePasswordPageVisible, setChangePasswordPageVisible] = useState(false);
  const [accountSettingsDiscardWarningVisible, setAccountSettingsDiscardWarningVisible] = useState(false);
  const [passwordPageDiscardWarningVisible, setPasswordPageDiscardWarningVisible] = useState(false);
  const [accountSaveSuccessModalVisible, setAccountSaveSuccessModalVisible] = useState(false);

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

  // Settings Secondary Modals
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [blockedUsersModalVisible, setBlockedUsersModalVisible] = useState(false);
  const [reportsModalVisible, setReportsModalVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPasswordModalVisible, setAdminPasswordModalVisible] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPanelVisible, setAdminPanelVisible] = useState(false);
  const [feedbackMessagesList, setFeedbackMessagesList] = useState([]);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pushRegistrationStatus, setPushRegistrationStatus] = useState('Not attempted yet');
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [optionsView, setOptionsView] = useState('root'); // 'root' | 'privacy' | 'supportLegal'
  const ADMIN_PANEL_PASSWORD = 'lol12345';
  const [allReports, setAllReports] = useState([]);
  const [blockedUsersList, setBlockedUsersList] = useState([]);

  // Feedback & Support Modal
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackEmail, setFeedbackEmail] = useState(userProfile.email);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackNotifyEmail, setFeedbackNotifyEmail] = useState(true);
  const [feedbackSuccessModalVisible, setFeedbackSuccessModalVisible] = useState(false);

  // Donate Modal
  const [donateModalVisible, setDonateModalVisible] = useState(false);
  const [donateSuccessModalVisible, setDonateSuccessModalVisible] = useState(false);
  const [donateRegion, setDonateRegion] = useState('id');

  const [selectedFollowedDesigner, setSelectedFollowedDesigner] = useState(null);

  const [activeProject, setActiveProject] = useState(null);
  const [selectedDesigner, setSelectedDesigner] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [discardConfirmModalVisible, setDiscardConfirmModalVisible] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);

  const [deleteConfirmModalVisible, setDeleteConfirmModalVisible] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);

  const [designerModalVisible, setDesignerModalVisible] = useState(false);
  const [designerProfileTab, setDesignerProfileTab] = useState('myWork');

  const [allCategoriesModalVisible, setAllCategoriesModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const [userListModalVisible, setUserListModalVisible] = useState(false);
  const [userListTitle, setUserListTitle] = useState('');
  const [userListItems, setUserListItems] = useState([]);

  const [activeTab, setActiveTab] = useState('case');
  const [loadingWebView, setLoadingWebView] = useState(true);

  const mainScrollViewRef = useRef(null);
  const [discoverDesignersSectionY, setDiscoverDesignersSectionY] = useState(0);
  const bellButtonRef = useRef(null);
  const [notifDropdownPos, setNotifDropdownPos] = useState({ top: 60, left: 16, right: 16 });
  const [headerBottomY, setHeaderBottomY] = useState(70);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const modalScrollViewRef = useRef(null);
  const [showModalBackToTop, setShowModalBackToTop] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const bellRotateAnim = useRef(new Animated.Value(0)).current;
  const cogRotateAnim = useRef(new Animated.Value(0)).current;
  const tabScaleAnims = useRef({
    forYou: new Animated.Value(1),
    followed: new Animated.Value(1),
    search: new Animated.Value(1),
    profile: new Animated.Value(1),
    plus: new Animated.Value(1)
  }).current;

  const playBellWiggle = () => {
    bellRotateAnim.setValue(0);
    Animated.sequence([
      Animated.timing(bellRotateAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(bellRotateAnim, { toValue: -1, duration: 100, useNativeDriver: true }),
      Animated.timing(bellRotateAnim, { toValue: 0.6, duration: 90, useNativeDriver: true }),
      Animated.timing(bellRotateAnim, { toValue: 0, duration: 90, useNativeDriver: true })
    ]).start();
  };

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
  const lastTabTapRef = useRef({ tab: 'forYou', time: 0 });

  const [searchQuery, setSearchQuery] = useState('');
  const [discoverSectionY, setDiscoverSectionY] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [profileTab, setProfileTab] = useState('myWork');
  const [portfolioLayoutMode, setPortfolioLayoutMode] = useState('compact'); // 'compact' | 'full'

  const [formStep, setFormStep] = useState(1);
  const [fTitle, setFTitle] = useState('');
  const [fDesigner, setFDesigner] = useState('');
  
  const [fCategories, setFCategories] = useState(['Mobile App']);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isCategorySearchActive, setIsCategorySearchActive] = useState(false);
  const [categoryPickerModalVisible, setCategoryPickerModalVisible] = useState(false);
  const [masterCategoriesList, setMasterCategoriesList] = useState(ALL_UIUX_CATEGORIES_MASTER);

  const [fBrief, setFBrief] = useState('');
  const [fLongDescription, setFLongDescription] = useState('');
  const [longDescSelection, setLongDescSelection] = useState({ start: 0, end: 0 });
  const [fullscreenDescEditorVisible, setFullscreenDescEditorVisible] = useState(false);
  const [descEditorMode, setDescEditorMode] = useState('edit'); // 'edit' | 'preview'
  const [showIntroCarousel, setShowIntroCarousel] = useState(false);
  const [introPageIndex, setIntroPageIndex] = useState(0);
  const introScrollRef = useRef(null);
  const [fFigmaProto, setFFigmaProto] = useState('');
  const [fDesktopProto, setFDesktopProto] = useState('');
  const [fFigmaFile, setFFigmaFile] = useState('');
  const [fFigmaProfile, setFFigmaProfile] = useState('');
  const [fHasLiveLink, setFHasLiveLink] = useState(false);
  const [fLiveLinks, setFLiveLinks] = useState([{ label: '', url: '' }]);
  const [step2Skipped, setStep2Skipped] = useState(false);
  const [fCover, setFCover] = useState('');
  
  const [fShowcaseImages, setFShowcaseImages] = useState(['', '']);
  const [fVideoLinks, setFVideoLinks] = useState(['']);
  const [errors, setErrors] = useState({});
  const [toastMessage, setToastMessage] = useState(null);
  const [appAlertConfig, setAppAlertConfig] = useState(null); // { title, message, buttons }
  const [autoSuccessConfig, setAutoSuccessConfig] = useState(null); // { title, message }
  const [autoSuccessCountdown, setAutoSuccessCountdown] = useState(5);
  const autoSuccessTimeoutRef = useRef(null);
  const autoSuccessIntervalRef = useRef(null);

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
    setAutoSuccessConfig({ title, message });
    setAutoSuccessCountdown(5);
    autoSuccessIntervalRef.current = setInterval(() => {
      setAutoSuccessCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    autoSuccessTimeoutRef.current = setTimeout(() => {
      setAutoSuccessConfig(null);
      if (autoSuccessIntervalRef.current) clearInterval(autoSuccessIntervalRef.current);
    }, 5000);
  };
  const toastTimeoutRef = useRef(null);

  const showToast = (message) => {
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

      await supabase.from('profiles').update({ push_token: token }).eq('id', uid);
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
    (async () => {
      try {
        // Try fetching online portfolios from Supabase
        const { data: onlinePortfolios, error } = await supabase
          .from('portfolios')
          .select('*')
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1);

        if (!error && onlinePortfolios && onlinePortfolios.length > 0) {
          setHasMoreProjects(onlinePortfolios.length === PAGE_SIZE);
          const mapped = onlinePortfolios.map((p) => ({
            id: p.id,
            ownerId: p.user_id || null,
            title: p.title,
            designer: p.user_name || 'Unknown Designer',
            designerHandle: p.user_handle || '',
            designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
            category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
            categories: p.categories || ['Mobile App'],
            liked: false,
            likesCount: p.likes_count || 1,
            visitsCount: p.visits_count || 120,
            figmaProfile: p.figma_profile || '',
          liveLinks: p.live_links || [],
            liveLinks: p.live_links || [],
            figmaProto: p.figma_proto || '',
            desktopProto: p.desktop_proto || '',
            figmaFile: p.figma_file || '',
            brief: p.brief || '',
            longDescription: p.long_description || '',
            cover: p.cover_url || '',
            images: [p.cover_url || ''],
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
        showToast('Could not load the feed \u2014 check your connection');
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const loadMoreProjects = async () => {
    if (loadingMore || !hasMoreProjects) return;
    setLoadingMore(true);
    try {
      const { data: morePortfolios, error } = await supabase
        .from('portfolios')
        .select('*')
        .order('created_at', { ascending: false })
        .range(projects.length, projects.length + PAGE_SIZE - 1);

      if (!error && morePortfolios) {
        setHasMoreProjects(morePortfolios.length === PAGE_SIZE);
        const mapped = morePortfolios.map((p) => ({
          id: p.id,
          ownerId: p.user_id || null,
          title: p.title,
          designer: p.user_name || 'Unknown Designer',
            designerHandle: p.user_handle || '',
          designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
          category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
          categories: p.categories || ['Mobile App'],
          liked: false,
          likesCount: p.likes_count || 1,
          visitsCount: p.visits_count || 120,
          figmaProfile: p.figma_profile || '',
          liveLinks: p.live_links || [],
          figmaProto: p.figma_proto || '',
          desktopProto: p.desktop_proto || '',
          figmaFile: p.figma_file || '',
          brief: p.brief || '',
          cover: p.cover_url || '',
          longDescription: p.long_description || '',
          images: [p.cover_url || ''],
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
        supabase.from('analytics_events').insert({
          user_id: session.user.id,
          event_name: 'app_opened',
          metadata: {}
        }).then(({ error }) => {
          if (error) console.warn('Analytics tracking failed:', error);
        });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN') {
        // Reset UI position so a fresh login always starts clean,
        // instead of remembering wherever the previous session left off.
        setBottomNav('forYou');
        setCategoryFilter('all');
        setProfileTab('myWork');
        setSearchQuery('');
        setModalVisible(false);
        setAddModalVisible(false);
        setDesignerModalVisible(false);
        setSettingsModalVisible(false);
        setNotificationModalVisible(false);
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
        setPortfolioLayoutMode('compact');
      }
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      listener.subscription.unsubscribe();
      appStateSub.remove();
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
    if (!session) return;
    (async () => {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', session.user.id)
        .neq('name', '');

      const { data: followRows } = await supabase.from('follows').select('follower_id, following_id');

      const followerCounts = {};
      const followingCounts = {};
      const myFollowers = new Set();
      (followRows || []).forEach((r) => {
        followerCounts[r.following_id] = (followerCounts[r.following_id] || 0) + 1;
        followingCounts[r.follower_id] = (followingCounts[r.follower_id] || 0) + 1;
        if (r.following_id === session.user.id) myFollowers.add(r.follower_id);
      });

      setFollowersOfMe(myFollowers);
      setProjects((prev) => prev.map((p) => ({ ...p, followsMe: p.ownerId ? myFollowers.has(p.ownerId) : false })));
      setMyFollowStats({
        followersCount: followerCounts[session.user.id] || 0,
        followingCount: followingCounts[session.user.id] || 0
      });

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

  const dismissNotification = async (notifId) => {
    setNotificationsList((prev) => prev.filter((n) => n.id !== notifId));
    await supabase.from('notifications').delete().eq('id', notifId);
  };

  const fetchNotifications = async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, created_at, portfolio_id, actor:profiles!notifications_actor_id_fkey(name, avatar_url), portfolio:portfolios(title)')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      const mapped = data.map((n) => ({
        id: n.id,
        type: n.type,
        user: n.actor ? n.actor.name : 'Someone',
        action: n.type === 'like' ? 'liked your portfolio package' : n.type === 'follow' ? 'started following your profile' : 'sent a test notification from the Admin Panel',
        target: n.portfolio ? n.portfolio.title : '',
        time: formatRelativeTime(n.created_at),
        avatar: (n.actor && n.actor.avatar_url) || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png'
      }));
      setNotificationsList(mapped);
    } else if (error) {
      console.warn('Failed to fetch notifications:', error);
    }
  };

  useEffect(() => {
    if (session) fetchNotifications();
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
        return;
      }

      const uid = session.user.id;
      const userEmail = session.user.email || '';
      registerForPushNotifications(uid);

      try {
        const savedFollowed = await AsyncStorage.getItem(`${FOLLOWED_KEY}_${uid}`);
        setFollowedDesigners(savedFollowed ? JSON.parse(savedFollowed) : []);

        const savedHideLiked = await AsyncStorage.getItem(`${HIDE_LIKED_KEY}_${uid}`);
        setHideLikedPortfolios(savedHideLiked !== null ? JSON.parse(savedHideLiked) : false);

        const onboardingDone = await AsyncStorage.getItem(`${ONBOARDING_KEY}_${uid}`);
        setNeedsOnboarding(onboardingDone !== 'true');

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
          } else {
            // Brand new account: blank profile, just prefill email
            const blankProfile = {
              name: '',
              role: '',
              location: '',
              bio: '',
              email: userEmail,
              avatar: 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
              links: []
            };
            setUserProfile(blankProfile);
            setEditName('');
            setEditRole('');
            setEditLocation('');
            setEditBio('');
            setEditEmail(userEmail);
            setEditAvatar(blankProfile.avatar);
            setEditLinks([]);
            setFeedbackEmail(userEmail);
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
    showToast(error ? 'Failed to submit report' : 'Link reported \u2014 thank you');
  };

  const confirmProceedToExternalLink = () => {
    if (targetExternalUrl) {
      Linking.openURL(targetExternalUrl).catch((err) => console.warn("Failed to open link", err));
    }
    setExternalLinkModalVisible(false);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
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
    const now = Date.now();
    const isDoubleTap = lastTabTapRef.current.tab === newNav && (now - lastTabTapRef.current.time < 350);
    lastTabTapRef.current = { tab: newNav, time: now };
    playTabBounce(newNav);

    if (newNav === bottomNav) {
      if (newNav === 'forYou') {
        setCategoryFilter('all');
      } else if (newNav === 'followed') {
        setSelectedFollowedDesigner(null);
      } else if (newNav === 'search') {
        setSearchQuery('');
      } else if (newNav === 'profile') {
        setProfileTab('myWork');
      }
      scrollToTop();
      return;
    }

    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.2, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true })
    ]).start();
    setBottomNav(newNav);
    setShowBackToTop(false);
  };

  const toggleLike = async (id) => {
    if (!session) return;
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    const wasLiked = proj.liked;
    const newCount = wasLiked ? Math.max(0, (proj.likesCount || 1) - 1) : (proj.likesCount || 0) + 1;

    // Optimistic UI update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, liked: !wasLiked, likesCount: newCount } : p))
    );
    if (activeProject && activeProject.id === id) {
      setActiveProject((prev) => ({ ...prev, liked: !wasLiked, likesCount: newCount }));
    }

    if (wasLiked) {
      await supabase.from('likes').delete().eq('user_id', session.user.id).eq('portfolio_id', id);
    } else {
      const { error } = await supabase.from('likes').insert({ user_id: session.user.id, portfolio_id: id });
      if (!error && proj.ownerId && proj.ownerId !== session.user.id) {
        await supabase.from('notifications').insert({
          recipient_id: proj.ownerId,
          actor_id: session.user.id,
          type: 'like',
          portfolio_id: id
        });
        sendPushNotification(proj.ownerId, 'New Like', `${userProfile.name || 'Someone'} liked "${proj.title}"`);
      }
    }
  };

  const toggleFollowDesigner = async (designerName) => {
    const target = liveDesigners.find((d) => d.name === designerName);
    const wasFollowing = followedDesigners.includes(designerName);

    if (wasFollowing) {
      setFollowedDesigners(followedDesigners.filter((name) => name !== designerName));
      if (selectedFollowedDesigner === designerName) {
        setSelectedFollowedDesigner(null);
      }
      if (target && session) {
        await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', target.id);
      }
    } else {
      setFollowedDesigners([...followedDesigners, designerName]);
      if (target && session && target.id !== session.user.id) {
        const { error } = await supabase.from('follows').insert({ follower_id: session.user.id, following_id: target.id });
        if (!error) {
          await supabase.from('notifications').insert({
            recipient_id: target.id,
            actor_id: session.user.id,
            type: 'follow'
          });
          sendPushNotification(target.id, 'New Follower', `${userProfile.name || 'Someone'} started following you`);
        }
      }
    }
  };

  const handleShareDesigner = (designer) => {
    const shareUrl = designer.figma || designer.handle || designer.name;
    showAppAlert(
      'Share Designer Profile',
      `Profile Link: ${shareUrl}`,
      [
        { text: 'Copy Link', onPress: () => showAppAlert('Copied!', 'Designer profile link copied to clipboard.') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
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

  const handleCloseAccountSettings = () => {
    if (hasUnsavedAccountChanges()) {
      setAccountSettingsDiscardWarningVisible(true);
    } else {
      setAccountSettingsModalVisible(false);
    }
  };

  const handleCloseChangePasswordPage = () => {
    if (newPassword.trim() !== '' || confirmNewPassword.trim() !== '') {
      setPasswordPageDiscardWarningVisible(true);
    } else {
      setChangePasswordPageVisible(false);
    }
  };

  const handleDeleteAccount = () => {
    showAppAlert(
      'Delete Account',
      'This permanently deletes your portfolios, profile, likes, and follows. This cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            if (!session) return;
            const uid = session.user.id;
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

              if (fnError) {
                showAppAlert(
                  'Data Deleted',
                  'Your data has been removed, but your login could not be fully deleted automatically. Contact support if you want it fully gone.'
                );
              } else {
                showAppAlert('Account Deleted', 'Your account and all data have been permanently removed.');
              }
            } catch (e) {
              console.warn('Delete account error:', e);
              showAppAlert('Error', 'Something went wrong deleting your data. Please try again.');
            }
          }
        }
      ]
    );
  };

  const uploadImageChecked = async (uri, path) => {
    const result = await uploadImageToSupabase(uri, path);
    if (result && (result.startsWith('file://') || result.startsWith('content://'))) {
      showToast('Image upload failed \u2014 using local copy for now');
    }
    return result;
  };

  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle();
      setIsAdmin(!!(data && data.is_admin));
    })();
  }, [session]);

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

  const fetchAllReports = async () => {
    const { data, error } = await supabase
      .from('reports')
      .select('id, target_type, target_id, reason, created_at, reporter:profiles!reports_reporter_id_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) {
      setAllReports(data.map((r) => ({
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        time: formatRelativeTime(r.created_at),
        reporterName: r.reporter ? r.reporter.name : 'Unknown'
      })));
    }
  };

  const fetchFeedbackMessages = async () => {
    const { data, error } = await supabase
      .from('feedback_messages')
      .select('id, email, message, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) {
      setFeedbackMessagesList(data.map((f) => ({
        id: f.id,
        email: f.email,
        message: f.message,
        status: f.status,
        time: formatRelativeTime(f.created_at)
      })));
    } else if (error) {
      console.warn('Failed to fetch feedback:', error);
    }
  };

  const handleVersionTap = () => {
    const next = versionTapCount + 1;
    setVersionTapCount(next);
    if (next >= 6 && next <= 8) {
      showToast('Close...');
    } else if (next === 9) {
      showToast('Confirmed');
      setAdminUnlocked(true);
    }
  };

  const handleOpenAdminPanel = () => {
    setAdminPasswordInput('');
    setAdminPasswordModalVisible(true);
  };

  const handleSubmitAdminPassword = () => {
    if (adminPasswordInput === ADMIN_PANEL_PASSWORD) {
      setAdminPasswordModalVisible(false);
      setAdminPasswordInput('');
      fetchFeedbackMessages();
      fetchAllReports();
      setAdminPanelVisible(true);
    } else {
      showToast('Incorrect admin password');
    }
  };

  const handleAdminTestPush = async () => {
    if (!session) return;
    const result = await sendPushNotification(session.user.id, 'Admin Test Push', 'This is a test notification sent from the Admin Control Panel.');
    await supabase.from('notifications').insert({
      recipient_id: session.user.id,
      actor_id: session.user.id,
      type: 'test'
    });
    if (result.ok) {
      showToast('Push sent successfully \u2014 check device notifications');
    } else {
      showAppAlert('Push Failed', result.reason);
    }
  };

  const handleAdminTestCrash = () => {
    Sentry.captureException(new Error('Admin panel test error'));
    showToast('Test error sent to Sentry \u2014 only visible in real builds, not Expo Go');
  };

  const handleAdminTestAnalytics = () => {
    trackEvent('admin_test_event', { source: 'admin_panel' });
    showToast('Test analytics event logged');
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showAppAlert('Password Too Short', 'Use at least 6 characters.');
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
      showToast('Password updated');
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

  const submitReport = async (targetType, targetId, reason) => {
    if (!session) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: session.user.id,
      target_type: targetType,
      target_id: targetId,
      reason
    });
    showToast(error ? 'Failed to submit report' : 'Report submitted \u2014 thank you');
  };

  const handleReportContent = (targetType, targetId, targetLabel) => {
    showAppAlert(
      `Report ${targetLabel}?`,
      'Choose a reason:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Spam', onPress: () => submitReport(targetType, targetId, 'spam') },
        { text: 'Inappropriate', onPress: () => submitReport(targetType, targetId, 'inappropriate') },
        { text: 'Other', onPress: () => submitReport(targetType, targetId, 'other') }
      ]
    );
  };

  const pushProfileToSupabase = async (profile, handleChanged = false) => {
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

      const { error } = await supabase.from('profiles').upsert(payload);
      if (error) {
        console.warn('Failed to sync profile to Supabase:', error);
        if (error.message && error.message.toLowerCase().includes('handle')) {
          showToast('That handle was just taken \u2014 please pick another');
        }
      }
    } catch (e) {
      console.warn('Failed to sync profile to Supabase:', e);
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
    await pushProfileToSupabase(updated, true);
    if (session) {
      trackEvent('onboarding_completed');
      await AsyncStorage.setItem(`${ONBOARDING_KEY}_${session.user.id}`, 'true');
      const introSeen = await AsyncStorage.getItem(`${INTRO_SEEN_KEY}_${session.user.id}`);
      if (introSeen !== 'true') {
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

  const handleDonateConfirm = () => {
    setDonateModalVisible(false);
    setDonateSuccessModalVisible(true);
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

  const handleLinkTextChange = (text, index) => {
    const updated = [...editLinks];
    updated[index] = text;
    setEditLinks(updated);
  };

  const openFollowersModal = async (designer) => {
    setUserListTitle(`Followers of ${designer.name}`);
    setUserListItems([]);
    setUserListModalVisible(true);
    if (!designer.id) return;
    const { data, error } = await supabase
      .from('follows')
      .select('follower_id, profiles!follows_follower_id_fkey(id, name, role, avatar_url, handle)')
      .eq('following_id', designer.id);
    if (error) {
      console.warn('Failed to fetch followers:', error);
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

  const openFollowingModal = async (designer) => {
    setUserListTitle(`${designer.name} is Following`);
    setUserListItems([]);
    setUserListModalVisible(true);
    if (!designer.id) return;
    const { data, error } = await supabase
      .from('follows')
      .select('following_id, profiles!follows_following_id_fkey(id, name, role, avatar_url, handle)')
      .eq('follower_id', designer.id);
    if (error) {
      console.warn('Failed to fetch following:', error);
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

  const openProjectModal = (proj) => {
    const newVisits = (proj.visitsCount || 0) + 1;
    const updatedProj = { ...proj, visitsCount: newVisits };

    setProjects((prev) =>
      prev.map((p) => (p.id === proj.id ? updatedProj : p))
    );
    setActiveProject(updatedProj);
    setShowModalBackToTop(false);
    trackEvent('portfolio_viewed', { portfolio_id: proj.id });

    supabase.rpc('increment_portfolio_views', { pid: proj.id }).then(({ error }) => {
      if (error) console.warn('View count increment failed:', error);
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
  };

  const openDesignerProfileByName = (designerName) => {
    if (userProfile.name && designerName.toLowerCase() === userProfile.name.toLowerCase()) {
      setModalVisible(false);
      setDesignerModalVisible(false);
      setBottomNav('profile');
      return;
    }

    const found = allDesigners.find(
      (d) => d.name.toLowerCase() === designerName.toLowerCase()
    );
    setDesignerProfileTab('myWork');
    if (found) {
      setModalVisible(false);
      setSelectedDesigner(found);
      setDesignerModalVisible(true);
      fetchDesignerLikedProjects(found.id);
    } else {
      setModalVisible(false);
      setSelectedDesigner({
        id: session ? session.user.id : 'user_self',
        name: userProfile.name,
        role: userProfile.role,
        location: userProfile.location,
        avatar: userProfile.avatar,
        figma: (userProfile.links && userProfile.links[0]) || '',
        handle: userProfile.handle || '',
        bio: userProfile.bio,
        followersCount: myFollowStats.followersCount,
        followingCount: myFollowStats.followingCount,
        links: userProfile.links
      });
      setDesignerModalVisible(true);
      if (session) fetchDesignerLikedProjects(session.user.id);
    }
  };

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
    const { data: portfolioRows } = await supabase.from('portfolios').select('*').in('id', likedIds);
    const mapped = (portfolioRows || []).map((p) => ({
      id: p.id,
      ownerId: p.user_id || null,
      title: p.title,
      designer: p.user_name || 'Unknown Designer',
      designerHandle: p.user_handle || '',
      designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
      category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
      categories: p.categories || ['Mobile App'],
      liked: false,
      likesCount: p.likes_count || 1,
      visitsCount: p.visits_count || 120,
      figmaProfile: p.figma_profile || '',
      figmaProto: p.figma_proto || '',
      desktopProto: p.desktop_proto || '',
      figmaFile: p.figma_file || '',
      brief: p.brief || '',
      longDescription: p.long_description || '',
      cover: p.cover_url || '',
      images: [p.cover_url || ''],
      videoLinks: [],
      caseStudy: p.brief || ''
    }));
    setDesignerLikedProjects(mapped);
    setLoadingDesignerLikes(false);
  };

  const openDesignerModal = (designer) => {
    setDesignerProfileTab('myWork');
    setSelectedDesigner(designer);
    setDesignerModalVisible(true);
    fetchDesignerLikedProjects(designer.id);
  };

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

  const handleAddCustomCategory = () => {
    const trimmed = categorySearchQuery.trim();
    if (!trimmed) return;
    if (fCategories.length >= 10) {
      showAppAlert('Category Limit Reached', 'You can select up to 10 categories max per portfolio package.');
      return;
    }
    if (!masterCategoriesList.includes(trimmed)) {
      setMasterCategoriesList([...masterCategoriesList, trimmed].sort());
    }
    if (!fCategories.includes(trimmed)) {
      setFCategories([...fCategories, trimmed]);
    }
    setCategorySearchQuery('');
  };

  const openEditWizard = (proj) => {
    setEditingProjectId(proj.id);
    setFTitle(proj.title || '');
    setFDesigner(proj.designer || userProfile.name);
    setFCategories(Array.isArray(proj.category) ? proj.category : [proj.category || 'Mobile App']);
    setFBrief(proj.brief || '');
    setFLongDescription(proj.longDescription || '');
    setFFigmaProto(proj.figmaProto || '');
    setFDesktopProto(proj.desktopProto || '');
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

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setFormStep(2);
  };

  const handleNextFromStep2 = (skip = false) => {
    setStep2Skipped(skip);
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

  const handleFinalPostPackage = async () => {
    const validVideos = fVideoLinks.filter((v) => v.trim() !== '');
    const validShowcaseImgs = fShowcaseImages.filter((img) => img.trim() !== '');

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
          long_description: fLongDescription,
          cover_url: finalCoverUrl,
          figma_proto: fFigmaProto,
          desktop_proto: fDesktopProto,
          figma_file: fFigmaFile,
          figma_profile: fFigmaProfile,
          live_links: fHasLiveLink ? fLiveLinks.filter((l) => l.url.trim()) : [],
          categories: fCategories
        })
        .eq('id', editingProjectId);

      if (updateError) {
        console.warn('Supabase update error:', updateError);
        showAppAlert('Update Failed', updateError.message);
        return;
      }

      // 3. Replace showcase images: delete old rows, insert new ones
      await supabase.from('portfolio_images').delete().eq('portfolio_id', editingProjectId);
      if (finalImages.length > 0) {
        const imgRows = finalImages.map((url) => ({ portfolio_id: editingProjectId, image_url: url }));
        await supabase.from('portfolio_images').insert(imgRows);
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
                figmaProfile: fFigmaProfile,
                liveLinks: fHasLiveLink ? fLiveLinks.filter((l) => l.url.trim()) : [],
                figmaProto: fFigmaProto,
                desktopProto: fDesktopProto,
                figmaFile: fFigmaFile,
                brief: fBrief,
                longDescription: fLongDescription,
                cover: finalCoverUrl,
                images: finalImages,
                videoLinks: validVideos
              }
            : p
        )
      );
      showAutoSuccess('Updated', 'Portfolio package updated successfully!');
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
            long_description: fLongDescription,
            cover_url: finalCoverUrl,
            figma_proto: fFigmaProto,
            desktop_proto: fDesktopProto,
            figma_file: fFigmaFile,
            figma_profile: fFigmaProfile,
            live_links: fHasLiveLink ? fLiveLinks.filter((l) => l.url.trim()) : [],
            categories: fCategories,
            likes_count: 1,
            visits_count: 1
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
        liked: false,
        likesCount: 1,
        visitsCount: 1,
        figmaProfile: fFigmaProfile || '',
        liveLinks: fHasLiveLink ? fLiveLinks.filter((l) => l.url.trim()) : [],
        figmaProto: fFigmaProto,
        desktopProto: fDesktopProto,
        figmaFile: fFigmaFile,
        brief: fBrief,
        longDescription: fLongDescription,
        cover: finalCoverUrl,
        images: finalImages,
        videoLinks: validVideos,
        caseStudy: fBrief
      };

      setProjects([newProject, ...projects]);
      trackEvent('portfolio_published');
      showAutoSuccess('Success!', 'Your portfolio is successfully uploaded!');
    }

    setAddModalVisible(false);
    resetFormWizard();
  };

  const handleCloseUploadWizard = () => {
    setDiscardConfirmModalVisible(true);
  };

  const resetFormWizard = () => {
    setEditingProjectId(null);
    setFormStep(1);
    setFTitle('');
    setFBrief('');
    setFLongDescription('');
    setFCategories(['Mobile App']);
    setCategorySearchQuery('');
    setIsCategorySearchActive(false);
    setFFigmaProto('');
    setFDesktopProto('');
    setFFigmaFile('');
    setFFigmaProfile('');
    setFHasLiveLink(false);
    setFLiveLinks([{ label: '', url: '' }]);
    setFCover('');
    setFShowcaseImages(['', '']);
    setFVideoLinks(['']);
    setErrors({});
    setStep2Skipped(false);
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

  const forYouCategoryFilteredProjects = useMemo(() => {
    const specialModes = ['all', 'popularity', 'newest'];
    const filtered = projects.filter((p) => {
      if (p.ownerId && blockedIds.has(p.ownerId)) return false;
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
    const now = Date.now();
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
  }, [projects, categoryFilter, blockedIds]);

  const followedProjects = useMemo(() => {
    return projects.filter((p) => {
      if (selectedFollowedDesigner) {
        return p.designer === selectedFollowedDesigner;
      }
      return followedDesigners.includes(p.designer);
    });
  }, [projects, selectedFollowedDesigner, followedDesigners]);

  const followedDesignersObjects = useMemo(() => {
    return allDesigners.filter((d) => followedDesigners.includes(d.name));
  }, [followedDesigners, allDesigners]);

  const [searchedProjects, setSearchedProjects] = useState([]);
  const [searchFilterTab, setSearchFilterTab] = useState('all'); // 'all' | 'portfolios' | 'designers'
  const [searchedDesigners, setSearchedDesigners] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim().replace(/^@/, '');
    if (q === '') {
      setSearchedProjects([]);
      setSearchedDesigners(allDesigners);
      return;
    }

    setSearching(true);
    const timeout = setTimeout(async () => {
      const [projectsRes, profilesRes] = await Promise.all([
        supabase
          .from('portfolios')
          .select('*')
          .or(`title.ilike.%${q}%,user_name.ilike.%${q}%,brief.ilike.%${q}%,user_handle.ilike.%${q}%`)
          .limit(30),
        supabase
          .from('profiles')
          .select('*')
          .or(`name.ilike.%${q}%,role.ilike.%${q}%,location.ilike.%${q}%,handle.ilike.%${q}%`)
          .neq('name', '')
          .limit(30)
      ]);

      trackEvent('search_performed', { query: q });

      if (projectsRes.data) {
        const mapped = projectsRes.data.map((p) => ({
          id: p.id,
          ownerId: p.user_id || null,
          title: p.title,
          designer: p.user_name || 'Unknown Designer',
            designerHandle: p.user_handle || '',
          designerAvatar: p.user_avatar || 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=200&bold=true&format=png',
          category: p.categories && p.categories[0] ? p.categories[0] : 'Mobile App',
          categories: p.categories || ['Mobile App'],
          liked: false,
          likesCount: p.likes_count || 1,
          visitsCount: p.visits_count || 120,
          figmaProfile: p.figma_profile || '',
          liveLinks: p.live_links || [],
          figmaProto: p.figma_proto || '',
          desktopProto: p.desktop_proto || '',
          figmaFile: p.figma_file || '',
          brief: p.brief || '',
          longDescription: p.long_description || '',
          cover: p.cover_url || '',
          images: [p.cover_url || ''],
          videoLinks: [],
          caseStudy: p.brief || ''
        }));
        setSearchedProjects(mapped.filter((p) => !p.ownerId || !blockedIds.has(p.ownerId)));
      }

      if (profilesRes.data) {
        const mappedDesigners = profilesRes.data
          .filter((p) => p.id !== (session ? session.user.id : null))
          .map((p) => ({
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
            links: p.links || []
          }));
        const mockMatches = POPULAR_DESIGNERS.filter((d) =>
          d.name.toLowerCase().includes(q.toLowerCase()) ||
          d.role.toLowerCase().includes(q.toLowerCase()) ||
          d.location.toLowerCase().includes(q.toLowerCase())
        );
        setSearchedDesigners([...mappedDesigners, ...mockMatches].filter((d) => !blockedIds.has(d.id)));
      }

      setSearching(false);
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
    return projects.filter((p) => p.ownerId === session.user.id);
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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0F17', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (!userDataLoaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0F17', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </SafeAreaView>
    );
  }

  if (needsOnboarding) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0F17' }}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          enableOnAndroid={true}
          extraScrollHeight={30}
          keyboardShouldPersistTaps="handled"
        >
            <Text style={{ color: '#F8FAFC', fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
              Set Up Your Profile
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 24 }}>
              Tell other designers who you are. You can always edit this later in Account Settings.
            </Text>

            <TouchableOpacity style={[styles.avatarEditPickerBtn, { marginBottom: 24 }]} activeOpacity={0.85} onPress={pickAvatarImage}>
              <Image source={{ uri: editAvatar }} style={styles.avatarEditPreview} />
              <View style={styles.avatarEditOverlay}>
              <CameraIconSVG />
              <Text style={styles.avatarEditText}>Add Photo</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.formGroupLabel}>Full Name *</Text>
          <FocusableTextInput
            style={styles.formInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Your full name"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.formGroupLabel}>Unique ID / Handle *</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 10, paddingLeft: 14 }}>
            <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '700' }}>@</Text>
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
            3-20 characters. Letters, numbers, dots, underscores, and dashes only \u2014 no spaces or other symbols. This shows under your portfolios instead of your name, and can be changed once every 30 days.
          </Text>
          {handleStatus === 'checking' && <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>Checking availability...</Text>}
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
          {editLinks.map((lnk, idx) => (
            <View key={idx} style={styles.videoInputRow}>
              <FocusableTextInput
                style={[styles.formInput, { flex: 1 }]}
                value={lnk}
                onChangeText={(t) => handleLinkTextChange(t, idx)}
                placeholder={`https://www.figma.com/@username (${idx + 1})`}
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity style={styles.removeVideoBtn} onPress={() => handleRemoveAccountLink(idx)}>
                <TrashIconSVG />
              </TouchableOpacity>
            </View>
          ))}
          {editLinks.length < 5 && (
            <TouchableOpacity style={styles.addMoreVideoBtn} onPress={handleAddAccountLink}>
              <Text style={styles.addMoreVideoText}>+ Add Profile Link ({editLinks.length}/5)</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.saveAccountSettingsBtn, { marginTop: 24 }]}
            activeOpacity={0.85}
            onPress={() => handleFinishOnboarding(false)}
          >
            <Text style={styles.submitBtnText}>Finish Setup</Text>
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F17" translucent={false} />

      {toastMessage && (
        <View style={{
          position: 'absolute',
          top: 12,
          left: 16,
          right: 16,
          zIndex: 999,
          backgroundColor: '#151D2A',
          borderWidth: 1,
          borderColor: '#8B5CF6',
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 14,
          shadowColor: '#8B5CF6',
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 20
        }}>
          <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{toastMessage}</Text>
        </View>
      )}

      {/* GENERIC APP-STYLED ALERT/CONFIRM - replaces Alert.alert everywhere in the app */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!appAlertConfig}
        onRequestClose={() => setAppAlertConfig(null)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <Text style={styles.confirmTitle}>{appAlertConfig?.title}</Text>
            {appAlertConfig?.message ? (
              <Text style={styles.confirmSubText}>{appAlertConfig.message}</Text>
            ) : null}
            <View style={{
              flexDirection: (appAlertConfig?.buttons?.length || 1) > 2 ? 'column' : 'row',
              gap: 10,
              width: '100%',
              marginTop: 8
            }}>
              {appAlertConfig?.buttons.map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.confirmDeleteBtn,
                    { flex: (appAlertConfig?.buttons?.length || 1) > 2 ? undefined : 1 },
                    btn.style === 'cancel'
                      ? { backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }
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
                    btn.style === 'cancel' && { color: '#F8FAFC' }
                  ]}>{btn.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* AUTO-DISMISSING SUCCESS POPUP (5s) - for success/confirmation moments like publish, update, delete */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!autoSuccessConfig}
        onRequestClose={() => setAutoSuccessConfig(null)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <CheckIconSVG />
            </View>
            <Text style={styles.confirmTitle}>{autoSuccessConfig?.title}</Text>
            <Text style={styles.confirmSubText}>{autoSuccessConfig?.message}</Text>
            <TouchableOpacity
              style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 8 }]}
              onPress={() => {
                if (autoSuccessTimeoutRef.current) clearTimeout(autoSuccessTimeoutRef.current);
                if (autoSuccessIntervalRef.current) clearInterval(autoSuccessIntervalRef.current);
                setAutoSuccessConfig(null);
              }}
            >
              <Text style={styles.confirmDeleteText}>Continue ({autoSuccessCountdown}s)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FIRST-TIME APP INTRODUCTION CAROUSEL */}
      <Modal
        animationType="fade"
        transparent={false}
        visible={showIntroCarousel}
        onRequestClose={handleCloseIntroCarousel}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0F17' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16 }}>
            <TouchableOpacity onPress={handleCloseIntroCarousel}>
              <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '700' }}>Skip</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={introScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
              setIntroPageIndex(idx);
            }}
            style={{ flex: 1 }}
          >
            {INTRO_CAROUSEL_PAGES.map((page, i) => (
              <View key={i} style={{ width: Dimensions.get('window').width, padding: 32, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ marginBottom: 24 }}>
                  {page.icon === 'sparkle' && <SparkleIconSVG color="#8B5CF6" size={56} />}
                  {page.icon === 'image' && <ImageIconSVG />}
                  {page.icon === 'share' && <ShareIconSVG />}
                </View>
                <Text style={{ color: '#F8FAFC', fontSize: 24, fontWeight: '800', marginBottom: 16, textAlign: 'center' }}>
                  {page.title}
                </Text>
                <Text style={{ color: '#94A3B8', fontSize: 15, lineHeight: 23, textAlign: 'center' }}>
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
                  backgroundColor: introPageIndex === i ? '#8B5CF6' : '#26334D'
                }}
              />
            ))}
          </View>

          <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
            <TouchableOpacity
              style={{ backgroundColor: '#8B5CF6', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => {
                if (introPageIndex < INTRO_CAROUSEL_PAGES.length - 1) {
                  const nextIndex = introPageIndex + 1;
                  introScrollRef.current?.scrollTo({ x: nextIndex * Dimensions.get('window').width, animated: true });
                  setIntroPageIndex(nextIndex);
                } else {
                  handleCloseIntroCarousel();
                }
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
                {introPageIndex < INTRO_CAROUSEL_PAGES.length - 1 ? 'Next' : 'Get Started'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Header with App Name DECENT Text Only (Removed Mockup Icon) & Switched Header Icons */}
      <View
        style={styles.header}
        onLayout={(e) => setHeaderBottomY(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        <View style={styles.logoRow}>
          <Text style={styles.logoText}>DECENT</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v0.10.0</Text>
          </View>
        </View>

        <View style={styles.headerRightActionsRow}>
          <TouchableOpacity
            ref={bellButtonRef}
            style={[styles.headerIconBtnWithBadge, notificationModalVisible && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }]}
            onPress={() => {
              playBellWiggle();
              if (notificationModalVisible) {
                setNotificationModalVisible(false);
                return;
              }
              setSettingsModalVisible(false);
              setUnreadNotifications(false);
              fetchNotifications();
              setNotifDropdownPos({ top: headerBottomY + 8, left: 16, right: 16 });
              setNotificationModalVisible(true);
            }}
          >
            <Animated.View style={{
              transform: [{
                rotate: bellRotateAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] })
              }]
            }}>
              <BellSVG active={notificationModalVisible} />
            </Animated.View>
            {unreadNotifications && <View style={styles.unreadRedBadgeDot} />}
          </TouchableOpacity>

          <TouchableOpacity
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
              <CogWheelSVG active={settingsModalVisible} />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={[styles.mainViewContainer, { opacity: fadeAnim }]}>
        <ScrollView
          ref={mainScrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8B5CF6" colors={['#8B5CF6']} />
          }
        >

          {/* TAB PAGE 1: FOR YOU Feed */}
          {bottomNav === 'forYou' && (
            <View>
              <View style={styles.topCategoryBarWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topCategoryScrollView}>
                  <TouchableOpacity
                    style={[styles.topCategoryChip, categoryFilter === 'all' && styles.topCategoryChipActive]}
                    onPress={() => setCategoryFilter('all')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <SparkleIconSVG color={categoryFilter === 'all' ? '#FFFFFF' : '#C084FC'} size={13} />
                      <Text style={[styles.topCategoryText, categoryFilter === 'all' && styles.topCategoryTextActive]}>
                        Highlighted
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.topCategoryChip, categoryFilter === 'popularity' && styles.topCategoryChipActive]}
                    onPress={() => setCategoryFilter('popularity')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <TrendingUpSVG color={categoryFilter === 'popularity' ? '#FFFFFF' : '#C084FC'} size={13} />
                      <Text style={[styles.topCategoryText, categoryFilter === 'popularity' && styles.topCategoryTextActive]}>
                        Popularity
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.topCategoryChip, categoryFilter === 'newest' && styles.topCategoryChipActive]}
                    onPress={() => setCategoryFilter('newest')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <ClockSVG color={categoryFilter === 'newest' ? '#FFFFFF' : '#C084FC'} size={13} />
                      <Text style={[styles.topCategoryText, categoryFilter === 'newest' && styles.topCategoryTextActive]}>
                        Newest
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {['Mobile App', 'Web Design', 'Design System', 'FinTech', 'Healthcare', 'E-Commerce', 'SaaS'].map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.topCategoryChip, categoryFilter === cat && styles.topCategoryChipActive]}
                      onPress={() => setCategoryFilter(cat)}
                    >
                      <Text style={[styles.topCategoryText, categoryFilter === cat && styles.topCategoryTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={styles.grid2x2CategoryBtn}
                    activeOpacity={0.8}
                    onPress={() => setAllCategoriesModalVisible(true)}
                  >
                    <Grid2x2SVG />
                  </TouchableOpacity>
                </ScrollView>
              </View>

              <ProjectGrid
                items={forYouCategoryFilteredProjects}
                onPress={openProjectModal}
                onToggleLike={toggleLike}
                onOpenDesignerProfile={openDesignerProfileByName}
                onToggleFollow={toggleFollowDesigner}
                followedDesigners={followedDesigners}
                currentUserId={session ? session.user.id : null}
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
                <Text style={styles.pageHeaderTitle}>Your Circle</Text>
                <Text style={styles.pageHeaderSubtitle}>
                  {selectedFollowedDesigner
                    ? `Showing releases by ${selectedFollowedDesigner}`
                    : `Latest portfolio releases from designers you follow (${followedDesigners.length}).`}
                </Text>
              </View>

              {followedDesignersObjects.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesBarScroll}>
                  {followedDesignersObjects.map((des) => {
                    const isSelected = selectedFollowedDesigner === des.name;
                    return (
                      <TouchableOpacity
                        key={des.id}
                        style={styles.storyCircleWrapper}
                        onPress={() => {
                          if (selectedFollowedDesigner === des.name) {
                            setSelectedFollowedDesigner(null);
                          } else {
                            setSelectedFollowedDesigner(des.name);
                          }
                        }}
                      >
                        <View style={[styles.storyRing, isSelected && styles.storyRingActive]}>
                          <Image source={{ uri: des.avatar }} style={styles.storyAvatar} />
                        </View>
                        <Text style={[styles.storyNameText, isSelected && styles.storyNameTextActive]} numberOfLines={1}>
                          {des.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {followedProjects.length > 0 ? (
                <ProjectGrid
                  items={followedProjects}
                  onPress={openProjectModal}
                  onToggleLike={toggleLike}
                  onOpenDesignerProfile={openDesignerProfileByName}
                  onToggleFollow={toggleFollowDesigner}
                  followedDesigners={followedDesigners}
                  currentUserId={session ? session.user.id : null}
                />
              ) : (
                <View style={styles.emptyFollowedBox}>
                  <Text style={styles.emptyFollowedTitle}>
                    {selectedFollowedDesigner ? `No Releases from ${selectedFollowedDesigner}` : 'No Posts from Following Designers'}
                  </Text>
                  <Text style={styles.emptyFollowedSub}>
                    {selectedFollowedDesigner
                      ? 'Tap their story circle again to clear filter and view all followed designers.'
                      : "You aren't following any designers with recent releases yet. Go to Search to discover and follow designers!"}
                  </Text>
                  <TouchableOpacity
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
                  </TouchableOpacity>
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
                  <TouchableOpacity style={styles.clearFieldBtn} onPress={() => setSearchQuery('')}>
                    <ClearTextXSVG />
                  </TouchableOpacity>
                )}
              </View>

              {searchQuery.trim() !== '' ? (
                <View>
                  <Text style={styles.sectionHeader}>TOP RESULT</Text>
                  {exactMatch ? (
                    exactMatch.type === 'designer' ? (
                      <TouchableOpacity
                        style={[styles.designerItemCard, { borderColor: '#8B5CF6', borderWidth: 1.5 }]}
                        onPress={() => openDesignerModal(exactMatch.item)}
                      >
                        <Image source={{ uri: exactMatch.item.avatar }} style={styles.designerListAvatar} />
                        <View style={styles.designerInfoCol}>
                          <Text style={styles.designerListName}>{exactMatch.item.name}</Text>
                          {exactMatch.item.handle ? (
                            <Text style={{ color: '#C084FC', fontSize: 12, fontWeight: '600' }}>{formatHandleDisplay(exactMatch.item.handle)}</Text>
                          ) : null}
                          <Text style={styles.designerListRole}>{exactMatch.item.role}</Text>
                        </View>
                        <ChevronRightSVG color="#8B5CF6" size={20} />
                      </TouchableOpacity>
                    ) : (
                      <ProjectGrid
                        items={[exactMatch.item]}
                        onPress={openProjectModal}
                        onToggleLike={toggleLike}
                        onOpenDesignerProfile={openDesignerProfileByName}
                        onToggleFollow={toggleFollowDesigner}
                        followedDesigners={followedDesigners}
                        currentUserId={session ? session.user.id : null}
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
                      <TouchableOpacity
                        key={tab.key}
                        style={[styles.topCategoryChip, searchFilterTab === tab.key && styles.topCategoryChipActive]}
                        onPress={() => setSearchFilterTab(tab.key)}
                      >
                        <Text style={[styles.topCategoryText, searchFilterTab === tab.key && styles.topCategoryTextActive]}>
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.sectionHeader, { marginTop: 12 }]}>YOU MIGHT ALSO LOOK FOR...</Text>

                  {(searchFilterTab === 'all' || searchFilterTab === 'portfolios') && relatedProjects.length > 0 && (
                    <ProjectGrid
                      items={relatedProjects}
                      onPress={openProjectModal}
                      onToggleLike={toggleLike}
                      onOpenDesignerProfile={openDesignerProfileByName}
                      onToggleFollow={toggleFollowDesigner}
                      followedDesigners={followedDesigners}
                      currentUserId={session ? session.user.id : null}
                    />
                  )}

                  {(searchFilterTab === 'all' || searchFilterTab === 'designers') && (
                    <View style={styles.designersList}>
                      {relatedDesigners.map((des) => {
                        const isFollowing = followedDesigners.includes(des.name);
                        return (
                          <TouchableOpacity
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

                              <View style={styles.designerCardActionsRow}>
                                <TouchableOpacity
                                  style={[styles.smallFollowBtn, isFollowing && styles.smallFollowBtnActive]}
                                  onPress={() => toggleFollowDesigner(des.name)}
                                >
                                  <Text style={[styles.smallFollowText, isFollowing && styles.smallFollowTextActive]}>
                                    {isFollowing ? 'Following' : (des.followsMe ? 'Follow Back' : '+ Follow')}
                                  </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.smallShareBtnIconOnly}
                                  onPress={() => handleShareDesigner(des)}
                                >
                                  <ShareIconSVG />
                                </TouchableOpacity>
                              </View>
                            </View>
                            <ChevronRightSVG color="#8B5CF6" size={20} />
                          </TouchableOpacity>
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
                        <TouchableOpacity
                          key={kw}
                          style={styles.keywordChip}
                          onPress={() => setSearchQuery(kw)}
                        >
                          <View style={styles.iconTextInlineRow}>
                            <SearchChipSVG />
                            <Text style={styles.keywordText}>{kw}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptySearchText}>No popular tags yet \u2014 be the first to publish!</Text>
                  )}

                  <Text
                    style={[styles.sectionHeader, { marginTop: 28 }]}
                    onLayout={(e) => setDiscoverSectionY(e.nativeEvent.layout.y)}
                  >
                    DISCOVER DESIGNERS ({searchedDesigners.length})
                  </Text>
                  <View style={styles.designersList}>
                    {searchedDesigners.slice(0, discoverDesignersLimit).map((des) => {
                      const isFollowing = followedDesigners.includes(des.name);
                      return (
                        <TouchableOpacity
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

                            <View style={styles.designerCardActionsRow}>
                              <TouchableOpacity
                                style={[styles.smallFollowBtn, isFollowing && styles.smallFollowBtnActive]}
                                onPress={() => toggleFollowDesigner(des.name)}
                              >
                                <Text style={[styles.smallFollowText, isFollowing && styles.smallFollowTextActive]}>
                                  {isFollowing ? 'Following' : (des.followsMe ? 'Follow Back' : '+ Follow')}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.smallShareBtnIconOnly}
                                onPress={() => handleShareDesigner(des)}
                              >
                                <ShareIconSVG />
                              </TouchableOpacity>
                            </View>
                          </View>
                          <ChevronRightSVG color="#8B5CF6" size={20} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {discoverDesignersLimit < searchedDesigners.length && (
                    <TouchableOpacity
                      style={{ marginTop: 14, marginBottom: 10, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#151D2A', borderRadius: 12, borderWidth: 1, borderColor: '#26334D' }}
                      onPress={() => setDiscoverDesignersLimit((prev) => prev + DISCOVER_PAGE_SIZE)}
                    >
                      <Text style={{ color: '#C084FC', fontWeight: '700', fontSize: 13 }}>Show More</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* TAB PAGE 4: PROFILE */}
          {bottomNav === 'profile' && (
            <View>
              <View style={styles.profileCard}>
                <TouchableOpacity
                  style={styles.profileTopRightShareBtn}
                  onPress={() => handleShareDesigner({ name: userProfile.name, figma: (userProfile.links && userProfile.links[0]) || userProfile.handle || '' })}
                >
                  <ShareIconSVG />
                </TouchableOpacity>

                <Image
                  source={{ uri: userProfile.avatar }}
                  style={styles.profileLargeAvatar}
                />
                <Text style={styles.profileName}>{userProfile.name}</Text>
                {userProfile.handle ? (
                  <Text style={{ color: '#C084FC', fontSize: 13, fontWeight: '600', marginBottom: 2 }}>{formatHandleDisplay(userProfile.handle)}</Text>
                ) : null}
                <Text style={styles.profileRole}>{userProfile.role}</Text>
                
                <View style={[styles.iconTextInlineRow, { marginBottom: 8 }]}>
                  <LocationPinSVG />
                  <Text style={styles.profileLocText}>{userProfile.location}</Text>
                </View>

                <Text style={styles.profileBio}>{userProfile.bio}</Text>

                <View style={styles.statsRow}>
                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={() => openFollowersModal({ id: session ? session.user.id : null, name: userProfile.name })}
                  >
                    <Text style={styles.statNum}>{myFollowStats.followersCount}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </TouchableOpacity>

                  <View style={styles.statDivider} />

                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={() => openFollowingModal({ id: session ? session.user.id : null, name: userProfile.name })}
                  >
                    <Text style={styles.statNum}>{myFollowStats.followingCount}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </TouchableOpacity>
                </View>

                {userProfile.links && userProfile.links.length > 0 && (
                  <View style={styles.socialCircularLinksRow}>
                    {userProfile.links.map((linkUrl, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.socialCircleBtn}
                        onPress={() => openExternalLinkWithWarning(linkUrl)}
                      >
                        {getSocialLogoSVG(linkUrl)}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.profileTabsBar}>
                <TouchableOpacity
                  style={[styles.profileTabBtn, profileTab === 'myWork' && styles.profileTabBtnActive]}
                  onPress={() => setProfileTab('myWork')}
                >
                  <Text style={[styles.profileTabBtnText, profileTab === 'myWork' && styles.profileTabBtnTextActive]}>
                    My Portfolios ({myUploadedProjects.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.profileTabBtn, profileTab === 'likedWork' && styles.profileTabBtnActive]}
                  onPress={() => setProfileTab('likedWork')}
                >
                  <Text style={[styles.profileTabBtnText, profileTab === 'likedWork' && styles.profileTabBtnTextActive]}>
                    Liked Portfolios ({myLikedProjects.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {profileTab === 'myWork' && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginBottom: 10 }}
                  onPress={() => setPortfolioLayoutMode(portfolioLayoutMode === 'compact' ? 'full' : 'compact')}
                >
                  <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '600' }}>
                    {portfolioLayoutMode === 'compact' ? 'Compact View' : 'Full Width View'}
                  </Text>
                  <LayoutToggleSVG mode={portfolioLayoutMode} size={15} />
                </TouchableOpacity>
              )}

              {profileTab === 'myWork' && portfolioLayoutMode === 'full' ? (
                <ProjectGrid
                  items={myUploadedProjects}
                  onPress={openProjectModal}
                  onToggleLike={toggleLike}
                  onOpenDesignerProfile={openDesignerProfileByName}
                  onToggleFollow={toggleFollowDesigner}
                  followedDesigners={followedDesigners}
                  currentUserId={session ? session.user.id : null}
                />
              ) : (
                <TwoRowHorizontalGrid
                  items={profileTab === 'myWork' ? myUploadedProjects : myLikedProjects}
                  onPress={openProjectModal}
                  onToggleLike={toggleLike}
                  onOpenDesignerProfile={openDesignerProfileByName}
                  onToggleFollow={toggleFollowDesigner}
                  followedDesigners={followedDesigners}
                  currentUserId={session ? session.user.id : null}
                />
              )}
            </View>
          )}

        </ScrollView>
      </Animated.View>

      {/* STICKY BACK TO TOP FLOATING BUTTON */}
      {showBackToTop && (
        <TouchableOpacity
          style={styles.stickyBackToTopBtn}
          activeOpacity={0.85}
          onPress={scrollToTop}
        >
          <ChevronUpSVG />
        </TouchableOpacity>
      )}

      {/* FLOATING ROUNDED RECTANGLE BOTTOM MENU BAR WITH FOLLOWING LABEL */}
      <View style={styles.floatingBottomBar}>
        <TouchableOpacity style={styles.uniformTabItem} onPress={() => handleNavChange('forYou')}>
          <Animated.View style={{ transform: [{ scale: tabScaleAnims.forYou }] }}>
            <ForYouSVG active={bottomNav === 'forYou'} />
          </Animated.View>
          <Text style={[styles.menuLabel, bottomNav === 'forYou' && styles.menuLabelActive]}>For You</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uniformTabItem} onPress={() => handleNavChange('followed')}>
          <Animated.View style={{ transform: [{ scale: tabScaleAnims.followed }] }}>
            <FollowedTabSVG active={bottomNav === 'followed'} />
          </Animated.View>
          <Text style={[styles.menuLabel, bottomNav === 'followed' && styles.menuLabelActive]}>Circle</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.plusContainerBtn}
          activeOpacity={0.85}
          onPress={() => { playTabBounce('plus'); resetFormWizard(); setAddModalVisible(true); }}
        >
          <Animated.View style={{ transform: [{ scale: tabScaleAnims.plus }] }}>
            <PlusSVG />
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uniformTabItem} onPress={() => handleNavChange('search')}>
          <Animated.View style={{ transform: [{ scale: tabScaleAnims.search }] }}>
            <SearchSVG active={bottomNav === 'search'} />
          </Animated.View>
          <Text style={[styles.menuLabel, bottomNav === 'search' && styles.menuLabelActive]}>Search</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uniformTabItem} onPress={() => handleNavChange('profile')}>
          <Animated.View style={{ transform: [{ scale: tabScaleAnims.profile }] }}>
            <ProfileSVG active={bottomNav === 'profile'} />
          </Animated.View>
          <Text style={[styles.menuLabel, bottomNav === 'profile' && styles.menuLabelActive]}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* EXTERNAL LINK LEAVING WARNING CONFIRMATION MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={externalLinkModalVisible}
        onRequestClose={() => setExternalLinkModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={styles.confirmIconCircle}>
              <WarningTriangleSVG />
            </View>
            <Text style={styles.confirmTitle}>Leaving DECENT</Text>
            <Text style={styles.confirmSubText}>
              You are about to open an external website:
            </Text>

            <View style={styles.linkUrlBox}>
              <Text style={styles.linkUrlText} numberOfLines={2}>{targetExternalUrl}</Text>
            </View>

            <View style={styles.confirmActionsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setExternalLinkModalVisible(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={confirmProceedToExternalLink}
              >
                <View style={styles.iconTextInlineRow}>
                  <Text style={styles.confirmDeleteText}>Continue</Text>
                  <ChevronRightSVG color="#FFFFFF" size={16} />
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={{ marginTop: 14, alignItems: 'center' }} onPress={handleReportExternalLink}>
              <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '700' }}>Report this link as suspicious</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* NOTIFICATIONS DROPDOWN - anchored under the bell icon, blurs content below header only */}
      {notificationModalVisible && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: Math.max(notifDropdownPos.top - 8, 0), left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setNotificationModalVisible(false)}
          >
            <BlurView
              intensity={65}
              tint="dark"
              style={{ flex: 1 }}
              experimentalBlurMethod="dimezisBlurView"
            />
          </TouchableOpacity>

          <View
            style={{
              position: 'absolute',
              top: notifDropdownPos.top,
              left: notifDropdownPos.left,
              right: notifDropdownPos.right,
              maxHeight: 420,
              backgroundColor: '#151D2A',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#26334D',
              shadowColor: '#8B5CF6',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 12,
              overflow: 'hidden'
            }}
          >
            <View style={[styles.modalTopBar, { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#26334D' }]}>
              <Text style={styles.modalTopTitle}>Notifications</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setNotificationModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {notificationsList.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: '#94A3B8', fontSize: 13 }}>No notifications</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
                {notificationsList.map((notif) => {
                  const isFollowingUser = followedDesigners.includes(notif.user);
                  return (
                    <SwipeToDismiss key={notif.id} onDismiss={() => dismissNotification(notif.id)}>
                      <View style={styles.notificationCard}>
                        <Image source={{ uri: notif.avatar }} style={styles.notifAvatar} />
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <Text style={styles.notifText}>
                            <Text style={styles.notifUserBold}>{notif.user}</Text> {notif.action}{' '}
                            {notif.target ? <Text style={styles.notifTargetBold}>"{notif.target}"</Text> : null}
                          </Text>
                          <Text style={styles.notifTimeText}>{notif.time}</Text>
                        </View>

                        {notif.type === 'follow' ? (
                          <TouchableOpacity
                            style={[styles.notifFollowBackBtn, isFollowingUser && styles.notifFollowBackBtnActive]}
                            onPress={() => toggleFollowDesigner(notif.user)}
                          >
                            <Text style={[styles.notifFollowBackText, isFollowingUser && styles.notifFollowBackTextActive]}>
                              {isFollowingUser ? 'Following' : 'Follow Back'}
                            </Text>
                          </TouchableOpacity>
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
          </View>
        </View>
      )}

      {/* DISCARD UPLOAD WIZARD CONFIRMATION MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={discardConfirmModalVisible}
        onRequestClose={() => setDiscardConfirmModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
              <WarningTriangleSVG />
            </View>
            <Text style={styles.confirmTitle}>Discard This Portfolio?</Text>
            <Text style={styles.confirmSubText}>
              Are you sure? What you've entered so far won't be saved.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                onPress={() => setDiscardConfirmModalVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: '#F8FAFC' }]}>Keep Editing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                onPress={() => {
                  setDiscardConfirmModalVisible(false);
                  setAddModalVisible(false);
                  resetFormWizard();
                }}
              >
                <Text style={styles.confirmDeleteText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DELETE PORTFOLIO CONFIRMATION MODAL - was previously missing */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={deleteConfirmModalVisible}
        onRequestClose={() => setDeleteConfirmModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
              <TrashIconSVG />
            </View>
            <Text style={styles.confirmTitle}>Delete Portfolio?</Text>
            <Text style={styles.confirmSubText}>
              {projectToDelete ? `"${projectToDelete.title}" will be permanently deleted. This can't be undone.` : "This can't be undone."}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                onPress={() => {
                  setDeleteConfirmModalVisible(false);
                  setProjectToDelete(null);
                }}
              >
                <Text style={[styles.confirmDeleteText, { color: '#F8FAFC' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                onPress={confirmDeletePortfolio}
              >
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ACCOUNT SETTINGS SAVE SUCCESS CUSTOM POP-UP - rebuilt with explicit styles */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={accountSaveSuccessModalVisible}
        onRequestClose={() => setAccountSaveSuccessModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(11,15,23,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#151D2A', borderRadius: 20, borderWidth: 1, borderColor: '#26334D', padding: 24, width: '100%', alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <CheckIconSVG />
            </View>
            <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginBottom: 6, textAlign: 'center' }}>Settings Saved</Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', marginBottom: 18, lineHeight: 19 }}>
              Your account profile, location, and preferences have been updated successfully!
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 14, width: '100%', alignItems: 'center' }}
              onPress={() => setAccountSaveSuccessModalVisible(false)}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ACCOUNT SETTINGS EDIT MODAL WITH LOCATION FIELD */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={accountSettingsModalVisible}
        onRequestClose={handleCloseAccountSettings}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={[styles.overlayModalContainer, { height: '85%' }]}>
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              <TouchableOpacity style={styles.closeBtn} onPress={handleCloseAccountSettings}>
                <Text style={styles.closeBtnText}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTopTitle, { flex: 1 }]}>Account Settings</Text>
              <TouchableOpacity
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
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
              contentContainerStyle={styles.accountSettingsScrollContent}
              enableOnAndroid={true}
              extraScrollHeight={30}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.formGroupLabel}>Profile Picture</Text>
              <TouchableOpacity style={styles.avatarEditPickerBtn} activeOpacity={0.85} onPress={pickAvatarImage}>
                <Image source={{ uri: editAvatar }} style={styles.avatarEditPreview} />
                <View style={styles.avatarEditOverlay}>
                  <CameraIconSVG />
                  <Text style={styles.avatarEditText}>Change Photo</Text>
                </View>
              </TouchableOpacity>

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
                  <TouchableOpacity style={styles.clearFieldBtn} onPress={() => setEditName('')}>
                    <ClearTextXSVG />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.formGroupLabel}>Unique ID / Handle</Text>
              <View style={[styles.inputWithClearRow, { backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 10, paddingLeft: 14 }]}>
                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '700' }}>@</Text>
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
                  <TouchableOpacity style={styles.clearFieldBtn} onPress={() => setEditHandle('')}>
                    <ClearTextXSVG />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ color: '#64748B', fontSize: 11, marginTop: -6, marginBottom: 4 }}>
                3-20 characters, letters, numbers, dots, underscores, and dashes only. Can only be changed once every 30 days.
              </Text>
              {editHandle.trim() !== (userProfile.handle || '') && (
                <>
                  {handleStatus === 'checking' && <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 6 }}>Checking availability...</Text>}
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
                  <TouchableOpacity style={styles.clearFieldBtn} onPress={() => setEditRole('')}>
                    <ClearTextXSVG />
                  </TouchableOpacity>
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
                  <TouchableOpacity style={styles.clearFieldBtn} onPress={() => setEditLocation('')}>
                    <ClearTextXSVG />
                  </TouchableOpacity>
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
                />
                {editEmail.length > 0 && (
                  <TouchableOpacity style={styles.clearFieldBtn} onPress={() => setEditEmail('')}>
                    <ClearTextXSVG />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.settingItemSub, { marginTop: -6, marginBottom: 4 }]}>
                Changing this changes your login email. You'll get a confirmation link sent to the new address.
              </Text>

              <Text style={[styles.formGroupLabel, { marginTop: 10 }]}>
                Profile Links (Max 5)
              </Text>
              {editLinks.map((lnk, idx) => (
                <View key={idx} style={styles.videoInputRow}>
                  <View style={styles.socialCirclePreviewBtn}>
                    {getSocialLogoSVG(lnk)}
                  </View>
                  <View style={[styles.inputWithClearRow, { flex: 1 }]}>
                    <FocusableTextInput
                      style={[styles.formInput, { flex: 1 }]}
                      value={lnk}
                      onChangeText={(t) => handleLinkTextChange(t, idx)}
                      placeholder={`https://www.figma.com/@username (${idx + 1})`}
                      placeholderTextColor="#94A3B8"
                    />
                    {lnk.length > 0 && (
                      <TouchableOpacity style={styles.clearFieldBtn} onPress={() => handleLinkTextChange('', idx)}>
                        <ClearTextXSVG />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.removeVideoBtn}
                    onPress={() => handleRemoveAccountLink(idx)}
                  >
                    <TrashIconSVG />
                  </TouchableOpacity>
                </View>
              ))}

              {editLinks.length < 5 && (
                <TouchableOpacity style={styles.addMoreVideoBtn} onPress={handleAddAccountLink}>
                  <Text style={styles.addMoreVideoText}>+ Add Profile Link ({editLinks.length}/5)</Text>
                </TouchableOpacity>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' }}>
                <TouchableOpacity
                  style={[styles.saveAccountSettingsBtn, { paddingHorizontal: 20, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#EF4444', marginTop: 0 }]}
                  onPress={() => supabase.auth.signOut()}
                >
                  <Text style={[styles.submitBtnText, { color: '#EF4444' }]}>Log Out</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveAccountSettingsBtn, { flex: 1, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#8B5CF6', marginTop: 0 }]}
                  onPress={() => {
                    setNewPassword('');
                    setConfirmNewPassword('');
                    setChangePasswordPageVisible(true);
                  }}
                >
                  <Text style={[styles.submitBtnText, { color: '#C084FC' }]}>Change Password</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.saveAccountSettingsBtn, { marginTop: 10 }]} activeOpacity={0.85} onPress={handleSaveAccountSettings}>
                <Text style={styles.submitBtnText}>Save Changes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 16, alignItems: 'center' }}
                onPress={handleDeleteAccount}
              >
                <Text style={{ color: '#F87171', fontWeight: '700', fontSize: 13 }}>Delete Account</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* CHANGE PASSWORD - deeper page with back/X and unsaved-changes warning */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={changePasswordPageVisible}
        onRequestClose={handleCloseChangePasswordPage}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={[styles.overlayModalContainer, { height: '60%' }]}>
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              <TouchableOpacity style={styles.closeBtn} onPress={handleCloseChangePasswordPage}>
                <Text style={styles.closeBtnText}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTopTitle, { flex: 1 }]}>Change Password</Text>
              <TouchableOpacity
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
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
              contentContainerStyle={{ padding: 20 }}
              enableOnAndroid={true}
              extraScrollHeight={30}
              keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.formGroupLabel}>New Password</Text>
                <FocusableTextInput
                  style={[styles.formInput, { marginBottom: 8 }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  autoFocus
                />
                <Text style={styles.formGroupLabel}>Confirm New Password</Text>
                <FocusableTextInput
                  style={styles.formInput}
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                />
                <TouchableOpacity
                  style={[styles.saveAccountSettingsBtn, { marginTop: 20 }]}
                  onPress={async () => {
                    const success = await handleChangePassword();
                    if (success) setChangePasswordPageVisible(false);
                  }}
                  disabled={changingPassword || !newPassword}
                >
                  {changingPassword ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Update Password</Text>
                  )}
                </TouchableOpacity>
            </KeyboardAwareScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ACCOUNT SETTINGS - UNSAVED CHANGES WARNING */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={accountSettingsDiscardWarningVisible}
        onRequestClose={() => setAccountSettingsDiscardWarningVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
              <WarningTriangleSVG />
            </View>
            <Text style={styles.confirmTitle}>Discard Changes?</Text>
            <Text style={styles.confirmSubText}>You have unsaved changes to your account. Are you sure you want to leave without saving?</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                onPress={() => setAccountSettingsDiscardWarningVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: '#F8FAFC' }]}>Keep Editing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                onPress={() => {
                  setAccountSettingsDiscardWarningVisible(false);
                  setAccountSettingsModalVisible(false);
                }}
              >
                <Text style={styles.confirmDeleteText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CHANGE PASSWORD - UNSAVED CHANGES WARNING */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={passwordPageDiscardWarningVisible}
        onRequestClose={() => setPasswordPageDiscardWarningVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
              <WarningTriangleSVG />
            </View>
            <Text style={styles.confirmTitle}>Discard Password Change?</Text>
            <Text style={styles.confirmSubText}>You've typed a new password but haven't saved it. Are you sure you want to leave?</Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                onPress={() => setPasswordPageDiscardWarningVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: '#F8FAFC' }]}>Keep Editing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                onPress={() => {
                  setPasswordPageDiscardWarningVisible(false);
                  setNewPassword('');
                  setConfirmNewPassword('');
                  setChangePasswordPageVisible(false);
                }}
              >
                <Text style={styles.confirmDeleteText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ABOUT DECENT CUSTOM DARK OVERLAY MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={aboutModalVisible}
        onRequestClose={() => setAboutModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={styles.overlayModalContainer}>
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setAboutModalVisible(false)}>
                <Text style={styles.closeBtnText}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTopTitle, { flex: 1 }]}>About DECENT</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setAboutModalVisible(false); setSettingsModalVisible(false); }}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '800' }}>DECENT v0.10.0</Text>
              <Text style={{ color: '#CBD5E1', fontSize: 14, lineHeight: 21 }}>
                DECENT is an interactive UI/UX portfolio platform designed for creators, product designers, and design system architects.
              </Text>
              <Text style={{ color: '#CBD5E1', fontSize: 14, lineHeight: 21 }}>
                Showcase mobile design systems, responsive web prototypes, case studies, and live interactive Figma canvas viewports natively in one unified application.
              </Text>

              <View style={{ backgroundColor: '#151D2A', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#26334D' }}>
                <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Platform Highlights</Text>
                <Text style={{ color: '#CBD5E1', fontSize: 13, marginBottom: 3 }}>❖ Interactive Figma Prototype Viewports</Text>
                <Text style={{ color: '#CBD5E1', fontSize: 13, marginBottom: 3 }}>❖ 45+ UI/UX Specialized Tagging</Text>
                <Text style={{ color: '#CBD5E1', fontSize: 13, marginBottom: 3 }}>❖ Seamless Dark Mode Design</Text>
                <Text style={{ color: '#CBD5E1', fontSize: 13 }}>❖ Direct Follower & Notification Hub</Text>
              </View>

              <TouchableOpacity
                style={{ backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setAboutModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* PRIVACY POLICY - WHITE THEME FOR READABILITY */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={privacyModalVisible}
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={[styles.overlayModalContainer, { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
            <View style={[styles.modalTopBar, { backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0', justifyContent: 'flex-start', gap: 10 }]}>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]} onPress={() => setPrivacyModalVisible(false)}>
                <Text style={[styles.closeBtnText, { color: '#0F172A' }]}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTopTitle, { color: '#0F172A', flex: 1 }]}>Privacy Policy</Text>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]} onPress={() => { setPrivacyModalVisible(false); setSettingsModalVisible(false); }}>
                <Text style={[styles.closeBtnText, { color: '#0F172A' }]}>✕</Text>
              </TouchableOpacity>
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

              <TouchableOpacity
                style={{ backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setPrivacyModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* TERMS OF SERVICE - WHITE THEME FOR READABILITY */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={termsModalVisible}
        onRequestClose={() => setTermsModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={[styles.overlayModalContainer, { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
            <View style={[styles.modalTopBar, { backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0', justifyContent: 'flex-start', gap: 10 }]}>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]} onPress={() => setTermsModalVisible(false)}>
                <Text style={[styles.closeBtnText, { color: '#0F172A' }]}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTopTitle, { color: '#0F172A', flex: 1 }]}>Terms of Service</Text>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]} onPress={() => { setTermsModalVisible(false); setSettingsModalVisible(false); }}>
                <Text style={[styles.closeBtnText, { color: '#0F172A' }]}>✕</Text>
              </TouchableOpacity>
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

              <TouchableOpacity
                style={{ backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 }}
                onPress={() => setTermsModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* BLOCKED USERS MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={blockedUsersModalVisible}
        onRequestClose={() => setBlockedUsersModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={styles.overlayModalContainer}>
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setBlockedUsersModalVisible(false)}>
                <Text style={styles.closeBtnText}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTopTitle, { flex: 1 }]}>Blocked Users</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setBlockedUsersModalVisible(false); setSettingsModalVisible(false); }}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {blockedUsersList.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: '#94A3B8', fontSize: 13 }}>You haven't blocked anyone.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
                {blockedUsersList.map((u) => (
                  <View key={u.id} style={styles.notificationCard}>
                    <Image source={{ uri: u.avatar }} style={styles.notifAvatar} />
                    <Text style={[styles.notifText, { flex: 1 }]}>{u.name}</Text>
                    <TouchableOpacity
                      style={styles.notifFollowBackBtn}
                      onPress={() => handleUnblockUser(u.id)}
                    >
                      <Text style={styles.notifFollowBackText}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* REPORTS (ADMIN) MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={reportsModalVisible}
        onRequestClose={() => setReportsModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={styles.overlayModalContainer}>
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setReportsModalVisible(false)}>
                <Text style={styles.closeBtnText}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTopTitle, { flex: 1 }]}>Reports</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setReportsModalVisible(false); setSettingsModalVisible(false); }}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {allReports.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: '#94A3B8', fontSize: 13 }}>No reports yet.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
                {allReports.map((r) => (
                  <View key={r.id} style={[styles.aboutInfoBox, { width: '100%' }]}>
                    <Text style={styles.aboutInfoTitle}>{r.targetType === 'portfolio' ? 'Portfolio Report' : 'User Report'}</Text>
                    <Text style={styles.aboutInfoItem}>Reason: {r.reason}</Text>
                    <Text style={styles.aboutInfoItem}>Reported by: {r.reporterName}</Text>
                    <Text style={styles.aboutInfoItem}>Target ID: {r.targetId}</Text>
                    <Text style={styles.aboutInfoItem}>{r.time}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* ADMIN PASSWORD GATE - required every time before entering admin panel */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={adminPasswordModalVisible}
        onRequestClose={() => setAdminPasswordModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={[styles.successIconCircle, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
              <LockIconSVG color="#FBBF24" size={22} />
            </View>
            <Text style={styles.confirmTitle}>Admin Access</Text>
            <Text style={styles.confirmSubText}>Enter the admin password to continue.</Text>
            <FocusableTextInput
              style={[styles.formInput, { width: '100%', marginBottom: 14 }]}
              value={adminPasswordInput}
              onChangeText={setAdminPasswordInput}
              placeholder="Admin password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                onPress={() => setAdminPasswordModalVisible(false)}
              >
                <Text style={[styles.confirmDeleteText, { color: '#F8FAFC' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { flex: 1 }]}
                onPress={handleSubmitAdminPassword}
              >
                <Text style={styles.confirmDeleteText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADMIN CONTROL PANEL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={adminPanelVisible}
        onRequestClose={() => setAdminPanelVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={[styles.overlayModalContainer, { height: '88%' }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTopTitle}>Admin Control Panel</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setAdminPanelVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={styles.sectionHeader}>TEST FUNCTIONS</Text>

              <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 4 }}>
                Push registration status: <Text style={{ color: '#C084FC' }}>{pushRegistrationStatus}</Text>
              </Text>

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { width: '100%', backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                onPress={handleAdminTestPush}
              >
                <Text style={[styles.confirmDeleteText, { color: '#C084FC' }]}>Send Test Push Notification to Myself</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { width: '100%', backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                onPress={handleAdminTestCrash}
              >
                <Text style={[styles.confirmDeleteText, { color: '#C084FC' }]}>Trigger Test Crash Report (Sentry)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { width: '100%', backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                onPress={handleAdminTestAnalytics}
              >
                <Text style={[styles.confirmDeleteText, { color: '#C084FC' }]}>Log Test Analytics Event</Text>
              </TouchableOpacity>

              <Text style={[styles.settingItemSub, { marginTop: -6 }]}>
                Push and crash test buttons only produce visible results on a real build (EAS build or dev client) - Expo Go can't run the native pieces they depend on.
              </Text>

              <Text style={[styles.sectionHeader, { marginTop: 20 }]}>
                FEEDBACK MESSAGES ({feedbackMessagesList.length})
              </Text>

              {feedbackMessagesList.length === 0 ? (
                <Text style={styles.emptySearchText}>No feedback submitted yet.</Text>
              ) : (
                feedbackMessagesList.map((f) => (
                  <View key={f.id} style={[styles.aboutInfoBox, { width: '100%' }]}>
                    <Text style={styles.aboutInfoTitle}>{f.email || 'No email provided'}</Text>
                    <Text style={styles.aboutInfoItem}>{f.message}</Text>
                    <Text style={styles.aboutInfoItem}>{f.time}</Text>
                  </View>
                ))
              )}

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { width: '100%', backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', marginTop: 20 }]}
                onPress={() => {
                  setAdminPanelVisible(false);
                  fetchAllReports();
                  setReportsModalVisible(true);
                }}
              >
                <Text style={[styles.confirmDeleteText, { color: '#C084FC' }]}>View Reports ({allReports.length})</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* FEEDBACK & SUPPORT CUSTOM DARK OVERLAY MODAL WITH FORM & NOTIFY SWITCH */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={feedbackModalVisible}
        onRequestClose={() => setFeedbackModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={[styles.overlayModalContainer, { height: '85%' }]}>
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setFeedbackModalVisible(false)}>
                <Text style={styles.closeBtnText}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTopTitle, { flex: 1 }]}>Feedback & Support</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setFeedbackModalVisible(false); setSettingsModalVisible(false); }}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
              contentContainerStyle={{ padding: 20, gap: 12 }}
              enableOnAndroid={true}
              extraScrollHeight={30}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.knownContactBox}>
                <Text style={styles.knownContactTitle}>Support Contact</Text>
                <Text style={styles.knownContactEmail}>iputra07@gmail.com</Text>
                <Text style={styles.knownContactSub}>Direct inquiries & platform feedback</Text>
              </View>

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
                  trackColor={{ false: '#26334D', true: '#8B5CF6' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 10 }]}
                onPress={handleSubmitFeedback}
              >
                <Text style={styles.confirmDeleteText}>Submit Feedback</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* FEEDBACK SUCCESS POPUP MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={feedbackSuccessModalVisible}
        onRequestClose={() => setFeedbackSuccessModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={styles.successIconCircle}>
              <CheckIconSVG />
            </View>
            <Text style={styles.confirmTitle}>Feedback Submitted</Text>
            <Text style={styles.confirmSubText}>
              Thank you for helping improve DECENT! Our support team (iputra07@gmail.com) has received your submission.
            </Text>
            <TouchableOpacity
              style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 8 }]}
              onPress={() => setFeedbackSuccessModalVisible(false)}
            >
              <Text style={styles.confirmDeleteText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DONATE MODAL - single screen, no scroll, Indonesia (QRIS) / International (PayPal, Wise) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={donateModalVisible}
        onRequestClose={() => setDonateModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={[styles.overlayModalContainer, { height: '92%' }]}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTopTitle}>Support DECENT</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setDonateModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 18, flex: 1, justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: '#94A3B8', fontSize: 12.5, lineHeight: 18, marginBottom: 16 }}>
                  Hi, I'm Iqbal \u2014 a UI/UX designer focused on Figma prototyping and clean handovers for HR and dev teams. I built DECENT to give designers a simple place to showcase real, interactive portfolios instead of static screenshots. If it's been useful to you, a donation helps keep it running and improving.
                </Text>

                <View style={{ flexDirection: 'row', backgroundColor: '#0B0F17', borderRadius: 12, padding: 4, marginBottom: 16 }}>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', backgroundColor: donateRegion === 'id' ? '#8B5CF6' : 'transparent' }}
                    onPress={() => setDonateRegion('id')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                      <LocationPinSVG />
                      <Text style={{ color: donateRegion === 'id' ? '#FFFFFF' : '#94A3B8', fontWeight: '700', fontSize: 13 }}>Indonesia</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', backgroundColor: donateRegion === 'intl' ? '#8B5CF6' : 'transparent' }}
                    onPress={() => setDonateRegion('intl')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                      <GlobeIconSVG />
                      <Text style={{ color: donateRegion === 'intl' ? '#FFFFFF' : '#94A3B8', fontWeight: '700', fontSize: 13 }}>International</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {donateRegion === 'id' ? (
                  <View style={{ alignItems: 'center' }}>
                    <View style={{
                      width: 190, height: 190, borderRadius: 16, borderWidth: 1, borderColor: '#26334D',
                      backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden'
                    }}>
                      <Image
                        source={{ uri: 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=DECENT-DEMO-QRIS-MOCKUP' }}
                        style={{ width: 180, height: 180 }}
                      />
                    </View>
                    <View style={{ backgroundColor: '#151D2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 }}>
                      <Text style={{ color: '#FBBF24', fontSize: 11, fontWeight: '700' }}>DEMO QR \u2014 not a real payment code</Text>
                    </View>
                    <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>
                      Scan with any e-wallet or mobile banking app that supports QRIS.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <TouchableOpacity
                      style={styles.contrastDonateBtnFull}
                      activeOpacity={0.88}
                      onPress={() => showAppAlert('Demo Mode', 'This is mockup content. Replace this button\'s link with your real PayPal.me URL to enable it.')}
                    >
                      <Text style={styles.contrastDonateBtnText}>Donate via PayPal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.contrastDonateBtnFull, { backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' }]}
                      activeOpacity={0.88}
                      onPress={() => showAppAlert('Demo Mode', 'This is mockup content. Replace this button\'s link with your real Wise URL to enable it.')}
                    >
                      <Text style={[styles.contrastDonateBtnText, { color: '#C084FC' }]}>Donate via Wise</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* DONATE SUCCESS POPUP MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={donateSuccessModalVisible}
        onRequestClose={() => setDonateSuccessModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <View style={styles.customConfirmCard}>
            <View style={styles.successIconCircle}>
              <CheckIconSVG />
            </View>
            <Text style={styles.confirmTitle}>Thank You!</Text>
            <Text style={styles.confirmSubText}>
              Your generosity keeps DECENT independent and growing. We greatly appreciate your support!
            </Text>
            <TouchableOpacity
              style={[styles.confirmDeleteBtn, { width: '100%', marginTop: 8 }]}
              onPress={() => setDonateSuccessModalVisible(false)}
            >
              <Text style={styles.confirmDeleteText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* APP SETTINGS - blurs content below header only, header stays visible */}
      {settingsModalVisible && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: headerBottomY, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => { setSettingsModalVisible(false); setOptionsView('root'); }}
          >
            <BlurView
              intensity={65}
              tint="dark"
              style={{ flex: 1 }}
              experimentalBlurMethod="dimezisBlurView"
            />
          </TouchableOpacity>

          <View
            style={{
              position: 'absolute',
              top: headerBottomY + 8,
              left: 16,
              right: 16,
              maxHeight: '70%',
              backgroundColor: '#151D2A',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#26334D',
              shadowColor: '#8B5CF6',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 12,
              overflow: 'hidden'
            }}
          >
            <View style={[styles.modalTopBar, { justifyContent: 'flex-start', gap: 10 }]}>
              {optionsView !== 'root' && (
                <TouchableOpacity style={styles.closeBtn} onPress={() => setOptionsView('root')}>
                  <Text style={styles.closeBtnText}>←</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.modalTopTitle, { flex: 1 }]}>
                {optionsView === 'privacy' ? 'Privacy' : optionsView === 'supportLegal' ? 'Support & Legal' : 'Options'}
              </Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setSettingsModalVisible(false); setOptionsView('root'); }}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              {optionsView === 'root' && (
                <>
                  <TouchableOpacity
                    style={styles.settingItemRow}
                    onPress={() => {
                      handleOpenAccountSettingsModal();
                    }}
                  >
                    <Text style={styles.settingItemTitle}>Account</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Edit Profile</Text>
                      <ChevronRightSVG color="#C084FC" size={16} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.settingItemRow}
                    onPress={() => setOptionsView('privacy')}
                  >
                    <Text style={styles.settingItemTitle}>Privacy</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Manage</Text>
                      <ChevronRightSVG color="#C084FC" size={16} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.settingItemRow}
                    onPress={() => setOptionsView('supportLegal')}
                  >
                    <Text style={styles.settingItemTitle}>Support & Legal</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>View</Text>
                      <ChevronRightSVG color="#C084FC" size={16} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.settingItemRow} onPress={handleVersionTap} activeOpacity={0.6}>
                    <Text style={styles.settingItemTitle}>App Version</Text>
                    <Text style={styles.settingItemValue}>v0.10.0</Text>
                  </TouchableOpacity>

                  {adminUnlocked && (
                    <>
                      <TouchableOpacity
                        style={styles.settingItemRow}
                        onPress={() => {
                          fetchAllReports();
                          setReportsModalVisible(true);
                        }}
                      >
                        <Text style={styles.settingItemTitle}>Reports</Text>
                        <View style={styles.iconTextInlineRow}>
                          <Text style={styles.settingItemValue}>Review</Text>
                          <ChevronRightSVG color="#C084FC" size={16} />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.settingItemRow}
                        onPress={handleOpenAdminPanel}
                      >
                        <Text style={[styles.settingItemTitle, { color: '#FBBF24' }]}>Admin Control Panel</Text>
                        <View style={styles.iconTextInlineRow}>
                          <Text style={styles.settingItemValue}>Enter</Text>
                          <ChevronRightSVG color="#C084FC" size={16} />
                        </View>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Contrast Donate Button at Very Bottom */}
                  <TouchableOpacity
                    style={[styles.donateSettingBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
                    activeOpacity={0.88}
                    onPress={() => setDonateModalVisible(true)}
                  >
                    <HeartIconSVG liked={true} />
                    <Text style={styles.donateSettingBtnText}>Support & Donate to DECENT</Text>
                  </TouchableOpacity>
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
                      trackColor={{ false: '#26334D', true: '#8B5CF6' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.settingItemRow}
                    onPress={() => {
                      fetchBlockedUsers();
                      setBlockedUsersModalVisible(true);
                    }}
                  >
                    <Text style={styles.settingItemTitle}>Blocked Users</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Manage</Text>
                      <ChevronRightSVG color="#C084FC" size={16} />
                    </View>
                  </TouchableOpacity>
                </>
              )}

              {optionsView === 'supportLegal' && (
                <>
                  <TouchableOpacity
                    style={styles.settingItemRow}
                    onPress={() => setAboutModalVisible(true)}
                  >
                    <Text style={styles.settingItemTitle}>About DECENT</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Information</Text>
                      <ChevronRightSVG color="#C084FC" size={16} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.settingItemRow}
                    onPress={() => setPrivacyModalVisible(true)}
                  >
                    <Text style={styles.settingItemTitle}>Privacy Policy</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>View Policy</Text>
                      <ChevronRightSVG color="#C084FC" size={16} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.settingItemRow}
                    onPress={() => setTermsModalVisible(true)}
                  >
                    <Text style={styles.settingItemTitle}>Terms of Service</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>View Terms</Text>
                      <ChevronRightSVG color="#C084FC" size={16} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.settingItemRow}
                    onPress={() => setFeedbackModalVisible(true)}
                  >
                    <Text style={styles.settingItemTitle}>Feedback & Support</Text>
                    <View style={styles.iconTextInlineRow}>
                      <Text style={styles.settingItemValue}>Send Message</Text>
                      <ChevronRightSVG color="#C084FC" size={16} />
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      )}



      {/* ALL 20 CATEGORIES POPUP OVERLAY MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={allCategoriesModalVisible}
        onRequestClose={() => setAllCategoriesModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={styles.overlayModalContainer}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTopTitle}>All Categories</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setAllCategoriesModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.allCategoriesGrid}>
              {ALL_UIUX_CATEGORIES_MASTER.slice(0, 20).map((cat) => (
                <TouchableOpacity
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
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* FOLLOWERS / FOLLOWING USER LIST MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={userListModalVisible}
        onRequestClose={() => setUserListModalVisible(false)}
      >
        <View style={styles.overlayModalBg}>
          <SafeAreaView style={styles.overlayModalContainer}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTopTitle}>{userListTitle}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setUserListModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {userListItems.map((usr) => {
                const isFollowing = followedDesigners.includes(usr.name);
                return (
                  <TouchableOpacity
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

                    <TouchableOpacity
                      style={[styles.smallFollowBtn, isFollowing && styles.smallFollowBtnActive]}
                      onPress={() => toggleFollowDesigner(usr.name)}
                    >
                      <Text style={[styles.smallFollowText, isFollowing && styles.smallFollowTextActive]}>
                        {isFollowing ? 'Following' : (usr.followsMe ? 'Follow Back' : '+ Follow')}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* DESIGNER PROFILE MODAL */}
      {selectedDesigner && (
        <Modal
          animationType="slide"
          transparent={false}
          visible={designerModalVisible}
          onRequestClose={() => setDesignerModalVisible(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTopTitle}>Designer Profile</Text>
              {session && selectedDesigner.id && selectedDesigner.id !== session.user.id && (
                <TouchableOpacity
                  style={[styles.closeBtn, { marginRight: 4 }]}
                  onPress={() => {
                    showAppAlert(selectedDesigner.name, 'What would you like to do?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Report Profile', onPress: () => handleReportContent('user', selectedDesigner.id, selectedDesigner.name) },
                      { text: 'Block User', style: 'destructive', onPress: () => handleBlockUser(selectedDesigner.id, selectedDesigner.name) }
                    ]);
                  }}
                >
                  <Text style={{ color: '#94A3B8', fontSize: 20, fontWeight: '900', lineHeight: 20 }}>⋯</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.closeBtn} onPress={() => setDesignerModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.caseScrollView} contentContainerStyle={styles.caseContent}>
              <View style={styles.profileCard}>
                <Image source={{ uri: selectedDesigner.avatar }} style={styles.profileLargeAvatar} />
                <Text style={styles.profileName}>{selectedDesigner.name}</Text>
                {selectedDesigner.handle ? (
                  <Text style={{ color: '#C084FC', fontSize: 13, fontWeight: '600', marginBottom: 2 }}>{formatHandleDisplay(selectedDesigner.handle)}</Text>
                ) : null}
                <Text style={styles.profileRole}>{selectedDesigner.role}</Text>
                
                <View style={[styles.iconTextInlineRow, { marginBottom: 12 }]}>
                  <LocationPinSVG />
                  <Text style={styles.profileLocText}>{selectedDesigner.location}</Text>
                </View>

                <Text style={styles.profileBio}>{selectedDesigner.bio}</Text>

                <View style={styles.statsRow}>
                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={() => openFollowersModal(selectedDesigner)}
                  >
                    <Text style={styles.statNum}>{selectedDesigner.followersCount ?? 0}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </TouchableOpacity>

                  <View style={styles.statDivider} />

                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={() => openFollowingModal(selectedDesigner)}
                  >
                    <Text style={styles.statNum}>{selectedDesigner.followingCount ?? 0}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </TouchableOpacity>
                </View>

                {selectedDesigner.links && selectedDesigner.links.length > 0 && (
                  <View style={styles.socialCircularLinksRow}>
                    {selectedDesigner.links.map((linkUrl, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.socialCircleBtn}
                        onPress={() => openExternalLinkWithWarning(linkUrl)}
                      >
                        {getSocialLogoSVG(linkUrl)}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={[styles.designerProfileActionsRow, { marginTop: 14 }]}>
                  {!(session && selectedDesigner.id === session.user.id) && (
                    <TouchableOpacity
                      style={[
                        styles.modalFollowBtn,
                        followedDesigners.includes(selectedDesigner.name) && styles.modalFollowBtnActive
                      ]}
                      onPress={() => toggleFollowDesigner(selectedDesigner.name)}
                    >
                      <Text style={[
                        styles.modalFollowText,
                        followedDesigners.includes(selectedDesigner.name) && styles.modalFollowTextActive
                      ]}>
                        {followedDesigners.includes(selectedDesigner.name) ? 'Following' : (selectedDesigner.followsMe ? 'Follow Back' : '+ Follow')}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.modalShareBtnIconOnly}
                    onPress={() => handleShareDesigner(selectedDesigner)}
                  >
                    <ShareIconSVG />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.profileTabsBar}>
                <TouchableOpacity
                  style={[styles.profileTabBtn, designerProfileTab === 'myWork' && styles.profileTabBtnActive]}
                  onPress={() => setDesignerProfileTab('myWork')}
                >
                  <Text style={[styles.profileTabBtnText, designerProfileTab === 'myWork' && styles.profileTabBtnTextActive]}>
                    Portfolios ({projects.filter((p) => p.designer.toLowerCase().includes(selectedDesigner.name.split(' ')[0].toLowerCase())).length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.profileTabBtn, designerProfileTab === 'likedWork' && styles.profileTabBtnActive]}
                  onPress={() => setDesignerProfileTab('likedWork')}
                >
                  <Text style={[styles.profileTabBtnText, designerProfileTab === 'likedWork' && styles.profileTabBtnTextActive]}>
                    Liked Portfolios ({designerLikedProjects.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {designerProfileTab === 'myWork' && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginBottom: 10 }}
                  onPress={() => setPortfolioLayoutMode(portfolioLayoutMode === 'compact' ? 'full' : 'compact')}
                >
                  <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '600' }}>
                    {portfolioLayoutMode === 'compact' ? 'Compact View' : 'Full Width View'}
                  </Text>
                  <LayoutToggleSVG mode={portfolioLayoutMode} size={15} />
                </TouchableOpacity>
              )}

              {designerProfileTab === 'likedWork' && loadingDesignerLikes && (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color="#8B5CF6" />
                </View>
              )}

              {designerProfileTab === 'myWork' && portfolioLayoutMode === 'full' ? (
                <ProjectGrid
                  items={projects.filter((p) => p.designer.toLowerCase().includes(selectedDesigner.name.split(' ')[0].toLowerCase()))}
                  onPress={(item) => {
                    setDesignerModalVisible(false);
                    openProjectModal(item);
                  }}
                  onToggleLike={toggleLike}
                  onOpenDesignerProfile={openDesignerProfileByName}
                  onToggleFollow={toggleFollowDesigner}
                  followedDesigners={followedDesigners}
                  currentUserId={session ? session.user.id : null}
                />
              ) : (
                <TwoRowHorizontalGrid
                  items={
                    designerProfileTab === 'myWork'
                      ? projects.filter((p) => p.designer.toLowerCase().includes(selectedDesigner.name.split(' ')[0].toLowerCase()))
                      : designerLikedProjects
                  }
                  onPress={(item) => {
                    setDesignerModalVisible(false);
                    openProjectModal(item);
                  }}
                  onOpenDesignerProfile={openDesignerProfileByName}
                  onToggleFollow={toggleFollowDesigner}
                  followedDesigners={followedDesigners}
                  currentUserId={session ? session.user.id : null}
                />
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}

      {/* 4-STEP WIZARD MODAL FOR ADDING/EDITING PORTFOLIO PACKAGE */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={addModalVisible}
        onRequestClose={handleCloseUploadWizard}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalTopBar}>
            <Text style={styles.modalTopTitle}>
              {editingProjectId ? 'Edit Portfolio Package' : 'Add Portfolio Package'} (Step {formStep}/4)
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleCloseUploadWizard}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.stepProgressBar}>
            <View style={styles.stepProgressItem}>
              {fTitle.trim() && fBrief.trim() && fCategories.length > 0 ? <CheckIconSVG /> : <DetailsStepSVG color={formStep === 1 ? '#8B5CF6' : '#94A3B8'} />}
              <Text style={[styles.stepLabel, formStep === 1 && styles.stepLabelActive]}>Details</Text>
            </View>
            <View style={styles.stepDivider} />

            <View style={styles.stepProgressItem}>
              {step2Skipped ? <Circle cx="8" cy="8" r="4" fill="#FFFFFF" /> : (fFigmaProto.trim() || fDesktopProto.trim() || fFigmaFile.trim()) ? <CheckIconSVG /> : <LinksStepSVG color={formStep === 2 ? '#8B5CF6' : '#94A3B8'} />}
              <Text style={[styles.stepLabel, formStep === 2 && styles.stepLabelActive]}>Links</Text>
            </View>
            <View style={styles.stepDivider} />

            <View style={styles.stepProgressItem}>
              {fCover.trim() && fShowcaseImages.filter(img => img.trim()).length >= 2 ? <CheckIconSVG /> : <MediaStepSVG color={formStep === 3 ? '#8B5CF6' : '#94A3B8'} />}
              <Text style={[styles.stepLabel, formStep === 3 && styles.stepLabelActive]}>Media</Text>
            </View>
            <View style={styles.stepDivider} />

            <View style={styles.stepProgressItem}>
              <ReviewStepSVG color={formStep === 4 ? '#8B5CF6' : '#94A3B8'} />
              <Text style={[styles.stepLabel, formStep === 4 && styles.stepLabelActive]}>Review</Text>
            </View>
          </View>

          <KeyboardAwareScrollView
            style={styles.caseScrollView}
            contentContainerStyle={[styles.caseContent, { paddingBottom: 110 }]}
            enableOnAndroid={true}
            extraScrollHeight={30}
            keyboardShouldPersistTaps="handled"
          >
              {formStep === 1 && (
                <View>
                  <Text style={styles.stepSectionTitle}>1. Portfolio Details & Brief (Mandatory)</Text>

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

                    <TouchableOpacity
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: '#151D2A', borderWidth: 1, borderColor: errors.fCategories ? '#EF4444' : '#26334D',
                        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12
                      }}
                      onPress={() => {
                        setCategorySearchQuery('');
                        setCategoryPickerModalVisible(true);
                      }}
                    >
                      <Text style={{ color: '#94A3B8', fontSize: 13 }}>
                        {fCategories.length > 0 ? 'Tap to edit selection' : 'Tap to select categories & tags'}
                      </Text>
                      <ChevronRightSVG color="#8B5CF6" size={16} />
                    </TouchableOpacity>

                    {fCategories.length > 0 && (
                      <View style={[styles.selectedCategoriesRow, { marginTop: 10, marginBottom: 0 }]}>
                        {fCategories.map((cat) => (
                          <TouchableOpacity
                            key={cat}
                            style={styles.selectedCategoryPill}
                            onPress={() => toggleCategorySelection(cat)}
                          >
                            <Text style={styles.selectedCategoryText}>{cat} ✕</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {errors.fCategories ? <Text style={styles.errorText}>{errors.fCategories}</Text> : null}
                  </View>

                  <Modal
                    animationType="slide"
                    transparent={true}
                    visible={categoryPickerModalVisible}
                    onRequestClose={() => setCategoryPickerModalVisible(false)}
                  >
                    <View style={styles.overlayModalBg}>
                      <SafeAreaView style={[styles.overlayModalContainer, { height: '75%' }]}>
                        <View style={styles.modalTopBar}>
                          <Text style={styles.modalTopTitle}>Categories & Tags</Text>
                          <TouchableOpacity style={styles.closeBtn} onPress={() => setCategoryPickerModalVisible(false)}>
                            <Text style={styles.closeBtnText}>✕</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={{ padding: 16, paddingBottom: 8 }}>
                          <FocusableTextInput
                            style={styles.categorySearchInput}
                            placeholder="Search or add custom category/tag..."
                            placeholderTextColor="#94A3B8"
                            value={categorySearchQuery}
                            onChangeText={setCategorySearchQuery}
                          />
                          <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>
                            Selected: {fCategories.length}/10 (minimum 3 required)
                          </Text>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}>
                          {filteredCategoriesForWizard.map((cat) => {
                            const isSelected = fCategories.includes(cat);
                            return (
                              <TouchableOpacity
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
                              </TouchableOpacity>
                            );
                          })}

                          {filteredCategoriesForWizard.length === 0 && categorySearchQuery.trim() !== '' && (
                            <TouchableOpacity
                              style={styles.addCustomCategoryItemBtn}
                              onPress={handleAddCustomCategory}
                            >
                              <Text style={styles.addCustomCategoryItemText}>
                                + Create Custom Tag "{categorySearchQuery.trim()}"
                              </Text>
                            </TouchableOpacity>
                          )}
                        </ScrollView>

                        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#26334D' }}>
                          <TouchableOpacity
                            style={styles.saveAccountSettingsBtn}
                            onPress={() => setCategoryPickerModalVisible(false)}
                          >
                            <Text style={styles.submitBtnText}>Done ({fCategories.length} selected)</Text>
                          </TouchableOpacity>
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
                  <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 6 }}>
                    This shows under the images on the Case Study tab. Select text, then tap a style to apply it.
                  </Text>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: 'H1', markup: '# ', mode: 'prefix' },
                      { label: 'H2', markup: '## ', mode: 'prefix' },
                      { label: 'B', markup: '**', mode: 'wrap' },
                      { label: 'I', markup: '*', mode: 'wrap' },
                      { label: 'U', markup: '__', mode: 'wrap' }
                    ].map((btn) => (
                      <TouchableOpacity
                        key={btn.label}
                        style={{ backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}
                        onPress={() => {
                          const { start, end } = longDescSelection;
                          if (btn.mode === 'prefix') {
                            const lineStart = fLongDescription.lastIndexOf('\n', start - 1) + 1;
                            const updated = fLongDescription.slice(0, lineStart) + btn.markup + fLongDescription.slice(lineStart);
                            setFLongDescription(updated);
                          } else {
                            const selectedText = fLongDescription.slice(start, end);
                            const updated =
                              fLongDescription.slice(0, start) +
                              btn.markup + selectedText + btn.markup +
                              fLongDescription.slice(end);
                            setFLongDescription(updated);
                          }
                        }}
                      >
                        <Text style={{
                          color: '#C084FC',
                          fontWeight: '800',
                          fontStyle: btn.label === 'I' ? 'italic' : 'normal',
                          textDecorationLine: btn.label === 'U' ? 'underline' : 'none'
                        }}>{btn.label}</Text>
                      </TouchableOpacity>
                    ))}

                    <TouchableOpacity
                      style={{ padding: 4, marginLeft: 'auto' }}
                      onPress={() => setDescEditorMode(descEditorMode === 'edit' ? 'preview' : 'edit')}
                    >
                      <Text style={{ color: '#C084FC', fontSize: 12, fontWeight: '700' }}>
                        {descEditorMode === 'edit' ? 'Preview' : 'Edit'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ padding: 4 }}
                      onPress={() => setFullscreenDescEditorVisible(true)}
                    >
                      <ExpandIconSVG size={16} />
                    </TouchableOpacity>
                  </View>

                  {descEditorMode === 'preview' ? (
                    <View style={[styles.formInput, { height: 140, paddingVertical: 10 }]}>
                      <ScrollView>
                        {fLongDescription.trim() ? (
                          renderFormattedDescription(fLongDescription)
                        ) : (
                          <Text style={{ color: '#64748B', fontSize: 12 }}>Nothing written yet.</Text>
                        )}
                      </ScrollView>
                    </View>
                  ) : (
                    <FocusableTextInput
                      style={[styles.formInput, { height: 140, textAlignVertical: 'top' }]}
                      multiline
                      placeholder="Write the full case study here. Select text and use the buttons above to format it..."
                      placeholderTextColor="#94A3B8"
                      value={fLongDescription}
                      onChangeText={setFLongDescription}
                      onSelectionChange={(e) => setLongDescSelection(e.nativeEvent.selection)}
                      dataDetectorTypes="none"
                      autoCorrect={false}
                    />
                  )}
                </View>
              )}

              <Modal
                animationType="slide"
                transparent={false}
                visible={fullscreenDescEditorVisible}
                onRequestClose={() => setFullscreenDescEditorVisible(false)}
              >
                <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0F17' }}>
                  <View style={[styles.modalTopBar, { justifyContent: 'space-between' }]}>
                    <Text style={styles.modalTopTitle}>Detailed Description</Text>
                    <TouchableOpacity
                      style={[styles.saveAccountSettingsBtn, { paddingHorizontal: 18, paddingVertical: 8, marginTop: 0 }]}
                      onPress={() => setFullscreenDescEditorVisible(false)}
                    >
                      <Text style={styles.submitBtnText}>Done</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', backgroundColor: '#0B0F17', paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.topCategoryChip, descEditorMode === 'edit' && styles.topCategoryChipActive]}
                      onPress={() => setDescEditorMode('edit')}
                    >
                      <Text style={[styles.topCategoryText, descEditorMode === 'edit' && styles.topCategoryTextActive]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.topCategoryChip, descEditorMode === 'preview' && styles.topCategoryChipActive]}
                      onPress={() => setDescEditorMode('preview')}
                    >
                      <Text style={[styles.topCategoryText, descEditorMode === 'preview' && styles.topCategoryTextActive]}>Preview</Text>
                    </TouchableOpacity>
                  </View>

                  {descEditorMode === 'preview' ? (
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                      {fLongDescription.trim() ? (
                        renderFormattedDescription(fLongDescription)
                      ) : (
                        <Text style={{ color: '#64748B', fontSize: 13 }}>Nothing written yet - switch to Edit to start.</Text>
                      )}
                    </ScrollView>
                  ) : (
                    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                      <FocusableTextInput
                        style={{ flex: 1, color: '#F8FAFC', fontSize: 15, lineHeight: 22, padding: 16, textAlignVertical: 'top' }}
                        multiline
                        placeholder="Write the full case study here. Select text, switch to Edit toolbar below to format it..."
                        placeholderTextColor="#94A3B8"
                        value={fLongDescription}
                        onChangeText={setFLongDescription}
                        onSelectionChange={(e) => setLongDescSelection(e.nativeEvent.selection)}
                        dataDetectorTypes="none"
                        autoCorrect={false}
                        autoFocus
                      />

                      {/* Toolbar pinned above the keyboard instead of at the top of the screen -
                          keeps it spatially separated from Android's native text-selection popup,
                          which appears near whatever text you've selected higher up. */}
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', padding: 12, borderTopWidth: 1, borderTopColor: '#26334D', backgroundColor: '#151D2A' }}>
                        {[
                          { label: 'H1', markup: '# ', mode: 'prefix' },
                          { label: 'H2', markup: '## ', mode: 'prefix' },
                          { label: 'B', markup: '**', mode: 'wrap' },
                          { label: 'I', markup: '*', mode: 'wrap' },
                          { label: 'U', markup: '__', mode: 'wrap' }
                        ].map((btn) => (
                          <TouchableOpacity
                            key={btn.label}
                            style={{ backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}
                            onPress={() => {
                              const { start, end } = longDescSelection;
                              if (btn.mode === 'prefix') {
                                const lineStart = fLongDescription.lastIndexOf('\n', start - 1) + 1;
                                const updated = fLongDescription.slice(0, lineStart) + btn.markup + fLongDescription.slice(lineStart);
                                setFLongDescription(updated);
                              } else {
                                const selectedText = fLongDescription.slice(start, end);
                                const updated =
                                  fLongDescription.slice(0, start) +
                                  btn.markup + selectedText + btn.markup +
                                  fLongDescription.slice(end);
                                setFLongDescription(updated);
                              }
                            }}
                          >
                            <Text style={{
                              color: '#C084FC',
                              fontWeight: '800',
                              fontSize: 15,
                              fontStyle: btn.label === 'I' ? 'italic' : 'normal',
                              textDecorationLine: btn.label === 'U' ? 'underline' : 'none'
                            }}>{btn.label}</Text>
                          </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                          style={{ marginLeft: 'auto', padding: 4, alignSelf: 'center' }}
                          onPress={() => setFullscreenDescEditorVisible(false)}
                        >
                          <CollapseIconSVG size={16} />
                        </TouchableOpacity>
                      </View>
                    </KeyboardAvoidingView>
                  )}
                </SafeAreaView>
              </Modal>

              {formStep === 2 && (
                <View>
                  <Text style={styles.stepSectionTitle}>2. Prototype & Design Links (Optional)</Text>

                  <View style={styles.warningNoteBox}>
                    <View style={styles.iconTextInlineRow}>
                      <WarningTriangleSVG />
                      <Text style={styles.warningTitle}>Prototype Compatibility Note</Text>
                    </View>
                    <Text style={styles.warningText}>
                      Embedded prototype viewports currently support Figma share/embed links. All fields in this step are optional.
                    </Text>
                  </View>

                  <Text style={styles.formGroupLabel}>Figma Mobile Prototype Share Link</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/proto/..."
                    placeholderTextColor="#94A3B8"
                    value={fFigmaProto}
                    onChangeText={setFFigmaProto}
                  />

                  <Text style={styles.formGroupLabel}>Figma Desktop Prototype Share Link</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/proto/... (1440px canvas)"
                    placeholderTextColor="#94A3B8"
                    value={fDesktopProto}
                    onChangeText={setFDesktopProto}
                  />

                  <Text style={styles.formGroupLabel}>Figma Design File Canvas Link (Inspect Mode)</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/design/..."
                    placeholderTextColor="#94A3B8"
                    value={fFigmaFile}
                    onChangeText={setFFigmaFile}
                  />

                  <Text style={styles.formGroupLabel}>Figma Profile Link</Text>
                  <FocusableTextInput
                    style={styles.formInput}
                    placeholder="https://www.figma.com/@username"
                    placeholderTextColor="#94A3B8"
                    value={fFigmaProfile}
                    onChangeText={setFFigmaProfile}
                  />

                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}
                    onPress={() => setFHasLiveLink(!fHasLiveLink)}
                  >
                    <View style={{
                      width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                      borderColor: fHasLiveLink ? '#8B5CF6' : '#26334D',
                      backgroundColor: fHasLiveLink ? '#8B5CF6' : 'transparent',
                      alignItems: 'center', justifyContent: 'center'
                    }}>
                      {fHasLiveLink && <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>✓</Text>}
                    </View>
                    <Text style={{ color: '#F8FAFC', fontSize: 13, fontWeight: '700', flex: 1 }}>
                      I have a live website, app, or program to link
                    </Text>
                  </TouchableOpacity>

                  {fHasLiveLink && (
                    <View style={{ marginTop: 10 }}>
                      {fLiveLinks.map((link, idx) => (
                        <View key={idx} style={{ backgroundColor: '#151D2A', borderRadius: 12, borderWidth: 1, borderColor: '#26334D', padding: 12, marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={[styles.formGroupLabel, { marginTop: 0 }]}>Link {idx + 1}</Text>
                            {fLiveLinks.length > 1 && (
                              <TouchableOpacity
                                onPress={() => setFLiveLinks(fLiveLinks.filter((_, i) => i !== idx))}
                              >
                                <TrashIconSVG />
                              </TouchableOpacity>
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
                          <FocusableTextInput
                            style={styles.formInput}
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
                      ))}

                      {fLiveLinks.length < 5 && (
                        <TouchableOpacity
                          style={styles.addMoreVideoBtn}
                          onPress={() => setFLiveLinks([...fLiveLinks, { label: '', url: '' }])}
                        >
                          <Text style={styles.addMoreVideoText}>+ Add Another Link ({fLiveLinks.length}/5)</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              )}

              {formStep === 3 && (
                <View>
                  <Text style={styles.stepSectionTitle}>3. Media, Local Uploads & Video Demos</Text>

                  <Text style={styles.formGroupLabel}>Cover Thumbnail Photo * (Big Rectangle)</Text>
                  <TouchableOpacity
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
                  </TouchableOpacity>
                  {errors.fCover ? <Text style={styles.errorText}>{errors.fCover}</Text> : null}

                  <Text style={[styles.formGroupLabel, { marginTop: 20 }]}>
                    Picture Showcase Highlights * (At least 2 required, up to 10)
                  </Text>
                  <View style={styles.smallSquaresGrid}>
                    {fShowcaseImages.filter((img) => img.trim() !== '').map((imgUri, index) => (
                      <View key={index} style={styles.squarePickerWrapper}>
                        <View style={[styles.smallSquarePicker, errors.showcaseImages && styles.inputErrorBorder]}>
                          <Image source={{ uri: imgUri }} style={styles.smallSquarePreview} />
                        </View>

                        {fShowcaseImages.filter((img) => img.trim() !== '').length > 2 && (
                          <TouchableOpacity
                            style={[styles.removeImageBadge, { width: 22, height: 22, borderRadius: 11 }]}
                            onPress={() => handleRemoveShowcaseImage(index)}
                          >
                            <DashCircleIconSVG size={14} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>

                  {fShowcaseImages.filter((img) => img.trim() !== '').length < 10 && (
                    <TouchableOpacity style={styles.addMoreVideoBtn} onPress={pickMultipleShowcaseImages}>
                      <Text style={styles.addMoreVideoText}>
                        + Pick Showcase Images ({fShowcaseImages.filter((img) => img.trim() !== '').length}/10) \u2014 select multiple at once
                      </Text>
                    </TouchableOpacity>
                  )}
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
                        <TouchableOpacity
                          style={styles.removeVideoBtn}
                          onPress={() => handleRemoveVideoLink(idx)}
                        >
                          <TrashIconSVG />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addMoreVideoBtn} onPress={handleAddMoreVideo}>
                    <Text style={styles.addMoreVideoText}>+ Add More Video Links</Text>
                  </TouchableOpacity>
                </View>
              )}

              {formStep === 4 && (
                <View>
                  <Text style={styles.stepSectionTitle}>4. Confirm & Post Package</Text>

                  <View style={styles.confirmReviewCard}>
                    {fCover ? <Image source={{ uri: fCover }} style={styles.reviewCover} /> : null}
                    <Text style={styles.reviewTitle}>{fTitle}</Text>
                    <Text style={styles.reviewDesigner}>By {userProfile.name}</Text>
                    <Text style={styles.reviewCategory}>Categories: {fCategories.join(', ')}</Text>
                    <Text style={styles.reviewBrief}>{fBrief}</Text>

                    <View style={styles.reviewSummaryRow}>
                      <Text style={styles.reviewStat}>Mobile Proto: <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>{fFigmaProto ? 'Attached' : 'None'}</Text></Text>
                      <Text style={styles.reviewStat}>Desktop Proto: <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>{fDesktopProto ? 'Attached' : 'None'}</Text></Text>
                      <Text style={styles.reviewStat}>Showcase Images: <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>{fShowcaseImages.filter(v => v.trim()).length}</Text> Picked</Text>
                      <Text style={styles.reviewStat}>Video Demos: <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>{fVideoLinks.filter(v => v.trim()).length}</Text> Attached</Text>
                    </View>
                  </View>
                </View>
              )}

            </KeyboardAwareScrollView>

            <View style={styles.stickyWizardBottomBar}>
              {formStep > 1 && (
                <TouchableOpacity style={styles.uniformWizardBtnBack} onPress={() => setFormStep(formStep - 1)}>
                  <View style={styles.iconTextInlineRow}>
                    <ChevronLeftSVG color="#94A3B8" size={16} />
                    <Text style={styles.backBtnText}>Back</Text>
                  </View>
                </TouchableOpacity>
              )}

              {formStep === 2 && (
                <TouchableOpacity style={styles.uniformWizardBtnSkip} onPress={() => handleNextFromStep2(true)}>
                  <Text style={styles.skipBtnText}>Skip Step</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.uniformWizardBtnPrimary}
                onPress={() => {
                  if (formStep === 1) handleNextFromStep1();
                  else if (formStep === 2) handleNextFromStep2(false);
                  else if (formStep === 3) handleNextFromStep3();
                  else if (formStep === 4) handleFinalPostPackage();
                }}
              >
                <View style={styles.iconTextInlineRow}>
                  <Text style={styles.submitBtnText}>
                    {formStep === 1 ? 'Next: Add Links' :
                     formStep === 2 ? 'Next: Media' :
                     formStep === 3 ? 'Review & Confirm' :
                     editingProjectId ? 'Update Portfolio Package' : 'Post Portfolio Package'}
                  </Text>
                  <ChevronRightSVG color="#FFFFFF" size={18} />
                </View>
              </TouchableOpacity>
            </View>
        </SafeAreaView>
      </Modal>

      {/* Native Fullscreen Showcase Modal with Sticky Title Bar and Jump-to-Top Button */}
      {activeProject && (
        <Modal
          animationType="slide"
          transparent={false}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalTopBar}>
              <View style={styles.leftAlignedEngagementStatsRow}>
                <TouchableOpacity style={styles.statInlinePill} onPress={() => toggleLike(activeProject.id)}>
                  <HeartIconSVG liked={activeProject.liked} />
                  <Text style={styles.statInlineNumText}>{activeProject.likesCount || 1}</Text>
                </TouchableOpacity>

                <View style={styles.statInlinePill}>
                  <EyeViewIconSVG />
                  <Text style={styles.statInlineNumText}>{activeProject.visitsCount || 120}</Text>
                </View>
              </View>

              {session && activeProject.ownerId === session.user.id && (
                <View style={styles.ownerActionsRow}>
                  <TouchableOpacity
                    style={styles.ownerIconBtn}
                    onPress={() => openEditWizard(activeProject)}
                  >
                    <EditIconSVG />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.ownerIconBtn}
                    onPress={() => promptDeletePortfolio(activeProject)}
                  >
                    <TrashIconSVG />
                  </TouchableOpacity>
                </View>
              )}

              {session && activeProject.ownerId && activeProject.ownerId !== session.user.id && (
                <TouchableOpacity
                  style={styles.ownerIconBtn}
                  onPress={() => {
                    showAppAlert(activeProject.designer, 'What would you like to do?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Report Portfolio', onPress: () => handleReportContent('portfolio', activeProject.id, 'this portfolio') },
                      { text: 'Block User', style: 'destructive', onPress: () => handleBlockUser(activeProject.ownerId, activeProject.designer) }
                    ]);
                  }}
                >
                  <Text style={{ color: '#94A3B8', fontSize: 20, fontWeight: '900', lineHeight: 20 }}>⋯</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Sticky Portfolio Title Bar directly under top bar */}
            <View style={styles.stickyModalTitleBar}>
              <Text style={styles.stickyModalTitleText} numberOfLines={1}>
                {activeProject.title}
              </Text>
            </View>

            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'case' && styles.tabBtnActive]}
                onPress={() => setActiveTab('case')}
              >
                <Text style={[styles.tabBtnText, activeTab === 'case' && styles.tabBtnTextActive]}>
                  Case Study
                </Text>
              </TouchableOpacity>

              {activeProject.figmaProto ? (
                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'mobile' && styles.tabBtnActive]}
                  onPress={() => { setActiveTab('mobile'); setLoadingWebView(true); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <FigmaLogoSVG />
                    <Text style={[styles.tabBtnText, activeTab === 'mobile' && styles.tabBtnTextActive]}>
                      Mobile Proto
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              {activeProject.desktopProto ? (
                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'desktop' && styles.tabBtnActive]}
                  onPress={() => { setActiveTab('desktop'); setLoadingWebView(true); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <FigmaLogoSVG />
                    <Text style={[styles.tabBtnText, activeTab === 'desktop' && styles.tabBtnTextActive]}>
                      Desktop Proto
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.modalBody}>
              {activeTab === 'mobile' || activeTab === 'desktop' ? (
                <View style={styles.webViewWrapper}>
                  {loadingWebView && (
                    <View style={styles.loaderOverlay}>
                      <ActivityIndicator size="large" color="#8B5CF6" />
                      <Text style={styles.loaderText}>Loading Figma Prototype...</Text>
                    </View>
                  )}
                  <WebView
                    source={{
                      uri: getFigmaEmbedUrl(
                        activeTab === 'desktop'
                          ? activeProject.desktopProto
                          : activeProject.figmaProto
                      )
                    }}
                    style={styles.webView}
                    onLoadEnd={() => setLoadingWebView(false)}
                    onShouldStartLoadWithRequest={handleWebViewNavigation}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                  />
                </View>
              ) : (
                <ScrollView
                  ref={modalScrollViewRef}
                  style={styles.caseScrollView}
                  contentContainerStyle={[styles.caseContent, { paddingBottom: 110 }]}
                  onScroll={handleModalScroll}
                  scrollEventThrottle={16}
                >
                  {/* Designer Row with Right-Aligned Follow/Following Button */}
                  <View style={styles.designerRowModal}>
                    <TouchableOpacity
                      style={styles.designerRowModalLeftCol}
                      activeOpacity={0.7}
                      onPress={() => openDesignerProfileByName(activeProject.designer)}
                    >
                      <Image
                        source={{ uri: activeProject.designerAvatar }}
                        style={styles.designerAvatarModal}
                      />
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.caseDesigner}>By {activeProject.designer}</Text>
                        <Text style={styles.caseDesignerRole}>{getDesignerRole(activeProject.designer)}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Follow/Following Button Aligned Right */}
                    {activeProject.designer.toLowerCase() !== userProfile.name.toLowerCase() && (
                      <TouchableOpacity
                        style={[
                          styles.modalDesignerFollowBtnRight,
                          followedDesigners.includes(activeProject.designer) && styles.modalDesignerFollowBtnRightActive
                        ]}
                        onPress={() => toggleFollowDesigner(activeProject.designer)}
                      >
                        <Text style={[
                          styles.modalDesignerFollowTextRight,
                          followedDesigners.includes(activeProject.designer) && styles.modalDesignerFollowTextRightActive
                        ]}>
                          {followedDesigners.includes(activeProject.designer) ? 'Following' : (activeProject.followsMe ? 'Follow Back' : '+ Follow')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* ONLY Show Figma Design Canvas Link If Included by User */}
                  {activeProject.figmaFile && activeProject.figmaFile.trim() !== '' ? (
                    <View style={styles.chipRow}>
                      <TouchableOpacity
                        style={styles.linkChip}
                        onPress={() => openExternalLinkWithWarning(activeProject.figmaFile)}
                      >
                        <Text style={styles.linkChipText}>❖ Open Figma Design Canvas ↗</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {activeProject.liveLinks && activeProject.liveLinks.length > 0 && (
                    <View style={{ gap: 8, marginBottom: 16 }}>
                      {activeProject.liveLinks.map((link, idx) => (
                        link.url && link.url.trim() !== '' ? (
                          <TouchableOpacity
                            key={idx}
                            style={{
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                              backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 13
                            }}
                            onPress={() => openExternalLinkWithWarning(link.url)}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                              {link.label && link.label.trim() !== '' ? link.label : 'Visit Live Link'}
                            </Text>
                            <ExternalLinkSVG color="#FFFFFF" size={15} />
                          </TouchableOpacity>
                        ) : null
                      ))}
                    </View>
                  )}

                  <View style={styles.briefBox}>
                    <Text style={styles.briefText}>{activeProject.brief}</Text>
                  </View>

                  {activeProject.categories && activeProject.categories.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                      {activeProject.categories.map((cat, idx) => (
                        <View key={idx} style={{ backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 }}>
                          <Text style={{ color: '#C084FC', fontSize: 11, fontWeight: '600' }}>{cat}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={styles.sectionHeader}>UI SCREENSHOTS & HIGHLIGHTS</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
                    {activeProject.images.map((imgUrl, index) => (
                      <Image key={index} source={{ uri: imgUrl }} style={styles.galleryImage} />
                    ))}
                  </ScrollView>

                  <Text style={styles.sectionHeader}>CASE STUDY OVERVIEW</Text>
                  {activeProject.longDescription && activeProject.longDescription.trim() ? (
                    <View>{renderFormattedDescription(activeProject.longDescription)}</View>
                  ) : (
                    <Text style={styles.caseBodyText}>{activeProject.brief}</Text>
                  )}
                </ScrollView>
              )}

              {/* Showcase Jump To Top Floating Button (On Top of Sticky Like Button, Shows on Scroll) */}
              {showModalBackToTop && (
                <TouchableOpacity
                  style={styles.stickyModalBackToTopBtn}
                  activeOpacity={0.85}
                  onPress={scrollModalToTop}
                >
                  <ChevronUpSVG />
                </TouchableOpacity>
              )}

              {/* Floating Circle Like Button (Full Opacity Container, Only Heart Icon Turns Red) */}
              <TouchableOpacity
                style={styles.floatingLikeCircleBtn}
                activeOpacity={0.88}
                onPress={() => toggleLike(activeProject.id)}
              >
                <HeartIconSVG liked={activeProject.liked} />
              </TouchableOpacity>

            </View>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10
  },
  donateSettingBtnText: {
    color: '#0B0F17',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26334D',
    alignItems: 'center'
  },
  donateTierChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#F59E0B'
  },
  donateTierText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700'
  },
  donateTierTextActive: {
    color: '#F59E0B',
    fontSize: 16,
    fontWeight: '700'
  },
  donateTierSub: {
    color: '#94A3B8',
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  contrastDonateBtnText: {
    color: '#0B0F17',
    fontSize: 15,
    fontWeight: '700'
  },
  knownContactBox: {
    padding: 14,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26334D',
    marginBottom: 10
  },
  knownContactTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600'
  },
  knownContactEmail: {
    color: '#C084FC',
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
    borderTopColor: '#26334D',
    marginTop: 10
  },

  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#26334D',
    backgroundColor: '#0B0F17',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoText: { fontSize: 18, fontWeight: '800', color: '#8B5CF6' },
  versionBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)'
  },
  versionText: { color: '#C084FC', fontSize: 11, fontWeight: '700' },
  headerRightActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center' },
  headerIconBtnWithBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  unreadRedBadgeDot: { position: 'absolute', bottom: 2, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#0B0F17' },

  notificationCard: { backgroundColor: '#0B0F17', borderRadius: 14, borderWidth: 1, borderColor: '#26334D', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#26334D' },
  notifText: { color: '#CBD5E1', fontSize: 13, lineHeight: 18 },
  notifUserBold: { color: '#F8FAFC', fontWeight: '800' },
  notifTargetBold: { color: '#C084FC', fontWeight: '700' },
  notifTimeText: { color: '#94A3B8', fontSize: 11, marginTop: 3 },
  notifTypeIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center' },

  notifFollowBackBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  notifFollowBackBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#8B5CF6' },
  notifFollowBackText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  notifFollowBackTextActive: { color: '#C084FC' },

  mainViewContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 110 },
  hero: { marginBottom: 16, alignItems: 'center' },
  heroBadge: {
    color: '#C084FC',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#F8FAFC', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  
  pageHeaderBox: { marginBottom: 12 },
  pageHeaderTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 },
  pageHeaderSubtitle: { fontSize: 13, color: '#94A3B8' },

  iconTextInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  inputWithClearRow: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  clearFieldBtn: { position: 'absolute', right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center', zIndex: 10 },

  storiesBarScroll: { flexDirection: 'row', marginBottom: 20 },
  storyCircleWrapper: { alignItems: 'center', marginRight: 14, width: 62 },
  storyRing: {
    width: 58, height: 58, borderRadius: 29, padding: 2.5,
    borderWidth: 2, borderColor: '#26334D', backgroundColor: '#0B0F17'
  },
  storyRingActive: { borderColor: '#8B5CF6' },
  storyAvatar: { width: '100%', height: '100%', borderRadius: 26 },
  storyNameText: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  storyNameTextActive: { color: '#C084FC', fontWeight: '800' },

  topCategoryBarWrapper: { marginBottom: 20 },
  topCategoryScrollView: { flexDirection: 'row' },
  topCategoryChip: {
    backgroundColor: '#151D2A', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 99, borderWidth: 1, borderColor: '#26334D', marginRight: 8
  },
  topCategoryChipActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  topCategoryText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  topCategoryTextActive: { color: '#FFFFFF', fontWeight: '700' },
  grid2x2CategoryBtn: {
    backgroundColor: '#8B5CF6', width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 16
  },

  categorySearchInput: {
    backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, color: '#F8FAFC', fontSize: 13, marginBottom: 10
  },
  selectedCategoriesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  selectedCategoryPill: {
    backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99
  },
  selectedCategoryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  categoryVerticalListContainer: {
    backgroundColor: '#151D2A', borderRadius: 12, borderWidth: 1, borderColor: '#26334D', padding: 8, marginBottom: 14
  },
  categoryVerticalItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#26334D' },
  categoryVerticalItemActive: { backgroundColor: 'rgba(139, 92, 246, 0.2)' },
  categoryVerticalText: { color: '#CBD5E1', fontSize: 13, fontWeight: '600' },
  categoryVerticalTextActive: { color: '#C084FC', fontWeight: '800' },
  addCustomCategoryItemBtn: { paddingVertical: 12, alignItems: 'center', backgroundColor: '#0B0F17', borderRadius: 8, marginTop: 4 },
  addCustomCategoryItemText: { color: '#8B5CF6', fontSize: 12, fontWeight: '700' },
  moreCategoriesChip: { backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99 },
  moreCategoriesText: { color: '#C084FC', fontSize: 11, fontWeight: '700' },

  leftAlignedEngagementStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statInlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0B0F17', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#26334D' },
  statInlineNumText: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },

  stickyModalTitleBar: {
    backgroundColor: '#151D2A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#26334D',
    alignItems: 'center'
  },
  stickyModalTitleText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800'
  },

  stickyModalBackToTopBtn: {
    position: 'absolute', bottom: 90, right: 20,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center',
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 6, zIndex: 99
  },

  floatingLikeCircleBtn: {
    position: 'absolute', bottom: 28, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D',
    alignItems: 'center', justifyContent: 'center',
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 10, zIndex: 99,
    opacity: 1
  },

  customConfirmCard: {
    backgroundColor: '#151D2A', borderRadius: 20, borderWidth: 1, borderColor: '#26334D',
    padding: 24, width: '100%', maxWidth: 340, alignItems: 'center'
  },
  confirmIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(239, 68, 68, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  successIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(16, 185, 129, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginBottom: 8, textAlign: 'center' },
  confirmSubText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  linkUrlBox: { backgroundColor: '#0B0F17', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#26334D', width: '100%', marginBottom: 20 },
  linkUrlText: { color: '#8B5CF6', fontSize: 12, textAlign: 'center', fontWeight: '600' },
  confirmActionsRow: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmCancelBtn: { flex: 1, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  confirmCancelText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  confirmDeleteBtn: { flex: 1, backgroundColor: '#8B5CF6', height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmDeleteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  overlayModalBg: { flex: 1, backgroundColor: 'rgba(11, 15, 23, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  overlayModalContainer: { backgroundColor: '#151D2A', borderRadius: 20, borderWidth: 1, borderColor: '#26334D', maxHeight: '85%', width: '100%', overflow: 'hidden' },
  accountSettingsScrollContent: { padding: 20, gap: 12 },
  saveAccountSettingsBtn: { backgroundColor: '#8B5CF6', height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },

  allCategoriesGrid: { padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  overlayCategoryCard: { width: '48%', backgroundColor: '#0B0F17', paddingVertical: 14, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: '#26334D', alignItems: 'center' },
  overlayCategoryCardActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  overlayCategoryText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700' },
  overlayCategoryTextActive: { color: '#FFFFFF' },

  stickyBackToTopBtn: {
    position: 'absolute', bottom: 100, right: 20, width: 42, height: 42,
    borderRadius: 21, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center',
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, zIndex: 99
  },

  emptyFollowedBox: { backgroundColor: '#151D2A', borderRadius: 16, borderWidth: 1, borderColor: '#26334D', padding: 24, alignItems: 'center', marginTop: 10 },
  emptyFollowedTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginBottom: 8, textAlign: 'center' },
  emptyFollowedSub: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  discoverDesignersBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  discoverBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  grid: { gap: 20 },
  card: {
    backgroundColor: '#151D2A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#26334D',
    overflow: 'hidden'
  },
  thumbnailContainer: { position: 'relative', width: '100%', height: 180, backgroundColor: '#070A10' },
  cardCover: { width: '100%', height: '100%' },
  prototypeBadgesRow: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8, zIndex: 10 },
  protoBadgeIconOnly: {
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    padding: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardBody: { padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', flex: 1, marginRight: 8 },
  likeButtonRightAligned: { padding: 4, alignSelf: 'flex-start' },
  cardDesc: { fontSize: 13, color: '#94A3B8', marginBottom: 16, lineHeight: 18 },
  
  designerRowWithFollow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#26334D', paddingTop: 12 },
  designerRowLeftCol: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  designerAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#26334D' },
  cardDesignerName: { color: '#C084FC', fontSize: 12, fontWeight: '600', flex: 1, flexWrap: 'wrap' },
  cardFollowBtnRight: { backgroundColor: '#8B5CF6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  cardFollowBtnRightActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#8B5CF6' },
  cardFollowBtnText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  cardFollowBtnTextActive: { color: '#C084FC' },

  profileTabsBar: {
    flexDirection: 'row', backgroundColor: '#151D2A', borderRadius: 12, padding: 4,
    marginVertical: 20, borderWidth: 1, borderColor: '#26334D', gap: 4
  },
  profileTabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  profileTabBtnActive: { backgroundColor: '#8B5CF6' },
  profileTabBtnText: { fontSize: 12, color: '#94A3B8', fontWeight: '700' },
  profileTabBtnTextActive: { color: '#FFFFFF' },

  twoRowContainer: { flexDirection: 'row', gap: 16 },
  twoRowColumn: { gap: 16 },
  emptyTabContainer: { paddingVertical: 24, alignItems: 'center' },

  floatingBottomBar: {
    position: 'absolute', bottom: 24, left: 20, right: 20, height: 64,
    backgroundColor: '#151D2A', borderRadius: 24, borderWidth: 1, borderColor: '#26334D',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 12, zIndex: 100
  },
  uniformTabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  menuLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  menuLabelActive: { color: '#8B5CF6', fontWeight: '700' },
  plusContainerBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#8B5CF6',
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 4,
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6
  },

  searchContainer: { marginBottom: 20 },
  searchInput: { backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#F8FAFC', fontSize: 14 },
  keywordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  keywordChip: { backgroundColor: '#151D2A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: '#26334D' },
  keywordText: { color: '#D8B4FE', fontSize: 12, fontWeight: '600' },
  designersList: { gap: 12 },
  designerItemCard: { backgroundColor: '#151D2A', borderRadius: 14, borderWidth: 1, borderColor: '#26334D', padding: 14, flexDirection: 'row', alignItems: 'center' },
  designerListAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  designerInfoCol: { flex: 1 },
  designerListName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC', marginBottom: 2 },
  designerListRole: { fontSize: 12, color: '#C084FC', fontWeight: '600', marginBottom: 2 },
  designerListLoc: { fontSize: 11, color: '#94A3B8' },
  emptySearchText: { color: '#94A3B8', fontSize: 13, marginTop: 20 },

  designerCardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  smallFollowBtn: { flex: 1, backgroundColor: '#8B5CF6', paddingVertical: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  smallFollowBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#8B5CF6' },
  smallFollowText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  smallFollowTextActive: { color: '#C084FC' },
  smallShareBtnIconOnly: { width: 32, height: 32, backgroundColor: '#0B0F17', borderRadius: 8, borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center' },

  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 14, backgroundColor: '#0B0F17', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, gap: 20, borderWidth: 1, borderColor: '#26334D' },
  statItem: { alignItems: 'center', paddingHorizontal: 12 },
  statNum: { fontSize: 16, fontWeight: '800', color: '#F8FAFC' },
  statLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: '#26334D' },

  designerProfileActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12, width: '100%', alignItems: 'center' },
  modalFollowBtn: { flex: 1, backgroundColor: '#8B5CF6', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalFollowBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#8B5CF6' },
  modalFollowText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalFollowTextActive: { color: '#C084FC' },
  modalShareBtnIconOnly: { width: 44, height: 44, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  categoryPillsRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  categoryPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D' },
  categoryPillActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  categoryPillText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  categoryPillTextActive: { color: '#FFFFFF' },

  profileCard: { backgroundColor: '#151D2A', borderRadius: 16, borderWidth: 1, borderColor: '#26334D', padding: 24, alignItems: 'center', position: 'relative' },
  profileTopRightShareBtn: { position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  profileLargeAvatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  profileName: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', marginBottom: 4, textAlign: 'center' },
  profileRole: { fontSize: 13, color: '#C084FC', fontWeight: '600', marginBottom: 2 },
  profileLocText: { fontSize: 12, color: '#94A3B8' },
  profileBio: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 8 },

  socialCircularLinksRow: { flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'center' },
  socialCircleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center' },
  socialCirclePreviewBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center' },

  avatarEditPickerBtn: { alignSelf: 'center', width: 90, height: 90, borderRadius: 45, overflow: 'hidden', position: 'relative', marginBottom: 10 },
  avatarEditPreview: { width: '100%', height: '100%' },
  avatarEditOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(11, 15, 23, 0.75)', paddingVertical: 4, alignItems: 'center' },
  avatarEditText: { color: '#C084FC', fontSize: 9, fontWeight: '700' },

  settingItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#26334D' },
  settingToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#26334D' },
  settingItemTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  settingItemSub: { color: '#94A3B8', fontSize: 11, marginTop: 2, lineHeight: 16 },
  settingItemValue: { color: '#C084FC', fontSize: 13, fontWeight: '600' },

  smallSquaresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  squarePickerWrapper: { position: 'relative' },
  removeImageBadge: { position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#EF4444', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  videoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  removeVideoBtn: { width: 42, height: 42, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#EF4444', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  ownerActionsRow: { flexDirection: 'row', gap: 8, marginRight: 10 },
  ownerIconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center' },

  stepProgressBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#151D2A',
    borderBottomWidth: 1, borderBottomColor: '#26334D'
  },
  stepProgressItem: { alignItems: 'center', gap: 4 },
  stepLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  stepLabelActive: { color: '#8B5CF6', fontWeight: '800' },
  stepDivider: { flex: 1, height: 1, backgroundColor: '#26334D', marginHorizontal: 6, marginBottom: 12 },
  stepSectionTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC', marginBottom: 16 },

  warningNoteBox: {
    backgroundColor: 'rgba(234, 179, 8, 0.12)', borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.3)',
    borderRadius: 10, padding: 12, marginBottom: 16
  },
  warningTitle: { color: '#FACC15', fontSize: 13, fontWeight: '700' },
  warningText: { color: '#CBD5E1', fontSize: 12, lineHeight: 18, marginTop: 4 },

  inputErrorBorder: { borderColor: '#EF4444' },
  errorText: { color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 4, marginBottom: 8 },

  bigRectanglePicker: {
    width: '100%', height: 140, backgroundColor: '#151D2A', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#26334D', borderStyle: 'dashed',
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center'
  },
  bigRectanglePreview: { width: '100%', height: '100%' },
  pickerPlaceholderCol: { alignItems: 'center', padding: 12, gap: 4 },
  pickerTextMain: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  pickerSubText: { color: '#94A3B8', fontSize: 11 },

  smallSquarePicker: {
    width: 80, height: 80, backgroundColor: '#151D2A', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#26334D', borderStyle: 'dashed',
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center'
  },
  smallSquarePreview: { width: '100%', height: '100%' },
  squarePickerText: { color: '#94A3B8', fontSize: 10, fontWeight: '600', marginTop: 2 },

  addMoreVideoBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)', borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)',
    paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4
  },
  addMoreVideoText: { color: '#D8B4FE', fontSize: 12, fontWeight: '700' },

  stickyWizardBottomBar: {
    height: 72,
    backgroundColor: '#151D2A', borderTopWidth: 1, borderTopColor: '#26334D',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10
  },
  uniformWizardBtnBack: {
    height: 44, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D',
    paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center'
  },
  uniformWizardBtnSkip: {
    height: 44, borderWidth: 1, borderColor: '#8B5CF6',
    paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center'
  },
  uniformWizardBtnPrimary: {
    height: 44, backgroundColor: '#8B5CF6', flex: 1,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center'
  },
  backBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  skipBtnText: { color: '#C084FC', fontSize: 13, fontWeight: '700' },
  submitBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  confirmReviewCard: {
    backgroundColor: '#151D2A', borderRadius: 14, borderWidth: 1, borderColor: '#26334D',
    padding: 16, marginBottom: 16
  },
  reviewCover: { width: '100%', height: 160, borderRadius: 10, marginBottom: 12 },
  reviewTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginBottom: 2 },
  reviewDesigner: { fontSize: 12, color: '#C084FC', fontWeight: '600', marginBottom: 8 },
  reviewCategory: { fontSize: 12, color: '#94A3B8', marginBottom: 8 },
  reviewBrief: { fontSize: 13, color: '#CBD5E1', lineHeight: 18, marginBottom: 14 },
  reviewSummaryRow: { borderTopWidth: 1, borderTopColor: '#26334D', paddingTop: 10, gap: 4 },
  reviewStat: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },

  modalContainer: { flex: 1, backgroundColor: '#0B0F17' },
  modalTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#26334D', backgroundColor: '#151D2A' },
  modalTopTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0B0F17', borderWidth: 1, borderColor: '#26334D', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: '#151D2A', padding: 6, marginHorizontal: 16, marginVertical: 10, borderRadius: 12, gap: 6 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#8B5CF6' },
  tabBtnText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  tabBtnTextActive: { color: '#FFF' },
  modalBody: { flex: 1 },
  webViewWrapper: { flex: 1, position: 'relative' },
  webView: { flex: 1, backgroundColor: '#000' },
  loaderOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0B0F17', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  loaderText: { color: '#94A3B8', fontSize: 13, marginTop: 12, fontWeight: '600' },
  caseScrollView: { flex: 1 },
  caseContent: { padding: 20 },
  caseTitle: { fontSize: 22, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 },
  designerRowModal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  designerRowModalLeftCol: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  designerAvatarModal: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#26334D' },
  caseDesigner: { fontSize: 14, color: '#C084FC', fontWeight: '700' },
  caseDesignerRole: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  modalDesignerFollowBtnRight: { backgroundColor: '#8B5CF6', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  modalDesignerFollowBtnRightActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#8B5CF6' },
  modalDesignerFollowTextRight: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  modalDesignerFollowTextRightActive: { color: '#C084FC' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  linkChip: { backgroundColor: '#151D2A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#26334D' },
  linkChipText: { color: '#D8B4FE', fontSize: 12, fontWeight: '600' },
  briefBox: { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderLeftWidth: 4, borderLeftColor: '#8B5CF6', padding: 14, borderRadius: 8, marginBottom: 20 },
  briefText: { color: '#F8FAFC', fontSize: 14, lineHeight: 20 },
  sectionHeader: { fontSize: 12, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, marginBottom: 12, marginTop: 10 },
  galleryScroll: { marginBottom: 24 },
  galleryImage: { width: 200, height: 320, borderRadius: 12, marginRight: 12 },
  caseBodyText: { color: '#94A3B8', fontSize: 14, lineHeight: 22 },
  formGroupLabel: { fontSize: 13, fontWeight: '700', color: '#F8FAFC', marginBottom: 6, marginTop: 12 },
  formInput: { backgroundColor: '#151D2A', borderWidth: 1, borderColor: '#26334D', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#F8FAFC', fontSize: 13 }
});

// Wrapping with Sentry gives automatic crash reporting and a basic
// performance trace for the whole app, on top of the manual error
// logging already scattered through the code via console.warn.
export default Sentry.wrap(App);
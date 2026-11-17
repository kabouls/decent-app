import React from 'react';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { SKY_800_2, TEXT_SECONDARY, DANGER, WHITE } from '../theme/tokens.js';

const EyeViewIconSVG = React.memo(({ size = 18, color = TEXT_SECONDARY }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2"/>
  </Svg>
));

const ChevronLeftSVG = React.memo(({ color = TEXT_SECONDARY, size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const CrossIconSVG = React.memo(({ color = TEXT_SECONDARY, size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
));

const LocationPinSVG = React.memo(({ color = TEXT_SECONDARY }) => (
  <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="12" cy="9" r="2.5" stroke={color} strokeWidth="2"/>
  </Svg>
));

const WarningTriangleSVG = React.memo(() => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path d="M10.29 3.86L1.82 18C1.64537 18.3024 1.55296 18.6453 1.55199 18.9945C1.55103 19.3437 1.64154 19.6874 1.81445 19.991C1.98737 20.2946 2.23652 20.5478 2.53684 20.7252C2.83716 20.9026 3.1783 20.9981 3.52 21H20.48C20.8217 20.9981 21.1628 20.9026 21.4632 20.7252C21.7635 20.5478 22.0126 20.2946 22.1855 19.991C22.3585 19.6874 22.449 19.3437 22.448 18.9945C22.447 18.6453 22.3546 18.3024 22.18 18L13.71 3.86C13.5317 3.56613 13.2807 3.32314 12.9812 3.15448C12.6817 2.98582 12.3437 2.89746 12 2.89746C11.6563 2.89746 11.3183 2.98582 11.0188 3.15448C10.7193 3.32314 10.4683 3.56613 10.29 3.86Z" stroke={DANGER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M12 9V13" stroke={DANGER} strokeWidth="2" strokeLinecap="round"/>
    <Path d="M12 17H12.01" stroke={DANGER} strokeWidth="2" strokeLinecap="round"/>
  </Svg>
));

const LockIconSVG = React.memo(({ color = SKY_800_2, size = 13 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="2" />
    <Path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const DownloadIconSVG = React.memo(({ color = WHITE, size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3v12M7 10l5 5 5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M4 19h16" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
));

const CheckIconSVG = React.memo(({ color = WHITE }) => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </Svg>
));

const GlobeIconSVG = React.memo(({ color = TEXT_SECONDARY }) => (
  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <Path d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" stroke={color} strokeWidth="2" />
  </Svg>
));

export { ChevronLeftSVG, CrossIconSVG, CheckIconSVG, LockIconSVG, DownloadIconSVG, EyeViewIconSVG, GlobeIconSVG, LocationPinSVG, WarningTriangleSVG };

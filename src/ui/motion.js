import React, { useState, useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// avoiding a loading gate on every app launch.
const ReduceMotionContext = React.createContext(false);

const useReduceMotion = () => React.useContext(ReduceMotionContext);

const ReduceMotionProvider = ({ children }) => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return; // AccessibilityInfo.isReduceMotionEnabled is native-only
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <ReduceMotionContext.Provider value={reduceMotion}>
      {children}
    </ReduceMotionContext.Provider>
  );
};

export { ReduceMotionContext, useReduceMotion, ReduceMotionProvider };

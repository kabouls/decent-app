import React, { useRef } from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import { useReduceMotion } from './motion';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// transparent swap wherever it's used.
const BouncyButton = React.memo(({ style, onPressIn, onPressOut, children, ...rest }) => {
  const bounceScale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  const handlePressIn = (e) => {
    if (!reduceMotion) {
      Animated.spring(bounceScale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
    }
    if (onPressIn) onPressIn(e);
  };
  const handlePressOut = (e) => {
    if (!reduceMotion) {
      Animated.spring(bounceScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
    }
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

export { BouncyButton, AnimatedTouchableOpacity };

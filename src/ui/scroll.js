import { useEffect } from 'react';
import { Platform } from 'react-native';

// the same fix, not one shared element.
const useHideScrollbarOnWeb = (ref, enabled) => {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current?.getScrollableNode?.();
    if (!node) return;
    if (enabled) {
      node.style.scrollbarWidth = 'none';
      node.classList.add('decent-hide-scrollbar');
    } else {
      node.style.scrollbarWidth = '';
      node.classList.remove('decent-hide-scrollbar');
    }
  }, [enabled, ref]);
};

// after mount" case a useEffect would otherwise be needed to catch.
const hideScrollbarRefCallback = (isWebWide) => (instance) => {
  if (Platform.OS !== 'web' || !instance || !isWebWide) return;
  const node = instance.getScrollableNode ? instance.getScrollableNode() : instance;
  if (!node || !node.classList) return;
  node.style.scrollbarWidth = 'none';
  node.classList.add('decent-hide-scrollbar');
};

export { useHideScrollbarOnWeb, hideScrollbarRefCallback };

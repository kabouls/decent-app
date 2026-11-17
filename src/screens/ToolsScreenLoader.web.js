import React, { Suspense, lazy } from 'react';

// Web-only code split. Tools (PDF editor, QR, compressor, resume maker) is the
// largest screen in the app and nobody needs it to render the feed, so it loads
// on first open. Native keeps the static import in ToolsScreenLoader.native.js.
const LazyToolsScreen = lazy(() => import('./ToolsScreen'));

export default function ToolsScreen(props) {
  return (
    <Suspense fallback={null}>
      <LazyToolsScreen {...props} />
    </Suspense>
  );
}

// Thin wrapper so App.js never imports @kishannareshpal/expo-pdf
// directly. That package is native views only - no web implementation
// at all - and App.js is the same file compiled for both web and
// native. Importing a native-only package at the top of a universal
// file would pull it into the web bundle too, which is exactly the
// class of mistake pdfThumbnails.web.js/.native.js already exists to
// avoid, for the same underlying reason. Same fix, same shape, applied
// here for a different native-only dependency.
import React from 'react';
import { PdfView } from '@kishannareshpal/expo-pdf';

export default function PdfNativePreview({ uri, style, onLoadComplete, onPageChanged, onError }) {
  return (
    <PdfView
      uri={uri}
      style={style}
      onLoadComplete={onLoadComplete}
      onPageChanged={onPageChanged}
      onError={onError}
    />
  );
}

// Direct replacement for the patch-package-based fix, after patch-package
// proved unreliable in this environment in two separate ways: its own
// internal "install a pristine copy to diff against" step failed with a
// swallowed, unexplained error (status 1, everything else null), and a
// hand-built patch file that was visually verified to be correct still
// silently failed to apply - patch-package reported success (checkmark
// and all) while the target file remained completely unchanged.
//
// Rather than keep reverse-engineering patch-package's diff-format and
// application-matching internals with no way to actually run and inspect
// them, this does the fix directly: read the file, check for the exact
// known-bad line, replace it, write it back. No diff parsing, no fuzzy
// matching, nothing that can silently no-op - it either finds the exact
// text and reports success, or it doesn't and says so loudly.
//
// Root cause being patched: react-native-pdf-thumbnail@1.3.1 (last
// published years ago, unmaintained) calls Bitmap.createBitmap() with
// bitmap.config, which newer Android SDK levels annotate as nullable
// (Bitmap.Config?) rather than non-null - a straightforward Kotlin
// compile error on any sufficiently recent compileSdk. Confirmed via two
// independent GitHub issues against this exact library (issues #79 and
// #81) reporting the identical error at the identical line, with #81
// providing the exact fix applied here.
const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-pdf-thumbnail',
  'android',
  'src',
  'main',
  'java',
  'org',
  'songsterq',
  'pdfthumbnail',
  'PdfThumbnailModule.kt'
);

const OLD_LINE = 'val bitmapWhiteBG = Bitmap.createBitmap(bitmap.width, bitmap.height, bitmap.config)';
const NEW_LINE = 'val bitmapWhiteBG = Bitmap.createBitmap(bitmap.width, bitmap.height, bitmap.config ?: Bitmap.Config.ARGB_8888)';

if (!fs.existsSync(filePath)) {
  // Package removed, or its internal file layout changed in an update -
  // either way, nothing to patch. Exit 0 (not a failure) so a normal
  // `npm install` never breaks because of this script specifically; if
  // the package version changes, the compile error (if it still exists)
  // will surface on its own during the actual build, which is a much
  // louder and more obvious signal than a silent postinstall failure.
  console.warn('[patch-pdf-thumbnail] File not found - package may have been removed or restructured. Skipping.');
  process.exit(0);
}

const content = fs.readFileSync(filePath, 'utf8');

if (content.includes('bitmap.config ?: Bitmap.Config.ARGB_8888')) {
  console.log('[patch-pdf-thumbnail] Already patched - nothing to do.');
  process.exit(0);
}

if (!content.includes(OLD_LINE)) {
  console.error(
    '[patch-pdf-thumbnail] WARNING: expected original line not found in PdfThumbnailModule.kt. ' +
    'The library may have changed. The Android build will likely fail on this package until this script is updated to match. ' +
    'Check node_modules/react-native-pdf-thumbnail/android/src/main/java/org/songsterq/pdfthumbnail/PdfThumbnailModule.kt manually.'
  );
  process.exit(0); // does not fail the whole install - a hard failure here would break every future install until someone notices and fixes this script
}

fs.writeFileSync(filePath, content.replace(OLD_LINE, NEW_LINE), 'utf8');
console.log('[patch-pdf-thumbnail] Successfully patched react-native-pdf-thumbnail Kotlin nullability crash.');

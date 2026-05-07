/**
 * Generate iOS PWA splash screens from the existing 512x512 icon.
 *
 * iOS shows the apple-touch-startup-image (when present) for the moment
 * between PWA-icon-tap and the first content paint. Without one, iOS
 * falls back to the manifest's background_color + the largest icon
 * scaled up — readable but generic. We render a per-device-size PNG
 * with the brand "C" mark centred on a paper background, in both
 * light and dark variants so iOS picks the right one based on the
 * system theme.
 *
 * Run via: `pnpm tsx scripts/generate-splash.mts`
 *   (or: `node --experimental-strip-types scripts/generate-splash.mts`)
 *
 * Outputs to public/splash/. Re-run only when the icon or palette
 * changes; the generated files are committed.
 */

import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const ICON_PATH = join(ROOT, "public", "icon-512.png");
const OUT_DIR = join(ROOT, "public", "splash");

const PAPER_LIGHT = { r: 0xfa, g: 0xf8, b: 0xf5 };
const PAPER_DARK = { r: 0x13, g: 0x12, b: 0x17 };

/**
 * iOS splash sizes we care about. Each entry produces a portrait PNG
 * and a media query that targets the matching device. Apple's full
 * matrix is much larger; this set covers iPhones from XS forward and
 * the modern iPad lineup, the long tail can fall back to the default
 * iOS behaviour.
 */
type Variant = {
  width: number;
  height: number;
  /** Logical CSS size (device-width × device-height) and pixel ratio. */
  cssWidth: number;
  cssHeight: number;
  ratio: number;
};

const VARIANTS: Variant[] = [
  // iPhone 16 Pro Max
  { width: 1320, height: 2868, cssWidth: 440, cssHeight: 956, ratio: 3 },
  // iPhone 16 Pro
  { width: 1206, height: 2622, cssWidth: 402, cssHeight: 874, ratio: 3 },
  // iPhone 16 Plus / 15 Pro Max / 15 Plus / 14 Pro Max
  { width: 1290, height: 2796, cssWidth: 430, cssHeight: 932, ratio: 3 },
  // iPhone 16 / 15 Pro / 15 / 14 Pro
  { width: 1179, height: 2556, cssWidth: 393, cssHeight: 852, ratio: 3 },
  // iPhone 14 Plus / 13 Pro Max / 12 Pro Max
  { width: 1284, height: 2778, cssWidth: 428, cssHeight: 926, ratio: 3 },
  // iPhone 14 / 13 / 13 Pro / 12 / 12 Pro
  { width: 1170, height: 2532, cssWidth: 390, cssHeight: 844, ratio: 3 },
  // iPhone 13 mini / 12 mini
  { width: 1080, height: 2340, cssWidth: 360, cssHeight: 780, ratio: 3 },
  // iPhone 11 Pro Max / XS Max
  { width: 1242, height: 2688, cssWidth: 414, cssHeight: 896, ratio: 3 },
  // iPhone 11 Pro / XS / X
  { width: 1125, height: 2436, cssWidth: 375, cssHeight: 812, ratio: 3 },
  // iPhone 11 / XR
  { width: 828, height: 1792, cssWidth: 414, cssHeight: 896, ratio: 2 },
  // iPad Pro 12.9"
  { width: 2048, height: 2732, cssWidth: 1024, cssHeight: 1366, ratio: 2 },
  // iPad Pro 11"
  { width: 1668, height: 2388, cssWidth: 834, cssHeight: 1194, ratio: 2 },
  // iPad Air 10.9" / iPad 10.9"
  { width: 1640, height: 2360, cssWidth: 820, cssHeight: 1180, ratio: 2 },
  // iPad 10.2"
  { width: 1620, height: 2160, cssWidth: 810, cssHeight: 1080, ratio: 2 },
  // iPad mini 8.3"
  { width: 1488, height: 2266, cssWidth: 744, cssHeight: 1133, ratio: 2 },
];

type SplashEntry = {
  url: string;
  media: string;
};

function mediaQuery(v: Variant, prefersDark: boolean): string {
  const base = `(device-width: ${v.cssWidth}px) and (device-height: ${v.cssHeight}px) and (-webkit-device-pixel-ratio: ${v.ratio}) and (orientation: portrait)`;
  return prefersDark ? `${base} and (prefers-color-scheme: dark)` : base;
}

async function generate() {
  await mkdir(OUT_DIR, { recursive: true });
  const iconBuf = await readFile(ICON_PATH);

  const entries: SplashEntry[] = [];

  for (const v of VARIANTS) {
    for (const prefersDark of [false, true] as const) {
      const bg = prefersDark ? PAPER_DARK : PAPER_LIGHT;
      // Icon takes ~22% of the shorter dimension so it lands at a
      // comfortable size on every screen, neither cramped on small
      // phones nor lost on iPad.
      const iconSize = Math.round(Math.min(v.width, v.height) * 0.22);
      const resizedIcon = await sharp(iconBuf)
        .resize(iconSize, iconSize, { fit: "contain" })
        .png()
        .toBuffer();

      const filename = `apple-splash-${v.width}-${v.height}${prefersDark ? "-dark" : ""}.png`;
      const outPath = join(OUT_DIR, filename);

      await sharp({
        create: {
          width: v.width,
          height: v.height,
          channels: 3,
          background: bg,
        },
      })
        .composite([
          {
            input: resizedIcon,
            gravity: "center",
          },
        ])
        .png({ compressionLevel: 9 })
        .toFile(outPath);

      entries.push({
        url: `/splash/${filename}`,
        media: mediaQuery(v, prefersDark),
      });
    }
  }

  // Emit the metadata array as a JSON snippet the layout can import.
  // Keeping it as data (not embedded in layout.tsx) means the design
  // matrix can grow without churning the layout file.
  const tsPath = join(ROOT, "lib", "pwa", "splash-startup-images.ts");
  await mkdir(join(ROOT, "lib", "pwa"), { recursive: true });
  const ts = `// Generated by scripts/generate-splash.mts. Do not edit by hand.
// Re-run \`pnpm tsx scripts/generate-splash.mts\` after icon or palette changes.

export const APPLE_SPLASH_STARTUP_IMAGES: Array<{ url: string; media: string }> = ${JSON.stringify(entries, null, 2)};
`;
  await writeFile(tsPath, ts, "utf8");

  console.log(
    `[splash] generated ${entries.length} images across ${VARIANTS.length} device sizes (light + dark)`,
  );
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

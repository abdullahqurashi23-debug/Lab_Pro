// Generates build/icon.ico (multi-size, for the Windows NSIS installer/exe)
// and build/icon.png (for the BrowserWindow's runtime icon) from pure pixel
// math — no external image asset, no native image library, so it works the
// same on any machine that can run Node. Re-run with `npm run generate-icon`
// any time you want to swap in a real designed logo instead — just replace
// this script's drawIcon() or point package.json's build.win.icon elsewhere.
//
// Every edge is supersampled (SS x SS sub-samples per output pixel,
// averaged into a coverage-based alpha/color blend) rather than a hard
// inside/outside test — a flat 0-or-255 test is what made the previous
// version look jagged/blurry once scaled down to real icon sizes like
// 16x16 or 32x32 (Windows taskbar/desktop). This is the standard
// supersampling technique for anti-aliasing procedural raster art.
import { PNG } from 'pngjs';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');
const buildDir = path.join(root, 'build');
fs.mkdirSync(buildDir, { recursive: true });

const TEAL_LIGHT = [22, 138, 128];
const TEAL_DARK = [10, 92, 86]; // subtle top-left-to-bottom-right gradient, matches --primary
const WHITE = [255, 255, 255];
const SS = 4; // sub-samples per axis, per output pixel (16 samples/pixel total)

function inRoundedRect(nx, ny, radius) {
  const rx = Math.min(nx, 1 - nx);
  const ry = Math.min(ny, 1 - ny);
  if (rx >= radius || ry >= radius) return true;
  const dx = radius - rx;
  const dy = radius - ry;
  return dx * dx + dy * dy <= radius * radius;
}

// A conical-flask silhouette in normalized [0,1] coordinates: a narrow neck
// rectangle over a triangular body, with a small liquid-fill band near the
// base for a bit of depth instead of a flat white cutout.
function flaskCoverage(nx, ny) {
  const neck = nx >= 0.44 && nx <= 0.56 && ny >= 0.16 && ny <= 0.44;
  if (neck) return 1;
  if (ny < 0.44 || ny > 0.84) return 0;
  const t = (ny - 0.44) / (0.84 - 0.44);
  const halfWidth = 0.06 + t * 0.32;
  return nx >= 0.5 - halfWidth && nx <= 0.5 + halfWidth ? 1 : 0;
}

// The bottom third of the flask reads as a liquid fill (brand teal on
// white glass) rather than solid white — small touch that reads as
// "designed" instead of a flat silhouette.
function liquidCoverage(nx, ny) {
  if (flaskCoverage(nx, ny) === 0) return 0;
  return ny >= 0.66 ? 1 : 0;
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function drawIcon(size) {
  const png = new PNG({ width: size, height: size });
  const radius = 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      let coverage = 0;
      let flaskHits = 0;
      let liquidHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const nx = px / size;
          const ny = py / size;
          if (inRoundedRect(nx, ny, radius)) {
            coverage++;
            if (flaskCoverage(nx, ny)) {
              flaskHits++;
              if (liquidCoverage(nx, ny)) liquidHits++;
            }
          }
        }
      }
      const total = SS * SS;
      const bgTeal = mix(TEAL_LIGHT, TEAL_DARK, (x / size + y / size) / 2);
      const flaskT = flaskHits / total;
      const liquidT = liquidHits / total;
      // Blend background -> white flask -> teal liquid fill, all by
      // fractional coverage rather than a binary switch, so every edge
      // (rounded corners, flask outline, liquid line) anti-aliases.
      let color = bgTeal;
      color = mix(color, WHITE, flaskT);
      color = mix(color, bgTeal, liquidT * 0.55); // liquid reads as a tinted glass, not solid teal
      png.data[idx] = Math.round(color[0]);
      png.data[idx + 1] = Math.round(color[1]);
      png.data[idx + 2] = Math.round(color[2]);
      png.data[idx + 3] = Math.round((coverage / total) * 255);
    }
  }
  return PNG.sync.write(png);
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = ICO_SIZES.map(drawIcon);

const icoBuffer = await pngToIco(pngBuffers);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);

fs.writeFileSync(path.join(buildDir, 'icon.png'), drawIcon(512));

console.log('Generated build/icon.ico and build/icon.png');

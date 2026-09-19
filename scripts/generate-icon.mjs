// Generates build/icon.ico (multi-size, for the Windows NSIS installer/exe)
// and build/icon.png (for the BrowserWindow's runtime icon) from pure pixel
// math — no external image asset, no native image library, so it works the
// same on any machine that can run Node. Re-run with `npm run generate-icon`
// any time you want to swap in a real designed logo instead — just replace
// this script's drawIcon() or point package.json's build.win.icon elsewhere.
import { PNG } from 'pngjs';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');
const buildDir = path.join(root, 'build');
fs.mkdirSync(buildDir, { recursive: true });

const TEAL = [15, 118, 110]; // matches the --primary brand color
const WHITE = [255, 255, 255];

function inRoundedRect(x, y, size, radius) {
  const rx = Math.min(x, size - 1 - x);
  const ry = Math.min(y, size - 1 - y);
  if (rx >= radius || ry >= radius) return true;
  const dx = radius - rx;
  const dy = radius - ry;
  return dx * dx + dy * dy <= radius * radius;
}

// A simple flask/conical-flask silhouette in normalized [0,1] coordinates:
// a narrow neck rectangle over a triangular body.
function inFlask(nx, ny) {
  const neck = nx >= 0.44 && nx <= 0.56 && ny >= 0.16 && ny <= 0.44;
  if (neck) return true;
  if (ny < 0.44 || ny > 0.84) return false;
  const t = (ny - 0.44) / (0.84 - 0.44); // 0 at neck base, 1 at flask bottom
  const halfWidth = 0.06 + t * 0.32;
  return nx >= 0.5 - halfWidth && nx <= 0.5 + halfWidth;
}

function drawIcon(size) {
  const png = new PNG({ width: size, height: size });
  const radius = Math.round(size * 0.22);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const inside = inRoundedRect(x, y, size, radius);
      let color = TEAL;
      if (inside) {
        const nx = x / size;
        const ny = y / size;
        if (inFlask(nx, ny)) color = WHITE;
      }
      const alpha = inside ? 255 : 0;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = alpha;
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

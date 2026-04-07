import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/favicon.svg');
const pngPath = resolve(__dirname, '../public/favicon.png');

const svgBuffer = readFileSync(svgPath);

await sharp(svgBuffer)
  .resize(32, 32)
  .png()
  .toFile(pngPath);

console.log('Generated public/favicon.png (32x32)');

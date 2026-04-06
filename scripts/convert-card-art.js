import sharp from 'sharp';
import { readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, parse } from 'path';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 85;

const [sourceDir, outputDir] = process.argv.slice(2);

if (!sourceDir || !outputDir) {
  console.error('Usage: node scripts/convert-card-art.js <source-folder> <output-folder>');
  process.exit(1);
}

if (!existsSync(sourceDir)) {
  console.error(`Source folder not found: ${sourceDir}`);
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });

const entries = await readdir(sourceDir);
const images = entries.filter(f => SUPPORTED_EXTENSIONS.has(parse(f).ext.toLowerCase()));

if (images.length === 0) {
  console.log('No image files found in source folder.');
  process.exit(0);
}

let converted = 0;

for (const filename of images) {
  const inputPath = join(sourceDir, filename);
  const outputFilename = parse(filename).name + '.webp';
  const outputPath = join(outputDir, outputFilename);

  const info = await sharp(inputPath)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: OUTPUT_QUALITY })
    .toFile(outputPath);

  const sizeKB = Math.round(info.size / 1024);
  console.log(`Converted: ${filename} → ${outputFilename} (${sizeKB}KB)`);
  converted++;
}

console.log(`Done. ${converted} file${converted !== 1 ? 's' : ''} converted.`);

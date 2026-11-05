import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, copyFile, readdir } from 'node:fs/promises';

// Ship workers, fonts and Spanish OCR data with ATLAS. Document contents never
// need to leave the browser to extract text or prepare the first task draft.
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public', 'vendor', 'documents');
async function copy(from, to) {
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}
async function folder(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) await folder(join(from, entry.name), join(to, entry.name));
    else await copy(join(from, entry.name), join(to, entry.name));
  }
}
const pdf = dirname(require.resolve('pdfjs-dist/package.json'));
await copy(join(pdf, 'build/pdf.worker.min.mjs'), join(output, 'pdf.worker.min.mjs'));
for (const name of ['cmaps', 'standard_fonts', 'wasm']) await folder(join(pdf, name), join(output, name));
await copy(join(pdf, 'LICENSE'), join(output, 'PDFJS-LICENSE'));
const ocr = dirname(require.resolve('tesseract.js/package.json'));
await copy(join(ocr, 'dist/worker.min.js'), join(output, 'ocr/worker.min.js'));
await copy(join(ocr, 'LICENSE.md'), join(output, 'ocr/LICENSE.md'));
const core = dirname(createRequire(join(ocr, 'package.json')).resolve('tesseract.js-core/package.json'));
for (const entry of await readdir(core)) if (/\.wasm(?:\.js)?$/.test(entry) || /^LICENSE/.test(entry)) await copy(join(core, entry), join(output, 'ocr/core', entry));
const language = dirname(require.resolve('@tesseract.js-data/spa/package.json'));
await copy(join(language, '4.0.0/spa.traineddata.gz'), join(output, 'ocr/lang/spa.traineddata.gz'));
console.log('Lector PDF y OCR en español preparados en los archivos locales de ATLAS.');

import { MAX_DOCUMENT_TEXT, MAX_PDF_PAGES, MAX_PDF_SIZE, type DocumentPage } from './job-descriptions';
import type { Worker as OCRWorker } from 'tesseract.js';

type TextItem = { str: string; transform: number[]; width: number; hasEOL: boolean };
export function pdfTextLines(items: unknown[]): string {
  const lines: string[] = []; let line = '', lastY: number | null = null, lastEnd = 0;
  for (const value of items) {
    if (!value || typeof value !== 'object' || !('str' in value)) continue;
    const item = value as TextItem;
    if (!Array.isArray(item.transform) || typeof item.str !== 'string') continue;
    const [x, y] = [item.transform[4], item.transform[5]];
    if (lastY !== null && Math.abs(y - lastY) > 3 && line.trim()) { lines.push(line.trim()); line = ''; }
    const space = line && !/\s$/.test(line) && !/^\s/.test(item.str) && x - lastEnd > 1 ? ' ' : '';
    line += space + item.str; lastY = y; lastEnd = x + item.width;
    if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; lastY = null; }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
}

export async function readJobPDF(file: File, options: { signal: AbortSignal; progress: (message: string) => void; ocr?: boolean }): Promise<{ pages: DocumentPage[]; fileHash: string; warnings: string[] }> {
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) throw new Error('Selecciona un archivo PDF.');
  if (!file.size || file.size > MAX_PDF_SIZE) throw new Error('El PDF debe contener datos y ocupar como máximo 20 MB.');
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-')) throw new Error('El archivo no contiene un PDF válido.');
  const hash = await crypto.subtle.digest('SHA-256', data);
  const fileHash = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  options.signal.throwIfAborted();
  options.progress('Abriendo el PDF…');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/documents/pdf.worker.min.mjs';
  const loading = pdfjs.getDocument({ data, enableXfa: false, cMapUrl: '/vendor/documents/cmaps/', standardFontDataUrl: '/vendor/documents/standard_fonts/', wasmUrl: '/vendor/documents/wasm/' });
  let worker: OCRWorker | undefined, total = 0, currentPage = 0;
  const cancelled = new Promise<never>((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Lectura cancelada', 'AbortError')), { once: true });
  });
  // Termination releases PDF and OCR workers even during a long scanned page.
  const abort = () => { void loading.destroy(); if (worker) void worker.terminate(); };
  options.signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await Promise.race([loading.promise, cancelled]);
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`El documento supera ${MAX_PDF_PAGES} páginas. Divide el PDF por puestos antes de incorporarlo.`);
    const pages: DocumentPage[] = [], warnings: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      options.signal.throwIfAborted(); currentPage = number;
      options.progress(`Leyendo página ${number} de ${pdf.numPages}…`);
      const page = await Promise.race([pdf.getPage(number), cancelled]);
      const content = await Promise.race([page.getTextContent(), cancelled]);
      let text = pdfTextLines(content.items), method: DocumentPage['method'] = 'text';
      if (text.replace(/\s/g, '').length < 40 && options.ocr !== false) {
        options.progress(`Reconociendo la página escaneada ${number} de ${pdf.numPages}…`);
        if (!worker) {
          const { createWorker } = await import('tesseract.js');
          const initializing = createWorker('spa', 1, {
            workerPath: '/vendor/documents/ocr/worker.min.js', corePath: '/vendor/documents/ocr/core', langPath: '/vendor/documents/ocr/lang',
            logger: event => { if (!options.signal.aborted && event.status === 'recognizing text') options.progress(`Reconociendo página ${currentPage}: ${Math.round(event.progress * 100)} %`); },
          });
          // A cancellation while loading the language still closes the worker.
          initializing.then(value => { if (options.signal.aborted) void value.terminate(); }).catch(() => undefined);
          worker = await Promise.race([initializing, cancelled]);
        }
        const base = page.getViewport({ scale: 1 }), scale = Math.min(2, 2200 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale }), canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await Promise.race([page.render({ canvas, viewport }).promise, cancelled]);
        const result = await Promise.race([worker.recognize(canvas), cancelled]);
        text = result.data.text.trim(); method = 'ocr'; canvas.width = canvas.height = 0;
        if (result.data.confidence < 65) warnings.push(`Página ${number}: la lectura de la imagen es poco clara. Contrasta las tareas con el PDF.`);
      }
      if (text.replace(/\s/g, '').length < 25) warnings.push(`Página ${number}: no se ha podido leer suficiente texto. Puede estar vacía o necesitar una copia más nítida.`);
      total += text.length;
      if (total > MAX_DOCUMENT_TEXT) throw new Error('El PDF contiene demasiado texto. Divídelo en varios documentos por puesto.');
      pages.push({ number, text, method }); page.cleanup();
    }
    return { pages, fileHash, warnings };
  } catch (error) {
    if (options.signal.aborted) throw new DOMException('Lectura cancelada', 'AbortError');
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('El PDF está protegido con contraseña. Guarda una copia desbloqueada para poder leerlo.');
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('No se puede leer este PDF. Comprueba que se abre correctamente o vuelve a exportarlo.');
    throw error;
  } finally {
    options.signal.removeEventListener('abort', abort);
    await worker?.terminate().catch(() => undefined);
    await loading.destroy().catch(() => undefined);
  }
}

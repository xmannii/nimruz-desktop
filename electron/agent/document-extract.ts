/**
 * Extracts readable text from uploaded document formats so the agent can pull
 * them into context via its normal file tools. Plain-text formats (csv, json,
 * md, code, …) are read directly by {@link WorkspaceFilesStore.readFile}; this
 * module handles binary containers such as PDF that would otherwise be rejected
 * as "binary" content.
 */

import path from "node:path";

/** Extensions that require dedicated extraction instead of a raw UTF-8 read. */
export const EXTRACTABLE_DOCUMENT_EXTENSIONS = new Set([".pdf"]);

export function isExtractableDocument(filePath: string): boolean {
  return EXTRACTABLE_DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Returns extracted UTF-8 text for a supported document, or throws a
 * human-readable error when the format cannot be parsed.
 */
export async function extractDocumentText(
  filePath: string,
  buffer: Buffer
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    return extractPdfText(buffer);
  }
  throw new Error("این نوع فایل قابل استخراج متن نیست.");
}

/**
 * Loaded via a non-literal specifier so the bundler/type-checker do not require
 * `pdfjs-dist` to be present at build time. Install it to enable PDF parsing;
 * until then callers get a clear runtime error.
 */
async function loadPdfjs(): Promise<PdfjsModule> {
  const specifier = "pdfjs-dist/legacy/build/pdf.mjs";
  try {
    return (await import(/* @vite-ignore */ specifier)) as PdfjsModule;
  } catch {
    throw new Error(
      "خواندن PDF نیازمند نصب بستهٔ pdfjs-dist است. لطفاً آن را نصب کنید."
    );
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfjs();

  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    // Text extraction never rasterizes pages, so the worker/canvas are unused.
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;
  try {
    const pages: string[] = [];
    const maxPages = Math.min(doc.numPages, 200);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const lineText = content.items
        .map((item) => item.str ?? "")
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim();
      pages.push(`--- صفحه ${pageNumber} ---\n${lineText}`);
      page.cleanup();
    }
    const truncatedNote =
      doc.numPages > maxPages
        ? `\n\n[${doc.numPages - maxPages} صفحهٔ باقی‌مانده استخراج نشد.]`
        : "";
    const text = pages.join("\n\n").trim();
    return (text || "[هیچ متنی در این PDF یافت نشد.]") + truncatedNote;
  } finally {
    await doc.destroy();
  }
}

type PdfTextItem = { str?: string };
type PdfPage = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  cleanup: () => void;
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfjsModule = {
  getDocument: (options: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
  }) => { promise: Promise<PdfDocument> };
};

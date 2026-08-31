// pdf-parse (via pdfjs-dist) references DOMMatrix/ImageData/Path2D even for plain text
// extraction, which don't exist in a Node runtime. Stub them before the module loads — a
// dynamic import (not hoisted, unlike a static import) is what makes the ordering work.
const g = globalThis as unknown as Record<"DOMMatrix" | "ImageData" | "Path2D" | "pdfjsWorker", unknown>;
g.DOMMatrix ??= class DOMMatrix {};
g.ImageData ??= class ImageData {};
g.Path2D ??= class Path2D {};

export type AtsNotes = {
  ok: boolean;
  missingSections: string[];
  extractedPreview: string;
  pageCount?: number; // optional: absent on rows written before the one-page fitter shipped
};

const EXPECTED_MARKERS: Record<"resume" | "cover_letter", { label: string; pattern: RegExp }[]> = {
  resume: [
    { label: "email address", pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
    { label: "experience section", pattern: /experience/i },
    { label: "skills section", pattern: /skills/i },
  ],
  cover_letter: [{ label: "email address", pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/ }],
};

// Re-extracts text from the PDF the app just generated to catch the real LaTeX-resume/ATS
// gotcha: certain fonts or layouts compile to a PDF that looks fine but whose embedded text
// is missing, garbled, or out of order — which is exactly what an ATS's own text extraction
// would hit.
// Never throws — a PDF that compiled fine but that pdfjs-dist's parser trips on for some
// unrelated edge case (a font quirk, an internal xref pattern it doesn't like, etc.) shouldn't
// take down the whole generate/upload/recompile request over what's an advisory check. Every
// caller gets a degraded-but-valid AtsNotes back instead of an unhandled 500.
export async function checkAts(pdf: Buffer, kind: "resume" | "cover_letter" = "resume"): Promise<AtsNotes> {
  try {
    // pdfjs-dist has no real Worker in Node, so it falls back to a "fake worker" that dynamically
    // imports its own worker chunk by a relative path it computes at runtime — a path Next's
    // bundler (Turbopack, and webpack too) doesn't preserve, so that import 404s. Pre-registering
    // globalThis.pdfjsWorker short-circuits that fallback entirely (pdfjs checks for it first), so
    // it never attempts the dynamic import. Same "must run before the module needs it" ordering
    // constraint as the DOMMatrix/etc. stubs above.
    if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: pdf });
    const { text, total } = await parser.getText();
    await parser.destroy();

    const missingSections = EXPECTED_MARKERS[kind].filter((m) => !m.pattern.test(text)).map((m) => m.label);
    const tooShort = text.trim().length < 100;

    return {
      ok: missingSections.length === 0 && !tooShort,
      missingSections: tooShort ? ["extracted text is unexpectedly short — PDF may not be ATS-parseable", ...missingSections] : missingSections,
      extractedPreview: text.trim().slice(0, 500),
      pageCount: total > 0 ? total : 1,
    };
  } catch (err) {
    return {
      ok: false,
      missingSections: [`ATS check itself failed to run: ${err instanceof Error ? err.message : String(err)}`],
      extractedPreview: "",
      pageCount: 1,
    };
  }
}

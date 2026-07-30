// pdf-parse (via pdfjs-dist) references DOMMatrix/ImageData/Path2D even for plain text
// extraction, which don't exist in a Node runtime. Stub them before the module loads — a
// dynamic import (not hoisted, unlike a static import) is what makes the ordering work.
const g = globalThis as unknown as Record<"DOMMatrix" | "ImageData" | "Path2D", unknown>;
g.DOMMatrix ??= class DOMMatrix {};
g.ImageData ??= class ImageData {};
g.Path2D ??= class Path2D {};

export type AtsNotes = {
  ok: boolean;
  missingSections: string[];
  extractedPreview: string;
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
export async function checkAts(pdf: Buffer, kind: "resume" | "cover_letter" = "resume"): Promise<AtsNotes> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: pdf });
  const { text } = await parser.getText();
  await parser.destroy();

  const missingSections = EXPECTED_MARKERS[kind].filter((m) => !m.pattern.test(text)).map((m) => m.label);
  const tooShort = text.trim().length < 100;

  return {
    ok: missingSections.length === 0 && !tooShort,
    missingSections: tooShort ? ["extracted text is unexpectedly short — PDF may not be ATS-parseable", ...missingSections] : missingSections,
    extractedPreview: text.trim().slice(0, 500),
  };
}

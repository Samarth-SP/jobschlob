// pdfjs-dist ships this as a plain .mjs with no types — see the globalThis.pdfjsWorker fix in
// lib/ats-check.ts for why it's imported at all.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";

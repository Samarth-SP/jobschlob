// Vercel Blob wrapper for uploaded resume/cover-letter PDFs (documents.source === "uploaded").
// Private store — these are personal documents, not meant to be publicly reachable by URL. Only
// touched by the workshop upload/download routes; generated documents never hit this (they're
// cheap to recompile from `latex` on demand instead, see lib/latex.ts).
import { put, get, del } from "@vercel/blob";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — plenty for a resume/cover letter PDF, keeps
// a stray huge upload from filling the (billed) blob store.

export class UploadTooLargeError extends Error {}

export async function uploadDocumentPdf(
  userId: string,
  kind: string,
  filename: string,
  file: Buffer,
): Promise<string> {
  if (file.byteLength > MAX_UPLOAD_BYTES) throw new UploadTooLargeError("File too large (max 10MB).");
  const pathname = `resumes/${encodeURIComponent(userId)}/${kind}/${Date.now()}-${filename}`;
  const blob = await put(pathname, file, { access: "private", contentType: "application/pdf" });
  return blob.url;
}

export async function fetchDocumentPdf(blobUrl: string) {
  return get(blobUrl, { access: "private" });
}

// Best-effort: a blob that's already gone (or a transient error) shouldn't block deleting the
// DB row the user actually asked to delete.
export async function deleteDocumentPdf(blobUrl: string) {
  await del(blobUrl).catch(() => {});
}

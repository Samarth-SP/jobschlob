import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, cp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BIN_PATH = join(process.cwd(), "bin", "tectonic");
// The build-time-warmed cache, shipped read-only with the deployed function (see
// scripts/setup-tectonic.js) — covers our house style plus the common external packages in
// scripts/fixture.tex with zero network access.
const BAKED_CACHE_DIR = join(process.cwd(), ".tectonic-cache");
// /tmp is the one writable path in a deployed Vercel function. Copying the baked cache here
// once per container gives Tectonic a cache dir it can actually write into, so a package outside
// the warmed set falls through to Tectonic's normal live fetch-and-cache instead of crashing on
// "Read-only file system" trying to write into .tectonic-cache directly. First request per cold
// container pays a local disk copy (fast) plus, only for genuinely uncommon packages, a live
// fetch; every request after that on the same warm container (Fluid Compute reuses them) hits an
// already-populated cache — for the curated set as well as anything fetched live since.
const RUNTIME_CACHE_DIR = join(tmpdir(), "tectonic-cache");

let cacheReady: Promise<void> | null = null;
function ensureRuntimeCache(): Promise<void> {
  cacheReady ??= access(RUNTIME_CACHE_DIR).catch(() => cp(BAKED_CACHE_DIR, RUNTIME_CACHE_DIR, { recursive: true }));
  return cacheReady;
}

// Carries Tectonic's own stderr (the actual LaTeX error — "Undefined control sequence", an
// unescaped &/%/#/_, etc.) so callers can show something more useful than "compile failed". Its
// own type lets a route handler tell "your LaTeX is broken" apart from an unrelated crash.
export class LatexCompileError extends Error {}

// \pdfglyphtounicode / \pdfgentounicode / \input{glyphtounicode} are pdfTeX-only primitives for
// mapping font glyphs to Unicode (a text-searchability nicety for the compiled PDF) — Tectonic's
// engine is XeTeX-based and doesn't implement them at all, confirmed by trying to even pre-cache
// the file that defines them, which crashes on load regardless of caching (see git history on
// scripts/fixture.tex). No amount of package-caching fixes this; it's a hard engine limitation.
// Extremely common in "Jake's Resume" (and forks) — the most-used free LaTeX resume template —
// so rather than making every uploader manually delete these lines, strip them automatically:
// the rest of the document compiles fine without them, just without that one PDF-searchability
// trick (our own ATS check re-extracts text from the compiled PDF regardless, so this doesn't
// weaken the ATS check itself).
const UNSUPPORTED_PRIMITIVE_LINES = [
  { pattern: /^.*\\input\{glyphtounicode\}.*$\n?/m, label: "\\input{glyphtounicode}" },
  { pattern: /^.*\\pdfgentounicode\s*=\s*1.*$\n?/m, label: "\\pdfgentounicode=1" },
  { pattern: /^.*\\pdfglyphtounicode\{[^}]*\}\{[^}]*\}.*$\n?/gm, label: "\\pdfglyphtounicode{...}{...}" },
];

export function stripUnsupportedPrimitives(source: string): { source: string; stripped: string[] } {
  const stripped: string[] = [];
  let next = source;
  for (const { pattern, label } of UNSUPPORTED_PRIMITIVE_LINES) {
    if (pattern.test(next)) {
      stripped.push(label);
      next = next.replace(pattern, "");
    }
  }
  return { source: next, stripped };
}

export async function compileLatex(source: string): Promise<{ pdf: Buffer; source: string; warnings: string[] }> {
  await ensureRuntimeCache();
  const { source: cleaned, stripped } = stripUnsupportedPrimitives(source);
  const warnings = stripped.length
    ? [`Removed unsupported LaTeX (pdfTeX-only, not implemented by our engine): ${stripped.join(", ")}`]
    : [];

  const dir = await mkdtemp(join(tmpdir(), "latex-"));
  const texPath = join(dir, "doc.tex");
  const pdfPath = join(dir, "doc.pdf");
  try {
    await writeFile(texPath, cleaned);
    try {
      await execFileAsync(BIN_PATH, ["--outdir", dir, texPath], {
        env: { ...process.env, TECTONIC_CACHE_DIR: RUNTIME_CACHE_DIR },
      });
    } catch (err) {
      const stderr = (err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "").trim();
      throw new LatexCompileError(stderr || (err instanceof Error ? err.message : "LaTeX compilation failed."));
    }
    const pdf = await readFile(pdfPath);
    return { pdf, source: cleaned, warnings };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BIN_PATH = join(process.cwd(), "bin", "tectonic");
const CACHE_DIR = join(process.cwd(), ".tectonic-cache");

// Carries Tectonic's own stderr (the actual LaTeX error — "Undefined control sequence", an
// unescaped &/%/#/_, etc.) so callers can show something more useful than "compile failed". Its
// own type lets a route handler tell "your LaTeX is broken" apart from an unrelated crash.
export class LatexCompileError extends Error {}

export async function compileLatex(source: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "latex-"));
  const texPath = join(dir, "doc.tex");
  const pdfPath = join(dir, "doc.pdf");
  try {
    await writeFile(texPath, source);
    try {
      await execFileAsync(BIN_PATH, ["--outdir", dir, texPath], {
        env: { ...process.env, TECTONIC_CACHE_DIR: CACHE_DIR },
      });
    } catch (err) {
      const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
      throw new LatexCompileError(stderr.trim() || (err instanceof Error ? err.message : "LaTeX compilation failed."));
    }
    return await readFile(pdfPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BIN_PATH = join(process.cwd(), "bin", "tectonic");
const CACHE_DIR = join(process.cwd(), ".tectonic-cache");

export async function compileLatex(source: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "latex-"));
  const texPath = join(dir, "doc.tex");
  const pdfPath = join(dir, "doc.pdf");
  try {
    await writeFile(texPath, source);
    await execFileAsync(BIN_PATH, ["--outdir", dir, texPath], {
      env: { ...process.env, TECTONIC_CACHE_DIR: CACHE_DIR },
    });
    return await readFile(pdfPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Downloads the Tectonic LaTeX engine binary for this platform and pre-warms its package
// cache at build time (network access is available then; the deployed function's runtime
// isn't guaranteed to have a warm /tmp, so compiling at request time would risk redownloading
// TeX packages on every cold container). Runs as part of `npm run build`, not just postinstall,
// since Vercel can restore a cached node_modules and skip postinstall entirely.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const zlib = require("node:zlib");

const ROOT = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT, "bin");
const BIN_PATH = path.join(BIN_DIR, "tectonic");
const CACHE_DIR = path.join(ROOT, ".tectonic-cache");
const VERSION = "0.17.0";

const TARGETS = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
};

function targetTriple() {
  const key = `${process.platform}-${process.arch}`;
  const triple = TARGETS[key];
  if (!triple) throw new Error(`No Tectonic release for platform ${key}`);
  return triple;
}

async function downloadBinary() {
  if (fs.existsSync(BIN_PATH)) return;
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const triple = targetTriple();
  const asset = `tectonic-${VERSION}-${triple}.tar.gz`;
  const url = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${VERSION}/${asset}`;

  console.log(`Downloading ${asset}...`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download tectonic: ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const tarball = zlib.gunzipSync(gz);
  extractTarBinary(tarball, BIN_PATH);
  fs.chmodSync(BIN_PATH, 0o755);
}

// Minimal tar reader — the release asset is a single ustar entry (the "tectonic" binary),
// so a full tar implementation isn't needed. ponytail: single-file tar only, revisit if a
// future release ships multiple entries.
function extractTarBinary(buf, outPath) {
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(header.subarray(124, 136).toString("ascii").trim(), 8);
    const type = String.fromCharCode(header[156]);
    const dataStart = offset + 512;
    if (type === "0" || type === "\0") {
      fs.writeFileSync(outPath, buf.subarray(dataStart, dataStart + size));
      return;
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error("No regular file found in tectonic tarball");
}

function warmCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log("Pre-warming Tectonic package cache...");
  execFileSync(BIN_PATH, ["--outdir", CACHE_DIR, path.join(__dirname, "fixture.tex")], {
    env: { ...process.env, TECTONIC_CACHE_DIR: CACHE_DIR },
    stdio: "inherit",
  });
}

async function main() {
  await downloadBinary();
  warmCache();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

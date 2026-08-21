import JSZip from "jszip";
import type { Job } from "../types";

function toDownloadBlob(bytes: Blob | ArrayBuffer | Uint8Array): Blob {
  if (bytes instanceof Blob) return bytes;
  const src =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return new Blob([copy], { type: "application/octet-stream" });
}

export function downloadBytes(bytes: Blob | ArrayBuffer | Uint8Array, filename: string) {
  const blob = toDownloadBlob(bytes);
  const name = filename || "book.xtch";
  const nav = navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
  };
  if (typeof nav.msSaveOrOpenBlob === "function") {
    nav.msSaveOrOpenBlob(blob, name);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

export async function downloadJobs(jobs: Job[]) {
  const done = jobs.filter((j) => j.result);
  if (!done.length) return;
  if (done.length === 1 && done[0].result) {
    downloadBytes(done[0].result.bytes, done[0].result.filename);
    return;
  }
  const zip = new JSZip();
  const used = new Set<string>();
  for (const job of done) {
    if (!job.result) continue;
    let name = job.result.filename;
    let n = 1;
    while (used.has(name.toLowerCase())) {
      name = job.result.filename.replace(/\.xtch$/i, "") + " (" + ++n + ").xtch";
    }
    used.add(name.toLowerCase());
    zip.file(name, job.result.bytes);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBytes(blob, "lazahata-xtch.zip");
}

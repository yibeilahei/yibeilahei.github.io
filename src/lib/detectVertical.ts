/**
 * Decide whether an EPUB is 縦書き from its CSS / markup.
 * page-progression-direction=rtl alone is not enough (manga is often 横書き).
 */

import JSZip from "jszip";
import type { WritingMode } from "./types";

const VERTICAL_CSS =
  /(?:-webkit-|-epub-|-ms-)?writing-mode\s*:\s*vertical-(?:rl|lr)/i;
const VERTICAL_META = /primary-writing-mode[^>]*vertical/i;

export function textLooksVertical(text: string): boolean {
  return VERTICAL_CSS.test(text) || VERTICAL_META.test(text);
}

export async function isVerticalEpub(file: File): Promise<boolean> {
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files);
  for (const name of names) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (!/\.(css|xhtml|html|htm|opf|xml)$/i.test(name)) continue;
    const text = await entry.async("string");
    if (textLooksVertical(text)) return true;
  }
  return false;
}

export type LayoutEngine = "foliate" | "crengine";

export function effectiveWritingMode(
  writingMode: WritingMode,
  detectedVertical: boolean | null,
): "horizontal" | "vertical" {
  if (writingMode === "vertical") return "vertical";
  if (writingMode === "horizontal") return "horizontal";
  return detectedVertical ? "vertical" : "horizontal";
}

export function convertWritingMode(
  writingMode: WritingMode,
  detectedVertical: boolean | null,
): WritingMode {
  if (writingMode !== "auto") return writingMode;
  if (detectedVertical == null) return "auto";
  return detectedVertical ? "vertical" : "horizontal";
}

export async function resolveLayoutEngine(
  file: File,
  writingMode: string,
): Promise<{ engine: LayoutEngine; vertical: boolean }> {
  if (writingMode === "vertical") return { engine: "foliate", vertical: true };
  if (writingMode === "horizontal") return { engine: "crengine", vertical: false };
  const vertical = await isVerticalEpub(file);
  return vertical
    ? { engine: "foliate", vertical: true }
    : { engine: "crengine", vertical: false };
}

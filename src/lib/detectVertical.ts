/**
 * Auto writing-mode from markup/CSS — not language, not manga RTL.
 *
 * - `textLooksVertical(sample)` → vertical, else horizontal
 * - User override always wins (`effectiveWritingMode`)
 * - TXT has no markup signal → pass an empty sample → horizontal
 * - `page-progression-direction=rtl` alone is not enough (manga is often 横書き)
 *
 * Adapters supply a markup/CSS sample. Empty sample (TXT) → horizontal.
 * Horizontal EPUB uses CREngine unless `epubCrengine` is off.
 */

import JSZip from "jszip";
import type { ResolvedWritingMode, WritingMode } from "./types";

const VERTICAL_CSS =
  /(?:-webkit-|-epub-|-ms-)?writing-mode\s*:\s*vertical-(?:rl|lr)/i;
const VERTICAL_META = /primary-writing-mode[^>]*vertical/i;

export function textLooksVertical(text: string): boolean {
  return VERTICAL_CSS.test(text) || VERTICAL_META.test(text);
}

/**
 * Auto from a markup/CSS sample. Missing/empty sample → horizontal
 * (TXT or a failed sniff). Does not look at language, glyphs,
 * filename, or page-progression-direction.
 */
export function detectedVerticalFromSample(sample: string | null | undefined): boolean {
  return Boolean(sample && textLooksVertical(sample));
}

/** EPUB zip CSS/HTML sample. Stops at the first 縦書き hit. */
export async function sampleEpubMarkup(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files);
  for (const name of names) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (!/\.(css|xhtml|html|htm|opf|xml)$/i.test(name)) continue;
    const text = await entry.async("string");
    if (textLooksVertical(text)) return text;
  }
  return "";
}

export async function isVerticalEpub(file: File): Promise<boolean> {
  return detectedVerticalFromSample(await sampleEpubMarkup(file));
}

export type LayoutEngine = "foliate" | "crengine";

/** Override always wins. Auto + no detection → horizontal (safer miss). */
export function effectiveWritingMode(
  writingMode: WritingMode,
  detectedVertical: boolean | null,
): ResolvedWritingMode {
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

/**
 * Auto or override → which pager.
 * Vertical is always the 縦書き pager. Horizontal EPUB uses CREngine
 * unless `epubCrengine` is false (横書き pager). Do not send TXT / MOBI /
 * FB2 to CREngine.
 */
export function pagerKind(
  writingMode: WritingMode,
  detectedVertical: boolean | null,
  format: string,
  epubCrengine = true,
): "vertical" | "horizontal" | "crengine" {
  const axis = effectiveWritingMode(writingMode, detectedVertical);
  if (axis === "vertical") return "vertical";
  if (format === "epub" && epubCrengine) return "crengine";
  return "horizontal";
}

/** EPUB only: vertical → Foliate pager, horizontal → CREngine by default. */
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

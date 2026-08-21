/**
 * Auto writing-mode from markup/CSS — not language, not manga RTL.
 *
 * - `textLooksVertical(sample)` → vertical, else horizontal
 * - User override always wins (`axisFromChoice` in jobs.ts)
 * - TXT has no markup signal → pass an empty sample → horizontal
 * - `page-progression-direction=rtl` alone is not enough (manga is often 横書き)
 *
 * Adapters supply a markup/CSS sample. Empty sample (TXT) → horizontal.
 * Horizontal EPUB uses CREngine unless `epubCrengine` is off.
 */

import JSZip from "jszip";
import type { ResolvedWritingMode } from "./types";

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

/** Auto from a markup/CSS sample. Empty/missing → horizontal. */
export function axisFromSample(sample: string | null | undefined): ResolvedWritingMode {
  return detectedVerticalFromSample(sample) ? "vertical" : "horizontal";
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

/**
 * Resolved axis → which pager.
 * Vertical is always the 縦書き pager. Horizontal EPUB uses CREngine
 * unless `epubCrengine` is false (横書き pager). Do not send TXT / MOBI /
 * FB2 to CREngine.
 */
export function pagerKind(
  axis: ResolvedWritingMode,
  format: string,
  epubCrengine = true,
): "vertical" | "horizontal" | "crengine" {
  if (axis === "vertical") return "vertical";
  if (format === "epub" && epubCrengine) return "crengine";
  return "horizontal";
}

/** EPUB only: vertical → Foliate pager, horizontal → CREngine by default. */
export async function resolveLayoutEngine(
  _file: File,
  axis: ResolvedWritingMode,
): Promise<{ engine: LayoutEngine; vertical: boolean }> {
  if (axis === "vertical") return { engine: "foliate", vertical: true };
  return { engine: "crengine", vertical: false };
}

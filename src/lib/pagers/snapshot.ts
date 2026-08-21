/**
 * Capture a laid-out pager viewport to RGBA.
 *
 * Chrome/Firefox: html-to-image (SVG foreignObject).
 * WebKit: do not use foreignObject — Safari hangs on vertical-rl HTML inside
 * an SVG image (img.decode never resolves), which leaves preview at 0%.
 * Paint from live layout boxes instead.
 */

import { toCanvas } from "html-to-image";
import { systemFontFaceCss } from "../fonts";
import { t } from "../i18n";

const systemCss = systemFontFaceCss();
const MAX_SECTION_PAGES = 5000;

export function isWebKitEngine(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg\//i.test(ua);
}

export function pagerHostCss(w: number, h: number): string {
  const webkit = isWebKitEngine();
  return [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${w}px`,
    `height:${h}px`,
    "overflow:hidden",
    webkit ? "contain:none" : "contain:strict",
    // opacity:0 + contain:strict skips layout/paint in WebKit.
    webkit ? "opacity:0.02" : "opacity:0",
    "z-index:-1",
    "pointer-events:none",
    "background:#fff",
  ].join(";");
}

export function waitFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    window.setTimeout(finish, 80);
  });
}

export function capPageCount(count: number): number {
  return Math.max(1, Math.min(MAX_SECTION_PAGES, count));
}

export async function loadIframe(iframe: HTMLIFrameElement, url: string): Promise<Document> {
  const waitLoad = (assign: () => void) =>
    new Promise<Document>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(t("sectionTimeout"))), 20000);
      const finish = () => {
        window.clearTimeout(timer);
        const doc = iframe.contentDocument;
        if (!doc) {
          reject(new Error(t("sectionMissing")));
          return;
        }
        resolve(doc);
      };
      iframe.onload = finish;
      iframe.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error(t("sectionFailed")));
      };
      assign();
    });

  if (isWebKitEngine()) {
    try {
      const html = await fetch(url).then((r) => r.text());
      return await waitLoad(() => {
        iframe.srcdoc = html;
      });
    } catch {
      /* blob URL fallback */
    }
  }
  return waitLoad(() => {
    iframe.src = url;
  });
}

function timeoutMs<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

async function htmlToImageSnapshot(vp: HTMLElement, w: number, h: number): Promise<Uint8ClampedArray> {
  const canvas = await toCanvas(vp, {
    width: w,
    height: h,
    pixelRatio: 1,
    backgroundColor: "#ffffff",
    cacheBust: false,
    fontEmbedCSS: systemCss,
    skipAutoScale: true,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("snapshotFailed"));
  return new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
}

function rectsOverlap(
  x: number,
  y: number,
  rw: number,
  rh: number,
  w: number,
  h: number,
): boolean {
  return rw > 0 && rh > 0 && x + rw > 0 && y + rh > 0 && x < w && y < h;
}

function centerInBox(
  x: number,
  y: number,
  rw: number,
  rh: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): boolean {
  const cx = x + rw / 2;
  const cy = y + rh / 2;
  return cx >= boxX && cx < boxX + boxW && cy >= boxY && cy < boxY + boxH;
}

function rasterizeElement(root: HTMLElement, w: number, h: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("snapshotFailed"));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.save();

  const origin = root.getBoundingClientRect();
  const clipEl = root.querySelector(".lz-clip");
  const clipBox = clipEl instanceof HTMLElement ? clipEl.getBoundingClientRect() : origin;
  const clipX = clipBox.left - origin.left;
  const clipY = clipBox.top - origin.top;
  const clipW = clipBox.width || w;
  const clipH = clipBox.height || h;
  ctx.beginPath();
  ctx.rect(clipX, clipY, clipW, clipH);
  ctx.clip();

  const doc = root.ownerDocument;
  const view = doc.defaultView;

  for (const img of Array.from(root.querySelectorAll("img"))) {
    if (!img.naturalWidth) continue;
    const r = img.getBoundingClientRect();
    const x = r.left - origin.left;
    const y = r.top - origin.top;
    if (!rectsOverlap(x - clipX, y - clipY, r.width, r.height, clipW, clipH)) continue;
    try {
      ctx.drawImage(img, x, y, r.width, r.height);
    } catch {
      /* ignore */
    }
  }

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    if (!text) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const style = view?.getComputedStyle(parent);
    if (!style) continue;
    if (style.visibility === "hidden" || style.display === "none") continue;
    const parentRect = parent.getBoundingClientRect();
    if (
      !rectsOverlap(
        parentRect.left - clipBox.left,
        parentRect.top - clipBox.top,
        parentRect.width,
        parentRect.height,
        clipW,
        clipH,
      )
    ) {
      continue;
    }

    ctx.fillStyle = style.color || "#111111";
    ctx.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const vertical = (style.writingMode || "").includes("vertical");
    const fontSize = parseFloat(style.fontSize) || 16;
    const maxGlyph = fontSize * 3;

    let offset = 0;
    for (const ch of text) {
      const len = ch.length;
      if (ch === "\n" || ch === "\r" || ch === "\t") {
        offset += len;
        continue;
      }
      const range = doc.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + len);
      offset += len;
      const list = range.getClientRects();
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        // WebKit often also returns the line/column box; skip those or
        // every glyph is painted at the column center.
        if (r.width > maxGlyph || r.height > maxGlyph) continue;
        const x = r.left - origin.left;
        const y = r.top - origin.top;
        if (!centerInBox(x, y, r.width, r.height, clipX, clipY, clipW, clipH)) continue;
        ctx.save();
        ctx.translate(x + r.width / 2, y + r.height / 2);
        if (vertical && r.height > r.width * 1.35) ctx.rotate(Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      }
    }
  }

  ctx.restore();
  return new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
}

function flowIsVertical(vp: HTMLElement): boolean {
  const flow = vp.querySelector(".lz-flow") || vp;
  const writing = vp.ownerDocument.defaultView?.getComputedStyle(flow).writingMode || "";
  return writing.includes("vertical");
}

export async function snapshotViewport(
  vp: HTMLElement,
  w: number,
  h: number,
): Promise<Uint8ClampedArray> {
  // Safari hangs forever on SVG foreignObject + vertical-rl (preview stuck at 0%).
  const useRaster = isWebKitEngine() && flowIsVertical(vp);
  if (!useRaster) {
    try {
      return await Promise.race([
        htmlToImageSnapshot(vp, w, h),
        timeoutMs<Uint8ClampedArray>(20000, t("snapshotFailed")),
      ]);
    } catch (err) {
      console.warn("html-to-image snapshot failed, rasterizing instead", err);
    }
  }
  return rasterizeElement(vp, w, h);
}

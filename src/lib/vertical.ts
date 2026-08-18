/**
 * 縦書き via foliate-js EPUB parsing + a fixed-size iframe.
 * We do not mount <foliate-view>: its paginator ResizeObserver grows the
 * iframe without bound and retriggers blob: resource loads.
 */

import { toCanvas } from "html-to-image";
import {
  cssFontFamily,
  detectCjkFaceFromEpub,
  pickUsedFontFamily,
  systemFontFaceCss,
  type CjkFace,
} from "./fonts";
import { t } from "./i18n";
import type { ConvertSettings, DocumentInfo, StatusFn, TocEntry, VerticalPager } from "./types";
import { clusterColumns, fallbackPageWindows, packColumnPages, type ColumnRect, type PageWindow } from "./verticalPages";

const systemCss = systemFontFaceCss();

type FoliateSection = {
  linear?: string;
  load: () => Promise<string>;
  unload?: () => void;
};

type FoliateBook = {
  metadata?: { title?: unknown; author?: unknown; creator?: unknown };
  toc?: Array<{ label?: string; href?: string; subitems?: unknown[] }>;
  sections: FoliateSection[];
  resolveHref?: (href: string) => { index?: number };
};

function metaString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return metaString(value[0]);
  if (typeof value === "object" && value) {
    const rec = value as Record<string, unknown>;
    if (rec.name) return metaString(rec.name);
    const keys = Object.keys(rec);
    if (keys.length) return metaString(rec[keys[0]]);
  }
  return "";
}

function textAlignCss(align: number): string {
  if (align === 0) return "start";
  if (align === 1) return "end";
  if (align === 2) return "center";
  return "justify";
}

function columnPitch(pageW: number, fontSize: number, lineHeightRatio: number): number {
  const requested = fontSize * lineHeightRatio;
  const cols = Math.max(1, Math.round(pageW / requested));
  return pageW / cols;
}

function bookCss(
  settings: ConvertSettings,
  fontCss: string,
  w: number,
  h: number,
  primary: CjkFace,
): string {
  const fontSize = Number(settings.fontSize) || 34;
  const lineHeight = (Number(settings.lineHeight) || 120) / 100;
  const pitch = columnPitch(w, fontSize, lineHeight);
  const align = textAlignCss(Number(settings.textAlign));
  return `
    ${fontCss}
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      overflow: hidden !important;
    }
    .lz-vp {
      box-sizing: border-box;
      width: ${w}px;
      height: ${h}px;
      overflow: hidden;
      position: relative;
      background: #fff;
    }
    .lz-clip {
      position: absolute;
      top: 0;
      right: 0;
      width: ${w}px;
      height: ${h}px;
      overflow: hidden;
    }
    .lz-mask {
      position: absolute;
      background: #fff;
      z-index: 1;
      pointer-events: none;
    }
    .lz-mask-l { left: 0; top: 0; bottom: 0; width: 0; }
    .lz-mask-r { right: 0; top: 0; bottom: 0; width: 0; }
    .lz-mask-t { left: 0; right: 0; top: 0; height: 0; }
    .lz-mask-b { left: 0; right: 0; bottom: 0; height: 0; }
    .lz-flow {
      box-sizing: border-box;
      writing-mode: vertical-rl;
      -webkit-writing-mode: vertical-rl;
      text-orientation: mixed;
      height: ${h}px;
      width: max-content;
      max-width: none;
      position: absolute;
      top: 0;
      right: 0;
      margin: 0 !important;
      padding: 0 !important;
      color: #111;
      background: #fff;
      font-family: ${cssFontFamily(settings.fontId, primary)} !important;
      font-size: ${fontSize}px;
      line-height: ${pitch}px;
      text-align: ${align};
    }
    .lz-flow, .lz-flow *:not(ruby):not(rt):not(rtc):not(rp) {
      writing-mode: vertical-rl !important;
      -webkit-writing-mode: vertical-rl !important;
    }
    .lz-flow *:not(rt):not(rtc):not(rp) {
      line-height: ${pitch}px !important;
    }
    .lz-flow *:not(rt):not(rtc):not(rp) {
      margin: 0 !important;
      padding: 0 !important;
    }
    .lz-flow ruby {
      ruby-position: over !important;
      -webkit-ruby-position: before !important;
      ruby-align: space-around;
      white-space: nowrap;
      break-inside: avoid;
    }
    .lz-flow rt, .lz-flow rtc {
      font-size: 0.5em !important;
      line-height: 1 !important;
      font-weight: 400 !important;
    }
    .lz-flow img, .lz-flow svg, .lz-flow video {
      max-width: ${Math.max(40, w)}px;
      max-height: ${Math.max(40, h)}px;
    }
    pre { white-space: pre-wrap !important; }
  `;
}

function flattenToc(
  items: Array<{ label?: string; href?: string; subitems?: unknown[] }> | undefined,
  book: FoliateBook,
  pageMap: Array<{ index: number; page: number }>,
): TocEntry[] {
  const out: TocEntry[] = [];
  const walk = (list?: typeof items) => {
    for (const item of list || []) {
      let page = 0;
      try {
        const dest = item.href ? book.resolveHref?.(item.href) : null;
        const found = pageMap.findIndex((p) => p.index === dest?.index);
        if (found >= 0) page = found;
      } catch {
        /* ignore */
      }
      if (item.label) out.push({ title: item.label, page });
      walk(item.subitems as typeof items);
    }
  };
  walk(items);
  return out;
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function loadIframe(iframe: HTMLIFrameElement, url: string): Promise<Document> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(t("sectionTimeout"))), 20000);
    iframe.onload = () => {
      window.clearTimeout(timer);
      const doc = iframe.contentDocument;
      if (!doc) {
        reject(new Error(t("sectionMissing")));
        return;
      }
      resolve(doc);
    };
    iframe.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(t("sectionFailed")));
    };
    iframe.src = url;
  });
}

function wrapDocument(doc: Document, css: string): { flow: HTMLElement; vp: HTMLElement; clip: HTMLElement } {
  doc.querySelectorAll("script").forEach((n) => n.remove());
  const style = doc.createElement("style");
  style.setAttribute("data-lazahata", "1");
  style.textContent = css;
  (doc.head || doc.documentElement).append(style);

  const flow = doc.createElement("div");
  flow.className = "lz-flow";
  const clip = doc.createElement("div");
  clip.className = "lz-clip";
  const vp = doc.createElement("div");
  vp.className = "lz-vp";
  const body = doc.body;
  while (body.firstChild) flow.append(body.firstChild);
  clip.append(flow);
  vp.append(clip);
  for (const side of ["l", "r", "t", "b"]) {
    const mask = doc.createElement("div");
    mask.className = `lz-mask lz-mask-${side}`;
    vp.append(mask);
  }
  body.append(vp);
  return { flow, vp, clip };
}

async function waitAssets(doc: Document) {
  try { await doc.fonts.ready; } catch { /* ignore */ }
  const images = Array.from(doc.images || []);
  await Promise.all(
    images.map((img) => {
      if (img.complete) return null;
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    }),
  );
  await waitFrame();
}

function isRubyAnnotation(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    const tag = el.tagName;
    if (tag === "RT" || tag === "RP" || tag === "RTC") return true;
    if (tag === "RUBY") break;
    el = el.parentElement;
  }
  return false;
}

function rubyIdOf(node: Node, flow: HTMLElement): string | undefined {
  let el = node instanceof Element ? node : node.parentElement;
  while (el && el !== flow) {
    if (el.tagName === "RUBY") {
      let id = el.getAttribute("data-lz-ruby");
      if (!id) {
        id = "rb-" + Math.random().toString(36).slice(2, 9);
        el.setAttribute("data-lz-ruby", id);
      }
      return id;
    }
    el = el.parentElement;
  }
  return undefined;
}

function collectColumnRects(flow: HTMLElement): ColumnRect[] {
  const doc = flow.ownerDocument;
  const rects: ColumnRect[] = [];
  const range = doc.createRange();
  const walker = doc.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (!isRubyAnnotation(node) && node.textContent && node.textContent.trim()) {
      range.selectNodeContents(node);
      const list = range.getClientRects();
      const group = rubyIdOf(node, flow);
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        if (r.width > 0.5 && r.height > 0.5) {
          rects.push({ left: r.left, right: r.right, group });
        }
      }
    }
    node = walker.nextNode();
  }
  const rubies = flow.querySelectorAll("ruby");
  for (let i = 0; i < rubies.length; i++) {
    const ruby = rubies[i];
    const group = rubyIdOf(ruby, flow);
    const list = ruby.getClientRects();
    for (let j = 0; j < list.length; j++) {
      const r = list[j];
      if (r.width > 0.5 && r.height > 0.5) {
        rects.push({ left: r.left, right: r.right, group });
      }
    }
  }
  const replaced = flow.querySelectorAll("img, svg, video, canvas");
  for (let i = 0; i < replaced.length; i++) {
    const r = replaced[i].getBoundingClientRect();
    if (r.width > 0.5 && r.height > 0.5) {
      rects.push({ left: r.left, right: r.right });
    }
  }
  return rects;
}

function pageWindowsOf(
  flow: HTMLElement,
  pageW: number,
  margin: number,
  pitch: number,
): PageWindow[] {
  const usable = Math.max(1, pageW - margin * 2);
  const clipRight = pageW - margin;
  flow.style.transform = "";
  const columns = clusterColumns(collectColumnRects(flow), pitch);
  if (!columns.length) {
    const width = Math.max(flow.scrollWidth, flow.offsetWidth, usable);
    return fallbackPageWindows(width, usable);
  }
  return packColumnPages(columns, usable, clipRight);
}

function showPage(
  flow: HTMLElement,
  clip: HTMLElement,
  vp: HTMLElement,
  pages: PageWindow[],
  page: number,
  pageW: number,
  margin: number,
) {
  const loc = pages[Math.max(0, Math.min(pages.length - 1, page))] || { shift: 0, width: 1 };
  flow.style.transform = `translateX(${loc.shift}px)`;
  clip.style.width = `${loc.width}px`;
  const leftMask = vp.querySelector(".lz-mask-l") as HTMLElement | null;
  if (leftMask) {
    leftMask.style.width = `${Math.max(margin, pageW - margin - loc.width)}px`;
  }
}

async function snapshotViewport(vp: HTMLElement, w: number, h: number): Promise<Uint8ClampedArray> {
  const canvas = await toCanvas(vp, {
    width: w,
    height: h,
    pixelRatio: 1,
    backgroundColor: "#ffffff",
    cacheBust: false,
    fontEmbedCSS: systemCss,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("snapshotFailed"));
  return new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
}

export async function createVerticalPager(
  file: File,
  settings: ConvertSettings,
  onStatus?: StatusFn,
  opts?: { maxPages?: number },
): Promise<{
  pager: VerticalPager;
  info: DocumentInfo;
  toc: TocEntry[];
  pageCount: number;
  truncated: boolean;
  usedFontFamily: string;
}> {
  const { w, h } = settings.device;
  const margin = 0;
  const fontSize = Number(settings.fontSize) || 34;
  const lineHeight = (Number(settings.lineHeight) || 120) / 100;
  const pitch = columnPitch(w, fontSize, lineHeight);
  if (onStatus) onStatus(t("openingFoliate"));
  const [{ makeBook }, cjkFace] = await Promise.all([
    import("foliate-js/view.js") as Promise<{ makeBook: (f: File) => Promise<FoliateBook> }>,
    detectCjkFaceFromEpub(file),
  ]);
  const book = await makeBook(file);
  const usedFontFamily = pickUsedFontFamily(settings.fontId, cjkFace);
  const css = bookCss(settings, systemCss, w, h, cjkFace || "jp");

  const host = document.createElement("div");
  host.setAttribute("data-lazahata-foliate", "1");
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${w}px`,
    `height:${h}px`,
    "overflow:hidden",
    "contain:strict",
    "opacity:0",
    "z-index:-1",
    "pointer-events:none",
    "background:#fff",
  ].join(";");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.setAttribute("scrolling", "no");
  iframe.style.cssText = `display:block;width:${w}px;height:${h}px;border:0;`;
  host.append(iframe);
  document.body.append(host);

  try {
    return await finishVerticalPager();
  } catch (err) {
    host.remove();
    throw err;
  }

  async function finishVerticalPager() {
  const linear = book.sections
    .map((section, index) => (section.linear === "no" ? -1 : index))
    .filter((index) => index >= 0);

  if (!linear.length) {
    throw new Error(t("noPages"));
  }

  let currentIndex = -1;
  let currentFlow: HTMLElement | null = null;
  let currentVp: HTMLElement | null = null;
  let currentClip: HTMLElement | null = null;
  let currentPages: PageWindow[] = [{ shift: 0, width: Math.max(1, w - margin * 2) }];

  async function openSection(index: number) {
    if (currentIndex === index && currentFlow && currentVp && currentClip) {
      return { flow: currentFlow, vp: currentVp, clip: currentClip, pages: currentPages };
    }
    const prev = currentIndex >= 0 ? book.sections[currentIndex] : null;
    const url = await book.sections[index].load();
    const doc = await loadIframe(iframe, url);
    if (prev && prev !== book.sections[index]) prev.unload?.();
    const wrapped = wrapDocument(doc, css);
    currentFlow = wrapped.flow;
    currentVp = wrapped.vp;
    currentClip = wrapped.clip;
    await waitAssets(doc);
    currentPages = pageWindowsOf(currentFlow, w, margin, pitch);
    currentIndex = index;
    return { flow: currentFlow, vp: currentVp, clip: currentClip, pages: currentPages };
  }

  if (onStatus) onStatus(opts?.maxPages ? t("buildingPreview") : t("countingVertical"));
  const pageMap: Array<{ index: number; page: number }> = [];
  let truncated = false;
  for (let s = 0; s < linear.length; s++) {
    const index = linear[s];
    const { pages } = await openSection(index);
    const n = pages.length;
    for (let p = 0; p < n; p++) {
      if (opts?.maxPages && pageMap.length >= opts.maxPages) {
        truncated = true;
        break;
      }
      pageMap.push({ index, page: p });
    }
    if (truncated) break;
    if (opts?.maxPages && pageMap.length >= opts.maxPages && s < linear.length - 1) {
      truncated = true;
      break;
    }
  }

  if (!pageMap.length) {
    host.remove();
    throw new Error(t("noPages"));
  }

  const title = metaString(book.metadata?.title) || file.name.replace(/\.epub$/i, "");
  const author = metaString(book.metadata?.author) || metaString(book.metadata?.creator);
  const toc = flattenToc(book.toc, book, pageMap);
  const cache = new Map<string, Uint8ClampedArray>();

  async function renderPage(pageIndex: number): Promise<Uint8ClampedArray> {
    const loc = pageMap[Math.max(0, Math.min(pageMap.length - 1, pageIndex))];
    const key = loc.index + ":" + loc.page;
    const hit = cache.get(key);
    if (hit) return hit;
    const { flow, vp, clip, pages } = await openSection(loc.index);
    showPage(flow, clip, vp, pages, loc.page, w, margin);
    await waitFrame();
    const copy = await snapshotViewport(vp, w, h);
    cache.set(key, copy);
    return copy;
  }

  if (onStatus) onStatus(t("foliateReady", { n: pageMap.length }));

  return {
    info: { title, author, authors: author },
    toc,
    pageCount: pageMap.length,
    truncated,
    usedFontFamily,
    pager: {
      pageCount: pageMap.length,
      renderPage,
      destroy() {
        cache.clear();
        try { book.sections[currentIndex]?.unload?.(); } catch { /* ignore */ }
        iframe.src = "about:blank";
        host.remove();
      },
    },
  };
  }
}

/**
 * 縦書き pager. Owns all vertical-rl output. Accepts any Foliate-shaped Book.
 * Do not teach this file 横書き. Do not mount <foliate-view>: its paginator
 * ResizeObserver grows the iframe without bound and retriggers blob: loads.
 */

import {
  cssFontFamily,
  detectCjkFaceFromEpub,
  isCjkFace,
  pickUsedFontFamily,
  systemFontFaceCss,
  type CjkFace,
} from "../fonts";
import { t } from "../i18n";
import {
  capPageCount,
  isWebKitEngine,
  loadIframe,
  pagerHostCss,
  snapshotViewport,
  waitFrame,
} from "./snapshot";
import {
  clusterColumns,
  fallbackPageWindows,
  packColumnPages,
  type ColumnRect,
} from "./verticalPages";
import type {
  Book,
  ConvertSettings,
  DocumentInfo,
  StatusFn,
  TocEntry,
  VerticalPager,
} from "../types";
const systemCss = systemFontFaceCss();

type PageWindow = { shift: number; axis: "x" | "y"; width?: number };

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
  webkit: boolean,
): string {
  const fontSize = Number(settings.fontSize) || 34;
  const lineHeight = (Number(settings.lineHeight) || 120) / 100;
  const pitch = columnPitch(w, fontSize, lineHeight);
  const align = textAlignCss(Number(settings.textAlign));
  // WebKit's CSS columns + vertical-rl overlap in one box and hang
  // html-to-image. Use native tategaki (max-content, grow left) instead.
  const flowBox = webkit
    ? `width: max-content; max-width: none; max-height: ${h}px; column-width: auto; column-count: auto;`
    : `width: ${w}px; max-width: none; max-height: ${h}px; column-width: ${h}px; column-gap: 0; column-fill: auto;`;
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
    .lz-flow {
      box-sizing: border-box;
      writing-mode: vertical-rl;
      -webkit-writing-mode: vertical-rl;
      text-orientation: mixed;
      height: ${h}px;
      width: ${w}px;
      max-width: none;
      max-height: ${h}px;
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
      ${flowBox}
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
      page-break-inside: avoid;
    }
    .lz-flow rt, .lz-flow rtc {
      font-size: 0.5em !important;
      line-height: 1 !important;
      font-weight: 400 !important;
    }
    .lz-flow img, .lz-flow svg, .lz-flow video, .lz-flow canvas {
      box-sizing: border-box;
      display: block;
      max-width: ${Math.max(1, w - 2)}px;
      max-height: ${Math.max(1, h - 2)}px;
      object-fit: contain;
      break-inside: avoid;
      break-before: column;
      break-after: column;
      page-break-inside: avoid;
    }
    pre { white-space: pre-wrap !important; }
  `;
}

function flattenToc(
  items: Book["toc"],
  book: Book,
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
      walk(item.subitems);
    }
  };
  walk(items);
  return out;
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
  body.append(vp);
  return { flow, vp, clip };
}

async function waitAssets(doc: Document) {
  async function waitWithLimit(promise: Promise<unknown>, label: string, timeoutMs: number) {
    let timer = 0;
    let timedOut = false;
    await Promise.race([
      promise.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = window.setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      }),
    ]);
    window.clearTimeout(timer);
    if (timedOut) console.warn(`Timed out waiting for EPUB ${label}.`);
    return timedOut;
  }

  const fontsTimedOut = await waitWithLimit(Promise.resolve(doc.fonts.ready), "fonts", 5000);
  if (fontsTimedOut) console.warn("Continuing with the configured fallback font.");
  const images = Array.from(doc.images || []);
  await waitWithLimit(
    Promise.all(
      images.map((img) => {
        if (img.complete) return null;
        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        });
      }),
    ),
    "images",
    10000,
  );
  const unavailableImages = images.filter((img) => !img.complete || img.naturalWidth <= 0);
  if (unavailableImages.length) {
    console.error("EPUB images unavailable:", unavailableImages.length);
    throw new Error(t("sectionFailed"));
  }
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
  clip: HTMLElement,
  pageW: number,
  pageH: number,
  pitch: number,
): PageWindow[] {
  flow.style.transform = "";
  clip.style.width = "";
  void flow.offsetWidth;
  void clip.offsetHeight;

  if (isWebKitEngine()) {
    const clipRight = clip.getBoundingClientRect().right;
    const columns = clusterColumns(collectColumnRects(flow), pitch);
    if (columns.length) {
      const packed = packColumnPages(columns, Math.max(1, pageW), clipRight);
      return packed.slice(0, capPageCount(packed.length)).map((page) => ({
        shift: page.shift,
        axis: "x" as const,
        width: page.width,
      }));
    }
    const totalWidth = Math.max(flow.scrollWidth, clip.scrollWidth, pageW);
    const fallback = fallbackPageWindows(totalWidth, pageW);
    return fallback.slice(0, capPageCount(fallback.length)).map((page) => ({
      shift: page.shift,
      axis: "x" as const,
      width: page.width,
    }));
  }

  const totalWidth = Math.max(flow.scrollWidth, clip.scrollWidth, pageW);
  const totalHeight = Math.max(flow.scrollHeight, clip.scrollHeight, pageH);
  const xPages = Math.max(1, Math.round(totalWidth / pageW));
  const yPages = Math.max(1, Math.round(totalHeight / pageH));
  if (xPages >= yPages && totalWidth > pageW + 2) {
    const count = capPageCount(xPages);
    return Array.from({ length: count }, (_, page) => ({ shift: page * pageW, axis: "x" as const }));
  }
  const count = capPageCount(yPages);
  return Array.from({ length: count }, (_, page) => ({ shift: page * pageH, axis: "y" as const }));
}

function showPage(flow: HTMLElement, clip: HTMLElement, pages: PageWindow[], page: number) {
  const loc = pages[Math.max(0, Math.min(pages.length - 1, page))] || { shift: 0, axis: "y" as const };
  if (loc.axis === "x") {
    flow.style.transform = `translateX(${loc.shift}px)`;
    clip.style.width = loc.width ? `${loc.width}px` : "";
  } else {
    flow.style.transform = `translateY(${-loc.shift}px)`;
    clip.style.width = "";
  }
}

export async function createVerticalPager(
  book: Book,
  settings: ConvertSettings,
  onStatus?: StatusFn,
  opts?: { maxPages?: number; titleFallback?: string; file?: File },
): Promise<{
  pager: VerticalPager;
  info: DocumentInfo;
  toc: TocEntry[];
  pageCount: number;
  truncated: boolean;
  usedFontFamily: string;
}> {
  const { w, h } = settings.device;
  const pitch = columnPitch(w, Number(settings.fontSize) || 34, (Number(settings.lineHeight) || 120) / 100);
  if (onStatus) onStatus(t("openingFoliate"));
  const cjkFace: CjkFace | null = isCjkFace(book.script)
    ? book.script
    : opts?.file
      ? await detectCjkFaceFromEpub(opts.file)
      : null;
  const usedFontFamily = pickUsedFontFamily(settings.fontId, cjkFace);
  const css = bookCss(settings, systemCss, w, h, cjkFace || "jp", isWebKitEngine());

  const host = document.createElement("div");
  host.setAttribute("data-lazahata-foliate", "1");
  host.style.cssText = pagerHostCss(w, h);

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
  let currentPages: PageWindow[] = [{ shift: 0, axis: "y" }];
  const sectionPages = new Map<number, PageWindow[]>();

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
    currentPages = sectionPages.get(index) || pageWindowsOf(currentFlow, currentClip, w, h, pitch);
    sectionPages.set(index, currentPages);
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

  const title = metaString(book.metadata?.title) || opts?.titleFallback || "";
  const author = metaString(book.metadata?.author) || metaString(book.metadata?.creator);
  const toc = flattenToc(book.toc, book, pageMap);
  const cache = new Map<string, Uint8ClampedArray>();

  async function renderPage(pageIndex: number): Promise<Uint8ClampedArray> {
    const loc = pageMap[Math.max(0, Math.min(pageMap.length - 1, pageIndex))];
    const key = loc.index + ":" + loc.page;
    const hit = cache.get(key);
    if (hit) return hit;
    const { flow, vp, clip, pages } = await openSection(loc.index);
    showPage(flow, clip, pages, loc.page);
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
        sectionPages.clear();
        try { book.sections[currentIndex]?.unload?.(); } catch { /* ignore */ }
        iframe.src = "about:blank";
        host.remove();
      },
    },
  };
  }
}

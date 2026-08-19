/**
 * 横書き pager. Owns horizontal-tb output.
 * Twin of vertical.ts: hidden iframe → CSS columns → html-to-image.
 * column-width = page width, measure scrollWidth, translateX.
 * Do not mount <foliate-view>. Do not teach this file 縦書き.
 */

import { toCanvas } from "html-to-image";
import { cssFontFamily, pickUsedFontFamily, systemFontFaceCss, type ScriptId } from "./fonts";
import { t } from "./i18n";
import type { Book, ConvertSettings, DocumentInfo, StatusFn, TocEntry, VerticalPager } from "./types";

const systemCss = systemFontFaceCss();

type PageWindow = { shift: number };

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

function bookCss(settings: ConvertSettings, fontCss: string, w: number, h: number, script: ScriptId | null): string {
  const fontSize = Number(settings.fontSize) || 34;
  const lineHeight = (Number(settings.lineHeight) || 120) / 100;
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
      left: 0;
      width: ${w}px;
      height: ${h}px;
      overflow: hidden;
    }
    .lz-flow {
      box-sizing: border-box;
      writing-mode: horizontal-tb;
      -webkit-writing-mode: horizontal-tb;
      height: ${h}px;
      width: ${w}px;
      max-height: ${h}px;
      position: absolute;
      top: 0;
      left: 0;
      margin: 0 !important;
      padding: 0 !important;
      color: #111;
      background: #fff;
      font-family: ${cssFontFamily(settings.fontId, script)} !important;
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      text-align: ${align};
      column-width: ${w}px;
      column-gap: 0;
      column-fill: auto;
    }
    .lz-flow, .lz-flow * {
      writing-mode: horizontal-tb !important;
      -webkit-writing-mode: horizontal-tb !important;
    }
    .lz-flow p {
      margin: 0 0 0.6em 0 !important;
      padding: 0 !important;
    }
    .lz-flow img, .lz-flow svg, .lz-flow video, .lz-flow canvas {
      box-sizing: border-box;
      display: block;
      max-width: ${Math.max(1, w - 2)}px;
      max-height: ${Math.max(1, h - 2)}px;
      object-fit: contain;
      break-inside: avoid;
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
  body.append(vp);
  return { flow, vp, clip };
}

async function waitAssets(doc: Document) {
  async function waitWithLimit(promise: Promise<unknown>, timeoutMs: number) {
    let timer = 0;
    await Promise.race([
      promise.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = window.setTimeout(() => resolve(), timeoutMs);
      }),
    ]);
    window.clearTimeout(timer);
  }
  await waitWithLimit(Promise.resolve(doc.fonts.ready), 5000);
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
    10000,
  );
  await waitFrame();
}

function pageWindowsOf(flow: HTMLElement, clip: HTMLElement, pageW: number): PageWindow[] {
  flow.style.transform = "";
  const totalWidth = Math.max(flow.scrollWidth, clip.scrollWidth, pageW);
  const count = Math.max(1, Math.round(totalWidth / pageW));
  return Array.from({ length: count }, (_, page) => ({ shift: page * pageW }));
}

function showPage(flow: HTMLElement, pages: PageWindow[], page: number) {
  const loc = pages[Math.max(0, Math.min(pages.length - 1, page))] || { shift: 0 };
  // Inline left as well: html-to-image often drops transform and repeats page 1.
  flow.style.transform = `translateX(${-loc.shift}px)`;
  flow.style.left = `${-loc.shift}px`;
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

export async function createHorizontalPager(
  book: Book,
  settings: ConvertSettings,
  onStatus?: StatusFn,
  opts?: { maxPages?: number; titleFallback?: string },
): Promise<{
  pager: VerticalPager;
  info: DocumentInfo;
  toc: TocEntry[];
  pageCount: number;
  truncated: boolean;
  usedFontFamily: string;
}> {
  const { w, h } = settings.device;
  const script = book.script ?? null;
  const usedFontFamily = pickUsedFontFamily(settings.fontId, script);
  const css = bookCss(settings, systemCss, w, h, script);

  const host = document.createElement("div");
  host.setAttribute("data-lazahata-horizontal", "1");
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
    return await finishHorizontalPager();
  } catch (err) {
    host.remove();
    throw err;
  }

  async function finishHorizontalPager() {
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
    let currentPages: PageWindow[] = [{ shift: 0 }];
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
      currentPages = sectionPages.get(index) || pageWindowsOf(currentFlow, currentClip, w);
      sectionPages.set(index, currentPages);
      currentIndex = index;
      return { flow: currentFlow, vp: currentVp, clip: currentClip, pages: currentPages };
    }

    if (onStatus) onStatus(opts?.maxPages ? t("buildingPreview") : t("convertingFull"));
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
      const { flow, vp, pages } = await openSection(loc.index);
      showPage(flow, pages, loc.page);
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
          try {
            book.sections[currentIndex]?.unload?.();
          } catch {
            /* ignore */
          }
          iframe.src = "about:blank";
          host.remove();
        },
      },
    };
  }
}

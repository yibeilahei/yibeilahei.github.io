/**
 * Format registry. EPUB, TXT, MOBI/AZW, and FB2 are wired.
 * Auto is markup sample → textLooksVertical. Do not feed TXT/MOBI/FB2 to CREngine.
 */

import { encodeXthPage, buildXtchContainer, outputNameFromSource } from "./xtch";
import { ensureRenderer, applyRenderSettings } from "./engine";
import { pagerKind, sampleEpubMarkup } from "./detectVertical";
import { detectScriptFromEpub } from "./fonts";
import { t } from "./i18n";
import type {
  AdapterSniff,
  Book,
  BookSession,
  Converter,
  ConvertHooks,
  ConvertResult,
  ConvertSettings,
  StatusFn,
} from "./types";

const converters: Converter[] = [];

export const COMING_SOON: { id: string; label: string; extensions: string[] }[] = [];

export function registerConverter(converter: Converter) {
  converters.push(converter);
}

export function listConverters(): Converter[] {
  return converters.slice();
}

export function matchConverter(file: File): Converter | null {
  return converters.find((c) => c.accepts(file)) || null;
}

export async function matchConverterAsync(file: File): Promise<Converter | null> {
  const hit = matchConverter(file);
  if (hit) return hit;
  const { isMobiMagic } = await import("./mobi");
  if (await isMobiMagic(file)) return converters.find((c) => c.id === "mobi") || null;
  const { isFb2File } = await import("./fb2");
  if (await isFb2File(file)) return converters.find((c) => c.id === "fb2") || null;
  return null;
}

export function acceptAttribute(): string {
  return converters.flatMap((c) => [...c.extensions, ...(c.mimeTypes || [])]).join(",");
}

export function isSupportedName(name: string): boolean {
  const lower = name.toLowerCase();
  return converters.some((c) => c.extensions.some((ext) => lower.endsWith(ext)));
}

export function comingSoonFor(name: string) {
  const lower = name.toLowerCase();
  return COMING_SOON.find((f) => f.extensions.some((ext) => lower.endsWith(ext))) || null;
}

function yieldToMain() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal && signal.aborted) {
    const err = new Error("Cancelled");
    err.name = "AbortError";
    throw err;
  }
}

async function renderSessionPage(session: BookSession, pageIndex: number) {
  if (session.pager) return session.pager.renderPage(pageIndex);
  if (session.renderer) {
    session.renderer.goToPage(pageIndex);
    session.renderer.renderCurrentPage();
    const frame = session.renderer.getFrameBuffer();
    if (!frame || frame.length === 0) {
      throw new Error(t("emptyFrame", { n: pageIndex + 1 }));
    }
    return frame;
  }
  throw new Error(t("rendererNotReady"));
}

async function convertSession(
  this: Converter,
  file: File,
  settings: ConvertSettings,
  { onProgress, onStatus, signal, maxPages }: ConvertHooks = {},
): Promise<ConvertResult> {
  const session = await this.load(file, settings, onStatus, { maxPages });
  const available = session.pageCount;
  const limit = maxPages ? Math.min(maxPages, available) : available;
  const pages: Uint8Array[] = [];
  try {
    for (let i = 0; i < limit; i++) {
      assertNotCancelled(signal);
      const frame = await renderSessionPage(session, i);
      pages.push(encodeXthPage(frame, session.width, session.height));
      if (onProgress) onProgress((i + 1) / limit, i + 1, limit);
      if (i % 4 === 3) await yieldToMain();
    }
  } finally {
    session.pager?.destroy();
  }
  const dir = Number(settings.readDirection);
  const readDirection = dir === 1 || dir === 2 ? dir : 0;
  const bytes = buildXtchContainer(
    pages,
    session.width,
    session.height,
    session.info,
    session.toc,
    { readDirection },
  );
  const partial = Boolean(session.truncated) || (maxPages != null && available > maxPages);
  return {
    bytes,
    filename: outputNameFromSource(file.name, settings.renameFromTitle ? session.info.title || "" : ""),
    info: session.info,
    pageCount: limit,
    partial,
    engine: session.kind === "crengine" ? "crengine" : "foliate",
    usedFontFamily: session.usedFontFamily,
  };
}

const EpubConverter: Converter = {
  id: "epub",
  label: "EPUB",
  extensions: [".epub"],
  mimeTypes: ["application/epub+zip"],
  accepts(file) {
    return /\.epub$/i.test(file.name) || file.type === "application/epub+zip";
  },

  async sniff(file) {
    const [markup, script] = await Promise.all([
      sampleEpubMarkup(file),
      detectScriptFromEpub(file),
    ]);
    return { markup, script, encoding: null };
  },

  async load(file, settings, onStatus?: StatusFn, opts?: { maxPages?: number }) {
    const { w, h } = settings.device;
    let sniff: AdapterSniff | null = null;
    const layout = pagerKind(settings.writingMode, this.id, settings.epubCrengine !== false);
    if (layout === "vertical") {
      if (onStatus) onStatus(t("verticalFoliate"));
      const [{ createVerticalPager }, { makeBook }] = await Promise.all([
        import("./vertical"),
        import("foliate-js/view.js") as Promise<{ makeBook: (f: File) => Promise<Book> }>,
      ]);
      const book = await makeBook(file);
      const vertical = await createVerticalPager(
        book,
        { ...settings, writingMode: "vertical" },
        onStatus,
        {
          maxPages: opts?.maxPages,
          titleFallback: file.name.replace(/\.epub$/i, ""),
          file,
        },
      );
      return {
        kind: "vertical" as const,
        pager: vertical.pager,
        pageCount: vertical.pageCount,
        info: vertical.info,
        toc: vertical.toc,
        width: w,
        height: h,
        converter: this,
        truncated: vertical.truncated,
        usedFontFamily: vertical.usedFontFamily,
      };
    }

    if (layout === "horizontal") {
      if (onStatus) onStatus(t("horizontalFoliate"));
      const [{ createHorizontalPager }, { makeBook }] = await Promise.all([
        import("./horizontal"),
        import("foliate-js/view.js") as Promise<{ makeBook: (f: File) => Promise<Book> }>,
      ]);
      const book = await makeBook(file);
      if (!sniff) sniff = await this.sniff(file);
      if (sniff.script) book.script = sniff.script;
      const horizontal = await createHorizontalPager(
        book,
        { ...settings, writingMode: "horizontal" },
        onStatus,
        {
          maxPages: opts?.maxPages,
          titleFallback: file.name.replace(/\.epub$/i, ""),
        },
      );
      return {
        kind: "horizontal" as const,
        pager: horizontal.pager,
        pageCount: horizontal.pageCount,
        info: horizontal.info,
        toc: horizontal.toc,
        width: w,
        height: h,
        converter: this,
        truncated: horizontal.truncated,
        usedFontFamily: horizontal.usedFontFamily,
      };
    }

    const detectedScript = (sniff ?? (await this.sniff(file))).script ?? (await detectScriptFromEpub(file));
    const { module, renderer, usedFontFamily, fallbackFamily } = await ensureRenderer(
      w,
      h,
      onStatus,
      {
        fontId: settings.fontId,
        detected: detectedScript,
      },
    );
    if (onStatus) onStatus(t("openingFile", { name: file.name }));
    const data = new Uint8Array(await file.arrayBuffer());
    const ptr = module.allocateMemory(data.length);
    module.HEAPU8.set(data, ptr);
    try {
      renderer.loadEpubFromMemory(ptr, data.length);
    } finally {
      module.freeMemory(ptr);
    }
    applyRenderSettings(renderer, {
      ...settings,
      fontFace: usedFontFamily,
      fallbackFace: fallbackFamily,
      detectedCjk: detectedScript,
    });
    const pageCount = renderer.getPageCount();
    if (!pageCount || pageCount <= 0) throw new Error(t("noPages"));
    const info = (renderer.getDocumentInfo && renderer.getDocumentInfo()) || {};
    if (!info.title) info.title = file.name.replace(/\.epub$/i, "");
    const toc = (renderer.getToc && renderer.getToc()) || [];
    return {
      kind: "crengine" as const,
      module,
      renderer,
      pageCount,
      info,
      toc,
      width: w,
      height: h,
      converter: this,
      usedFontFamily,
    };
  },

  renderPage: renderSessionPage,
  convert: convertSession,
};

registerConverter(EpubConverter);

const TxtConverter: Converter = {
  id: "txt",
  label: "TXT",
  extensions: [".txt"],
  mimeTypes: ["text/plain"],
  accepts(file) {
    return /\.txt$/i.test(file.name) || file.type === "text/plain";
  },

  async sniff(file) {
    const { sniffTxt } = await import("./txt");
    const sniff = await sniffTxt(file);
    return { markup: "", script: sniff.script, encoding: sniff.encoding };
  },

  async load(file, settings, onStatus?: StatusFn, opts?: { maxPages?: number }) {
    const { w, h } = settings.device;
    if (onStatus) onStatus(t("buildingPreview"));
    const { bookFromTxt } = await import("./txt");
    const book = await bookFromTxt(file, settings.txtEncoding || "auto");
    const titleFallback = file.name.replace(/\.txt$/i, "");
    if (pagerKind(settings.writingMode, this.id) === "vertical") {
      const { createVerticalPager } = await import("./vertical");
      const vertical = await createVerticalPager(book, { ...settings, writingMode: "vertical" }, onStatus, {
        maxPages: opts?.maxPages,
        titleFallback,
      });
      return {
        kind: "vertical" as const,
        pager: vertical.pager,
        pageCount: vertical.pageCount,
        info: vertical.info,
        toc: vertical.toc,
        width: w,
        height: h,
        converter: this,
        truncated: vertical.truncated,
        usedFontFamily: vertical.usedFontFamily,
      };
    }
    const { createHorizontalPager } = await import("./horizontal");
    const horizontal = await createHorizontalPager(book, settings, onStatus, {
      maxPages: opts?.maxPages,
      titleFallback,
    });
    return {
      kind: "horizontal" as const,
      pager: horizontal.pager,
      pageCount: horizontal.pageCount,
      info: horizontal.info,
      toc: horizontal.toc,
      width: w,
      height: h,
      converter: this,
      truncated: horizontal.truncated,
      usedFontFamily: horizontal.usedFontFamily,
    };
  },

  renderPage: renderSessionPage,
  convert: convertSession,
};

registerConverter(TxtConverter);

const MobiConverter: Converter = {
  id: "mobi",
  label: "MOBI / AZW3",
  extensions: [".mobi", ".azw", ".azw3"],
  mimeTypes: ["application/x-mobipocket-ebook"],
  accepts(file) {
    return /\.(mobi|azw|azw3)$/i.test(file.name) || file.type === "application/x-mobipocket-ebook";
  },

  async sniff(file) {
    const { sniffMobi } = await import("./mobi");
    const sniff = await sniffMobi(file);
    return { markup: sniff.markup, script: sniff.script, encoding: null };
  },

  async load(file, settings, onStatus?: StatusFn, opts?: { maxPages?: number }) {
    const { w, h } = settings.device;
    if (onStatus) onStatus(t("buildingPreview"));
    const { openMobiBook } = await import("./mobi");
    const book = await openMobiBook(file);
    const titleFallback = file.name.replace(/\.(mobi|azw|azw3)$/i, "");
    if (pagerKind(settings.writingMode, this.id) === "vertical") {
      const { createVerticalPager } = await import("./vertical");
      const vertical = await createVerticalPager(book, { ...settings, writingMode: "vertical" }, onStatus, {
        maxPages: opts?.maxPages,
        titleFallback,
      });
      return {
        kind: "vertical" as const,
        pager: vertical.pager,
        pageCount: vertical.pageCount,
        info: vertical.info,
        toc: vertical.toc,
        width: w,
        height: h,
        converter: this,
        truncated: vertical.truncated,
        usedFontFamily: vertical.usedFontFamily,
      };
    }
    const { createHorizontalPager } = await import("./horizontal");
    const horizontal = await createHorizontalPager(book, settings, onStatus, {
      maxPages: opts?.maxPages,
      titleFallback,
    });
    return {
      kind: "horizontal" as const,
      pager: horizontal.pager,
      pageCount: horizontal.pageCount,
      info: horizontal.info,
      toc: horizontal.toc,
      width: w,
      height: h,
      converter: this,
      truncated: horizontal.truncated,
      usedFontFamily: horizontal.usedFontFamily,
    };
  },

  renderPage: renderSessionPage,
  convert: convertSession,
};

registerConverter(MobiConverter);

const Fb2Converter: Converter = {
  id: "fb2",
  label: "FB2",
  extensions: [".fb2", ".fbz"],
  mimeTypes: ["application/x-fictionbook+xml", "application/x-zip-compressed-fb2"],
  accepts(file) {
    const lower = file.name.toLowerCase();
    return (
      lower.endsWith(".fb2") ||
      lower.endsWith(".fbz") ||
      lower.endsWith(".fb2.zip") ||
      file.type === "application/x-fictionbook+xml" ||
      file.type === "application/x-zip-compressed-fb2"
    );
  },

  async sniff(file) {
    const { sniffFb2 } = await import("./fb2");
    const sniff = await sniffFb2(file);
    return { markup: sniff.markup, script: sniff.script, encoding: null };
  },

  async load(file, settings, onStatus?: StatusFn, opts?: { maxPages?: number }) {
    const { w, h } = settings.device;
    if (onStatus) onStatus(t("buildingPreview"));
    const { openFb2Book } = await import("./fb2");
    const book = await openFb2Book(file);
    const titleFallback = file.name.replace(/\.(fb2\.zip|fb2|fbz)$/i, "");
    if (pagerKind(settings.writingMode, this.id) === "vertical") {
      const { createVerticalPager } = await import("./vertical");
      const vertical = await createVerticalPager(book, { ...settings, writingMode: "vertical" }, onStatus, {
        maxPages: opts?.maxPages,
        titleFallback,
      });
      return {
        kind: "vertical" as const,
        pager: vertical.pager,
        pageCount: vertical.pageCount,
        info: vertical.info,
        toc: vertical.toc,
        width: w,
        height: h,
        converter: this,
        truncated: vertical.truncated,
        usedFontFamily: vertical.usedFontFamily,
      };
    }
    const { createHorizontalPager } = await import("./horizontal");
    const horizontal = await createHorizontalPager(book, settings, onStatus, {
      maxPages: opts?.maxPages,
      titleFallback,
    });
    return {
      kind: "horizontal" as const,
      pager: horizontal.pager,
      pageCount: horizontal.pageCount,
      info: horizontal.info,
      toc: horizontal.toc,
      width: w,
      height: h,
      converter: this,
      truncated: horizontal.truncated,
      usedFontFamily: horizontal.usedFontFamily,
    };
  },

  renderPage: renderSessionPage,
  convert: convertSession,
};

registerConverter(Fb2Converter);

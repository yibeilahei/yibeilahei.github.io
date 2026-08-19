/**
 * Format registry. EPUB is the only adapter today.
 * Later adapters (TXT, MOBI/AZW, FB2, CBZ) produce the shared Book shape
 * in types.ts; pagers split on writing mode, not file type.
 * Do not feed TXT/MOBI/AZW/FB2 to CREngine.
 */

import { encodeXthPage, buildXtchContainer, outputNameFromSource } from "./xtch";
import { ensureRenderer, applyRenderSettings } from "./engine";
import { resolveLayoutEngine } from "./detectVertical";
import { detectScriptFromEpub } from "./fonts";
import { t } from "./i18n";
import type {
  BookSession,
  Converter,
  ConvertHooks,
  ConvertSettings,
  StatusFn,
} from "./types";

const converters: Converter[] = [];

export const COMING_SOON = [
  { id: "mobi", label: "MOBI / AZW3", extensions: [".mobi", ".azw3"] },
];

export function registerConverter(converter: Converter) {
  converters.push(converter);
}

export function listConverters(): Converter[] {
  return converters.slice();
}

export function matchConverter(file: File): Converter | null {
  return converters.find((c) => c.accepts(file)) || null;
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

const EpubConverter: Converter = {
  id: "epub",
  label: "EPUB",
  extensions: [".epub"],
  mimeTypes: ["application/epub+zip"],
  accepts(file) {
    return /\.epub$/i.test(file.name) || file.type === "application/epub+zip";
  },

  async load(file, settings, onStatus?: StatusFn, opts?: { maxPages?: number }) {
    const { w, h } = settings.device;
    const layout = await resolveLayoutEngine(file, settings.writingMode);
    if (layout.engine === "foliate") {
      if (onStatus) onStatus(t("verticalFoliate"));
      const { createVerticalPager } = await import("./vertical");
      const vertical = await createVerticalPager(
        file,
        { ...settings, writingMode: "vertical" },
        onStatus,
        { maxPages: opts?.maxPages },
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

    const detectedScript = await detectScriptFromEpub(file);
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

  async renderPage(session: BookSession, pageIndex: number) {
    if (session.kind === "vertical" && session.pager) {
      return session.pager.renderPage(pageIndex);
    }
    if (!session.renderer) throw new Error(t("rendererNotReady"));
    session.renderer.goToPage(pageIndex);
    session.renderer.renderCurrentPage();
    const frame = session.renderer.getFrameBuffer();
    if (!frame || frame.length === 0) {
      throw new Error(t("emptyFrame", { n: pageIndex + 1 }));
    }
    return frame;
  },

  async convert(file, settings: ConvertSettings, { onProgress, onStatus, signal, maxPages }: ConvertHooks = {}) {
    const session = await this.load(file, settings, onStatus, { maxPages });
    const available = session.pageCount;
    const limit = maxPages ? Math.min(maxPages, available) : available;
    const pages: Uint8Array[] = [];
    try {
      for (let i = 0; i < limit; i++) {
        assertNotCancelled(signal);
        const frame = await this.renderPage(session, i);
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
      engine: session.kind === "vertical" ? "foliate" : "crengine",
      usedFontFamily: session.usedFontFamily,
    };
  },
};

registerConverter(EpubConverter);

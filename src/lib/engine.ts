/**
 * CREngine WASM loader
 */

import {
  enginePrimaryFamily,
  fallbackFaceList,
  fontsForEngine,
  type ScriptId,
} from "./fonts";
import { t } from "./i18n";

const CRENGINE_BASE = "https://cdn.jsdelivr.net/gh/bigbag/epub-to-xtc-converter@main/web/";
export const PRIMARY_FACE = "Georgia";
export const FALLBACK_FACE = "Noto Serif JP";

export type CREngineModule = {
  allocateMemory: (size: number) => number;
  freeMemory: (ptr: number) => void;
  HEAPU8: Uint8Array;
  EpubRenderer: new (width: number, height: number) => EpubRenderer;
};

export type EpubRenderer = {
  resize?: (w: number, h: number) => void;
  delete?: () => void;
  registerFontFromMemory: (ptr: number, length: number, name: string) => void;
  loadEpubFromMemory: (ptr: number, length: number) => void;
  getPageCount: () => number;
  getDocumentInfo?: () => { title?: string; author?: string; authors?: string };
  getToc?: () => Array<{ title?: string; name?: string; page?: number; startPage?: number }>;
  goToPage: (index: number) => void;
  renderCurrentPage: () => void;
  getFrameBuffer: () => Uint8Array | Uint8ClampedArray;
  configureStatusBar: (...args: boolean[]) => void;
  setMargins: (t: number, r: number, b: number, l: number) => void;
  setIgnoreDocumentMargins?: (ignore: boolean) => void;
  setFontSize: (n: number) => void;
  setInterlineSpace: (n: number) => void;
  setFontWeight: (n: number) => void;
  setFontFace: (name: string) => void;
  setFallbackFontFace: (name: string) => void;
  setFallbackFontFaces: (name: string) => void;
  setTextAlign: (n: number) => void;
  setHyphenation: (n: number) => void;
};

declare global {
  interface Window {
    CREngine?: (opts: { locateFile: (path: string) => string }) => Promise<CREngineModule>;
  }
}

let modulePromise: Promise<CREngineModule> | null = null;
let crengineModule: CREngineModule | null = null;
let renderer: EpubRenderer | null = null;
let rendererW = 0;
let rendererH = 0;
const registeredFonts = new Set<string>();
let lastRegisteredFamilies: string[] = [];
let rendererLock: Promise<void> = Promise.resolve();

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (typeof window.CREngine === "function") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(t("loadFailed", { src }))));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(t("loadFailed", { src })));
    document.head.appendChild(s);
  });
}

async function getModule(onStatus?: (text: string) => void): Promise<CREngineModule> {
  if (crengineModule) return crengineModule;
  if (!modulePromise) {
    modulePromise = (async () => {
      if (typeof window.CREngine !== "function") {
        if (onStatus) onStatus(t("loadingEngine"));
        await loadScript(CRENGINE_BASE + "crengine.js");
      }
      if (onStatus) onStatus(t("startingEngine"));
      if (typeof window.CREngine !== "function") {
        throw new Error(t("crengineFailed"));
      }
      crengineModule = await window.CREngine({
        locateFile: (path) => CRENGINE_BASE + path,
      });
      return crengineModule;
    })().catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

async function registerFonts(
  onStatus?: (text: string) => void,
  fontId?: string,
  detected?: ScriptId | null,
): Promise<string> {
  if (!renderer || !crengineModule) return enginePrimaryFamily(fontId, detected ?? null);
  const { faces, usedFamily } = await fontsForEngine(fontId, detected ?? null, (name) => {
    if (onStatus) onStatus(t("loadingFont", { name }));
  });
  for (const face of faces) {
    const key = face.file + "@" + rendererW + "x" + rendererH;
    if (registeredFonts.has(key)) continue;
    try {
      const fptr = crengineModule.allocateMemory(face.bytes.length);
      crengineModule.HEAPU8.set(face.bytes, fptr);
      renderer.registerFontFromMemory(fptr, face.bytes.length, face.family);
      crengineModule.freeMemory(fptr);
      registeredFonts.add(key);
    } catch (e) {
      console.warn("CREngine font load failed:", face.file, e);
    }
  }
  lastRegisteredFamilies = faces.map((face) => face.family).filter(Boolean);
  return usedFamily;
}

export async function ensureRenderer(
  width: number,
  height: number,
  onStatus?: (text: string) => void,
  fontOpts?: { fontId?: string; detected?: ScriptId | null },
): Promise<{
  module: CREngineModule;
  renderer: EpubRenderer;
  usedFontFamily: string;
  fallbackFamily: string;
}> {
  const prev = rendererLock;
  let release!: () => void;
  rendererLock = new Promise((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    const mod = await getModule(onStatus);
    if (renderer && (rendererW !== width || rendererH !== height)) {
      if (typeof renderer.resize === "function") {
        renderer.resize(width, height);
        rendererW = width;
        rendererH = height;
      } else {
        try {
          if (renderer.delete) renderer.delete();
        } catch {
          /* ignore */
        }
        renderer = null;
      }
    }
    if (!renderer) {
      if (onStatus) onStatus(t("creatingRenderer"));
      renderer = new mod.EpubRenderer(width, height);
      rendererW = width;
      rendererH = height;
    }
    const usedFontFamily = await registerFonts(onStatus, fontOpts?.fontId, fontOpts?.detected);
    const fallbackFamily =
      lastRegisteredFamilies.find((name) => name !== usedFontFamily) ||
      usedFontFamily ||
      FALLBACK_FACE;
    return { module: mod, renderer, usedFontFamily, fallbackFamily };
  } finally {
    release();
  }
}

export function applyRenderSettings(
  r: EpubRenderer,
  settings: {
    fontSize?: number;
    lineHeight?: number;
    fontWeight?: number;
    fontFace?: string;
    fontId?: string;
    fallbackFace?: string;
    fallbackFaces?: string;
    textAlign?: number;
    hyphenation?: number;
    detectedCjk?: ScriptId | null;
  },
) {
  try {
    r.configureStatusBar(false, false, false, false, false, false, false, false, false);
  } catch {
    /* ignore */
  }
  try {
    r.setMargins(0, 0, 0, 0);
  } catch {
    /* ignore */
  }
  try {
    r.setIgnoreDocumentMargins?.(true);
  } catch {
    /* ignore */
  }
  try {
    r.setFontSize(Number(settings.fontSize) || 34);
  } catch {
    /* ignore */
  }
  try {
    r.setInterlineSpace(Number(settings.lineHeight) || 120);
  } catch {
    /* ignore */
  }
  try {
    r.setFontWeight(Number(settings.fontWeight) || 400);
  } catch {
    /* ignore */
  }
  try {
    r.setFontFace(
      settings.fontFace || enginePrimaryFamily(settings.fontId, settings.detectedCjk ?? null),
    );
  } catch {
    /* ignore */
  }
  try {
    r.setFallbackFontFace(
      settings.fallbackFace ||
        lastRegisteredFamilies.find((name) => name !== settings.fontFace) ||
        FALLBACK_FACE,
    );
  } catch {
    /* ignore */
  }
  try {
    r.setFallbackFontFaces(
      settings.fallbackFaces ||
        (lastRegisteredFamilies.length ? lastRegisteredFamilies.join(", ") : fallbackFaceList()),
    );
  } catch {
    /* ignore */
  }
  try {
    const align = Number(settings.textAlign);
    r.setTextAlign(Number.isFinite(align) ? align : 3);
  } catch {
    /* ignore */
  }
  try {
    const hyphen = Number(settings.hyphenation);
    r.setHyphenation(Number.isFinite(hyphen) ? hyphen : 0);
  } catch {
    /* ignore */
  }
}

export function engineReady() {
  return Boolean(crengineModule && renderer);
}

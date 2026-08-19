/**
 * Layout contract (docs/layout-plan.md).
 *
 * Adapters turn bytes into a Book. Auto (or the user override) picks a
 * pager by writing mode, not file type. XTCH encoding does not change.
 *
 * Today only EPUB is wired. CREngine remains the horizontal-EPUB specialist.
 */

import type { CREngineModule, EpubRenderer } from "./engine";
import type { ScriptId } from "./fonts";

export type StatusFn = (text: string, kind?: string) => void;

/** Source TOC from an adapter (hrefs). Paged XTCH toc is TocEntry[]. */
export type BookTocItem = {
  label?: string;
  href?: string;
  subitems?: BookTocItem[];
};

export type BookMetadata = {
  title?: unknown;
  author?: unknown;
  creator?: unknown;
  language?: unknown;
  [key: string]: unknown;
};

export type BookSection = {
  /** `"no"` = skip. Anything else is linear reading order. */
  linear?: string;
  /** blob: or data: URL of HTML for the pager iframe. */
  load: () => Promise<string>;
  unload?: () => void;
};

/**
 * Shared book after an adapter unpacks bytes: sections, HTML `load()`,
 * metadata, toc, script. Foliate `makeBook` already matches this for EPUB
 * (and later MOBI / FB2 / CBZ). `script` is attached from `detectScript` on
 * text/language — it is not Auto.
 */
export type Book = {
  sections: BookSection[];
  metadata?: BookMetadata;
  toc?: BookTocItem[];
  script?: ScriptId | null;
  resolveHref?: (href: string) => { index?: number };
};

export type DocumentInfo = {
  title?: string;
  author?: string;
  authors?: string;
  [key: string]: unknown;
};

export type TocEntry = {
  title?: string;
  name?: string;
  page?: number;
  startPage?: number;
};

export type DeviceProfile = {
  id: string;
  width: number;
  height: number;
  label: string;
};

/**
 * User writing control.
 *
 * Auto: `textLooksVertical` on a markup/CSS sample → vertical, else
 * horizontal. Override always wins. TXT and CBZ have no markup signal →
 * horizontal. Auto does not use language, glyphs, filename, or
 * `page-progression-direction`. False horizontal is the safer miss.
 */
export type WritingMode = "auto" | "horizontal" | "vertical";

/** Axis after Auto or override. Pagers only see this. */
export type ResolvedWritingMode = "horizontal" | "vertical";

/**
 * Planned adapters. EPUB, TXT, and MOBI are registered. Do not feed TXT / MOBI / AZW / FB2 to CREngine.
 */
export type AdapterId = "epub" | "txt" | "mobi" | "fb2" | "cbz";

export type PersistSettings = {
  deviceId: string;
  fontSize: number;
  lineHeight: number;
  textAlign: number;
  hyphenation: number;
  readDirection: number;
  renameFromTitle: boolean;
  locale: import("./i18n").LocalePref;
};

export type ConvertSettings = PersistSettings & {
  device: { w: number; h: number; id: string };
  writingMode: WritingMode;
  fontId: string;
  /** TXT only. `"auto"` uses `detectTxtEncoding`. */
  txtEncoding?: string;
};

/** Layout library actually used. Queue still shows this (not V/H yet). */
export type LayoutLib = "crengine" | "foliate";

export type JobUsedSettings = {
  deviceId: string;
  fontId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
};

export type ConvertResult = {
  bytes: Uint8Array;
  filename: string;
  info: DocumentInfo;
  pageCount: number;
  partial?: boolean;
  engine?: LayoutLib;
  usedFontFamily?: string;
};

export type ConvertHooks = {
  onProgress?: (p: number, page: number, total: number) => void;
  onStatus?: StatusFn;
  signal?: AbortSignal;
  maxPages?: number;
};

/**
 * 縦書き pager. Owns all vertical-rl output. Horizontal is a twin with
 * the same methods — do not merge the two until both work.
 */
export type VerticalPager = {
  pageCount: number;
  renderPage(pageIndex: number): Promise<Uint8ClampedArray>;
  destroy(): void;
};

export type BookSession = {
  kind: "crengine" | "vertical" | "horizontal";
  module?: CREngineModule;
  renderer?: EpubRenderer;
  pager?: VerticalPager;
  pageCount: number;
  info: DocumentInfo;
  toc: TocEntry[];
  width: number;
  height: number;
  jobId?: string;
  converter: Converter;
  truncated?: boolean;
  usedFontFamily?: string;
};

export type AdapterSniff = {
  markup: string;
  script: ScriptId | null;
  encoding?: string | null;
};

export type Converter = {
  id: string;
  label: string;
  extensions: string[];
  mimeTypes?: string[];
  accepts(file: File): boolean;
  sniff(file: File): Promise<AdapterSniff>;
  load(
    file: File,
    settings: ConvertSettings,
    onStatus?: StatusFn,
    opts?: { maxPages?: number },
  ): Promise<BookSession>;
  renderPage(
    session: BookSession,
    pageIndex: number,
  ): Uint8Array | Uint8ClampedArray | Promise<Uint8Array | Uint8ClampedArray>;
  convert(file: File, settings: ConvertSettings, hooks?: ConvertHooks): Promise<ConvertResult>;
};

export type JobStatus = "queued" | "converting" | "done" | "error";

export type Job = {
  id: string;
  file: File;
  converter: Converter;
  status: JobStatus;
  message: string;
  result: ConvertResult | null;
  error: string | null;
  writingMode: WritingMode;
  fontId: string;
  /** TXT only. `"auto"` or a `TxtEncodingId`. */
  txtEncoding: string;
  detectedEncoding: string | null;
  /** Auto sniff (`textLooksVertical`). Override is `writingMode`. */
  detectedVertical: boolean | null;
  /** Script/fonts only — not Auto. */
  detectedScript: ScriptId | null;
  engine: LayoutLib | null;
  usedSettings: JobUsedSettings | null;
};

export type ToastState = {
  message: string;
  type: "info" | "success" | "error" | "warn";
};

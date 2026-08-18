import type { CREngineModule, EpubRenderer } from "./engine";
import type { ScriptId } from "./fonts";

export type StatusFn = (text: string, kind?: string) => void;

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

export type WritingMode = "auto" | "horizontal" | "vertical";

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
};

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

export type VerticalPager = {
  pageCount: number;
  renderPage(pageIndex: number): Promise<Uint8ClampedArray>;
  destroy(): void;
};

export type BookSession = {
  kind: "crengine" | "vertical";
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

export type Converter = {
  id: string;
  label: string;
  extensions: string[];
  mimeTypes?: string[];
  accepts(file: File): boolean;
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
  detectedVertical: boolean | null;
  detectedScript: ScriptId | null;
  engine: LayoutLib | null;
  usedSettings: JobUsedSettings | null;
};

export type ToastState = {
  message: string;
  type: "info" | "success" | "error" | "warn";
};

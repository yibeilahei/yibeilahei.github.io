/**
 * TXT adapter. Bytes → one HTML section. Auto is always horizontal.
 */

import { detectScript } from "../fonts.ts";
import type { Book, BookSection } from "../types.ts";

export type TxtEncodingId =
  | "utf-8"
  | "utf-16le"
  | "utf-16be"
  | "shift_jis"
  | "euc-jp"
  | "iso-2022-jp"
  | "gb18030"
  | "gbk"
  | "big5"
  | "euc-kr"
  | "windows-1252"
  | "windows-1251"
  | "windows-1256"
  | "windows-874"
  | "iso-8859-1";

export type TxtEncodingChoice = { id: TxtEncodingId; label: string };

const UNICODE: TxtEncodingChoice[] = [
  { id: "utf-8", label: "UTF-8" },
  { id: "utf-16le", label: "UTF-16 LE" },
  { id: "utf-16be", label: "UTF-16 BE" },
];

const BY_LANG: Record<string, TxtEncodingChoice[]> = {
  ja: [
    { id: "shift_jis", label: "Shift_JIS" },
    { id: "euc-jp", label: "EUC-JP" },
    { id: "iso-2022-jp", label: "ISO-2022-JP" },
  ],
  zh: [
    { id: "gb18030", label: "GB18030" },
    { id: "gbk", label: "GBK" },
    { id: "big5", label: "Big5" },
  ],
  "zh-hant": [
    { id: "big5", label: "Big5" },
    { id: "gb18030", label: "GB18030" },
    { id: "gbk", label: "GBK" },
  ],
  ko: [{ id: "euc-kr", label: "EUC-KR" }],
  ru: [{ id: "windows-1251", label: "Windows-1251" }],
  uk: [{ id: "windows-1251", label: "Windows-1251" }],
  bg: [{ id: "windows-1251", label: "Windows-1251" }],
  ar: [{ id: "windows-1256", label: "Windows-1256" }],
  fa: [{ id: "windows-1256", label: "Windows-1256" }],
  ur: [{ id: "windows-1256", label: "Windows-1256" }],
  th: [{ id: "windows-874", label: "Windows-874" }],
};

const LATIN_FALLBACK: TxtEncodingChoice[] = [
  { id: "windows-1252", label: "Windows-1252" },
  { id: "iso-8859-1", label: "ISO-8859-1" },
];

const LABEL: Record<TxtEncodingId, string> = {
  "utf-8": "UTF-8",
  "utf-16le": "UTF-16 LE",
  "utf-16be": "UTF-16 BE",
  shift_jis: "Shift_JIS",
  "euc-jp": "EUC-JP",
  "iso-2022-jp": "ISO-2022-JP",
  gb18030: "GB18030",
  gbk: "GBK",
  big5: "Big5",
  "euc-kr": "EUC-KR",
  "windows-1252": "Windows-1252",
  "windows-1251": "Windows-1251",
  "windows-1256": "Windows-1256",
  "windows-874": "Windows-874",
  "iso-8859-1": "ISO-8859-1",
};

export function encodingLabel(id: TxtEncodingId): string {
  return LABEL[id] || id;
}

export function encodingSupported(id: string): boolean {
  try {
    new TextDecoder(id);
    return true;
  } catch {
    return false;
  }
}

function langKey(locale: string): string {
  const lower = locale.toLowerCase().replace(/_/g, "-");
  if (/^zh-(tw|hk|mo|hant)/.test(lower)) return "zh-hant";
  return lower.split("-")[0] || "en";
}

export function encodingsForLocale(locale: string): TxtEncodingChoice[] {
  const key = langKey(locale);
  const extra = BY_LANG[key] || (key === "zh" ? BY_LANG.zh : LATIN_FALLBACK);
  const out: TxtEncodingChoice[] = [];
  const seen = new Set<string>();
  for (const choice of [...extra, ...UNICODE]) {
    if (seen.has(choice.id) || !encodingSupported(choice.id)) continue;
    seen.add(choice.id);
    out.push(choice);
  }
  return out;
}

export function encodingsForMenu(locale: string, detected?: TxtEncodingId | null): TxtEncodingChoice[] {
  const base = encodingsForLocale(locale);
  if (detected && !base.some((c) => c.id === detected) && encodingSupported(detected)) {
    return [{ id: detected, label: encodingLabel(detected) }, ...base];
  }
  return base;
}

/** OS/browser language, not the in-app UI locale. */
export function systemLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  if (Array.isArray(navigator.languages) && navigator.languages[0]) return navigator.languages[0];
  return navigator.language || "en";
}

/** Most common legacy encoding for that language. Latin/unknown → UTF-8. */
export function defaultEncodingForLanguage(locale?: string): TxtEncodingId {
  const extra = BY_LANG[langKey(locale || "en")];
  const id = extra?.[0]?.id;
  if (id && encodingSupported(id)) return id;
  return "utf-8";
}

function hasBomUtf8(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function hasBomUtf16Le(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
}

function hasBomUtf16Be(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
}

function hasIso2022Jp(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] !== 0x1b) continue;
    const a = bytes[i + 1];
    const b = bytes[i + 2];
    if (a === 0x24 && (b === 0x42 || b === 0x40)) return true;
    if (a === 0x28 && (b === 0x42 || b === 0x4a || b === 0x49)) return true;
  }
  return false;
}

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** BOM, ISO-2022-JP escapes, or valid UTF-8. No Shift_JIS/GBK/Big5 guessing. */
export function detectTxtEncoding(bytes: Uint8Array): TxtEncodingId | null {
  if (hasBomUtf8(bytes)) return "utf-8";
  if (hasBomUtf16Le(bytes)) return "utf-16le";
  if (hasBomUtf16Be(bytes)) return "utf-16be";
  if (hasIso2022Jp(bytes) && encodingSupported("iso-2022-jp")) return "iso-2022-jp";
  const sample = bytes.length > 32768 ? bytes.subarray(0, 32768) : bytes;
  if (isValidUtf8(sample)) return "utf-8";
  return null;
}

export function resolveTxtEncoding(
  bytes: Uint8Array,
  choice: TxtEncodingId | "auto" | string | undefined,
  detected?: TxtEncodingId | null,
  systemLang?: string,
): TxtEncodingId {
  if (choice && choice !== "auto") return choice as TxtEncodingId;
  return (
    detected ||
    detectTxtEncoding(bytes) ||
    defaultEncodingForLanguage(systemLang ?? systemLanguage())
  );
}

export function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || name;
}

export function decodeTxtBytes(
  bytes: Uint8Array,
  encoding: TxtEncodingId | "auto" | string | undefined = "auto",
): string {
  const id = resolveTxtEncoding(bytes, encoding, null, systemLanguage());
  let slice = bytes;
  if (id === "utf-8" && hasBomUtf8(bytes)) slice = bytes.subarray(3);
  else if (id === "utf-16le" && hasBomUtf16Le(bytes)) slice = bytes.subarray(2);
  else if (id === "utf-16be" && hasBomUtf16Be(bytes)) slice = bytes.subarray(2);
  try {
    return new TextDecoder(id).decode(slice);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function paragraphsFromTxt(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const trimmed = normalized.trim();
  if (!trimmed) return [];
  const blocks = /\n[ \t]*\n/.test(trimmed)
    ? trimmed.split(/\n[ \t]*\n+/)
    : trimmed.split("\n");
  return blocks.map((block) => block.replace(/^\n+|\n+$/g, "")).filter(Boolean);
}

export function txtToHtml(text: string, title: string): string {
  const paras = paragraphsFromTxt(text);
  const body = paras.length
    ? paras
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("\n")
    : "<p></p>";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
}

export async function readTxtFile(
  file: File,
  encoding: TxtEncodingId | "auto" | string | undefined = "auto",
): Promise<{ text: string; encoding: TxtEncodingId; detected: TxtEncodingId | null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectTxtEncoding(bytes);
  const resolved = resolveTxtEncoding(bytes, encoding, detected, systemLanguage());
  return { text: decodeTxtBytes(bytes, resolved), encoding: resolved, detected };
}

export async function sniffTxt(
  file: File,
): Promise<{ vertical: false; script: ReturnType<typeof detectScript>; encoding: TxtEncodingId | null }> {
  const { text, detected } = await readTxtFile(file, "auto");
  return { vertical: false, script: detectScript(text.slice(0, 12000)), encoding: detected };
}

export async function bookFromTxt(
  file: File,
  encoding: TxtEncodingId | "auto" | string | undefined = "auto",
): Promise<Book> {
  const { text } = await readTxtFile(file, encoding);
  const title = titleFromFilename(file.name);
  const html = txtToHtml(text, title);
  const script = detectScript(text.slice(0, 12000));
  let url = "";
  const section: BookSection = {
    load: async () => {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      return url;
    },
    unload: () => {
      if (url) {
        URL.revokeObjectURL(url);
        url = "";
      }
    },
  };
  return {
    sections: [section],
    metadata: { title },
    toc: [{ label: title }],
    script,
  };
}

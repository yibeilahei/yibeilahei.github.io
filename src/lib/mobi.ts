/**
 * Kindle adapter helpers. Magic BOOKMOBI, refuse PalmDoc encryption,
 * Foliate MOBI.open → Book. Sniff samples first sections only.
 */

import { detectScript, scriptFromLang, type ScriptId } from "./fonts.ts";
import { textLooksVertical } from "./detectVertical.ts";
import { t } from "./i18n.ts";
import type { Book, BookSection } from "./types.ts";

const bookCache = new WeakMap<File, Promise<Book>>();

function be16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function be32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function latin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

export async function isMobiMagic(file: File): Promise<boolean> {
  if (file.size < 68) return false;
  const buf = new Uint8Array(await file.slice(60, 68).arrayBuffer());
  return latin1(buf) === "BOOKMOBI";
}

export async function mobiIsEncrypted(file: File): Promise<boolean> {
  if (file.size < 86) return false;
  const header = new Uint8Array(await file.slice(0, 86).arrayBuffer());
  const numRecords = be16(header, 76);
  if (numRecords < 1) return false;
  const rec0 = be32(header, 78);
  if (rec0 + 14 > file.size) return false;
  const palmdoc = new Uint8Array(await file.slice(rec0, rec0 + 14).arrayBuffer());
  return be16(palmdoc, 12) !== 0;
}

export async function assertMobiReadable(file: File): Promise<void> {
  if (!(await isMobiMagic(file))) {
    throw new Error(t("unsupportedType"));
  }
  if (await mobiIsEncrypted(file)) {
    throw new Error(t("mobiDrm"));
  }
}

async function openUncached(file: File): Promise<Book> {
  await assertMobiReadable(file);
  const { MOBI } = await import("foliate-js/mobi.js");
  const fflate = await import("foliate-js/vendor/fflate.js");
  const raw = (await new MOBI({ unzlib: fflate.unzlibSync }).open(file)) as Book;
  const lang = raw.metadata?.language;
  const langStr = Array.isArray(lang) ? String(lang[0] || "") : lang ? String(lang) : "";
  const fromLang = langStr ? scriptFromLang(langStr) : null;
  raw.script = fromLang && fromLang !== "latin" ? fromLang : raw.script ?? null;
  return raw;
}

export function openMobiBook(file: File): Promise<Book> {
  let pending = bookCache.get(file);
  if (!pending) {
    pending = openUncached(file);
    bookCache.set(file, pending);
  }
  return pending;
}

async function sectionHtml(section: BookSection): Promise<string> {
  const extra = section as BookSection & { createDocument?: () => Promise<Document> };
  if (typeof extra.createDocument === "function") {
    try {
      const doc = await extra.createDocument();
      return doc.documentElement?.outerHTML || "";
    } catch {
      /* fall through */
    }
  }
  const url = await section.load();
  try {
    const res = await fetch(url);
    return await res.text();
  } catch {
    return "";
  } finally {
    section.unload?.();
  }
}

export async function sampleMobiMarkup(book: Book): Promise<string> {
  const linear = book.sections
    .map((section, index) => (section.linear === "no" ? -1 : index))
    .filter((index) => index >= 0);
  const parts: string[] = [];
  for (const index of linear.slice(0, 2)) {
    const html = await sectionHtml(book.sections[index]);
    parts.push(html);
    if (textLooksVertical(html)) break;
  }
  return parts.join("\n");
}

export async function sniffMobi(file: File): Promise<{
  markup: string;
  script: ScriptId | null;
}> {
  const book = await openMobiBook(file);
  const markup = await sampleMobiMarkup(book);
  const script = book.script && book.script !== "latin" ? book.script : detectScript(markup.slice(0, 12000));
  if (script) book.script = script;
  return { markup, script };
}

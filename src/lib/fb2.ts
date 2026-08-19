/**
 * FB2 / FBZ adapter. Foliate makeFB2 / zip+fb2 → Book.
 * Sniff reads XML (or the .fb2 inside a zip), not a full layout.
 */

import JSZip from "jszip";
import { detectScript, scriptFromLang, type ScriptId } from "./fonts.ts";
import type { Book } from "./types.ts";

const bookCache = new WeakMap<File, Promise<Book>>();

async function isZipPk(file: File): Promise<boolean> {
  if (file.size < 4) return false;
  const b = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

export function isFb2Name(name: string, type?: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".fb2") || lower.endsWith(".fbz") || lower.endsWith(".fb2.zip")) return true;
  return (
    type === "application/x-fictionbook+xml" || type === "application/x-zip-compressed-fb2"
  );
}

export async function isFb2File(file: File): Promise<boolean> {
  if (isFb2Name(file.name, file.type)) return true;
  if (await isZipPk(file)) {
    try {
      const zip = await JSZip.loadAsync(file);
      return Object.keys(zip.files).some((name) => name.toLowerCase().endsWith(".fb2"));
    } catch {
      return false;
    }
  }
  const head = new TextDecoder("utf-8").decode(new Uint8Array(await file.slice(0, 4096).arrayBuffer()));
  return /<FictionBook\b/i.test(head);
}

export async function readFb2XmlSample(file: File, max = 48000): Promise<string> {
  if (await isZipPk(file)) {
    const zip = await JSZip.loadAsync(file);
    const name = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".fb2"));
    if (!name) return "";
    const text = await zip.files[name].async("string");
    return text.slice(0, max);
  }
  const bytes = new Uint8Array(await file.slice(0, max).arrayBuffer());
  return new TextDecoder("utf-8").decode(bytes);
}

function langFromFb2(xml: string): string {
  const m = xml.match(/<lang(?:\s[^>]*)?>\s*([^<]+)/i);
  return m ? m[1].trim() : "";
}

export async function sniffFb2(file: File): Promise<{ markup: string; script: ScriptId | null }> {
  const markup = await readFb2XmlSample(file);
  const lang = langFromFb2(markup);
  const fromLang = lang ? scriptFromLang(lang) : null;
  const script =
    fromLang && fromLang !== "latin" ? fromLang : detectScript(markup.slice(0, 12000));
  return { markup, script };
}

async function openUncached(file: File): Promise<Book> {
  const { makeBook } = await import("foliate-js/view.js");
  const raw = (await makeBook(file)) as Book;
  const lang = raw.metadata?.language;
  const langStr = Array.isArray(lang) ? String(lang[0] || "") : lang ? String(lang) : "";
  const fromLang = langStr ? scriptFromLang(langStr) : null;
  raw.script = fromLang && fromLang !== "latin" ? fromLang : raw.script ?? null;
  return raw;
}

export function openFb2Book(file: File): Promise<Book> {
  let pending = bookCache.get(file);
  if (!pending) {
    pending = openUncached(file);
    bookCache.set(file, pending);
  }
  return pending;
}

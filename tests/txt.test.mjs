import assert from "node:assert/strict";
import {
  decodeTxtBytes,
  defaultEncodingForLanguage,
  detectTxtEncoding,
  encodingsForLocale,
  paragraphsFromTxt,
  resolveTxtEncoding,
  titleFromFilename,
  txtToHtml,
} from "../src/lib/txt.ts";
import { detectedVerticalFromSample } from "../src/lib/detectVertical.ts";

const hello = new TextEncoder().encode("Hello\n\nWorld");
assert.equal(decodeTxtBytes(hello), "Hello\n\nWorld");

const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x42]);
assert.equal(decodeTxtBytes(utf8Bom), "AB");

const utf16le = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
assert.equal(decodeTxtBytes(utf16le), "AB");

const utf16be = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);
assert.equal(decodeTxtBytes(utf16be), "AB");

assert.deepEqual(paragraphsFromTxt("one\n\ntwo\n\nthree"), ["one", "two", "three"]);
assert.deepEqual(paragraphsFromTxt("line1\nline2"), ["line1", "line2"]);
assert.equal(titleFromFilename("My Novel.txt"), "My Novel");

const html = txtToHtml("A & B\n\n<tag>", "T");
assert.ok(html.includes("<p>A &amp; B</p>"));
assert.ok(html.includes("&lt;tag&gt;"));
assert.ok(html.includes("<title>T</title>"));

assert.equal(detectedVerticalFromSample(""), false);
assert.equal(detectedVerticalFromSample(null), false);

assert.equal(detectTxtEncoding(hello), "utf-8");
assert.equal(detectTxtEncoding(utf8Bom), "utf-8");
assert.equal(detectTxtEncoding(utf16le), "utf-16le");
assert.equal(detectTxtEncoding(utf16be), "utf-16be");

const ja = encodingsForLocale("ja").map((c) => c.id);
assert.ok(ja.includes("shift_jis"));
assert.ok(ja.includes("utf-8"));
const zhHant = encodingsForLocale("zh-Hant").map((c) => c.id);
assert.ok(zhHant.includes("big5"));
assert.equal(zhHant[0], "big5");
const en = encodingsForLocale("en").map((c) => c.id);
assert.ok(en.includes("windows-1252"));
assert.ok(en.includes("utf-8"));

const sjisA = new Uint8Array([0x82, 0xa0]); // あ in Shift_JIS — not guessed from bytes
assert.equal(detectTxtEncoding(sjisA), null);
assert.equal(decodeTxtBytes(sjisA, "shift_jis"), "あ");
assert.equal(defaultEncodingForLanguage("ja"), "shift_jis");
assert.equal(defaultEncodingForLanguage("zh-Hant"), "big5");
assert.equal(defaultEncodingForLanguage("zh"), "gb18030");
assert.equal(defaultEncodingForLanguage("ko"), "euc-kr");
assert.equal(defaultEncodingForLanguage("en"), "utf-8");
assert.equal(resolveTxtEncoding(sjisA, "auto", null, "ja"), "shift_jis");
assert.equal(resolveTxtEncoding(sjisA, "auto", null, "en"), "utf-8");

console.log("txt tests passed");

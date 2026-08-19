import assert from "node:assert/strict";
import { isFb2File, isFb2Name, readFb2XmlSample, sniffFb2 } from "../src/lib/fb2.ts";

assert.equal(isFb2Name("book.fb2"), true);
assert.equal(isFb2Name("book.fbz"), true);
assert.equal(isFb2Name("book.fb2.zip"), true);
assert.equal(isFb2Name("book.epub"), false);

const xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description><title-info><lang>ru</lang><book-title>Test</book-title></title-info></description>
  <stylesheet type="text/css">body { writing-mode: horizontal-tb; }</stylesheet>
  <body><p>Привет</p></body>
</FictionBook>`;
const file = new File([xml], "n.xml", { type: "application/xml" });
assert.equal(await isFb2File(file), true);
const sniff = await sniffFb2(file);
assert.ok(sniff.markup.includes("FictionBook"));
assert.equal(sniff.script, "cyrl");
const sample = await readFb2XmlSample(file);
assert.ok(sample.includes("<lang>ru</lang>"));

console.log("fb2 tests passed");

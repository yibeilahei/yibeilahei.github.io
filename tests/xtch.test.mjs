import { encodeXthPage, buildXtchContainer, outputNameFromSource, parseXtch, decodeXthPage } from '../src/lib/xtch.ts';
import assert from 'node:assert/strict';

function rgbaFill(width, height, gray) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = gray;
    data[i * 4 + 1] = gray;
    data[i * 4 + 2] = gray;
    data[i * 4 + 3] = 255;
  }
  return data;
}

const width = 16;
const height = 16;
const page = encodeXthPage(rgbaFill(width, height, 255), width, height);

assert.equal(page[0], 0x58);
assert.equal(page[1], 0x54);
assert.equal(page[2], 0x48);
assert.equal(page[3], 0x00);
assert.equal(page[8], 0);
assert.equal(page[9], 0);

const pageView = new DataView(page.buffer, page.byteOffset, page.byteLength);
assert.equal(pageView.getUint16(4, true), width);
assert.equal(pageView.getUint16(6, true), height);
const colBytes = Math.ceil(height / 8);
assert.equal(pageView.getUint32(10, true), colBytes * width * 2);
assert.equal(page.length, 22 + colBytes * width * 2);

// All-white page should encode as level 00 — both planes stay zero.
const planes = page.subarray(22);
assert.ok(planes.every((b) => b === 0), 'white page should be all-zero bit planes');

const black = encodeXthPage(rgbaFill(width, height, 0), width, height);
const blackPlanes = black.subarray(22);
assert.ok(blackPlanes.every((b) => b === 0xff), 'black page should set every bit');

const container = buildXtchContainer(
  [page],
  width,
  height,
  { title: 'Test Book', author: 'Ada' },
  [{ title: 'Chapter One', page: 0 }],
  { readDirection: 0 }
);

assert.equal(String.fromCharCode(...container.subarray(0, 4)), 'XTCH');
const view = new DataView(container.buffer, container.byteOffset, container.byteLength);
assert.equal(view.getUint16(4, true), 1);
assert.equal(view.getUint16(6, true), 1);
assert.equal(container[8], 0);
assert.equal(container[9], 1);
assert.equal(container[11], 1);

const decoder = new TextDecoder();
assert.equal(decoder.decode(container.subarray(56, 56 + 9)), 'Test Book');
assert.equal(decoder.decode(container.subarray(56 + 128, 56 + 131)), 'Ada');

const indexOffset = Number(view.getBigUint64(24, true));
const dataOffset = Number(view.getBigUint64(32, true));
assert.equal(view.getUint32(indexOffset + 8, true), page.length);
assert.equal(view.getUint16(indexOffset + 12, true), width);
assert.equal(view.getUint16(indexOffset + 14, true), height);
assert.deepEqual(container.subarray(dataOffset, dataOffset + page.length), page);

assert.equal(outputNameFromSource('Moby Dick.epub', ''), 'Moby Dick.xtch');
assert.equal(outputNameFromSource('book.epub', 'Title: A/B'), 'Title A B.xtch');

const parsed = parseXtch(container);
assert.equal(parsed.pageCount, 1);
assert.equal(parsed.title, 'Test Book');
assert.equal(parsed.author, 'Ada');
assert.equal(parsed.width, width);
assert.equal(parsed.height, height);
const decoded = decodeXthPage(parsed.pages[0]);
assert.equal(decoded.width, width);
assert.equal(decoded.height, height);
assert.ok(decoded.rgba.every((v, i) => (i % 4 === 3 ? v === 255 : v === 255)), 'white round-trip');

const blackPage = encodeXthPage(rgbaFill(width, height, 0), width, height);
const blackDecoded = decodeXthPage(blackPage);
assert.ok(blackDecoded.rgba.every((v, i) => (i % 4 === 3 ? v === 255 : v === 0)), 'black round-trip');

const longTitle = "あ".repeat(80);
const overflow = buildXtchContainer(
  [page],
  width,
  height,
  { title: longTitle, author: "Ada" },
  [],
  { readDirection: 0 },
);
assert.equal(overflow[56 + 126], 0);
assert.equal(decoder.decode(overflow.subarray(56 + 128, 56 + 131)), "Ada");
const overflowParsed = parseXtch(overflow);
assert.ok(overflowParsed.title.length > 0);
assert.equal(overflowParsed.author, "Ada");

console.log('xtch encoder tests passed');

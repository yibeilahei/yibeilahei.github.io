import assert from "node:assert/strict";
import { clusterColumns, packColumnPages, fallbackPageWindows } from "../src/lib/verticalPages.ts";

function assertNoColumnCut(columns, pages, clipRight) {
  for (const page of pages) {
    const winRight = clipRight - page.shift;
    const winLeft = winRight - page.width;
    for (const col of columns) {
      const cutLeft = col.left < winLeft - 0.5 && col.right > winLeft + 0.5;
      const cutRight = col.left < winRight - 0.5 && col.right > winRight + 0.5;
      assert.equal(cutLeft, false, "column sliced at left edge");
      assert.equal(cutRight, false, "column sliced at right edge");
    }
  }
}

// Nearby glyph rects in one 縦書き column collapse to a single column.
{
  const pitch = 40.8;
  const cols = clusterColumns(
    [
      { left: 427.2, right: 468.0 },
      { left: 428.0, right: 467.1 },
      { left: 386.4, right: 427.2 },
    ],
    pitch,
  );
  assert.equal(cols.length, 2);
  assert.ok(cols[0].right > cols[1].right);
}

// Ruby sitting on a column merges instead of becoming its own strip.
{
  const cols = clusterColumns(
    [
      { left: 420, right: 460 },
      { left: 418, right: 462 },
    ],
    40.8,
  );
  assert.equal(cols.length, 1);
  assert.equal(cols[0].left, 418);
  assert.equal(cols[0].right, 462);
}

// ふりがな (rt) to the right of the base stays in the same 縦書き column.
{
  const pitch = 40.8;
  const base = { left: 400, right: 440.8 };
  const ruby = { left: 428, right: 456 };
  const cols = clusterColumns([base, ruby], pitch);
  assert.equal(cols.length, 1);
  assert.ok(cols[0].left <= base.left);
  assert.ok(cols[0].right >= ruby.right);
}

// Same <ruby> group stays one column even if x-mids are a full pitch apart.
{
  const cols = clusterColumns(
    [
      { left: 400, right: 440, group: "rb1" },
      { left: 430, right: 470, group: "rb1" },
    ],
    40.8,
  );
  assert.equal(cols.length, 1);
  assert.equal(cols[0].left, 400);
  assert.equal(cols[0].right, 470);
}

// Packing does not put a ruby group on two pages.
{
  const columns = [
    { left: 68, right: 468 },
    { left: 28, right: 68, group: "rb1" },
    { left: -12, right: 28, group: "rb1" },
  ];
  const pages = packColumnPages(columns, 456, 468);
  assert.equal(pages.length, 2);
  const page1Right = 468 - pages[1].shift;
  const page1Left = page1Right - pages[1].width;
  assert.ok(columns[1].right <= page1Right + 0.5);
  assert.ok(columns[1].left >= page1Left - 0.5);
  assert.ok(columns[2].right <= page1Right + 0.5);
  assert.ok(columns[2].left >= page1Left - 0.5);
}

// Default X4: 34px × 120% = 40.8px pitch, 12px margin, 480px page.
// A 480px window would slice column 12 (~19px visible). Packing must keep it whole.
{
  const pitch = 40.8;
  const margin = 12;
  const pageW = 480;
  const usable = pageW - margin * 2;
  const clipRight = pageW - margin;
  const columns = [];
  for (let i = 0; i < 15; i++) {
    columns.push({
      right: clipRight - i * pitch,
      left: clipRight - (i + 1) * pitch,
    });
  }
  const pages = packColumnPages(columns, usable, clipRight);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].shift, 0);
  assert.equal(pages[0].width, Math.round(11 * pitch));

  // Page 0 holds columns 0–10 (11 × 40.8 = 448.8 ≤ 456). Column 11 starts page 1.
  const page1Right = columns[11].right;
  assert.equal(pages[1].shift, Math.round(clipRight - page1Right));
  assert.ok(Math.abs(page1Right + pages[1].shift - clipRight) < 1);

  assertNoColumnCut(columns, pages, clipRight);
}

{
  const pages = packColumnPages([], 456, 468);
  assert.deepEqual(pages, [{ shift: 0, width: 456 }]);
}

{
  const wide = [{ left: 0, right: 500 }];
  const pages = packColumnPages(wide, 456, 468);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].width, 456);
}

{
  assert.deepEqual(fallbackPageWindows(0, 456), [{ shift: 0, width: 456 }]);
  assert.deepEqual(fallbackPageWindows(456, 456), [{ shift: 0, width: 456 }]);
  assert.deepEqual(fallbackPageWindows(457, 456), [
    { shift: 0, width: 456 },
    { shift: 456, width: 456 },
  ]);
}

console.log("verticalPages tests passed");

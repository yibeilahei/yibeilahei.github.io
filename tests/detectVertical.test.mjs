import assert from "node:assert/strict";
import {
  convertWritingMode,
  detectedVerticalFromSample,
  effectiveWritingMode,
  pagerKind,
  textLooksVertical,
} from "../src/lib/detectVertical.ts";

assert.equal(textLooksVertical("body { writing-mode: vertical-rl; }"), true);
assert.equal(textLooksVertical("html { -epub-writing-mode: vertical-rl }"), true);
assert.equal(textLooksVertical("-webkit-writing-mode: vertical-lr;"), true);
assert.equal(textLooksVertical('<meta name="primary-writing-mode" content="vertical-rl"/>'), true);
assert.equal(textLooksVertical("body { writing-mode: horizontal-tb; }"), false);
assert.equal(textLooksVertical("page-progression-direction=\"rtl\""), false);

assert.equal(detectedVerticalFromSample("body { writing-mode: vertical-rl; }"), true);
assert.equal(detectedVerticalFromSample("body { writing-mode: horizontal-tb; }"), false);
assert.equal(detectedVerticalFromSample(""), false);
assert.equal(detectedVerticalFromSample(null), false);
assert.equal(detectedVerticalFromSample(undefined), false);

assert.equal(effectiveWritingMode("auto", true), "vertical");
assert.equal(effectiveWritingMode("auto", false), "horizontal");
assert.equal(effectiveWritingMode("auto", null), "horizontal");
assert.equal(effectiveWritingMode("vertical", false), "vertical");
assert.equal(effectiveWritingMode("horizontal", true), "horizontal");
assert.equal(convertWritingMode("auto", true), "vertical");
assert.equal(convertWritingMode("auto", false), "horizontal");
assert.equal(convertWritingMode("auto", null), "auto");
assert.equal(convertWritingMode("vertical", false), "vertical");

assert.equal(pagerKind("auto", true, "epub"), "vertical");
assert.equal(pagerKind("auto", false, "epub"), "crengine");
assert.equal(pagerKind("auto", false, "txt"), "horizontal");
assert.equal(pagerKind("vertical", false, "txt"), "vertical");
assert.equal(pagerKind("horizontal", true, "txt"), "horizontal");
assert.equal(pagerKind("auto", null, "txt"), "horizontal");
assert.equal(pagerKind("auto", false, "mobi"), "horizontal");
assert.equal(pagerKind("vertical", false, "mobi"), "vertical");
assert.equal(pagerKind("auto", false, "fb2"), "horizontal");
assert.equal(pagerKind("vertical", false, "fb2"), "vertical");

console.log("detectVertical tests passed");

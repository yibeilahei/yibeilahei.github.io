import assert from "node:assert/strict";
import {
  axisFromSample,
  detectedVerticalFromSample,
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

assert.equal(axisFromSample("body { writing-mode: vertical-rl; }"), "vertical");
assert.equal(axisFromSample(""), "horizontal");
assert.equal(axisFromSample(null), "horizontal");

assert.equal(pagerKind("vertical", "epub"), "vertical");
assert.equal(pagerKind("horizontal", "epub"), "crengine");
assert.equal(pagerKind("horizontal", "epub", true), "crengine");
assert.equal(pagerKind("horizontal", "epub", false), "horizontal");
assert.equal(pagerKind("vertical", "epub", true), "vertical");
assert.equal(pagerKind("horizontal", "txt"), "horizontal");
assert.equal(pagerKind("vertical", "txt"), "vertical");
assert.equal(pagerKind("horizontal", "mobi"), "horizontal");
assert.equal(pagerKind("vertical", "mobi"), "vertical");
assert.equal(pagerKind("horizontal", "fb2"), "horizontal");
assert.equal(pagerKind("vertical", "fb2"), "vertical");
assert.equal(pagerKind("horizontal", "txt", true), "horizontal");

console.log("detectVertical tests passed");

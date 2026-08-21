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

assert.equal(pagerKind("vertical"), "vertical");
assert.equal(pagerKind("horizontal"), "horizontal");

console.log("detectVertical tests passed");

import assert from "node:assert/strict";
import {
  availableFontChoiceIds,
  FONT_CHOICES,
  fontChoice,
  listBookFontChoices,
  pickUsedFontFamily,
  preferredFontGroups,
} from "../src/lib/fonts.ts";

assert.ok(!fontChoice("pmingliu").locals.includes("Songti TC"));

const listed = listBookFontChoices();
assert.ok(listed.some((c) => c.id === "auto"));
assert.ok(listed.some((c) => c.id === "literata"));
assert.ok(listed.some((c) => c.id === "noto-jp"));
assert.ok(listed.some((c) => c.id === "noto-tc"));
assert.ok(listed.some((c) => c.id === "songti-tc" || c.family === "Songti TC"));

const autoTc = pickUsedFontFamily("auto", "tc");
assert.ok(
  listed.some((c) => c.family === autoTc || c.locals.includes(autoTc) || c.cdn?.family === autoTc),
  `Auto TC family ${autoTc} should be in the menu`,
);
assert.equal(new Set(listed.filter((c) => c.group === "tc").map((c) => c.family)).size, listed.filter((c) => c.group === "tc").length);

const songti = FONT_CHOICES.find((c) => c.id === "songti-tc");
const pming = FONT_CHOICES.find((c) => c.id === "pmingliu");
assert.ok(songti);
assert.ok(pming);
assert.ok(!songti.locals.some((n) => pming.locals.includes(n)));

const installed = [
  "auto",
  "georgia",
  "times",
  "literata",
  "hiragino",
  "noto-jp",
  "songti-sc",
  "noto-sc",
];

const ids = availableFontChoiceIds();
assert.ok(ids.includes("auto"));
assert.ok(ids.includes("georgia"));
assert.ok(ids.includes("literata"));
assert.ok(ids.includes("noto-jp"));
assert.ok(ids.includes("noto-sc"));

const noBook = preferredFontGroups(undefined, undefined, null, installed);
assert.ok(noBook.some((g) => g.id === "auto"));
assert.ok(noBook.some((g) => g.id === "latin" && g.choiceIds.includes("georgia")));
assert.ok(noBook.some((g) => g.id === "jp" && g.choiceIds.includes("hiragino")));
assert.ok(noBook.some((g) => g.id === "sc"));
assert.equal(
  noBook.find((g) => g.id === "auto")?.choiceIds.join(),
  "auto",
);

const jpBook = preferredFontGroups(undefined, undefined, "jp", installed);
assert.equal(jpBook[0].id, "auto");
assert.equal(jpBook[1].id, "jp");
assert.ok(jpBook.find((g) => g.id === "jp")?.choiceIds.includes("hiragino"));
assert.ok(jpBook.some((g) => g.id === "sc"));
assert.ok(jpBook.some((g) => g.id === "latin"));

const jpShort = preferredFontGroups(undefined, undefined, "jp", installed, true);
assert.deepEqual(
  jpShort.map((g) => g.id),
  ["auto", "jp", "latin"],
);
assert.ok(!jpShort.some((g) => g.id === "sc"));

const latinBook = preferredFontGroups(undefined, undefined, "latin", installed, true);
assert.deepEqual(
  latinBook.map((g) => g.id),
  ["auto", "latin"],
);

const jaBrowser = preferredFontGroups(undefined, "ja", null, installed);
assert.equal(jaBrowser[0].id, "auto");
assert.equal(jaBrowser[1].id, "jp");

console.log("fonts tests passed");

import assert from "node:assert/strict";
import {
  LOCALES,
  MESSAGE_KEYS,
  detectLocale,
  normalizeLocalePref,
  resolveLocale,
  t,
} from "../src/lib/i18n.ts";
import { cssFontFamily, detectCjkFace, detectScript, extraScriptChoices, localFontNamesForLang, normalizeFontId, pickUsedFontFamily, preferredFontGroups, scriptFromLang, scriptsForEngine, usedFamilyFromLoaded } from "../src/lib/fonts.ts";

assert.equal(detectLocale("en-US"), "en");
assert.equal(detectLocale("ja"), "ja");
assert.equal(detectLocale("ja-JP"), "ja");
assert.equal(detectLocale("zh-CN"), "zh");
assert.equal(detectLocale("zh"), "zh");
assert.equal(detectLocale("zh-TW"), "zh-Hant");
assert.equal(detectLocale("zh-HK"), "zh-Hant");
assert.equal(detectLocale("zh-Hant"), "zh-Hant");
assert.equal(detectLocale("zh-Hant-TW"), "zh-Hant");
assert.equal(detectLocale("ko-KR"), "ko");
assert.equal(detectLocale("fr-FR"), "fr");
assert.equal(detectLocale("de"), "de");
assert.equal(detectLocale("es-MX"), "es");
assert.equal(detectLocale("pt-BR"), "pt");
assert.equal(detectLocale("ar-SA"), "ar");
assert.equal(detectLocale("hi-IN"), "hi");
assert.equal(detectLocale("bn-BD"), "bn");
assert.equal(detectLocale("ur-PK"), "ur");
assert.equal(detectLocale("mr-IN"), "mr");
assert.equal(detectLocale("te-IN"), "te");
assert.equal(detectLocale("sw-KE"), "sw");
assert.equal(detectLocale("ha-NG"), "ha");
assert.equal(detectLocale("pa-IN"), "pa");
assert.equal(detectLocale("tl"), "tl");
assert.equal(detectLocale("fil-PH"), "tl");
assert.equal(detectLocale("ta-IN"), "ta");
assert.equal(detectLocale("fa-IR"), "fa");
assert.equal(detectLocale("am-ET"), "am");
assert.equal(detectLocale("gu-IN"), "gu");
assert.equal(LOCALES.length, 31);
assert.equal(t("books", undefined, "bn"), "বই");
assert.equal(t("books", undefined, "ur"), "کتابیں");
assert.equal(t("books", undefined, "fa"), "کتاب‌ها");
assert.equal(t("books", undefined, "fr"), "Livres");
assert.equal(t("books", undefined, "de"), "Bücher");
assert.equal(t("books", undefined, "ar"), "الكتب");
assert.equal(t("ledeSuffix", undefined, "en"), "");
assert.equal(t("ledeSuffix", undefined, "zh"), "");
assert.equal(t("ledeSuffix", undefined, "zh-Hant"), "");
assert.equal(t("books", undefined, "zh"), "图书");
assert.equal(t("books", undefined, "zh-Hant"), "圖書");

for (const locale of LOCALES) {
  for (const key of MESSAGE_KEYS) {
    const value = t(key, undefined, locale);
    assert.equal(typeof value, "string", `${locale}.${key} is not a string`);
    assert.notEqual(value, key, `${locale}.${key} leaked the message key`);
  }
  const note = t("note", undefined, locale);
  assert.equal(/PDF|CBZ|MOBI/i.test(note), false, `${locale}.note still mentions later formats`);
}

assert.equal(normalizeLocalePref("zh"), "zh");
assert.equal(normalizeLocalePref("de"), "de");
assert.equal(normalizeLocalePref("xx"), "auto");
assert.equal(resolveLocale("auto", "ko-KR"), "ko");
assert.equal(resolveLocale("en", "ja-JP"), "en");

assert.equal(t("books", undefined, "en"), "Books");
assert.equal(t("books", undefined, "ja"), "本");
assert.equal(t("books", undefined, "zh"), "图书");
assert.equal(t("books", undefined, "ko"), "책");
assert.equal(t("pageOf", { current: 2, total: 10 }, "en"), "Page 2 / 10");
assert.equal(t("chipComing", { name: "MOBI" }, "ja"), "MOBI 対応中");

assert.equal(detectCjkFace("<dc:language>ko</dc:language>"), "kr");
assert.equal(detectCjkFace("<dc:language>zh-TW</dc:language>"), "tc");
assert.equal(detectCjkFace("<dc:language>zh-CN</dc:language>"), "sc");
assert.equal(detectCjkFace("<dc:language>ja</dc:language>"), "jp");
assert.equal(detectCjkFace("한글 본문"), "kr");
assert.equal(detectScript("<dc:language>ar</dc:language>"), "arab");
assert.equal(detectScript("<dc:language>ru</dc:language>"), "cyrl");
assert.equal(detectScript("<dc:language>th</dc:language>"), "thai");
assert.equal(detectScript("<dc:language>hi</dc:language>"), "deva");
assert.equal(detectScript("مرحبا"), "arab");
assert.equal(detectScript("Привет"), "cyrl");
assert.equal(normalizeFontId("noto-kr"), "noto-kr");
assert.equal(normalizeFontId("comic-sans"), "auto");
assert.ok(cssFontFamily("auto", "sc").includes("Songti SC"));
assert.ok(cssFontFamily("noto-sc", "sc").startsWith('"Noto Serif SC"'));
assert.equal(pickUsedFontFamily("noto-kr", "kr"), "Noto Serif KR");
assert.notEqual(pickUsedFontFamily("auto", "jp"), "Auto");
assert.notEqual(pickUsedFontFamily("auto", null), "Auto");
assert.equal(scriptFromLang("ja-JP"), "jp");
assert.equal(scriptFromLang("zh-TW"), "tc");
assert.equal(scriptFromLang("zh-Hant"), "tc");
assert.equal(scriptFromLang("en-US"), "latin");
assert.equal(scriptFromLang("km-KH"), "khmr");
assert.equal(scriptFromLang("my-MM"), "mymr");
assert.equal(scriptFromLang("lo"), "laoo");
assert.equal(scriptFromLang("el"), "grek");
assert.equal(scriptFromLang("ka-GE"), "geor");
assert.equal(scriptFromLang("hy"), "armn");
assert.equal(scriptFromLang("am"), "ethi");
assert.equal(scriptFromLang("si-LK"), "sinh");
assert.equal(scriptFromLang("gu"), "gujr");
assert.equal(scriptFromLang("pa"), "guru");
assert.equal(scriptFromLang("pa-PK"), "arab");
assert.equal(scriptFromLang("bo"), "tibt");
assert.equal(detectScript("<dc:language>km</dc:language>"), "khmr");
assert.equal(detectScript("ខ្មែរ"), "khmr");
assert.equal(detectScript("<dc:language>el</dc:language>"), "grek");
assert.equal(detectScript("汉字正文"), "sc");
assert.equal(detectScript('xml:lang="en" 汉字正文'), "sc");
assert.equal(
  usedFamilyFromLoaded("auto", "latin", [
    { family: "Georgia", file: "Georgia.ttf", bytes: new Uint8Array() },
    { family: "Yu Mincho", file: "YuMincho.ttf", bytes: new Uint8Array() },
  ]),
  "Georgia",
);
assert.ok(localFontNamesForLang("km-KH").includes("Khmer UI"));
{
  const scripts = scriptsForEngine("auto", "latin", ["km-KH", "en-US"]);
  assert.ok(scripts.includes("latin"));
  assert.ok(scripts.includes("khmr"));
}
{
  const scripts = scriptsForEngine("auto", "jp", ["en-US"]);
  assert.ok(scripts.includes("jp"));
  assert.ok(scripts.includes("latin"));
}
{
  const ids = preferredFontGroups("km", "km-KH").map((g) => g.id);
  assert.equal(ids[0], "auto");
  assert.equal(ids[1], "khmr");
}
{
  const ids = preferredFontGroups("en", "en-US", "kr").map((g) => g.id);
  assert.deepEqual(ids.slice(0, 3), ["auto", "kr", "latin"]);
}
{
  const groups = preferredFontGroups("ja", "en-US", null, new Set(["auto", "yu-mincho", "georgia"]));
  assert.deepEqual(groups.find((g) => g.id === "jp")?.choiceIds, ["yu-mincho"]);
  assert.deepEqual(groups.find((g) => g.id === "latin")?.choiceIds, ["georgia"]);
  assert.ok(!groups.some((g) => g.id === "arab"));
}
{
  const extras = extraScriptChoices(["khmr"]);
  assert.ok(extras.some((c) => c.group === "khmr"));
  assert.equal(normalizeFontId("sys:Khmer UI"), "sys:Khmer UI");
  assert.equal(normalizeFontId("cdn:khmr"), "cdn:khmr");
}
{
  const none = preferredFontGroups(undefined, undefined, null, null, true).map((g) => g.id);
  assert.equal(none[0], "auto");
  assert.ok(none.includes("latin"));
  assert.ok(none.includes("jp"));
}
{
  const ids = preferredFontGroups(undefined, undefined, "jp", null, true).map((g) => g.id);
  assert.deepEqual(ids, ["auto", "jp", "latin"]);
}
{
  const ids = preferredFontGroups("en", "en-US", "jp", null, true).map((g) => g.id);
  assert.ok(!ids.includes("arab"));
  assert.ok(!ids.includes("kr"));
}
{
  const ids = preferredFontGroups("ja", "en-US").map((g) => g.id);
  assert.deepEqual(ids.slice(0, 3), ["auto", "jp", "latin"]);
}
{
  const ids = preferredFontGroups("en", "ja-JP").map((g) => g.id);
  assert.deepEqual(ids.slice(0, 3), ["auto", "latin", "jp"]);
}

console.log("i18n tests passed");

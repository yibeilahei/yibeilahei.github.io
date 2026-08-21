/** Font stacks and optional CDN/local bytes for CSS pagers. */

import JSZip from "jszip";

export type CjkFace = "jp" | "sc" | "tc" | "kr";
export type ScriptId =
  | "latin"
  | CjkFace
  | "cyrl"
  | "grek"
  | "arab"
  | "hebr"
  | "thai"
  | "deva"
  | "taml"
  | "beng"
  | "khmr"
  | "mymr"
  | "laoo"
  | "geor"
  | "armn"
  | "ethi"
  | "sinh"
  | "gujr"
  | "guru"
  | "knda"
  | "mlym"
  | "telu"
  | "orya"
  | "tibt";

export type FontSpec = {
  id: string;
  family: string;
  file: string;
  url: string;
};

export type FontChoice = {
  id: string;
  family: string;
  locals: string[];
  group: "auto" | ScriptId;
  cdn?: FontSpec;
};

export function isCjkFace(id: string | null | undefined): id is CjkFace {
  return id === "jp" || id === "sc" || id === "tc" || id === "kr";
}

export const LATIN_FONT: FontSpec = {
  id: "literata",
  family: "Literata",
  file: "Literata-Regular.ttf",
  url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf",
};

export const CJK_FONTS: Record<CjkFace, FontSpec> = {
  jp: {
    id: "jp",
    family: "Noto Serif JP",
    file: "NotoSerifJP-Regular.ttf",
    url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserifjp/NotoSerifJP%5Bwght%5D.ttf",
  },
  sc: {
    id: "sc",
    family: "Noto Serif SC",
    file: "NotoSerifSC-Regular.ttf",
    url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf",
  },
  tc: {
    id: "tc",
    family: "Noto Serif TC",
    file: "NotoSerifTC-Regular.ttf",
    url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf",
  },
  kr: {
    id: "kr",
    family: "Noto Serif KR",
    file: "NotoSerifKR-Regular.ttf",
    url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserifkr/NotoSerifKR%5Bwght%5D.ttf",
  },
};

export const CJK_ORDER: CjkFace[] = ["jp", "sc", "tc", "kr"];

const NOTO_SERIF: FontSpec = {
  id: "noto-serif",
  family: "Noto Serif",
  file: "NotoSerif-Regular.ttf",
  url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf",
};

function notoSpec(id: string, family: string, folder: string, axes?: string): FontSpec {
  const base = family.replace(/\s+/g, "");
  const fileName = axes ? `${base}[${axes}].ttf` : `${base}-Regular.ttf`;
  return {
    id,
    family,
    file: `${base}-Regular.ttf`,
    url: `https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/${folder}/${encodeURIComponent(fileName)}`,
  };
}

const SCRIPT_CDN: Partial<Record<ScriptId, FontSpec>> = {
  cyrl: NOTO_SERIF,
  grek: NOTO_SERIF,
  arab: notoSpec("noto-naskh", "Noto Naskh Arabic", "notonaskharabic", "wght"),
  hebr: notoSpec("noto-hebr", "Noto Serif Hebrew", "notoserifhebrew", "wdth,wght"),
  thai: notoSpec("noto-thai", "Noto Serif Thai", "notoserifthai", "wdth,wght"),
  deva: notoSpec("noto-deva", "Noto Serif Devanagari", "notoserifdevanagari", "wdth,wght"),
  taml: notoSpec("noto-taml", "Noto Serif Tamil", "notoseriftamil", "wdth,wght"),
  beng: notoSpec("noto-beng", "Noto Serif Bengali", "notoserifbengali", "wdth,wght"),
  khmr: notoSpec("noto-khmr", "Noto Serif Khmer", "notoserifkhmer", "wdth,wght"),
  mymr: notoSpec("noto-mymr", "Noto Serif Myanmar", "notoserifmyanmar"),
  laoo: notoSpec("noto-laoo", "Noto Serif Lao", "notoseriflao", "wdth,wght"),
  geor: notoSpec("noto-geor", "Noto Serif Georgian", "notoserifgeorgian", "wdth,wght"),
  armn: notoSpec("noto-armn", "Noto Serif Armenian", "notoserifarmenian", "wdth,wght"),
  ethi: notoSpec("noto-ethi", "Noto Serif Ethiopic", "notoserifethiopic", "wdth,wght"),
  sinh: notoSpec("noto-sinh", "Noto Serif Sinhala", "notoserifsinhala", "wdth,wght"),
  gujr: notoSpec("noto-gujr", "Noto Serif Gujarati", "notoserifgujarati", "wght"),
  guru: notoSpec("noto-guru", "Noto Serif Gurmukhi", "notoserifgurmukhi", "wght"),
  knda: notoSpec("noto-knda", "Noto Serif Kannada", "notoserifkannada", "wdth,wght"),
  mlym: notoSpec("noto-mlym", "Noto Serif Malayalam", "notoserifmalayalam", "wdth,wght"),
  telu: notoSpec("noto-telu", "Noto Serif Telugu", "notoseriftelugu", "wdth,wght"),
  orya: notoSpec("noto-orya", "Noto Serif Oriya", "notoseriforiya", "wght"),
  tibt: notoSpec("noto-tibt", "Noto Serif Tibetan", "notoseriftibetan", "wght"),
};

const SYSTEM_STACKS: Record<ScriptId, string[]> = {
  latin: ["Georgia", "Palatino Linotype", "Palatino", "Times New Roman", "Times", "Noto Serif"],
  jp: ["Hiragino Mincho ProN", "Hiragino Mincho Pro", "Yu Mincho", "YuMincho", "MS Mincho", "MS PMincho", "Noto Serif JP"],
  sc: ["Songti SC", "STSong", "SimSun", "NSimSun", "Noto Serif SC"],
  tc: ["Songti TC", "LiSong Pro", "PMingLiU", "MingLiU", "Noto Serif TC"],
  kr: ["AppleMyungjo", "Nanum Myeongjo", "Batang", "BatangChe", "Gungsuh", "Noto Serif KR"],
  cyrl: ["Georgia", "Times New Roman", "Palatino", "PT Serif", "Noto Serif"],
  grek: ["Georgia", "Times New Roman", "Palatino", "Noto Serif"],
  arab: ["Geeza Pro", "Al Bayan", "Baghdad", "Traditional Arabic", "Arabic Typesetting", "Noto Naskh Arabic", "Noto Serif Arabic", "Segoe UI"],
  hebr: ["Times New Roman", "Arial Hebrew", "New Peninim MT", "David", "Noto Serif Hebrew"],
  thai: ["Thonburi", "Sathu", "Ayuthaya", "Krungthep", "Leelawadee UI", "Tahoma", "Noto Serif Thai"],
  deva: ["ITF Devanagari", "Kohinoor Devanagari", "Devanagari MT", "Nirmala UI", "Mangal", "Noto Serif Devanagari"],
  taml: ["Tamil MN", "InaiMathi", "Nirmala UI", "Latha", "Noto Serif Tamil"],
  beng: ["Kohinoor Bangla", "Bangla MN", "Nirmala UI", "Vrinda", "Noto Serif Bengali"],
  khmr: ["Khmer UI", "Leelawadee UI", "DaunPenh", "MoolBoran", "Khmer OS", "Noto Serif Khmer"],
  mymr: ["Myanmar Text", "Myanmar MN", "Noto Serif Myanmar"],
  laoo: ["Lao UI", "Lao MN", "Leelawadee UI", "DokChampa", "Noto Serif Lao"],
  geor: ["Sylfaen", "Noto Serif Georgian"],
  armn: ["Sylfaen", "Mshtakan", "Noto Serif Armenian"],
  ethi: ["Ebrima", "Nyala", "Kefa", "Noto Serif Ethiopic"],
  sinh: ["Iskoola Pota", "Nirmala UI", "Sinhala MN", "Noto Serif Sinhala"],
  gujr: ["Shruti", "Nirmala UI", "Gujarati Sangam MN", "Noto Serif Gujarati"],
  guru: ["Raavi", "Nirmala UI", "Gurmukhi MN", "Noto Serif Gurmukhi"],
  knda: ["Tunga", "Nirmala UI", "Kannada Sangam MN", "Noto Serif Kannada"],
  mlym: ["Kartika", "Nirmala UI", "Malayalam MN", "Noto Serif Malayalam"],
  telu: ["Gautami", "Nirmala UI", "Telugu MN", "Noto Serif Telugu"],
  orya: ["Kalinga", "Nirmala UI", "Oriya MN", "Noto Serif Oriya"],
  tibt: ["Microsoft Himalaya", "Kailasa", "Noto Serif Tibetan"],
};

const LATIN_STACK = SYSTEM_STACKS.latin;

export const FONT_CHOICES: FontChoice[] = [
  { id: "auto", family: "Auto", locals: [], group: "auto" },
  { id: "georgia", family: "Georgia", locals: ["Georgia"], group: "latin" },
  { id: "times", family: "Times New Roman", locals: ["Times New Roman", "Times"], group: "latin" },
  { id: "palatino", family: "Palatino", locals: ["Palatino", "Palatino Linotype", "Book Antiqua"], group: "latin" },
  { id: "literata", family: "Literata", locals: ["Literata"], group: "latin", cdn: LATIN_FONT },
  { id: "yu-mincho", family: "Yu Mincho", locals: ["Yu Mincho", "YuMincho"], group: "jp" },
  { id: "hiragino", family: "Hiragino Mincho ProN", locals: ["Hiragino Mincho ProN", "Hiragino Mincho Pro"], group: "jp" },
  { id: "ms-mincho", family: "MS Mincho", locals: ["MS Mincho", "MS PMincho"], group: "jp" },
  { id: "noto-jp", family: "Noto Serif JP", locals: ["Noto Serif JP"], group: "jp", cdn: CJK_FONTS.jp },
  { id: "songti-sc", family: "Songti SC", locals: ["Songti SC", "STSong"], group: "sc" },
  { id: "simsun", family: "SimSun", locals: ["SimSun", "NSimSun"], group: "sc" },
  { id: "noto-sc", family: "Noto Serif SC", locals: ["Noto Serif SC"], group: "sc", cdn: CJK_FONTS.sc },
  { id: "songti-tc", family: "Songti TC", locals: ["Songti TC"], group: "tc" },
  { id: "lisong", family: "LiSong Pro", locals: ["LiSong Pro"], group: "tc" },
  { id: "pmingliu", family: "PMingLiU", locals: ["PMingLiU", "MingLiU"], group: "tc" },
  { id: "noto-tc", family: "Noto Serif TC", locals: ["Noto Serif TC"], group: "tc", cdn: CJK_FONTS.tc },
  { id: "batang", family: "Batang", locals: ["Batang", "BatangChe"], group: "kr" },
  { id: "apple-myungjo", family: "AppleMyungjo", locals: ["AppleMyungjo"], group: "kr" },
  { id: "nanum", family: "Nanum Myeongjo", locals: ["Nanum Myeongjo"], group: "kr" },
  { id: "gungsuh", family: "Gungsuh", locals: ["Gungsuh"], group: "kr" },
  { id: "noto-kr", family: "Noto Serif KR", locals: ["Noto Serif KR"], group: "kr", cdn: CJK_FONTS.kr },
  { id: "pt-serif", family: "PT Serif", locals: ["PT Serif"], group: "cyrl" },
  { id: "noto-serif", family: "Noto Serif", locals: ["Noto Serif"], group: "cyrl", cdn: NOTO_SERIF },
  { id: "geeza", family: "Geeza Pro", locals: ["Geeza Pro"], group: "arab" },
  { id: "trad-arabic", family: "Traditional Arabic", locals: ["Traditional Arabic"], group: "arab" },
  { id: "noto-naskh", family: "Noto Naskh Arabic", locals: ["Noto Naskh Arabic"], group: "arab", cdn: SCRIPT_CDN.arab },
  { id: "david", family: "David", locals: ["David"], group: "hebr" },
  { id: "arial-hebrew", family: "Arial Hebrew", locals: ["Arial Hebrew"], group: "hebr" },
  { id: "noto-hebr", family: "Noto Serif Hebrew", locals: ["Noto Serif Hebrew"], group: "hebr", cdn: SCRIPT_CDN.hebr },
  { id: "thonburi", family: "Thonburi", locals: ["Thonburi"], group: "thai" },
  { id: "leelawadee", family: "Leelawadee UI", locals: ["Leelawadee UI", "Leelawadee"], group: "thai" },
  { id: "noto-thai", family: "Noto Serif Thai", locals: ["Noto Serif Thai"], group: "thai", cdn: SCRIPT_CDN.thai },
  { id: "nirmala", family: "Nirmala UI", locals: ["Nirmala UI"], group: "deva" },
  { id: "kohinoor-deva", family: "Kohinoor Devanagari", locals: ["Kohinoor Devanagari", "ITF Devanagari"], group: "deva" },
  { id: "noto-deva", family: "Noto Serif Devanagari", locals: ["Noto Serif Devanagari"], group: "deva", cdn: SCRIPT_CDN.deva },
  { id: "tamil-mn", family: "Tamil MN", locals: ["Tamil MN", "InaiMathi"], group: "taml" },
  { id: "noto-taml", family: "Noto Serif Tamil", locals: ["Noto Serif Tamil"], group: "taml", cdn: SCRIPT_CDN.taml },
  { id: "kohinoor-bangla", family: "Kohinoor Bangla", locals: ["Kohinoor Bangla", "Bangla MN"], group: "beng" },
  { id: "noto-beng", family: "Noto Serif Bengali", locals: ["Noto Serif Bengali"], group: "beng", cdn: SCRIPT_CDN.beng },
];

export type FontGroup = { id: FontChoice["group"]; choiceIds: string[] };

export const FONT_GROUPS: FontGroup[] = [
  { id: "auto", choiceIds: ["auto"] },
  { id: "latin", choiceIds: ["georgia", "times", "palatino", "literata"] },
  { id: "jp", choiceIds: ["yu-mincho", "hiragino", "ms-mincho", "noto-jp"] },
  { id: "sc", choiceIds: ["songti-sc", "simsun", "noto-sc"] },
  { id: "tc", choiceIds: ["songti-tc", "lisong", "pmingliu", "noto-tc"] },
  { id: "kr", choiceIds: ["apple-myungjo", "nanum", "batang", "gungsuh", "noto-kr"] },
  { id: "cyrl", choiceIds: ["pt-serif", "noto-serif"] },
  { id: "arab", choiceIds: ["geeza", "trad-arabic", "noto-naskh"] },
  { id: "hebr", choiceIds: ["david", "arial-hebrew", "noto-hebr"] },
  { id: "thai", choiceIds: ["thonburi", "leelawadee", "noto-thai"] },
  { id: "deva", choiceIds: ["nirmala", "kohinoor-deva", "noto-deva"] },
  { id: "taml", choiceIds: ["tamil-mn", "noto-taml"] },
  { id: "beng", choiceIds: ["kohinoor-bangla", "noto-beng"] },
];

const LATIN_LANG =
  /^(en|fr|de|es|it|pt|nl|pl|cs|ro|hu|tr|id|ms|sv|da|fi|no|nb|nn|vi|af|sw|ha|tl|fil|ca|eu|gl|ga|cy|mt|is|et|lv|lt|sk|sl|hr|bs|sq|az|uz|tk|eo|la|lb|br|gd|rm|haw)([-]|$)/;

export function isLatinLang(lang?: string): boolean {
  return LATIN_LANG.test(String(lang || "").toLowerCase().replace(/_/g, "-"));
}

export function scriptFromLang(lang?: string): ScriptId {
  const lower = String(lang || "").toLowerCase().replace(/_/g, "-");
  if (!lower) return "latin";
  if (lower.startsWith("ko")) return "kr";
  if (/^zh-(tw|hk|mo|hant)/.test(lower)) return "tc";
  if (lower.startsWith("zh")) return "sc";
  if (lower.startsWith("ja")) return "jp";
  if (/^(ar|fa|ur|ps|ckb|sd|ug|prs)([-]|$)/.test(lower)) return "arab";
  if (/^(he|yi)([-]|$)/.test(lower)) return "hebr";
  if (/^th([-]|$)/.test(lower)) return "thai";
  if (/^lo([-]|$)/.test(lower)) return "laoo";
  if (/^km([-]|$)/.test(lower)) return "khmr";
  if (/^my([-]|$)/.test(lower)) return "mymr";
  if (/^(hi|mr|ne|sa|kok)([-]|$)/.test(lower)) return "deva";
  if (/^ta([-]|$)/.test(lower)) return "taml";
  if (/^(bn|as)([-]|$)/.test(lower)) return "beng";
  if (/^pa-(pk|arab)([-]|$)/.test(lower)) return "arab";
  if (/^pa([-]|$)/.test(lower)) return "guru";
  if (/^gu([-]|$)/.test(lower)) return "gujr";
  if (/^kn([-]|$)/.test(lower)) return "knda";
  if (/^ml([-]|$)/.test(lower)) return "mlym";
  if (/^te([-]|$)/.test(lower)) return "telu";
  if (/^or([-]|$)/.test(lower)) return "orya";
  if (/^si([-]|$)/.test(lower)) return "sinh";
  if (/^(ru|uk|bg|sr|mk|be|kk|ky|tg|mn)([-]|$)/.test(lower)) return "cyrl";
  if (/^el([-]|$)/.test(lower)) return "grek";
  if (/^ka([-]|$)/.test(lower)) return "geor";
  if (/^hy([-]|$)/.test(lower)) return "armn";
  if (/^(am|ti)([-]|$)/.test(lower)) return "ethi";
  if (/^(bo|dz)([-]|$)/.test(lower)) return "tibt";
  return "latin";
}

export function browserLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  const out: string[] = [];
  const add = (value?: string) => {
    const lang = String(value || "").trim();
    if (lang && !out.includes(lang)) out.push(lang);
  };
  if (Array.isArray(navigator.languages)) {
    for (const lang of navigator.languages) add(lang);
  }
  add(navigator.language);
  return out;
}

export function scriptsForEngine(
  fontId: string | undefined,
  detected: ScriptId | null,
  langs: string[] = [],
): ScriptId[] {
  const out: ScriptId[] = [];
  const add = (script?: ScriptId | null) => {
    if (!script || out.includes(script)) return;
    out.push(script);
  };
  const choice = fontChoice(fontId);
  if (choice.group !== "auto") add(choice.group);
  add(detected);
  for (const lang of langs) add(scriptFromLang(lang));
  return out;
}

export function localFontNamesForLang(lang?: string): string[] {
  return SYSTEM_STACKS[scriptFromLang(lang)] || [];
}

export const SCRIPT_GROUP_LABELS: Record<string, string> = {
  latin: "Latin",
  jp: "Japanese",
  sc: "Simplified Chinese",
  tc: "Traditional Chinese",
  kr: "Korean",
  cyrl: "Cyrillic",
  grek: "Greek",
  arab: "Arabic",
  hebr: "Hebrew",
  thai: "Thai",
  deva: "Devanagari",
  taml: "Tamil",
  beng: "Bengali",
  khmr: "Khmer",
  mymr: "Myanmar",
  laoo: "Lao",
  geor: "Georgian",
  armn: "Armenian",
  ethi: "Ethiopic",
  sinh: "Sinhala",
  gujr: "Gujarati",
  guru: "Gurmukhi",
  knda: "Kannada",
  mlym: "Malayalam",
  telu: "Telugu",
  orya: "Odia",
  tibt: "Tibetan",
};

export function extraScriptChoices(scripts: Array<ScriptId | null | undefined>): FontChoice[] {
  const seen = new Set<ScriptId>();
  const out: FontChoice[] = [];
  for (const script of scripts) {
    if (!script || script === "latin" || seen.has(script)) continue;
    if (FONT_GROUPS.some((g) => g.id === script)) continue;
    seen.add(script);
    const stack = SYSTEM_STACKS[script] || [];
    const canProbe = typeof document !== "undefined";
    const installed = canProbe
      ? stack.filter((name) => firstAvailableFont([name]))
      : stack.slice(0, 1);
    for (const name of installed.slice(0, 3)) {
      out.push({ id: `sys:${name}`, family: name, locals: [name], group: script });
    }
    const cdn = SCRIPT_CDN[script] || (isCjkFace(script) ? CJK_FONTS[script] : undefined);
    if (cdn && !out.some((choice) => choice.family === cdn.family)) {
      out.push({
        id: `cdn:${script}`,
        family: cdn.family,
        locals: [cdn.family],
        group: script,
        cdn,
      });
    }
  }
  return out;
}

function uniqueFontNames(names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function isCdnOnlyChoice(choice: FontChoice, script: ScriptId): boolean {
  if (!choice.cdn) return false;
  const stack = SYSTEM_STACKS[script] || [];
  const names = uniqueFontNames([choice.family, ...choice.locals]);
  return names.every((name) => name === choice.cdn?.family) && !stack.some((name) => names.includes(name));
}

type FaceCluster = { names: string[]; catalog?: FontChoice };

function clustersForScript(script: ScriptId): FaceCluster[] {
  const catalog = FONT_CHOICES.filter((choice) => choice.group === script);
  const stack = SYSTEM_STACKS[script] || [];
  const used = new Set<string>();
  const clusters: FaceCluster[] = [];

  const take = (names: string[], cat?: FontChoice) => {
    const unique = uniqueFontNames(names);
    if (!unique.length || unique.every((name) => used.has(name))) return;
    for (const name of unique) used.add(name);
    clusters.push({ names: unique, catalog: cat });
  };

  for (const name of stack) {
    if (used.has(name)) continue;
    const cat = catalog.find((choice) => choice.family === name || choice.locals.includes(name));
    if (cat) {
      take([...stack.filter((n) => n === cat.family || cat.locals.includes(n)), cat.family, ...cat.locals], cat);
    } else {
      take([name]);
    }
  }

  for (const cat of catalog) {
    if (isCdnOnlyChoice(cat, script)) continue;
    if (used.has(cat.family) || cat.locals.some((name) => used.has(name))) continue;
    take([cat.family, ...cat.locals], cat);
  }
  return clusters;
}

function cdnChoiceForScript(script: ScriptId): FontChoice | undefined {
  return FONT_CHOICES.find((choice) => choice.group === script && choice.cdn);
}

function choicesForScript(script: ScriptId): FontChoice[] {
  const out: FontChoice[] = [];
  const seen = new Set<string>();
  for (const cluster of clustersForScript(script)) {
    const hit = firstAvailableFont(cluster.names);
    if (!hit) continue;
    const id = cluster.catalog?.id || `sys:${hit}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      family: hit,
      locals: cluster.names,
      group: script,
      cdn: cluster.catalog?.cdn,
    });
  }
  const cdn = cdnChoiceForScript(script);
  if (cdn && !out.some((choice) => choice.id === cdn.id || choice.family === cdn.cdn?.family)) {
    out.push(cdn);
  }
  return out;
}

let bookFontListCache: FontChoice[] | null = null;

/** Installed stack faces (own labels, aliases collapsed) plus CDN Noto/Literata. */
export function listBookFontChoices(): FontChoice[] {
  if (!bookFontListCache) {
    const out: FontChoice[] = [FONT_CHOICES[0]];
    for (const group of FONT_GROUPS) {
      if (group.id === "auto") continue;
      out.push(...choicesForScript(group.id as ScriptId));
    }
    bookFontListCache = out;
  }
  return bookFontListCache;
}

export function bookFontChoice(id: string | undefined): FontChoice {
  if (id) {
    const hit = listBookFontChoices().find((choice) => choice.id === id);
    if (hit) return hit;
  }
  return fontChoice(id);
}

export function availableFontChoiceIds(): string[] {
  return listBookFontChoices().map((choice) => choice.id);
}

export function preferredFontGroups(
  uiLang?: string,
  browserLang?: string,
  bookScript?: ScriptId | null,
  availableIds?: ReadonlySet<string> | string[] | null,
  bookOnly = false,
): FontGroup[] {
  const allow = availableIds
    ? availableIds instanceof Set
      ? availableIds
      : new Set(availableIds)
    : null;

  const extras = extraScriptChoices(
    bookOnly && bookScript
      ? [bookScript]
      : [
          bookScript,
          uiLang ? scriptFromLang(uiLang) : null,
          browserLang ? scriptFromLang(browserLang) : null,
        ],
  );
  const extraGroups: FontGroup[] = [];
  for (const choice of extras) {
    const existing = extraGroups.find((g) => g.id === choice.group);
    if (existing) existing.choiceIds.push(choice.id);
    else extraGroups.push({ id: choice.group, choiceIds: [choice.id] });
  }

  const listed = allow ? listBookFontChoices() : null;
  const catalog: FontGroup[] = [
    ...FONT_GROUPS.map((group) => {
      if (group.id === "auto" || !listed) return group;
      return {
        ...group,
        choiceIds: listed.filter((choice) => choice.group === group.id).map((choice) => choice.id),
      };
    }),
    ...extraGroups.filter((g) => !FONT_GROUPS.some((base) => base.id === g.id)),
  ];

  const pinned: string[] = [];
  const add = (script?: ScriptId | null) => {
    if (!script || !catalog.some((g) => g.id === script)) return;
    if (!pinned.includes(script)) pinned.push(script);
  };
  add(bookScript);
  if (!bookOnly || !bookScript) {
    if (uiLang) add(scriptFromLang(uiLang));
    if (browserLang) add(scriptFromLang(browserLang));
  }

  const filterGroup = (group: FontGroup): FontGroup => {
    if (group.id === "auto") return group;
    if (extraGroups.some((g) => g.id === group.id)) return group;
    if (!allow) return group;
    return { ...group, choiceIds: group.choiceIds.filter((id) => allow.has(id)) };
  };

  const auto = catalog.filter((g) => g.id === "auto").map(filterGroup);

  const first = pinned
    .map((id) => catalog.find((g) => g.id === id))
    .filter((g): g is FontGroup => Boolean(g))
    .map(filterGroup)
    .filter((g) => g.choiceIds.length);
  const rest = catalog
    .filter((g) => g.id !== "auto" && !pinned.includes(g.id))
    .map(filterGroup)
    .filter((g) => g.choiceIds.length);
  if (bookOnly && bookScript) {
    const latin =
      bookScript !== "latin" ? rest.filter((g) => g.id === "latin") : [];
    return [...auto, ...first, ...latin];
  }
  return [...auto, ...first, ...rest];
}

const bytesCache = new Map<string, Uint8Array>();

type LocalFontData = {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob: () => Promise<Blob>;
};

let localFontsPromise: Promise<LocalFontData[] | null> | null = null;

export function normalizeFontId(value: unknown): string {
  if (typeof value !== "string" || !value) return "auto";
  if (FONT_CHOICES.some((c) => c.id === value)) return value;
  if (value.startsWith("sys:") && value.slice(4).trim()) return value;
  if (value.startsWith("cdn:") && SCRIPT_CDN[value.slice(4) as ScriptId]) return value;
  return "auto";
}

export function fontChoice(id: string | undefined): FontChoice {
  const known = FONT_CHOICES.find((c) => c.id === id);
  if (known) return known;
  if (id?.startsWith("sys:")) {
    const family = id.slice(4).trim();
    if (family) {
      const script = (Object.keys(SYSTEM_STACKS) as ScriptId[]).find((key) =>
        SYSTEM_STACKS[key].includes(family),
      );
      return { id, family, locals: [family], group: script || "latin" };
    }
  }
  if (id?.startsWith("cdn:")) {
    const script = id.slice(4) as ScriptId;
    const cdn = SCRIPT_CDN[script];
    if (cdn) {
      return { id, family: cdn.family, locals: [cdn.family], group: script, cdn };
    }
  }
  return FONT_CHOICES[0];
}

/** Script/fonts only. Not used for Auto writing-mode (see detectVertical). */
export function detectScript(text: string): ScriptId | null {
  const dcLang = text.match(/<dc:language[^>]*>\s*([^<]+)/i);
  if (dcLang) {
    const script = scriptFromLang(dcLang[1].trim());
    if (script !== "latin") return script;
  }
  if (/[\uAC00-\uD7A3]/.test(text)) return "kr";
  if (/[\u3040-\u30FF]/.test(text)) return "jp";
  if (/[\u4E00-\u9FFF]/.test(text)) return "sc";
  if (/[\u0600-\u06FF]/.test(text)) return "arab";
  if (/[\u0590-\u05FF]/.test(text)) return "hebr";
  if (/[\u1780-\u17FF]/.test(text)) return "khmr";
  if (/[\u1000-\u109F]/.test(text)) return "mymr";
  if (/[\u0E80-\u0EFF]/.test(text)) return "laoo";
  if (/[\u0E00-\u0E7F]/.test(text)) return "thai";
  if (/[\u0F00-\u0FFF]/.test(text)) return "tibt";
  if (/[\u0900-\u097F]/.test(text)) return "deva";
  if (/[\u0A80-\u0AFF]/.test(text)) return "gujr";
  if (/[\u0A00-\u0A7F]/.test(text)) return "guru";
  if (/[\u0B80-\u0BFF]/.test(text)) return "taml";
  if (/[\u0980-\u09FF]/.test(text)) return "beng";
  if (/[\u0C80-\u0CFF]/.test(text)) return "knda";
  if (/[\u0D00-\u0D7F]/.test(text)) return "mlym";
  if (/[\u0C00-\u0C7F]/.test(text)) return "telu";
  if (/[\u0B00-\u0B7F]/.test(text)) return "orya";
  if (/[\u0D80-\u0DFF]/.test(text)) return "sinh";
  if (/[\u10A0-\u10FF]/.test(text)) return "geor";
  if (/[\u0530-\u058F]/.test(text)) return "armn";
  if (/[\u1200-\u137F]/.test(text)) return "ethi";
  if (/[\u0400-\u04FF]/.test(text)) return "cyrl";
  if (/[\u0370-\u03FF]/.test(text)) return "grek";
  if (dcLang && isLatinLang(dcLang[1].trim())) return "latin";
  const xmlLang = text.match(/xml:lang\s*=\s*["']([^"']+)/i);
  if (xmlLang) {
    const script = scriptFromLang(xmlLang[1].trim());
    if (script !== "latin") return script;
    if (isLatinLang(xmlLang[1].trim())) return "latin";
  }
  return null;
}

export function detectCjkFace(text: string): CjkFace | null {
  const script = detectScript(text);
  return isCjkFace(script) ? script : null;
}

export function systemStack(primary: ScriptId = "jp"): string {
  const seen = new Set<string>();
  const names: string[] = [];
  const order: ScriptId[] = [primary, "latin", ...CJK_ORDER];
  for (const face of order) {
    for (const name of SYSTEM_STACKS[face] || []) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names.map((n) => `"${n}"`).join(", ") + ", serif";
}

export function cjkStack(primary: CjkFace = "jp"): string {
  return systemStack(primary);
}

export function cssFontFamily(fontId: string | undefined, detected: ScriptId | null): string {
  const choice = fontChoice(fontId);
  const fallback: ScriptId =
    detected ||
    (choice.group !== "auto" ? choice.group : "latin");
  const stack = systemStack(fallback);
  if (choice.id === "auto") return stack;
  return `"${choice.family}", ${stack}`;
}

function quoteLocals(names: string[]): string {
  return names.map((n) => `local("${n}")`).join(",");
}

export function systemFontFaceCss(): string {
  const locals = Object.values(SYSTEM_STACKS).flat();
  const seen = new Set<string>();
  const unique = locals.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  return `@font-face{font-family:"Lazahata Serif";src:${quoteLocals(unique)};}`;
}

export async function detectScriptFromEpub(file: File): Promise<ScriptId | null> {
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files);
  const opf = names.filter((name) => /\.opf$/i.test(name));
  const rest = names.filter((name) => /\.(xml|xhtml|html|htm)$/i.test(name));
  let latin: ScriptId | null = null;
  for (const name of [...opf, ...rest]) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const text = await entry.async("string");
    const script = detectScript(text);
    if (script && script !== "latin") return script;
    if (script === "latin" && !latin) latin = "latin";
  }
  return latin;
}

export async function detectCjkFaceFromEpub(file: File): Promise<CjkFace | null> {
  const script = await detectScriptFromEpub(file);
  return isCjkFace(script) ? script : null;
}

async function listLocalFonts(): Promise<LocalFontData[] | null> {
  if (typeof window === "undefined") return null;
  if (localFontsPromise) return localFontsPromise;
  const query = (window as Window & { queryLocalFonts?: () => Promise<LocalFontData[]> }).queryLocalFonts;
  if (typeof query !== "function") {
    localFontsPromise = Promise.resolve(null);
    return localFontsPromise;
  }
  localFontsPromise = query()
    .then((fonts) => fonts || null)
    .catch(() => null);
  return localFontsPromise;
}

function styleIsRegular(style: string): boolean {
  const s = (style || "regular").toLowerCase();
  return s === "regular" || s === "normal" || s === "roman" || s === "";
}

async function loadLocalFontBytes(names: string[]): Promise<{ family: string; bytes: Uint8Array } | null> {
  const fonts = await listLocalFonts();
  if (!fonts?.length || !names.length) return null;
  const want = names.map((n) => n.toLowerCase());
  const match = (font: LocalFontData) => {
    const family = (font.family || "").toLowerCase();
    const full = (font.fullName || "").toLowerCase();
    return want.some((n) => family === n || full === n || full.startsWith(n + " "));
  };
  const hit =
    fonts.find((f) => match(f) && styleIsRegular(f.style)) || fonts.find((f) => match(f));
  if (!hit) return null;
  const blob = await hit.blob();
  return { family: hit.family || names[0], bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export async function loadFontBytes(spec: FontSpec): Promise<Uint8Array> {
  const hit = bytesCache.get(spec.url);
  if (hit) return hit;
  const resp = await fetch(spec.url);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  bytesCache.set(spec.url, bytes);
  return bytes;
}

export type LoadedFace = {
  family: string;
  file: string;
  bytes: Uint8Array;
};

export async function resolveFaceBytes(
  choice: FontChoice,
  onStatus?: (name: string) => void,
): Promise<LoadedFace | null> {
  if (choice.locals.length) {
    try {
      if (onStatus) onStatus(choice.family);
      const local = await loadLocalFontBytes(choice.locals);
      if (local) {
        return {
          family: local.family,
          file: choice.family.replace(/\s+/g, "") + ".ttf",
          bytes: local.bytes,
        };
      }
    } catch {
      /* fall through */
    }
  }
  if (choice.cdn) {
    if (onStatus) onStatus(choice.cdn.family);
    const bytes = await loadFontBytes(choice.cdn);
    return { family: choice.cdn.family, file: choice.cdn.file, bytes };
  }
  return null;
}

export async function fontsForEngine(
  fontId: string | undefined,
  detected: ScriptId | null,
  onStatus?: (name: string) => void,
  langs?: string[],
): Promise<{ faces: LoadedFace[]; usedFamily: string }> {
  const loaded: LoadedFace[] = [];
  const seen = new Set<string>();
  const systemLangs = langs ?? browserLanguages();

  async function tryAdd(item: FontChoice | undefined, allowCdn: boolean): Promise<boolean> {
    if (!item) return false;
    const probe = allowCdn ? item : { ...item, cdn: undefined };
    try {
      const face = await resolveFaceBytes(probe, onStatus);
      if (!face || seen.has(face.file)) return false;
      seen.add(face.file);
      loaded.push(face);
      return true;
    } catch (err) {
      console.warn("Font resolve failed:", item.family, err);
      return false;
    }
  }

  async function tryLocalNames(names: string[], label?: string): Promise<boolean> {
    const unique = names.filter((name, i) => name && names.indexOf(name) === i);
    if (!unique.length) return false;
    return tryAdd(
      {
        id: "local-" + (label || unique[0]),
        family: unique[0],
        locals: unique,
        group: "latin",
      },
      false,
    );
  }

  async function ensureScript(script: ScriptId): Promise<void> {
    const stack = SYSTEM_STACKS[script] || [];
    if (loaded.some((face) => stack.includes(face.family))) return;
    if (await tryLocalNames(stack, script)) return;

    const ids = FONT_GROUPS.find((g) => g.id === script)?.choiceIds || [];
    for (const id of ids) {
      const opt = fontChoice(id);
      if (opt.cdn) continue;
      if (await tryAdd(opt, false)) return;
    }

    const cdn = SCRIPT_CDN[script] || (isCjkFace(script) ? CJK_FONTS[script] : undefined);
    if (!cdn) return;
    await tryAdd(
      {
        id: cdn.id,
        family: cdn.family,
        locals: [cdn.family],
        group: script,
        cdn,
      },
      true,
    );
  }

  const choice = fontChoice(fontId);
  if (choice.id !== "auto") {
    await tryAdd(choice, true);
  } else if (
    !(await tryAdd(fontChoice("georgia"), false)) &&
    !(await tryAdd(fontChoice("times"), false))
  ) {
    await tryAdd(fontChoice("literata"), true);
  }

  for (const script of scriptsForEngine(fontId, detected, systemLangs)) {
    await ensureScript(script);
  }

  const unknownSystemLang = systemLangs.find(
    (lang) => scriptFromLang(lang) === "latin" && !isLatinLang(lang),
  );
  if (unknownSystemLang) {
    await tryLocalNames(
      [
        "Nirmala UI",
        "Leelawadee UI",
        "Ebrima",
        "Gadugi",
        "Sylfaen",
        "Segoe UI",
        "MV Boli",
        "Euphemia",
      ],
      "system-coverage",
    );
  }
  return { faces: loaded, usedFamily: usedFamilyFromLoaded(fontId, detected, loaded) };
}

export function enginePrimaryFamily(fontId: string | undefined, detected: ScriptId | null): string {
  return pickUsedFontFamily(fontId, detected);
}

function firstAvailableFont(names: string[]): string | null {
  if (!names.length) return null;
  if (typeof document === "undefined") return names[0];
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return names[0];
    const sample = "A國한あבกकஅকЯΩ";
    ctx.font = '72px "LazahataMissingFont", serif';
    const fallback = ctx.measureText(sample).width;
    for (const name of names) {
      ctx.font = `72px "${name}", "LazahataMissingFont", serif`;
      if (ctx.measureText(sample).width !== fallback) return name;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function pickUsedFontFamily(fontId?: string, detected?: ScriptId | null): string {
  const choice = fontChoice(fontId);
  if (choice.id !== "auto") {
    return (
      firstAvailableFont(choice.locals.length ? choice.locals : [choice.family]) ||
      choice.cdn?.family ||
      choice.family
    );
  }
  if (detected) {
    const extra = isCjkFace(detected) ? [CJK_FONTS[detected].family] : [];
    return firstAvailableFont([...SYSTEM_STACKS[detected], ...extra]) || SYSTEM_STACKS[detected][0];
  }
  return firstAvailableFont([...LATIN_STACK, LATIN_FONT.family]) || "Georgia";
}

export function usedFamilyFromLoaded(
  fontId: string | undefined,
  detected: ScriptId | null,
  loaded: LoadedFace[],
): string {
  const choice = fontChoice(fontId);
  if (choice.id !== "auto") {
    const hit = loaded.find(
      (f) => f.family === choice.family || choice.locals.includes(f.family),
    );
    return hit?.family || loaded[0]?.family || pickUsedFontFamily(fontId, detected);
  }
  if (detected && detected !== "latin") {
    const skipLatin = new Set(LATIN_STACK.concat(LATIN_FONT.family));
    const scriptFace = loaded.find((f) => !skipLatin.has(f.family));
    return scriptFace?.family || loaded[0]?.family || pickUsedFontFamily(fontId, detected);
  }
  return loaded[0]?.family || pickUsedFontFamily(fontId, detected);
}

export function fallbackFaceList(): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const list of Object.values(SYSTEM_STACKS)) {
    for (const name of list) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names.join(", ");
}

"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  availableFontChoiceIds,
  bookFontChoice,
  fontChoice,
  pickUsedFontFamily,
  preferredFontGroups,
  SCRIPT_GROUP_LABELS,
  type ScriptId,
} from "@/lib/fonts";
import {
  defaultEncodingForLanguage,
  encodingLabel,
  encodingsForMenu,
  systemLanguage,
  type TxtEncodingId,
} from "@/lib/adapters/txt";
import { resolveLocale, t, type MessageKey } from "@/lib/i18n";
import type { PersistSettings, ResolvedWritingMode, WritingMode } from "@/lib/types";

const FONT_GROUP_KEYS: Record<string, MessageKey> = {
  latin: "fontGroupLatin",
  jp: "fontGroupJp",
  sc: "fontGroupSc",
  tc: "fontGroupTc",
  kr: "fontGroupKr",
  cyrl: "fontGroupCyrl",
  arab: "fontGroupArab",
  hebr: "fontGroupHebr",
  thai: "fontGroupThai",
  deva: "fontGroupDeva",
  taml: "fontGroupTaml",
  beng: "fontGroupBeng",
};

type BookWriting = {
  choice: WritingMode;
  axis: ResolvedWritingMode | null;
  sniffedAxis: ResolvedWritingMode | null;
};

type Props = {
  settings: PersistSettings;
  onChange: (patch: Partial<PersistSettings>, refreshPreview?: boolean) => void;
  bookWriting: BookWriting | null;
  bookScript?: ScriptId | null;
  bookFontId?: string;
  onBookWritingChange: (mode: WritingMode) => void;
  onBookFontChange: (fontId: string) => void;
  bookIsTxt?: boolean;
  txtEncoding?: string;
  detectedEncoding?: string | null;
  onTxtEncodingChange?: (encoding: string) => void;
  writingDisabled?: boolean;
};

function fontDesc(
  book: BookWriting | null,
  fontId: string,
  family: string,
  locale: ReturnType<typeof resolveLocale>,
): string {
  if (!book) return t("writingDetectOnDrop", undefined, locale);
  if (book.choice === "auto" && book.axis == null && !family) {
    return t("writingDetecting", undefined, locale);
  }
  if (fontId === "auto") {
    return t("writingThisBook", { mode: family || t("fontAuto", undefined, locale) }, locale);
  }
  return t("writingOverride", undefined, locale);
}

function groupLabel(id: string, locale: ReturnType<typeof resolveLocale>): string {
  const key = FONT_GROUP_KEYS[id];
  if (key) return t(key, undefined, locale);
  return SCRIPT_GROUP_LABELS[id] || id;
}

function clientSnapshot() {
  return true;
}

function serverSnapshot() {
  return false;
}

function subscribeNoop() {
  return () => {};
}

function withCurrentFont(groups: ReturnType<typeof preferredFontGroups>, fontId: string) {
  if (fontId === "auto" || groups.some((g) => g.choiceIds.includes(fontId))) return groups;
  const choice = fontChoice(fontId);
  const match = groups.find((g) => g.id === choice.group);
  if (match) {
    return groups.map((g) =>
      g.id === match.id ? { ...g, choiceIds: [fontId, ...g.choiceIds] } : g,
    );
  }
  return [...groups, { id: choice.group, choiceIds: [fontId] }];
}

function writingDesc(
  book: BookWriting | null,
  locale: ReturnType<typeof resolveLocale>,
): string {
  if (!book) return t("writingDetectOnDrop", undefined, locale);
  if (book.choice === "auto" && book.axis == null) {
    return t("writingDetecting", undefined, locale);
  }
  const live = t(book.axis || "horizontal", undefined, locale);
  if (book.choice === "auto") {
    return t("writingThisBook", { mode: live }, locale);
  }
  if (book.sniffedAxis == null) return t("writingOverride", undefined, locale);
  return t("writingOverrideDetected", { mode: t(book.sniffedAxis, undefined, locale) }, locale);
}

export function SettingsPanel({
  settings,
  onChange,
  bookWriting,
  bookScript = null,
  bookFontId = "auto",
  onBookWritingChange,
  onBookFontChange,
  bookIsTxt = false,
  txtEncoding = "auto",
  detectedEncoding = null,
  onTxtEncodingChange,
  writingDisabled,
}: Props) {
  const isClient = useSyncExternalStore(subscribeNoop, clientSnapshot, serverSnapshot);
  const locale = resolveLocale(settings.locale, isClient ? undefined : "en");
  const vertical = bookWriting?.axis === "vertical";
  const writingLocked = !bookWriting || writingDisabled;
  const fontLocked = !bookWriting || writingDisabled;
  const installedIds = useMemo(
    () => (isClient ? availableFontChoiceIds() : null),
    [isClient],
  );
  const fontGroups = useMemo(() => {
    const groups = preferredFontGroups(
      settings.locale === "auto" ? undefined : settings.locale,
      isClient ? navigator.language : undefined,
      bookScript,
      installedIds,
    );
    return withCurrentFont(groups, bookFontId);
  }, [settings.locale, bookScript, installedIds, bookFontId, isClient]);
  const autoFamily =
    isClient && bookScript
      ? pickUsedFontFamily("auto", bookScript)
      : "";

  return (
    <aside className="card">
      <h2>{t("output", undefined, locale)}</h2>

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("device", undefined, locale)}</div>
          <div className="setting-desc">{t("deviceDesc", undefined, locale)}</div>
        </div>
        <div className={`seg${writingDisabled ? " disabled" : ""}`}>
          <button
            type="button"
            disabled={writingDisabled}
            className={settings.deviceId === "X4" ? "active" : ""}
            onClick={() => onChange({ deviceId: "X4" }, true)}
          >
            X4
          </button>
          <button
            type="button"
            disabled={writingDisabled}
            className={settings.deviceId === "X3" ? "active" : ""}
            onClick={() => onChange({ deviceId: "X3" }, true)}
          >
            X3
          </button>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("font", undefined, locale)}</div>
          <div className="setting-desc">
            {fontDesc(bookWriting, bookFontId, autoFamily, locale)}
          </div>
        </div>
        <select
          className="field"
          value={bookFontId}
          disabled={fontLocked}
          onChange={(e) => onBookFontChange(e.target.value)}
        >
          {fontGroups.map((group) => {
            if (group.id === "auto") {
              return (
                <optgroup key="auto" label={t("fontAuto", undefined, locale)}>
                  <option value="auto">
                    {autoFamily
                      ? `${t("fontAuto", undefined, locale)} · ${autoFamily}`
                      : t("fontAuto", undefined, locale)}
                  </option>
                </optgroup>
              );
            }
            return (
              <optgroup key={group.id} label={groupLabel(group.id, locale)}>
                {group.choiceIds.map((id) => {
                  const choice = isClient ? bookFontChoice(id) : fontChoice(id);
                  return (
                    <option key={choice.id} value={choice.id}>
                      {choice.family}
                    </option>
                  );
                })}
              </optgroup>
            );
          })}
        </select>
      </div>

      {bookIsTxt ? (
        <div className="setting-row">
          <div>
            <div className="setting-title">{t("encoding", undefined, locale)}</div>
            <div className="setting-desc">
              {txtEncoding === "auto" && detectedEncoding
                ? t(
                    "encodingThisFile",
                    { name: encodingLabel(detectedEncoding as TxtEncodingId) },
                    locale,
                  )
                : t("encodingDesc", undefined, locale)}
            </div>
          </div>
          <select
            className="field"
            value={txtEncoding}
            disabled={fontLocked}
            onChange={(e) => onTxtEncodingChange?.(e.target.value)}
          >
            <option value="auto">
              {detectedEncoding || isClient
                ? `${t("encodingAuto", undefined, locale)} · ${encodingLabel(
                    (detectedEncoding ||
                      defaultEncodingForLanguage(systemLanguage())) as TxtEncodingId,
                  )}`
                : t("encodingAuto", undefined, locale)}
            </option>
            {encodingsForMenu(
              isClient ? systemLanguage() : "en",
              detectedEncoding as TxtEncodingId | null,
            ).map((enc) => (
              <option key={enc.id} value={enc.id}>
                {enc.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("fontSize", undefined, locale)}</div>
        </div>
        <div className="range-wrap">
          <input
            type="range"
            min={20}
            max={56}
            step={1}
            disabled={writingDisabled}
            value={settings.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            onMouseUp={() => onChange({}, true)}
            onTouchEnd={() => onChange({}, true)}
            onKeyUp={() => onChange({}, true)}
          />
          <span className="range-val">{settings.fontSize}</span>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("lineHeight", undefined, locale)}</div>
        </div>
        <div className="range-wrap">
          <input
            type="range"
            min={100}
            max={160}
            step={5}
            disabled={writingDisabled}
            value={settings.lineHeight}
            onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
            onMouseUp={() => onChange({}, true)}
            onTouchEnd={() => onChange({}, true)}
            onKeyUp={() => onChange({}, true)}
          />
          <span className="range-val">{settings.lineHeight}%</span>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("alignment", undefined, locale)}</div>
        </div>
        <select
          className="field"
          disabled={writingDisabled}
          value={String(settings.textAlign)}
          onChange={(e) => onChange({ textAlign: Number(e.target.value) }, true)}
        >
          <option value="3">{t("justify", undefined, locale)}</option>
          <option value="0">{t(vertical ? "alignStartV" : "alignStartH", undefined, locale)}</option>
          <option value="2">{t("center", undefined, locale)}</option>
          <option value="1">{t(vertical ? "alignEndV" : "alignEndH", undefined, locale)}</option>
        </select>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("hyphenation", undefined, locale)}</div>
        </div>
        <select
          className="field"
          disabled={writingDisabled}
          value={String(settings.hyphenation)}
          onChange={(e) => onChange({ hyphenation: Number(e.target.value) }, true)}
        >
          <option value="0">{t("off", undefined, locale)}</option>
          <option value="1">{t("on", undefined, locale)}</option>
        </select>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("writing", undefined, locale)}</div>
          <div className="setting-desc">{writingDesc(bookWriting, locale)}</div>
        </div>
        <div className={`seg${writingLocked ? " disabled" : ""}`}>
          <button
            type="button"
            disabled={writingLocked}
            className={bookWriting?.choice === "auto" || !bookWriting ? "active" : ""}
            onClick={() => onBookWritingChange("auto")}
          >
            {t("auto", undefined, locale)}
          </button>
          <button
            type="button"
            disabled={writingLocked}
            className={bookWriting?.choice === "horizontal" ? "active" : ""}
            onClick={() => onBookWritingChange("horizontal")}
          >
            {t("horizontal", undefined, locale)}
          </button>
          <button
            type="button"
            disabled={writingLocked}
            className={bookWriting?.choice === "vertical" ? "active" : ""}
            onClick={() => onBookWritingChange("vertical")}
          >
            {t("vertical", undefined, locale)}
          </button>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("readDirection", undefined, locale)}</div>
          <div className="setting-desc">{t("readDirectionDesc", undefined, locale)}</div>
        </div>
        <div className={`seg${writingDisabled ? " disabled" : ""}`}>
          <button
            type="button"
            disabled={writingDisabled}
            className={settings.readDirection === 0 ? "active" : ""}
            onClick={() => onChange({ readDirection: 0 })}
          >
            {t("ltr", undefined, locale)}
          </button>
          <button
            type="button"
            disabled={writingDisabled}
            className={settings.readDirection === 1 ? "active" : ""}
            onClick={() => onChange({ readDirection: 1 })}
          >
            {t("rtl", undefined, locale)}
          </button>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-title">{t("nameFromTitle", undefined, locale)}</div>
          <div className="setting-desc">{t("nameFromTitleDesc", undefined, locale)}</div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.renameFromTitle}
            onChange={(e) => onChange({ renameFromTitle: e.target.checked })}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      <p className="note">{t("note", undefined, locale)}</p>
    </aside>
  );
}

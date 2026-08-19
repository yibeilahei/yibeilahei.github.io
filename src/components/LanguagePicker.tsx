"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALE_OPTIONS, t, type Locale, type LocalePref } from "@/lib/i18n";

export function LanguagePicker({
  value,
  locale,
  onChange,
}: {
  value: LocalePref;
  locale: Locale;
  onChange: (next: LocalePref) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = t("language", undefined, locale);

  return (
    <div className="lang-picker" ref={rootRef}>
      <button
        type="button"
        className="lang-picker-btn"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          viewBox="0 0 16 16"
          width="20"
          height="20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM1.55 8.5h2.03c.06 1.3.28 2.53.63 3.6a5.5 5.5 0 0 1-2.66-3.6ZM1.55 7.5a5.5 5.5 0 0 1 2.66-3.6 12.4 12.4 0 0 0-.63 3.6H1.55Zm3.03 0c.07-1.36.32-2.6.7-3.61.5-1.32 1.1-1.96 1.72-1.96s1.22.64 1.72 1.96c.38 1.01.63 2.25.7 3.61H4.58Zm0 1h5.84c-.07 1.36-.32 2.6-.7 3.61-.5 1.32-1.1 1.96-1.72 1.96s-1.22-.64-1.72-1.96a11.4 11.4 0 0 1-.7-3.61Zm5.85-1a12.4 12.4 0 0 0-.63-3.6 5.5 5.5 0 0 1 2.66 3.6h-2.03Zm0 1h2.03a5.5 5.5 0 0 1-2.66 3.6c.35-1.07.57-2.3.63-3.6ZM9.7 2.68c.68.53 1.25 1.32 1.65 2.3a6.6 6.6 0 0 1-.35-.02c-.16-.83-.4-1.6-.7-2.28Zm-3.4 0c-.3.68-.54 1.45-.7 2.28a5.9 5.9 0 0 1-.35.02c.4-.98.97-1.77 1.65-2.3Zm-1.05 8.64c.16.83.4 1.6.7 2.28-.68-.53-1.25-1.32-1.65-2.3.19.01.32.02.35.02Zm4.5 2.28c.3-.68.54-1.45.7-2.28.03 0 .16-.01.35-.02-.4.98-.97 1.77-1.65 2.3Z" />
        </svg>
      </button>
      {open && (
        <ul className="lang-picker-menu" role="menu">
          {LOCALE_OPTIONS.map((opt) => (
            <li key={opt.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={value === opt.id}
                className={`lang-picker-item${value === opt.id ? " active" : ""}`}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
              >
                {opt.id === "auto" ? t("languageAuto", undefined, locale) : opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

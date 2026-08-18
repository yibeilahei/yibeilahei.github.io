"use client";

import type { RefObject } from "react";
import { t, type Locale } from "@/lib/i18n";

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hasPreview: boolean;
  title: string;
  pageLabel: string;
  canPrev: boolean;
  canNext: boolean;
  width: number;
  height: number;
  onPrev: () => void;
  onNext: () => void;
  locale: Locale;
};

export function Preview({
  canvasRef,
  hasPreview,
  title,
  pageLabel,
  canPrev,
  canNext,
  width,
  height,
  onPrev,
  onNext,
  locale,
}: Props) {
  return (
    <section className="card preview-card">
      <h2>{t("preview", undefined, locale)}</h2>
      <div className="preview-stage">
        <div className="eink">
          <div
            className="eink-screen"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            {!hasPreview ? (
              <div className="preview-empty">{t("previewEmpty", undefined, locale)}</div>
            ) : null}
            <canvas
              ref={canvasRef}
              id="previewCanvas"
              width={width}
              height={height}
              style={{ display: hasPreview ? "block" : "none" }}
            />
          </div>
        </div>
      </div>
      <div className="preview-nav">
        <button type="button" className="btn btn-ghost" disabled={!canPrev} onClick={onPrev}>
          ◀ {t("prev", undefined, locale)}
        </button>
        <div className="preview-info">
          <span className="preview-title">{title}</span>
          <span>{pageLabel}</span>
        </div>
        <button type="button" className="btn btn-ghost" disabled={!canNext} onClick={onNext}>
          {t("next", undefined, locale)} ▶
        </button>
      </div>
    </section>
  );
}

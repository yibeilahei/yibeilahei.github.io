"use client";

import { effectiveWritingMode, pagerKind } from "@/lib/detectVertical";
import { pickUsedFontFamily } from "@/lib/fonts";
import { t, type Locale } from "@/lib/i18n";
import type { Job, LayoutLib, PersistSettings } from "@/lib/types";

type Props = {
  jobs: Job[];
  activeId: string | null;
  converting: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onDownload: (id: string) => void;
  locale: Locale;
  settings: PersistSettings;
};

function predictedEngine(job: Job, epubCrengine: boolean): LayoutLib | null {
  if (job.engine) return job.engine;
  if (job.writingMode === "auto" && job.detectedVertical == null) return null;
  const kind = pagerKind(job.writingMode, job.detectedVertical, job.converter.id, epubCrengine);
  return kind === "crengine" ? "crengine" : "foliate";
}

export function Queue({
  jobs,
  activeId,
  converting,
  onSelect,
  onRemove,
  onDownload,
  locale,
  settings,
}: Props) {
  if (!jobs.length) {
    return (
      <div className="queue">
        <p className="queue-empty">{t("queueEmpty", undefined, locale)}</p>
      </div>
    );
  }

  return (
    <div className="queue">
      {jobs.map((job) => {
        const used = job.usedSettings || {
          deviceId: settings.deviceId,
          fontId: job.fontId,
          fontFamily: pickUsedFontFamily(
            job.fontId,
            job.detectedScript || (job.detectedVertical ? "jp" : null),
          ),
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
        };
        const engine = predictedEngine(job, settings.epubCrengine !== false);
        const writing =
          job.writingMode === "auto" && job.detectedVertical == null
            ? "…"
            : effectiveWritingMode(job.writingMode, job.detectedVertical) === "vertical"
              ? t("vertical", undefined, locale)
              : t("horizontal", undefined, locale);
        const fontLabel = used.fontFamily;

        return (
          <div key={job.id} className={`job${job.id === activeId ? " active" : ""}`}>
            <div className="job-icon">
              {job.status === "done" ? "📗" : job.status === "error" ? "⚠️" : "📘"}
            </div>
            <div className="job-meta">
              <div className="job-name" onClick={() => onSelect(job.id)}>
                <span className="job-title">{job.file.name}</span>
              </div>
              <div className="job-facts">
                <span className="job-tag lib">
                  {engine === "foliate"
                    ? t("libFoliate", undefined, locale)
                    : engine === "crengine"
                      ? t("libCrengine", undefined, locale)
                      : "…"}
                </span>
                <span className="job-tag">{writing}</span>
                <span className="job-tag">{used.deviceId}</span>
                <span className="job-tag">{fontLabel}</span>
                <span className="job-tag">{used.fontSize}px</span>
                <span className="job-tag">{used.lineHeight}%</span>
              </div>
              <div className="job-sub">{job.error || job.message}</div>
            </div>
            <div className="job-actions">
              {job.result ? (
                <button
                  type="button"
                  className="icon-btn"
                  title={t("downloadXtch", undefined, locale)}
                  onClick={() => onDownload(job.id)}
                >
                  ⬇️
                </button>
              ) : null}
              <button
                type="button"
                className="icon-btn danger"
                title={t("remove", undefined, locale)}
                disabled={converting && job.status === "converting"}
                onClick={() => onRemove(job.id)}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

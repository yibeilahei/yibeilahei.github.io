"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptAttribute,
  comingSoonFor,
  listConverters,
  matchConverter,
} from "@/lib/converters";
import { downloadBytes, downloadJobs } from "@/lib/download";
import { ensureRenderer } from "@/lib/engine";
import {
  DEFAULT_SETTINGS,
  DEVICE_PROFILES,
  formatSize,
  loadSettings,
  saveSettings,
  toConvertSettings,
  uid,
} from "@/lib/settings";
import { convertWritingMode, isVerticalEpub } from "@/lib/detectVertical";
import { detectScriptFromEpub, pickUsedFontFamily } from "@/lib/fonts";
import {
  applyDocumentLocale,
  LOCALE_OPTIONS,
  resolveLocale,
  setLocale,
  t,
  type LocalePref,
} from "@/lib/i18n";
import { decodeXthPage, parseXtch, type XtchBook } from "@/lib/xtch";
import type { ConvertResult, Job, PersistSettings, ToastState, WritingMode } from "@/lib/types";

const PREVIEW_PAGES = 20;
import { DropZone } from "./DropZone";
import { Preview } from "./Preview";
import { Queue } from "./Queue";
import { SettingsPanel } from "./SettingsPanel";
import { Toast } from "./Toast";

function paintFrame(
  canvas: HTMLCanvasElement,
  frame: ArrayLike<number>,
  width: number,
  height: number,
) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(frame), width, height), 0, 0);
}

export function ConverterApp() {
  const [settings, setSettings] = useState<PersistSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [converting, setConverting] = useState(false);
  const [engineStatus, setEngineStatus] = useState({ text: t("loadingEngine"), kind: "" });
  const [progress, setProgress] = useState({ visible: false, pct: 0, text: "" });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [hasPreview, setHasPreview] = useState(false);
  const [previewTitle, setPreviewTitle] = useState(t("noBook"));
  const [previewPage, setPreviewPage] = useState(t("dropToPreview"));
  const [pageCount, setPageCount] = useState(0);

  const xtchRef = useRef<XtchBook | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jobsRef = useRef(jobs);
  const settingsRef = useRef(settings);
  const pageRef = useRef(page);
  const toastTimer = useRef<number | null>(null);
  const convertingRef = useRef(false);
  const convertQueueRef = useRef<((opts?: { maxPages?: number; download?: boolean }) => Promise<void>) | null>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const showToast = useCallback((message: string, type: ToastState["type"] = "info") => {
    setToast({ message, type });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const setStatus = useCallback((text: string, kind = "") => {
    setEngineStatus({ text, kind });
  }, []);

  useEffect(() => {
    const saved = loadSettings();
    settingsRef.current = saved;
    // localStorage is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted settings
    setSettings(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSettings(settings);
  }, [hydrated, settings]);

  const locale = resolveLocale(settings.locale);

  useEffect(() => {
    if (!hydrated) return;
    const s = toConvertSettings(settingsRef.current);
    ensureRenderer(s.device.w, s.device.h, setStatus)
      .then(() => {
        if (!xtchRef.current) {
          setStatus(t("engineReady"), "ready");
        }
      })
      .catch((err) => {
        console.error(err);
        setStatus(t("engineLoadFailed"), "error");
      });
  }, [hydrated, setStatus]);

  const renderPreviewPage = useCallback(() => {
    const book = xtchRef.current;
    const canvas = canvasRef.current;
    if (!book || !canvas || !book.pages.length) {
      setHasPreview(false);
      setPreviewTitle(t("noBook"));
      setPreviewPage(t("dropToPreview"));
      return;
    }
    const pageIndex = Math.max(0, Math.min(book.pageCount - 1, pageRef.current));
    const decoded = decodeXthPage(book.pages[pageIndex]);
    paintFrame(canvas, decoded.rgba, decoded.width, decoded.height);
    setHasPreview(true);
    setPreviewTitle(book.title + (book.author ? " — " + book.author : ""));
    const job = jobsRef.current.find((j) => j.id === activeIdRef.current);
    const prefix = job?.result?.partial ? t("previewPrefix") : "";
    setPreviewPage(prefix + t("pageOf", { current: pageIndex + 1, total: book.pageCount }));
  }, []);

  const showXtch = useCallback(
    (result: ConvertResult, resetPage = false) => {
      try {
        const book = parseXtch(result.bytes);
        xtchRef.current = book;
        if (resetPage || pageRef.current >= book.pageCount) {
          pageRef.current = 0;
          setPage(0);
        }
        setPageCount(book.pageCount);
        renderPreviewPage();
        setStatus(
          result.partial
            ? t("previewFirstPages", { n: book.pageCount })
            : t("xtchReady", { n: book.pageCount }),
          "ready",
        );
      } catch (err) {
        console.error(err);
        setStatus(err instanceof Error ? err.message : t("previewFailed"), "error");
      }
    },
    [renderPreviewPage, setStatus],
  );

  useEffect(() => {
    setLocale(locale);
    applyDocumentLocale(locale);
    if (!xtchRef.current) {
      setPreviewTitle(t("noBook", undefined, locale));
      setPreviewPage(t("dropToPreview", undefined, locale));
    } else {
      renderPreviewPage();
    }
  }, [locale, renderPreviewPage]);

  const selectJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job) return;
      setActiveId(id);
      if (job.result) {
        showXtch(job.result, true);
        return;
      }
      xtchRef.current = null;
      setHasPreview(false);
      setPageCount(0);
      setPreviewTitle(job.file.name);
      setPreviewPage(job.status === "converting" ? t("convertingXtch") : t("waitingConvert"));
    },
    [showXtch],
  );

  const refreshPreview = useCallback(() => {
    setJobs((prev) => {
      const next = prev.map((j) =>
        j.status === "converting"
          ? j
          : { ...j, status: "queued" as const, message: t("waitingReconvert"), error: null },
      );
      jobsRef.current = next;
      return next;
    });
    window.setTimeout(() => {
      void convertQueueRef.current?.({ maxPages: PREVIEW_PAGES });
    }, 0);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<PersistSettings>, refresh = false) => {
      if (Object.keys(patch).length) {
        setSettings((prev) => {
          const next = { ...prev, ...patch };
          settingsRef.current = next;
          return next;
        });
      }
      if (refresh) {
        window.setTimeout(() => {
          void refreshPreview();
        }, 0);
      }
    },
    [refreshPreview],
  );

  const patchActiveBook = useCallback((patch: Partial<Job>) => {
    const id = activeIdRef.current;
    if (!id || convertingRef.current) return false;
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job) return false;
    setJobs((prev) => {
      const next = prev.map((j) =>
        j.id === id
          ? {
              ...j,
              ...patch,
              status: "queued" as const,
              message: t("waitingReconvert"),
              result: null,
              error: null,
              engine: null,
              usedSettings: null,
            }
          : j,
      );
      jobsRef.current = next;
      return next;
    });
    xtchRef.current = null;
    setHasPreview(false);
    setPageCount(0);
    window.setTimeout(() => {
      void convertQueueRef.current?.({ maxPages: PREVIEW_PAGES });
    }, 0);
    return true;
  }, []);

  const updateBookWriting = useCallback((mode: WritingMode) => {
    const job = jobsRef.current.find((j) => j.id === activeIdRef.current);
    if (!job || job.writingMode === mode) return;
    patchActiveBook({ writingMode: mode });
  }, [patchActiveBook]);

  const updateBookFont = useCallback((fontId: string) => {
    const job = jobsRef.current.find((j) => j.id === activeIdRef.current);
    if (!job || job.fontId === fontId) return;
    patchActiveBook({ fontId });
  }, [patchActiveBook]);

  const addFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      if (!files.length) return;

      const skippedSoon: string[] = [];
      const skippedOther: string[] = [];
      const nextJobs: Job[] = [];

      for (const file of files) {
        const converter = matchConverter(file);
        if (converter) {
          const exists = jobsRef.current.some(
            (j) => j.file.name === file.name && j.file.size === file.size,
          ) || nextJobs.some((j) => j.file.name === file.name && j.file.size === file.size);
          if (exists) continue;
          nextJobs.push({
            id: uid(),
            file,
            converter,
            status: "queued",
            message: t("detectingWriting"),
            result: null,
            error: null,
            writingMode: "auto",
            fontId: "auto",
            detectedVertical: null,
            detectedScript: null,
            engine: null,
            usedSettings: null,
          });
          continue;
        }
        const soon = comingSoonFor(file.name);
        if (soon) skippedSoon.push(soon.label);
        else skippedOther.push(file.name);
      }

      if (nextJobs.length) {
        const shouldSelect = !activeId;
        setJobs((prev) => {
          const merged = [...prev, ...nextJobs];
          jobsRef.current = merged;
          return merged;
        });
        if (shouldSelect) {
          activeIdRef.current = nextJobs[0].id;
          setActiveId(nextJobs[0].id);
        }
        void (async () => {
          const detected = await Promise.all(
            nextJobs.map(async (job) => {
              try {
                const [vertical, script] = await Promise.all([
                  isVerticalEpub(job.file),
                  detectScriptFromEpub(job.file),
                ]);
                return { id: job.id, vertical, script };
              } catch {
                return { id: job.id, vertical: false, script: null };
              }
            }),
          );
          const byId = new Map(detected.map((d) => [d.id, d]));
          setJobs((prev) => {
            const next = prev.map((j) => {
              if (!byId.has(j.id) || j.detectedVertical != null) return j;
              const hit = byId.get(j.id);
              const vertical = hit?.vertical === true;
              return {
                ...j,
                detectedVertical: vertical,
                detectedScript: hit?.script ?? null,
                message:
                  j.status === "queued" && !j.result
                    ? t("writingSize", {
                        mode: t(vertical ? "vertical" : "horizontal"),
                        size: formatSize(j.file.size),
                      })
                    : j.message,
              };
            });
            jobsRef.current = next;
            return next;
          });
          window.setTimeout(() => {
            void convertQueueRef.current?.({ maxPages: PREVIEW_PAGES });
          }, 0);
        })();
      }

      if (skippedSoon.length) {
        showToast(t("formatComing", { names: [...new Set(skippedSoon)].join(", ") }), "warn");
      } else if (skippedOther.length) {
        showToast(t("unsupportedType"), "warn");
      }
    },
    [activeId, showToast],
  );

  const removeJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job) return;
      if (convertingRef.current && job.status === "converting") return;
      const remaining = jobsRef.current.filter((j) => j.id !== id);
      jobsRef.current = remaining;
      setJobs(remaining);
      if (activeId === id) {
        xtchRef.current = null;
        const next = remaining[0];
        if (next) selectJob(next.id);
        else {
          setActiveId(null);
          setHasPreview(false);
          setPageCount(0);
          setPreviewTitle(t("noBook"));
          setPreviewPage(t("dropToPreview"));
        }
      }
    },
    [activeId, selectJob],
  );

  const convertQueue = useCallback(async (opts: { maxPages?: number; download?: boolean } = {}) => {
    if (convertingRef.current) return;
    const preview = opts.maxPages != null;
    const pending = jobsRef.current.filter((j) => {
      if (preview) return j.status === "queued" || j.status === "error";
      return !j.result || j.result.partial || j.status === "error" || j.status === "queued";
    });
    if (!pending.length) {
      if (opts.download) {
        const ready = jobsRef.current.filter((j) => j.result && !j.result.partial);
        if (ready.length) void downloadJobs(ready);
      }
      return;
    }

    convertingRef.current = true;
    setConverting(true);
    const abort = new AbortController();
    abortRef.current = abort;
    setProgress({
      visible: true,
      pct: 0,
      text: preview ? t("buildingPreview") : t("convertingFull"),
    });

    let doneCountLocal = 0;
    let lastFilename = "";
    let firstError: string | null = null;
    let cancelled = false;

    for (let i = 0; i < pending.length; i++) {
      const job = pending[i];
      if (!activeIdRef.current) {
        activeIdRef.current = job.id;
        setActiveId(job.id);
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                status: "converting",
                message: preview ? t("previewing") : t("converting"),
                usedSettings: {
                  deviceId: settingsRef.current.deviceId,
                  fontId: job.fontId,
                  fontFamily: pickUsedFontFamily(
                    job.fontId,
                    job.detectedScript || (job.detectedVertical ? "jp" : null),
                  ),
                  fontSize: settingsRef.current.fontSize,
                  lineHeight: settingsRef.current.lineHeight,
                },
              }
            : j,
        ),
      );
      try {
        const result = await job.converter.convert(
          job.file,
          toConvertSettings(
            settingsRef.current,
            convertWritingMode(job.writingMode, job.detectedVertical),
            job.fontId,
          ),
          {
          signal: abort.signal,
          maxPages: opts.maxPages,
          onStatus: setStatus,
          onProgress: (p, currentPage, total) => {
            setProgress({
              visible: true,
              pct: ((i + p) / pending.length) * 100,
              text: t("pageProgress", { name: job.file.name, current: currentPage, total }),
            });
            setJobs((prev) =>
              prev.map((j) =>
                j.id === job.id ? { ...j, message: t("pageShort", { current: currentPage, total }) } : j,
              ),
            );
          },
        });
        doneCountLocal += 1;
        lastFilename = result.filename;
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  status: "done",
                  engine: result.engine || j.engine,
                  usedSettings: {
                    deviceId: settingsRef.current.deviceId,
                    fontId: job.fontId,
                    fontFamily:
                      result.usedFontFamily ||
                      j.usedSettings?.fontFamily ||
                      pickUsedFontFamily(
                        job.fontId,
                        job.detectedScript || (job.detectedVertical ? "jp" : null),
                      ),
                    fontSize: settingsRef.current.fontSize,
                    lineHeight: settingsRef.current.lineHeight,
                  },
                  result,
                  message: result.partial
                    ? t("previewPages", { n: result.pageCount })
                    : t("pagesSize", { n: result.pageCount, size: formatSize(result.bytes.byteLength) }),
                }
              : j,
          ),
        );
        if (job.id === activeIdRef.current || !xtchRef.current) {
          showXtch(result, !xtchRef.current);
        }
        if (opts.download && !result.partial) {
          downloadBytes(result.bytes, result.filename);
        }
      } catch (err) {
        const error = err as Error;
        if (error.name === "AbortError" || error.message === "Cancelled") {
          cancelled = true;
          setJobs((prev) =>
            prev.map((j) =>
              j.id === job.id ? { ...j, status: "queued", message: t("cancelled") } : j,
            ),
          );
          setProgress({ visible: true, pct: 0, text: t("cancelled") });
          break;
        }
        console.error(err);
        const message = error.message || t("convertFailed");
        if (!firstError) firstError = message;
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, status: "error", error: message, message } : j,
          ),
        );
      }
    }

    convertingRef.current = false;
    abortRef.current = null;
    setConverting(false);

    if (!cancelled) {
      const leftover = jobsRef.current.filter((j) => {
        if (preview) return j.status === "queued" || j.status === "error";
        return !j.result || j.result.partial || j.status === "error" || j.status === "queued";
      });
      if (leftover.length) {
        window.setTimeout(() => {
          void convertQueueRef.current?.(opts);
        }, 0);
      }
    }

    if (cancelled) {
      /* progress already set */
    } else if (doneCountLocal && !firstError) {
      if (opts.download) {
        setProgress({ visible: true, pct: 100, text: t("downloadDone") });
        showToast(
          doneCountLocal === 1
            ? t("downloadedOne", { name: lastFilename })
            : t("downloadedMany", { n: doneCountLocal }),
          "success",
        );
        setStatus(t("convertComplete"), "ready");
      } else {
        setProgress({ visible: true, pct: 100, text: t("previewReadyHint") });
        showToast(
          doneCountLocal === 1
            ? t("previewReadyOne", { name: lastFilename })
            : t("previewReadyMany", { n: doneCountLocal }),
          "success",
        );
      }
    } else if (firstError) {
      setProgress({ visible: true, pct: 100, text: t("failedCount", { n: pending.length - doneCountLocal }) });
      showToast(firstError, "error");
    }
  }, [setStatus, showToast, showXtch]);

  useEffect(() => {
    convertQueueRef.current = convertQueue;
  }, [convertQueue]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.matches("input, select, textarea")) return;
      if (e.key === "ArrowLeft") {
        if (!xtchRef.current || pageRef.current <= 0) return;
        pageRef.current -= 1;
        setPage(pageRef.current);
        renderPreviewPage();
      }
      if (e.key === "ArrowRight") {
        if (!xtchRef.current || pageRef.current >= xtchRef.current.pageCount - 1) return;
        pageRef.current += 1;
        setPage(pageRef.current);
        renderPreviewPage();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renderPreviewPage]);

  const chips = listConverters();
  const activeJob = jobs.find((j) => j.id === activeId) || null;

  return (
    <div className="wrap">
      <header className="hero">
        <div className="hero-top">
          <h1>lazahata</h1>
          <label className="lang-picker">
            <span className="visually-hidden">{t("language", undefined, locale)}</span>
            <select
              className="field"
              value={settings.locale}
              aria-label={t("language", undefined, locale)}
              onChange={(e) => updateSettings({ locale: e.target.value as LocalePref })}
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.id === "auto" ? t("languageAuto", undefined, locale) : opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="lede">
          {t("ledePrefix", undefined, locale)}
          <strong>XTCH</strong>
          {t("ledeSuffix", undefined, locale)}
        </p>
        <div className="chips">
          {chips.map((c) => (
            <span key={c.id} className="chip">
              {c.label}
            </span>
          ))}
          <span className="chip soon">{t("chipComing", { name: "MOBI" }, locale)}</span>
        </div>
      </header>

      <div className="layout">
        <div>
          <section className="card">
            <h2>{t("books", undefined, locale)}</h2>
            <DropZone accept={acceptAttribute()} onFiles={addFiles} locale={locale} />
            <Queue
              jobs={jobs}
              activeId={activeId}
              converting={converting}
              locale={locale}
              settings={settings}
              onSelect={selectJob}
              onRemove={removeJob}
              onDownload={(id) => {
                const job = jobs.find((j) => j.id === id);
                if (!job) return;
                if (job.result && !job.result.partial) {
                  downloadBytes(job.result.bytes, job.result.filename);
                  return;
                }
                void convertQueue({ download: true });
              }}
            />
            <div className="actions">
              <button
                type="button"
                className="btn btn-convert"
                disabled={converting || jobs.length === 0}
                onClick={() => void convertQueue({ download: true })}
              >
                {converting ? t("converting", undefined, locale) : t("convertDownload", undefined, locale)}
              </button>
              {converting ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => abortRef.current?.abort()}
                >
                  {t("cancel", undefined, locale)}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                disabled={converting || jobs.filter((j) => j.result && !j.result.partial).length === 0}
                onClick={() => void downloadJobs(jobs.filter((j) => j.result && !j.result.partial))}
              >
                {t("download", undefined, locale)}
              </button>
            </div>
            <div className={`progress${progress.visible ? " visible" : ""}`}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress.pct))}%` }} />
              </div>
              <div className="progress-text">{progress.text}</div>
            </div>
            <div className={`engine-status${engineStatus.kind ? " " + engineStatus.kind : ""}`}>
              {engineStatus.text}
            </div>
          </section>

          <Preview
            canvasRef={canvasRef}
            hasPreview={hasPreview}
            title={previewTitle}
            pageLabel={previewPage}
            locale={locale}
            width={(DEVICE_PROFILES[settings.deviceId] || DEVICE_PROFILES.X4).width}
            height={(DEVICE_PROFILES[settings.deviceId] || DEVICE_PROFILES.X4).height}
            canPrev={hasPreview && page > 0}
            canNext={hasPreview && page < pageCount - 1}
            onPrev={() => {
              if (!xtchRef.current || pageRef.current <= 0) return;
              pageRef.current -= 1;
              setPage(pageRef.current);
              renderPreviewPage();
            }}
            onNext={() => {
              if (!xtchRef.current || pageRef.current >= xtchRef.current.pageCount - 1) return;
              pageRef.current += 1;
              setPage(pageRef.current);
              renderPreviewPage();
            }}
          />
        </div>

        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          bookWriting={
            activeJob
              ? {
                  writingMode: activeJob.writingMode,
                  detectedVertical: activeJob.detectedVertical,
                }
              : null
          }
          bookScript={activeJob?.detectedScript ?? null}
          bookFontId={activeJob?.fontId ?? "auto"}
          onBookWritingChange={updateBookWriting}
          onBookFontChange={updateBookFont}
          writingDisabled={converting}
        />
      </div>

      <footer className="site-foot">
        {t("footer", undefined, locale)}
      </footer>

      <Toast toast={toast} />
    </div>
  );
}

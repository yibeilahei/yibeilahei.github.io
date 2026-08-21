"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptAttribute,
  comingSoonFor,
  listConverters,
  matchConverterAsync,
  readTxtFile,
  type TxtEncodingId,
} from "@/lib/adapters";
import {
  createJob,
  downloadBytes,
  downloadJobs,
  initialJobState,
  jobsReducer,
  runConvertQueue,
  type JobAction,
} from "@/lib/jobs";
import {
  DEFAULT_SETTINGS,
  DEVICE_PROFILES,
  formatSize,
  loadSettings,
  saveSettings,
  uid,
} from "@/lib/settings";
import { axisFromSample } from "@/lib/detectVertical";
import { detectScript } from "@/lib/fonts";
import {
  applyDocumentLocale,
  resolveLocale,
  setLocale,
  t,
} from "@/lib/i18n";
import { decodeXthPage, parseXtch, type XtchBook } from "@/lib/xtch";
import type { ConvertResult, Job, PersistSettings, ToastState, WritingMode } from "@/lib/types";

const PREVIEW_PAGES = 20;
import { DropZone } from "./DropZone";
import { LanguagePicker } from "./LanguagePicker";
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
  const [jobState, setJobState] = useState(initialJobState);
  const [page, setPage] = useState(0);
  const [converting, setConverting] = useState(false);
  const [engineStatus, setEngineStatus] = useState({ text: t("engineReady"), kind: "ready" });
  const [progress, setProgress] = useState({ visible: false, pct: 0, text: "" });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [hasPreview, setHasPreview] = useState(false);
  const [previewTitle, setPreviewTitle] = useState(t("noBook"));
  const [previewPage, setPreviewPage] = useState(t("dropToPreview"));
  const [pageCount, setPageCount] = useState(0);

  const xtchRef = useRef<XtchBook | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jobStateRef = useRef(jobState);
  const settingsRef = useRef(settings);
  const pageRef = useRef(page);
  const toastTimer = useRef<number | null>(null);
  const convertingRef = useRef(false);
  const convertQueueRef = useRef<((opts?: { maxPages?: number; download?: boolean }) => Promise<void>) | null>(null);

  jobStateRef.current = jobState;
  const { jobs, activeId } = jobState;

  const dispatchJob = useCallback((action: JobAction) => {
    const next = jobsReducer(jobStateRef.current, action);
    jobStateRef.current = next;
    setJobState(next);
    return next;
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

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

  const locale = resolveLocale(settings.locale, hydrated ? undefined : "en");

  useEffect(() => {
    if (!hydrated) return;
    if (!xtchRef.current) setStatus(t("engineReady", undefined, locale), "ready");
  }, [hydrated, locale, setStatus]);

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
    const job = jobStateRef.current.jobs.find((j) => j.id === jobStateRef.current.activeId);
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
      const job = jobStateRef.current.jobs.find((j) => j.id === id);
      if (!job) return;
      dispatchJob({ type: "select", id });
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
    [dispatchJob, showXtch],
  );

  const refreshPreview = useCallback(() => {
    dispatchJob({ type: "requeueAll", message: t("waitingReconvert") });
    window.setTimeout(() => {
      void convertQueueRef.current?.({ maxPages: PREVIEW_PAGES });
    }, 0);
  }, [dispatchJob]);

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

  const requeueActive = useCallback((action: JobAction) => {
    if (convertingRef.current) return false;
    const id = jobStateRef.current.activeId;
    if (!id) return false;
    dispatchJob(action);
    xtchRef.current = null;
    setHasPreview(false);
    setPageCount(0);
    window.setTimeout(() => {
      void convertQueueRef.current?.({ maxPages: PREVIEW_PAGES });
    }, 0);
    return true;
  }, [dispatchJob]);

  const updateBookWriting = useCallback((mode: WritingMode) => {
    const job = jobStateRef.current.jobs.find((j) => j.id === jobStateRef.current.activeId);
    if (!job || job.choice === mode) return;
    requeueActive({ type: "choice", id: job.id, choice: mode, message: t("waitingReconvert") });
  }, [requeueActive]);

  const updateBookFont = useCallback((fontId: string) => {
    const job = jobStateRef.current.jobs.find((j) => j.id === jobStateRef.current.activeId);
    if (!job || job.fontId === fontId) return;
    requeueActive({ type: "patch", id: job.id, patch: { fontId }, message: t("waitingReconvert") });
  }, [requeueActive]);

  const updateTxtEncoding = useCallback(
    (txtEncoding: string) => {
      const job = jobStateRef.current.jobs.find((j) => j.id === jobStateRef.current.activeId);
      if (!job || job.txtEncoding === txtEncoding) return;
      void (async () => {
        let detectedScript = job.detectedScript;
        try {
          const { text } = await readTxtFile(job.file, txtEncoding as TxtEncodingId | "auto");
          detectedScript = detectScript(text.slice(0, 12000));
        } catch {
          /* keep previous script */
        }
        requeueActive({
          type: "patch",
          id: job.id,
          patch: { txtEncoding, detectedScript },
          message: t("waitingReconvert"),
        });
      })();
    },
    [requeueActive],
  );

  const addFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      if (!files.length) return;

      void (async () => {
      const skippedSoon: string[] = [];
      const skippedOther: string[] = [];
      const nextJobs: Job[] = [];

      for (const file of files) {
        const converter = await matchConverterAsync(file);
        if (converter) {
          const exists = jobStateRef.current.jobs.some(
            (j) => j.file.name === file.name && j.file.size === file.size,
          ) || nextJobs.some((j) => j.file.name === file.name && j.file.size === file.size);
          if (exists) continue;
          nextJobs.push(createJob(file, converter, uid(), t("detectingWriting")));
          continue;
        }
        const soon = comingSoonFor(file.name);
        if (soon) skippedSoon.push(soon.label);
        else skippedOther.push(file.name);
      }

      if (nextJobs.length) {
        const selectFirst = !jobStateRef.current.activeId;
        dispatchJob({ type: "add", jobs: nextJobs, selectFirst });
        if (selectFirst) {
          setPreviewTitle(nextJobs[0].file.name);
          setPreviewPage(t("waitingConvert"));
        }
        void (async () => {
          await Promise.all(
            nextJobs.map(async (job) => {
              try {
                const sniff = await job.converter.sniff(job.file);
                const sniffedAxis = axisFromSample(sniff.markup);
                dispatchJob({
                  type: "sniffed",
                  id: job.id,
                  sniffedAxis,
                  script: sniff.script,
                  encoding: sniff.encoding ?? null,
                  message: t("writingSize", {
                    mode: t(sniffedAxis),
                    size: formatSize(job.file.size),
                  }),
                });
              } catch (err) {
                const message = err instanceof Error ? err.message : t("convertFailed");
                dispatchJob({
                  type: "sniffed",
                  id: job.id,
                  sniffedAxis: "horizontal",
                  script: null,
                  encoding: null,
                  message,
                  error: message,
                });
              }
            }),
          );
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
      })();
    },
    [dispatchJob, showToast],
  );

  const removeJob = useCallback(
    (id: string) => {
      const job = jobStateRef.current.jobs.find((j) => j.id === id);
      if (!job) return;
      if (convertingRef.current && job.status === "converting") return;
      const wasActive = jobStateRef.current.activeId === id;
      const remaining = jobStateRef.current.jobs.filter((j) => j.id !== id);
      dispatchJob({ type: "remove", id });
      if (wasActive) {
        xtchRef.current = null;
        const next = remaining[0];
        if (next) selectJob(next.id);
        else {
          setHasPreview(false);
          setPageCount(0);
          setPreviewTitle(t("noBook"));
          setPreviewPage(t("dropToPreview"));
        }
      }
    },
    [dispatchJob, selectJob],
  );

  const convertQueue = useCallback(async (opts: { maxPages?: number; download?: boolean } = {}) => {
    if (convertingRef.current) return;
    convertingRef.current = true;
    setConverting(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await runConvertQueue(
        {
          getState: () => jobStateRef.current,
          getSettings: () => settingsRef.current,
          dispatch: dispatchJob,
          onStatus: setStatus,
          onProgress: (pct, text) => setProgress({ visible: true, pct, text }),
          onJobDone: (jobId, result) => {
            if (jobId === jobStateRef.current.activeId || !xtchRef.current) {
              showXtch(result, !xtchRef.current);
            }
          },
          onToast: showToast,
        },
        opts,
        abort.signal,
      );
    } finally {
      convertingRef.current = false;
      abortRef.current = null;
      setConverting(false);
    }
  }, [dispatchJob, setStatus, showToast, showXtch]);

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
          <LanguagePicker
            value={settings.locale}
            locale={locale}
            onChange={(next) => updateSettings({ locale: next })}
          />
        </div>
        <p className="lede">
          {t("ledePrefix", undefined, locale)}
          <strong>XTCH</strong>
          {t("ledeSuffix", undefined, locale)}
          {t("ledeChrome", undefined, locale)}
        </p>
        <div className="chips">
          {chips.map((c) => (
            <span key={c.id} className="chip">
              {c.label}
            </span>
          ))}
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
                  choice: activeJob.choice,
                  axis: activeJob.axis,
                  sniffedAxis: activeJob.sniffedAxis,
                }
              : null
          }
          bookScript={activeJob?.detectedScript ?? null}
          bookFontId={activeJob?.fontId ?? "auto"}
          onBookWritingChange={updateBookWriting}
          onBookFontChange={updateBookFont}
          bookIsTxt={activeJob?.converter.id === "txt"}
          txtEncoding={activeJob?.txtEncoding ?? "auto"}
          detectedEncoding={activeJob?.detectedEncoding ?? null}
          onTxtEncodingChange={updateTxtEncoding}
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

/**
 * Run queued jobs through sniff → convert → XTCH.
 * UI supplies dispatch / progress / preview via `ConvertQueueHost`.
 */

import { downloadBytes, downloadJobs } from "./download";
import { axisFromSample } from "./detectVertical";
import { pickUsedFontFamily } from "./fonts";
import { t } from "./i18n";
import { pendingJobs, type JobAction, type JobState } from "./jobs";
import { formatSize, toConvertSettings } from "./settings";
import type {
  ConvertResult,
  Job,
  PersistSettings,
  ResolvedWritingMode,
  ToastState,
} from "./types";

export type ConvertQueueOpts = { maxPages?: number; download?: boolean };

export type ConvertQueueHost = {
  getState: () => JobState;
  getSettings: () => PersistSettings;
  dispatch: (action: JobAction) => void;
  onStatus: (text: string, kind?: string) => void;
  onProgress: (pct: number, text: string) => void;
  onJobDone: (jobId: string, result: ConvertResult) => void;
  onToast: (message: string, type: ToastState["type"]) => void;
};

async function ensureAxis(job: Job, dispatch: ConvertQueueHost["dispatch"]): Promise<ResolvedWritingMode> {
  if (job.axis) return job.axis;
  let axis: ResolvedWritingMode = "horizontal";
  try {
    const sniff = await job.converter.sniff(job.file);
    axis = axisFromSample(sniff.markup);
  } catch {
    axis = "horizontal";
  }
  dispatch({
    type: "sniffed",
    id: job.id,
    sniffedAxis: axis,
    script: job.detectedScript,
    encoding: job.detectedEncoding,
    message: t("writingSize", { mode: t(axis), size: formatSize(job.file.size) }),
  });
  return axis;
}

export async function runConvertQueue(
  host: ConvertQueueHost,
  opts: ConvertQueueOpts = {},
  signal?: AbortSignal,
): Promise<void> {
  const preview = opts.maxPages != null;
  const pending = pendingJobs(host.getState().jobs, preview);
  if (!pending.length) {
    if (opts.download) {
      const ready = host.getState().jobs.filter((j) => j.result && !j.result.partial);
      if (ready.length) void downloadJobs(ready);
    }
    return;
  }

  host.onProgress(0, preview ? t("buildingPreview") : t("convertingFull"));

  let doneCount = 0;
  let lastFilename = "";
  let firstError: string | null = null;
  let cancelled = false;

  for (let i = 0; i < pending.length; i++) {
    const job = pending[i];
    if (!host.getState().activeId) host.dispatch({ type: "select", id: job.id });
    const axis = await ensureAxis(job, host.dispatch);
    const settings = host.getSettings();
    const usedSettings = {
      deviceId: settings.deviceId,
      fontId: job.fontId,
      fontFamily: pickUsedFontFamily(
        job.fontId,
        job.detectedScript || (axis === "vertical" ? "jp" : null),
      ),
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
    };
    host.dispatch({
      type: "converting",
      id: job.id,
      message: preview ? t("previewing") : t("converting"),
      usedSettings,
      axis,
    });
    try {
      const result = await job.converter.convert(job.file, toConvertSettings(settings, axis, job.fontId, job.txtEncoding), {
        signal,
        maxPages: opts.maxPages,
        onStatus: host.onStatus,
        onProgress: (p, currentPage, total) => {
          host.onProgress(
            ((i + p) / pending.length) * 100,
            t("pageProgress", { name: job.file.name, current: currentPage, total }),
          );
          host.dispatch({
            type: "progress",
            id: job.id,
            message: t("pageShort", { current: currentPage, total }),
          });
        },
      });
      doneCount += 1;
      lastFilename = result.filename;
      host.dispatch({
        type: "done",
        id: job.id,
        result,
        axis,
        usedSettings: {
          ...usedSettings,
          fontFamily: result.usedFontFamily || usedSettings.fontFamily,
        },
        message: result.partial
          ? t("previewPages", { n: result.pageCount })
          : t("pagesSize", { n: result.pageCount, size: formatSize(result.bytes.byteLength) }),
      });
      host.onJobDone(job.id, result);
      if (opts.download && !result.partial) {
        downloadBytes(result.bytes, result.filename);
      }
    } catch (err) {
      const error = err as Error;
      if (error.name === "AbortError" || error.message === "Cancelled") {
        cancelled = true;
        host.dispatch({ type: "cancel", id: job.id, message: t("cancelled") });
        host.onProgress(0, t("cancelled"));
        break;
      }
      console.error(err);
      const message = error.message || t("convertFailed");
      if (!firstError) firstError = message;
      host.dispatch({ type: "error", id: job.id, message });
    }
  }

  if (!cancelled) {
    const seen = new Set(pending.map((job) => job.id));
    const leftover = pendingJobs(host.getState().jobs, preview).filter((job) => !seen.has(job.id));
    if (leftover.length) {
      await runConvertQueue(host, opts, signal);
      return;
    }
  }

  if (cancelled) return;
  if (doneCount && !firstError) {
    if (opts.download) {
      host.onProgress(100, t("downloadDone"));
      host.onToast(
        doneCount === 1 ? t("downloadedOne", { name: lastFilename }) : t("downloadedMany", { n: doneCount }),
        "success",
      );
      host.onStatus(t("convertComplete"), "ready");
    } else {
      host.onProgress(100, t("previewReadyHint"));
      host.onToast(
        doneCount === 1 ? t("previewReadyOne", { name: lastFilename }) : t("previewReadyMany", { n: doneCount }),
        "success",
      );
    }
  } else if (firstError) {
    host.onProgress(100, t("failedCount", { n: pending.length - doneCount }));
    host.onToast(firstError, "error");
  }
}

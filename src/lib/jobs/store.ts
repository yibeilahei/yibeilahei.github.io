/**
 * Job queue store. All job list updates go through `jobsReducer`.
 *
 * Writing: `choice` is the Auto / H / V control. `axis` is what convert
 * and the queue read (`null` = still sniffing). `sniffedAxis` is Auto’s
 * markup result for the settings override line.
 */

import type { ScriptId } from "../fonts";
import type {
  ConvertResult,
  Converter,
  Job,
  JobUsedSettings,
  ResolvedWritingMode,
  WritingMode,
} from "../types";

export type JobState = {
  jobs: Job[];
  activeId: string | null;
};

export const initialJobState: JobState = { jobs: [], activeId: null };

export function pendingJobs(jobs: Job[], preview: boolean): Job[] {
  return jobs.filter((job) => {
    if (preview) return job.status === "queued" || job.status === "error";
    return !job.result || job.result.partial || job.status === "error" || job.status === "queued";
  });
}

export function axisFromChoice(
  choice: WritingMode,
  sniffedAxis: ResolvedWritingMode | null,
): ResolvedWritingMode | null {
  if (choice === "horizontal" || choice === "vertical") return choice;
  return sniffedAxis;
}

export function createJob(file: File, converter: Converter, id: string, message: string): Job {
  return {
    id,
    file,
    converter,
    status: "queued",
    message,
    result: null,
    error: null,
    choice: "auto",
    axis: null,
    sniffedAxis: null,
    fontId: "auto",
    txtEncoding: "auto",
    detectedEncoding: null,
    detectedScript: null,
    usedSettings: null,
  };
}

export type JobAction =
  | { type: "add"; jobs: Job[]; selectFirst: boolean }
  | { type: "select"; id: string | null }
  | {
      type: "sniffed";
      id: string;
      sniffedAxis: ResolvedWritingMode;
      script: ScriptId | null;
      encoding: string | null;
      message: string;
      error?: string;
    }
  | { type: "choice"; id: string; choice: WritingMode; message: string }
  | {
      type: "patch";
      id: string;
      patch: Partial<Pick<Job, "fontId" | "txtEncoding" | "detectedScript">>;
      message: string;
    }
  | { type: "requeueAll"; message: string }
  | {
      type: "converting";
      id: string;
      message: string;
      usedSettings: JobUsedSettings;
      axis?: ResolvedWritingMode;
    }
  | { type: "progress"; id: string; message: string }
  | {
      type: "done";
      id: string;
      result: ConvertResult;
      message: string;
      usedSettings: JobUsedSettings;
      axis?: ResolvedWritingMode;
    }
  | { type: "error"; id: string; message: string }
  | { type: "cancel"; id: string; message: string }
  | { type: "remove"; id: string };

function mapJob(jobs: Job[], id: string, fn: (job: Job) => Job): Job[] {
  return jobs.map((job) => (job.id === id ? fn(job) : job));
}

function requeue(job: Job, message: string, extra: Partial<Job> = {}): Job {
  return {
    ...job,
    ...extra,
    status: "queued",
    message,
    result: null,
    error: null,
    usedSettings: null,
  };
}

export function jobsReducer(state: JobState, action: JobAction): JobState {
  switch (action.type) {
    case "add": {
      if (!action.jobs.length) return state;
      return {
        jobs: [...state.jobs, ...action.jobs],
        activeId:
          action.selectFirst && !state.activeId ? action.jobs[0].id : state.activeId,
      };
    }
    case "select":
      return { ...state, activeId: action.id };
    case "sniffed":
      return {
        ...state,
        jobs: mapJob(state.jobs, action.id, (job) => {
          const sniffedAxis = action.sniffedAxis;
          const axis = axisFromChoice(job.choice, sniffedAxis);
          if (action.error) {
            return {
              ...job,
              status: "error",
              error: action.error,
              message: action.error,
              sniffedAxis,
              axis,
              detectedScript: action.script,
              detectedEncoding: action.encoding ?? job.detectedEncoding,
            };
          }
          return {
            ...job,
            sniffedAxis,
            axis,
            detectedScript: action.script ?? job.detectedScript,
            detectedEncoding: action.encoding ?? job.detectedEncoding,
            message: job.status === "queued" && !job.result ? action.message : job.message,
          };
        }),
      };
    case "choice":
      return {
        ...state,
        jobs: mapJob(state.jobs, action.id, (job) => {
          if (job.choice === action.choice) return job;
          return requeue(job, action.message, {
            choice: action.choice,
            axis: axisFromChoice(action.choice, job.sniffedAxis),
          });
        }),
      };
    case "patch":
      return {
        ...state,
        jobs: mapJob(state.jobs, action.id, (job) => requeue(job, action.message, action.patch)),
      };
    case "requeueAll":
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.status === "converting" ? job : requeue(job, action.message),
        ),
      };
    case "converting":
      return {
        ...state,
        activeId: state.activeId ?? action.id,
        jobs: mapJob(state.jobs, action.id, (job) => ({
          ...job,
          status: "converting",
          message: action.message,
          usedSettings: action.usedSettings,
          axis: action.axis ?? job.axis,
          error: null,
        })),
      };
    case "progress":
      return {
        ...state,
        jobs: mapJob(state.jobs, action.id, (job) => ({ ...job, message: action.message })),
      };
    case "done":
      return {
        ...state,
        jobs: mapJob(state.jobs, action.id, (job) => ({
          ...job,
          status: "done",
          usedSettings: action.usedSettings,
          result: action.result,
          message: action.message,
          axis: action.axis ?? job.axis,
          error: null,
        })),
      };
    case "error":
      return {
        ...state,
        jobs: mapJob(state.jobs, action.id, (job) => ({
          ...job,
          status: "error",
          error: action.message,
          message: action.message,
        })),
      };
    case "cancel":
      return {
        ...state,
        jobs: mapJob(state.jobs, action.id, (job) => ({
          ...job,
          status: "queued",
          message: action.message,
        })),
      };
    case "remove": {
      const jobs = state.jobs.filter((job) => job.id !== action.id);
      const activeId =
        state.activeId === action.id ? jobs[0]?.id ?? null : state.activeId;
      return { jobs, activeId };
    }
    default:
      return state;
  }
}

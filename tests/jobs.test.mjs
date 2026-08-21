import assert from "node:assert/strict";
import { axisFromChoice, createJob, initialJobState, jobsReducer, pendingJobs } from "../src/lib/jobs.ts";

assert.equal(axisFromChoice("vertical", "horizontal"), "vertical");
assert.equal(axisFromChoice("horizontal", "vertical"), "horizontal");
assert.equal(axisFromChoice("auto", "vertical"), "vertical");
assert.equal(axisFromChoice("auto", "horizontal"), "horizontal");
assert.equal(axisFromChoice("auto", null), null);

const converter = { id: "txt" };
const file = { name: "a.txt", size: 10 };

let state = initialJobState;
const job = createJob(file, converter, "job-1", "detecting");
assert.equal(job.choice, "auto");
assert.equal(job.axis, null);
assert.equal(job.sniffedAxis, null);

state = jobsReducer(state, { type: "add", jobs: [job], selectFirst: true });
assert.equal(state.jobs.length, 1);
assert.equal(state.activeId, "job-1");

state = jobsReducer(state, {
  type: "sniffed",
  id: "job-1",
  sniffedAxis: "horizontal",
  script: "latin",
  encoding: "utf-8",
  message: "Horizontal · 10 B",
});
assert.equal(state.jobs[0].axis, "horizontal");
assert.equal(state.jobs[0].sniffedAxis, "horizontal");
assert.equal(state.jobs[0].message, "Horizontal · 10 B");

state = jobsReducer(state, { type: "choice", id: "job-1", choice: "vertical", message: "reconvert" });
assert.equal(state.jobs[0].choice, "vertical");
assert.equal(state.jobs[0].axis, "vertical");
assert.equal(state.jobs[0].sniffedAxis, "horizontal");
assert.equal(state.jobs[0].status, "queued");
assert.equal(state.jobs[0].result, null);

state = jobsReducer(state, { type: "choice", id: "job-1", choice: "auto", message: "reconvert" });
assert.equal(state.jobs[0].choice, "auto");
assert.equal(state.jobs[0].axis, "horizontal");

state = jobsReducer(state, {
  type: "done",
  id: "job-1",
  result: { bytes: new Uint8Array(), filename: "a.xtch", info: {}, pageCount: 1 },
  message: "1 page",
  usedSettings: { deviceId: "X4", fontId: "auto", fontFamily: "Georgia", fontSize: 34, lineHeight: 120 },
});
assert.equal(state.jobs[0].status, "done");
assert.equal(state.jobs[0].axis, "horizontal");

state = jobsReducer(state, { type: "remove", id: "job-1" });
assert.equal(state.jobs.length, 0);
assert.equal(state.activeId, null);

{
  const queued = { id: "a", status: "queued", result: null };
  const error = { id: "b", status: "error", result: null };
  const donePartial = { id: "c", status: "done", result: { partial: true } };
  const doneFull = { id: "d", status: "done", result: { partial: false } };
  const converting = { id: "e", status: "converting", result: null };
  const jobs = [queued, error, donePartial, doneFull, converting];
  assert.deepEqual(pendingJobs(jobs, true).map((j) => j.id), ["a", "b"]);
  assert.deepEqual(pendingJobs(jobs, false).map((j) => j.id), ["a", "b", "c", "e"]);
}

console.log("jobs tests passed");

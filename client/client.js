// dsh-job-hunter 客户端半 —— 构建产物，请勿手改（见 scripts/build.mjs）。
// 契约：window.__ModuleLoader__.load({ id, factory })；react 由 shell seed 提供。
window.__ModuleLoader__.load({
	id: "dsh-job-hunter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name2 in all)
		    __defProp(target, name2, { get: all[name2], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.tsx
		var index_exports = {};
		__export(index_exports, {
		  apply: () => apply,
		  inject: () => inject,
		  name: () => name
		});
		module.exports = __toCommonJS(index_exports);

		// src/shared/constants.ts
		var PLUGIN_ID = "dsh-job-hunter";
		var PANEL_KEY = "job-hunter";
		var ROUTE_PREFIX = "/job-hunter";
		var NOTICE_TTL_MS = 6e3;
		var PHASE = "P8";
		var MAX_BODY_BYTES = 64 * 1024;

		// src/shared/dsh.ts
		function serviceOf(ctx2, name2) {
		  const value = ctx2.get(name2);
		  return value === void 0 || value === null ? void 0 : value;
		}

		// src/client/entry-icon.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		var GLYPH_MIN = 18;
		function JobHunterEntryIcon({ size, active }) {
		  const asked = typeof size === "number" && size > 0 ? size : GLYPH_MIN;
		  const edge = Math.max(asked, GLYPH_MIN);
		  const wide = asked < GLYPH_MIN;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    "span",
		    {
		      className: "jh-entry-glyph",
		      "data-job-hunter": "entry",
		      ...wide ? { "data-wide": "1" } : {},
		      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		        "svg",
		        {
		          className: "jh-entry-icon",
		          width: edge,
		          height: edge,
		          viewBox: "0 0 16 16",
		          fill: "none",
		          stroke: "currentColor",
		          strokeWidth: active === true ? 1.6 : 1.3,
		          strokeLinecap: "round",
		          strokeLinejoin: "round",
		          "aria-hidden": "true",
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "2", y: "2.5", width: "12", height: "11", rx: "1.5" }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M2 6.5h12M6.5 6.5v7" })
		          ]
		        }
		      )
		    }
		  );
		}

		// src/client/notice.tsx
		var import_react = require("react");
		var import_jsx_runtime2 = require("react/jsx-runtime");
		var SEEN_KEY = `${PLUGIN_ID}:notice-seen`;
		function JobHunterNotice() {
		  const [open, setOpen] = (0, import_react.useState)(() => !hasSeen());
		  (0, import_react.useEffect)(() => {
		    if (!open) return;
		    const timer = window.setTimeout(() => {
		      markSeen();
		      setOpen(false);
		    }, NOTICE_TTL_MS);
		    return () => window.clearTimeout(timer);
		  }, [open]);
		  if (!open) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "jh-notice", role: "status", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "jh-notice-text", children: "\u6C42\u804C\u627E\u5DE5\u4F5C\u5DF2\u5C31\u7EEA" }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-notice-close",
		        "aria-label": "\u5173\u95ED\u63D0\u793A",
		        onClick: () => {
		          markSeen();
		          setOpen(false);
		        },
		        children: "\xD7"
		      }
		    )
		  ] });
		}
		function hasSeen() {
		  try {
		    return window.sessionStorage.getItem(SEEN_KEY) === "1";
		  } catch {
		    return false;
		  }
		}
		function markSeen() {
		  try {
		    window.sessionStorage.setItem(SEEN_KEY, "1");
		  } catch {
		  }
		}

		// src/client/panel.tsx
		var import_react12 = require("react");

		// src/client/intent.ts
		var pending = null;
		var listeners = /* @__PURE__ */ new Set();
		function requestPanelIntent(jobId, action = "open") {
		  const intent = { jobId, action, at: Date.now() };
		  pending = intent;
		  for (const listener of [...listeners]) {
		    try {
		      listener(intent);
		    } catch {
		    }
		  }
		}
		function subscribePanelIntent(listener) {
		  listeners.add(listener);
		  return () => {
		    listeners.delete(listener);
		  };
		}
		function consumePanelIntent() {
		  const intent = pending;
		  pending = null;
		  return intent;
		}

		// src/client/runtime.ts
		var ctx;
		function bindContext(context) {
		  ctx = context;
		}
		function backToConversation() {
		  if (ctx === void 0) return;
		  serviceOf(ctx, "layout")?.selectPanel(null);
		}
		function showPanel(panelKey) {
		  if (ctx === void 0) return false;
		  const layout = serviceOf(ctx, "layout");
		  if (layout === void 0) return false;
		  try {
		    layout.selectPanel(panelKey);
		    return true;
		  } catch {
		    return false;
		  }
		}

		// src/client/screens/job-detail.tsx
		var import_react5 = require("react");

		// src/shared/enums.ts
		var JOB_STATES = ["new", "seen", "saved", "ignored", "archived"];
		var JOB_FLAG_LABEL = {
		  outsourcing: "\u7591\u4F3C\u5916\u5305",
		  fraud: "\u9AD8\u98CE\u9669",
		  zombie: "\u50F5\u5C38\u5C97\u4F4D",
		  salary_inflation: "\u85AA\u8D44\u865A\u6807",
		  jargon_hit: "\u9ED1\u8BDD"
		};
		var RESUME_LANGUAGE_LABEL = {
		  zh: "\u4E2D\u6587",
		  en: "\u82F1\u6587"
		};
		var RESUME_STATE_LABEL = {
		  active: "\u542F\u7528\u4E2D",
		  archived: "\u5DF2\u5F52\u6863"
		};
		var RESUME_TEMPLATES = ["concise", "professional"];
		var RESUME_TEMPLATE_LABEL = {
		  concise: "\u7B80\u6D01",
		  professional: "\u4E13\u4E1A"
		};
		var APPLICATION_STAGE_LABEL = {
		  sent: "\u5DF2\u6295\u9012",
		  viewed: "\u5DF2\u67E5\u770B",
		  interviewing: "\u9762\u8BD5\u4E2D",
		  interviewed: "\u5DF2\u9762\u8BD5",
		  offer: "Offer",
		  rejected: "\u5DF2\u62D2\u7EDD",
		  no_reply: "\u65E0\u56DE\u590D"
		};
		var APPLICATION_CHANNEL_LABEL = {
		  platform: "\u5E73\u53F0\u5185\u6295",
		  referral: "\u5185\u63A8",
		  website: "\u5B98\u7F51",
		  headhunter: "\u730E\u5934"
		};
		var INTERVIEW_STATE_LABEL = {
		  pending: "\u5F85\u786E\u8BA4",
		  confirmed: "\u5DF2\u786E\u8BA4",
		  done: "\u5DF2\u5B8C\u6210",
		  reviewed: "\u5DF2\u590D\u76D8",
		  cancelled: "\u5DF2\u53D6\u6D88",
		  rescheduled: "\u5DF2\u6539\u671F"
		};
		var INTERVIEW_KIND_LABEL = {
		  onsite: "\u73B0\u573A",
		  video: "\u89C6\u9891",
		  phone: "\u7535\u8BDD",
		  other: "\u5176\u5B83"
		};
		var CAMPUS_BATCH_LABEL = {
		  autumn: "\u79CB\u62DB",
		  spring: "\u6625\u62DB",
		  other: "\u5176\u4ED6\u6279\u6B21"
		};
		var CAMPUS_STAGE_LABEL = {
		  intent: "\u610F\u5411",
		  applied: "\u5DF2\u7F51\u7533",
		  assessment_pending: "\u5F85\u7B14\u8BD5",
		  assessment_done: "\u5DF2\u7B14\u8BD5",
		  interview_pending: "\u5F85\u9762\u8BD5",
		  interviewing: "\u9762\u8BD5\u4E2D",
		  final: "\u7EC8\u9762",
		  tripartite_pending: "\u5F85\u53D1\u4E09\u65B9",
		  tripartite_signed: "\u5DF2\u7B7E\u4E09\u65B9",
		  closed: "\u7ED3\u675F",
		  rejected: "\u5DF2\u62D2"
		};
		var ASSESSMENT_KIND_LABEL = {
		  written: "\u7B14\u8BD5",
		  aptitude: "\u80FD\u529B\u6D4B\u8BC4",
		  personality: "\u6027\u683C\u6D4B\u8BC4",
		  video: "AI \u89C6\u9891\u9762",
		  other: "\u5176\u5B83"
		};
		var ASSESSMENT_STATE_LABEL = {
		  pending: "\u5F85\u5B8C\u6210",
		  in_progress: "\u8FDB\u884C\u4E2D",
		  done: "\u5DF2\u5B8C\u6210",
		  missed: "\u5DF2\u9519\u8FC7"
		};
		var TRIPARTITE_STATE_LABEL = {
		  pending: "\u5F85\u7B7E",
		  signed: "\u5DF2\u7B7E",
		  breached: "\u8FDD\u7EA6"
		};
		var VISA_STANCE_LABEL = {
		  provides: "\u63D0\u4F9B\u7B7E\u8BC1\u62C5\u4FDD",
		  no_sponsorship: "\u4E0D\u63D0\u4F9B\u62C5\u4FDD",
		  local_only: "\u4EC5\u9650\u672C\u5730\u8EAB\u4EFD",
		  unknown: "\u672A\u8BC6\u522B"
		};
		var REMOTE_KIND_LABEL = {
		  onsite: "\u5750\u73ED",
		  hybrid: "\u6DF7\u5408",
		  remote: "\u8FDC\u7A0B",
		  unknown: "\u672A\u8BC6\u522B"
		};

		// src/client/api.ts
		var ApiError = class extends Error {
		  status;
		  code;
		  hint;
		  /** 原始响应体。审批类流程需要读其中的额外字段（如 `confirmText`）。 */
		  body;
		  constructor(status, code, message, hint, body) {
		    super(message);
		    this.name = "ApiError";
		    this.status = status;
		    this.code = code;
		    this.hint = hint;
		    this.body = body;
		  }
		  /** 给用户看的一行字：优先用宿主给的 hint。 */
		  get display() {
		    return this.hint === void 0 || this.hint === "" ? this.message : this.hint;
		  }
		};
		async function request(path, init = {}) {
		  const hasBody = init.body !== void 0;
		  const response = await fetch(`${ROUTE_PREFIX}${path}`, {
		    ...init,
		    headers: {
		      accept: "application/json",
		      ...hasBody ? { "content-type": "application/json" } : {},
		      ...init.headers ?? {}
		    }
		  });
		  const text = await response.text();
		  let body = null;
		  if (text !== "") {
		    try {
		      body = JSON.parse(text);
		    } catch {
		      body = null;
		    }
		  }
		  if (!response.ok) {
		    const record = body !== null && typeof body === "object" ? body : {};
		    throw new ApiError(
		      response.status,
		      typeof record["code"] === "string" ? record["code"] : `HTTP_${String(response.status)}`,
		      typeof record["message"] === "string" ? record["message"] : `HTTP ${String(response.status)}`,
		      typeof record["hint"] === "string" ? record["hint"] : void 0,
		      body
		    );
		  }
		  return body;
		}
		async function fetchToday(signal) {
		  return await request("/today", signal === void 0 ? {} : { signal });
		}
		async function fetchJobs(params, signal) {
		  const query = new URLSearchParams();
		  if (params.q !== void 0 && params.q !== "") query.set("q", params.q);
		  if (params.city !== void 0 && params.city !== "") query.set("city", params.city);
		  if (params.state !== void 0 && params.state !== "") query.set("state", params.state);
		  if (params.minSalary !== void 0 && params.minSalary !== null) {
		    query.set("minSalary", String(params.minSalary));
		  }
		  if (params.orderBy !== void 0 && params.orderBy !== "") query.set("orderBy", params.orderBy);
		  query.set("desc", params.descending === false ? "0" : "1");
		  query.set("page", String(params.page ?? 1));
		  query.set("pageSize", String(params.pageSize ?? 20));
		  return await request(`/jobs?${query.toString()}`, signal === void 0 ? {} : { signal });
		}
		async function fetchJobDetail(id, signal) {
		  return await request(`/jobs/${String(id)}`, signal === void 0 ? {} : { signal });
		}
		async function markJob(id, state) {
		  const result = await request(`/jobs/${String(id)}/mark`, {
		    method: "POST",
		    body: JSON.stringify({ state })
		  });
		  return result.job;
		}
		async function runCrawl(input) {
		  return await request("/crawl/run", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		}
		async function fetchSchedulerStatus(signal) {
		  return await request("/scheduler/status", signal === void 0 ? {} : { signal });
		}
		async function fetchPlatforms(signal) {
		  return await request("/platforms", signal === void 0 ? {} : { signal });
		}
		async function runPlan(planId, catchUp = false) {
		  return await request(`/plans/${String(planId)}/run`, {
		    method: "POST",
		    body: JSON.stringify({ catchUp })
		  });
		}
		async function startLogin(platformId) {
		  const result = await request(
		    `/platforms/${encodeURIComponent(platformId)}/login/start`,
		    { method: "POST", body: JSON.stringify({}) }
		  );
		  return result.login;
		}
		async function closeTodo(id) {
		  await request(`/todos/${String(id)}/close`, {
		    method: "POST",
		    body: JSON.stringify({})
		  });
		}
		async function draftGreeting(jobId, input = {}) {
		  const result = await request(
		    `/jobs/${String(jobId)}/greeting/draft`,
		    { method: "POST", body: JSON.stringify(input) }
		  );
		  return result.draft;
		}
		async function fetchResumes(signal) {
		  return await request("/resumes", signal === void 0 ? {} : { signal });
		}
		async function fetchResume(id, signal) {
		  return await request(`/resumes/${String(id)}`, signal === void 0 ? {} : { signal });
		}
		async function createResume(input) {
		  const result = await request("/resumes", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.resume;
		}
		async function updateResume(id, patch) {
		  const result = await request(`/resumes/${String(id)}`, {
		    method: "PATCH",
		    body: JSON.stringify(patch)
		  });
		  return result.resume;
		}
		async function deleteResume(id) {
		  await request(`/resumes/${String(id)}`, { method: "DELETE" });
		}
		async function duplicateResume(id, name2) {
		  const result = await request(
		    `/resumes/${String(id)}/duplicate`,
		    { method: "POST", body: JSON.stringify(name2 === void 0 ? {} : { name: name2 }) }
		  );
		  return result.resume;
		}
		async function setDefaultResume(id) {
		  const result = await request(`/resumes/${String(id)}/default`, {
		    method: "POST",
		    body: JSON.stringify({})
		  });
		  return result.resume;
		}
		async function exportResume(id, input) {
		  const result = await request(
		    `/resumes/${String(id)}/export`,
		    { method: "POST", body: JSON.stringify(input) }
		  );
		  return result.file;
		}
		function previewUrl(id, template) {
		  return `${ROUTE_PREFIX}/resumes/${String(id)}/preview${template === void 0 ? "" : `?template=${template}`}`;
		}
		function fileUrl(fileId) {
		  return `${ROUTE_PREFIX}/files/${String(fileId)}`;
		}
		async function tailorResume(input) {
		  const result = await request("/resume/tailor", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.tailoring;
		}
		async function fetchTailorings(filter, signal) {
		  const query = new URLSearchParams();
		  if (filter.jobId !== void 0) query.set("jobId", String(filter.jobId));
		  if (filter.resumeId !== void 0) query.set("resumeId", String(filter.resumeId));
		  if (filter.limit !== void 0) query.set("limit", String(filter.limit));
		  return await request(
		    `/tailorings?${query.toString()}`,
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function adoptTailoring(id, adopted) {
		  const result = await request(
		    `/tailorings/${String(id)}/adopt`,
		    { method: "POST", body: JSON.stringify({ adopted }) }
		  );
		  return result.tailoring;
		}
		async function fetchBoard(signal) {
		  return await request("/board", signal === void 0 ? {} : { signal });
		}
		async function fetchApplications(filter = {}, signal) {
		  const query = new URLSearchParams();
		  if (filter.jobId !== void 0) query.set("jobId", String(filter.jobId));
		  const suffix = query.toString() === "" ? "" : `?${query.toString()}`;
		  return await request(`/applications${suffix}`, signal === void 0 ? {} : { signal });
		}
		async function createApplication(input) {
		  const result = await request("/applications", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.application;
		}
		async function advanceApplication(input) {
		  const result = await request(
		    `/applications/${String(input.applicationId)}/advance`,
		    {
		      method: "POST",
		      body: JSON.stringify({
		        to: input.to,
		        ...input.note === void 0 ? {} : { note: input.note },
		        ...input.allowBackward === void 0 ? {} : { allowBackward: input.allowBackward }
		      })
		    }
		  );
		  return result.application;
		}
		async function fetchInbox(filter = {}, signal) {
		  const query = new URLSearchParams();
		  if (filter.jobId !== void 0) query.set("jobId", String(filter.jobId));
		  if (filter.unreadOnly === true) query.set("unread", "1");
		  const suffix = query.toString() === "" ? "" : `?${query.toString()}`;
		  return await request(`/inbox${suffix}`, signal === void 0 ? {} : { signal });
		}
		async function recordMessage(input) {
		  const result = await request("/messages", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.message;
		}
		async function markMessageRead(id) {
		  await request(`/messages/${String(id)}/read`, { method: "POST", body: JSON.stringify({}) });
		}
		async function replyMessage(id, content, confirm = false) {
		  const result = await request(`/messages/${String(id)}/reply`, {
		    method: "POST",
		    body: JSON.stringify({ content, confirm })
		  });
		  return result.message;
		}
		async function fetchInterviews(signal) {
		  return await request("/interviews", signal === void 0 ? {} : { signal });
		}
		async function createInterview(input) {
		  const result = await request("/interviews", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.interview;
		}
		async function setInterviewState(id, state, allowReschedule = false) {
		  const result = await request(
		    `/interviews/${String(id)}/state`,
		    { method: "POST", body: JSON.stringify({ state, allowReschedule }) }
		  );
		  return result.interview;
		}
		async function fetchInterviewPrep(id, signal) {
		  return await request(`/interviews/${String(id)}/prep`, signal === void 0 ? {} : { signal });
		}
		async function deleteInterview(id) {
		  await request(`/interviews/${String(id)}`, { method: "DELETE" });
		}
		async function fetchFunnel(signal) {
		  return await request("/analytics/funnel", signal === void 0 ? {} : { signal });
		}
		async function fetchAttribution(signal) {
		  return await request("/analytics/attribution", signal === void 0 ? {} : { signal });
		}
		async function fetchSalaryBand(filter = {}, signal) {
		  const query = new URLSearchParams();
		  if (filter.city !== void 0 && filter.city !== "") query.set("city", filter.city);
		  if (filter.q !== void 0 && filter.q !== "") query.set("q", filter.q);
		  const suffix = query.toString() === "" ? "" : `?${query.toString()}`;
		  return await request(`/analytics/salary${suffix}`, signal === void 0 ? {} : { signal });
		}
		async function fetchFollowUps(signal) {
		  return await request("/followups", signal === void 0 ? {} : { signal });
		}
		async function fetchCampus(signal) {
		  return await request("/campus", signal === void 0 ? {} : { signal });
		}
		async function createCampus(input) {
		  const result = await request("/campus", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.campus;
		}
		async function advanceCampus(id, stage, allowBackward = false) {
		  const result = await request(
		    `/campus/${String(id)}/advance`,
		    { method: "POST", body: JSON.stringify({ stage, allowBackward }) }
		  );
		  return result.campus;
		}
		async function createAssessment(input) {
		  const result = await request("/assessments", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.assessment;
		}
		async function setAssessmentState(id, state) {
		  const result = await request(
		    `/assessments/${String(id)}/state`,
		    { method: "POST", body: JSON.stringify({ state }) }
		  );
		  return result.assessment;
		}
		async function fetchTripartite(signal) {
		  return await request("/tripartite", signal === void 0 ? {} : { signal });
		}
		async function createTripartite(input) {
		  const result = await request("/tripartite", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.tripartite;
		}
		async function setTripartiteState(id, state) {
		  const result = await request(
		    `/tripartite/${String(id)}/state`,
		    { method: "POST", body: JSON.stringify({ state }) }
		  );
		  return result.tripartite;
		}
		async function analyzeOverseas(jobId) {
		  return await request(
		    "/overseas/analyze",
		    { method: "POST", body: JSON.stringify({ jobId }) }
		  );
		}
		async function fetchTimezone(at, tz, signal) {
		  const query = new URLSearchParams({ at, tz });
		  return await request(`/timezone?${query.toString()}`, signal === void 0 ? {} : { signal });
		}
		async function draftCoverLetter(input) {
		  const result = await request("/cover-letters", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.coverLetter;
		}

		// src/shared/labels.ts
		var JOB_STATE_LABEL = {
		  new: "\u65B0",
		  seen: "\u5DF2\u8BFB",
		  saved: "\u5DF2\u6536\u85CF",
		  ignored: "\u5DF2\u5FFD\u7565",
		  archived: "\u5DF2\u5F52\u6863"
		};

		// src/client/labels.ts
		var JOB_ACTION_LABEL = {
		  new: "\u6807\u4E3A\u65B0",
		  seen: "\u6807\u4E3A\u5DF2\u8BFB",
		  saved: "\u6536\u85CF",
		  ignored: "\u5FFD\u7565",
		  archived: "\u5F52\u6863"
		};
		function salaryDetail(job) {
		  if (job.salaryMin === null) return null;
		  const range = job.salaryMax === null || job.salaryMax === job.salaryMin ? String(job.salaryMin) : `${String(job.salaryMin)}-${String(job.salaryMax)}`;
		  return `${range} \u5143/\u6708${job.salaryMonths === null ? "" : ` \xB7 ${String(job.salaryMonths)} \u85AA`}`;
		}
		var BENEFIT_KEYWORDS = [
		  "\u4E94\u9669",
		  "\u4E00\u91D1",
		  "\u516C\u79EF\u91D1",
		  "\u5E74\u7EC8",
		  "\u5956\u91D1",
		  "\u63D0\u6210",
		  "\u8865\u8D34",
		  "\u8865\u52A9",
		  "\u798F\u5229",
		  "\u4F53\u68C0",
		  "\u65C5\u6E38",
		  "\u56E2\u5EFA",
		  "\u5E74\u5047",
		  "\u53CC\u4F11",
		  "\u5F39\u6027",
		  "\u4F4F\u5BBF",
		  "\u5305\u5403",
		  "\u5305\u4F4F",
		  "\u73ED\u8F66",
		  "\u57F9\u8BAD",
		  "\u80A1\u7968",
		  "\u671F\u6743",
		  "\u9910\u996E",
		  "\u8282\u65E5",
		  "\u751F\u65E5",
		  "\u4E0B\u5348\u8336",
		  "\u5065\u8EAB",
		  "\u8865\u5145\u533B\u7597",
		  "\u610F\u5916\u9669",
		  "\u5E26\u85AA"
		];
		function splitJobTags(tags) {
		  const skills = [];
		  const benefits = [];
		  for (const tag of tags) {
		    if (BENEFIT_KEYWORDS.some((keyword) => tag.includes(keyword))) benefits.push(tag);
		    else skills.push(tag);
		  }
		  return { skills, benefits };
		}

		// src/client/screens/tailor-panel.tsx
		var import_react2 = require("react");
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function TailorPanel(props) {
		  const [items, setItems] = (0, import_react2.useState)([]);
		  const [busy, setBusy] = (0, import_react2.useState)(null);
		  const [error, setError] = (0, import_react2.useState)(null);
		  const [notice, setNotice] = (0, import_react2.useState)(null);
		  const reload = (0, import_react2.useCallback)(async () => {
		    try {
		      const result = await fetchTailorings({ jobId: props.jobId, limit: 5 });
		      setItems(result.items);
		    } catch {
		      setItems([]);
		    }
		  }, [props.jobId]);
		  (0, import_react2.useEffect)(() => {
		    void reload();
		  }, [reload, props.revision]);
		  const run = async (label, fn) => {
		    setBusy(label);
		    setError(null);
		    setNotice(null);
		    try {
		      setNotice(await fn());
		      await reload();
		      props.onChanged();
		    } catch (caught) {
		      setError(
		        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught)
		      );
		    } finally {
		      setBusy(null);
		    }
		  };
		  const latest = items[0];
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "jh-tailor", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "jh-card-title", children: "\u7B80\u5386\u5B9A\u5236" }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "jh-detail-actions", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy !== null,
		          onClick: () => void run("\u89C4\u5219\u5B9A\u5236", async () => {
		            const result = await tailorResume({ jobId: props.jobId, useLlm: false });
		            return `\u5DF2\u751F\u6210\u89C4\u5219\u5B9A\u5236 #${String(result.id)}\uFF08\u4E0D\u8C03\u7528\u6A21\u578B\uFF0C\u53EA\u91CD\u6392\u987A\u5E8F\uFF09`;
		          }),
		          children: "\u89C4\u5219\u5B9A\u5236"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy !== null,
		          onClick: () => void run("\u6A21\u578B\u5B9A\u5236", async () => {
		            const result = await tailorResume({ jobId: props.jobId, useLlm: true });
		            return result.via === "llm" ? `\u5DF2\u751F\u6210\u6A21\u578B\u5B9A\u5236 #${String(result.id)}\uFF08\u5DF2\u8FC7\u9632\u7F16\u9020\u68C0\u67E5\uFF09` : `\u6A21\u578B\u4E0D\u53EF\u7528\u6216\u7ED3\u679C\u4E0D\u5408\u89C4\uFF0C\u5DF2\u9000\u56DE\u89C4\u5219\u7ED3\u679C #${String(result.id)}`;
		          }),
		          children: "\u6A21\u578B\u5B9A\u5236"
		        }
		      ),
		      latest === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy !== null,
		          onClick: () => void run("\u5BFC\u51FA", async () => {
		            const file = await exportResume(latest.resumeId, { format: "pdf", template: "concise" });
		            return `\u5DF2\u5BFC\u51FA ${file.fileName}`;
		          }),
		          children: "\u5BFC\u51FA\u8FD9\u7248\u7B80\u5386 PDF"
		        }
		      )
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "jh-ok", children: notice }),
		    busy === null ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "jh-muted", children: [
		      busy,
		      "\u2026"
		    ] }),
		    latest === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u9488\u5BF9\u8FD9\u4E2A\u5C97\u4F4D\u7684\u5B9A\u5236\u5EFA\u8BAE\u3002\u5B9A\u5236\u53EA\u6539**\u987A\u5E8F\u4E0E\u63AA\u8F9E**\uFF0C\u4E0D\u4F1A\u65B0\u589E\u4EFB\u4F55\u4F60\u6CA1\u5199\u8FC7\u7684\u7ECF\u5386\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "jh-muted", children: [
		        "\u6700\u65B0\u5EFA\u8BAE #",
		        latest.id,
		        "\uFF08\u6765\u6E90\uFF1A",
		        latest.via === "llm" ? "\u6A21\u578B" : "\u89C4\u5219",
		        "\uFF09",
		        latest.adopted ? " \xB7 \u5DF2\u91C7\u7528" : "",
		        latest.createdAt === "" ? "" : ` \xB7 ${latest.createdAt.slice(0, 16).replace("T", " ")}`
		      ] }),
		      latest.notes.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "jh-tailor-notes", children: latest.notes.map((note, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
		        "\xB7 ",
		        note
		      ] }, String(index))) }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "jh-muted", children: [
		        "\u8C03\u6574\u540E\u7684\u6280\u80FD\u987A\u5E8F\uFF1A",
		        latest.content.skills.slice(0, 12).map((skill) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "jh-tailor-skill", children: skill.name }, skill.name))
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "jh-detail-actions", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void run("\u91C7\u7528", async () => {
		              await adoptTailoring(latest.id, true);
		              return "\u5DF2\u6807\u8BB0\u4E3A\u91C7\u7528 \u2014\u2014 \u8FD9\u53EA\u662F\u8BB0\u5F55\uFF0C\u4F60\u7684\u7B80\u5386\u672C\u4F53\u6CA1\u6709\u88AB\u6539\u5199";
		            }),
		            children: "\u6807\u8BB0\u4E3A\u91C7\u7528"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void run("\u653E\u5F03", async () => {
		              await adoptTailoring(latest.id, false);
		              return "\u5DF2\u6807\u8BB0\u4E3A\u4E0D\u91C7\u7528";
		            }),
		            children: "\u4E0D\u91C7\u7528"
		          }
		        )
		      ] })
		    ] })
		  ] });
		}

		// src/client/screens/campus.tsx
		var import_react4 = require("react");

		// src/client/use-async.ts
		var import_react3 = require("react");
		function useAsync(loader, deps) {
		  const [nonce, setNonce] = (0, import_react3.useState)(0);
		  const [state, setState] = (0, import_react3.useState)({ status: "loading" });
		  (0, import_react3.useEffect)(() => {
		    const controller = new AbortController();
		    setState({ status: "loading" });
		    loader(controller.signal).then(
		      (data) => {
		        if (controller.signal.aborted) return;
		        setState({ status: "ok", data });
		      },
		      (error) => {
		        if (controller.signal.aborted) return;
		        setState({
		          status: "error",
		          message: error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error),
		          hint: error instanceof ApiError ? error.hint : void 0
		        });
		      }
		    );
		    return () => {
		      controller.abort();
		    };
		  }, [...deps, nonce]);
		  const reload = (0, import_react3.useCallback)(() => {
		    setNonce((value) => value + 1);
		  }, []);
		  return { state, reload };
		}

		// src/client/screens/campus.tsx
		var import_jsx_runtime4 = require("react/jsx-runtime");
		function CampusScreen(props) {
		  const data = useAsync((signal) => fetchCampus(signal), [props.revision]);
		  const tripartite = useAsync((signal) => fetchTripartite(signal), [props.revision]);
		  const [busy, setBusy] = (0, import_react4.useState)(false);
		  const [error, setError] = (0, import_react4.useState)(null);
		  const [notice, setNotice] = (0, import_react4.useState)(null);
		  const [name2, setName] = (0, import_react4.useState)("");
		  const [closeAt, setCloseAt] = (0, import_react4.useState)("");
		  const [dueAt, setDueAt] = (0, import_react4.useState)("");
		  const [dueFor, setDueFor] = (0, import_react4.useState)(null);
		  const run = async (fn, done) => {
		    setBusy(true);
		    setError(null);
		    setNotice(null);
		    try {
		      await fn();
		      setNotice(done);
		      props.onChanged();
		    } catch (caught) {
		      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught));
		    } finally {
		      setBusy(false);
		    }
		  };
		  const items = data.state.status === "ok" ? data.state.data.items : [];
		  const windows = data.state.status === "ok" ? data.state.data.windows : [];
		  const allAssessments = items.flatMap(
		    (item) => item.assessments.map((assessment) => ({
		      item,
		      assessment,
		      label: `${item.companyName ?? item.note ?? `#${String(item.id)}`} \xB7 ${ASSESSMENT_KIND_LABEL[assessment.kind]}`
		    }))
		  );
		  const deadlines = allAssessments.filter(
		    (entry) => entry.assessment.state !== "done" && entry.assessment.state !== "missed" && entry.assessment.hoursLeft !== null
		  ).map((entry) => ({
		    label: entry.label,
		    hoursLeft: entry.assessment.hoursLeft ?? 0,
		    dueAt: entry.assessment.dueAt ?? "",
		    id: entry.assessment.id
		  })).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
		  const missed = allAssessments.filter((entry) => entry.assessment.state === "missed");
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { className: "jh-card-title", children: "\u6821\u62DB\u652F\u7EBF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "jh-muted", children: "\u79CB\u62DB\u6625\u62DB\u662F**\u786C\u65F6\u95F4\u7A97**\uFF0C\u7B14\u8BD5\u4E0E\u4E09\u65B9\u662F**\u4E0D\u53EF\u9006\u8282\u70B9** \u2014\u2014 \u8FD9\u4E00\u5C4F\u7684\u91CD\u5FC3\u5C31\u662F\u522B\u9519\u8FC7\u3002" })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { className: "jh-card-title", children: "\u786C\u622A\u6B62" }),
		      deadlines.length === 0 && missed.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-ok", children: "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u7B14\u8BD5/\u6D4B\u8BC4\u622A\u6B62\u3002" }) : null,
		      deadlines.length === 0 && missed.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u622A\u6B62\u3002" }) : null,
		      deadlines.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "jh-deadlines", children: deadlines.map((deadline) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
		        "li",
		        {
		          className: `jh-deadline${deadline.hoursLeft < 0 ? " jh-deadline-overdue" : deadline.hoursLeft <= 24 ? " jh-deadline-urgent" : ""}`,
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: deadline.hoursLeft < 0 ? "\u26D4 \u5DF2\u8FC7\u671F" : deadline.hoursLeft <= 24 ? "\u26A0 \u7D27\u6025" : "\xB7" }),
		            " ",
		            deadline.label,
		            "\uFF5C",
		            deadline.dueAt.slice(0, 16).replace("T", " "),
		            "\uFF5C",
		            deadline.hoursLeft < 0 ? `\u5DF2\u8FC7 ${String(-deadline.hoursLeft)} \u5C0F\u65F6` : `\u8FD8\u5269 ${String(deadline.hoursLeft)} \u5C0F\u65F6`
		          ]
		        },
		        deadline.id
		      )) }),
		      missed.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-error", children: "\u5DF2\u9519\u8FC7\uFF08\u7EC8\u6001\uFF0C\u4E0D\u53EF\u6539\u56DE\uFF09\uFF1A" }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "jh-deadlines", children: missed.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "jh-deadline jh-deadline-overdue", children: [
		          "\u26D4 ",
		          entry.label,
		          "\uFF5C",
		          entry.assessment.dueAt?.slice(0, 16).replace("T", " ") ?? ""
		        ] }, entry.assessment.id)) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-muted", children: "\u7B14\u8BD5/\u6D4B\u8BC4\u9519\u8FC7\u5C31\u662F\u7EC8\u6001\uFF08\xA712.7\uFF09\uFF0C\u6CA1\u6709\u7B2C\u4E8C\u6B21\u673A\u4F1A\u3002" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { className: "jh-card-title", children: "\u6279\u6B21\u65F6\u95F4\u7A97" }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-muted", children: windows.map(
		        (window2) => `${CAMPUS_BATCH_LABEL[window2.batch]} ${String(window2.count)} \u6761\uFF08${String(window2.openCount)} \u4E2A\u8FD8\u6CA1\u7F51\u7533\uFF09${window2.nextCloseAt === null ? "" : `\uFF0C\u6700\u8FD1\u622A\u6B62 ${window2.nextCloseAt.slice(0, 10)}`}`
		      ).join("\u3000|\u3000") }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            placeholder: "\u516C\u53F8\u540D",
		            value: name2,
		            onChange: (event) => setName(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "date",
		            title: "\u7F51\u7533\u622A\u6B62",
		            value: closeAt,
		            onChange: (event) => setCloseAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn",
		            disabled: busy || name2.trim() === "",
		            onClick: () => void run(
		              async () => await createCampus({
		                note: name2.trim(),
		                ...closeAt === "" ? {} : { applyCloseAt: new Date(closeAt).toISOString() }
		              }),
		              "\u5DF2\u65B0\u5EFA\u6821\u62DB\u8BB0\u5F55"
		            ).then(() => {
		              setName("");
		              setCloseAt("");
		            }),
		            children: "\u65B0\u5EFA"
		          }
		        )
		      ] })
		    ] }),
		    data.state.status !== "ok" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u6821\u62DB\u8BB0\u5F55\u2026" }) : items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6821\u62DB\u8BB0\u5F55\u3002\u4E0A\u9762\u586B\u4E00\u4E2A\u516C\u53F8\u540D\u5C31\u80FD\u5F00\u59CB\u8DDF\u8E2A\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "jh-campus-list", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "jh-campus-item", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-message-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: item.companyName ?? item.note ?? `#${String(item.id)}` }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "jh-badge", children: CAMPUS_BATCH_LABEL[item.batch] }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "jh-muted", children: CAMPUS_STAGE_LABEL[item.stage] }),
		        item.applyCloseAt === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "jh-muted", children: [
		          "\u7F51\u7533\u622A\u6B62 ",
		          item.applyCloseAt.slice(0, 10)
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-detail-actions", children: [
		        ["applied", "assessment_pending", "interview_pending", "final", "closed"].map((stage) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy,
		            onClick: () => void run(
		              async () => await advanceCampus(item.id, stage),
		              `\u5DF2\u6807\u8BB0\u4E3A\u300C${CAMPUS_STAGE_LABEL[stage]}\u300D`
		            ),
		            children: CAMPUS_STAGE_LABEL[stage]
		          },
		          stage
		        )),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            onClick: () => setDueFor(dueFor === item.id ? null : item.id),
		            children: dueFor === item.id ? "\u6536\u8D77" : "\u52A0\u7B14\u8BD5"
		          }
		        )
		      ] }),
		      dueFor === item.id ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            title: "\u7B14\u8BD5\u622A\u6B62\uFF08\u5FC5\u586B \u2014\u2014 \u6CA1\u6709\u622A\u6B62\u65F6\u95F4\u7684\u7B14\u8BD5\u505A\u4E0D\u51FA\u63D0\u9192\uFF09",
		            value: dueAt,
		            onChange: (event) => setDueAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn",
		            disabled: busy || dueAt === "",
		            onClick: () => void run(
		              async () => await createAssessment({
		                campusApplicationId: item.id,
		                dueAt: new Date(dueAt).toISOString(),
		                kind: "written"
		              }),
		              "\u5DF2\u8BB0\u5F55\u7B14\u8BD5\uFF08\u4F1A\u51FA\u73B0\u5728\u4E0A\u9762\u7684\u786C\u622A\u6B62\u91CC\uFF09"
		            ).then(() => {
		              setDueAt("");
		              setDueFor(null);
		            }),
		            children: "\u8BB0\u5F55"
		          }
		        )
		      ] }) : null,
		      item.assessments.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "jh-tailor-notes", children: item.assessments.map((assessment) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { children: [
		        "\xB7 ",
		        ASSESSMENT_KIND_LABEL[assessment.kind],
		        "\uFF5C",
		        ASSESSMENT_STATE_LABEL[assessment.state],
		        "\uFF5C \u622A\u6B62 ",
		        assessment.dueAt?.slice(0, 16).replace("T", " ") ?? "\u672A\u586B",
		        assessment.state === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-link",
		              disabled: busy,
		              onClick: () => void run(
		                async () => await setAssessmentState(assessment.id, "done"),
		                "\u5DF2\u6807\u8BB0\u5B8C\u6210"
		              ),
		              children: "\u6807\u8BB0\u5B8C\u6210"
		            }
		          ),
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-link",
		              disabled: busy,
		              onClick: () => void run(
		                async () => await setAssessmentState(assessment.id, "missed"),
		                "\u5DF2\u6807\u8BB0\u9519\u8FC7\uFF08\u7EC8\u6001\uFF0C\u4E0D\u53EF\u6539\u56DE\uFF09"
		              ),
		              children: "\u6807\u8BB0\u9519\u8FC7"
		            }
		          )
		        ] }) : null
		      ] }, assessment.id)) })
		    ] }, item.id)) }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { className: "jh-card-title", children: "\u4E09\u65B9\u534F\u8BAE" }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-muted", children: "\u4E09\u65B9\u662F**\u4E0D\u53EF\u9006**\u8282\u70B9\uFF1A\u7B7E\u7F72\u524D\u540E\u5FC5\u987B\u663E\u8457\u533A\u5206\uFF0C\u8FDD\u7EA6\u6709\u771F\u5B9E\u4EE3\u4EF7\u3002\u771F\u7684\u8FDD\u7EA6\u8BF7\u6807\u300C\u8FDD\u7EA6\u300D\uFF0C\u4E0D\u8981\u6539\u56DE\u5F85\u7B7E\u3002" }),
		      tripartite.state.status === "ok" && tripartite.state.data.items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "jh-tailor-notes", children: tripartite.state.data.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { children: [
		        "\xB7 #",
		        item.id,
		        "\uFF5C",
		        TRIPARTITE_STATE_LABEL[item.state],
		        "\uFF5C",
		        item.signDeadline === null ? "\u65E0\u622A\u6B62" : `\u7B7E\u7F72\u622A\u6B62 ${item.signDeadline.slice(0, 10)}`,
		        item.penaltySummary === null ? "" : `\uFF5C${item.penaltySummary}`,
		        item.state === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-link",
		              disabled: busy,
		              onClick: () => void run(
		                async () => await setTripartiteState(item.id, "signed"),
		                "\u5DF2\u7B7E\u7F72\uFF08\u4E0D\u53EF\u9006\uFF0C\u8BF7\u786E\u8BA4\u65E0\u8BEF\uFF09"
		              ),
		              children: "\u6807\u8BB0\u5DF2\u7B7E"
		            }
		          )
		        ] }) : null
		      ] }, item.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy,
		          onClick: () => void run(
		            async () => await createTripartite({
		              ...items[0] === void 0 ? {} : { campusApplicationId: items[0].id },
		              signDeadline: new Date(Date.now() + 7 * 864e5).toISOString(),
		              penaltySummary: "\u8FDD\u7EA6\u6761\u6B3E\uFF1A\u5F85\u586B\u5199"
		            }),
		            "\u5DF2\u65B0\u5EFA\u4E09\u65B9\u8BB0\u5F55\uFF08\u9ED8\u8BA4\u622A\u6B62 7 \u5929\u540E\uFF0C\u8BF7\u6539\u6210\u771F\u5B9E\u65E5\u671F\uFF09"
		          ),
		          children: "\u65B0\u5EFA\u4E09\u65B9\u8BB0\u5F55"
		        }
		      )
		    ] })
		  ] });
		}
		function OverseasPanel(props) {
		  const [busy, setBusy] = (0, import_react4.useState)(false);
		  const [error, setError] = (0, import_react4.useState)(null);
		  const [analysis, setAnalysis] = (0, import_react4.useState)(null);
		  const [letter, setLetter] = (0, import_react4.useState)(null);
		  const [tz, setTz] = (0, import_react4.useState)("America/New_York");
		  const [interviewAt, setInterviewAt] = (0, import_react4.useState)("");
		  const [display, setDisplay] = (0, import_react4.useState)(null);
		  const run = async (fn, onDone) => {
		    setBusy(true);
		    setError(null);
		    try {
		      onDone(await fn());
		      props.onChanged();
		    } catch (caught) {
		      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught));
		    } finally {
		      setBusy(false);
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "jh-tailor", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { className: "jh-card-title", children: "\u6D77\u5916 / \u8FDC\u7A0B" }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-detail-actions", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy,
		          onClick: () => void run(
		            async () => await analyzeOverseas(props.jobId),
		            (value) => {
		              const result = value;
		              setAnalysis(result);
		            }
		          ),
		          children: "\u8BC6\u522B\u5DE5\u7B7E\u4E0E\u5DE5\u4F5C\u6A21\u5F0F"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy,
		          onClick: () => void run(
		            async () => await draftCoverLetter({ jobId: props.jobId, language: "en" }),
		            (value) => setLetter(value.content)
		          ),
		          children: "\u751F\u6210 Cover Letter"
		        }
		      )
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-error", children: error }),
		    analysis === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: "jh-muted", children: [
		        "\u5DE5\u7B7E\u7ACB\u573A\uFF1A",
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: VISA_STANCE_LABEL[analysis.stance] ?? analysis.stance }),
		        "\uFF5C\u5DE5\u4F5C\u6A21\u5F0F\uFF1A",
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: REMOTE_KIND_LABEL[analysis.remoteKind] ?? analysis.remoteKind })
		      ] }),
		      analysis.evidence.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: "jh-muted", children: [
		        "\u4F9D\u636E\uFF1A",
		        analysis.evidence.join("\u3001")
		      ] }),
		      analysis.uncertainty === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-warn", children: analysis.uncertainty })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-muted", children: "\u9762\u8BD5\u65F6\u95F4\u53CC\u91CD\u6362\u7B97\uFF08\u7B97\u9519\u65F6\u533A = \u76F4\u63A5\u9519\u8FC7\u9762\u8BD5\uFF09\uFF1A" }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            value: interviewAt,
		            onChange: (event) => setInterviewAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { className: "jh-input", value: tz, onChange: (event) => setTz(event.target.value), placeholder: "America/New_York" }),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn",
		            disabled: busy || interviewAt === "" || tz.trim() === "",
		            onClick: () => void run(
		              async () => await fetchTimezone(new Date(interviewAt).toISOString(), tz.trim()),
		              (value) => {
		                const result = value;
		                setDisplay({
		                  counterpart: result.counterpart.text,
		                  local: result.local.text,
		                  diffHours: result.diffHours,
		                  warning: result.warning
		                });
		              }
		            ),
		            children: "\u6362\u7B97"
		          }
		        )
		      ] }),
		      display === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: "jh-muted", children: [
		        "\u5BF9\u65B9 ",
		        display.counterpart,
		        "\uFF5C\u672C\u5730 ",
		        display.local,
		        "\uFF5C\u65F6\u5DEE ",
		        display.diffHours,
		        " \u5C0F\u65F6",
		        display.warning === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("b", { className: "jh-warn", children: [
		          " \u26A0 ",
		          display.warning
		        ] })
		      ] })
		    ] }),
		    letter === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "jh-tv-draft", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("pre", { className: "jh-tv-pre", children: letter }) })
		  ] });
		}

		// src/client/screens/job-detail.tsx
		var import_jsx_runtime5 = require("react/jsx-runtime");
		var ACTION_STATES = ["saved", "ignored", "seen", "archived"];
		var FLAG_TONE = {
		  fraud: "error",
		  outsourcing: "warn",
		  salary_inflation: "warn",
		  zombie: "quiet",
		  jargon_hit: "quiet"
		};
		function Hint(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-hint", role: "img", "aria-label": props.text, title: props.text, children: "?" });
		}
		function Gauge(props) {
		  const clamped = Math.max(0, Math.min(100, Math.round(props.score)));
		  const band = clamped >= 70 ? "high" : clamped >= 45 ? "mid" : "low";
		  const radius = 30;
		  const circumference = 2 * Math.PI * radius;
		  const filled = clamped / 100 * circumference;
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: `jh-gauge jh-gauge-${band}`, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { width: "72", height: "72", viewBox: "0 0 72 72", "aria-hidden": "true", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { className: "jh-gauge-track", cx: "36", cy: "36", r: radius, fill: "none", strokeWidth: "7" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		        "circle",
		        {
		          cx: "36",
		          cy: "36",
		          r: radius,
		          fill: "none",
		          strokeWidth: "7",
		          strokeLinecap: "round",
		          stroke: "currentColor",
		          strokeDasharray: `${String(filled)} ${String(circumference - filled)}`
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-gauge-num", children: [
		      clamped,
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-gauge-unit", children: "\u7C97\u7B5B\u5206" })
		    ] })
		  ] });
		}
		function JobDetailBody(props) {
		  const { state, reload } = useAsync((signal) => fetchJobDetail(props.id, signal), [props.id, props.revision]);
		  const [busy, setBusy] = (0, import_react5.useState)(null);
		  const [failure, setFailure] = (0, import_react5.useState)(null);
		  const mark = async (next) => {
		    setBusy(next);
		    setFailure(null);
		    try {
		      await markJob(props.id, next);
		      props.onChanged();
		      reload();
		    } catch (error) {
		      setFailure(error instanceof ApiError ? error.display : String(error));
		    } finally {
		      setBusy(null);
		    }
		  };
		  if (state.status === "loading") {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u8BE6\u60C5\u2026" });
		  }
		  if (state.status === "error") {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-error", children: state.message }),
		      state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: state.hint }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "jh-btn", onClick: reload, children: "\u91CD\u8BD5" })
		    ] });
		  }
		  const { job, company, flags, matchReasons } = state.data;
		  const grouped = splitJobTags(job.tags);
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("header", { className: "jh-detail-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-detail-headline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { className: "jh-detail-title", children: job.title }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-detail-salary", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { className: "jh-salary", children: job.salaryRaw }),
		          salaryDetail(job) === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "jh-muted", children: [
		            "\uFF08",
		            salaryDetail(job),
		            "\uFF09"
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "jh-detail-actions", children: ACTION_STATES.map((action) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		        "button",
		        {
		          type: "button",
		          className: `jh-btn jh-btn-inline${job.state === action ? " jh-btn-active" : ""}`,
		          disabled: busy !== null,
		          onClick: () => void mark(action),
		          children: busy === action ? "\u2026" : JOB_ACTION_LABEL[action]
		        },
		        action
		      )) })
		    ] }),
		    failure === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-error", children: failure }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("ul", { className: "jh-kv", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u516C\u53F8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: job.companyName ?? "\u2014" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u5730\u70B9" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
		          job.city,
		          job.district === "" ? "" : `\xB7${job.district}`
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u7ECF\u9A8C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: job.expReq === "" ? "\u2014" : job.expReq })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u5B66\u5386" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: job.eduReq === "" ? "\u2014" : job.eduReq })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u53D1\u5E03" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: job.publishedAt ?? "\u2014" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u9996\u6B21\u89C1\u5230" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: job.firstSeenAt })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u5F53\u524D\u72B6\u6001" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: JOB_STATE_LABEL[job.state] })
		      ] })
		    ] }),
		    job.tags.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      grouped.skills.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-tag-group", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-tag-group-name", children: "\u6280\u80FD\u8981\u6C42" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "jh-tags", children: grouped.skills.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-tag", children: tag }, tag)) })
		      ] }),
		      grouped.benefits.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-tag-group", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-tag-group-name", children: "\u516C\u53F8\u798F\u5229" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "jh-tags", children: grouped.benefits.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-tag", children: tag }, tag)) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "jh-card-title", children: "L1 \u7C97\u7B5B\u5206" }),
		      job.matchScore === null ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-note", children: "\u8FD8\u6CA1\u6709\u7B97\u8FC7 \u2014\u2014 \u91C7\u96C6\u540E\u4F1A\u968F\u6807\u6CE8\u4E00\u8D77\u7B97\u51FA\u6765\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-gauge-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Gauge, { score: job.matchScore }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-gauge-side", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-gauge-band", children: job.matchScore >= 70 ? "\u672C\u8F6E\u89C4\u5219\u91CC\u9760\u524D" : job.matchScore >= 45 ? "\u4E2D\u7B49" : "\u504F\u4F4E" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-note", children: [
		            "\u6309\u89C4\u5219\u7B97\u51FA\u6765\u7684**\u7C97\u7B5B\u5206**\uFF0C\u4E0B\u9762\u662F\u9010\u6761\u52A0\u51CF\u5206\u3002",
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		              Hint,
		              {
		                text: "\u7EAF\u89C4\u5219\u6253\u5206\uFF08\u57CE\u5E02 / \u85AA\u8D44 / \u5173\u952E\u8BCD\u547D\u4E2D\u7387\uFF09\uFF0C\u5168\u91CF\u9002\u7528\u3001\u96F6\u6210\u672C\u3002\u8BED\u4E49\u7EA7\u7684\u7CBE\u8BC4\u8981\u7B49 L2\uFF0C\u6240\u4EE5\u8FD9\u91CC\u6807\u7684\u662F\u300C\u7C97\u7B5B\u5206\u300D\u800C\u4E0D\u662F\u300C\u5339\u914D\u5EA6\u300D\u3002"
		              }
		            )
		          ] })
		        ] })
		      ] }),
		      matchReasons.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "jh-reasons", children: matchReasons.map((reason, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		        "li",
		        {
		          className: `jh-reason jh-reason-${reason.kind}${reason.kind === "hit" ? " jh-reason-ok" : " jh-reason-bad"}`,
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-reason-mark", children: reason.kind === "hit" ? "\u2713" : "\u2715" }),
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-reason-weight", children: reason.weight > 0 ? `+${String(reason.weight)}` : reason.weight < 0 ? String(reason.weight) : "\xB7" }),
		            reason.text
		          ]
		        },
		        `${reason.kind}-${String(index)}`
		      )) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "jh-card-title", children: "\u6807\u6CE8\u4E0E\u4F9D\u636E" }),
		      flags.length === 0 ? (
		        // 刻意不刷成绿色：绿色等于宣布"这个岗位没问题"，而规则没命中只说明"没命中已知模式"。
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-alert jh-alert-quiet", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-alert-title", children: "\u6CA1\u6709\u547D\u4E2D\u4EFB\u4F55\u5DF2\u77E5\u98CE\u9669\u7279\u5F81" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-alert-body", children: "\u8FD9\u4E0D\u7B49\u4E8E\u300C\u6CA1\u95EE\u9898\u300D\u3002\u8BC6\u522B\u4F9D\u636E\u5206\u4E24\u5C42\uFF1A**\u6587\u672C\u5C42**\u6765\u81EA\u8BCD\u8868\u547D\u4E2D\u7684\u539F\u6587\u7247\u6BB5\uFF0C **\u7EDF\u8BA1\u5C42**\u6765\u81EA\u516C\u53F8\u7EF4\u5EA6\uFF08\u5C97\u4F4D\u6570\u3001\u5730\u57DF\u8DE8\u5EA6\u3001\u9A7B\u573A\u6BD4\u4F8B\uFF09\uFF1B\u4E24\u8005\u90FD\u6CA1\u6709\u547D\u4E2D\u65F6\uFF0C\u8FD9\u91CC\u662F\u7A7A\u7684\u3002" })
		        ] })
		      ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		        flags.map((flag) => {
		          const tone = FLAG_TONE[flag.flagType] ?? "quiet";
		          return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: `jh-alert jh-alert-${tone}`, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-alert-head", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: `jh-flag jh-flag-${flag.flagType}`, children: JOB_FLAG_LABEL[flag.flagType] }),
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "jh-alert-title", children: [
		                "\u5F3A\u5EA6 ",
		                flag.score
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "jh-evidence", children: flag.evidence.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: item }, `${flag.flagType}-${String(index)}`)) })
		          ] }, flag.flagType);
		        }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-note", children: [
		          "\u6BCF\u6761\u7ED3\u8BBA\u90FD\u9644\u539F\u6587\u6216\u7EDF\u8BA1\u4F9D\u636E\u3002",
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		            Hint,
		            {
		              text: "\u8BC6\u522B\u4F9D\u636E\u5206\u4E24\u5C42\uFF1A\u6587\u672C\u5C42\u6765\u81EA\u8BCD\u8868\u547D\u4E2D\u7684\u539F\u6587\u7247\u6BB5\uFF0C\u7EDF\u8BA1\u5C42\u6765\u81EA\u516C\u53F8\u7EF4\u5EA6\uFF08\u5C97\u4F4D\u6570\u3001\u5730\u57DF\u8DE8\u5EA6\u3001\u9A7B\u573A\u6BD4\u4F8B\uFF09\u3002\u5F3A\u5EA6\u662F\u89C4\u5219\u6743\u91CD\uFF0C\u4E0D\u662F\u6982\u7387\u3002"
		            }
		          )
		        ] })
		      ] })
		    ] }),
		    company === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "jh-card-title", children: "\u516C\u53F8\u753B\u50CF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("ul", { className: "jh-kv", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u5F52\u4E00\u5316\u540D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: company.nameNorm })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u884C\u4E1A" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: company.industry ?? "\u2014" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u6027\u8D28" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: company.nature ?? "\u2014" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u89C4\u6A21" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: company.size ?? "\u2014" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u5728\u624B\u5C97\u4F4D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: company.jobCount })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u6280\u672F\u6808\u5E7F\u5EA6" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: company.stackDiversity })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u5730\u57DF\u8DE8\u5EA6" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: company.geoSpread })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u9A7B\u573A\u6BD4\u4F8B" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: company.onsiteRatio === null ? "\u2014" : `${String(Math.round(company.onsiteRatio * 100))}%` })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u540D\u79F0\u5173\u952E\u8BCD" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: company.nameKeywordHits })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u5916\u5305\u5206 / \u8BC8\u9A97\u5206" }),
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
		            String(company.outsourcingScore ?? 0),
		            " / ",
		            String(company.fraudScore ?? 0)
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-note", children: "\u51B7\u542F\u52A8\u65F6\u7EDF\u8BA1\u4FE1\u53F7\u5F31\uFF08D-16\uFF09\uFF1A\u5C97\u4F4D\u8D8A\u591A\u5224\u65AD\u8D8A\u51C6\uFF0C\u4F9D\u636E\u4E0D\u8DB3\u65F6\u8FD9\u4E9B\u6570\u5B57\u4F1A\u504F\u4F4E\u3002" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TailorPanel, { jobId: props.id, revision: props.revision, onChanged: props.onChanged }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(OverseasPanel, { jobId: props.id, onChanged: props.onChanged }),
		    job.scoreStale ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-warn", children: "\u8FD9\u4E2A\u5339\u914D\u5206\u662F**\u65E7\u7248\u7B80\u5386**\u4E0B\u7B97\u51FA\u6765\u7684 \u2014\u2014 \u7B80\u5386\u6539\u8FC7\u4E4B\u540E\u5B83\u5C31\u4E0D\u518D\u6709\u6548\u3002 \u7528\u300C\u91CD\u7B97\u300D\u6216\u5728\u5BF9\u8BDD\u91CC\u8BA9\u6A21\u578B\u8DD1 job_match_explain \u624D\u662F\u5F53\u524D\u5206\u6570\u3002" }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-note", children: [
		      "\u539F\u59CB\u9875\u9762\uFF1A",
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { className: "jh-link", href: job.sourceUrl, target: "_blank", rel: "noreferrer noopener", children: job.sourceUrl })
		    ] })
		  ] });
		}
		function JobDetailPane(props) {
		  if (props.id === null) {
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "jh-detail-pane jh-detail-pane-empty", "data-job-hunter": "job-detail", "aria-label": "\u5C97\u4F4D\u8BE6\u60C5", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-detail-empty-title", children: "\u4ECE\u5DE6\u4FA7\u9009\u4E00\u4E2A\u5C97\u4F4D" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-note", children: "\u8BE6\u60C5\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\uFF0C\u5217\u8868\u4FDD\u6301\u4E0D\u52A8\uFF0C\u65B9\u4FBF\u4E00\u4E2A\u4E2A\u5F80\u4E0B\u6BD4\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-note", children: "\u5217\u8868\u4E0A\u7684\u300C\u7C97\u7B5B\u5206\u300D\u4E0E\u98CE\u9669\u6807\u6CE8\u53EA\u662F\u521D\u7B5B\uFF1B\u70B9\u8FDB\u6765\u80FD\u770B\u5230\u6BCF\u4E00\u6761\u7ED3\u8BBA\u7684**\u539F\u6587\u4F9D\u636E**\u3002" })
		    ] });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("section", { className: "jh-detail-pane", "data-job-hunter": "job-detail", "aria-label": "\u5C97\u4F4D\u8BE6\u60C5", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(JobDetailBody, { id: props.id, revision: props.revision, onChanged: props.onChanged }) });
		}
		function JobDetailDrawer(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-drawer-layer", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "jh-drawer-backdrop", "aria-label": "\u5173\u95ED\u8BE6\u60C5", onClick: props.onClose }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("aside", { className: "jh-drawer", role: "dialog", "aria-label": "\u5C97\u4F4D\u8BE6\u60C5", "data-job-hunter": "job-drawer", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("header", { className: "jh-drawer-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-drawer-title", children: "\u5C97\u4F4D\u8BE6\u60C5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "jh-icon-btn", "aria-label": "\u5173\u95ED", onClick: props.onClose, children: "\xD7" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "jh-drawer-body", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(JobDetailBody, { id: props.id, revision: props.revision, onChanged: props.onChanged }) })
		    ] })
		  ] });
		}

		// src/client/screens/jobs.tsx
		var import_react6 = require("react");
		var import_jsx_runtime6 = require("react/jsx-runtime");
		var EMPTY_FILTERS = {
		  q: "",
		  city: "",
		  state: "",
		  minSalary: "",
		  orderBy: "crawled_at",
		  descending: true
		};
		var ORDER_OPTIONS = [
		  { value: "crawled_at", label: "\u6309\u6293\u53D6\u65F6\u95F4" },
		  { value: "salary_min", label: "\u6309\u6708\u85AA" },
		  { value: "last_seen_at", label: "\u6309\u6700\u8FD1\u51FA\u73B0" },
		  { value: "title", label: "\u6309\u6807\u9898" }
		];
		var PAGE_SIZE = 20;
		function pageNumbers(page, pages) {
		  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
		  const wanted = [.../* @__PURE__ */ new Set([1, pages, page - 1, page, page + 1])].filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
		  const out = [];
		  let previous = 0;
		  for (const value of wanted) {
		    if (previous !== 0 && value - previous > 1) out.push("\u2026");
		    out.push(value);
		    previous = value;
		  }
		  return out;
		}
		function Pager(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("nav", { className: "jh-pager", "aria-label": "\u5206\u9875", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-pg",
		        "aria-label": "\u4E0A\u4E00\u9875",
		        disabled: props.page <= 1,
		        onClick: () => props.onGo(props.page - 1),
		        children: "\u2039"
		      }
		    ),
		    pageNumbers(props.page, props.pages).map(
		      (item, index) => item === "\u2026" ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-pg-gap", children: "\u2026" }, `gap-${String(index)}`) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        "button",
		        {
		          type: "button",
		          className: `jh-pg${item === props.page ? " jh-pg-active" : ""}`,
		          "aria-current": item === props.page ? "page" : void 0,
		          onClick: () => props.onGo(item),
		          children: item
		        },
		        item
		      )
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-pg",
		        "aria-label": "\u4E0B\u4E00\u9875",
		        disabled: !props.hasMore,
		        onClick: () => props.onGo(props.page + 1),
		        children: "\u203A"
		      }
		    )
		  ] });
		}
		function JobsScreen(props) {
		  const [draft, setDraft] = (0, import_react6.useState)(EMPTY_FILTERS);
		  const [applied, setApplied] = (0, import_react6.useState)(EMPTY_FILTERS);
		  const [page, setPage] = (0, import_react6.useState)(1);
		  const { state, reload } = useAsync(
		    (signal) => fetchJobs(
		      {
		        q: applied.q,
		        city: applied.city,
		        state: applied.state,
		        minSalary: applied.minSalary === "" ? null : Number(applied.minSalary),
		        orderBy: applied.orderBy,
		        descending: applied.descending,
		        page,
		        pageSize: PAGE_SIZE
		      },
		      signal
		    ),
		    [props.revision, applied, page]
		  );
		  const submit = (event) => {
		    event.preventDefault();
		    setApplied(draft);
		    setPage(1);
		  };
		  const reset = () => {
		    setDraft(EMPTY_FILTERS);
		    setApplied(EMPTY_FILTERS);
		    setPage(1);
		  };
		  const total = state.status === "ok" ? state.data.total : 0;
		  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-jobs-split", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("form", { className: "jh-filters", onSubmit: submit, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        "input",
		        {
		          className: "jh-input jh-input-grow",
		          placeholder: "\u5173\u952E\u8BCD\uFF08\u5C97\u4F4D\u540D\uFF09",
		          "aria-label": "\u5173\u952E\u8BCD",
		          value: draft.q,
		          onChange: (event) => setDraft({ ...draft, q: event.target.value })
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        "input",
		        {
		          className: "jh-input jh-input-sm",
		          placeholder: "\u57CE\u5E02",
		          "aria-label": "\u57CE\u5E02",
		          value: draft.city,
		          onChange: (event) => setDraft({ ...draft, city: event.target.value })
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
		        "select",
		        {
		          className: "jh-select jh-input-sm",
		          "aria-label": "\u72B6\u6001",
		          value: draft.state,
		          onChange: (event) => setDraft({ ...draft, state: event.target.value }),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "\u5168\u90E8\u72B6\u6001" }),
		            JOB_STATES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value, children: JOB_STATE_LABEL[value] }, value))
		          ]
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        "input",
		        {
		          className: "jh-input jh-input-sm",
		          placeholder: "\u6700\u4F4E\u6708\u85AA",
		          "aria-label": "\u6700\u4F4E\u6708\u85AA",
		          inputMode: "numeric",
		          value: draft.minSalary,
		          onChange: (event) => setDraft({ ...draft, minSalary: event.target.value.replace(/[^0-9]/g, "") })
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		        "select",
		        {
		          className: "jh-select jh-input-sm",
		          "aria-label": "\u6392\u5E8F",
		          value: draft.orderBy,
		          onChange: (event) => setDraft({ ...draft, orderBy: event.target.value }),
		          children: ORDER_OPTIONS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: option.value, children: option.label }, option.value))
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "submit", className: "jh-btn jh-btn-inline jh-btn-primary", children: "\u7B5B\u9009" }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline jh-btn-quiet", onClick: reset, children: "\u91CD\u7F6E" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-jobs-cols", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-jobs-pane", "data-job-hunter": "job-list", children: [
		        state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u67E5\u8BE2\u5C97\u4F4D\u2026" }),
		        state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { className: "jh-card-title", children: "\u67E5\u8BE2\u5931\u8D25" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-error", children: state.message }),
		          state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-muted", children: state.hint }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "jh-btn", onClick: reload, children: "\u91CD\u8BD5" })
		        ] }),
		        state.status === "ok" && state.data.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { className: "jh-card-title", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5C97\u4F4D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { className: "jh-muted", children: [
		            "\u5171 ",
		            state.data.total,
		            " \u6761\u3002\u6362\u4E2A\u5173\u952E\u8BCD\u6216\u653E\u5BBD\u7B5B\u9009\u6761\u4EF6\u8BD5\u8BD5\uFF1B\u4E5F\u53EF\u4EE5\u56DE\u5230\u300C\u4ECA\u65E5\u300D\u624B\u52A8\u6293\u53D6\u4E00\u6B21\u3002"
		          ] })
		        ] }),
		        state.status === "ok" && state.data.items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-listbar", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "jh-muted", children: [
		              "\u5171 ",
		              state.data.total,
		              " \u6761 \xB7 \u7B2C ",
		              state.data.page,
		              " / ",
		              pages,
		              " \u9875"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Pager, { page: state.data.page, pages, hasMore: state.data.hasMore, onGo: setPage })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "jh-jobs", children: state.data.items.map((job) => {
		            const active = job.id === props.selected;
		            return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
		              "button",
		              {
		                type: "button",
		                className: `jh-job${active ? " jh-job-active" : ""}`,
		                "data-job-id": job.id,
		                "aria-current": active ? "true" : void 0,
		                onClick: () => props.onSelect(job.id),
		                children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "jh-job-main", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-job-title", children: job.title }),
		                    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "jh-job-meta", children: [
		                      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { className: "jh-salary", children: job.salaryRaw }),
		                      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
		                        job.city,
		                        job.district === "" ? "" : `\xB7${job.district}`
		                      ] }),
		                      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-job-company", children: job.companyName ?? "\u2014" })
		                    ] }),
		                    job.tags.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-tags", children: job.tags.slice(0, 8).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-tag", children: tag }, tag)) }),
		                    (job.flagTypes.length > 0 || job.matchScore !== null) && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "jh-job-signals", children: [
		                      job.matchScore === null ? null : (
		                        // 明确写「粗筛」：L1 规则分不是完整评估（§4.5.1）
		                        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "jh-score", children: [
		                          "\u7C97\u7B5B ",
		                          job.matchScore
		                        ] })
		                      ),
		                      job.flagTypes.map((type) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: `jh-flag jh-flag-${type}`, children: JOB_FLAG_LABEL[type] }, type))
		                    ] })
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: `jh-state jh-state-${job.state}`, children: JOB_STATE_LABEL[job.state] })
		                ]
		              }
		            ) }, job.id);
		          }) })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(JobDetailPane, { id: props.selected, revision: props.revision, onChanged: props.onChanged })
		    ] })
		  ] });
		}

		// src/client/screens/messages.tsx
		var import_react7 = require("react");
		var import_jsx_runtime7 = require("react/jsx-runtime");
		function InboxScreen(props) {
		  const inbox = useAsync((signal) => fetchInbox({}, signal), [props.revision]);
		  const [unreadOnly, setUnreadOnly] = (0, import_react7.useState)(false);
		  const filtered = useAsync(
		    (signal) => fetchInbox({ unreadOnly }, signal),
		    [props.revision, unreadOnly]
		  );
		  const [draft, setDraft] = (0, import_react7.useState)("");
		  const [encoding, setEncoding] = (0, import_react7.useState)(false);
		  const [replyTo, setReplyTo] = (0, import_react7.useState)(null);
		  const [replyText, setReplyText] = (0, import_react7.useState)("");
		  const [busy, setBusy] = (0, import_react7.useState)(false);
		  const [error, setError] = (0, import_react7.useState)(null);
		  const [notice, setNotice] = (0, import_react7.useState)(null);
		  const data = filtered.state.status === "ok" ? filtered.state.data : inbox.state.status === "ok" ? inbox.state.data : null;
		  const run = async (fn, done) => {
		    setBusy(true);
		    setError(null);
		    setNotice(null);
		    try {
		      await fn();
		      setNotice(done);
		      props.onChanged();
		    } catch (caught) {
		      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught));
		    } finally {
		      setBusy(false);
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { className: "jh-card-title", children: "\u6D88\u606F\u4E2D\u5FC3" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-muted", children: [
		        "\u672A\u8BFB ",
		        data?.unread ?? 0,
		        " \u6761"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        "button",
		        {
		          type: "button",
		          className: `jh-btn jh-btn-inline${unreadOnly ? " jh-btn-active" : ""}`,
		          onClick: () => setUnreadOnly((value) => !value),
		          children: "\u53EA\u770B\u672A\u8BFB"
		        }
		      )
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { className: "jh-card-title", children: "\u624B\u52A8\u5F55\u5165\u4E00\u6761\u6D88\u606F" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u5E73\u53F0\u6536\u4EF6\u7BB1\u7684\u81EA\u52A8\u89E3\u6790\u8FD8\u6CA1\u505A\uFF08\u5C5E\u4E8E P8\uFF09\u2014\u2014 \u73B0\u5728\u4F60\u53EF\u4EE5\u628A HR \u7684\u6D88\u606F\u8D34\u8FDB\u6765\uFF0C \u7CFB\u7EDF\u548C\u72B6\u6001\u63A8\u8FDB\u3001\u8DDF\u8FDB\u5EFA\u8BAE\u5C31\u80FD\u8054\u52A8\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        "textarea",
		        {
		          className: "jh-textarea",
		          rows: 2,
		          placeholder: "\u628A HR \u53D1\u6765\u7684\u6D88\u606F\u8D34\u5728\u8FD9\u91CC\u2026",
		          value: draft,
		          onChange: (event) => setDraft(event.target.value)
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "jh-detail-actions", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn",
		          disabled: busy || draft.trim() === "",
		          onClick: () => void run(
		            async () => await recordMessage({ platformId: "manual", direction: "hr", content: draft.trim() }),
		            "\u5DF2\u5F55\u5165\uFF08\u5982\u679C\u662F\u9762\u8BD5\u9080\u7EA6\uFF0C\u4E0B\u9762\u4F1A\u6807\u51FA\u6765 \u2014\u2014 \u4F46\u72B6\u6001\u8981\u4F60\u81EA\u5DF1\u6539\uFF09"
		          ).then(() => setDraft("")),
		          children: "\u5F55\u5165"
		        }
		      ) })
		    ] }),
		    data === null ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u6D88\u606F\u2026" }) : data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u6D88\u606F\u3002\u6D88\u606F\u76EE\u524D\u9760\u624B\u52A8\u5F55\u5165\uFF0C\u6216\u5728\u5C97\u4F4D\u8BE6\u60C5\u91CC\u8DDF\u8FDB\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "jh-messages", children: data.items.map((message) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { className: `jh-message jh-message-${message.direction}`, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-message-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: message.direction === "hr" ? "HR" : "\u6211" }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-muted", children: message.at.slice(0, 16).replace("T", " ") }),
		        message.jobTitle === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
		          "button",
		          {
		            type: "button",
		            className: "jh-link",
		            onClick: () => message.jobId !== null && props.onSelectJob(message.jobId),
		            children: [
		              message.companyName ?? "",
		              " ",
		              message.jobTitle
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-spacer" }),
		        message.readAt === null && message.direction === "hr" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy,
		            onClick: () => void run(async () => await markMessageRead(message.id), "\u5DF2\u6807\u8BB0\u5DF2\u8BFB"),
		            children: "\u6807\u8BB0\u5DF2\u8BFB"
		          }
		        ) : null,
		        message.direction === "hr" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            onClick: () => {
		              setReplyTo(replyTo === message.id ? null : message.id);
		              setReplyText("");
		            },
		            children: replyTo === message.id ? "\u53D6\u6D88" : "\u56DE\u590D"
		          }
		        ) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-message-body", children: message.content }),
		      message.inviteSignal?.hit === true ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-warn", children: [
		        "\u26A0 \u7591\u4F3C\u9762\u8BD5\u9080\u7EA6\uFF08\u547D\u4E2D\uFF1A",
		        message.inviteSignal.keywords.join("\u3001"),
		        "\uFF09 \u2014\u2014 \u8FD9\u53EA\u662F\u63D0\u793A\uFF0C\u6539\u72B6\u6001\u8BF7\u5230\u300C\u9762\u8BD5\u65E5\u7A0B\u300D\u91CC\u663E\u5F0F\u65B0\u5EFA\u4E00\u573A\u3002"
		      ] }) : null,
		      replyTo === message.id ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-message-reply", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "textarea",
		          {
		            className: "jh-textarea",
		            rows: 2,
		            value: replyText,
		            onChange: (event) => setReplyText(event.target.value),
		            placeholder: "\u56DE\u590D\u5185\u5BB9\u2026"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn",
		            disabled: busy || replyText.trim() === "",
		            onClick: () => void run(
		              async () => await replyMessage(message.id, replyText.trim()),
		              "\u5DF2\u56DE\u590D\uFF08\u56DE\u590D\u662F\u4F1A\u771F\u7684\u53D1\u51FA\u53BB\u7684\u52A8\u4F5C\uFF0C\u8D70\u7684\u662F\u540C\u4E00\u9053\u95F8\u95E8\uFF09"
		            ).then(() => {
		              setReplyTo(null);
		              setReplyText("");
		            }),
		            children: "\u53D1\u9001\u56DE\u590D"
		          }
		        )
		      ] }) : null
		    ] }, message.id)) })
		  ] });
		}
		function InterviewsScreen(props) {
		  const list = useAsync((signal) => fetchInterviews(signal), [props.revision]);
		  const [busy, setBusy] = (0, import_react7.useState)(false);
		  const [error, setError] = (0, import_react7.useState)(null);
		  const [notice, setNotice] = (0, import_react7.useState)(null);
		  const [prepId, setPrepId] = (0, import_react7.useState)(null);
		  const [at, setAt] = (0, import_react7.useState)("");
		  const [kind, setKind] = (0, import_react7.useState)("video");
		  const [commute, setCommute] = (0, import_react7.useState)("");
		  const run = async (fn, done) => {
		    setBusy(true);
		    setError(null);
		    setNotice(null);
		    try {
		      await fn();
		      setNotice(done);
		      props.onChanged();
		    } catch (caught) {
		      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught));
		    } finally {
		      setBusy(false);
		    }
		  };
		  const data = list.state.status === "ok" ? list.state.data : null;
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { className: "jh-card-title", children: "\u9762\u8BD5\u65E5\u7A0B" }),
		      data !== null && data.conflicts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-warn", children: [
		        "\u26A0 ",
		        data.conflicts.length,
		        " \u5904\u65F6\u95F4\u51B2\u7A81"
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-ok", children: "\u6CA1\u6709\u65F6\u95F4\u51B2\u7A81" })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { className: "jh-card-title", children: "\u65B0\u589E\u4E00\u573A\u9762\u8BD5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            value: at,
		            onChange: (event) => setAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("select", { className: "jh-select", value: kind, onChange: (event) => setKind(event.target.value), children: ["onsite", "video", "phone", "other"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: item, children: INTERVIEW_KIND_LABEL[item] }, item)) }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "input",
		          {
		            className: "jh-input jh-input-narrow",
		            type: "number",
		            placeholder: "\u901A\u52E4\u5206\u949F",
		            value: commute,
		            onChange: (event) => setCommute(event.target.value),
		            disabled: kind !== "onsite",
		            title: "\u53EA\u6709\u73B0\u573A\u9762\u8BD5\u624D\u7B97\u901A\u52E4"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn",
		            disabled: busy || at === "",
		            onClick: () => void run(
		              async () => await createInterview({
		                // datetime-local 给的是本地时间字符串，补成 ISO
		                at: new Date(at).toISOString(),
		                kind,
		                ...kind === "onsite" && commute !== "" ? { commuteMin: Number(commute) } : {}
		              }),
		              "\u5DF2\u65B0\u589E\uFF08\u5982\u679C\u8FD9\u4E2A\u5C97\u4F4D\u6253\u8FC7\u62DB\u547C\uFF0C\u63A5\u89E6\u6001\u4F1A\u81EA\u52A8\u63A8\u8FDB\u5230\u300C\u5DF2\u7EA6\u9762\u300D\uFF09"
		            ).then(() => {
		              setAt("");
		              setCommute("");
		            }),
		            children: "\u65B0\u589E"
		          }
		        )
		      ] })
		    ] }),
		    data === null ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u9762\u8BD5\u2026" }) : data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u9762\u8BD5\u5B89\u6392\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "jh-interviews", children: data.items.map((interview) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
		      "li",
		      {
		        className: `jh-interview${interview.conflicts.length > 0 ? " jh-interview-conflict" : ""}`,
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-message-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: interview.at.slice(0, 16).replace("T", " ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-muted", children: [
		              INTERVIEW_KIND_LABEL[interview.kind],
		              " \xB7 \u7B2C ",
		              interview.round,
		              " \u8F6E \xB7",
		              " ",
		              INTERVIEW_STATE_LABEL[interview.state]
		            ] }),
		            interview.jobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("button", { type: "button", className: "jh-link", onClick: () => props.onSelectJob(interview.jobId), children: [
		              interview.companyName ?? "",
		              " ",
		              interview.jobTitle ?? ""
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-muted", children: interview.hoursUntil >= 0 ? `${interview.hoursUntil} \u5C0F\u65F6\u540E` : "\u5DF2\u8FC7" })
		          ] }),
		          interview.conflicts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-warn", children: [
		            "\u26A0 \u4E0E\u9762\u8BD5 #",
		            interview.conflicts.join("\u3001#"),
		            " \u65F6\u95F4\u51B2\u7A81"
		          ] }) : null,
		          interview.kind === "onsite" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: interview.commuteMin === null ? '\u73B0\u573A\u9762\u8BD5\u4F46\u6CA1\u586B\u901A\u52E4\u65F6\u957F \u2014\u2014 \u5EFA\u8BAE\u8865\u4E0A\uFF0C\u5426\u5219"\u522B\u8FDF\u5230"\u5C31\u662F\u7A7A\u8BDD\u3002' : `\u5355\u7A0B\u7EA6 ${interview.commuteMin} \u5206\u949F\uFF0C\u5EFA\u8BAE\u63D0\u524D ${interview.commuteMin + 30} \u5206\u949F\u51FA\u53D1\u3002` }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-detail-actions", children: [
		            ["confirmed", "done", "cancelled", "rescheduled"].map((state) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: busy,
		                onClick: () => void run(
		                  async () => await setInterviewState(
		                    interview.id,
		                    state,
		                    // 改期必须显式确认（会影响别人的日程）
		                    state === "rescheduled"
		                  ),
		                  `\u5DF2\u6807\u8BB0\u4E3A\u300C${INTERVIEW_STATE_LABEL[state]}\u300D`
		                ),
		                children: INTERVIEW_STATE_LABEL[state]
		              },
		              state
		            )),
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                onClick: () => setPrepId(prepId === interview.id ? null : interview.id),
		                children: prepId === interview.id ? "\u6536\u8D77\u51C6\u5907\u5305" : "\u51C6\u5907\u5305"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: busy,
		                onClick: () => void run(async () => await deleteInterview(interview.id), "\u5DF2\u5220\u9664"),
		                children: "\u5220\u9664"
		              }
		            )
		          ] }),
		          prepId === interview.id ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(PrepPanel, { id: interview.id }) : null
		        ]
		      },
		      interview.id
		    )) })
		  ] });
		}
		function PrepPanel(props) {
		  const prep = useAsync((signal) => fetchInterviewPrep(props.id, signal), [props.id]);
		  if (prep.state.status !== "ok") return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u51C6\u5907\u2026" });
		  const data = prep.state.data;
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: data.commute.advice }),
		    data.matchedSkills.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-muted", children: [
		      "\u4F60\u6709\u7684\uFF1A",
		      data.matchedSkills.join("\u3001")
		    ] }) : null,
		    data.missingSkills.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-warn", children: [
		      "\u4F1A\u88AB\u8FFD\u95EE\u4F46\u4F60\u7B80\u5386\u91CC\u6CA1\u6709\u7684\uFF1A",
		      data.missingSkills.slice(0, 10).join("\u3001"),
		      ' \u2014\u2014 \u5982\u5B9E\u8BF4"\u6CA1\u7528\u8FC7\uFF0C\u4F46\u6211\u77E5\u9053\u5B83\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898"\uFF0C\u4E0D\u8981\u786C\u626F\u3002'
		    ] }) : null,
		    data.companyFlags.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-warn", children: [
		      "\u516C\u53F8\u98CE\u9669\uFF1A",
		      data.companyFlags.join("\uFF1B")
		    ] }) : null,
		    data.questionNotes.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u9519\u9898\u672C\uFF08\u6309\u88AB\u95EE\u6B21\u6570\uFF09\uFF1A" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "jh-tailor-notes", children: data.questionNotes.slice(0, 5).map((note) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
		        "\xB7 ",
		        note.question,
		        "\uFF08",
		        note.times,
		        " \u6B21\uFF09"
		      ] }, note.id)) })
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "jh-tailor-notes", children: data.checklist.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
		      "\xB7 ",
		      item
		    ] }, String(index))) }),
		    data.notes.map((note, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-muted", children: [
		      "\u6CE8\u610F\uFF1A",
		      note
		    ] }, String(index)))
		  ] });
		}

		// src/client/screens/pipeline.tsx
		var import_react8 = require("react");
		var import_jsx_runtime8 = require("react/jsx-runtime");
		function PipelineScreen(props) {
		  const board = useAsync((signal) => fetchBoard(signal), [props.revision]);
		  const followUps = useAsync((signal) => fetchFollowUps(signal), [props.revision]);
		  const [busy, setBusy] = (0, import_react8.useState)(null);
		  const [error, setError] = (0, import_react8.useState)(null);
		  const [openJobId, setOpenJobId] = (0, import_react8.useState)(null);
		  const apps = useAsync(
		    (signal) => fetchApplications(openJobId === null ? {} : { jobId: openJobId }, signal),
		    [openJobId, props.revision]
		  );
		  const run = (0, import_react8.useCallback)(
		    async (id, fn) => {
		      setBusy(id);
		      setError(null);
		      try {
		        await fn();
		        props.onChanged();
		      } catch (caught) {
		        setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught));
		      } finally {
		        setBusy(null);
		      }
		    },
		    [props]
		  );
		  const move = (card) => {
		    const order = ["sent", "viewed", "interviewing", "interviewed", "offer"];
		    const index = order.indexOf(card.stage);
		    if (index < 0 || index >= order.length - 1) return;
		    const to = order[index + 1];
		    if (to === void 0) return;
		    void run(card.applicationId, async () => await advanceApplication({ applicationId: card.applicationId, to }));
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h2", { className: "jh-card-title", children: "\u6295\u9012\u6D41\u6C34\u7EBF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-muted", children: "\u6BCF\u4E00\u6B21\u6295\u9012\u90FD\u8BB0\u4E0B\u4E86\u5F53\u65F6\u7528\u7684\u7B80\u5386\u7248\u672C\u4E0E\u6E20\u9053 \u2014\u2014 \u5F52\u56E0\u5206\u6790\u9760\u7684\u5C31\u662F\u5B83\u3002" })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-error", children: error }),
		    board.state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u6D41\u6C34\u7EBF\u2026" }),
		    board.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-error", children: board.state.message }),
		    board.state.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-muted", children: [
		        "\u5171 ",
		        board.state.data.total,
		        " \u6761\u6295\u9012",
		        board.state.data.staleCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("i", { className: "jh-warn", children: [
		          " \xB7 ",
		          board.state.data.staleCount,
		          " \u6761\u5361\u4E86 21 \u5929\u4EE5\u4E0A"
		        ] }) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "jh-board", children: board.state.data.columns.map((column) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "jh-board-col", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("header", { className: "jh-board-head", children: [
		          APPLICATION_STAGE_LABEL[column.stage],
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-board-count", children: column.cards.length })
		        ] }),
		        column.cards.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted jh-board-empty", children: "\u2014" }) : column.cards.map((card) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("article", { className: "jh-board-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-board-title",
		              onClick: () => props.onSelectJob(card.jobId),
		              title: "\u6253\u5F00\u5C97\u4F4D\u8BE6\u60C5",
		              children: card.jobTitle ?? `\u5C97\u4F4D #${String(card.jobId)}`
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "jh-muted jh-board-meta", children: [
		            card.companyName ?? "\u672A\u77E5\u516C\u53F8",
		            " \xB7 ",
		            APPLICATION_CHANNEL_LABEL[card.channel],
		            card.resumeId === null ? "" : ` \xB7 \u7B80\u5386 #${String(card.resumeId)}`
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: `jh-board-age${card.daysSinceStage >= 21 ? " jh-warn" : ""}`, children: [
		            "\u5361\u4E86 ",
		            card.daysSinceStage,
		            " \u5929"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-board-actions", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: busy !== null,
		                onClick: () => move(card),
		                children: "\u63A8\u8FDB"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: busy !== null,
		                onClick: () => setOpenJobId(card.jobId),
		                children: "\u8DDF\u8FDB\u8BB0\u5F55"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: busy !== null,
		                onClick: () => void run(
		                  card.applicationId,
		                  async () => await advanceApplication({ applicationId: card.applicationId, to: "rejected" })
		                ),
		                children: "\u5DF2\u62D2\u7EDD"
		              }
		            )
		          ] })
		        ] }, card.applicationId))
		      ] }, column.stage)) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: "jh-card-title", children: "\u5F85\u8DDF\u8FDB" }),
		    followUps.state.status === "ok" && followUps.state.data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-ok", children: "\u6CA1\u6709\u9700\u8981\u8DDF\u8FDB\u7684 \u2014\u2014 \u8981\u4E48\u90FD\u5728\u63A8\u8FDB\uFF0C\u8981\u4E48\u8FD8\u6CA1\u6253\u62DB\u547C\u3002" }) : null,
		    followUps.state.status === "ok" && followUps.state.data.items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "jh-followups", children: followUps.state.data.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(FollowUpRow, { item, onOpen: props.onSelectJob }, `${String(item.jobId)}-${item.kind}`)) }) : null,
		    openJobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-row-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("h3", { className: "jh-card-title", children: [
		          "\u5C97\u4F4D #",
		          openJobId,
		          " \u7684\u6295\u9012\u8BB0\u5F55"
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => setOpenJobId(null), children: "\u6536\u8D77" }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void run(0, async () => await createApplication({ jobId: openJobId, confirm: true })),
		            children: "\u8BB0\u4E00\u6B21\u6295\u9012"
		          }
		        )
		      ] }),
		      apps.state.status !== "ok" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u2026" }) : apps.state.data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u8FD9\u4E2A\u5C97\u4F4D\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" }) : apps.state.data.items.map((application) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-muted", children: [
		          "#",
		          application.id,
		          " \xB7 ",
		          APPLICATION_STAGE_LABEL[application.stage],
		          " \xB7",
		          " ",
		          APPLICATION_CHANNEL_LABEL[application.channel],
		          " \xB7 \u7B80\u5386 #",
		          String(application.resumeId ?? "\u2014"),
		          " \xB7",
		          " ",
		          application.sentAt.slice(0, 16).replace("T", " ")
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "jh-tailor-notes", children: application.events.map((event) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { children: [
		          "\xB7 ",
		          event.at.slice(0, 16).replace("T", " "),
		          " ",
		          event.fromStage === null ? `\u521B\u5EFA\u4E3A\u300C${APPLICATION_STAGE_LABEL[event.toStage] ?? event.toStage}\u300D` : `${APPLICATION_STAGE_LABEL[event.fromStage] ?? event.fromStage} \u2192 ${APPLICATION_STAGE_LABEL[event.toStage] ?? event.toStage}`,
		          "\uFF08",
		          event.source === "auto" ? "\u81EA\u52A8\u8BC6\u522B" : event.source === "model" ? "\u6A21\u578B" : "\u4EBA\u5DE5",
		          "\uFF09",
		          event.note === null ? "" : `\uFF5C${event.note}`
		        ] }, event.id)) })
		      ] }, application.id))
		    ] })
		  ] });
		}
		function FollowUpRow(props) {
		  const { item } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { className: `jh-followup jh-followup-${item.kind}`, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { type: "button", className: "jh-link", onClick: () => props.onOpen(item.jobId), children: [
		      item.companyName ?? "",
		      " ",
		      item.jobTitle ?? `\u5C97\u4F4D #${String(item.jobId)}`
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: item.message }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: item.kind === "unread-timeout" ? "jh-muted" : "jh-warn", children: item.advice })
		  ] });
		}
		function BoardScreen(props) {
		  const funnel = useAsync((signal) => fetchFunnel(signal), [props.revision]);
		  const attribution = useAsync((signal) => fetchAttribution(signal), [props.revision]);
		  const [city, setCity] = (0, import_react8.useState)("");
		  const [keyword, setKeyword] = (0, import_react8.useState)("");
		  const salary = useAsync((signal) => fetchSalaryBand({ city, q: keyword }, signal), [props.revision, city, keyword]);
		  const funnelData = funnel.state.status === "ok" ? funnel.state.data : null;
		  const attributionData = attribution.state.status === "ok" ? attribution.state.data : null;
		  const salaryData = salary.state.status === "ok" ? salary.state.data : null;
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h2", { className: "jh-card-title", children: "\u6570\u636E\u770B\u677F" }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: '\u6837\u672C\u91CF\u5C0F\u7684\u65F6\u5019\u4E0D\u7ED9\u7ED3\u8BBA \u2014\u2014 \u6295\u4E86 3 \u4E2A\u5C97\u4F4D\u7B97\u51FA\u6765\u7684"\u56DE\u590D\u7387 100%"\u662F\u566A\u58F0\uFF0C\u7167\u7740\u5B83\u6539\u7B56\u7565\u4F1A\u66F4\u7CDF\u3002' }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: "jh-card-title", children: "\u6F0F\u6597" }),
		    funnelData === null ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "jh-funnel", children: funnelData.steps.map((step, index) => {
		        const previous = index === 0 ? void 0 : funnelData.steps[index - 1];
		        const boundary = previous !== void 0 && previous.population !== step.population;
		        return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { className: boundary ? "jh-funnel-boundary" : void 0, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-funnel-label", children: step.label }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "span",
		            {
		              className: "jh-funnel-bar",
		              style: {
		                width: `${String(funnelWidth(step.count, funnelData.steps[0]?.count ?? 0))}%`
		              }
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-funnel-count", children: step.count }),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-muted jh-funnel-rate", children: step.rate === null ? "\u2014" : `${(step.rate * 100).toFixed(0)}%` })
		        ] }, step.key);
		      }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: funnelData.note })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: "jh-card-title", children: "\u5F52\u56E0" }),
		    attributionData !== null ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { className: "jh-card-title", children: "\u6309\u6E20\u9053" }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AttributionTable, { rows: attributionData.byChannel })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h4", { className: "jh-card-title", children: "\u6309\u7B80\u5386\u7248\u672C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AttributionTable, { rows: attributionData.byResume }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: attributionData.note })
		      ] })
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: "jh-card-title", children: "\u85AA\u8D44\u5206\u4F4D" }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            placeholder: "\u57CE\u5E02\uFF08\u5982 \u6DF1\u5733\uFF09",
		            value: city,
		            onChange: (event) => setCity(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            placeholder: "\u5173\u952E\u8BCD\uFF08\u5982 Java\uFF09",
		            value: keyword,
		            onChange: (event) => setKeyword(event.target.value)
		          }
		        )
		      ] }),
		      salary.state.status === "ok" ? salary.state.data.count === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u8FD9\u4E2A\u8303\u56F4\u91CC\u6CA1\u6709\u5E26\u85AA\u8D44\u4E0B\u9650\u7684\u5C97\u4F4D\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-muted", children: [
		        salary.state.data.scope,
		        " \xB7 \u6837\u672C ",
		        salary.state.data.count,
		        " \u6761\uFF08\u53EA\u7EDF\u8BA1\u85AA\u8D44\u4E0B\u9650\uFF09\uFF5C \u6700\u4F4E",
		        " ",
		        salary.state.data.min,
		        " \xB7 P25 ",
		        salary.state.data.p25,
		        " \xB7 \u4E2D\u4F4D ",
		        salary.state.data.median,
		        " \xB7 P75",
		        " ",
		        salary.state.data.p75,
		        " \xB7 \u6700\u9AD8 ",
		        salary.state.data.max
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" })
		    ] })
		  ] });
		}
		function funnelWidth(count, top) {
		  if (top <= 0) return 0;
		  return Math.max(2, Math.round(count / top * 100));
		}
		function AttributionTable(props) {
		  if (props.rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" });
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("table", { className: "jh-table", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("tr", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("th", { children: "\u5206\u7EC4" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("th", { children: "\u6295\u9012" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("th", { children: "\u5DF2\u56DE\u590D" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("th", { children: "\u9762\u8BD5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("th", { children: "Offer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("th", { children: "\u56DE\u590D\u7387" })
		    ] }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("tbody", { children: props.rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("tr", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("td", { children: row.label }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("td", { children: row.total }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("td", { children: row.replied }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("td", { children: row.interviewed }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("td", { children: row.offered }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("td", { children: [
		        (row.replyRate * 100).toFixed(0),
		        "%"
		      ] })
		    ] }, row.key)) })
		  ] });
		}

		// src/client/screens/resumes.tsx
		var import_react9 = require("react");

		// src/shared/resume.ts
		function emptyResumeContent(direction = "") {
		  return {
		    basics: { name: "", title: direction },
		    summary: "",
		    skills: [],
		    experiences: [],
		    projects: [],
		    education: [],
		    extras: []
		  };
		}

		// src/client/screens/resumes.tsx
		var import_jsx_runtime9 = require("react/jsx-runtime");
		function ResumesScreen(props) {
		  const list = useAsync((signal) => fetchResumes(signal), [props.revision]);
		  const [selected, setSelected] = (0, import_react9.useState)(null);
		  const [creating, setCreating] = (0, import_react9.useState)(false);
		  const items = list.state.status === "ok" ? list.state.data.items : [];
		  (0, import_react9.useEffect)(() => {
		    if (selected !== null || items.length === 0) return;
		    setSelected((items.find((item) => item.isDefault) ?? items[0])?.id ?? null);
		  }, [items, selected]);
		  const onCreate = (0, import_react9.useCallback)(async () => {
		    setCreating(true);
		    try {
		      const created = await createResume({
		        name: "\u65B0\u7B80\u5386",
		        direction: "",
		        content: emptyResumeContent()
		      });
		      setSelected(created.id);
		      props.onChanged();
		    } finally {
		      setCreating(false);
		    }
		  }, [props]);
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { className: "jh-card-title", children: "\u7B80\u5386\u4E2D\u5FC3" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-muted", children: "\u6309\u65B9\u5411\u7EF4\u62A4 2\u20133 \u7248\u5C31\u591F\u4E86 \u2014\u2014 \u6BCF\u6295\u4E00\u4E2A\u5C97\u4F4D\u6539\u4E00\u6B21\u7B80\u5386\uFF0C\u9762\u8BD5\u65F6\u53CD\u800C\u8BB2\u4E0D\u4E00\u81F4\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "jh-btn", disabled: creating, onClick: () => void onCreate(), children: creating ? "\u65B0\u5EFA\u4E2D\u2026" : "\u65B0\u5EFA\u7248\u672C" })
		    ] }),
		    list.state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u7B80\u5386\u2026" }),
		    list.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-error", children: list.state.message }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "jh-btn", onClick: list.reload, children: "\u91CD\u8BD5" })
		    ] }),
		    list.state.status === "ok" && items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "jh-card", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u7B80\u5386\u3002\u5EFA\u4E00\u7248\u4E4B\u540E\uFF0C\u9644\u4EF6\uFF08PDF / Word\uFF09\u4E0E\u5C97\u4F4D\u5B9A\u5236\u90FD\u4F1A\u56F4\u7ED5\u5B83\u5DE5\u4F5C\u3002" }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-resume-layout", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "jh-resume-list", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		        "button",
		        {
		          type: "button",
		          className: `jh-resume-item${selected === item.id ? " jh-resume-item-active" : ""}`,
		          onClick: () => setSelected(item.id),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "jh-resume-name", children: [
		              item.name,
		              item.isDefault ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("i", { className: "jh-badge-inline", children: "\u542F\u7528\u4E2D" }) : null
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "jh-muted jh-resume-meta", children: [
		              item.direction || "\u672A\u586B\u65B9\u5411",
		              " \xB7 ",
		              RESUME_LANGUAGE_LABEL[item.language],
		              " \xB7",
		              " ",
		              RESUME_STATE_LABEL[item.state]
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "jh-muted jh-resume-meta", children: [
		              "\u6280\u80FD ",
		              item.counts.skills,
		              " \xB7 \u7ECF\u5386 ",
		              item.counts.experiences,
		              " \xB7 \u9879\u76EE ",
		              item.counts.projects,
		              " \xB7 \u9644\u4EF6",
		              " ",
		              item.counts.files,
		              item.issues > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("i", { className: "jh-warn", children: [
		                " \xB7 \u4F53\u68C0 ",
		                item.issues,
		                " \u9879"
		              ] }) : null
		            ] })
		          ]
		        }
		      ) }, item.id)) }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "jh-resume-detail", children: selected === null ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u9009\u5DE6\u8FB9\u4E00\u7248\u7B80\u5386\u5F00\u59CB\u7F16\u8F91\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        ResumeEditor,
		        {
		          id: selected,
		          onChanged: props.onChanged,
		          onDeleted: () => {
		            setSelected(null);
		            props.onChanged();
		          }
		        },
		        `${String(selected)}-${String(props.revision)}`
		      ) })
		    ] })
		  ] });
		}
		function ResumeEditor(props) {
		  const detail = useAsync((signal) => fetchResume(props.id, signal), [props.id]);
		  const [draft, setDraft] = (0, import_react9.useState)(null);
		  const [busy, setBusy] = (0, import_react9.useState)(null);
		  const [error, setError] = (0, import_react9.useState)(null);
		  const [notice, setNotice] = (0, import_react9.useState)(null);
		  const [template, setTemplate] = (0, import_react9.useState)("concise");
		  (0, import_react9.useEffect)(() => {
		    if (detail.state.status === "ok") setDraft(detail.state.data);
		  }, [detail.state]);
		  const issues = detail.state.status === "ok" ? detail.state.data.issues : [];
		  const run = (0, import_react9.useCallback)(
		    async (label, fn, done) => {
		      setBusy(label);
		      setError(null);
		      setNotice(null);
		      try {
		        const result = await fn();
		        setNotice(done === void 0 ? "\u5DF2\u5B8C\u6210" : done(result));
		        props.onChanged();
		      } catch (caught) {
		        setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught));
		      } finally {
		        setBusy(null);
		      }
		    },
		    [props]
		  );
		  const patchMeta = (patch) => {
		    void run("\u4FDD\u5B58", async () => await updateResume(props.id, patch), () => "\u5DF2\u4FDD\u5B58");
		  };
		  const content = draft?.content ?? null;
		  const skillsText = (0, import_react9.useMemo)(
		    () => content === null ? "" : content.skills.map((skill) => skill.name).join("\u3001"),
		    [content]
		  );
		  const highlightsText = (0, import_react9.useMemo)(
		    () => content === null ? "" : content.experiences.map((experience) => `## ${experience.company}\uFF5C${experience.title}
		${experience.highlights.join("\n")}`).join("\n\n"),
		    [content]
		  );
		  if (draft === null || content === null) {
		    return detail.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-error", children: detail.state.message }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u2026" });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-resume-editor", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-detail-actions", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn",
		          disabled: busy !== null,
		          onClick: () => void run("\u5BFC\u51FA PDF", async () => await exportResume(props.id, { format: "pdf", template }), () => "PDF \u5DF2\u751F\u6210\uFF0C\u4E0B\u9762\u53EF\u4EE5\u9884\u89C8"),
		          children: "\u5BFC\u51FA PDF"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn",
		          disabled: busy !== null,
		          onClick: () => void run("\u5BFC\u51FA Word", async () => await exportResume(props.id, { format: "docx", template }), () => "Word \u5DF2\u751F\u6210"),
		          children: "\u5BFC\u51FA Word"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        "select",
		        {
		          className: "jh-select",
		          value: template,
		          onChange: (event) => setTemplate(event.target.value === "professional" ? "professional" : "concise"),
		          children: RESUME_TEMPLATES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: item, children: RESUME_TEMPLATE_LABEL[item] }, item))
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-spacer" }),
		      draft.isDefault ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-badge", children: "\u5F53\u524D\u542F\u7528" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn",
		          disabled: busy !== null,
		          onClick: () => void run("\u8BBE\u4E3A\u542F\u7528", async () => await setDefaultResume(props.id), () => "\u5DF2\u8BBE\u4E3A\u542F\u7528\u7248\u672C"),
		          children: "\u8BBE\u4E3A\u542F\u7528"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy !== null,
		          onClick: () => void run("\u590D\u5236", async () => await duplicateResume(props.id), () => "\u5DF2\u590D\u5236\u4E00\u4EFD\uFF0C\u53EF\u5728\u5DE6\u4FA7\u9009\u62E9"),
		          children: "\u590D\u5236"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy !== null,
		          onClick: () => void run("\u5220\u9664", async () => await deleteResume(props.id), () => "\u5DF2\u5220\u9664"),
		          children: "\u5220\u9664"
		        }
		      )
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-ok", children: notice }),
		    busy === null ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-muted", children: [
		      busy,
		      "\u2026"
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-two-col", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u7248\u672C\u540D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              defaultValue: draft.name,
		              onBlur: (event) => {
		                const value = event.target.value.trim();
		                if (value !== "" && value !== draft.name) patchMeta({ name: value });
		              }
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u65B9\u5411" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              defaultValue: draft.direction,
		              onBlur: (event) => {
		                const value = event.target.value.trim();
		                if (value !== draft.direction) patchMeta({ direction: value });
		              }
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u8BED\u8A00" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		            "select",
		            {
		              className: "jh-select",
		              value: draft.language,
		              onChange: (event) => patchMeta({ language: event.target.value }),
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: "zh", children: "\u4E2D\u6587" }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: "en", children: "\u82F1\u6587\uFF08\u6D77\u5916\u65B9\u5411**\u4E0D\u505A\u673A\u7FFB**\uFF0C\u72EC\u7ACB\u7EF4\u62A4\uFF09" })
		              ]
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u59D3\u540D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              defaultValue: content.basics.name,
		              onBlur: (event) => setDraft({ ...draft, content: { ...content, basics: { ...content.basics, name: event.target.value } } })
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u76EE\u6807\u5C97\u4F4D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              defaultValue: content.basics.title,
		              onBlur: (event) => setDraft({ ...draft, content: { ...content, basics: { ...content.basics, title: event.target.value } } })
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u57CE\u5E02 / \u5E74\u9650" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "jh-inline", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		              "input",
		              {
		                className: "jh-input",
		                defaultValue: content.basics.city ?? "",
		                placeholder: "\u6DF1\u5733",
		                onBlur: (event) => setDraft({
		                  ...draft,
		                  content: { ...content, basics: { ...content.basics, city: event.target.value || void 0 } }
		                })
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		              "input",
		              {
		                className: "jh-input jh-input-narrow",
		                type: "number",
		                defaultValue: content.basics.years ?? "",
		                placeholder: "5",
		                onBlur: (event) => setDraft({
		                  ...draft,
		                  content: {
		                    ...content,
		                    basics: {
		                      ...content.basics,
		                      years: event.target.value === "" ? void 0 : Number(event.target.value)
		                    }
		                  }
		                })
		              }
		            )
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u4E2A\u4EBA\u7B80\u4ECB" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		            "textarea",
		            {
		              className: "jh-textarea",
		              rows: 4,
		              defaultValue: content.summary,
		              onBlur: (event) => setDraft({ ...draft, content: { ...content, summary: event.target.value } })
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u6280\u80FD\uFF08\u7528\u300C\u3001\u300D\u5206\u9694\uFF09" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		            "textarea",
		            {
		              className: "jh-textarea",
		              rows: 3,
		              defaultValue: skillsText,
		              onBlur: (event) => setDraft({
		                ...draft,
		                content: {
		                  ...content,
		                  skills: event.target.value.split(/[、,，\n]/).map((name2) => name2.trim()).filter((name2) => name2 !== "").map((name2) => content.skills.find((skill) => skill.name === name2) ?? { name: name2 })
		                }
		              })
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u5DE5\u4F5C\u7ECF\u5386\uFF08\u6BCF\u6BB5\u4EE5 `## \u516C\u53F8\uFF5C\u804C\u4F4D` \u5F00\u5934\uFF0C\u4E4B\u540E\u6BCF\u884C\u4E00\u6761\u6210\u679C\uFF09" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		            "textarea",
		            {
		              className: "jh-textarea jh-textarea-tall",
		              rows: 12,
		              defaultValue: highlightsText,
		              onBlur: (event) => {
		                const experiences = parseExperienceBlocks(event.target.value, content.experiences);
		                setDraft({ ...draft, content: { ...content, experiences } });
		              }
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn",
		            disabled: busy !== null,
		            onClick: () => void run(
		              "\u4FDD\u5B58\u5185\u5BB9",
		              async () => await updateResume(props.id, { content: draft.content }),
		              (result) => {
		                const resume = result;
		                setDraft(resume);
		                return `\u5185\u5BB9\u5DF2\u4FDD\u5B58\uFF08rev ${String(resume.rev)}\uFF09\u2014\u2014 \u4E4B\u524D\u7684\u5339\u914D\u5206\u5DF2\u6807\u8BB0\u4E3A\u8FC7\u671F`;
		              }
		            ),
		            children: "\u4FDD\u5B58\u5185\u5BB9"
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u4F53\u68C0" }),
		        issues.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-ok", children: "\u89C4\u5219\u4F53\u68C0\u6CA1\u6709\u53D1\u73B0\u95EE\u9898\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "jh-issues", children: issues.map((issue, index) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { className: issue.level === "error" ? "jh-error" : "jh-warn", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: issue.level === "error" ? "\u5FC5\u6539" : "\u5EFA\u8BAE" }),
		          " ",
		          issue.message
		        ] }, `${issue.at}-${String(index)}`)) }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u9884\u89C8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		          "iframe",
		          {
		            className: "jh-preview",
		            title: "\u7B80\u5386\u9884\u89C8",
		            src: previewUrl(props.id, template),
		            sandbox: ""
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u9644\u4EF6" }),
		        draft.files.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u751F\u6210\u9644\u4EF6\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "jh-files", children: draft.files.map((file) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("a", { className: "jh-link", href: fileUrl(file.id), target: "_blank", rel: "noreferrer", children: file.fileName }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "jh-muted", children: [
		            " ",
		            file.format,
		            " \xB7 ",
		            (file.bytes / 1024).toFixed(0),
		            " KB \xB7 ",
		            file.createdAt.slice(0, 16).replace("T", " ")
		          ] })
		        ] }, file.id)) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-muted jh-footnote", children: [
		      "\u9644\u4EF6\u53EA\u7531\u4F60\u663E\u5F0F\u5220\u9664 \u2014\u2014 \u7B80\u5386\u662F\u8D44\u4EA7\uFF0C\u4EFB\u4F55\u81EA\u52A8\u6E05\u7406\u90FD\u4E0D\u4F1A\u78B0\u5B83\uFF08",
		      PLUGIN_ID,
		      "\uFF09\u3002"
		    ] })
		  ] });
		}
		function parseExperienceBlocks(text, previous) {
		  const blocks = text.split(/^##\s*/m).map((block) => block.trim()).filter((block) => block !== "");
		  return blocks.map((block, index) => {
		    const [headerLine = "", ...rest] = block.split("\n");
		    const [company = "", title = ""] = headerLine.split("\uFF5C").map((part) => part.trim());
		    const highlights = rest.map((line) => line.trim()).filter((line) => line !== "");
		    const prior = previous[index];
		    return {
		      company: company === "" ? prior?.company ?? "" : company,
		      title: title === "" ? prior?.title ?? "" : title,
		      highlights,
		      ...prior?.start === void 0 ? {} : { start: prior.start },
		      ...prior?.end === void 0 ? {} : { end: prior.end },
		      ...prior?.city === void 0 ? {} : { city: prior.city },
		      ...prior?.stack === void 0 ? {} : { stack: prior.stack }
		    };
		  });
		}

		// src/client/screens/today.tsx
		var import_react10 = require("react");
		var import_jsx_runtime10 = require("react/jsx-runtime");
		var IDLE = { running: false, tone: "ok", message: null };
		function planIdOf(todo) {
		  if (todo.detail === null || typeof todo.detail !== "object") return null;
		  const value = todo.detail.planId;
		  return typeof value === "number" ? value : null;
		}
		function TodayScreen(props) {
		  const today = useAsync((signal) => fetchToday(signal), [props.revision]);
		  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision]);
		  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision]);
		  const [feedback, setFeedback] = (0, import_react10.useState)(IDLE);
		  const report = (error) => {
		    setFeedback({
		      running: false,
		      tone: "error",
		      message: error instanceof ApiError ? error.display : String(error)
		    });
		  };
		  const reloadAll = () => {
		    today.reload();
		    scheduler.reload();
		    platforms.reload();
		  };
		  const act = async (message, run) => {
		    setFeedback({ running: true, tone: "ok", message });
		    try {
		      const done = await run();
		      setFeedback({ running: false, tone: "ok", message: done });
		      reloadAll();
		    } catch (error) {
		      report(error);
		    }
		  };
		  const startCrawl = () => act("\u6B63\u5728\u6293\u53D6\u2026\uFF08\u4F1A\u6253\u5F00\u4E00\u4E2A\u6D4F\u89C8\u5668\u7A97\u53E3\uFF09", async () => {
		    const summary = await runCrawl({ platformId: "51job", criteria: { keyword: "Java", city: "\u6DF1\u5733" } });
		    const run = summary.run;
		    return `\u672C\u8F6E ${run.state}\uFF1A\u547D\u4E2D ${String(run.found)} \xB7 \u65B0\u589E ${String(run.inserted)} \xB7 \u66F4\u65B0 ${String(run.updated)} \xB7 \u9694\u79BB ${String(run.quarantined)}` + (run.errorCode === null ? "" : ` \xB7 ${run.errorCode}`);
		  });
		  const catchUp = (planId) => act("\u6B63\u5728\u8865\u8DD1\u9519\u8FC7\u7684\u8F6E\u6B21\u2026", async () => {
		    const summary = await runPlan(planId, true);
		    return `\u8865\u8DD1\u5B8C\u6210\uFF1A${summary.run.state} \xB7 \u65B0\u589E ${String(summary.run.inserted)}`;
		  });
		  const login = (platformId) => act("\u5DF2\u6253\u5F00\u767B\u5F55\u9875\uFF0C\u8BF7\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\u91CC\u5B8C\u6210\u767B\u5F55\uFF08\u6BCF 3 \u79D2\u68C0\u6D4B\u4E00\u6B21\uFF09", async () => {
		    const status = await startLogin(platformId);
		    return status.message ?? "\u767B\u5F55\u5F15\u5BFC\u5DF2\u542F\u52A8";
		  });
		  const data = today.state.status === "ok" ? today.state.data : null;
		  const sched = scheduler.state.status === "ok" ? scheduler.state.data : null;
		  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-screen", children: [
		    today.state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u4ECA\u65E5\u6982\u51B5\u2026" }),
		    today.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "jh-card-title", children: "\u8BFB\u4E0D\u5230\u4ECA\u65E5\u6982\u51B5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-error", children: today.state.message }),
		      today.state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-muted", children: today.state.hint }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "jh-btn", onClick: today.reload, children: "\u91CD\u8BD5" })
		    ] }),
		    data !== null && !data.dataReady && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "jh-card-title", children: "\u6570\u636E\u5C42\u672A\u5C31\u7EEA" }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-error", children: data.dataError ?? "\u672A\u77E5\u539F\u56E0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-muted", children: "\u63D2\u4EF6\u672C\u8EAB\u662F\u6302\u7740\u7684 \u2014\u2014 \u8FD9\u91CC\u5982\u5B9E\u62A5\u544A\u539F\u56E0\uFF0C\u800C\u4E0D\u662F\u8BA9\u754C\u9762\u9759\u9ED8\u53D8\u7A7A\u3002" })
		    ] }),
		    data !== null && data.offline && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "jh-card-title", children: "\u79BB\u7EBF\u6A21\u5F0F\u5DF2\u5F00\u542F" }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "jh-muted", children: [
		        "\u6293\u53D6\u4E0E\u767B\u5F55\u5F15\u5BFC\u5DF2\u88AB\u62D2\u7EDD \u2014\u2014 \u8FD9\u662F\u300C\u81EA\u52A8\u5316\u6D4B\u8BD5\u7EDD\u4E0D\u8BBF\u95EE\u771F\u5B9E\u62DB\u8058\u7AD9\u300D\u7684\u5F00\u5173\u5728\u8D77\u4F5C\u7528\u3002 \u53BB\u6389\u73AF\u5883\u53D8\u91CF ",
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: "DSH_JOB_HUNTER_NO_NETWORK" }),
		        " \u91CD\u542F\u5373\u53EF\u89E3\u9664\u3002"
		      ] })
		    ] }),
		    data !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-stats", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("button", { type: "button", className: "jh-stat", onClick: props.onGoJobs, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: data.newJobs24h }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "24 \u5C0F\u65F6\u65B0\u589E" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("button", { type: "button", className: "jh-stat", onClick: props.onGoJobs, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: data.jobCount }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u5C97\u4F4D\u603B\u6570" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: `jh-stat${data.pendingRepair > 0 ? " jh-stat-warn" : ""}`, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: data.pendingRepair }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u5F85\u4FEE\u590D\u8BB0\u5F55" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: `jh-stat${data.todos.some((todo) => todo.level === "urgent") ? " jh-stat-error" : ""}`, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: data.todos.length }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u5F85\u529E" })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "jh-card-title", children: "\u5F85\u529E" }),
		        data.todos.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u5F85\u529E\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { className: "jh-todos", children: data.todos.map((todo) => {
		          const planId = planIdOf(todo);
		          return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { className: `jh-todo jh-todo-${todo.level}`, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "jh-todo-level", children: todo.level }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-todo-body", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "jh-todo-title", children: todo.title }),
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-muted", children: [
		                todo.kind,
		                todo.ref === null ? "" : ` \xB7 ${todo.ref}`
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-todo-actions", children: [
		                todo.kind === "catch-up" && planId !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline",
		                    disabled: feedback.running,
		                    onClick: () => void catchUp(planId),
		                    children: "\u7ACB\u5373\u8865\u8DD1"
		                  }
		                ),
		                todo.kind === "login-required" && todo.ref !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline",
		                    disabled: feedback.running,
		                    onClick: () => void login(todo.ref),
		                    children: "\u53BB\u767B\u5F55"
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline",
		                    disabled: feedback.running,
		                    onClick: () => void act("\u5DF2\u5FFD\u7565", async () => {
		                      await closeTodo(todo.id);
		                      return "\u5DF2\u5FFD\u7565\u8FD9\u6761\u5F85\u529E";
		                    }),
		                    children: "\u5FFD\u7565"
		                  }
		                )
		              ] })
		            ] })
		          ] }, todo.id);
		        }) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "jh-card-title", children: "\u5B9A\u65F6\u6293\u53D6" }),
		        scheduler.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-error", children: scheduler.state.message }),
		        sched !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
		          sched.readOnly && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "jh-error", children: [
		            "\u672C\u5B9E\u4F8B\u53EA\u8BFB\uFF1A",
		            sched.readOnlyReason ?? "\u53E6\u4E00\u4E2A\u5B9E\u4F8B\u6B63\u5728\u8FD0\u884C"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("ul", { className: "jh-kv", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u4E0B\u6B21\u8FD0\u884C" }),
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: sched.nextRunAt ?? "\u2014" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u4E0A\u6B21\u8FD0\u884C" }),
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: sched.lastRunAt ?? "\u2014" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u8C03\u5EA6" }),
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: sched.scheduling ? sched.armed ? "\u5DF2\u6B66\u88C5" : "\u7B49\u5F85\u65B9\u6848\u542F\u7528" : "\u672A\u542F\u52A8" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u79DF\u7EA6" }),
		              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: sched.lease.held ? `\u672C\u5B9E\u4F8B\u6301\u6709\uFF08pid ${String(sched.lease.pid ?? "?")}\uFF09` : `\u4ED6\u4EBA\u6301\u6709\uFF08pid ${String(sched.lease.pid ?? "?")}\uFF09` })
		            ] })
		          ] }),
		          sched.plans.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u641C\u7D22\u65B9\u6848\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { className: "jh-list", children: sched.plans.map((plan) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: plan.name }),
		            " \xB7 ",
		            plan.platforms.join("/"),
		            " \xB7",
		            " ",
		            plan.schedule.enabled ? `${plan.schedule.weekdays.length === 0 ? "\u6BCF\u5929" : `\u5468${plan.schedule.weekdays.join(",")}`} ${String(plan.schedule.hour).padStart(2, "0")}:${String(plan.schedule.minute).padStart(2, "0")}` : "\u4E0D\u5B9A\u65F6",
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny",
		                disabled: feedback.running || sched.readOnly,
		                onClick: () => void act("\u6B63\u5728\u6309\u65B9\u6848\u6293\u53D6\u2026", async () => {
		                  const summary = await runPlan(plan.id);
		                  return `\u65B9\u6848\u300C${plan.name}\u300D\uFF1A${summary.run.state} \xB7 \u65B0\u589E ${String(summary.run.inserted)}`;
		                }),
		                children: "\u7ACB\u5373\u8FD0\u884C"
		              }
		            )
		          ] }, plan.id)) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn",
		            disabled: feedback.running || (sched?.readOnly ?? false),
		            onClick: () => void startCrawl(),
		            children: feedback.running ? "\u6267\u884C\u4E2D\u2026" : "\u6293\u53D6\u4E00\u6B21\uFF0851job \xB7 \u6DF1\u5733 Java\uFF09"
		          }
		        ),
		        feedback.message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: feedback.tone === "error" ? "jh-error" : "jh-muted", children: feedback.message })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "jh-card-title", children: "\u5E73\u53F0\u4E0E\u767B\u5F55" }),
		        platforms.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-error", children: platforms.state.message }),
		        platforms.state.status === "ok" && platforms.state.data.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6CE8\u518C\u5E73\u53F0\u3002" }),
		        platforms.state.status === "ok" && platforms.state.data.items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { className: "jh-list", children: platforms.state.data.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: item.id }),
		          " \xB7",
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { className: item.health === "healthy" ? "jh-ok" : "jh-error", children: item.health }),
		          " \xB7 ",
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: item.account.loggedIn ? "jh-ok" : "jh-warn", children: item.account.loggedIn ? "\u5DF2\u767B\u5F55" : "\u672A\u767B\u5F55" }),
		          " \xB7 ",
		          item.login.state === "running" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "jh-warn", children: "\u767B\u5F55\u68C0\u6D4B\u4E2D\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-tiny",
		              disabled: feedback.running,
		              onClick: () => void login(item.id),
		              children: "\u767B\u5F55"
		            }
		          ),
		          item.login.message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "jh-muted", children: item.login.message }),
		          item.account.hint === null ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "jh-muted", children: item.account.hint }),
		          item.healthReason === null ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "jh-muted", children: item.healthReason })
		        ] }, item.id)) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "jh-card-title", children: "\u6700\u8FD1\u4E00\u8F6E\u6293\u53D6" }),
		        data.lastCrawl === null ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6293\u8FC7\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("ul", { className: "jh-kv", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u72B6\u6001" }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { className: data.lastCrawl.state === "ok" ? "jh-ok" : "jh-warn", children: data.lastCrawl.state })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u5F00\u59CB" }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: data.lastCrawl.startedAt })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u547D\u4E2D" }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: data.lastCrawl.found })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u65B0\u589E / \u66F4\u65B0" }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { children: [
		              data.lastCrawl.inserted,
		              " / ",
		              data.lastCrawl.updated
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u9694\u79BB" }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: data.lastCrawl.quarantined })
		          ] }),
		          data.lastCrawl.errorCode === null ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u9519\u8BEF" }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "jh-error", children: [
		              data.lastCrawl.errorCode,
		              " \xB7 ",
		              data.lastCrawl.errorMsg
		            ] })
		          ] })
		        ] })
		      ] })
		    ] })
		  ] });
		}

		// src/client/use-event-stream.ts
		var import_react11 = require("react");
		function useEventStream(onHint) {
		  const [status, setStatus] = (0, import_react11.useState)("connecting");
		  const [lastEventAt, setLastEventAt] = (0, import_react11.useState)(null);
		  const hintRef = (0, import_react11.useRef)(onHint);
		  hintRef.current = onHint;
		  (0, import_react11.useEffect)(() => {
		    const source = new EventSource(`${ROUTE_PREFIX}/events`);
		    source.onopen = () => {
		      setStatus("open");
		    };
		    source.onerror = () => {
		      setStatus("closed");
		    };
		    source.onmessage = (event) => {
		      let parsed;
		      try {
		        parsed = JSON.parse(event.data);
		      } catch {
		        return;
		      }
		      if (parsed === null || typeof parsed !== "object") return;
		      const record = parsed;
		      const type = typeof record["type"] === "string" ? record["type"] : "unknown";
		      setLastEventAt(typeof record["at"] === "string" ? record["at"] : (/* @__PURE__ */ new Date()).toISOString());
		      hintRef.current(type);
		    };
		    const closeOnUnload = () => {
		      source.close();
		    };
		    window.addEventListener("beforeunload", closeOnUnload);
		    return () => {
		      window.removeEventListener("beforeunload", closeOnUnload);
		      source.close();
		    };
		  }, []);
		  return { status, lastEventAt };
		}

		// src/client/panel.tsx
		var import_jsx_runtime11 = require("react/jsx-runtime");
		var TABS = [
		  { key: "today", label: "\u4ECA\u65E5" },
		  { key: "jobs", label: "\u5C97\u4F4D\u5E93" },
		  { key: "pipeline", label: "\u6D41\u6C34\u7EBF" },
		  { key: "inbox", label: "\u6D88\u606F" },
		  { key: "interviews", label: "\u9762\u8BD5" },
		  { key: "campus", label: "\u6821\u62DB" },
		  { key: "board", label: "\u770B\u677F" },
		  { key: "resumes", label: "\u7B80\u5386\u4E2D\u5FC3" }
		];
		var STREAM_LABEL = {
		  open: "\u5B9E\u65F6\u5DF2\u8FDE\u63A5",
		  connecting: "\u5B9E\u65F6\u8FDE\u63A5\u4E2D",
		  closed: "\u5B9E\u65F6\u5DF2\u65AD\u5F00"
		};
		function JobHunterPanel() {
		  const [screen, setScreen] = (0, import_react12.useState)("today");
		  const [selected, setSelected] = (0, import_react12.useState)(null);
		  const [revision, setRevision] = (0, import_react12.useState)(0);
		  const timer = (0, import_react12.useRef)(null);
		  (0, import_react12.useEffect)(
		    () => () => {
		      if (timer.current !== null) window.clearTimeout(timer.current);
		    },
		    []
		  );
		  const onHint = (0, import_react12.useCallback)((type) => {
		    if (type === "resync") {
		      setRevision((value) => value + 1);
		      return;
		    }
		    if (timer.current !== null) window.clearTimeout(timer.current);
		    timer.current = window.setTimeout(() => {
		      timer.current = null;
		      setRevision((value) => value + 1);
		    }, 250);
		  }, []);
		  const stream = useEventStream(onHint);
		  (0, import_react12.useEffect)(() => {
		    const apply2 = (intent) => {
		      setScreen("jobs");
		      setSelected(intent.jobId);
		    };
		    const first = consumePanelIntent();
		    if (first !== null) apply2(first);
		    return subscribePanelIntent(apply2);
		  }, []);
		  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "jh-root", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("header", { className: "jh-topbar", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h1", { className: "jh-title", children: "\u6C42\u804C\u627E\u5DE5\u4F5C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "jh-badge", children: PHASE }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("nav", { className: "jh-tabs", children: TABS.map((tab) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		        "button",
		        {
		          type: "button",
		          className: `jh-tab${screen === tab.key ? " jh-tab-active" : ""}`,
		          onClick: () => {
		            setScreen(tab.key);
		            setSelected(null);
		          },
		          children: tab.label
		        },
		        tab.key
		      )) }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: `jh-live jh-live-${stream.status}`, title: PLUGIN_ID, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("i", { className: "jh-dot" }),
		        STREAM_LABEL[stream.status] ?? stream.status
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: backToConversation, children: "\u8FD4\u56DE\u5BF9\u8BDD\u533A" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "jh-body", children: screen === "today" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TodayScreen, { revision, onGoJobs: () => setScreen("jobs") }) : screen === "pipeline" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		      PipelineScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "inbox" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		      InboxScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "interviews" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		      InterviewsScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "campus" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(CampusScreen, { revision, onChanged: () => setRevision((value) => value + 1) }) : screen === "board" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(BoardScreen, { revision }) : screen === "resumes" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ResumesScreen, { revision, onChanged: () => setRevision((value) => value + 1) }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		      JobsScreen,
		      {
		        revision,
		        selected,
		        onSelect: setSelected,
		        onChanged: () => setRevision((value) => value + 1)
		      }
		    ) }),
		    screen === "jobs" || selected === null ? null : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		      JobDetailDrawer,
		      {
		        id: selected,
		        revision,
		        onClose: () => setSelected(null),
		        onChanged: () => setRevision((value) => value + 1)
		      }
		    )
		  ] });
		}

		// src/client/styles.ts
		function installStyles() {
		  for (const stale of document.querySelectorAll(`style[data-plugin="${PLUGIN_ID}"]`)) stale.remove();
		  const style = document.createElement("style");
		  style.setAttribute("data-plugin", PLUGIN_ID);
		  style.textContent = CSS;
		  document.head.appendChild(style);
		  return () => style.remove();
		}
		var CSS = `
		/* \u2500\u2500 \u4FA7\u680F\u5165\u53E3\u56FE\u6807 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   shell \u7684 .panelRow \u662F padding:7px 8px\u3001gap:8px\uFF0C\u800C .panelGlyph **\u6CA1\u6709\u5BBD\u5EA6**\uFF1A
		   glyph \u5360\u591A\u5BBD\u5B8C\u5168\u7531\u6211\u4EEC\u51B3\u5B9A\uFF0C\u6807\u7B7E\u7684\u8D77\u70B9\u56E0\u6B64\u4E5F\u8DDF\u7740\u6211\u4EEC\u8D70\u3002
		   \u540C\u6392\u7684\u793E\u533A\u63D2\u4EF6\uFF08task-board / skill-explorer\uFF09**\u6CA1\u7528\u69FD\u4F4D**\uFF0C\u662F\u624B\u63D2 DOM \u81EA\u5E26\u6837\u5F0F\uFF1A
		   padding:0 10px + 24px \u56FE\u6807\u76D2 + 18px svg \u2192
		     \u5B83\u4EEC\u7684\u6807\u7B7E\u8D77\u70B9 = 10 + 24 + 8 = 42px
		     \u6211\u4EEC\u82E5\u6309 shell \u7ED9\u7684 16px \u753B = 8 + 16 + 8 = 32px   \u2190 \u5B9E\u6D4B\u5DEE 10px\uFF0C\u5C31\u662F"\u4E0D\u5DE6\u5BF9\u9F50"
		   \u8FD9\u91CC\u628A\u76D2\u5B50\u56FA\u5B9A\u6210 24px\u3001\u56FE\u6807\u6309 18px \u753B\uFF0C\u518D\u5728\u5BBD\u4FA7\u680F\u8865 2px\uFF08shell \u7684 8px \u2192 \u5B83\u4EEC\u7684 10px\uFF09\uFF0C
		   \u4E8E\u662F\u4E24\u8FB9\u90FD\u662F 42px\uFF0C\u56FE\u6807\u4E5F\u843D\u5728\u540C\u4E00\u5217\uFF0813..31px\uFF09\u3002
		   \u6298\u53E0\u6001\uFF08size=18\uFF09**\u4E0D\u8865**\u90A3 2px\uFF1A\u90A3\u884C\u662F 36\xD736 \u5C45\u4E2D\uFF0C\u8865\u4E86\u4F1A\u504F\u5FC3\u3002
		   \u9AD8\u5EA6\u53D6 22px \u800C\u4E0D\u662F 24px\uFF1Ashell \u7684 .panelRow \u662F min-height:36px + \u4E0A\u4E0B padding 7px\uFF0C
		   \u5185\u5BB9\u8D85\u8FC7 22px \u5C31\u628A\u884C\u6491\u5230 38px\uFF0C\u800C\u90BB\u5C45\u662F\u5199\u6B7B\u7684 height:36px\uFF08\u5B9E\u6D4B 38 vs 36\uFF09\u3002
		   \u5BBD\u5EA6\u5FC5\u987B\u662F 24px\uFF08\u5BF9\u9F50\u6807\u7B7E\u5217\uFF09\uFF0C\u9AD8\u5EA6\u9000\u56DE 22px\uFF08\u5BF9\u9F50\u884C\u9AD8\uFF09\u2014\u2014 \u56FE\u6807\u4ECD\u7136\u5C45\u4E2D\uFF0C\u770B\u4E0D\u51FA\u6765\u3002 */
		.jh-entry-glyph{display:inline-flex;align-items:center;justify-content:center;flex:none;
		  width:24px;height:22px}
		.jh-entry-glyph[data-wide="1"]{margin-left:2px}
		.jh-entry-glyph svg{display:block}

		/* \u2500\u2500 \u5916\u58F3 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-root{box-sizing:border-box;display:flex;flex-direction:column;height:100%;position:relative;
		  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.7}
		.jh-topbar{display:flex;align-items:center;gap:10px;flex:0 0 auto;
		  padding:10px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);
		  background:var(--dsw-alias-bg-layer-1)}
		.jh-body{flex:1 1 auto;overflow:auto}
		.jh-spacer{flex:1 1 auto}
		.jh-title{font-size:15px;font-weight:600;margin:0}
		.jh-badge{font-size:11px;font-weight:600;letter-spacing:.03em;padding:1px 7px;border-radius:999px;
		  color:var(--dsw-alias-brand-text);background:var(--dsw-alias-state-business-tertiary)}

		.jh-tabs{display:flex;gap:2px;margin-left:8px}
		.jh-tab{border:0;background:transparent;cursor:pointer;font-size:13px;padding:4px 12px;border-radius:8px;
		  color:var(--dsw-alias-label-secondary)}
		.jh-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
		.jh-tab-active{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}

		.jh-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;
		  color:var(--dsw-alias-label-secondary)}
		.jh-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary);display:inline-block}
		.jh-live-open .jh-dot{background:var(--dsw-alias-state-success-primary)}
		.jh-live-closed .jh-dot{background:var(--dsw-alias-state-error-primary)}

		/* \u2500\u2500 \u5C4F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-screen{padding:16px 18px;max-width:1000px}
		.jh-card{max-width:1000px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
		  background:var(--dsw-alias-bg-layer-1);padding:14px 16px;margin:0 0 12px}
		.jh-card-tight{padding:12px 14px;margin:14px 0}
		.jh-card-title{font-size:13px;font-weight:600;margin:0 0 8px}
		.jh-muted{color:var(--dsw-alias-label-secondary);margin:0}
		.jh-ok{color:var(--dsw-alias-state-success-primary)}
		.jh-warn{color:var(--dsw-alias-state-warn-primary)}
		.jh-error{color:var(--dsw-alias-state-error-primary);margin:0}

		.jh-kv{list-style:none;margin:0 0 12px;padding:0;display:grid;
		  grid-template-columns:84px minmax(0,1fr);gap:6px 12px;font-size:13px}
		.jh-kv>li{display:contents}
		/* \u952E\u6D45\u3001\u503C\u6DF1\uFF1ALabel \u8D70 secondary(#61666b)\uFF0CValue \u8D70 primary \u5E76\u52A0\u534A\u6863\u5B57\u91CD \u2014\u2014
		   \u4E4B\u524D\u4E24\u8005\u989C\u8272\u51E0\u4E4E\u4E00\u6837\uFF0C\u773C\u775B\u6CA1\u6709\u843D\u70B9\u3002 */
		.jh-kv span:first-child{color:var(--dsw-alias-label-secondary);font-size:12.5px}
		.jh-kv span:last-child{color:var(--dsw-alias-label-primary);font-weight:500;
		  min-width:0;overflow-wrap:anywhere}
		.jh-kv code,.jh-list code{font-family:ui-monospace,Consolas,monospace;font-size:12px;
		  background:var(--dsw-alias-markdown-inline-code);padding:1px 5px;border-radius:4px}
		.jh-list{margin:0;padding-left:18px}
		.jh-list li{margin:2px 0}

		/* \u2500\u2500 \u63A7\u4EF6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5BF9\u6BD4\u5EA6\u57FA\u7EBF\uFF082026-09-17 \u4ECE\u4E3B\u9898\u91CC\u91CF\u51FA\u6765\u7684\uFF0C\u4E0D\u662F\u62CD\u8111\u888B\uFF09\uFF1A
		     border-l1 = #0000000a\uFF084% \u9ED1\uFF09\u2192 \u51E0\u4E4E\u770B\u4E0D\u89C1\uFF1Bl2 = 10% / l3 = 12% / l4 = 16%
		     bg-base \u4E0E bg-layer-1/-2/-3 **\u5168\u662F\u7EAF\u767D** \u2192 \u9760\u80CC\u666F\u5206\u4E0D\u51FA\u4EFB\u4F55\u5C42\u7EA7
		     label-primary = bluish-1000\uFF08\u8FD1\u9ED1\uFF09/ secondary = #61666b /
		     tertiary = #81858c / caption = #adb2b8
		   \u7ED3\u8BBA\uFF1A**\u80FD\u770B\u89C1\u7684\u8FB9\u754C\u53EA\u80FD\u7531 l2 \u4EE5\u4E0A\u7684\u63CF\u8FB9\u6216\u9634\u5F71\u63D0\u4F9B**\uFF1B\u6B63\u6587\u4E00\u5F8B label-primary\uFF0C
		   secondary \u53EA\u7559\u7ED9"\u6807\u7B7E\u4E0E\u6B21\u8981\u8BF4\u660E"\uFF0Ctertiary \u53CA\u4EE5\u4E0B\u53EA\u7528\u4E8E\u771F\u6B63\u53EF\u4EE5\u5FFD\u7565\u7684\u4E1C\u897F\u3002 */
		.jh-btn{margin-top:10px;padding:6px 12px;font-size:13px;border-radius:8px;cursor:pointer;
		  border:1px solid var(--dsw-alias-border-l3);background:transparent;
		  color:var(--dsw-alias-label-primary)}
		.jh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
		.jh-btn:disabled{opacity:.45;cursor:default}
		.jh-btn-inline{margin-top:0}
		.jh-btn-active{border-color:var(--dsw-alias-brand-primary);font-weight:600;
		  background:var(--dsw-alias-interactive-bg-active)}
		/* \u4E3B\u6309\u94AE\u7167\u6284 shell \u81EA\u5DF1\u7684\u914D\u65B9\uFF08button-primary-fill + label-primary-foreground\uFF09\u3002
		   \u6CE8\u610F\uFF1A\u8FD9\u4E2A\u4E3B\u9898\u91CC brand-primary = bluish-1000\uFF08\u8FD1\u9ED1\uFF09\uFF0C\u6240\u4EE5"\u4E3B\u8272\u6309\u94AE"\u5C31\u662F\u9ED1\u5E95\u767D\u5B57\u3002 */
		.jh-btn-primary{border-color:transparent;font-weight:600;
		  background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
		.jh-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
		/* \u4E09\u7EA7\u52A8\u4F5C\uFF08"\u91CD\u7F6E"\uFF09\u8FDE\u8FB9\u6846\u90FD\u4E0D\u7ED9\uFF1A\u5B83\u4E0D\u8BE5\u548C\u4E3B\u6309\u94AE\u62A2\u6CE8\u610F\u529B */
		.jh-btn-quiet{border-color:transparent;color:var(--dsw-alias-label-secondary)}
		.jh-btn-quiet:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
		.jh-icon-btn{border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1;
		  padding:2px 6px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
		.jh-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}

		.jh-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
		.jh-filters .jh-input,.jh-filters .jh-select{width:auto}
		/* \u5173\u952E\u8BCD\u5403\u6389\u5269\u4F59\u5BBD\u5EA6\uFF1A\u7B5B\u9009\u533A\u53F3\u4FA7\u4E0D\u518D\u7A7A\u4E00\u5927\u7247 */
		.jh-input-grow{flex:1 1 220px;min-width:180px}
		.jh-input-sm{width:130px}

		/* \u2500\u2500 U0 \u4ECA\u65E5 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 12px}
		.jh-stat{display:flex;flex-direction:column;gap:2px;text-align:left;padding:12px 14px;border-radius:10px;
		  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
		  color:var(--dsw-alias-label-primary);cursor:default}
		button.jh-stat{cursor:pointer}
		button.jh-stat:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.jh-stat b{font-size:22px;font-weight:600;line-height:1.2}
		.jh-stat span{font-size:12px;color:var(--dsw-alias-label-secondary)}
		.jh-stat-warn b{color:var(--dsw-alias-state-warn-primary)}
		.jh-stat-error b{color:var(--dsw-alias-state-error-primary)}

		.jh-todos{list-style:none;margin:0;padding:0}
		.jh-todo{display:flex;gap:10px;align-items:flex-start;padding:8px 0;
		  border-top:1px solid var(--dsw-alias-border-l1)}
		.jh-todo:first-child{border-top:0}
		.jh-todo-level{flex:0 0 auto;font-size:11px;padding:1px 6px;border-radius:999px;
		  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
		.jh-todo-urgent .jh-todo-level{background:var(--dsw-alias-state-error-primary);color:#fff}
		.jh-todo-warn .jh-todo-level{background:var(--dsw-alias-state-warn-primary);color:#fff}
		.jh-todo-title{font-weight:600}
		.jh-todo-body{flex:1 1 auto;min-width:0}
		.jh-todo-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
		.jh-btn-tiny{padding:3px 8px;font-size:12px;border-radius:6px;margin-left:6px}

		/* \u2500\u2500 U1 \u5C97\u4F4D\u5E93 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-listbar{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}
		.jh-jobs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		/* \u5361\u7247\u5FC5\u987B\u6709\u8FB9\u754C\uFF1A\u767D\u5E95 + 4% \u63CF\u8FB9\u753B\u5728\u767D\u9875\u9762\u4E0A\u7B49\u4E8E\u6CA1\u6709\u5361\u7247\uFF0C\u6EDA\u52A8\u65F6\u5BB9\u6613\u770B\u4E32\u884C */
		.jh-job{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;cursor:pointer;
		  box-sizing:border-box;padding:12px 14px;border-radius:10px;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);
		  box-shadow:0 1px 2px rgba(0,0,0,.04);
		  color:var(--dsw-alias-label-primary);transition:border-color .12s,box-shadow .12s}
		.jh-job:hover{border-color:var(--dsw-alias-border-l4);box-shadow:0 2px 8px rgba(0,0,0,.08)}
		/* \u9009\u4E2D\uFF1A\u5DE6\u4FA7 3px \u4E3B\u8272\u6761\uFF08inset \u9634\u5F71\u753B\uFF0C\u4E0D\u5360\u5BBD\u5EA6\u3001\u6587\u5B57\u4E0D\u4F1A\u8DF3\uFF09+ \u66F4\u5B9E\u7684\u5E95 */
		.jh-job-active{border-color:var(--dsw-alias-border-l4);
		  background:var(--dsw-alias-interactive-bg-active);
		  box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary),0 2px 8px rgba(0,0,0,.08)}
		.jh-job-main{flex:1 1 auto;min-width:0}
		.jh-job-title{font-size:14.5px;font-weight:600;margin:0 0 3px;line-height:1.5}
		.jh-job-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;
		  font-size:12px;color:var(--dsw-alias-label-secondary)}
		/* \u85AA\u8D44\u662F\u51B3\u7B56\u7B2C\u4E00\u773C\u8981\u770B\u7684\u4E1C\u897F\uFF1A\u5B57\u53F7\u4E0E\u5B57\u91CD\u90FD\u63D0\u4E0A\u53BB\uFF0C\u4E0D\u518D\u548C\u5730\u70B9\u4E00\u4E2A\u91CF\u7EA7 */
		.jh-salary{font-size:15px;font-weight:700;color:var(--dsw-alias-state-business-primary)}
		/* \u516C\u53F8\u540D\u662F\u6B21\u8981\u4FE1\u606F\uFF0C\u4F46\u4E5F\u4E0D\u80FD\u6DE1\u5230\u8BFB\u4E0D\u51FA\uFF1A\u7528\u6B63\u6587\u8272 */
		.jh-job-company{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;
		  color:var(--dsw-alias-label-primary)}
		.jh-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
		/* \u6807\u7B7E\u505A\u6210"\u6781\u6D45\u7070\u5E95 + \u6DF1\u8272\u5B57"\u7684\u6241\u5E73\u5757\uFF1A\u4E0D\u63CF\u8FB9\u3001\u4E0D\u52A0\u7C97 \u2014\u2014 \u5BC6\u5EA6\u9AD8\u4F46\u4E0D\u566A */
		.jh-tag{font-size:12px;line-height:18px;padding:0 7px;border-radius:5px;
		  background:var(--dsw-alias-markdown-tag);color:var(--dsw-alias-label-primary)}
		/* \u72B6\u6001\u5FBD\u7AE0\u662F"\u8FD9\u4E2A\u5C97\u4F4D\u5F53\u524D\u7B97\u4EC0\u4E48"\uFF0C\u4E0D\u662F\u590D\u9009\u6846\uFF08\u9879\u76EE\u91CC\u6CA1\u6709\u6279\u91CF\u9009\u62E9\uFF09 */
		.jh-state{flex:0 0 auto;font-size:11.5px;font-weight:600;line-height:20px;padding:0 9px;
		  border-radius:999px;background:var(--dsw-alias-bg-overlay);
		  color:var(--dsw-alias-label-secondary)}
		.jh-state-new{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-brand-text)}
		.jh-state-saved{background:var(--dsw-alias-state-success-primary);
		  color:var(--dsw-alias-label-primary-foreground)}
		.jh-state-ignored,.jh-state-archived{opacity:.75}

		/* \u5206\u9875\u5668\uFF1A\u53EA\u6709"\u4E0A\u4E00\u9875/\u4E0B\u4E00\u9875"\u4E24\u4E2A\u6587\u5B57\u6309\u94AE\u65F6\uFF0C\u7528\u6237\u4E0D\u77E5\u9053\u603B\u5171\u6709\u591A\u5C11\u9875 */
		.jh-pager{display:flex;align-items:center;gap:4px;margin-left:auto}
		.jh-pg{min-width:28px;height:28px;padding:0 8px;font-size:12.5px;cursor:pointer;
		  border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;
		  color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
		.jh-pg:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
		.jh-pg:disabled{opacity:.4;cursor:default}
		.jh-pg-active{border-color:transparent;font-weight:600;
		  background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
		.jh-pg-gap{color:var(--dsw-alias-label-tertiary);padding:0 2px}

		/* \u2500\u2500 U1 \u5C97\u4F4D\u5E93\uFF1A\u5DE6\u5217\u8868 / \u53F3\u8BE6\u60C5\uFF082026-09-17 \u8D77\u4E0D\u518D\u7528\u62BD\u5C49\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u8FD9\u4E2A\u5C4F\u7684\u4E3B\u4EFB\u52A1\u662F"\u6D4F\u89C8 \u2192 \u6BD4\u8F83 \u2192 \u51B3\u5B9A"\uFF0C\u5F39\u5C42\u4F1A\u76D6\u4F4F\u5217\u8868\u3001\u6BCF\u770B\u4E0B\u4E00\u4E2A\u90FD\u8981\u5148\u5173\u4E00\u6B21\u3002
		   \u4E24\u680F\u5404\u81EA\u6EDA\u52A8\uFF1A\u7B5B\u9009\u6761\u56FA\u5B9A\u5728\u9876\u90E8\uFF0C\u5DE6\u680F padding-right \u4E0E\u53F3\u680F padding-left \u7ED9\u4E2D\u95F4\u90A3\u6761
		   \u5206\u9694\u7EBF\u7559\u547C\u5438\uFF1B\u5206\u9694\u7EBF\u753B\u5728\u53F3\u680F\u7684 border-left \u4E0A\uFF0C\u4E0D\u518D\u989D\u5916\u5360\u4E00\u5217\u5BBD\u5EA6\u3002 */
		.jh-jobs-split{display:flex;flex-direction:column;height:100%;box-sizing:border-box;
		  padding:16px 18px;max-width:1560px;container-type:inline-size}
		.jh-jobs-cols{display:grid;grid-template-columns:minmax(360px,46%) 1fr;
		  flex:1 1 auto;min-height:0}
		.jh-jobs-pane{min-width:0;overflow:auto;padding-right:16px;padding-bottom:16px}
		.jh-detail-pane{min-width:0;overflow:auto;padding-left:16px;padding-bottom:16px;
		  border-left:1px solid var(--dsw-alias-border-l1)}
		.jh-detail-pane-empty{display:flex;flex-direction:column;gap:8px;justify-content:center;
		  color:var(--dsw-alias-label-secondary)}
		.jh-detail-empty-title{font-size:14px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary)}
		.jh-job-active{border-color:var(--dsw-alias-brand-primary);
		  background:var(--dsw-alias-interactive-bg-active)}
		/* \u9762\u677F\u88AB\u62D6\u7A84\u65F6\u9000\u56DE\u5355\u680F\uFF1A\u5217\u8868\u5728\u4E0A\u3001\u8BE6\u60C5\u5728\u4E0B\uFF0C\u6574\u5C4F\u4E00\u8D77\u6EDA\u3002
		   \u7528 container query \u800C\u4E0D\u662F media query \u2014\u2014 \u51B3\u5B9A"\u7A84\u4E0D\u7A84"\u7684\u662F**\u9762\u677F**\u6709\u591A\u5BBD\uFF0C
		   \u4E0D\u662F\u7A97\u53E3\u6709\u591A\u5BBD\uFF1A\u4FA7\u680F\u4E00\u5C55\u5F00\u3001\u5BF9\u8BDD\u533A\u4E00\u6324\uFF0C\u7A97\u53E3\u8FD8\u5BBD\u7740\u5462\u9762\u677F\u5DF2\u7ECF\u653E\u4E0D\u4E0B\u4E24\u680F\u4E86\u3002 */
		@container (max-width: 820px){
		  .jh-jobs-split{height:auto}
		  .jh-jobs-cols{grid-template-columns:1fr}
		  .jh-jobs-pane{overflow:visible;padding-right:0}
		  .jh-detail-pane{overflow:visible;border-left:0;border-top:1px solid var(--dsw-alias-border-l1);
		    padding-left:0;padding-top:12px;margin-top:12px}
		}

		/* \u2500\u2500 P4\uFF1A\u5339\u914D\u5206\u4E0E\u98CE\u9669\u6807\u6CE8 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-job-signals{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}
		.jh-score{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;
		  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
		.jh-score-inline{margin-left:8px;font-size:12px}
		.jh-flag{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;
		  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
		.jh-flag-outsourcing{background:var(--dsw-alias-state-warn-primary);color:#fff}
		.jh-flag-fraud{background:var(--dsw-alias-state-error-primary);color:#fff}
		.jh-flag-zombie{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
		.jh-flag-salary_inflation{background:var(--dsw-alias-state-warn-primary);color:#fff;opacity:.85}
		.jh-flag-jargon_hit{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
		.jh-reasons{list-style:none;margin:6px 0 0;padding:0}
		.jh-reason{display:flex;gap:8px;padding:2px 0;font-size:12px}
		.jh-reason-weight{flex:0 0 34px;text-align:right;font-family:ui-monospace,Consolas,monospace;
		  color:var(--dsw-alias-label-tertiary)}
		.jh-reason-hit .jh-reason-weight{color:var(--dsw-alias-state-success-primary)}
		.jh-reason-penalty .jh-reason-weight,.jh-reason-exclude .jh-reason-weight{color:var(--dsw-alias-state-error-primary)}
		.jh-reason-exclude{color:var(--dsw-alias-state-error-primary);font-weight:600}
		.jh-flags{list-style:none;margin:0;padding:0}
		.jh-flag-item{padding:8px 0;border-top:1px solid var(--dsw-alias-border-l1)}
		.jh-flag-item:first-child{border-top:0}
		.jh-flag-head{display:flex;align-items:center;gap:8px}
		.jh-evidence{margin:4px 0 0;padding-left:18px;font-size:12px;color:var(--dsw-alias-label-secondary)}

		/* \u2500\u2500 U2 \u8BE6\u60C5\uFF08\u53F3\u4FA7\u5185\u5D4C\u680F\u4E0E\u62BD\u5C49\u5171\u7528\u540C\u4E00\u4EFD\u6B63\u6587\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u64CD\u4F5C\u6309\u94AE\u539F\u5148\u5728\u6B63\u6587**\u6700\u5E95\u90E8** \u2014\u2014 \u53F3\u4FA7\u4E00\u5C4F\u90A3\u4E48\u957F\uFF0C\u7528\u6237\u6839\u672C\u6EDA\u4E0D\u5230
		   \uFF08\u5B9E\u6D4B\u53CD\u9988\u5C31\u662F"\u8BE6\u60C5\u9875\u53F3\u4FA7\u6CA1\u6709\u4EFB\u4F55\u64CD\u4F5C\u6309\u94AE"\uFF09\u3002\u73B0\u5728\u505A\u6210**\u5438\u9876\u64CD\u4F5C\u6761**\uFF1A
		   \u6807\u9898 + \u85AA\u8D44 + \u56DB\u4E2A\u52A8\u4F5C\u6C38\u8FDC\u505C\u5728\u6700\u4E0A\u9762\u3002
		   sticky \u76F8\u5BF9\u6700\u8FD1\u7684\u53EF\u6EDA\u52A8\u7956\u5148\uFF08.jh-detail-pane / .jh-drawer-body\uFF09\u5B9A\u4F4D\u3002 */
		.jh-detail-head{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px;
		  align-items:flex-start;justify-content:space-between;padding:12px 0 10px;margin:0 0 12px;
		  background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l2)}
		.jh-detail-headline{min-width:0;flex:1 1 240px}
		.jh-detail-title{font-size:17px;font-weight:600;margin:0 0 4px;line-height:1.4}
		.jh-detail-salary{margin:0;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
		.jh-detail-actions{display:flex;flex-wrap:wrap;gap:6px;flex:0 0 auto}

		/* \u62BD\u5C49\uFF1A\u4E34\u65F6\u770B\u4E00\u773C\u7528\uFF0C\u4FDD\u6301\u5F39\u5C42\u5F62\u6001 */
		.jh-drawer-layer{position:absolute;inset:0;z-index:30}
		.jh-drawer-backdrop{position:absolute;inset:0;border:0;padding:0;cursor:pointer;
		  background:rgba(0,0,0,.28)}
		.jh-drawer{position:absolute;top:0;right:0;bottom:0;width:min(560px,88%);
		  display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);
		  border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-8px 0 28px rgba(0,0,0,.18)}
		.jh-drawer-head{display:flex;align-items:center;gap:8px;padding:10px 14px;
		  border-bottom:1px solid var(--dsw-alias-border-l2)}
		.jh-drawer-title{font-weight:600;flex:1 1 auto}
		.jh-drawer-body{flex:1 1 auto;overflow:auto;padding:0 14px 14px}

		/* L1 \u7C97\u7B5B\u5206\uFF1A\u672C\u9879\u76EE\u7684\u7279\u8272\u6570\u636E\uFF0C\u503C\u5F97\u4E00\u4E2A\u770B\u5F97\u61C2\u7684\u4EEA\u8868\u76D8\u800C\u4E0D\u662F\u4E00\u884C\u7070\u5B57 */
		.jh-gauge-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
		.jh-gauge{position:relative;flex:0 0 auto;width:72px;height:72px}
		.jh-gauge svg{transform:rotate(-90deg)}
		.jh-gauge-track{stroke:var(--dsw-alias-bg-overlay)}
		.jh-gauge-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
		  justify-content:center;font-size:19px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
		.jh-gauge-unit{font-size:10px;font-weight:500;color:var(--dsw-alias-label-secondary);margin-top:2px}
		.jh-gauge-band{font-size:12.5px;font-weight:600}
		.jh-gauge-high{color:var(--dsw-alias-state-success-primary)}
		.jh-gauge-mid{color:var(--dsw-alias-state-warn-primary)}
		.jh-gauge-low{color:var(--dsw-alias-label-secondary)}
		.jh-gauge-side{min-width:0;flex:1 1 180px;display:flex;flex-direction:column;gap:6px}

		/* \u547D\u4E2D/\u5931\u5206\u9010\u6761\uFF1A\u7ED9\u7B26\u53F7\u4E0E\u989C\u8272\uFF0C\u800C\u4E0D\u662F\u53EA\u7ED9\u4E00\u4E2A\u52A0\u6743\u6570\u5B57 */
		.jh-reason-mark{flex:0 0 14px;text-align:center;font-weight:700}
		.jh-reason-ok .jh-reason-mark{color:var(--dsw-alias-state-success-primary)}
		.jh-reason-bad .jh-reason-mark{color:var(--dsw-alias-state-error-primary)}

		/* \u98CE\u9669\u63D0\u793A\u7528 Alert \u6846\uFF0C\u800C\u4E0D\u662F\u4E00\u6392\u7070\u5B57\u3002
		   \u4F46"\u6CA1\u6709\u547D\u4E2D"**\u4E0D\u5237\u6210\u7EFF\u8272**\uFF1A\u7EFF\u8272\u7B49\u4E8E\u5BA3\u5E03"\u8FD9\u4E2A\u5C97\u4F4D\u6CA1\u95EE\u9898"\uFF0C\u800C\u89C4\u5219\u6CA1\u547D\u4E2D\u53EA\u8BF4\u660E
		   "\u6CA1\u547D\u4E2D\u5DF2\u77E5\u6A21\u5F0F" \u2014\u2014 \u90A3\u6070\u6070\u662F\u672C\u9879\u76EE\u4E00\u8DEF\u62D2\u7EDD\u4E0B\u7684\u90A3\u79CD\u7ED3\u8BBA\u3002 */
		.jh-alert{border:1px solid var(--dsw-alias-border-l2);border-left-width:3px;border-radius:10px;
		  padding:10px 12px;margin:0 0 10px;background:var(--dsw-alias-bg-base)}
		.jh-alert-warn{border-color:var(--dsw-alias-state-warn-secondary);
		  border-left-color:var(--dsw-alias-state-warn-primary);
		  background:var(--dsw-alias-state-warn-tertiary)}
		.jh-alert-error{border-color:var(--dsw-alias-state-error-secondary);
		  border-left-color:var(--dsw-alias-state-error-primary);
		  background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}
		.jh-alert-quiet{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay)}
		.jh-alert-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 4px}
		.jh-alert-title{font-weight:600;font-size:13px}
		.jh-alert-body{margin:0;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-primary)}

		/* \u957F\u89E3\u91CA\u6536\u8FDB\u4E00\u4E2A\u5C0F\u95EE\u53F7\uFF1A\u60AC\u6D6E\u770B\u5168\u6587\uFF0C\u6B63\u6587\u91CC\u53EA\u7559\u4E00\u53E5 */
		.jh-hint{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;
		  margin-left:5px;border-radius:50%;cursor:help;font-size:10.5px;font-weight:700;line-height:1;
		  background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);vertical-align:middle}
		.jh-note{margin:0;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary)}

		/* \u6807\u7B7E\u5206\u7EC4\uFF08\u6280\u80FD\u8981\u6C42 / \u516C\u53F8\u798F\u5229\uFF09 */
		.jh-tag-group{margin:0 0 10px}
		.jh-tag-group-name{display:block;font-size:11.5px;font-weight:600;margin:0 0 5px;
		  color:var(--dsw-alias-label-secondary)}

		/* \u2500\u2500 shell.overlay \u6D6E\u5C42\uFF08P0-VERIFICATION F1\uFF1A\u5FC5\u987B\u81EA\u6D88\u5931\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-notice{position:fixed;right:18px;bottom:18px;pointer-events:auto;z-index:40;
		  display:flex;align-items:center;gap:10px;max-width:320px;padding:8px 10px 8px 12px;
		  border-radius:10px;font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);
		  background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);
		  color:var(--dsw-alias-label-primary)}
		.jh-notice-text{flex:1}
		.jh-notice-close{border:0;background:transparent;cursor:pointer;font-size:15px;line-height:1;
		  padding:2px 4px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
		.jh-notice-close:hover{background:var(--dsw-alias-interactive-bg-hover);
		  color:var(--dsw-alias-label-primary)}

		/* \u2500\u2500 tool.call.toolview \u5361\u7247\uFF08\xA722.3\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5BF9\u8BDD\u91CC\u7684\u5361\u7247\u8981"\u770B\u8D77\u6765\u50CF\u8BDD\uFF0C\u4E0D\u50CF\u65E5\u5FD7"\uFF1A\u53EA\u7528\u4E3B\u9898\u53D8\u91CF\u3001\u4E0D\u786C\u7F16\u7801\u989C\u8272\uFF0C
		   \u5E76\u4E14\u6BD4\u9762\u677F\u91CC\u7684\u5361\u7247\u66F4\u7D27\u51D1\uFF08\u5B83\u5728\u5BF9\u8BDD\u6D41\u4E2D\u95F4\uFF0C\u4E0D\u8BE5\u62A2\u5360\u7AD6\u5411\u7A7A\u95F4\uFF09\u3002 */
		.jh-tv{display:flex;flex-direction:column;gap:6px;margin:2px 0;font-size:13px;line-height:1.6;
		  color:var(--dsw-alias-label-primary)}
		.jh-tv-head{display:flex;align-items:baseline;gap:8px;min-width:0}
		.jh-tv-title{font-weight:600;flex:0 0 auto}
		.jh-tv-sub{color:var(--dsw-alias-label-secondary);flex:1 1 auto;min-width:0;
		  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.jh-tv-actions{display:flex;gap:6px;flex:0 0 auto}
		.jh-tv-link{border:0;background:transparent;cursor:pointer;padding:0 2px;font-size:12px;
		  color:var(--dsw-alias-label-secondary);text-decoration:underline}
		.jh-tv-link:hover{color:var(--dsw-alias-label-primary)}
		.jh-tv[data-tone=error] .jh-tv-title{color:var(--dsw-alias-state-error-primary)}

		.jh-tv-body{display:flex;flex-direction:column;gap:6px}
		.jh-tv-rows{display:flex;flex-direction:column;gap:2px}
		.jh-tv-row{display:grid;grid-template-columns:72px 1fr;gap:10px;align-items:baseline}
		.jh-tv-label{color:var(--dsw-alias-label-secondary);font-size:12px}
		.jh-tv-value{min-width:0;overflow-wrap:anywhere}
		.jh-tv-note{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px}
		.jh-tv-ok{color:var(--dsw-alias-state-success-primary);margin:0;font-size:12px}
		.jh-tv-error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;
		  overflow-wrap:anywhere;white-space:pre-wrap}

		.jh-tv-jobs{display:flex;flex-direction:column;gap:1px}
		.jh-tv-job{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;cursor:pointer;
		  border:0;background:transparent;border-radius:6px;padding:3px 6px;
		  color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}
		.jh-tv-job:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.jh-tv-job-id{color:var(--dsw-alias-label-tertiary);flex:0 0 auto;font-variant-numeric:tabular-nums}
		.jh-tv-job-title{font-weight:500;flex:0 1 auto;min-width:0;
		  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.jh-tv-job-meta,.jh-tv-job-salary,.jh-tv-job-score{color:var(--dsw-alias-label-secondary);
		  flex:0 0 auto;font-size:12px}

		.jh-tv-pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:8px 10px;border-radius:8px;
		  background:var(--dsw-alias-markdown-code-block);border:.5px solid var(--dsw-alias-border-l1);
		  color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
		.jh-tv-pre-body{background:transparent;border:0;padding:0}
		.jh-tv-draft{display:flex;flex-direction:column;gap:6px}
		.jh-tv-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}

		/* \u2500\u2500 P6\uFF1A\u7B80\u5386\u4E2D\u5FC3\uFF08U3\uFF09\u4E0E\u5B9A\u5236\uFF08U4\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-row-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 12px}
		.jh-resume-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;align-items:start}
		.jh-resume-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
		.jh-resume-item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;cursor:pointer;
		  border:1px solid transparent;background:transparent;border-radius:8px;padding:8px 10px;
		  color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
		.jh-resume-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.jh-resume-item-active{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
		.jh-resume-name{font-weight:600;display:flex;align-items:center;gap:6px}
		.jh-badge-inline{font-style:normal;font-size:10px;font-weight:600;padding:0 5px;border-radius:999px;
		  color:var(--dsw-alias-brand-text);background:var(--dsw-alias-state-business-tertiary)}
		.jh-resume-meta{font-size:12px;line-height:1.5}
		.jh-resume-detail{min-width:0}
		.jh-resume-editor{display:flex;flex-direction:column;gap:10px}
		.jh-two-col{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;align-items:start}
		.jh-field{display:flex;flex-direction:column;gap:3px;margin:0 0 8px}
		.jh-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}
		.jh-inline{display:flex;gap:6px}
		.jh-input,.jh-textarea,.jh-select{width:100%;box-sizing:border-box;font:inherit;font-size:13px;
		  padding:6px 10px;border-radius:8px;color:var(--dsw-alias-label-primary);
		  border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base)}
		.jh-input:focus,.jh-textarea:focus,.jh-select:focus{outline:none;
		  border-color:var(--dsw-alias-link);box-shadow:0 0 0 3px var(--dsw-alias-state-business-tertiary)}
		.jh-input::placeholder,.jh-textarea::placeholder{color:var(--dsw-alias-label-caption)}
		.jh-input-narrow{max-width:90px}
		.jh-textarea{resize:vertical;line-height:1.6}
		.jh-textarea-tall{min-height:200px;font-family:ui-monospace,Consolas,monospace;font-size:12px}
		.jh-issues{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
		.jh-preview{width:100%;height:420px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;
		  background:#fff}
		.jh-files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
		.jh-link{color:var(--dsw-alias-brand-text);text-decoration:underline}
		.jh-footnote{margin-top:14px;font-size:12px}
		.jh-select{max-width:260px}

		/* U4\uFF1A\u5C97\u4F4D\u8BE6\u60C5\u91CC\u7684\u5B9A\u5236\u5EFA\u8BAE */
		.jh-tailor{display:flex;flex-direction:column;gap:8px;margin-top:6px}
		.jh-tailor-notes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;
		  font-size:12px;color:var(--dsw-alias-label-secondary)}
		.jh-tailor-skill{display:inline-block;margin:0 4px 4px 0;padding:1px 7px;border-radius:999px;font-size:12px;
		  border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
		.jh-tailor-skill-hit{border-color:var(--dsw-alias-brand-text);color:var(--dsw-alias-brand-text)}
		.jh-tv-score-stale{color:var(--dsw-alias-state-warn-primary);font-size:12px}

		/* \u2500\u2500 P7\uFF1A\u6D41\u6C34\u7EBF\u770B\u677F / \u6D88\u606F / \u9762\u8BD5 / \u6570\u636E\u770B\u677F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-board{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;align-items:flex-start}
		.jh-board-col{flex:0 0 210px;min-width:210px;display:flex;flex-direction:column;gap:6px;
		  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
		  border-radius:10px;padding:8px}
		.jh-board-head{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
		  color:var(--dsw-alias-label-secondary)}
		.jh-board-count{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-weight:400}
		.jh-board-empty{margin:0;text-align:center;font-size:12px}
		.jh-board-card{display:flex;flex-direction:column;gap:3px;padding:7px 8px;border-radius:8px;
		  border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
		.jh-board-title{border:0;background:transparent;padding:0;text-align:left;cursor:pointer;font:inherit;
		  font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
		.jh-board-title:hover{color:var(--dsw-alias-brand-text);text-decoration:underline}
		.jh-board-meta{font-size:11px;line-height:1.5}
		.jh-board-age{font-size:11px;color:var(--dsw-alias-label-tertiary)}
		.jh-board-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}

		.jh-followups{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		.jh-followup{padding:8px 10px;border-radius:8px;border-left:3px solid var(--dsw-alias-border-l3);
		  background:var(--dsw-alias-bg-layer-1);font-size:12px}
		.jh-followup-read-no-reply{border-left-color:var(--dsw-alias-state-warn-primary)}
		.jh-followup-unread-timeout{border-left-color:var(--dsw-alias-label-tertiary)}
		.jh-followup p{margin:2px 0 0}

		.jh-messages,.jh-interviews{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		.jh-message,.jh-interview{padding:9px 11px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l1);
		  background:var(--dsw-alias-bg-layer-1)}
		.jh-message-hr{border-left:3px solid var(--dsw-alias-brand-text)}
		.jh-message-me{border-left:3px solid var(--dsw-alias-label-tertiary)}
		.jh-message-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px}
		.jh-message-body{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
		.jh-message-reply{display:flex;flex-direction:column;gap:6px;margin-top:6px}
		.jh-interview-conflict{border-color:var(--dsw-alias-state-warn-primary)}

		.jh-funnel{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
		.jh-funnel>li{display:flex;align-items:center;gap:8px}
		.jh-funnel-label{flex:0 0 72px;color:var(--dsw-alias-label-secondary)}
		.jh-funnel-bar{height:8px;border-radius:4px;background:var(--dsw-alias-brand-text);opacity:.55;flex:0 0 auto}
		.jh-funnel-count{flex:0 0 40px;text-align:right;font-variant-numeric:tabular-nums}
		.jh-funnel-rate{flex:0 0 48px;text-align:right}
		/* \u603B\u4F53\u5207\u6362\uFF1A\u63A5\u89E6\u6F0F\u6597\u4E0E\u6295\u9012\u6F0F\u6597\u662F\u4E24\u4E2A\u4E0D\u53EF\u6BD4\u7684\u603B\u4F53\uFF0C\u753B\u4E00\u6761\u7EBF\u6BD4\u4EC0\u4E48\u90FD\u6E05\u695A */
		.jh-funnel-boundary{border-top:1px dashed var(--dsw-alias-border-l3);padding-top:4px;margin-top:2px}

		.jh-table{border-collapse:collapse;width:100%;font-size:12px}
		.jh-table th,.jh-table td{border-bottom:.5px solid var(--dsw-alias-border-l1);padding:4px 6px;text-align:left}
		.jh-table th{color:var(--dsw-alias-label-secondary);font-weight:500}

		/* \u2500\u2500 P8\uFF1A\u6821\u62DB\u786C\u622A\u6B62\uFF08\u4E0D\u53EF\u9006\u8282\u70B9\u5FC5\u987B\u663E\u773C\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-deadlines{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
		.jh-deadline{padding:5px 9px;border-radius:7px;border-left:3px solid var(--dsw-alias-border-l3);
		  background:var(--dsw-alias-bg-base)}
		/* 24 \u5C0F\u65F6\u5185\uFF1A\u6A59\uFF1B\u5DF2\u8FC7\u671F\uFF1A\u7EA2\u3002\u4E24\u4E2A\u8272\u9636\u523B\u610F\u533A\u5206 \u2014\u2014 \u300C\u5FEB\u4E86\u300D\u4E0E\u300C\u6CA1\u4E86\u300D\u662F\u4E24\u4EF6\u4E8B */
		.jh-deadline-urgent{border-left-color:var(--dsw-alias-state-warn-primary);
		  background:var(--dsw-alias-state-warn-tertiary)}
		.jh-deadline-overdue{border-left-color:var(--dsw-alias-state-error-primary);
		  background:var(--dsw-alias-state-error-tertiary)}
		.jh-campus-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		.jh-campus-item{padding:9px 11px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l1);
		  background:var(--dsw-alias-bg-layer-1)}
		`;

		// src/client/toolviews/greeting-card.tsx
		var import_react14 = require("react");

		// src/client/toolviews/parts.tsx
		var import_react13 = require("react");

		// src/shared/tool-format.ts
		var JOB_LIST_LINE = /^#(\d+)\s+(.+)$/;
		var LIST_FIELD_SEP = " \xB7 ";
		function parseJobListLine(line) {
		  const match = JOB_LIST_LINE.exec(line.trim());
		  if (match === null) return void 0;
		  const id = Number.parseInt(match[1] ?? "", 10);
		  if (!Number.isFinite(id)) return void 0;
		  const rest = (match[2] ?? "").replace(/\s+⚠.*$/, "");
		  const fields = rest.split(LIST_FIELD_SEP);
		  return {
		    id,
		    title: fields[0] ?? "",
		    company: fields[1] ?? "",
		    city: fields[2] ?? "",
		    salary: fields[3] ?? "",
		    score: fields[4] ?? ""
		  };
		}
		var DETAIL_KEYS = {
		  company: "\u516C\u53F8",
		  place: "\u5730\u70B9",
		  salary: "\u85AA\u8D44",
		  requirement: "\u8981\u6C42",
		  match: "\u7C97\u7B5B\u5339\u914D",
		  flags: "\u6807\u6CE8",
		  jd: "JD \u6458\u8981",
		  url: "\u94FE\u63A5"
		};
		function parseDetailLines(text) {
		  return text.split("\n").map((raw) => raw.trim()).filter((raw) => raw !== "").map((raw) => {
		    const index = raw.indexOf("\uFF1A");
		    if (index <= 0) return null;
		    const key = raw.slice(0, index);
		    if (!Object.values(DETAIL_KEYS).includes(key)) return null;
		    return { key, value: raw.slice(index + 1) };
		  });
		}

		// src/client/toolviews/parts.tsx
		function textOf(block) {
		  const content = block.content ?? [];
		  return content.map((item) => item.type === "text" ? String(item.text ?? "") : "").filter((part) => part !== "").join("\n");
		}
		function isSettled(block) {
		  return block.kind !== void 0;
		}
		function jobLinesOf(text) {
		  const out = [];
		  for (const raw of text.split("\n")) {
		    const parsed = parseJobListLine(raw);
		    if (parsed !== void 0) out.push(parsed);
		  }
		  return out;
		}
		function headlineOf(text) {
		  const first = text.split("\n").find((line) => line.trim() !== "");
		  return first === void 0 ? "" : first.trim();
		}
		function CardShell(props) {
		  const { title, subtitle, tone = "normal", actions, inspect, children } = props;
		  return (0, import_react13.createElement)(
		    "div",
		    { className: "jh-tv", "data-tone": tone },
		    (0, import_react13.createElement)(
		      "div",
		      { className: "jh-tv-head" },
		      (0, import_react13.createElement)("span", { className: "jh-tv-title" }, title),
		      subtitle === void 0 || subtitle === "" ? null : (0, import_react13.createElement)("span", { className: "jh-tv-sub" }, subtitle),
		      (0, import_react13.createElement)("span", { className: "jh-spacer" }),
		      actions === void 0 ? null : (0, import_react13.createElement)("span", { className: "jh-tv-actions" }, actions),
		      inspect === void 0 ? null : (0, import_react13.createElement)(
		        "button",
		        { type: "button", className: "jh-tv-link", onClick: inspect },
		        "\u67E5\u770B"
		      )
		    ),
		    children === void 0 ? null : (0, import_react13.createElement)("div", { className: "jh-tv-body" }, children)
		  );
		}
		function JobRow(props) {
		  const { job, onOpen } = props;
		  return (0, import_react13.createElement)(
		    "button",
		    {
		      type: "button",
		      className: "jh-tv-job",
		      onClick: () => onOpen(job.id),
		      title: "\u5728\u4E3B\u9762\u677F\u91CC\u6253\u5F00\u8FD9\u4E2A\u5C97\u4F4D"
		    },
		    (0, import_react13.createElement)("span", { className: "jh-tv-job-id" }, `#${String(job.id)}`),
		    (0, import_react13.createElement)("span", { className: "jh-tv-job-title" }, job.title),
		    (0, import_react13.createElement)("span", { className: "jh-tv-job-meta" }, [job.company, job.city].filter((p) => p !== "").join(" \xB7 ")),
		    (0, import_react13.createElement)("span", { className: "jh-spacer" }),
		    (0, import_react13.createElement)("span", { className: "jh-tv-job-salary" }, job.salary),
		    (0, import_react13.createElement)("span", { className: "jh-tv-job-score" }, job.score)
		  );
		}
		function useAction() {
		  const [busy, setBusy] = (0, import_react13.useState)(false);
		  const [error, setError] = (0, import_react13.useState)(null);
		  const [result, setResult] = (0, import_react13.useState)(null);
		  const run = async (fn) => {
		    setBusy(true);
		    setError(null);
		    try {
		      setResult(await fn());
		    } catch (caught) {
		      setError(caught instanceof Error ? caught.message : String(caught));
		    } finally {
		      setBusy(false);
		    }
		  };
		  return {
		    run,
		    busy,
		    error,
		    result,
		    reset: () => {
		      setError(null);
		      setResult(null);
		    }
		  };
		}

		// src/client/toolviews/open-panel.ts
		function openJobInPanel(jobId, action = "open") {
		  requestPanelIntent(jobId, action);
		  showPanel(PANEL_KEY);
		}

		// src/client/toolviews/greeting-card.tsx
		var import_jsx_runtime12 = require("react/jsx-runtime");
		function GreetingCard(props) {
		  const { block, inspect } = props;
		  const settled = isSettled(block);
		  const text = textOf(block);
		  const failed = block.isError === true;
		  const [copied, setCopied] = (0, import_react14.useState)(false);
		  const parsed = splitDraft(text);
		  const jobId = jobIdOf(props);
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
		    CardShell,
		    {
		      title: "\u6253\u62DB\u547C\u8BDD\u672F",
		      subtitle: failed ? block.error?.code ?? "\u5931\u8D25" : settled ? parsed.source : "\u6B63\u5728\u751F\u6210\u2026",
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      actions: settled && !failed ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          onClick: () => {
		            void navigator.clipboard?.writeText(parsed.body).then(
		              () => setCopied(true),
		              () => setCopied(false)
		            );
		          },
		          children: copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"
		        }
		      ) : null,
		      children: [
		        !settled ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "jh-tv-note", children: "\u6B63\u5728\u751F\u6210\u2026\u6A21\u578B\u4E0D\u53EF\u7528\u65F6\u4F1A\u81EA\u52A8\u9000\u56DE\u5185\u7F6E\u6A21\u677F\u3002" }) : failed ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("pre", { className: "jh-tv-pre jh-tv-pre-body", children: parsed.body }),
		          parsed.meta === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "jh-tv-note", children: parsed.meta }),
		          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "jh-tv-note", children: "\u8FD8\u6CA1\u6709\u53D1\u9001 \u2014\u2014 \u53D1\u9001\u662F\u9AD8\u5371\u52A8\u4F5C\uFF0C\u9700\u8981\u5728\u9762\u677F\u91CC\u786E\u8BA4\u3002" })
		        ] }),
		        jobId === null || !settled || failed ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "jh-tv-foot", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            onClick: () => openJobInPanel(jobId, "draft"),
		            children: "\u53BB\u9762\u677F\u91CC\u53D1\u9001"
		          }
		        ) })
		      ]
		    }
		  );
		}
		function splitDraft(text) {
		  const lines = text.split("\n");
		  const header = lines[0] ?? "";
		  const sourceMatch = /来源：(模型生成|内置模板[^）]*)/.exec(header);
		  const source = sourceMatch === null ? "" : sourceMatch[0];
		  const start = lines.findIndex((line, index) => index > 0 && line.trim() !== "");
		  if (start < 0) return { source, body: text.trim(), meta: "" };
		  const tail = lines.findIndex((line, index) => index > start && /^（\d+ 字）/.test(line.trim()));
		  const end = tail < 0 ? lines.length : tail;
		  const body = lines.slice(start, end).join("\n").trim();
		  const meta = tail < 0 ? "" : lines.slice(tail).join(" ").trim();
		  return { source, body: body === "" ? text.trim() : body, meta };
		}
		function jobIdOf(props) {
		  const raw = (props.block.kind === void 0 ? props.block.argsRaw : props.block.call?.argsRaw) ?? "";
		  try {
		    const parsed = JSON.parse(raw);
		    if (parsed !== null && typeof parsed === "object") {
		      const value = parsed.jobId;
		      if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
		    }
		  } catch {
		  }
		  return null;
		}

		// src/client/toolviews/job-detail-card.tsx
		var import_react15 = require("react");
		var import_jsx_runtime13 = require("react/jsx-runtime");
		function JobDetailCard(props) {
		  const { block, inspect } = props;
		  const settled = isSettled(block);
		  const text = textOf(block);
		  const lines = text.split("\n");
		  const titleLine = lines[0] ?? "";
		  const rows = parseDetailLines(text);
		  const failed = block.isError === true;
		  const jobId = jobIdOf2(props);
		  const mark = useAction();
		  const draft = useAction();
		  const [copied, setCopied] = (0, import_react15.useState)(false);
		  const onMark = () => {
		    if (jobId === null) return;
		    void mark.run(async () => {
		      const job = await markJob(jobId, "saved");
		      return `\u5DF2\u6536\u85CF\uFF1A#${String(job.id)}`;
		    });
		  };
		  const onDraft = () => {
		    if (jobId === null) return;
		    void draft.run(async () => {
		      const result = await draftGreeting(jobId);
		      const source = result.via === "llm" ? "\u6A21\u578B\u751F\u6210" : "\u5185\u7F6E\u6A21\u677F";
		      return `${result.text}

		\u2014\u2014 \u6765\u6E90\uFF1A${source}${result.notes.length === 0 ? "" : `\uFF08${result.notes.join("\uFF1B")}\uFF09`}`;
		    });
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
		    CardShell,
		    {
		      title: "\u5C97\u4F4D\u8BE6\u60C5",
		      subtitle: failed ? block.error?.code ?? "\u5931\u8D25" : settled ? titleLine : "\u6B63\u5728\u8BFB\u53D6\u2026",
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      actions: jobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled: mark.busy, onClick: onMark, children: mark.busy ? "\u6536\u85CF\u4E2D\u2026" : "\u6536\u85CF" }),
		        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled: draft.busy, onClick: onDraft, children: draft.busy ? "\u751F\u6210\u4E2D\u2026" : "\u751F\u6210\u8BDD\u672F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            onClick: () => openJobInPanel(jobId, "draft"),
		            children: "\u5728\u9762\u677F\u91CC\u6253\u5F00"
		          }
		        )
		      ] }),
		      children: [
		        failed ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : !settled ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "jh-tv-note", children: "\u6B63\u5728\u8BFB\u53D6\u5C97\u4F4D\u8BE6\u60C5\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "jh-tv-rows", children: rows.map(
		          (row, index) => row === null ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "jh-tv-row", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "jh-tv-label", children: row.key }),
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "jh-tv-value", children: row.value })
		          ] }, `${row.key}-${String(index)}`)
		        ) }),
		        mark.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "jh-tv-error", children: mark.error }),
		        mark.result === null ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "jh-tv-ok", children: mark.result }),
		        draft.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "jh-tv-error", children: draft.error }),
		        draft.result === null ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "jh-tv-draft", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("pre", { className: "jh-tv-pre", children: draft.result }),
		          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "jh-tv-foot", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                onClick: () => {
		                  navigator.clipboard?.writeText(draft.result ?? "").then(
		                    () => setCopied(true),
		                    () => setCopied(false)
		                  );
		                },
		                children: copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "jh-tv-note", children: "\u8FD9\u6BB5**\u8FD8\u6CA1\u6709\u53D1\u9001** \u2014\u2014 \u53D1\u9001\u8981\u53BB\u9762\u677F\u91CC\u786E\u8BA4\u3002" })
		          ] })
		        ] })
		      ]
		    }
		  );
		}
		function jobIdOf2(props) {
		  const raw = (props.block.kind === void 0 ? props.block.argsRaw : props.block.call?.argsRaw) ?? "";
		  try {
		    const parsed = JSON.parse(raw);
		    if (parsed !== null && typeof parsed === "object") {
		      const value = parsed.jobId;
		      if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
		    }
		  } catch {
		  }
		  return null;
		}

		// src/client/toolviews/jobs-card.tsx
		var import_jsx_runtime14 = require("react/jsx-runtime");
		function JobsCard(props) {
		  const { block, toolName, inspect } = props;
		  const settled = isSettled(block);
		  const text = textOf(block);
		  const jobs = jobLinesOf(text);
		  const headline = headlineOf(text);
		  const failed = block.isError === true;
		  const running = !settled;
		  const title = toolName === "job_search" ? "\u5C97\u4F4D\u641C\u7D22" : "\u5C97\u4F4D\u5E93";
		  const subtitle = running ? "\u6B63\u5728\u8DD1\u2026" : failed ? block.error?.code ?? "\u5931\u8D25" : headline;
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		    CardShell,
		    {
		      title,
		      subtitle,
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      children: [
		        running ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-tv-note", children: toolName === "job_search" ? "\u6B63\u5728\u6293\u53D6 \u2014\u2014 \u4F1A\u771F\u7684\u6253\u5F00\u6D4F\u89C8\u5668\uFF0C\u901A\u5E38\u5341\u51E0\u79D2\u5230\u4E00\u5206\u949F\u3002" : "\u6B63\u5728\u8BFB\u53D6\u2026" }) : failed ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : jobs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-tv-note", children: text === "" ? "\u6CA1\u6709\u7ED3\u679C\u3002" : text }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-tv-jobs", children: jobs.map((job) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(JobRow, { job, onOpen: (id) => openJobInPanel(id) }, job.id)) }),
		        running || failed || jobs.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-tv-foot", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => openJobInPanel(jobs[0].id), children: "\u53BB\u9762\u677F\u770B\u5168\u90E8" }) })
		      ]
		    }
		  );
		}

		// src/client/index.tsx
		var name = PLUGIN_ID;
		var inject = ["slots"];
		function apply(ctx2) {
		  const slots = serviceOf(ctx2, "slots");
		  if (slots === void 0) {
		    ctx2.logger?.warn(`[${PLUGIN_ID}] slots \u670D\u52A1\u7F3A\u5931\uFF0CUI \u672A\u6CE8\u518C`);
		    return;
		  }
		  bindContext(ctx2);
		  const disposers = [];
		  ctx2.effect(() => {
		    try {
		      disposers.push(installStyles());
		      disposers.push(
		        slots.inject("main", () => slots.register({ name: "main", key: PANEL_KEY }, JobHunterPanel))
		      );
		      disposers.push(
		        slots.inject(
		          "sidebar.panellist",
		          () => slots.register(
		            { name: "sidebar.panellist", id: PANEL_KEY, order: 50, label: () => "\u6C42\u804C\u627E\u5DE5\u4F5C" },
		            JobHunterEntryIcon
		          )
		        )
		      );
		      disposers.push(
		        slots.inject(
		          "shell.overlay",
		          () => slots.register({ name: "shell.overlay", id: `${PANEL_KEY}-notice`, order: 50 }, JobHunterNotice)
		        )
		      );
		      for (const [key, component] of [
		        ["job_search", JobsCard],
		        ["job_query", JobsCard],
		        ["job_detail", JobDetailCard],
		        ["greeting_draft", GreetingCard]
		      ]) {
		        disposers.push(
		          slots.inject(
		            "tool.call.toolview",
		            () => slots.register({ name: "tool.call.toolview", key }, component)
		          )
		        );
		      }
		    } catch (error) {
		      disposeAll(disposers);
		      throw error;
		    }
		    return () => disposeAll(disposers);
		  }, `${PLUGIN_ID}: client slots`);
		}
		function disposeAll(disposers) {
		  for (const dispose of disposers.splice(0).reverse()) {
		    try {
		      dispose();
		    } catch {
		    }
		  }
		}
		return module.exports;
	}
});

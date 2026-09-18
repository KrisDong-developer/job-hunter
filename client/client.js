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
		var BROWSER_IDLE_DEFAULT_MIN = 10;
		var BROWSER_IDLE_MIN_MIN = 0;
		var BROWSER_IDLE_MAX_MIN = 240;

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
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "jh-notice", role: "status", "aria-live": "polite", children: [
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
		var import_react16 = require("react");

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
		var import_react6 = require("react");

		// src/shared/enums.ts
		var JOB_STATES = ["new", "seen", "saved", "ignored", "archived"];
		var CRAWL_STATE_LABEL = {
		  queued: "\u6392\u961F\u4E2D",
		  running: "\u8FDB\u884C\u4E2D",
		  ok: "\u6210\u529F",
		  partial: "\u90E8\u5206\u6210\u529F",
		  failed: "\u5931\u8D25",
		  aborted: "\u5DF2\u4E2D\u6B62"
		};
		var CRAWL_STATE_TONE = {
		  queued: "muted",
		  running: "muted",
		  ok: "ok",
		  partial: "warn",
		  failed: "error",
		  aborted: "muted"
		};
		var HEALTH_STATE_LABEL = {
		  healthy: "\u6B63\u5E38",
		  degraded: "\u964D\u7EA7",
		  broken: "\u5931\u6548"
		};
		var HEALTH_STATE_TONE = {
		  healthy: "ok",
		  degraded: "warn",
		  broken: "error"
		};
		var RUN_REASON_LABEL = {
		  schedule: "\u5B9A\u65F6",
		  manual: "\u624B\u52A8",
		  "catch-up": "\u8865\u8DD1"
		};
		function runReasonLabel(reason) {
		  if (reason === null || reason === "") return null;
		  return RUN_REASON_LABEL[reason] ?? reason;
		}
		var MATURITY_LEVEL_LABEL = {
		  stable: "\u53EF\u7528\uFF08\u771F\u5B9E\u5939\u5177 + \u5192\u70DF\u9A8C\u8BC1\uFF09",
		  calibrated: "\u5DF2\u6821\u51C6\uFF08\u63A2\u9488/\u5939\u5177\u9A8C\u8BC1\uFF0C\u7F3A\u53E3\u89C1\u5907\u6CE8\uFF09",
		  experimental: "\u5B9E\u9A8C\uFF08\u672A\u9A8C\u8BC1\u6216\u90E8\u5206\u672A\u5B9E\u73B0\uFF0C\u53EF\u80FD\u8FD4\u56DE\u7A7A\uFF09",
		  disabled: "\u505C\u7528\uFF08\u5E73\u53F0\u4FA7\u4E0D\u53EF\u7528\uFF0C\u9700\u6539\u914D\u7F6E\u624D\u542F\u7528\uFF09"
		};
		function maturityNeedsWarning(level) {
		  return level === "experimental" || level === "disabled";
		}
		var JOB_FLAG_TYPES = [
		  "outsourcing",
		  "fraud",
		  "zombie",
		  "salary_inflation",
		  "jargon_hit"
		];
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
		var RESUME_TEMPLATES = ["concise", "professional"];
		var RESUME_TEMPLATE_LABEL = {
		  concise: "\u7B80\u6D01",
		  professional: "\u4E13\u4E1A"
		};
		var APPLICATION_STAGES = [
		  "sent",
		  "viewed",
		  "interviewing",
		  "interviewed",
		  "offer",
		  "rejected",
		  "no_reply"
		];
		var APPLICATION_STAGE_LABEL = {
		  sent: "\u5DF2\u6295\u9012",
		  viewed: "\u5DF2\u67E5\u770B",
		  interviewing: "\u9762\u8BD5\u4E2D",
		  interviewed: "\u5DF2\u9762\u8BD5",
		  offer: "Offer",
		  rejected: "\u5DF2\u62D2\u7EDD",
		  no_reply: "\u65E0\u56DE\u590D"
		};
		var STAGE_ORDER = APPLICATION_STAGES;
		var TERMINAL_STAGES = ["offer", "rejected", "no_reply"];
		function nextStageOf(stage) {
		  const index = STAGE_ORDER.indexOf(stage);
		  if (index < 0 || index >= STAGE_ORDER.length - 1) return null;
		  const next = STAGE_ORDER[index + 1];
		  return next === void 0 || TERMINAL_STAGES.includes(next) ? null : next;
		}
		var NO_PROGRESS_DAYS = 21;
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
		var INTERVIEW_KINDS = ["onsite", "video", "phone", "other"];
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
		var REPLY_SCENARIOS = [
		  { key: "negotiate-time", label: "\u534F\u5546\u9762\u8BD5\u65F6\u95F4" },
		  { key: "salary", label: "\u8BE2\u95EE\u85AA\u8D44\u7ED3\u6784" },
		  { key: "decline", label: "\u5A49\u62D2\u9080\u7EA6" }
		];
		var REPLY_SCENARIO_LABEL = Object.fromEntries(
		  REPLY_SCENARIOS.map((item) => [item.key, item.label])
		);

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
		async function fetchHealth(signal) {
		  return await request("/health", signal === void 0 ? {} : { signal });
		}
		async function fetchToday(signal) {
		  return await request("/today", signal === void 0 ? {} : { signal });
		}
		async function fetchJobs(params, signal) {
		  const query = new URLSearchParams();
		  if (params.q !== void 0 && params.q !== "") query.set("q", params.q);
		  if (params.cities !== void 0 && params.cities.length > 0) query.set("cities", params.cities.join(","));
		  else if (params.city !== void 0 && params.city !== "") query.set("city", params.city);
		  if (params.state !== void 0 && params.state !== "") query.set("state", params.state);
		  if (params.minSalary !== void 0 && params.minSalary !== null) {
		    query.set("minSalary", String(params.minSalary));
		  }
		  if (params.excludeFlags !== void 0 && params.excludeFlags.length > 0) {
		    query.set("excludeFlags", params.excludeFlags.join(","));
		  }
		  if (params.orderBy !== void 0 && params.orderBy !== "") query.set("orderBy", params.orderBy);
		  query.set("desc", params.descending === false ? "0" : "1");
		  query.set("page", String(params.page ?? 1));
		  query.set("pageSize", String(params.pageSize ?? 20));
		  return await request(`/jobs?${query.toString()}`, signal === void 0 ? {} : { signal });
		}
		async function fetchJobCities(signal) {
		  const result = await request(
		    "/jobs/cities",
		    signal === void 0 ? {} : { signal }
		  );
		  return result.items;
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
		async function fetchPlans(signal) {
		  return await request("/plans", signal === void 0 ? {} : { signal });
		}
		async function createPlan(input) {
		  return await request("/plans", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		}
		async function updatePlan(id, input) {
		  return await request(
		    `/plans/${String(id)}`,
		    { method: "PATCH", body: JSON.stringify(input) }
		  );
		}
		async function deletePlan(id) {
		  await request(`/plans/${String(id)}`, { method: "DELETE" });
		}
		async function validatePlan(id, input) {
		  const result = await request(
		    `/plans/${String(id)}/validate`,
		    { method: "POST", body: JSON.stringify(input) }
		  );
		  return result.validation;
		}
		async function fetchCriteriaDimensions(platforms = [], signal) {
		  const query = platforms.length === 0 ? "" : `?platforms=${encodeURIComponent(platforms.join(","))}`;
		  return await request(`/criteria/dimensions${query}`, signal === void 0 ? {} : { signal });
		}
		async function runDefaultPlan() {
		  return await request("/crawl", {
		    method: "POST",
		    body: JSON.stringify({})
		  });
		}
		async function setSchedulePaused(paused, reason) {
		  const result = await request("/schedule/pause", {
		    method: "POST",
		    body: JSON.stringify(reason === void 0 ? { paused } : { paused, reason })
		  });
		  return result.status;
		}
		async function resumePlanRisk(id) {
		  const result = await request(`/plans/${String(id)}/resume`, {
		    method: "POST",
		    body: JSON.stringify({})
		  });
		  return result.plan;
		}
		async function recheckLease() {
		  const result = await request(
		    "/schedule/lease/recheck",
		    { method: "POST", body: JSON.stringify({}) }
		  );
		  return result.status;
		}
		async function takeoverLease() {
		  const result = await request(
		    "/schedule/lease/takeover",
		    { method: "POST", body: JSON.stringify({}) }
		  );
		  return result.status;
		}
		async function fetchSkipReasons(signal) {
		  return await request(
		    "/schedule/reasons",
		    signal === void 0 ? {} : { signal }
		  );
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
		async function fetchSettings(signal) {
		  return await request("/settings", signal === void 0 ? {} : { signal });
		}
		async function updateSettings(patch) {
		  const result = await request("/settings", {
		    method: "PATCH",
		    body: JSON.stringify(patch)
		  });
		  return result.settings;
		}
		async function fetchAudit(limit = 50, filter = {}, signal) {
		  const query = new URLSearchParams({ limit: String(limit) });
		  if (filter.actor !== void 0 && filter.actor !== "") query.set("actor", filter.actor);
		  if (filter.action !== void 0 && filter.action !== "") query.set("action", filter.action);
		  return await request(`/audit?${query.toString()}`, signal === void 0 ? {} : { signal });
		}
		async function fetchLlmCalls(limit = 50, signal) {
		  return await request(`/llm/calls?limit=${String(limit)}`, signal === void 0 ? {} : { signal });
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
		async function deleteFile(fileId) {
		  await request(`/files/${String(fileId)}`, { method: "DELETE" });
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
		async function extractInterview(id) {
		  const result = await request(
		    `/messages/${String(id)}/extract-interview`,
		    { method: "POST", body: JSON.stringify({}) }
		  );
		  return result.extraction;
		}
		async function draftReply(id, scenario) {
		  const result = await request(
		    `/messages/${String(id)}/draft-reply`,
		    { method: "POST", body: JSON.stringify({ scenario }) }
		  );
		  return result.draft;
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
		function analyticsQuery(filter) {
		  const query = new URLSearchParams();
		  if (filter.from !== void 0 && filter.from !== "") query.set("from", filter.from);
		  if (filter.to !== void 0 && filter.to !== "") query.set("to", filter.to);
		  if (filter.city !== void 0 && filter.city !== "") query.set("city", filter.city);
		  if (filter.keyword !== void 0 && filter.keyword !== "") query.set("q", filter.keyword);
		  if (filter.direction !== void 0 && filter.direction !== "") query.set("direction", filter.direction);
		  if (filter.resumeId !== void 0) query.set("resumeId", String(filter.resumeId));
		  const text = query.toString();
		  return text === "" ? "" : `?${text}`;
		}
		async function fetchFunnel(filter = {}, signal) {
		  return await request(`/analytics/funnel${analyticsQuery(filter)}`, signal === void 0 ? {} : { signal });
		}
		async function fetchAttribution(filter = {}, signal) {
		  return await request(
		    `/analytics/attribution${analyticsQuery(filter)}`,
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function fetchSalaryBand(filter = {}, signal) {
		  return await request(`/analytics/salary${analyticsQuery(filter)}`, signal === void 0 ? {} : { signal });
		}
		async function fetchDedupGroups(signal) {
		  return await request(
		    "/dedup/groups",
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function splitDedupMember(groupId, jobId) {
		  await request(`/dedup/groups/${String(groupId)}/split`, {
		    method: "POST",
		    body: JSON.stringify({ jobId })
		  });
		}
		async function deleteDedupGroup(groupId) {
		  await request(`/dedup/groups/${String(groupId)}`, { method: "DELETE" });
		}
		async function fetchSalaryBox(filter = {}, basis = "monthly_min", signal) {
		  const query = analyticsQuery(filter);
		  const separator = query === "" ? "?" : "&";
		  return await request(
		    `/analytics/salary/box${query}${separator}basis=${basis}`,
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function fetchSalaryBaseline(filter = {}, signal) {
		  return await request(
		    `/analytics/salary/baseline${analyticsQuery(filter)}`,
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function fetchResumeCompare(filter = {}, signal) {
		  return await request(
		    `/analytics/resume/compare${analyticsQuery(filter)}`,
		    signal === void 0 ? {} : { signal }
		  );
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

		// src/client/inline-md.tsx
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function InlineMd(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_jsx_runtime3.Fragment, { children: parseInline(props.text) });
		}
		function parseInline(text) {
		  const nodes = [];
		  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
		  let cursor = 0;
		  let index = 0;
		  let match = pattern.exec(text);
		  while (match !== null) {
		    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
		    const bold = match[1];
		    const code = match[2];
		    if (bold !== void 0) {
		      nodes.push(/* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: bold }, `b${String(index)}`));
		    } else if (code !== void 0) {
		      nodes.push(
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { className: "jh-inline-code", children: code }, `c${String(index)}`)
		      );
		    }
		    index += 1;
		    cursor = match.index + match[0].length;
		    match = pattern.exec(text);
		  }
		  if (cursor < text.length) nodes.push(text.slice(cursor));
		  return nodes;
		}

		// src/client/screens/tailor-panel.tsx
		var import_jsx_runtime4 = require("react/jsx-runtime");
		function TailorPanel(props) {
		  const [items, setItems] = (0, import_react2.useState)([]);
		  const [busy, setBusy] = (0, import_react2.useState)(null);
		  const [error, setError] = (0, import_react2.useState)(null);
		  const [notice, setNotice] = (0, import_react2.useState)(null);
		  const [copied, setCopied] = (0, import_react2.useState)(false);
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
		  const copySuggestions = async () => {
		    if (latest === void 0) return;
		    const lines = [];
		    if (latest.notes.length > 0) {
		      lines.push("\u6539\u52A8\u5EFA\u8BAE\uFF1A");
		      lines.push(...latest.notes.map((note) => `\xB7 ${note}`));
		    }
		    lines.push("\u8C03\u6574\u540E\u7684\u6280\u80FD\u987A\u5E8F\uFF1A");
		    lines.push(latest.content.skills.slice(0, 12).map((s) => s.name).join("\u3001"));
		    const text = lines.join("\n");
		    try {
		      await navigator.clipboard.writeText(text);
		    } catch {
		      const area = document.createElement("textarea");
		      area.value = text;
		      document.body.appendChild(area);
		      area.select();
		      document.execCommand("copy");
		      document.body.removeChild(area);
		    }
		    setCopied(true);
		    window.setTimeout(() => setCopied(false), 2e3);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "jh-tailor", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { className: "jh-card-title", children: "\u7B80\u5386\u5B9A\u5236" }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-detail-actions", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
		      latest === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-ok", children: notice }),
		    busy === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: "jh-muted", children: [
		      busy,
		      "\u2026"
		    ] }),
		    latest === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(InlineMd, { text: "\u8FD8\u6CA1\u6709\u9488\u5BF9\u8FD9\u4E2A\u5C97\u4F4D\u7684\u5B9A\u5236\u5EFA\u8BAE\u3002\u5B9A\u5236\u53EA\u6539**\u987A\u5E8F\u4E0E\u63AA\u8F9E**\uFF0C\u4E0D\u4F1A\u65B0\u589E\u4EFB\u4F55\u4F60\u6CA1\u5199\u8FC7\u7684\u7ECF\u5386\u3002" }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: "jh-muted", children: [
		        "\u6700\u65B0\u5EFA\u8BAE #",
		        latest.id,
		        "\uFF08\u6765\u6E90\uFF1A",
		        latest.via === "llm" ? "\u6A21\u578B" : "\u89C4\u5219",
		        "\uFF09",
		        latest.adopted ? " \xB7 \u5DF2\u91C7\u7528" : "",
		        latest.createdAt === "" ? "" : ` \xB7 ${latest.createdAt.slice(0, 16).replace("T", " ")}`
		      ] }),
		      latest.notes.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "jh-tailor-notes", children: latest.notes.map((note, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { children: [
		        "\xB7 ",
		        note
		      ] }, String(index))) }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: "jh-muted", children: [
		        "\u8C03\u6574\u540E\u7684\u6280\u80FD\u987A\u5E8F\uFF1A",
		        latest.content.skills.slice(0, 12).map((skill) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "jh-tailor-skill", children: skill.name }, skill.name))
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "jh-detail-actions", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void copySuggestions(),
		            children: copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u5EFA\u8BAE"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
		var import_jsx_runtime5 = require("react/jsx-runtime");
		var TZ_PRESETS = [
		  { label: "\u7EBD\u7EA6 New York", tz: "America/New_York" },
		  { label: "\u829D\u52A0\u54E5 Chicago", tz: "America/Chicago" },
		  { label: "\u6D1B\u6749\u77F6 Los Angeles", tz: "America/Los_Angeles" },
		  { label: "\u4F26\u6566 London", tz: "Europe/London" },
		  { label: "\u5DF4\u9ECE Paris", tz: "Europe/Paris" },
		  { label: "\u67CF\u6797 Berlin", tz: "Europe/Berlin" },
		  { label: "\u65B0\u52A0\u5761 Singapore", tz: "Asia/Singapore" },
		  { label: "\u9999\u6E2F Hong Kong", tz: "Asia/Hong_Kong" },
		  { label: "\u4E1C\u4EAC Tokyo", tz: "Asia/Tokyo" },
		  { label: "\u6089\u5C3C Sydney", tz: "Australia/Sydney" }
		];
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
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { className: "jh-card-title", children: "\u6821\u62DB\u652F\u7EBF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(InlineMd, { text: "\u79CB\u62DB\u6625\u62DB\u662F**\u786C\u65F6\u95F4\u7A97**\uFF0C\u7B14\u8BD5\u4E0E\u4E09\u65B9\u662F**\u4E0D\u53EF\u9006\u8282\u70B9** \u2014\u2014 \u8FD9\u4E00\u5C4F\u7684\u91CD\u5FC3\u5C31\u662F\u522B\u9519\u8FC7\u3002" }) })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "jh-card-title", children: "\u786C\u622A\u6B62" }),
		      deadlines.length === 0 && missed.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-ok", children: "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u7B14\u8BD5/\u6D4B\u8BC4\u622A\u6B62\u3002" }) : null,
		      deadlines.length === 0 && missed.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u622A\u6B62\u3002" }) : null,
		      deadlines.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "jh-deadlines", children: deadlines.map((deadline) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		        "li",
		        {
		          className: `jh-deadline${deadline.hoursLeft < 0 ? " jh-deadline-overdue" : deadline.hoursLeft <= 24 ? " jh-deadline-urgent" : ""}`,
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: deadline.hoursLeft < 0 ? "\u26D4 \u5DF2\u8FC7\u671F" : deadline.hoursLeft <= 24 ? "\u26A0 \u7D27\u6025" : "\xB7" }),
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
		      missed.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-error", children: "\u5DF2\u9519\u8FC7\uFF08\u7EC8\u6001\uFF0C\u4E0D\u53EF\u6539\u56DE\uFF09\uFF1A" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "jh-deadlines", children: missed.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { className: "jh-deadline jh-deadline-overdue", children: [
		          "\u26D4 ",
		          entry.label,
		          "\uFF5C",
		          entry.assessment.dueAt?.slice(0, 16).replace("T", " ") ?? ""
		        ] }, entry.assessment.id)) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: "\u7B14\u8BD5/\u6D4B\u8BC4\u9519\u8FC7\u5C31\u662F\u7EC8\u6001\uFF08\xA712.7\uFF09\uFF0C\u6CA1\u6709\u7B2C\u4E8C\u6B21\u673A\u4F1A\u3002" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "jh-card-title", children: "\u6279\u6B21\u65F6\u95F4\u7A97" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: windows.map(
		        (window2) => `${CAMPUS_BATCH_LABEL[window2.batch]} ${String(window2.count)} \u6761\uFF08${String(window2.openCount)} \u4E2A\u8FD8\u6CA1\u7F51\u7533\uFF09${window2.nextCloseAt === null ? "" : `\uFF0C\u6700\u8FD1\u622A\u6B62 ${window2.nextCloseAt.slice(0, 10)}`}`
		      ).join("\u3000|\u3000") }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            "aria-label": "\u516C\u53F8\u540D",
		            placeholder: "\u516C\u53F8\u540D",
		            value: name2,
		            onChange: (event) => setName(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "date",
		            "aria-label": "\u7F51\u7533\u622A\u6B62\u65E5\u671F",
		            title: "\u7F51\u7533\u622A\u6B62",
		            value: closeAt,
		            onChange: (event) => setCloseAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		    data.state.status !== "ok" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u6821\u62DB\u8BB0\u5F55\u2026" }) : items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6821\u62DB\u8BB0\u5F55\u3002\u4E0A\u9762\u586B\u4E00\u4E2A\u516C\u53F8\u540D\u5C31\u80FD\u5F00\u59CB\u8DDF\u8E2A\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "jh-campus-list", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { className: "jh-campus-item", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-message-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: item.companyName ?? item.note ?? `#${String(item.id)}` }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-badge", children: CAMPUS_BATCH_LABEL[item.batch] }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-muted", children: CAMPUS_STAGE_LABEL[item.stage] }),
		        item.applyCloseAt === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "jh-muted", children: [
		          "\u7F51\u7533\u622A\u6B62 ",
		          item.applyCloseAt.slice(0, 10)
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-detail-actions", children: [
		        ["applied", "assessment_pending", "interview_pending", "final", "closed"].map((stage) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            onClick: () => setDueFor(dueFor === item.id ? null : item.id),
		            children: dueFor === item.id ? "\u6536\u8D77" : "\u52A0\u7B14\u8BD5"
		          }
		        )
		      ] }),
		      dueFor === item.id ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            title: "\u7B14\u8BD5\u622A\u6B62\uFF08\u5FC5\u586B \u2014\u2014 \u6CA1\u6709\u622A\u6B62\u65F6\u95F4\u7684\u7B14\u8BD5\u505A\u4E0D\u51FA\u63D0\u9192\uFF09",
		            value: dueAt,
		            onChange: (event) => setDueAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		      item.assessments.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "jh-tailor-notes", children: item.assessments.map((assessment) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        "\xB7 ",
		        ASSESSMENT_KIND_LABEL[assessment.kind],
		        "\uFF5C",
		        ASSESSMENT_STATE_LABEL[assessment.state],
		        "\uFF5C \u622A\u6B62 ",
		        assessment.dueAt?.slice(0, 16).replace("T", " ") ?? "\u672A\u586B",
		        assessment.state === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "jh-card-title", children: "\u4E09\u65B9\u534F\u8BAE" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(InlineMd, { text: "\u4E09\u65B9\u662F**\u4E0D\u53EF\u9006**\u8282\u70B9\uFF1A\u7B7E\u7F72\u524D\u540E\u5FC5\u987B\u663E\u8457\u533A\u5206\uFF0C\u8FDD\u7EA6\u6709\u771F\u5B9E\u4EE3\u4EF7\u3002\u771F\u7684\u8FDD\u7EA6\u8BF7\u6807\u300C\u8FDD\u7EA6\u300D\uFF0C\u4E0D\u8981\u6539\u56DE\u5F85\u7B7E\u3002" }) }),
		      tripartite.state.status === "ok" && tripartite.state.data.items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "jh-tailor-notes", children: tripartite.state.data.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        "\xB7 #",
		        item.id,
		        "\uFF5C",
		        TRIPARTITE_STATE_LABEL[item.state],
		        "\uFF5C",
		        item.signDeadline === null ? "\u65E0\u622A\u6B62" : `\u7B7E\u7F72\u622A\u6B62 ${item.signDeadline.slice(0, 10)}`,
		        item.penaltySummary === null ? "" : `\uFF5C${item.penaltySummary}`,
		        item.state === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		      ] }, item.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		  const [letterCopied, setLetterCopied] = (0, import_react4.useState)(false);
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
		  const copyText = async (text) => {
		    try {
		      await navigator.clipboard.writeText(text);
		    } catch {
		      const area = document.createElement("textarea");
		      area.value = text;
		      document.body.appendChild(area);
		      area.select();
		      document.execCommand("copy");
		      document.body.removeChild(area);
		    }
		  };
		  const copyLetter = async () => {
		    if (letter === null) return;
		    await copyText(letter);
		    setLetterCopied(true);
		    window.setTimeout(() => setLetterCopied(false), 2e3);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "jh-tailor", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "jh-card-title", children: "\u6D77\u5916 / \u8FDC\u7A0B" }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-detail-actions", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy,
		          onClick: () => void run(
		            async () => await draftCoverLetter({ jobId: props.jobId, language: "en" }),
		            (value) => {
		              setLetter(value.content);
		              setLetterCopied(false);
		            }
		          ),
		          children: "\u751F\u6210 Cover Letter"
		        }
		      )
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-error", children: error }),
		    analysis === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-muted", children: [
		        "\u5DE5\u7B7E\u7ACB\u573A\uFF1A",
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: VISA_STANCE_LABEL[analysis.stance] ?? analysis.stance }),
		        "\uFF5C\u5DE5\u4F5C\u6A21\u5F0F\uFF1A",
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: REMOTE_KIND_LABEL[analysis.remoteKind] ?? analysis.remoteKind })
		      ] }),
		      analysis.evidence.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-muted", children: [
		        "\u4F9D\u636E\uFF1A",
		        analysis.evidence.join("\u3001")
		      ] }),
		      analysis.uncertainty === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-warn", children: analysis.uncertainty })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: "\u9762\u8BD5\u65F6\u95F4\u53CC\u91CD\u6362\u7B97\uFF08\u7B97\u9519\u65F6\u533A = \u76F4\u63A5\u9519\u8FC7\u9762\u8BD5\uFF09\uFF1A" }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            value: interviewAt,
		            onChange: (event) => setInterviewAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
		          "select",
		          {
		            className: "jh-select jh-input-sm",
		            "aria-label": "\u5E38\u7528\u57CE\u5E02\u65F6\u533A\u9884\u8BBE",
		            value: TZ_PRESETS.some((p) => p.tz === tz) ? tz : "",
		            onChange: (event) => setTz(event.target.value),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: "\u9009\u5E38\u7528\u57CE\u5E02\u2026" }),
		              TZ_PRESETS.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: preset.tz, children: preset.label }, preset.tz))
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { className: "jh-input", value: tz, onChange: (event) => setTz(event.target.value), placeholder: "America/New_York", "aria-label": "\u65F6\u533A\uFF08IANA\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		      display === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-muted", children: [
		        "\u5BF9\u65B9 ",
		        display.counterpart,
		        "\uFF5C\u672C\u5730 ",
		        display.local,
		        "\uFF5C\u65F6\u5DEE ",
		        display.diffHours,
		        " \u5C0F\u65F6",
		        display.warning === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("b", { className: "jh-warn", children: [
		          " \u26A0 ",
		          display.warning
		        ] })
		      ] })
		    ] }),
		    letter === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-tv-draft", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "jh-copy-head", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-tiny",
		          onClick: () => void copyLetter(),
		          children: letterCopied ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u5168\u6587"
		        }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("pre", { className: "jh-tv-pre", children: letter })
		    ] })
		  ] });
		}

		// src/client/use-dialog-a11y.ts
		var import_react5 = require("react");
		function useDialogA11y(dialogRef, onClose, deps = []) {
		  const restoreRef = (0, import_react5.useRef)(null);
		  const closeRef = (0, import_react5.useRef)(onClose);
		  closeRef.current = onClose;
		  (0, import_react5.useEffect)(() => {
		    restoreRef.current = document.activeElement;
		    dialogRef.current?.focus();
		    const focusables = () => {
		      const root = dialogRef.current;
		      if (root === null) return [];
		      return [...root.querySelectorAll("button, input, select, textarea, a[href], [tabindex]")].filter(
		        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && // offsetParent 为 null 表示被隐藏（CSS 折叠），不该进焦点序列
		        (el.offsetParent !== null || el === document.activeElement)
		      );
		    };
		    const onKeyDown = (event) => {
		      if (event.key === "Escape") {
		        event.stopPropagation();
		        closeRef.current();
		        return;
		      }
		      if (event.key !== "Tab") return;
		      const root = dialogRef.current;
		      if (root === null) return;
		      const list = focusables();
		      if (list.length === 0) {
		        event.preventDefault();
		        root.focus();
		        return;
		      }
		      const first = list[0];
		      const last = list[list.length - 1];
		      const active = document.activeElement;
		      if (first === void 0 || last === void 0) return;
		      if (!root.contains(active)) {
		        event.preventDefault();
		        first.focus();
		        return;
		      }
		      if (!event.shiftKey && active === last) {
		        event.preventDefault();
		        first.focus();
		        return;
		      }
		      if (event.shiftKey && (active === first || active === root)) {
		        event.preventDefault();
		        last.focus();
		      }
		    };
		    document.addEventListener("keydown", onKeyDown, true);
		    return () => {
		      document.removeEventListener("keydown", onKeyDown, true);
		      const previous = restoreRef.current;
		      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
		    };
		  }, deps);
		}

		// src/client/screens/job-detail.tsx
		var import_jsx_runtime6 = require("react/jsx-runtime");
		var ACTION_STATES = ["saved", "ignored", "seen", "archived"];
		var FLAG_TONE = {
		  fraud: "error",
		  outsourcing: "warn",
		  salary_inflation: "warn",
		  zombie: "quiet",
		  jargon_hit: "quiet"
		};
		function Hint(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-hint", role: "img", "aria-label": props.text, title: props.text, children: "?" });
		}
		function Gauge(props) {
		  const clamped = Math.max(0, Math.min(100, Math.round(props.score)));
		  const band = clamped >= 70 ? "high" : clamped >= 45 ? "mid" : "low";
		  const radius = 30;
		  const circumference = 2 * Math.PI * radius;
		  const filled = clamped / 100 * circumference;
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: `jh-gauge jh-gauge-${band}`, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("svg", { width: "72", height: "72", viewBox: "0 0 72 72", "aria-hidden": "true", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("circle", { className: "jh-gauge-track", cx: "36", cy: "36", r: radius, fill: "none", strokeWidth: "7" }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-gauge-num", children: [
		      clamped,
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-gauge-unit", children: "\u7C97\u7B5B\u5206" })
		    ] })
		  ] });
		}
		function JobDetailBody(props) {
		  const { state, reload } = useAsync((signal) => fetchJobDetail(props.id, signal), [props.id, props.revision]);
		  const [busy, setBusy] = (0, import_react6.useState)(null);
		  const [failure, setFailure] = (0, import_react6.useState)(null);
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
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u8BE6\u60C5\u2026" });
		  }
		  if (state.status === "error") {
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-error", children: state.message }),
		      state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-muted", children: state.hint }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "jh-btn", onClick: reload, children: "\u91CD\u8BD5" })
		    ] });
		  }
		  const { job, company, flags, matchReasons } = state.data;
		  const grouped = splitJobTags(job.tags);
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("header", { className: "jh-detail-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-detail-headline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { className: "jh-detail-title", children: job.title }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-detail-salary", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("b", { className: "jh-salary", children: job.salaryRaw }),
		          salaryDetail(job) === null ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "jh-muted", children: [
		            "\uFF08",
		            salaryDetail(job),
		            "\uFF09"
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "jh-detail-actions", children: ACTION_STATES.map((action) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
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
		    failure === null ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-error", children: failure }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("ul", { className: "jh-kv", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u516C\u53F8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: job.companyName ?? "\u2014" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5730\u70B9" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
		          job.city,
		          job.district === "" ? "" : `\xB7${job.district}`
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u7ECF\u9A8C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: job.expReq === "" ? "\u2014" : job.expReq })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5B66\u5386" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: job.eduReq === "" ? "\u2014" : job.eduReq })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u53D1\u5E03" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: job.publishedAt ?? "\u2014" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u9996\u6B21\u89C1\u5230" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: job.firstSeenAt })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5F53\u524D\u72B6\u6001" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: JOB_STATE_LABEL[job.state] })
		      ] })
		    ] }),
		    job.tags.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      grouped.skills.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-tag-group", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-tag-group-name", children: "\u6280\u80FD\u8981\u6C42" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "jh-tags", children: grouped.skills.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-tag", children: tag }, tag)) })
		      ] }),
		      grouped.benefits.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-tag-group", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-tag-group-name", children: "\u516C\u53F8\u798F\u5229" }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "jh-tags", children: grouped.benefits.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-tag", children: tag }, tag)) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { className: "jh-card-title", children: "L1 \u7C97\u7B5B\u5206" }),
		      job.matchScore === null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-note", children: "\u8FD8\u6CA1\u6709\u7B97\u8FC7 \u2014\u2014 \u91C7\u96C6\u540E\u4F1A\u968F\u6807\u6CE8\u4E00\u8D77\u7B97\u51FA\u6765\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-gauge-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Gauge, { score: job.matchScore }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-gauge-side", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-gauge-band", children: job.matchScore >= 70 ? "\u672C\u8F6E\u89C4\u5219\u91CC\u9760\u524D" : job.matchScore >= 45 ? "\u4E2D\u7B49" : "\u504F\u4F4E" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { className: "jh-note", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(InlineMd, { text: "\u6309\u89C4\u5219\u7B97\u51FA\u6765\u7684**\u7C97\u7B5B\u5206**\uFF0C\u4E0B\u9762\u662F\u9010\u6761\u52A0\u51CF\u5206\u3002" }),
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		              Hint,
		              {
		                text: "\u7EAF\u89C4\u5219\u6253\u5206\uFF08\u57CE\u5E02 / \u85AA\u8D44 / \u5173\u952E\u8BCD\u547D\u4E2D\u7387\uFF09\uFF0C\u5168\u91CF\u9002\u7528\u3001\u96F6\u6210\u672C\u3002\u8BED\u4E49\u7EA7\u7684\u7CBE\u8BC4\u8981\u7B49 L2\uFF0C\u6240\u4EE5\u8FD9\u91CC\u6807\u7684\u662F\u300C\u7C97\u7B5B\u5206\u300D\u800C\u4E0D\u662F\u300C\u5339\u914D\u5EA6\u300D\u3002"
		              }
		            )
		          ] })
		        ] })
		      ] }),
		      matchReasons.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "jh-reasons", children: matchReasons.map((reason, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
		        "li",
		        {
		          className: `jh-reason jh-reason-${reason.kind}${reason.kind === "hit" ? " jh-reason-ok" : " jh-reason-bad"}`,
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-reason-mark", children: reason.kind === "hit" ? "\u2713" : "\u2715" }),
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-reason-weight", children: reason.weight > 0 ? `+${String(reason.weight)}` : reason.weight < 0 ? String(reason.weight) : "\xB7" }),
		            reason.text
		          ]
		        },
		        `${reason.kind}-${String(index)}`
		      )) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { className: "jh-card-title", children: "\u6807\u6CE8\u4E0E\u4F9D\u636E" }),
		      flags.length === 0 ? (
		        // 刻意不刷成绿色：绿色等于宣布"这个岗位没问题"，而规则没命中只说明"没命中已知模式"。
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-alert jh-alert-quiet", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-alert-title", children: "\u6CA1\u6709\u547D\u4E2D\u4EFB\u4F55\u5DF2\u77E5\u98CE\u9669\u7279\u5F81" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-alert-body", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(InlineMd, { text: "\u8FD9\u4E0D\u7B49\u4E8E\u300C\u6CA1\u95EE\u9898\u300D\u3002\u8BC6\u522B\u4F9D\u636E\u5206\u4E24\u5C42\uFF1A**\u6587\u672C\u5C42**\u6765\u81EA\u8BCD\u8868\u547D\u4E2D\u7684\u539F\u6587\u7247\u6BB5\uFF0C**\u7EDF\u8BA1\u5C42**\u6765\u81EA\u516C\u53F8\u7EF4\u5EA6\uFF08\u5C97\u4F4D\u6570\u3001\u5730\u57DF\u8DE8\u5EA6\u3001\u9A7B\u573A\u6BD4\u4F8B\uFF09\uFF1B\u4E24\u8005\u90FD\u6CA1\u6709\u547D\u4E2D\u65F6\uFF0C\u8FD9\u91CC\u662F\u7A7A\u7684\u3002" }) })
		        ] })
		      ) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
		        flags.map((flag) => {
		          const tone = FLAG_TONE[flag.flagType] ?? "quiet";
		          return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: `jh-alert jh-alert-${tone}`, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-alert-head", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: `jh-flag jh-flag-${flag.flagType}`, children: JOB_FLAG_LABEL[flag.flagType] }),
		              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "jh-alert-title", children: [
		                "\u5F3A\u5EA6 ",
		                flag.score
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "jh-evidence", children: flag.evidence.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("li", { children: item }, `${flag.flagType}-${String(index)}`)) })
		          ] }, flag.flagType);
		        }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { className: "jh-note", children: [
		          "\u6BCF\u6761\u7ED3\u8BBA\u90FD\u9644\u539F\u6587\u6216\u7EDF\u8BA1\u4F9D\u636E\u3002",
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		            Hint,
		            {
		              text: "\u8BC6\u522B\u4F9D\u636E\u5206\u4E24\u5C42\uFF1A\u6587\u672C\u5C42\u6765\u81EA\u8BCD\u8868\u547D\u4E2D\u7684\u539F\u6587\u7247\u6BB5\uFF0C\u7EDF\u8BA1\u5C42\u6765\u81EA\u516C\u53F8\u7EF4\u5EA6\uFF08\u5C97\u4F4D\u6570\u3001\u5730\u57DF\u8DE8\u5EA6\u3001\u9A7B\u573A\u6BD4\u4F8B\uFF09\u3002\u5F3A\u5EA6\u662F\u89C4\u5219\u6743\u91CD\uFF0C\u4E0D\u662F\u6982\u7387\u3002"
		            }
		          )
		        ] })
		      ] })
		    ] }),
		    company === null ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { className: "jh-card-title", children: "\u516C\u53F8\u753B\u50CF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("ul", { className: "jh-kv", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5F52\u4E00\u5316\u540D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: company.nameNorm })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u884C\u4E1A" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: company.industry ?? "\u2014" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u6027\u8D28" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: company.nature ?? "\u2014" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u89C4\u6A21" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: company.size ?? "\u2014" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5728\u624B\u5C97\u4F4D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: company.jobCount })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u6280\u672F\u6808\u5E7F\u5EA6" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: company.stackDiversity })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5730\u57DF\u8DE8\u5EA6" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: company.geoSpread })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u9A7B\u573A\u6BD4\u4F8B" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: company.onsiteRatio === null ? "\u2014" : `${String(Math.round(company.onsiteRatio * 100))}%` })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u540D\u79F0\u5173\u952E\u8BCD" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: company.nameKeywordHits })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5916\u5305\u5206 / \u8BC8\u9A97\u5206" }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
		            String(company.outsourcingScore ?? 0),
		            " / ",
		            String(company.fraudScore ?? 0)
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-note", children: "\u51B7\u542F\u52A8\u65F6\u7EDF\u8BA1\u4FE1\u53F7\u5F31\uFF08D-16\uFF09\uFF1A\u5C97\u4F4D\u8D8A\u591A\u5224\u65AD\u8D8A\u51C6\uFF0C\u4F9D\u636E\u4E0D\u8DB3\u65F6\u8FD9\u4E9B\u6570\u5B57\u4F1A\u504F\u4F4E\u3002" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(TailorPanel, { jobId: props.id, revision: props.revision, onChanged: props.onChanged }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(OverseasPanel, { jobId: props.id, onChanged: props.onChanged }),
		    job.scoreStale ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-warn", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(InlineMd, { text: "\u8FD9\u4E2A\u5339\u914D\u5206\u662F**\u65E7\u7248\u7B80\u5386**\u4E0B\u7B97\u51FA\u6765\u7684 \u2014\u2014 \u7B80\u5386\u6539\u8FC7\u4E4B\u540E\u5B83\u5C31\u4E0D\u518D\u6709\u6548\u3002\u7528\u300C\u91CD\u7B97\u300D\u6216\u5728\u5BF9\u8BDD\u91CC\u8BA9\u6A21\u578B\u8DD1 `job_match_explain` \u624D\u662F\u5F53\u524D\u5206\u6570\u3002" }) }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { className: "jh-note", children: [
		      "\u539F\u59CB\u9875\u9762\uFF1A",
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("a", { className: "jh-link", href: job.sourceUrl, target: "_blank", rel: "noreferrer noopener", children: job.sourceUrl })
		    ] })
		  ] });
		}
		function JobDetailPane(props) {
		  if (props.id === null) {
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: "jh-detail-pane jh-detail-pane-empty", "data-job-hunter": "job-detail", "aria-label": "\u5C97\u4F4D\u8BE6\u60C5", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-detail-empty-title", children: "\u4ECE\u5DE6\u4FA7\u9009\u4E00\u4E2A\u5C97\u4F4D" }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-note", children: "\u8BE6\u60C5\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\uFF0C\u5217\u8868\u4FDD\u6301\u4E0D\u52A8\uFF0C\u65B9\u4FBF\u4E00\u4E2A\u4E2A\u5F80\u4E0B\u6BD4\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "jh-note", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(InlineMd, { text: "\u5217\u8868\u4E0A\u7684\u300C\u7C97\u7B5B\u5206\u300D\u4E0E\u98CE\u9669\u6807\u6CE8\u53EA\u662F\u521D\u7B5B\uFF1B\u70B9\u8FDB\u6765\u80FD\u770B\u5230\u6BCF\u4E00\u6761\u7ED3\u8BBA\u7684**\u539F\u6587\u4F9D\u636E**\u3002" }) })
		    ] });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("section", { className: "jh-detail-pane", "data-job-hunter": "job-detail", "aria-label": "\u5C97\u4F4D\u8BE6\u60C5", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(JobDetailBody, { id: props.id, revision: props.revision, onChanged: props.onChanged }) });
		}
		function JobDetailDrawer(props) {
		  const dialogRef = (0, import_react6.useRef)(null);
		  useDialogA11y(dialogRef, props.onClose, [props.id]);
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "jh-drawer-layer", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "jh-drawer-backdrop", "aria-label": "\u5173\u95ED\u8BE6\u60C5", onClick: props.onClose }),
		    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
		      "aside",
		      {
		        className: "jh-drawer",
		        role: "dialog",
		        "aria-modal": "true",
		        "aria-label": "\u5C97\u4F4D\u8BE6\u60C5",
		        tabIndex: -1,
		        ref: dialogRef,
		        "data-job-hunter": "job-drawer",
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("header", { className: "jh-drawer-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "jh-drawer-title", children: "\u5C97\u4F4D\u8BE6\u60C5" }),
		            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "jh-icon-btn", "aria-label": "\u5173\u95ED", onClick: props.onClose, children: "\xD7" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "jh-drawer-body", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(JobDetailBody, { id: props.id, revision: props.revision, onChanged: props.onChanged }) })
		        ]
		      }
		    )
		  ] });
		}

		// src/client/screens/jobs.tsx
		var import_react7 = require("react");
		var import_jsx_runtime7 = require("react/jsx-runtime");
		var EMPTY_FILTERS = {
		  q: "",
		  cities: [],
		  state: "",
		  minSalary: "",
		  excludeFlags: [],
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
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("nav", { className: "jh-pager", "aria-label": "\u5206\u9875", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
		      (item, index) => item === "\u2026" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-pg-gap", children: "\u2026" }, `gap-${String(index)}`) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
		  const [draft, setDraft] = (0, import_react7.useState)(EMPTY_FILTERS);
		  const [applied, setApplied] = (0, import_react7.useState)(EMPTY_FILTERS);
		  const [page, setPage] = (0, import_react7.useState)(1);
		  const { state, reload } = useAsync(
		    (signal) => fetchJobs(
		      {
		        q: applied.q,
		        cities: applied.cities,
		        state: applied.state,
		        minSalary: applied.minSalary === "" ? null : Number(applied.minSalary),
		        excludeFlags: applied.excludeFlags,
		        orderBy: applied.orderBy,
		        descending: applied.descending,
		        page,
		        pageSize: PAGE_SIZE
		      },
		      signal
		    ),
		    [props.revision, applied, page]
		  );
		  const knownCities = useAsync((signal) => fetchJobCities(signal), []);
		  const citiesAll = knownCities.state.status === "ok" ? knownCities.state.data : [];
		  const toggleCity = (city) => {
		    setDraft((current) => ({
		      ...current,
		      cities: current.cities.includes(city) ? current.cities.filter((item) => item !== city) : [...current.cities, city]
		    }));
		  };
		  const toggleExclude = (type) => {
		    setDraft((current) => ({
		      ...current,
		      excludeFlags: current.excludeFlags.includes(type) ? current.excludeFlags.filter((item) => item !== type) : [...current.excludeFlags, type]
		    }));
		  };
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
		  const [marking, setMarking] = (0, import_react7.useState)(null);
		  const quickMark = async (id, state2) => {
		    setMarking(id);
		    try {
		      await markJob(id, state2);
		      props.onChanged();
		    } catch {
		      props.onChanged();
		    } finally {
		      setMarking(null);
		    }
		  };
		  const total = state.status === "ok" ? state.data.total : 0;
		  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-jobs-split", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("form", { className: "jh-filters", onSubmit: submit, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        "input",
		        {
		          className: "jh-input jh-input-grow",
		          placeholder: "\u5173\u952E\u8BCD\uFF08\u5C97\u4F4D\u540D\uFF09",
		          "aria-label": "\u5173\u952E\u8BCD",
		          value: draft.q,
		          onChange: (event) => setDraft({ ...draft, q: event.target.value })
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
		        "select",
		        {
		          className: "jh-select jh-input-sm",
		          "aria-label": "\u72B6\u6001",
		          value: draft.state,
		          onChange: (event) => setDraft({ ...draft, state: event.target.value }),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "", children: "\u5168\u90E8\u72B6\u6001" }),
		            JOB_STATES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value, children: JOB_STATE_LABEL[value] }, value))
		          ]
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        "select",
		        {
		          className: "jh-select jh-input-sm",
		          "aria-label": "\u6392\u5E8F",
		          value: draft.orderBy,
		          onChange: (event) => setDraft({ ...draft, orderBy: event.target.value }),
		          children: ORDER_OPTIONS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: option.value, children: option.label }, option.value))
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "submit", className: "jh-btn jh-btn-inline jh-btn-primary", children: "\u7B5B\u9009" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline jh-btn-quiet", onClick: reset, children: "\u91CD\u7F6E" }),
		      citiesAll.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-filter-row", role: "group", "aria-label": "\u57CE\u5E02\uFF08\u53EF\u591A\u9009\uFF09", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-filter-label", children: "\u57CE\u5E02" }),
		        citiesAll.map((city) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-chip${draft.cities.includes(city) ? " jh-chip-on" : ""}`,
		            "aria-pressed": draft.cities.includes(city),
		            onClick: () => toggleCity(city),
		            children: city
		          },
		          city
		        ))
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-filter-row", role: "group", "aria-label": "\u5C4F\u853D\u6807\u6CE8", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-filter-label", children: "\u5C4F\u853D" }),
		        JOB_FLAG_TYPES.map((type) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-chip${draft.excludeFlags.includes(type) ? " jh-chip-on" : ""}`,
		            "aria-pressed": draft.excludeFlags.includes(type),
		            title: `\u4E0D\u663E\u793A\u6807\u6CE8\u4E3A\u300C${JOB_FLAG_LABEL[type]}\u300D\u7684\u5C97\u4F4D`,
		            onClick: () => toggleExclude(type),
		            children: JOB_FLAG_LABEL[type]
		          },
		          type
		        ))
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-jobs-cols", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-jobs-pane", "data-job-hunter": "job-list", children: [
		        state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u67E5\u8BE2\u5C97\u4F4D\u2026" }),
		        state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { className: "jh-card-title", children: "\u67E5\u8BE2\u5931\u8D25" }),
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-error", children: state.message }),
		          state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: state.hint }),
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "jh-btn", onClick: reload, children: "\u91CD\u8BD5" })
		        ] }),
		        state.status === "ok" && state.data.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { className: "jh-card-title", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5C97\u4F4D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-muted", children: [
		            "\u5171 ",
		            state.data.total,
		            " \u6761\u3002\u6362\u4E2A\u5173\u952E\u8BCD\u6216\u653E\u5BBD\u7B5B\u9009\u6761\u4EF6\u8BD5\u8BD5\uFF1B\u4E5F\u53EF\u4EE5\u56DE\u5230\u300C\u4ECA\u65E5\u300D\u624B\u52A8\u6293\u53D6\u4E00\u6B21\u3002"
		          ] })
		        ] }),
		        state.status === "ok" && state.data.items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-listbar", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-muted", children: [
		              "\u5171 ",
		              state.data.total,
		              " \u6761 \xB7 \u7B2C ",
		              state.data.page,
		              " / ",
		              pages,
		              " \u9875"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Pager, { page: state.data.page, pages, hasMore: state.data.hasMore, onGo: setPage })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "jh-jobs", children: state.data.items.map((job) => {
		            const active = job.id === props.selected;
		            return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-job-row", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
		                "button",
		                {
		                  type: "button",
		                  className: `jh-job${active ? " jh-job-active" : ""}`,
		                  "data-job-id": job.id,
		                  "aria-current": active ? "true" : void 0,
		                  "aria-label": `\u5C97\u4F4D\uFF1A${job.title}\uFF0C${job.salaryRaw}\uFF0C${job.city}${job.district === "" ? "" : `\xB7${job.district}`}\uFF0C${JOB_STATE_LABEL[job.state]}`,
		                  onClick: () => props.onSelect(job.id),
		                  children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-job-main", "aria-hidden": "true", children: [
		                      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-job-title", children: job.title }),
		                      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-job-meta", children: [
		                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { className: "jh-salary", children: job.salaryRaw }),
		                        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
		                          job.city,
		                          job.district === "" ? "" : `\xB7${job.district}`
		                        ] }),
		                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-job-company", children: job.companyName ?? "\u2014" })
		                      ] }),
		                      job.tags.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-tags", children: job.tags.slice(0, 8).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "jh-tag", children: tag }, tag)) }),
		                      (job.flagTypes.length > 0 || job.matchScore !== null) && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-job-signals", children: [
		                        job.matchScore === null ? null : (
		                          // 明确写「粗筛」：L1 规则分不是完整评估（§4.5.1）
		                          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-score", children: [
		                            "\u7C97\u7B5B ",
		                            job.matchScore
		                          ] })
		                        ),
		                        job.flagTypes.map((type) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: `jh-flag jh-flag-${type}`, children: JOB_FLAG_LABEL[type] }, type))
		                      ] })
		                    ] }),
		                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: `jh-state jh-state-${job.state}`, "aria-hidden": "true", children: JOB_STATE_LABEL[job.state] })
		                  ]
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "jh-job-quick", role: "group", "aria-label": "\u5FEB\u6377\u6807\u8BB0", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: `jh-job-qk${job.state === "saved" ? " jh-job-qk-on" : ""}`,
		                    "aria-label": job.state === "saved" ? "\u53D6\u6D88\u6536\u85CF" : "\u6536\u85CF",
		                    "aria-pressed": job.state === "saved",
		                    title: job.state === "saved" ? "\u53D6\u6D88\u6536\u85CF\uFF08\u56DE\u5230\u5DF2\u8BFB\uFF09" : "\u6536\u85CF",
		                    disabled: marking === job.id,
		                    onClick: () => void quickMark(job.id, job.state === "saved" ? "seen" : "saved"),
		                    children: "\u2605"
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: `jh-job-qk${job.state === "ignored" ? " jh-job-qk-ign" : ""}`,
		                    "aria-label": job.state === "ignored" ? "\u6062\u590D" : "\u5212\u6389",
		                    "aria-pressed": job.state === "ignored",
		                    title: job.state === "ignored" ? "\u53D6\u6D88\u5212\u6389\uFF08\u56DE\u5230\u5DF2\u8BFB\uFF09" : "\u5212\u6389\uFF08\u5FFD\u7565\uFF09",
		                    disabled: marking === job.id,
		                    onClick: () => void quickMark(job.id, job.state === "ignored" ? "seen" : "ignored"),
		                    children: "\u2715"
		                  }
		                )
		              ] })
		            ] }) }, job.id);
		          }) })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(JobDetailPane, { id: props.selected, revision: props.revision, onChanged: props.onChanged })
		    ] })
		  ] });
		}

		// src/client/screens/messages.tsx
		var import_react8 = require("react");
		var import_jsx_runtime8 = require("react/jsx-runtime");
		function InboxScreen(props) {
		  const inbox = useAsync((signal) => fetchInbox({}, signal), [props.revision]);
		  const [unreadOnly, setUnreadOnly] = (0, import_react8.useState)(false);
		  const filtered = useAsync(
		    (signal) => fetchInbox({ unreadOnly }, signal),
		    [props.revision, unreadOnly]
		  );
		  const [draft, setDraft] = (0, import_react8.useState)("");
		  const [encoding, setEncoding] = (0, import_react8.useState)(false);
		  const [replyTo, setReplyTo] = (0, import_react8.useState)(null);
		  const [replyText, setReplyText] = (0, import_react8.useState)("");
		  const [draftingScenario, setDraftingScenario] = (0, import_react8.useState)(null);
		  const [busy, setBusy] = (0, import_react8.useState)(false);
		  const [error, setError] = (0, import_react8.useState)(null);
		  const [notice, setNotice] = (0, import_react8.useState)(null);
		  const [extracting, setExtracting] = (0, import_react8.useState)(null);
		  const [creating, setCreating] = (0, import_react8.useState)(false);
		  const [extractPanel, setExtractPanel] = (0, import_react8.useState)(null);
		  const patchExtract = (patch) => {
		    setExtractPanel((current) => current === null ? null : { ...current, ...patch });
		  };
		  const handleExtract = async (message) => {
		    setExtracting(message.id);
		    setError(null);
		    try {
		      const suggestion = await extractInterview(message.id);
		      setExtractPanel({
		        messageId: message.id,
		        jobId: message.jobId,
		        at: suggestion.at ?? "",
		        kind: suggestion.kind ?? "video",
		        place: suggestion.place ?? "",
		        link: suggestion.link ?? "",
		        via: suggestion.via,
		        notes: suggestion.notes
		      });
		    } catch (caught) {
		      setError(
		        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught)
		      );
		    } finally {
		      setExtracting(null);
		    }
		  };
		  const handleDraftReply = async (id, scenario) => {
		    setDraftingScenario(scenario);
		    setError(null);
		    try {
		      const draft2 = await draftReply(id, scenario);
		      setReplyText(draft2.text);
		      setNotice(
		        draft2.via === "llm" ? `\u5DF2\u6309\u300C${REPLY_SCENARIO_LABEL[scenario]}\u300D\u62DF\u7A3F\uFF08\u6A21\u578B\uFF09\u2014\u2014 \u53EF\u7F16\u8F91\u540E\u53D1\u9001\u3002` : `\u5DF2\u7528\u5185\u7F6E\u6A21\u677F\u62DF\u7A3F\uFF08\u672A\u914D\u7F6E\u6A21\u578B\uFF09\u2014\u2014 \u8BF7\u6539\u6210\u4F60\u7684\u771F\u5B9E\u8BED\u6C14\u3002`
		      );
		    } catch (caught) {
		      setError(
		        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught)
		      );
		    } finally {
		      setDraftingScenario(null);
		    }
		  };
		  const confirmInterview = async () => {
		    const panel = extractPanel;
		    if (panel === null || panel.at === "") return;
		    setCreating(true);
		    setError(null);
		    try {
		      await createInterview({
		        at: new Date(panel.at).toISOString(),
		        kind: panel.kind,
		        ...panel.jobId === null ? {} : { jobId: panel.jobId },
		        ...panel.place.trim() === "" ? {} : { place: panel.place.trim() },
		        ...panel.link.trim() === "" ? {} : { link: panel.link.trim() }
		      });
		      setNotice("\u5DF2\u52A0\u5165\u9762\u8BD5\u65E5\u7A0B \u2014\u2014 \u5EFA\u8BAE\u5230\u300C\u9762\u8BD5\u65E5\u7A0B\u300D\u91CC\u518D\u6838\u5BF9\u4E00\u904D\u65F6\u95F4\u4E0E\u5F62\u5F0F\u3002");
		      setExtractPanel(null);
		      props.onChanged();
		    } catch (caught) {
		      setError(
		        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught)
		      );
		    } finally {
		      setCreating(false);
		    }
		  };
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
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h2", { className: "jh-card-title", children: "\u6D88\u606F\u4E2D\u5FC3" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "jh-muted", children: [
		        "\u672A\u8BFB ",
		        data?.unread ?? 0,
		        " \u6761"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		        "button",
		        {
		          type: "button",
		          className: `jh-btn jh-btn-inline${unreadOnly ? " jh-btn-active" : ""}`,
		          onClick: () => setUnreadOnly((value) => !value),
		          children: "\u53EA\u770B\u672A\u8BFB"
		        }
		      )
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: "jh-card-title", children: "\u624B\u52A8\u5F55\u5165\u4E00\u6761\u6D88\u606F" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u5E73\u53F0\u6536\u4EF6\u7BB1\u7684\u81EA\u52A8\u89E3\u6790\u8FD8\u6CA1\u505A\uFF08\u5C5E\u4E8E P8\uFF09\u2014\u2014 \u73B0\u5728\u4F60\u53EF\u4EE5\u628A HR \u7684\u6D88\u606F\u8D34\u8FDB\u6765\uFF0C \u7CFB\u7EDF\u548C\u72B6\u6001\u63A8\u8FDB\u3001\u8DDF\u8FDB\u5EFA\u8BAE\u5C31\u80FD\u8054\u52A8\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		        "textarea",
		        {
		          className: "jh-textarea",
		          rows: 2,
		          "aria-label": "\u8981\u5F55\u5165\u7684\u6D88\u606F\u5185\u5BB9",
		          placeholder: "\u628A HR \u53D1\u6765\u7684\u6D88\u606F\u8D34\u5728\u8FD9\u91CC\u2026",
		          value: draft,
		          onChange: (event) => setDraft(event.target.value)
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "jh-detail-actions", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
		    data === null ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u6D88\u606F\u2026" }) : data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u6D88\u606F\u3002\u6D88\u606F\u76EE\u524D\u9760\u624B\u52A8\u5F55\u5165\uFF0C\u6216\u5728\u5C97\u4F4D\u8BE6\u60C5\u91CC\u8DDF\u8FDB\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "jh-messages", children: data.items.map((message) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { className: `jh-message jh-message-${message.direction}`, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-message-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("b", { children: message.direction === "hr" ? "HR" : "\u6211" }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-muted", children: message.at.slice(0, 16).replace("T", " ") }),
		        message.jobTitle === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-spacer" }),
		        message.readAt === null && message.direction === "hr" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy,
		            onClick: () => void run(async () => await markMessageRead(message.id), "\u5DF2\u6807\u8BB0\u5DF2\u8BFB"),
		            children: "\u6807\u8BB0\u5DF2\u8BFB"
		          }
		        ) : null,
		        message.direction === "hr" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: extracting !== null,
		            onClick: () => void handleExtract(message),
		            children: extracting === message.id ? "\u8BC6\u522B\u4E2D\u2026" : "\u8BC6\u522B\u65E5\u7A0B"
		          }
		        ) : null,
		        message.direction === "hr" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-message-body", children: message.content }),
		      message.inviteSignal?.hit === true ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-warn", children: [
		        "\u26A0 \u7591\u4F3C\u9762\u8BD5\u9080\u7EA6\uFF08\u547D\u4E2D\uFF1A",
		        message.inviteSignal.keywords.join("\u3001"),
		        "\uFF09 \u2014\u2014 \u8FD9\u53EA\u662F\u63D0\u793A\uFF0C\u6539\u72B6\u6001\u8BF7\u5230\u300C\u9762\u8BD5\u65E5\u7A0B\u300D\u91CC\u663E\u5F0F\u65B0\u5EFA\u4E00\u573A\u3002"
		      ] }) : null,
		      extractPanel !== null && extractPanel.messageId === message.id ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-message-reply", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-muted", children: [
		          "\u8BC6\u522B\u7ED3\u679C\uFF08\u6765\u6E90\uFF1A",
		          extractPanel.via === "llm" ? "\u6A21\u578B" : "\u89C4\u5219",
		          "\uFF09\u2014\u2014 \u6838\u5BF9\u540E\u786E\u8BA4\u624D\u8FDB\u65E5\u7A0B\u3002"
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-inline", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              type: "datetime-local",
		              "aria-label": "\u9762\u8BD5\u65F6\u95F4",
		              value: extractPanel.at,
		              onChange: (event) => patchExtract({ at: event.target.value })
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "select",
		            {
		              className: "jh-select jh-input-sm",
		              "aria-label": "\u9762\u8BD5\u5F62\u5F0F",
		              value: extractPanel.kind,
		              onChange: (event) => patchExtract({ kind: event.target.value }),
		              children: INTERVIEW_KINDS.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: kind, children: INTERVIEW_KIND_LABEL[kind] }, kind))
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "input",
		            {
		              className: "jh-input jh-input-sm",
		              placeholder: "\u5730\u70B9",
		              "aria-label": "\u5730\u70B9",
		              value: extractPanel.place,
		              onChange: (event) => patchExtract({ place: event.target.value })
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              placeholder: "\u4F1A\u8BAE\u94FE\u63A5",
		              "aria-label": "\u4F1A\u8BAE\u94FE\u63A5",
		              value: extractPanel.link,
		              onChange: (event) => patchExtract({ link: event.target.value })
		            }
		          )
		        ] }),
		        extractPanel.notes.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: extractPanel.notes.join("\uFF1B") }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-detail-actions", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn",
		              disabled: creating || extractPanel.at === "",
		              onClick: () => void confirmInterview(),
		              children: "\u52A0\u5165\u9762\u8BD5\u65E5\u7A0B"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-quiet",
		              disabled: creating,
		              onClick: () => setExtractPanel(null),
		              children: "\u53D6\u6D88"
		            }
		          )
		        ] })
		      ] }) : null,
		      replyTo === message.id ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-message-reply", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-chips", role: "group", "aria-label": "\u6309\u60C5\u5883\u62DF\u7A3F", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-muted", children: "\u62DF\u7A3F\uFF1A" }),
		          REPLY_SCENARIOS.map((scenario) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-tiny",
		              disabled: draftingScenario !== null,
		              onClick: () => void handleDraftReply(message.id, scenario.key),
		              children: draftingScenario === scenario.key ? "\u62DF\u7A3F\u4E2D\u2026" : REPLY_SCENARIO_LABEL[scenario.key]
		            },
		            scenario.key
		          ))
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          "textarea",
		          {
		            className: "jh-textarea",
		            rows: 2,
		            value: replyText,
		            onChange: (event) => setReplyText(event.target.value),
		            placeholder: "\u56DE\u590D\u5185\u5BB9\u2026"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
		  const [busy, setBusy] = (0, import_react8.useState)(false);
		  const [error, setError] = (0, import_react8.useState)(null);
		  const [notice, setNotice] = (0, import_react8.useState)(null);
		  const [prepId, setPrepId] = (0, import_react8.useState)(null);
		  const [at, setAt] = (0, import_react8.useState)("");
		  const [kind, setKind] = (0, import_react8.useState)("video");
		  const [commute, setCommute] = (0, import_react8.useState)("");
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
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h2", { className: "jh-card-title", children: "\u9762\u8BD5\u65E5\u7A0B" }),
		      data !== null && data.conflicts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "jh-warn", children: [
		        "\u26A0 ",
		        data.conflicts.length,
		        " \u5904\u65F6\u95F4\u51B2\u7A81"
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-ok", children: "\u6CA1\u6709\u65F6\u95F4\u51B2\u7A81" })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { className: "jh-card-title", children: "\u65B0\u589E\u4E00\u573A\u9762\u8BD5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            "aria-label": "\u9762\u8BD5\u65F6\u95F4",
		            value: at,
		            onChange: (event) => setAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("select", { className: "jh-select", "aria-label": "\u9762\u8BD5\u5F62\u5F0F", value: kind, onChange: (event) => setKind(event.target.value), children: ["onsite", "video", "phone", "other"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: item, children: INTERVIEW_KIND_LABEL[item] }, item)) }),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		          "input",
		          {
		            className: "jh-input jh-input-narrow",
		            type: "number",
		            "aria-label": "\u5355\u7A0B\u901A\u52E4\u5206\u949F\u6570",
		            placeholder: "\u901A\u52E4\u5206\u949F",
		            value: commute,
		            onChange: (event) => setCommute(event.target.value),
		            disabled: kind !== "onsite",
		            title: "\u53EA\u6709\u73B0\u573A\u9762\u8BD5\u624D\u7B97\u901A\u52E4"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
		    data === null ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u9762\u8BD5\u2026" }) : data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u9762\u8BD5\u5B89\u6392\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "jh-interviews", children: data.items.map((interview) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
		      "li",
		      {
		        className: `jh-interview${interview.conflicts.length > 0 ? " jh-interview-conflict" : ""}`,
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-message-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("b", { children: interview.at.slice(0, 16).replace("T", " ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "jh-muted", children: [
		              INTERVIEW_KIND_LABEL[interview.kind],
		              " \xB7 \u7B2C ",
		              interview.round,
		              " \u8F6E \xB7",
		              " ",
		              INTERVIEW_STATE_LABEL[interview.state]
		            ] }),
		            interview.jobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { type: "button", className: "jh-link", onClick: () => props.onSelectJob(interview.jobId), children: [
		              interview.companyName ?? "",
		              " ",
		              interview.jobTitle ?? ""
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-muted", children: interview.hoursUntil >= 0 ? `${interview.hoursUntil} \u5C0F\u65F6\u540E` : "\u5DF2\u8FC7" })
		          ] }),
		          interview.conflicts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-warn", children: [
		            "\u26A0 \u4E0E\u9762\u8BD5 #",
		            interview.conflicts.join("\u3001#"),
		            " \u65F6\u95F4\u51B2\u7A81"
		          ] }) : null,
		          interview.kind === "onsite" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: interview.commuteMin === null ? '\u73B0\u573A\u9762\u8BD5\u4F46\u6CA1\u586B\u901A\u52E4\u65F6\u957F \u2014\u2014 \u5EFA\u8BAE\u8865\u4E0A\uFF0C\u5426\u5219"\u522B\u8FDF\u5230"\u5C31\u662F\u7A7A\u8BDD\u3002' : `\u5355\u7A0B\u7EA6 ${interview.commuteMin} \u5206\u949F\uFF0C\u5EFA\u8BAE\u63D0\u524D ${interview.commuteMin + 30} \u5206\u949F\u51FA\u53D1\u3002` }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-detail-actions", children: [
		            ["confirmed", "done", "cancelled", "rescheduled"].map((state) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                onClick: () => setPrepId(prepId === interview.id ? null : interview.id),
		                children: prepId === interview.id ? "\u6536\u8D77\u51C6\u5907\u5305" : "\u51C6\u5907\u5305"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
		          prepId === interview.id ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PrepPanel, { id: interview.id }) : null
		        ]
		      },
		      interview.id
		    )) })
		  ] });
		}
		function PrepPanel(props) {
		  const prep = useAsync((signal) => fetchInterviewPrep(props.id, signal), [props.id]);
		  if (prep.state.status !== "ok") return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u51C6\u5907\u2026" });
		  const data = prep.state.data;
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: data.commute.advice }),
		    data.matchedSkills.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-muted", children: [
		      "\u4F60\u6709\u7684\uFF1A",
		      data.matchedSkills.join("\u3001")
		    ] }) : null,
		    data.missingSkills.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-warn", children: [
		      "\u4F1A\u88AB\u8FFD\u95EE\u4F46\u4F60\u7B80\u5386\u91CC\u6CA1\u6709\u7684\uFF1A",
		      data.missingSkills.slice(0, 10).join("\u3001"),
		      ' \u2014\u2014 \u5982\u5B9E\u8BF4"\u6CA1\u7528\u8FC7\uFF0C\u4F46\u6211\u77E5\u9053\u5B83\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898"\uFF0C\u4E0D\u8981\u786C\u626F\u3002'
		    ] }) : null,
		    data.companyFlags.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-warn", children: [
		      "\u516C\u53F8\u98CE\u9669\uFF1A",
		      data.companyFlags.join("\uFF1B")
		    ] }) : null,
		    data.questionNotes.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "jh-muted", children: "\u9519\u9898\u672C\uFF08\u6309\u88AB\u95EE\u6B21\u6570\uFF09\uFF1A" }),
		      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "jh-tailor-notes", children: data.questionNotes.slice(0, 5).map((note) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { children: [
		        "\xB7 ",
		        note.question,
		        "\uFF08",
		        note.times,
		        " \u6B21\uFF09"
		      ] }, note.id)) })
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ul", { className: "jh-tailor-notes", children: data.checklist.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { children: [
		      "\xB7 ",
		      item
		    ] }, String(index))) }),
		    data.notes.map((note, index) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "jh-muted", children: [
		      "\u6CE8\u610F\uFF1A",
		      note
		    ] }, String(index)))
		  ] });
		}

		// src/client/screens/pipeline.tsx
		var import_react9 = require("react");

		// src/shared/dto.ts
		var SALARY_BASES = ["monthly_min", "annualized"];
		var SALARY_BASIS_LABEL = {
		  monthly_min: "\u6708\u85AA\u4E0B\u9650\uFF08\u5143/\u6708\uFF09",
		  annualized: "\u5E74\u85AA\u6298\u7B97\uFF08\u5143/\u5E74\uFF0C\u6309 12 \u4E2A\u6708\u515C\u5E95\uFF09"
		};

		// src/client/screens/pipeline.tsx
		var import_jsx_runtime9 = require("react/jsx-runtime");
		function PipelineScreen(props) {
		  const board = useAsync((signal) => fetchBoard(signal), [props.revision]);
		  const followUps = useAsync((signal) => fetchFollowUps(signal), [props.revision]);
		  const [busy, setBusy] = (0, import_react9.useState)(null);
		  const [error, setError] = (0, import_react9.useState)(null);
		  const [openJobId, setOpenJobId] = (0, import_react9.useState)(null);
		  const apps = useAsync(
		    (signal) => fetchApplications(openJobId === null ? {} : { jobId: openJobId }, signal),
		    [openJobId, props.revision]
		  );
		  const run = (0, import_react9.useCallback)(
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
		  const move2 = (card) => {
		    const to = nextStageOf(card.stage);
		    if (to === null) return;
		    void run(card.applicationId, async () => await advanceApplication({ applicationId: card.applicationId, to }));
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { className: "jh-card-title", children: "\u6295\u9012\u6D41\u6C34\u7EBF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-muted", children: "\u6BCF\u4E00\u6B21\u6295\u9012\u90FD\u8BB0\u4E0B\u4E86\u5F53\u65F6\u7528\u7684\u7B80\u5386\u7248\u672C\u4E0E\u6E20\u9053 \u2014\u2014 \u5F52\u56E0\u5206\u6790\u9760\u7684\u5C31\u662F\u5B83\u3002" })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-error", children: error }),
		    board.state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u6D41\u6C34\u7EBF\u2026" }),
		    board.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-error", children: board.state.message }),
		    board.state.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-muted", children: [
		        "\u5171 ",
		        board.state.data.total,
		        " \u6761\u6295\u9012",
		        board.state.data.staleCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("i", { className: "jh-warn", children: [
		          " \xB7 ",
		          board.state.data.staleCount,
		          " \u6761\u5361\u4E86 ",
		          NO_PROGRESS_DAYS,
		          " \u5929\u4EE5\u4E0A"
		        ] }) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-stage-strip", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-stage-strip-title", children: "\u5168\u6D41\u7A0B" }),
		        board.state.data.columns.map((column, index) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		          "span",
		          {
		            className: "jh-stage-strip-item",
		            "data-zero": column.cards.length === 0 ? "1" : "0",
		            "data-active": column.stage === "sent" ? "0" : column.cards.length > 0 ? "1" : "0",
		            children: [
		              index === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-stage-strip-arrow", "aria-hidden": "true", children: "\u2192" }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { className: "jh-stage-strip-num", children: column.cards.length }),
		              APPLICATION_STAGE_LABEL[column.stage]
		            ]
		          },
		          column.stage
		        ))
		      ] }),
		      board.state.data.total === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-empty", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u53BB\u300C\u5C97\u4F4D\u5E93\u300D\u6253\u5F00\u4E00\u4E2A\u5C97\u4F4D\uFF0C\u5728\u8BE6\u60C5\u91CC\u70B9\u300C\u8BB0\u4E00\u6B21\u6295\u9012\u300D\u2014\u2014 \u8FD9\u91CC\u5C31\u4F1A\u5F00\u59CB\u8BB0\u5F55\u5B83\u8D70\u5230\u54EA\u4E00\u6B65\u3001 \u7528\u7684\u54EA\u7248\u7B80\u5386\u3001\u4EE5\u53CA\u5361\u4E86\u591A\u5C11\u5929\u3002" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "jh-board", children: board.state.data.columns.map((column) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		        "section",
		        {
		          className: `jh-board-col${column.cards.length === 0 ? " jh-board-col-empty" : ""}`,
		          "aria-label": `${APPLICATION_STAGE_LABEL[column.stage]}\uFF1A${String(column.cards.length)} \u6761`,
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-board-head", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-board-head-label", children: APPLICATION_STAGE_LABEL[column.stage] }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-board-count", children: column.cards.length })
		            ] }),
		            column.cards.length === 0 ? null : column.cards.map((card) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("article", { className: "jh-board-card", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		                "button",
		                {
		                  type: "button",
		                  className: "jh-board-title",
		                  onClick: () => props.onSelectJob(card.jobId),
		                  title: "\u6253\u5F00\u5C97\u4F4D\u8BE6\u60C5",
		                  children: card.jobTitle ?? `\u5C97\u4F4D #${String(card.jobId)}`
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "jh-muted jh-board-meta", children: [
		                card.companyName ?? "\u672A\u77E5\u516C\u53F8",
		                " \xB7 ",
		                APPLICATION_CHANNEL_LABEL[card.channel],
		                card.resumeId === null ? "" : ` \xB7 \u7B80\u5386 #${String(card.resumeId)}`
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-board-age", children: card.daysSinceStage === 0 ? "\u4ECA\u5929\u52A8\u7684" : card.daysSinceStage >= NO_PROGRESS_DAYS ? `\u5361\u4E86 ${String(card.daysSinceStage)} \u5929 \xB7 \u8BE5\u50AC\u4E86` : `\u5361\u4E86 ${String(card.daysSinceStage)} \u5929` }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-board-actions", children: [
		                nextStageOf(card.stage) === null ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline",
		                    disabled: busy !== null,
		                    title: `\u628A\u8FD9\u6761\u8BB0\u5F55\u6539\u5230\u300C${APPLICATION_STAGE_LABEL[nextStageOf(card.stage)]}\u300D`,
		                    onClick: () => move2(card),
		                    children: [
		                      "\u63A8\u8FDB\u5230",
		                      APPLICATION_STAGE_LABEL[nextStageOf(card.stage)]
		                    ]
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline",
		                    disabled: busy !== null,
		                    onClick: () => setOpenJobId(card.jobId),
		                    children: "\u6295\u9012\u8BB0\u5F55"
		                  }
		                ),
		                TERMINAL_STAGES.includes(card.stage) ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline jh-btn-danger-ghost",
		                    disabled: busy !== null,
		                    onClick: () => void run(
		                      card.applicationId,
		                      async () => await advanceApplication({ applicationId: card.applicationId, to: "rejected" })
		                    ),
		                    children: "\u6807\u8BB0\u5DF2\u62D2\u7EDD"
		                  }
		                )
		              ] })
		            ] }, card.applicationId))
		          ]
		        },
		        column.stage
		      )) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u5F85\u8DDF\u8FDB" }),
		    followUps.state.status === "ok" && followUps.state.data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-ok", children: "\u6CA1\u6709\u9700\u8981\u8DDF\u8FDB\u7684 \u2014\u2014 \u8981\u4E48\u90FD\u5728\u63A8\u8FDB\uFF0C\u8981\u4E48\u8FD8\u6CA1\u6253\u62DB\u547C\u3002" }) : null,
		    followUps.state.status === "ok" && followUps.state.data.items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "jh-followups", children: followUps.state.data.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(FollowUpRow, { item, onOpen: props.onSelectJob }, `${String(item.jobId)}-${item.kind}`)) }) : null,
		    openJobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-row-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("h3", { className: "jh-card-title", children: [
		          "\u5C97\u4F4D #",
		          openJobId,
		          " \u7684\u6295\u9012\u8BB0\u5F55"
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => setOpenJobId(null), children: "\u6536\u8D77" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
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
		      apps.state.status !== "ok" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u2026" }) : apps.state.data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u8FD9\u4E2A\u5C97\u4F4D\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" }) : apps.state.data.items.map((application) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-muted", children: [
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
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "jh-tailor-notes", children: application.events.map((event) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { children: [
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
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { className: `jh-followup jh-followup-${item.kind}`, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "jh-link", onClick: () => props.onOpen(item.jobId), children: [
		      item.companyName ?? "",
		      " ",
		      item.jobTitle ?? `\u5C97\u4F4D #${String(item.jobId)}`
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: item.message }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: item.kind === "unread-timeout" ? "jh-muted" : "jh-warn", children: item.advice })
		  ] });
		}
		function BoardScreen(props) {
		  const [filter, setFilter] = (0, import_react9.useState)({});
		  const [resumeOptions, setResumeOptions] = (0, import_react9.useState)([]);
		  const [directionOptions, setDirectionOptions] = (0, import_react9.useState)([]);
		  (0, import_react9.useEffect)(() => {
		    void fetchResumes().then((result) => {
		      setResumeOptions(result.items.map((item) => ({ id: item.id, label: `${item.name} #${String(item.id)}` })));
		      setDirectionOptions([...new Set(result.items.map((item) => item.direction).filter((d) => d !== ""))].sort());
		    }).catch(() => {
		    });
		  }, [props.revision]);
		  const [basis, setBasis] = (0, import_react9.useState)("monthly_min");
		  const funnel = useAsync((signal) => fetchFunnel(filter, signal), [props.revision, filter]);
		  const attribution = useAsync((signal) => fetchAttribution(filter, signal), [props.revision, filter]);
		  const salary = useAsync((signal) => fetchSalaryBand(filter, signal), [props.revision, filter]);
		  const salaryBox = useAsync((signal) => fetchSalaryBox(filter, basis, signal), [props.revision, filter, basis]);
		  const baseline = useAsync((signal) => fetchSalaryBaseline(filter, signal), [props.revision, filter]);
		  const resumeCompare = useAsync((signal) => fetchResumeCompare(filter, signal), [props.revision, filter]);
		  const funnelData = funnel.state.status === "ok" ? funnel.state.data : null;
		  const attributionData = attribution.state.status === "ok" ? attribution.state.data : null;
		  const salaryData = salary.state.status === "ok" ? salary.state.data : null;
		  const activeCount = Object.values(filter).filter((value) => value !== void 0 && value !== "").length;
		  const patch = (next) => {
		    setFilter((current) => {
		      const merged = { ...current, ...next };
		      for (const key of Object.keys(merged)) {
		        if (merged[key] === "" || merged[key] === void 0) delete merged[key];
		      }
		      return merged;
		    });
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { className: "jh-card-title", children: "\u6570\u636E\u770B\u677F" }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-filterbar", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u8D77" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		          "input",
		          {
		            className: "jh-input jh-input-sm",
		            type: "date",
		            value: (filter.from ?? "").slice(0, 10),
		            onChange: (event) => patch({ from: event.target.value === "" ? "" : `${event.target.value}T00:00:00.000Z` })
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u6B62" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		          "input",
		          {
		            className: "jh-input jh-input-sm",
		            type: "date",
		            value: (filter.to ?? "").slice(0, 10),
		            onChange: (event) => patch({ to: event.target.value === "" ? "" : `${event.target.value}T23:59:59.999Z` })
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u5173\u952E\u8BCD\uFF08\u5C97\u4F4D\u540D\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		          "input",
		          {
		            className: "jh-input jh-input-sm",
		            placeholder: "Java",
		            value: filter.keyword ?? "",
		            onChange: (event) => patch({ keyword: event.target.value })
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u65B9\u5411\uFF08\u7B80\u5386\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		          "select",
		          {
		            className: "jh-select jh-input-sm",
		            value: filter.direction ?? "",
		            onChange: (event) => patch({ direction: event.target.value }),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: "", children: "\u5168\u90E8\u65B9\u5411" }),
		              directionOptions.map((item) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: item, children: item }, item))
		            ]
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u57CE\u5E02" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		          "input",
		          {
		            className: "jh-input jh-input-sm",
		            placeholder: "\u6DF1\u5733",
		            value: filter.city ?? "",
		            onChange: (event) => patch({ city: event.target.value })
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "jh-field", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u7B80\u5386\u7248\u672C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		          "select",
		          {
		            className: "jh-select jh-input-sm",
		            value: filter.resumeId === void 0 ? "" : String(filter.resumeId),
		            onChange: (event) => patch({ resumeId: event.target.value === "" ? void 0 : Number(event.target.value) }),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: "", children: "\u5168\u90E8\u7248\u672C" }),
		              resumeOptions.map((item) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: item.id, children: item.label }, item.id))
		            ]
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-spacer" }),
		      activeCount === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "jh-btn jh-btn-inline jh-btn-quiet", onClick: () => setFilter({}), children: [
		        "\u6E05\u7A7A\u7B5B\u9009\uFF08",
		        activeCount,
		        "\uFF09"
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-info", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: "\u65B9\u5411" }),
		        "\u4E0E",
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: "\u7B80\u5386\u7248\u672C" }),
		        "\u53EA\u4F5C\u7528\u4E8E",
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: "\u6295\u9012\u6BB5" }),
		        " \u2014\u2014 \u6253\u62DB\u547C\u6CA1\u6709\u8BB0\u5F55\u7528\u8FC7\u54EA\u7248\u7B80\u5386\uFF0F\u4EC0\u4E48\u65B9\u5411\uFF0C \u63A5\u89E6\u6BB5\uFF08\u6253\u62DB\u547C/\u9001\u8FBE/\u5DF2\u8BFB/\u56DE\u590D\uFF09\u4E0D\u53D7\u8FD9\u4E24\u9879\u5F71\u54CD\u3002",
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: "\u85AA\u8D44\u5206\u4F4D" }),
		        "\u6765\u81EA\u5C97\u4F4D\u5E93\uFF0C \u5B83\u7684\u65F6\u95F4\u7A97\u662F",
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: "\u5C97\u4F4D\u6293\u53D6\u65F6\u95F4" }),
		        "\uFF0C\u4E0D\u662F\u4F60\u7684\u6295\u9012\u65F6\u95F4\u3002"
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u6F0F\u6597" }),
		    funnelData === null ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "jh-funnel", children: funnelData.steps.map((step, index) => {
		        const previous = index === 0 ? void 0 : funnelData.steps[index - 1];
		        const boundary = previous !== void 0 && previous.population !== step.population;
		        const samePopulation = previous !== void 0 && previous.population === step.population;
		        const drop = samePopulation && previous !== void 0 ? previous.count - step.count : null;
		        const top = funnelData.steps[0]?.count ?? 0;
		        return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { children: [
		          index === 0 || boundary ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-funnel-seg", children: step.population === "contact" ? "\u63A5\u89E6\u9636\u6BB5 \xB7 \u6253\u62DB\u547C\u94FE\u8DEF" : "\u6295\u9012\u9636\u6BB5 \xB7 \u6295\u9012 \u2192 \u9762\u8BD5 \u2192 Offer" }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-funnel-row", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-funnel-label", children: step.label }),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-funnel-track", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		              "span",
		              {
		                className: `jh-funnel-bar${step.population === "application" ? " jh-funnel-bar-apply" : ""}`,
		                style: { width: `max(3px, ${String(funnelWidth(step.count, top))}%)` }
		              }
		            ) }),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-funnel-count",
		                title: "\u70B9\u5F00\u770B\u8FD9\u4E00\u6BB5\u7684\u660E\u7EC6",
		                onClick: () => props.onDrillDown(step.key),
		                children: step.count
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-muted jh-funnel-rate", children: step.rate === null ? "\u2014" : `${(step.rate * 100).toFixed(0)}%` }),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-muted jh-funnel-drop", children: drop === null || drop <= 0 ? "" : `\u6D41\u5931 ${String(drop)}` })
		          ] })
		        ] }, step.key);
		      }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
		        "span",
		        {
		          className: `jh-chip ${funnelData.sampleSize < 5 ? "jh-chip-warn" : "jh-chip-dirty"}`,
		          title: funnelData.note,
		          children: [
		            funnelData.sampleSize < 5 ? "\u26A0 " : "",
		            "\u6837\u672C ",
		            funnelData.sampleSize,
		            " \u6761 \xB7 \u60AC\u505C\u770B\u53E3\u5F84"
		          ]
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u5F52\u56E0" }),
		    attributionData !== null ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h4", { className: "jh-card-title", children: "\u6309\u6E20\u9053" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(AttributionTable, { rows: attributionData.byChannel })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h4", { className: "jh-card-title", children: "\u6309\u7B80\u5386\u7248\u672C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(AttributionTable, { rows: attributionData.byResume }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: attributionData.note })
		      ] })
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u85AA\u8D44\u5206\u5E03\uFF08\u7BB1\u7EBF\u56FE \xB7 \u672C\u5730\u57FA\u51C6\uFF09" }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-filters", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-muted", children: "\u53E3\u5F84" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "jh-modes", children: SALARY_BASES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-mode${value === basis ? " jh-mode-active" : ""}`,
		            onClick: () => setBasis(value),
		            children: SALARY_BASIS_LABEL[value]
		          },
		          value
		        )) })
		      ] }),
		      salaryBox.state.status === "ok" ? salaryBox.state.data.box.count === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u8FD9\u4E2A\u8303\u56F4\u91CC\u6CA1\u6709\u7B26\u5408\u8BE5\u53E3\u5F84\u7684\u5C97\u4F4D\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(SalaryBoxChart, { box: salaryBox.state.data.box }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-muted", children: [
		          "\u6837\u672C ",
		          salaryBox.state.data.box.count,
		          " \u6761 \xB7 \u7BB1\u4F53\uFF08P25\u2013P75\uFF09\u91CC\u88C5\u4E86",
		          " ",
		          salaryBox.state.data.box.withinBox,
		          " \u6761"
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-info", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: salaryBox.state.data.note })
		        ] })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }),
		      baseline.state.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-baseline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h4", { className: "jh-sub-title", children: "\u6211\u81EA\u5DF1\u6295\u9012\u8FC7\u7684 vs \u5168\u90E8\u5728\u5E93\uFF08\u540C\u4E00\u53E3\u5F84\uFF1A\u6708\u85AA\u4E0B\u9650\uFF09" }),
		        baseline.state.data.all.count === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u5C97\u4F4D\u5E93\u91CC\u8FD8\u6CA1\u6709\u5E26\u85AA\u8D44\u7684\u5C97\u4F4D\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("table", { className: "jh-table", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u5206\u7EC4" }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u6837\u672C" }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "P25" }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u4E2D\u4F4D" }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "P75" })
		            ] }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tbody", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: "\u5168\u90E8\u5728\u5E93" }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: baseline.state.data.all.count }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: baseline.state.data.all.p25 ?? "\u2014" }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: baseline.state.data.all.median ?? "\u2014" }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: baseline.state.data.all.p75 ?? "\u2014" })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: "\u6211\u6295\u9012\u8FC7\u7684" }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: baseline.state.data.applied.count }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: baseline.state.data.applied.p25 ?? "\u2014" }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: baseline.state.data.applied.median ?? "\u2014" }),
		                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: baseline.state.data.applied.p75 ?? "\u2014" })
		              ] })
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: baseline.state.data.enoughSample ? "jh-muted" : "jh-warn", children: [
		            "\u4E2D\u4F4D\u6570\u4E4B\u5DEE\uFF1A",
		            baseline.state.data.medianGap === null ? "\u65E0\u6CD5\u8BA1\u7B97\uFF08\u6709\u4E00\u8FB9\u6CA1\u6709\u6837\u672C\uFF09" : `${baseline.state.data.medianGap > 0 ? "+" : ""}${String(baseline.state.data.medianGap)} \u5143/\u6708`,
		            baseline.state.data.enoughSample ? "" : " \u2014\u2014 \u6837\u672C\u4E0D\u8DB3\uFF0C\u522B\u770B\u5DEE\u989D"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-info", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: baseline.state.data.note })
		          ] })
		        ] })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u7B80\u5386\u7248\u672C\u5BF9\u6BD4" }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "jh-card", children: resumeCompare.state.status === "ok" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("table", { className: "jh-table", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u7B80\u5386\u7248\u672C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u6295\u9012\u6570" }),
		          resumeCompare.state.data.stages.map((stage) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: stage.label }, stage.stage))
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("tbody", { children: resumeCompare.state.data.rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("td", { children: [
		            row.label,
		            row.enoughSample ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-chip jh-chip-quiet", children: "\u6837\u672C\u5C11" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: row.total }),
		          row.cells.map((cell) => (
		            // 每格都标出\"分子/分母\"，而不是只给一个百分比 ——
		            // 2 条样本里的 1 条不是\"50%\"，是\"1/2\"
		            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { className: cell.thin ? "jh-warn" : void 0, children: cell.count === 0 ? "\u2014" : `${String(cell.count)}/${String(row.total)}` }, cell.stage)
		          ))
		        ] }, String(row.resumeId))) })
		      ] }),
		      resumeCompare.state.data.rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-info", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: resumeCompare.state.data.note })
		      ] })
		    ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { className: "jh-card-title", children: "\u85AA\u8D44\u5206\u4F4D" }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-card", children: [
		      salary.state.status === "ok" ? salary.state.data.count === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u8FD9\u4E2A\u8303\u56F4\u91CC\u6CA1\u6709\u5E26\u85AA\u8D44\u4E0B\u9650\u7684\u5C97\u4F4D\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-muted", children: [
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
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-info", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
		          "\u57CE\u5E02\u4E0E\u5173\u952E\u8BCD\u5728\u8FD9\u91CC\u7B5B\u7684\u662F",
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: "\u5C97\u4F4D\u5E93" }),
		          "\uFF1B\u65F6\u95F4\u7A97\u662F",
		          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: "\u5C97\u4F4D\u6293\u53D6\u65F6\u95F4" }),
		          "\uFF0C\u4E0D\u662F\u4F60\u7684\u6295\u9012\u65F6\u95F4\u3002"
		        ] })
		      ] })
		    ] })
		  ] });
		}
		function SalaryBoxChart(props) {
		  const { min, p25, median, p75, max } = props.box;
		  if (min === null || p25 === null || median === null || p75 === null || max === null) return null;
		  const span = max - min;
		  const at = (value) => span <= 0 ? 50 : (value - min) / span * 100;
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-box", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-box-track", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "jh-box-whisker", style: { left: `${String(at(min))}%`, width: `${String(at(max) - at(min))}%` } }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "jh-box-body", style: { left: `${String(at(p25))}%`, width: `${String(Math.max(0.5, at(p75) - at(p25)))}%` } }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "jh-box-median", style: { left: `${String(at(median))}%` } })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "jh-box-scale", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: min }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
		        "P25 ",
		        p25
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
		        "\u4E2D\u4F4D ",
		        median
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
		        "P75 ",
		        p75
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: max })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "jh-note", children: [
		      props.box.basisLabel,
		      " \xB7 \u9AD8\u4EAE\u6BB5 = P25\u2013P75\uFF08\u7BB1\u4F53\uFF09"
		    ] })
		  ] });
		}
		function funnelWidth(count, top) {
		  if (top <= 0) return 0;
		  return Math.max(2, Math.round(count / top * 100));
		}
		function AttributionTable(props) {
		  if (props.rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" });
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("table", { className: "jh-table", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u5206\u7EC4" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u6295\u9012" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u5DF2\u56DE\u590D" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u9762\u8BD5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "Offer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("th", { scope: "col", children: "\u56DE\u590D\u7387" })
		    ] }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("tbody", { children: props.rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("tr", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: row.label }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: row.total }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: row.replied }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: row.interviewed }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("td", { children: row.offered }),
		      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("td", { children: [
		        (row.replyRate * 100).toFixed(0),
		        "%"
		      ] })
		    ] }, row.key)) })
		  ] });
		}

		// src/client/screens/collect.tsx
		var import_react11 = require("react");

		// src/shared/error-text.ts
		var TECHNICAL_PATTERNS = [
		  /page\.evaluate/i,
		  /\b(ReferenceError|TypeError|SyntaxError|RangeError)\b/,
		  /is not defined/,
		  /\n\s+at\s+/,
		  /\.js:\d+:\d+/,
		  /evaluate \(eval at/
		];
		function looksLikeStackTrace(message) {
		  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(message));
		}
		function kindOf(errorCode, message) {
		  switch (errorCode) {
		    case "NO_RECORDS":
		      return "selector";
		    case "PARSE_FAILED":
		      return looksLikeStackTrace(message) ? "script" : "selector";
		    case "NOT_LOGGED_IN":
		      return "login";
		    case "BLOCKED":
		    case "RATE_LIMITED":
		    case "PLATFORM_QUOTA":
		    case "RISK":
		      return "risk";
		    case "NAVIGATION_FAILED":
		      return "navigation";
		    case "PLATFORM_PAUSED":
		      return "platform-paused";
		    case "QUOTA_REACHED":
		      return "quota";
		    case "OFFLINE":
		      return "offline";
		    default:
		      return looksLikeStackTrace(message) ? "script" : "unknown";
		  }
		}
		var SHORT = {
		  selector: "\u6CA1\u89E3\u6790\u5230\u5C97\u4F4D\uFF08\u9009\u62E9\u5668\u53EF\u80FD\u5931\u6548\uFF09",
		  script: "\u4EE3\u7801\u8BED\u6CD5\u5F02\u5E38",
		  login: "\u5E73\u53F0\u8981\u6C42\u5148\u767B\u5F55",
		  risk: "\u88AB\u5E73\u53F0\u98CE\u63A7\u62E6\u4F4F\u4E86",
		  navigation: "\u6253\u4E0D\u5F00\u641C\u7D22\u9875",
		  "platform-paused": "\u5E73\u53F0\u5DF2\u6682\u505C\u5199\u5165",
		  quota: "\u4ECA\u5929\u7684\u6B21\u6570\u5DF2\u8FBE\u4E0A\u9650",
		  offline: "\u79BB\u7EBF\u6A21\u5F0F\u5DF2\u5F00\u542F",
		  unknown: "\u8FD0\u884C\u51FA\u9519"
		};
		var ADVICE = {
		  selector: "\u9875\u9762\u6253\u5F00\u4E86\u4F46\u4E00\u6761\u5C97\u4F4D\u90FD\u6CA1\u89E3\u6790\u51FA\u6765\uFF0C\u901A\u5E38\u662F\u62DB\u8058\u7AD9\u6539\u4E86\u9875\u9762\u7ED3\u6784\u3001\u9009\u62E9\u5668\u5BF9\u4E0D\u4E0A\u4E86\u3002\u5148\u5728\u4E0B\u9762\u7684\u300C\u5E73\u53F0\u72B6\u6001\u300D\u91CC\u770B\u662F\u54EA\u4E2A\u5B57\u6BB5\u8FDE\u7EED\u7F3A\u5931\uFF0C\u518D\u6309\u300C\u6392\u67E5\u65B9\u6848\u300D\u9010\u6761\u6838\u5BF9\u3002",
		  script: "\u89E3\u6790\u811A\u672C\u5728\u9875\u9762\u91CC\u6267\u884C\u65F6\u62A5\u9519\u4E86\uFF08\u4E0D\u662F\u7F51\u7EDC\u95EE\u9898\uFF09\u3002\u8FD9\u901A\u5E38\u610F\u5473\u7740\u811A\u672C\u6216\u9009\u62E9\u5668\u914D\u7F6E\u88AB\u6539\u574F\u4E86\uFF0C\u5C55\u5F00\u4E0B\u9762\u7684\u539F\u59CB\u4FE1\u606F\u80FD\u770B\u5230\u5177\u4F53\u662F\u54EA\u4E00\u884C\u3002",
		  login: "\u5728\u4E0B\u9762\u7684\u300C\u5E73\u53F0\u72B6\u6001\u300D\u91CC\u70B9\u300C\u767B\u5F55\u300D\uFF0C\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\u91CC\u5B8C\u6210\u767B\u5F55\u540E\uFF0C\u5B9A\u65F6\u4F1A\u81EA\u52A8\u6062\u590D\u3002",
		  risk: "\u5E73\u53F0\u8BC6\u522B\u51FA\u4E86\u81EA\u52A8\u5316\u8BBF\u95EE\u5E76\u9650\u6D41/\u8981\u6C42\u9A8C\u8BC1\u3002\u8FD9\u7C7B\u4FE1\u53F7**\u4E00\u6B21\u5C31\u4F1A\u6682\u505C**\u8BE5\u65B9\u6848\uFF0C\u786E\u8BA4\u73AF\u5883\u6B63\u5E38\u540E\u518D\u70B9\u65B9\u6848\u4E0A\u7684\u300C\u786E\u8BA4\u6062\u590D\u300D\uFF1B\u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002",
		  navigation: "\u8FDE\u641C\u7D22\u9875\u90FD\u6CA1\u6253\u5F00\u6210\u529F\u3002\u5148\u786E\u8BA4\u80FD\u6B63\u5E38\u4E0A\u7F51\u3001\u4EE5\u53CA\u8BE5\u7AD9\u70B9\u6CA1\u6709\u88AB\u7F51\u7EDC\u7B56\u7565\u62E6\u4F4F\uFF0C\u7136\u540E\u624B\u52A8\u8DD1\u4E00\u6B21\u770B\u662F\u5426\u6062\u590D\u3002",
		  "platform-paused": "\u9002\u914D\u5668\u5904\u4E8E\u964D\u7EA7/\u5931\u6548\u72B6\u6001\uFF0C\u6B64\u65F6**\u53EA\u89E3\u6790\u4E0D\u5199\u5E93**\uFF08\u907F\u514D\u628A\u810F\u6570\u636E\u5199\u8FDB\u53BB\uFF09\u3002\u4FEE\u597D\u89E3\u6790\u540E\u8DD1\u4E00\u8F6E\u6210\u529F\u5373\u81EA\u52A8\u6062\u590D\u3002",
		  quota: "\u8FD9\u662F\u6BCF\u65E5\u4E0A\u9650\u5728\u8D77\u4F5C\u7528\uFF08\u9632\u5931\u63A7\u7684\u4FDD\u9669\u4E1D\uFF09\u3002\u7B49\u660E\u5929\uFF0C\u6216\u76F4\u63A5\u5728\u65B9\u6848\u4E0A\u70B9\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4EBA\u5DE5\u8DD1\u4E00\u6B21\u3002",
		  offline: '\u73AF\u5883\u53D8\u91CF DSH_JOB_HUNTER_NO_NETWORK \u5F00\u7740\u65F6\u4E0D\u4F1A\u53D1\u8D77\u4EFB\u4F55\u771F\u5B9E\u8BBF\u95EE \u2014\u2014 \u8FD9\u662F"\u81EA\u52A8\u5316\u6D4B\u8BD5\u7EDD\u4E0D\u8BBF\u95EE\u771F\u5B9E\u62DB\u8058\u7AD9"\u7684\u5F00\u5173\u3002',
		  unknown: "\u5C55\u5F00\u4E0B\u9762\u7684\u539F\u59CB\u4FE1\u606F\u53EF\u4EE5\u770B\u5230\u5B8C\u6574\u539F\u56E0\uFF1B\u5982\u679C\u53CD\u590D\u51FA\u73B0\uFF0C\u628A\u5B83\u8FDE\u540C\u300C\u5E73\u53F0\u72B6\u6001\u300D\u4E00\u8D77\u53CD\u9988\u3002"
		};
		function humanizeFailure(errorCode, errorMsg) {
		  const raw = (errorMsg ?? "").trim();
		  if (errorCode === null && raw === "") return null;
		  const kind = kindOf(errorCode, raw);
		  const technical = raw !== "" && looksLikeStackTrace(raw);
		  const short = kind === "navigation" && raw !== "" && !technical ? `\u6253\u4E0D\u5F00\u641C\u7D22\u9875\uFF08${firstLine(raw)}\uFF09` : SHORT[kind];
		  return {
		    kind,
		    short,
		    advice: ADVICE[kind],
		    detail: raw === "" ? null : raw,
		    looksTechnical: technical
		  };
		}
		function firstLine(message) {
		  const line = message.split("\n")[0] ?? "";
		  return line.length > 60 ? `${line.slice(0, 57)}\u2026` : line;
		}
		var FAILURE_KIND_LABEL = {
		  selector: "\u9009\u62E9\u5668\u5931\u6548",
		  script: "\u811A\u672C\u5F02\u5E38",
		  login: "\u672A\u767B\u5F55",
		  risk: "\u98CE\u63A7\u62E6\u622A",
		  navigation: "\u7F51\u7EDC/\u5BFC\u822A",
		  "platform-paused": "\u5E73\u53F0\u964D\u7EA7",
		  quota: "\u6B21\u6570\u4E0A\u9650",
		  offline: "\u79BB\u7EBF\u6A21\u5F0F",
		  unknown: "\u672A\u77E5\u539F\u56E0"
		};

		// src/shared/criteria-label.ts
		var FALLBACK_LABEL = {
		  keyword: "\u5173\u952E\u8BCD",
		  city: "\u57CE\u5E02",
		  sort: "\u6392\u5E8F\u65B9\u5F0F",
		  postedWithinDays: "\u53D1\u5E03\u65F6\u95F4",
		  maxPages: "\u6293\u53D6\u9875\u6570\u4E0A\u9650",
		  // 平台特有维度：只有部分平台声明（如神仙外企），但方案可能引用了它们，
		  // 而平台刚被取消勾选 —— 那时候界面不该退回去印 `workExp`。
		  workExp: "\u5DE5\u4F5C\u7ECF\u9A8C",
		  education: "\u5B66\u5386",
		  type: "\u804C\u4F4D\u8303\u56F4"
		};
		var NUMERIC_SUFFIX = {
		  postedWithinDays: " \u5929\u5185",
		  maxPages: " \u9875"
		};
		function describeCriteria(criteria, dimensions = []) {
		  const declared = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
		  const order = [
		    ...dimensions.map((dimension) => dimension.key).filter((key) => key in criteria),
		    ...Object.keys(criteria).filter((key) => !declared.has(key))
		  ];
		  const seen = /* @__PURE__ */ new Set();
		  const items = [];
		  for (const key of order) {
		    if (seen.has(key)) continue;
		    seen.add(key);
		    const value = criteria[key];
		    if (value === void 0 || value === "") continue;
		    const spec = declared.get(key);
		    const suffix = NUMERIC_SUFFIX[key] ?? "";
		    const inDomain = spec?.values.find((option) => option.value === value);
		    items.push({
		      key,
		      label: spec?.label ?? FALLBACK_LABEL[key] ?? key,
		      value,
		      display: inDomain === void 0 ? `${value}${suffix}` : inDomain.label,
		      declared: spec !== void 0
		    });
		  }
		  return items;
		}

		// src/shared/time-format.ts
		function pad(value) {
		  return String(value).padStart(2, "0");
		}
		function formatClock(date) {
		  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		function formatRelative(target, now) {
		  const deltaMs = target.getTime() - now.getTime();
		  const abs = Math.abs(deltaMs);
		  const future = deltaMs >= 0;
		  if (abs < 6e4) return future ? "\u9A6C\u4E0A" : "\u521A\u521A";
		  const minutes = Math.round(abs / 6e4);
		  const text = abs < 60 * 6e4 ? `${String(minutes)} \u5206\u949F` : abs < 24 * 60 * 6e4 ? `${String(Math.floor(abs / (60 * 6e4)))} \u5C0F\u65F6` : `${String(Math.floor(abs / (24 * 60 * 6e4)))} \u5929`;
		  return future ? `\u8FD8\u6709 ${text}` : `${text}\u524D`;
		}
		function formatJitter(jitterMs) {
		  if (!Number.isFinite(jitterMs) || jitterMs <= 0) return null;
		  const minutes = Math.round(jitterMs / 6e4);
		  return minutes <= 0 ? "\u542B\u4E0D\u5230 1 \u5206\u949F\u6296\u52A8" : `\u542B ${String(minutes)} \u5206\u949F\u6296\u52A8`;
		}
		var WEEKDAY_LABEL = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
		function formatWeekdays(weekdays) {
		  const days = [...new Set(weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
		  if (days.length === 0 || days.length === 7) return "\u6BCF\u5929";
		  if (days.length === 5 && days.every((day, index) => day === index + 1)) return "\u5DE5\u4F5C\u65E5";
		  return days.map((day) => WEEKDAY_LABEL[day] ?? String(day)).join("\u3001");
		}
		function formatHourMinute(hour, minute) {
		  return `${pad(hour)}:${pad(minute)}`;
		}
		function formatWindow(startHour, startMinute, endHour, endMinute) {
		  const start = formatHourMinute(startHour, startMinute);
		  const end = formatHourMinute(endHour, endMinute);
		  const overnight = endHour * 60 + endMinute <= startHour * 60 + startMinute;
		  return overnight ? `${start}\u2013\u6B21\u65E5 ${end}` : `${start}\u2013${end}`;
		}
		function clockValueOf(hour, minute) {
		  return formatHourMinute(hour, minute);
		}
		function parseClockValue(text) {
		  const match = /^(\d{1,2}):(\d{1,2})$/.exec(text.trim());
		  if (match === null) return null;
		  const hour = Number.parseInt(match[1] ?? "", 10);
		  const minute = Number.parseInt(match[2] ?? "", 10);
		  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
		  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
		  return { hour, minute };
		}
		var WEEKDAY_PRESETS = [
		  { key: "workdays", label: "\u5DE5\u4F5C\u65E5", days: [1, 2, 3, 4, 5] },
		  { key: "weekend", label: "\u5468\u672B", days: [0, 6] },
		  { key: "all", label: "\u6BCF\u5929", days: [0, 1, 2, 3, 4, 5, 6] },
		  { key: "none", label: "\u6E05\u7A7A", days: [] }
		];

		// src/client/field-hint.tsx
		var import_jsx_runtime10 = require("react/jsx-runtime");
		function FieldHint(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "jh-field-hint", title: props.text, "aria-label": props.text, children: "?" });
		}

		// src/client/modal.tsx
		var import_react10 = require("react");
		var import_jsx_runtime11 = require("react/jsx-runtime");
		function Modal(props) {
		  const dialogRef = (0, import_react10.useRef)(null);
		  useDialogA11y(dialogRef, props.onClose);
		  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "jh-modal-layer", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-modal-backdrop",
		        "aria-label": "\u5173\u95ED",
		        onClick: props.onClose
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
		      "div",
		      {
		        className: `jh-modal jh-modal-${props.size ?? "md"}`,
		        role: "dialog",
		        "aria-modal": "true",
		        "aria-label": props.label ?? props.title,
		        tabIndex: -1,
		        ref: dialogRef,
		        "data-job-hunter": "modal",
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("header", { className: "jh-modal-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h2", { className: "jh-modal-title", children: props.title }),
		            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "jh-icon-btn", "aria-label": "\u5173\u95ED", onClick: props.onClose, children: "\xD7" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "jh-modal-body", children: props.children }),
		          props.footer === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("footer", { className: "jh-modal-foot", children: props.footer })
		        ]
		      }
		    )
		  ] });
		}

		// src/client/terms.tsx
		var import_jsx_runtime12 = require("react/jsx-runtime");
		var TERM_EXPLAIN = {
		  \u79DF\u7EA6: '\u540C\u4E00\u53F0\u7535\u8111\u4E0A\u53EA\u5141\u8BB8\u4E00\u4E2A\u5B9E\u4F8B\u771F\u6B63\u53BB\u91C7\u96C6\uFF08\u5426\u5219\u4E24\u4E2A\u8FDB\u7A0B\u4F1A\u62A2\u540C\u4E00\u4E2A\u6D4F\u89C8\u5668\u767B\u5F55\u6001\uFF09\u3002\u62FF\u5230"\u79DF\u7EA6"\u7684\u90A3\u4E2A\u5B9E\u4F8B\u8D1F\u8D23\u91C7\u96C6\uFF0C\u53E6\u4E00\u4E2A\u53EA\u63D0\u4F9B\u67E5\u770B\u3002\u8FD9\u662F\u4FDD\u62A4\u673A\u5236\uFF0C\u4E0D\u662F\u62A5\u9519\u3002',
		  pid: "\u8FDB\u7A0B\u7F16\u53F7 \u2014\u2014 \u7528\u5B83\u5C31\u80FD\u5728\u4EFB\u52A1\u7BA1\u7406\u5668\u91CC\u627E\u5230\u5E76\u5173\u95ED\u90A3\u4E2A\u5B9E\u4F8B\u3002",
		  \u6296\u52A8: "\u89E6\u53D1\u65F6\u523B\u5728\u65F6\u6BB5\u5185\u968F\u673A\u6D6E\u52A8\u3002\u6545\u610F\u8FD9\u6837\uFF1A\u6BCF\u5929\u56FA\u5B9A\u540C\u4E00\u5206\u949F\u53BB\u8BBF\u95EE\uFF0C\u6700\u5BB9\u6613\u88AB\u5E73\u53F0\u8BC6\u522B\u6210\u81EA\u52A8\u5316\u3002",
		  \u65F6\u6BB5: "\u4F60\u5E0C\u671B\u81EA\u52A8\u91C7\u96C6\u53D1\u751F\u7684\u5927\u6982\u65F6\u95F4\u6BB5\uFF08\u4F8B\u5982\u4E0A\u5348 9 \u70B9\u5230 11 \u70B9\uFF09\uFF0C\u5177\u4F53\u5230\u54EA\u4E00\u5206\u949F\u662F\u968F\u673A\u7684\u3002",
		  \u65B0\u9C9C\u5EA6: "\u6570\u636E\u8DDD\u4E0A\u6B21\u6210\u529F\u91C7\u96C6\u8FC7\u53BB\u4E86\u591A\u4E45\u3002\u5931\u8D25\u7684\u90A3\u6B21\u4E0D\u7B97 \u2014\u2014 \u5931\u8D25\u4E0D\u4F1A\u8BA9\u6570\u636E\u53D8\u65B0\u3002",
		  \u53EA\u8BFB\u5B9E\u4F8B: "\u8FD9\u4E2A\u5B9E\u4F8B\u4E0D\u8D1F\u8D23\u91C7\u96C6\uFF0C\u53EA\u80FD\u67E5\u770B\u3002\u8981\u5728\u8FD9\u91CC\u91C7\u96C6\uFF0C\u5F97\u5148\u8BA9\u5B83\u62FF\u5230\u79DF\u7EA6\uFF08\u6216\u5173\u6389\u53E6\u4E00\u4E2A\u5B9E\u4F8B\uFF09\u3002",
		  \u9000\u907F: "\u4E0A\u4E00\u8F6E\u5931\u8D25\u540E\uFF0C\u7CFB\u7EDF\u4F1A\u4E3B\u52A8\u7B49\u4E00\u4F1A\u513F\u518D\u91CD\u8BD5\uFF08\u8D8A\u5931\u8D25\u7B49\u5F97\u8D8A\u4E45\uFF09\uFF0C\u907F\u514D\u628A\u8D26\u53F7\u5F80\u67AA\u53E3\u4E0A\u9001\u3002",
		  \u98CE\u63A7\u6682\u505C: "\u5E73\u53F0\u8BC6\u522B\u51FA\u4E86\u81EA\u52A8\u5316\u8BBF\u95EE\uFF08\u9A8C\u8BC1\u7801/\u9650\u6D41\uFF09\uFF0C\u7CFB\u7EDF\u5DF2\u505C\u6B62\u8FD9\u4E2A\u65B9\u6848\u7684\u81EA\u52A8\u5C1D\u8BD5\u3002\u786E\u8BA4\u73AF\u5883\u6B63\u5E38\u540E\u9700\u8981\u4F60\u624B\u52A8\u70B9\u300C\u786E\u8BA4\u6062\u590D\u300D\u2014\u2014\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u3002",
		  \u914D\u989D: "\u6BCF\u5929\u81EA\u52A8\u91C7\u96C6\u7684\u8F6E\u6570\u4E0A\u9650\u3002\u5B83\u662F\u4E00\u6839\u9632\u5931\u63A7\u7684\u4FDD\u9669\u4E1D\uFF0C\u4E0D\u662F\u7701\u6D41\u91CF\u7684\u8282\u6D41\u9600\u3002",
		  \u79BB\u7EBF\u6A21\u5F0F: "\u4E00\u4E2A\u73AF\u5883\u5F00\u5173\uFF08DSH_JOB_HUNTER_NO_NETWORK\uFF09\u6253\u5F00\u540E\uFF0C\u7A0B\u5E8F\u4E0D\u4F1A\u53D1\u8D77\u4EFB\u4F55\u771F\u5B9E\u7F51\u7EDC\u8BBF\u95EE\u3002\u5B83\u5B58\u5728\u7684\u76EE\u7684\u662F\u4FDD\u8BC1\u81EA\u52A8\u5316\u6D4B\u8BD5\u7EDD\u4E0D\u6253\u6270\u771F\u5B9E\u62DB\u8058\u7F51\u7AD9\u3002",
		  \u9010\u5B57\u6BB5\u5065\u5EB7: '\u6BCF\u4E2A\u5E73\u53F0\u4F1A\u5206\u522B\u7EDF\u8BA1"\u6807\u9898/\u85AA\u8D44/\u516C\u53F8/\u6765\u6E90\u94FE\u63A5"\u8FD9\u51E0\u4E2A\u5173\u952E\u5B57\u6BB5\u6709\u6CA1\u6709\u8FDE\u7EED\u6293\u4E0D\u5230\u3002\u67D0\u4E00\u9879\u8FDE\u7EED\u7F3A\u5931\uFF0C\u8BF4\u660E\u9875\u9762\u7ED3\u6784\u5F88\u53EF\u80FD\u53D8\u4E86\u3002',
		  \u964D\u7EA7: '\u9002\u914D\u5668\u8FDE\u7EED\u6293\u4E0D\u5230\u5173\u952E\u5B57\u6BB5\u65F6\u4F1A\u88AB\u5224\u5B9A\u4E3A"\u964D\u7EA7"\uFF1A\u6B64\u65F6\u53EA\u89E3\u6790\u3001\u4E0D\u5199\u5E93\uFF0C\u4EE5\u514D\u628A\u89E3\u6790\u9519\u7684\u6570\u636E\u6DF7\u8FDB\u5C97\u4F4D\u5E93\u3002',
		  \u5931\u8D25: "\u5931\u8D25\u4E0D\u4F1A\u5F71\u54CD\u5DF2\u6709\u6570\u636E\uFF0C\u4E5F\u4E0D\u4F1A\u8BA9\u4E0B\u4E00\u6B21\u91CD\u8BD5\u66F4\u96BE\uFF1B\u91CD\u8BD5\u6210\u529F\u540E\u72B6\u6001\u4F1A\u81EA\u5DF1\u56DE\u5230\u6B63\u5E38\u3002",
		  \u90E8\u5206\u6210\u529F: "\u8FD9\u4E00\u8F6E\u6293\u5230\u4E86\u6570\u636E\uFF0C\u4F46\u6709\u4E00\u90E8\u5206\u88AB\u5224\u5B9A\u4E3A\u4E0D\u5408\u683C\uFF08\u7F3A\u5C11\u5173\u952E\u5B57\u6BB5\uFF09\u800C\u6CA1\u5165\u5E93\u3002\u5C55\u5F00\u300C\u539F\u56E0\u300D\u80FD\u770B\u5230\u5177\u4F53\u662F\u54EA\u4E00\u9879\u3002",
		  \u5DF2\u4E2D\u6B62: "\u8FD9\u4E00\u8F6E\u6CA1\u8DD1\u5B8C\u5C31\u505C\u4E86\uFF08\u6BD4\u5982\u4F60\u624B\u52A8\u4E2D\u6B62\uFF0C\u6216\u8FDB\u7A0B\u9000\u51FA\uFF09\u3002\u6CA1\u6709\u5199\u5165\u534A\u622A\u6570\u636E\u3002",
		  \u672C\u5B9E\u4F8B: "\u4F60\u73B0\u5728\u6253\u5F00\u7684\u8FD9\u4E2A\u7A97\u53E3\u3002\u540C\u4E00\u53F0\u673A\u5668\u4E0A\u53EF\u80FD\u540C\u65F6\u6709\u591A\u4E2A\u5B9E\u4F8B\uFF08\u4F8B\u5982\u684C\u9762\u7AEF + \u547D\u4EE4\u884C\uFF09\u3002"
		};
		function Term(props) {
		  const key = props.term ?? (typeof props.children === "string" ? props.children : "");
		  const explain = TERM_EXPLAIN[key];
		  if (explain === void 0) return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(import_jsx_runtime12.Fragment, { children: props.children });
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "jh-term", title: explain, children: [
		    props.children,
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "jh-term-mark", "aria-hidden": "true", children: "?" }),
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "jh-sr-only", children: explain })
		  ] });
		}

		// src/client/screens/freshness.tsx
		var import_jsx_runtime13 = require("react/jsx-runtime");
		function FreshnessBadge(props) {
		  const label = props.level === "fresh" ? "\u65B0\u9C9C" : props.level === "stale" ? "\u504F\u65E7" : "\u9648\u65E7";
		  const cls = props.level === "fresh" ? "jh-fresh-fresh" : props.level === "stale" ? "jh-fresh-stale" : "jh-fresh-cold";
		  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
		    "span",
		    {
		      className: `jh-fresh ${cls}`,
		      title: props.hours === null ? '\u4ECE\u6765\u6CA1\u6210\u529F\u91C7\u96C6\u8FC7 \u2014\u2014 \u6CA1\u6709\u4EFB\u4F55\u6570\u636E\u662F"\u65B0\u9C9C\u7684"' : `\u4E0A\u6B21\u6210\u529F\u91C7\u96C6\u5728 ${String(props.hours)} \u5C0F\u65F6\u524D`,
		      children: [
		        label,
		        props.hours === null ? " \xB7 \u4ECE\u672A\u66F4\u65B0" : ` \xB7 ${String(props.hours)} \u5C0F\u65F6\u524D`
		      ]
		    }
		  );
		}

		// src/client/screens/collect.tsx
		var import_jsx_runtime14 = require("react/jsx-runtime");
		var IDLE = { running: false, tone: "ok", message: null };
		function formOf(plan) {
		  const schedule = plan.schedule;
		  return {
		    name: plan.name,
		    platforms: [...plan.platforms],
		    criteria: { ...plan.criteria },
		    windowStart: clockValueOf(schedule.windowStartHour, schedule.windowStartMinute),
		    windowEnd: clockValueOf(schedule.windowEndHour, schedule.windowEndMinute),
		    weekdays: [...schedule.weekdays],
		    scheduleEnabled: schedule.enabled,
		    score: plan.postProcess.score,
		    flag: plan.postProcess.flag,
		    dedup: plan.postProcess.dedup
		  };
		}
		function emptyForm(platforms) {
		  return {
		    name: "\u65B0\u65B9\u6848",
		    platforms,
		    criteria: {},
		    windowStart: "09:00",
		    windowEnd: "11:00",
		    weekdays: [1, 2, 3, 4, 5],
		    scheduleEnabled: true,
		    score: true,
		    flag: true,
		    dedup: true
		  };
		}
		function writeOf(form) {
		  const start = parseClockValue(form.windowStart) ?? { hour: 9, minute: 0 };
		  const end = parseClockValue(form.windowEnd) ?? { hour: 11, minute: 0 };
		  return {
		    name: form.name,
		    platforms: form.platforms,
		    criteria: form.criteria,
		    schedule: {
		      enabled: form.scheduleEnabled,
		      windowStartHour: start.hour,
		      windowStartMinute: start.minute,
		      windowEndHour: end.hour,
		      windowEndMinute: end.minute,
		      weekdays: form.weekdays
		    },
		    postProcess: { score: form.score, flag: form.flag, dedup: form.dedup }
		  };
		}
		function StateTag(props) {
		  const label = props.kind === "run" ? CRAWL_STATE_LABEL[props.state] : HEALTH_STATE_LABEL[props.state];
		  const tone = props.kind === "run" ? CRAWL_STATE_TONE[props.state] : HEALTH_STATE_TONE[props.state];
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: `jh-tag jh-tone-${tone}`, children: label });
		}
		function scheduleStoryOf(status, now) {
		  const nextRun = status.triggers.length === 0 ? null : status.triggers.map((trigger) => {
		    const at = new Date(trigger.nextRunAt);
		    const jitter = formatJitter(trigger.jitterMs);
		    return `${trigger.planName} ${formatClock(at)}\uFF08${formatRelative(at, now)}${jitter === null ? "" : ` \xB7 ${jitter}`}\uFF09`;
		  }).join(" / ");
		  if (status.paused) {
		    return { owner: "\u5B9A\u65F6\u5DF2\u6682\u505C", tone: "warn", nextRun, detail: null };
		  }
		  if (status.readOnly) {
		    return {
		      owner: "\u7531\u53E6\u4E00\u4E2A\u7A97\u53E3\u8D1F\u8D23\u8C03\u5EA6",
		      tone: "warn",
		      nextRun: nextRun === null ? null : `\u90A3\u4E2A\u7A97\u53E3\u4F1A\u5728 ${nextRun} \u81EA\u52A8\u91C7\u96C6`,
		      detail: "\u540C\u4E00\u53F0\u7535\u8111\u53EA\u5141\u8BB8\u4E00\u4E2A\u7A97\u53E3\u771F\u6B63\u53BB\u91C7\u96C6\uFF08\u5426\u5219\u4F1A\u62A2\u540C\u4E00\u4EFD\u6D4F\u89C8\u5668\u767B\u5F55\u6001\uFF09\u3002\u672C\u7A97\u53E3\u53EF\u4EE5\u770B\uFF0C\u4F46\u4E0D\u80FD\u89E6\u53D1\u91C7\u96C6\u3002"
		    };
		  }
		  if (!status.scheduling) {
		    return {
		      owner: "\u672C\u7A97\u53E3\u8D1F\u8D23\u8C03\u5EA6\uFF0C\u4F46\u8FD8\u6CA1\u542F\u52A8",
		      tone: "warn",
		      nextRun,
		      detail: status.readOnlyReason ?? "\u6570\u636E\u5C42\u53EF\u80FD\u8FD8\u6CA1\u5C31\u7EEA\uFF0C\u7A0D\u7B49\u51E0\u79D2\u4F1A\u81EA\u52A8\u5F00\u59CB\u3002"
		    };
		  }
		  return {
		    owner: status.armed ? "\u672C\u7A97\u53E3\u8D1F\u8D23\u8C03\u5EA6\uFF0C\u5DF2\u6392\u597D\u4E0B\u4E00\u6B21" : "\u672C\u7A97\u53E3\u8D1F\u8D23\u8C03\u5EA6",
		    tone: "ok",
		    nextRun,
		    detail: status.armed ? null : "\u5F53\u524D\u6CA1\u6709\u542F\u7528\u5B9A\u65F6\u7684\u65B9\u6848 \u2014\u2014 \u53EA\u4F1A\u5728\u4F60\u70B9\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u65F6\u8DD1\u3002"
		  };
		}
		function CollectScreen(props) {
		  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision]);
		  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision]);
		  const plans = useAsync((signal) => fetchPlans(signal), [props.revision]);
		  const reasons = useAsync((signal) => fetchSkipReasons(signal), [props.revision]);
		  const dimensions = useAsync((signal) => fetchCriteriaDimensions([], signal), [props.revision]);
		  const [feedback, setFeedback] = (0, import_react11.useState)(IDLE);
		  const [editing, setEditing] = (0, import_react11.useState)(null);
		  const [duplicates, setDuplicates] = (0, import_react11.useState)([]);
		  const [errorDetail, setErrorDetail] = (0, import_react11.useState)(null);
		  const [pendingDelete, setPendingDelete] = (0, import_react11.useState)(null);
		  const report = (error) => {
		    setFeedback({
		      running: false,
		      tone: "error",
		      message: error instanceof ApiError ? error.display : String(error)
		    });
		  };
		  const reload = () => {
		    scheduler.reload();
		    platforms.reload();
		    plans.reload();
		    dimensions.reload();
		  };
		  const act = async (pending2, run) => {
		    setFeedback({ running: true, tone: "ok", message: pending2 });
		    try {
		      const done = await run();
		      setFeedback({ running: false, tone: "ok", message: done });
		      reload();
		    } catch (error) {
		      report(error);
		    }
		  };
		  const status = scheduler.state.status === "ok" ? scheduler.state.data : null;
		  const planList = plans.state.status === "ok" ? plans.state.data.items : [];
		  const platformList = platforms.state.status === "ok" ? platforms.state.data.items : [];
		  const plansLoading = plans.state.status === "loading";
		  const platformsLoading = platforms.state.status === "loading";
		  const runsLoading = scheduler.state.status === "loading";
		  const reasonText = reasons.state.status === "ok" ? reasons.state.data.items : {};
		  const dimensionList = dimensions.state.status === "ok" ? dimensions.state.data.items : [];
		  const now = (0, import_react11.useMemo)(() => /* @__PURE__ */ new Date(), [props.revision]);
		  const story = status === null ? null : scheduleStoryOf(status, now);
		  const login = (platformId) => act("\u5DF2\u6253\u5F00\u767B\u5F55\u9875\uFF0C\u8BF7\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\u91CC\u5B8C\u6210\u767B\u5F55\uFF08\u6BCF 3 \u79D2\u68C0\u6D4B\u4E00\u6B21\uFF09", async () => {
		    const result = await startLogin(platformId);
		    return result.message ?? "\u767B\u5F55\u5F15\u5BFC\u5DF2\u542F\u52A8";
		  });
		  const trigger = (plan) => act("\u6B63\u5728\u6309\u65B9\u6848\u91C7\u96C6\u2026\uFF08\u4F1A\u6253\u5F00\u4E00\u4E2A\u6D4F\u89C8\u5668\u7A97\u53E3\uFF09", async () => {
		    const summary = await runPlan(plan.id);
		    return `\u65B9\u6848\u300C${plan.name}\u300D\u672C\u8F6E ${CRAWL_STATE_LABEL[summary.run.state]}\uFF1A\u547D\u4E2D ${String(summary.run.found)} \xB7 \u65B0\u589E ${String(summary.run.inserted)} \xB7 \u66F4\u65B0 ${String(summary.run.updated)} \xB7 \u9694\u79BB ${String(summary.run.quarantined)}`;
		  });
		  const reasonFor = (skipReason) => skipReason === null ? null : reasonText[skipReason] ?? skipReason;
		  const confirmDelete = async (plan) => {
		    setPendingDelete(null);
		    await act("\u6B63\u5728\u5220\u9664\u2026", async () => {
		      await deletePlan(plan.id);
		      return `\u5DF2\u5220\u9664\u65B9\u6848\u300C${plan.name}\u300D\u3002\u5DF2\u7ECF\u6293\u5230\u7684\u5C97\u4F4D\u4E0D\u53D7\u5F71\u54CD\u3002`;
		    });
		  };
		  const runBlockTitle = status?.readOnly === true ? `\u672C\u7A97\u53E3\u6CA1\u6709\u91C7\u96C6\u6743\u3002\u7528\u4E0B\u9762\u7684\u300C\u63A5\u7BA1\u8C03\u5EA6\u300D\uFF0C\u6216\u5230\u53E6\u4E00\u4E2A\u7A97\u53E3\uFF08\u8FDB\u7A0B ${String(status.lease.pid ?? "?")}\uFF09\u91CC\u64CD\u4F5C\u3002` : feedback.running ? "\u6709\u53E6\u4E00\u4E2A\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u5019\u3002" : "\u73B0\u5728\u6309\u8FD9\u4E2A\u65B9\u6848\u91C7\u96C6\u4E00\u6B21\uFF08\u4F1A\u6253\u5F00\u6D4F\u89C8\u5668\u7A97\u53E3\uFF09\u3002";
		  const enabledPlan = planList.find((plan) => plan.enabled) ?? planList[0];
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-screen", children: [
		    scheduler.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { className: "jh-card-title", children: "\u8BFB\u4E0D\u5230\u91C7\u96C6\u72B6\u6001" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-error", children: scheduler.state.message }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", className: "jh-btn", onClick: scheduler.reload, children: "\u91CD\u8BD5" })
		    ] }),
		    feedback.message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		      "div",
		      {
		        className: `jh-card jh-card-tight jh-feedback ${feedback.tone === "error" ? "jh-card-error" : ""}`,
		        role: "status",
		        "aria-live": "polite",
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: feedback.tone === "error" ? "jh-error" : "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(InlineMd, { text: feedback.message }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-icon-btn jh-feedback-close",
		              "aria-label": "\u5173\u95ED\u63D0\u793A",
		              title: "\u5173\u95ED\u8FD9\u6761\u63D0\u793A",
		              onClick: () => setFeedback(IDLE),
		              children: "\xD7"
		            }
		          )
		        ]
		      }
		    ),
		    status !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		      StatusAlert,
		      {
		        status,
		        planName: enabledPlan?.name ?? null,
		        running: feedback.running,
		        onResume: () => void act("\u6B63\u5728\u6062\u590D\u5B9A\u65F6\u2026", async () => {
		          await setSchedulePaused(false);
		          return "\u5DF2\u6062\u590D\u5B9A\u65F6\u6293\u53D6\u3002";
		        })
		      }
		    ),
		    status !== null && story !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { className: "jh-card-title", children: "\u89E6\u53D1\u4E0E\u8FD0\u884C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-spacer" }),
		        status.paused ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: feedback.running,
		            title: "\u53EA\u505C\u300C\u5230\u70B9\u81EA\u52A8\u8DD1\u300D\uFF1B\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4E0D\u53D7\u5F71\u54CD\u3002",
		            onClick: () => void act("\u6B63\u5728\u6682\u505C\u5B9A\u65F6\u2026", async () => {
		              await setSchedulePaused(true);
		              return "\u5DF2\u6682\u505C**\u5B9A\u65F6**\u6293\u53D6\u3002\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4ECD\u7136\u53EF\u7528\u3002";
		            }),
		            children: "\u4E00\u952E\u6682\u505C\u5B9A\u65F6"
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: `jh-story jh-story-${story.tone}`, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { children: story.owner }),
		        story.nextRun === null ? " \u2014\u2014 \u5F53\u524D\u6CA1\u6709\u542F\u7528\u5B9A\u65F6\u7684\u65B9\u6848\u3002" : status.paused ? `\uFF1A\u6062\u590D\u540E\u5C06\u6309 ${story.nextRun} \u8FD0\u884C` : `\uFF1A${story.nextRun}`
		      ] }),
		      story.detail === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-note", children: story.detail }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        LeasePanel,
		        {
		          status,
		          now,
		          running: feedback.running,
		          onRecheck: () => void act("\u6B63\u5728\u91CD\u65B0\u68C0\u6D4B\u2026", async () => {
		            const next = await recheckLease();
		            return next.lease.held ? "\u5DF2\u7ECF\u62FF\u5230\u8C03\u5EA6\u6743\uFF0C\u672C\u7A97\u53E3\u73B0\u5728\u8D1F\u8D23\u91C7\u96C6\u3002" : "\u90A3\u4E2A\u7A97\u53E3\u8FD8\u5728\u8FD0\u884C\uFF0C\u672C\u7A97\u53E3\u4ECD\u662F\u53EA\u8BFB\u3002";
		          }),
		          onTakeover: () => void act("\u6B63\u5728\u63A5\u7BA1\u8C03\u5EA6\u2026", async () => {
		            await takeoverLease();
		            return "\u5DF2\u63A5\u7BA1\u8C03\u5EA6\uFF0C\u672C\u7A97\u53E3\u73B0\u5728\u8D1F\u8D23\u91C7\u96C6\u3002";
		          })
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("ul", { className: "jh-kv", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Term, { term: "\u65B0\u9C9C\u5EA6", children: "\u4E0A\u6B21\u6210\u529F" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: status.lastRunAt === null ? "\u4ECE\u6765\u6CA1\u6709\u6210\u529F\u91C7\u96C6\u8FC7" : `${formatClock(new Date(status.lastRunAt))} \xB7 ${formatRelative(new Date(status.lastRunAt), now)}` })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Term, { term: "\u65F6\u6BB5", children: "\u65F6\u533A" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { title: "\u6392\u7A0B\u6309\u8FD9\u53F0\u7535\u8111\u7684\u672C\u5730\u65F6\u95F4\u7B97\u3002\u6539\u4E86\u7CFB\u7EDF\u65F6\u533A\uFF0C\u4E0B\u4E00\u6B21\u5C31\u7B97\u5230\u65B0\u65F6\u533A\u4E0A\u3002", children: status.timezone })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        RunHistoryTable,
		        {
		          runs: status.recentRuns,
		          loading: runsLoading,
		          reasonFor,
		          onOpenError: (run, failure) => setErrorDetail({ run, failure })
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { className: "jh-card-title", children: "\u91C7\u96C6\u65B9\u6848" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: feedback.running,
		            title: "\u65B0\u5EFA\u4E00\u4E2A\u91C7\u96C6\u65B9\u6848\uFF1A\u51B3\u5B9A\u6293\u4EC0\u4E48\uFF08\u5E73\u53F0 + \u7B5B\u9009\u6761\u4EF6 + \u6293\u53D6\u6DF1\u5EA6\uFF09\u4E0E\u4EC0\u4E48\u65F6\u5019\u6293\u3002",
		            onClick: () => {
		              setDuplicates([]);
		              setEditing("new");
		            },
		            children: "\u65B0\u589E\u65B9\u6848"
		          }
		        )
		      ] }),
		      plansLoading ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { className: "jh-plan-list", "aria-busy": "true", "aria-live": "polite", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { className: "jh-plan-card jh-skeleton-row", children: "\u6B63\u5728\u8BFB\u53D6\u65B9\u6848\u2026" }) }) : planList.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-empty", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u65B9\u6848\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-note", children: "\u65B9\u6848\u51B3\u5B9A\u6293\u4EC0\u4E48\uFF08\u5E73\u53F0 + \u7B5B\u9009\u6761\u4EF6 + \u6293\u53D6\u6DF1\u5EA6\uFF09\u4E0E\u4EC0\u4E48\u65F6\u5019\u6293\u3002\u70B9\u53F3\u4E0A\u89D2\u300C\u65B0\u589E\u65B9\u6848\u300D\u5EFA\u7B2C\u4E00\u4E2A\u3002" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { className: "jh-plan-list", children: planList.map((plan) => {
		        const planStatus = status?.planStatus.find((item) => item.planId === plan.id) ?? null;
		        const decision = planStatus?.lastDecision ?? null;
		        const platformDecisions = new Map(
		          (planStatus?.platformDecisions ?? []).map((item) => [item.platformId, item.decision])
		        );
		        const blockedPlatforms = plan.platforms.filter(
		          (id) => (platformDecisions.get(id)?.reason ?? null) !== null
		        );
		        const platformName = (id) => platformList.find((item) => item.id === id)?.displayName ?? id;
		        const runBlocked = feedback.running || (status?.readOnly ?? false);
		        return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { className: "jh-plan-card", children: [
		          planStatus?.riskPaused === true && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-banner jh-banner-error", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-banner-title", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Term, { term: "\u98CE\u63A7\u6682\u505C", children: "\u5DF2\u88AB\u6682\u505C\u81EA\u52A8\u91C7\u96C6" }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: planStatus.riskReason ?? "\u89E6\u53D1\u98CE\u63A7\u4FE1\u53F7\uFF0C\u5DF2\u505C\u6B62\u81EA\u52A8\u5C1D\u8BD5\u3002" })
		          ] }),
		          planStatus !== null && planStatus.backoffUntil !== null && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-banner jh-banner-warn", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "jh-banner-title", children: [
		              "\u8FDE\u7EED\u5931\u8D25 ",
		              planStatus.failStreak,
		              " \u6B21\uFF0C\u6B63\u5728",
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Term, { term: "\u9000\u907F", children: "\u9000\u907F" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { children: [
		              "\u6700\u65E9 ",
		              formatClock(new Date(planStatus.backoffUntil)),
		              " \u518D\u8BD5\u3002"
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-plan-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { className: "jh-plan-name", children: plan.name }),
		            planStatus === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              FreshnessBadge,
		              {
		                level: planStatus.freshness.level,
		                hours: planStatus.freshness.hoursSinceSuccess
		              }
		            ),
		            plan.enabled ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-tag jh-tone-muted", children: "\u5DF2\u505C\u7528" }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-primary",
		                disabled: runBlocked,
		                title: runBlockTitle,
		                onClick: () => void trigger(plan),
		                children: "\u7ACB\u5373\u91C7\u96C6"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny",
		                disabled: feedback.running,
		                title: "\u6539\u8FD9\u4E2A\u65B9\u6848\u6293\u4EC0\u4E48\u3001\u6293\u591A\u6DF1\u3001\u4EC0\u4E48\u65F6\u5019\u6293\u3002",
		                onClick: () => {
		                  setDuplicates([]);
		                  setEditing(plan.id);
		                },
		                children: "\u7F16\u8F91"
		              }
		            ),
		            planStatus?.riskPaused === true && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-warn",
		                disabled: feedback.running,
		                title: "\u786E\u8BA4\u73AF\u5883\u5DF2\u6062\u590D\u6B63\u5E38\uFF0C\u5141\u8BB8\u8FD9\u4E2A\u65B9\u6848\u91CD\u65B0\u88AB\u81EA\u52A8\u91C7\u96C6\u3002\u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u3002",
		                onClick: () => void act("\u6B63\u5728\u6062\u590D\u2026", async () => {
		                  await resumePlanRisk(plan.id);
		                  return `\u65B9\u6848\u300C${plan.name}\u300D\u5DF2\u6062\u590D \u2014\u2014 \u8FD9\u4E00\u4E0B\u662F\u4F60\u786E\u8BA4\u7684\uFF0C\u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u3002`;
		                }),
		                children: "\u786E\u8BA4\u6062\u590D"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost",
		                disabled: feedback.running,
		                title: "\u5220\u9664\u8FD9\u4E2A\u65B9\u6848\uFF08\u4F1A\u5148\u8BA9\u4F60\u786E\u8BA4\uFF09\u3002\u5DF2\u7ECF\u6293\u5230\u7684\u5C97\u4F4D\u4E0D\u53D7\u5F71\u54CD\u3002",
		                onClick: () => setPendingDelete(plan),
		                children: "\u5220\u9664"
		              }
		            )
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-plan-meta", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: plan.platforms.join(" / ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(CriteriaLine, { plan, dimensions: dimensionList })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-plan-meta", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: plan.schedule.enabled ? `${formatWeekdays(plan.schedule.weekdays)} ${formatWindow(
		              plan.schedule.windowStartHour,
		              plan.schedule.windowStartMinute,
		              plan.schedule.windowEndHour,
		              plan.schedule.windowEndMinute
		            )}` : "\u4E0D\u5B9A\u65F6" }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { children: [
		              plan.postProcess.score ? "\u6253\u5206" : "\u4E0D\u6253\u5206",
		              " \xB7",
		              " ",
		              plan.postProcess.flag ? "\u6807\u6CE8" : "\u4E0D\u6807\u6CE8",
		              " \xB7",
		              " ",
		              plan.postProcess.dedup ? "\u53BB\u91CD" : "\u4E0D\u53BB\u91CD"
		            ] })
		          ] }),
		          decision === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: decision.decision === "skipped" ? "jh-warn" : "jh-muted", children: decision.decision === "skipped" ? `\u4E0A\u6B21\u5230\u70B9\u6CA1\u8DD1\uFF1A${decision.message ?? decision.reason ?? "\u539F\u56E0\u672A\u77E5"}` : decision.decision === "ran" ? "\u4E0A\u6B21\u5230\u70B9\u8DD1\u4E86" : "\u8FD8\u5728\u7B49\u4E0B\u4E00\u4E2A\u65F6\u6BB5" }),
		          blockedPlatforms.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-muted", children: [
		            "\u5404\u5E73\u53F0\uFF1A",
		            plan.platforms.map((id) => {
		              const item = platformDecisions.get(id) ?? null;
		              return item?.reason == null ? `${platformName(id)} \u6B63\u5E38` : `${platformName(id)}\uFF1A${item.message ?? item.reason}`;
		            }).join(" \xB7 ")
		          ] })
		        ] }, plan.id);
		      }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(DedupGroupsCard, { revision: props.revision }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { className: "jh-card-title", children: "\u5E73\u53F0\u72B6\u6001" }),
		      platforms.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-error", children: platforms.state.message }),
		      platformsLoading ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-muted", "aria-busy": "true", "aria-live": "polite", children: "\u6B63\u5728\u8BFB\u53D6\u5E73\u53F0\u72B6\u6001\u2026" }) : platformList.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-empty", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6CE8\u518C\u5E73\u53F0\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-note", children: "\u5E73\u53F0\u6765\u81EA\u9002\u914D\u5668\u6CE8\u518C\u8868\uFF1B\u5F53\u524D\u6CA1\u6709\u4EFB\u4F55\u9002\u914D\u5668\u88AB\u6CE8\u518C\uFF0C\u6240\u4EE5\u65E0\u6CD5\u91C7\u96C6\u3002" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { className: "jh-list jh-status-list", children: platformList.map((item) => {
		        const missing = item.fields.filter((field) => field.consecutiveMiss > 0);
		        const implemented = [
		          "\u5217\u8868\u91C7\u96C6",
		          item.implementation.detail ? "\u8BE6\u60C5\u9875" : null,
		          item.implementation.actions.sayHello ? "\u6253\u62DB\u547C" : null,
		          item.implementation.actions.readInbox ? "\u6536\u4EF6\u7BB1" : null
		        ].filter((part) => part !== null);
		        const supportedNotImplemented = [
		          item.capabilities.supportsGreeting && !item.implementation.actions.sayHello ? "\u6253\u62DB\u547C" : null,
		          item.capabilities.supportsInbox && !item.implementation.actions.readInbox ? "\u6536\u4EF6\u7BB1" : null,
		          item.capabilities.supportsAttachment && !item.implementation.actions.sendResume ? "\u9644\u4EF6\u6295\u9012" : null
		        ].filter((part) => part !== null);
		        return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		            "span",
		            {
		              className: `jh-status-dot${item.health === "healthy" && item.account.loggedIn ? " jh-status-dot-on" : item.health === "broken" ? " jh-status-dot-bad" : " jh-status-dot-warn"}`,
		              "aria-hidden": "true"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("code", { children: item.id }),
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(StateTag, { state: item.health, kind: "health" }),
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: item.account.loggedIn ? "jh-ok" : "jh-warn", children: item.account.loggedIn ? "\u5DF2\u767B\u5F55" : "\u672A\u767B\u5F55" }),
		          " ",
		          item.login.state === "running" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-warn", children: "\u767B\u5F55\u68C0\u6D4B\u4E2D\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-tiny",
		              disabled: feedback.running,
		              title: feedback.running ? "\u6709\u53E6\u4E00\u4E2A\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u5019\u3002" : "\u6253\u5F00\u767B\u5F55\u9875\uFF0C\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\u91CC\u5B8C\u6210\u767B\u5F55\u3002",
		              onClick: () => void login(item.id),
		              children: "\u767B\u5F55"
		            }
		          ),
		          item.login.message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-muted", children: item.login.message }),
		          item.account.hint === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-muted", children: item.account.hint }),
		          item.healthReason === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-muted", children: item.healthReason }),
		          maturityNeedsWarning(item.maturity.level) ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-warn", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Term, { term: "\u6210\u719F\u5EA6", children: MATURITY_LEVEL_LABEL[item.maturity.level] }),
		            item.maturity.notes === void 0 || item.maturity.notes === "" ? null : `\uFF1A${item.maturity.notes}`
		          ] }) : null,
		          !item.implementation.loginCheck && Object.values(item.authRequirement).includes("required") ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-warn", children: "\u8BE5\u5E73\u53F0\u9700\u8981\u767B\u5F55\uFF0C\u4F46\u672C\u673A\u8FD8\u6CA1\u6709\u767B\u5F55\u6001\u68C0\u6D4B \u2014\u2014 \u672A\u767B\u5F55\u65F6\u53EF\u80FD\u9759\u9ED8\u6293\u5230\u7A7A\u7ED3\u679C\u3002" }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-muted", children: [
		            "\u5DF2\u5B9E\u73B0\uFF1A",
		            implemented.join(" \xB7 "),
		            supportedNotImplemented.length === 0 ? null : ` \uFF5C \u5E73\u53F0\u652F\u6301\u4F46\u5C1A\u672A\u5B9E\u73B0\uFF1A${supportedNotImplemented.join("\u3001")}`
		          ] }),
		          missing.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-warn", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Term, { term: "\u9010\u5B57\u6BB5\u5065\u5EB7", children: "\u8FDE\u7EED\u7F3A\u5931" }),
		              "\uFF1A",
		              missing.map((field) => `${field.field}\xD7${String(field.consecutiveMiss)}`).join(" \xB7 ")
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny",
		                onClick: props.onGoSettings,
		                title: "\u770B\u8BCA\u65AD\u4FE1\u606F\uFF08\u7248\u672C\u3001\u6570\u636E\u8DEF\u5F84\u3001\u8BA1\u6570\u3001\u5DE5\u5177\u6CE8\u518C\u7ED3\u679C\uFF09",
		                children: "\u6392\u67E5\u65B9\u6848"
		              }
		            )
		          ] })
		        ] }, item.id);
		      }) })
		    ] }),
		    editing === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		      PlanEditorModal,
		      {
		        planId: editing === "new" ? null : editing,
		        initial: editing === "new" ? emptyForm(platformList.map((item) => item.id)) : formOf(planList.find((plan) => plan.id === editing)),
		        available: platformList.map((item) => ({ id: item.id, displayName: item.displayName })),
		        duplicates,
		        running: feedback.running,
		        onCancel: () => setEditing(null),
		        onSubmit: async (form) => {
		          setFeedback({ running: true, tone: "ok", message: "\u6B63\u5728\u4FDD\u5B58\u2026" });
		          try {
		            const input = writeOf(form);
		            const result = editing === "new" ? await createPlan(input) : await updatePlan(editing, input);
		            setDuplicates(result.duplicates);
		            const verb = editing === "new" ? "\u5DF2\u521B\u5EFA" : "\u5DF2\u4FDD\u5B58";
		            setFeedback({
		              running: false,
		              tone: "ok",
		              message: result.duplicates.length === 0 ? `${verb}\u65B9\u6848\u300C${result.plan.name}\u300D\u3002` : `${verb}\u65B9\u6848\u300C${result.plan.name}\u300D\u3002\u6CE8\u610F\uFF1A\u4E0E ${result.duplicates.map((item) => `#${String(item.planId)}\u300C${item.name}\u300D`).join("\u3001")} \u6761\u4EF6\u91CD\u590D\uFF08**\u53EA\u63D0\u793A\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u5408\u5E76**\uFF09\u3002`
		            });
		            if (result.duplicates.length === 0) setEditing(null);
		            reload();
		          } catch (error) {
		            report(error);
		          }
		        },
		        onValidate: async (form) => {
		          if (editing === "new") return [];
		          const result = await validatePlan(editing, writeOf(form));
		          return result.duplicates;
		        }
		      },
		      String(editing)
		    ),
		    pendingDelete === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		      Modal,
		      {
		        title: "\u5220\u9664\u91C7\u96C6\u65B9\u6848",
		        label: "\u5220\u9664\u786E\u8BA4",
		        onClose: () => setPendingDelete(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-modal-foot-note jh-muted", children: "\u5220\u9664\u540E\u8FD9\u4E2A\u65B9\u6848\u4E0D\u4F1A\u518D\u81EA\u52A8\u91C7\u96C6\u3002" }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              onClick: () => setPendingDelete(null),
		              children: "\u53D6\u6D88"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-danger",
		              disabled: feedback.running,
		              onClick: () => void confirmDelete(pendingDelete),
		              children: "\u786E\u8BA4\u5220\u9664"
		            }
		          )
		        ] }),
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "jh-alert-body", children: [
		            "\u5373\u5C06\u5220\u9664\u65B9\u6848\u300C",
		            pendingDelete.name,
		            "\u300D\uFF08",
		            pendingDelete.platforms.join(" / "),
		            "\uFF09\u3002"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("ul", { className: "jh-note", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: "\u8FD9\u4E2A\u65B9\u6848\u672C\u8EAB\u4E0E\u5176\u5B9A\u65F6\u914D\u7F6E\u4F1A\u88AB\u79FB\u9664\uFF0C\u4E0D\u4F1A\u518D\u6709\u81EA\u52A8\u91C7\u96C6\u3002" }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: "**\u5DF2\u7ECF\u6293\u5230\u7684\u5C97\u4F4D\u4F1A\u4FDD\u7559** \u2014\u2014 \u5220\u9664\u65B9\u6848\u4E0D\u4F1A\u5220\u5C97\u4F4D\u5E93\u3002" }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("li", { children: "\u60F3\u4FDD\u7559\u914D\u7F6E\u53EA\u662F\u6682\u65F6\u505C\u7528\uFF0C\u8BF7\u6539\u7528\u300C\u7F16\u8F91\u300D\u91CC\u7684\u300C\u542F\u7528\u5B9A\u65F6\u300D\u6216\u505C\u7528\u65B9\u6848\u3002" })
		          ] })
		        ]
		      }
		    ),
		    errorDetail === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		      Modal,
		      {
		        title: `\u8FD0\u884C\u5931\u8D25 \xB7 ${CRAWL_STATE_LABEL[errorDetail.run.state]}`,
		        label: "\u8FD0\u884C\u5931\u8D25\u8BE6\u60C5",
		        size: "lg",
		        onClose: () => setErrorDetail(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-quiet",
		              onClick: () => setErrorDetail(null),
		              children: "\u5173\u95ED"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              onClick: () => {
		                setErrorDetail(null);
		                props.onGoSettings();
		              },
		              children: "\u53BB\u8BBE\u7F6E\u770B\u8BCA\u65AD"
		            }
		          )
		        ] }),
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("ul", { className: "jh-kv", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u5E73\u53F0" }),
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("code", { children: errorDetail.run.platformId }) })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u5F00\u59CB\u65F6\u95F4" }),
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: new Date(errorDetail.run.startedAt).toLocaleString() })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u7C7B\u522B" }),
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: FAILURE_KIND_LABEL[errorDetail.failure.kind] })
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-note", children: errorDetail.failure.advice }),
		          errorDetail.failure.detail === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-note", children: "\u539F\u59CB\u4FE1\u606F\uFF08\u6280\u672F\u7EC6\u8282\uFF09\uFF1A" }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("pre", { className: "jh-pre", children: errorDetail.failure.detail })
		          ] })
		        ]
		      }
		    )
		  ] });
		}
		function StatusAlert(props) {
		  if (props.status.paused) {
		    return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-alert jh-alert-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-alert-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-alert-title", children: "\u5B9A\u65F6\u5DF2\u624B\u52A8\u6682\u505C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-primary",
		            disabled: props.running,
		            title: "\u6062\u590D\u300C\u5230\u70B9\u81EA\u52A8\u8DD1\u300D\u3002\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4E00\u76F4\u90FD\u80FD\u7528\u3002",
		            onClick: props.onResume,
		            children: "\u6062\u590D\u5B9A\u65F6"
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "jh-alert-body", children: [
		        props.status.pausedReason === null ? "" : `${props.status.pausedReason}\u3002`,
		        props.planName === null ? "\u6062\u590D\u540E\u4F1A\u6309\u5404\u65B9\u6848\u914D\u7F6E\u7684\u65F6\u6BB5\u81EA\u52A8\u91C7\u96C6\u3002" : `\u6062\u590D\u540E\u5C06\u81EA\u52A8\u6309\u300C${props.planName}\u300D\u65B9\u6848\u8FD0\u884C\u3002`,
		        "\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4E0D\u53D7\u5F71\u54CD\u3002"
		      ] })
		    ] });
		  }
		  if (props.status.refreshSuggested && props.status.refreshHint !== null) {
		    return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-alert jh-alert-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-alert-title", children: "\u6570\u636E\u504F\u65E7\uFF0C\u5EFA\u8BAE\u624B\u52A8\u5237\u65B0\u4E00\u6B21" }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-alert-body", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(InlineMd, { text: props.status.refreshHint }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-note", children: "\u4E0D\u4F1A\u81EA\u52A8\u8DD1 \u2014\u2014 \u7A0B\u5E8F\u53EA\u5728\u4F60\u5728\u573A\u65F6\u6D3B\u7740\uFF0C\u6240\u4EE5\u8FD9\u91CC\u53EA\u63D0\u793A\uFF0C\u7531\u4F60\u51B3\u5B9A\u3002" })
		    ] });
		  }
		  return null;
		}
		function CriteriaLine(props) {
		  const scoped = props.dimensions.filter((dimension) => props.plan.criteria[dimension.key] !== void 0);
		  const items = describeCriteria(props.plan.criteria, scoped);
		  if (items.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-muted", children: "\u6761\u4EF6\uFF1A\u4E0D\u9650" });
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: items.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { children: [
		    index === 0 ? "" : " \xB7 ",
		    item.label,
		    "\uFF1A",
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { children: item.display })
		  ] }, item.key)) });
		}
		function LeasePanel(props) {
		  const { lease } = props.status;
		  const heartbeat = lease.heartbeatAt === null ? null : new Date(lease.heartbeatAt);
		  const takeoverPossible = !lease.held && lease.stale;
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: `jh-lease${lease.held ? " jh-lease-ok" : " jh-lease-warn"}`, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-lease-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { children: lease.held ? "\u672C\u7A97\u53E3\u8D1F\u8D23\u91C7\u96C6" : "\u672C\u7A97\u53E3\u53EA\u8BFB" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-muted", children: lease.held ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		        "\uFF08\u672C\u7A97\u53E3 ",
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Term, { term: "pid", children: "\u8FDB\u7A0B" }),
		        " ",
		        String(lease.pid ?? "?"),
		        "\uFF09"
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		        "\uFF08\u53E6\u4E00\u4E2A\u7A97\u53E3 ",
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Term, { term: "pid", children: "\u8FDB\u7A0B" }),
		        " ",
		        String(lease.pid ?? "?"),
		        " \u6B63\u5728\u8FD0\u884C",
		        heartbeat === null ? "" : `\uFF0C${formatRelative(heartbeat, props.now)}\u8FD8\u6709\u5FC3\u8DF3`,
		        "\uFF09"
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-tiny",
		          disabled: props.running,
		          title: "\u7ACB\u523B\u518D\u68C0\u67E5\u4E00\u6B21\u662F\u5426\u8BE5\u8F6E\u5230\u672C\u7A97\u53E3\u91C7\u96C6\uFF08\u4E0D\u7528\u7B49 90 \u79D2\u5FC3\u8DF3\u8FC7\u671F\uFF09\u3002",
		          onClick: props.onRecheck,
		          children: "\u91CD\u65B0\u68C0\u6D4B"
		        }
		      ),
		      lease.held ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-tiny",
		          disabled: props.running || !takeoverPossible,
		          title: takeoverPossible ? "\u5BF9\u65B9\u7684\u5FC3\u8DF3\u5DF2\u7ECF\u8FC7\u671F\uFF08\u5F88\u53EF\u80FD\u5DF2\u88AB\u5F3A\u6740\uFF09\u3002\u70B9\u8FD9\u91CC\u628A\u91C7\u96C6\u6743\u62FF\u8FC7\u6765\u3002" : `\u53E6\u4E00\u4E2A\u7A97\u53E3\uFF08\u8FDB\u7A0B ${String(lease.pid ?? "?")}\uFF09\u8FD8\u6D3B\u7740\uFF0C\u4E0D\u80FD\u62A2\u5B83\u7684\u91C7\u96C6\u6743 \u2014\u2014 \u4E24\u4E2A\u7A97\u53E3\u540C\u65F6\u91C7\u96C6\u4F1A\u62A2\u540C\u4E00\u4EFD\u6D4F\u89C8\u5668\u767B\u5F55\u6001\u3002\u8BF7\u5728\u90A3\u4E2A\u7A97\u53E3\u91CC\u64CD\u4F5C\uFF0C\u6216\u5148\u628A\u5B83\u5173\u6389\uFF0C\u7136\u540E\u70B9\u300C\u91CD\u65B0\u68C0\u6D4B\u300D\uFF08\u5173\u6389\u540E\u6700\u591A 90 \u79D2\u4F1A\u81EA\u52A8\u63A5\u7BA1\uFF0C\u4E0D\u9700\u8981\u91CD\u542F\uFF09\u3002`,
		          onClick: props.onTakeover,
		          children: "\u63A5\u7BA1\u8C03\u5EA6"
		        }
		      )
		    ] }),
		    lease.held ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-note", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(InlineMd, { text: "\u600E\u4E48\u89E3\u51B3\uFF1A\u2460 \u5230\u90A3\u4E2A\u7A97\u53E3\u91CC\u64CD\u4F5C\uFF08\u6700\u7A33\uFF09\uFF1B\u2461 \u5173\u6389\u90A3\u4E2A\u7A97\u53E3 \u2014\u2014 \u5173\u6389\u4E4B\u540E\u8FD9\u91CC\u4F1A**\u81EA\u52A8**\u63A5\u7BA1\uFF0C\u4E0D\u7528\u91CD\u542F\uFF0C\u4E5F\u53EF\u4EE5\u70B9\u300C\u91CD\u65B0\u68C0\u6D4B\u300D\u7ACB\u523B\u8BD5\u4E00\u6B21\u3002" }) })
		  ] });
		}
		function RunHistoryTable(props) {
		  if (props.loading) {
		    return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h3", { className: "jh-sub-title", children: "\u6700\u8FD1\u8FD0\u884C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-muted", "aria-busy": "true", "aria-live": "polite", children: "\u6B63\u5728\u8BFB\u53D6\u8FD0\u884C\u8BB0\u5F55\u2026" })
		    ] });
		  }
		  if (props.runs.length === 0) {
		    return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h3", { className: "jh-sub-title", children: "\u6700\u8FD1\u8FD0\u884C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-empty", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u8FD0\u884C\u8BB0\u5F55\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-note", children: "\u7B2C\u4E00\u6B21\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u6216\u7B49\u5230\u504F\u597D\u65F6\u6BB5\u81EA\u52A8\u89E6\u53D1\u4E4B\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u6BCF\u4E00\u8F6E\u7684\u7ED3\u679C\u3002" })
		      ] })
		    ] });
		  }
		  const showReason = props.runs.some((run) => runReasonLabel(run.reason) !== null);
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h3", { className: "jh-sub-title", children: "\u6700\u8FD1\u8FD0\u884C" }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("table", { className: "jh-table jh-table-runs", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", className: "jh-col-sticky", children: "\u5F00\u59CB" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", children: "\u72B6\u6001" }),
		        showReason ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", children: "\u89E6\u53D1" }) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", className: "jh-num", children: "\u65B0\u589E" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", className: "jh-num jh-col-hide-sm", children: "\u66F4\u65B0" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("th", { scope: "col", children: "\u7ED3\u679C\u8BF4\u660E" })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("tbody", { children: props.runs.map((run) => {
		        const skip = props.reasonFor(run.skipReason);
		        const failure = skip === null ? humanizeFailure(run.errorCode, run.errorMsg) : null;
		        return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { className: "jh-col-sticky", title: new Date(run.startedAt).toLocaleString(), children: formatClock(new Date(run.startedAt)) }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(StateTag, { state: run.state, kind: "run" }) }),
		          showReason ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { children: runReasonLabel(run.reason) ?? "\u2014" }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { className: "jh-num", children: run.inserted }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { className: "jh-num jh-col-hide-sm", children: run.updated }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("td", { children: skip !== null ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: skip }) : failure === null ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-muted", children: "\u2014" }) : (
		            // 单元格里只留"图标 + 一句人话（过长则截断）+ 详情"；点开是弹窗。
		            // 图标让"这是错误"不只靠颜色表达；截断是为了不再把状态列撑宽。
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		              "button",
		              {
		                type: "button",
		                className: "jh-err-chip",
		                title: failure.detail === null ? failure.short : failure.detail.split("\n")[0],
		                onClick: () => props.onOpenError(run, failure),
		                children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-err-chip-icon", "aria-hidden": "true", children: "\u26A0" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-err-chip-short", children: failure.short }),
		                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-err-chip-more", children: "\u8BE6\u60C5" })
		                ]
		              }
		            )
		          ) })
		        ] }, run.id);
		      }) })
		    ] }) })
		  ] });
		}
		function PlanEditorModal(props) {
		  const [form, setForm] = (0, import_react11.useState)(props.initial);
		  const [localDuplicates, setLocalDuplicates] = (0, import_react11.useState)([]);
		  const patch = (next) => setForm((current) => ({ ...current, ...next }));
		  const duplicates = [...props.duplicates, ...localDuplicates];
		  const startMissing = parseClockValue(form.windowStart) === null;
		  const endMissing = parseClockValue(form.windowEnd) === null;
		  const validationKey = `${form.platforms.join(",")}\0${JSON.stringify(form.criteria)}`;
		  (0, import_react11.useEffect)(() => {
		    if (props.planId === null) {
		      setLocalDuplicates([]);
		      return;
		    }
		    const timer = window.setTimeout(() => {
		      void props.onValidate(form).then(setLocalDuplicates).catch(() => setLocalDuplicates([]));
		    }, 600);
		    return () => window.clearTimeout(timer);
		  }, [validationKey, props.planId]);
		  const dimensions = useAsync(
		    (signal) => fetchCriteriaDimensions(form.platforms, signal),
		    [form.platforms.join(",")]
		  );
		  const items = dimensions.state.status === "ok" ? dimensions.state.data.items : [];
		  const togglePlatform = (id) => {
		    const next = form.platforms.includes(id) ? form.platforms.filter((item) => item !== id) : [...form.platforms, id];
		    patch({ platforms: next });
		  };
		  const setCriteria = (key, value) => {
		    const next = { ...form.criteria };
		    if (value === "") delete next[key];
		    else next[key] = value;
		    patch({ criteria: next });
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		    Modal,
		    {
		      title: props.planId === null ? "\u65B0\u589E\u91C7\u96C6\u65B9\u6848" : "\u7F16\u8F91\u91C7\u96C6\u65B9\u6848",
		      label: "\u91C7\u96C6\u65B9\u6848",
		      size: "lg",
		      onClose: props.onCancel,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-muted jh-modal-foot-note", children: "\u4FDD\u5B58\u524D\u4F1A\u6309\u540C\u4E00\u5957\u89C4\u5219\u6821\u9A8C\uFF08\u4E0E\u6A21\u578B\u5DE5\u5177\u3001\u63A5\u53E3\u4E00\u81F4\uFF09\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: props.onCancel, children: "\u53D6\u6D88" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-primary",
		            disabled: props.running,
		            title: props.running ? "\u6B63\u5728\u4FDD\u5B58\uFF0C\u8BF7\u7A0D\u5019\u3002" : "\u4FDD\u5B58\u8FD9\u4E2A\u65B9\u6848\u3002",
		            onClick: () => void props.onSubmit(form),
		            children: "\u4FDD\u5B58"
		          }
		        )
		      ] }),
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-field-label", children: "\u65B9\u6848\u540D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-field-row", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "input",
		              {
		                className: "jh-input",
		                value: form.name,
		                onChange: (event) => patch({ name: event.target.value })
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny",
		                disabled: props.running,
		                title: "\u68C0\u67E5\u8FD9\u4EFD\u914D\u7F6E\uFF08\u5E73\u53F0 + \u7B5B\u9009\u6761\u4EF6\uFF09\u662F\u5426\u4E0E\u73B0\u6709\u65B9\u6848\u91CD\u590D\uFF1B\u53EA\u63D0\u793A\uFF0C\u4E0D\u4F1A\u5199\u5165\u4EFB\u4F55\u4E1C\u897F\u3002",
		                onClick: () => {
		                  void props.onValidate(form).then((result) => setLocalDuplicates(result)).catch(() => setLocalDuplicates([]));
		                },
		                children: "\u68C0\u67E5\u662F\u5426\u91CD\u590D"
		              }
		            )
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "jh-field-label", children: [
		            "\u5E73\u53F0",
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(FieldHint, { text: "\u53EA\u5217\u51FA\u5DF2\u6CE8\u518C\u7684\u9002\u914D\u5668\u3002\u672A\u6CE8\u518C\u7684\u5E73\u53F0\u5728\u914D\u7F6E\u5C42\u9762\u5C31\u4E0D\u53EF\u9009 \u2014\u2014 \u591A\u5E73\u53F0\u662F\u5DE5\u7A0B\u91CF\u95EE\u9898\uFF08\u6BCF\u4E2A\u5E73\u53F0\u4E00\u4E2A\u9002\u914D\u5668\uFF09\uFF0C\u4E0D\u662F\u914D\u7F6E\u95EE\u9898\u3002" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-chips", children: props.available.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u5DF2\u6CE8\u518C\u7684\u5E73\u53F0\u3002" }) : props.available.map((item) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "jh-check", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "input",
		              {
		                type: "checkbox",
		                checked: form.platforms.includes(item.id),
		                onChange: () => togglePlatform(item.id)
		              }
		            ),
		            item.displayName,
		            "\uFF08",
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("code", { children: item.id }),
		            "\uFF09"
		          ] }, item.id)) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-section-title", children: "\u7B5B\u9009\u6761\u4EF6\u4E0E\u6293\u53D6\u6DF1\u5EA6" }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-grid2", children: items.map((dimension) => {
		          const value = form.criteria[dimension.key] ?? "";
		          const hint = dimension.supported ? dimension.hint : dimension.disabledReason ?? dimension.hint;
		          return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "jh-field", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "jh-field-label", children: [
		              dimension.label,
		              dimension.supported ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("em", { className: "jh-field-flag", children: "\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301" }),
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(FieldHint, { text: hint })
		            ] }),
		            dimension.numeric ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "input",
		              {
		                className: "jh-input",
		                type: "number",
		                min: 1,
		                max: dimension.max ?? void 0,
		                disabled: !dimension.supported,
		                value,
		                placeholder: dimension.supported ? "\u4E0D\u9650" : "\u4E0D\u652F\u6301",
		                onChange: (event) => setCriteria(dimension.key, event.target.value)
		              }
		            ) : dimension.values.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "input",
		              {
		                className: "jh-input",
		                disabled: !dimension.supported,
		                value,
		                placeholder: dimension.supported ? "\u4E0D\u9650" : "\u4E0D\u652F\u6301",
		                onChange: (event) => setCriteria(dimension.key, event.target.value)
		              }
		            ) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		              "select",
		              {
		                className: "jh-select",
		                disabled: !dimension.supported,
		                value,
		                onChange: (event) => setCriteria(dimension.key, event.target.value),
		                children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", children: "\u4E0D\u9650" }),
		                  dimension.values.map((option) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: option.value, children: option.label }, option.value))
		                ]
		              }
		            )
		          ] }, dimension.key);
		        }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("fieldset", { className: "jh-fieldset", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("legend", { children: [
		            "\u504F\u597D\u65F6\u6BB5",
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(FieldHint, { text: "\u89E6\u53D1\u65F6\u523B\u4F1A\u5728\u8FD9\u6BB5\u65F6\u95F4\u5185\u968F\u673A\u9009\u70B9\uFF0C\u5177\u4F53\u5230\u54EA\u4E00\u5206\u949F\u4E0D\u56FA\u5B9A \u2014\u2014 \u6BCF\u5929\u56FA\u5B9A\u540C\u4E00\u5206\u949F\u53BB\u8BBF\u95EE\u6700\u5BB9\u6613\u88AB\u5E73\u53F0\u8BC6\u522B\u6210\u81EA\u52A8\u5316\u3002\u8FD9\u91CC\u523B\u610F\u6CA1\u6709\u300C\u7CBE\u786E\u5230\u67D0\u5206\u67D0\u79D2\u300D\u7684\u9009\u9879\u3002" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-timerange", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "input",
		              {
		                className: "jh-input jh-time",
		                type: "time",
		                "aria-label": "\u65F6\u6BB5\u8D77\u70B9",
		                "aria-invalid": startMissing,
		                ...startMissing ? { "aria-describedby": "jh-window-error" } : {},
		                value: startMissing ? "" : form.windowStart,
		                onChange: (event) => {
		                  const text = event.target.value;
		                  if (text === "" || parseClockValue(text) !== null) patch({ windowStart: text });
		                }
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-timerange-sep", children: "\u81F3" }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "input",
		              {
		                className: "jh-input jh-time",
		                type: "time",
		                "aria-label": "\u65F6\u6BB5\u7EC8\u70B9",
		                "aria-invalid": endMissing,
		                ...endMissing ? { "aria-describedby": "jh-window-error" } : {},
		                value: endMissing ? "" : form.windowEnd,
		                onChange: (event) => {
		                  const text = event.target.value;
		                  if (text === "" || parseClockValue(text) !== null) patch({ windowEnd: text });
		                }
		              }
		            ),
		            startMissing || endMissing ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-warn", id: "jh-window-error", role: "alert", children: "\u65F6\u6BB5\u6CA1\u586B\u5B8C\u6574\uFF0C\u4FDD\u5B58\u65F6\u4F1A\u9000\u56DE\u9ED8\u8BA4\u7684 09:00\u201311:00\u3002" }) : null
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-field", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "jh-field-label", children: [
		              "\u8FD0\u884C\u65E5",
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(FieldHint, { text: "\u4E00\u5929\u90FD\u4E0D\u9009\u7B49\u4E8E\u6BCF\u5929\u90FD\u8DD1\u3002\u65F6\u6BB5\u8DE8\u96F6\u70B9\u4E5F\u53EF\u4EE5\uFF08\u4F8B\u5982 22:00 \u81F3 02:00\uFF09\u3002" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "jh-segmented", role: "group", "aria-label": "\u8FD0\u884C\u65E5", children: ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"].map((label, day) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		              "button",
		              {
		                type: "button",
		                className: `jh-seg${form.weekdays.includes(day) ? " jh-seg-on" : ""}`,
		                "aria-pressed": form.weekdays.includes(day),
		                title: `\u5468${label}`,
		                onClick: () => {
		                  const next = form.weekdays.includes(day) ? form.weekdays.filter((item) => item !== day) : [...form.weekdays, day].sort((a, b) => a - b);
		                  patch({ weekdays: next });
		                },
		                children: [
		                  "\u5468",
		                  label
		                ]
		              },
		              label
		            )) }),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-chips jh-presets", children: [
		              WEEKDAY_PRESETS.map((preset) => {
		                const active = form.weekdays.join(",") === preset.days.join(",");
		                return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: `jh-btn jh-btn-tiny${active ? " jh-btn-active" : ""}`,
		                    "aria-pressed": active,
		                    title: preset.days.length === 0 ? "\u6E05\u7A7A\uFF08\u7B49\u4E8E\u6BCF\u5929\uFF09" : `\u8BBE\u4E3A${preset.label}`,
		                    onClick: () => patch({ weekdays: [...preset.days] }),
		                    children: preset.label
		                  },
		                  preset.key
		                );
		              }),
		              /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "jh-muted", children: [
		                "\u5F53\u524D\uFF1A",
		                form.weekdays.length === 0 ? "\u6BCF\u5929" : formatWeekdays(form.weekdays)
		              ] })
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "jh-check", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		              "input",
		              {
		                type: "checkbox",
		                checked: form.scheduleEnabled,
		                onChange: (event) => patch({ scheduleEnabled: event.target.checked })
		              }
		            ),
		            "\u542F\u7528\u5B9A\u65F6"
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("fieldset", { className: "jh-fieldset", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("legend", { children: [
		            "\u6293\u53D6\u540E\u5904\u7406",
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(FieldHint, { text: "\u4E09\u9879\u9ED8\u8BA4\u5168\u5F00\u3002\u5173\u6389\u6253\u5206\u540E\u4E0D\u518D\u5199\u5339\u914D\u5206\uFF1B\u5173\u6389\u6807\u6CE8\u540E\u4E0D\u518D\u4EA7\u51FA\u98CE\u9669/\u9ED1\u8BDD\u6807\u8BB0\uFF1B\u8DE8\u5E73\u53F0\u53BB\u91CD\u8981\u6709\u591A\u4E2A\u5E73\u53F0\u624D\u751F\u6548\u3002" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-chips", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		              "label",
		              {
		                className: "jh-check",
		                title: "\u7B97\u51FA\u300C\u8FD9\u4E2A\u5C97\u4F4D\u8DDF\u4F60\u7B80\u5386\u6709\u591A\u5339\u914D\u300D\u5E76\u7ED9\u51FA\u9010\u6761\u7406\u7531\u3002\u5173\u6389\u540E\u5C97\u4F4D\u5E93\u91CC\u4E0D\u518D\u663E\u793A\u5339\u914D\u5206\u3002",
		                children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		                    "input",
		                    {
		                      type: "checkbox",
		                      checked: form.score,
		                      onChange: (event) => patch({ score: event.target.checked })
		                    }
		                  ),
		                  "\u6253\u5206"
		                ]
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		              "label",
		              {
		                className: "jh-check",
		                title: "\u8BC6\u522B\u300C\u7591\u4F3C\u5916\u5305 / \u9AD8\u98CE\u9669 / \u50F5\u5C38\u5C97\u4F4D / \u85AA\u8D44\u865A\u6807 / \u884C\u4E1A\u9ED1\u8BDD\u300D\u5E76\u6807\u51FA\u6765\u3002",
		                children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		                    "input",
		                    {
		                      type: "checkbox",
		                      checked: form.flag,
		                      onChange: (event) => patch({ flag: event.target.checked })
		                    }
		                  ),
		                  "\u98CE\u9669\u4E0E\u9ED1\u8BDD\u6807\u6CE8"
		                ]
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
		              "label",
		              {
		                className: "jh-check",
		                title: "\u540C\u4E00\u4E2A\u5C97\u4F4D\u51FA\u73B0\u5728\u591A\u4E2A\u62DB\u8058\u5E73\u53F0\u65F6\u5408\u5E76\u6210\u4E00\u6761\u3002\u76EE\u524D\u53EA\u63A5\u4E86\u4E00\u4E2A\u5E73\u53F0\uFF0C\u6240\u4EE5\u5B83\u6682\u65F6\u4E0D\u4F1A\u751F\u6548\u3002",
		                children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		                    "input",
		                    {
		                      type: "checkbox",
		                      checked: form.dedup,
		                      onChange: (event) => patch({ dedup: event.target.checked })
		                    }
		                  ),
		                  "\u8DE8\u5E73\u53F0\u53BB\u91CD"
		                ]
		              }
		            )
		          ] })
		        ] }),
		        duplicates.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "jh-warn", children: [
		          "\u4E0E ",
		          duplicates.map((item) => `#${String(item.planId)}\u300C${item.name}\u300D`).join("\u3001"),
		          " \u6761\u4EF6\u91CD\u590D\uFF08",
		          duplicates[0]?.reason ?? "",
		          "\uFF09\u3002",
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(InlineMd, { text: "**\u53EA\u63D0\u793A\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u5408\u5E76**" }),
		          "\u2014\u2014 \u5408\u5E76\u4F1A\u66FF\u4F60\u628A\u4E24\u4E2A\u610F\u56FE\u62B9\u6210\u4E00\u4E2A\u3002"
		        ] })
		      ]
		    }
		  );
		}
		function DedupGroupsCard(props) {
		  const groups = useAsync((signal) => fetchDedupGroups(signal), [props.revision]);
		  const [busyId, setBusyId] = (0, import_react11.useState)(null);
		  const [pendingDelete, setPendingDelete] = (0, import_react11.useState)(null);
		  const act = async (id, fn) => {
		    setBusyId(id);
		    try {
		      await fn();
		      groups.reload();
		    } finally {
		      setBusyId(null);
		    }
		  };
		  const items = groups.state.status === "ok" ? groups.state.data.items : [];
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "jh-form-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { className: "jh-card-title", children: "\u8DE8\u5E73\u53F0\u53BB\u91CD" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-muted", children: "\u540C\u4E00\u5C97\u4F4D\u88AB\u591A\u4E2A\u5E73\u53F0\u5404\u6293\u4E00\u6761 \u2192 \u5408\u5E76\u5230\u540C\u4E00\u7EC4\uFF1B\u8FD9\u91CC\u662F**\u53EF\u9006**\u7684\uFF0C\u8BEF\u5408\u5E76\u968F\u65F6\u53EF\u62C6\u3002" })
		    ] }),
		    groups.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-muted", "aria-busy": "true", children: "\u6B63\u5728\u8BFB\u53D6\u53BB\u91CD\u5206\u7EC4\u2026" }) : items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-muted", children: "\u76EE\u524D\u6CA1\u6709\u53BB\u91CD\u5206\u7EC4\u3002\u591A\u5E73\u53F0\u540C\u65F6\u5728\u6293\u540C\u4E00\u6279\u5C97\u4F4D\u65F6\uFF0C\u91CD\u590D\u7684\u90A3\u51E0\u6761\u624D\u4F1A\u88AB\u5408\u5E76\u5230\u8FD9\u91CC\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { className: "jh-tailor-notes", children: items.map((group) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "jh-muted", children: [
		        "\u7EC4 #",
		        group.id,
		        "\uFF08",
		        group.basis,
		        "\uFF09"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost",
		          disabled: busyId !== null,
		          onClick: () => setPendingDelete(group.id),
		          children: "\u62C6\u7EC4"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ul", { className: "jh-tailor-notes", children: group.members.map((member) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
		        "\xB7 ",
		        member.isPrimary ? "\u4E3B" : "\u4ECE",
		        "\uFF5C",
		        member.platformId,
		        "\uFF5C",
		        member.title,
		        member.companyName === null ? "" : `\uFF5C${member.companyName}`,
		        "\u3000",
		        "(",
		        member.city,
		        ")",
		        member.isPrimary ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-link",
		            disabled: busyId !== null,
		            onClick: () => void act(group.id, async () => splitDedupMember(group.id, member.id)),
		            children: "\u62C6\u51FA"
		          }
		        )
		      ] }, member.id)) })
		    ] }, group.id)) }),
		    pendingDelete === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		      Modal,
		      {
		        title: "\u62C6\u6563\u8FD9\u4E2A\u53BB\u91CD\u7EC4",
		        label: "\u62C6\u7EC4\u786E\u8BA4",
		        onClose: () => setPendingDelete(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => setPendingDelete(null), children: "\u53D6\u6D88" }),
		          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-danger",
		              disabled: busyId !== null,
		              onClick: () => {
		                const id = pendingDelete;
		                setPendingDelete(null);
		                void act(id, async () => deleteDedupGroup(id));
		              },
		              children: "\u786E\u8BA4\u62C6\u7EC4"
		            }
		          )
		        ] }),
		        children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "jh-alert-body", children: "\u62C6\u7EC4\u540E\u8FD9\u7EC4\u91CC\u7684\u5C97\u4F4D\u5168\u90E8\u53D8\u56DE\u72EC\u7ACB\u5C97\u4F4D\u3002**\u5C97\u4F4D\u672C\u8EAB\u4E0D\u4F1A\u5220** \u2014\u2014 \u53EA\u662F\u60F3\u64A4\u9500\u4E00\u6B21\u5408\u5E76\u5224\u65AD\u3002" })
		      }
		    )
		  ] });
		}

		// src/client/screens/resumes.tsx
		var import_react12 = require("react");

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
		var import_jsx_runtime15 = require("react/jsx-runtime");
		function move(items, index, delta) {
		  const target = index + delta;
		  if (target < 0 || target >= items.length) return items;
		  const next = [...items];
		  const [item] = next.splice(index, 1);
		  next.splice(target, 0, item);
		  return next;
		}
		function ResumesScreen(props) {
		  const list = useAsync((signal) => fetchResumes(signal), [props.revision]);
		  const [selected, setSelected] = (0, import_react12.useState)(null);
		  const [creating, setCreating] = (0, import_react12.useState)(false);
		  const [query, setQuery] = (0, import_react12.useState)("");
		  const [dirty, setDirty] = (0, import_react12.useState)(false);
		  const [issuesById, setIssuesById] = (0, import_react12.useState)({});
		  const items = list.state.status === "ok" ? list.state.data.items : [];
		  const shown = (0, import_react12.useMemo)(() => {
		    const key = query.trim().toLowerCase();
		    if (key === "") return items;
		    return items.filter(
		      (item) => `${item.name} ${item.direction}`.toLowerCase().includes(key)
		    );
		  }, [items, query]);
		  (0, import_react12.useEffect)(() => {
		    if (selected !== null || items.length === 0) return;
		    setSelected((items.find((item) => item.isDefault) ?? items[0])?.id ?? null);
		  }, [items, selected]);
		  const loadIssues = (0, import_react12.useCallback)(
		    (id) => {
		      if (issuesById[id] !== void 0) return;
		      void fetchResume(id).then((detail) => {
		        setIssuesById((current) => ({ ...current, [id]: detail.issues }));
		      }).catch(() => {
		      });
		    },
		    [issuesById]
		  );
		  const onCreate = (0, import_react12.useCallback)(async () => {
		    setCreating(true);
		    try {
		      const created = await createResume({ name: "\u65B0\u7B80\u5386", direction: "", content: emptyResumeContent() });
		      setSelected(created.id);
		      props.onChanged();
		    } finally {
		      setCreating(false);
		    }
		  }, [props]);
		  const pick = (id) => {
		    if (id === selected) return;
		    if (dirty && !window.confirm("\u8FD9\u4E00\u7248\u8FD8\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8\uFF0C\u5207\u8D70\u5C31\u4E22\u4E86\u3002\u786E\u5B9A\u5207\u6362\uFF1F")) return;
		    setSelected(id);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-screen jh-screen-wide", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { className: "jh-card-title", children: "\u7B80\u5386\u4E2D\u5FC3" }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-muted", children: "\u6309\u65B9\u5411\u7EF4\u62A4 2\u20133 \u7248\u5C31\u591F\u4E86 \u2014\u2014 \u6BCF\u6295\u4E00\u4E2A\u5C97\u4F4D\u6539\u4E00\u6B21\u7B80\u5386\uFF0C\u9762\u8BD5\u65F6\u53CD\u800C\u8BB2\u4E0D\u4E00\u81F4\u3002" })
		    ] }),
		    list.state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u7B80\u5386\u2026" }),
		    list.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-error", children: list.state.message }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "jh-btn", onClick: list.reload, children: "\u91CD\u8BD5" })
		    ] }),
		    list.state.status === "ok" && items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "jh-card", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u7B80\u5386\u3002\u5EFA\u4E00\u7248\u4E4B\u540E\uFF0C\u9644\u4EF6\uFF08PDF / Word\uFF09\u4E0E\u5C97\u4F4D\u5B9A\u5236\u90FD\u4F1A\u56F4\u7ED5\u5B83\u5DE5\u4F5C\u3002" }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-resume-shell", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("aside", { className: "jh-resume-side", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-resume-side-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              placeholder: "\u641C\u7D22\u7248\u672C\u2026",
		              "aria-label": "\u641C\u7D22\u7248\u672C",
		              value: query,
		              onChange: (event) => setQuery(event.target.value)
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-primary",
		              disabled: creating,
		              onClick: () => void onCreate(),
		              children: creating ? "\u2026" : "\u65B0\u5EFA"
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("ul", { className: "jh-resume-list", children: [
		          shown.map((item) => {
		            const issues = issuesById[item.id];
		            const active = selected === item.id;
		            return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
		              "button",
		              {
		                type: "button",
		                className: `jh-resume-item${active ? " jh-resume-item-active" : ""}`,
		                "data-resume-id": item.id,
		                "aria-current": active ? "true" : void 0,
		                onClick: () => pick(item.id),
		                children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-resume-item-top", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-resume-name", children: item.name }),
		                    item.isDefault ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "jh-badge-on", children: "\u542F\u7528\u4E2D" }) : null
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-resume-sub", children: [
		                    item.direction || "\u672A\u586B\u65B9\u5411",
		                    " \xB7 ",
		                    RESUME_LANGUAGE_LABEL[item.language],
		                    item.state === "archived" ? " \xB7 \u5DF2\u5F52\u6863" : ""
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-resume-chips", children: [
		                    item.counts.skills > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("i", { className: "jh-chip", children: [
		                      "\u6280\u80FD ",
		                      item.counts.skills
		                    ] }) : null,
		                    item.counts.experiences > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("i", { className: "jh-chip", children: [
		                      "\u7ECF\u5386 ",
		                      item.counts.experiences
		                    ] }) : null,
		                    item.counts.projects > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("i", { className: "jh-chip", children: [
		                      "\u9879\u76EE ",
		                      item.counts.projects
		                    ] }) : null,
		                    item.counts.files > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("i", { className: "jh-chip", children: [
		                      "\u9644\u4EF6 ",
		                      item.counts.files
		                    ] }) : null,
		                    item.issues > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
		                      "i",
		                      {
		                        className: "jh-chip jh-chip-warn",
		                        onMouseEnter: () => loadIssues(item.id),
		                        title: issues === void 0 ? "\u9F20\u6807\u505C\u4E00\u4E0B\u770B\u662F\u54EA\u51E0\u9879" : issues.map((issue) => `${issue.level === "error" ? "\u5FC5\u6539" : "\u5EFA\u8BAE"}\uFF1A${issue.message}`).join("\n"),
		                        children: [
		                          "\u26A0 \u4F53\u68C0 ",
		                          item.issues,
		                          " \u9879"
		                        ]
		                      }
		                    ) : null,
		                    item.counts.skills === 0 && item.counts.experiences === 0 && item.issues === 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "jh-chip jh-chip-quiet", children: "\u8FD8\u662F\u7A7A\u7684" }) : null
		                  ] })
		                ]
		              }
		            ) }, item.id);
		          }),
		          shown.length === 0 && items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "jh-muted", children: [
		            "\u6CA1\u6709\u5339\u914D\u300C",
		            query,
		            "\u300D\u7684\u7248\u672C\u3002"
		          ] }) }) : null
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("section", { className: "jh-resume-work", children: selected === null ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-muted", children: "\u9009\u5DE6\u8FB9\u4E00\u7248\u7B80\u5386\u5F00\u59CB\u7F16\u8F91\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        ResumeWork,
		        {
		          id: selected,
		          onChanged: props.onChanged,
		          onDirtyChange: setDirty,
		          onDeleted: () => {
		            setSelected(null);
		            setDirty(false);
		            props.onChanged();
		          }
		        },
		        String(selected)
		      ) })
		    ] })
		  ] });
		}
		function ResumeWork(props) {
		  const detail = useAsync((signal) => fetchResume(props.id, signal), [props.id]);
		  const [draft, setDraft] = (0, import_react12.useState)(null);
		  const [dirty, setDirty] = (0, import_react12.useState)(false);
		  const [mode, setMode] = (0, import_react12.useState)("edit");
		  const [busy, setBusy] = (0, import_react12.useState)(null);
		  const [error, setError] = (0, import_react12.useState)(null);
		  const [notice, setNotice] = (0, import_react12.useState)(null);
		  const [template, setTemplate] = (0, import_react12.useState)("concise");
		  const [split, setSplit] = (0, import_react12.useState)(55);
		  const bodyRef = (0, import_react12.useRef)(null);
		  const startDrag = (clientX, clientY) => {
		    const body = bodyRef.current;
		    if (body === null) return;
		    const rect = body.getBoundingClientRect();
		    const sideBySide = getComputedStyle(body).gridTemplateColumns.trim().split(/\s+/).length > 1;
		    const move2 = (event) => {
		      const ratio = sideBySide ? (event.clientX - rect.left) / rect.width * 100 : (event.clientY - rect.top) / rect.height * 100;
		      setSplit(Math.min(80, Math.max(20, ratio)));
		    };
		    const stop = () => {
		      window.removeEventListener("pointermove", move2);
		      window.removeEventListener("pointerup", stop);
		    };
		    window.addEventListener("pointermove", move2);
		    window.addEventListener("pointerup", stop);
		  };
		  (0, import_react12.useEffect)(() => {
		    if (detail.state.status === "ok") setDraft(detail.state.data);
		  }, [detail.state]);
		  (0, import_react12.useEffect)(() => {
		    props.onDirtyChange(dirty);
		  }, [dirty, props]);
		  const issues = detail.state.status === "ok" ? detail.state.data.issues : [];
		  const run = (0, import_react12.useCallback)(
		    async (label, fn, done) => {
		      setBusy(label);
		      setError(null);
		      setNotice(null);
		      try {
		        const result = await fn();
		        setNotice(done === void 0 ? "\u5DF2\u5B8C\u6210" : done(result));
		        props.onChanged();
		      } catch (caught) {
		        setError(
		          caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught)
		        );
		      } finally {
		        setBusy(null);
		      }
		    },
		    [props]
		  );
		  if (draft === null) {
		    return detail.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-error", children: detail.state.message }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u2026" });
		  }
		  const content = draft.content;
		  const patchContent = (next) => {
		    setDraft({ ...draft, content: next });
		    setDirty(true);
		  };
		  const patchBasics = (patch) => {
		    patchContent({ ...content, basics: { ...content.basics, ...patch } });
		  };
		  const save = () => {
		    void run(
		      "\u4FDD\u5B58",
		      async () => await updateResume(props.id, {
		        name: draft.name,
		        direction: draft.direction,
		        language: draft.language,
		        content: draft.content
		      }),
		      (result) => {
		        const resume = result;
		        setDraft(resume);
		        setDirty(false);
		        return `\u5DF2\u4FDD\u5B58\uFF08rev ${String(resume.rev)}\uFF09\u2014\u2014 \u4E4B\u524D\u7B97\u8FC7\u7684\u5339\u914D\u5206\u5DF2\u6807\u8BB0\u4E3A\u8FC7\u671F`;
		      }
		    );
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-work-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "input",
		        {
		          className: "jh-input jh-editable",
		          "aria-label": "\u7248\u672C\u540D",
		          title: "\u70B9\u51FB\u6539\u540D\uFF0C\u56DE\u8F66\u4FDD\u5B58",
		          value: draft.name,
		          onChange: (event) => {
		            setDraft({ ...draft, name: event.target.value });
		            setDirty(true);
		          },
		          onKeyDown: (event) => {
		            if (event.key !== "Enter") return;
		            event.preventDefault();
		            if (dirty) save();
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u270E" }),
		      dirty ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-chip jh-chip-dirty", children: "\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-work-actions", children: [
		        draft.isDefault ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-badge", children: "\u5F53\u524D\u542F\u7528" }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void run("\u8BBE\u4E3A\u542F\u7528", async () => await setDefaultResume(props.id), () => "\u5DF2\u8BBE\u4E3A\u542F\u7528\u7248\u672C"),
		            children: "\u8BBE\u4E3A\u542F\u7528"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void run("\u590D\u5236", async () => await duplicateResume(props.id), () => "\u5DF2\u590D\u5236\u4E00\u4EFD\uFF0C\u53EF\u5728\u5DE6\u4FA7\u9009\u62E9"),
		            children: "\u590D\u5236"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => {
		              if (!window.confirm("\u5220\u9664\u8FD9\u4E00\u7248\u7B80\u5386\uFF1F\u5B83\u7684\u9644\u4EF6\u8BB0\u5F55\u4F1A\u4E00\u8D77\u5220\u6389\uFF0C\u4E0D\u80FD\u64A4\u9500\u3002")) return;
		              void run("\u5220\u9664", async () => await deleteResume(props.id), () => "\u5DF2\u5220\u9664");
		              props.onDeleted();
		            },
		            children: "\u5220\u9664"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-info",
		            disabled: busy !== null || dirty,
		            title: dirty ? "\u5BFC\u51FA\u6E32\u67D3\u7684\u662F\u5DF2\u4FDD\u5B58\u7684\u5185\u5BB9 \u2014\u2014 \u5148\u70B9\u300C\u4FDD\u5B58\u300D" : "\u6309\u5F53\u524D\u6A21\u677F\u5BFC\u51FA A4 PDF",
		            onClick: () => void run("\u5BFC\u51FA PDF", async () => await exportResume(props.id, { format: "pdf", template }), () => "PDF \u5DF2\u751F\u6210"),
		            children: "\u5BFC\u51FA PDF"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null || dirty,
		            title: dirty ? "\u5BFC\u51FA\u6E32\u67D3\u7684\u662F\u5DF2\u4FDD\u5B58\u7684\u5185\u5BB9 \u2014\u2014 \u5148\u70B9\u300C\u4FDD\u5B58\u300D" : "\u6309\u5F53\u524D\u6A21\u677F\u5BFC\u51FA Word",
		            onClick: () => void run("\u5BFC\u51FA Word", async () => await exportResume(props.id, { format: "docx", template }), () => "Word \u5DF2\u751F\u6210"),
		            children: "\u5BFC\u51FA Word"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-primary",
		            disabled: busy !== null || !dirty,
		            onClick: save,
		            children: busy === "\u4FDD\u5B58" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
		          }
		        )
		      ] })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-ok", children: notice }),
		    issues.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: `jh-alert ${issues.some((issue) => issue.level === "error") ? "jh-alert-error" : "jh-alert-warn"}`, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-alert-title", children: [
		        "\u4F53\u68C0\uFF1A",
		        issues.length,
		        " \u9879\u5F85\u5904\u7406"
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ul", { className: "jh-issues", children: issues.map((issue, index) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("b", { children: issue.level === "error" ? "\u5FC5\u6539" : "\u5EFA\u8BAE" }),
		        " ",
		        issue.message
		      ] }, `${issue.at}-${String(index)}`)) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-work-modes", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "jh-modes", role: "tablist", "aria-label": "\u89C6\u56FE\u6A21\u5F0F", children: [["edit", "\u7F16\u8F91"], ["split", "\u5206\u5C4F"], ["preview", "\u9884\u89C8"], ["files", "\u9644\u4EF6"]].map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "button",
		        {
		          type: "button",
		          role: "tab",
		          "aria-selected": mode === key,
		          className: `jh-mode${mode === key ? " jh-mode-active" : ""}`,
		          onClick: () => setMode(key),
		          children: label
		        },
		        key
		      )) }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-muted", children: [
		        mode === "edit" ? "\u5148\u628A\u5185\u5BB9\u586B\u5B8C\u6574\uFF1B\u5355\u6761\u6210\u679C\u6309\u56DE\u8F66\u53EF\u4EE5\u63A5\u7740\u52A0\u4E00\u6761\u3002" : null,
		        mode === "split" ? "\u62D6\u52A8\u4E2D\u95F4\u90A3\u6761\u7070\u6761\u53EF\u4EE5\u8C03\u6574\u4E0A\u4E0B\u6BD4\u4F8B\u3002" : null,
		        mode === "preview" ? "\u5BFC\u51FA\u6B63\u5728\u770B\u7684\u8FD9\u4E00\u7248\u3002" : null,
		        mode === "files" ? "\u8FD9\u4E00\u7248\u751F\u6210\u8FC7\u7684\u9644\u4EF6\u90FD\u5728\u8FD9\u513F \u2014\u2014 \u53EA\u6709\u4F60\u663E\u5F0F\u5220\u9664\u624D\u4F1A\u6D88\u5931\u3002" : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: `jh-work-body jh-mode-${mode}`, ref: bodyRef, style: { "--jh-split": `${String(split)}%` }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-work-editor", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "jh-form-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "jh-form-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { children: "\u57FA\u672C\u4FE1\u606F" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid2", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u59D3\u540D" }),
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  value: content.basics.name,
		                  placeholder: "\u5F20\u4E09",
		                  onChange: (event) => patchBasics({ name: event.target.value })
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u76EE\u6807\u5C97\u4F4D" }),
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  value: content.basics.title,
		                  placeholder: "Java \u540E\u7AEF\u5DE5\u7A0B\u5E08",
		                  onChange: (event) => patchBasics({ title: event.target.value })
		                }
		              )
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid3", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u57CE\u5E02" }),
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  value: content.basics.city ?? "",
		                  placeholder: "\u6DF1\u5733",
		                  onChange: (event) => patchBasics({ city: event.target.value === "" ? void 0 : event.target.value })
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5DE5\u4F5C\u5E74\u9650" }),
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  type: "number",
		                  min: "0",
		                  value: content.basics.years ?? "",
		                  placeholder: "5",
		                  onChange: (event) => patchBasics({ years: event.target.value === "" ? void 0 : Number(event.target.value) })
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5E74\u9F84\uFF08\u53EF\u7559\u7A7A\uFF09" }),
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  type: "number",
		                  min: "0",
		                  value: content.basics.age ?? "",
		                  placeholder: "\u2014",
		                  onChange: (event) => patchBasics({ age: event.target.value === "" ? void 0 : Number(event.target.value) })
		                }
		              )
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid2", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u624B\u673A" }),
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  value: content.basics.phone ?? "",
		                  placeholder: "138\u2026",
		                  onChange: (event) => patchBasics({ phone: event.target.value === "" ? void 0 : event.target.value })
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u90AE\u7BB1" }),
		              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  value: content.basics.email ?? "",
		                  placeholder: "you@example.com",
		                  onChange: (event) => patchBasics({ email: event.target.value === "" ? void 0 : event.target.value })
		                }
		              )
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "jh-info", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(InlineMd, { text: "\u624B\u673A\u4E0E\u90AE\u7BB1\u5728**\u53D1\u7ED9\u6A21\u578B\u4E4B\u524D\u4F1A\u88AB\u6458\u6389**\uFF0C\u53EA\u5728\u5BFC\u51FA\u4E0E\u9884\u89C8\u91CC\u51FA\u73B0\u3002" }) })
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "jh-form-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "jh-form-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { children: "\u4E2A\u4EBA\u7B80\u4ECB" }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "textarea",
		            {
		              className: "jh-textarea",
		              rows: 5,
		              value: content.summary,
		              "aria-label": "\u4E2A\u4EBA\u7B80\u4ECB",
		              placeholder: "\u4E09\u4E94\u53E5\u8BDD\uFF1A\u505A\u4EC0\u4E48\u65B9\u5411\u3001\u51E0\u5E74\u3001\u6700\u62FF\u5F97\u51FA\u624B\u7684\u4E00\u4EF6\u4E8B\u3002",
		              onChange: (event) => patchContent({ ...content, summary: event.target.value })
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "jh-form-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-form-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { children: "\u6280\u80FD" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-muted", children: "\u56DE\u8F66\u6216\u300C\u3001\u300D\u786E\u8BA4\u4E00\u4E2A" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            ChipsEditor,
		            {
		              values: content.skills.map((skill) => skill.name),
		              label: "\u65B0\u589E\u6280\u80FD\u6807\u7B7E",
		              placeholder: "Java\u3001MySQL\u2026",
		              onChange: (names) => patchContent({
		                ...content,
		                // 只改名字不该把原有的 level / years / evidence 丢掉
		                skills: names.map((name2) => content.skills.find((skill) => skill.name === name2) ?? { name: name2 })
		              })
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "jh-info", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u53EA\u5199\u4F60\u771F\u7684\u80FD\u8BB2\u6E05\u695A\u7684 \u2014\u2014 \u9762\u8BD5\u5B98\u4F1A\u6311\u7740\u95EE\u3002" })
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "jh-form-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-form-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { children: "\u5DE5\u4F5C\u7ECF\u5386" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                onClick: () => patchContent({
		                  ...content,
		                  experiences: [
		                    ...content.experiences,
		                    { company: "", title: "", highlights: [""] }
		                  ]
		                }),
		                children: "\uFF0B \u6DFB\u52A0\u4E00\u6BB5"
		              }
		            )
		          ] }),
		          content.experiences.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u5DE5\u4F5C\u7ECF\u5386 \u2014\u2014 \u70B9\u4E0B\u9762\u7684\u865A\u7EBF\u6846\u52A0\u7B2C\u4E00\u6BB5\u3002" }) : null,
		          content.experiences.map((experience, index) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
		            BlockCard,
		            {
		              label: `\u7B2C ${String(index + 1)} \u6BB5`,
		              index,
		              total: content.experiences.length,
		              onMove: (delta) => patchContent({ ...content, experiences: move(content.experiences, index, delta) }),
		              onRemove: () => patchContent({ ...content, experiences: content.experiences.filter((_, i) => i !== index) }),
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid2", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u516C\u53F8" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: experience.company,
		                        placeholder: "\u67D0\u67D0\u79D1\u6280\u6709\u9650\u516C\u53F8",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          experiences: content.experiences.map((item, i) => i === index ? { ...item, company: event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u804C\u4F4D" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: experience.title,
		                        placeholder: "\u540E\u7AEF\u5F00\u53D1\u5DE5\u7A0B\u5E08",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          experiences: content.experiences.map((item, i) => i === index ? { ...item, title: event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] })
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid3", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5F00\u59CB" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: experience.start ?? "",
		                        placeholder: "2021.03",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          experiences: content.experiences.map((item, i) => i === index ? { ...item, start: event.target.value === "" ? void 0 : event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u7ED3\u675F\uFF08\u7559\u7A7A = \u81F3\u4ECA\uFF09" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: experience.end ?? "",
		                        placeholder: "\u81F3\u4ECA",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          experiences: content.experiences.map((item, i) => i === index ? { ...item, end: event.target.value === "" ? void 0 : event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u57CE\u5E02" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: experience.city ?? "",
		                        placeholder: "\u6DF1\u5733",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          experiences: content.experiences.map((item, i) => i === index ? { ...item, city: event.target.value === "" ? void 0 : event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] })
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u4E3B\u8981\u6210\u679C\uFF08\u4E00\u6761\u4E00\u884C\uFF0C\u56DE\u8F66\u63A5\u7740\u52A0\uFF09" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                    LinesEditor,
		                    {
		                      lines: experience.highlights,
		                      placeholder: "\u628A\u8BA2\u5355\u63A5\u53E3 P99 \u4ECE 800ms \u964D\u5230 120ms\uFF1A\u5148\u5B9A\u4F4D\u6162 SQL\uFF0C\u518D\u6539\u6279\u91CF\u4E0E\u7F13\u5B58",
		                      onChange: (highlights) => patchContent({
		                        ...content,
		                        experiences: content.experiences.map((item, i) => i === index ? { ...item, highlights } : item)
		                      })
		                    }
		                  )
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u6280\u672F\u6808" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                    ChipsEditor,
		                    {
		                      values: experience.stack ?? [],
		                      label: "\u65B0\u589E\u5DE5\u4F5C\u7ECF\u5386\u6280\u672F\u6808",
		                      placeholder: "Java\u3001MySQL\u2026",
		                      onChange: (stack) => patchContent({
		                        ...content,
		                        experiences: content.experiences.map((item, i) => i === index ? { ...item, stack: stack.length === 0 ? void 0 : stack } : item)
		                      })
		                    }
		                  )
		                ] })
		              ]
		            },
		            `exp-${String(index)}`
		          )),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-drop",
		              onClick: () => patchContent({
		                ...content,
		                experiences: [...content.experiences, { company: "", title: "", highlights: [""] }]
		              }),
		              children: "\uFF0B \u6DFB\u52A0\u5DE5\u4F5C\u7ECF\u5386"
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "jh-form-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-form-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { children: "\u9879\u76EE\u7ECF\u5386" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                onClick: () => patchContent({ ...content, projects: [...content.projects, { name: "", highlights: [""] }] }),
		                children: "\uFF0B \u6DFB\u52A0\u4E00\u9879"
		              }
		            )
		          ] }),
		          content.projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u4E5F\u53EF\u4EE5 \u2014\u2014 \u5DE5\u4F5C\u7ECF\u5386\u5199\u6E05\u695A\u5C31\u591F\u3002" }) : null,
		          content.projects.map((project, index) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
		            BlockCard,
		            {
		              label: `\u7B2C ${String(index + 1)} \u9879`,
		              index,
		              total: content.projects.length,
		              onMove: (delta) => patchContent({ ...content, projects: move(content.projects, index, delta) }),
		              onRemove: () => patchContent({ ...content, projects: content.projects.filter((_, i) => i !== index) }),
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid2", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u9879\u76EE\u540D" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: project.name,
		                        placeholder: "\u8BA2\u5355\u4E2D\u53F0",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          projects: content.projects.map((item, i) => i === index ? { ...item, name: event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u4F60\u7684\u89D2\u8272 / \u65F6\u95F4" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: project.role ?? "",
		                        placeholder: "\u540E\u7AEF\u8D1F\u8D23\u4EBA \xB7 2022.06\u20132023.01",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          projects: content.projects.map((item, i) => i === index ? { ...item, role: event.target.value === "" ? void 0 : event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] })
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u505A\u4E86\u4EC0\u4E48" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                    LinesEditor,
		                    {
		                      lines: project.highlights,
		                      placeholder: "\u62C6\u4E86\u8BA2\u5355\u72B6\u6001\u673A\uFF0C\u538B\u6D4B\u4E0B QPS \u4ECE 800 \u63D0\u5230 2400",
		                      onChange: (highlights) => patchContent({
		                        ...content,
		                        projects: content.projects.map((item, i) => i === index ? { ...item, highlights } : item)
		                      })
		                    }
		                  )
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u6280\u672F\u6808" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                    ChipsEditor,
		                    {
		                      values: project.stack ?? [],
		                      label: "\u65B0\u589E\u9879\u76EE\u6280\u672F\u6808",
		                      placeholder: "Kafka\u3001Redis\u2026",
		                      onChange: (stack) => patchContent({
		                        ...content,
		                        projects: content.projects.map((item, i) => i === index ? { ...item, stack: stack.length === 0 ? void 0 : stack } : item)
		                      })
		                    }
		                  )
		                ] })
		              ]
		            },
		            `prj-${String(index)}`
		          )),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-drop",
		              onClick: () => patchContent({ ...content, projects: [...content.projects, { name: "", highlights: [""] }] }),
		              children: "\uFF0B \u6DFB\u52A0\u9879\u76EE\u7ECF\u5386"
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "jh-form-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-form-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { children: "\u6559\u80B2\u7ECF\u5386" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                onClick: () => patchContent({ ...content, education: [...content.education, { school: "" }] }),
		                children: "\uFF0B \u6DFB\u52A0\u4E00\u9879"
		              }
		            )
		          ] }),
		          content.education.map((education, index) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
		            BlockCard,
		            {
		              label: `\u7B2C ${String(index + 1)} \u9879`,
		              index,
		              total: content.education.length,
		              onMove: (delta) => patchContent({ ...content, education: move(content.education, index, delta) }),
		              onRemove: () => patchContent({ ...content, education: content.education.filter((_, i) => i !== index) }),
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid3", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5B66\u6821" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: education.school,
		                        onChange: (event) => patchContent({
		                          ...content,
		                          education: content.education.map((item, i) => i === index ? { ...item, school: event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u4E13\u4E1A" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: education.major ?? "",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          education: content.education.map((item, i) => i === index ? { ...item, major: event.target.value === "" ? void 0 : event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5B66\u5386" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: education.degree ?? "",
		                        placeholder: "\u672C\u79D1",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          education: content.education.map((item, i) => i === index ? { ...item, degree: event.target.value === "" ? void 0 : event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] })
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid2", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5165\u5B66" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: education.start ?? "",
		                        placeholder: "2015.09",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          education: content.education.map((item, i) => i === index ? { ...item, start: event.target.value === "" ? void 0 : event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u6BD5\u4E1A" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                      "input",
		                      {
		                        className: "jh-input",
		                        value: education.end ?? "",
		                        placeholder: "2019.06",
		                        onChange: (event) => patchContent({
		                          ...content,
		                          education: content.education.map((item, i) => i === index ? { ...item, end: event.target.value === "" ? void 0 : event.target.value } : item)
		                        })
		                      }
		                    )
		                  ] })
		                ] })
		              ]
		            },
		            `edu-${String(index)}`
		          )),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-drop",
		              onClick: () => patchContent({ ...content, education: [...content.education, { school: "" }] }),
		              children: "\uFF0B \u6DFB\u52A0\u6559\u80B2\u7ECF\u5386"
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "jh-form-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-form-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { children: "\u5176\u4ED6\uFF08\u8BC1\u4E66 / \u7ADE\u8D5B / \u5F00\u6E90\u2026\uFF09" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                onClick: () => patchContent({ ...content, extras: [...content.extras, { label: "", text: "" }] }),
		                children: "\uFF0B \u6DFB\u52A0\u4E00\u6761"
		              }
		            )
		          ] }),
		          content.extras.map((extra, index) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            BlockCard,
		            {
		              label: `\u7B2C ${String(index + 1)} \u6761`,
		              index,
		              total: content.extras.length,
		              onMove: (delta) => patchContent({ ...content, extras: move(content.extras, index, delta) }),
		              onRemove: () => patchContent({ ...content, extras: content.extras.filter((_, i) => i !== index) }),
		              children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-grid2", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u6807\u9898" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                    "input",
		                    {
		                      className: "jh-input",
		                      value: extra.label,
		                      placeholder: "\u8F6F\u8003\u4E2D\u7EA7",
		                      onChange: (event) => patchContent({
		                        ...content,
		                        extras: content.extras.map((item, i) => i === index ? { ...item, label: event.target.value } : item)
		                      })
		                    }
		                  )
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "jh-field", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u8BF4\u660E" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		                    "input",
		                    {
		                      className: "jh-input",
		                      value: extra.text,
		                      placeholder: "2023 \xB7 \u7CFB\u7EDF\u96C6\u6210\u9879\u76EE\u7BA1\u7406\u5DE5\u7A0B\u5E08",
		                      onChange: (event) => patchContent({
		                        ...content,
		                        extras: content.extras.map((item, i) => i === index ? { ...item, text: event.target.value } : item)
		                      })
		                    }
		                  )
		                ] })
		              ] })
		            },
		            `ext-${String(index)}`
		          )),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-drop",
		              onClick: () => patchContent({ ...content, extras: [...content.extras, { label: "", text: "" }] }),
		              children: "\uFF0B \u6DFB\u52A0\u4E00\u6761"
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "jh-info", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { children: [
		            "\u9644\u4EF6\u53EA\u7531\u4F60\u663E\u5F0F\u5220\u9664 \u2014\u2014 \u7B80\u5386\u662F\u8D44\u4EA7\uFF0C\u4EFB\u4F55\u81EA\u52A8\u6E05\u7406\u90FD\u4E0D\u4F1A\u78B0\u5B83\uFF08",
		            PLUGIN_ID,
		            "\uFF09\u3002"
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "div",
		        {
		          className: "jh-splitter",
		          role: "separator",
		          "aria-label": "\u62D6\u52A8\u8C03\u6574\u7F16\u8F91\u4E0E\u9884\u89C8\u7684\u6BD4\u4F8B",
		          "aria-orientation": "horizontal",
		          tabIndex: 0,
		          title: "\u62D6\u52A8\u8C03\u6574\u6BD4\u4F8B",
		          onPointerDown: (event) => {
		            event.preventDefault();
		            startDrag(event.clientX, event.clientY);
		          },
		          onKeyDown: (event) => {
		            if (event.key === "ArrowUp") setSplit((value) => Math.max(20, value - 4));
		            if (event.key === "ArrowDown") setSplit((value) => Math.min(80, value + 4));
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-work-preview", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-preview-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "select",
		            {
		              className: "jh-select",
		              "aria-label": "\u6A21\u677F",
		              value: template,
		              onChange: (event) => setTemplate(event.target.value === "professional" ? "professional" : "concise"),
		              children: RESUME_TEMPLATES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: item, children: RESUME_TEMPLATE_LABEL[item] }, item))
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(InlineMd, { text: "\u9884\u89C8\u4E0E\u5BFC\u51FA\u8D70**\u540C\u4E00\u4E2A\u6E32\u67D3\u5668**\uFF0C\u6A21\u677F\u5373\u6240\u89C1" }) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "jh-paper-stage", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("iframe", { className: "jh-paper", title: "\u7B80\u5386\u9884\u89C8", src: previewUrl(props.id, template), sandbox: "" }) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-work-files", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-form-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("h3", { children: [
		            "\u9644\u4EF6\uFF08",
		            draft.files.length,
		            "\uFF09"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-muted", children: "\u5BFC\u51FA\u5728\u53F3\u4E0A\u89D2\u5DE5\u5177\u680F\uFF1B\u8FD9\u91CC\u8D1F\u8D23\u6253\u5F00\u4E0E\u5220\u9664" })
		        ] }),
		        draft.files.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u751F\u6210\u9644\u4EF6\u3002\u7528\u53F3\u4E0A\u89D2\u7684\u300C\u5BFC\u51FA PDF / \u5BFC\u51FA Word\u300D\u751F\u6210\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ul", { className: "jh-files", children: draft.files.map((file) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { className: "jh-file-row", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: `jh-file-badge jh-file-${file.format}`, children: file.format.toUpperCase() }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-file-main", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("a", { className: "jh-link jh-file-name", href: fileUrl(file.id), target: "_blank", rel: "noreferrer", children: file.fileName }),
		            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-muted jh-file-meta", children: [
		              (file.bytes / 1024).toFixed(0),
		              " KB \xB7 ",
		              file.createdAt.slice(0, 16).replace("T", " ")
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              onClick: () => window.open(fileUrl(file.id), "_blank", "noopener"),
		              children: "\u6253\u5F00"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-quiet",
		              disabled: busy !== null,
		              onClick: () => {
		                if (!window.confirm(`\u5220\u9664\u9644\u4EF6\u300C${file.fileName}\u300D\uFF1F\u4E0D\u80FD\u64A4\u9500\u3002`)) return;
		                void run("\u5220\u9664\u9644\u4EF6", async () => await deleteFile(file.id), () => "\u9644\u4EF6\u5DF2\u5220\u9664").then(
		                  () => detail.reload()
		                );
		              },
		              children: "\u5220\u9664"
		            }
		          )
		        ] }, file.id)) }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "jh-info", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5220\u9664\u8FD9\u4E00\u7248\u7B80\u5386\u65F6\uFF0C\u5B83\u7684\u9644\u4EF6\u4F1A\u4E00\u8D77\u5220\u6389\uFF1B\u9664\u6B64\u4E4B\u5916\u6CA1\u6709\u4EFB\u4F55\u81EA\u52A8\u6E05\u7406\u4F1A\u78B0\u5B83\u4EEC\u3002" })
		        ] })
		      ] })
		    ] })
		  ] });
		}
		function BlockCard(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-entry", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-entry-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-entry-no", children: props.label }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-icon-btn",
		          "aria-label": "\u4E0A\u79FB",
		          disabled: props.index === 0,
		          onClick: () => props.onMove(-1),
		          children: "\u2191"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-icon-btn",
		          "aria-label": "\u4E0B\u79FB",
		          disabled: props.index === props.total - 1,
		          onClick: () => props.onMove(1),
		          children: "\u2193"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-icon-btn",
		          "aria-label": "\u5220\u9664\u8FD9\u4E00\u9879",
		          onClick: props.onRemove,
		          children: "\xD7"
		        }
		      )
		    ] }),
		    props.children
		  ] });
		}
		function LinesEditor(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-lines", children: [
		    props.lines.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-line", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "input",
		        {
		          className: "jh-input",
		          value: line,
		          placeholder: props.placeholder,
		          onChange: (event) => {
		            const next = [...props.lines];
		            next[index] = event.target.value;
		            props.onChange(next);
		          },
		          onKeyDown: (event) => {
		            if (event.key !== "Enter") return;
		            event.preventDefault();
		            props.onChange([...props.lines.slice(0, index + 1), "", ...props.lines.slice(index + 1)]);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-icon-btn",
		          "aria-label": "\u5220\u9664\u8FD9\u4E00\u6761",
		          onClick: () => props.onChange(props.lines.filter((_, i) => i !== index)),
		          children: "\xD7"
		        }
		      )
		    ] }, index)),
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-btn jh-btn-inline jh-btn-quiet",
		        onClick: () => props.onChange([...props.lines, ""]),
		        children: "\uFF0B \u6DFB\u52A0\u4E00\u6761"
		      }
		    )
		  ] });
		}
		function ChipsEditor(props) {
		  const [text, setText] = (0, import_react12.useState)("");
		  const commit = () => {
		    const parts = text.split(/[、,，\s]+/).map((part) => part.trim()).filter((part) => part !== "");
		    if (parts.length > 0) props.onChange([.../* @__PURE__ */ new Set([...props.values, ...parts])]);
		    setText("");
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-chips", children: [
		    props.values.map((value) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "jh-chip-item", children: [
		      value,
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-chip-x",
		          "aria-label": `\u5220\u9664 ${value}`,
		          onClick: () => props.onChange(props.values.filter((item) => item !== value)),
		          children: "\xD7"
		        }
		      )
		    ] }, value)),
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
		      "input",
		      {
		        className: "jh-input jh-chip-input",
		        "aria-label": props.label,
		        value: text,
		        placeholder: props.placeholder,
		        onChange: (event) => setText(event.target.value),
		        onBlur: commit,
		        onKeyDown: (event) => {
		          if (event.key === "Enter" || event.key === "\u3001" || event.key === ",") {
		            event.preventDefault();
		            commit();
		          }
		          if (event.key === "Backspace" && text === "" && props.values.length > 0) {
		            props.onChange(props.values.slice(0, -1));
		          }
		        }
		      }
		    )
		  ] });
		}

		// src/client/screens/settings.tsx
		var import_react13 = require("react");
		var import_jsx_runtime16 = require("react/jsx-runtime");
		function SettingsScreen(props) {
		  const settings = useAsync((signal) => fetchSettings(signal), [props.revision]);
		  const health = useAsync((signal) => fetchHealth(signal), [props.revision]);
		  const audit = useAsync((signal) => fetchAudit(50, {}, signal), [props.revision]);
		  const llm = useAsync((signal) => fetchLlmCalls(50, signal), [props.revision]);
		  const [message, setMessage] = (0, import_react13.useState)(null);
		  const [busy, setBusy] = (0, import_react13.useState)(false);
		  const current = settings.state.status === "ok" ? settings.state.data : null;
		  const savedIdle = current?.browser.idleCloseMinutes ?? null;
		  const [idleDraft, setIdleDraft] = (0, import_react13.useState)(savedIdle === null ? "" : String(savedIdle));
		  const idleFocused = (0, import_react13.useRef)(false);
		  (0, import_react13.useEffect)(() => {
		    if (!idleFocused.current && savedIdle !== null) setIdleDraft(String(savedIdle));
		  }, [savedIdle]);
		  const saveIdle = async () => {
		    if (savedIdle === null) return;
		    const parsed = Number.parseInt(idleDraft.trim(), 10);
		    if (!Number.isFinite(parsed)) {
		      setIdleDraft(String(savedIdle));
		      return;
		    }
		    const clamped = Math.min(BROWSER_IDLE_MAX_MIN, Math.max(BROWSER_IDLE_MIN_MIN, parsed));
		    setIdleDraft(String(clamped));
		    if (clamped === savedIdle) return;
		    setBusy(true);
		    try {
		      await updateSettings({ browser: { idleCloseMinutes: clamped } });
		      setMessage({
		        tone: "ok",
		        text: clamped <= 0 ? "\u5DF2\u6539\u4E3A\uFF1A\u6D4F\u89C8\u5668\u7A7A\u95F2\u540E\u4E0D\u81EA\u52A8\u5173\u95ED\u3002" : `\u5DF2\u6539\u4E3A\uFF1A\u6D4F\u89C8\u5668\u7A7A\u95F2 ${String(clamped)} \u5206\u949F\u540E\u81EA\u52A8\u5173\u95ED\u3002`
		      });
		      settings.reload();
		    } catch (error) {
		      setMessage({ tone: "error", text: error instanceof ApiError ? error.display : String(error) });
		    } finally {
		      setBusy(false);
		    }
		  };
		  const toggle = async (purpose, enabled) => {
		    setBusy(true);
		    try {
		      await updateSettings({ ai: { purposes: { [purpose]: enabled } } });
		      setMessage({ tone: "ok", text: `\u5DF2${enabled ? "\u5F00\u542F" : "\u5173\u95ED"}\u8BE5\u7528\u9014\u3002` });
		      settings.reload();
		    } catch (error) {
		      setMessage({
		        tone: "error",
		        text: error instanceof ApiError ? error.display : String(error)
		      });
		    } finally {
		      setBusy(false);
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "jh-card-title", children: "\u8BBE\u7F6E\u4E0E\u8BCA\u65AD" }),
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "jh-muted", children: "\u6293\u53D6\u989D\u5EA6\u3001\u9690\u79C1\u4E0E\u5BA1\u8BA1\u5F00\u5173\u7531\u95F8\u95E8\u786C\u7F16\u7801\u7BA1\u7406 \u2014\u2014 \u6A21\u578B\u6539\u4E0D\u4E86\uFF08\xA722.4\uFF09" })
		    ] }),
		    message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "jh-card jh-card-tight", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: message.tone === "error" ? "jh-error" : "jh-muted", children: message.text }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "jh-card-title", children: "\u6A21\u578B\u7528\u9014" }),
		      settings.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-error", children: settings.state.message }),
		      current === null ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("ul", { className: "jh-kv", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u6A21\u578B\u603B\u5F00\u5173" }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: current.ai.enabled ? "jh-ok" : "jh-warn", children: current.ai.enabled ? "\u5DF2\u5F00\u542F" : "\u5DF2\u5173\u95ED\uFF08\u5168\u90E8\u7528\u9014\u964D\u7EA7\u4E3A\u89C4\u5219/\u6A21\u677F\uFF09" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("ul", { className: "jh-list", children: current.derived.purposes.map((purpose) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("label", { className: "jh-check", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
		            "input",
		            {
		              type: "checkbox",
		              disabled: busy,
		              checked: purpose.enabled,
		              onChange: (event) => void toggle(purpose.purpose, event.target.checked)
		            }
		          ),
		          purpose.label,
		          "\uFF08",
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("code", { children: purpose.purpose }),
		          "\uFF09"
		        ] }) }, purpose.purpose)) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "jh-card-title", children: "\u5B89\u5168\u95F8\u95E8" }),
		      current === null ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("ul", { className: "jh-kv", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "L3 \u6253\u62DB\u547C" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: current.guard.levels.l3Greeting ? "\u5F00" : "\u5173" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "L4 \u6295\u9012" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: current.guard.levels.l4Application ? "\u5F00" : "\u5173" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "L4 \u56DE\u590D" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: current.guard.levels.l4Reply ? "\u5F00" : "\u5173" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u6BCF\u65E5\u989D\u5EA6" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { children: [
		              "\u6253\u62DB\u547C ",
		              current.guard.dailyLimits.greeting,
		              " \xB7 \u6295\u9012 ",
		              current.guard.dailyLimits.application,
		              " \xB7 \u56DE\u590D",
		              " ",
		              current.guard.dailyLimits.reply
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u51B7\u5374\u671F" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { children: [
		              current.guard.cooldownMinutes,
		              " \u5206\u949F"
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u5BA1\u6279" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: current.guard.requireApproval ? "\u5FC5\u987B\u5BA1\u6279" : "\u4E0D\u5BA1\u6279" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u6279\u91CF\u4E0A\u9650" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: current.guard.batchLimit })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u5BA1\u8BA1" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: current.guard.auditEnabled ? "\u5DF2\u5F00\u542F" : "\u5DF2\u5173\u95ED" })
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { className: "jh-note", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(InlineMd, { text: "\u6A21\u578B**\u4E0D\u80FD**\u4FEE\u6539\u8FD9\u4E9B\u952E\uFF1A" }),
		          current.derived.modelForbidden.join(" / "),
		          "\uFF1B\u6A21\u578B\u80FD\u6539\u7684\u53EA\u6709\uFF1A",
		          current.derived.modelEditable.join(" / "),
		          "\u3002\u8FD9\u662F\u786C\u7F16\u7801\u7684\u6821\u9A8C\uFF0C\u4E0D\u662F\u7EA6\u5B9A\u3002"
		        ] })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "jh-card-title", children: "\u6D4F\u89C8\u5668" }),
		      current === null ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { className: "jh-field-label", children: [
		            "\u91C7\u96C6\u6D4F\u89C8\u5668\u7A7A\u95F2\u591A\u4E45\u540E\u81EA\u52A8\u5173\u95ED",
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(FieldHint, { text: "\u91C7\u96C6\u8981\u590D\u7528\u4F60\u81EA\u5DF1\u767B\u5F55\u8FC7\u7684\u6D4F\u89C8\u5668\uFF0C\u6240\u4EE5\u5B83\u662F headful \u7684\uFF08\u4F60\u80FD\u770B\u89C1\u90A3\u4E2A\u7A97\u53E3\uFF09\u3002\u7528\u5B8C\u4E00\u76F4\u5F00\u7740\u4F1A\u5360\u5185\u5B58\uFF0C\u6240\u4EE5\u7A7A\u95F2\u5230\u70B9\u5C31\u81EA\u52A8\u5173\u6389\uFF1B\u4E0B\u4E00\u6B21\u91C7\u96C6\u4F1A\u91CD\u65B0\u6253\u5F00\uFF0C\u767B\u5F55\u6001\u5728\u78C1\u76D8\u4E0A\u3001\u4E0D\u4F1A\u4E22\u3002\u586B 0 \u8868\u793A\u4E0D\u81EA\u52A8\u5173\u95ED\u3002" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "jh-field-row", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
		              "input",
		              {
		                className: "jh-input jh-input-narrow",
		                type: "number",
		                min: BROWSER_IDLE_MIN_MIN,
		                max: BROWSER_IDLE_MAX_MIN,
		                step: 1,
		                "aria-label": "\u91C7\u96C6\u6D4F\u89C8\u5668\u7A7A\u95F2\u591A\u5C11\u5206\u949F\u540E\u81EA\u52A8\u5173\u95ED",
		                disabled: busy,
		                value: idleDraft,
		                onFocus: () => {
		                  idleFocused.current = true;
		                },
		                onChange: (event) => setIdleDraft(event.target.value),
		                onBlur: () => {
		                  idleFocused.current = false;
		                  void saveIdle();
		                },
		                onKeyDown: (event) => {
		                  if (event.key === "Enter") {
		                    event.preventDefault();
		                    void saveIdle();
		                  }
		                }
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "jh-muted", children: "\u5206\u949F" })
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { className: "jh-note", children: [
		          current.browser.idleCloseMinutes <= 0 ? "\u5F53\u524D\uFF1A\u4E0D\u81EA\u52A8\u5173\u95ED \u2014\u2014 \u6D4F\u89C8\u5668\u4F1A\u4E00\u76F4\u5F00\u7740\uFF0C\u76F4\u5230\u4F60\u5173\u6389\u5B83\u6216\u5378\u8F7D\u63D2\u4EF6\u3002" : `\u5F53\u524D\uFF1A\u7A7A\u95F2 ${String(current.browser.idleCloseMinutes)} \u5206\u949F\u540E\u5173\u95ED\uFF08\u9ED8\u8BA4 ${String(BROWSER_IDLE_DEFAULT_MIN)} \u5206\u949F\uFF09\u3002`,
		          " ",
		          "\u6B63\u5728\u767B\u5F55\u6216\u6B63\u5728\u91C7\u96C6\u65F6\u4E0D\u4F1A\u88AB\u5173\u6389\u3002"
		        ] })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "jh-card-title", children: "\u8BCA\u65AD" }),
		      health.state.status === "ok" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("ul", { className: "jh-kv", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u7248\u672C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { children: [
		            health.state.data.version,
		            " \xB7 ",
		            health.state.data.phase
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u8FD0\u884C\u65F6\u957F" }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { children: [
		            Math.round(health.state.data.hostUptimeMs / 1e3),
		            " \u79D2"
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u6570\u636E\u6587\u4EF6" }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("code", { children: health.state.data.dataPath ?? "\u2014" }) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u5C97\u4F4D / \u516C\u53F8" }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { children: [
		            health.state.data.jobCount,
		            " / ",
		            health.state.data.companyCount
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u5F85\u4FEE\u590D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: health.state.data.pendingRepairCount })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u6A21\u578B\u5DE5\u5177" }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: health.state.data.tools === null ? "\u672A\u6CE8\u518C" : `${String(health.state.data.tools.registered.length)} \u4E2A\u5DF2\u6CE8\u518C` + (health.state.data.tools.failed.length === 0 ? "" : ` \xB7 ${String(health.state.data.tools.failed.length)} \u4E2A\u6CE8\u518C\u5931\u8D25`) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u79BB\u7EBF\u6A21\u5F0F" }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: health.state.data.offline ? "\u5DF2\u5F00\u542F" : "\u5173\u95ED" })
		        ] })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u8BCA\u65AD\u4FE1\u606F\u2026" }),
		      health.state.status === "ok" && health.state.data.tools !== null && health.state.data.tools.failed.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { className: "jh-error", children: [
		        "\u5DE5\u5177\u6CE8\u518C\u5931\u8D25\uFF1A",
		        health.state.data.tools.failed.map((item) => `${item.name}\uFF08${item.reason}\uFF09`).join(" \xB7 ")
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "jh-card-title", children: "\u6A21\u578B\u8C03\u7528\u7559\u75D5\uFF08\u6211\u53D1\u4E86\u4EC0\u4E48\u7ED9\u6A21\u578B\uFF09" }),
		      llm.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-error", children: llm.state.message }),
		      llm.state.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("table", { className: "jh-table", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("tr", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u65F6\u95F4" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u7528\u9014" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u6A21\u578B" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u5916\u53D1\u5B57\u6BB5" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "Token" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u7ED3\u679C" })
		          ] }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("tbody", { children: llm.state.data.items.map((call) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("tr", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { children: call.at.slice(5, 16).replace("T", " ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { children: call.purpose }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { children: call.model ?? "\u2014" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { className: "jh-muted", children: call.fields.join("\u3001") || "\u2014" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { children: call.promptTokens + call.completionTokens }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { className: call.ok ? "jh-ok" : "jh-error", children: call.ok ? "\u6210\u529F" : call.errorCode ?? "\u5931\u8D25" })
		          ] }, call.id)) })
		        ] }),
		        llm.state.data.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u8C03\u7528\u8BB0\u5F55\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-note", children: llm.state.data.note })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "jh-card-title", children: "\u64CD\u4F5C\u5BA1\u8BA1" }),
		      audit.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-error", children: audit.state.message }),
		      audit.state.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("table", { className: "jh-table", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("tr", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u65F6\u95F4" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u8C01" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u52A8\u4F5C" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u7ED3\u679C" }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("th", { scope: "col", children: "\u8BF4\u660E" })
		          ] }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("tbody", { children: audit.state.data.items.map((record) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("tr", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { children: record.at.slice(5, 16).replace("T", " ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { children: record.actor }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("code", { children: record.action }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { className: record.result === "ok" ? "jh-ok" : "jh-warn", children: record.result }),
		            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("td", { className: "jh-muted", children: record.reason ?? "\u2014" })
		          ] }, record.id)) })
		        ] }),
		        audit.state.data.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u5BA1\u8BA1\u8BB0\u5F55\u3002" })
		      ] })
		    ] })
		  ] });
		}

		// src/client/screens/today.tsx
		var import_react14 = require("react");
		var import_jsx_runtime17 = require("react/jsx-runtime");
		var IDLE2 = { running: false, tone: "ok", message: null };
		function planIdOf(todo) {
		  if (todo.detail === null || typeof todo.detail !== "object") return null;
		  const value = todo.detail.planId;
		  return typeof value === "number" ? value : null;
		}
		function TodayScreen(props) {
		  const today = useAsync((signal) => fetchToday(signal), [props.revision]);
		  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision]);
		  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision]);
		  const [feedback, setFeedback] = (0, import_react14.useState)(IDLE2);
		  const now = (0, import_react14.useMemo)(() => /* @__PURE__ */ new Date(), [props.revision]);
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
		  const startCrawl = () => act("\u6B63\u5728\u91C7\u96C6\u2026\uFF08\u4F1A\u6253\u5F00\u4E00\u4E2A\u6D4F\u89C8\u5668\u7A97\u53E3\uFF09", async () => {
		    const summary = await runDefaultPlan();
		    const run = summary.run;
		    return `\u65B9\u6848\u300C${summary.planName}\u300D\u672C\u8F6E ${CRAWL_STATE_LABEL[run.state]}\uFF1A\u547D\u4E2D ${String(run.found)} \xB7 \u65B0\u589E ${String(run.inserted)} \xB7 \u66F4\u65B0 ${String(run.updated)} \xB7 \u9694\u79BB ${String(run.quarantined)}` + (run.errorCode === null ? "" : ` \xB7 ${run.errorCode}`);
		  });
		  const catchUp = (planId) => act("\u6B63\u5728\u8865\u8DD1\u9519\u8FC7\u7684\u8F6E\u6B21\u2026", async () => {
		    const summary = await runPlan(planId, true);
		    return `\u8865\u8DD1\u5B8C\u6210\uFF1A${CRAWL_STATE_LABEL[summary.run.state]} \xB7 \u65B0\u589E ${String(summary.run.inserted)}`;
		  });
		  const login = (platformId) => act("\u5DF2\u6253\u5F00\u767B\u5F55\u9875\uFF0C\u8BF7\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\u91CC\u5B8C\u6210\u767B\u5F55\uFF08\u6BCF 3 \u79D2\u68C0\u6D4B\u4E00\u6B21\uFF09", async () => {
		    const status = await startLogin(platformId);
		    return status.message ?? "\u767B\u5F55\u5F15\u5BFC\u5DF2\u542F\u52A8";
		  });
		  const data = today.state.status === "ok" ? today.state.data : null;
		  const sched = scheduler.state.status === "ok" ? scheduler.state.data : null;
		  const platformItems = platforms.state.status === "ok" ? platforms.state.data.items : [];
		  const unhealthy = platformItems.filter((item) => item.health !== "healthy" || !item.account.loggedIn);
		  const worst = sched === null || sched.planStatus.length === 0 ? null : sched.planStatus.reduce(
		    (acc, item) => (item.freshness.hoursSinceSuccess ?? Number.POSITIVE_INFINITY) > (acc.freshness.hoursSinceSuccess ?? Number.POSITIVE_INFINITY) ? item : acc
		  );
		  const nextTrigger = sched?.triggers[0] ?? null;
		  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-screen", children: [
		    today.state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u4ECA\u65E5\u6982\u51B5\u2026" }),
		    today.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h2", { className: "jh-card-title", children: "\u8BFB\u4E0D\u5230\u4ECA\u65E5\u6982\u51B5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "jh-error", children: today.state.message }),
		      today.state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "jh-muted", children: today.state.hint }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("button", { type: "button", className: "jh-btn", onClick: today.reload, children: "\u91CD\u8BD5" })
		    ] }),
		    data !== null && !data.dataReady && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h2", { className: "jh-card-title", children: "\u6570\u636E\u5C42\u672A\u5C31\u7EEA" }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "jh-error", children: data.dataError ?? "\u672A\u77E5\u539F\u56E0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "jh-muted", children: "\u63D2\u4EF6\u672C\u8EAB\u662F\u6302\u7740\u7684 \u2014\u2014 \u8FD9\u91CC\u5982\u5B9E\u62A5\u544A\u539F\u56E0\uFF0C\u800C\u4E0D\u662F\u8BA9\u754C\u9762\u9759\u9ED8\u53D8\u7A7A\u3002" })
		    ] }),
		    data !== null && data.offline && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h2", { className: "jh-card-title", children: "\u79BB\u7EBF\u6A21\u5F0F\u5DF2\u5F00\u542F" }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("p", { className: "jh-muted", children: [
		        "\u6293\u53D6\u4E0E\u767B\u5F55\u5F15\u5BFC\u5DF2\u88AB\u62D2\u7EDD \u2014\u2014 \u8FD9\u662F\u300C\u81EA\u52A8\u5316\u6D4B\u8BD5\u7EDD\u4E0D\u8BBF\u95EE\u771F\u5B9E\u62DB\u8058\u7AD9\u300D\u7684\u5F00\u5173\u5728\u8D77\u4F5C\u7528\u3002 \u53BB\u6389\u73AF\u5883\u53D8\u91CF ",
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("code", { children: "DSH_JOB_HUNTER_NO_NETWORK" }),
		        " \u91CD\u542F\u5373\u53EF\u89E3\u9664\u3002"
		      ] })
		    ] }),
		    data !== null && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-today-head", children: [
		          worst === null ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u91C7\u96C6\u65B9\u6848\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(FreshnessBadge, { level: worst.freshness.level, hours: worst.freshness.hoursSinceSuccess }),
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-primary",
		              disabled: feedback.running || (sched?.readOnly ?? false),
		              onClick: () => void startCrawl(),
		              children: feedback.running ? "\u6267\u884C\u4E2D\u2026" : "\u7ACB\u5373\u91C7\u96C6"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: props.onGoCollect, children: "\u53BB\u914D\u7F6E" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("p", { className: "jh-muted", children: [
		          nextTrigger === null ? "\u6CA1\u6709\u542F\u7528\u5B9A\u65F6\u7684\u65B9\u6848 \u2014\u2014 \u53EA\u4F1A\u5728\u4F60\u70B9\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u65F6\u8DD1\u3002" : `\u4E0B\u6B21\u81EA\u52A8\u91C7\u96C6\uFF1A${formatClock(new Date(nextTrigger.nextRunAt))}\uFF08${formatRelative(new Date(nextTrigger.nextRunAt), now)}\uFF09${formatJitter(nextTrigger.jitterMs) === null ? "" : ` \xB7 ${String(formatJitter(nextTrigger.jitterMs))}`} \xB7 \u65B9\u6848\u300C${nextTrigger.planName}\u300D`,
		          sched?.paused === true ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(InlineMd, { text: " \xB7 **\u5B9A\u65F6\u5DF2\u6682\u505C**\uFF08\u624B\u52A8\u4ECD\u7136\u53EF\u7528\uFF09" }) : null
		        ] }),
		        sched?.refreshSuggested === true && sched.refreshHint !== null && /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "jh-warn", children: sched.refreshHint }),
		        sched?.readOnly === true && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("p", { className: "jh-error", children: [
		          "\u672C\u5B9E\u4F8B\u53EA\u8BFB\uFF1A",
		          sched.readOnlyReason ?? "\u53E6\u4E00\u4E2A\u5B9E\u4F8B\u6B63\u5728\u8FD0\u884C"
		        ] }),
		        feedback.message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: feedback.tone === "error" ? "jh-error" : "jh-muted", children: feedback.message })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("p", { className: "jh-muted jh-health-line", children: [
		        "\u5E73\u53F0\u5065\u5EB7\uFF1A",
		        platformItems.length === 0 ? "\u8FD8\u6CA1\u6709\u6CE8\u518C\u5E73\u53F0" : unhealthy.length === 0 ? "\u5168\u90E8\u6B63\u5E38" : unhealthy.map(
		          (item) => `${item.id} ${item.health !== "healthy" ? item.health : "\u672A\u767B\u5F55"}`
		        ).join(" \xB7 "),
		        " \xB7 ",
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("button", { type: "button", className: "jh-link", onClick: props.onGoCollect, children: "\u770B\u7EC6\u8282" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-stats", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("button", { type: "button", className: "jh-stat", onClick: props.onGoJobs, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("b", { children: data.newJobs24h }),
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: "24 \u5C0F\u65F6\u65B0\u589E" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("button", { type: "button", className: "jh-stat", onClick: props.onGoJobs, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("b", { children: data.jobCount }),
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: "\u5C97\u4F4D\u603B\u6570" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: `jh-stat${data.pendingRepair > 0 ? " jh-stat-warn" : ""}`, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("b", { children: data.pendingRepair }),
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: "\u5F85\u4FEE\u590D\u8BB0\u5F55" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: `jh-stat${data.todos.some((todo) => todo.level === "urgent") ? " jh-stat-error" : ""}`, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("b", { children: data.todos.length }),
		          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: "\u5F85\u529E" })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h2", { className: "jh-card-title", children: "\u5F85\u529E" }),
		        data.todos.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u5F85\u529E\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("ul", { className: "jh-todos", children: data.todos.map((todo) => {
		          const planId = planIdOf(todo);
		          return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("li", { className: `jh-todo jh-todo-${todo.level}`, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "jh-todo-level", children: todo.level }),
		            /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-todo-body", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "jh-todo-title", children: todo.title }),
		              /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-muted", children: [
		                todo.kind,
		                todo.ref === null ? "" : ` \xB7 ${todo.ref}`
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "jh-todo-actions", children: [
		                todo.kind === "catch-up" && planId !== null && /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline",
		                    disabled: feedback.running,
		                    onClick: () => void catchUp(planId),
		                    children: "\u7ACB\u5373\u8865\u8DD1"
		                  }
		                ),
		                todo.kind === "login-required" && todo.ref !== null && /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline",
		                    disabled: feedback.running,
		                    onClick: () => void login(todo.ref),
		                    children: "\u53BB\u767B\u5F55"
		                  }
		                ),
		                todo.kind === "blocked" && /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: props.onGoCollect, children: "\u53BB\u786E\u8BA4\u6062\u590D" }),
		                /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
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
		      ] })
		    ] })
		  ] });
		}

		// src/client/use-event-stream.ts
		var import_react15 = require("react");
		function useEventStream(onHint) {
		  const [status, setStatus] = (0, import_react15.useState)("connecting");
		  const [lastEventAt, setLastEventAt] = (0, import_react15.useState)(null);
		  const hintRef = (0, import_react15.useRef)(onHint);
		  hintRef.current = onHint;
		  (0, import_react15.useEffect)(() => {
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
		var import_jsx_runtime18 = require("react/jsx-runtime");
		var TABS = [
		  { key: "today", label: "\u4ECA\u65E5" },
		  { key: "jobs", label: "\u5C97\u4F4D\u5E93" },
		  { key: "collect", label: "\u91C7\u96C6" },
		  { key: "pipeline", label: "\u6D41\u6C34\u7EBF" },
		  { key: "inbox", label: "\u6D88\u606F" },
		  { key: "interviews", label: "\u9762\u8BD5" },
		  { key: "campus", label: "\u6821\u62DB" },
		  { key: "board", label: "\u770B\u677F" },
		  { key: "resumes", label: "\u7B80\u5386\u4E2D\u5FC3" },
		  { key: "settings", label: "\u8BBE\u7F6E" }
		];
		var STREAM_LABEL = {
		  open: "\u5B9E\u65F6\u5DF2\u8FDE\u63A5",
		  connecting: "\u5B9E\u65F6\u8FDE\u63A5\u4E2D",
		  closed: "\u5B9E\u65F6\u5DF2\u65AD\u5F00"
		};
		function JobHunterPanel() {
		  const [screen, setScreen] = (0, import_react16.useState)("today");
		  const [selected, setSelected] = (0, import_react16.useState)(null);
		  const [revision, setRevision] = (0, import_react16.useState)(0);
		  const timer = (0, import_react16.useRef)(null);
		  (0, import_react16.useEffect)(
		    () => () => {
		      if (timer.current !== null) window.clearTimeout(timer.current);
		    },
		    []
		  );
		  const onHint = (0, import_react16.useCallback)((type) => {
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
		  (0, import_react16.useEffect)(() => {
		    const apply2 = (intent) => {
		      setScreen("jobs");
		      setSelected(intent.jobId);
		    };
		    const first = consumePanelIntent();
		    if (first !== null) apply2(first);
		    return subscribePanelIntent(apply2);
		  }, []);
		  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "jh-root", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("header", { className: "jh-topbar", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("h1", { className: "jh-title", children: "\u6C42\u804C\u627E\u5DE5\u4F5C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "jh-badge", children: PHASE }),
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("nav", { className: "jh-tabs", "aria-label": "\u6C42\u804C\u627E\u5DE5\u4F5C\u5206\u533A", children: TABS.map((tab) => /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
		        "button",
		        {
		          type: "button",
		          className: `jh-tab${screen === tab.key ? " jh-tab-active" : ""}`,
		          "aria-current": screen === tab.key ? "page" : void 0,
		          onClick: () => {
		            setScreen(tab.key);
		            setSelected(null);
		          },
		          children: tab.label
		        },
		        tab.key
		      )) }),
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("span", { className: `jh-live jh-live-${stream.status}`, title: PLUGIN_ID, role: "status", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("i", { className: "jh-dot", "aria-hidden": "true" }),
		        STREAM_LABEL[stream.status] ?? stream.status
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: backToConversation, children: "\u8FD4\u56DE\u5BF9\u8BDD\u533A" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "jh-body", role: "main", children: screen === "today" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
		      TodayScreen,
		      {
		        revision,
		        onGoJobs: () => setScreen("jobs"),
		        onGoCollect: () => setScreen("collect")
		      }
		    ) : screen === "collect" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(CollectScreen, { revision, onGoSettings: () => setScreen("settings") }) : screen === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(SettingsScreen, { revision }) : screen === "pipeline" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
		      PipelineScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "inbox" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
		      InboxScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "interviews" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
		      InterviewsScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "campus" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(CampusScreen, { revision, onChanged: () => setRevision((value) => value + 1) }) : screen === "board" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
		      BoardScreen,
		      {
		        revision,
		        onDrillDown: () => {
		          setSelected(null);
		          setScreen("pipeline");
		        }
		      }
		    ) : screen === "resumes" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(ResumesScreen, { revision, onChanged: () => setRevision((value) => value + 1) }) : /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
		      JobsScreen,
		      {
		        revision,
		        selected,
		        onSelect: setSelected,
		        onChanged: () => setRevision((value) => value + 1)
		      }
		    ) }),
		    screen === "jobs" || selected === null ? null : /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
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

		/* \u2500\u2500 \u8BED\u4E49\u8272\u7684"\u6587\u672C\u7248"\uFF08\u5BF9\u6BD4\u5EA6\u4FEE\u590D\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5B9E\u6D4B\uFF08\u771F\u5B9E\u6D4F\u89C8\u5668\u53D6\u8BA1\u7B97\u6837\u5F0F + WCAG \u516C\u5F0F\uFF09\uFF1A\u4E3B\u9898\u91CC\u7684 state-*-primary \u662F**\u6307\u793A\u8272**\uFF0C
		   \u4E0D\u662F\u6587\u5B57\u8272 \u2014\u2014 \u62FF\u6765\u5F53\u6587\u5B57\u8272\u5728 bg-base \u4E0A\u53EA\u6709 2.0\u20132.3:1\uFF08\u6210\u529F #22c55e 2.28\u3001
		   \u8B66\u544A #f59e0b 2.15\uFF09\uFF0C\u8FDC\u4F4E\u4E8E\u6B63\u6587\u8981\u6C42\u7684 4.5:1\u3002

		   \u505A\u6CD5\uFF1A\u628A\u8BED\u4E49\u8272\u4E0E label-primary\uFF08#0f1115\uFF0C18.9:1\uFF09\u6309 55:45 \u6DF7\u51FA\u4E00\u4E2A**\u6DF1\u8272\u53D8\u4F53**\uFF0C
		   \u8272\u76F8\u4ECD\u53EF\u8FA8\u8BA4\u3001\u5BF9\u6BD4\u5EA6\u8FBE\u6807\uFF08\u6DF7\u8272\u540E\u7ECF\u5B9E\u6D4B\u5747 \u22655:1\uFF09\uFF0C\u800C\u4E14**\u6CA1\u6709\u786C\u7F16\u7801\u8272\u503C** \u2014\u2014 \xA75.3
		   \u8981\u6C42\u989C\u8272\u4E00\u5F8B\u8D70\u4E3B\u9898\u53D8\u91CF\uFF0Ccolor-mix \u5728\u672C\u6587\u4EF6\u91CC\u4E5F\u65E9\u6709\u5148\u4F8B\uFF08\u89C1\u622A\u6B62\u65E5\u671F\u7684\u7EA2\u5E95\uFF09\u3002

		   \u53E6\u5916\uFF1A\u4E3B\u9898\u91CC**\u6CA1\u6709** --dsw-alias-state-error-tertiary\uFF08\u5B9E\u6D4B 7 \u4E2A\u4E0D\u5B58\u5728\u7684\u53D8\u91CF\u4E4B\u4E00\uFF09\uFF0C
		   \u5199\u5B83\u7B49\u4E8E\u80CC\u666F\u9759\u9ED8\u5931\u6548 \u2014\u2014 \u6240\u4EE5\u7EA2\u5E95\u7528 color-mix \u81EA\u5DF1\u8C03\uFF0C\u4E0E\u65E2\u6709\u505A\u6CD5\u4E00\u81F4\u3002

		   \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF082026-09-18\uFF0CUI-UX \u5BA1\u6838 \xA74 \u7684 P0 \u56DB\u6761\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u4E0A\u4E00\u8F6E\u53EA\u4FEE\u4E86"\u8BED\u4E49\u8272\u5F53\u6587\u5B57\u8272"\u8FD9\u4E00\u79CD\u7528\u6CD5\uFF0C\u6F0F\u4E86\u53E6\u5916\u4E24\u79CD\uFF0C\u5B9E\u6D4B\u6D45\u8272\u4E3B\u9898\u4E0B\u90FD\u4E0D\u8FBE\u6807\uFF1A

		   \u2460 **\u8BED\u4E49\u8272\uFF08\u6216\u5B83\u7684\u6DF1\u8272\u53D8\u4F53\uFF09\u5F53"\u5B9E\u5E95\u586B\u5145"**\uFF0C\u914D label-primary-foreground\uFF1A
		      .jh-chip-warn \u7684\u5E95\u8272\u539F\u672C\u76F4\u63A5\u5199 state-warn-primary(#f59e0b)\uFF0C
		      \u6D45\u8272\u4E0B\u767D\u5B57\u914D\u6A59\u5E95\u53EA\u6709 **2.15:1**\uFF08\u5B9E\u6D4B\uFF09\u3002\u540C\u6587\u4EF6 :42 \u65E9\u5C31\u91CF\u5230\u8FC7\u8FD9\u4E2A\u6570\u5B57\u3002
		      \u2192 \u7EDF\u4E00\u8D70 --jh-warn-fg\uFF0855% \u6DF7\u8272\uFF09\uFF1A\u6D45\u8272 5.57:1\u3001\u6DF1\u8272 12.08:1\u3002

		   \u2461 **\u4E1A\u52A1\u8272\u5F53"\u5F3A\u8C03\u6587\u5B57"**\uFF1Astate-business-primary \u5728\u6D45\u8272\u662F #4176e6\uFF0C
		      \u914D\u767D\u8272\u5361\u7247\u53EA\u6709 **4.23:1**\uFF0815px/700 \u7684\u85AA\u8D44\u4E0D\u591F\u5927\u5B57\u53F7\u95E8\u69DB\uFF0C\u9700\u8981 4.5\uFF09\u3002
		      \u2192 --jh-business-fg \u7528\u540C\u4E00\u4E2A 55% \u914D\u65B9\uFF1A\u6D45\u8272 4.51:1\u3001\u6DF1\u8272 8.78:1\u3002

		   \u2462 **tertiary \u5F53"\u5FC5\u987B\u8BFB\u7684\u8BF4\u660E\u6587\u5B57"**\uFF1Alabel-tertiary \u6D45\u8272 #81858c \u914D\u767D\u53EA\u6709
		      **3.71:1**\u3002\u540C\u6587\u4EF6 :801-804 \u5DF2\u7ECF\u5C31 .jh-field-flag \u4E0B\u8FC7\u8FD9\u4E2A\u7ED3\u8BBA
		      \uFF08"\u53EA\u591F\u975E\u6587\u672C\u56FE\u5F62\uFF0C\u6240\u4EE5\u7528 label-secondary"\uFF09\uFF0C\u53EA\u662F\u6CA1\u63A8\u5E7F\u5230 .jh-board-age\u3002
		      \u2192 --jh-muted-fg \u7528 45% \u6DF7\u8272\uFF1A\u6D45\u8272 5.22:1\u3001\u6DF1\u8272 6.76:1\u3002

		   \u2463 **--jh-*-fg \u88AB\u5F53\u6210"\u5B9E\u5E95\u586B\u5145"\u590D\u7528** \u2014\u2014 \u53D8\u91CF\u540D\u672C\u8EAB\u6CA1\u6709\u533A\u5206\u5F00
		      "\u5728\u6D45\u5E95\u4E0A\u5F53\u6587\u5B57"\u4E0E"\u5F53\u5B9E\u5E95\u914D\u767D\u5B57"\u4E24\u79CD\u89D2\u8272\u3002\u6DF1\u8272\u4E3B\u9898\u4E0B label-primary \u662F\u6D45\u8272\uFF0C
		      \u6DF7\u51FA\u6765\u7684\u53D8\u4F53\u4E5F\u8DDF\u7740\u53D8\u6D45\uFF0C\u4E8E\u662F :161/:254/:844 \u90A3\u4E09\u5904"\u6DF7\u8272\u5F53\u5E95 +
		      label-primary-foreground \u5F53\u524D\u666F"\u5728\u6DF1\u8272\u4E0B**\u6CA1\u6709\u53CD\u5411**\uFF08\u5B9E\u6D4B\u6DF1\u8272
		      .jh-todo-level = 7.10:1 \u8FBE\u6807\uFF09\u2014\u2014 \u4F46\u4E24\u5957\u4E3B\u9898\u90FD\u5BF9\u540C\u4E00\u4E2A\u53D8\u91CF\u63D0\u51FA
		      \u76F8\u53CD\u7684\u65B9\u5411\u8981\u6C42\uFF0C\u662F\u4E2A\u9690\u60A3\u3002\u672C\u8F6E\u628A\u89D2\u8272\u62C6\u5F00\u5E76\u5404\u5199\u5B9E\u6D4B\u503C\uFF1A
		         --jh-*-fg   \uFF1A\u5F53**\u5B9E\u5E95\u586B\u5145**\u7684\u5E95\u8272\uFF08:161/:254/:844 \u7EE7\u7EED\u7528\u5B83\uFF09\uFF1B
		         --jh-*-text \uFF1A\u5F53**\u6587\u5B57\u8272**\u538B\u5728\u4E24\u5957\u4E3B\u9898\u7684\u5361\u7247\u8868\u9762\u4E0A\u3002
		      \u5F53\u524D\u4E24\u7EC4\u7684\u53D6\u503C\u6070\u597D\u76F8\u540C\uFF0C\u62C6\u5206\u662F\u4E3A\u4E86\u8BA9"\u4E0B\u6B21\u53EA\u8C03\u4E00\u5904"\u4E0D\u81F3\u4E8E\u8FDE\u5E26\u7834\u574F\u53E6\u4E00\u5904\u3002 */
		.jh-root{
		  /* \u5B9E\u5E95\u586B\u5145\uFF08\u5F53\u5E95\u8272\uFF0C\u914D label-primary-foreground \u4F5C\u524D\u666F\uFF09*/
		  --jh-ok-fg:color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, var(--dsw-alias-label-primary));
		  --jh-warn-fg:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-label-primary));
		  --jh-error-fg:color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-label-primary));
		  /* \u6587\u5B57\u8272\uFF08\u538B\u5728 bg-base / bg-layer-1 \u4E0A\uFF09\u2014\u2014 \u5B9E\u6D4B\u503C\u89C1\u4E0A\u9762\u6BCF\u6761\u7684\u6CE8\u91CA */
		  --jh-business-fg:color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-label-primary));
		  --jh-muted-fg:color-mix(in srgb, var(--dsw-alias-label-tertiary) 45%, var(--dsw-alias-label-primary));
		  --jh-error-bg:color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);
		  --jh-warn-bg:var(--dsw-alias-state-warn-tertiary);
		  --jh-ok-bg:var(--dsw-alias-state-success-tertiary)}

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
		/* \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF1A\u6A21\u5757\u6807\u9898\u539F\u6765\u662F 13px \u2014\u2014 \u4E0E\u6B63\u6587\uFF0813px\uFF09\u3001\u8BF4\u660E\u6587\u5B57\uFF0812.5px\uFF09
		   \u51E0\u4E4E\u540C\u4E00\u6863\uFF0C"\u89E6\u53D1\u4E0E\u8FD0\u884C / \u91C7\u96C6\u65B9\u6848 / \u5E73\u53F0\u72B6\u6001"\u8FD9\u4E09\u4E2A\u6A21\u5757\u5934**\u7ACB\u4E0D\u8D77\u6765**\u3002
		   \u5B9E\u6D4B\u4E24\u7EA7\u53EA\u5DEE 0.5px\uFF0813 vs 12.5\uFF09\uFF0C\u6807\u9898\u5C42\u7EA7\u7B49\u4E8E\u4E0D\u5B58\u5728\u3002
		   \u8FD9\u91CC\u63D0\u5230 14px\uFF08\u6B63\u6587\u4ECD\u662F 13px\u3001\u8BF4\u660E 12.5px\u3001\u5B50\u6807\u9898 12.5px \u52A0\u7C97\uFF09\uFF0C
		   \u523B\u610F**\u4E0D**\u7167\u642C Ant Design \u7684 16/18px\uFF1A\u672C\u9879\u76EE\u6B63\u6587 13px\u3001\u884C\u9AD8 1.7\uFF0C
		   16px \u7684\u6A21\u5757\u6807\u9898\u5728\u5BC6\u96C6\u8868\u683C\u4E0E\u8868\u5355\u91CC\u4F1A\u663E\u5F97\u5934\u91CD\u811A\u8F7B\u3002 */
		.jh-card-title{font-size:14px;font-weight:600;margin:0 0 8px}
		.jh-muted{color:var(--dsw-alias-label-secondary);margin:0}
		.jh-ok{color:var(--jh-ok-fg)}
		.jh-warn{color:var(--jh-warn-fg)}
		.jh-error{color:var(--jh-error-fg);margin:0}

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
		/* \u7B5B\u9009\u6761\u91CC\u7684\u8865\u5145\u6761\u4EF6\u884C\uFF1A\u6807\u7B7E + \u4E00\u6392\u53EF\u5207\u6362 chips\uFF08\u57CE\u5E02\u591A\u9009 / \u5C4F\u853D\u6807\u6CE8\uFF09 */
		.jh-filter-row{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}
		.jh-filter-label{font-size:12px;color:var(--jh-muted-fg);margin-right:2px}
		.jh-chip{padding:3px 9px;font-size:12px;line-height:18px;border-radius:999px;cursor:pointer;
		  border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);
		  transition:border-color .12s,background .12s}
		.jh-chip:hover{border-color:var(--dsw-alias-border-l4)}
		.jh-chip-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);
		  background:var(--dsw-alias-interactive-bg-active)}
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
		.jh-stat-warn b{color:var(--jh-warn-fg)}
		.jh-stat-error b{color:var(--dsw-alias-state-error-primary)}

		.jh-todos{list-style:none;margin:0;padding:0}
		.jh-todo{display:flex;gap:10px;align-items:flex-start;padding:8px 0;
		  border-top:1px solid var(--dsw-alias-border-l1)}
		.jh-todo:first-child{border-top:0}
		.jh-todo-level{flex:0 0 auto;font-size:11px;padding:1px 6px;border-radius:999px;
		  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
		/* \u540C\u4E00\u7C7B\u5BF9\u6BD4\u5EA6\u95EE\u9898\uFF08\u8BED\u4E49\u5E95 + \u767D\u5B57 = 4.50:1 \u4E34\u754C\uFF09\u5728\u8FD9\u91CC\u4E5F\u5B58\u5728\uFF0C\u4E00\u5E76\u4FEE\uFF1A
		   \u6362\u6210\u6DF7\u8272\u6DF1\u53D8\u4F53\u540E\u662F 9.79:1 / 6.4:1\u3002\u5C5E\u4E8E rules \xA74.4 \u5141\u8BB8\u7684"\u53EF\u8BBF\u95EE\u6027\u4FEE\u590D"\uFF0C\u4E0D\u662F\u91CD\u7ED8\u3002 */
		.jh-todo-urgent .jh-todo-level{background:var(--jh-error-fg);color:var(--dsw-alias-label-primary-foreground)}
		.jh-todo-warn .jh-todo-level{background:var(--jh-warn-fg);color:var(--dsw-alias-label-primary-foreground)}
		.jh-todo-title{font-weight:600}
		.jh-todo-body{flex:1 1 auto;min-width:0}
		.jh-todo-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
		/* \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF1A12px \u2192 12.5px\u3002\u91C7\u96C6\u9875/\u65B9\u6848\u5361\u91CC\u7684\u300C\u91CD\u65B0\u68C0\u6D4B\u300D\u300C\u7F16\u8F91\u300D\u300C\u5220\u9664\u300D
		   \u90FD\u662F\u8FD9\u4E00\u6863\uFF0C\u800C\u5361\u7247\u6807\u9898\u540C\u65F6\u4ECE 13px \u63D0\u5230 14px \u2014\u2014 \u4E24\u8005\u672C\u6765\u53EA\u5DEE 1px\uFF0C
		   \u4E00\u63D0\u5C31\u53D8\u6210 2px\uFF0C\u6309\u94AE\u7684\u6807\u7B7E\u53CD\u800C\u6BD4\u5B83\u6240\u5C5E\u6A21\u5757\u7684\u6B63\u6587\u8FD8\u5C0F\u300212.5px \u6536\u7A84\u8FD9\u4E2A\u843D\u5DEE\u3002 */
		.jh-btn-tiny{padding:3px 8px;font-size:12.5px;border-radius:6px;margin-left:6px}

		/* \u2500\u2500 U1 \u5C97\u4F4D\u5E93 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-listbar{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}
		.jh-jobs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		/* \u5361\u7247 = \u9009\u62E9\u4E3B\u533A\u57DF + \u53F3\u4FA7\u5FEB\u6377\u6807\u8BB0\u7AD6\u6392\u3002\u5217\u6210\u4E00\u884C\u662F\u56E0\u4E3A\u4E3B\u6309\u94AE\u6A2A\u8D2F\u6574\u5F20\u5361\uFF0C
		   \u5FEB\u6377\u6309\u94AE\u4E0D\u80FD\u5D4C\u8FDB\u5B83\u5185\u90E8\uFF08button \u4E0D\u80FD\u5957 button\uFF09\uFF1B\u628A\u5B83\u4EEC\u5E73\u653E\u5728\u4E3B\u6309\u94AE\u53F3\u8FB9\u3002 */
		.jh-job-row{display:flex;align-items:stretch;gap:8px}
		.jh-job-row .jh-job{flex:1 1 auto}
		.jh-job-quick{display:flex;flex-direction:column;gap:6px;justify-content:center;flex:0 0 auto}
		.jh-job-qk{width:34px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
		  background:transparent;color:var(--jh-muted-fg);cursor:pointer;font-size:15px;line-height:1}
		.jh-job-qk:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);
		  background:var(--dsw-alias-interactive-bg-hover)}
		.jh-job-qk:disabled{opacity:.5;cursor:default}
		.jh-job-qk-on{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);
		  background:var(--dsw-alias-interactive-bg-active)}
		.jh-job-qk-ign{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);
		  background:var(--dsw-alias-interactive-bg-active)}
		/* \u5361\u7247\u5FC5\u987B\u6709\u8FB9\u754C\uFF1A\u767D\u5E95 + 4% \u63CF\u8FB9\u753B\u5728\u767D\u9875\u9762\u4E0A\u7B49\u4E8E\u6CA1\u6709\u5361\u7247\uFF0C\u6EDA\u52A8\u65F6\u5BB9\u6613\u770B\u4E32\u884C */
		.jh-job{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;cursor:pointer;
		  box-sizing:border-box;padding:12px 14px;border-radius:10px;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);
		  box-shadow:0 1px 2px rgba(0,0,0,.04);
		  color:var(--dsw-alias-label-primary);transition:border-color .12s,box-shadow .12s}
		.jh-job:hover{border-color:var(--dsw-alias-border-l4);box-shadow:0 2px 8px rgba(0,0,0,.08)}
		/* \u9009\u4E2D\uFF1A\u52A0\u6DF1\u63CF\u8FB9 + \u66F4\u5B9E\u7684\u5E95\u3002
		   \u4E0D\u518D\u7528 inset \u5DE6\u4FA7\u8272\u6761 \u2014\u2014 \u5361\u7247\u5DE6\u8FB9\u6302\u4E00\u6761\u7AD6\u7EBF\u5728\u5BC6\u96C6\u5217\u8868\u91CC\u5F88\u5435\uFF0C
		   \u800C\u4E14\u548C"\u8FB9\u6846"\u91CD\u590D\u8868\u8FBE\u4E86\u4E24\u904D\u3002 */
		.jh-job-active{border-color:var(--dsw-alias-brand-primary);
		  background:var(--dsw-alias-interactive-bg-active);
		  box-shadow:0 2px 8px rgba(0,0,0,.08)}
		.jh-job-main{flex:1 1 auto;min-width:0}
		.jh-job-title{font-size:14.5px;font-weight:600;margin:0 0 3px;line-height:1.5}
		.jh-job-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;
		  font-size:12px;color:var(--dsw-alias-label-secondary)}
		/* \u85AA\u8D44\u662F\u51B3\u7B56\u7B2C\u4E00\u773C\u8981\u770B\u7684\u4E1C\u897F\uFF1A\u5B57\u53F7\u4E0E\u5B57\u91CD\u90FD\u63D0\u4E0A\u53BB\uFF0C\u4E0D\u518D\u548C\u5730\u70B9\u4E00\u4E2A\u91CF\u7EA7\u3002
		   \u989C\u8272\u8D70 --jh-business-fg\uFF1Astate-business-primary \u76F4\u63A5\u5F53\u6587\u5B57\u8272\u5728\u767D\u8272\u5361\u7247\u4E0A\u53EA\u6709
		   4.23:1\uFF0C\u800C 15px/700 \u591F\u4E0D\u4E0A"\u5927\u6587\u672C"\u95E8\u69DB\uFF08\u9700 \u226518.66px \u4E14 \u2265700\uFF09\u2192 \u5FC5\u987B 4.5:1\u3002
		   \u6DF7\u8272\u540E\u5B9E\u6D4B\u6D45\u8272 4.51:1\u3001\u6DF1\u8272 8.78:1\u3002 */
		.jh-salary{font-size:15px;font-weight:700;color:var(--jh-business-fg)}
		/* \u516C\u53F8\u540D\u662F\u6B21\u8981\u4FE1\u606F\uFF0C\u4F46\u4E5F\u4E0D\u80FD\u6DE1\u5230\u8BFB\u4E0D\u51FA\uFF1A\u7528\u6B63\u6587\u8272 */
		.jh-job-company{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;
		  color:var(--dsw-alias-label-primary)}
		/* \u2500\u2500 .jh-tag\uFF1A\u552F\u4E00\u7684\u6807\u7B7E\u5B9A\u4E49 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF082026-09-18\uFF09\uFF1A\u8FD9\u91CC\u672C\u6765\u6709**\u4E24\u6761** .jh-tag \u89C4\u5219 \u2014\u2014
		   \u4E0A\u9762\u8FD9\u6761\uFF0812px / 5px \u5706\u89D2 /18px \u884C\u9AD8\uFF09\u4E0E\u4E0B\u9762\u90A3\u6761\uFF0811.5px / 999px \u80F6\u56CA /19px \u884C\u9AD8\uFF09\u3002
		   \u9760\u540E\u7684\u90A3\u6761\u9759\u9ED8\u8986\u76D6\u9760\u524D\u7684\uFF0C\u4E8E\u662F**\u5C97\u4F4D\u5E93\u7684\u6280\u80FD\u6807\u7B7E\u4E5F\u53D8\u6210\u4E86\u836F\u4E38**\uFF0C
		   \u800C\u4E0A\u9762\u8FD9\u6761\u6CE8\u91CA\u5199\u7684\u5374\u662F"\u6241\u5E73\u65B9\u5757"\u2014\u2014\u6CE8\u91CA\u4E0E\u5B9E\u6D4B\u76F8\u53CD\uFF0C\u662F\u5178\u578B\u7684\u91CD\u590D\u89C4\u5219\u9677\u9631\u3002
		   \u4E24\u6761\u5408\u5E76\u6210\u4E00\u6761\uFF1A\u6241\u5E73\u65B9\u5757\uFF085px \u5706\u89D2\uFF09\u3002\u7406\u7531\uFF1A
		     * \u5C97\u4F4D\u5E93\u91CC java/mysql/\u7C97\u7B5B 42 \u662F\u4E00\u6392**\u5206\u7C7B\u6807\u8BB0**\uFF0C\u836F\u4E38\u5F62\u5728\u5BC6\u96C6\u5217\u8868\u91CC\u592A\u5435\uFF1B
		     * \u72B6\u6001\u6807\u7B7E\uFF08\u6210\u529F/\u5931\u8D25\uFF09\u4E5F\u7528\u540C\u4E00\u4E2A\u7C7B\uFF0C\u6241\u5E73\u65B9\u5757\u66F4\u50CF"\u8868\u683C\u91CC\u7684\u72B6\u6001"\u800C\u4E0D\u662F\u6309\u94AE
		       \uFF08\u4F01\u4E1A\u7EA7\u89C4\u8303\u91CC Table \u5185\u7684 Tag \u5C31\u662F\u5C0F\u5706\u89D2\u77E9\u5F62\uFF0C\u4E0D\u662F\u80F6\u56CA\uFF09\u3002
		   \u884C\u9AD8\u53D6 19px\uFF08\u539F\u6765\u662F\u4E24\u6761\u5404 18/19\uFF0C\u5F52\u4E00\u5230\u9AD8\u7684\u90A3\u6761\uFF0C\u6807\u7B7E\u4E0D\u4F1A\u56E0\u5B57\u4F53\u57FA\u7EBF\u5DEE\u5F02\u8DF3\u52A8\uFF09\u3002 */
		.jh-tag{display:inline-block;font-size:11.5px;font-weight:600;line-height:19px;
		  padding:0 8px;border-radius:4px;white-space:nowrap;
		  background:var(--dsw-alias-markdown-tag);color:var(--dsw-alias-label-primary)}
		/* \u72B6\u6001\u5FBD\u7AE0\u662F"\u8FD9\u4E2A\u5C97\u4F4D\u5F53\u524D\u7B97\u4EC0\u4E48"\uFF0C\u4E0D\u662F\u590D\u9009\u6846\uFF08\u9879\u76EE\u91CC\u6CA1\u6709\u6279\u91CF\u9009\u62E9\uFF09\u3002
		   \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF1A\u5E95\u8272\u662F bg-overlay\uFF0C\u5B83\u5728\u6DF1\u8272\u4E3B\u9898\u4E0B\u662F**\u4E2D\u7070 #61666b**\uFF0C
		   \u800C label-secondary \u5728\u6DF1\u8272\u4E0B\u4E5F\u662F\u6D45\u7070 \u2192 \u5B9E\u6D4B\u53EA\u6709 3.85:1\uFF08\u6D45\u8272\u4E0B 4.90:1 \u52C9\u5F3A\u591F\uFF09\u3002
		   \u6539\u7528 label-primary\uFF08\u4E0E .jh-state-saved \u4E00\u81F4\uFF09\uFF1A\u6D45\u8272 15.97:1\u3001\u6DF1\u8272 5.55:1\u3002 */
		.jh-state{flex:0 0 auto;font-size:11.5px;font-weight:600;line-height:20px;padding:0 9px;
		  border-radius:999px;background:var(--dsw-alias-bg-overlay);
		  color:var(--dsw-alias-label-primary)}
		.jh-state-new{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-brand-text)}
		/* \u5DF2\u6536\u85CF\u4E0D\u7528\u5B9E\u5FC3\u7EFF\u5757\uFF08\u4E00\u5757\u9971\u548C\u7EFF\u538B\u5728\u767D\u5E95\u4E0A\u5F88\u5EC9\u4EF7\uFF0C\u800C\u4E14\u5B83\u53EA\u662F\u4E2A\u72B6\u6001\u3001\u4E0D\u662F\u544A\u8B66\uFF09\uFF1A
		   \u4E2D\u6027\u5E95 + \u4E00\u4E2A\u7EFF\u8272\u5C0F\u70B9\uFF0C\u4ECD\u7136\u4E00\u773C\u80FD\u8BA4\u3002 */
		.jh-state-saved{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary)}
		.jh-state-saved::before{content:'';display:inline-block;width:6px;height:6px;margin-right:5px;
		  border-radius:50%;background:var(--dsw-alias-state-success-primary);vertical-align:middle}
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
		/* \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF1A\u4E0B\u9762\u8FD9\u51E0\u5904\u539F\u672C\u7528 label-tertiary\uFF0C\u6D45\u8272 #81858c \u914D\u767D\u53EA\u6709 3.71:1\u3002
		   \u5B83\u4EEC\u90FD\u662F**\u8981\u8BFB\u7684**\u6587\u672C\uFF08\u9875\u7801\u7701\u7565\u53F7\u3001\u5931\u5206\u6743\u91CD\u3001\u5C97\u4F4D\u7F16\u53F7\u3001\u770B\u677F\u8BA1\u6570\u3001\u8BF4\u660E\u56FE\u6807\uFF09\uFF0C
		   \u4E0D\u662F\u53EF\u5FFD\u7565\u7684\u88C5\u9970 \u2014\u2014 \u540C\u6587\u4EF6 :801-804 \u5C31\u4E3A .jh-field-flag \u4E0B\u8FC7\u8FD9\u4E2A\u7ED3\u8BBA\u3002
		   \u7EDF\u4E00\u8D70 --jh-muted-fg\uFF1A\u6D45\u8272 9.59:1\u3001\u6DF1\u8272 11.15:1\u3002 */
		.jh-pg-gap{color:var(--jh-muted-fg);padding:0 2px}

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
		.jh-flag-outsourcing{background:var(--jh-warn-fg);color:var(--dsw-alias-label-primary-foreground)}
		.jh-flag-fraud{background:var(--jh-error-fg);color:var(--dsw-alias-label-primary-foreground)}
		.jh-flag-zombie{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
		.jh-flag-salary_inflation{background:var(--jh-warn-fg);color:var(--dsw-alias-label-primary-foreground);opacity:.9}
		.jh-flag-jargon_hit{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
		.jh-reasons{list-style:none;margin:6px 0 0;padding:0}
		.jh-reason{display:flex;gap:8px;padding:2px 0;font-size:12px}
		.jh-reason-weight{flex:0 0 34px;text-align:right;font-family:ui-monospace,Consolas,monospace;
		  color:var(--jh-muted-fg)}
		.jh-reason-hit .jh-reason-weight{color:var(--jh-ok-fg)}
		.jh-reason-penalty .jh-reason-weight,.jh-reason-exclude .jh-reason-weight{color:var(--jh-error-fg)}
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
		.jh-gauge-high{color:var(--jh-ok-fg)}
		.jh-gauge-mid{color:var(--jh-warn-fg)}
		.jh-gauge-low{color:var(--dsw-alias-label-secondary)}
		.jh-gauge-side{min-width:0;flex:1 1 180px;display:flex;flex-direction:column;gap:6px}

		/* \u547D\u4E2D/\u5931\u5206\u9010\u6761\uFF1A\u7ED9\u7B26\u53F7\u4E0E\u989C\u8272\uFF0C\u800C\u4E0D\u662F\u53EA\u7ED9\u4E00\u4E2A\u52A0\u6743\u6570\u5B57 */
		.jh-reason-mark{flex:0 0 14px;text-align:center;font-weight:700}
		.jh-reason-ok .jh-reason-mark{color:var(--jh-ok-fg)}
		.jh-reason-bad .jh-reason-mark{color:var(--dsw-alias-state-error-primary)}

		/* \u98CE\u9669\u63D0\u793A\u7528 Alert \u6846\uFF0C\u800C\u4E0D\u662F\u4E00\u6392\u7070\u5B57\u3002**\u4E0D\u5728\u5DE6\u8FB9\u6302\u7C97\u8272\u6761**\uFF1A
		   \u9760"\u6574\u4F53\u63CF\u8FB9 + \u6D45\u5E95"\u5C31\u591F\u8868\u610F\u4E86\uFF0C\u5DE6\u8FB9\u4E00\u6761\u7AD6\u7EBF\u5728\u5BC6\u96C6\u5217\u8868\u91CC\u65E2\u5435\u53C8\u4E0E\u8FB9\u6846\u91CD\u590D\u3002
		   \u53E6\u5916"\u6CA1\u6709\u547D\u4E2D"**\u4E0D\u5237\u6210\u7EFF\u8272**\uFF1A\u7EFF\u8272\u7B49\u4E8E\u5BA3\u5E03"\u8FD9\u4E2A\u5C97\u4F4D\u6CA1\u95EE\u9898"\uFF0C\u800C\u89C4\u5219\u6CA1\u547D\u4E2D\u53EA\u8BF4\u660E
		   "\u6CA1\u547D\u4E2D\u5DF2\u77E5\u6A21\u5F0F" \u2014\u2014 \u90A3\u6070\u6070\u662F\u672C\u9879\u76EE\u4E00\u8DEF\u62D2\u7EDD\u4E0B\u7684\u90A3\u79CD\u7ED3\u8BBA\u3002 */
		.jh-alert{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
		  padding:10px 12px;margin:0 0 10px;background:var(--dsw-alias-bg-base)}
		.jh-alert-warn{border-color:var(--dsw-alias-state-warn-secondary);
		  background:var(--dsw-alias-state-warn-tertiary)}
		.jh-alert-error{border-color:var(--dsw-alias-state-error-secondary);
		  background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}
		.jh-alert-quiet{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay)}
		.jh-alert-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 4px}
		.jh-alert-title{font-weight:600;font-size:13px}
		.jh-alert-body{margin:0;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-primary)}

		/* \u957F\u89E3\u91CA\u6536\u8FDB\u4E00\u4E2A\u5C0F\u95EE\u53F7\uFF1A\u60AC\u6D6E\u770B\u5168\u6587\uFF0C\u6B63\u6587\u91CC\u53EA\u7559\u4E00\u53E5\u3002
		   \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF1A\u4E0E .jh-state \u540C\u4E00\u4E2A\u75C5\uFF08\u6DF1\u8272\u4E0B bg-overlay \u662F\u4E2D\u7070 +
		   label-secondary \u662F\u6D45\u7070 \u2192 3.85:1\uFF09\u3002\u6539\u7528 label-primary\uFF0C\u5B9E\u6D4B 11.57:1\u3002 */
		.jh-hint{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;
		  margin-left:5px;border-radius:50%;cursor:help;font-size:10.5px;font-weight:700;line-height:1;
		  background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);vertical-align:middle}
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
		.jh-tv-ok{color:var(--jh-ok-fg);margin:0;font-size:12px}
		.jh-tv-error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;
		  overflow-wrap:anywhere;white-space:pre-wrap}

		.jh-tv-jobs{display:flex;flex-direction:column;gap:1px}
		.jh-tv-job{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;cursor:pointer;
		  border:0;background:transparent;border-radius:6px;padding:3px 6px;
		  color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}
		.jh-tv-job:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.jh-tv-job-id{color:var(--jh-muted-fg);flex:0 0 auto;font-variant-numeric:tabular-nums}
		.jh-tv-job-title{font-weight:500;flex:0 1 auto;min-width:0;
		  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.jh-tv-job-meta,.jh-tv-job-salary,.jh-tv-job-score{color:var(--dsw-alias-label-secondary);
		  flex:0 0 auto;font-size:12px}

		.jh-tv-pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:8px 10px;border-radius:8px;
		  background:var(--dsw-alias-markdown-code-block);border:1px solid var(--dsw-alias-border-l2);
		  color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
		.jh-tv-pre-body{background:transparent;border:0;padding:0}
		.jh-tv-draft{display:flex;flex-direction:column;gap:6px}
		.jh-copy-head{display:flex;justify-content:flex-end}
		.jh-tv-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}

		/* \u2500\u2500 P6\uFF1A\u7B80\u5386\u4E2D\u5FC3\uFF08U3\uFF09\u4E0E\u5B9A\u5236\uFF08U4\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-row-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 12px}
		/* \u8FD9\u4E00\u5C4F\u8981\u5360\u6EE1\u5BBD\u5EA6\uFF1A\u5DE6\u8FB9\u7248\u672C\u5217\u8868\uFF08\u7EA6 1/4\uFF09+ \u53F3\u8FB9\u5DE5\u4F5C\u533A */
		.jh-screen-wide{max-width:none;height:100%;display:flex;flex-direction:column;box-sizing:border-box}
		.jh-resume-shell{display:grid;grid-template-columns:minmax(230px,25%) minmax(0,1fr);gap:16px;
		  flex:1 1 auto;min-height:0}
		.jh-resume-side{display:flex;flex-direction:column;gap:8px;min-height:0}
		.jh-resume-side-head{display:flex;gap:6px;flex:0 0 auto}
		.jh-resume-side-head .jh-btn{flex:0 0 auto}
		.jh-resume-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;
		  overflow:auto;min-height:0}
		.jh-resume-item{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;cursor:pointer;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;
		  padding:10px 12px;color:var(--dsw-alias-label-primary);font:inherit}
		.jh-resume-item:hover{border-color:var(--dsw-alias-border-l4)}
		.jh-resume-item-active{border-color:var(--dsw-alias-brand-primary);
		  background:var(--dsw-alias-interactive-bg-active);box-shadow:0 2px 8px rgba(0,0,0,.08)}
		.jh-resume-item-top{display:flex;align-items:center;gap:6px}
		.jh-resume-name{font-size:13.5px;font-weight:600;flex:1 1 auto;min-width:0;
		  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		/* \u542F\u7528\u4E2D\uFF1A\u6D45\u7EFF\u5E95 + \u6B63\u6587\u8272\u3002\u523B\u610F\u4E0D\u7528"\u9971\u548C\u7EFF\u5E95\u767D\u5B57" \u2014\u2014 \u90A3\u662F\u544A\u8B66\u7684\u8BED\u6CD5\uFF0C\u4E0D\u662F\u72B6\u6001\u7684\u8BED\u6CD5 */
		.jh-badge-on{flex:0 0 auto;font-size:10.5px;font-weight:600;line-height:18px;padding:0 7px;
		  border-radius:999px;background:var(--dsw-alias-state-success-tertiary);
		  color:var(--dsw-alias-label-primary)}
		.jh-badge-inline{font-style:normal;font-size:10px;font-weight:600;padding:0 5px;border-radius:999px;
		  color:var(--dsw-alias-brand-text);background:var(--dsw-alias-state-business-tertiary)}
		.jh-resume-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}
		.jh-resume-chips{display:flex;flex-wrap:wrap;gap:4px}
		.jh-chip{font-style:normal;font-size:11px;line-height:18px;padding:0 7px;border-radius:5px;
		  background:var(--dsw-alias-markdown-tag);color:var(--dsw-alias-label-secondary)}
		/* \u4F53\u68C0\u5F02\u5E38\uFF1A**\u544A\u8B66**\u8BED\u6CD5\uFF08\u4E0D\u662F\u72B6\u6001\u8BED\u6CD5\uFF09\uFF0C\u6240\u4EE5\u8BE5\u523A\u773C\u3002
		   \u4F46\u5E95\u8272\u4E0D\u80FD\u76F4\u63A5\u5199 state-warn-primary \u2014\u2014 \u6D45\u8272\u4E0B\u767D\u5B57\u914D #f59e0b \u53EA\u6709 2.15:1\uFF0C
		   \u800C\u8FD9\u662F 11px \u7684\u5B9E\u9645\u6587\u5B57\uFF08\u4E0D\u662F\u7EAF\u88C5\u9970\u8272\u5757\uFF09\uFF0C\u5FC5\u987B 4.5:1\u3002
		   \u6539\u8D70 --jh-warn-fg\uFF08\u4E0E .jh-todo-warn \u540C\u4E00\u914D\u65B9\uFF09\uFF1A\u6D45\u8272 5.57:1\u3001\u6DF1\u8272 12.08:1\u3002
		   \u5B83\u4ECD\u7136\u6BD4"\u72B6\u6001\u7C7B"\u7684\u6D45\u5E95\u91CD\u5F97\u591A\uFF0C\u4E24\u8005\u523B\u610F\u4E0D\u540C\u8BED\u6CD5\u8FD9\u4E00\u70B9\u6CA1\u6709\u4E22\u3002 */
		.jh-chip-warn{background:var(--jh-warn-fg);
		  color:var(--dsw-alias-label-primary-foreground);font-weight:600;cursor:help}
		/* "\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8"\u662F\u63D0\u9192\u4E0D\u662F\u544A\u8B66\uFF0C\u7528\u6D45\u5E95\uFF0C\u522B\u548C\u4F53\u68C0\u62A2 */
		.jh-chip-dirty{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-primary)}
		.jh-chip-quiet{background:transparent;border:1px dashed var(--dsw-alias-border-l3)}

		/* \u53F3\u5DE5\u4F5C\u533A\u3002
		   \u5438\u9876\u4E0D\u53D8\u91CF\uFF082026-09-17 \u5B9E\u6D4B\uFF09\uFF1A**\u6EDA\u52A8\u5BB9\u5668\u662F .jh-work-editor\uFF0C\u6807\u9898\u680F\u5728\u5B83\u5916\u9762**\uFF0C
		   \u6240\u4EE5\u628A\u7F16\u8F91\u5668\u6EDA\u5230\u5E95\uFF08scrollTop 928\uFF09\u540E\u6807\u9898\u680F top \u4ECD\u662F 110\u3001\u4F4D\u79FB 0\u3002
		   \u522B\u518D\u7ED9\u6807\u9898\u680F\u52A0 overflow/height\uFF0C\u5426\u5219"\u4FDD\u5B58"\u5C31\u4F1A\u8DDF\u7740\u6EDA\u8D70\u3002 */
		.jh-resume-work{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;
		  container-type:inline-size}
		.jh-work-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto}
		.jh-work-name{max-width:260px;font-weight:600}
		.jh-work-actions{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;align-items:center}
		.jh-work-modes{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:0 0 auto}
		.jh-modes{display:flex;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
		.jh-mode{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;padding:3px 10px;
		  border-radius:6px;color:var(--dsw-alias-label-secondary)}
		.jh-mode:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.jh-mode-active{background:var(--dsw-alias-interactive-bg-active);
		  color:var(--dsw-alias-label-primary);font-weight:600}
		.jh-work-body{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;flex:1 1 auto;min-height:0}
		/* \u5206\u5C4F\uFF1A\u7A84\u65F6**\u4E0A\u4E0B\u5806\u53E0**\uFF0C\u4E2D\u95F4\u90A3\u6761\u7070\u6761\u53EF\u4EE5\u62D6\u52A8\u6539\u6BD4\u4F8B\u3002
		   \u540C\u4E00\u4E2A --jh-split \u670D\u52A1\u4E24\u79CD\u6392\u6CD5\uFF08\u5BBD\u65F6\u662F\u5DE6\u53F3\u5206\u5C4F\uFF0C\u89C1\u4E0B\u9762\u7684 container query\uFF09\u3002 */
		.jh-mode-split .jh-work-body{grid-template-columns:minmax(0,1fr);
		  grid-template-rows:var(--jh-split,55%) 10px minmax(0,1fr);gap:0}
		.jh-mode-edit .jh-work-preview,.jh-mode-edit .jh-work-files,.jh-mode-edit .jh-splitter{display:none}
		.jh-mode-preview .jh-work-editor,.jh-mode-preview .jh-work-files,.jh-mode-preview .jh-splitter{display:none}
		/* \u5206\u5C4F\u91CC\u4E5F\u4E0D\u663E\u793A\u9644\u4EF6 \u2014\u2014 \u5B83\u5DF2\u7ECF\u662F\u72EC\u7ACB\u5B50 tab\uFF0C\u7559\u5728\u5206\u5C4F\u91CC\u4F1A\u767D\u5360\u4E00\u4E2A\u7F51\u683C\u884C\uFF08\u5B9E\u6D4B\u591A\u51FA 74px \u7A7A\u767D\uFF09 */
		.jh-mode-split .jh-work-files{display:none}
		/* \u9644\u4EF6\u5355\u72EC\u4E00\u4E2A\u5B50 tab\uFF1A\u5B83\u8DDF\u6E32\u67D3\u65E0\u5173\uFF0C\u6324\u5728\u9884\u89C8\u4E0B\u9762\u53EA\u4F1A\u5360\u5730\u65B9 */
		.jh-mode-files .jh-work-editor,.jh-mode-files .jh-work-preview,.jh-mode-files .jh-splitter{display:none}
		.jh-splitter{display:none;border-radius:5px;background:var(--dsw-alias-bg-overlay);
		  cursor:row-resize;margin:5px 0}
		.jh-mode-split .jh-splitter{display:block}
		.jh-splitter:hover,.jh-splitter:focus-visible{background:var(--dsw-alias-border-l4);outline:none}
		.jh-work-files{overflow:auto;min-height:0;padding-right:4px}
		.jh-work-editor{overflow:auto;min-height:0;padding-right:4px}
		.jh-work-preview{display:flex;flex-direction:column;gap:8px;min-height:0}
		.jh-preview-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto}
		/* \u7EB8\u5F20\u9690\u55BB\uFF1A\u6DF1\u7070\u5E95 + \u767D\u7EB8 + \u9634\u5F71\uFF08bg-mask-2 \u5B9E\u6D4B = 12% \u9ED1\uFF0C\u538B\u5728\u767D\u5E95\u4E0A\u5C31\u662F\u6D45\u7070\uFF09 */
		.jh-paper-stage{flex:1 1 auto;min-height:320px;overflow:auto;border-radius:10px;
		  background:var(--dsw-alias-bg-mask-2);padding:18px}
		.jh-paper{display:block;width:100%;max-width:794px;height:1123px;margin:0 auto;border:0;
		  border-radius:2px;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.3)}
		/* \u5DE5\u4F5C\u533A\u591F\u5BBD\uFF08>900px\uFF09\u65F6\u6539\u6210\u5DE6\u53F3\u5206\u5C4F\uFF1A\u8FD9\u65F6\u62D6\u7684\u662F\u6A2A\u6761\uFF0C\u6BD4\u4F8B\u4ECD\u8D70 --jh-split\u3002
		   \u5224\u65AD\u4F9D\u636E\u662F**\u9762\u677F**\u5BBD\u5EA6\uFF08container query\uFF09\uFF0C\u4E0D\u662F\u7A97\u53E3\u5BBD\u5EA6\u3002 */
		@container (min-width: 901px){
		  .jh-mode-split .jh-work-body{grid-template-columns:var(--jh-split,50%) 10px minmax(0,1fr);
		    grid-template-rows:minmax(0,1fr)}
		  .jh-splitter{cursor:col-resize;margin:0 5px}
		}

		/* \u8868\u5355 */
		.jh-form-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
		  background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin:0 0 12px}
		.jh-form-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}
		.jh-form-head h3{font-size:13px;font-weight:600;margin:0}
		.jh-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
		.jh-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
		.jh-field{display:flex;flex-direction:column;gap:4px;margin:0 0 10px}
		.jh-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}
		.jh-inline{display:flex;gap:6px}
		/* \u91CD\u590D\u5757\uFF1A\u4E00\u5757\u4E00\u6846\uFF0C\u7F16\u53F7 + \u4E0A\u79FB/\u4E0B\u79FB/\u5220\u9664 */
		.jh-entry{border:1px solid var(--dsw-alias-border-l3);border-radius:9px;padding:10px 12px;
		  margin:0 0 10px;background:var(--dsw-alias-bg-base)}
		.jh-entry-head{display:flex;align-items:center;gap:4px;margin:0 0 8px}
		.jh-entry-no{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
		.jh-icon-btn:disabled{opacity:.3;cursor:default}
		.jh-lines{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
		.jh-line{display:flex;gap:6px;align-items:center;width:100%}
		/* \u6807\u7B7E\u8F93\u5165\uFF1A\u56DE\u8F66/\u987F\u53F7\u786E\u8BA4\uFF0C\u70B9 \xD7 \u5220\u6389 */
		.jh-chips{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
		.jh-chip-item{display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:20px;
		  padding:0 4px 0 8px;border-radius:6px;background:var(--dsw-alias-markdown-tag);
		  color:var(--dsw-alias-label-primary)}
		.jh-chip-x{border:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);
		  font-size:13px;line-height:1;padding:0 2px}
		.jh-chip-x:hover{color:var(--dsw-alias-state-error-primary)}
		.jh-chip-input{width:150px}

		/* \u8F93\u5165\u63A7\u4EF6\uFF1A\u767D\u5E95\uFF0C\u4E0E\u5361\u7247\u540C\u4E00\u5C42\u7EA7\uFF08\u53CD\u9988\uFF1A\u5927\u5757\u6587\u672C\u6846\u7684\u6D45\u7070\u5E95\u548C\u5361\u7247"\u4E0D\u662F\u4E00\u5957"\uFF09\u3002
		   \u53EF\u8F93\u5165\u6027\u6539\u7531**\u63CF\u8FB9**\u627F\u62C5\uFF1A\u5E38\u6001 12% \u9ED1\u3001\u60AC\u505C 16%\u3001\u805A\u7126\u4E3B\u9898\u8272 + 3px \u5149\u73AF \u2014\u2014
		   \u6BD4\u5F53\u521D\u88AB\u5426\u6389\u7684\u90A3\u7248\uFF084% \u9ED1\u3001\u65E0\u805A\u7126\u6001\uFF09\u5F3A\u5F97\u591A\uFF0C\u6240\u4EE5\u53BB\u6389\u586B\u5145\u4E0D\u4F1A\u56DE\u5230"\u770B\u4E0D\u51FA\u54EA\u91CC\u80FD\u8F93\u5165"\u3002 */
		.jh-input,.jh-textarea,.jh-select{width:100%;box-sizing:border-box;font:inherit;font-size:13px;
		  padding:6px 10px;border-radius:8px;color:var(--dsw-alias-label-primary);
		  border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base)}
		.jh-input:hover,.jh-textarea:hover,.jh-select:hover{border-color:var(--dsw-alias-border-l4)}
		.jh-input:focus,.jh-textarea:focus,.jh-select:focus{outline:none;background:var(--dsw-alias-bg-base);
		  border-color:var(--dsw-alias-link);box-shadow:0 0 0 3px var(--dsw-alias-state-business-tertiary)}
		.jh-input::placeholder,.jh-textarea::placeholder{color:var(--dsw-alias-label-caption)}
		.jh-input-narrow{max-width:90px}
		.jh-textarea{resize:vertical;line-height:1.7}
		/* \u5185\u8054\u53EF\u7F16\u8F91\u7684\u6807\u9898\uFF1A\u5E73\u65F6\u957F\u5F97\u50CF\u6807\u9898\uFF0C\u60AC\u505C/\u805A\u7126\u624D\u9732\u51FA"\u8FD9\u91CC\u80FD\u6539" */
		.jh-editable{width:auto;min-width:180px;max-width:320px;font-size:14.5px;font-weight:600;
		  padding:4px 8px;border-color:transparent;background:transparent}
		.jh-editable:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-markdown-tag)}
		.jh-editable:focus{background:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-link)}
		/* \u4E8C\u7EA7\u5F3A\u8C03\u52A8\u4F5C\uFF08\u5BFC\u51FA\uFF09\u3002
		   \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF1A\u539F\u6765\u5B83\u662F**\u5B9E\u5FC3\u84DD\u5E95**\uFF08button-info-fill + label-primary-foreground\uFF09\u3002
		   \u4E24\u5957\u4E3B\u9898\u5BF9\u8FD9\u4E00\u4E2A\u914D\u8272\u7684\u8981\u6C42\u662F**\u76F8\u53CD**\u7684\uFF0C\u9760\u4E00\u4E2A recipe \u65E0\u89E3\uFF1A
		     \u6D45\u8272\uFF1Abutton-info-fill = #4176e6\uFF08\u4E2D\u84DD\uFF09\u2192 \u767D\u5B57 4.23:1 \u2717\uFF08\u9700\u8981\u66F4\u6DF1\u7684\u5E95\uFF09
		     \u6DF1\u8272\uFF1Abutton-info-fill = #679efe\uFF08\u4EAE\u84DD\uFF09\u2192 \u6DF1\u5B57 7.11:1 \u2713\uFF08\u9700\u8981\u66F4\u4EAE\u7684\u5E95\uFF09
		   \u4EFB\u4F55"\u628A\u5E95\u8272\u538B\u6DF1"\u7684\u5199\u6CD5\u90FD\u4F1A\u5728\u6DF1\u8272\u4E0B\u628A\u4EAE\u84DD\u538B\u6210\u4E2D\u84DD\uFF0C\u6DF1\u5B57\u7ACB\u523B\u6389\u5230 4.13:1\u3002
		   \u6240\u4EE5\u6539\u6210**\u63CF\u8FB9 + \u4E3B\u9898\u8272\u6587\u5B57**\uFF1A\u53EA\u9700\u4FDD\u8BC1\u6587\u5B57\u5728\u4E24\u5957\u4E3B\u9898\u7684\u5361\u7247\u8868\u9762\u4E0A\u90FD\u8FBE\u6807\uFF0C
		   \u4E00\u4E2A recipe \u5C31\u591F\uFF08--jh-business-fg \u5B9E\u6D4B\u6D45\u8272 5.10:1 / \u6DF1\u8272 8.78:1\uFF09\u3002
		   \u5B83\u4ECD\u662F\u84DD\u8272\u5F3A\u8C03\uFF0C\u53EA\u662F\u4ECE"\u5B9E\u5FC3"\u964D\u4E3A"\u63CF\u8FB9"\u2014\u2014\u4E0E\u672C\u9879\u76EE\u5176\u5B83\u4E8C\u7EA7\u6309\u94AE\u540C\u4E00\u5957\u8BED\u6CD5\u3002 */
		.jh-btn-info{border-color:var(--jh-business-fg);font-weight:600;
		  background:transparent;color:var(--jh-business-fg)}
		.jh-btn-info:hover:not(:disabled){background:var(--dsw-alias-state-business-tertiary)}
		/* \u52A0\u6A21\u5757\uFF1A\u6574\u884C\u865A\u7EBF\u6846\uFF0C\u7A7A\u7684\u65F6\u5019\u770B\u5F97\u89C1\u3001\u5FD9\u7684\u65F6\u5019\u597D\u70B9 */
		.jh-drop{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;
		  padding:10px;border:1.5px dashed var(--dsw-alias-border-l4);border-radius:9px;
		  background:transparent;cursor:pointer;font:inherit;font-size:13px;
		  color:var(--dsw-alias-label-secondary)}
		.jh-drop:hover{border-color:var(--dsw-alias-link);color:var(--dsw-alias-label-primary);
		  background:var(--dsw-alias-interactive-bg-hover)}
		/* \u8F85\u52A9\u8BF4\u660E\uFF1A\u524D\u7F6E\u4E00\u4E2A \u24D8\uFF0C\u989C\u8272\u7528 secondary\uFF08#61666b \u2014\u2014 \u6BD4\u5EFA\u8BAE\u7684 #888 \u66F4\u6DF1\uFF09 */
		.jh-info{display:flex;align-items:flex-start;gap:6px;margin:6px 0 0;font-size:12.5px;
		  line-height:1.7;color:var(--dsw-alias-label-secondary)}
		.jh-info-icon{flex:0 0 auto;color:var(--jh-muted-fg)}
		.jh-issues{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;font-size:12.5px}
		.jh-files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;font-size:12px}
		/* \u9644\u4EF6\u4E00\u884C\uFF1A\u683C\u5F0F\u5FBD\u7AE0 + \u6587\u4EF6\u540D/\u5143\u4FE1\u606F + \u6253\u5F00/\u5220\u9664\u3002\u539F\u5148\u662F\u4E00\u884C\u88F8\u94FE\u63A5\uFF0C\u65E2\u4E0D\u80FD\u5F00\u4E5F\u4E0D\u80FD\u5220\u3002 */
		.jh-file-row{display:flex;align-items:center;gap:10px;padding:9px 11px;
		  border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1)}
		.jh-file-badge{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.04em;
		  padding:2px 7px;border-radius:5px;background:var(--dsw-alias-markdown-tag);
		  color:var(--dsw-alias-label-secondary)}
		.jh-file-pdf{background:var(--jh-error-fg);
		  color:var(--dsw-alias-label-primary-foreground)}
		/* \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF1A\u8FD9\u4E24\u4E2A\u683C\u5F0F\u5FBD\u7AE0\u539F\u672C\u628A state-error-secondary(#f25a5a) \u4E0E
		   button-info-fill(#4176e6) \u5F53\u5B9E\u5E95\u914D label-primary-foreground\u3002\u4E24\u5957\u4E3B\u9898\u4E0B
		   \u8981\u6C42\u76F8\u53CD\uFF08\u6D45\u8272\u8981\u66F4\u6DF1\u7684\u5E95\u3001\u6DF1\u8272\u8981\u66F4\u4EAE\u7684\u5E95\uFF09\uFF0C\u4E00\u4E2A recipe \u65E0\u89E3\uFF1A
		     \u6D45\u8272 state-error-secondary \u914D\u767D\u5B57 3.29:1 \u2717 / button-info-fill \u914D\u767D\u5B57 4.23:1 \u2717
		     \u6DF1\u8272\u4E24\u8005\u5206\u522B 5.75:1 \u2713 / 7.11:1 \u2713
		   \u6539\u8D70 --jh-error-fg / --jh-business-fg\uFF1A\u6D45\u8272 9.75 / 8.76\uFF0C\u6DF1\u8272 9.52 / 11.07\u3002 */
		.jh-file-docx{background:var(--jh-business-fg);
		  color:var(--dsw-alias-label-primary-foreground)}
		.jh-file-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
		.jh-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.jh-file-meta{font-size:11.5px}
		.jh-footnote{margin-top:14px;font-size:12px}
		.jh-select{max-width:260px}

		/* U4\uFF1A\u5C97\u4F4D\u8BE6\u60C5\u91CC\u7684\u5B9A\u5236\u5EFA\u8BAE */
		.jh-tailor{display:flex;flex-direction:column;gap:8px;margin-top:6px}
		.jh-tailor-notes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;
		  font-size:12px;color:var(--dsw-alias-label-secondary)}
		.jh-tailor-skill{display:inline-block;margin:0 4px 4px 0;padding:1px 7px;border-radius:999px;font-size:12px;
		  border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
		.jh-tailor-skill-hit{border-color:var(--dsw-alias-brand-text);color:var(--dsw-alias-brand-text)}
		.jh-tv-score-stale{color:var(--jh-warn-fg);font-size:12px}

		/* \u2500\u2500 P7\uFF1A\u6D41\u6C34\u7EBF\u770B\u677F / \u6D88\u606F / \u9762\u8BD5 / \u6570\u636E\u770B\u677F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		/* \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF082026-09-18\uFF0C\u4ECE\u7528\u6237\u89D2\u5EA6\u770B\u6D41\u6C34\u7EBF\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5B9E\u6D4B\u7684\u539F\u59CB\u95EE\u9898\uFF1A7 \u5217\u7684\u5199\u6CD5\u662F flex:0 0 210px\uFF08\u8FDE padding \u5B9E\u9645 228px\uFF09\uFF0C
		   \u5217\u603B\u5BBD 1596px + 6\xD710px \u95F4\u8DDD = 1656px\uFF0C\u800C\u770B\u677F\u5BB9\u5668\u53EA\u6709 1000px
		   \u2192 **\u6EA2\u51FA 656px \u5FC5\u987B\u6A2A\u5411\u6EDA\u52A8**\uFF0C\u800C\u5F53\u65F6\u5168\u5C4F\u5185\u5BB9\u53EA\u6709 114px\uFF08\u4E00\u5F20\u5361\uFF09\u3002
		   \u5728\u9014\u9636\u6BB5\u53EA\u6709\u4E00\u4E2A\u4F4D\u7F6E\u65F6\uFF0C7 \u4E2A\u56FA\u5B9A\u5217\u7EAF\u7CB9\u662F\u6D6A\u8D39\uFF1B\u5BB9\u5668\u8D8A\u7A84\u8D8A\u7CDF\uFF08768px \u65F6\u6EA2\u51FA 980px\uFF09\u3002
		   \u800C .jh-screen \u7684 max-width \u662F 1000px\uFF0C\u8FD9\u4E00\u70B9**\u4E0E\u89C6\u53E3\u65E0\u5173** \u2014\u2014 \u5BBD\u5C4F\u4E5F\u7167\u6837\u6EA2\u51FA\u3002

		   \u6539\u6CD5\uFF1A\u5217\u6539\u6210**\u53EF\u4F38\u7F29**\uFF08flex:1 1 132px + max-width 340px\uFF09\u3002
		   \u5185\u5BB9\u5C11 \u2192 \u5217\u81EA\u5DF1\u6491\u5F00\u586B\u6EE1\uFF0C\u4E0D\u9700\u8981\u6EDA\u52A8\uFF1B\u5185\u5BB9\u591A \u2192 \u5230 132px \u5E95\u9650\u624D\u6EDA\u52A8\u3002
		   \u5E95\u9650 132px \u662F\u91CF\u51FA\u6765\u7684\uFF1A\u5361\u7247\u91CC\u6700\u957F\u7684\u4E00\u884C\u662F"\u516C\u53F8\u540D \xB7 \u6E20\u9053 \xB7 \u7B80\u5386 #N"\uFF0811px\uFF0C
		   \u2248 22 \u4E2A\u534A\u89D2\u5B57\u7B26\uFF09\uFF0C\u518D\u7A84\u5C31\u8981\u6362\u884C\u5230\u4E09\u56DB\u884C\uFF0C\u5361\u7247\u53CD\u800C\u66F4\u9AD8\u3002 */
		/* align-items \u5FC5\u987B\u662F flex-start\uFF08\u4E0D\u662F stretch\uFF09\uFF1A\u6298\u53E0\u540E\u7684\u7A7A\u5217\u53EA\u6709\u4E00\u884C\u9AD8\uFF0C
		   \u4E00\u65E6\u88AB\u62C9\u4F38\uFF0C\u5B83\u4EEC\u4F1A\u8DDF\u6700\u9AD8\u7684\u90A3\u4E00\u5217\u7B49\u9AD8 \u2014\u2014 \u5B9E\u6D4B\u51FA\u73B0 7 \u4E2A 400px \u9AD8\u7684\u7A7A\u80F6\u56CA\uFF0C\u5F88\u4E11\u3002 */
		.jh-board{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;align-items:flex-start}
		.jh-board-col{flex:1 1 132px;min-width:132px;display:flex;flex-direction:column;gap:6px;
		  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
		  border-radius:10px;padding:8px}
		/* \u7A7A\u5217\u6298\u53E0\uFF1A\u53EA\u5360"\u9636\u6BB5 \xB7 0"\u4E00\u884C\u7684\u5BBD\u5EA6\uFF0C**\u4E0D\u53C2\u4E0E\u4F38\u7F29**\uFF08flex:0 0 auto\uFF09\u3002
		   \u4FEE\u6B63\u7B2C\u4E00\u7248\uFF1A\u5148\u524D\u7ED9\u7A7A\u5217 flex:1 1 108px\uFF0C7 \u5217\u5E73\u644A\u4E0B\u6765**\u6709\u5185\u5BB9\u7684\u5217\u53EA\u5269 131px**
		   \u2014\u2014 \u5361\u7247\u91CC"\u516C\u53F8\u540D \xB7 \u6E20\u9053 \xB7 \u7B80\u5386 #N"\u88AB\u6324\u6210\u4E09\u884C\uFF0C\u6BD4\u539F\u6765\u7684\u6A2A\u5411\u6EDA\u52A8\u66F4\u96BE\u8BFB\u3002
		   \u7A7A\u95F4\u8BE5\u7ED9\u6709\u5185\u5BB9\u7684\u5217\uFF0C\u7A7A\u5217\u53EA\u4FDD\u7559"\u8FD9\u4E2A\u9636\u6BB5\u5B58\u5728\u3001\u73B0\u5728\u662F 0"\u7684\u4FE1\u606F\u3002 */
		.jh-board-col-empty{flex:0 0 auto;min-width:0;padding:4px 8px;
		  flex-direction:row;align-items:center;gap:6px}
		/* \u6709\u5185\u5BB9\u7684\u5217**\u4E13\u95E8**\u5403\u6389\u7A7A\u5217\u7701\u4E0B\u7684\u7A7A\u95F4\u3002
		   \u4E0A\u9650 380px\uFF1A\u5B9E\u6D4B\u4E0D\u8BBE\u4E0A\u9650\u65F6\u5B83\u4F1A\u88AB\u62C9\u5230 549px\uFF0C\u5361\u7247\u91CC\u4E00\u884C 11px \u7684\u6587\u5B57
		   \u6A2A\u8DE8 500px \u8BFB\u8D77\u6765\u5F88\u6563\uFF1B380px \u4E0E\u5C97\u4F4D\u5E93\u5DE6\u680F\uFF08517px\uFF09\u540C\u4E00\u91CF\u7EA7\uFF0C\u8BFB\u7740\u8212\u670D\u3002 */
		.jh-board-col:not(.jh-board-col-empty){flex:1 1 132px;max-width:380px}
		/* \u7A7A\u5217\u4E0E\u5B9E\u5217\u76F8\u90BB\u65F6\u7ED9 2px \u989D\u5916\u95F4\u8DDD\uFF1A\u5B83\u4EEC\u662F\u4E24\u79CD\u4E0D\u540C\u5F62\u6001\u7684\u76D2\u5B50\uFF0C
		   \u4E0D\u7559\u7F1D\u4F1A\u7CCA\u6210\u4E00\u6761\u3002 */
		.jh-board-col-empty + .jh-board-col:not(.jh-board-col-empty),
		.jh-board-col:not(.jh-board-col-empty) + .jh-board-col-empty{margin-left:2px}
		.jh-board-head{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
		  color:var(--dsw-alias-label-secondary);min-width:0}
		.jh-board-head-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.jh-board-count{margin-left:auto;color:var(--jh-muted-fg);font-weight:400;
		  font-variant-numeric:tabular-nums}
		/* \u6574\u6761\u6D41\u6C34\u7EBF\u7684\u5F62\u72B6\uFF1A\u8BA1\u6570 + \u9636\u6BB5\u540D\u4E00\u884C\u6446\u5B8C\u3002
		   \u5B58\u5728\u7684\u610F\u4E49\u662F"\u4E0D\u7528\u6A2A\u5411\u6EDA\u52A8\u4E5F\u77E5\u9053\u81EA\u5DF1\u603B\u5171\u8D70\u5230\u54EA\u4E86"\u2014\u2014
		   \u8FD9\u662F\u539F\u6765\u7684\u770B\u677F\u505A\u4E0D\u5230\u7684\uFF081656px \u91CC\u53EA\u770B\u5F97\u5230\u524D 4 \u5217\uFF09\u3002 */
		.jh-stage-strip{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 10px;align-items:center;
		  padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;
		  background:var(--dsw-alias-bg-layer-1)}
		.jh-stage-strip-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);
		  letter-spacing:.02em}
		.jh-stage-strip-item{display:inline-flex;align-items:baseline;gap:4px;font-size:12px;
		  color:var(--dsw-alias-label-secondary)}
		.jh-stage-strip-num{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;
		  color:var(--dsw-alias-label-primary)}
		.jh-stage-strip-item[data-zero="1"] .jh-stage-strip-num{color:var(--dsw-alias-label-tertiary);
		  font-weight:400}
		/* \u6709\u5728\u9014\u6295\u9012\u7684\u9636\u6BB5\u52A0\u4E00\u4E2A\u5C0F\u5706\u70B9\uFF0C\u4E0E\u5168 0 \u7684\u533A\u5206\u5F00 \u2014\u2014 \u4E0D\u53EA\u9760\u6570\u5B57\u989C\u8272\u3002 */
		.jh-stage-strip-item[data-active="1"]::before{content:'';width:6px;height:6px;border-radius:50%;
		  background:var(--dsw-alias-brand-primary);align-self:center;flex:none}
		/* \u7BAD\u5934\u4E0E"0"\u4E00\u6837\u662F**\u8981\u8BFB\u7684**\u5F62\u72B6\u4FE1\u606F\uFF0C\u6240\u4EE5\u8D70 --jh-muted-fg \u800C\u4E0D\u662F label-tertiary
		   \uFF08tertiary \u5728\u6D45\u8272\u914D\u767D\u53EA\u6709 3.71:1 \u2014\u2014 \u8FD9\u6B21\u662F\u7C7B\u7EA7\u626B\u63CF\u5728\u65B0\u4EE3\u7801\u91CC\u5F53\u573A\u6293\u5230\u7684\uFF09\u3002 */
		.jh-stage-strip-arrow{color:var(--jh-muted-fg);font-size:11px}
		.jh-board-empty{margin:0;text-align:center;font-size:12px}
		.jh-board-card{display:flex;flex-direction:column;gap:3px;padding:7px 8px;border-radius:8px;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
		.jh-board-title{border:0;background:transparent;padding:0;text-align:left;cursor:pointer;font:inherit;
		  font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
		.jh-board-title:hover{color:var(--dsw-alias-brand-text);text-decoration:underline}
		.jh-board-meta{font-size:11px;line-height:1.5;overflow-wrap:anywhere}
		.jh-board-age{font-size:11px;color:var(--jh-muted-fg)}
		.jh-board-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
		/* \u7834\u574F\u6027\u52A8\u4F5C\uFF08\u6807\u8BB0\u5DF2\u62D2\u7EDD\uFF09\u4E0E\u63A8\u8FDB\u52A8\u4F5C\u540C\u6392\u4F46**\u89C6\u89C9\u964D\u6743**\uFF1A
		   \u5B83\u662F\u7EC8\u6001\u3001\u4E0D\u53EF\u9006\uFF0C\u4E0D\u8BE5\u548C"\u63A8\u8FDB"\u62A2\u540C\u6837\u7684\u6CE8\u610F\u529B\uFF08\u539F\u6765\u4E09\u4E2A\u6309\u94AE\u957F\u5F97\u4E00\u6A21\u4E00\u6837\uFF09\u3002
		   \u6CE8\u610F\u7528\u7684\u662F --jh-error-fg\uFF08**\u6DF1\u8272\u53D8\u4F53**\uFF0C\u4E24\u5957\u4E3B\u9898\u4E0B\u90FD\u662F\u6DF1\u8272\uFF09\u2014\u2014
		   \u4E0D\u80FD\u50CF\u65E9\u671F\u7248\u672C\u90A3\u6837\u7528 --dsw-alias-state-error-primary\uFF1A\u5B83\u5728\u6D45\u8272\u662F #ec1313\uFF0C
		   \u538B\u5728\u767D\u5361\u7247\u4E0A\u5199 12px \u5C0F\u5B57\u53EA\u6709 2.54:1\uFF0C\u8BFB\u4E0D\u6E05\u3002\u6DF1\u8272\u53D8\u4F53\u6D45\u8272 8.41:1 / \u6DF1\u8272 7.10:1\u3002 */
		/* \u5177\u4F53\u7684\u63CF\u8FB9/\u989C\u8272\u89C4\u5219\u89C1\u4E0B\u65B9 .jh-btn-danger-ghost \u2014\u2014 \u4E24\u8005\u662F\u540C\u4E00\u5957\u8BED\u6CD5\uFF0C
		   \u8FD9\u91CC\u4E0D\u518D\u91CD\u590D\u5B9A\u4E49\uFF08\u7B2C\u4E09\u8F6E\u7EDF\u4E00\uFF09\u3002 */

		.jh-followups{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		/* \u540C\u6837\u4E0D\u7528\u5DE6\u4FA7\u8272\u6761\uFF1A\u8BED\u6C14\u9760\u6574\u4F53\u63CF\u8FB9\u8272\u8868\u8FBE */
		.jh-followup{padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);
		  background:var(--dsw-alias-bg-layer-1);font-size:12px}
		.jh-followup-read-no-reply{border-color:var(--dsw-alias-state-warn-secondary)}
		.jh-followup-unread-timeout{border-color:var(--dsw-alias-border-l3)}
		.jh-followup p{margin:2px 0 0}

		.jh-messages,.jh-interviews{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		.jh-message,.jh-interview{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
		  background:var(--dsw-alias-bg-layer-1)}
		.jh-message-hr{border-color:var(--dsw-alias-brand-primary)}
		.jh-message-me{border-color:var(--dsw-alias-border-l2)}
		.jh-message-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px}
		.jh-message-body{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
		.jh-message-reply{display:flex;flex-direction:column;gap:6px;margin-top:6px}
		.jh-interview-conflict{border-color:var(--dsw-alias-state-warn-primary)}

		.jh-funnel{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
		.jh-funnel>li{display:flex;align-items:center;gap:8px}
		.jh-funnel-label{flex:0 0 72px;color:var(--dsw-alias-label-secondary)}
		.jh-funnel-bar{height:8px;border-radius:4px;background:var(--dsw-alias-brand-text);opacity:.55;flex:0 0 auto}
		/* .jh-funnel-count \u7684\u5B8C\u6574\u5B9A\u4E49\u5728\u4E0B\u9762\uFF08\u5E26 cursor/underline \u90A3\u4E00\u6761\uFF09\u2014\u2014 \u8FD9\u91CC\u4E0D\u518D\u7559\u7B2C\u4E8C\u4EFD\uFF0C
		   \u4E24\u4EFD\u540C\u540D\u89C4\u5219\u91CC\u9760\u540E\u7684\u90A3\u4EFD\u4F1A\u9759\u9ED8\u8986\u76D6\u9760\u524D\u7684\uFF0C\u6539\u9519\u4E86\u5730\u65B9\u5F88\u96BE\u67E5\u3002 */
		.jh-funnel-rate{flex:0 0 48px;text-align:right}
		/* \u603B\u4F53\u5207\u6362\uFF1A\u63A5\u89E6\u6F0F\u6597\u4E0E\u6295\u9012\u6F0F\u6597\u662F\u4E24\u4E2A\u4E0D\u53EF\u6BD4\u7684\u603B\u4F53\uFF0C\u753B\u4E00\u6761\u7EBF\u6BD4\u4EC0\u4E48\u90FD\u6E05\u695A */
		.jh-funnel-boundary{border-top:1px dashed var(--dsw-alias-border-l3);padding-top:4px;margin-top:2px}
		/* \u603B\u4F53\u5206\u6BB5\u6807\u9898\uFF1A\u63A5\u89E6\u94FE\u8DEF\u4E0E\u6295\u9012\u94FE\u8DEF\u5206\u5F00\u5199\u6E05\u695A */
		.jh-funnel-seg{font-size:11px;font-weight:600;letter-spacing:.06em;
		  color:var(--dsw-alias-label-secondary);margin-top:2px}
		.jh-funnel-row{display:flex;align-items:center;gap:9px}
		/* \u8DD1\u9053\uFF1A0 \u4E5F\u753B\u5F97\u51FA\u6765\uFF08\u6761\u672C\u8EAB\u4FDD\u5E95 3px\uFF09\uFF0C\u5426\u5219\u5168 0 \u65F6\u6574\u5F20\u56FE\u50CF\u6CA1\u753B */
		.jh-funnel-track{flex:1 1 auto;min-width:0;height:12px;border-radius:3px;
		  background:var(--dsw-alias-bg-overlay);overflow:hidden}
		.jh-funnel-bar{display:block;height:100%;border-radius:3px;
		  background:var(--dsw-alias-brand-primary);opacity:.75}
		/* \u6295\u9012\u9636\u6BB5\u6362\u4E00\u6863\u8272\uFF1A\u4E00\u773C\u5206\u5F97\u6E05\u54EA\u4E9B\u662F"\u6211\u505A\u7684\u52A8\u4F5C"\u3001\u54EA\u4E9B\u662F\u62DB\u8058\u65B9\u7684\u56DE\u5E94 */
		.jh-funnel-bar-apply{background:var(--dsw-alias-button-info-fill);opacity:1}
		.jh-funnel-count{flex:0 0 40px;text-align:right;font-variant-numeric:tabular-nums;
		  border:0;background:transparent;cursor:pointer;font:inherit;font-weight:600;
		  color:var(--jh-business-fg);text-decoration:underline;padding:0}
		.jh-funnel-count:hover{color:var(--dsw-alias-label-primary)}
		.jh-funnel-drop{flex:0 0 52px;text-align:right;font-size:11px}

		/* \u2500\u2500 \u770B\u677F\uFF1A\u5168\u5C40\u7B5B\u9009\u680F\uFF08\xA713 U8\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u4E00\u5904\u7B5B\u9009\uFF0C\u4E09\u4E2A\u6A21\u5757\u4E00\u8D77\u91CD\u7B97 \u2014\u2014 \u6240\u4EE5\u5B83\u5FC5\u987B\u957F\u5F97\u50CF"\u6574\u9875\u7684\u5F00\u5173"\uFF0C
		   \u800C\u4E0D\u662F\u67D0\u4E2A\u6A21\u5757\u81EA\u5DF1\u7684\u5C0F\u63A7\u4EF6\uFF1A\u72EC\u7ACB\u5361\u7247 + \u4E00\u6392\u8D34\u5E95\u5BF9\u9F50\u7684\u5B57\u6BB5\u3002 */
		.jh-filterbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;
		  padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
		  background:var(--dsw-alias-bg-layer-1);margin:0 0 10px}
		.jh-filterbar .jh-field{margin:0}
		.jh-filterbar .jh-input-sm{width:132px}
		.jh-filterbar .jh-select{max-width:190px}

		.jh-table{border-collapse:collapse;width:100%;font-size:12px}
		.jh-table th,.jh-table td{border-bottom:1px solid var(--dsw-alias-border-l2);padding:4px 6px;text-align:left}
		.jh-table th{color:var(--dsw-alias-label-secondary);font-weight:500}

		/* \u2500\u2500 P8\uFF1A\u6821\u62DB\u786C\u622A\u6B62\uFF08\u4E0D\u53EF\u9006\u8282\u70B9\u5FC5\u987B\u663E\u773C\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-deadlines{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
		.jh-deadline{padding:5px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);
		  background:var(--dsw-alias-bg-base)}
		/* 24 \u5C0F\u65F6\u5185\uFF1A\u6A59\uFF1B\u5DF2\u8FC7\u671F\uFF1A\u7EA2\u3002\u4E24\u4E2A\u8272\u9636\u523B\u610F\u533A\u5206 \u2014\u2014 \u300C\u5FEB\u4E86\u300D\u4E0E\u300C\u6CA1\u4E86\u300D\u662F\u4E24\u4EF6\u4E8B\u3002
		   \u6CE8\u610F\uFF1A\u4E3B\u9898\u91CC**\u6CA1\u6709** state-error-tertiary\uFF08\u5B9E\u6D4B\u5BF9\u7740 357 \u4E2A\u53D8\u91CF diff \u51FA\u6765\u7684\uFF09\uFF0C
		   \u539F\u5148\u5199\u5B83\u7B49\u4E8E\u80CC\u666F\u9759\u9ED8\u5931\u6548 \u2192 \u8FD9\u91CC\u7528 color-mix \u81EA\u5DF1\u8C03\u4E00\u4E2A 8% \u7684\u7EA2\u5E95\u3002 */
		.jh-deadline-urgent{border-color:var(--dsw-alias-state-warn-primary);
		  background:var(--dsw-alias-state-warn-tertiary)}
		.jh-deadline-overdue{border-color:var(--dsw-alias-state-error-primary);
		  background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}
		.jh-campus-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		.jh-campus-item{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
		  background:var(--dsw-alias-bg-layer-1)}

		/* \u2500\u2500 D-19\uFF1A\u65B0\u9C9C\u5EA6\u5FBD\u7AE0\u4E0E\u91C7\u96C6\u9875\uFF08U9\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		/* \u4E09\u7EA7\u5404\u81EA\u4E00\u4E2A\u8272\u9636\uFF0C\u4E14**\u6C38\u8FDC\u5E26\u6587\u5B57**\uFF1A\u53EA\u7ED9\u989C\u8272\u7528\u6237\u5206\u4E0D\u6E05"\u574F\u4E86"\u8FD8\u662F"\u65E7\u4E86"\u3002 */
		.jh-fresh{flex:0 0 auto;font-size:11.5px;font-weight:600;line-height:20px;padding:0 9px;
		  border-radius:999px;white-space:nowrap}
		.jh-fresh-fresh{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}
		.jh-fresh-stale{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
		.jh-fresh-cold{background:var(--jh-error-bg);color:var(--jh-error-fg)}

		.jh-today-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
		.jh-health-line{font-size:12.5px}
		/* \u552F\u4E00\u7684 .jh-link \u5B9A\u4E49\uFF08\u539F\u5148\u8FD9\u91CC\u548C\u4E0A\u9762\u5404\u5199\u4E86\u4E00\u4EFD\uFF0C\u4E0A\u9762\u90A3\u4EFD\u88AB\u8FD9\u4E00\u4EFD\u8986\u76D6 \u2014\u2014 \u5DF2\u5408\u5E76\uFF09\u3002
		   \u989C\u8272\u8D70 --jh-muted-fg\uFF1F\u4E0D\uFF1A\u94FE\u63A5\u8981\u770B\u5F97\u51FA\u6765\u662F\u94FE\u63A5\uFF0C\u6240\u4EE5\u8D70 --jh-business-fg \u5E76\u5E26\u4E0B\u5212\u7EBF\u3002
		   \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF1A\u5408\u5E76\u65F6**\u4E0D\u80FD**\u7528 --dsw-alias-link \u2014\u2014 \u5B83\u5728\u6D45\u8272\u4E0B\u662F #4176e6\uFF0C
		   \u538B\u5728\u767D\u5361\u7247\u4E0A\u53EA\u6709 4.23:1\uFF0C\u4E0D\u5230\u6B63\u6587\u8981\u6C42\u7684 4.5:1\uFF08.jh-funnel-count \u6B63\u662F\u8E29\u4E86\u8FD9\u4E2A\uFF09\u3002 */
		.jh-link{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;
		  color:var(--jh-business-fg);text-decoration:underline;padding:0}
		.jh-link:hover{text-decoration:underline}

		.jh-plan-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		.jh-plan-item{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
		  background:var(--dsw-alias-bg-layer-1);font-size:12.5px}
		.jh-plan-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 4px}
		.jh-sub-title{font-size:12.5px;font-weight:600;margin:12px 0 6px;
		  color:var(--dsw-alias-label-primary)}

		.jh-card-editing{border-color:var(--dsw-alias-brand-primary)}
		.jh-card-error{border-color:var(--dsw-alias-state-error-secondary)}
		.jh-fieldset{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px 12px;margin:0 0 12px}
		.jh-fieldset legend{font-size:12px;font-weight:600;padding:0 4px;color:var(--dsw-alias-label-secondary)}
		.jh-check{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer}
		.jh-check input{cursor:pointer}

		/* \u2500\u2500 \u6279\u6B21 F\uFF1A\u85AA\u8D44\u7BB1\u7EBF\u56FE\uFF08\u6A2A\u5411\uFF0CP25\u2013P75 \u9AD8\u4EAE\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		/* \u7528**\u6A2A\u5411**\u753B\uFF1A\u85AA\u8D44\u56DE\u7B54"\u591A\u5C11"\u800C\u4E0D\u662F"\u4EC0\u4E48\u65F6\u5019"\uFF0C\u6A2A\u7740\u6BD4\u7AD6\u7740\u597D\u8BFB\uFF0C
		   \u4E5F\u548C\u4E0A\u9762\u7684\u6F0F\u6597\u6761\u5F62\u540C\u4E00\u5957\u89C6\u89C9\u8BED\u8A00\u3002\u9AD8\u4EAE\u7684\u662F\u7BB1\u4F53\uFF08P25\u2013P75\uFF09\uFF0C
		   \u4E24\u7AEF\u7684\u987B\u662F\u6700\u5C0F/\u6700\u5927\u503C \u2014\u2014 \u523B\u610F\u4E0D\u505A\u79BB\u7FA4\u70B9\u5254\u9664\uFF0C\u5254\u4E86\u4F1A\u628A\u771F\u5B9E\u7684\u9AD8\u85AA\u5C97\u5220\u6389\u3002 */
		.jh-box{display:flex;flex-direction:column;gap:6px;margin:10px 0}
		.jh-box-track{position:relative;height:26px}
		.jh-box-whisker{position:absolute;top:11px;height:4px;border-radius:2px;
		  background:var(--dsw-alias-border-l3)}
		.jh-box-whisker::before,.jh-box-whisker::after{content:'';position:absolute;top:-5px;width:2px;height:14px;
		  background:var(--dsw-alias-border-l4)}
		.jh-box-whisker::before{left:0}
		.jh-box-whisker::after{right:0}
		.jh-box-body{position:absolute;top:3px;height:20px;border-radius:5px;
		  background:var(--dsw-alias-state-business-tertiary);
		  border:1px solid var(--dsw-alias-state-business-primary)}
		.jh-box-median{position:absolute;top:1px;width:2px;height:24px;
		  background:var(--dsw-alias-state-business-primary)}
		.jh-box-scale{display:flex;justify-content:space-between;font-size:11.5px;
		  color:var(--dsw-alias-label-secondary)}
		.jh-baseline{margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}

		/* \u2500\u2500 \u91C7\u96C6\u9875\u53EF\u7528\u6027\u4FEE\u590D\uFF1A\u672F\u8BED\u91CA\u4E49 / \u884C\u5185\u6807\u8BB0 / \u4E2D\u6587\u5FBD\u7AE0 / \u660E\u7EC6\u6298\u53E0 \u2500\u2500\u2500\u2500\u2500 */

		/* \u672F\u8BED\u91CA\u4E49\uFF1A\u8BCD\u672C\u8EAB\u7167\u5E38\u663E\u793A\uFF08\u5B83\u786E\u5B9E\u662F\u628A\u4E8B\u60C5\u8BF4\u51C6\u7684\u90A3\u4E2A\u8BCD\uFF09\uFF0C\u540E\u9762\u8DDF\u4E00\u4E2A\u5C0F\u5C0F\u7684\u95EE\u53F7\u3002
		   title \u540C\u65F6\u6302\u5728**\u6574\u4E2A\u8BCD\u7EC4**\u4E0A\uFF0C\u6240\u4EE5\u60AC\u505C\u5728\u8BCD\u4E0A\u4E5F\u6709\u89E3\u91CA \u2014\u2014 \u4E0D\u7528\u975E\u5F97\u7784\u51C6\u90A3\u4E2A\u95EE\u53F7\u3002 */
		.jh-term{border-bottom:1px dashed var(--dsw-alias-border-l4);cursor:help}
		/* \u672F\u8BED\u91CA\u4E49\u7684\u5C0F\u95EE\u53F7\u3002
		   \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF1A\u539F\u6765 margin-left \u53EA\u6709 3px \u4E14 vertical-align:super \u2014\u2014 \u5B9E\u6D4B
		   \u95EE\u53F7\u8D34\u5728\u8BCD\u5C3E\uFF08"\u4E0A\u6B21\u6210\u529F?"\uFF09\uFF0C\u8FD8\u5F80\u4E0A\u98D8\uFF0C\u8BFB\u8D77\u6765\u50CF\u6807\u70B9\u800C\u4E0D\u662F\u53EF\u70B9\u7684\u63D0\u793A\u3002
		   \u6539\u6210 6px \u95F4\u8DDD + \u6B63\u5E38\u57FA\u7EBF\u5BF9\u9F50\uFF08\u4E0E\u540C\u6587\u4EF6\u7684 .jh-field-hint \u4FDD\u6301\u4E00\u81F4\uFF0C
		   \u90A3\u4E2A\u672C\u6765\u5C31\u6CA1\u6709 super\uFF09\u3002 */
		.jh-term-mark{display:inline-flex;align-items:center;justify-content:center;
		  width:13px;height:13px;margin-left:6px;font-size:9px;font-weight:700;line-height:1;
		  border-radius:50%;background:var(--dsw-alias-bg-layer-3);
		  color:var(--dsw-alias-label-secondary);vertical-align:middle}

		/* \u5C4F\u5E55\u9605\u8BFB\u5668\u4E13\u7528\uFF1A\u91CA\u4E49\u6587\u672C\u8981\u8BA9\u8BFB\u5C4F\u80FD\u5FF5\u51FA\u6765\uFF0C\u4F46\u4E0D\u5360\u7248\u9762 */
		.jh-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
		  clip:rect(0 0 0 0);white-space:nowrap;border:0}

		/* \u884C\u5185\u6807\u8BB0\uFF08\u7C97\u4F53\u4E0E\u4EE3\u7801\u4E24\u79CD\uFF09\u2014\u2014 \u539F\u6765\u8FD9\u4E9B\u6807\u8BB0\u662F\u539F\u6837\u5370\u51FA\u6765\u7684 */
		.jh-inline-code{font-family:ui-monospace,Consolas,monospace;font-size:12px;
		  padding:0 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);
		  color:var(--dsw-alias-label-primary)}

		.jh-tone-ok{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}
		.jh-tone-warn{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
		.jh-tone-error{background:var(--jh-error-bg);color:var(--jh-error-fg)}
		.jh-tone-muted{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary)}

		/* \u8C03\u5EA6\u5F52\u5C5E\u7684"\u552F\u4E00\u8BF4\u6CD5"\uFF1A\u4E00\u53E5\u8BDD\u8BB2\u6E05\u8C01\u5728\u8C03\u5EA6\u3001\u4E0B\u6B21\u4EC0\u4E48\u65F6\u5019\u8DD1\u3002
		   \u539F\u6765\u8FD9\u91CC\u662F\u300C\u8C03\u5EA6\uFF1A\u672A\u542F\u52A8\u300D\u4E0E\u300C\u4E0B\u6B21\u8FD0\u884C\uFF1A\u8FD8\u6709 9 \u5C0F\u65F6\u300D\u5E76\u6392\uFF0C\u8BFB\u8D77\u6765\u81EA\u76F8\u77DB\u76FE\u3002 */
		.jh-story{margin:2px 0 4px;font-size:13px;line-height:1.7}
		.jh-story-ok{color:var(--dsw-alias-label-primary)}
		.jh-story-warn{color:var(--jh-warn-fg)}
		.jh-story-muted{color:var(--dsw-alias-label-secondary)}

		/* \u79DF\u7EA6\u9762\u677F\uFF1A\u628A"\u6B7B\u80E1\u540C"\u63D0\u793A\u6362\u6210\u5E26\u52A8\u4F5C\u7684\u9762\u677F */
		.jh-lease{margin:8px 0;padding:8px 10px;border-radius:9px;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
		.jh-lease-warn{border-color:var(--dsw-alias-state-warn-secondary)}
		.jh-lease-ok{border-color:var(--dsw-alias-state-success-secondary)}
		.jh-lease-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px}

		/* \u660E\u7EC6\u6298\u53E0\uFF08\u539F\u6765\u7684\u5806\u6808\u76F4\u51FA\u6539\u6210\u4E00\u53E5\u4EBA\u8BDD + \u53EF\u5C55\u5F00\u7684\u539F\u59CB\u4FE1\u606F\uFF09*/
		.jh-details{margin-top:5px;font-size:12px}
		.jh-details>summary{cursor:pointer;color:var(--dsw-alias-brand-text);font-size:12px;
		  padding:1px 0;user-select:none}
		.jh-details>summary:hover{text-decoration:underline}
		.jh-details .jh-pre{margin:6px 0 0;max-height:220px}
		.jh-details-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}

		/* \u6570\u503C\u5217\u53F3\u5BF9\u9F50 + \u7B49\u5BBD\u6570\u5B57\uFF1A\u7EB5\u5411\u6BD4\u5BF9\u65F6\u4F4D\u6570\u624D\u80FD\u5BF9\u9F50\u3002
		   \u6CE8\u610F\u9009\u62E9\u5668\u8981\u5199\u6210 .jh-table td.jh-num \u2014\u2014 \u53EA\u5199 .jh-num \u4F1A\u88AB\u4E0A\u9762\u7684 .jh-table td{text-align:left}
		   \u6309\u7279\u5F02\u6027\u538B\u8FC7\u53BB\uFF08\u5B9E\u6D4B\u8E29\u5230\uFF1A\u7C7B\u9009\u62E9\u5668 0,1,0 \u8F93\u7ED9 0,1,1\uFF0C\u8BA1\u7B97\u6837\u5F0F\u4ECD\u7136\u662F left\uFF09\u3002 */
		.jh-table td.jh-num,.jh-table th.jh-num{text-align:right;font-variant-numeric:tabular-nums}
		.jh-num{font-variant-numeric:tabular-nums}
		.jh-table-runs td:first-child{font-variant-numeric:tabular-nums;white-space:nowrap}

		/* \u65B9\u6848\u6761\u4EF6\u90A3\u4E00\u884C\uFF1A\u6807\u7B7E\u4E4B\u95F4\u7528 \xB7 \u5206\u9694\uFF0C\u4E0D\u8981\u6324\u6210\u4E00\u5757 */
		.jh-plan-meta{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12.5px}

		/* \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF1A\u5E73\u53F0\u72B6\u6001\u5217\u8868 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u539F\u6765\u5B83\u662F\u4E00\u6761 .jh-list \u7684 li\uFF0C\u7528\u7684\u662F\u6D4F\u89C8\u5668\u9ED8\u8BA4\u7684 list-style \u5C0F\u9ED1\u70B9\uFF08disc\uFF09\uFF0C
		   \u540E\u9762\u518D\u7528"\xB7 "\u5F53\u5206\u9694\u7B26\u3002\u5C0F\u9ED1\u70B9\u4E0D\u5E26\u4EFB\u4F55\u72B6\u6001\u542B\u4E49\uFF0C\u800C\u4E14\u4E0E\u771F\u6B63\u7684\u72B6\u6001\u8272\u6DF7\u5728\u4E00\u8D77\u3002
		   \u8FD9\u91CC\u53BB\u6389\u539F\u751F\u6807\u8BB0\uFF0C\u6539\u6210\u4E00\u4E2A**\u72B6\u6001\u5706\u70B9 + \u6587\u5B57**\u7684\u6807\u51C6\u6307\u793A\u5668\uFF1A
		   \u5706\u70B9\u7ED9\u989C\u8272\uFF0C\u540E\u9762\u7684"\u6B63\u5E38/\u5DF2\u767B\u5F55"\u7ED9\u8BED\u4E49 \u2014\u2014 \u4E0D\u8BA9\u989C\u8272\u5355\u72EC\u627F\u8F7D\u4FE1\u606F\u3002 */
		.jh-status-list{list-style:none;padding-left:0;display:flex;flex-direction:column;gap:6px}
		.jh-status-list>li{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
		/* \u72B6\u6001\u5706\u70B9\u3002\u989C\u8272\u7528 --jh-*-fg\uFF08\u6DF1\u8272\u6DF7\u8272\u53D8\u4F53\uFF09\u800C**\u4E0D\u662F** state-*-primary\uFF1A
		   \u540E\u8005\u5F53\u5E95\u8272\u65F6\u4E0E\u9875\u9762/\u5361\u7247\u80CC\u666F\u7684\u5BF9\u6BD4\u5EA6\u53EA\u6709 2.0\u20132.2:1\uFF0C\u800C WCAG 1.4.11 \u5BF9
		   "\u627F\u8F7D\u610F\u4E49\u7684\u975E\u6587\u672C\u56FE\u5F62"\u8981\u6C42 3:1 \u2014\u2014 \u5C0F\u5706\u70B9\u5C24\u5176\u5BB9\u6613\u5728\u8FD9\u79CD\u68C0\u67E5\u4E0A\u88AB\u5FFD\u89C6\u3002
		   \u6DF7\u8272\u53D8\u4F53\u5B9E\u6D4B\uFF1A\u6210\u529F 5.3:1 / \u8B66\u544A 5.9:1 / \u5371\u9669 9.8:1\uFF08\u6D45\u8272\u4E3B\u9898\uFF09\u3002
		   \u6587\u5B57\u6807\u7B7E**\u5FC5\u987B**\u4FDD\u7559\uFF08\u4E0B\u9762 li \u91CC\u7684"\u6B63\u5E38/\u5DF2\u767B\u5F55"\uFF09\uFF0C\u5706\u70B9\u53EA\u662F\u8F85\u52A9\u3002 */
		.jh-status-dot{flex:none;width:8px;height:8px;border-radius:50%;
		  background:var(--dsw-alias-label-tertiary)}
		.jh-status-dot-on{background:var(--jh-ok-fg)}
		.jh-status-dot-warn{background:var(--jh-warn-fg)}
		.jh-status-dot-bad{background:var(--jh-error-fg)}

		/* \u2500\u2500 \u754C\u9762\u8BC4\u5BA1\u7B2C\u4E8C\u8F6E\uFF1A\u5F39\u7A97 / \u80F6\u56CA / Banner / \u5206\u6BB5\u63A7\u4EF6 / \u65F6\u95F4\u9009\u62E9\u5668 \u2500\u2500\u2500\u2500\u2500 */

		/* \u72B6\u6001\u6807\u7B7E\u7684\u6837\u5F0F\u89C1\u6587\u4EF6\u4E0A\u65B9\u90A3\u6761\u552F\u4E00\u7684 .jh-tag\uFF08\u4E24\u6761\u91CD\u590D\u89C4\u5219\u5DF2\u5728\u7B2C\u4E09\u8F6E\u5408\u5E76\uFF09\u3002 */

		/* \u5F39\u7A97\uFF1A\u5C42 + \u906E\u7F69 + \u5BF9\u8BDD\u6846\u3002
		   \u906E\u7F69\u7528 button \u800C\u4E0D\u662F div \u2014\u2014 \u5B83\u5929\u7136\u53EF\u805A\u7126\u3001\u53EF\u88AB\u8BFB\u5C4F\u8BC6\u522B\u4E3A"\u5173\u95ED"\u3002 */
		.jh-modal-layer{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-start;
		  justify-content:center;padding:36px 16px;box-sizing:border-box;overflow:auto}
		.jh-modal-backdrop{position:absolute;inset:0;border:0;padding:0;cursor:pointer;
		  background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent)}
		.jh-modal{position:relative;display:flex;flex-direction:column;max-height:calc(100% - 24px);
		  width:100%;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);
		  background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 40px rgba(0,0,0,.22);
		  outline:none}
		.jh-modal-md{max-width:520px}
		.jh-modal-lg{max-width:720px}
		.jh-modal-head{display:flex;align-items:center;gap:8px;padding:12px 16px;
		  border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
		.jh-modal-title{font-size:14.5px;font-weight:600;margin:0}
		.jh-modal-body{padding:14px 16px;overflow:auto;flex:1 1 auto;min-height:0}
		.jh-modal-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 16px;
		  border-top:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
		.jh-modal-foot-note{font-size:12px}

		/* \u5B57\u6BB5\u6807\u9898 + \u6536\u7EB3\u5728\u95EE\u53F7\u91CC\u7684\u8BF4\u660E\uFF08\u53D6\u4EE3\u8F93\u5165\u6846\u4E0B\u65B9\u7684\u957F\u6BB5\u89E3\u91CA\uFF09*/
		.jh-field-label{display:inline-flex;align-items:center;gap:5px;font-size:12px;
		  color:var(--dsw-alias-label-secondary)}
		.jh-field-hint{display:inline-flex;align-items:center;justify-content:center;
		  width:14px;height:14px;flex:none;font-size:10px;font-weight:700;line-height:1;cursor:help;
		  border-radius:50%;border:1px solid var(--dsw-alias-border-l3);
		  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
		.jh-field-hint:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text)}
		/* \u5BF9\u6BD4\u5EA6\uFF1Alabel-tertiary \u5728\u6D45\u5E95\u4E0A\u53EA\u6709 3.71:1\uFF08\u53EA\u591F\u975E\u6587\u672C\u56FE\u5F62\uFF09\uFF0C\u800C\u8FD9\u662F\u4E2A 10px \u7684\u5B57\u7B26\uFF0C
		   \u6240\u4EE5\u7528 label-secondary\uFF085.80:1\uFF09\u3002 */
		.jh-field-flag{font-style:normal;font-size:11px;padding:0 6px;border-radius:999px;
		  background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
		.jh-field-row{display:flex;align-items:center;gap:6px}
		.jh-field-row .jh-input{flex:1 1 auto;min-width:0}
		.jh-section-title{font-size:12px;font-weight:600;margin:14px 0 8px;
		  color:var(--dsw-alias-label-secondary)}

		/* \u65F6\u95F4\u8303\u56F4\u9009\u62E9\u5668\uFF1A\u4E24\u4E2A\u539F\u751F time \u8F93\u5165 + \u4E2D\u95F4\u4E00\u4E2A"\u81F3"\uFF0C\u66FF\u6389\u539F\u6765\u7684\u56DB\u4E2A\u6570\u5B57\u6846 */
		.jh-timerange{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
		.jh-time{width:118px}
		.jh-timerange-sep{font-size:12.5px;color:var(--dsw-alias-label-secondary)}

		/* \u5206\u6BB5\u6807\u7B7E\u7EC4\uFF08\u8FD0\u884C\u65E5\uFF09+ \u4E00\u952E\u9884\u8BBE */
		.jh-segmented{display:inline-flex;gap:2px;padding:2px;border-radius:9px;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay)}
		.jh-seg{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;
		  padding:4px 10px;border-radius:7px;color:var(--dsw-alias-label-secondary)}
		.jh-seg:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
		.jh-seg-on{background:var(--dsw-alias-interactive-bg-active);
		  color:var(--dsw-alias-label-primary);font-weight:600}
		.jh-presets{margin-top:8px}

		/* \u5361\u7247\u5185\u7684\u8B66\u544A Banner\uFF08\u628A"\u8FDE\u7EED\u5931\u8D25 N \u6B21"\u8FD9\u7C7B\u6838\u5FC3\u98CE\u9669\u62AC\u51FA\u6765\uFF09*/
		.jh-banner{display:flex;flex-direction:column;gap:2px;margin-top:8px;padding:7px 10px;
		  border-radius:8px;font-size:12.5px;line-height:1.6}
		.jh-banner-title{font-weight:600}
		.jh-banner-warn{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
		.jh-banner-error{background:var(--jh-error-bg);color:var(--jh-error-fg)}

		/* \u65B9\u6848\u5361\u7247\uFF1A\u660E\u786E\u8FB9\u6846 + \u9634\u5F71\uFF0C\u4E0E\u5361\u7247\u80CC\u666F\u62C9\u5F00\u5C42\u6B21 */
		.jh-plan-card{padding:11px 13px;border-radius:10px;border:1px solid var(--dsw-alias-border-l3);
		  background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 3px rgba(0,0,0,.07);font-size:12.5px}
		.jh-plan-name{font-size:13.5px}

		/* \u6309\u94AE\u6743\u91CD\uFF1A\u5371\u9669 / \u8B66\u793A\u3002\u4E3B\u64CD\u4F5C\u590D\u7528\u5DF2\u6709\u7684 .jh-btn-primary\u3002
		   \u989C\u8272\u4E00\u5F8B\u8D70\u4E3B\u9898\u53D8\u91CF\uFF08\xA75.3\uFF09\uFF0C\u4E0D\u5199\u6B7B red\u3002 */
		/* \u5371\u9669\u64CD\u4F5C\uFF1A**\u5B9E\u5E95**\u3002
		   \u6CE8\u610F\u5E95\u8272\u7528\u7684\u662F --jh-error-fg\uFF08\u8BED\u4E49\u8272\u4E0E label-primary \u6DF7\u51FA\u7684\u6DF1\u8272\u53D8\u4F53\uFF09\uFF0C\u4E0D\u662F\u4E3B\u9898\u7684
		   state-error-primary \u2014\u2014 \u5B9E\u6D4B\u540E\u8005\u914D\u767D\u5B57\u6070\u597D **4.4996:1**\uFF0C\u6BD4 AA \u7684 4.5 \u5DEE\u4E00\u70B9\u70B9\uFF0C
		   \u5C5E\u4E8E"\u770B\u7740\u6CA1\u95EE\u9898\u3001\u91CF\u4E86\u5C31\u662F\u4E0D\u8FBE\u6807"\u3002\u6362\u6210\u6DF7\u8272\u540E\u662F 9.79:1\uFF0C\u89C6\u89C9\u4E0A\u4ECD\u662F\u660E\u786E\u7684\u7EA2\u3002 */
		/* \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF1A\u7834\u574F\u6027\u52A8\u4F5C\u5206\u6210"\u89E6\u53D1"\u4E0E"\u786E\u8BA4"\u4E24\u6863 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u539F\u6765\u5217\u8868\u884C\u91CC\u7684\u300C\u5220\u9664\u300D\u548C\u786E\u8BA4\u5F39\u7A97\u91CC\u7684\u300C\u786E\u8BA4\u5220\u9664\u300D\u5171\u7528 .jh-btn-danger\uFF08\u5B9E\u5FC3\u586B\u5145\uFF09\u3002
		   \u5B9E\u6D4B\u5728\u6DF1\u8272\u4E3B\u9898\u91CC\u300C\u5220\u9664\u300D\u7684\u80CC\u666F\u662F rgb(245,162,162) \u2014\u2014 \u540C\u4E00\u5F20\u65B9\u6848\u5361\u91CC
		   \u5B83\u6BD4\u4E3B\u64CD\u4F5C\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u7684\u586B\u5145\u8FD8\u62A2\u773C\uFF0C\u800C\u5B83\u53EA\u662F\u4E2A\u4E0D\u8BE5\u88AB\u987A\u624B\u70B9\u7684\u6B21\u8981\u52A8\u4F5C\u3002
		   \u73B0\u5728\uFF1A
		     * .jh-btn-danger        \u5B9E\u5FC3 \u2014\u2014 \u53EA\u7559\u7ED9**\u786E\u8BA4\u5F39\u7A97\u91CC\u7684\u786E\u8BA4\u952E**\uFF08\u90A3\u91CC\u5B83\u5C31\u662F\u4E3B\u64CD\u4F5C\uFF09\uFF1B
		     * .jh-btn-danger-ghost  \u63CF\u8FB9 + \u5371\u9669\u8272\u6587\u5B57 \u2014\u2014 \u5217\u8868\u884C\u91CC\u7684\u89E6\u53D1\u952E\u3002
		   \u6587\u5B57\u8272\u7528 --jh-error-fg\uFF08\u6DF1\u8272\u53D8\u4F53\uFF09\u800C\u4E0D\u662F state-error-primary\uFF1A
		   \u540E\u8005\u5728\u6D45\u8272\u662F #ec1313\uFF0C12.5px \u5C0F\u5B57\u538B\u767D\u5E95\u53EA\u6709 2.54:1\uFF08\u5B9E\u6D4B 8.41:1 \u624D\u662F\u8FBE\u6807\u7684\u90A3\u4E2A\uFF09\u3002 */
		.jh-btn-danger{border-color:transparent;font-weight:600;
		  background:var(--jh-error-fg);
		  color:var(--dsw-alias-label-primary-foreground)}
		.jh-btn-danger:hover:not(:disabled){filter:brightness(1.12)}
		/* \u5217\u8868\u884C\u91CC\u7684\u7834\u574F\u6027\u52A8\u4F5C\uFF1A\u63CF\u8FB9\u3001\u4E0D\u52A0\u7C97\u3001\u4E0D\u5E26\u586B\u5145 \u2014\u2014 \u770B\u5F97\u89C1\u3001\u4F46\u4E0D\u62A2\u6CE8\u610F\u529B\u3002 */
		.jh-btn-danger-ghost{border-color:var(--dsw-alias-border-l3);color:var(--jh-error-fg)}
		.jh-btn-danger-ghost:hover:not(:disabled){background:var(--jh-error-bg);
		  border-color:var(--dsw-alias-state-error-secondary)}
		.jh-btn-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--jh-warn-fg)}
		.jh-btn-warn:hover:not(:disabled){background:var(--jh-warn-bg)}

		/* \u8868\u683C\u91CC\u7684\u9519\u8BEF\uFF1A\u53EA\u7559\u4E00\u4E2A\u5C0F\u6807\u8BB0\uFF0C\u70B9\u5F00\u624D\u662F\u5F39\u7A97\uFF08\u539F\u6765\u662F\u6574\u6BB5\u5806\u6808\u644A\u5728\u5355\u5143\u683C\u91CC\uFF09\u3002
		   \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF1A\u5B83\u539F\u6765\u662F 999px \u80F6\u56CA + 1px \u8FB9\u6846 + 2px\xD79px \u5185\u8FB9\u8DDD\uFF08\u5B9E\u6D4B 26px \u9AD8\uFF09\uFF0C
		   \u800C\u540C\u4E00\u5217\u7684"\u6210\u529F/\u5931\u8D25"\u6807\u7B7E\u662F 19px \u9AD8\u7684\u5C0F\u5706\u89D2\u77E9\u5F62 \u2014\u2014 \u540C\u4E00\u5F20\u8868\u91CC\u4E24\u79CD\u5F62\u72B6\uFF0C
		   \u800C\u4E14\u9519\u8BEF\u90A3\u4E2A\u660E\u663E\u66F4"\u80D6"\uFF0C\u628A 158px \u7684\u72B6\u6001\u5217\u6491\u5230\u4E86 227px \u5BBD\u3002
		   \u73B0\u5728\u7EDF\u4E00\u6210\u4E0E .jh-tag \u540C\u4E00\u6863\u7684\u5C0F\u5706\u89D2\u77E9\u5F62\uFF084px\uFF09\uFF0C\u9AD8\u5EA6\u4E5F\u5BF9\u9F50\u3002 */
		.jh-err-chip{display:inline-flex;align-items:center;gap:5px;cursor:pointer;font:inherit;
		  font-size:11.5px;line-height:17px;padding:0 8px;border-radius:4px;
		  border:1px solid var(--dsw-alias-state-error-secondary);
		  background:var(--jh-error-bg);color:var(--jh-error-fg)}
		.jh-err-chip:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)}
		.jh-err-chip-short{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:9em}
		.jh-err-chip-more{font-size:10.5px;opacity:.75;text-decoration:underline;flex:none}
		/* \u8B66\u793A\u56FE\u6807\uFF1A\u5F62\u72B6\u672C\u8EAB\u4E5F\u8868\u610F\uFF08\u4E0D\u53EA\u9760\u989C\u8272\uFF09\u3002 */
		.jh-err-chip-icon{flex:none;font-size:10px;line-height:1}

		/* \u2500\u2500 quality-gates \u6536\u5C3E\uFF1A\u8868\u683C\u72B6\u6001 / \u5C0F\u5C4F\u7B56\u7565 / \u7A7A\u6001 / \u52A0\u8F7D\u6001 / \u53CD\u9988\u53EF\u5173\u95ED \u2500\u2500 */

		/* Table \u7684\u5FC5\u67E5\u72B6\u6001\u91CC\u6709 row hover \u2014\u2014 \u539F\u6765\u6CA1\u6709\uFF0C\u626B\u884C\u65F6\u4F1A\u4E22\u5931"\u9F20\u6807\u5728\u54EA\u4E00\u884C"\u7684\u53CD\u9988 */
		.jh-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}

		/* \u5C0F\u5C4F\u7B56\u7565\uFF1A**\u6709\u610F\u7684\u6A2A\u5411\u6EDA\u52A8**\uFF08quality-gates \xA75 \u5141\u8BB8\uFF0C\u6761\u4EF6\u662F\u4FDD\u7559\u884C\u8EAB\u4EFD\u4E0E\u4E3B\u64CD\u4F5C\uFF09\u3002
		   \u8868\u683C\u7ED9\u4E00\u4E2A min-width \u8BA9\u5217\u4E0D\u88AB\u538B\u6210\u4E00\u6761\uFF1B\u5BB9\u5668 overflow-x:auto \u627F\u62C5\u6EDA\u52A8\u3002 */
		.jh-table-scroll{overflow-x:auto;overscroll-behavior-x:contain}
		.jh-table-runs{min-width:520px}
		/* \u7C98\u4F4F"\u5F00\u59CB"\u5217\uFF1A\u6A2A\u5411\u6EDA\u52A8\u65F6\u4ECD\u7136\u8BA4\u5F97\u51FA\u8FD9\u662F\u54EA\u4E00\u884C\u3002
		   \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF1A\u8FD9\u5F20\u8868\u539F\u6765\u6CA1\u6709\u5217\u5BBD\u7B56\u7565\uFF0C\u6D4F\u89C8\u5668\u6309\u5185\u5BB9\u81EA\u52A8\u5206\u914D \u2014\u2014
		   \u5B9E\u6D4B"\u72B6\u6001"\u5217\u88AB\u6491\u5230 158px \u800C\u6700\u5BBD\u7684\u6807\u7B7E\u53EA\u6709 64px\uFF0C"\u66F4\u65B0"\u5217\u53EA\u6709\u4E2A\u4F4D\u6570\u5374\u5360 75px\uFF0C
		   \u7A7A\u51FA\u6765\u7684\u5BBD\u5EA6\u5168\u88AB 498px \u7684"\u7ED3\u679C\u8BF4\u660E"\u5403\u6389\uFF08\u5B83\u5176\u5B9E\u53EA\u9700\u8981\u4E00\u53E5\u8BDD\uFF09\u3002
		   \u505A\u6CD5\uFF1A\u975E\u6700\u540E\u4E00\u5217\u7ED9 width:1% + nowrap\uFF0C\u8BA9\u5B83\u4EEC**\u6536\u7F29\u5230\u5185\u5BB9\u5BBD**\uFF1B
		   "\u7ED3\u679C\u8BF4\u660E"\u4E0D\u7ED9\u5BBD\u5EA6\uFF0C\u4E8E\u662F\u5403\u6389\u5168\u90E8\u5269\u4F59\u7A7A\u95F4\u3002\u6BD4 table-layout:fixed \u597D\u7684\u5730\u65B9\u662F
		   \u5217\u5BBD\u4ECD\u968F\u5185\u5BB9\u81EA\u9002\u5E94\uFF08"\u90E8\u5206\u6210\u529F"\u6BD4"\u6210\u529F"\u5BBD\uFF09\uFF0C\u4E0D\u4F1A\u628A\u8BF4\u660E\u5217\u538B\u6210\u7B49\u5BBD\u7684\u4E00\u683C\u3002 */
		.jh-table-runs th:not(:last-child),.jh-table-runs td:not(:last-child){width:1%;white-space:nowrap}
		/* \u300C\u5F00\u59CB\u300D\u5217\u4FDD\u5E95\u5BBD\u5EA6\uFF1A\u6536\u7F29\u5230\u5185\u5BB9\u5BBD\u540E\u5B83\u53EA\u5269 40px\uFF08\u8868\u5934"\u5F00\u59CB"\u6BD4"11:34"\u7A84\uFF09\uFF0C
		   \u65F6\u95F4\u8D34\u8FB9\u3001\u7A84\u5C4F\u4E0B\u8FD8\u6709\u88AB\u88C1\u7684\u98CE\u9669\u3002\u7ED9\u4E00\u4E2A 6ch \u4E0B\u9650\u3002 */
		.jh-table-runs td.jh-col-sticky:first-child{min-width:6ch}
		.jh-table-runs th.jh-num,.jh-table-runs td.jh-num{padding-right:10px}
		.jh-table-runs th.jh-col-sticky,.jh-table-runs td.jh-col-sticky{
		  position:sticky;left:0;z-index:1;background:var(--dsw-alias-bg-layer-1)}

		/* \u7A7A\u6001\uFF1A\u539F\u56E0 + \u4E0B\u4E00\u6B65\uFF08rules \xA74.3 / quality-gates \xA72 "\u7A7A\u6570\u636E\u65F6\u7ED9\u51FA\u539F\u56E0\u548C\u4E0B\u4E00\u6B65"\uFF09*/
		.jh-empty{display:flex;flex-direction:column;gap:4px;padding:12px 0}

		/* \u52A0\u8F7D\u6001\uFF1A\u5360\u4F4D\u884C\u4FDD\u6301\u5E03\u5C40\u7A33\u5B9A\uFF08\u4E0D\u8981\u628A"\u6B63\u5728\u8BFB\u53D6"\u663E\u793A\u6210"\u6CA1\u6709\u6570\u636E"\uFF09*/
		.jh-skeleton-row{color:var(--dsw-alias-label-secondary);text-align:center}

		/* \u53CD\u9988\u6761\uFF1A\u53EF\u5173\u95ED */
		.jh-feedback{display:flex;align-items:flex-start;gap:8px}
		.jh-feedback p{flex:1 1 auto;min-width:0}
		.jh-feedback-close{flex:0 0 auto}

		/* \u2500\u2500 \u5C0F\u5C4F\u9876\u680F\u964D\u7EA7\uFF08\u2264600px\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5B9E\u6D4B\u8E29\u5230\uFF08375px \u622A\u56FE\uFF09\uFF1A\u6807\u9898\u88AB\u6324\u6210"\u6C42
		\u804C
		\u627E
		\u5DE5
		\u4F5C"\u4E00\u5217\u4E00\u4E2A\u5B57\uFF0C10 \u4E2A tab \u7AD6\u7740\u6392\u6210\u5341\u884C\u3002
		   rules \xA77 \u8981\u6C42"\u5BFC\u822A\u3001\u7B5B\u9009\u548C\u6279\u91CF\u64CD\u4F5C\u5728\u5C0F\u5C4F\u6709\u5408\u7406\u964D\u7EA7" \u2014\u2014 \u7AD6\u5411\u5806\u53E0\u4E0D\u662F\u964D\u7EA7\uFF0C\u662F\u574F\u6389\u3002
		   \u505A\u6CD5\uFF1A\u9876\u680F\u5141\u8BB8\u6362\u884C \u2192 \u7B2C\u4E00\u884C \u6807\u9898/\u5FBD\u7AE0/\u5B9E\u65F6\u72B6\u6001/\u8FD4\u56DE\uFF0C\u7B2C\u4E8C\u884C **\u53EF\u6A2A\u5411\u6EDA\u52A8\u7684 tab \u6761**\u3002 */
		@media (max-width:600px){
		  .jh-topbar{flex-wrap:wrap;gap:8px}
		  .jh-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}
		  /* tab \u6761\u6574\u884C\u3001\u53EF\u6A2A\u6ED1\u3001\u4E0D\u6362\u884C\uFF1A\u4FDD\u7559"\u6211\u5728\u54EA\u91CC"\u7684\u53EF\u8FBE\u6027\uFF0C\u540C\u65F6\u4E0D\u628A\u9876\u680F\u6491\u6210\u5341\u884C */
		  .jh-tabs{order:3;flex:1 1 100%;margin-left:0;flex-wrap:nowrap;
		    overflow-x:auto;overscroll-behavior-x:contain}
		  .jh-tabs::-webkit-scrollbar{display:none}
		  .jh-tab{flex:0 0 auto}
		  /* \u5B9E\u65F6\u72B6\u6001\u53EA\u7559\u5706\u70B9\uFF0C\u6587\u5B57\u8BA9\u4F4D\u7ED9\u64CD\u4F5C\u6309\u94AE */
		  .jh-live span,.jh-live{font-size:0}
		  .jh-live .jh-dot{width:8px;height:8px}
		}

		/* \u2500\u2500 \u5C0F\u5C4F\uFF08\u2264480px\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   quality-gates \xA75 \u8981\u6C42 375px \u53EF\u7528\uFF1Brules \xA77 \u8981\u6C42\u5F39\u7A97\u5728\u79FB\u52A8\u7AEF\u8003\u8651\u5E95\u90E8\u62BD\u5C49/\u5168\u5C4F\u9875\u3002 */
		@media (max-width:480px){
		  /* \u5F39\u7A97\uFF1A\u5C0F\u5C4F\u53D8\u6210\u63A5\u8FD1\u5168\u5C4F\u7684\u9875\u9762\uFF0C\u800C\u4E0D\u662F\u5361\u7247\u7559 16px \u8FB9 */
		  .jh-modal-layer{padding:0;align-items:stretch}
		  .jh-modal{max-height:100%;height:100%;border-radius:0;border-left:0;border-right:0}
		  .jh-modal-md,.jh-modal-lg{max-width:none}
		  /* \u4F4E\u5BC6\u5EA6\uFF1A\u5C0F\u5C4F\u9690\u85CF\u300C\u66F4\u65B0\u300D\u5217\uFF0C\u4FDD\u7559 \u65F6\u95F4/\u72B6\u6001/\u65B0\u589E/\u7ED3\u679C\u8BF4\u660E \u8FD9\u56DB\u5217\u5173\u952E\u4FE1\u606F */
		  .jh-table-runs .jh-col-hide-sm{display:none}
		  /* \u4E3B\u8981\u64CD\u4F5C\u5728\u5C0F\u5C4F\u4ECD\u7136\u627E\u5F97\u5230\uFF1A\u65B9\u6848\u5361\u7684\u52A8\u4F5C\u6362\u884C\u4E14\u5DE6\u5BF9\u9F50\uFF0C\u4E0D\u6324\u6210\u4E00\u6761 */
		  .jh-plan-head{gap:4px}
		  .jh-plan-head .jh-btn{flex:0 0 auto}
		  /* \u65F6\u95F4\u8303\u56F4\u5728\u5C0F\u5C4F\u6362\u884C\u663E\u793A\uFF0C\u907F\u514D\u4E24\u4E2A\u8F93\u5165\u6846\u88AB\u538B\u6241 */
		  .jh-timerange{gap:6px}
		  .jh-time{width:100%;max-width:160px}
		}
		`;

		// src/client/toolviews/greeting-card.tsx
		var import_react18 = require("react");

		// src/client/toolviews/parts.tsx
		var import_react17 = require("react");

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
		  return (0, import_react17.createElement)(
		    "div",
		    { className: "jh-tv", "data-tone": tone },
		    (0, import_react17.createElement)(
		      "div",
		      { className: "jh-tv-head" },
		      (0, import_react17.createElement)("span", { className: "jh-tv-title" }, title),
		      subtitle === void 0 || subtitle === "" ? null : (0, import_react17.createElement)("span", { className: "jh-tv-sub" }, subtitle),
		      (0, import_react17.createElement)("span", { className: "jh-spacer" }),
		      actions === void 0 ? null : (0, import_react17.createElement)("span", { className: "jh-tv-actions" }, actions),
		      inspect === void 0 ? null : (0, import_react17.createElement)(
		        "button",
		        { type: "button", className: "jh-tv-link", onClick: inspect },
		        "\u67E5\u770B"
		      )
		    ),
		    children === void 0 ? null : (0, import_react17.createElement)("div", { className: "jh-tv-body" }, children)
		  );
		}
		function JobRow(props) {
		  const { job, onOpen } = props;
		  return (0, import_react17.createElement)(
		    "button",
		    {
		      type: "button",
		      className: "jh-tv-job",
		      onClick: () => onOpen(job.id),
		      title: "\u5728\u4E3B\u9762\u677F\u91CC\u6253\u5F00\u8FD9\u4E2A\u5C97\u4F4D"
		    },
		    (0, import_react17.createElement)("span", { className: "jh-tv-job-id" }, `#${String(job.id)}`),
		    (0, import_react17.createElement)("span", { className: "jh-tv-job-title" }, job.title),
		    (0, import_react17.createElement)("span", { className: "jh-tv-job-meta" }, [job.company, job.city].filter((p) => p !== "").join(" \xB7 ")),
		    (0, import_react17.createElement)("span", { className: "jh-spacer" }),
		    (0, import_react17.createElement)("span", { className: "jh-tv-job-salary" }, job.salary),
		    (0, import_react17.createElement)("span", { className: "jh-tv-job-score" }, job.score)
		  );
		}
		function useAction() {
		  const [busy, setBusy] = (0, import_react17.useState)(false);
		  const [error, setError] = (0, import_react17.useState)(null);
		  const [result, setResult] = (0, import_react17.useState)(null);
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
		var import_jsx_runtime19 = require("react/jsx-runtime");
		function GreetingCard(props) {
		  const { block, inspect } = props;
		  const settled = isSettled(block);
		  const text = textOf(block);
		  const failed = block.isError === true;
		  const [copied, setCopied] = (0, import_react18.useState)(false);
		  const parsed = splitDraft(text);
		  const jobId = jobIdOf(props);
		  return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
		    CardShell,
		    {
		      title: "\u6253\u62DB\u547C\u8BDD\u672F",
		      subtitle: failed ? block.error?.code ?? "\u5931\u8D25" : settled ? parsed.source : "\u6B63\u5728\u751F\u6210\u2026",
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      actions: settled && !failed ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
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
		        !settled ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("p", { className: "jh-tv-note", children: "\u6B63\u5728\u751F\u6210\u2026\u6A21\u578B\u4E0D\u53EF\u7528\u65F6\u4F1A\u81EA\u52A8\u9000\u56DE\u5185\u7F6E\u6A21\u677F\u3002" }) : failed ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(import_jsx_runtime19.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("pre", { className: "jh-tv-pre jh-tv-pre-body", children: parsed.body }),
		          parsed.meta === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("p", { className: "jh-tv-note", children: parsed.meta }),
		          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("p", { className: "jh-tv-note", children: "\u8FD8\u6CA1\u6709\u53D1\u9001 \u2014\u2014 \u53D1\u9001\u662F\u9AD8\u5371\u52A8\u4F5C\uFF0C\u9700\u8981\u5728\u9762\u677F\u91CC\u786E\u8BA4\u3002" })
		        ] }),
		        jobId === null || !settled || failed ? null : /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("div", { className: "jh-tv-foot", children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
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
		var import_react19 = require("react");
		var import_jsx_runtime20 = require("react/jsx-runtime");
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
		  const [copied, setCopied] = (0, import_react19.useState)(false);
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
		  return /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(
		    CardShell,
		    {
		      title: "\u5C97\u4F4D\u8BE6\u60C5",
		      subtitle: failed ? block.error?.code ?? "\u5931\u8D25" : settled ? titleLine : "\u6B63\u5728\u8BFB\u53D6\u2026",
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      actions: jobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(import_jsx_runtime20.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled: mark.busy, onClick: onMark, children: mark.busy ? "\u6536\u85CF\u4E2D\u2026" : "\u6536\u85CF" }),
		        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled: draft.busy, onClick: onDraft, children: draft.busy ? "\u751F\u6210\u4E2D\u2026" : "\u751F\u6210\u8BDD\u672F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
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
		        failed ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : !settled ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("p", { className: "jh-tv-note", children: "\u6B63\u5728\u8BFB\u53D6\u5C97\u4F4D\u8BE6\u60C5\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "jh-tv-rows", children: rows.map(
		          (row, index) => row === null ? null : /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "jh-tv-row", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { className: "jh-tv-label", children: row.key }),
		            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { className: "jh-tv-value", children: row.value })
		          ] }, `${row.key}-${String(index)}`)
		        ) }),
		        mark.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("p", { className: "jh-tv-error", children: mark.error }),
		        mark.result === null ? null : /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("p", { className: "jh-tv-ok", children: mark.result }),
		        draft.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("p", { className: "jh-tv-error", children: draft.error }),
		        draft.result === null ? null : /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "jh-tv-draft", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("pre", { className: "jh-tv-pre", children: draft.result }),
		          /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "jh-tv-foot", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { className: "jh-tv-note", children: "\u8FD9\u6BB5**\u8FD8\u6CA1\u6709\u53D1\u9001** \u2014\u2014 \u53D1\u9001\u8981\u53BB\u9762\u677F\u91CC\u786E\u8BA4\u3002" })
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
		var import_jsx_runtime21 = require("react/jsx-runtime");
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
		  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
		    CardShell,
		    {
		      title,
		      subtitle,
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      children: [
		        running ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "jh-tv-note", children: toolName === "job_search" ? "\u6B63\u5728\u6293\u53D6 \u2014\u2014 \u4F1A\u771F\u7684\u6253\u5F00\u6D4F\u89C8\u5668\uFF0C\u901A\u5E38\u5341\u51E0\u79D2\u5230\u4E00\u5206\u949F\u3002" : "\u6B63\u5728\u8BFB\u53D6\u2026" }) : failed ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : jobs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "jh-tv-note", children: text === "" ? "\u6CA1\u6709\u7ED3\u679C\u3002" : text }) : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "jh-tv-jobs", children: jobs.map((job) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(JobRow, { job, onOpen: (id) => openJobInPanel(id) }, job.id)) }),
		        running || failed || jobs.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "jh-tv-foot", children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => openJobInPanel(jobs[0].id), children: "\u53BB\u9762\u677F\u770B\u5168\u90E8" }) })
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

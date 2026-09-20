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

		// src/shared/config/plugin.ts
		var PLUGIN_ID = "dsh-job-hunter";
		var PANEL_KEY = "job-hunter";
		var ROUTE_PREFIX = "/job-hunter";
		var NOTICE_TTL_MS = 6e3;
		var PHASE = "P8";

		// src/shared/contract/dsh.ts
		function serviceOf(ctx2, name2) {
		  const value = ctx2.get(name2);
		  return value === void 0 || value === null ? void 0 : value;
		}

		// src/client/app/entry-icon.tsx
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

		// src/client/app/notice.tsx
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

		// src/client/app/panel.tsx
		var import_react39 = require("react");

		// src/client/app/error-boundary.tsx
		var import_react2 = require("react");
		var import_jsx_runtime3 = require("react/jsx-runtime");
		var ScreenErrorBoundary = class extends import_react2.Component {
		  state = { error: null };
		  static getDerivedStateFromError(error) {
		    return { error };
		  }
		  componentDidCatch(error, info) {
		    console.error(`[job-hunter] \u300C${this.props.name}\u300D\u6E32\u67D3\u5931\u8D25`, error, info.componentStack);
		  }
		  render() {
		    const error = this.state.error;
		    if (error === null) return this.props.children;
		    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("h2", { className: "jh-card-title", children: [
		        "\u300C",
		        this.props.name,
		        "\u300D\u8FD9\u4E00\u5C4F\u51FA\u9519\u4E86"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "jh-error", children: error.message }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "jh-muted", children: "\u5176\u5B83\u5206\u533A\u4E0D\u53D7\u5F71\u54CD \u2014\u2014 \u53EF\u4EE5\u5207\u5230\u522B\u7684\u6807\u7B7E\u7EE7\u7EED\u7528\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn",
		          onClick: () => {
		            this.setState({ error: null });
		          },
		          children: "\u91CD\u8BD5\u8FD9\u4E00\u5C4F"
		        }
		      )
		    ] });
		  }
		};

		// src/client/app/intent.ts
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

		// src/client/app/runtime.ts
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

		// src/client/app/tabs.ts
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
		function tabLabelOf(key) {
		  return TABS.find((tab) => tab.key === key)?.label ?? key;
		}

		// src/client/hooks/use-dialog-a11y.ts
		var import_react3 = require("react");
		function useDialogA11y(dialogRef, onClose, deps = []) {
		  const restoreRef = (0, import_react3.useRef)(null);
		  const closeRef = (0, import_react3.useRef)(onClose);
		  closeRef.current = onClose;
		  (0, import_react3.useEffect)(() => {
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

		// src/shared/contract/enums/job.ts
		var JOB_STATES = ["new", "seen", "saved", "ignored", "archived"];
		var JOB_STATE_LABEL = {
		  new: "\u65B0",
		  seen: "\u5DF2\u8BFB",
		  saved: "\u5DF2\u6536\u85CF",
		  ignored: "\u5DF2\u5FFD\u7565",
		  archived: "\u5DF2\u5F52\u6863"
		};
		var DELIVERY_STATE_LABEL = {
		  delivered: "\u5DF2\u786E\u8BA4\u9001\u8FBE",
		  pending: "\u5DF2\u53D1\u51FA\xB7\u672A\u786E\u8BA4",
		  failed: "\u5931\u8D25",
		  missing: "\u65E0\u4ECE\u786E\u8BA4"
		};
		var DELIVERY_STATE_TONE = {
		  delivered: "ok",
		  pending: "warn",
		  failed: "error",
		  missing: "muted"
		};
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
		var JOB_ORDER_OPTIONS = [
		  { value: "crawled_at", label: "\u6309\u6293\u53D6\u65F6\u95F4" },
		  { value: "match_score", label: "\u6309\u5339\u914D\u5206" },
		  { value: "salary_min", label: "\u6309\u6708\u85AA" },
		  { value: "last_seen_at", label: "\u6309\u6700\u8FD1\u51FA\u73B0" },
		  { value: "first_seen_at", label: "\u6309\u9996\u6B21\u51FA\u73B0" },
		  { value: "title", label: "\u6309\u6807\u9898" }
		];
		var JOB_FRESHNESS_FRESH_DAYS = 3;
		var JOB_FRESHNESS_COLD_DAYS = 14;
		var JOB_FRESHNESS_LABEL = {
		  fresh: "\u8FD1\u6765\u6D3B\u8DC3",
		  stale: "\u4E00\u5468\u591A\u6CA1\u89C1",
		  cold: "\u534A\u6708\u4EE5\u4E0A\u6CA1\u89C1"
		};
		var TODAY_NEW_WINDOW_HOURS = 24;
		var JOB_NEW_WINDOWS = [
		  { value: "1d", label: "\u8FD1 24 \u5C0F\u65F6", hours: TODAY_NEW_WINDOW_HOURS },
		  { value: "3d", label: "\u8FD1 3 \u5929", hours: 72 },
		  { value: "7d", label: "\u8FD1 7 \u5929", hours: 168 }
		];

		// src/shared/contract/enums/pipeline.ts
		var CONTACT_STAGE_LABEL = {
		  none: "\u672A\u63A5\u89E6",
		  greeted: "\u5DF2\u6253\u62DB\u547C",
		  delivered: "\u5DF2\u9001\u8FBE",
		  read: "HR \u5DF2\u8BFB",
		  replied: "HR \u5DF2\u56DE\u590D",
		  interview_scheduled: "\u5DF2\u7EA6\u9762"
		};
		var MANUAL_CONTACT_STAGES = ["greeted", "delivered", "read", "replied", "interview_scheduled"];
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

		// src/shared/text/time-format.ts
		function pad(value) {
		  return String(value).padStart(2, "0");
		}
		function formatClock(date) {
		  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		function formatDay(date) {
		  return `${String(date.getMonth() + 1)}\u6708${String(date.getDate())}\u65E5`;
		}
		function isSameDay(a, b) {
		  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
		function formatLocalMoment(iso, now, options = {}) {
		  if (iso === null || iso === "") return null;
		  const date = new Date(iso);
		  if (Number.isNaN(date.getTime())) {
		    return iso;
		  }
		  const day = isSameDay(date, now) ? "\u4ECA\u5929" : isSameDay(new Date(now.getTime() + 24 * 60 * 60 * 1e3), date) ? "\u660E\u5929" : isSameDay(new Date(now.getTime() - 24 * 60 * 60 * 1e3), date) ? "\u6628\u5929" : formatDay(date);
		  const absolute = `${day} ${formatClock(date)}`;
		  return options.withRelative === false ? absolute : `${absolute} \xB7 ${formatRelative(date, now)}`;
		}
		function formatLocalDateTime(iso, now = /* @__PURE__ */ new Date()) {
		  const at = new Date(iso);
		  if (Number.isNaN(at.getTime())) return iso;
		  const date = `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${formatClock(at)}`;
		  return at.getFullYear() === now.getFullYear() ? date : `${String(at.getFullYear())}-${date}`;
		}
		function formatDuration(ms) {
		  if (!Number.isFinite(ms) || ms < 0) return null;
		  const seconds = Math.round(ms / 1e3);
		  if (seconds < 60) return `${String(seconds)} \u79D2`;
		  const minutes = Math.floor(seconds / 60);
		  if (minutes < 60) {
		    const rest2 = seconds % 60;
		    return rest2 === 0 ? `${String(minutes)} \u5206` : `${String(minutes)} \u5206 ${String(rest2)} \u79D2`;
		  }
		  const hours = Math.floor(minutes / 60);
		  const rest = minutes % 60;
		  return rest === 0 ? `${String(hours)} \u5C0F\u65F6` : `${String(hours)} \u5C0F\u65F6 ${String(rest)} \u5206`;
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
		function parseClockWindow(raw) {
		  const matched = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(raw.trim());
		  if (matched === null) return null;
		  const startHour = Number(matched[1]);
		  const startMinute = Number(matched[2]);
		  const endHour = Number(matched[3]);
		  const endMinute = Number(matched[4]);
		  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;
		  return { startHour, startMinute, endHour, endMinute };
		}
		function parseWindow(raw) {
		  const window2 = parseClockWindow(raw);
		  if (window2 === null) return null;
		  return {
		    start: formatHourMinute(window2.startHour, window2.startMinute),
		    end: formatHourMinute(window2.endHour, window2.endMinute)
		  };
		}
		var WEEKDAY_PRESETS = [
		  { key: "workdays", label: "\u5DE5\u4F5C\u65E5", days: [1, 2, 3, 4, 5] },
		  { key: "weekend", label: "\u5468\u672B", days: [0, 6] },
		  { key: "all", label: "\u6BCF\u5929", days: [0, 1, 2, 3, 4, 5, 6] },
		  { key: "none", label: "\u6E05\u7A7A", days: [] }
		];

		// src/client/format/job.ts
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
		function relativeTime(iso, now = /* @__PURE__ */ new Date()) {
		  const at = new Date(iso);
		  if (Number.isNaN(at.getTime())) return null;
		  const minutes = Math.floor((now.getTime() - at.getTime()) / 6e4);
		  if (minutes < 1) return "\u521A\u521A";
		  if (minutes < 60) return `${String(minutes)} \u5206\u949F\u524D`;
		  const hours = Math.floor(minutes / 60);
		  if (hours < 24) return `${String(hours)} \u5C0F\u65F6\u524D`;
		  const days = Math.floor(hours / 24);
		  if (days <= 30) return `${String(days)} \u5929\u524D`;
		  return iso.slice(0, 10);
		}
		function jobProgressBadgeOf(job) {
		  if (job.applicationStage !== null) {
		    const stage = job.applicationStage;
		    return {
		      source: "application",
		      label: APPLICATION_STAGE_LABEL[stage],
		      variant: (
		        // 已拒绝 / 无回复 = 这条走到头了（终态），用最安静的一档
		        stage === "rejected" || stage === "no_reply" ? "closed" : stage === "sent" || stage === "viewed" ? "progress" : "ok"
		      )
		    };
		  }
		  if (job.contactStage !== "none") {
		    const stage = job.contactStage;
		    return {
		      source: "contact",
		      label: CONTACT_STAGE_LABEL[stage],
		      // "已打招呼 / 已送达 / HR 已读"都还只是"发出去了"；**回**才算有回音。
		      variant: stage === "replied" || stage === "interview_scheduled" ? "ok" : "progress"
		    };
		  }
		  return {
		    source: "state",
		    label: JOB_STATE_LABEL[job.state],
		    // 处置态的类名与取值同名（.jh-state-new / -saved / -ignored / -archived），
		    // 只有 `seen` 没有专属配色（它是最中性的"什么都没有"）→ 落到基类。
		    variant: job.state === "seen" ? "" : job.state
		  };
		}
		function jobFreshnessOf(iso, now = /* @__PURE__ */ new Date()) {
		  const at = new Date(iso);
		  if (Number.isNaN(at.getTime())) return null;
		  const hours = Math.max(0, (now.getTime() - at.getTime()) / 36e5);
		  const level = hours <= JOB_FRESHNESS_FRESH_DAYS * 24 ? "fresh" : hours <= JOB_FRESHNESS_COLD_DAYS * 24 ? "stale" : "cold";
		  return { level, label: JOB_FRESHNESS_LABEL[level], hours: Math.floor(hours) };
		}
		function jobsToMarkdown(jobs, now = /* @__PURE__ */ new Date()) {
		  const header = ["\u516C\u53F8", "\u5C97\u4F4D", "\u85AA\u8D44", "\u57CE\u5E02", "\u5E73\u53F0", "\u72B6\u6001", "\u6700\u8FD1\u89C1\u5230", "\u539F\u94FE\u63A5"];
		  const cell = (value) => value.replace(/\|/g, "/").replace(/\r?\n/g, " ");
		  const rows = jobs.map(
		    (job) => [
		      job.companyName ?? "",
		      job.title,
		      job.salaryRaw,
		      job.district === "" ? job.city : `${job.city}\xB7${job.district}`,
		      job.platformName ?? job.platformId,
		      JOB_STATE_LABEL[job.state],
		      formatLocalDateTime(job.lastSeenAt, now),
		      job.sourceUrl
		    ].map((value) => cell(String(value))).join(" | ")
		  );
		  return [
		    `| ${header.join(" | ")} |`,
		    `| ${header.map(() => "---").join(" | ")} |`,
		    ...rows.map((row) => `| ${row} |`)
		  ].join("\n");
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

		// src/client/hooks/use-async.ts
		var import_react4 = require("react");

		// src/client/net/client.ts
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
		var NeedsConfirmError = class extends Error {
		  constructor(confirmText) {
		    super("\u8FD9\u4E2A\u52A8\u4F5C\u9700\u8981\u4F60\u5148\u786E\u8BA4");
		    this.confirmText = confirmText;
		    this.name = "NeedsConfirmError";
		  }
		  code = "NEEDS_CONFIRM";
		};

		// src/client/hooks/use-async.ts
		function useAsync(loader, deps, options = {}) {
		  const [nonce, setNonce] = (0, import_react4.useState)(0);
		  const [state, setState] = (0, import_react4.useState)({ status: "loading" });
		  const [refreshing, setRefreshing] = (0, import_react4.useState)(false);
		  const stateRef = (0, import_react4.useRef)(state);
		  stateRef.current = state;
		  (0, import_react4.useEffect)(() => {
		    const controller = new AbortController();
		    const keep = options.keepPrevious === true && stateRef.current.status === "ok";
		    if (keep) setRefreshing(true);
		    else setState({ status: "loading" });
		    loader(controller.signal).then(
		      (data) => {
		        if (controller.signal.aborted) return;
		        setState({ status: "ok", data });
		        setRefreshing(false);
		      },
		      (error) => {
		        if (controller.signal.aborted) return;
		        setState({
		          status: "error",
		          message: error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error),
		          hint: error instanceof ApiError ? error.hint : void 0
		        });
		        setRefreshing(false);
		      }
		    );
		    return () => {
		      controller.abort();
		    };
		  }, [...deps, nonce]);
		  const reload = (0, import_react4.useCallback)(() => {
		    setNonce((value) => value + 1);
		  }, []);
		  return { state, reload, refreshing };
		}

		// src/client/net/jobs.ts
		async function fetchJobs(params, signal) {
		  const query = new URLSearchParams();
		  if (params.q !== void 0 && params.q !== "") query.set("q", params.q);
		  if (params.cities !== void 0 && params.cities.length > 0) query.set("cities", params.cities.join(","));
		  else if (params.city !== void 0 && params.city !== "") query.set("city", params.city);
		  if (params.state !== void 0 && params.state !== "") query.set("state", params.state);
		  if (params.minSalary !== void 0 && params.minSalary !== null) {
		    query.set("minSalary", String(params.minSalary));
		  }
		  if (params.minScore !== void 0 && params.minScore !== null) {
		    query.set("minScore", String(params.minScore));
		  }
		  if (params.expReqs !== void 0 && params.expReqs.length > 0) {
		    query.set("expReqs", params.expReqs.join(","));
		  }
		  if (params.eduReqs !== void 0 && params.eduReqs.length > 0) {
		    query.set("eduReqs", params.eduReqs.join(","));
		  }
		  if (params.excludeFlags !== void 0 && params.excludeFlags.length > 0) {
		    query.set("excludeFlags", params.excludeFlags.join(","));
		  }
		  if (params.excludeBlacklisted === true) query.set("excludeBlacklisted", "1");
		  if (params.groupDuplicates === true) query.set("groupDuplicates", "1");
		  if (params.firstSeenSince !== void 0 && params.firstSeenSince !== "") {
		    query.set("firstSeenSince", params.firstSeenSince);
		  }
		  if (params.orderBy !== void 0 && params.orderBy !== "") query.set("orderBy", params.orderBy);
		  query.set("desc", params.descending === false ? "0" : "1");
		  query.set("page", String(params.page ?? 1));
		  query.set("pageSize", String(params.pageSize ?? 20));
		  return await request(`/jobs?${query.toString()}`, signal === void 0 ? {} : { signal });
		}
		async function fetchJobFacets(signal) {
		  return await request("/jobs/facets", signal === void 0 ? {} : { signal });
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
		async function markJobs(ids, state) {
		  const result = await request("/jobs/batch/mark", {
		    method: "POST",
		    body: JSON.stringify({ ids, state })
		  });
		  return { total: result.total, missing: result.missing };
		}
		async function fetchJobViews(signal) {
		  return await request("/jobs/views", signal === void 0 ? {} : { signal });
		}
		async function saveJobViews(views) {
		  return await request("/jobs/views", { method: "PUT", body: JSON.stringify({ views }) });
		}
		function jobsExportUrl(ids) {
		  return `${ROUTE_PREFIX}/jobs/export?ids=${ids.join(",")}`;
		}
		async function recomputeStaleScores() {
		  return await request("/intel/recompute", {
		    method: "POST",
		    body: JSON.stringify({ scope: "stale" })
		  });
		}
		async function fetchJobHistory(jobId, signal) {
		  return await request(`/jobs/${String(jobId)}/history`, signal === void 0 ? {} : { signal });
		}

		// src/client/net/outreach.ts
		async function draftGreeting(jobId, input = {}) {
		  const result = await request(
		    `/jobs/${String(jobId)}/greeting/draft`,
		    { method: "POST", body: JSON.stringify(input) }
		  );
		  return result.draft;
		}
		async function previewGreetingBatch(jobIds) {
		  const result = await request(
		    "/greeting/send-batch/preview",
		    { method: "POST", body: JSON.stringify({ jobIds }) }
		  );
		  return result.plan;
		}
		async function sendGreetingBatch(items) {
		  const result = await request("/greeting/send-batch", {
		    method: "POST",
		    body: JSON.stringify({ confirm: true, items })
		  });
		  return result.result;
		}
		async function probeContactStage(jobId) {
		  const result = await request(`/jobs/${String(jobId)}/detect-stage`, { method: "POST", body: JSON.stringify({}) });
		  return result.result;
		}
		async function fetchFollowUps(signal) {
		  return await request("/followups", signal === void 0 ? {} : { signal });
		}
		async function fetchGreetings(params = {}, signal) {
		  const query = new URLSearchParams();
		  if (params.jobId !== void 0) query.set("jobId", String(params.jobId));
		  if (params.stage !== void 0) query.set("stage", params.stage);
		  if (params.limit !== void 0) query.set("limit", String(params.limit));
		  const suffix = query.size === 0 ? "" : `?${query.toString()}`;
		  return await request(`/greetings${suffix}`, signal === void 0 ? {} : { signal });
		}
		async function updateContactStage(jobId, input) {
		  return await request(`/jobs/${String(jobId)}/contact-stage`, {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		}

		// src/client/net/pipeline.ts
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
		async function deliverApplication(input) {
		  try {
		    const result = await request("/applications/deliver", { method: "POST", body: JSON.stringify(input) });
		    return result.result;
		  } catch (error) {
		    if (error instanceof ApiError && error.code === "NEEDS_CONFIRM") {
		      const body = error.body;
		      const record = body !== null && typeof body === "object" ? body : {};
		      const text = typeof record["confirmText"] === "string" ? record["confirmText"] : error.message;
		      throw new NeedsConfirmError(text);
		    }
		    throw error;
		  }
		}
		async function previewApplicationBatch(jobIds, resumeFileId) {
		  const result = await request(
		    "/applications/deliver-batch/preview",
		    { method: "POST", body: JSON.stringify({ jobIds, resumeFileId }) }
		  );
		  return result.plan;
		}
		async function sendApplicationBatch(jobIds, resumeFileId) {
		  const result = await request(
		    "/applications/deliver-batch",
		    { method: "POST", body: JSON.stringify({ confirm: true, jobIds, resumeFileId }) }
		  );
		  return result.result;
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

		// src/client/views/job-detail/tailor-panel.tsx
		var import_react5 = require("react");

		// src/client/net/resumes.ts
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

		// src/client/ui/inline-md.tsx
		var import_jsx_runtime4 = require("react/jsx-runtime");
		function InlineMd(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_jsx_runtime4.Fragment, { children: parseInline(props.text) });
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
		      nodes.push(/* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: bold }, `b${String(index)}`));
		    } else if (code !== void 0) {
		      nodes.push(
		        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { className: "jh-inline-code", children: code }, `c${String(index)}`)
		      );
		    }
		    index += 1;
		    cursor = match.index + match[0].length;
		    match = pattern.exec(text);
		  }
		  if (cursor < text.length) nodes.push(text.slice(cursor));
		  return nodes;
		}

		// src/client/views/job-detail/tailor-panel.tsx
		var import_jsx_runtime5 = require("react/jsx-runtime");
		function TailorPanel(props) {
		  const [items, setItems] = (0, import_react5.useState)([]);
		  const [busy, setBusy] = (0, import_react5.useState)(null);
		  const [error, setError] = (0, import_react5.useState)(null);
		  const [notice, setNotice] = (0, import_react5.useState)(null);
		  const [copied, setCopied] = (0, import_react5.useState)(false);
		  const reload = (0, import_react5.useCallback)(async () => {
		    try {
		      const result = await fetchTailorings({ jobId: props.jobId, limit: 5 });
		      setItems(result.items);
		    } catch {
		      setItems([]);
		    }
		  }, [props.jobId]);
		  (0, import_react5.useEffect)(() => {
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
		  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "jh-tailor", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { className: "jh-card-title", children: "\u7B80\u5386\u5B9A\u5236" }),
		    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-detail-actions", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		      latest === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-ok", children: notice }),
		    busy === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-muted", children: [
		      busy,
		      "\u2026"
		    ] }),
		    latest === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(InlineMd, { text: "\u8FD8\u6CA1\u6709\u9488\u5BF9\u8FD9\u4E2A\u5C97\u4F4D\u7684\u5B9A\u5236\u5EFA\u8BAE\u3002\u5B9A\u5236\u53EA\u6539**\u987A\u5E8F\u4E0E\u63AA\u8F9E**\uFF0C\u4E0D\u4F1A\u65B0\u589E\u4EFB\u4F55\u4F60\u6CA1\u5199\u8FC7\u7684\u7ECF\u5386\u3002" }) }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-muted", children: [
		        "\u6700\u65B0\u5EFA\u8BAE #",
		        latest.id,
		        "\uFF08\u6765\u6E90\uFF1A",
		        latest.via === "llm" ? "\u6A21\u578B" : "\u89C4\u5219",
		        "\uFF09",
		        latest.adopted ? " \xB7 \u5DF2\u91C7\u7528" : "",
		        latest.createdAt === "" ? "" : ` \xB7 ${latest.createdAt.slice(0, 16).replace("T", " ")}`
		      ] }),
		      latest.notes.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "jh-tailor-notes", children: latest.notes.map((note, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
		        "\xB7 ",
		        note
		      ] }, String(index))) }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "jh-muted", children: [
		        "\u8C03\u6574\u540E\u7684\u6280\u80FD\u987A\u5E8F\uFF1A",
		        latest.content.skills.slice(0, 12).map((skill) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "jh-tailor-skill", children: skill.name }, skill.name))
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "jh-detail-actions", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void copySuggestions(),
		            children: copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u5EFA\u8BAE"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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

		// src/client/ui/async-view.tsx
		var import_jsx_runtime6 = require("react/jsx-runtime");
		function LoadingLine(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		    "p",
		    {
		      className: props.className ?? "jh-muted",
		      "aria-busy": props.busy === true ? true : void 0,
		      "aria-live": props.live,
		      children: props.children
		    }
		  );
		}
		function ErrorLine(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: props.className ?? "jh-error", role: props.role, children: props.children });
		}

		// src/shared/contract/enums/overseas.ts
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

		// src/client/net/overseas.ts
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
		async function fetchEnglishCheck(resumeId, signal) {
		  return await request(`/resumes/${String(resumeId)}/english-check`, signal === void 0 ? {} : { signal });
		}
		async function draftCoverLetter(input) {
		  const result = await request("/cover-letters", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.coverLetter;
		}

		// src/client/ui/clipboard.ts
		async function copyText(text) {
		  try {
		    await navigator.clipboard.writeText(text);
		    return true;
		  } catch {
		  }
		  try {
		    const area = document.createElement("textarea");
		    area.value = text;
		    area.setAttribute("readonly", "");
		    area.style.position = "fixed";
		    area.style.top = "-1000px";
		    area.style.opacity = "0";
		    document.body.appendChild(area);
		    area.select();
		    const ok = document.execCommand("copy");
		    document.body.removeChild(area);
		    return ok;
		  } catch {
		    return false;
		  }
		}

		// src/client/views/job-detail/overseas-panel.tsx
		var import_react6 = require("react");
		var import_jsx_runtime7 = require("react/jsx-runtime");
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
		function OverseasPanel(props) {
		  const [busy, setBusy] = (0, import_react6.useState)(false);
		  const [error, setError] = (0, import_react6.useState)(null);
		  const [analysis, setAnalysis] = (0, import_react6.useState)(null);
		  const [letter, setLetter] = (0, import_react6.useState)(null);
		  const [letterCopied, setLetterCopied] = (0, import_react6.useState)(false);
		  const [tz, setTz] = (0, import_react6.useState)("America/New_York");
		  const [interviewAt, setInterviewAt] = (0, import_react6.useState)("");
		  const [display, setDisplay] = (0, import_react6.useState)(null);
		  const run = async (fn, onDone, mutates = true) => {
		    setBusy(true);
		    setError(null);
		    try {
		      onDone(await fn());
		      if (mutates) props.onChanged();
		    } catch (caught) {
		      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught));
		    } finally {
		      setBusy(false);
		    }
		  };
		  const copyLetter = async () => {
		    if (letter === null) return;
		    setLetterCopied(await copyText(letter));
		    window.setTimeout(() => setLetterCopied(false), 2e3);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "jh-tailor", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { className: "jh-card-title", children: "\u6D77\u5916 / \u8FDC\u7A0B" }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-detail-actions", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-error", children: error }),
		    analysis === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-muted", children: [
		        "\u5DE5\u7B7E\u7ACB\u573A\uFF1A",
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: VISA_STANCE_LABEL[analysis.stance] ?? analysis.stance }),
		        "\uFF5C\u5DE5\u4F5C\u6A21\u5F0F\uFF1A",
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: REMOTE_KIND_LABEL[analysis.remoteKind] ?? analysis.remoteKind })
		      ] }),
		      analysis.evidence.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-muted", children: [
		        "\u4F9D\u636E\uFF1A",
		        analysis.evidence.join("\u3001")
		      ] }),
		      analysis.uncertainty === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-warn", children: analysis.uncertainty })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "jh-muted", children: "\u9762\u8BD5\u65F6\u95F4\u53CC\u91CD\u6362\u7B97\uFF08\u7B97\u9519\u65F6\u533A = \u76F4\u63A5\u9519\u8FC7\u9762\u8BD5\uFF09\uFF1A" }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            value: interviewAt,
		            onChange: (event) => setInterviewAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
		          "select",
		          {
		            className: "jh-select jh-input-sm",
		            "aria-label": "\u5E38\u7528\u57CE\u5E02\u65F6\u533A\u9884\u8BBE",
		            value: TZ_PRESETS.some((p) => p.tz === tz) ? tz : "",
		            onChange: (event) => setTz(event.target.value),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "", children: "\u9009\u5E38\u7528\u57CE\u5E02\u2026" }),
		              TZ_PRESETS.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: preset.tz, children: preset.label }, preset.tz))
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { className: "jh-input", value: tz, onChange: (event) => setTz(event.target.value), placeholder: "America/New_York", "aria-label": "\u65F6\u533A\uFF08IANA\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
		              },
		              false
		            ),
		            children: "\u6362\u7B97"
		          }
		        )
		      ] }),
		      display === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "jh-muted", children: [
		        "\u5BF9\u65B9 ",
		        display.counterpart,
		        "\uFF5C\u672C\u5730 ",
		        display.local,
		        "\uFF5C\u65F6\u5DEE ",
		        display.diffHours,
		        " \u5C0F\u65F6",
		        display.warning === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("b", { className: "jh-warn", children: [
		          " \u26A0 ",
		          display.warning
		        ] })
		      ] })
		    ] }),
		    letter === null ? null : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "jh-tv-draft", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "jh-copy-head", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-tiny",
		          onClick: () => void copyLetter(),
		          children: letterCopied ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u5168\u6587"
		        }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("pre", { className: "jh-tv-pre", children: letter })
		    ] })
		  ] });
		}

		// src/client/views/resume-file-picker.tsx
		var import_jsx_runtime8 = require("react/jsx-runtime");
		function ResumeFilePicker(props) {
		  const resumes = useAsync((signal) => fetchResumes(signal), []);
		  if (resumes.state.status === "loading") {
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u7B80\u5386\u2026" });
		  }
		  if (resumes.state.status === "error") {
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "jh-error", children: [
		      "\u8BFB\u53D6\u7B80\u5386\u5931\u8D25\uFF1A",
		      resumes.state.message
		    ] });
		  }
		  const options = resumes.state.data.items.flatMap(
		    (resume) => resume.files.map((file) => ({
		      id: file.id,
		      label: `${resume.name} \xB7 ${file.fileName}${resume.isDefault ? "\uFF08\u5F53\u524D\u9ED8\u8BA4\u7248\u672C\uFF09" : ""}`
		    }))
		  );
		  if (options.length === 0) {
		    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u7B80\u5386\u9644\u4EF6 \u2014\u2014 \u5230\u300C\u7B80\u5386\u300D\u9875\u5BFC\u51FA PDF / Word \u4E4B\u540E\uFF0C\u624D\u80FD\u5728\u8FD9\u91CC\u6307\u5B9A\u7528\u54EA\u4E00\u4EFD\u3002" });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
		    "select",
		    {
		      className: "jh-select",
		      value: props.value === null ? "" : String(props.value),
		      disabled: props.disabled === true,
		      "aria-label": "\u7528\u54EA\u4EFD\u7B80\u5386",
		      title: "\u9009\u7684\u662F\u8FD9\u6B21\u6295\u9012\u5728\u4F60\u7684\u8BB0\u5F55\u91CC\u5F52\u5230\u54EA\u4E00\u7248\uFF08\u9644\u4EF6 id\uFF09\u3002\u5E73\u53F0\u4FA7\u7528\u7684\u662F\u5B83\u81EA\u5DF1\u90A3\u4EFD\u7B80\u5386 \u2014\u2014 \u80FD\u4E0D\u80FD\u628A\u672C\u5730\u6587\u4EF6\u771F\u7684\u4F20\u4E0A\u53BB\uFF0C\u89C1\u4E0B\u9762\u7684\u8BF4\u660E\u3002",
		      onChange: (event) => {
		        props.onChange(event.target.value === "" ? null : Number(event.target.value));
		      },
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "", children: "\u5E73\u53F0\u5185\u7B80\u5386\uFF08\u4E0D\u767B\u8BB0\u7248\u672C\uFF09" }),
		        options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: option.id, children: option.label }, option.id))
		      ]
		    }
		  );
		}

		// src/client/ui/field-hint.tsx
		var import_react7 = require("react");
		var import_jsx_runtime9 = require("react/jsx-runtime");
		function FieldHint(props) {
		  const [open, setOpen] = (0, import_react7.useState)(false);
		  const textId = (0, import_react7.useId)();
		  const inline = props.variant === "inline";
		  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "jh-hint-wrap", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
		      "button",
		      {
		        type: "button",
		        className: inline ? "jh-hint" : "jh-field-hint",
		        "aria-label": "\u67E5\u770B\u8BF4\u660E",
		        "aria-expanded": open,
		        "aria-controls": textId,
		        title: plainTitle(props.text),
		        onClick: () => setOpen((value) => !value),
		        children: "?"
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { id: textId, role: "note", className: open ? "jh-hint-text" : "jh-sr-only", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(InlineMd, { text: props.text }) })
		  ] });
		}
		function plainTitle(text) {
		  return text.replaceAll("**", "");
		}

		// src/client/ui/modal.tsx
		var import_react8 = require("react");
		var import_jsx_runtime10 = require("react/jsx-runtime");
		function Modal(props) {
		  const dialogRef = (0, import_react8.useRef)(null);
		  useDialogA11y(dialogRef, props.onClose);
		  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "jh-modal-layer", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-modal-backdrop",
		        "aria-label": "\u5173\u95ED",
		        onClick: props.onClose
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("header", { className: "jh-modal-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "jh-modal-title", children: props.title }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "jh-icon-btn", "aria-label": "\u5173\u95ED", onClick: props.onClose, children: "\xD7" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "jh-modal-body", children: props.children }),
		          props.footer === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("footer", { className: "jh-modal-foot", children: props.footer })
		        ]
		      }
		    )
		  ] });
		}

		// src/client/views/job-detail/panels/apply-panel.tsx
		var import_jsx_runtime11 = require("react/jsx-runtime");
		function ApplyEntry(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		    "button",
		    {
		      type: "button",
		      className: "jh-btn jh-btn-inline",
		      disabled: props.delivering,
		      onClick: props.onOpen,
		      children: props.delivering ? "\u6295\u9012\u4E2D\u2026" : "\u6295\u9012\u7B80\u5386"
		    }
		  );
		}
		function ApplyModal(props) {
		  if (!props.open) return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		    Modal,
		    {
		      title: props.ask === null ? "\u6295\u9012\u7B80\u5386" : "\u786E\u8BA4\u6295\u9012\u7B80\u5386",
		      label: props.ask === null ? "\u6295\u9012\u7B80\u5386" : "\u786E\u8BA4\u6295\u9012\u7B80\u5386",
		      onClose: props.onClose,
		      footer: props.ask === null ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "jh-muted", children: "\u4E0B\u4E00\u6B65\u4F1A\u7ED9\u4F60\u770B\u786E\u8BA4\u6587\u6848\uFF08\u542B\u5E73\u53F0\u3001\u5C97\u4F4D\u4E0E\u7528\u4E86\u54EA\u7248\u7B80\u5386\uFF09\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            onClick: props.onCancel,
		            children: "\u53D6\u6D88"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-primary",
		            disabled: props.delivering,
		            onClick: props.onNext,
		            children: props.delivering ? "\u68C0\u67E5\u4E2D\u2026" : "\u4E0B\u4E00\u6B65"
		          }
		        )
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "jh-muted", children: "\u6295\u9012\u4E0D\u53EF\u9006\uFF0C\u5E73\u53F0\u4E00\u65E6\u6536\u5230\u5C31\u64A4\u4E0D\u56DE\u6765\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: props.delivering,
		            onClick: props.onBack,
		            children: "\u8FD4\u56DE\u6539\u7B80\u5386"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-primary",
		            disabled: props.delivering,
		            onClick: props.onConfirm,
		            children: props.delivering ? "\u6295\u9012\u4E2D\u2026" : "\u786E\u8BA4\u6295\u9012"
		          }
		        )
		      ] }),
		      children: props.ask === null ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "jh-ctl", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "jh-field-label", children: [
		            "\u7528\u54EA\u4EFD\u7B80\u5386",
		            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(FieldHint, { text: "**\u5E73\u53F0\u4E0A\u6536\u5230\u7684**\u662F\u5E73\u53F0\u81EA\u5DF1\u90A3\u4EFD\u7B80\u5386\uFF08\u5E73\u53F0\u6CA1\u6709\u628A\u672C\u5730\u6587\u4EF6\u53D1\u7ED9 HR \u7684\u5165\u53E3\uFF0C\u6211\u4EEC\u6539\u4E0D\u4E86\u5B83\uFF09\u3002\u8FD9\u91CC\u9009\u7684\u662F**\u8FD9\u6B21\u6295\u9012\u5728\u4F60\u7684\u8BB0\u5F55\u91CC\u5F52\u5230\u54EA\u4E00\u7248** \u2014\u2014\u300C\u54EA\u7248\u56DE\u590D\u7387\u9AD8\u300D\u8FD9\u7C7B\u5BF9\u6BD4\u8981\u9760\u5B83\uFF0C\u6240\u4EE5\u9009\u5F97\u51C6\u4E00\u70B9\u66F4\u6709\u7528\u3002\u4E0D\u9009\u5C31\u4E0D\u767B\u8BB0\u7248\u672C\u3002" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
		            ResumeFilePicker,
		            {
		              value: props.resumeId,
		              disabled: props.delivering,
		              onChange: props.onResumeChange
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "jh-muted", children: '\u4E0B\u4E00\u6B65\u7684\u786E\u8BA4\u6587\u6848\u91CC\u4F1A\u5199\u6E05"\u8FD9\u4EFD\u6587\u4EF6\u5230\u5E95\u4F1A\u4E0D\u4F1A\u4F20\u4E0A\u53BB"\uFF0C\u4EE5\u53CA\u5E73\u53F0\u81EA\u5DF1\u8FD8\u4F1A\u505A\u4EC0\u4E48 \uFF08\u4F8B\u5982\u667A\u8054\u6295\u9012\u4F1A\u987A\u5E26\u66FF\u4F60\u53D1\u4E00\u53E5\u62DB\u547C\u8BED\uFF09\u3002' })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("pre", { className: "jh-approval", children: props.ask })
		    }
		  );
		}

		// src/client/net/companies.ts
		async function fetchCompanyDetail(companyId, signal) {
		  return await request(
		    `/companies/${String(companyId)}`,
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function updateCompanyReview(companyId, patch) {
		  await request(`/companies/${String(companyId)}`, {
		    method: "PATCH",
		    body: JSON.stringify(patch)
		  });
		}

		// src/client/views/job-detail/company-jobs.tsx
		var import_jsx_runtime12 = require("react/jsx-runtime");
		function CompanyJobs(props) {
		  const { state } = useAsync(
		    (signal) => fetchCompanyDetail(props.companyId, signal),
		    [props.companyId]
		  );
		  if (state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(LoadingLine, { className: "jh-note", children: "\u6B63\u5728\u8BFB\u53D6\u8BE5\u516C\u53F8\u7684\u5176\u5B83\u5C97\u4F4D\u2026" });
		  if (state.status === "error") return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(ErrorLine, { className: "jh-note", children: [
		    "\u8BFB\u53D6\u8BE5\u516C\u53F8\u5C97\u4F4D\u5931\u8D25\uFF1A",
		    state.message
		  ] });
		  const others = state.data.jobs.filter((job) => job.id !== props.currentJobId);
		  if (others.length === 0) {
		    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "jh-note", children: "\u9664\u5F53\u524D\u8FD9\u4E2A\u5C97\u4F4D\u5916\uFF0C\u8FD9\u5BB6\u516C\u53F8\u5728\u4F60\u5E93\u91CC\u6CA1\u6709\u5176\u5B83\u5728\u62DB\u5C97\u4F4D\u3002" });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "jh-siblings", children: others.map((job) => {
		      const requirements = [job.expReq, job.eduReq].filter((item) => item !== "").join("\xB7");
		      const meta = [job.city, requirements, job.salaryRaw].filter((item) => item !== "").join("\uFF5C");
		      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { children: props.onSelect === void 0 ? (
		        // 抽屉场景（流水线/消息/面试）没有"切换岗位"的上下文 ——
		        // 那时渲染成纯文本，而不是一个点了没反应的按钮。
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "jh-sibling jh-sibling-static", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: job.title }),
		          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "jh-sibling-meta", children: meta })
		        ] })
		      ) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("button", { type: "button", className: "jh-sibling", onClick: () => props.onSelect?.(job.id), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: job.title }),
		        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "jh-sibling-meta", children: meta })
		      ] }) }, job.id);
		    }) }),
		    props.jobCount > state.data.jobs.length ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { className: "jh-note", children: [
		      "\u8BE5\u516C\u53F8\u5171 ",
		      props.jobCount,
		      " \u4E2A\u5C97\u4F4D\uFF0C\u8FD9\u91CC\u53EA\u5217\u51FA\u6700\u8FD1\u66F4\u65B0\u7684 ",
		      state.data.jobs.length,
		      " \u6761\u3002"
		    ] }) : null
		  ] });
		}

		// src/client/views/job-detail/panels/company-jobs-panel.tsx
		var import_jsx_runtime13 = require("react/jsx-runtime");
		function CompanyJobsPanel(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h3", { className: "jh-card-title", children: "\u8FD9\u5BB6\u516C\u53F8\u7684\u5176\u5B83\u5C97\u4F4D" }),
		    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
		      CompanyJobs,
		      {
		        companyId: props.companyId,
		        jobCount: props.jobCount,
		        currentJobId: props.currentJobId,
		        onSelect: props.onSelect
		      }
		    )
		  ] });
		}

		// src/client/views/job-detail/company-review.tsx
		var import_react9 = require("react");
		var import_jsx_runtime14 = require("react/jsx-runtime");
		function CompanyReview(props) {
		  const [label, setLabel] = (0, import_react9.useState)(props.company.manualLabel ?? "");
		  const [blacklisted, setBlacklisted] = (0, import_react9.useState)(props.company.blacklisted);
		  const [note, setNote] = (0, import_react9.useState)(props.company.note ?? "");
		  const [busy, setBusy] = (0, import_react9.useState)(false);
		  const [failure, setFailure] = (0, import_react9.useState)(null);
		  const save = async (event) => {
		    event.preventDefault();
		    setBusy(true);
		    setFailure(null);
		    try {
		      const trimmed = label.trim();
		      const trimmedNote = note.trim();
		      await updateCompanyReview(props.company.id, {
		        blacklisted,
		        // 空串 = 清除标签（后端把空串收敛成 null，不会存一个空标签）
		        manualLabel: trimmed === "" ? null : trimmed,
		        note: trimmedNote === "" ? null : trimmedNote
		      });
		      props.onSaved();
		    } catch (error) {
		      setFailure(error instanceof ApiError ? error.display : String(error));
		    } finally {
		      setBusy(false);
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("form", { className: "jh-review", onSubmit: (event) => void save(event), children: [
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "jh-review-field", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u4EBA\u5DE5\u6807\u7B7E" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        "input",
		        {
		          className: "jh-input jh-input-sm",
		          value: label,
		          maxLength: 40,
		          placeholder: "\u5982\uFF1A\u5916\u5305 / \u5DF2\u6295\u8FC7",
		          onChange: (event) => {
		            setLabel(event.target.value);
		          }
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "jh-review-field", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u5907\u6CE8" }),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        "input",
		        {
		          className: "jh-input jh-input-sm",
		          value: note,
		          maxLength: 200,
		          placeholder: "\u5982\uFF1A\u540C\u4E00\u5C97\u4F4D\u53CD\u590D\u91CD\u53D1",
		          onChange: (event) => {
		            setNote(event.target.value);
		          }
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("label", { className: "jh-check", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
		        "input",
		        {
		          type: "checkbox",
		          checked: blacklisted,
		          onChange: (event) => {
		            setBlacklisted(event.target.checked);
		          }
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u62C9\u9ED1\u8BE5\u516C\u53F8" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "submit", className: "jh-btn jh-btn-inline", disabled: busy, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u590D\u6838" }),
		    failure === null ? null : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "jh-error", children: failure })
		  ] });
		}

		// src/client/views/job-detail/panels/company-panel.tsx
		var import_jsx_runtime15 = require("react/jsx-runtime");
		function CompanyPanel(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { className: "jh-card-title", children: "\u516C\u53F8\u753B\u50CF" }),
		    props.company.blacklisted ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "jh-alert jh-alert-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "jh-alert-title", children: "\u8FD9\u5BB6\u516C\u53F8\u88AB\u4F60\u6807\u8BB0\u4E3A\u300C\u62C9\u9ED1\u300D" }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "jh-alert-body", children: [
		        "\u5C97\u4F4D\u5E93\u9ED8\u8BA4\u4E0D\u518D\u663E\u793A\u8FD9\u5BB6\u516C\u53F8\u7684\u5C97\u4F4D\uFF08\u7B5B\u9009\u91CC\u7684\u300C\u6392\u9664\u5DF2\u62C9\u9ED1\u516C\u53F8\u7684\u5C97\u4F4D\u300D\u9ED8\u8BA4\u5F00\u7740\uFF09\u3002 \u88AB\u9690\u85CF\u4E86\u51E0\u6761\u4F1A\u5199\u5728\u5217\u8868\u5934\u680F\uFF0C\u70B9\u90A3\u91CC\u5C31\u80FD\u663E\u793A\u56DE\u6765\u3002",
		        props.company.note === null ? "" : `\u5907\u6CE8\uFF1A${props.company.note}`
		      ] })
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("ul", { className: "jh-kv", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5F52\u4E00\u5316\u540D" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("code", { children: props.company.nameNorm })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u884C\u4E1A" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.industry ?? "\u2014" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u6027\u8D28" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.nature ?? "\u2014" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u89C4\u6A21" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.size ?? "\u2014" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5728\u624B\u5C97\u4F4D" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.jobCount })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u6280\u672F\u6808\u5E7F\u5EA6" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.stackDiversity })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5730\u57DF\u8DE8\u5EA6" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.geoSpread })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u9A7B\u573A\u6BD4\u4F8B" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.onsiteRatio === null ? "\u2014" : `${String(Math.round(props.company.onsiteRatio * 100))}%` })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u540D\u79F0\u5173\u952E\u8BCD" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.nameKeywordHits })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5916\u5305\u5206 / \u8BC8\u9A97\u5206" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { children: [
		          String(props.company.outsourcingScore ?? 0),
		          " / ",
		          String(props.company.fraudScore ?? 0)
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u62C9\u9ED1" }),
		        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: props.company.blacklisted ? "\u5DF2\u62C9\u9ED1" : "\u5426" })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "jh-note", children: "\u51B7\u542F\u52A8\u65F6\u7EDF\u8BA1\u4FE1\u53F7\u5F31\uFF08D-16\uFF09\uFF1A\u5C97\u4F4D\u8D8A\u591A\u5224\u65AD\u8D8A\u51C6\uFF0C\u4F9D\u636E\u4E0D\u8DB3\u65F6\u8FD9\u4E9B\u6570\u5B57\u4F1A\u504F\u4F4E\u3002" }),
		    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(CompanyReview, { company: props.company, onSaved: props.onSaved }, props.company.id)
		  ] });
		}

		// src/client/views/job-detail/jd-text.tsx
		var import_react10 = require("react");
		var import_jsx_runtime16 = require("react/jsx-runtime");
		var JD_PREVIEW_CHARS = 320;
		function JdText(props) {
		  const [expanded, setExpanded] = (0, import_react10.useState)(false);
		  const long = props.text.length > JD_PREVIEW_CHARS;
		  const shown = long && !expanded ? `${props.text.slice(0, JD_PREVIEW_CHARS)}\u2026` : props.text;
		  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "jh-jd", children: shown }),
		    long ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-btn jh-btn-inline",
		        "aria-expanded": expanded,
		        onClick: () => {
		          setExpanded(!expanded);
		        },
		        children: expanded ? "\u6536\u8D77\u539F\u6587" : `\u5C55\u5F00\u5168\u6587\uFF08\u5171 ${String(props.text.length)} \u5B57\uFF09`
		      }
		    ) : null
		  ] });
		}

		// src/client/views/job-detail/panels/jd-panel.tsx
		var import_jsx_runtime17 = require("react/jsx-runtime");
		function JdPanel(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h3", { className: "jh-card-title", children: "\u5C97\u4F4D\u63CF\u8FF0" }),
		    props.jdText === null ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "jh-note", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(InlineMd, { text: "**\u6CA1\u6709\u6293\u5230 JD \u539F\u6587** \u2014\u2014 \u8BE5\u5E73\u53F0\u672A\u63D0\u4F9B\u8BE6\u60C5\u9875\u89E3\u6790\uFF0C\u6216\u6293\u53D6\u65F6\u8BE6\u60C5\u9875\u6CA1\u6253\u5F00\u3002\u53EF\u4EE5\u70B9\u6700\u4E0B\u9762\u7684\u539F\u7AD9\u94FE\u63A5\u81EA\u5DF1\u770B\u3002" }) }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(JdText, { text: props.jdText })
		  ] });
		}

		// src/client/views/job-detail/gauge.tsx
		var import_jsx_runtime18 = require("react/jsx-runtime");
		function Gauge(props) {
		  const clamped = Math.max(0, Math.min(100, Math.round(props.score)));
		  const band = clamped >= 70 ? "high" : clamped >= 45 ? "mid" : "low";
		  const radius = 30;
		  const circumference = 2 * Math.PI * radius;
		  const filled = clamped / 100 * circumference;
		  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: `jh-gauge jh-gauge-${band}`, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("svg", { width: "72", height: "72", viewBox: "0 0 72 72", "aria-hidden": "true", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("circle", { className: "jh-gauge-track", cx: "36", cy: "36", r: radius, fill: "none", strokeWidth: "7" }),
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "jh-gauge-num", children: [
		      clamped,
		      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "jh-gauge-unit", children: "\u7C97\u7B5B\u5206" })
		    ] })
		  ] });
		}

		// src/client/views/job-detail/panels/match-panel.tsx
		var import_jsx_runtime19 = require("react/jsx-runtime");
		function MatchPanel(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("h3", { className: "jh-card-title", children: "L1 \u7C97\u7B5B\u5206" }),
		    props.score === null ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("p", { className: "jh-note", children: "\u8FD8\u6CA1\u6709\u7B97\u8FC7 \u2014\u2014 \u91C7\u96C6\u540E\u4F1A\u968F\u6807\u6CE8\u4E00\u8D77\u7B97\u51FA\u6765\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("div", { className: "jh-gauge-row", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Gauge, { score: props.score }),
		      /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("div", { className: "jh-gauge-side", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("span", { className: "jh-gauge-band", children: props.score >= 70 ? "\u672C\u8F6E\u89C4\u5219\u91CC\u9760\u524D" : props.score >= 45 ? "\u4E2D\u7B49" : "\u504F\u4F4E" }),
		        /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("p", { className: "jh-note", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(InlineMd, { text: "\u6309\u89C4\u5219\u7B97\u51FA\u6765\u7684**\u7C97\u7B5B\u5206**\uFF0C\u4E0B\u9762\u662F\u9010\u6761\u52A0\u51CF\u5206\u3002" }),
		          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
		            FieldHint,
		            {
		              variant: "inline",
		              text: "\u7EAF\u89C4\u5219\u6253\u5206\uFF08\u57CE\u5E02 / \u85AA\u8D44 / \u5173\u952E\u8BCD\u547D\u4E2D\u7387\uFF09\uFF0C\u5168\u91CF\u9002\u7528\u3001\u96F6\u6210\u672C\u3002\u8BED\u4E49\u7EA7\u7684\u7CBE\u8BC4\u8981\u7B49 L2\uFF0C\u6240\u4EE5\u8FD9\u91CC\u6807\u7684\u662F\u300C\u7C97\u7B5B\u5206\u300D\u800C\u4E0D\u662F\u300C\u5339\u914D\u5EA6\u300D\u3002"
		            }
		          )
		        ] })
		      ] })
		    ] }),
		    props.reasons.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("ul", { className: "jh-reasons", children: props.reasons.map((reason, index) => /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
		      "li",
		      {
		        className: `jh-reason jh-reason-${reason.kind}${reason.kind === "hit" ? " jh-reason-ok" : " jh-reason-bad"}`,
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("span", { className: "jh-reason-mark", children: reason.kind === "hit" ? "\u2713" : "\u2715" }),
		          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("span", { className: "jh-reason-weight", children: reason.weight > 0 ? `+${String(reason.weight)}` : reason.weight < 0 ? String(reason.weight) : "\xB7" }),
		          reason.text
		        ]
		      },
		      `${reason.kind}-${String(index)}`
		    )) })
		  ] });
		}

		// src/client/views/job-detail/panels/risk-panel.tsx
		var import_jsx_runtime20 = require("react/jsx-runtime");
		var FLAG_TONE = {
		  fraud: "error",
		  outsourcing: "warn",
		  salary_inflation: "warn",
		  zombie: "quiet",
		  jargon_hit: "quiet"
		};
		function RiskPanel(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("h3", { className: "jh-card-title", children: "\u6807\u6CE8\u4E0E\u4F9D\u636E" }),
		    props.flags.length === 0 ? (
		      // 刻意不刷成绿色：绿色等于宣布"这个岗位没问题"，而规则没命中只说明"没命中已知模式"。
		      /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "jh-alert jh-alert-quiet", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { className: "jh-alert-title", children: "\u6CA1\u6709\u547D\u4E2D\u4EFB\u4F55\u5DF2\u77E5\u98CE\u9669\u7279\u5F81" }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("p", { className: "jh-alert-body", children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(InlineMd, { text: "\u8FD9\u4E0D\u7B49\u4E8E\u300C\u6CA1\u95EE\u9898\u300D\u3002\u8BC6\u522B\u4F9D\u636E\u5206\u4E24\u5C42\uFF1A**\u6587\u672C\u5C42**\u6765\u81EA\u8BCD\u8868\u547D\u4E2D\u7684\u539F\u6587\u7247\u6BB5\uFF0C**\u7EDF\u8BA1\u5C42**\u6765\u81EA\u516C\u53F8\u7EF4\u5EA6\uFF08\u5C97\u4F4D\u6570\u3001\u5730\u57DF\u8DE8\u5EA6\u3001\u9A7B\u573A\u6BD4\u4F8B\uFF09\uFF1B\u4E24\u8005\u90FD\u6CA1\u6709\u547D\u4E2D\u65F6\uFF0C\u8FD9\u91CC\u662F\u7A7A\u7684\u3002" }) })
		      ] })
		    ) : /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(import_jsx_runtime20.Fragment, { children: [
		      props.flags.map((flag) => {
		        const tone = FLAG_TONE[flag.flagType] ?? "quiet";
		        return /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: `jh-alert jh-alert-${tone}`, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "jh-alert-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { className: `jh-flag jh-flag-${flag.flagType}`, children: JOB_FLAG_LABEL[flag.flagType] }),
		            /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("span", { className: "jh-alert-title", children: [
		              "\u5F3A\u5EA6 ",
		              flag.score
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("ul", { className: "jh-evidence", children: flag.evidence.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("li", { children: item }, `${flag.flagType}-${String(index)}`)) })
		        ] }, flag.flagType);
		      }),
		      /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("p", { className: "jh-note", children: [
		        "\u6BCF\u6761\u7ED3\u8BBA\u90FD\u9644\u539F\u6587\u6216\u7EDF\u8BA1\u4F9D\u636E\u3002",
		        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
		          FieldHint,
		          {
		            variant: "inline",
		            text: "\u8BC6\u522B\u4F9D\u636E\u5206\u4E24\u5C42\uFF1A\u6587\u672C\u5C42\u6765\u81EA\u8BCD\u8868\u547D\u4E2D\u7684\u539F\u6587\u7247\u6BB5\uFF0C\u7EDF\u8BA1\u5C42\u6765\u81EA\u516C\u53F8\u7EF4\u5EA6\uFF08\u5C97\u4F4D\u6570\u3001\u5730\u57DF\u8DE8\u5EA6\u3001\u9A7B\u573A\u6BD4\u4F8B\uFF09\u3002\u5F3A\u5EA6\u662F\u89C4\u5219\u6743\u91CD\uFF0C\u4E0D\u662F\u6982\u7387\u3002"
		          }
		        )
		      ] })
		    ] })
		  ] });
		}

		// src/client/views/job-detail/panels/summary-panel.tsx
		var import_jsx_runtime21 = require("react/jsx-runtime");
		function JobFacts(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("ul", { className: "jh-kv", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u516C\u53F8" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: props.job.companyName ?? "\u2014" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u5730\u70B9" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { children: [
		        props.job.city,
		        props.job.district === "" ? "" : `\xB7${props.job.district}`
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u7ECF\u9A8C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: props.job.expReq === "" ? "\u2014" : props.job.expReq })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u5B66\u5386" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: props.job.eduReq === "" ? "\u2014" : props.job.eduReq })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u6765\u6E90\u5E73\u53F0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: props.job.platformName ?? props.job.platformId })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u53D1\u5E03" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: props.job.publishedAt ?? "\u2014" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u9996\u6B21\u89C1\u5230" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: props.job.firstSeenAt })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u6700\u8FD1\u89C1\u5230" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: props.lastSeen })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: "\u5F53\u524D\u72B6\u6001" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { children: JOB_STATE_LABEL[props.job.state] })
		    ] })
		  ] });
		}
		function ContactStagePanel(props) {
		  const { adoptable } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "jh-tag-group-name", children: "\u63A5\u89E6\u6001" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: props.probing,
		          onClick: props.onProbe,
		          children: props.probing ? "\u63A2\u6D4B\u4E2D\u2026" : "\u63A2\u6D4B\u5E73\u53F0\u72B6\u6001"
		        }
		      )
		    ] }),
		    props.probeError === null ? null : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "jh-error", children: props.probeError }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "jh-muted", children: props.contactLoading ? "\u6B63\u5728\u8BFB\u53D6\u63A5\u89E6\u8BB0\u5F55\u2026" : props.localStage === "none" ? "\u8FD8\u6CA1\u6709\u672C\u5730\u63A5\u89E6\u8BB0\u5F55\uFF08\u6253\u8FC7\u62DB\u547C\u4E4B\u540E\u624D\u4F1A\u6709\uFF09\u3002\u4E0B\u9762\u662F\u4EBA\u5DE5\u6807\u8BB0\u7684\u5165\u53E3\u3002" : `\u672C\u5730\u8BB0\u5F55\uFF1A${CONTACT_STAGE_LABEL[props.localStage]}\u3002\u6539\u52A8\u53EA\u5199\u672C\u5730\u8D26\uFF0C\u5E73\u53F0\u4E0A\u4E0D\u4F1A\u6709\u4EFB\u4F55\u52A8\u4F5C\u3002` }),
		    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "jh-detail-actions", children: MANUAL_CONTACT_STAGES.map((stage) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
		      "button",
		      {
		        type: "button",
		        className: `jh-btn jh-btn-inline${stage === props.localStage ? " jh-btn-active" : ""}`,
		        disabled: props.staging !== null || stage === props.localStage,
		        title: stage === props.localStage ? "\u5F53\u524D\u5C31\u662F\u8FD9\u4E00\u6001" : `\u8BB0\u6210\u300C${CONTACT_STAGE_LABEL[stage]}\u300D\uFF08\u53EA\u6539\u672C\u5730\u8BB0\u5F55\uFF0C\u4E0D\u78B0\u5E73\u53F0\uFF09`,
		        onClick: () => void props.onSaveStage(stage),
		        children: props.staging === stage ? "\u2026" : CONTACT_STAGE_LABEL[stage]
		      },
		      stage
		    )) }),
		    props.probe === null ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u63A2\u6D4B\u8FC7\u3002\u63A2\u6D4B\u53EA**\u8BFB**\u5E73\u53F0\u4E0A\u7684\u72B6\u6001\uFF08\u4E0D\u53D1\u6D88\u606F\u3001\u4E0D\u6295\u9012\uFF09\uFF0C\u4E5F\u4E0D\u4F1A\u6539\u52A8\u672C\u5730\u72B6\u6001\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(import_jsx_runtime21.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("p", { children: [
		        "\u5E73\u53F0\u4E0A\uFF1A",
		        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("b", { children: props.probe.stage === null ? "\u5224\u4E0D\u51FA\u6765" : CONTACT_STAGE_LABEL[props.probe.stage] }),
		        adoptable === null ? null : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-link",
		            disabled: props.staging !== null,
		            onClick: () => void props.onSaveStage(adoptable),
		            children: "\u91C7\u7EB3\u4E3A\u672C\u5730\u72B6\u6001"
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "jh-muted", children: props.probe.note })
		    ] }),
		    props.sentGreetings.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("details", { className: "jh-details", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("summary", { children: [
		        "\u53D1\u9001\u8BB0\u5F55\uFF08",
		        props.sentGreetings.length,
		        " \u6761\uFF0C\u6700\u8FD1\u5728\u524D\uFF09"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ul", { className: "jh-tailor-notes", children: props.sentGreetings.map((greeting) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "jh-muted", children: [
		          greeting.sentAt.slice(0, 16).replace("T", " "),
		          " \xB7 ",
		          CONTACT_STAGE_LABEL[greeting.stage],
		          greeting.templateName === null ? "" : ` \xB7 \u6A21\u677F\u300C${greeting.templateName}\u300D`,
		          greeting.actor === "model" ? " \xB7 \u6A21\u578B\u53D1\u8D77" : ""
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { children: greeting.content })
		      ] }, greeting.id)) }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { className: "jh-muted", children: "\u8FD9\u91CC\u662F\u4F60\u5B9E\u9645\u53D1\u51FA\u53BB\u7684\u90A3\u6BB5\u8BDD\uFF08\u8981\u6539\u7B80\u5386\u8FD8\u662F\u6539\u8BDD\u672F\uFF0C\u770B\u8FD9\u4E2A\uFF09\uFF1B\u4E0A\u9762\u300C\u53D8\u66F4\u8BB0\u5F55\u300D\u8BB0\u7684\u662F\u72B6\u6001\u600E\u4E48\u53D8\u7684\u3002" })
		    ] }),
		    props.contactEvents.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("details", { className: "jh-details", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("summary", { children: [
		        "\u53D8\u66F4\u8BB0\u5F55\uFF08",
		        props.contactEvents.length,
		        " \u6761\uFF0C\u6700\u8FD1\u5728\u524D\uFF09"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ul", { className: "jh-tailor-notes", children: props.contactEvents.map((event) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("li", { className: "jh-muted", children: [
		        event.at.slice(0, 16).replace("T", " "),
		        " \xB7",
		        " ",
		        event.fromStage === null ? "\u2014" : event.fromStage,
		        " \u2192 ",
		        event.toStage,
		        " \xB7 ",
		        event.source === "model" ? "\u6A21\u578B" : event.source === "auto" ? "\u81EA\u52A8\u8BC6\u522B" : "\u4EBA\u5DE5",
		        event.note === null ? "" : ` \xB7 ${event.note}`
		      ] }, event.id)) })
		    ] })
		  ] });
		}

		// src/client/views/job-detail/panels/tag-groups.tsx
		var import_jsx_runtime22 = require("react/jsx-runtime");
		function TagGroups(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		    props.grouped.skills.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "jh-tag-group", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "jh-tag-group-name", children: "\u6280\u80FD\u8981\u6C42" }),
		      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "jh-tags", children: props.grouped.skills.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "jh-tag", children: tag }, tag)) })
		    ] }),
		    props.grouped.benefits.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "jh-tag-group", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "jh-tag-group-name", children: "\u516C\u53F8\u798F\u5229" }),
		      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "jh-tags", children: props.grouped.benefits.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "jh-tag", children: tag }, tag)) })
		    ] })
		  ] });
		}

		// src/client/views/job-detail/body.tsx
		var import_react11 = require("react");
		var import_jsx_runtime23 = require("react/jsx-runtime");
		var ACTION_STATES = ["saved", "ignored", "seen", "archived"];
		function JobDetailBody(props) {
		  const { state, reload } = useAsync((signal) => fetchJobDetail(props.id, signal), [props.id, props.revision]);
		  const history = useAsync((signal) => fetchJobHistory(props.id, signal), [props.id, props.revision]);
		  const greetings = useAsync(
		    (signal) => fetchGreetings({ jobId: props.id, limit: 5 }, signal),
		    [props.id, props.revision]
		  );
		  const [busy, setBusy] = (0, import_react11.useState)(null);
		  const [failure, setFailure] = (0, import_react11.useState)(null);
		  const [probing, setProbing] = (0, import_react11.useState)(false);
		  const [probe, setProbe] = (0, import_react11.useState)(null);
		  const [probeError, setProbeError] = (0, import_react11.useState)(null);
		  const [staging, setStaging] = (0, import_react11.useState)(null);
		  const [deliverOpen, setDeliverOpen] = (0, import_react11.useState)(false);
		  const [deliverResumeId, setDeliverResumeId] = (0, import_react11.useState)(null);
		  const [deliverAsk, setDeliverAsk] = (0, import_react11.useState)(null);
		  const [delivering, setDelivering] = (0, import_react11.useState)(false);
		  const [deliverNote, setDeliverNote] = (0, import_react11.useState)(null);
		  const deliver = async (confirm) => {
		    setDelivering(true);
		    setDeliverNote(null);
		    try {
		      const result = await deliverApplication({
		        jobId: props.id,
		        resumeFileId: deliverResumeId,
		        ...confirm ? { confirm: true } : {}
		      });
		      setDeliverOpen(false);
		      setDeliverAsk(null);
		      setDeliverNote({
		        tone: "ok",
		        text: `\u5DF2\u6295\u9012\uFF08\u9001\u8FBE\u72B6\u6001\uFF1A${DELIVERY_STATE_LABEL[result.delivery]}\uFF09` + (result.detail === void 0 ? "" : ` \u2014\u2014 ${result.detail}`)
		      });
		      history.reload();
		      props.onChanged();
		    } catch (error) {
		      if (error instanceof NeedsConfirmError) {
		        setDeliverAsk(error.confirmText);
		        return;
		      }
		      setDeliverAsk(null);
		      setDeliverOpen(false);
		      setDeliverNote({ tone: "error", text: error instanceof ApiError ? error.display : String(error) });
		    } finally {
		      setDelivering(false);
		    }
		  };
		  const probeStage = async () => {
		    setProbing(true);
		    setProbeError(null);
		    try {
		      const result = await probeContactStage(props.id);
		      setProbe({ stage: result.stage, note: result.note });
		    } catch (error) {
		      setProbeError(error instanceof ApiError ? error.display : String(error));
		    } finally {
		      setProbing(false);
		    }
		  };
		  const saveContactStage = async (to) => {
		    setStaging(to);
		    setProbeError(null);
		    try {
		      await updateContactStage(props.id, { to });
		      history.reload();
		      greetings.reload();
		      props.onChanged();
		    } catch (error) {
		      setProbeError(error instanceof ApiError ? error.display : String(error));
		    } finally {
		      setStaging(null);
		    }
		  };
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
		    return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u8BE6\u60C5\u2026" });
		  }
		  if (state.status === "error") {
		    return /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(ErrorLine, { children: state.message }),
		      state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("p", { className: "jh-muted", children: state.hint }),
		      /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("button", { type: "button", className: "jh-btn", onClick: reload, children: "\u91CD\u8BD5" })
		    ] });
		  }
		  const { job, jdText, company, flags, matchReasons } = state.data;
		  const grouped = splitJobTags(job.tags);
		  const localStage = history.state.status === "ok" ? history.state.data.contactStage : "none";
		  const contactEvents = history.state.status === "ok" ? history.state.data.items.slice(0, 6) : [];
		  const sentGreetings = greetings.state.status === "ok" ? greetings.state.data.items : [];
		  const adoptable = probe?.stage != null && probe.stage !== localStage ? probe.stage : null;
		  const lastSeen = relativeTime(job.lastSeenAt) ?? job.lastSeenAt;
		  return /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)(import_jsx_runtime23.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("header", { className: "jh-detail-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: "jh-detail-headline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("h2", { className: "jh-detail-title", children: job.title }),
		        /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: "jh-detail-salary", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("b", { className: "jh-salary", children: job.salaryRaw }),
		          salaryDetail(job) === null ? null : /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("span", { className: "jh-muted", children: [
		            "\uFF08",
		            salaryDetail(job),
		            "\uFF09"
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: "jh-detail-actions", children: [
		        ACTION_STATES.map((action) => /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-btn jh-btn-inline${job.state === action ? " jh-btn-active" : ""}`,
		            disabled: busy !== null,
		            onClick: () => void mark(action),
		            children: busy === action ? "\u2026" : JOB_ACTION_LABEL[action]
		          },
		          action
		        )),
		        /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
		          ApplyEntry,
		          {
		            delivering,
		            onOpen: () => {
		              setDeliverAsk(null);
		              setDeliverOpen(true);
		            }
		          }
		        )
		      ] })
		    ] }),
		    failure === null ? null : /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("p", { className: "jh-error", children: failure }),
		    deliverNote === null ? null : /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("p", { className: deliverNote.tone === "ok" ? "jh-ok" : "jh-error", children: deliverNote.text }),
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
		      ApplyModal,
		      {
		        open: deliverOpen,
		        ask: deliverAsk,
		        resumeId: deliverResumeId,
		        delivering,
		        onClose: () => {
		          setDeliverOpen(false);
		          setDeliverAsk(null);
		        },
		        onCancel: () => {
		          setDeliverOpen(false);
		        },
		        onBack: () => {
		          setDeliverAsk(null);
		        },
		        onResumeChange: setDeliverResumeId,
		        onNext: () => void deliver(false),
		        onConfirm: () => void deliver(true)
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(JobFacts, { job, lastSeen }),
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
		      ContactStagePanel,
		      {
		        probe,
		        probing,
		        probeError,
		        localStage,
		        contactLoading: history.state.status === "loading",
		        staging,
		        adoptable,
		        sentGreetings,
		        contactEvents,
		        onProbe: () => void probeStage(),
		        onSaveStage: (to) => void saveContactStage(to)
		      }
		    ),
		    job.tags.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(TagGroups, { grouped }),
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(JdPanel, { jdText }),
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(MatchPanel, { score: job.matchScore, reasons: matchReasons }),
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(RiskPanel, { flags }),
		    company === null ? null : /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)(import_jsx_runtime23.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(CompanyPanel, { company, onSaved: reload }),
		      /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
		        CompanyJobsPanel,
		        {
		          companyId: company.id,
		          jobCount: company.jobCount,
		          currentJobId: job.id,
		          onSelect: props.onSelect
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(TailorPanel, { jobId: props.id, revision: props.revision, onChanged: props.onChanged }),
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(OverseasPanel, { jobId: props.id, onChanged: props.onChanged }),
		    job.scoreStale ? /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("p", { className: "jh-warn", children: /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(InlineMd, { text: "\u8FD9\u4E2A\u5339\u914D\u5206\u662F**\u65E7\u7248\u7B80\u5386**\u4E0B\u7B97\u51FA\u6765\u7684 \u2014\u2014 \u7B80\u5386\u6539\u8FC7\u4E4B\u540E\u5B83\u5C31\u4E0D\u518D\u6709\u6548\u3002\u7528\u300C\u91CD\u7B97\u300D\u6216\u5728\u5BF9\u8BDD\u91CC\u8BA9\u6A21\u578B\u8DD1 `job_match_explain` \u624D\u662F\u5F53\u524D\u5206\u6570\u3002" }) }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("p", { className: "jh-note", children: [
		      "\u539F\u59CB\u9875\u9762\uFF1A",
		      /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("a", { className: "jh-link", href: job.sourceUrl, target: "_blank", rel: "noreferrer noopener", children: job.sourceUrl })
		    ] })
		  ] });
		}

		// src/client/views/job-detail/drawer.tsx
		var import_react12 = require("react");
		var import_jsx_runtime24 = require("react/jsx-runtime");
		function JobDetailDrawer(props) {
		  const dialogRef = (0, import_react12.useRef)(null);
		  useDialogA11y(dialogRef, props.onClose, [props.id]);
		  return /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("div", { className: "jh-drawer-layer", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("button", { type: "button", className: "jh-drawer-backdrop", "aria-label": "\u5173\u95ED\u8BE6\u60C5", onClick: props.onClose }),
		    /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)("header", { className: "jh-drawer-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "jh-drawer-title", children: "\u5C97\u4F4D\u8BE6\u60C5" }),
		            /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("button", { type: "button", className: "jh-icon-btn", "aria-label": "\u5173\u95ED", onClick: props.onClose, children: "\xD7" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("div", { className: "jh-drawer-body", children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(JobDetailBody, { id: props.id, revision: props.revision, onChanged: props.onChanged }) })
		        ]
		      }
		    )
		  ] });
		}

		// src/client/screens/jobs/index.tsx
		var import_react16 = require("react");

		// src/shared/config/limits.ts
		var MAX_BODY_BYTES = 64 * 1024;
		var ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
		var ATTACHMENT_BODY_MAX_BYTES = 8 * 1024 * 1024;
		var PAGE_SIZE_DEFAULT = 20;
		var MAX_SAVED_JOB_VIEWS = 20;
		var MAX_SAVED_JOB_VIEW_NAME = 40;
		var EXPORT_ARCHIVE_MAX_BYTES = 200 * 1024 * 1024;

		// src/shared/domain/job-facets.ts
		var EXP_BUCKETS = [
		  { id: "any", label: "\u4E0D\u9650/\u65E0\u9700\u7ECF\u9A8C" },
		  { id: "fresh", label: "\u5E94\u5C4A\u751F" },
		  { id: "1-3", label: "1-3\u5E74" },
		  { id: "3-5", label: "3-5\u5E74" },
		  { id: "5-10", label: "5-10\u5E74" },
		  { id: "10+", label: "10\u5E74\u4EE5\u4E0A" }
		];
		var NO_LIMIT_RE = /(不限|无需|无经验|不需要经验)/;
		var FRESH_RE = /(应届|在校|毕业生|实习)/;
		function toHalfWidth(raw) {
		  return raw.replace(/[\uff10-\uff19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65296 + 48)).replace(/[～~－—–]/g, "-");
		}
		function parseYears(raw) {
		  const text = toHalfWidth(raw);
		  const matches = text.match(/\d+(?:\.\d+)?/g);
		  if (matches === null) return null;
		  const first = Number(matches[0]);
		  const second = matches.length >= 2 ? Number(matches[1]) : null;
		  if (/(以下|以内|之内|少于|不足)/.test(text)) return { lo: 0, hi: first, capped: true };
		  if (/(以上|及以上|\+|＋)/.test(text)) return { lo: first, hi: null, capped: false };
		  if (second !== null) return { lo: Math.min(first, second), hi: Math.max(first, second), capped: false };
		  return { lo: first, hi: first, capped: false };
		}
		function expBucketOf(raw) {
		  const text = toHalfWidth(raw).trim();
		  if (text === "") return null;
		  if (NO_LIMIT_RE.test(text)) return "any";
		  if (FRESH_RE.test(text)) return "fresh";
		  const years = parseYears(text);
		  if (years === null) return null;
		  if (years.hi !== null && (years.capped ? years.hi <= 1 : years.hi < 1 || years.lo === 0)) {
		    return "fresh";
		  }
		  if (years.hi === null) {
		    if (years.lo <= 2) return "1-3";
		    if (years.lo <= 4) return "3-5";
		    if (years.lo <= 8) return "5-10";
		    return "10+";
		  }
		  const mid = (years.lo + years.hi) / 2;
		  if (mid < 3) return "1-3";
		  if (mid < 5) return "3-5";
		  if (mid < 9.5) return "5-10";
		  return "10+";
		}
		function buildExpChips(values) {
		  const byBucket = /* @__PURE__ */ new Map();
		  const leftovers = [];
		  for (const value of values) {
		    if (value.trim() === "") continue;
		    const bucket = expBucketOf(value);
		    if (bucket === null) {
		      leftovers.push(value);
		      continue;
		    }
		    const hits = byBucket.get(bucket);
		    if (hits === void 0) byBucket.set(bucket, [value]);
		    else if (!hits.includes(value)) hits.push(value);
		  }
		  const chips = [];
		  for (const bucket of EXP_BUCKETS) {
		    const hits = byBucket.get(bucket.id);
		    if (hits === void 0) continue;
		    chips.push({ id: bucket.id, label: bucket.label, values: hits });
		  }
		  for (const value of leftovers) chips.push({ id: `raw:${value}`, label: value, values: [value] });
		  return chips;
		}
		var EDU_TIERS = [
		  { re: /不限/, rank: 0 },
		  { re: /(小学|初中|及以下)/, rank: 1 },
		  { re: /(高中|中专|中技|技校|职高|中职)/, rank: 2 },
		  { re: /(大专|专科|高职)/, rank: 3 },
		  { re: /(本科|学士)/, rank: 4 },
		  { re: /(硕士|研究生|MBA|EMBA)/i, rank: 5 },
		  { re: /(博士|博士后)/, rank: 6 }
		];
		var EDU_RANK_UNKNOWN = 99;
		function eduRankOf(raw) {
		  for (const tier of EDU_TIERS) {
		    if (tier.re.test(raw)) return tier.rank;
		  }
		  return EDU_RANK_UNKNOWN;
		}
		function sortEduValues(values) {
		  return values.map((value, index) => ({ value, index, rank: eduRankOf(value) })).sort((a, b) => a.rank === b.rank ? a.index - b.index : a.rank - b.rank).map((item) => item.value);
		}

		// src/client/views/job-detail/pane.tsx
		var import_jsx_runtime25 = require("react/jsx-runtime");
		function JobDetailPane(props) {
		  if (props.id === null) {
		    return /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)("section", { className: "jh-detail-pane jh-detail-pane-empty", "data-job-hunter": "job-detail", "aria-label": "\u5C97\u4F4D\u8BE6\u60C5", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("p", { className: "jh-detail-empty-title", children: "\u4ECE\u5DE6\u4FA7\u9009\u4E00\u4E2A\u5C97\u4F4D" }),
		      /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("p", { className: "jh-note", children: "\u8BE6\u60C5\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\uFF0C\u5217\u8868\u4FDD\u6301\u4E0D\u52A8\uFF0C\u65B9\u4FBF\u4E00\u4E2A\u4E2A\u5F80\u4E0B\u6BD4\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("p", { className: "jh-note", children: /* @__PURE__ */ (0, import_jsx_runtime25.jsx)(InlineMd, { text: "\u5217\u8868\u4E0A\u7684\u300C\u7C97\u7B5B\u5206\u300D\u4E0E\u98CE\u9669\u6807\u6CE8\u53EA\u662F\u521D\u7B5B\uFF1B\u70B9\u8FDB\u6765\u80FD\u770B\u5230\u6BCF\u4E00\u6761\u7ED3\u8BBA\u7684**\u539F\u6587\u4F9D\u636E**\u3002" }) })
		    ] });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("section", { className: "jh-detail-pane", "data-job-hunter": "job-detail", "aria-label": "\u5C97\u4F4D\u8BE6\u60C5", children: /* @__PURE__ */ (0, import_jsx_runtime25.jsx)(
		    JobDetailBody,
		    {
		      id: props.id,
		      revision: props.revision,
		      onChanged: props.onChanged,
		      onSelect: props.onSelect
		    }
		  ) });
		}

		// src/client/screens/jobs/batch-deliver-modal.tsx
		var import_react13 = require("react");

		// src/client/screens/jobs/icons.tsx
		var import_jsx_runtime26 = require("react/jsx-runtime");
		function IconChat() {
		  return /* @__PURE__ */ (0, import_jsx_runtime26.jsx)(
		    "svg",
		    {
		      width: "14",
		      height: "14",
		      viewBox: "0 0 16 16",
		      fill: "none",
		      stroke: "currentColor",
		      strokeWidth: "1.4",
		      strokeLinejoin: "round",
		      strokeLinecap: "round",
		      "aria-hidden": "true",
		      children: /* @__PURE__ */ (0, import_jsx_runtime26.jsx)("path", { d: "M2 3.6A1.6 1.6 0 0 1 3.6 2h8.8A1.6 1.6 0 0 1 14 3.6v5.8a1.6 1.6 0 0 1-1.6 1.6H6.8L4 13.6V11A1.6 1.6 0 0 1 2 9.4z" })
		    }
		  );
		}
		function IconSend() {
		  return /* @__PURE__ */ (0, import_jsx_runtime26.jsxs)(
		    "svg",
		    {
		      width: "14",
		      height: "14",
		      viewBox: "0 0 16 16",
		      fill: "none",
		      stroke: "currentColor",
		      strokeWidth: "1.4",
		      strokeLinejoin: "round",
		      strokeLinecap: "round",
		      "aria-hidden": "true",
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime26.jsx)("path", { d: "M14.5 1.5 9.6 14.5 6.7 9.3 1.5 6.4z" }),
		        /* @__PURE__ */ (0, import_jsx_runtime26.jsx)("path", { d: "M14.5 1.5 6.7 9.3" })
		      ]
		    }
		  );
		}
		function IconCheck() {
		  return /* @__PURE__ */ (0, import_jsx_runtime26.jsx)(
		    "svg",
		    {
		      width: "13",
		      height: "13",
		      viewBox: "0 0 16 16",
		      fill: "none",
		      stroke: "currentColor",
		      strokeWidth: "1.8",
		      strokeLinejoin: "round",
		      strokeLinecap: "round",
		      "aria-hidden": "true",
		      children: /* @__PURE__ */ (0, import_jsx_runtime26.jsx)("path", { d: "M2.5 8.6 6.3 12.4 13.5 3.8" })
		    }
		  );
		}
		function IconCross() {
		  return /* @__PURE__ */ (0, import_jsx_runtime26.jsx)(
		    "svg",
		    {
		      width: "13",
		      height: "13",
		      viewBox: "0 0 16 16",
		      fill: "none",
		      stroke: "currentColor",
		      strokeWidth: "1.8",
		      strokeLinecap: "round",
		      "aria-hidden": "true",
		      children: /* @__PURE__ */ (0, import_jsx_runtime26.jsx)("path", { d: "M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" })
		    }
		  );
		}

		// src/client/screens/jobs/batch-deliver-modal.tsx
		var import_jsx_runtime27 = require("react/jsx-runtime");
		function reasonOf(error) {
		  return error instanceof ApiError ? error.display : String(error);
		}
		function sleep(ms) {
		  return new Promise((resolve) => {
		    window.setTimeout(resolve, ms);
		  });
		}
		function randomIntervalMs(interval) {
		  return interval.min + Math.floor(Math.random() * (interval.max - interval.min));
		}
		function receiptClass(receipt) {
		  if (!receipt.ok) return "jh-error";
		  return `jh-${DELIVERY_STATE_TONE[receipt.delivery ?? "missing"]}`;
		}
		function BatchDeliverModal(props) {
		  const [plan, setPlan] = (0, import_react13.useState)(null);
		  const [error, setError] = (0, import_react13.useState)(null);
		  const [resumeFileId, setResumeFileId] = (0, import_react13.useState)(null);
		  const [skipped, setSkipped] = (0, import_react13.useState)([]);
		  const [receipts, setReceipts] = (0, import_react13.useState)([]);
		  const [sending, setSending] = (0, import_react13.useState)(false);
		  const [progress, setProgress] = (0, import_react13.useState)(null);
		  const [summary, setSummary] = (0, import_react13.useState)(null);
		  const note = (tone, text) => {
		    setSummary({ tone, text });
		    props.notify(tone, text);
		  };
		  (0, import_react13.useEffect)(() => {
		    let cancelled = false;
		    void (async () => {
		      try {
		        const next = await previewApplicationBatch(props.jobIds, resumeFileId);
		        if (!cancelled) {
		          setPlan(next);
		          setError(null);
		        }
		      } catch (caught) {
		        if (!cancelled) setError(reasonOf(caught));
		      }
		    })();
		    return () => {
		      cancelled = true;
		    };
		  }, [props.jobIds, resumeFileId]);
		  const deliverable = (plan?.items ?? []).filter((item) => item.willDeliver && !skipped.includes(item.jobId));
		  const batchMax = plan?.batchMax ?? 5;
		  const batches = Math.ceil(deliverable.length / batchMax);
		  const intervalSec = plan === null ? "" : `${String(Math.round(plan.intervalMs.min / 1e3))}\u2013${String(Math.round(plan.intervalMs.max / 1e3))} \u79D2`;
		  const run = async () => {
		    if (plan === null || deliverable.length === 0) return;
		    const already = new Set(receipts.map((receipt) => receipt.jobId));
		    const pending2 = deliverable.filter((item) => !already.has(item.jobId));
		    if (pending2.length === 0) {
		      note("ok", "\u8FD9\u4E00\u6279\u90FD\u6295\u8FC7\u4E86");
		      return;
		    }
		    setSending(true);
		    setProgress({ done: 0, total: pending2.length });
		    let sent = 0;
		    let failed = 0;
		    try {
		      for (let start = 0; start < pending2.length; start += batchMax) {
		        if (start > 0) await sleep(randomIntervalMs(plan.intervalMs));
		        const chunk = pending2.slice(start, start + batchMax);
		        const result = await sendApplicationBatch(
		          chunk.map((item) => item.jobId),
		          plan.resumeFileId
		        );
		        sent += result.sent;
		        failed += result.failed;
		        setReceipts((current) => [...current, ...result.receipts]);
		        setProgress({ done: Math.min(start + chunk.length, pending2.length), total: pending2.length });
		      }
		      note("ok", `\u6279\u91CF\u6295\u9012\u5B8C\u6210\uFF1A\u6210\u529F ${String(sent)} \u6761\u3001\u5931\u8D25 ${String(failed)} \u6761`);
		    } catch (caught) {
		      note("error", `\u6295\u9012\u4E2D\u65AD\uFF1A${reasonOf(caught)}\uFF08\u524D\u9762\u5DF2\u7ECF\u6295\u51FA\u53BB\u7684\u4E0D\u4F1A\u64A4\u56DE\uFF09`);
		    } finally {
		      setSending(false);
		      if (sent + failed > 0) props.onBatchDone(sent, failed);
		    }
		  };
		  const receiptOf = (jobId) => receipts.find((receipt) => receipt.jobId === jobId);
		  const unconfirmed = receipts.filter(
		    (receipt) => receipt.ok && receipt.delivery !== null && receipt.delivery !== "delivered"
		  ).length;
		  return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)(
		    Modal,
		    {
		      title: "\u6279\u91CF\u6295\u9012\u7B80\u5386",
		      label: "\u6279\u91CF\u6295\u9012\u7B80\u5386",
		      size: "lg",
		      onClose: sending ? () => void 0 : props.onClose,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)(import_jsx_runtime27.Fragment, { children: [
		        sending && progress !== null ? /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("span", { className: "jh-muted", children: [
		          "\u6B63\u5728\u6295\u9012 ",
		          progress.done,
		          "/",
		          progress.total,
		          "\uFF08\u6BCF\u6761\u4E4B\u95F4\u4F1A\u7B49 ",
		          intervalSec,
		          "\uFF0C\u5206\u6279\u4E4B\u95F4\u4E5F\u4E00\u6837\uFF0C\u6162\u662F\u6545\u610F\u7684\uFF09"
		        ] }) : null,
		        summary === null ? null : /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
		          "span",
		          {
		            className: `jh-modal-foot-note ${summary.tone === "ok" ? "jh-ok" : "jh-error"}`,
		            role: summary.tone === "ok" ? "status" : "alert",
		            children: summary.text
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled: sending, onClick: props.onClose, children: "\u5173\u95ED" }),
		        /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-primary",
		            disabled: sending || plan === null || deliverable.length === 0,
		            onClick: () => void run(),
		            children: sending ? "\u6295\u9012\u4E2D\u2026" : `\u786E\u8BA4\u6295\u9012\uFF08${String(deliverable.length)} \u6761 / \u5206 ${String(batches)} \u6279\uFF09`
		          }
		        )
		      ] }),
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "jh-note", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(InlineMd, { text: "\u6295\u9012**\u4E0D\u53EF\u9006**\uFF1A\u5E73\u53F0\u4E00\u65E6\u6536\u5230\uFF0C\u64A4\u56DE\u4E0D\u4E86\u3002\u6240\u4EE5\u8FD9\u91CC\u4E00\u6B21\u6700\u591A\u53D1 5 \u6761\uFF0C\u800C\u4E14\u6BCF\u6761\u4F1A\u5355\u72EC\u7559\u4E00\u6761\u56DE\u6267\uFF08\u542B\u9001\u8FBE\u72B6\u6001\uFF09\u3002" }) }),
		        error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "jh-error", children: error }),
		        plan === null && error === null ? /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u68C0\u67E5\u8FD9\u4E9B\u5C97\u4F4D\u80FD\u4E0D\u80FD\u6295\u2026" }) : null,
		        plan === null ? null : /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)(import_jsx_runtime27.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("p", { className: "jh-note", children: [
		            "\u5171 ",
		            plan.items.length,
		            " \u6761\uFF1A",
		            /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("b", { children: [
		              "\u80FD\u6295 ",
		              plan.sendable,
		              " \u6761"
		            ] }),
		            "\u3001\u6295\u4E0D\u4E86 ",
		            plan.blocked,
		            " \u6761\u3002",
		            batches > 1 ? `\u4E00\u6B21\u8BF7\u6C42\u6700\u591A\u6295 ${String(batchMax)} \u6761\uFF0C\u6240\u4EE5\u4F1A\u5206 ${String(batches)} \u6279\u4F9D\u6B21\u53D1\u51FA\uFF08\u6BCF\u6279\u7ED3\u675F\u540E\u8FD9\u91CC\u4F1A\u66F4\u65B0\u56DE\u6267\uFF09\u3002` : ""
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "jh-ctl", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("span", { className: "jh-field-label", children: [
		              "\u7528\u54EA\u4EFD\u7B80\u5386",
		              /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(FieldHint, { text: "**\u5E73\u53F0\u4E0A\u6536\u5230\u7684**\u662F\u5E73\u53F0\u81EA\u5DF1\u90A3\u4EFD\u7B80\u5386\uFF08\u5E73\u53F0\u6CA1\u6709\u628A\u672C\u5730\u6587\u4EF6\u53D1\u7ED9 HR \u7684\u5165\u53E3\uFF0C\u6211\u4EEC\u6539\u4E0D\u4E86\u5B83\uFF09\u3002\u8FD9\u91CC\u9009\u7684\u662F**\u8FD9\u6B21\u6295\u9012\u5728\u4F60\u7684\u8BB0\u5F55\u91CC\u5F52\u5230\u54EA\u4E00\u7248** \u2014\u2014\u300C\u54EA\u7248\u56DE\u590D\u7387\u9AD8\u300D\u8FD9\u7C7B\u5BF9\u6BD4\u8981\u9760\u5B83\uFF0C\u6240\u4EE5\u9009\u5F97\u51C6\u4E00\u70B9\u66F4\u6709\u7528\u3002\u4E0D\u9009\u5C31\u4E0D\u767B\u8BB0\u7248\u672C\u3002" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
		              ResumeFilePicker,
		              {
		                value: resumeFileId,
		                disabled: sending,
		                onChange: (next) => {
		                  setResumeFileId(next);
		                  setReceipts([]);
		                }
		              }
		            )
		          ] }),
		          plan.uploadsResumeFile === null ? null : /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: plan.uploadsResumeFile ? "jh-muted" : "jh-warn", children: plan.uploadsResumeFile ? "\u8FD9\u4E9B\u5E73\u53F0\u63A5\u53D7\u672C\u5730\u9644\u4EF6\uFF1A\u6295\u9012\u65F6\u4F1A\u628A\u9009\u4E2D\u7684\u90A3\u4EFD\u6587\u4EF6\u4F20\u4E0A\u53BB\u3002" : /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
		            InlineMd,
		            {
		              text: "\u9009\u4E2D\u7684\u90A3\u4EFD\u6587\u4EF6**\u4E0D\u4F1A**\u4E0A\u4F20 \u2014\u2014 \u8FD9\u4E9B\u5E73\u53F0\u53EA\u5403\u5B83\u4EEC\u81EA\u5DF1\u90A3\u4EFD\u7B80\u5386\u3002\u8FD9\u4E00\u6279\u4F1A\u7167\u6295\uFF08\u7528\u7684\u662F\u5E73\u53F0\u4E0A\u5DF2\u6709\u7684\u90A3\u4EFD\uFF09\uFF0C\u4F60\u9009\u7684\u7248\u672C\u53EA\u4F5C**\u672C\u5730\u767B\u8BB0**\uFF08\u5F52\u56E0\u7528\uFF09\u3002\u8981\u6362\u5E73\u53F0\u4E0A\u90A3\u4EFD\uFF0C\u5F97\u5148\u53BB\u5E73\u53F0\u4E0A\u6362\u3002"
		            }
		          ) }),
		          /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "jh-muted", children: plan.note }),
		          /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("ul", { className: "jh-tailor-notes", children: plan.items.map((item) => {
		            const receipt = receiptOf(item.jobId);
		            const off = skipped.includes(item.jobId);
		            return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "jh-row-head", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("label", { className: "jh-check", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
		                    "input",
		                    {
		                      type: "checkbox",
		                      checked: item.willDeliver && !off,
		                      disabled: !item.willDeliver || sending,
		                      onChange: (event) => setSkipped(
		                        (current) => event.target.checked ? current.filter((id) => id !== item.jobId) : [...current, item.jobId]
		                      )
		                    }
		                  ),
		                  /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("span", { children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("b", { children: item.title }),
		                    item.company === "" ? "" : ` \xB7 ${item.company}`,
		                    /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("span", { className: "jh-muted", children: [
		                      "\uFF08",
		                      item.platformId,
		                      "\uFF09"
		                    ] })
		                  ] })
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("span", { className: "jh-spacer" }),
		                receipt === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("span", { className: receiptClass(receipt), children: receipt.ok ? `\u5DF2\u6295\u9012\uFF08${DELIVERY_STATE_LABEL[receipt.delivery ?? "missing"]}\uFF09` : receipt.message ?? "\u5931\u8D25" })
		              ] }),
		              item.willDeliver ? /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "jh-muted", children: [
		                "\u4F1A\u771F\u7684\u70B9\u4E0B\u5E73\u53F0\u7684\u300C\u6295\u9012\u300D\u6309\u94AE",
		                item.sideEffect === null ? "" : ` \xB7 \u540C\u65F6\u4F1A\u53D1\u751F\uFF1A${item.sideEffect}`
		              ] }) : /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "jh-muted", children: [
		                "\u6295\u4E0D\u4E86\uFF1A",
		                item.blocker?.message,
		                item.blocker?.hint === void 0 ? "" : ` \u2014\u2014 ${item.blocker.hint}`
		              ] })
		            ] }, item.jobId);
		          }) }),
		          receipts.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("details", { className: "jh-details", open: true, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("summary", { children: [
		              "\u56DE\u6267\uFF08",
		              receipts.length,
		              " \u6761\uFF0C\u9010\u6761\uFF09"
		            ] }),
		            unconfirmed === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("p", { className: "jh-error", children: [
		              unconfirmed,
		              " \u6761\u53EA\u5230\u300C",
		              DELIVERY_STATE_LABEL.pending,
		              "\u300D\uFF1A\u52A8\u4F5C\u53EF\u80FD\u5DF2\u7ECF\u751F\u6548\uFF0C",
		              /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("b", { children: "\u5148\u53BB\u5E73\u53F0\u4E0A\u6838\u5BF9\uFF0C\u4E0D\u8981\u76F4\u63A5\u91CD\u6295" }),
		              "\uFF08\u6295\u9012\u4E0D\u50CF\u6253\u62DB\u547C\uFF0C\u6295\u91CD\u4E86\u6536\u4E0D\u56DE\u6765\uFF09\u3002"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("ul", { className: "jh-tailor-notes", children: receipts.map((receipt) => /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("li", { className: receiptClass(receipt), children: [
		              /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("span", { className: "jh-receipt-mark", children: receipt.ok ? /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(IconCheck, {}) : /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(IconCross, {}) }),
		              receipt.company || receipt.title,
		              "\uFF1A",
		              receipt.ok ? `\u5DF2\u6295\u9012\uFF08${DELIVERY_STATE_LABEL[receipt.delivery ?? "missing"]}\uFF0C${receipt.sentAt === null ? "" : formatLocalDateTime(receipt.sentAt)}\uFF09` : `${receipt.message ?? "\u5931\u8D25"}${receipt.hint === null ? "" : ` \u2014\u2014 ${receipt.hint}`}`
		            ] }, receipt.jobId)) })
		          ] })
		        ] })
		      ]
		    }
		  );
		}

		// src/client/screens/jobs/batch-greeting-modal.tsx
		var import_react14 = require("react");
		var import_jsx_runtime28 = require("react/jsx-runtime");
		function reasonOf2(error) {
		  return error instanceof ApiError ? error.display : String(error);
		}
		function sleep2(ms) {
		  return new Promise((resolve) => {
		    window.setTimeout(resolve, ms);
		  });
		}
		function randomIntervalMs2(interval) {
		  return interval.min + Math.floor(Math.random() * (interval.max - interval.min));
		}
		function receiptTone(receipt) {
		  return receipt.ok ? "\u5DF2\u53D1\u9001" : receipt.message ?? "\u5931\u8D25";
		}
		function BatchGreetingModal(props) {
		  const [plan, setPlan] = (0, import_react14.useState)(null);
		  const [error, setError] = (0, import_react14.useState)(null);
		  const [texts, setTexts] = (0, import_react14.useState)({});
		  const [skipped, setSkipped] = (0, import_react14.useState)([]);
		  const [receipts, setReceipts] = (0, import_react14.useState)([]);
		  const [sending, setSending] = (0, import_react14.useState)(false);
		  const [progress, setProgress] = (0, import_react14.useState)(null);
		  const [regenerating, setRegenerating] = (0, import_react14.useState)(null);
		  const [summary, setSummary] = (0, import_react14.useState)(null);
		  const note = (tone, text) => {
		    setSummary({ tone, text });
		    props.notify(tone, text);
		  };
		  (0, import_react14.useEffect)(() => {
		    let cancelled = false;
		    void (async () => {
		      try {
		        const next = await previewGreetingBatch(props.jobIds);
		        if (cancelled) return;
		        setPlan(next);
		        setTexts(
		          Object.fromEntries(
		            next.items.filter((item) => item.text !== null).map((item) => [item.jobId, item.text])
		          )
		        );
		      } catch (caught) {
		        if (!cancelled) setError(reasonOf2(caught));
		      }
		    })();
		    return () => {
		      cancelled = true;
		    };
		  }, [props.jobIds]);
		  const sendable = (plan?.items ?? []).filter((item) => item.willSend && !skipped.includes(item.jobId));
		  const batchMax = plan?.batchMax ?? 5;
		  const batches = Math.ceil(sendable.length / batchMax);
		  const intervalSec = plan === null ? "" : `${String(Math.round(plan.intervalMs.min / 1e3))}\u2013${String(Math.round(plan.intervalMs.max / 1e3))} \u79D2`;
		  const run = async () => {
		    if (plan === null || sendable.length === 0) return;
		    const already = new Set(receipts.map((receipt) => receipt.jobId));
		    const pending2 = sendable.filter((item) => !already.has(item.jobId));
		    if (pending2.length === 0) {
		      note("ok", "\u8FD9\u4E00\u6279\u90FD\u53D1\u8FC7\u4E86");
		      return;
		    }
		    setSending(true);
		    setProgress({ done: 0, total: pending2.length });
		    let sent = 0;
		    let failed = 0;
		    try {
		      for (let start = 0; start < pending2.length; start += batchMax) {
		        if (start > 0) await sleep2(randomIntervalMs2(plan.intervalMs));
		        const chunk = pending2.slice(start, start + batchMax);
		        const result = await sendGreetingBatch(
		          chunk.map((item) => {
		            const text = texts[item.jobId];
		            return text === void 0 || text.trim() === "" ? { jobId: item.jobId } : { jobId: item.jobId, text };
		          })
		        );
		        sent += result.sent;
		        failed += result.failed;
		        setReceipts((current) => [...current, ...result.receipts]);
		        setProgress({ done: Math.min(start + chunk.length, pending2.length), total: pending2.length });
		      }
		      note("ok", `\u6279\u91CF\u6253\u62DB\u547C\u5B8C\u6210\uFF1A\u6210\u529F ${String(sent)} \u6761\u3001\u5931\u8D25 ${String(failed)} \u6761`);
		    } catch (caught) {
		      note("error", `\u53D1\u9001\u4E2D\u65AD\uFF1A${reasonOf2(caught)}\uFF08\u524D\u9762\u5DF2\u7ECF\u53D1\u51FA\u53BB\u7684\u4E0D\u4F1A\u64A4\u56DE\uFF09`);
		    } finally {
		      setSending(false);
		      if (sent + failed > 0) props.onBatchDone(sent, failed);
		    }
		  };
		  const regenerate = async (jobId) => {
		    setRegenerating(jobId);
		    try {
		      const draft = await draftGreeting(jobId);
		      setTexts((current) => ({ ...current, [jobId]: draft.text }));
		    } catch (caught) {
		      note("error", reasonOf2(caught));
		    } finally {
		      setRegenerating(null);
		    }
		  };
		  const receiptOf = (jobId) => receipts.find((receipt) => receipt.jobId === jobId);
		  return /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)(
		    Modal,
		    {
		      title: "\u6279\u91CF\u6253\u62DB\u547C",
		      label: "\u6279\u91CF\u6253\u62DB\u547C",
		      size: "lg",
		      onClose: sending ? () => void 0 : props.onClose,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)(import_jsx_runtime28.Fragment, { children: [
		        sending && progress !== null ? /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("span", { className: "jh-muted", children: [
		          "\u6B63\u5728\u53D1\u9001 ",
		          progress.done,
		          "/",
		          progress.total,
		          "\uFF08\u6BCF\u6761\u4E4B\u95F4\u4F1A\u7B49 ",
		          intervalSec,
		          "\uFF0C\u5206\u6279\u4E4B\u95F4\u4E5F\u4E00\u6837\uFF0C\u6162\u662F\u6545\u610F\u7684\uFF09"
		        ] }) : null,
		        summary === null ? null : /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
		          "span",
		          {
		            className: `jh-modal-foot-note ${summary.tone === "ok" ? "jh-ok" : "jh-error"}`,
		            role: summary.tone === "ok" ? "status" : "alert",
		            children: summary.text
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: sending,
		            onClick: props.onClose,
		            children: "\u5173\u95ED"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-primary",
		            disabled: sending || plan === null || sendable.length === 0,
		            onClick: () => void run(),
		            children: sending ? "\u53D1\u9001\u4E2D\u2026" : `\u786E\u8BA4\u53D1\u9001\uFF08${String(sendable.length)} \u6761 / \u5206 ${String(batches)} \u6279\uFF09`
		          }
		        )
		      ] }),
		      children: [
		        error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("p", { className: "jh-error", children: error }),
		        plan === null && error === null ? /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u68C0\u67E5\u8FD9\u4E9B\u5C97\u4F4D\u80FD\u4E0D\u80FD\u53D1\u2026" }) : null,
		        plan === null ? null : /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)(import_jsx_runtime28.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("p", { className: "jh-note", children: [
		            "\u5171 ",
		            plan.items.length,
		            " \u6761\uFF1A",
		            /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("b", { children: [
		              "\u80FD\u53D1 ",
		              plan.sendable,
		              " \u6761"
		            ] }),
		            "\u3001\u53D1\u4E0D\u4E86 ",
		            plan.blocked,
		            " \u6761\u3002",
		            batches > 1 ? `\u4E00\u6B21\u8BF7\u6C42\u6700\u591A\u53D1 ${String(batchMax)} \u6761\uFF0C\u6240\u4EE5\u4F1A\u5206 ${String(batches)} \u6279\u4F9D\u6B21\u53D1\u51FA\uFF08\u6BCF\u6279\u7ED3\u675F\u540E\u8FD9\u91CC\u4F1A\u66F4\u65B0\u56DE\u6267\uFF09\u3002` : ""
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("p", { className: "jh-muted", children: plan.note }),
		          /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("ul", { className: "jh-tailor-notes", children: plan.items.map((item) => {
		            const receipt = receiptOf(item.jobId);
		            const off = skipped.includes(item.jobId);
		            return /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "jh-row-head", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("label", { className: "jh-check", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
		                    "input",
		                    {
		                      type: "checkbox",
		                      checked: item.willSend && !off,
		                      disabled: !item.willSend || sending,
		                      onChange: (event) => setSkipped(
		                        (current) => event.target.checked ? current.filter((id) => id !== item.jobId) : [...current, item.jobId]
		                      )
		                    }
		                  ),
		                  /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("span", { children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("b", { children: item.title }),
		                    item.company === "" ? "" : ` \xB7 ${item.company}`,
		                    /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("span", { className: "jh-muted", children: [
		                      "\uFF08",
		                      item.platformId,
		                      "\uFF09"
		                    ] })
		                  ] })
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "jh-spacer" }),
		                receipt === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: receipt.ok ? "jh-ok" : "jh-error", children: receiptTone(receipt) })
		              ] }),
		              item.willSend ? /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)(import_jsx_runtime28.Fragment, { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
		                  "textarea",
		                  {
		                    className: "jh-input jh-greeting-edit",
		                    rows: 3,
		                    value: texts[item.jobId] ?? "",
		                    disabled: sending,
		                    "aria-label": `${item.title} \u7684\u6253\u62DB\u547C\u6B63\u6587`,
		                    onChange: (event) => setTexts((current) => ({ ...current, [item.jobId]: event.target.value }))
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "jh-muted", children: [
		                  "\u8BDD\u672F\u6765\u6E90\uFF1A",
		                  item.via === "llm" ? "\u6A21\u578B\u751F\u6210" : item.via === "template" ? "\u6A21\u677F" : "\u4F60\u5199\u7684",
		                  (texts[item.jobId] ?? "").length === 0 ? "" : ` \xB7 ${String((texts[item.jobId] ?? "").length)} \u5B57`,
		                  item.sideEffect === null ? "" : ` \xB7 \u540C\u65F6\u4F1A\u53D1\u751F\uFF1A${item.sideEffect}`,
		                  /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "jh-spacer" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(
		                    "button",
		                    {
		                      type: "button",
		                      className: "jh-btn jh-btn-inline",
		                      disabled: sending || regenerating === item.jobId,
		                      onClick: () => void regenerate(item.jobId),
		                      children: regenerating === item.jobId ? "\u751F\u6210\u4E2D\u2026" : "\u91CD\u65B0\u751F\u6210"
		                    }
		                  )
		                ] })
		              ] }) : /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("div", { className: "jh-muted", children: [
		                "\u53D1\u4E0D\u4E86\uFF1A",
		                item.blocker?.message,
		                item.blocker?.hint === void 0 ? "" : ` \u2014\u2014 ${item.blocker.hint}`
		              ] })
		            ] }, item.jobId);
		          }) }),
		          receipts.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("details", { className: "jh-details", open: true, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("summary", { children: [
		              "\u56DE\u6267\uFF08",
		              receipts.length,
		              " \u6761\uFF0C\u9010\u6761\uFF09"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("ul", { className: "jh-tailor-notes", children: receipts.map((receipt) => /* @__PURE__ */ (0, import_jsx_runtime28.jsxs)("li", { className: receipt.ok ? "jh-ok" : "jh-error", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime28.jsx)("span", { className: "jh-receipt-mark", children: receipt.ok ? /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(IconCheck, {}) : /* @__PURE__ */ (0, import_jsx_runtime28.jsx)(IconCross, {}) }),
		              receipt.company || receipt.title,
		              "\uFF1A",
		              receipt.ok ? `\u5DF2\u53D1\u9001\uFF08${String(receipt.textLength ?? 0)} \u5B57\uFF0C${receipt.sentAt === null ? "" : formatLocalDateTime(receipt.sentAt)}\uFF09` : `${receipt.message ?? "\u5931\u8D25"}${receipt.hint === null ? "" : ` \u2014\u2014 ${receipt.hint}`}`
		            ] }, receipt.jobId)) })
		          ] })
		        ] })
		      ]
		    }
		  );
		}

		// src/client/screens/jobs/batch-toolbar.tsx
		var import_jsx_runtime29 = require("react/jsx-runtime");
		function BatchToolbar(props) {
		  const disabled = props.busy;
		  return /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "jh-picked", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("span", { children: [
		      "\u5DF2\u9009 ",
		      props.count,
		      " \u6761"
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "jh-spacer" }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled, onClick: props.onGreet, children: [
		      "\u6279\u91CF\u6253\u62DB\u547C\uFF08",
		      props.count,
		      "\uFF09"
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled, onClick: props.onDeliver, children: [
		      "\u6279\u91CF\u6295\u9012\uFF08",
		      props.count,
		      "\uFF09"
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-btn jh-btn-inline",
		        disabled,
		        title: "\u6807\u4E3A\u5DF2\u6536\u85CF",
		        onClick: () => props.onMark("saved"),
		        children: "\u6536\u85CF"
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-btn jh-btn-inline",
		        disabled,
		        title: "\u6807\u4E3A\u5DF2\u5FFD\u7565\uFF08\u7B49\u540C\u9010\u6761\u70B9 \u2715\uFF09",
		        onClick: () => props.onMark("ignored"),
		        children: "\u5FFD\u7565"
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-btn jh-btn-inline",
		        disabled,
		        title: "\u6807\u4E3A\u5DF2\u5F52\u6863\uFF08\u4ECE\u9ED8\u8BA4\u89C6\u56FE\u91CC\u632A\u8D70\uFF0C\u4F46\u8BB0\u5F55\u8FD8\u5728\uFF09",
		        onClick: () => props.onMark("archived"),
		        children: "\u5F52\u6863"
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled, onClick: props.onCopy, children: "\u590D\u5236\u4E3A\u8868\u683C" }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("a", { className: "jh-btn jh-btn-inline", href: props.exportHref, download: true, children: "\u5BFC\u51FA CSV" }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: props.onClear, children: "\u6E05\u9664\u9009\u62E9" }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(FieldHint, { text: "\u6279\u91CF\u6253\u62DB\u547C\u4F1A\u5148\u505A\u4E00\u6B21**\u53EA\u8BFB\u9884\u89C8**\uFF1A\u9010\u6761\u5217\u51FA\u80FD\u4E0D\u80FD\u53D1\u3001\u4E3A\u4EC0\u4E48\u4E0D\u80FD\uFF0C\u6B63\u6587\u53EF\u4EE5\u9010\u6761\u6539\u6216\u8DF3\u8FC7\u3002\u771F\u6B63\u7684\u53D1\u9001\u8981\u4F60\u5728\u9884\u89C8\u91CC\u786E\u8BA4\u4E00\u6B21\uFF0C\u4E4B\u540E\u6309\u6BCF\u6279\u6700\u591A 5 \u6761\u4F9D\u6B21\u53D1\u51FA\uFF08\u6761\u4E0E\u6761\u4E4B\u95F4\u4F1A\u7B49 3\u20139 \u79D2 \u2014\u2014 \u8FDE\u70B9\u662F\u6700\u660E\u663E\u7684\u673A\u5668\u4FE1\u53F7\uFF0C\u6162\u662F\u6709\u610F\u7684\uFF09\u3002" }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(FieldHint, { text: "\u6279\u91CF\u6295\u9012\uFF08L4\uFF09\u8D70\u7684\u662F**\u5E73\u53F0\u4E0A\u5DF2\u6709\u7684\u90A3\u4EFD**\u7B80\u5386\uFF0C\u6295\u51FA\u53BB**\u4E0D\u53EF\u9006**\u3002\u5B83\u4F1A\u5148\u505A\u4E00\u6B21\u53EA\u8BFB\u9884\u89C8\uFF1A\u9010\u6761\u5217\u51FA\u80FD\u4E0D\u80FD\u6295\u3001\u4E3A\u4EC0\u4E48\u4E0D\u80FD\uFF08\u53EA\u6709\u63A5\u4E86\u6295\u9012\u52A8\u4F5C\u7684\u5E73\u53F0\u80FD\u6295\uFF09\u3002\u9ED8\u8BA4\u5173\u95ED \u2014\u2014 \u9700\u8981\u5728\u300C\u8BBE\u7F6E \u2192 \u7CFB\u7EDF\u63A7\u5236\u4E2D\u5FC3 \u2192 \u53D1\u9001\u5206\u5C42\u300D\u91CC\u5148\u6253\u5F00 L4 \u6295\u9012\u3002" }),
		    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(FieldHint, { text: "\u6536\u85CF / \u5FFD\u7565 / \u5F52\u6863\u53EA\u6539**\u672C\u5730\u8BB0\u5F55**\uFF0C\u4E0D\u78B0\u5E73\u53F0\u3002\u64A4\u9500\u56DE\u7684\u662F\u300C\u5DF2\u8BFB\u300D\u800C\u4E0D\u662F\u5404\u81EA\u7684\u539F\u59CB\u72B6\u6001 \u2014\u2014 \u52FE\u9009\u53EF\u4EE5\u8DE8\u9875\uFF0C\u539F\u72B6\u6001\u6CA1\u8DDF\u7740\u4E00\u8D77\u5E26\u8FC7\u6765\u3002" })
		  ] });
		}

		// src/client/screens/jobs/filter-bar.tsx
		var import_react15 = require("react");
		var import_jsx_runtime30 = require("react/jsx-runtime");
		var MULTI_CITY = "__multi_city__";
		function FilterBar(props) {
		  const draft = props.draft;
		  const advancedOpen = props.advancedOpen;
		  const advancedCount = props.advancedCount;
		  const citiesAll = props.citiesAll;
		  const eduAll = props.eduAll;
		  const expChips = props.expChips;
		  const [naming, setNaming] = (0, import_react15.useState)(false);
		  const [nameDraft, setNameDraft] = (0, import_react15.useState)("");
		  const strayCity = draft.cities.length === 1 && !citiesAll.includes(draft.cities[0] ?? "") ? draft.cities[0] ?? "" : null;
		  const submitName = () => {
		    const name2 = nameDraft.trim();
		    if (name2 === "") return;
		    props.onSaveView(name2);
		    setNameDraft("");
		    setNaming(false);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("form", { className: "jh-jobs-filters", onSubmit: props.onSubmit, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "jh-jobs-filter-line", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("label", { className: "jh-jobs-filter-text", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { children: "\u5173\u952E\u8BCD" }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            value: draft.q,
		            onChange: (event) => props.onKeyword(event.target.value)
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)(
		        "select",
		        {
		          className: "jh-select jh-input-md",
		          "aria-label": "\u57CE\u5E02\uFF08\u5355\u9009\uFF1B\u591A\u9009\u5728\u9AD8\u7EA7\u7B5B\u9009\u91CC\uFF09",
		          value: draft.cities.length > 1 ? MULTI_CITY : draft.cities[0] ?? "",
		          onChange: (event) => {
		            if (event.target.value === MULTI_CITY) return;
		            props.onCity(event.target.value);
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("option", { value: "", children: "\u5168\u90E8\u57CE\u5E02" }),
		            strayCity === null ? null : /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("option", { value: strayCity, children: [
		              strayCity,
		              "\uFF08\u4E0D\u5728\u5F53\u524D\u57CE\u5E02\u5217\u8868\u91CC\uFF09"
		            ] }),
		            draft.cities.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("option", { value: MULTI_CITY, children: [
		              "\u5DF2\u9009 ",
		              draft.cities.length,
		              " \u4E2A\u57CE\u5E02"
		            ] }) : null,
		            citiesAll.map((city) => /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("option", { value: city, children: city }, city))
		          ]
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)(
		        "select",
		        {
		          className: "jh-select jh-input-md",
		          "aria-label": "\u72B6\u6001",
		          value: draft.state,
		          onChange: (event) => props.onState(event.target.value),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("option", { value: "", children: "\u5168\u90E8\u72B6\u6001" }),
		            JOB_STATES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("option", { value, children: JOB_STATE_LABEL[value] }, value))
		          ]
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("label", { className: "jh-jobs-filter-text jh-jobs-filter-text-narrow", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { children: "\u6700\u4F4E\u6708\u85AA" }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            inputMode: "numeric",
		            value: draft.minSalary,
		            onChange: (event) => props.onMinSalary(event.target.value)
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("label", { className: "jh-jobs-filter-text jh-jobs-filter-text-narrow", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { children: "\u6700\u4F4E\u5206" }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            inputMode: "numeric",
		            value: draft.minScore,
		            onChange: (event) => props.onMinScore(event.target.value)
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("button", { type: "submit", className: "jh-btn jh-btn-inline jh-btn-primary", children: "\u7B5B\u9009" }),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline jh-btn-quiet", onClick: props.onReset, children: "\u91CD\u7F6E" }),
		      props.pending ? /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-pending", children: "\u6761\u4EF6\u5DF2\u6539\u52A8\uFF0C\u70B9\u300C\u7B5B\u9009\u300D\u751F\u6548" }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("label", { className: "jh-jobs-filter-text jh-jobs-filter-text-narrow", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { children: "\u89C6\u56FE" }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)(
		          "select",
		          {
		            className: "jh-select",
		            "aria-label": "\u5957\u7528\u4FDD\u5B58\u7684\u89C6\u56FE",
		            value: props.appliedViewId,
		            onChange: (event) => props.onApplyView(event.target.value),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("option", { value: "", children: "\u4E0D\u5957\u7528" }),
		              props.views.map((view) => /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("option", { value: view.id, children: view.name }, view.id))
		            ]
		          }
		        )
		      ] }),
		      naming ? /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)(import_jsx_runtime30.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		          "input",
		          {
		            className: "jh-input jh-jobs-view-name",
		            value: nameDraft,
		            maxLength: MAX_SAVED_JOB_VIEW_NAME,
		            "aria-label": "\u89C6\u56FE\u540D\u5B57",
		            placeholder: "\u7ED9\u8FD9\u7EC4\u6761\u4EF6\u8D77\u4E2A\u540D\u5B57",
		            autoFocus: true,
		            onChange: (event) => setNameDraft(event.target.value),
		            onKeyDown: (event) => {
		              if (event.key === "Enter") {
		                event.preventDefault();
		                submitName();
		              }
		              if (event.key === "Escape") setNaming(false);
		            }
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline jh-btn-primary", onClick: submitName, children: "\u4FDD\u5B58" }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline jh-btn-quiet", onClick: () => setNaming(false), children: "\u53D6\u6D88" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-quiet",
		          disabled: props.views.length >= MAX_SAVED_JOB_VIEWS,
		          title: props.views.length >= MAX_SAVED_JOB_VIEWS ? `\u6700\u591A\u4FDD\u5B58 ${String(MAX_SAVED_JOB_VIEWS)} \u4E2A\u89C6\u56FE\uFF0C\u5148\u5220\u6389\u51E0\u4E2A` : "\u628A\u5F53\u524D\u8FD9\u5957\u6761\u4EF6\u5B58\u4E0B\u6765\uFF0C\u4E0B\u6B21\u4E00\u952E\u5957\u7528",
		          onClick: () => setNaming(true),
		          children: "\u4FDD\u5B58\u4E3A\u89C6\u56FE"
		        }
		      ),
		      props.appliedViewId === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-quiet",
		          title: "\u5220\u6389\u5F53\u524D\u5957\u7528\u7684\u8FD9\u4E2A\u89C6\u56FE\uFF08\u4E0D\u5F71\u54CD\u5217\u8868\u91CC\u7684\u6761\u4EF6\uFF09",
		          onClick: () => props.onDeleteView(props.appliedViewId),
		          children: "\u5220\u9664\u89C6\u56FE"
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)(
		      "button",
		      {
		        type: "button",
		        className: "jh-jobs-filter-toggle",
		        "aria-expanded": advancedOpen,
		        "aria-controls": "jh-jobs-advanced",
		        onClick: props.onToggleAdvanced,
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-caret", "aria-hidden": "true", children: advancedOpen ? "\u25BE" : "\u25B8" }),
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-toggle-text", children: "\u9AD8\u7EA7\u7B5B\u9009" }),
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: `jh-filter-note${advancedCount > 0 ? " jh-filter-note-on" : ""}`, children: advancedCount > 0 ? `\u5DF2\u9009 ${String(advancedCount)} \u9879` : "\u57CE\u5E02 / \u7ECF\u9A8C / \u5B66\u5386 / \u65B0\u589E\u65F6\u95F4 / \u5C4F\u853D / \u8DE8\u5E73\u53F0\u6298\u53E0" })
		        ]
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "jh-jobs-filter-panel", id: "jh-jobs-advanced", hidden: !advancedOpen, children: [
		      citiesAll.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "jh-jobs-filter-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("span", { className: "jh-jobs-filter-label", children: [
		          "\u57CE\u5E02",
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(FieldHint, { text: "\u53EF\u591A\u9009\uFF1A\u547D\u4E2D\u4EFB\u610F\u4E00\u4E2A\u57CE\u5E02\u7684\u5C97\u4F4D\u90FD\u4F1A\u663E\u793A\uFF08\u6DF1\u5733+\u676D\u5DDE \u8FD9\u6837\u4E00\u8D77\u770B\uFF09\u3002\u4E0A\u9762\u7684\u4E0B\u62C9\u662F\u5355\u9009\u5FEB\u6377\u5165\u53E3\uFF0C\u4E24\u5904\u5199\u7684\u662F\u540C\u4E00\u4EFD\u6761\u4EF6\uFF0C\u591A\u9009\u65F6\u4E0B\u62C9\u4F1A\u663E\u793A\u300C\u5DF2\u9009 N \u4E2A\u57CE\u5E02\u300D\u3002" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-body", role: "group", "aria-label": "\u57CE\u5E02\uFF08\u53EF\u591A\u9009\uFF09", children: citiesAll.map((city) => /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-chip${draft.cities.includes(city) ? " jh-chip-on" : ""}`,
		            "aria-pressed": draft.cities.includes(city),
		            onClick: () => props.onCityToggle(city),
		            children: city
		          },
		          city
		        )) })
		      ] }),
		      expChips.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "jh-jobs-filter-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("span", { className: "jh-jobs-filter-label", children: [
		          "\u7ECF\u9A8C",
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(FieldHint, { text: "\u5404\u5E73\u53F0\u7684\u7ECF\u9A8C\u5199\u6CD5\u4E0D\u7EDF\u4E00\uFF081-3\u5E74 / 1\u5E74\uFF5E3\u5E74 / 2-3\u5E74 / 2\u5E74\u53CA\u4EE5\u4E0A\u2026\uFF09\uFF0C\u8FD9\u91CC\u5F52\u6210 6 \u4E2A\u6807\u51C6\u68AF\u961F\u3002\u9009\u4E2D\u4E00\u6863\uFF0C\u4F1A\u628A\u5E93\u91CC\u5C5E\u4E8E\u5B83\u7684\u5199\u6CD5\u4E00\u8D77\u67E5\u51FA\u6765\uFF0C\u6240\u4EE5\u4E0D\u4F1A\u88AB\u68AF\u961F\u7684\u540D\u5B57\u6F0F\u6389\u3002" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-body", role: "group", "aria-label": "\u7ECF\u9A8C\u8981\u6C42\uFF08\u53EF\u591A\u9009\uFF09", children: expChips.map((chip) => /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-chip${draft.expBuckets.includes(chip.id) ? " jh-chip-on" : ""}`,
		            "aria-pressed": draft.expBuckets.includes(chip.id),
		            title: `\u5E93\u91CC\u5C5E\u4E8E\u8FD9\u4E00\u6863\u7684\u5199\u6CD5\uFF1A${chip.values.join(" / ")}`,
		            onClick: () => props.onExpBucket(chip.id),
		            children: chip.label
		          },
		          chip.id
		        )) })
		      ] }),
		      eduAll.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "jh-jobs-filter-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-label", children: "\u5B66\u5386" }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-body", role: "group", "aria-label": "\u5B66\u5386\u8981\u6C42\uFF08\u53EF\u591A\u9009\uFF09", children: eduAll.map((value) => /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-chip${draft.eduReqs.includes(value) ? " jh-chip-on" : ""}`,
		            "aria-pressed": draft.eduReqs.includes(value),
		            onClick: () => props.onEdu(value),
		            children: value
		          },
		          value
		        )) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "jh-jobs-filter-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("span", { className: "jh-jobs-filter-label", children: [
		          "\u65B0\u589E\u65F6\u95F4",
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(FieldHint, { text: "\u6309\u300C\u9996\u6B21\u89C1\u5230\u300D\u65F6\u95F4\u7B97\uFF0C\u4E0E\u9996\u5C4F\u300C\u4ECA\u65E5\u65B0\u589E\u300D\u540C\u53E3\u5F84 \u2014\u2014 \u518D\u6293\u4E00\u6B21\u4E0D\u4F1A\u8BA9\u8001\u5C97\u4F4D\u6DF7\u8FDB\u6765\uFF08\u90A3\u662F\u300C\u6700\u8FD1\u89C1\u5230\u300D\uFF09\u3002\u5355\u9009\uFF0C\u4E0D\u9009 = \u4E0D\u9650\u3002" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-body", children: /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)(
		          "select",
		          {
		            className: "jh-select jh-input-md",
		            "aria-label": "\u53EA\u770B\u65B0\u589E",
		            value: draft.newWindow,
		            onChange: (event) => props.onNewWindow(event.target.value),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("option", { value: "", children: "\u4E0D\u9650" }),
		              JOB_NEW_WINDOWS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("option", { value: option.value, title: option.label, children: option.label }, option.value))
		            ]
		          }
		        ) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "jh-jobs-filter-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("span", { className: "jh-jobs-filter-label", children: [
		          "\u5C4F\u853D",
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(FieldHint, { text: "\u547D\u4E2D\u6807\u6CE8\u7684\u5C97\u4F4D\u4E00\u5F8B\u4E0D\u663E\u793A\u3002\u6807\u6CE8\u662F\u672C\u5730\u89C4\u5219\u7B97\u51FA\u6765\u7684\uFF08\u5916\u5305/\u9AD8\u98CE\u9669/\u50F5\u5C38\u5C97/\u9ED1\u8BDD\u7B49\uFF09\uFF0C\u4E0D\u9700\u8981\u4F60\u9010\u6761\u5224\u65AD\uFF1B\u6BCF\u4E00\u9879\u90FD\u53EF\u4EE5\u5355\u72EC\u5173\u6389\u3002\u6700\u540E\u4E00\u9879\u662F\u516C\u53F8\u9ED1\u540D\u5355\uFF1A\u62C9\u9ED1\u8FC7\u7684\u516C\u53F8\u9ED8\u8BA4\u4E0D\u663E\u793A\uFF0C\u9690\u85CF\u4E86\u51E0\u6761\u4F1A\u5728\u5217\u8868\u5934\u680F\u5199\u660E\u3002" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsx)("span", { className: "jh-jobs-filter-body", role: "group", "aria-label": "\u5C4F\u853D\u6807\u6CE8", children: JOB_FLAG_TYPES.map((type) => /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-chip jh-chip-neg${draft.excludeFlags.includes(type) ? " jh-chip-neg-on" : ""}`,
		            "aria-pressed": draft.excludeFlags.includes(type),
		            title: `\u4E0D\u663E\u793A\u6807\u6CE8\u4E3A\u300C${JOB_FLAG_LABEL[type]}\u300D\u7684\u5C97\u4F4D`,
		            onClick: () => props.onExcludeFlag(type),
		            children: JOB_FLAG_LABEL[type]
		          },
		          type
		        )) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("div", { className: "jh-jobs-filter-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("span", { className: "jh-jobs-filter-label", children: [
		          "\u6298\u53E0",
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(FieldHint, { text: "\u540C\u4E00\u6761\u5C97\u4F4D\u5728\u591A\u4E2A\u5E73\u53F0\u5404\u6293\u4E00\u6761\u65F6\u53EA\u663E\u793A\u4E00\u884C\uFF08\u5C55\u5F00\u53EF\u770B\u5404\u5E73\u53F0\u5BF9\u7167\uFF09\uFF0C\u7EC4\u5185\u4FDD\u7559\u7684\u90A3\u4E00\u6761\u8DDF\u7740\u5F53\u524D\u6392\u5E8F\u8D70\uFF08\u6309\u5339\u914D\u5206\u6392\u5C31\u7559\u5206\u6700\u9AD8\u7684\u90A3\u6761\uFF09\u3002\u6761\u6570\u4E0E\u5206\u9875\u4E5F\u8DDF\u7740\u6309\u6298\u53E0\u540E\u7B97\u3002\u9ED8\u8BA4\u5173\u95ED\uFF1A\u6298\u53E0\u4F1A\u5C11\u663E\u793A\u884C\uFF0C\u300C\u9ED8\u8BA4\u5C11\u663E\u793A\u300D\u662F\u66FF\u4F60\u505A\u51B3\u5B9A\u3002" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("span", { className: "jh-jobs-filter-body", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("label", { className: "jh-check", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		              "input",
		              {
		                type: "checkbox",
		                checked: draft.groupDuplicates,
		                onChange: (event) => props.onGroupDuplicates(event.target.checked)
		              }
		            ),
		            "\u8DE8\u5E73\u53F0\u6298\u53E0\uFF08\u540C\u4E00\u6761\u5C97\u4F4D\u53EA\u663E\u793A\u4E00\u884C\uFF09"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime30.jsxs)("label", { className: "jh-check", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime30.jsx)(
		              "input",
		              {
		                type: "checkbox",
		                checked: draft.excludeBlacklisted,
		                onChange: (event) => props.onExcludeBlacklisted(event.target.checked)
		              }
		            ),
		            "\u6392\u9664\u5DF2\u62C9\u9ED1\u516C\u53F8\u7684\u5C97\u4F4D"
		          ] })
		        ] })
		      ] })
		    ] })
		  ] });
		}

		// src/client/screens/jobs/filters.ts
		var EMPTY_FILTERS = {
		  q: "",
		  cities: [],
		  expBuckets: [],
		  eduReqs: [],
		  state: "",
		  minSalary: "",
		  minScore: "",
		  excludeFlags: [],
		  // 「排除已拉黑公司」默认**开着**（第五轮，批次 B）：拉黑一家公司之后，
		  // 它在岗位库里继续天天出现是显而易见的浪费。但这件事绝不静默 ——
		  // 列表头栏会写明"已隐藏 N 条"，一键就能显示回来（见 `index.tsx`）。
		  excludeBlacklisted: true,
		  groupDuplicates: false,
		  newWindow: "",
		  orderBy: "crawled_at",
		  descending: true
		};
		function toggleValue(list, value) {
		  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
		}
		function sameFilters(left, right) {
		  const sameList = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
		  return left.q === right.q && left.state === right.state && left.minSalary === right.minSalary && left.minScore === right.minScore && left.newWindow === right.newWindow && left.groupDuplicates === right.groupDuplicates && left.excludeBlacklisted === right.excludeBlacklisted && left.orderBy === right.orderBy && left.descending === right.descending && sameList(left.cities, right.cities) && sameList(left.expBuckets, right.expBuckets) && sameList(left.eduReqs, right.eduReqs) && sameList(left.excludeFlags, right.excludeFlags);
		}
		function digitsOf(value) {
		  return value.replace(/[^0-9]/g, "");
		}
		function clampScoreInput(value) {
		  const digits = digitsOf(value).slice(0, 3);
		  if (digits === "") return "";
		  return String(Math.min(100, Number(digits)));
		}
		function salaryInput(value) {
		  return digitsOf(value).slice(0, 7);
		}
		function expandExpBuckets(ids, chips) {
		  const wanted = new Set(ids);
		  return chips.filter((chip) => wanted.has(chip.id)).flatMap((chip) => chip.values);
		}
		function firstSeenSinceOf(window2, now = Date.now()) {
		  const found = JOB_NEW_WINDOWS.find((item) => item.value === window2);
		  if (found === void 0) return void 0;
		  return new Date(now - found.hours * 60 * 60 * 1e3).toISOString();
		}
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

		// src/client/net/dedup.ts
		async function fetchDedupGroups(signal) {
		  return await request(
		    "/dedup/groups",
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function fetchDedupGroup(groupId, signal) {
		  const result = await request(
		    `/dedup/groups/${String(groupId)}`,
		    signal === void 0 ? {} : { signal }
		  );
		  return result.group;
		}
		async function runDedupSweep() {
		  return await request("/dedup/run", { method: "POST", body: JSON.stringify({}) });
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

		// src/client/screens/jobs/dedup-compare-pane.tsx
		var import_jsx_runtime31 = require("react/jsx-runtime");
		function DedupComparePane(props) {
		  const { state } = useAsync((signal) => fetchDedupGroup(props.groupId, signal), [props.groupId]);
		  if (state.status === "loading") {
		    return /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u8BFB\u53D6\u540C\u5C97\u4F4D\u7684\u5176\u5B83\u6765\u6E90\u2026" });
		  }
		  if (state.status === "error") return /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(ErrorLine, { children: state.message });
		  const group = state.data;
		  return /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("div", { className: "jh-dedup-pane", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("div", { className: "jh-muted", children: [
		      "\u5224\u5B9A\u4F9D\u636E\uFF1A",
		      group.basis
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("table", { className: "jh-table jh-table-matrix", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("th", { scope: "col", children: "\u6765\u6E90" }),
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("th", { scope: "col", children: "\u6807\u9898" }),
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("th", { scope: "col", children: "\u85AA\u8D44" }),
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("th", { scope: "col", className: "jh-col-hide-sm", children: "\u57CE\u5E02" }),
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("th", { scope: "col", children: "\u539F\u9875\u9762" })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("tbody", { children: group.members.map((member) => /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsxs)("td", { children: [
		          member.platformName ?? member.platformId,
		          member.isPrimary ? /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("span", { className: "jh-muted", children: "\uFF08\u4E3B\uFF09" }) : null
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("button", { type: "button", className: "jh-link", onClick: () => props.onSelect(member.id), children: member.title }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("td", { className: "jh-num", children: member.salaryRaw }),
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("td", { className: "jh-col-hide-sm", children: member.city }),
		        /* @__PURE__ */ (0, import_jsx_runtime31.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(
		          "a",
		          {
		            className: "jh-link",
		            href: member.sourceUrl,
		            target: "_blank",
		            rel: "noreferrer",
		            title: "\u5728\u65B0\u7A97\u53E3\u6253\u5F00\u539F\u9875\u9762",
		            "aria-label": `\u6253\u5F00\u539F\u9875\u9762\uFF08\u65B0\u7A97\u53E3\uFF09\uFF1A${member.title}`,
		            children: "\u6253\u5F00"
		          }
		        ) })
		      ] }, member.id)) })
		    ] }) })
		  ] });
		}

		// src/client/screens/jobs/job-row.tsx
		var import_jsx_runtime32 = require("react/jsx-runtime");
		function JobRow(props) {
		  const job = props.job;
		  const active = props.active;
		  const requirements = [job.expReq, job.eduReq].filter((item) => item !== "").join("\xB7");
		  const crawled = relativeTime(job.crawledAt) ?? job.crawledAt;
		  const seen = relativeTime(job.lastSeenAt) ?? job.lastSeenAt;
		  const freshness = jobFreshnessOf(job.lastSeenAt);
		  const badge = jobProgressBadgeOf(job);
		  const stateMark = badge.source !== "state" && job.state !== "new" && job.state !== "seen" ? JOB_STATE_LABEL[job.state] : null;
		  const statusText = stateMark === null ? badge.label : `${badge.label}\uFF0C${stateMark}`;
		  const dedupGroupId = job.dedupGroupId;
		  const signals = [
		    job.matchScore === null ? "" : `\u7C97\u7B5B ${String(job.matchScore)}`,
		    job.flagTypes.map((type) => JOB_FLAG_LABEL[type]).join("\u3001")
		  ].filter((item) => item !== "").join("\uFF0C");
		  return /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("li", { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("div", { className: "jh-job-row", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("label", { className: "jh-job-pick", children: /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
		        "input",
		        {
		          type: "checkbox",
		          checked: props.picked,
		          "aria-label": `\u9009\u4E2D\u300C${job.title}\u300D\uFF08\u7528\u4E8E\u6279\u91CF\u6253\u62DB\u547C\uFF09`,
		          onChange: (event) => props.onTogglePick(job.id, event.target.checked)
		        }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)(
		        "button",
		        {
		          type: "button",
		          className: `jh-job${active ? " jh-job-active" : ""}`,
		          "data-job-id": job.id,
		          "aria-current": active ? "true" : void 0,
		          "aria-label": `\u5C97\u4F4D\uFF1A${job.title}\uFF0C${job.salaryRaw}\uFF0C${job.city}${job.district === "" ? "" : `\xB7${job.district}`}\uFF0C${statusText}${signals === "" ? "" : `\uFF0C${signals}`}`,
		          onClick: () => props.onSelect(job.id),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("span", { className: "jh-job-main", "aria-hidden": "true", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "jh-job-title", children: job.title }),
		              /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("span", { className: "jh-job-meta", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("b", { className: "jh-salary", children: job.salaryRaw }),
		                /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("span", { children: [
		                  job.city,
		                  job.district === "" ? "" : `\xB7${job.district}`
		                ] }),
		                requirements === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { children: requirements }),
		                /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "jh-job-company", children: job.companyName ?? "\u2014" })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("span", { className: "jh-job-origin", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { children: job.platformName ?? job.platformId }),
		                /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("span", { title: formatLocalDateTime(job.crawledAt), children: [
		                  "\u6293\u53D6 ",
		                  crawled
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)(
		                  "span",
		                  {
		                    className: freshness === null ? void 0 : freshness.level === "fresh" ? "jh-ok" : freshness.level === "stale" ? "jh-warn" : "jh-error",
		                    title: `\u6211\u4EEC\u6700\u8FD1\u4E00\u6B21\u5728\u5E73\u53F0\u4E0A\u89C1\u5230\u5B83\uFF1A${formatLocalDateTime(job.lastSeenAt)}${freshness === null ? "" : `\uFF08${freshness.label}\uFF0C\u7EA6 ${String(freshness.hours)} \u5C0F\u65F6\u524D\uFF09`}`,
		                    children: [
		                      "\u6700\u8FD1\u89C1\u5230 ",
		                      seen
		                    ]
		                  }
		                ),
		                dedupGroupId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "jh-dedup-badge", title: "\u4E0E\u5176\u5B83\u5E73\u53F0\u7684\u540C\u4E00\u5C97\u4F4D\u5408\u5E76\u6210\u4E86\u4E00\u7EC4", children: "\u8DE8\u5E73\u53F0" })
		              ] }),
		              job.tags.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "jh-tags", children: job.tags.slice(0, 8).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "jh-tag", children: tag }, tag)) }),
		              (job.flagTypes.length > 0 || job.matchScore !== null) && /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("span", { className: "jh-job-signals", children: [
		                job.matchScore === null ? null : (
		                  // 明确写「粗筛」：L1 规则分不是完整评估（§4.5.1）。
		                  // 分数过期（批次 A2）时**照旧显示**，但降饱和 + 加一句"按旧简历"：
		                  // 假装配当前分数是撒谎，直接藏起来又丢掉了相对排序的信息。
		                  /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)(
		                    "span",
		                    {
		                      className: `jh-score${job.scoreStale ? " jh-score-stale" : ""}`,
		                      title: job.scoreStale ? "\u8FD9\u4E2A\u5206\u662F\u65E7\u7248\u7B80\u5386\u4E0B\u7B97\u51FA\u6765\u7684 \u2014\u2014 \u5F53\u524D\u542F\u7528\u7B80\u5386\u5DF2\u6539\u7248\u3002\u5B83\u4ECD\u80FD\u53CD\u6620\u5F53\u65F6\u7684\u76F8\u5BF9\u6392\u5E8F\uFF0C\u4F46\u8981\u4E0D\u4F5C\u6570\u3002\u7528\u5217\u8868\u5934\u680F\u7684\u300C\u91CD\u7B97\u8FC7\u671F\u5206\u6570\u300D\u5237\u65B0\u3002" : void 0,
		                      children: [
		                        "\u7C97\u7B5B ",
		                        Math.round(job.matchScore),
		                        job.scoreStale ? "\uFF08\u6309\u65E7\u7B80\u5386\uFF09" : ""
		                      ]
		                    }
		                  )
		                ),
		                job.flagTypes.map((type) => /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: `jh-flag jh-flag-${type}`, children: JOB_FLAG_LABEL[type] }, type))
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
		              "span",
		              {
		                className: `jh-state${badge.variant === "" ? "" : ` jh-state-${badge.variant}`}`,
		                title: badge.source === "application" ? `\u6295\u9012\u9636\u6BB5\uFF1A${badge.label}\uFF08\u6700\u8FD1\u4E00\u6B21\u6295\u9012\u7684\u72B6\u6001\uFF09` : badge.source === "contact" ? `\u63A5\u89E6\u6001\uFF1A${badge.label}\uFF08\u6700\u8FD1\u4E00\u6761\u6253\u62DB\u547C\u8BB0\u5F55\u7684\u72B6\u6001\uFF09` : `\u5C97\u4F4D\u5904\u7F6E\u6001\uFF1A${badge.label}`,
		                "aria-hidden": "true",
		                children: badge.label
		              }
		            ),
		            stateMark === null ? null : /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: `jh-state jh-state-${job.state}`, title: `\u5C97\u4F4D\u5904\u7F6E\u6001\uFF1A${stateMark}`, "aria-hidden": "true", children: stateMark })
		          ]
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)("span", { className: "jh-job-quick", role: "group", "aria-label": "\u884C\u5185\u52A8\u4F5C", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-job-qk",
		            "aria-label": job.contactStage === "none" ? "\u6253\u62DB\u547C" : CONTACT_STAGE_LABEL[job.contactStage],
		            title: job.contactStage === "none" ? "\u6253\u62DB\u547C\uFF08\u5148\u53EA\u8BFB\u9884\u89C8\uFF0C\u786E\u8BA4\u540E\u624D\u53D1\uFF09" : `${CONTACT_STAGE_LABEL[job.contactStage]} \u2014\u2014 \u4E0D\u91CD\u590D\u53D1`,
		            disabled: job.contactStage !== "none",
		            onClick: () => props.onGreet(job.id),
		            children: /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(IconChat, {})
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-job-qk",
		            "aria-label": job.applicationStage === null ? "\u6295\u9012\u7B80\u5386" : APPLICATION_STAGE_LABEL[job.applicationStage],
		            title: job.applicationStage === null ? "\u6295\u9012\u7B80\u5386\uFF08\u4E0D\u53EF\u9006\uFF0C\u9884\u89C8\u91CC\u786E\u8BA4\u540E\u624D\u53D1\uFF09" : `${APPLICATION_STAGE_LABEL[job.applicationStage]} \u2014\u2014 \u4E0D\u91CD\u590D\u6295`,
		            disabled: job.applicationStage !== null,
		            onClick: () => props.onDeliver(job.id),
		            children: /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(IconSend, {})
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-job-qk${job.state === "ignored" ? " jh-job-qk-ign" : ""}`,
		            "aria-label": job.state === "ignored" ? "\u6062\u590D" : "\u5212\u6389",
		            "aria-pressed": job.state === "ignored",
		            title: job.state === "ignored" ? "\u53D6\u6D88\u5212\u6389\uFF08\u56DE\u5230\u5DF2\u8BFB\uFF09" : "\u5212\u6389\uFF08\u5FFD\u7565\uFF09",
		            disabled: props.marking,
		            onClick: () => void props.onQuickMark(job.id, job.state === "ignored" ? "seen" : "ignored"),
		            children: "\u2715"
		          }
		        )
		      ] })
		    ] }),
		    dedupGroupId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
		      "button",
		      {
		        type: "button",
		        className: `jh-dedup-toggle${props.openGroup === dedupGroupId ? " jh-dedup-toggle-on" : ""}`,
		        "aria-expanded": props.openGroup === dedupGroupId,
		        title: "\u8FD9\u6761\u5C97\u4F4D\u5728\u522B\u7684\u5E73\u53F0\u4E5F\u5728\u62DB \u2014\u2014 \u70B9\u5F00\u770B\u5404\u5E73\u53F0\u7684\u5BF9\u7167",
		        onClick: () => props.onToggleGroup(dedupGroupId),
		        children: props.openGroup === dedupGroupId ? "\u6536\u8D77\u8DE8\u5E73\u53F0\u5BF9\u7167" : "\u8DE8\u5E73\u53F0\u5BF9\u7167"
		      }
		    ),
		    dedupGroupId === null || props.openGroup !== dedupGroupId ? null : /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(DedupComparePane, { groupId: dedupGroupId, onSelect: props.onSelect })
		  ] });
		}

		// src/client/screens/jobs/pager.tsx
		var import_jsx_runtime33 = require("react/jsx-runtime");
		function Pager(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime33.jsxs)("nav", { className: "jh-pager", "aria-label": "\u5206\u9875", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime33.jsx)(
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
		      (item, index) => item === "\u2026" ? /* @__PURE__ */ (0, import_jsx_runtime33.jsx)("span", { className: "jh-pg-gap", children: "\u2026" }, `gap-${String(index)}`) : /* @__PURE__ */ (0, import_jsx_runtime33.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime33.jsx)(
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

		// src/client/screens/jobs/index.tsx
		var import_jsx_runtime34 = require("react/jsx-runtime");
		function reasonOf3(error) {
		  return error instanceof ApiError ? error.display : error instanceof Error ? error.message : String(error);
		}
		function JobsScreen(props) {
		  const [draft, setDraft] = (0, import_react16.useState)(EMPTY_FILTERS);
		  const [applied, setApplied] = (0, import_react16.useState)(EMPTY_FILTERS);
		  const [page, setPage] = (0, import_react16.useState)(1);
		  const [openGroup, setOpenGroup] = (0, import_react16.useState)(null);
		  const [advancedOpen, setAdvancedOpen] = (0, import_react16.useState)(false);
		  const [picked, setPicked] = (0, import_react16.useState)([]);
		  const [greetTargets, setGreetTargets] = (0, import_react16.useState)(null);
		  const [deliverTargets, setDeliverTargets] = (0, import_react16.useState)(null);
		  const [notice, setNotice] = (0, import_react16.useState)(null);
		  const [views, setViews] = (0, import_react16.useState)([]);
		  const [appliedViewId, setAppliedViewId] = (0, import_react16.useState)("");
		  const [markingBatch, setMarkingBatch] = (0, import_react16.useState)(false);
		  const [undoMark, setUndoMark] = (0, import_react16.useState)(null);
		  const [recomputing, setRecomputing] = (0, import_react16.useState)(false);
		  const facets = useAsync((signal) => fetchJobFacets(signal), []);
		  const facetData = facets.state.status === "ok" ? facets.state.data : null;
		  const citiesAll = facetData?.cities ?? [];
		  const eduAll = sortEduValues(facetData?.eduReqs ?? []);
		  const expChips = buildExpChips(facetData?.expReqs ?? []);
		  const appliedExpReqs = expandExpBuckets(applied.expBuckets, expChips);
		  const viewsQuery = useAsync((signal) => fetchJobViews(signal), []);
		  (0, import_react16.useEffect)(() => {
		    if (viewsQuery.state.status === "ok") setViews(viewsQuery.state.data.views);
		  }, [viewsQuery.state]);
		  const { state, reload, refreshing } = useAsync(
		    (signal) => fetchJobs(
		      {
		        q: applied.q,
		        cities: applied.cities,
		        expReqs: appliedExpReqs,
		        eduReqs: applied.eduReqs,
		        state: applied.state,
		        minSalary: applied.minSalary === "" ? null : Number(applied.minSalary),
		        // 匹配分门槛（批次 A）：空串 = 不限。未打分的岗位不会被返回（见 JobListParams）
		        minScore: applied.minScore === "" ? null : Number(applied.minScore),
		        excludeFlags: applied.excludeFlags,
		        // 排除已拉黑公司（批次 B）：默认开着，隐藏了几条由服务端算好一起回传
		        excludeBlacklisted: applied.excludeBlacklisted,
		        groupDuplicates: applied.groupDuplicates,
		        // 「只看新增」：把时间窗算成 ISO 再传（宿主只做比较，不猜"今天"从哪算起）
		        firstSeenSince: firstSeenSinceOf(applied.newWindow),
		        orderBy: applied.orderBy,
		        descending: applied.descending,
		        page,
		        pageSize: PAGE_SIZE_DEFAULT
		      },
		      signal
		    ),
		    // `appliedExpReqs` 是 facet 的函数，而 facet 比首屏查询晚到 ——
		    // 不把展开结果算进依赖，梯队就会"选了没反应"（第一次查询根本没带上它）。
		    [props.revision, applied, page, appliedExpReqs.join(",")],
		    // keepPrevious（第四轮，审核 P2-6）：翻页 / 改筛选 / 外部刷新时列表不再整块消失 ——
		    // 这一屏是"左列表 + 右详情"的对照阅读，整列闪一下正好打断它。
		    // 重取期间沿用上一次结果，界面另用 refreshing 说明"这是旧数据，正在更新"。
		    { keepPrevious: true }
		  );
		  (0, import_react16.useEffect)(() => {
		    if (state.status !== "ok") return;
		    if (state.data.total === 0 || state.data.items.length > 0) return;
		    const lastPage = Math.max(1, Math.ceil(state.data.total / PAGE_SIZE_DEFAULT));
		    if (page > lastPage) setPage(lastPage);
		  }, [state, page]);
		  const setCity = (city) => {
		    setDraft((current) => ({ ...current, cities: city === "" ? [] : [city] }));
		  };
		  const toggleCity = (city) => {
		    setDraft((current) => ({ ...current, cities: toggleValue(current.cities, city) }));
		  };
		  const setKeyword = (q) => {
		    setDraft({ ...draft, q });
		  };
		  const setState = (state2) => {
		    setDraft({ ...draft, state: state2 });
		  };
		  const setMinSalary = (minSalary) => {
		    setDraft({ ...draft, minSalary: salaryInput(minSalary) });
		  };
		  const setMinScore = (minScore) => {
		    setDraft({ ...draft, minScore: clampScoreInput(minScore) });
		  };
		  const setExcludeBlacklisted = (excludeBlacklisted) => {
		    setDraft((current) => ({ ...current, excludeBlacklisted }));
		  };
		  const showBlacklistedJobs = () => {
		    setDraft((current) => ({ ...current, excludeBlacklisted: false }));
		    setApplied((current) => ({ ...current, excludeBlacklisted: false }));
		    setPage(1);
		  };
		  const setNewWindow = (newWindow) => {
		    setDraft({ ...draft, newWindow });
		  };
		  const setGroupDuplicates = (groupDuplicates) => {
		    setDraft((current) => ({ ...current, groupDuplicates }));
		  };
		  const toggleAdvanced = () => {
		    setAdvancedOpen((open) => !open);
		  };
		  const toggleExpBucket = (id) => {
		    setDraft((current) => ({ ...current, expBuckets: toggleValue(current.expBuckets, id) }));
		  };
		  const toggleEdu = (value) => {
		    setDraft((current) => ({ ...current, eduReqs: toggleValue(current.eduReqs, value) }));
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
		    const using = views.find((item) => item.id === appliedViewId);
		    if (using !== void 0 && !sameFilters(draft, using.filters)) setAppliedViewId("");
		  };
		  const reset = () => {
		    setDraft(EMPTY_FILTERS);
		    setApplied(EMPTY_FILTERS);
		    setPage(1);
		    setAppliedViewId("");
		  };
		  const changeOrder = (orderBy) => {
		    setDraft((current) => ({ ...current, orderBy }));
		    setApplied((current) => ({ ...current, orderBy }));
		    setPage(1);
		  };
		  const greetOne = (id) => {
		    setNotice(null);
		    setGreetTargets([id]);
		  };
		  const deliverOne = (id) => {
		    setNotice(null);
		    setDeliverTargets([id]);
		  };
		  const greetPicked = () => {
		    setNotice(null);
		    setGreetTargets(picked);
		  };
		  const deliverPicked = () => {
		    setNotice(null);
		    setDeliverTargets(picked);
		  };
		  const clearPicked = () => {
		    setPicked([]);
		  };
		  const markPicked = async (next) => {
		    if (picked.length === 0) return;
		    const ids = picked;
		    setMarkingBatch(true);
		    setNotice(null);
		    try {
		      const result = await markJobs(ids, next);
		      const label = JOB_STATE_LABEL[next];
		      setNotice({
		        tone: result.missing.length === 0 ? "ok" : "error",
		        text: `\u5DF2\u628A ${String(result.total)} \u6761\u6807\u4E3A\u300C${label}\u300D` + (result.missing.length === 0 ? "" : `\uFF1B\u6709 ${String(result.missing.length)} \u6761\u5DF2\u4E0D\u5B58\u5728\uFF08${result.missing.join("\u3001")}\uFF09`)
		      });
		      setUndoMark({ ids: result.missing.length === 0 ? ids : ids.filter((id) => !result.missing.includes(id)), count: result.total });
		      setPicked([]);
		      reload();
		      props.onChanged();
		    } catch (error) {
		      setNotice({ tone: "error", text: `\u6279\u91CF\u6807\u8BB0\u5931\u8D25\uFF1A${reasonOf3(error)}` });
		    } finally {
		      setMarkingBatch(false);
		    }
		  };
		  const undoLastMark = async () => {
		    if (undoMark === null || undoMark.ids.length === 0) return;
		    setMarkingBatch(true);
		    try {
		      const result = await markJobs(undoMark.ids, "seen");
		      setNotice({ tone: "ok", text: `\u5DF2\u628A ${String(result.total)} \u6761\u6807\u56DE\u300C\u5DF2\u8BFB\u300D` });
		      setUndoMark(null);
		      reload();
		      props.onChanged();
		    } catch (error) {
		      setNotice({ tone: "error", text: `\u64A4\u9500\u5931\u8D25\uFF1A${reasonOf3(error)}` });
		    } finally {
		      setMarkingBatch(false);
		    }
		  };
		  const copyPicked = async () => {
		    const rows = state.status === "ok" ? state.data.items.filter((job) => picked.includes(job.id)) : [];
		    if (rows.length === 0) {
		      setNotice({ tone: "error", text: "\u672C\u9875\u6CA1\u6709\u52FE\u9009\u4E2D\u7684\u5C97\u4F4D\uFF08\u52FE\u9009\u53EF\u4EE5\u8DE8\u9875\uFF0C\u4F46\u590D\u5236\u53EA\u5E26\u672C\u9875\u90A3\u51E0\u6761\uFF09" });
		      return;
		    }
		    const ok = await copyText(jobsToMarkdown(rows));
		    setNotice(
		      ok ? { tone: "ok", text: `\u5DF2\u590D\u5236\u672C\u9875 ${String(rows.length)} \u6761\u4E3A Markdown \u8868\u683C\uFF08\u8DE8\u9875\u52FE\u9009\u7684\u5176\u4F59\u51E0\u6761\u8981\u7FFB\u5230\u90A3\u4E00\u9875\u518D\u590D\u5236\uFF09` } : { tone: "error", text: "\u590D\u5236\u5931\u8D25\uFF1A\u8FD9\u4E2A\u73AF\u5883\u91CC\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF0C\u53EF\u4EE5\u6539\u7528\u300C\u5BFC\u51FA CSV\u300D" }
		    );
		  };
		  const recomputeScores = async () => {
		    setRecomputing(true);
		    try {
		      const result = await recomputeStaleScores();
		      setNotice({ tone: "ok", text: result.note });
		      reload();
		    } catch (error) {
		      setNotice({ tone: "error", text: `\u91CD\u7B97\u5931\u8D25\uFF1A${reasonOf3(error)}` });
		    } finally {
		      setRecomputing(false);
		    }
		  };
		  const applyView = (id) => {
		    setAppliedViewId(id);
		    if (id === "") return;
		    const view = views.find((item) => item.id === id);
		    if (view === void 0) return;
		    setDraft(view.filters);
		    setApplied(view.filters);
		    setPage(1);
		  };
		  const persistViews = async (next) => {
		    try {
		      const saved = await saveJobViews(next);
		      setViews(saved.views);
		    } catch (error) {
		      setAppliedViewId("");
		      setNotice({ tone: "error", text: `\u4FDD\u5B58\u89C6\u56FE\u5931\u8D25\uFF1A${reasonOf3(error)}` });
		    }
		  };
		  const saveCurrentView = (name2) => {
		    const id = `view-${String(Date.now())}`;
		    const next = [...views, { id, name: name2, filters: applied }];
		    setAppliedViewId(id);
		    void persistViews(next);
		    setNotice({ tone: "ok", text: `\u5DF2\u4FDD\u5B58\u89C6\u56FE\u300C${name2}\u300D` });
		  };
		  const deleteView = (id) => {
		    const view = views.find((item) => item.id === id);
		    if (view === void 0) return;
		    setAppliedViewId("");
		    void persistViews(views.filter((item) => item.id !== id));
		    setNotice({ tone: "ok", text: `\u5DF2\u5220\u9664\u89C6\u56FE\u300C${view.name}\u300D\uFF08\u5217\u8868\u6761\u4EF6\u4FDD\u6301\u4E0D\u52A8\uFF09` });
		  };
		  const togglePick = (id, checked) => {
		    setPicked(
		      (current) => checked ? [...current, id] : current.filter((item) => item !== id)
		    );
		  };
		  const toggleGroup = (groupId) => {
		    setOpenGroup(openGroup === groupId ? null : groupId);
		  };
		  const [marking, setMarking] = (0, import_react16.useState)(null);
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
		  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE_DEFAULT));
		  const pendingChanges = !sameFilters(draft, applied);
		  const hasFilters = !sameFilters(applied, EMPTY_FILTERS);
		  const beyondLastPage = state.status === "ok" && state.data.items.length === 0 && total > 0 && page > pages;
		  const appliedWindowLabel = JOB_NEW_WINDOWS.find((item) => item.value === applied.newWindow)?.label ?? null;
		  const advancedCount = draft.expBuckets.length + draft.eduReqs.length + draft.excludeFlags.length + (draft.newWindow === "" ? 0 : 1) + (draft.groupDuplicates ? 1 : 0) + (draft.excludeBlacklisted ? 0 : 1);
		  const staleScoreCount = state.status === "ok" ? state.data.items.filter((job) => job.scoreStale).length : 0;
		  const hiddenByBlacklist = state.status === "ok" ? state.data.hiddenByBlacklist ?? 0 : 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "jh-jobs-split", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		      FilterBar,
		      {
		        draft,
		        citiesAll,
		        eduAll,
		        expChips,
		        advancedOpen,
		        advancedCount,
		        pending: pendingChanges,
		        views,
		        appliedViewId,
		        onSubmit: submit,
		        onReset: reset,
		        onToggleAdvanced: toggleAdvanced,
		        onKeyword: setKeyword,
		        onCity: setCity,
		        onCityToggle: toggleCity,
		        onState: setState,
		        onMinSalary: setMinSalary,
		        onMinScore: setMinScore,
		        onExpBucket: toggleExpBucket,
		        onEdu: toggleEdu,
		        onNewWindow: setNewWindow,
		        onExcludeFlag: toggleExclude,
		        onExcludeBlacklisted: setExcludeBlacklisted,
		        onGroupDuplicates: setGroupDuplicates,
		        onApplyView: applyView,
		        onSaveView: saveCurrentView,
		        onDeleteView: deleteView
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "jh-jobs-cols", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "jh-jobs-pane", "data-job-hunter": "job-list", "aria-busy": refreshing ? true : void 0, children: [
		        state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u67E5\u8BE2\u5C97\u4F4D\u2026" }),
		        state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "jh-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("h2", { className: "jh-card-title", children: "\u67E5\u8BE2\u5931\u8D25" }),
		          /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("p", { className: "jh-error", children: state.message }),
		          state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("p", { className: "jh-muted", children: state.hint }),
		          /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("button", { type: "button", className: "jh-btn", onClick: reload, children: "\u91CD\u8BD5" })
		        ] }),
		        beyondLastPage && /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u8FD9\u4E00\u9875\u5DF2\u7ECF\u6CA1\u6709\u6761\u76EE\u4E86\uFF0C\u6B63\u5728\u56DE\u5230\u6700\u540E\u4E00\u9875\u2026" }),
		        state.status === "ok" && state.data.items.length === 0 && !beyondLastPage && /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "jh-card", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("h2", { className: "jh-card-title", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5C97\u4F4D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("p", { className: "jh-muted", children: [
		            "\u5171 ",
		            state.data.total,
		            " \u6761\u3002\u6362\u4E2A\u5173\u952E\u8BCD\u6216\u653E\u5BBD\u7B5B\u9009\u6761\u4EF6\u8BD5\u8BD5\uFF1B\u4E5F\u53EF\u4EE5\u56DE\u5230\u300C\u4ECA\u65E5\u300D\u624B\u52A8\u6293\u53D6\u4E00\u6B21\u3002"
		          ] }),
		          hiddenByBlacklist > 0 ? /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("p", { className: "jh-muted", children: [
		            "\u53E6\u6709 ",
		            hiddenByBlacklist,
		            " \u6761\u6765\u81EA\u4F60\u62C9\u9ED1\u8FC7\u7684\u516C\u53F8\uFF08\u88AB\u4F60\u8BBE\u7F6E\u7684\u300C\u6392\u9664\u5DF2\u62C9\u9ED1\u516C\u53F8\u300D\u6321\u4F4F\u4E86\uFF09\xB7",
		            /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("button", { type: "button", className: "jh-link", onClick: showBlacklistedJobs, children: [
		              "\u663E\u793A\u8FD9 ",
		              hiddenByBlacklist,
		              " \u6761"
		            ] })
		          ] }) : null,
		          hasFilters ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("button", { type: "button", className: "jh-btn", onClick: reset, children: "\u6E05\u9664\u7B5B\u9009\u6761\u4EF6" }) : null
		        ] }),
		        state.status === "ok" && state.data.items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)(import_jsx_runtime34.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("div", { className: "jh-listbar", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("span", { className: "jh-muted", children: [
		              "\u5171 ",
		              state.data.total,
		              " \u6761",
		              applied.groupDuplicates ? "\uFF08\u5DF2\u6309\u8DE8\u5E73\u53F0\u6298\u53E0\uFF0C\u540C\u4E00\u6761\u5C97\u4F4D\u53EA\u7B97\u4E00\u884C\uFF09" : "",
		              appliedWindowLabel === null ? "" : `\uFF08\u53EA\u770B${appliedWindowLabel}\u7684\u65B0\u589E\uFF09`,
		              " \xB7 \u7B2C",
		              " ",
		              state.data.page,
		              " / ",
		              pages,
		              " \u9875"
		            ] }),
		            hiddenByBlacklist === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)(
		              "button",
		              {
		                type: "button",
		                className: "jh-link",
		                title: "\u8FD9\u4E9B\u5C97\u4F4D\u6765\u81EA\u4F60\u62C9\u9ED1\u8FC7\u7684\u516C\u53F8\u3002\u70B9\u4E00\u4E0B\u663E\u793A\u56DE\u6765\uFF08\u4F1A\u5173\u6389\u300C\u6392\u9664\u5DF2\u62C9\u9ED1\u516C\u53F8\u7684\u5C97\u4F4D\u300D\u8FD9\u4E2A\u7B5B\u9009\uFF09",
		                onClick: showBlacklistedJobs,
		                children: [
		                  "\u5DF2\u9690\u85CF ",
		                  hiddenByBlacklist,
		                  " \u6761\uFF08\u5DF2\u62C9\u9ED1\u516C\u53F8\uFF09\xB7 \u663E\u793A"
		                ]
		              }
		            ),
		            refreshing ? /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("span", { className: "jh-refreshing", role: "status", children: "\u66F4\u65B0\u4E2D\u2026" }) : null,
		            staleScoreCount === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("span", { className: "jh-refreshing", children: [
		              "\u672C\u9875 ",
		              staleScoreCount,
		              " \u6761\u5206\u6570\u5DF2\u8FC7\u671F\uFF08\u6309\u65E7\u7B80\u5386\u7B97\u7684\uFF09\xB7",
		              /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		                "button",
		                {
		                  type: "button",
		                  className: "jh-link",
		                  disabled: recomputing,
		                  onClick: () => void recomputeScores(),
		                  children: recomputing ? "\u91CD\u7B97\u4E2D\u2026" : "\u91CD\u7B97\u8FC7\u671F\u5206\u6570"
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("span", { className: "jh-listbar-right", children: [
		              state.data.items.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("label", { className: "jh-check", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		                  "input",
		                  {
		                    type: "checkbox",
		                    checked: state.data.items.every((job) => picked.includes(job.id)) && state.data.items.length > 0,
		                    onChange: (event) => setPicked((current) => {
		                      const ids = state.data.items.map((job) => job.id);
		                      if (!event.target.checked) return current.filter((id) => !ids.includes(id));
		                      return [...current, ...ids.filter((id) => !current.includes(id))];
		                    })
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("span", { children: "\u9009\u4E2D\u672C\u9875" })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("label", { className: "jh-sort", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("span", { className: "jh-sort-label", children: "\u6392\u5E8F" }),
		                /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		                  "select",
		                  {
		                    className: "jh-select jh-sort-select",
		                    value: applied.orderBy,
		                    onChange: (event) => changeOrder(event.target.value),
		                    children: JOB_ORDER_OPTIONS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("option", { value: option.value, children: option.label }, option.value))
		                  }
		                )
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(Pager, { page: state.data.page, pages, hasMore: state.data.hasMore, onGo: setPage })
		            ] })
		          ] }),
		          notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		            "p",
		            {
		              className: notice.tone === "ok" ? "jh-ok" : "jh-error",
		              role: notice.tone === "ok" ? "status" : "alert",
		              children: notice.text
		            }
		          ),
		          undoMark === null ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)("p", { className: "jh-muted", children: [
		            "\u521A\u5904\u7F6E\u7684\u90A3\u6279\u8FD8\u53EF\u4EE5\u64A4\u9500\uFF1A",
		            /* @__PURE__ */ (0, import_jsx_runtime34.jsxs)(
		              "button",
		              {
		                type: "button",
		                className: "jh-link",
		                disabled: markingBatch,
		                onClick: () => void undoLastMark(),
		                children: [
		                  "\u64A4\u9500 ",
		                  undoMark.count,
		                  " \u6761\uFF08\u6807\u56DE\u300C\u5DF2\u8BFB\u300D\uFF09"
		                ]
		              }
		            )
		          ] }),
		          picked.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		            BatchToolbar,
		            {
		              count: picked.length,
		              busy: markingBatch,
		              exportHref: jobsExportUrl(picked),
		              onGreet: greetPicked,
		              onDeliver: deliverPicked,
		              onMark: (next) => void markPicked(next),
		              onCopy: () => void copyPicked(),
		              onClear: clearPicked
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime34.jsx)("ul", { className: "jh-jobs", children: state.data.items.map((job) => /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		            JobRow,
		            {
		              job,
		              active: job.id === props.selected,
		              picked: picked.includes(job.id),
		              marking: marking === job.id,
		              openGroup,
		              onSelect: props.onSelect,
		              onTogglePick: togglePick,
		              onGreet: greetOne,
		              onDeliver: deliverOne,
		              onQuickMark: quickMark,
		              onToggleGroup: toggleGroup
		            },
		            job.id
		          )) })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		        JobDetailPane,
		        {
		          id: props.selected,
		          revision: props.revision,
		          onChanged: props.onChanged,
		          onSelect: props.onSelect
		        }
		      )
		    ] }),
		    greetTargets === null ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		      BatchGreetingModal,
		      {
		        jobIds: greetTargets,
		        onClose: () => setGreetTargets(null),
		        onBatchDone: () => {
		          reload();
		          props.onChanged();
		        },
		        notify: (tone, text) => setNotice({ tone, text })
		      }
		    ),
		    deliverTargets === null ? null : /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
		      BatchDeliverModal,
		      {
		        jobIds: deliverTargets,
		        onClose: () => setDeliverTargets(null),
		        onBatchDone: () => {
		          reload();
		          props.onChanged();
		        },
		        notify: (tone, text) => setNotice({ tone, text })
		      }
		    )
		  ] });
		}

		// src/shared/contract/enums/interview.ts
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

		// src/shared/contract/enums/message.ts
		var REPLY_SCENARIOS = [
		  { key: "negotiate-time", label: "\u534F\u5546\u9762\u8BD5\u65F6\u95F4" },
		  { key: "salary", label: "\u8BE2\u95EE\u85AA\u8D44\u7ED3\u6784" },
		  { key: "decline", label: "\u5A49\u62D2\u9080\u7EA6" }
		];
		var REPLY_SCENARIO_LABEL = Object.fromEntries(
		  REPLY_SCENARIOS.map((item) => [item.key, item.label])
		);

		// src/client/net/collect/platforms.ts
		async function fetchPlatforms(signal) {
		  return await request("/platforms", signal === void 0 ? {} : { signal });
		}
		async function startLogin(platformId) {
		  const result = await request(
		    `/platforms/${encodeURIComponent(platformId)}/login/start`,
		    { method: "POST", body: JSON.stringify({}) }
		  );
		  return result.login;
		}
		async function checkLogin(platformId) {
		  const result = await request(
		    `/platforms/${encodeURIComponent(platformId)}/login/check`,
		    { method: "POST", body: JSON.stringify({}) }
		  );
		  return result.check;
		}
		async function fetchRepairs(platformId, signal) {
		  const suffix = platformId === void 0 || platformId === "" ? "" : `?platformId=${encodeURIComponent(platformId)}`;
		  return await request(`/repairs${suffix}`, signal === void 0 ? {} : { signal });
		}
		async function discardRepair(id) {
		  await request(`/repairs/${String(id)}/discard`, { method: "POST", body: JSON.stringify({}) });
		}
		async function clearRepairs(platformId) {
		  const result = await request("/repairs/clear", {
		    method: "POST",
		    body: JSON.stringify({ platformId })
		  });
		  return result.cleared;
		}
		async function fetchAdapterConfig(platformId, signal) {
		  return await request(
		    `/platforms/${encodeURIComponent(platformId)}/adapter-config`,
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function updateAdapterConfig(platformId, override) {
		  const result = await request(
		    `/platforms/${encodeURIComponent(platformId)}/adapter-config`,
		    { method: "PUT", body: JSON.stringify({ override }) }
		  );
		  return result.config;
		}

		// src/client/net/inbox.ts
		async function syncInbox(input) {
		  const result = await request("/inbox/sync", { method: "POST", body: JSON.stringify(input) });
		  return result.result;
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
		  await request(`/messages/${String(id)}/reply`, {
		    method: "POST",
		    body: JSON.stringify({ content, confirm })
		  });
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

		// src/client/screens/inbox/index.tsx
		var import_react17 = require("react");
		var import_jsx_runtime35 = require("react/jsx-runtime");
		function InboxScreen(props) {
		  const inbox = useAsync((signal) => fetchInbox({}, signal), [props.revision]);
		  const [unreadOnly, setUnreadOnly] = (0, import_react17.useState)(false);
		  const filtered = useAsync(
		    (signal) => fetchInbox({ unreadOnly }, signal),
		    [props.revision, unreadOnly]
		  );
		  const [draft, setDraft] = (0, import_react17.useState)("");
		  const [replyTo, setReplyTo] = (0, import_react17.useState)(null);
		  const [replyText, setReplyText] = (0, import_react17.useState)("");
		  const [draftingScenario, setDraftingScenario] = (0, import_react17.useState)(null);
		  const [busy, setBusy] = (0, import_react17.useState)(false);
		  const [syncing, setSyncing] = (0, import_react17.useState)(false);
		  const [error, setError] = (0, import_react17.useState)(null);
		  const [notice, setNotice] = (0, import_react17.useState)(null);
		  const syncFromPlatforms = async () => {
		    setSyncing(true);
		    setError(null);
		    setNotice(null);
		    try {
		      const listed = await fetchPlatforms();
		      const targets = listed.items.filter(
		        (item) => item.implementation.actions.readInbox && item.account.loggedIn
		      );
		      if (targets.length === 0) {
		        setNotice(
		          "\u6CA1\u6709\u53EF\u540C\u6B65\u7684\u5E73\u53F0\uFF1A\u9700\u8981**\u5DF2\u767B\u5F55**\u4E14\u9002\u914D\u5668\u5B9E\u73B0\u4E86\u6536\u4EF6\u7BB1\u8BFB\u53D6\uFF08\u76EE\u524D\u662F BOSS \u76F4\u8058 / \u667A\u8054\u62DB\u8058\uFF09\u3002\u5148\u53BB\u300C\u91C7\u96C6\u300D\u9875\u5B8C\u6210\u767B\u5F55\u3002"
		        );
		        return;
		      }
		      const parts = [];
		      for (const item of targets) {
		        const result = await syncInbox({ platformId: item.id });
		        parts.push(
		          `${item.displayName} \u8BFB\u5230 ${String(result.fetched)} \u6761\uFF08\u65B0\u589E ${String(result.recorded)}\u3001\u91CD\u590D ${String(result.duplicates)}\u3001\u672A\u8BFB ${String(result.unread)}\uFF09`
		        );
		      }
		      setNotice(`\u6536\u4EF6\u7BB1\u540C\u6B65\u5B8C\u6210 \u2014\u2014 ${parts.join("\uFF1B")}`);
		      props.onChanged();
		    } catch (caught) {
		      setError(
		        caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught)
		      );
		    } finally {
		      setSyncing(false);
		    }
		  };
		  const [extracting, setExtracting] = (0, import_react17.useState)(null);
		  const [creating, setCreating] = (0, import_react17.useState)(false);
		  const [extractPanel, setExtractPanel] = (0, import_react17.useState)(null);
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
		  return /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("h2", { className: "jh-card-title", children: "\u6D88\u606F\u4E2D\u5FC3" }),
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("span", { className: "jh-muted", children: [
		        "\u672A\u8BFB ",
		        data?.unread ?? 0,
		        " \u6761"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: syncing,
		          onClick: () => void syncFromPlatforms(),
		          children: syncing ? "\u540C\u6B65\u4E2D\u2026" : "\u540C\u6B65\u6536\u4EF6\u7BB1"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		        "button",
		        {
		          type: "button",
		          className: `jh-btn jh-btn-inline${unreadOnly ? " jh-btn-active" : ""}`,
		          onClick: () => setUnreadOnly((value) => !value),
		          children: "\u53EA\u770B\u672A\u8BFB"
		        }
		      )
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("h3", { className: "jh-card-title", children: "\u624B\u52A8\u5F55\u5165\u4E00\u6761\u6D88\u606F" }),
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("p", { className: "jh-muted", children: '\u5E73\u53F0\u6536\u4EF6\u7BB1\u53EF\u4EE5**\u81EA\u52A8\u540C\u6B65**\uFF08\u53F3\u4E0A\u89D2\u300C\u540C\u6B65\u6536\u4EF6\u7BB1\u300D\uFF0C\u6216\u76F4\u63A5\u8BA9\u6211\u8C03 `inbox_sync`\uFF09\uFF1A \u5B83\u8BFB\u5E73\u53F0\u4F1A\u8BDD\u5217\u8868\u5E76\u53BB\u91CD\u5165\u5E93\uFF0C\u8BFB\u4E0D\u5230\u65F6\u4F1A**\u5982\u5B9E\u62A5\u9519**\u800C\u4E0D\u662F\u8FD4\u56DE 0 \u6761\u3002 \u8FD9\u91CC\u7684\u624B\u52A8\u5F55\u5165\u7559\u7ED9"\u5E73\u53F0\u8BFB\u4E0D\u5230\u3001\u6216\u4F60\u60F3\u81EA\u5DF1\u8865\u4E00\u6761"\u7684\u573A\u5408\u3002' }),
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("div", { className: "jh-detail-actions", children: /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
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
		    data === null ? /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u6D88\u606F\u2026" }) : data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u6D88\u606F\u3002\u6D88\u606F\u76EE\u524D\u9760\u624B\u52A8\u5F55\u5165\uFF0C\u6216\u5728\u5C97\u4F4D\u8BE6\u60C5\u91CC\u8DDF\u8FDB\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("ul", { className: "jh-messages", children: data.items.map((message) => /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("li", { className: `jh-message jh-message-${message.direction}`, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-message-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("b", { children: message.direction === "hr" ? "HR" : "\u6211" }),
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("span", { className: "jh-muted", children: message.at.slice(0, 16).replace("T", " ") }),
		        message.jobTitle === null ? null : /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("span", { className: "jh-spacer" }),
		        message.readAt === null && message.direction === "hr" ? /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy,
		            onClick: () => void run(async () => await markMessageRead(message.id), "\u5DF2\u6807\u8BB0\u5DF2\u8BFB"),
		            children: "\u6807\u8BB0\u5DF2\u8BFB"
		          }
		        ) : null,
		        message.direction === "hr" ? /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: extracting !== null,
		            onClick: () => void handleExtract(message),
		            children: extracting === message.id ? "\u8BC6\u522B\u4E2D\u2026" : "\u8BC6\u522B\u65E5\u7A0B"
		          }
		        ) : null,
		        message.direction === "hr" ? /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("p", { className: "jh-message-body", children: message.content }),
		      message.inviteSignal?.hit === true ? /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("p", { className: "jh-warn", children: [
		        "\u26A0 \u7591\u4F3C\u9762\u8BD5\u9080\u7EA6\uFF08\u547D\u4E2D\uFF1A",
		        message.inviteSignal.keywords.join("\u3001"),
		        "\uFF09 \u2014\u2014 \u8FD9\u53EA\u662F\u63D0\u793A\uFF0C\u6539\u72B6\u6001\u8BF7\u5230\u300C\u9762\u8BD5\u65E5\u7A0B\u300D\u91CC\u663E\u5F0F\u65B0\u5EFA\u4E00\u573A\u3002"
		      ] }) : null,
		      extractPanel !== null && extractPanel.messageId === message.id ? /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-message-reply", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("p", { className: "jh-muted", children: [
		          "\u8BC6\u522B\u7ED3\u679C\uFF08\u6765\u6E90\uFF1A",
		          extractPanel.via === "llm" ? "\u6A21\u578B" : "\u89C4\u5219",
		          "\uFF09\u2014\u2014 \u6838\u5BF9\u540E\u786E\u8BA4\u624D\u8FDB\u65E5\u7A0B\u3002"
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-inline", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              type: "datetime-local",
		              "aria-label": "\u9762\u8BD5\u65F6\u95F4",
		              value: extractPanel.at,
		              onChange: (event) => patchExtract({ at: event.target.value })
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		            "select",
		            {
		              className: "jh-select jh-input-sm",
		              "aria-label": "\u9762\u8BD5\u5F62\u5F0F",
		              value: extractPanel.kind,
		              onChange: (event) => patchExtract({ kind: event.target.value }),
		              children: INTERVIEW_KINDS.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("option", { value: kind, children: INTERVIEW_KIND_LABEL[kind] }, kind))
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		            "input",
		            {
		              className: "jh-input jh-input-sm",
		              placeholder: "\u5730\u70B9",
		              "aria-label": "\u5730\u70B9",
		              value: extractPanel.place,
		              onChange: (event) => patchExtract({ place: event.target.value })
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
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
		        extractPanel.notes.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("p", { className: "jh-muted", children: extractPanel.notes.join("\uFF1B") }),
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-detail-actions", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn",
		              disabled: creating || extractPanel.at === "",
		              onClick: () => void confirmInterview(),
		              children: "\u52A0\u5165\u9762\u8BD5\u65E5\u7A0B"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
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
		      replyTo === message.id ? /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-message-reply", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)("div", { className: "jh-chips", role: "group", "aria-label": "\u6309\u60C5\u5883\u62DF\u7A3F", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("span", { className: "jh-muted", children: "\u62DF\u7A3F\uFF1A" }),
		          REPLY_SCENARIOS.map((scenario) => /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
		          "textarea",
		          {
		            className: "jh-textarea",
		            rows: 2,
		            value: replyText,
		            onChange: (event) => setReplyText(event.target.value),
		            placeholder: "\u56DE\u590D\u5185\u5BB9\u2026"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
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

		// src/client/screens/interviews/prep-panel.tsx
		var import_jsx_runtime36 = require("react/jsx-runtime");
		function PrepPanel(props) {
		  const prep = useAsync((signal) => fetchInterviewPrep(props.id, signal), [props.id]);
		  if (prep.state.status !== "ok") return /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u51C6\u5907\u2026" });
		  const data = prep.state.data;
		  return /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("p", { className: "jh-muted", children: data.commute.advice }),
		    data.matchedSkills.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("p", { className: "jh-muted", children: [
		      "\u4F60\u6709\u7684\uFF1A",
		      data.matchedSkills.join("\u3001")
		    ] }) : null,
		    data.missingSkills.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("p", { className: "jh-warn", children: [
		      "\u4F1A\u88AB\u8FFD\u95EE\u4F46\u4F60\u7B80\u5386\u91CC\u6CA1\u6709\u7684\uFF1A",
		      data.missingSkills.slice(0, 10).join("\u3001"),
		      ' \u2014\u2014 \u5982\u5B9E\u8BF4"\u6CA1\u7528\u8FC7\uFF0C\u4F46\u6211\u77E5\u9053\u5B83\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898"\uFF0C\u4E0D\u8981\u786C\u626F\u3002'
		    ] }) : null,
		    data.companyFlags.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("p", { className: "jh-warn", children: [
		      "\u516C\u53F8\u98CE\u9669\uFF1A",
		      data.companyFlags.join("\uFF1B")
		    ] }) : null,
		    data.questionNotes.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("div", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("p", { className: "jh-muted", children: "\u9519\u9898\u672C\uFF08\u6309\u88AB\u95EE\u6B21\u6570\uFF09\uFF1A" }),
		      /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("ul", { className: "jh-tailor-notes", children: data.questionNotes.slice(0, 5).map((note) => /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("li", { children: [
		        "\xB7 ",
		        note.question,
		        "\uFF08",
		        note.times,
		        " \u6B21\uFF09"
		      ] }, note.id)) })
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime36.jsx)("ul", { className: "jh-tailor-notes", children: data.checklist.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("li", { children: [
		      "\xB7 ",
		      item
		    ] }, String(index))) }),
		    data.notes.map((note, index) => /* @__PURE__ */ (0, import_jsx_runtime36.jsxs)("p", { className: "jh-muted", children: [
		      "\u6CE8\u610F\uFF1A",
		      note
		    ] }, String(index)))
		  ] });
		}

		// src/client/screens/interviews/index.tsx
		var import_react18 = require("react");
		var import_jsx_runtime37 = require("react/jsx-runtime");
		function InterviewsScreen(props) {
		  const list = useAsync((signal) => fetchInterviews(signal), [props.revision]);
		  const [busy, setBusy] = (0, import_react18.useState)(false);
		  const [error, setError] = (0, import_react18.useState)(null);
		  const [notice, setNotice] = (0, import_react18.useState)(null);
		  const [prepId, setPrepId] = (0, import_react18.useState)(null);
		  const [at, setAt] = (0, import_react18.useState)("");
		  const [kind, setKind] = (0, import_react18.useState)("video");
		  const [commute, setCommute] = (0, import_react18.useState)("");
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
		  return /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("h2", { className: "jh-card-title", children: "\u9762\u8BD5\u65E5\u7A0B" }),
		      data !== null && data.conflicts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("span", { className: "jh-warn", children: [
		        "\u26A0 ",
		        data.conflicts.length,
		        " \u5904\u65F6\u95F4\u51B2\u7A81"
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("span", { className: "jh-ok", children: "\u6CA1\u6709\u65F6\u95F4\u51B2\u7A81" })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("h3", { className: "jh-card-title", children: "\u65B0\u589E\u4E00\u573A\u9762\u8BD5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            "aria-label": "\u9762\u8BD5\u65F6\u95F4",
		            value: at,
		            onChange: (event) => setAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("select", { className: "jh-select", "aria-label": "\u9762\u8BD5\u5F62\u5F0F", value: kind, onChange: (event) => setKind(event.target.value), children: ["onsite", "video", "phone", "other"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("option", { value: item, children: INTERVIEW_KIND_LABEL[item] }, item)) }),
		        /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
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
		    data === null ? /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u9762\u8BD5\u2026" }) : data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u9762\u8BD5\u5B89\u6392\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("ul", { className: "jh-interviews", children: data.items.map((interview) => /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)(
		      "li",
		      {
		        className: `jh-interview${interview.conflicts.length > 0 ? " jh-interview-conflict" : ""}`,
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("div", { className: "jh-message-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("b", { children: interview.at.slice(0, 16).replace("T", " ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("span", { className: "jh-muted", children: [
		              INTERVIEW_KIND_LABEL[interview.kind],
		              " \xB7 \u7B2C ",
		              interview.round,
		              " \u8F6E \xB7",
		              " ",
		              INTERVIEW_STATE_LABEL[interview.state]
		            ] }),
		            interview.jobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("button", { type: "button", className: "jh-link", onClick: () => props.onSelectJob(interview.jobId), children: [
		              interview.companyName ?? "",
		              " ",
		              interview.jobTitle ?? ""
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("span", { className: "jh-muted", children: interview.hoursUntil >= 0 ? `${interview.hoursUntil} \u5C0F\u65F6\u540E` : "\u5DF2\u8FC7" })
		          ] }),
		          interview.conflicts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("p", { className: "jh-warn", children: [
		            "\u26A0 \u4E0E\u9762\u8BD5 #",
		            interview.conflicts.join("\u3001#"),
		            " \u65F6\u95F4\u51B2\u7A81"
		          ] }) : null,
		          interview.kind === "onsite" ? /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("p", { className: "jh-muted", children: interview.commuteMin === null ? '\u73B0\u573A\u9762\u8BD5\u4F46\u6CA1\u586B\u901A\u52E4\u65F6\u957F \u2014\u2014 \u5EFA\u8BAE\u8865\u4E0A\uFF0C\u5426\u5219"\u522B\u8FDF\u5230"\u5C31\u662F\u7A7A\u8BDD\u3002' : `\u5355\u7A0B\u7EA6 ${interview.commuteMin} \u5206\u949F\uFF0C\u5EFA\u8BAE\u63D0\u524D ${interview.commuteMin + 30} \u5206\u949F\u51FA\u53D1\u3002` }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime37.jsxs)("div", { className: "jh-detail-actions", children: [
		            ["confirmed", "done", "cancelled", "rescheduled"].map((state) => /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                onClick: () => setPrepId(prepId === interview.id ? null : interview.id),
		                children: prepId === interview.id ? "\u6536\u8D77\u51C6\u5907\u5305" : "\u51C6\u5907\u5305"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
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
		          prepId === interview.id ? /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(PrepPanel, { id: interview.id }) : null
		        ]
		      },
		      interview.id
		    )) })
		  ] });
		}

		// src/shared/contract/enums/analytics.ts
		var SALARY_BASES = ["monthly_min", "annualized"];
		var SALARY_BASIS_LABEL = {
		  monthly_min: "\u6708\u85AA\u4E0B\u9650\uFF08\u5143/\u6708\uFF09",
		  annualized: "\u5E74\u85AA\u6298\u7B97\uFF08\u5143/\u5E74\uFF0C\u6309 12 \u4E2A\u6708\u515C\u5E95\uFF09"
		};

		// src/client/screens/board/format.ts
		function formatRate(rate) {
		  return `${String(Math.round(rate * 100))}%`;
		}

		// src/client/screens/board/attribution-table.tsx
		var import_jsx_runtime38 = require("react/jsx-runtime");
		function bestReplyKey(rows) {
		  const candidates = rows.filter((row) => row.enoughSample && row.replied > 0);
		  if (candidates.length < 2) return null;
		  const top = Math.max(...candidates.map((row) => row.replyRate));
		  const winners = candidates.filter((row) => row.replyRate === top);
		  const winner = winners.length === 1 ? winners[0] : void 0;
		  return winner === void 0 ? null : winner.key;
		}
		var BEST_REPLY_HINT = "\u8FD9\u4E00\u7EC4\u7684\u56DE\u590D\u7387\u5728\u6240\u6709\u6837\u672C\u8DB3\u591F\u7684\u7EC4\u91CC\u6700\u9AD8\uFF1B\u5E76\u5217\u65F6\u4E0D\u7ED9\u9AD8\u4EAE\u3002";
		function AttributionTable(props) {
		  const best = bestReplyKey(props.rows);
		  if (props.rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" });
		  return (
		    /* 表格自己横向滚动，而不是把整块面板撑宽：
		       实测 320px 下面板只有 252px 可用，而 8 列表格的 min-content 是 369px ——
		       不套这一层，`.jh-body` 会整体横向滚动（顶部筛选条跟着跑掉）。 */
		    /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime38.jsxs)("table", { className: "jh-table jh-table-board", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime38.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("th", { scope: "col", children: "\u5206\u7EC4" }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("th", { scope: "col", className: "jh-num", children: "\u6295\u9012" }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("th", { scope: "col", className: "jh-num", children: "\u5DF2\u56DE\u590D" }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("th", { scope: "col", className: "jh-num", children: "\u9762\u8BD5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("th", { scope: "col", className: "jh-num", children: "Offer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("th", { scope: "col", className: "jh-num", children: "\u56DE\u590D\u7387" })
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("tbody", { children: props.rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime38.jsxs)("tr", { className: row.key === best ? "jh-row-best" : void 0, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsxs)("td", { children: [
		          row.label,
		          row.key === best ? /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("span", { className: "jh-tag jh-tag-best", title: BEST_REPLY_HINT, children: "\u56DE\u590D\u7387\u6700\u9AD8" }) : null
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("td", { className: "jh-num", children: row.total }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("td", { className: "jh-num", children: row.replied }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("td", { className: "jh-num", children: row.interviewed }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("td", { className: "jh-num", children: row.offered }),
		        /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("td", { className: "jh-num", children: formatRate(row.replyRate) })
		      ] }, row.key)) })
		    ] }) })
		  );
		}

		// src/client/screens/board/funnel-chart.tsx
		var import_jsx_runtime39 = require("react/jsx-runtime");
		function FunnelChart(props) {
		  const { steps } = props;
		  const baselineOf = (population) => steps.find((step) => step.population === population)?.count ?? 0;
		  const widthOf = (step) => stepWidth(step.count, baselineOf(step.population));
		  return /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("ol", { className: "jh-funnel-chart", children: steps.map((step, index) => {
		    const previous = index === 0 ? void 0 : steps[index - 1];
		    const boundary = previous !== void 0 && previous.population !== step.population;
		    const comparable = previous !== void 0 && previous.population === step.population;
		    const drop = comparable && previous !== void 0 ? previous.count - step.count : null;
		    const next = steps[index + 1];
		    const continues = next !== void 0 && next.population === step.population;
		    const top = widthOf(step);
		    const bottom = continues && next !== void 0 ? widthOf(next) : top;
		    const halfTop = (100 - top) / 2;
		    const halfBottom = (100 - bottom) / 2;
		    return /* @__PURE__ */ (0, import_jsx_runtime39.jsxs)("li", { className: "jh-funnel-block", children: [
		      index === 0 || boundary ? /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("p", { className: "jh-funnel-seg", children: step.population === "contact" ? "\u63A5\u89E6\u9636\u6BB5 \xB7 \u6253\u62DB\u547C\u94FE\u8DEF" : "\u6295\u9012\u9636\u6BB5 \xB7 \u6295\u9012 \u2192 \u9762\u8BD5 \u2192 Offer" }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime39.jsxs)("div", { className: "jh-funnel-row", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("span", { className: "jh-funnel-label", children: step.label }),
		        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("span", { className: "jh-funnel-track", children: /* @__PURE__ */ (0, import_jsx_runtime39.jsx)(
		          "span",
		          {
		            className: `jh-funnel-fill${step.population === "application" ? " jh-funnel-fill-apply" : ""}`,
		            style: {
		              clipPath: `polygon(${String(halfTop)}% 0, ${String(100 - halfTop)}% 0, ${String(100 - halfBottom)}% 100%, ${String(halfBottom)}% 100%)`
		            }
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-funnel-count",
		            title: "\u70B9\u5F00\u770B\u8FD9\u4E00\u6BB5\u7684\u660E\u7EC6",
		            "aria-label": `${step.label} ${String(step.count)} \u6761\uFF0C\u70B9\u5F00\u770B\u8FD9\u4E00\u6BB5\u7684\u660E\u7EC6`,
		            onClick: () => props.onDrillDown(step.key),
		            children: step.count
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("span", { className: "jh-funnel-rate", children: step.rate === null ? (
		          /* 破折号本身没有含义，解释不能只挂在 title 上（键盘与触屏都读不到）——
		             与 SampleBadge 同一个做法：正文之外再给读屏一份。 */
		          /* @__PURE__ */ (0, import_jsx_runtime39.jsxs)("span", { className: "jh-cell-empty", children: [
		            "\u2014",
		            /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("span", { className: "jh-sr-only", children: "\u8DE8\u603B\u4F53\uFF08\u63A5\u89E6 \u2192 \u6295\u9012\uFF09\u6CA1\u6709\u8F6C\u5316\u7387" })
		          ] })
		        ) : formatRate(step.rate) }),
		        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("span", { className: "jh-funnel-drop", title: drop === null || drop <= 0 ? void 0 : `\u6BD4\u4E0A\u4E00\u5C42\u5C11 ${String(drop)} \u6761`, children: drop === null || drop <= 0 ? "" : `\u2193 ${String(drop)}` })
		      ] })
		    ] }, step.key);
		  }) });
		}
		function stepWidth(count, baseline) {
		  if (baseline <= 0) return 100;
		  return Math.max(8, Math.round(count / baseline * 100));
		}

		// src/client/screens/board/salary-box-chart.tsx
		var import_react19 = require("react");
		var import_jsx_runtime40 = require("react/jsx-runtime");
		function SalaryBoxChart(props) {
		  const [hot, setHot] = (0, import_react19.useState)(null);
		  const rectRef = (0, import_react19.useRef)(null);
		  const { min, p25, median, p75, max, count, withinBox, basisLabel } = props.box;
		  if (min === null || p25 === null || median === null || p75 === null || max === null) return null;
		  const span = max - min;
		  const at = (value) => span <= 0 ? 50 : (value - min) / span * 100;
		  const flatten = span <= 0;
		  const marks = flatten ? [{ key: "median", label: "\u5168\u90E8\u540C\u503C", value: median, pos: 50 }] : [
		    { key: "p25", label: "P25", value: p25, pos: at(p25) },
		    { key: "median", label: "\u4E2D\u4F4D", value: median, pos: at(median) },
		    { key: "p75", label: "P75", value: p75, pos: at(p75) }
		  ];
		  const kept = [];
		  for (const mark of [...marks].sort((a, b) => a.key === "median" ? -1 : b.key === "median" ? 1 : 0)) {
		    if (kept.every((other) => Math.abs(other.pos - mark.pos) >= 9)) kept.push(mark);
		  }
		  const axis = kept.sort((a, b) => a.pos - b.pos);
		  return /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("div", { className: "jh-box", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)(
		      "div",
		      {
		        className: "jh-box-plot",
		        onMouseEnter: (event) => {
		          rectRef.current = event.currentTarget.getBoundingClientRect();
		        },
		        onMouseMove: (event) => {
		          const rect = rectRef.current ?? event.currentTarget.getBoundingClientRect();
		          if (rect.width <= 0) return;
		          const ratio = (event.clientX - rect.left) / rect.width * 100;
		          let nearest = "median";
		          let gap = Number.POSITIVE_INFINITY;
		          for (const mark of marks) {
		            const distance = Math.abs(mark.pos - ratio);
		            if (distance < gap) {
		              gap = distance;
		              nearest = mark.key;
		            }
		          }
		          setHot(nearest);
		        },
		        onMouseLeave: () => {
		          rectRef.current = null;
		          setHot(null);
		        },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("div", { className: "jh-box-track", children: [
		            flatten ? null : /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("div", { className: "jh-box-whisker", style: { left: `${String(at(min))}%`, width: `${String(at(max) - at(min))}%` } }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("div", { className: "jh-box-body", style: { left: `${String(at(p25))}%`, width: `${String(Math.max(0.5, at(p75) - at(p25)))}%` } }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("div", { className: "jh-box-median", style: { left: `${String(at(median))}%` }, "data-hot": hot === "median" ? "1" : "0" })
		          ] }),
		          hot === null ? null : /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("div", { className: "jh-box-tip", "aria-hidden": "true", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("p", { className: "jh-box-tip-row", "data-hot": hot === "median" ? "1" : "0", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("span", { children: "\u4E2D\u4F4D\u6570" }),
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("b", { children: median })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("p", { className: "jh-box-tip-row", "data-hot": hot === "p25" ? "1" : "0", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("span", { children: "P25" }),
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("b", { children: p25 })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("p", { className: "jh-box-tip-row", "data-hot": hot === "p75" ? "1" : "0", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("span", { children: "P75" }),
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("b", { children: p75 })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("p", { className: "jh-box-tip-row", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("span", { children: "\u7BB1\u4F53\u8DE8\u5EA6\uFF08P75\u2212P25\uFF09" }),
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("b", { children: p75 - p25 })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("p", { className: "jh-box-tip-row", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("span", { children: "\u987B\uFF08\u6781\u503C\uFF09" }),
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("b", { children: [
		                min,
		                " \u2013 ",
		                max
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("p", { className: "jh-box-tip-row", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("span", { children: "\u6837\u672C" }),
		              /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("b", { children: [
		                count,
		                " \u6761\uFF08\u7BB1\u4F53\u5185 ",
		                withinBox,
		                " \u6761\uFF09"
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("p", { className: "jh-box-tip-note", children: [
		              basisLabel,
		              "\uFF1B\u4E0D\u505A\u79BB\u7FA4\u70B9\u5254\u9664\uFF0C\u4E24\u7AEF\u5C31\u662F\u6700\u5C0F / \u6700\u5927\u503C\u3002"
		            ] })
		          ] })
		        ]
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("div", { className: "jh-box-axis", children: axis.map((mark) => /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)("span", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("span", { className: "jh-box-tickmark", style: { left: `${String(mark.pos)}%` } }),
		      /* @__PURE__ */ (0, import_jsx_runtime40.jsxs)(
		        "span",
		        {
		          className: `jh-box-ticklabel${mark.key === "median" ? " jh-box-ticklabel-key" : ""}`,
		          "data-hot": hot === mark.key ? "1" : "0",
		          "data-anchor": mark.pos <= 0 ? "start" : mark.pos >= 100 ? "end" : "center",
		          style: { left: `${String(mark.pos)}%` },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("i", { children: mark.label }),
		            /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("b", { children: mark.value })
		          ]
		        }
		      )
		    ] }, mark.key)) }),
		    /* @__PURE__ */ (0, import_jsx_runtime40.jsx)("p", { className: "jh-note", children: "\u84DD\u8272\u7BB1\u4F53 = P25\u2013P75\uFF08\u4E00\u534A\u6837\u672C\u5728\u8FD9\u91CC\u9762\uFF09\uFF1B\u987B\u7684\u4E24\u7AEF\u662F\u6700\u5C0F / \u6700\u5927\u503C\u3002 \u4E94\u4E2A\u6570\u5728\u4E0B\u9762\u4E00\u884C\uFF0C\u60AC\u505C\u8FD8\u80FD\u770B\u51FA\u5206\u4F4D\u6570\u4E4B\u5DEE\u3002" })
		  ] });
		}

		// src/client/screens/board/sample-badge.tsx
		var import_jsx_runtime41 = require("react/jsx-runtime");
		function SampleBadge(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("span", { className: `jh-tag ${props.enough ? "jh-tag-quiet" : "jh-tag-warn"}`, title: props.hint, children: [
		    props.enough ? "" : "\u26A0 ",
		    "\u6837\u672C ",
		    props.sample,
		    " \u6761",
		    /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)("span", { className: "jh-sr-only", children: [
		      "\u3002",
		      props.hint
		    ] })
		  ] });
		}

		// src/client/screens/board/index.tsx
		var import_react20 = require("react");
		var import_jsx_runtime42 = require("react/jsx-runtime");
		var FILTER_SCOPE_HINT = "\u65B9\u5411\u4E0E\u7B80\u5386\u7248\u672C\u53EA\u4F5C\u7528\u4E8E\u6295\u9012\u6BB5 \u2014\u2014 \u6253\u62DB\u547C\u6CA1\u6709\u8BB0\u5F55\u7528\u8FC7\u54EA\u7248\u7B80\u5386\uFF0F\u4EC0\u4E48\u65B9\u5411\uFF0C\u63A5\u89E6\u6BB5\uFF08\u6253\u62DB\u547C/\u9001\u8FBE/\u5DF2\u8BFB/\u56DE\u590D\uFF09\u4E0D\u53D7\u8FD9\u4E24\u9879\u5F71\u54CD\u3002\u85AA\u8D44\u6765\u81EA\u5C97\u4F4D\u5E93\uFF0C\u5B83\u7684\u65F6\u95F4\u7A97\u662F\u5C97\u4F4D\u6293\u53D6\u65F6\u95F4\uFF0C\u4E0D\u662F\u4F60\u7684\u6295\u9012\u65F6\u95F4\u3002";
		function localDayStart(date) {
		  return (/* @__PURE__ */ new Date(`${date}T00:00:00`)).toISOString();
		}
		function localDayEnd(date) {
		  return (/* @__PURE__ */ new Date(`${date}T23:59:59.999`)).toISOString();
		}
		function localDayOf(iso) {
		  if (iso === void 0 || iso === "") return "";
		  const date = new Date(iso);
		  if (Number.isNaN(date.getTime())) return "";
		  const pad2 = (value) => String(value).padStart(2, "0");
		  return `${String(date.getFullYear())}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
		}
		function cleanFilter(input) {
		  const next = { ...input };
		  for (const key of Object.keys(next)) {
		    if (next[key] === "" || next[key] === void 0) delete next[key];
		  }
		  return next;
		}
		function filterSignature(input) {
		  return Object.entries(cleanFilter(input)).sort(([a], [b]) => a < b ? -1 : 1).map(([key, value]) => `${key}=${String(value)}`).join("&");
		}
		function BoardScreen(props) {
		  const [draft, setDraft] = (0, import_react20.useState)({});
		  const [applied, setApplied] = (0, import_react20.useState)({});
		  const [resumeOptions, setResumeOptions] = (0, import_react20.useState)([]);
		  const [directionOptions, setDirectionOptions] = (0, import_react20.useState)([]);
		  (0, import_react20.useEffect)(() => {
		    void fetchResumes().then((result) => {
		      setResumeOptions(result.items.map((item) => ({ id: item.id, label: `${item.name} #${String(item.id)}` })));
		      setDirectionOptions([...new Set(result.items.map((item) => item.direction).filter((d) => d !== ""))].sort());
		    }).catch(() => {
		    });
		  }, [props.revision]);
		  const [basis, setBasis] = (0, import_react20.useState)("monthly_min");
		  const funnel = useAsync((signal) => fetchFunnel(applied, signal), [props.revision, applied]);
		  const attribution = useAsync((signal) => fetchAttribution(applied, signal), [props.revision, applied]);
		  const salaryBox = useAsync((signal) => fetchSalaryBox(applied, basis, signal), [props.revision, applied, basis]);
		  const baseline = useAsync((signal) => fetchSalaryBaseline(applied, signal), [props.revision, applied]);
		  const resumeCompare = useAsync((signal) => fetchResumeCompare(applied, signal), [props.revision, applied]);
		  const bestResume = resumeCompare.state.status === "ok" ? bestResumeKey(resumeCompare.state.data.rows) : null;
		  const activeCount = Object.keys(applied).length;
		  const dirty = filterSignature(draft) !== filterSignature(applied);
		  const patch = (next) => {
		    setDraft((current) => ({ ...current, ...next }));
		  };
		  const apply2 = () => {
		    setApplied(cleanFilter(draft));
		  };
		  const reset = () => {
		    setDraft({});
		    setApplied({});
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h2", { className: "jh-screen-title", children: "\u6570\u636E\u770B\u677F" }),
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-muted", children: "\u6F0F\u6597 \xB7 \u5F52\u56E0 \xB7 \u85AA\u8D44\u5206\u5E03 \xB7 \u7B80\u5386\u5BF9\u6BD4\uFF0C\u5404\u81EA\u56DE\u7B54\u4E00\u4E2A\u590D\u76D8\u95EE\u9898\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(FieldHint, { text: FILTER_SCOPE_HINT })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("section", { className: "jh-card jh-panel jh-filter-panel", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-panel-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h3", { className: "jh-panel-title", children: "\u7B5B\u9009" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-muted", children: "\u65B9\u5411\u4E0E\u7B80\u5386\u7248\u672C\u53EA\u4F5C\u7528\u4E8E\u6295\u9012\u6BB5\uFF0C\u5B8C\u6574\u53E3\u5F84\u89C1\u53F3\u4E0A\u89D2\u95EE\u53F7\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		        dirty ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-warn", children: "\u5DF2\u6539\u52A8\uFF0C\u70B9\u300C\u67E5\u8BE2\u300D\u751F\u6548" }) : /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("span", { className: "jh-muted", children: [
		          "\u5DF2\u751F\u6548 ",
		          activeCount,
		          " \u9879"
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
		        "div",
		        {
		          className: "jh-filter-grid",
		          onKeyDown: (event) => {
		            if (event.key === "Enter") {
		              event.preventDefault();
		              apply2();
		            }
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u8D77" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  type: "date",
		                  value: localDayOf(draft.from),
		                  onChange: (event) => patch({ from: event.target.value === "" ? "" : localDayStart(event.target.value) })
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u6B62" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  type: "date",
		                  value: localDayOf(draft.to),
		                  onChange: (event) => patch({ to: event.target.value === "" ? "" : localDayEnd(event.target.value) })
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u5173\u952E\u8BCD\uFF08\u5C97\u4F4D\u540D\uFF09" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  placeholder: "Java",
		                  value: draft.keyword ?? "",
		                  onChange: (event) => patch({ keyword: event.target.value })
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u65B9\u5411\uFF08\u7B80\u5386\uFF09" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
		                "select",
		                {
		                  className: "jh-select",
		                  value: draft.direction ?? "",
		                  onChange: (event) => patch({ direction: event.target.value }),
		                  children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("option", { value: "", children: "\u5168\u90E8\u65B9\u5411" }),
		                    directionOptions.map((item) => /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("option", { value: item, children: item }, item))
		                  ]
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u57CE\u5E02" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		                "input",
		                {
		                  className: "jh-input",
		                  placeholder: "\u6DF1\u5733",
		                  value: draft.city ?? "",
		                  onChange: (event) => patch({ city: event.target.value })
		                }
		              )
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u7B80\u5386\u7248\u672C" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
		                "select",
		                {
		                  className: "jh-select",
		                  value: draft.resumeId === void 0 ? "" : String(draft.resumeId),
		                  onChange: (event) => patch({ resumeId: event.target.value === "" ? void 0 : Number(event.target.value) }),
		                  children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("option", { value: "", children: "\u5168\u90E8\u7248\u672C" }),
		                    resumeOptions.map((item) => /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("option", { value: item.id, children: item.label }, item.id))
		                  ]
		                }
		              )
		            ] })
		          ]
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-filter-foot", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-quiet",
		            disabled: activeCount === 0 && !dirty,
		            onClick: reset,
		            children: "\u91CD\u7F6E"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline jh-btn-primary", disabled: !dirty, onClick: apply2, children: "\u67E5\u8BE2" })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("section", { className: "jh-card jh-panel", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-panel-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h3", { className: "jh-panel-title", children: "\u6F0F\u6597" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-muted", children: "\u63A5\u89E6\u6BB5\u4E0E\u6295\u9012\u6BB5\u5206\u5F00\u753B \u2014\u2014 \u5B83\u4EEC\u662F\u4E24\u4E2A\u4E0D\u53EF\u6BD4\u7684\u603B\u4F53\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		        funnel.state.status !== "ok" ? null : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		          SampleBadge,
		          {
		            sample: funnel.state.data.sampleSize,
		            enough: funnel.state.data.enoughSample,
		            hint: funnel.state.data.note
		          }
		        )
		      ] }),
		      funnel.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }) : funnel.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(PanelFailure, { message: funnel.state.message, hint: funnel.state.hint, onRetry: funnel.reload }) : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(FunnelChart, { steps: funnel.state.data.steps, onDrillDown: props.onDrillDown })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("section", { className: "jh-card jh-panel", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-panel-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h3", { className: "jh-panel-title", children: "\u5F52\u56E0" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-muted", children: "\u8FD9\u4E9B\u6295\u9012\u662F\u54EA\u6761\u6E20\u9053\u3001\u54EA\u7248\u7B80\u5386\u6362\u6765\u7684\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		        attribution.state.status !== "ok" ? null : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		          SampleBadge,
		          {
		            sample: attribution.state.data.sampleSize,
		            enough: attribution.state.data.enoughSample,
		            hint: attribution.state.data.note
		          }
		        )
		      ] }),
		      attribution.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }) : attribution.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(PanelFailure, { message: attribution.state.message, hint: attribution.state.hint, onRetry: attribution.reload }) : /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(import_jsx_runtime42.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h4", { className: "jh-panel-sub", children: "\u6309\u6E20\u9053" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(AttributionTable, { rows: attribution.state.data.byChannel }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h4", { className: "jh-panel-sub", children: "\u6309\u7B80\u5386\u7248\u672C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(AttributionTable, { rows: attribution.state.data.byResume })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("section", { className: "jh-card jh-panel", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-panel-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h3", { className: "jh-panel-title", children: "\u85AA\u8D44\u5206\u5E03" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-muted", children: "\u7BB1\u7EBF\u56FE + \u4E94\u6570\u6982\u62EC \xB7 \u53EA\u6765\u81EA\u4F60\u81EA\u5DF1\u6293\u5230\u7684\u5C97\u4F4D\u5E93\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(FieldHint, { text: "\u57CE\u5E02\u4E0E\u5173\u952E\u8BCD\u5728\u8FD9\u91CC\u7B5B\u7684\u662F\u5C97\u4F4D\u5E93\uFF1B\u65F6\u95F4\u7A97\u662F\u5C97\u4F4D\u6293\u53D6\u65F6\u95F4\uFF0C\u4E0D\u662F\u4F60\u7684\u6295\u9012\u65F6\u95F4\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-muted", children: "\u53E3\u5F84" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("div", { className: "jh-modes", role: "group", "aria-label": "\u85AA\u8D44\u7EDF\u8BA1\u53E3\u5F84", children: SALARY_BASES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		          "button",
		          {
		            type: "button",
		            className: `jh-mode${value === basis ? " jh-mode-active" : ""}`,
		            "aria-pressed": value === basis,
		            onClick: () => setBasis(value),
		            children: SALARY_BASIS_LABEL[value]
		          },
		          value
		        )) }),
		        salaryBox.state.status === "ok" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		          SampleBadge,
		          {
		            sample: salaryBox.state.data.box.count,
		            enough: salaryBox.state.data.enoughSample,
		            hint: salaryBox.state.data.note
		          }
		        ) : null
		      ] }),
		      salaryBox.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }) : salaryBox.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(PanelFailure, { message: salaryBox.state.message, hint: salaryBox.state.hint, onRetry: salaryBox.reload }) : salaryBox.state.data.box.count === 0 ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "jh-muted", children: "\u8FD9\u4E2A\u8303\u56F4\u91CC\u6CA1\u6709\u7B26\u5408\u8BE5\u53E3\u5F84\u7684\u5C97\u4F4D\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(import_jsx_runtime42.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SalaryBoxChart, { box: salaryBox.state.data.box }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-metric-row", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-metric", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u6700\u4F4E" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("b", { children: salaryBox.state.data.box.min })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-metric", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "P25" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("b", { children: salaryBox.state.data.box.p25 })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-metric jh-metric-key", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u4E2D\u4F4D" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("b", { children: salaryBox.state.data.box.median })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-metric", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "P75" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("b", { children: salaryBox.state.data.box.p75 })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-metric", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "\u6700\u9AD8" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("b", { children: salaryBox.state.data.box.max })
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-panel-foot", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("span", { className: "jh-muted", children: [
		            "\u53E3\u5F84 ",
		            salaryBox.state.data.box.basisLabel,
		            " \xB7 \u6837\u672C ",
		            salaryBox.state.data.box.count,
		            " \u6761 \xB7 \u7BB1\u4F53\uFF08P25\u2013P75\uFF09\u91CC\u88C5\u4E86",
		            " ",
		            salaryBox.state.data.box.withinBox,
		            " \u6761"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("details", { className: "jh-details jh-details-inline", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("summary", { children: "\u53E3\u5F84\u8BF4\u660E" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "jh-note", children: salaryBox.state.data.note })
		          ] })
		        ] })
		      ] }),
		      baseline.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u7EDF\u8BA1\u57FA\u51C6\u2026" }) : baseline.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(PanelFailure, { message: baseline.state.message, hint: baseline.state.hint, onRetry: baseline.reload }) : /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-baseline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h4", { className: "jh-panel-sub", children: "\u6211\u6295\u9012\u8FC7\u7684 vs \u5168\u90E8\u5728\u5E93\uFF08\u540C\u4E00\u53E3\u5F84\uFF1A\u6708\u85AA\u4E0B\u9650\uFF09" }),
		        baseline.state.data.all.count === 0 ? (
		          /* 措辞不能再是"岗位库里还没有带薪资的岗位" —— 时间窗现在也在这条链路上，
		             空结果可能只是"这个范围里没有"，那句话会把库说成空的。 */
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "jh-muted", children: "\u8FD9\u4E2A\u8303\u56F4\u91CC\u6CA1\u6709\u5E26\u85AA\u8D44\u4E0B\u9650\u7684\u5C97\u4F4D\u3002" })
		        ) : /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(import_jsx_runtime42.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("table", { className: "jh-table jh-table-board", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("th", { scope: "col", children: "\u5206\u7EC4" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("th", { scope: "col", className: "jh-num", children: "\u6837\u672C" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("th", { scope: "col", className: "jh-num", children: "P25" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("th", { scope: "col", className: "jh-num", children: "\u4E2D\u4F4D" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("th", { scope: "col", className: "jh-num", children: "P75" })
		            ] }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("tbody", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("tr", { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { children: "\u5168\u90E8\u5728\u5E93" }),
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: baseline.state.data.all.count }),
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: numOrDash(baseline.state.data.all.p25) }),
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: numOrDash(baseline.state.data.all.median) }),
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: numOrDash(baseline.state.data.all.p75) })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("tr", { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { children: "\u6211\u6295\u9012\u8FC7\u7684" }),
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: baseline.state.data.applied.count }),
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: numOrDash(baseline.state.data.applied.p25) }),
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: numOrDash(baseline.state.data.applied.median) }),
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: numOrDash(baseline.state.data.applied.p75) })
		              ] })
		            ] })
		          ] }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-panel-foot", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("span", { className: baseline.state.data.enoughSample ? "jh-muted" : "jh-warn", children: [
		              "\u4E2D\u4F4D\u6570\u4E4B\u5DEE\uFF1A",
		              baseline.state.data.medianGap === null ? "\u65E0\u6CD5\u8BA1\u7B97\uFF08\u6709\u4E00\u8FB9\u6CA1\u6709\u6837\u672C\uFF09" : `${baseline.state.data.medianGap > 0 ? "+" : ""}${String(baseline.state.data.medianGap)} \u5143/\u6708`,
		              baseline.state.data.enoughSample ? "" : " \u2014\u2014 \u6837\u672C\u4E0D\u8DB3\uFF0C\u522B\u770B\u5DEE\u989D"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("details", { className: "jh-details jh-details-inline", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("summary", { children: "\u53E3\u5F84\u8BF4\u660E" }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "jh-note", children: baseline.state.data.note })
		            ] })
		          ] })
		        ] })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("section", { className: "jh-card jh-panel", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-panel-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("h3", { className: "jh-panel-title", children: "\u7B80\u5386\u7248\u672C\u5BF9\u6BD4" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-muted", children: "\u540C\u4E00\u6279\u6295\u9012\u91CC\uFF0C\u54EA\u7248\u7B80\u5386\u8D70\u5F97\u66F4\u8FDC\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		        resumeCompare.state.status === "ok" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		          SampleBadge,
		          {
		            sample: resumeCompare.state.data.sampleSize,
		            enough: resumeCompare.state.data.enoughSample,
		            hint: resumeCompare.state.data.note
		          }
		        ) : null
		      ] }),
		      resumeCompare.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }) : resumeCompare.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
		        PanelFailure,
		        {
		          message: resumeCompare.state.message,
		          hint: resumeCompare.state.hint,
		          onRetry: resumeCompare.reload
		        }
		      ) : resumeCompare.state.data.rows.length === 0 ? (
		        /* 空态就是一句话，不画空表壳 —— 与同屏的 AttributionTable 同一个写法 */
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" })
		      ) : /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(import_jsx_runtime42.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("table", { className: "jh-table jh-table-board", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("tr", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("th", { scope: "col", children: "\u7B80\u5386\u7248\u672C" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("th", { scope: "col", className: "jh-num", children: "\u6295\u9012\u6570" }),
		            resumeCompare.state.data.stages.map((stage) => /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("th", { scope: "col", className: "jh-num", children: stage.label }, stage.stage))
		          ] }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("tbody", { children: resumeCompare.state.data.rows.map((row) => {
		            const rowKey = String(row.resumeId);
		            const best = rowKey === bestResume;
		            return /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("tr", { className: best ? "jh-row-best" : void 0, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("td", { children: [
		                row.label,
		                row.enoughSample ? null : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-tag jh-tag-quiet", children: "\u6837\u672C\u5C11" }),
		                best ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-tag jh-tag-best", title: BEST_RESUME_HINT, children: "\u8FDB\u5165\u9762\u8BD5\u6700\u591A" }) : null
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: "jh-num", children: row.total }),
		              row.cells.map((cell) => (
		                // 每格都标出"分子/分母"，而不是只给一个百分比 ——
		                // 2 条样本里的 1 条不是"50%"，是"1/2"
		                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("td", { className: cell.thin ? "jh-num jh-warn" : "jh-num", children: cell.count === 0 ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-cell-empty", children: "\u2014" }) : `${String(cell.count)}/${String(row.total)}` }, cell.stage)
		              ))
		            ] }, rowKey);
		          }) })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "jh-panel-foot", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-muted", children: "\u6BCF\u683C\u662F\u300C\u5206\u5B50/\u5206\u6BCD\u300D\uFF1B\u5E26\u989C\u8272\u7684\u683C\u5B50\u6837\u672C\u4E0D\u8DB3 5\uFF0C\u53EA\u770B\u6570\u5B57\u522B\u4E0B\u7ED3\u8BBA\u3002" }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("details", { className: "jh-details jh-details-inline", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("summary", { children: "\u53E3\u5F84\u8BF4\u660E" }),
		            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "jh-note", children: resumeCompare.state.data.note })
		          ] })
		        ] })
		      ] })
		    ] })
		  ] });
		}
		function PanelFailure(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(import_jsx_runtime42.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(ErrorLine, { children: props.message }),
		    props.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "jh-muted", children: props.hint }),
		    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("button", { type: "button", className: "jh-btn", onClick: props.onRetry, children: "\u91CD\u8BD5" })
		  ] });
		}
		function numOrDash(value) {
		  return value === null ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "jh-cell-empty", children: "\u2014" }) : String(value);
		}
		var BEST_RESUME_HINT = "\u8FD9\u4E00\u7248\u7684\u300C\u9762\u8BD5\u4E2D + \u5DF2\u9762\u8BD5 + Offer\u300D\u6761\u6570\u5728\u6240\u6709\u6837\u672C\u8DB3\u591F\u7684\u7248\u672C\u91CC\u6700\u591A\uFF1B\u5E76\u5217\u65F6\u4E0D\u7ED9\u9AD8\u4EAE\u3002";
		function bestResumeKey(rows) {
		  const score = (row) => ["interviewing", "interviewed", "offer"].reduce(
		    (sum, stage) => sum + (row.cells.find((cell) => cell.stage === stage)?.count ?? 0),
		    0
		  );
		  const candidates = rows.filter((row) => row.enoughSample && score(row) > 0);
		  if (candidates.length < 2) return null;
		  const top = Math.max(...candidates.map(score));
		  const winners = candidates.filter((row) => score(row) === top);
		  const winner = winners.length === 1 ? winners[0] : void 0;
		  return winner === void 0 ? null : String(winner.resumeId);
		}

		// src/client/screens/pipeline/follow-up-row.tsx
		var import_jsx_runtime43 = require("react/jsx-runtime");
		function FollowUpRow(props) {
		  const { item } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime43.jsxs)("li", { className: `jh-followup jh-followup-${item.kind}`, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime43.jsxs)("button", { type: "button", className: "jh-link", onClick: () => props.onOpen(item.jobId), children: [
		      item.companyName ?? "",
		      " ",
		      item.jobTitle ?? `\u5C97\u4F4D #${String(item.jobId)}`
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime43.jsx)("p", { className: "jh-muted", children: item.message }),
		    /* @__PURE__ */ (0, import_jsx_runtime43.jsx)("p", { className: item.kind === "unread-timeout" ? "jh-muted" : "jh-warn", children: item.advice })
		  ] });
		}

		// src/client/screens/pipeline/index.tsx
		var import_react21 = require("react");
		var import_jsx_runtime44 = require("react/jsx-runtime");
		function PipelineScreen(props) {
		  const board = useAsync((signal) => fetchBoard(signal), [props.revision]);
		  const followUps = useAsync((signal) => fetchFollowUps(signal), [props.revision]);
		  const [busy, setBusy] = (0, import_react21.useState)(null);
		  const [error, setError] = (0, import_react21.useState)(null);
		  const [openJobId, setOpenJobId] = (0, import_react21.useState)(null);
		  const apps = useAsync(
		    (signal) => fetchApplications(openJobId === null ? {} : { jobId: openJobId }, signal),
		    [openJobId, props.revision]
		  );
		  const run = (0, import_react21.useCallback)(
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
		  return /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("h2", { className: "jh-card-title", children: "\u6295\u9012\u6D41\u6C34\u7EBF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("span", { className: "jh-muted", children: "\u6BCF\u4E00\u6B21\u6295\u9012\u90FD\u8BB0\u4E0B\u4E86\u5F53\u65F6\u7528\u7684\u7B80\u5386\u7248\u672C\u4E0E\u6E20\u9053 \u2014\u2014 \u5F52\u56E0\u5206\u6790\u9760\u7684\u5C31\u662F\u5B83\u3002" })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("p", { className: "jh-error", children: error }),
		    board.state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u6D41\u6C34\u7EBF\u2026" }),
		    board.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(ErrorLine, { children: board.state.message }),
		    board.state.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)(import_jsx_runtime44.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("p", { className: "jh-muted", children: [
		        "\u5171 ",
		        board.state.data.total,
		        " \u6761\u6295\u9012",
		        board.state.data.staleCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("i", { className: "jh-warn", children: [
		          " \xB7 ",
		          board.state.data.staleCount,
		          " \u6761\u5361\u4E86 ",
		          NO_PROGRESS_DAYS,
		          " \u5929\u4EE5\u4E0A"
		        ] }) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-stage-strip", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("span", { className: "jh-stage-strip-title", children: "\u5168\u6D41\u7A0B" }),
		        board.state.data.columns.map((column, index) => /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)(
		          "span",
		          {
		            className: "jh-stage-strip-item",
		            "data-zero": column.cards.length === 0 ? "1" : "0",
		            "data-active": column.stage === "sent" ? "0" : column.cards.length > 0 ? "1" : "0",
		            children: [
		              index === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("span", { className: "jh-stage-strip-arrow", "aria-hidden": "true", children: "\u2192" }),
		              /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("b", { className: "jh-stage-strip-num", children: column.cards.length }),
		              APPLICATION_STAGE_LABEL[column.stage]
		            ]
		          },
		          column.stage
		        ))
		      ] }),
		      board.state.data.total === 0 ? /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-empty", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("p", { className: "jh-muted", children: "\u53BB\u300C\u5C97\u4F4D\u5E93\u300D\u6253\u5F00\u4E00\u4E2A\u5C97\u4F4D\uFF0C\u5728\u8BE6\u60C5\u91CC\u70B9\u300C\u8BB0\u4E00\u6B21\u6295\u9012\u300D\u2014\u2014 \u8FD9\u91CC\u5C31\u4F1A\u5F00\u59CB\u8BB0\u5F55\u5B83\u8D70\u5230\u54EA\u4E00\u6B65\u3001 \u7528\u7684\u54EA\u7248\u7B80\u5386\u3001\u4EE5\u53CA\u5361\u4E86\u591A\u5C11\u5929\u3002" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("div", { className: "jh-board", children: board.state.data.columns.map((column) => /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)(
		        "section",
		        {
		          className: `jh-board-col${column.cards.length === 0 ? " jh-board-col-empty" : ""}`,
		          "aria-label": `${APPLICATION_STAGE_LABEL[column.stage]}\uFF1A${String(column.cards.length)} \u6761`,
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-board-head", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("span", { className: "jh-board-head-label", children: APPLICATION_STAGE_LABEL[column.stage] }),
		              /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("span", { className: "jh-board-count", children: column.cards.length })
		            ] }),
		            column.cards.length === 0 ? null : column.cards.map((card) => /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("article", { className: "jh-board-card", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(
		                "button",
		                {
		                  type: "button",
		                  className: "jh-board-title",
		                  onClick: () => props.onSelectJob(card.jobId),
		                  title: "\u6253\u5F00\u5C97\u4F4D\u8BE6\u60C5",
		                  children: card.jobTitle ?? `\u5C97\u4F4D #${String(card.jobId)}`
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("span", { className: "jh-muted jh-board-meta", children: [
		                card.companyName ?? "\u672A\u77E5\u516C\u53F8",
		                " \xB7 ",
		                APPLICATION_CHANNEL_LABEL[card.channel],
		                card.resumeId === null ? "" : ` \xB7 \u7B80\u5386 #${String(card.resumeId)}`
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("span", { className: "jh-board-age", children: card.daysSinceStage === 0 ? "\u4ECA\u5929\u52A8\u7684" : card.daysSinceStage >= NO_PROGRESS_DAYS ? `\u5361\u4E86 ${String(card.daysSinceStage)} \u5929 \xB7 \u8BE5\u50AC\u4E86` : `\u5361\u4E86 ${String(card.daysSinceStage)} \u5929` }),
		              /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-board-actions", children: [
		                nextStageOf(card.stage) === null ? null : /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)(
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
		                /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline",
		                    disabled: busy !== null,
		                    onClick: () => setOpenJobId(card.jobId),
		                    children: "\u6295\u9012\u8BB0\u5F55"
		                  }
		                ),
		                TERMINAL_STAGES.includes(card.stage) ? null : /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("h3", { className: "jh-card-title", children: "\u5F85\u8DDF\u8FDB" }),
		    followUps.state.status === "ok" && followUps.state.data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("p", { className: "jh-ok", children: "\u6CA1\u6709\u9700\u8981\u8DDF\u8FDB\u7684 \u2014\u2014 \u8981\u4E48\u90FD\u5728\u63A8\u8FDB\uFF0C\u8981\u4E48\u8FD8\u6CA1\u6253\u62DB\u547C\u3002" }) : null,
		    followUps.state.status === "ok" && followUps.state.data.items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("ul", { className: "jh-followups", children: followUps.state.data.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(FollowUpRow, { item, onOpen: props.onSelectJob }, `${String(item.jobId)}-${item.kind}`)) }) : null,
		    openJobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-row-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("h3", { className: "jh-card-title", children: [
		          "\u5C97\u4F4D #",
		          openJobId,
		          " \u7684\u6295\u9012\u8BB0\u5F55"
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => setOpenJobId(null), children: "\u6536\u8D77" }),
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(
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
		      apps.state.status !== "ok" ? /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u2026" }) : apps.state.data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("p", { className: "jh-muted", children: "\u8FD9\u4E2A\u5C97\u4F4D\u8FD8\u6CA1\u6709\u6295\u9012\u8BB0\u5F55\u3002" }) : apps.state.data.items.map((application) => /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("p", { className: "jh-muted", children: [
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
		        /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("ul", { className: "jh-tailor-notes", children: application.events.map((event) => /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("li", { children: [
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

		// src/shared/contract/enums/campus.ts
		var CAMPUS_BATCHES = ["autumn", "spring", "other"];
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

		// src/client/net/campus.ts
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
		async function fetchDeadlines(signal) {
		  return await request("/deadlines", signal === void 0 ? {} : { signal });
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

		// src/client/screens/campus/index.tsx
		var import_react22 = require("react");
		var import_jsx_runtime45 = require("react/jsx-runtime");
		function CampusScreen(props) {
		  const data = useAsync((signal) => fetchCampus(signal), [props.revision]);
		  const tripartite = useAsync((signal) => fetchTripartite(signal), [props.revision]);
		  const deadlines = useAsync((signal) => fetchDeadlines(signal), [props.revision]);
		  const [busy, setBusy] = (0, import_react22.useState)(false);
		  const [error, setError] = (0, import_react22.useState)(null);
		  const [notice, setNotice] = (0, import_react22.useState)(null);
		  const [name2, setName] = (0, import_react22.useState)("");
		  const [batch, setBatch] = (0, import_react22.useState)("autumn");
		  const [closeAt, setCloseAt] = (0, import_react22.useState)("");
		  const [dueAt, setDueAt] = (0, import_react22.useState)("");
		  const [dueFor, setDueFor] = (0, import_react22.useState)(null);
		  const now = /* @__PURE__ */ new Date();
		  const run = async (fn, done) => {
		    setBusy(true);
		    setError(null);
		    setNotice(null);
		    try {
		      await fn();
		      setNotice(done);
		      props.onChanged();
		      return true;
		    } catch (caught) {
		      setError(caught instanceof ApiError ? caught.display : caught instanceof Error ? caught.message : String(caught));
		      return false;
		    } finally {
		      setBusy(false);
		    }
		  };
		  const items = data.state.status === "ok" ? data.state.data.items : [];
		  const windows = data.state.status === "ok" ? data.state.data.windows : [];
		  const hardDeadlines = deadlines.state.status === "ok" ? deadlines.state.data.items : [];
		  const missed = items.flatMap(
		    (item) => item.assessments.filter((assessment) => assessment.state === "missed").map((assessment) => ({
		      item,
		      assessment,
		      label: `${item.companyName ?? item.note ?? `#${String(item.id)}`} \xB7 ${ASSESSMENT_KIND_LABEL[assessment.kind]}`
		    }))
		  );
		  return /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("h2", { className: "jh-card-title", children: "\u6821\u62DB\u652F\u7EBF" }),
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("span", { className: "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(InlineMd, { text: "\u79CB\u62DB\u6625\u62DB\u662F**\u786C\u65F6\u95F4\u7A97**\uFF0C\u7B14\u8BD5\u4E0E\u4E09\u65B9\u662F**\u4E0D\u53EF\u9006\u8282\u70B9** \u2014\u2014 \u8FD9\u4E00\u5C4F\u7684\u91CD\u5FC3\u5C31\u662F\u522B\u9519\u8FC7\u3002" }) })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-ok", children: notice }),
		    /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("h3", { className: "jh-card-title", children: "\u786C\u622A\u6B62" }),
		      deadlines.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u786C\u622A\u6B62\u2026" }) : null,
		      deadlines.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(ErrorLine, { children: [
		        "\u786C\u622A\u6B62\u8BFB\u53D6\u5931\u8D25\uFF1A",
		        deadlines.state.message
		      ] }) : null,
		      deadlines.state.status !== "ok" ? null : hardDeadlines.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("ul", { className: "jh-deadlines", children: hardDeadlines.map((deadline) => /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(
		        "li",
		        {
		          className: `jh-deadline${deadline.overdue ? " jh-deadline-overdue" : deadline.urgent ? " jh-deadline-urgent" : ""}`,
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("b", { children: deadline.overdue ? "\u26D4 \u5DF2\u8FC7\u671F" : deadline.urgent ? "\u26A0 \u7D27\u6025" : "\xB7" }),
		            " ",
		            deadline.label,
		            "\uFF5C",
		            formatLocalMoment(deadline.dueAt, now, { withRelative: false }) ?? deadline.dueAt,
		            "\uFF5C",
		            deadline.overdue ? `\u5DF2\u8FC7 ${String(Math.abs(deadline.hoursLeft))} \u5C0F\u65F6` : `\u8FD8\u5269 ${String(deadline.hoursLeft)} \u5C0F\u65F6`
		          ]
		        },
		        `${deadline.kind}:${String(deadline.refId)}`
		      )) }) : missed.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u622A\u6B62\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-ok", children: "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u786C\u622A\u6B62\u3002" }),
		      missed.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(import_jsx_runtime45.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-error", children: "\u5DF2\u9519\u8FC7\uFF08\u7EC8\u6001\uFF0C\u4E0D\u53EF\u6539\u56DE\uFF09\uFF1A" }),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("ul", { className: "jh-deadlines", children: missed.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("li", { className: "jh-deadline jh-deadline-overdue", children: [
		          "\u26D4 ",
		          entry.label,
		          "\uFF5C",
		          entry.assessment.dueAt === null ? "\u672A\u586B" : formatLocalMoment(entry.assessment.dueAt, now, { withRelative: false }) ?? entry.assessment.dueAt
		        ] }, entry.assessment.id)) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-muted", children: "\u7B14\u8BD5/\u7F51\u7533/\u4E09\u65B9\u9519\u8FC7\u90FD\u662F\u7EC8\u6001\uFF08\xA712.7\uFF09\uFF0C\u6CA1\u6709\u7B2C\u4E8C\u6B21\u673A\u4F1A\u3002" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("h3", { className: "jh-card-title", children: "\u6279\u6B21\u65F6\u95F4\u7A97" }),
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-muted", children: windows.map(
		        (window2) => `${CAMPUS_BATCH_LABEL[window2.batch]} ${String(window2.count)} \u6761\uFF08${String(window2.openCount)} \u4E2A\u8FD8\u6CA1\u7F51\u7533\uFF09${window2.nextCloseAt === null ? "" : `\uFF0C\u6700\u8FD1\u622A\u6B62 ${formatLocalMoment(window2.nextCloseAt, now, { withRelative: false }) ?? window2.nextCloseAt}`}`
		      ).join("\u3000|\u3000") }),
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            "aria-label": "\u516C\u53F8\u540D",
		            placeholder: "\u516C\u53F8\u540D",
		            value: name2,
		            onChange: (event) => setName(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
		          "select",
		          {
		            className: "jh-select jh-input-sm",
		            "aria-label": "\u6279\u6B21",
		            title: "\u6279\u6B21\uFF1A\u79CB\u62DB / \u6625\u62DB / \u5176\u4ED6",
		            value: batch,
		            onChange: (event) => setBatch(event.target.value),
		            children: CAMPUS_BATCHES.map((value) => /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("option", { value, children: CAMPUS_BATCH_LABEL[value] }, value))
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "date",
		            "aria-label": "\u7F51\u7533\u622A\u6B62\u65E5\u671F",
		            title: "\u7F51\u7533\u622A\u6B62\uFF08\u6309\u5F53\u5929 23:59 \u7B97\uFF09",
		            value: closeAt,
		            onChange: (event) => setCloseAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn",
		            disabled: busy || name2.trim() === "",
		            onClick: () => void run(
		              async () => await createCampus({
		                companyName: name2.trim(),
		                batch,
		                // `type="date"` 给的是 `YYYY-MM-DD`，而 `new Date('2026-09-19')` 按 **UTC** 零点
		                // 解析 —— 在东八区就是当天 08:00，于是"截止今天"的记录一早 8 点就被判成已过期。
		                // 手工拼上当天的 23:59（不带时区 = 本地时间）才是"今天截止"的本意。
		                ...closeAt === "" ? {} : { applyCloseAt: (/* @__PURE__ */ new Date(`${closeAt}T23:59:59`)).toISOString() }
		              }),
		              "\u5DF2\u65B0\u5EFA\u6821\u62DB\u8BB0\u5F55"
		            ).then((ok) => {
		              if (!ok) return;
		              setName("");
		              setCloseAt("");
		            }),
		            children: "\u65B0\u5EFA"
		          }
		        )
		      ] })
		    ] }),
		    data.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u6821\u62DB\u8BB0\u5F55\u2026" }) : data.state.status === "error" ? (
		      // 读失败必须说读失败：原来这里一律显示"正在读取…"，接口挂掉就永远转圈，
		      // 既没有错误也没有重试。
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(ErrorLine, { children: data.state.message }),
		        data.state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-muted", children: data.state.hint }),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("button", { type: "button", className: "jh-btn", onClick: data.reload, children: "\u91CD\u8BD5" })
		      ] })
		    ) : items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6821\u62DB\u8BB0\u5F55\u3002\u4E0A\u9762\u586B\u4E00\u4E2A\u516C\u53F8\u540D\u5C31\u80FD\u5F00\u59CB\u8DDF\u8E2A\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("ul", { className: "jh-campus-list", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("li", { className: "jh-campus-item", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-message-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("b", { children: item.companyName ?? item.note ?? `#${String(item.id)}` }),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("span", { className: "jh-badge", children: CAMPUS_BATCH_LABEL[item.batch] }),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("span", { className: "jh-muted", children: CAMPUS_STAGE_LABEL[item.stage] }),
		        item.applyCloseAt === null ? null : /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("span", { className: "jh-muted", children: [
		          "\u7F51\u7533\u622A\u6B62 ",
		          formatLocalMoment(item.applyCloseAt, now, { withRelative: false }) ?? item.applyCloseAt
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-detail-actions", children: [
		        [
		          "applied",
		          "assessment_pending",
		          "interview_pending",
		          "interviewing",
		          "final",
		          "closed",
		          "rejected"
		        ].map((stage) => /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy || item.stage === stage,
		            onClick: () => void run(
		              async () => await advanceCampus(item.id, stage),
		              `\u5DF2\u6807\u8BB0\u4E3A\u300C${CAMPUS_STAGE_LABEL[stage]}\u300D`
		            ),
		            children: CAMPUS_STAGE_LABEL[stage]
		          },
		          stage
		        )),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            onClick: () => setDueFor(dueFor === item.id ? null : item.id),
		            children: dueFor === item.id ? "\u6536\u8D77" : "\u52A0\u7B14\u8BD5"
		          }
		        )
		      ] }),
		      dueFor === item.id ? /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-inline", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
		          "input",
		          {
		            className: "jh-input",
		            type: "datetime-local",
		            title: "\u7B14\u8BD5\u622A\u6B62\uFF08\u5FC5\u586B \u2014\u2014 \u6CA1\u6709\u622A\u6B62\u65F6\u95F4\u7684\u7B14\u8BD5\u505A\u4E0D\u51FA\u63D0\u9192\uFF09",
		            value: dueAt,
		            onChange: (event) => setDueAt(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
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
		            ).then((ok) => {
		              if (!ok) return;
		              setDueAt("");
		              setDueFor(null);
		            }),
		            children: "\u8BB0\u5F55"
		          }
		        )
		      ] }) : null,
		      item.assessments.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("ul", { className: "jh-tailor-notes", children: item.assessments.map((assessment) => /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("li", { children: [
		        "\xB7 ",
		        ASSESSMENT_KIND_LABEL[assessment.kind],
		        "\uFF5C",
		        ASSESSMENT_STATE_LABEL[assessment.state],
		        "\uFF5C \u622A\u6B62",
		        " ",
		        assessment.dueAt === null ? "\u672A\u586B" : formatLocalMoment(assessment.dueAt, now, { withRelative: false }) ?? assessment.dueAt,
		        assessment.state === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(import_jsx_runtime45.Fragment, { children: [
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("h3", { className: "jh-card-title", children: "\u4E09\u65B9\u534F\u8BAE" }),
		      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(InlineMd, { text: "\u4E09\u65B9\u662F**\u4E0D\u53EF\u9006**\u8282\u70B9\uFF1A\u7B7E\u7F72\u524D\u540E\u5FC5\u987B\u663E\u8457\u533A\u5206\uFF0C\u8FDD\u7EA6\u6709\u771F\u5B9E\u4EE3\u4EF7\u3002\u771F\u7684\u8FDD\u7EA6\u8BF7\u6807\u300C\u8FDD\u7EA6\u300D\uFF0C\u4E0D\u8981\u6539\u56DE\u5F85\u7B7E\u3002" }) }),
		      tripartite.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u4E09\u65B9\u8BB0\u5F55\u2026" }) : tripartite.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(ErrorLine, { children: tripartite.state.message }),
		        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("button", { type: "button", className: "jh-btn", onClick: tripartite.reload, children: "\u91CD\u8BD5" })
		      ] }) : tripartite.state.data.items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("ul", { className: "jh-tailor-notes", children: tripartite.state.data.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("li", { children: [
		        "\xB7 #",
		        item.id,
		        "\uFF5C",
		        TRIPARTITE_STATE_LABEL[item.state],
		        "\uFF5C",
		        item.signDeadline === null ? "\u65E0\u622A\u6B62" : `\u7B7E\u7F72\u622A\u6B62 ${formatLocalMoment(item.signDeadline, now, { withRelative: false }) ?? item.signDeadline}`,
		        item.penaltySummary === null ? "" : `\uFF5C${item.penaltySummary}`,
		        item.state === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(import_jsx_runtime45.Fragment, { children: [
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
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
		      ] }, item.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: busy,
		          onClick: () => void run(
		            async () => await createTripartite({
		              // **不自动挂到某条校招记录上**：原来绑的是 `items[0]`（列表按 stage_at 倒序，
		              // 也就是最近动过的那条），而用户此刻根本没得选 —— 猜一个关联会顺带把那条记录
		              // 推到"待发三方"。三方记录先独立存在，等界面上能选记录时再绑。
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

		// src/client/screens/collect/index.tsx
		var import_react26 = require("react");

		// src/shared/contract/enums/crawl.ts
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

		// src/shared/text/error-text.ts
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
		var KIND_OF = {
		  NO_RECORDS: "selector",
		  PARSE_FAILED: (message) => looksLikeStackTrace(message) ? "script" : "selector",
		  NOT_LOGGED_IN: "login",
		  BLOCKED: "risk",
		  RATE_LIMITED: "risk",
		  PLATFORM_QUOTA: "risk",
		  RISK: "risk",
		  NAVIGATION_FAILED: "navigation",
		  PLATFORM_PAUSED: "platform-paused",
		  QUOTA_REACHED: "quota",
		  OFFLINE: "offline",
		  DEADLINE_REACHED: "budget",
		  ORPHANED: "unknown"
		};
		function kindOf(errorCode, message) {
		  if (errorCode !== null && errorCode in KIND_OF) {
		    const mapped = KIND_OF[errorCode];
		    return typeof mapped === "function" ? mapped(message) : mapped;
		  }
		  return looksLikeStackTrace(message) ? "script" : "unknown";
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
		  budget: "\u672C\u8F6E\u5230\u65F6\u9650\u4E86",
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
		  budget: "\u5230\u5355\u8F6E\u9884\u7B97\u4E0A\u9650\u5C31\u4E3B\u52A8\u505C\u624B\u4E86\uFF08\u9632\u7684\u662F\u5361\u4F4F\u7684\u9875\u9762\u628A\u6574\u8F6E\u62D6\u5230\u5929\u4EAE\uFF09\uFF0C**\u4E0D\u662F\u51FA\u9519**\u3002\u5DF2\u7ECF\u6293\u5230\u7684\u8BB0\u5F55\u90FD\u5DF2\u5165\u5E93\uFF0C\u5269\u4E0B\u7684\u5E73\u53F0\u4E0E\u5173\u952E\u8BCD\u5728\u4E0B\u4E00\u8F6E\u7EE7\u7EED\uFF1B\u4E0D\u9700\u8981\u505A\u4EFB\u4F55\u5904\u7406\u3002",
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
		  budget: "\u672C\u8F6E\u5230\u65F6\u9650",
		  unknown: "\u672A\u77E5\u539F\u56E0"
		};

		// src/client/net/collect/plans.ts
		async function fetchPlans(signal) {
		  return await request("/plans", signal === void 0 ? {} : { signal });
		}
		async function createPlan(input) {
		  return await request(
		    "/plans",
		    {
		      method: "POST",
		      body: JSON.stringify(input)
		    }
		  );
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
		async function validatePlanDraft(input) {
		  const result = await request("/plans/validate", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.validation;
		}
		async function fetchCriteriaDimensions(platforms = [], signal) {
		  const query = platforms.length === 0 ? "" : `?platforms=${encodeURIComponent(platforms.join(","))}`;
		  return await request(`/criteria/dimensions${query}`, signal === void 0 ? {} : { signal });
		}

		// src/client/net/collect/runs.ts
		async function runDefaultPlan() {
		  return await request("/crawl", {
		    method: "POST",
		    body: JSON.stringify({})
		  });
		}
		async function fetchSkipReasons(signal) {
		  return await request(
		    "/schedule/reasons",
		    signal === void 0 ? {} : { signal }
		  );
		}
		async function runPlan(planId, catchUp = false) {
		  return await request(`/plans/${String(planId)}/run`, {
		    method: "POST",
		    body: JSON.stringify({ catchUp })
		  });
		}

		// src/client/net/collect/schedule.ts
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
		async function fetchSchedulerStatus(signal) {
		  return await request("/scheduler/status", signal === void 0 ? {} : { signal });
		}

		// src/client/ui/feedback.tsx
		var IDLE = { running: false, tone: "ok", message: null };

		// src/client/screens/collect/schedule-story.ts
		function scheduleStoryOf(status, now) {
		  const nextRun = status.triggers.length === 0 ? null : status.triggers.map((trigger) => {
		    const at = new Date(trigger.nextRunAt);
		    const jitter = formatJitter(trigger.jitterMs);
		    return `${trigger.planName} ${formatClock(at)}\uFF08${formatRelative(at, now)}${jitter === null ? "" : ` \xB7 ${jitter}`}\uFF09`;
		  }).join(" / ");
		  if (status.paused) {
		    return {
		      owner: status.readOnly ? "\u7531\u53E6\u4E00\u4E2A\u7A97\u53E3\u8D1F\u8D23\u8C03\u5EA6" : "\u672C\u7A97\u53E3\u8D1F\u8D23\u8C03\u5EA6",
		      tone: "warn",
		      nextRun,
		      detail: "\u300C\u5230\u70B9\u81EA\u52A8\u8DD1\u300D\u5DF2\u5173\u6389\uFF1B\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4E0D\u53D7\u5F71\u54CD\u3002"
		    };
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

		// src/client/screens/collect/plan-form.ts
		function overridesOf(platforms, source) {
		  const out = {};
		  for (const id of platforms) {
		    const entry = source[id];
		    out[id] = {
		      enabled: entry?.enabled !== false,
		      maxPages: entry?.maxPages === void 0 || entry.maxPages === null ? "" : String(entry.maxPages)
		    };
		  }
		  return out;
		}
		function buildOverrides(overrides) {
		  const out = {};
		  for (const [id, entry] of Object.entries(overrides)) {
		    const parsed = Number.parseInt(entry.maxPages, 10);
		    out[id] = {
		      enabled: entry.enabled,
		      maxPages: entry.maxPages.trim() === "" || !Number.isFinite(parsed) ? null : parsed
		    };
		  }
		  return out;
		}
		function parseKeywordsText(text) {
		  const seen = /* @__PURE__ */ new Set();
		  const out = [];
		  for (const line of text.split("\n")) {
		    const keyword = line.trim();
		    if (keyword === "" || seen.has(keyword)) continue;
		    seen.add(keyword);
		    out.push(keyword);
		  }
		  return out;
		}
		function formOf(plan) {
		  const schedule = plan.schedule;
		  return {
		    name: plan.name,
		    platforms: [...plan.platforms],
		    // 多关键词方案直接回填列表；老方案把 criteria.keyword 翻成单行 ——
		    // 用户看到的永远是"这个方案实际会跑的关键词"，不用关心新老形态。
		    keywordsText: plan.keywords.length > 0 ? plan.keywords.join("\n") : plan.criteria["keyword"] ?? "",
		    overrides: overridesOf(plan.platforms, plan.platformOverrides),
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
		function emptyForm() {
		  return {
		    name: "\u65B0\u65B9\u6848",
		    platforms: [],
		    keywordsText: "",
		    overrides: {},
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
		  const keywords = parseKeywordsText(form.keywordsText);
		  const criteria = { ...form.criteria };
		  if (keywords.length > 0) delete criteria["keyword"];
		  return {
		    name: form.name,
		    platforms: form.platforms,
		    keywords,
		    platformOverrides: buildOverrides(form.overrides),
		    criteria,
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

		// src/client/screens/collect/plan-editor-modal.tsx
		var import_react23 = require("react");

		// src/shared/contract/enums/platform.ts
		var MATURITY_LEVEL_LABEL = {
		  stable: "\u53EF\u7528\uFF08\u771F\u5B9E\u5939\u5177 + \u5192\u70DF\u9A8C\u8BC1\uFF09",
		  calibrated: "\u5DF2\u6821\u51C6\uFF08\u63A2\u9488/\u5939\u5177\u9A8C\u8BC1\uFF0C\u7F3A\u53E3\u89C1\u5907\u6CE8\uFF09",
		  experimental: "\u5B9E\u9A8C\uFF08\u672A\u9A8C\u8BC1\u6216\u90E8\u5206\u672A\u5B9E\u73B0\uFF0C\u53EF\u80FD\u8FD4\u56DE\u7A7A\uFF09",
		  disabled: "\u505C\u7528\uFF08\u5E73\u53F0\u4FA7\u4E0D\u53EF\u7528\uFF0C\u9700\u6539\u914D\u7F6E\u624D\u542F\u7528\uFF09"
		};
		var MATURITY_LEVEL_SHORT = {
		  stable: "\u53EF\u7528",
		  calibrated: "\u5DF2\u6821\u51C6",
		  experimental: "\u5B9E\u9A8C",
		  disabled: "\u505C\u7528"
		};
		var MATURITY_LEVEL_TONE = {
		  stable: "ok",
		  calibrated: "warn",
		  experimental: "error",
		  disabled: "muted"
		};
		function maturityNeedsWarning(level) {
		  return level === "experimental" || level === "disabled";
		}
		var AUTH_REQUIREMENT_LABEL = {
		  none: "\u4E0D\u9700\u8981\u767B\u5F55",
		  required: "\u9700\u8981\u767B\u5F55",
		  unknown: "\u5C1A\u672A\u9A8C\u8BC1"
		};

		// src/shared/config/crawl.ts
		var ROUND_BUDGET_MS = 20 * 60 * 1e3;
		var PLAN_KEYWORDS_MAX = 10;
		var CRAWL_ROUND_BUDGET_DEFAULT_MIN = 20;
		var CRAWL_ROUND_BUDGET_MIN_MIN = 5;
		var CRAWL_ROUND_BUDGET_MAX_MIN = 240;

		// src/client/screens/collect/plan-editor-modal.tsx
		var import_jsx_runtime46 = require("react/jsx-runtime");
		var PLAN_STEPS = ["\u57FA\u7840\u4E0E\u5E73\u53F0", "\u91C7\u96C6\u4E0E\u7B5B\u9009", "\u8C03\u5EA6\u4E0E\u540E\u5904\u7406"];
		var PRIMARY_CRITERIA_KEYS = [
		  "city",
		  "workExp",
		  "education",
		  "salaryRange"
		];
		function platformHintOf(item) {
		  const parts = [`${item.displayName}\uFF08${item.id}\uFF09`, MATURITY_LEVEL_LABEL[item.maturity.level]];
		  if (item.maturity.verifiedAt !== null) parts.push(`\u4E0A\u6B21\u771F\u673A\u9A8C\u8BC1 ${item.maturity.verifiedAt}`);
		  if (item.maturity.notes !== void 0 && item.maturity.notes !== "") parts.push(item.maturity.notes);
		  parts.push(
		    `\u767B\u5F55\u8981\u6C42\uFF1A\u6293\u53D6${AUTH_REQUIREMENT_LABEL[item.authRequirement.crawl]}\u3001\u8BE6\u60C5${AUTH_REQUIREMENT_LABEL[item.authRequirement.detail]}\u3001\u52A8\u4F5C${AUTH_REQUIREMENT_LABEL[item.authRequirement.actions]}`
		  );
		  return parts.join("\uFF1B");
		}
		function limitTextOf(item) {
		  const parts = Number.isFinite(item.maxPages) ? [`\u6700\u591A ${String(item.maxPages)} \u9875`] : [];
		  const crawl = item.authRequirement.crawl;
		  if (crawl === "required") parts.push("\u6293\u53D6\u9700\u767B\u5F55");
		  else if (crawl === "unknown") parts.push("\u6293\u53D6\u767B\u5F55\u672A\u9A8C\u8BC1");
		  return parts.join(" \xB7 ");
		}
		function PlanEditorModal(props) {
		  const [form, setForm] = (0, import_react23.useState)(props.initial);
		  const [localDuplicates, setLocalDuplicates] = (0, import_react23.useState)([]);
		  const [localNotices, setLocalNotices] = (0, import_react23.useState)([]);
		  const [step, setStep] = (0, import_react23.useState)(0);
		  const [rulesOpen, setRulesOpen] = (0, import_react23.useState)(false);
		  const [advancedOpen, setAdvancedOpen] = (0, import_react23.useState)(false);
		  const [batchPages, setBatchPages] = (0, import_react23.useState)("5");
		  const allBoxRef = (0, import_react23.useRef)(null);
		  const [submitting, setSubmitting] = (0, import_react23.useState)(false);
		  const [submitError, setSubmitError] = (0, import_react23.useState)(null);
		  const [receipt, setReceipt] = (0, import_react23.useState)(null);
		  const patch = (next) => setForm((current) => ({ ...current, ...next }));
		  const duplicates = [
		    ...new Map(
		      [...props.duplicates, ...localDuplicates].map((item) => [item.planId, item])
		    ).values()
		  ];
		  const notices = [.../* @__PURE__ */ new Set([...props.notices, ...localNotices])];
		  const startClock = parseClockValue(form.windowStart);
		  const endClock = parseClockValue(form.windowEnd);
		  const startMissing = startClock === null;
		  const endMissing = endClock === null;
		  const keywordsKey = JSON.stringify(parseKeywordsText(form.keywordsText));
		  const validationKey = `${form.platforms.join(",")}\0${JSON.stringify(form.overrides)}\0${JSON.stringify(form.criteria)}\0${keywordsKey}`;
		  (0, import_react23.useEffect)(() => {
		    const timer = window.setTimeout(() => {
		      void props.onValidate(form).then((result) => {
		        setLocalDuplicates(result.duplicates);
		        setLocalNotices(result.notices);
		      }).catch(() => {
		        setLocalDuplicates([]);
		        setLocalNotices([]);
		      });
		    }, 600);
		    return () => window.clearTimeout(timer);
		  }, [validationKey, props.planId]);
		  const dimensions = useAsync(
		    (signal) => fetchCriteriaDimensions(form.platforms, signal),
		    [form.platforms.join(",")]
		  );
		  const items = dimensions.state.status === "ok" ? dimensions.state.data.items : [];
		  const togglePlatform = (id) => {
		    const has = form.platforms.includes(id);
		    const nextPlatforms = has ? form.platforms.filter((item) => item !== id) : [...form.platforms, id];
		    const nextOverrides = { ...form.overrides };
		    if (has) delete nextOverrides[id];
		    else nextOverrides[id] = { enabled: true, maxPages: "" };
		    patch({ platforms: nextPlatforms, overrides: nextOverrides });
		  };
		  const setOverride = (id, next) => {
		    const current = form.overrides[id] ?? { enabled: true, maxPages: "" };
		    patch({ overrides: { ...form.overrides, [id]: { ...current, ...next } } });
		  };
		  const setCriteria = (key, value) => {
		    const next = { ...form.criteria };
		    if (value === "") delete next[key];
		    else next[key] = value;
		    patch({ criteria: next });
		  };
		  const check = () => {
		    void props.onValidate(form).then((result) => {
		      setLocalDuplicates(result.duplicates);
		      setLocalNotices(result.notices);
		    }).catch(() => {
		      setLocalDuplicates([]);
		      setLocalNotices([]);
		    });
		  };
		  const bodyKey = JSON.stringify(writeOf(form));
		  const unchangedSinceSave = receipt !== null && receipt.body === bodyKey;
		  const busy = submitting || props.running;
		  const submit = async () => {
		    if (busy || unchangedSinceSave) return;
		    setSubmitting(true);
		    setSubmitError(null);
		    try {
		      await props.onSubmit(form);
		      setReceipt({ body: bodyKey, name: form.name.trim() });
		    } catch (error) {
		      setSubmitError(error instanceof ApiError ? error.display : String(error));
		    } finally {
		      setSubmitting(false);
		    }
		  };
		  const includedCount = form.platforms.length;
		  const enabledCount = form.platforms.filter(
		    (id) => (form.overrides[id] ?? { enabled: true }).enabled
		  ).length;
		  const nameMissing = form.name.trim() === "";
		  const stepOneBlocked = nameMissing || includedCount === 0 || enabledCount === 0;
		  const planPages = form.criteria["maxPages"] ?? "";
		  const keywordCount = parseKeywordsText(form.keywordsText).length;
		  const keywordsOverCap = keywordCount > PLAN_KEYWORDS_MAX;
		  const pagesDimension = items.find((item) => item.key === "maxPages");
		  const filterItems = items.filter((item) => item.key !== "maxPages" && item.key !== "keyword");
		  const primaryItems = filterItems.filter(
		    (item) => item.supported && PRIMARY_CRITERIA_KEYS.includes(item.key)
		  );
		  const primaryKeys = new Set(primaryItems.map((item) => item.key));
		  const advancedItems = filterItems.filter((item) => !primaryKeys.has(item.key));
		  const advancedActiveCount = advancedItems.filter(
		    (item) => (form.criteria[item.key] ?? "") !== ""
		  ).length;
		  const advancedNames = advancedItems.filter((item) => item.supported).map((item) => item.label).slice(0, 4).join(" / ") || "\u6392\u5E8F\u65B9\u5F0F / \u53D1\u5E03\u65F6\u95F4 / \u5E73\u53F0\u7279\u6709\u7EF4\u5EA6";
		  (0, import_react23.useEffect)(() => {
		    if (advancedActiveCount > 0) setAdvancedOpen(true);
		  }, [advancedActiveCount]);
		  const allIncluded = includedCount > 0 && includedCount === props.available.length;
		  (0, import_react23.useEffect)(() => {
		    const box = allBoxRef.current;
		    if (box !== null) box.indeterminate = includedCount > 0 && !allIncluded;
		  }, [includedCount, allIncluded]);
		  const toggleAll = () => {
		    if (allIncluded) {
		      patch({ platforms: [], overrides: {} });
		      return;
		    }
		    const nextOverrides = {};
		    for (const item of props.available) {
		      nextOverrides[item.id] = form.overrides[item.id] ?? { enabled: true, maxPages: "" };
		    }
		    patch({ platforms: props.available.map((item) => item.id), overrides: nextOverrides });
		  };
		  const applyBatchPages = () => {
		    const parsed = Number.parseInt(batchPages, 10);
		    if (!Number.isFinite(parsed) || parsed <= 0) return;
		    const nextOverrides = { ...form.overrides };
		    for (const item of props.available) {
		      if (!form.platforms.includes(item.id)) continue;
		      const current = nextOverrides[item.id] ?? { enabled: true, maxPages: "" };
		      const cap = Number.isFinite(item.maxPages) ? item.maxPages : parsed;
		      nextOverrides[item.id] = { ...current, maxPages: String(Math.min(parsed, cap)) };
		    }
		    patch({ overrides: nextOverrides });
		  };
		  const renderDimension = (dimension) => {
		    const value = form.criteria[dimension.key] ?? "";
		    const hint = dimension.supported ? dimension.hint : dimension.disabledReason ?? dimension.hint;
		    return /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("label", { className: "jh-field", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { className: "jh-field-label", children: [
		        dimension.label,
		        dimension.supported ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("em", { className: "jh-field-flag", children: "\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301" }),
		        /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(FieldHint, { text: hint })
		      ] }),
		      dimension.numeric ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		        "input",
		        {
		          className: "jh-input",
		          type: "number",
		          min: 1,
		          max: dimension.max ?? void 0,
		          disabled: !dimension.supported,
		          value,
		          "aria-label": dimension.label,
		          placeholder: dimension.supported ? "\u4E0D\u9650" : "\u4E0D\u652F\u6301",
		          onChange: (event) => setCriteria(dimension.key, event.target.value)
		        }
		      ) : dimension.values.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		        "input",
		        {
		          className: "jh-input",
		          disabled: !dimension.supported,
		          value,
		          "aria-label": dimension.label,
		          placeholder: dimension.supported ? "\u4E0D\u9650" : "\u4E0D\u652F\u6301",
		          onChange: (event) => setCriteria(dimension.key, event.target.value)
		        }
		      ) : /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		        "select",
		        {
		          className: "jh-select",
		          disabled: !dimension.supported,
		          value,
		          "aria-label": dimension.label,
		          onChange: (event) => setCriteria(dimension.key, event.target.value),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("option", { value: "", children: "\u4E0D\u9650" }),
		            dimension.values.map((option) => /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("option", { value: option.value, children: option.label }, option.value))
		          ]
		        }
		      )
		    ] }, dimension.key);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		    Modal,
		    {
		      title: props.planId === null ? "\u65B0\u589E\u91C7\u96C6\u65B9\u6848" : "\u7F16\u8F91\u91C7\u96C6\u65B9\u6848",
		      label: "\u91C7\u96C6\u65B9\u6848",
		      size: "lg",
		      onClose: props.onCancel,
		      footer: /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(import_jsx_runtime46.Fragment, { children: [
		        step === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => setStep(step - 1), children: "\u4E0A\u4E00\u6B65" }),
		        /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: props.onCancel, children: "\u53D6\u6D88" }),
		        step < PLAN_STEPS.length - 1 ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-primary",
		            disabled: busy || step === 0 && stepOneBlocked,
		            title: step === 0 && stepOneBlocked ? "\u5148\u586B\u65B9\u6848\u540D\uFF0C\u5E76\u81F3\u5C11\u7EB3\u5165\u4E00\u4E2A\u672A\u6682\u505C\u7684\u5E73\u53F0\u3002" : `\u4E0B\u4E00\u6B65\uFF1A${PLAN_STEPS[step + 1] ?? ""}`,
		            onClick: () => setStep(step + 1),
		            children: "\u4E0B\u4E00\u6B65"
		          }
		        ) : /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-primary",
		            disabled: busy || stepOneBlocked || keywordsOverCap || unchangedSinceSave,
		            title: stepOneBlocked ? "\u65B9\u6848\u540D\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u81F3\u5C11\u8981\u6709\u4E00\u4E2A\u672A\u6682\u505C\u7684\u5E73\u53F0 \u2014\u2014 \u4E0E\u4FDD\u5B58\u63A5\u53E3\u7684\u5224\u636E\u4E00\u81F4\u3002" : keywordsOverCap ? `\u5173\u952E\u8BCD\u8D85\u8FC7\u4E0A\u9650 ${String(PLAN_KEYWORDS_MAX)} \u4E2A \u2014\u2014 \u5230\u300C\u91C7\u96C6\u4E0E\u7B5B\u9009\u300D\u6B65\u9AA4\u6539\u3002` : unchangedSinceSave ? "\u5F53\u524D\u5185\u5BB9\u4E0E\u4E0A\u6B21\u4FDD\u5B58\u7684\u4E00\u81F4\uFF1B\u6539\u52A8\u4EFB\u4F55\u4E00\u9879\u540E\u53EF\u4EE5\u518D\u6B21\u4FDD\u5B58\u3002" : busy ? "\u6B63\u5728\u4FDD\u5B58\uFF0C\u8BF7\u7A0D\u5019\u3002" : "\u4FDD\u5B58\u8FD9\u4E2A\u65B9\u6848\u3002",
		            onClick: () => void submit(),
		            children: unchangedSinceSave ? "\u5DF2\u4FDD\u5B58" : busy ? "\u6B63\u5728\u4FDD\u5B58\u2026" : "\u4FDD\u5B58"
		          }
		        )
		      ] }),
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("nav", { className: "jh-steps", "aria-label": "\u65B9\u6848\u914D\u7F6E\u6B65\u9AA4", children: PLAN_STEPS.map((label, index) => /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(import_react23.Fragment, { children: [
		          index === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-step-sep", "aria-hidden": "true", children: "\u203A" }),
		          /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		            "button",
		            {
		              type: "button",
		              className: `jh-step${index === step ? " jh-step-on" : ""}`,
		              "aria-current": index === step ? "step" : void 0,
		              disabled: index > 0 && stepOneBlocked,
		              title: index > 0 && stepOneBlocked ? "\u5148\u586B\u65B9\u6848\u540D\uFF0C\u5E76\u81F3\u5C11\u7EB3\u5165\u4E00\u4E2A\u672A\u6682\u505C\u7684\u5E73\u53F0\u3002" : `\u7B2C ${String(index + 1)} \u6B65\uFF1A${label}`,
		              onClick: () => setStep(index),
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-step-no", "aria-hidden": "true", children: index + 1 }),
		                label
		              ]
		            }
		          )
		        ] }, label)) }),
		        /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-alert jh-alert-quiet", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		            "button",
		            {
		              type: "button",
		              className: "jh-plan-toggle",
		              "aria-expanded": rulesOpen,
		              "aria-controls": "jh-plan-rules",
		              onClick: () => setRulesOpen((open) => !open),
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-plan-caret", "aria-hidden": "true", children: rulesOpen ? "\u25BE" : "\u25B8" }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-plan-toggle-text", children: "\u914D\u7F6E\u987B\u77E5" }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-filter-note", children: "\u4FDD\u5B58\u524D\u6309\u540C\u4E00\u5957\u89C4\u5219\u6821\u9A8C \xB7 \u5E73\u53F0\u81EA\u8EAB\u7684\u9650\u5236\u89C1\u4E0B\u8868\u300C\u9650\u5236\u300D\u5217" })
		              ]
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-plan-panel", id: "jh-plan-rules", hidden: !rulesOpen, children: /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("ul", { className: "jh-alert-list", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("li", { children: [
		              "\u4FDD\u5B58\u524D\u4F1A\u6309\u4E0E\u6A21\u578B\u5DE5\u5177\u3001\u63A5\u53E3",
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("strong", { children: "\u540C\u4E00\u5957" }),
		              "\u89C4\u5219\u6821\u9A8C\uFF1B\u4E0D\u5408\u6CD5\u76F4\u63A5\u62A5\u9519\u3001\u4E0D\u5165\u5E93\u3002"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("li", { children: [
		              "\u9875\u6570\u4E0A\u9650\u6309",
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("strong", { children: "\u6BCF\u4E2A\u5E73\u53F0\u81EA\u5DF1" }),
		              "\u7684\u4E0A\u9650\u6821\u9A8C\uFF08\u89C1\u300C\u9650\u5236\u300D\u5217\uFF09\u3002\u7ED9\u67D0\u4E2A\u5E73\u53F0\u5355\u72EC\u586B\u7684\u9875\u6570 \u53EA\u4F5C\u7528\u4E8E\u5B83\uFF1B\u7559\u7A7A\u5219\u7528\u7B2C 1 \u6B65\u7684\u65B9\u6848\u7EA7\u9875\u6570\u3002"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("li", { children: [
		              "\u7B5B\u9009\u6761\u4EF6\u6309",
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("strong", { children: "\u5DF2\u7EB3\u5165\u4E14\u672A\u6682\u505C" }),
		              "\u7684\u5E73\u53F0\u6821\u9A8C \u2014\u2014 \u67D0\u4E2A\u5E73\u53F0\u4E0D\u8BA4\u7684\u6761\u4EF6\u4F1A\u88AB\u62D2\u7EDD\uFF0C \u800C\u4E0D\u662F\u9759\u9ED8\u5FFD\u7565\u3002"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("li", { children: "\u5B9A\u65F6\u65F6\u6BB5\u53EA\u5728\u533A\u95F4\u5185\u968F\u673A\u53D6\u70B9\uFF0C\u4E0D\u56FA\u5B9A\u5230\u67D0\u4E00\u5206\u949F\uFF1A\u56FA\u5B9A\u65F6\u523B\u6700\u5BB9\u6613\u88AB\u5E73\u53F0\u8BC6\u522B\u6210\u81EA\u52A8\u5316\u3002" })
		          ] }) })
		        ] }),
		        submitError === null ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-alert jh-alert-error", role: "alert", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-alert-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-alert-title", children: "\u4FDD\u5B58\u5931\u8D25" }),
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-muted", children: "\u6CA1\u6709\u5199\u5165\u4EFB\u4F55\u4E1C\u897F\uFF1B\u6309\u4E0B\u9762\u7684\u539F\u56E0\u6539\u5B8C\u53EF\u4EE5\u76F4\u63A5\u91CD\u8BD5\u3002" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("p", { className: "jh-alert-body", children: submitError })
		        ] }),
		        receipt === null || !unchangedSinceSave ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-alert", role: "status", children: /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-alert-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { className: "jh-alert-title", children: [
		            "\u5DF2\u4FDD\u5B58\u65B9\u6848\u300C",
		            receipt.name,
		            "\u300D"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-muted", children: "\u6539\u52A8\u4EFB\u4F55\u4E00\u9879\u540E\u300C\u4FDD\u5B58\u300D\u4F1A\u91CD\u65B0\u53EF\u7528\u3002" })
		        ] }) }),
		        duplicates.length === 0 && notices.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		          "div",
		          {
		            className: `jh-alert ${duplicates.length > 0 ? "jh-alert-warn" : "jh-alert-quiet"}`,
		            role: "status",
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-alert-head", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-alert-title", children: [
		                  duplicates.length > 0 ? `\u4E0E ${String(duplicates.length)} \u4E2A\u65B9\u6848\u6761\u4EF6\u91CD\u590D` : null,
		                  notices.length > 0 ? `${String(notices.length)} \u6761\u63D0\u793A` : null
		                ].filter((part) => part !== null).join(" \xB7 ") }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-muted", children: "\u53EA\u63D0\u793A\uFF0C\u4ECD\u53EF\u4FDD\u5B58" })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("ul", { className: "jh-alert-list", children: [
		                duplicates.map((item) => /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("li", { children: [
		                  "\u4E0E #",
		                  item.planId,
		                  "\u300C",
		                  item.name,
		                  "\u300D\u6761\u4EF6\u91CD\u590D\uFF08",
		                  item.reason,
		                  "\uFF09\u2014\u2014 \u4E0D\u4F1A\u81EA\u52A8\u5408\u5E76\u3002"
		                ] }, `dup-${String(item.planId)}`)),
		                notices.map((notice) => /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("li", { children: notice }, notice))
		              ] })
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-step-body", children: [
		          step === 0 ? /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(import_jsx_runtime46.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("label", { className: "jh-field-label", htmlFor: "jh-plan-name", children: "\u65B9\u6848\u540D" }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-affix", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                  "input",
		                  {
		                    id: "jh-plan-name",
		                    className: "jh-input",
		                    value: form.name,
		                    "aria-invalid": nameMissing,
		                    onChange: (event) => patch({ name: event.target.value }),
		                    onBlur: check
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-affix-btn",
		                    disabled: props.running,
		                    title: "\u68C0\u67E5\u8FD9\u4EFD\u914D\u7F6E\uFF08\u5E73\u53F0 + \u7B5B\u9009\u6761\u4EF6\uFF09\u662F\u5426\u4E0E\u73B0\u6709\u65B9\u6848\u91CD\u590D\u3001\u4EE5\u53CA\u54EA\u4E9B\u5E73\u53F0\u4F1A\u8FD4\u56DE\u7A7A\u3002\u53EA\u63D0\u793A\uFF0C\u4E0D\u4F1A\u5199\u5165\u4EFB\u4F55\u4E1C\u897F\u3002",
		                    onClick: check,
		                    children: "\u68C0\u67E5"
		                  }
		                )
		              ] }),
		              nameMissing ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-warn", role: "alert", children: "\u65B9\u6848\u540D\u4E0D\u80FD\u4E3A\u7A7A\u3002" }) : null
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-section-title", children: "\u76EE\u6807\u5E73\u53F0\u4E0E\u9875\u6570" }),
		            props.available.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u5DF2\u6CE8\u518C\u7684\u5E73\u53F0\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(import_jsx_runtime46.Fragment, { children: [
		              pagesDimension === void 0 || !pagesDimension.supported ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-field", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { className: "jh-field-label", children: [
		                  "\u6293\u53D6\u9875\u6570\u4E0A\u9650\uFF08\u65B9\u6848\u7EA7\uFF09",
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                    FieldHint,
		                    {
		                      text: `${pagesDimension.hint} \u5355\u4E2A\u5E73\u53F0\u53EF\u5728\u4E0B\u8868\u5355\u72EC\u586B\uFF0C\u586B\u4E86\u5C31\u7528\u5B83\u3002\u7559\u7A7A\u5219\u5404\u5E73\u53F0\u6309\u81EA\u5DF1\u7684\u9ED8\u8BA4\u9875\u6570\u6293\uFF1B\u8D85\u8FC7\u67D0\u4E2A\u5E73\u53F0\u81EA\u8EAB\u4E0A\u9650\u7684\u90E8\u5206\u5BF9\u5B83\u65E0\u6548\uFF0C\u4FDD\u5B58\u524D\u4F1A\u63D0\u793A\u3002`
		                    }
		                  )
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-field-row", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                    "input",
		                    {
		                      className: "jh-input jh-input-narrow",
		                      type: "number",
		                      min: 1,
		                      placeholder: "\u9ED8\u8BA4",
		                      "aria-label": "\u65B9\u6848\u7EA7\u6293\u53D6\u9875\u6570\u4E0A\u9650",
		                      value: planPages,
		                      onChange: (event) => setCriteria("maxPages", event.target.value)
		                    }
		                  ),
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-muted", children: "\u9875 \u2014\u2014 \u7559\u7A7A\u5219\u5404\u5E73\u53F0\u6309\u81EA\u5DF1\u7684\u9ED8\u8BA4\u9875\u6570\u6293" })
		                ] })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-batch", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("label", { className: "jh-check", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                    "input",
		                    {
		                      ref: allBoxRef,
		                      type: "checkbox",
		                      checked: allIncluded,
		                      onChange: toggleAll
		                    }
		                  ),
		                  "\u5168\u9009"
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { className: "jh-muted", children: [
		                  "\u5DF2\u7EB3\u5165 ",
		                  includedCount,
		                  " / ",
		                  props.available.length,
		                  " \u4E2A\u5E73\u53F0",
		                  enabledCount === includedCount ? "" : `\uFF08\u5176\u4E2D ${String(includedCount - enabledCount)} \u4E2A\u5DF2\u6682\u505C\uFF09`
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-spacer" }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("label", { className: "jh-muted", htmlFor: "jh-batch-pages", children: "\u6279\u91CF\u8BBE\u7F6E\u9875\u6570\u4E0A\u9650" }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                  "input",
		                  {
		                    id: "jh-batch-pages",
		                    className: "jh-input",
		                    type: "number",
		                    min: 1,
		                    value: batchPages,
		                    onChange: (event) => setBatchPages(event.target.value)
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    className: "jh-btn jh-btn-inline jh-btn-tiny",
		                    disabled: includedCount === 0,
		                    title: "\u7ED9\u6240\u6709\u5DF2\u7EB3\u5165\u7684\u5E73\u53F0\u586B\u4E0A\u540C\u4E00\u4E2A\u9875\u6570\u4E0A\u9650\u3002\u8D85\u8FC7\u5E73\u53F0\u81EA\u8EAB\u4E0A\u9650\u7684\u6309\u8BE5\u5E73\u53F0\u4E0A\u9650\u586B\u5199\u3002",
		                    onClick: applyBatchPages,
		                    children: "\u5E94\u7528"
		                  }
		                )
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("p", { className: "jh-filter-note", children: "\u8D85\u8FC7\u5E73\u53F0\u81EA\u8EAB\u4E0A\u9650\u7684\u6309\u8BE5\u5E73\u53F0\u4E0A\u9650\u586B\u5199\uFF1B\u9875\u6570\u7559\u7A7A\u7684\u5E73\u53F0\u7528\u4E0A\u9762\u7684\u65B9\u6848\u7EA7\u9875\u6570\u3002" }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("table", { className: "jh-table jh-table-plan jh-table-roomy", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("tr", { children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("th", { scope: "col", className: "jh-col-check", children: /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-sr-only", children: "\u7EB3\u5165\u65B9\u6848" }) }),
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("th", { scope: "col", children: "\u5E73\u53F0" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("th", { scope: "col", children: "\u72B6\u6001" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("th", { scope: "col", children: "\u9875\u6570\u4E0A\u9650" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("th", { scope: "col", children: "\u9650\u5236" })
		                ] }) }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("tbody", { children: props.available.map((item) => {
		                  const included = form.platforms.includes(item.id);
		                  const entry = form.overrides[item.id] ?? { enabled: true, maxPages: "" };
		                  const lastEnabled = included && entry.enabled && enabledCount === 1;
		                  const overCap = entry.maxPages.trim() !== "" && Number(entry.maxPages) > item.maxPages;
		                  return /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("tr", { children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("td", { className: "jh-col-check", children: /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                      "input",
		                      {
		                        type: "checkbox",
		                        checked: included,
		                        "aria-label": `\u7EB3\u5165 ${item.displayName}`,
		                        onChange: () => togglePlatform(item.id)
		                      }
		                    ) }),
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("td", { children: [
		                      item.displayName,
		                      /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(FieldHint, { text: platformHintOf(item) })
		                    ] }),
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("td", { children: [
		                      /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                        "span",
		                        {
		                          className: `jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`,
		                          children: MATURITY_LEVEL_SHORT[item.maturity.level]
		                        }
		                      ),
		                      included && !entry.enabled ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-tag jh-tone-muted", children: "\u5DF2\u6682\u505C" }) : null,
		                      included ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                        "button",
		                        {
		                          type: "button",
		                          className: "jh-btn jh-btn-inline jh-btn-tiny",
		                          disabled: lastEnabled,
		                          title: lastEnabled ? "\u81F3\u5C11\u7559\u4E00\u4E2A\u542F\u7528\u7684\u5E73\u53F0 \u2014\u2014 \u5168\u6682\u505C\u7B49\u4E8E\u8FD9\u4E2A\u65B9\u6848\u6C38\u8FDC\u6293\u4E0D\u5230\u4E1C\u897F\u3002" : entry.enabled ? "\u6682\u65F6\u4E0D\u6293\u8FD9\u4E2A\u5E73\u53F0\uFF08\u4FDD\u7559\u5B83\u7684\u9875\u6570\u914D\u7F6E\u4E0E\u67E5\u91CD\u53E3\u5F84\uFF09\u3002" : "\u6062\u590D\u6293\u53D6\u8FD9\u4E2A\u5E73\u53F0\u3002",
		                          onClick: () => setOverride(item.id, { enabled: !entry.enabled }),
		                          children: entry.enabled ? "\u6682\u505C" : "\u6062\u590D"
		                        }
		                      ) : null
		                    ] }),
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                      "input",
		                      {
		                        className: "jh-input jh-pages-input",
		                        type: "number",
		                        min: 1,
		                        max: item.maxPages,
		                        value: entry.maxPages,
		                        placeholder: planPages === "" ? "\u9ED8\u8BA4" : planPages,
		                        disabled: !included || !entry.enabled,
		                        "aria-invalid": overCap,
		                        "aria-label": `${item.displayName} \u7684\u9875\u6570\u4E0A\u9650`,
		                        onChange: (event) => setOverride(item.id, { maxPages: event.target.value })
		                      }
		                    ) }),
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("td", { className: "jh-muted", children: [
		                      limitTextOf(item),
		                      overCap ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-error", children: " \xB7 \u8D85\u8FC7\u4E0A\u9650\uFF0C\u4FDD\u5B58\u4F1A\u88AB\u62D2" }) : null
		                    ] })
		                  ] }, item.id);
		                }) })
		              ] }) })
		            ] }),
		            stepOneBlocked ? /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("p", { className: "jh-warn", role: "alert", children: [
		              nameMissing ? "\u5148\u586B\u65B9\u6848\u540D\u3002" : "",
		              includedCount === 0 ? "\u81F3\u5C11\u7EB3\u5165\u4E00\u4E2A\u5E73\u53F0\u3002" : "",
		              includedCount > 0 && enabledCount === 0 ? "\u81F3\u5C11\u7559\u4E00\u4E2A\u672A\u6682\u505C\u7684\u5E73\u53F0\u3002" : "",
		              "\u8FD9\u4E24\u6761\u540C\u65F6\u4E5F\u662F\u4FDD\u5B58\u63A5\u53E3\u7684\u786C\u6027\u5224\u636E\u3002"
		            ] }) : null
		          ] }) : null,
		          step === 1 ? /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(import_jsx_runtime46.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { className: "jh-field-label", children: [
		                "\u5173\u952E\u8BCD\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF0C\u6700\u591A ",
		                String(PLAN_KEYWORDS_MAX),
		                " \u4E2A\uFF09",
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                  FieldHint,
		                  {
		                    text: `\u9010\u4E2A\u91C7\u96C6\uFF1A\u7B2C 1 \u4E2A\u5173\u952E\u8BCD\u6293\u5B8C\u5B83\u7684\u9875\u6570\u518D\u6293\u7B2C 2 \u4E2A\uFF0C\u6BCF\u4E2A\u5173\u952E\u8BCD\u4E00\u6761\u72EC\u7ACB\u7684\u8FD0\u884C\u8BB0\u5F55\uFF08\u80FD\u770B\u5230\u300CJava 12 \u6761\u3001Go 3 \u6761\u300D\uFF09\u3002\u7559\u7A7A = \u4E0D\u6309\u5173\u952E\u8BCD\u7B5B\uFF08\u6309\u5E73\u53F0\u9ED8\u8BA4\u5217\u8868\u6293\uFF09\u3002\u6CE8\u610F\uFF1A\u81EA\u52A8\u8C03\u5EA6\u6309\u7AD9\u70B9\u8BBF\u95EE\u6B21\u6570\u8BA1\u6BCF\u65E5\u989D\u5EA6\uFF0CN \u4E2A\u5173\u952E\u8BCD = N \u6B21\uFF1B\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4E0D\u5360\u989D\u5EA6\u3002`
		                  }
		                )
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                "textarea",
		                {
		                  className: "jh-textarea",
		                  rows: 4,
		                  spellCheck: false,
		                  "aria-label": "\u641C\u7D22\u5173\u952E\u8BCD\uFF0C\u6BCF\u884C\u4E00\u4E2A",
		                  placeholder: "Java\n\u524D\u7AEF\n\u6D4B\u8BD5",
		                  value: form.keywordsText,
		                  onChange: (event) => patch({ keywordsText: event.target.value })
		                }
		              ),
		              keywordCount === 0 ? null : keywordCount > PLAN_KEYWORDS_MAX ? /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { className: "jh-error", role: "alert", children: [
		                String(keywordCount),
		                " \u4E2A\u5173\u952E\u8BCD\u8D85\u8FC7\u4E0A\u9650 ",
		                String(PLAN_KEYWORDS_MAX),
		                " \u2014\u2014 \u4FDD\u5B58\u4F1A\u88AB\u62D2\u3002 \u9700\u8981\u66F4\u591A\u5C31\u62C6\u6210\u4E24\u4E2A\u65B9\u6848\uFF08\u5404\u81EA\u7684\u989D\u5EA6\u4E0E\u65F6\u6BB5\u72EC\u7ACB\uFF09\u3002"
		              ] }) : /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { className: "jh-filter-note", children: [
		                String(keywordCount),
		                " \u4E2A\u5173\u952E\u8BCD \xB7 \u4E00\u8F6E\u6309\u987A\u5E8F\u6293 ",
		                String(keywordCount),
		                " \u904D"
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-section-title", children: "\u7B5B\u9009\u6761\u4EF6" }),
		            primaryItems.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("p", { className: "jh-muted", children: "\u5DF2\u7EB3\u5165\u7684\u5E73\u53F0\u6CA1\u6709\u58F0\u660E\u4EFB\u4F55\u7B5B\u9009\u7EF4\u5EA6 \u2014\u2014 \u4FDD\u5B58\u540E\u5B83\u4EEC\u4F1A\u6309\u5E73\u53F0\u81EA\u5DF1\u7684\u9ED8\u8BA4\u5217\u8868\u6293\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-grid2", children: primaryItems.map(renderDimension) }),
		            advancedItems.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(import_jsx_runtime46.Fragment, { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		                "button",
		                {
		                  type: "button",
		                  className: "jh-plan-toggle",
		                  "aria-expanded": advancedOpen,
		                  "aria-controls": "jh-plan-advanced",
		                  onClick: () => setAdvancedOpen((open) => !open),
		                  children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-plan-caret", "aria-hidden": "true", children: advancedOpen ? "\u25BE" : "\u25B8" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-plan-toggle-text", children: "\u9AD8\u7EA7\u7B5B\u9009" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                      "span",
		                      {
		                        className: `jh-filter-note${advancedActiveCount > 0 ? " jh-filter-note-on" : ""}`,
		                        children: advancedActiveCount > 0 ? `\u5DF2\u8BBE ${String(advancedActiveCount)} \u9879` : advancedNames
		                      }
		                    )
		                  ]
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-plan-panel", id: "jh-plan-advanced", hidden: !advancedOpen, children: /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-grid2", children: advancedItems.map(renderDimension) }) })
		            ] })
		          ] }) : null,
		          step === 2 ? /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(import_jsx_runtime46.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("fieldset", { className: "jh-fieldset", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("legend", { children: [
		                "\u5B9A\u65F6",
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(FieldHint, { text: "\u89E6\u53D1\u65F6\u523B\u4F1A\u5728\u8FD9\u6BB5\u65F6\u95F4\u5185\u968F\u673A\u9009\u70B9\uFF0C\u5177\u4F53\u5230\u54EA\u4E00\u5206\u949F\u4E0D\u56FA\u5B9A \u2014\u2014 \u6BCF\u5929\u56FA\u5B9A\u540C\u4E00\u5206\u949F\u53BB\u8BBF\u95EE\u6700\u5BB9\u6613\u88AB\u5E73\u53F0\u8BC6\u522B\u6210\u81EA\u52A8\u5316\u3002\u8FD9\u91CC\u523B\u610F\u6CA1\u6709\u300C\u7CBE\u786E\u5230\u67D0\u5206\u67D0\u79D2\u300D\u7684\u9009\u9879\u3002\u4E00\u5929\u90FD\u4E0D\u9009\u8FD0\u884C\u65E5\u7B49\u4E8E\u6BCF\u5929\u90FD\u8DD1\uFF1B\u65F6\u6BB5\u8DE8\u96F6\u70B9\u4E5F\u53EF\u4EE5\uFF08\u4F8B\u5982 22:00 \u81F3 02:00\uFF09\u3002" })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-schedule-row", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-field", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-field-label", children: "\u504F\u597D\u65F6\u6BB5" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-timerange", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
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
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-timerange-sep", children: "\u81F3" }),
		                    /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
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
		                    )
		                  ] })
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-field", children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-field-label", children: "\u8FD0\u884C\u65E5" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "jh-segmented", role: "group", "aria-label": "\u8FD0\u884C\u65E5", children: ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"].map((label, day) => /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
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
		                  )) })
		                ] })
		              ] }),
		              startMissing || endMissing ? /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-warn", id: "jh-window-error", role: "alert", children: "\u65F6\u6BB5\u6CA1\u586B\u5B8C\u6574\uFF0C\u4FDD\u5B58\u65F6\u4F1A\u9000\u56DE\u9ED8\u8BA4\u7684 09:00\u201311:00\u3002" }) : null,
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-chips jh-presets", children: [
		                WEEKDAY_PRESETS.map((preset) => {
		                  const active = form.weekdays.join(",") === preset.days.join(",");
		                  return /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
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
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { className: "jh-muted", children: [
		                  "\u5F53\u524D\uFF1A",
		                  form.weekdays.length === 0 ? "\u6BCF\u5929" : formatWeekdays(form.weekdays)
		                ] })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("label", { className: "jh-check", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
		                  "input",
		                  {
		                    type: "checkbox",
		                    checked: form.scheduleEnabled,
		                    onChange: (event) => patch({ scheduleEnabled: event.target.checked })
		                  }
		                ),
		                "\u542F\u7528\u5B9A\u65F6"
		              ] }),
		              startClock === null || endClock === null ? null : /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-info", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("span", { children: [
		                  "\u6267\u884C\u9891\u6B21\uFF1A",
		                  form.weekdays.length === 0 ? "\u6BCF\u5929" : formatWeekdays(form.weekdays),
		                  " ",
		                  formatWindow(startClock.hour, startClock.minute, endClock.hour, endClock.minute),
		                  form.scheduleEnabled ? "\uFF08\u65F6\u6BB5\u5185\u968F\u673A\u53D6\u70B9\uFF09" : "\uFF08\u5B9A\u65F6\u672A\u542F\u7528 \u2014\u2014 \u53EA\u5728\u4F60\u70B9\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u65F6\u8DD1\uFF09"
		                ] })
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("fieldset", { className: "jh-fieldset", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("legend", { children: [
		                "\u6293\u53D6\u540E\u5904\u7406",
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(FieldHint, { text: "\u4E09\u9879\u9ED8\u8BA4\u5168\u5F00\u3002\u5173\u6389\u6253\u5206\u540E\u4E0D\u518D\u5199\u5339\u914D\u5206\uFF1B\u5173\u6389\u6807\u6CE8\u540E\u4E0D\u518D\u4EA7\u51FA\u98CE\u9669/\u9ED1\u8BDD\u6807\u8BB0\uFF1B\u8DE8\u5E73\u53F0\u53BB\u91CD\u8981\u6709\u591A\u4E2A\u5E73\u53F0\u624D\u751F\u6548\u3002" })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)("div", { className: "jh-chips", children: [
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		                  "label",
		                  {
		                    className: "jh-check",
		                    title: "\u7B97\u51FA\u300C\u8FD9\u4E2A\u5C97\u4F4D\u8DDF\u4F60\u7B80\u5386\u6709\u591A\u5339\u914D\u300D\u5E76\u7ED9\u51FA\u9010\u6761\u7406\u7531\u3002\u5173\u6389\u540E\u5C97\u4F4D\u5E93\u91CC\u4E0D\u518D\u663E\u793A\u5339\u914D\u5206\u3002",
		                    children: [
		                      /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
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
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		                  "label",
		                  {
		                    className: "jh-check",
		                    title: "\u8BC6\u522B\u300C\u7591\u4F3C\u5916\u5305 / \u9AD8\u98CE\u9669 / \u50F5\u5C38\u5C97\u4F4D / \u85AA\u8D44\u865A\u6807 / \u884C\u4E1A\u9ED1\u8BDD\u300D\u5E76\u6807\u51FA\u6765\u3002",
		                    children: [
		                      /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
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
		                /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
		                  "label",
		                  {
		                    className: "jh-check",
		                    title: "\u540C\u4E00\u4E2A\u5C97\u4F4D\u51FA\u73B0\u5728\u591A\u4E2A\u62DB\u8058\u5E73\u53F0\u65F6\u5408\u5E76\u6210\u4E00\u6761\u3002\u53EA\u7EB3\u5165\u4E00\u4E2A\u5E73\u53F0\u65F6\u5B83\u4E0D\u4F1A\u751F\u6548\u3002",
		                    children: [
		                      /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(
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
		            ] })
		          ] }) : null
		        ] })
		      ]
		    }
		  );
		}

		// src/client/ui/terms.tsx
		var import_jsx_runtime47 = require("react/jsx-runtime");
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
		  if (explain === void 0) return /* @__PURE__ */ (0, import_jsx_runtime47.jsx)(import_jsx_runtime47.Fragment, { children: props.children });
		  return /* @__PURE__ */ (0, import_jsx_runtime47.jsxs)("span", { className: "jh-term", title: explain, children: [
		    props.children,
		    /* @__PURE__ */ (0, import_jsx_runtime47.jsx)("span", { className: "jh-term-mark", "aria-hidden": "true", children: "?" }),
		    /* @__PURE__ */ (0, import_jsx_runtime47.jsx)("span", { className: "jh-sr-only", children: explain })
		  ] });
		}

		// src/client/screens/collect/state-tag.tsx
		var import_jsx_runtime48 = require("react/jsx-runtime");
		function StateTag(props) {
		  const label = props.kind === "run" ? CRAWL_STATE_LABEL[props.state] : HEALTH_STATE_LABEL[props.state];
		  const tone = props.kind === "run" ? CRAWL_STATE_TONE[props.state] : HEALTH_STATE_TONE[props.state];
		  return /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("span", { className: `jh-tag jh-tone-${tone}`, children: label });
		}

		// src/client/screens/collect/platform-matrix.tsx
		var import_jsx_runtime49 = require("react/jsx-runtime");
		function cooldownActive(until, now) {
		  if (until === null) return null;
		  const at = new Date(until);
		  return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() ? null : at;
		}
		var MATRIX_COLUMNS = [
		  { key: "platform", label: "\u5E73\u53F0", className: "jh-col-sticky" },
		  { key: "runnable", label: "\u4ECA\u5929\u80FD\u8DD1" },
		  { key: "health", label: "\u5065\u5EB7", className: "jh-cell-status" },
		  { key: "maturity", label: "\u6210\u719F\u5EA6", className: "jh-col-hide-sm" },
		  { key: "quota", label: "\u4ECA\u65E5\u989D\u5EA6", className: "jh-num" },
		  { key: "yield", label: "\u4EA7\u91CF", className: "jh-num jh-col-hide-sm" },
		  { key: "lastRun", label: "\u6700\u8FD1\u4E00\u8F6E" },
		  /* 「操作」列**必须在最后**：这一列放的是"对这一个平台做什么"，
		     而做完之后要看的（能不能跑 / 健康 / 额度）都在它左边 —— 扫一行是
		     从左到右"看事实"，最后落到"动手"。放在中间会把这条读序打断。 */
		  { key: "actions", label: "\u64CD\u4F5C" }
		];
		function PlatformMatrix(props) {
		  const now = /* @__PURE__ */ new Date();
		  return /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("table", { className: "jh-table jh-table-matrix", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("tr", { children: MATRIX_COLUMNS.map((column) => /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("th", { scope: "col", className: column.className, children: column.label }, column.key)) }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("tbody", { children: props.items.map((item) => {
		      const blocked = item.governance.blocked === null ? null : props.reasonText[item.governance.blocked] ?? item.governance.blocked;
		      const cooldown = cooldownActive(item.governance.cooldownUntil, now);
		      const quotaFull = item.governance.todayRuns >= item.governance.dailyLimit;
		      const lastRun = item.governance.lastRun;
		      const loginRunning = item.login.state === "running";
		      return /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("td", { className: "jh-col-sticky", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("code", { children: item.id }),
		          item.enabled ? null : /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { className: "jh-tag jh-tone-muted", children: "\u672A\u542F\u7528" }),
		          /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("div", { className: "jh-muted", children: item.displayName })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("td", { className: blocked === null ? "jh-ok" : "jh-warn", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("div", { children: blocked === null ? "\u53EF\u4EE5" : /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { className: "jh-clip", title: blocked, children: blocked }) }),
		          cooldown === null ? null : /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("div", { className: "jh-muted", children: [
		            "\u51B7\u5374\u81F3 ",
		            formatClock(cooldown)
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("td", { className: "jh-cell-status", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(StateTag, { state: item.health, kind: "health" }),
		          item.failStreak > 0 ? /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("span", { className: "jh-muted", children: [
		            " \xD7",
		            item.failStreak
		          ] }) : null
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("td", { className: "jh-col-hide-sm", children: /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(
		          "span",
		          {
		            className: `jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`,
		            title: item.maturity.notes === void 0 || item.maturity.notes === "" ? MATURITY_LEVEL_LABEL[item.maturity.level] : `${MATURITY_LEVEL_LABEL[item.maturity.level]}\uFF1A${item.maturity.notes}`,
		            children: MATURITY_LEVEL_SHORT[item.maturity.level]
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("td", { className: `jh-num${quotaFull ? " jh-warn" : ""}`, children: [
		          item.governance.todayRuns,
		          "/",
		          item.governance.dailyLimit
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("td", { className: "jh-num jh-col-hide-sm", children: item.yield.baseline === null ? /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { className: "jh-muted", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("span", { className: item.yield.level === "dropped" ? "jh-warn" : void 0, children: [
		          item.yield.lastFound ?? "\u2014",
		          "/",
		          item.yield.baseline
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("td", { children: lastRun === null ? /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { className: "jh-muted", children: "\u6CA1\u8DD1\u8FC7" }) : /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)(import_jsx_runtime49.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { className: "jh-muted", children: formatClock(new Date(lastRun.startedAt)) }),
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(StateTag, { state: lastRun.state, kind: "run" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("td", { className: "jh-cell-actions", children: /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("div", { className: "jh-row-actions", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(
		            "span",
		            {
		              className: `jh-tag jh-tone-${item.account.loggedIn ? "ok" : item.account.lastCheckAt === null ? "muted" : "warn"}`,
		              children: item.account.loggedIn ? "\u5DF2\u767B\u5F55" : item.account.lastCheckAt === null ? "\u672A\u68C0\u6D4B" : "\u672A\u767B\u5F55"
		            }
		          ),
		          loginRunning ? /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { className: "jh-warn", children: "\u5F15\u5BFC\u4E2D\u2026" }) : item.account.loggedIn ? null : /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-tiny",
		              disabled: props.running,
		              title: props.running ? "\u6709\u53E6\u4E00\u4E2A\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u5019\u3002" : "\u6253\u5F00\u767B\u5F55\u9875\uFF0C\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\u91CC\u5B8C\u6210\u767B\u5F55\u3002",
		              onClick: () => props.onLogin(item.id),
		              children: "\u767B\u5F55"
		            }
		          ),
		          item.implementation.loginCheck ? /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-tiny",
		              disabled: props.running,
		              title: props.running ? "\u6709\u53E6\u4E00\u4E2A\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u5019\u3002" : "\u6253\u5F00\u8FD9\u4E2A\u5E73\u53F0\u7684\u9875\u9762\u68C0\u6D4B\u4E00\u6B21\u767B\u5F55\u6001\uFF08\u4E0D\u4F1A\u66FF\u4F60\u767B\u5F55\uFF09\uFF0C\u7ED3\u679C\u5728\u5F39\u7A97\u91CC\u3002",
		              onClick: () => props.onCheck(item.id, item.displayName),
		              children: "\u68C0\u6D4B"
		            }
		          ) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-tiny",
		              title: "\u770B\u8FD9\u4E2A\u5E73\u53F0\u7684\u5B8C\u6574\u8BCA\u65AD\uFF08\u80FD\u4E0D\u80FD\u8DD1\u3001\u88AB\u4EC0\u4E48\u6321\u4F4F\u3001\u767B\u5F55\u6001\u3001\u4EA7\u91CF\uFF09\u3002",
		              onClick: () => props.onDetail(item),
		              children: "\u660E\u7EC6"
		            }
		          )
		        ] }) })
		      ] }, item.id);
		    }) })
		  ] }) });
		}
		function PlatformDetail(props) {
		  const { item } = props;
		  const blocked = item.governance.blocked === null ? null : props.reasonText[item.governance.blocked] ?? item.governance.blocked;
		  const cooldown = cooldownActive(item.governance.cooldownUntil, /* @__PURE__ */ new Date());
		  const missing = item.fields.filter((field) => field.consecutiveMiss > 0);
		  const lastRun = item.governance.lastRun;
		  const needsLoginCheck = !item.implementation.loginCheck && Object.values(item.authRequirement).includes("required");
		  return /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("div", { className: "jh-plat-detail", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("ul", { className: "jh-kv", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { children: "\u73B0\u5728\u80FD\u8DD1\u5417" }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { className: blocked === null ? "jh-ok" : "jh-warn", children: blocked ?? "\u53EF\u4EE5 \u2014\u2014 \u5230\u70B9\u771F\u7684\u4F1A\u8DD1" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { children: "\u4ECA\u65E5\u989D\u5EA6" }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)(
		          "span",
		          {
		            className: item.governance.todayRuns >= item.governance.dailyLimit ? "jh-warn" : void 0,
		            children: [
		              item.governance.todayRuns,
		              " / ",
		              item.governance.dailyLimit,
		              " \u8F6E"
		            ]
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { children: "\u51B7\u5374" }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { children: cooldown === null ? "\u6CA1\u5728\u51B7\u5374" : `\u81F3 ${formatClock(cooldown)}` })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { children: "\u6700\u8FD1\u4E00\u8F6E" }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { children: lastRun === null ? "\u6CA1\u8DD1\u8FC7" : `${new Date(lastRun.startedAt).toLocaleString()} \xB7 ${CRAWL_STATE_LABEL[lastRun.state]}` })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { children: "\u4E0A\u6B21\u6210\u529F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("span", { children: item.lastOkAt === null ? "\u4ECE\u6765\u6CA1\u6709" : new Date(item.lastOkAt).toLocaleString() })
		      ] })
		    ] }),
		    item.governance.riskPaused ? /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("div", { className: "jh-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(Term, { term: "\u98CE\u9669\u6682\u505C", children: "\u5DF2\u88AB\u6682\u505C\u81EA\u52A8\u91C7\u96C6" }),
		      item.governance.riskReason === null ? "" : `\uFF1A${item.governance.riskReason}`,
		      " ",
		      "\u2014\u2014 \u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\uFF0C\u786E\u8BA4\u73AF\u5883\u6B63\u5E38\u540E\u5728\u65B9\u6848\u5361\u4E0A\u70B9\u300C\u786E\u8BA4\u6062\u590D\u300D\u3002"
		    ] }) : null,
		    item.login.message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("div", { className: "jh-muted", children: item.login.message }),
		    item.account.hint === null ? null : /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("div", { className: "jh-muted", children: item.account.hint }),
		    item.healthReason === null && item.failStreak === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("div", { className: "jh-warn", children: [
		      "\u5065\u5EB7\uFF1A",
		      HEALTH_STATE_LABEL[item.health],
		      item.failStreak > 0 ? `\uFF08\u8FDE\u7EED\u5931\u8D25 ${item.failStreak} \u6B21\uFF09` : "",
		      item.healthReason === null ? "" : ` \u2014\u2014 ${item.healthReason}`
		    ] }),
		    maturityNeedsWarning(item.maturity.level) ? /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("div", { className: "jh-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(Term, { term: "\u6210\u719F\u5EA6", children: MATURITY_LEVEL_LABEL[item.maturity.level] }),
		      item.maturity.notes === void 0 || item.maturity.notes === "" ? null : `\uFF1A${item.maturity.notes}`
		    ] }) : null,
		    needsLoginCheck ? /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("div", { className: "jh-warn", children: "\u8BE5\u5E73\u53F0\u9700\u8981\u767B\u5F55\uFF0C\u4F46\u672C\u673A\u8FD8\u6CA1\u6709\u767B\u5F55\u6001\u68C0\u6D4B \u2014\u2014 \u672A\u767B\u5F55\u65F6\u53EF\u80FD\u9759\u9ED8\u6293\u5230\u7A7A\u7ED3\u679C\u3002" }) : null,
		    item.yield.baseline === null ? null : /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("div", { className: item.yield.level === "dropped" ? "jh-warn" : "jh-muted", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(Term, { term: "\u91CF\u7EA7", children: "\u4EA7\u91CF" }),
		      "\uFF1A\u8FD1 ",
		      item.yield.samples,
		      " \u8F6E\u7684\u5E38\u6001\u7EA6 ",
		      item.yield.baseline,
		      " \u6761\uFF0C \u6700\u8FD1\u4E00\u8F6E ",
		      item.yield.lastFound ?? "\u2014",
		      " \u6761",
		      item.yield.level === "dropped" ? " \u2014\u2014 \u660E\u663E\u504F\u4F4E\u3002\u5B57\u6BB5\u5065\u5EB7\u53EF\u80FD\u662F\u5168\u7EFF\u7684\uFF0C\u5148\u67E5\u7FFB\u9875\u4E0E\u61D2\u52A0\u8F7D\u3002" : ""
		    ] }),
		    missing.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime49.jsxs)("div", { className: "jh-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(Term, { term: "\u9010\u5B57\u6BB5\u5065\u5EB7", children: "\u8FDE\u7EED\u7F3A\u5931" }),
		      "\uFF1A",
		      missing.map((field) => `${field.field}\xD7${String(field.consecutiveMiss)}`).join(" \xB7 ")
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime49.jsx)("div", { className: "jh-plat-detail-actions", children: /* @__PURE__ */ (0, import_jsx_runtime49.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-btn jh-btn-inline jh-btn-tiny",
		        onClick: props.onGoSettings,
		        title: "\u770B\u8BCA\u65AD\u4FE1\u606F\uFF08\u7248\u672C\u3001\u6570\u636E\u8DEF\u5F84\u3001\u8BA1\u6570\u3001\u5DE5\u5177\u6CE8\u518C\u7ED3\u679C\uFF09",
		        children: "\u53BB\u8BBE\u7F6E\u770B\u8BCA\u65AD"
		      }
		    ) })
		  ] });
		}

		// src/client/screens/collect/status-alert.tsx
		var import_jsx_runtime50 = require("react/jsx-runtime");
		function StatusAlert(props) {
		  if (props.status.paused) {
		    return /* @__PURE__ */ (0, import_jsx_runtime50.jsxs)("div", { className: "jh-alert jh-alert-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime50.jsxs)("div", { className: "jh-alert-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime50.jsx)("span", { className: "jh-alert-title", children: "\u5B9A\u65F6\u5DF2\u624B\u52A8\u6682\u505C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime50.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime50.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime50.jsxs)("p", { className: "jh-alert-body", children: [
		        props.status.pausedReason === null ? "" : `${props.status.pausedReason}\u3002`,
		        props.planName === null ? "\u6062\u590D\u540E\u4F1A\u6309\u5404\u65B9\u6848\u914D\u7F6E\u7684\u65F6\u6BB5\u81EA\u52A8\u91C7\u96C6\u3002" : `\u6062\u590D\u540E\u5C06\u81EA\u52A8\u6309\u300C${props.planName}\u300D\u65B9\u6848\u8FD0\u884C\u3002`,
		        "\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4E0D\u53D7\u5F71\u54CD\u3002"
		      ] })
		    ] });
		  }
		  if (props.status.refreshSuggested && props.status.refreshHint !== null) {
		    return /* @__PURE__ */ (0, import_jsx_runtime50.jsxs)("div", { className: "jh-alert jh-alert-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime50.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime50.jsx)("span", { className: "jh-alert-title", children: "\u6570\u636E\u504F\u65E7\uFF0C\u5EFA\u8BAE\u624B\u52A8\u5237\u65B0\u4E00\u6B21" }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime50.jsx)("p", { className: "jh-alert-body", children: /* @__PURE__ */ (0, import_jsx_runtime50.jsx)(InlineMd, { text: props.status.refreshHint }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime50.jsx)("p", { className: "jh-note", children: "\u4E0D\u4F1A\u81EA\u52A8\u8DD1 \u2014\u2014 \u7A0B\u5E8F\u53EA\u5728\u4F60\u5728\u573A\u65F6\u6D3B\u7740\uFF0C\u6240\u4EE5\u8FD9\u91CC\u53EA\u63D0\u793A\uFF0C\u7531\u4F60\u51B3\u5B9A\u3002" })
		    ] });
		  }
		  return null;
		}

		// src/shared/text/criteria-label.ts
		var FALLBACK_LABEL = {
		  keyword: "\u5173\u952E\u8BCD",
		  city: "\u57CE\u5E02",
		  sort: "\u6392\u5E8F\u65B9\u5F0F",
		  postedWithinDays: "\u53D1\u5E03\u65F6\u95F4",
		  maxPages: "\u6293\u53D6\u9875\u6570\u4E0A\u9650",
		  scrollRounds: "\u52A0\u8F7D\u8F6E\u6570",
		  // 平台特有维度：只有部分平台声明（如神仙外企），但方案可能引用了它们，
		  // 而平台刚被取消勾选 —— 那时候界面不该退回去印 `workExp`。
		  workExp: "\u5DE5\u4F5C\u7ECF\u9A8C",
		  education: "\u5B66\u5386",
		  type: "\u804C\u4F4D\u8303\u56F4"
		};
		var NUMERIC_SUFFIX = {
		  postedWithinDays: " \u5929\u5185",
		  maxPages: " \u9875",
		  scrollRounds: " \u8F6E"
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

		// src/client/screens/collect/criteria-line.tsx
		var import_jsx_runtime51 = require("react/jsx-runtime");
		function CriteriaLine(props) {
		  const scoped = props.dimensions.filter(
		    (dimension) => dimension.key !== "keyword" && props.plan.criteria[dimension.key] !== void 0
		  );
		  const items = describeCriteria(props.plan.criteria, scoped);
		  const keywords = props.plan.keywords.length > 0 ? props.plan.keywords : props.plan.criteria["keyword"] !== void 0 && props.plan.criteria["keyword"] !== "" ? [props.plan.criteria["keyword"] ?? ""] : [];
		  if (items.length === 0 && keywords.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime51.jsx)("span", { className: "jh-muted", children: "\u6761\u4EF6\uFF1A\u4E0D\u9650" });
		  return /* @__PURE__ */ (0, import_jsx_runtime51.jsxs)("span", { children: [
		    keywords.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime51.jsxs)("span", { children: [
		      "\u5173\u952E\u8BCD\uFF1A",
		      /* @__PURE__ */ (0, import_jsx_runtime51.jsx)("b", { children: keywords.join("\u3001") }),
		      items.length > 0 ? " \xB7 " : ""
		    ] }),
		    items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime51.jsxs)("span", { children: [
		      item.label,
		      "\uFF1A",
		      /* @__PURE__ */ (0, import_jsx_runtime51.jsx)("b", { children: item.display })
		    ] }, item.key)).reduce((acc, node) => acc.length === 0 ? [node] : [...acc, " \xB7 ", node], [])
		  ] });
		}

		// src/client/screens/collect/lease-panel.tsx
		var import_jsx_runtime52 = require("react/jsx-runtime");
		function LeasePanel(props) {
		  const { lease } = props.status;
		  const heartbeat = lease.heartbeatAt === null ? null : new Date(lease.heartbeatAt);
		  const takeoverPossible = !lease.held && lease.stale;
		  return /* @__PURE__ */ (0, import_jsx_runtime52.jsxs)("div", { className: `jh-lease${lease.held ? " jh-lease-ok" : " jh-lease-warn"}`, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime52.jsxs)("div", { className: "jh-lease-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime52.jsx)("b", { children: lease.held ? "\u672C\u7A97\u53E3\u8D1F\u8D23\u91C7\u96C6" : "\u672C\u7A97\u53E3\u53EA\u8BFB" }),
		      /* @__PURE__ */ (0, import_jsx_runtime52.jsx)("span", { className: "jh-muted", children: lease.held ? /* @__PURE__ */ (0, import_jsx_runtime52.jsxs)(import_jsx_runtime52.Fragment, { children: [
		        "\uFF08\u672C\u7A97\u53E3 ",
		        /* @__PURE__ */ (0, import_jsx_runtime52.jsx)(Term, { term: "pid", children: "\u8FDB\u7A0B" }),
		        " ",
		        String(lease.pid ?? "?"),
		        "\uFF09"
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime52.jsxs)(import_jsx_runtime52.Fragment, { children: [
		        "\uFF08\u53E6\u4E00\u4E2A\u7A97\u53E3 ",
		        /* @__PURE__ */ (0, import_jsx_runtime52.jsx)(Term, { term: "pid", children: "\u8FDB\u7A0B" }),
		        " ",
		        String(lease.pid ?? "?"),
		        " \u6B63\u5728\u8FD0\u884C",
		        heartbeat === null ? "" : `\uFF0C${formatRelative(heartbeat, props.now)}\u8FD8\u6709\u5FC3\u8DF3`,
		        "\uFF09"
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime52.jsx)("span", { className: "jh-spacer" }),
		      lease.held ? null : /* @__PURE__ */ (0, import_jsx_runtime52.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-tiny",
		          disabled: props.running || !takeoverPossible,
		          title: (
		            /* 置灰时那句解释原来是**一整段**（含"先把它关掉，关掉后最多 90 秒会
		               自动接管"）塞在 title 里。而"怎么办"下面那段 .jh-note 已经逐条写全了
		               （而且是**看得见**的文字，不用悬停）—— 这里只需要说清"为什么不行"，
		               再把用户指过去。 */
		            takeoverPossible ? "\u5BF9\u65B9\u7684\u5FC3\u8DF3\u5DF2\u7ECF\u8FC7\u671F\uFF08\u5F88\u53EF\u80FD\u5DF2\u88AB\u5F3A\u6740\uFF09\u3002\u70B9\u8FD9\u91CC\u628A\u91C7\u96C6\u6743\u62FF\u8FC7\u6765\u3002" : "\u53E6\u4E00\u4E2A\u7A97\u53E3\u8FD8\u6D3B\u7740\uFF0C\u4E0D\u80FD\u62A2\u5B83\u7684\u91C7\u96C6\u6743 \u2014\u2014 \u4E24\u4E2A\u7A97\u53E3\u540C\u65F6\u91C7\u96C6\u4F1A\u62A2\u540C\u4E00\u4EFD\u6D4F\u89C8\u5668\u767B\u5F55\u6001\u3002\u600E\u4E48\u529E\u89C1\u4E0B\u9762\u3002"
		          ),
		          onClick: props.onTakeover,
		          children: "\u63A5\u7BA1\u8C03\u5EA6"
		        }
		      )
		    ] }),
		    lease.held ? null : /* @__PURE__ */ (0, import_jsx_runtime52.jsx)("p", { className: "jh-note", children: /* @__PURE__ */ (0, import_jsx_runtime52.jsx)(InlineMd, { text: "\u600E\u4E48\u89E3\u51B3\uFF1A\u2460 \u5230\u90A3\u4E2A\u7A97\u53E3\u91CC\u64CD\u4F5C\uFF08\u6700\u7A33\uFF09\uFF1B\u2461 \u5173\u6389\u90A3\u4E2A\u7A97\u53E3 \u2014\u2014 \u5173\u6389\u4E4B\u540E\u8FD9\u91CC\u4F1A**\u81EA\u52A8**\u63A5\u7BA1\uFF0C\u4E0D\u7528\u91CD\u542F\uFF0C\u4E5F\u53EF\u4EE5\u70B9\u4E0A\u9762\u7684\u300C\u91CD\u65B0\u68C0\u6D4B\u7CFB\u7EDF\u300D\u7ACB\u523B\u8BD5\u4E00\u6B21\u3002" }) })
		  ] });
		}

		// src/shared/contract/enums/plan.ts
		var RUN_REASON_LABEL = {
		  schedule: "\u5B9A\u65F6",
		  manual: "\u624B\u52A8",
		  "catch-up": "\u8865\u8DD1"
		};
		function runReasonLabel(reason) {
		  if (reason === null || reason === "") return null;
		  return RUN_REASON_LABEL[reason] ?? reason;
		}

		// src/client/screens/collect/run-history.tsx
		var import_jsx_runtime53 = require("react/jsx-runtime");
		function RunHistoryTable(props) {
		  if (props.loading) {
		    return /* @__PURE__ */ (0, import_jsx_runtime53.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u8BFB\u53D6\u8FD0\u884C\u8BB0\u5F55\u2026" });
		  }
		  if (props.runs.length === 0) {
		    return /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)("div", { className: "jh-empty", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u8FD0\u884C\u8BB0\u5F55\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("p", { className: "jh-note", children: "\u7B2C\u4E00\u6B21\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u6216\u7B49\u5230\u504F\u597D\u65F6\u6BB5\u81EA\u52A8\u89E6\u53D1\u4E4B\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u6BCF\u4E00\u8F6E\u7684\u7ED3\u679C\u3002" })
		    ] });
		  }
		  const now = /* @__PURE__ */ new Date();
		  const showReason = props.runs.some((run) => runReasonLabel(run.reason) !== null);
		  const showQuarantined = props.runs.some((run) => run.quarantined > 0);
		  return /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)("table", { className: "jh-table jh-table-runs", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)("tr", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-col-sticky", children: "\u5F00\u59CB" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", children: "\u5E73\u53F0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-cell-status", children: "\u72B6\u6001" }),
		      showReason ? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", children: "\u89E6\u53D1" }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-num", children: "\u547D\u4E2D" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-num", children: "\u65B0\u589E" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-num jh-col-hide-sm", children: "\u66F4\u65B0" }),
		      showQuarantined ? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-num jh-col-hide-sm", children: "\u9694\u79BB" }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-num", children: "\u8017\u65F6" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", children: "\u7ED3\u679C\u8BF4\u660E" })
		    ] }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("tbody", { children: props.runs.map((run) => {
		      const skip = props.reasonFor(run.skipReason);
		      const failure = skip === null ? humanizeFailure(run.errorCode, run.errorMsg) : null;
		      const startedAt = new Date(run.startedAt);
		      const duration = run.endedAt === null ? null : formatDuration(new Date(run.endedAt).getTime() - startedAt.getTime());
		      const platformName = props.platformName?.(run.platformId) ?? null;
		      return /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)(
		          "td",
		          {
		            className: "jh-col-sticky",
		            title: `${startedAt.toLocaleString()} \xB7 ${formatRelative(startedAt, now)}`,
		            children: formatLocalMoment(run.startedAt, now, { withRelative: false }) ?? run.startedAt
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { title: platformName === null ? run.platformId : `${platformName}\uFF08${run.platformId}\uFF09`, children: platformName ?? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("code", { children: run.platformId }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { className: "jh-cell-status", children: /* @__PURE__ */ (0, import_jsx_runtime53.jsx)(StateTag, { state: run.state, kind: "run" }) }),
		        showReason ? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { children: runReasonLabel(run.reason) ?? "\u2014" }) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { className: "jh-num", title: `\u7FFB\u4E86 ${String(run.pages)} \u9875`, children: run.found }),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { className: "jh-num", children: run.inserted }),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { className: "jh-num jh-col-hide-sm", children: run.updated }),
		        showQuarantined ? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)(
		          "td",
		          {
		            className: `jh-num jh-col-hide-sm${run.quarantined > 0 ? " jh-warn" : ""}`,
		            title: run.quarantined > 0 ? `${String(run.quarantined)} \u6761\u88AB\u5B57\u6BB5\u65AD\u8A00\u62E6\u4E0B\uFF0C\u8FDB\u4E86\u5F85\u4FEE\u961F\u5217\uFF08\u6570\u636E\u672C\u8EAB\u6CA1\u5199\u8FDB\u5C97\u4F4D\u5E93\uFF09` : void 0,
		            children: run.quarantined
		          }
		        ) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { className: "jh-num", children: duration ?? (run.state === "running" ? "\u8FDB\u884C\u4E2D" : "\u2014") }),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { children: skip !== null ? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { children: skip }) : failure === null ? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { className: "jh-muted", children: "\u2014" }) : (
		          // 单元格里只留"图标 + 一句人话（过长则截断）+ 详情"；点开是弹窗。
		          // 图标让"这是错误"不只靠颜色表达；截断是为了不再把状态列撑宽。
		          /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)(
		            "button",
		            {
		              type: "button",
		              className: "jh-err-chip",
		              title: failure.detail === null ? failure.short : failure.detail.split("\n")[0],
		              onClick: () => props.onOpenError(run, failure),
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { className: "jh-err-chip-icon", "aria-hidden": "true", children: "\u26A0" }),
		                /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { className: "jh-err-chip-short", children: failure.short }),
		                /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { className: "jh-err-chip-more", children: "\u8BE6\u60C5" })
		              ]
		            }
		          )
		        ) })
		      ] }, run.id);
		    }) })
		  ] }) });
		}
		function RunLogCard(props) {
		  if (props.loading) {
		    return /* @__PURE__ */ (0, import_jsx_runtime53.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u8BFB\u53D6\u8FD0\u884C\u8BB0\u5F55\u2026" });
		  }
		  const now = /* @__PURE__ */ new Date();
		  const rows = props.runs.map((run) => ({
		    run,
		    skip: props.reasonFor(run.skipReason),
		    failure: humanizeFailure(run.errorCode, run.errorMsg)
		  })).filter((row) => row.skip !== null || row.failure !== null);
		  if (rows.length === 0) {
		    return /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)("div", { className: "jh-empty", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("p", { className: "jh-muted", children: "\u6700\u8FD1\u8FD9\u4E9B\u8F6E\u6B21\u91CC\u6CA1\u6709\u5931\u8D25\u6216\u8DF3\u8FC7\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("p", { className: "jh-note", children: '\u8FD9\u4E0D\u7B49\u4E8E"\u4EE5\u540E\u4E0D\u4F1A\u5931\u8D25" \u2014\u2014 \u4E0B\u4E00\u8F6E\u771F\u5931\u8D25\u4E86\uFF0C\u5B8C\u6574\u539F\u56E0\u4E0E\u6392\u67E5\u6B65\u9AA4\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002' })
		    ] });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)("table", { className: "jh-table jh-table-runs", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)("tr", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-col-sticky", children: "\u5F00\u59CB" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", children: "\u5E73\u53F0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", className: "jh-cell-status", children: "\u72B6\u6001" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", children: "\u539F\u56E0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("th", { scope: "col", children: "\u89E6\u53D1" })
		    ] }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("tbody", { children: rows.map(({ run, skip, failure }) => {
		      const startedAt = new Date(run.startedAt);
		      const platformName = props.platformName?.(run.platformId) ?? null;
		      return /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)("tr", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)(
		          "td",
		          {
		            className: "jh-col-sticky",
		            title: `${startedAt.toLocaleString()} \xB7 ${formatRelative(startedAt, now)}`,
		            children: formatLocalMoment(run.startedAt, now, { withRelative: false }) ?? run.startedAt
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { title: platformName === null ? run.platformId : `${platformName}\uFF08${run.platformId}\uFF09`, children: platformName ?? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("code", { children: run.platformId }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { className: "jh-cell-status", children: /* @__PURE__ */ (0, import_jsx_runtime53.jsx)(StateTag, { state: run.state, kind: "run" }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { children: skip !== null ? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { children: skip }) : failure === null ? /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { className: "jh-muted", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime53.jsxs)(
		          "button",
		          {
		            type: "button",
		            className: "jh-err-chip",
		            title: failure.detail === null ? failure.short : failure.detail.split("\n")[0],
		            onClick: () => props.onOpenError(run, failure),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { className: "jh-err-chip-icon", "aria-hidden": "true", children: "\u26A0" }),
		              /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { className: "jh-err-chip-short", children: failure.short }),
		              /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("span", { className: "jh-err-chip-more", children: "\u8BE6\u60C5" })
		            ]
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime53.jsx)("td", { children: runReasonLabel(run.reason) ?? "\u2014" })
		      ] }, run.id);
		    }) })
		  ] }) });
		}

		// src/client/screens/collect/adapter-maintenance.tsx
		var import_react24 = require("react");
		var import_jsx_runtime54 = require("react/jsx-runtime");
		function stamp(at) {
		  return at.slice(0, 16).replace("T", " ");
		}
		function reasonOf4(error) {
		  return error instanceof ApiError ? error.display : String(error);
		}
		function RepairQueueCard(props) {
		  const repairs = useAsync((signal) => fetchRepairs(void 0, signal), [props.revision]);
		  const [busy, setBusy] = (0, import_react24.useState)(null);
		  const [error, setError] = (0, import_react24.useState)(null);
		  const [clearing, setClearing] = (0, import_react24.useState)(null);
		  const [filter, setFilter] = (0, import_react24.useState)("");
		  const all = repairs.state.status === "ok" ? repairs.state.data.items : [];
		  const byPlatform = repairs.state.status === "ok" ? repairs.state.data.byPlatform : [];
		  const total = repairs.state.status === "ok" ? repairs.state.data.total : 0;
		  const note = repairs.state.status === "ok" ? repairs.state.data.note : "";
		  const items = filter === "" ? all : all.filter((item) => item.platformId === filter);
		  const nameOf = (id) => props.platforms.find((item) => item.id === id)?.displayName ?? id;
		  const act = async (id, run) => {
		    setBusy(id);
		    setError(null);
		    try {
		      await run();
		      repairs.reload();
		    } catch (thrown) {
		      setError(reasonOf4(thrown));
		    } finally {
		      setBusy(null);
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("div", { className: "jh-form-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("h2", { className: "jh-card-title", children: "\u5F85\u4FEE\u590D\u8BB0\u5F55" }),
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("span", { className: "jh-spacer" }),
		      byPlatform.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)(
		        "select",
		        {
		          className: "jh-select jh-select-inline",
		          value: filter,
		          "aria-label": "\u6309\u5E73\u53F0\u7B5B\u9009\u5F85\u4FEE\u590D\u8BB0\u5F55",
		          onChange: (event) => setFilter(event.target.value),
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("option", { value: "", children: [
		              "\u5168\u90E8\u5E73\u53F0\uFF08",
		              total,
		              "\uFF09"
		            ] }),
		            byPlatform.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("option", { value: entry.platformId, children: [
		              nameOf(entry.platformId),
		              "\uFF08",
		              entry.count,
		              "\uFF09"
		            ] }, entry.platformId))
		          ]
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(FieldHint, { text: note })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(ErrorLine, { role: "alert", children: error }),
		    repairs.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(ErrorLine, { children: repairs.state.message }) : null,
		    repairs.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(LoadingLine, { busy: true, children: "\u6B63\u5728\u8BFB\u53D6\u5F85\u4FEE\u590D\u8BB0\u5F55\u2026" }) : items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("p", { className: "jh-muted", children: total === 0 ? "\u6CA1\u6709\u5F85\u4FEE\u590D\u7684\u8BB0\u5F55 \u2014\u2014 \u6700\u8FD1\u6293\u5230\u7684\u6BCF\u4E00\u6761\u90FD\u901A\u8FC7\u4E86\u5B57\u6BB5\u65AD\u8A00\u3002" : "\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u8BB0\u5F55\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("ul", { className: "jh-tailor-notes", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("div", { className: "jh-row-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("span", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("b", { children: [
		            "#",
		            item.id
		          ] }),
		          " \xB7 ",
		          nameOf(item.platformId),
		          " \xB7 \u7F3A",
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("b", { children: item.missingFields.join("\u3001") }),
		          " \xB7 ",
		          stamp(item.capturedAt),
		          item.crawlRunId === null ? "" : ` \xB7 \u6293\u53D6\u8F6E\u6B21 #${String(item.crawlRunId)}`
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost",
		            disabled: busy !== null,
		            title: "\u8FD9\u6761\u786E\u5B9E\u6CA1\u4EF7\u503C\uFF08\u5E73\u53F0\u81EA\u5DF1\u7684\u810F\u6570\u636E\uFF09\u2192 \u6807\u8BB0\u4E3A\u5DF2\u4E22\u5F03\u3002\u8BB0\u5F55\u4FDD\u7559\uFF0C\u4E0D\u5220\u884C\u3002",
		            onClick: () => void act(item.id, async () => discardRepair(item.id)),
		            children: "\u4E22\u5F03"
		          }
		        )
		      ] }),
		      item.sourceUrl === null ? /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("span", { className: "jh-muted", children: "\u6CA1\u89E3\u6790\u51FA\u6837\u672C\u5730\u5740\uFF08\u8FDE source_url \u90A3\u4E00\u5217\u4E5F\u574F\u4E86\uFF09" }) : /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("a", { className: "jh-link", href: item.sourceUrl, target: "_blank", rel: "noreferrer", children: item.sourceUrl }),
		      item.raw === null ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("details", { className: "jh-details", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("summary", { children: "\u5F53\u65F6\u89E3\u6790\u51FA\u6765\u7684\u5B57\u6BB5\uFF08\u5224\u65AD\u662F\u6574\u9875\u5D29\u4E86\uFF0C\u8FD8\u662F\u53EA\u5DEE\u4E00\u5217\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("pre", { className: "jh-json", children: JSON.stringify(item.raw, null, 2) })
		      ] })
		    ] }, item.id)) }),
		    byPlatform.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("div", { className: "jh-details-actions", children: byPlatform.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)(
		      "button",
		      {
		        type: "button",
		        className: "jh-btn jh-btn-inline jh-btn-tiny",
		        disabled: busy !== null,
		        onClick: () => setClearing(entry.platformId),
		        children: [
		          "\u9009\u62E9\u5668\u5DF2\u4FEE\u597D \xB7 \u6E05\u7A7A ",
		          nameOf(entry.platformId),
		          " \u7684 ",
		          entry.count,
		          " \u6761"
		        ]
		      },
		      entry.platformId
		    )) }),
		    clearing === null ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(
		      Modal,
		      {
		        title: `\u6E05\u7A7A ${nameOf(clearing)} \u7684\u5F85\u4FEE\u590D\u961F\u5217`,
		        label: "\u6E05\u7A7A\u5F85\u4FEE\u590D\u961F\u5217",
		        onClose: () => setClearing(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)(import_jsx_runtime54.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => setClearing(null), children: "\u53D6\u6D88" }),
		          /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-danger",
		              disabled: busy !== null,
		              onClick: () => {
		                const platformId = clearing;
		                setClearing(null);
		                void act(0, async () => clearRepairs(platformId));
		              },
		              children: "\u786E\u8BA4\u6E05\u7A7A"
		            }
		          )
		        ] }),
		        children: /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("p", { className: "jh-alert-body", children: [
		          "\u53EA\u6E05 ",
		          /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("b", { children: nameOf(clearing) }),
		          " \u8FD9\u4E00\u961F\uFF0C\u5176\u5B83\u5E73\u53F0\u4E0D\u53D7\u5F71\u54CD\u3002\u8BB0\u5F55\u4E0D\u4F1A\u5220\u9664\uFF0C\u53EA\u662F\u6807\u8BB0\u4E3A\u5DF2\u4E22\u5F03 \uFF08\u7559\u75D5\uFF0C\u4FBF\u4E8E\u4E0B\u6B21\u9047\u5230\u540C\u6837\u5F62\u6001\u65F6\u56DE\u770B\uFF09\u3002",
		          /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("br", {}),
		          "\u8BF7\u5148\u786E\u8BA4\uFF1A\u9009\u62E9\u5668\u8986\u76D6\u5DF2\u7ECF\u6539\u597D\u3001\u5E76\u4E14",
		          /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("b", { children: "\u91CD\u8DD1\u8FC7\u4E00\u8F6E\u6293\u53D6" }),
		          "\u3001\u65B0\u6570\u636E\u6B63\u5E38\u3002 \u5426\u5219\u4E0B\u4E00\u8F6E\u4ECD\u4F1A\u628A\u8FD9\u4E9B\u8BB0\u5F55\u91CD\u65B0\u62E6\u4E0B\u6765\uFF08\u90A3\u8BF4\u660E\u8FD8\u6CA1\u4FEE\u597D\uFF0C\u4E0D\u662F\u961F\u5217\u7684\u95EE\u9898\uFF09\u3002"
		        ] })
		      }
		    )
		  ] });
		}
		function AdapterConfigCard(props) {
		  const [selected, setSelected] = (0, import_react24.useState)("");
		  const platformId = selected !== "" ? selected : props.platforms[0]?.id ?? "";
		  const config = useAsync(
		    async (signal) => platformId === "" ? null : await fetchAdapterConfig(platformId, signal),
		    [platformId, props.revision]
		  );
		  const [draft, setDraft] = (0, import_react24.useState)("");
		  const [busy, setBusy] = (0, import_react24.useState)(false);
		  const [error, setError] = (0, import_react24.useState)(null);
		  const [saved, setSaved] = (0, import_react24.useState)(null);
		  const current = config.state.status === "ok" ? config.state.data : null;
		  (0, import_react24.useEffect)(() => {
		    if (current === null) return;
		    setDraft(current.override === null ? "{}" : JSON.stringify(current.override, null, 2));
		    setSaved(null);
		    setError(null);
		  }, [current?.platformId, current?.override, current?.overrideKeys.length]);
		  const save = async (override) => {
		    if (platformId === "") return;
		    setBusy(true);
		    setError(null);
		    setSaved(null);
		    try {
		      await updateAdapterConfig(platformId, override);
		      setSaved(override === null ? "\u5DF2\u6E05\u9664\u8986\u76D6\uFF0C\u56DE\u5230\u4EE3\u7801\u9ED8\u8BA4\u3002\u5DF2\u70ED\u751F\u6548\u3002" : "\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548\uFF08\u9002\u914D\u5668\u5DF2\u91CD\u5EFA\uFF09\u3002");
		      config.reload();
		      props.onChanged?.();
		    } catch (thrown) {
		      setError(reasonOf4(thrown));
		    } finally {
		      setBusy(false);
		    }
		  };
		  const saveDraft = () => {
		    let parsed;
		    try {
		      parsed = JSON.parse(draft);
		    } catch (thrown) {
		      setError(`\u7F16\u8F91\u6846\u91CC\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${thrown instanceof Error ? thrown.message : String(thrown)}`);
		      return;
		    }
		    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		      setError('\u8986\u76D6\u5FC5\u987B\u662F\u4E00\u4E2A JSON \u5BF9\u8C61\uFF08\u4F8B\u5982 {"selectors":{"card":".joblist-item"}}\uFF09\u3002\u8981\u6E05\u9664\u8986\u76D6\u8BF7\u7528\u4E0B\u9762\u7684\u6309\u94AE\u3002');
		      return;
		    }
		    void save(parsed);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("div", { className: "jh-form-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("h2", { className: "jh-card-title", children: "\u9002\u914D\u5668\u914D\u7F6E\u8986\u76D6" }),
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("span", { className: "jh-spacer" }),
		      props.platforms.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(
		        "select",
		        {
		          className: "jh-select jh-select-inline",
		          value: platformId,
		          "aria-label": "\u9009\u62E9\u5E73\u53F0",
		          onChange: (event) => setSelected(event.target.value),
		          children: props.platforms.map((platform) => /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("option", { value: platform.id, children: platform.displayName }, platform.id))
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(FieldHint, { text: "\u5E73\u53F0\u6539\u7248\u628A\u9009\u62E9\u5668\u6253\u574F\u65F6\uFF0C\u53EA\u5199\u4F60\u8981\u6539\u7684\u90A3\u51E0\u4E2A\u952E\u5373\u53EF \u2014\u2014 \u4F1A\u548C\u4EE3\u7801\u9ED8\u8BA4\u503C\u5408\u5E76\u3002\u4FDD\u5B58\u540E\u7ACB\u523B\u751F\u6548\uFF08\u9002\u914D\u5668\u4F1A\u88AB\u91CD\u5EFA\uFF09\uFF0C\u4E0D\u9700\u8981\u91CD\u542F\u63D2\u4EF6\u3002\u7559\u7A7A\u56DE\u5230\u4EE3\u7801\u9ED8\u8BA4\u3002" })
		    ] }),
		    props.platforms.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6CE8\u518C\u5E73\u53F0\u3002" }) : config.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(LoadingLine, { busy: true, children: "\u6B63\u5728\u8BFB\u53D6\u2026" }) : config.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(ErrorLine, { children: config.state.message }) : current === null ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)(import_jsx_runtime54.Fragment, { children: [
		      error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(ErrorLine, { role: "alert", children: error }),
		      saved === null ? null : /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("p", { className: "jh-note", children: saved }),
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("p", { className: "jh-muted", children: [
		        "\u5F53\u524D\u8986\u76D6\uFF1A",
		        current.overrideKeys.length === 0 ? "\u65E0\uFF08\u4E00\u5207\u8D70\u4EE3\u7801\u9ED8\u8BA4\uFF09" : current.overrideKeys.join("\u3001")
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(
		        "textarea",
		        {
		          className: "jh-textarea",
		          rows: 8,
		          spellCheck: false,
		          "aria-label": "\u914D\u7F6E\u8986\u76D6 JSON",
		          value: draft,
		          onChange: (event) => setDraft(event.target.value)
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("div", { className: "jh-details-actions", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled: busy, onClick: saveDraft, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u5E76\u70ED\u751F\u6548" }),
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-danger-ghost",
		            disabled: busy || current.overrideKeys.length === 0,
		            title: "\u5220\u9664\u8FD9\u4EFD\u8986\u76D6\uFF0C\u56DE\u5230\u4EE3\u7801\u9ED8\u8BA4\u503C\u3002",
		            onClick: () => void save(null),
		            children: "\u6E05\u9664\u8986\u76D6"
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime54.jsxs)("details", { className: "jh-details", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("summary", { children: "\u770B\u5B9E\u9645\u751F\u6548\u503C\u4E0E\u4EE3\u7801\u9ED8\u8BA4\u503C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("p", { className: "jh-muted", children: "\u5B9E\u9645\u751F\u6548\uFF08\u9002\u914D\u5668\u6B64\u523B\u62FF\u5728\u624B\u91CC\u7684\u90A3\u4E00\u4EFD\uFF09\uFF1A" }),
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("pre", { className: "jh-json", children: JSON.stringify(current.effective, null, 2) }),
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("p", { className: "jh-muted", children: "\u4EE3\u7801\u9ED8\u8BA4\uFF1A" }),
		        /* @__PURE__ */ (0, import_jsx_runtime54.jsx)("pre", { className: "jh-json", children: JSON.stringify(current.defaults, null, 2) })
		      ] })
		    ] })
		  ] });
		}

		// src/client/screens/collect/dashboard-tab.tsx
		var import_jsx_runtime55 = require("react/jsx-runtime");
		function DashboardTab(props) {
		  const platformOptions = props.platformList.map((item) => ({ id: item.id, displayName: item.displayName }));
		  const scheduledPlan = props.planList.find((plan) => plan.enabled && plan.schedule.enabled);
		  const focusedPlan = props.planList.find((plan) => plan.id === props.focusPlanId) ?? scheduledPlan ?? props.planList[0];
		  return /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)(import_jsx_runtime55.Fragment, { children: [
		    props.status !== null ? /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(
		      StatusAlert,
		      {
		        status: props.status,
		        planName: scheduledPlan?.name ?? null,
		        running: props.running,
		        onResume: props.onResume
		      }
		    ) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("div", { className: "jh-collect-top", children: /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-collect-grid", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-form-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("h2", { className: "jh-card-title", children: "\u8FD0\u884C\u72B6\u6001" }),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(FieldHint, { text: "\u8C01\u5728\u8C03\u5EA6\u3001\u4E0B\u6B21\u4EC0\u4E48\u65F6\u5019\u8DD1\u3001\u6709\u6CA1\u6709\u4E0B\u4E00\u6B21\u3002\u540C\u4E00\u53F0\u7535\u8111\u53EA\u5141\u8BB8\u4E00\u4E2A\u7A97\u53E3\u771F\u6B63\u53BB\u91C7\u96C6 \u2014\u2014 \u4E24\u4E2A\u7A97\u53E3\u540C\u65F6\u91C7\u96C6\u4F1A\u62A2\u540C\u4E00\u4EFD\u6D4F\u89C8\u5668\u767B\u5F55\u6001\u3002" })
		        ] }),
		        props.status === null || props.story === null ? /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u8BFB\u53D6\u8C03\u5EA6\u72B6\u6001\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)(import_jsx_runtime55.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("p", { className: `jh-story jh-story-${props.story.tone}`, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("b", { children: props.story.owner }),
		            props.story.nextRun === null ? " \u2014\u2014 \u5F53\u524D\u6CA1\u6709\u542F\u7528\u5B9A\u65F6\u7684\u65B9\u6848\u3002" : props.status.paused ? `\uFF1A\u6062\u590D\u540E\u5C06\u6309 ${props.story.nextRun} \u8FD0\u884C` : `\uFF1A${props.story.nextRun}`
		          ] }),
		          props.story.detail === null ? null : /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("p", { className: "jh-note", children: props.story.detail }),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(
		            LeasePanel,
		            {
		              status: props.status,
		              now: props.now,
		              running: props.running,
		              onTakeover: props.onTakeover
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("ul", { className: "jh-kv", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(Term, { term: "\u65B0\u9C9C\u5EA6", children: "\u4E0A\u6B21\u6210\u529F" }) }),
		              /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { children: props.status.lastRunAt === null ? "\u4ECE\u6765\u6CA1\u6709\u6210\u529F\u91C7\u96C6\u8FC7" : `${formatClock(new Date(props.status.lastRunAt))} \xB7 ${formatRelative(new Date(props.status.lastRunAt), props.now)}` })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(Term, { term: "\u65F6\u6BB5", children: "\u65F6\u533A" }) }),
		              /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { title: "\u6392\u7A0B\u6309\u8FD9\u53F0\u7535\u8111\u7684\u672C\u5730\u65F6\u95F4\u7B97\u3002\u6539\u4E86\u7CFB\u7EDF\u65F6\u533A\uFF0C\u4E0B\u4E00\u6B21\u5C31\u7B97\u5230\u65B0\u65F6\u533A\u4E0A\u3002", children: props.status.timezone })
		            ] })
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-form-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("h2", { className: "jh-card-title", children: "\u5F53\u524D\u751F\u6548\u65B9\u6848" }),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-tiny",
		              title: "\u53BB\u300C\u65B9\u6848\u7BA1\u7406\u300D\u5206\u533A\u65B0\u589E/\u7F16\u8F91/\u5220\u9664\u65B9\u6848\u3002",
		              onClick: props.onGoPlans,
		              children: "\u7BA1\u7406\u65B9\u6848"
		            }
		          )
		        ] }),
		        props.plansLoading ? /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u8BFB\u53D6\u65B9\u6848\u2026" }) : focusedPlan === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-empty", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u65B9\u6848\u3002" }),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("p", { className: "jh-note", children: "\u65B9\u6848\u51B3\u5B9A\u6293\u4EC0\u4E48\uFF08\u5E73\u53F0 + \u7B5B\u9009\u6761\u4EF6 + \u6293\u53D6\u6DF1\u5EA6\uFF09\u4E0E\u4EC0\u4E48\u65F6\u5019\u6293\u3002\u53BB\u300C\u65B9\u6848\u7BA1\u7406\u300D\u5EFA\u7B2C\u4E00\u4E2A\u3002" })
		        ] }) : /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)(import_jsx_runtime55.Fragment, { children: [
		          props.planList.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("div", { className: "jh-chips jh-plan-switch", children: props.planList.map((plan) => /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(
		            "button",
		            {
		              type: "button",
		              className: `jh-chip${plan.id === focusedPlan.id ? " jh-chip-on" : ""}`,
		              "aria-pressed": plan.id === focusedPlan.id,
		              onClick: () => props.onFocusPlan(plan.id),
		              children: plan.name
		            },
		            plan.id
		          )) }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-plan-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("b", { className: "jh-plan-name", children: focusedPlan.name }),
		            focusedPlan.id === scheduledPlan?.id ? /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { className: "jh-tag jh-tone-ok", children: "\u751F\u6548\u4E2D" }) : null,
		            focusedPlan.enabled ? null : /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { className: "jh-tag jh-tone-muted", children: "\u5DF2\u505C\u7528" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-plan-meta", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { children: focusedPlan.platforms.join(" / ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(CriteriaLine, { plan: focusedPlan, dimensions: props.dimensionList })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-plan-meta", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("span", { children: focusedPlan.schedule.enabled ? `${formatWeekdays(focusedPlan.schedule.weekdays)} ${formatWindow(
		              focusedPlan.schedule.windowStartHour,
		              focusedPlan.schedule.windowStartMinute,
		              focusedPlan.schedule.windowEndHour,
		              focusedPlan.schedule.windowEndMinute
		            )}` : "\u4E0D\u5B9A\u65F6" }),
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("span", { children: [
		              focusedPlan.postProcess.score ? "\u6253\u5206" : "\u4E0D\u6253\u5206",
		              " \xB7",
		              " ",
		              focusedPlan.postProcess.flag ? "\u6807\u6CE8" : "\u4E0D\u6807\u6CE8",
		              " \xB7",
		              " ",
		              focusedPlan.postProcess.dedup ? "\u53BB\u91CD" : "\u4E0D\u53BB\u91CD"
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-plan-actions", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-primary",
		                disabled: props.runBlocked,
		                title: props.runBlockTitle,
		                onClick: () => props.onTrigger(focusedPlan),
		                children: "\u7ACB\u5373\u91C7\u96C6"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny",
		                disabled: props.running,
		                title: "\u6539\u8FD9\u4E2A\u65B9\u6848\u6293\u4EC0\u4E48\u3001\u6293\u591A\u6DF1\u3001\u4EC0\u4E48\u65F6\u5019\u6293\u3002",
		                onClick: () => props.onEdit(focusedPlan),
		                children: "\u7F16\u8F91"
		              }
		            )
		          ] })
		        ] })
		      ] })
		    ] }) }),
		    props.status === null && !props.runsLoading ? null : /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("h2", { className: "jh-card-title", children: "\u6700\u8FD1\u8FD0\u884C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(FieldHint, { text: "\u6309\u5F00\u59CB\u65F6\u523B\u5012\u5E8F\uFF08\u65B0\u7684\u5728\u4E0A\u9762\uFF09\u3002\u547D\u4E2D=\u8FD9\u4E00\u8F6E\u6293\u5230\u591A\u5C11\u6761\uFF08\u60AC\u505C\u770B\u7FFB\u4E86\u51E0\u9875\uFF09\uFF1B\u65B0\u589E/\u66F4\u65B0=\u771F\u6B63\u5199\u8FDB\u5C97\u4F4D\u5E93\u7684\u91CF\uFF1B\u9694\u79BB=\u88AB\u5B57\u6BB5\u65AD\u8A00\u62E6\u4E0B\u3001\u8FDB\u4E86\u5F85\u4FEE\u961F\u5217\u7684\u6761\u6570\u3002\u5931\u8D25\u7684\u90A3\u4E00\u6B21\u4E0D\u7B97\u300C\u4E0A\u6B21\u6210\u529F\u300D\u2014\u2014 \u5931\u8D25\u4E0D\u4F1A\u8BA9\u6570\u636E\u53D8\u65B0\u3002\u70B9\u9519\u8BEF\u80F6\u56CA\u770B\u5B8C\u6574\u539F\u56E0\u4E0E\u6392\u67E5\u6B65\u9AA4\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(
		        RunHistoryTable,
		        {
		          runs: props.status === null ? [] : props.status.recentRuns,
		          loading: props.runsLoading,
		          reasonFor: props.reasonFor,
		          platformName: props.platformNameOf,
		          onOpenError: props.onOpenError
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("h2", { className: "jh-card-title", children: "\u5E73\u53F0\u72B6\u6001\u603B\u89C8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(FieldHint, { text: "\u300C\u4ECA\u5929\u80FD\u8DD1\u300D\u7528\u7684\u662F\u4E0E\u8C03\u5EA6\u540C\u4E00\u4E2A\u524D\u7F6E\u6761\u4EF6\u5224\u5B9A \u2014\u2014 \u8FD9\u91CC\u5199\u7740\u300C\u53EF\u4EE5\u300D\u7684\u5E73\u53F0\uFF0C\u5230\u70B9\u771F\u7684\u4F1A\u8DD1\uFF1B\u5199\u7740\u539F\u56E0\u7684\uFF0C\u5C31\u662F\u5B83\u73B0\u5728\u88AB\u4EC0\u4E48\u62E6\u4F4F\u4E86\u3002\u300C\u64CD\u4F5C\u300D\u5217\u4E0A\uFF1A\u68C0\u6D4B\u53EA\u67E5\u767B\u5F55\u6001\u3001\u767B\u5F55\u4F1A\u6253\u5F00\u767B\u5F55\u9875\u3001\u660E\u7EC6\u770B\u5B8C\u6574\u8BCA\u65AD\u3002" })
		      ] }),
		      props.platformsError !== null && /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("p", { className: "jh-error", children: props.platformsError }),
		      props.platformsLoading ? /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u8BFB\u53D6\u5E73\u53F0\u72B6\u6001\u2026" }) : props.platformList.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime55.jsxs)("div", { className: "jh-empty", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6CE8\u518C\u5E73\u53F0\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime55.jsx)("p", { className: "jh-note", children: "\u5E73\u53F0\u6765\u81EA\u9002\u914D\u5668\u6CE8\u518C\u8868\uFF1B\u5F53\u524D\u6CA1\u6709\u4EFB\u4F55\u9002\u914D\u5668\u88AB\u6CE8\u518C\uFF0C\u6240\u4EE5\u65E0\u6CD5\u91C7\u96C6\u3002" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(
		        PlatformMatrix,
		        {
		          items: props.platformList,
		          reasonText: props.reasonText,
		          running: props.running,
		          onLogin: props.onLogin,
		          onCheck: props.onCheck,
		          onDetail: props.onDetail
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(RepairQueueCard, { revision: props.revision, platforms: platformOptions }),
		    /* @__PURE__ */ (0, import_jsx_runtime55.jsx)(AdapterConfigCard, { revision: props.revision, platforms: platformOptions, onChanged: props.onReload })
		  ] });
		}

		// src/client/views/freshness.tsx
		var import_jsx_runtime56 = require("react/jsx-runtime");
		function FreshnessBadge(props) {
		  const label = props.level === "fresh" ? "\u65B0\u9C9C" : props.level === "stale" ? "\u504F\u65E7" : "\u9648\u65E7";
		  const cls = props.level === "fresh" ? "jh-fresh-fresh" : props.level === "stale" ? "jh-fresh-stale" : "jh-fresh-cold";
		  return /* @__PURE__ */ (0, import_jsx_runtime56.jsxs)(
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

		// src/client/screens/collect/dedup-groups-card.tsx
		var import_react25 = require("react");
		var import_jsx_runtime57 = require("react/jsx-runtime");
		function DedupGroupsCard(props) {
		  const groups = useAsync((signal) => fetchDedupGroups(signal), [props.revision]);
		  const [busyId, setBusyId] = (0, import_react25.useState)(null);
		  const [pendingDelete, setPendingDelete] = (0, import_react25.useState)(null);
		  const [error, setError] = (0, import_react25.useState)(null);
		  const act = async (id, fn) => {
		    setBusyId(id);
		    setError(null);
		    try {
		      await fn();
		      groups.reload();
		    } catch (thrown) {
		      setError(thrown instanceof ApiError ? thrown.display : String(thrown));
		    } finally {
		      setBusyId(null);
		    }
		  };
		  const items = groups.state.status === "ok" ? groups.state.data.items : [];
		  const total = groups.state.status === "ok" ? groups.state.data.count : 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime57.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime57.jsxs)("div", { className: "jh-form-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime57.jsx)("h2", { className: "jh-card-title", children: "\u8DE8\u5E73\u53F0\u53BB\u91CD" }),
		      /* @__PURE__ */ (0, import_jsx_runtime57.jsx)(FieldHint, { text: "\u540C\u4E00\u5C97\u4F4D\u88AB\u591A\u4E2A\u5E73\u53F0\u5404\u6293\u4E00\u6761\u65F6\u5408\u5E76\u5230\u540C\u4E00\u7EC4\uFF0C\u4F9D\u636E\u662F\u8DE8\u5E73\u53F0 + \u540C\u516C\u53F8\u540C\u57CE + \u85AA\u8D44\u4E0D\u51B2\u7A81 + \u6807\u9898\u76F8\u4F3C\u3002\u5408\u5E76\u662F\u53EF\u9006\u7684\uFF1A\u8BEF\u5408\u5E76\u968F\u65F6\u53EF\u4EE5\u5728\u4E0B\u9762\u62C6\u5F00\u3002\u8865\u505A\u4E00\u6B21\u5168\u5E93\u590D\u6838\u7528\u9876\u90E8\u7684\u300C\u8FD0\u884C\u5168\u5E93\u53BB\u91CD\u300D\u3002" })
		    ] }),
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime57.jsx)(ErrorLine, { role: "alert", children: error }),
		    groups.state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime57.jsx)(LoadingLine, { busy: true, children: "\u6B63\u5728\u8BFB\u53D6\u53BB\u91CD\u5206\u7EC4\u2026" }) : items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime57.jsx)("p", { className: "jh-muted", children: "\u76EE\u524D\u6CA1\u6709\u53BB\u91CD\u5206\u7EC4\u3002\u591A\u5E73\u53F0\u540C\u65F6\u5728\u6293\u540C\u4E00\u6279\u5C97\u4F4D\u65F6\uFF0C\u91CD\u590D\u7684\u90A3\u51E0\u6761\u624D\u4F1A\u88AB\u5408\u5E76\u5230\u8FD9\u91CC\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime57.jsx)("ul", { className: "jh-tailor-notes", children: items.map((group) => /* @__PURE__ */ (0, import_jsx_runtime57.jsxs)("li", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime57.jsxs)("span", { className: "jh-muted", children: [
		        "\u7EC4 #",
		        group.id,
		        "\uFF08",
		        group.basis,
		        "\uFF09"
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime57.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost",
		          disabled: busyId !== null,
		          onClick: () => setPendingDelete(group.id),
		          children: "\u62C6\u7EC4"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime57.jsx)("ul", { className: "jh-tailor-notes", children: group.members.map((member) => /* @__PURE__ */ (0, import_jsx_runtime57.jsxs)("li", { children: [
		        "\xB7 ",
		        member.isPrimary ? "\u4E3B" : "\u4ECE",
		        "\uFF5C",
		        member.platformName ?? member.platformId,
		        "\uFF5C",
		        member.title,
		        member.companyName === null ? "" : `\uFF5C${member.companyName}`,
		        "\u3000",
		        "(",
		        member.city,
		        ")",
		        member.isPrimary ? null : /* @__PURE__ */ (0, import_jsx_runtime57.jsx)(
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
		    total > items.length ? /* @__PURE__ */ (0, import_jsx_runtime57.jsxs)("p", { className: "jh-muted", children: [
		      "\u5171 ",
		      total,
		      " \u7EC4\uFF0C\u8FD9\u91CC\u5217\u51FA\u6700\u65B0\u7684 ",
		      items.length,
		      " \u7EC4\u3002"
		    ] }) : null,
		    pendingDelete === null ? null : /* @__PURE__ */ (0, import_jsx_runtime57.jsx)(
		      Modal,
		      {
		        title: "\u62C6\u6563\u8FD9\u4E2A\u53BB\u91CD\u7EC4",
		        label: "\u62C6\u7EC4\u786E\u8BA4",
		        onClose: () => setPendingDelete(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime57.jsxs)(import_jsx_runtime57.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime57.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => setPendingDelete(null), children: "\u53D6\u6D88" }),
		          /* @__PURE__ */ (0, import_jsx_runtime57.jsx)(
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
		        children: /* @__PURE__ */ (0, import_jsx_runtime57.jsx)("p", { className: "jh-alert-body", children: "\u62C6\u7EC4\u540E\u8FD9\u7EC4\u91CC\u7684\u5C97\u4F4D\u5168\u90E8\u53D8\u56DE\u72EC\u7ACB\u5C97\u4F4D\u3002**\u5C97\u4F4D\u672C\u8EAB\u4E0D\u4F1A\u5220** \u2014\u2014 \u53EA\u662F\u60F3\u64A4\u9500\u4E00\u6B21\u5408\u5E76\u5224\u65AD\u3002" })
		      }
		    )
		  ] });
		}

		// src/client/screens/collect/plans-tab.tsx
		var import_jsx_runtime58 = require("react/jsx-runtime");
		function PlansTab(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)(import_jsx_runtime58.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("h2", { className: "jh-card-title", children: "\u91C7\u96C6\u65B9\u6848" }),
		        /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: props.running,
		            title: "\u65B0\u5EFA\u4E00\u4E2A\u91C7\u96C6\u65B9\u6848\uFF1A\u51B3\u5B9A\u6293\u4EC0\u4E48\uFF08\u5E73\u53F0 + \u7B5B\u9009\u6761\u4EF6 + \u6293\u53D6\u6DF1\u5EA6\uFF09\u4E0E\u4EC0\u4E48\u65F6\u5019\u6293\u3002",
		            onClick: props.onNew,
		            children: "\u65B0\u589E\u65B9\u6848"
		          }
		        )
		      ] }),
		      props.plansLoading ? /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("ul", { className: "jh-plan-list", "aria-busy": "true", "aria-live": "polite", children: /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("li", { className: "jh-plan-card jh-skeleton-row", children: "\u6B63\u5728\u8BFB\u53D6\u65B9\u6848\u2026" }) }) : props.planList.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-empty", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u65B9\u6848\u3002" }),
		        /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("p", { className: "jh-note", children: "\u65B9\u6848\u51B3\u5B9A\u6293\u4EC0\u4E48\uFF08\u5E73\u53F0 + \u7B5B\u9009\u6761\u4EF6 + \u6293\u53D6\u6DF1\u5EA6\uFF09\u4E0E\u4EC0\u4E48\u65F6\u5019\u6293\u3002\u70B9\u53F3\u4E0A\u89D2\u300C\u65B0\u589E\u65B9\u6848\u300D\u5EFA\u7B2C\u4E00\u4E2A\u3002" })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("ul", { className: "jh-plan-list", children: props.planList.map((plan) => {
		        const planStatus = props.status?.planStatus.find((item) => item.planId === plan.id) ?? null;
		        const decision = planStatus?.lastDecision ?? null;
		        const platformDecisions = new Map(
		          (planStatus?.platformDecisions ?? []).map((item) => [item.platformId, item.decision])
		        );
		        const blockedPlatforms = plan.platforms.filter(
		          (id) => (platformDecisions.get(id)?.reason ?? null) !== null
		        );
		        const platformName = (id) => props.platformList.find((item) => item.id === id)?.displayName ?? id;
		        return /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("li", { className: "jh-plan-card", children: [
		          planStatus?.riskPaused === true && /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-banner jh-banner-error", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("span", { className: "jh-banner-title", children: /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(Term, { term: "\u98CE\u63A7\u6682\u505C", children: "\u5DF2\u88AB\u6682\u505C\u81EA\u52A8\u91C7\u96C6" }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("span", { children: planStatus.riskReason ?? "\u89E6\u53D1\u98CE\u63A7\u4FE1\u53F7\uFF0C\u5DF2\u505C\u6B62\u81EA\u52A8\u5C1D\u8BD5\u3002" })
		          ] }),
		          planStatus !== null && planStatus.backoffUntil !== null && /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-banner jh-banner-warn", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("span", { className: "jh-banner-title", children: [
		              "\u8FDE\u7EED\u5931\u8D25 ",
		              planStatus.failStreak,
		              " \u6B21\uFF0C\u6B63\u5728",
		              /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(Term, { term: "\u9000\u907F", children: "\u9000\u907F" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("span", { children: [
		              "\u6700\u65E9 ",
		              formatClock(new Date(planStatus.backoffUntil)),
		              " \u518D\u8BD5\u3002"
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-plan-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("b", { className: "jh-plan-name", children: plan.name }),
		            planStatus === null ? null : /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(
		              FreshnessBadge,
		              {
		                level: planStatus.freshness.level,
		                hours: planStatus.freshness.hoursSinceSuccess
		              }
		            ),
		            plan.enabled ? null : /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("span", { className: "jh-tag jh-tone-muted", children: "\u5DF2\u505C\u7528" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-plan-meta", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("span", { children: plan.platforms.join(" / ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(CriteriaLine, { plan, dimensions: props.dimensionList })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-plan-meta", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("span", { children: plan.schedule.enabled ? `${formatWeekdays(plan.schedule.weekdays)} ${formatWindow(
		              plan.schedule.windowStartHour,
		              plan.schedule.windowStartMinute,
		              plan.schedule.windowEndHour,
		              plan.schedule.windowEndMinute
		            )}` : "\u4E0D\u5B9A\u65F6" }),
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("span", { children: [
		              plan.postProcess.score ? "\u6253\u5206" : "\u4E0D\u6253\u5206",
		              " \xB7",
		              " ",
		              plan.postProcess.flag ? "\u6807\u6CE8" : "\u4E0D\u6807\u6CE8",
		              " \xB7",
		              " ",
		              plan.postProcess.dedup ? "\u53BB\u91CD" : "\u4E0D\u53BB\u91CD"
		            ] })
		          ] }),
		          decision === null ? null : /* @__PURE__ */ (0, import_jsx_runtime58.jsx)("div", { className: decision.decision === "skipped" ? "jh-warn" : "jh-muted", children: decision.decision === "skipped" ? `\u4E0A\u6B21\u5230\u70B9\u6CA1\u8DD1\uFF1A${decision.message ?? decision.reason ?? "\u539F\u56E0\u672A\u77E5"}` : decision.decision === "ran" ? "\u4E0A\u6B21\u5230\u70B9\u8DD1\u4E86" : "\u8FD8\u5728\u7B49\u4E0B\u4E00\u4E2A\u65F6\u6BB5" }),
		          blockedPlatforms.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-muted", children: [
		            "\u5404\u5E73\u53F0\uFF1A",
		            plan.platforms.map((id) => {
		              const item = platformDecisions.get(id) ?? null;
		              return item?.reason == null ? `${platformName(id)} \u6B63\u5E38` : `${platformName(id)}\uFF1A${item.message ?? item.reason}`;
		            }).join(" \xB7 ")
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime58.jsxs)("div", { className: "jh-plan-actions", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-primary",
		                disabled: props.runBlocked,
		                title: props.runBlockTitle,
		                onClick: () => props.onTrigger(plan),
		                children: "\u7ACB\u5373\u91C7\u96C6"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny",
		                disabled: props.running,
		                title: "\u6539\u8FD9\u4E2A\u65B9\u6848\u6293\u4EC0\u4E48\u3001\u6293\u591A\u6DF1\u3001\u4EC0\u4E48\u65F6\u5019\u6293\u3002",
		                onClick: () => props.onEdit(plan),
		                children: "\u7F16\u8F91"
		              }
		            ),
		            planStatus?.riskPaused === true && /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-warn",
		                disabled: props.running,
		                title: "\u786E\u8BA4\u73AF\u5883\u5DF2\u6062\u590D\u6B63\u5E38\uFF0C\u5141\u8BB8\u8FD9\u4E2A\u65B9\u6848\u91CD\u65B0\u88AB\u81EA\u52A8\u91C7\u96C6\u3002\u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u3002",
		                onClick: () => props.onResumeRisk(plan),
		                children: "\u786E\u8BA4\u6062\u590D"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny jh-btn-danger-ghost",
		                disabled: props.running,
		                title: "\u5220\u9664\u8FD9\u4E2A\u65B9\u6848\uFF08\u4F1A\u5148\u8BA9\u4F60\u786E\u8BA4\uFF09\u3002\u5DF2\u7ECF\u6293\u5230\u7684\u5C97\u4F4D\u4E0D\u53D7\u5F71\u54CD\u3002",
		                onClick: () => props.onAskDelete(plan),
		                children: "\u5220\u9664"
		              }
		            )
		          ] })
		        ] }, plan.id);
		      }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime58.jsx)(DedupGroupsCard, { revision: props.revision + props.dedupRevision })
		  ] });
		}

		// src/client/screens/collect/capability-matrix.tsx
		var import_jsx_runtime59 = require("react/jsx-runtime");
		var LEVEL_SHORT = {
		  high: "\u9AD8",
		  medium: "\u4E2D",
		  low: "\u4F4E"
		};
		function CapabilityCell(props) {
		  if (props.implemented) return /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("span", { className: "jh-tag jh-tone-ok", children: "\u5DF2\u5B9E\u73B0" });
		  if (props.supported) return /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("span", { className: "jh-tag jh-tone-warn", children: "\u672A\u5B9E\u73B0" });
		  return /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("span", { className: "jh-tag jh-tone-muted", children: "\u4E0D\u652F\u6301" });
		}
		function DoneCell(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("span", { className: `jh-tag jh-tone-${props.done ? "ok" : "muted"}`, children: props.done ? "\u5DF2\u5B9E\u73B0" : "\u672A\u5B9E\u73B0" });
		}
		function CapabilityMatrix(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime59.jsxs)("table", { className: "jh-table jh-table-caps", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime59.jsxs)("tr", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", className: "jh-col-sticky", children: "\u5E73\u53F0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", className: "jh-col-hide-sm", children: "\u6210\u719F\u5EA6" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", className: "jh-col-hide-sm", children: "\u4E0A\u6B21\u9A8C\u8BC1" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u5217\u8868\u91C7\u96C6" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u8BE6\u60C5\u9875" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u6253\u62DB\u547C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u6536\u4EF6\u7BB1" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u9644\u4EF6\u6295\u9012" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u767B\u5F55\u68C0\u6D4B" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u6293\u53D6\u9700\u767B\u5F55" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u5B57\u6BB5\u5B8C\u6574\u5EA6" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("th", { scope: "col", children: "\u53CD\u722C\u5F3A\u5EA6" })
		    ] }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("tbody", { children: props.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime59.jsxs)("tr", { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsxs)("td", { className: "jh-col-sticky", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("code", { children: item.id }),
		        /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("div", { className: "jh-muted", children: item.displayName })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsxs)("td", { className: "jh-col-hide-sm", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("span", { className: `jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`, children: MATURITY_LEVEL_SHORT[item.maturity.level] }),
		        item.maturity.notes === void 0 || item.maturity.notes === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("div", { className: "jh-muted", children: item.maturity.notes })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { className: "jh-col-hide-sm", children: item.maturity.verifiedAt ?? "\u2014" }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime59.jsx)(DoneCell, { done: item.implementation.crawl }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime59.jsx)(DoneCell, { done: item.implementation.detail }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime59.jsx)(
		        CapabilityCell,
		        {
		          supported: item.capabilities.supportsGreeting,
		          implemented: item.implementation.actions.sayHello
		        }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime59.jsx)(
		        CapabilityCell,
		        {
		          supported: item.capabilities.supportsInbox,
		          implemented: item.implementation.actions.readInbox
		        }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime59.jsx)(
		        CapabilityCell,
		        {
		          supported: item.capabilities.supportsAttachment,
		          implemented: item.implementation.actions.sendResume
		        }
		      ) }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime59.jsx)(DoneCell, { done: item.implementation.loginCheck }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { children: AUTH_REQUIREMENT_LABEL[item.authRequirement.crawl] }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { children: LEVEL_SHORT[item.capabilities.fieldCompleteness] }),
		      /* @__PURE__ */ (0, import_jsx_runtime59.jsx)("td", { className: item.capabilities.antiBot === "high" ? "jh-warn" : void 0, children: LEVEL_SHORT[item.capabilities.antiBot] })
		    ] }, item.id)) })
		  ] }) });
		}

		// src/client/screens/collect/diagnostics-tab.tsx
		var import_jsx_runtime60 = require("react/jsx-runtime");
		function DiagnosticsTab(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime60.jsxs)(import_jsx_runtime60.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime60.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime60.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime60.jsx)("h2", { className: "jh-card-title", children: "\u5B9E\u9A8C\u914D\u7F6E\u4E0E\u80FD\u529B" }),
		        /* @__PURE__ */ (0, import_jsx_runtime60.jsx)(FieldHint, { text: "\u6210\u719F\u5EA6 = \u8FD9\u4E2A\u9002\u914D\u5668\u9A8C\u8BC1\u5230\u4EC0\u4E48\u7A0B\u5EA6\uFF08\u6CE8\u518C\u8868\u91CC\u6709\u5E73\u53F0 \u2260 \u8FD9\u4E2A\u5E73\u53F0\u80FD\u7528\uFF09\u3002\u300C\u5DF2\u5B9E\u73B0\u300D= \u8FD9\u6761\u94FE\u8DEF\u6211\u4EEC\u5DF2\u7ECF\u5199\u4E86\uFF1B\u300C\u672A\u5B9E\u73B0\u300D= \u5E73\u53F0\u652F\u6301\u3001\u6211\u4EEC\u8FD8\u6CA1\u5199\uFF1B\u300C\u4E0D\u652F\u6301\u300D= \u5E73\u53F0\u672C\u8EAB\u6CA1\u6709\u8FD9\u4E2A\u80FD\u529B\u3002\u6293\u53D6\u9700\u767B\u5F55\u4E0E\u767B\u5F55\u68C0\u6D4B\u662F\u4E24\u4EF6\u4E8B\uFF1A\u524D\u8005\u662F\u5E73\u53F0\u4E8B\u5B9E\uFF0C\u540E\u8005\u662F\u672C\u673A\u6709\u6CA1\u6709\u505A\u767B\u5F55\u6001\u68C0\u6D4B\u3002" })
		      ] }),
		      props.platformsError !== null && /* @__PURE__ */ (0, import_jsx_runtime60.jsx)("p", { className: "jh-error", children: props.platformsError }),
		      props.platformsLoading ? /* @__PURE__ */ (0, import_jsx_runtime60.jsx)(LoadingLine, { busy: true, live: "polite", children: "\u6B63\u5728\u8BFB\u53D6\u5E73\u53F0\u914D\u7F6E\u2026" }) : props.platformList.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime60.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u6CE8\u518C\u5E73\u53F0\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime60.jsx)(CapabilityMatrix, { items: props.platformList })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime60.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime60.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime60.jsx)("h2", { className: "jh-card-title", children: "\u5F02\u5E38\u65E5\u5FD7" }),
		        /* @__PURE__ */ (0, import_jsx_runtime60.jsx)(FieldHint, { text: "\u53EA\u5217\u5931\u8D25\u4E0E\u88AB\u8DF3\u8FC7\u7684\u8F6E\u6B21 \u2014\u2014 \u6210\u529F\u7684\u90A3\u51E0\u8F6E\u5728\u300C\u8FD0\u884C\u4EEA\u8868\u76D8 \xB7 \u6700\u8FD1\u8FD0\u884C\u300D\u91CC\u3002\u70B9\u9519\u8BEF\u80F6\u56CA\u770B\u539F\u59CB\u4FE1\u606F\u4E0E\u6392\u67E5\u6B65\u9AA4\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime60.jsx)(
		        RunLogCard,
		        {
		          runs: props.status === null ? [] : props.status.recentRuns,
		          loading: props.runsLoading,
		          reasonFor: props.reasonFor,
		          platformName: props.platformNameOf,
		          onOpenError: props.onOpenError
		        }
		      )
		    ] })
		  ] });
		}

		// src/client/screens/collect/index.tsx
		var import_jsx_runtime61 = require("react/jsx-runtime");
		var COLLECT_TABS = [
		  { key: "dashboard", label: "\u8FD0\u884C\u4EEA\u8868\u76D8" },
		  { key: "plans", label: "\u65B9\u6848\u7BA1\u7406" },
		  { key: "diagnostics", label: "\u8BCA\u65AD\u4E0E\u660E\u7EC6" }
		];
		function CollectScreen(props) {
		  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision]);
		  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision]);
		  const plans = useAsync((signal) => fetchPlans(signal), [props.revision]);
		  const reasons = useAsync((signal) => fetchSkipReasons(signal), [props.revision]);
		  const dimensions = useAsync((signal) => fetchCriteriaDimensions([], signal), [props.revision]);
		  const [feedback, setFeedback] = (0, import_react26.useState)(IDLE);
		  const [editing, setEditing] = (0, import_react26.useState)(null);
		  const [duplicates, setDuplicates] = (0, import_react26.useState)([]);
		  const [notices, setNotices] = (0, import_react26.useState)([]);
		  const [errorDetail, setErrorDetail] = (0, import_react26.useState)(null);
		  const [pendingDelete, setPendingDelete] = (0, import_react26.useState)(null);
		  const [tab, setTab] = (0, import_react26.useState)("dashboard");
		  const [detailTarget, setDetailTarget] = (0, import_react26.useState)(null);
		  const [checkTarget, setCheckTarget] = (0, import_react26.useState)(null);
		  const [checkState, setCheckState] = (0, import_react26.useState)({ running: false, result: null, error: null });
		  const [focusPlanId, setFocusPlanId] = (0, import_react26.useState)(null);
		  const [dedupRevision, setDedupRevision] = (0, import_react26.useState)(0);
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
		  const platformsError = platforms.state.status === "error" ? platforms.state.message : null;
		  const plansLoading = plans.state.status === "loading";
		  const platformsLoading = platforms.state.status === "loading";
		  const runsLoading = scheduler.state.status === "loading";
		  const reasonText = reasons.state.status === "ok" ? reasons.state.data.items : {};
		  const dimensionList = dimensions.state.status === "ok" ? dimensions.state.data.items : [];
		  const now = (0, import_react26.useMemo)(() => /* @__PURE__ */ new Date(), [props.revision]);
		  const story = status === null ? null : scheduleStoryOf(status, now);
		  const login = (platformId) => act("\u5DF2\u6253\u5F00\u767B\u5F55\u9875\uFF0C\u8BF7\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\u91CC\u5B8C\u6210\u767B\u5F55\uFF08\u6BCF 3 \u79D2\u68C0\u6D4B\u4E00\u6B21\uFF09", async () => {
		    const result = await startLogin(platformId);
		    return result.message ?? "\u767B\u5F55\u5F15\u5BFC\u5DF2\u542F\u52A8";
		  });
		  const runCheck = async (platformId) => {
		    setCheckState({ running: true, result: null, error: null });
		    try {
		      const result = await checkLogin(platformId);
		      setCheckState({ running: false, result, error: null });
		      platforms.reload();
		    } catch (error) {
		      setCheckState({
		        running: false,
		        result: null,
		        error: error instanceof ApiError ? error.display : String(error)
		      });
		    }
		  };
		  const startCheck = (platformId, displayName) => {
		    setCheckTarget({ id: platformId, displayName });
		    void runCheck(platformId);
		  };
		  const trigger = (plan) => act("\u6B63\u5728\u6309\u65B9\u6848\u91C7\u96C6\u2026\uFF08\u4F1A\u6253\u5F00\u4E00\u4E2A\u6D4F\u89C8\u5668\u7A97\u53E3\uFF09", async () => {
		    const summary = await runPlan(plan.id);
		    return `\u65B9\u6848\u300C${plan.name}\u300D\u672C\u8F6E ${CRAWL_STATE_LABEL[summary.run.state]}\uFF1A\u547D\u4E2D ${String(summary.run.found)} \xB7 \u65B0\u589E ${String(summary.run.inserted)} \xB7 \u66F4\u65B0 ${String(summary.run.updated)} \xB7 \u9694\u79BB ${String(summary.run.quarantined)}`;
		  });
		  const reasonFor = (skipReason) => skipReason === null ? null : reasonText[skipReason] ?? skipReason;
		  const platformNameOf = (id) => platformList.find((item) => item.id === id)?.displayName ?? null;
		  const confirmDelete = async (plan) => {
		    setPendingDelete(null);
		    await act("\u6B63\u5728\u5220\u9664\u2026", async () => {
		      await deletePlan(plan.id);
		      return `\u5DF2\u5220\u9664\u65B9\u6848\u300C${plan.name}\u300D\u3002\u5DF2\u7ECF\u6293\u5230\u7684\u5C97\u4F4D\u4E0D\u53D7\u5F71\u54CD\u3002`;
		    });
		  };
		  const runBlockTitle = status?.readOnly === true ? `\u672C\u7A97\u53E3\u6CA1\u6709\u91C7\u96C6\u6743\u3002\u7528\u300C\u63A5\u7BA1\u8C03\u5EA6\u300D\uFF0C\u6216\u5230\u53E6\u4E00\u4E2A\u7A97\u53E3\uFF08\u8FDB\u7A0B ${String(status.lease.pid ?? "?")}\uFF09\u91CC\u64CD\u4F5C\u3002` : feedback.running ? "\u6709\u53E6\u4E00\u4E2A\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u5019\u3002" : checkState.running ? "\u6B63\u5728\u68C0\u6D4B\u67D0\u4E2A\u5E73\u53F0\u7684\u767B\u5F55\u6001\uFF08\u5360\u7528\u540C\u4E00\u4E2A\u6D4F\u89C8\u5668\uFF09\uFF0C\u7B49\u5B83\u7ED3\u675F\u518D\u91C7\u96C6\u3002" : "\u73B0\u5728\u6309\u8FD9\u4E2A\u65B9\u6848\u91C7\u96C6\u4E00\u6B21\uFF08\u4F1A\u6253\u5F00\u6D4F\u89C8\u5668\u7A97\u53E3\uFF09\u3002";
		  const startCreate = () => {
		    setDuplicates([]);
		    setEditing({ id: "new", form: emptyForm() });
		  };
		  const startEdit = (plan) => {
		    setDuplicates([]);
		    setEditing({ id: plan.id, form: formOf(plan) });
		  };
		  const resumeSchedule = () => void act("\u6B63\u5728\u6062\u590D\u5B9A\u65F6\u2026", async () => {
		    await setSchedulePaused(false);
		    return "\u5DF2\u6062\u590D\u5B9A\u65F6\u6293\u53D6\u3002";
		  });
		  const takeover = () => void act("\u6B63\u5728\u63A5\u7BA1\u8C03\u5EA6\u2026", async () => {
		    await takeoverLease();
		    return "\u5DF2\u63A5\u7BA1\u8C03\u5EA6\uFF0C\u672C\u7A97\u53E3\u73B0\u5728\u8D1F\u8D23\u91C7\u96C6\u3002";
		  });
		  const resumeRisk = (plan) => void act("\u6B63\u5728\u6062\u590D\u2026", async () => {
		    await resumePlanRisk(plan.id);
		    return `\u65B9\u6848\u300C${plan.name}\u300D\u5DF2\u6062\u590D \u2014\u2014 \u8FD9\u4E00\u4E0B\u662F\u4F60\u786E\u8BA4\u7684\uFF0C\u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u3002`;
		  });
		  const runBlocked = feedback.running || checkState.running || (status?.readOnly ?? false);
		  const toggleSchedule = () => {
		    if (status === null) return;
		    const next = !status.paused;
		    void act(next ? "\u6B63\u5728\u6682\u505C\u5B9A\u65F6\u2026" : "\u6B63\u5728\u6062\u590D\u5B9A\u65F6\u2026", async () => {
		      await setSchedulePaused(next);
		      return next ? "\u5DF2\u6682\u505C**\u5B9A\u65F6**\u6293\u53D6\u3002\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4ECD\u7136\u53EF\u7528\u3002" : "\u5DF2\u6062\u590D\u5B9A\u65F6\u6293\u53D6\u3002";
		    });
		  };
		  const recheck = () => void act("\u6B63\u5728\u91CD\u65B0\u68C0\u6D4B\u2026", async () => {
		    const next = await recheckLease();
		    return next.lease.held ? "\u5DF2\u7ECF\u62FF\u5230\u8C03\u5EA6\u6743\uFF0C\u672C\u7A97\u53E3\u73B0\u5728\u8D1F\u8D23\u91C7\u96C6\u3002" : "\u90A3\u4E2A\u7A97\u53E3\u8FD8\u5728\u8FD0\u884C\uFF0C\u672C\u7A97\u53E3\u4ECD\u662F\u53EA\u8BFB\u3002";
		  });
		  const sweep = () => void act("\u6B63\u5728\u6309\u540C\u4E00\u5957\u95E8\u69DB\u590D\u6838\u5168\u5E93\u2026", async () => {
		    const result = await runDedupSweep();
		    setDedupRevision((value) => value + 1);
		    return `\u770B\u8FC7 ${String(result.scanned)} \u6761` + (result.skippedGrouped > 0 ? `\uFF08\u8DF3\u8FC7\u5DF2\u5728\u5206\u7EC4\u91CC\u7684 ${String(result.skippedGrouped)} \u6761\uFF09` : "") + `\uFF1A\u5408\u5E76 ${String(result.merged)} \u6761\u3001\u65B0\u5EFA ${String(result.newGroups)} \u7EC4\uFF0C\u73B0\u5728\u5171 ${String(result.groups)} \u7EC4\u3002` + (result.candidates > 0 ? `\u53E6\u6709 ${String(result.candidates)} \u6761\u7591\u4F3C\u91CD\u590D\u6CA1\u81EA\u52A8\u5408\u5E76\uFF08\u6807\u9898\u76F8\u4F3C\u5EA6\u4E0D\u591F\uFF09\u2014\u2014 \u9700\u8981\u4EBA\u5DE5\u770B\u4E00\u773C\u3002` : "");
		  });
		  return /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("div", { className: "jh-screen", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("div", { className: "jh-collect-bar", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("nav", { className: "jh-modes", "aria-label": "\u91C7\u96C6\u5206\u533A", children: COLLECT_TABS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		        "button",
		        {
		          type: "button",
		          className: `jh-mode${tab === item.key ? " jh-mode-active" : ""}`,
		          "aria-current": tab === item.key ? "page" : void 0,
		          onClick: () => setTab(item.key),
		          children: item.label
		        },
		        item.key
		      )) }),
		      /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { className: "jh-spacer" }),
		      status === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("span", { className: "jh-collect-switch", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		          "span",
		          {
		            className: `jh-status-dot ${status.paused ? "jh-status-dot-warn" : "jh-status-dot-on"}`,
		            "aria-hidden": "true"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { className: "jh-collect-switch-text", children: status.paused ? "\u5B9A\u65F6\u5DF2\u6682\u505C" : "\u5B9A\u65F6\u8FD0\u884C\u4E2D" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-primary",
		          disabled: status === null || feedback.running,
		          title: status?.paused === true ? "\u6062\u590D\u300C\u5230\u70B9\u81EA\u52A8\u8DD1\u300D\u3002\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4E00\u76F4\u90FD\u80FD\u7528\u3002" : "\u53EA\u505C\u300C\u5230\u70B9\u81EA\u52A8\u8DD1\u300D\uFF1B\u624B\u52A8\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u4E0D\u53D7\u5F71\u54CD\u3002",
		          onClick: toggleSchedule,
		          children: status?.paused === true ? "\u542F\u52A8\u8C03\u5EA6" : "\u6682\u505C\u8C03\u5EA6"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: status === null || feedback.running,
		          title: "\u7ACB\u523B\u518D\u68C0\u67E5\u4E00\u6B21\u8C03\u5EA6\u5F52\u5C5E\uFF08\u4E0D\u7528\u7B49 90 \u79D2\u5FC3\u8DF3\u8FC7\u671F\uFF09\u3002",
		          onClick: recheck,
		          children: "\u91CD\u65B0\u68C0\u6D4B\u7CFB\u7EDF"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          disabled: feedback.running,
		          title: "\u6309\u540C\u4E00\u5957\u95E8\u69DB\u628A\u5168\u5E93\u5C97\u4F4D\u590D\u6838\u4E00\u904D\u3002\u7528\u5728\u521A\u6253\u5F00\u53BB\u91CD\u5F00\u5173\u3001\u6216\u521A\u6539\u8FC7\u6293\u53D6\u8303\u56F4\u4E4B\u540E\u3002",
		          onClick: sweep,
		          children: "\u8FD0\u884C\u5168\u5E93\u53BB\u91CD"
		        }
		      )
		    ] }),
		    scheduler.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("h2", { className: "jh-card-title", children: "\u8BFB\u4E0D\u5230\u91C7\u96C6\u72B6\u6001" }),
		      /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("p", { className: "jh-error", children: scheduler.state.message }),
		      /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("button", { type: "button", className: "jh-btn", onClick: scheduler.reload, children: "\u91CD\u8BD5" })
		    ] }),
		    feedback.message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(
		      "div",
		      {
		        className: `jh-card jh-card-tight jh-feedback ${feedback.tone === "error" ? "jh-card-error" : ""}`,
		        role: feedback.tone === "error" ? "alert" : "status",
		        "aria-live": feedback.tone === "error" ? "assertive" : "polite",
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("p", { className: feedback.tone === "error" ? "jh-error" : "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(InlineMd, { text: feedback.message }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
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
		    tab === "dashboard" ? /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		      DashboardTab,
		      {
		        revision: props.revision,
		        now,
		        story,
		        status,
		        runsLoading,
		        plansLoading,
		        planList,
		        focusPlanId,
		        dimensionList,
		        platformsLoading,
		        platformList,
		        platformsError,
		        reasonText,
		        reasonFor,
		        platformNameOf,
		        running: feedback.running || checkState.running,
		        runBlocked,
		        runBlockTitle,
		        onFocusPlan: setFocusPlanId,
		        onResume: resumeSchedule,
		        onTakeover: takeover,
		        onTrigger: trigger,
		        onEdit: startEdit,
		        onGoPlans: () => setTab("plans"),
		        onLogin: login,
		        onCheck: startCheck,
		        onDetail: setDetailTarget,
		        onOpenError: (run, failure) => setErrorDetail({ run, failure }),
		        onReload: reload
		      }
		    ) : null,
		    tab === "plans" ? /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		      PlansTab,
		      {
		        revision: props.revision,
		        dedupRevision,
		        status,
		        plansLoading,
		        planList,
		        platformList,
		        dimensionList,
		        running: feedback.running,
		        runBlocked,
		        runBlockTitle,
		        onTrigger: trigger,
		        onEdit: startEdit,
		        onNew: startCreate,
		        onResumeRisk: resumeRisk,
		        onAskDelete: setPendingDelete
		      }
		    ) : null,
		    tab === "diagnostics" ? /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		      DiagnosticsTab,
		      {
		        status,
		        runsLoading,
		        platformsLoading,
		        platformList,
		        platformsError,
		        reasonFor,
		        platformNameOf,
		        onOpenError: (run, failure) => setErrorDetail({ run, failure })
		      }
		    ) : null,
		    detailTarget === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		      Modal,
		      {
		        title: `\u5E73\u53F0\u660E\u7EC6 \xB7 ${detailTarget.displayName}`,
		        label: "\u5E73\u53F0\u660E\u7EC6",
		        size: "lg",
		        onClose: () => setDetailTarget(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(import_jsx_runtime61.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("span", { className: "jh-modal-foot-note jh-muted", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("code", { children: detailTarget.id }),
		            ' \xB7 \u8FD9\u4EFD\u8BCA\u65AD\u53EA\u8BB2"\u5B83\u73B0\u5728\u4E3A\u4EC0\u4E48\u662F\u8FD9\u6837"'
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              onClick: () => setDetailTarget(null),
		              children: "\u5173\u95ED"
		            }
		          )
		        ] }),
		        children: /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		          PlatformDetail,
		          {
		            item: detailTarget,
		            reasonText,
		            onGoSettings: () => {
		              setDetailTarget(null);
		              props.onGoSettings();
		            }
		          }
		        )
		      }
		    ),
		    checkTarget === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		      Modal,
		      {
		        title: `\u68C0\u6D4B\u767B\u5F55\u6001 \xB7 ${checkTarget.displayName}`,
		        label: "\u767B\u5F55\u6001\u68C0\u6D4B",
		        onClose: () => setCheckTarget(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(import_jsx_runtime61.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { className: "jh-modal-foot-note jh-muted", children: "\u68C0\u6D4B\u53EA\u67E5\u72B6\u6001\uFF0C\u4E0D\u4F1A\u66FF\u4F60\u767B\u5F55\u3002" }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              disabled: checkState.running || feedback.running,
		              onClick: () => void runCheck(checkTarget.id),
		              children: "\u91CD\u65B0\u68C0\u6D4B"
		            }
		          ),
		          checkState.result?.checked === true && !checkState.result.loggedIn ? /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-primary",
		              disabled: feedback.running,
		              title: "\u6253\u5F00\u767B\u5F55\u9875\uFF0C\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u7A97\u53E3\u91CC\u5B8C\u6210\u767B\u5F55\u3002",
		              onClick: () => {
		                setCheckTarget(null);
		                void login(checkTarget.id);
		              },
		              children: "\u53BB\u767B\u5F55"
		            }
		          ) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-quiet",
		              onClick: () => setCheckTarget(null),
		              children: "\u5173\u95ED"
		            }
		          )
		        ] }),
		        children: checkState.running ? /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("p", { className: "jh-muted", children: [
		          "\u6B63\u5728\u6253\u5F00 ",
		          checkTarget.displayName,
		          " \u7684\u9875\u9762\u68C0\u6D4B\u767B\u5F55\u6001\u2026\uFF08\u4F1A\u6253\u5F00\u4E00\u4E2A\u6D4F\u89C8\u5668\u7A97\u53E3\uFF09"
		        ] }) : checkState.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("p", { className: "jh-error", children: checkState.error }) : checkState.result === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(import_jsx_runtime61.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("p", { children: /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		            "span",
		            {
		              className: `jh-tag jh-tone-${checkState.result.checked ? checkState.result.loggedIn ? "ok" : "warn" : "muted"}`,
		              children: checkState.result.checked ? checkState.result.loggedIn ? "\u5DF2\u767B\u5F55" : "\u672A\u767B\u5F55" : "\u6CA1\u68C0\u6D4B\u51FA\u6765"
		            }
		          ) }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("p", { className: checkState.result.checked ? "jh-muted" : "jh-warn", children: /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(InlineMd, { text: checkState.result.message }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("ul", { className: "jh-kv", children: /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { children: "\u68C0\u6D4B\u65F6\u95F4" }),
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { children: new Date(checkState.result.checkedAt).toLocaleString() })
		          ] }) })
		        ] })
		      }
		    ),
		    editing === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		      PlanEditorModal,
		      {
		        planId: editing.id === "new" ? null : editing.id,
		        initial: editing.form,
		        available: platformList,
		        duplicates,
		        notices,
		        running: feedback.running,
		        onCancel: () => setEditing(null),
		        onSubmit: async (form) => {
		          setFeedback({ running: true, tone: "ok", message: "\u6B63\u5728\u4FDD\u5B58\u2026" });
		          try {
		            const input = writeOf(form);
		            const result = editing.id === "new" ? await createPlan(input) : await updatePlan(editing.id, input);
		            setDuplicates(result.duplicates);
		            setNotices(result.notices);
		            const verb = editing.id === "new" ? "\u5DF2\u521B\u5EFA" : "\u5DF2\u4FDD\u5B58";
		            const tail = [];
		            if (result.duplicates.length > 0) {
		              tail.push(
		                `\u4E0E ${result.duplicates.map((item) => `#${String(item.planId)}\u300C${item.name}\u300D`).join("\u3001")} \u6761\u4EF6\u91CD\u590D\uFF08**\u53EA\u63D0\u793A\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u5408\u5E76**\uFF09`
		              );
		            }
		            if (result.notices.length > 0) tail.push(`\u53E6\u6709 ${String(result.notices.length)} \u6761\u63D0\u793A`);
		            setFeedback({
		              running: false,
		              tone: "ok",
		              message: `${verb}\u65B9\u6848\u300C${result.plan.name}\u300D\u3002${tail.length === 0 ? "" : `\u6CE8\u610F\uFF1A${tail.join("\uFF1B")}\u3002`}`
		            });
		            if (result.duplicates.length === 0 && result.notices.length === 0) setEditing(null);
		            reload();
		          } catch (error) {
		            setFeedback(IDLE);
		            throw error;
		          }
		        },
		        onValidate: async (form) => {
		          const input = writeOf(form);
		          const result = editing.id === "new" ? await validatePlanDraft(input) : await validatePlan(editing.id, input);
		          return { duplicates: result.duplicates, notices: result.notices };
		        }
		      },
		      String(editing.id)
		    ),
		    pendingDelete === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(
		      Modal,
		      {
		        title: "\u5220\u9664\u91C7\u96C6\u65B9\u6848",
		        label: "\u5220\u9664\u786E\u8BA4",
		        onClose: () => setPendingDelete(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(import_jsx_runtime61.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { className: "jh-modal-foot-note jh-muted", children: "\u5220\u9664\u540E\u8FD9\u4E2A\u65B9\u6848\u4E0D\u4F1A\u518D\u81EA\u52A8\u91C7\u96C6\u3002" }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              onClick: () => setPendingDelete(null),
		              children: "\u53D6\u6D88"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("p", { className: "jh-alert-body", children: [
		            "\u5373\u5C06\u5220\u9664\u65B9\u6848\u300C",
		            pendingDelete.name,
		            "\u300D\uFF08",
		            pendingDelete.platforms.join(" / "),
		            "\uFF09\u3002"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("ul", { className: "jh-note", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("li", { children: "\u8FD9\u4E2A\u65B9\u6848\u672C\u8EAB\u4E0E\u5176\u5B9A\u65F6\u914D\u7F6E\u4F1A\u88AB\u79FB\u9664\uFF0C\u4E0D\u4F1A\u518D\u6709\u81EA\u52A8\u91C7\u96C6\u3002" }),
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("li", { children: "**\u5DF2\u7ECF\u6293\u5230\u7684\u5C97\u4F4D\u4F1A\u4FDD\u7559** \u2014\u2014 \u5220\u9664\u65B9\u6848\u4E0D\u4F1A\u5220\u5C97\u4F4D\u5E93\u3002" }),
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("li", { children: "\u60F3\u4FDD\u7559\u914D\u7F6E\u3001\u53EA\u662F\u6682\u65F6\u4E0D\u60F3\u81EA\u52A8\u8DD1\uFF1A\u6539\u7528\u300C\u7F16\u8F91 \xB7 \u5B9A\u65F6\u300D\u91CC\u7684\u300C\u542F\u7528\u5B9A\u65F6\u300D\u2014\u2014 \u5173\u6389\u5B83\u4E4B\u540E \u4ECD\u7136\u53EF\u4EE5\u70B9\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u624B\u52A8\u8DD1\u3002" })
		          ] })
		        ]
		      }
		    ),
		    errorDetail === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(
		      Modal,
		      {
		        title: `\u8FD0\u884C\u5931\u8D25 \xB7 ${CRAWL_STATE_LABEL[errorDetail.run.state]}`,
		        label: "\u8FD0\u884C\u5931\u8D25\u8BE6\u60C5",
		        size: "lg",
		        onClose: () => setErrorDetail(null),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(import_jsx_runtime61.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline jh-btn-quiet",
		              onClick: () => setErrorDetail(null),
		              children: "\u5173\u95ED"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("ul", { className: "jh-kv", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { children: "\u5E73\u53F0" }),
		              /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("code", { children: errorDetail.run.platformId }) })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { children: "\u5F00\u59CB\u65F6\u95F4" }),
		              /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { children: new Date(errorDetail.run.startedAt).toLocaleString() })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)("li", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { children: "\u7C7B\u522B" }),
		              /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("span", { children: FAILURE_KIND_LABEL[errorDetail.failure.kind] })
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("p", { className: "jh-note", children: errorDetail.failure.advice }),
		          errorDetail.failure.detail === null ? null : /* @__PURE__ */ (0, import_jsx_runtime61.jsxs)(import_jsx_runtime61.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("p", { className: "jh-note", children: "\u539F\u59CB\u4FE1\u606F\uFF08\u6280\u672F\u7EC6\u8282\uFF09\uFF1A" }),
		            /* @__PURE__ */ (0, import_jsx_runtime61.jsx)("pre", { className: "jh-pre", children: errorDetail.failure.detail })
		          ] })
		        ]
		      }
		    )
		  ] });
		}

		// src/client/screens/resumes/index.tsx
		var import_react29 = require("react");

		// src/shared/contract/enums/resume.ts
		var RESUME_LANGUAGE_LABEL = {
		  zh: "\u4E2D\u6587",
		  en: "\u82F1\u6587"
		};
		var RESUME_TEMPLATES = ["concise", "professional"];
		var RESUME_TEMPLATE_LABEL = {
		  concise: "\u7B80\u6D01",
		  professional: "\u4E13\u4E1A"
		};

		// src/shared/domain/resume-content.ts
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

		// src/client/screens/resumes/resume-work.tsx
		var import_react28 = require("react");

		// src/client/screens/resumes/english-check-panel.tsx
		var import_jsx_runtime62 = require("react/jsx-runtime");
		function EnglishCheckPanel(props) {
		  const check = useAsync((signal) => fetchEnglishCheck(props.resumeId, signal), [props.resumeId]);
		  if (check.state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime62.jsx)(LoadingLine, { children: "\u6B63\u5728\u4F53\u68C0\u2026" });
		  if (check.state.status === "error") return /* @__PURE__ */ (0, import_jsx_runtime62.jsxs)(ErrorLine, { children: [
		    "\u4F53\u68C0\u5931\u8D25\uFF1A",
		    check.state.message
		  ] });
		  return /* @__PURE__ */ (0, import_jsx_runtime62.jsxs)("div", { children: [
		    check.state.data.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime62.jsx)("p", { className: "jh-ok", children: "\u82F1\u6587\u7B80\u5386\u4F53\u68C0\u6CA1\u6709\u53D1\u73B0\u95EE\u9898\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime62.jsx)("ul", { className: "jh-issues", children: check.state.data.items.map((issue, index) => /* @__PURE__ */ (0, import_jsx_runtime62.jsxs)("li", { className: issue.level === "error" ? "jh-error" : "jh-warn", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime62.jsx)("b", { children: issue.level === "error" ? "\u5FC5\u6539" : "\u5EFA\u8BAE" }),
		      " ",
		      issue.message
		    ] }, String(index))) }),
		    /* @__PURE__ */ (0, import_jsx_runtime62.jsx)("p", { className: "jh-muted", children: check.state.data.note })
		  ] });
		}

		// src/client/screens/resumes/editors.tsx
		var import_react27 = require("react");
		var import_jsx_runtime63 = require("react/jsx-runtime");
		function move(items, index, delta) {
		  const target = index + delta;
		  if (target < 0 || target >= items.length) return items;
		  const next = [...items];
		  const [item] = next.splice(index, 1);
		  next.splice(target, 0, item);
		  return next;
		}
		function BlockCard(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime63.jsxs)("div", { className: "jh-entry", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime63.jsxs)("div", { className: "jh-entry-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime63.jsx)("span", { className: "jh-entry-no", children: props.label }),
		      /* @__PURE__ */ (0, import_jsx_runtime63.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime63.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime63.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime63.jsx)(
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
		  return /* @__PURE__ */ (0, import_jsx_runtime63.jsxs)("div", { className: "jh-lines", children: [
		    props.lines.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime63.jsxs)("div", { className: "jh-line", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime63.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime63.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime63.jsx)(
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
		  const [text, setText] = (0, import_react27.useState)("");
		  const commit = () => {
		    const parts = text.split(/[、,，\s]+/).map((part) => part.trim()).filter((part) => part !== "");
		    if (parts.length > 0) props.onChange([.../* @__PURE__ */ new Set([...props.values, ...parts])]);
		    setText("");
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime63.jsxs)("span", { className: "jh-chips", children: [
		    props.values.map((value) => /* @__PURE__ */ (0, import_jsx_runtime63.jsxs)("span", { className: "jh-chip-item", children: [
		      value,
		      /* @__PURE__ */ (0, import_jsx_runtime63.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime63.jsx)(
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

		// src/client/screens/resumes/sections/basics.tsx
		var import_jsx_runtime64 = require("react/jsx-runtime");
		function BasicsSection(props) {
		  const { content, patchContent, patchBasics } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)(import_jsx_runtime64.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("section", { className: "jh-form-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("div", { className: "jh-form-head", children: /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("h3", { children: "\u57FA\u672C\u4FE1\u606F" }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("div", { className: "jh-grid2", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: "\u59D3\u540D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              value: content.basics.name,
		              placeholder: "\u5F20\u4E09",
		              onChange: (event) => patchBasics({ name: event.target.value })
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: "\u76EE\u6807\u5C97\u4F4D" }),
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("div", { className: "jh-grid3", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: "\u57CE\u5E02" }),
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              value: content.basics.city ?? "",
		              placeholder: "\u6DF1\u5733",
		              onChange: (event) => patchBasics({ city: event.target.value === "" ? void 0 : event.target.value })
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: "\u5DE5\u4F5C\u5E74\u9650" }),
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: "\u5E74\u9F84\uFF08\u53EF\u7559\u7A7A\uFF09" }),
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("div", { className: "jh-grid2", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: "\u624B\u673A" }),
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              value: content.basics.phone ?? "",
		              placeholder: "138\u2026",
		              onChange: (event) => patchBasics({ phone: event.target.value === "" ? void 0 : event.target.value })
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: "\u90AE\u7BB1" }),
		          /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("p", { className: "jh-info", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(InlineMd, { text: "\u624B\u673A\u4E0E\u90AE\u7BB1\u5728**\u53D1\u7ED9\u6A21\u578B\u4E4B\u524D\u4F1A\u88AB\u6458\u6389**\uFF0C\u53EA\u5728\u5BFC\u51FA\u4E0E\u9884\u89C8\u91CC\u51FA\u73B0\u3002" }) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("section", { className: "jh-form-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("div", { className: "jh-form-head", children: /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("h3", { children: "\u4E2A\u4EBA\u7B80\u4ECB" }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("section", { className: "jh-form-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("h3", { children: "\u6280\u80FD" }),
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { className: "jh-muted", children: "\u56DE\u8F66\u6216\u300C\u3001\u300D\u786E\u8BA4\u4E00\u4E2A" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime64.jsxs)("p", { className: "jh-info", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		        /* @__PURE__ */ (0, import_jsx_runtime64.jsx)("span", { children: "\u53EA\u5199\u4F60\u771F\u7684\u80FD\u8BB2\u6E05\u695A\u7684 \u2014\u2014 \u9762\u8BD5\u5B98\u4F1A\u6311\u7740\u95EE\u3002" })
		      ] })
		    ] })
		  ] });
		}

		// src/client/screens/resumes/sections/education.tsx
		var import_jsx_runtime65 = require("react/jsx-runtime");
		function EducationSection(props) {
		  const { content, patchContent } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime65.jsx)(import_jsx_runtime65.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("section", { className: "jh-form-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("div", { className: "jh-form-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime65.jsx)("h3", { children: "\u6559\u80B2\u7ECF\u5386" }),
		      /* @__PURE__ */ (0, import_jsx_runtime65.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime65.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          onClick: () => patchContent({ ...content, education: [...content.education, { school: "" }] }),
		          children: "\uFF0B \u6DFB\u52A0\u4E00\u9879"
		        }
		      )
		    ] }),
		    content.education.map((education, index) => /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)(
		      BlockCard,
		      {
		        label: `\u7B2C ${String(index + 1)} \u9879`,
		        index,
		        total: content.education.length,
		        onMove: (delta) => patchContent({ ...content, education: move(content.education, index, delta) }),
		        onRemove: () => patchContent({ ...content, education: content.education.filter((_, i) => i !== index) }),
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("div", { className: "jh-grid3", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)("span", { children: "\u5B66\u6821" }),
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)("span", { children: "\u4E13\u4E1A" }),
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)("span", { children: "\u5B66\u5386" }),
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("div", { className: "jh-grid2", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)("span", { children: "\u5165\u5B66" }),
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime65.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)("span", { children: "\u6BD5\u4E1A" }),
		              /* @__PURE__ */ (0, import_jsx_runtime65.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime65.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-drop",
		        onClick: () => patchContent({ ...content, education: [...content.education, { school: "" }] }),
		        children: "\uFF0B \u6DFB\u52A0\u6559\u80B2\u7ECF\u5386"
		      }
		    )
		  ] }) });
		}

		// src/client/screens/resumes/sections/experience.tsx
		var import_jsx_runtime66 = require("react/jsx-runtime");
		function ExperienceSection(props) {
		  const { content, patchContent } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(import_jsx_runtime66.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("section", { className: "jh-form-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("div", { className: "jh-form-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("h3", { children: "\u5DE5\u4F5C\u7ECF\u5386" }),
		      /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		    content.experiences.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u5DE5\u4F5C\u7ECF\u5386 \u2014\u2014 \u70B9\u4E0B\u9762\u7684\u865A\u7EBF\u6846\u52A0\u7B2C\u4E00\u6BB5\u3002" }) : null,
		    content.experiences.map((experience, index) => /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)(
		      BlockCard,
		      {
		        label: `\u7B2C ${String(index + 1)} \u6BB5`,
		        index,
		        total: content.experiences.length,
		        onMove: (delta) => patchContent({ ...content, experiences: move(content.experiences, index, delta) }),
		        onRemove: () => patchContent({ ...content, experiences: content.experiences.filter((_, i) => i !== index) }),
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("div", { className: "jh-grid2", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("span", { children: "\u516C\u53F8" }),
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("span", { children: "\u804C\u4F4D" }),
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("div", { className: "jh-grid3", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("span", { children: "\u5F00\u59CB" }),
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("span", { children: "\u7ED3\u675F\uFF08\u7559\u7A7A = \u81F3\u4ECA\uFF09" }),
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("span", { children: "\u57CE\u5E02" }),
		              /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("label", { className: "jh-field", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("span", { children: "\u4E3B\u8981\u6210\u679C\uFF08\u4E00\u6761\u4E00\u884C\uFF0C\u56DE\u8F66\u63A5\u7740\u52A0\uFF09" }),
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime66.jsxs)("label", { className: "jh-field", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsx)("span", { children: "\u6280\u672F\u6808" }),
		            /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime66.jsx)(
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
		  ] }) });
		}

		// src/client/screens/resumes/sections/other.tsx
		var import_jsx_runtime67 = require("react/jsx-runtime");
		function OtherSection(props) {
		  const { content, patchContent } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime67.jsx)(import_jsx_runtime67.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime67.jsxs)("section", { className: "jh-form-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime67.jsxs)("div", { className: "jh-form-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime67.jsx)("h3", { children: "\u5176\u4ED6\uFF08\u8BC1\u4E66 / \u7ADE\u8D5B / \u5F00\u6E90\u2026\uFF09" }),
		      /* @__PURE__ */ (0, import_jsx_runtime67.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime67.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          onClick: () => patchContent({ ...content, extras: [...content.extras, { label: "", text: "" }] }),
		          children: "\uFF0B \u6DFB\u52A0\u4E00\u6761"
		        }
		      )
		    ] }),
		    content.extras.map((extra, index) => /* @__PURE__ */ (0, import_jsx_runtime67.jsx)(
		      BlockCard,
		      {
		        label: `\u7B2C ${String(index + 1)} \u6761`,
		        index,
		        total: content.extras.length,
		        onMove: (delta) => patchContent({ ...content, extras: move(content.extras, index, delta) }),
		        onRemove: () => patchContent({ ...content, extras: content.extras.filter((_, i) => i !== index) }),
		        children: /* @__PURE__ */ (0, import_jsx_runtime67.jsxs)("div", { className: "jh-grid2", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime67.jsxs)("label", { className: "jh-field", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime67.jsx)("span", { children: "\u6807\u9898" }),
		            /* @__PURE__ */ (0, import_jsx_runtime67.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime67.jsxs)("label", { className: "jh-field", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime67.jsx)("span", { children: "\u8BF4\u660E" }),
		            /* @__PURE__ */ (0, import_jsx_runtime67.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime67.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-drop",
		        onClick: () => patchContent({ ...content, extras: [...content.extras, { label: "", text: "" }] }),
		        children: "\uFF0B \u6DFB\u52A0\u4E00\u6761"
		      }
		    )
		  ] }) });
		}

		// src/client/screens/resumes/sections/projects.tsx
		var import_jsx_runtime68 = require("react/jsx-runtime");
		function ProjectsSection(props) {
		  const { content, patchContent } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime68.jsx)(import_jsx_runtime68.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime68.jsxs)("section", { className: "jh-form-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime68.jsxs)("div", { className: "jh-form-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime68.jsx)("h3", { children: "\u9879\u76EE\u7ECF\u5386" }),
		      /* @__PURE__ */ (0, import_jsx_runtime68.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime68.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline",
		          onClick: () => patchContent({ ...content, projects: [...content.projects, { name: "", highlights: [""] }] }),
		          children: "\uFF0B \u6DFB\u52A0\u4E00\u9879"
		        }
		      )
		    ] }),
		    content.projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime68.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u4E5F\u53EF\u4EE5 \u2014\u2014 \u5DE5\u4F5C\u7ECF\u5386\u5199\u6E05\u695A\u5C31\u591F\u3002" }) : null,
		    content.projects.map((project, index) => /* @__PURE__ */ (0, import_jsx_runtime68.jsxs)(
		      BlockCard,
		      {
		        label: `\u7B2C ${String(index + 1)} \u9879`,
		        index,
		        total: content.projects.length,
		        onMove: (delta) => patchContent({ ...content, projects: move(content.projects, index, delta) }),
		        onRemove: () => patchContent({ ...content, projects: content.projects.filter((_, i) => i !== index) }),
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime68.jsxs)("div", { className: "jh-grid2", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime68.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime68.jsx)("span", { children: "\u9879\u76EE\u540D" }),
		              /* @__PURE__ */ (0, import_jsx_runtime68.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime68.jsxs)("label", { className: "jh-field", children: [
		              /* @__PURE__ */ (0, import_jsx_runtime68.jsx)("span", { children: "\u4F60\u7684\u89D2\u8272 / \u65F6\u95F4" }),
		              /* @__PURE__ */ (0, import_jsx_runtime68.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime68.jsxs)("label", { className: "jh-field", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime68.jsx)("span", { children: "\u505A\u4E86\u4EC0\u4E48" }),
		            /* @__PURE__ */ (0, import_jsx_runtime68.jsx)(
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
		          /* @__PURE__ */ (0, import_jsx_runtime68.jsxs)("label", { className: "jh-field", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime68.jsx)("span", { children: "\u6280\u672F\u6808" }),
		            /* @__PURE__ */ (0, import_jsx_runtime68.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime68.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-drop",
		        onClick: () => patchContent({ ...content, projects: [...content.projects, { name: "", highlights: [""] }] }),
		        children: "\uFF0B \u6DFB\u52A0\u9879\u76EE\u7ECF\u5386"
		      }
		    )
		  ] }) });
		}

		// src/client/screens/resumes/resume-work.tsx
		var import_jsx_runtime69 = require("react/jsx-runtime");
		function ResumeWork(props) {
		  const detail = useAsync((signal) => fetchResume(props.id, signal), [props.id]);
		  const [draft, setDraft] = (0, import_react28.useState)(null);
		  const [dirty, setDirty] = (0, import_react28.useState)(false);
		  const [mode, setMode] = (0, import_react28.useState)("edit");
		  const [busy, setBusy] = (0, import_react28.useState)(null);
		  const [error, setError] = (0, import_react28.useState)(null);
		  const [notice, setNotice] = (0, import_react28.useState)(null);
		  const [template, setTemplate] = (0, import_react28.useState)("concise");
		  const [split, setSplit] = (0, import_react28.useState)(55);
		  const bodyRef = (0, import_react28.useRef)(null);
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
		  (0, import_react28.useEffect)(() => {
		    if (detail.state.status === "ok") setDraft(detail.state.data);
		  }, [detail.state]);
		  (0, import_react28.useEffect)(() => {
		    props.onDirtyChange(dirty);
		  }, [dirty, props]);
		  const issues = detail.state.status === "ok" ? detail.state.data.issues : [];
		  const run = (0, import_react28.useCallback)(
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
		    return detail.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(ErrorLine, { children: detail.state.message }) : /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u2026" });
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
		  return /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)(import_jsx_runtime69.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-work-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u270E" }),
		      dirty ? /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: "jh-chip jh-chip-dirty", children: "\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-work-actions", children: [
		        draft.isDefault ? /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: "jh-badge", children: "\u5F53\u524D\u542F\u7528" }) : /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void run("\u8BBE\u4E3A\u542F\u7528", async () => await setDefaultResume(props.id), () => "\u5DF2\u8BBE\u4E3A\u542F\u7528\u7248\u672C"),
		            children: "\u8BBE\u4E3A\u542F\u7528"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: busy !== null,
		            onClick: () => void run("\u590D\u5236", async () => await duplicateResume(props.id), () => "\u5DF2\u590D\u5236\u4E00\u4EFD\uFF0C\u53EF\u5728\u5DE6\u4FA7\u9009\u62E9"),
		            children: "\u590D\u5236"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
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
		    error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("p", { className: "jh-error", children: error }),
		    notice === null ? null : /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("p", { className: "jh-ok", children: notice }),
		    issues.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: `jh-alert ${issues.some((issue) => issue.level === "error") ? "jh-alert-error" : "jh-alert-warn"}`, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("span", { className: "jh-alert-title", children: [
		        "\u4F53\u68C0\uFF1A",
		        issues.length,
		        " \u9879\u5F85\u5904\u7406"
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("ul", { className: "jh-issues", children: issues.map((issue, index) => /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("li", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("b", { children: issue.level === "error" ? "\u5FC5\u6539" : "\u5EFA\u8BAE" }),
		        " ",
		        issue.message
		      ] }, `${issue.at}-${String(index)}`)) })
		    ] }),
		    draft.language !== "en" ? null : /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("h3", { className: "jh-card-title", children: "\u82F1\u6587\u4F53\u68C0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(EnglishCheckPanel, { resumeId: props.id })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-work-modes", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("div", { className: "jh-modes", role: "tablist", "aria-label": "\u89C6\u56FE\u6A21\u5F0F", children: [["edit", "\u7F16\u8F91"], ["split", "\u5206\u5C4F"], ["preview", "\u9884\u89C8"], ["files", "\u9644\u4EF6"]].map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("span", { className: "jh-muted", children: [
		        mode === "edit" ? "\u5148\u628A\u5185\u5BB9\u586B\u5B8C\u6574\uFF1B\u5355\u6761\u6210\u679C\u6309\u56DE\u8F66\u53EF\u4EE5\u63A5\u7740\u52A0\u4E00\u6761\u3002" : null,
		        mode === "split" ? "\u62D6\u52A8\u4E2D\u95F4\u90A3\u6761\u7070\u6761\u53EF\u4EE5\u8C03\u6574\u4E0A\u4E0B\u6BD4\u4F8B\u3002" : null,
		        mode === "preview" ? "\u5BFC\u51FA\u6B63\u5728\u770B\u7684\u8FD9\u4E00\u7248\u3002" : null,
		        mode === "files" ? "\u8FD9\u4E00\u7248\u751F\u6210\u8FC7\u7684\u9644\u4EF6\u90FD\u5728\u8FD9\u513F \u2014\u2014 \u53EA\u6709\u4F60\u663E\u5F0F\u5220\u9664\u624D\u4F1A\u6D88\u5931\u3002" : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: `jh-work-body jh-mode-${mode}`, ref: bodyRef, style: { "--jh-split": `${String(split)}%` }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-work-editor", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(BasicsSection, { content, patchContent, patchBasics }),
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(ExperienceSection, { content, patchContent }),
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(ProjectsSection, { content, patchContent }),
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(EducationSection, { content, patchContent }),
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(OtherSection, { content, patchContent }),
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("p", { className: "jh-info", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("span", { children: [
		            "\u9644\u4EF6\u53EA\u7531\u4F60\u663E\u5F0F\u5220\u9664 \u2014\u2014 \u7B80\u5386\u662F\u8D44\u4EA7\uFF0C\u4EFB\u4F55\u81EA\u52A8\u6E05\u7406\u90FD\u4E0D\u4F1A\u78B0\u5B83\uFF08",
		            PLUGIN_ID,
		            "\uFF09\u3002"
		          ] })
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-work-preview", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-preview-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
		            "select",
		            {
		              className: "jh-select",
		              "aria-label": "\u6A21\u677F",
		              value: template,
		              onChange: (event) => setTemplate(event.target.value === "professional" ? "professional" : "concise"),
		              children: RESUME_TEMPLATES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("option", { value: item, children: RESUME_TEMPLATE_LABEL[item] }, item))
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: "jh-muted", children: /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(InlineMd, { text: "\u9884\u89C8\u4E0E\u5BFC\u51FA\u8D70**\u540C\u4E00\u4E2A\u6E32\u67D3\u5668**\uFF0C\u6A21\u677F\u5373\u6240\u89C1" }) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("div", { className: "jh-paper-stage", children: /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("iframe", { className: "jh-paper", title: "\u7B80\u5386\u9884\u89C8", src: previewUrl(props.id, template), sandbox: "" }) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-work-files", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("div", { className: "jh-form-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("h3", { children: [
		            "\u9644\u4EF6\uFF08",
		            draft.files.length,
		            "\uFF09"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: "jh-spacer" }),
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: "jh-muted", children: "\u5BFC\u51FA\u5728\u53F3\u4E0A\u89D2\u5DE5\u5177\u680F\uFF1B\u8FD9\u91CC\u8D1F\u8D23\u6253\u5F00\u4E0E\u5220\u9664" })
		        ] }),
		        draft.files.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u751F\u6210\u9644\u4EF6\u3002\u7528\u53F3\u4E0A\u89D2\u7684\u300C\u5BFC\u51FA PDF / \u5BFC\u51FA Word\u300D\u751F\u6210\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("ul", { className: "jh-files", children: draft.files.map((file) => /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("li", { className: "jh-file-row", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: `jh-file-badge jh-file-${file.format}`, children: file.format.toUpperCase() }),
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("span", { className: "jh-file-main", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("a", { className: "jh-link jh-file-name", href: fileUrl(file.id), target: "_blank", rel: "noreferrer", children: file.fileName }),
		            /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("span", { className: "jh-muted jh-file-meta", children: [
		              (file.bytes / 1024).toFixed(0),
		              " KB \xB7 ",
		              file.createdAt.slice(0, 16).replace("T", " ")
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              onClick: () => window.open(fileUrl(file.id), "_blank", "noopener"),
		              children: "\u6253\u5F00"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime69.jsxs)("p", { className: "jh-info", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { className: "jh-info-icon", "aria-hidden": "true", children: "\u24D8" }),
		          /* @__PURE__ */ (0, import_jsx_runtime69.jsx)("span", { children: "\u5220\u9664\u8FD9\u4E00\u7248\u7B80\u5386\u65F6\uFF0C\u5B83\u7684\u9644\u4EF6\u4F1A\u4E00\u8D77\u5220\u6389\uFF1B\u9664\u6B64\u4E4B\u5916\u6CA1\u6709\u4EFB\u4F55\u81EA\u52A8\u6E05\u7406\u4F1A\u78B0\u5B83\u4EEC\u3002" })
		        ] })
		      ] })
		    ] })
		  ] });
		}

		// src/client/screens/resumes/index.tsx
		var import_jsx_runtime70 = require("react/jsx-runtime");
		function ResumesScreen(props) {
		  const list = useAsync((signal) => fetchResumes(signal), [props.revision]);
		  const [selected, setSelected] = (0, import_react29.useState)(null);
		  const [creating, setCreating] = (0, import_react29.useState)(false);
		  const [query, setQuery] = (0, import_react29.useState)("");
		  const [dirty, setDirty] = (0, import_react29.useState)(false);
		  const [issuesById, setIssuesById] = (0, import_react29.useState)({});
		  const items = list.state.status === "ok" ? list.state.data.items : [];
		  const shown = (0, import_react29.useMemo)(() => {
		    const key = query.trim().toLowerCase();
		    if (key === "") return items;
		    return items.filter(
		      (item) => `${item.name} ${item.direction}`.toLowerCase().includes(key)
		    );
		  }, [items, query]);
		  (0, import_react29.useEffect)(() => {
		    if (selected !== null || items.length === 0) return;
		    setSelected((items.find((item) => item.isDefault) ?? items[0])?.id ?? null);
		  }, [items, selected]);
		  const loadIssues = (0, import_react29.useCallback)(
		    (id) => {
		      if (issuesById[id] !== void 0) return;
		      void fetchResume(id).then((detail) => {
		        setIssuesById((current) => ({ ...current, [id]: detail.issues }));
		      }).catch(() => {
		      });
		    },
		    [issuesById]
		  );
		  const onCreate = (0, import_react29.useCallback)(async () => {
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
		  return /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("div", { className: "jh-screen jh-screen-wide", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("h2", { className: "jh-card-title", children: "\u7B80\u5386\u4E2D\u5FC3" }),
		      /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("span", { className: "jh-muted", children: "\u6309\u65B9\u5411\u7EF4\u62A4 2\u20133 \u7248\u5C31\u591F\u4E86 \u2014\u2014 \u6BCF\u6295\u4E00\u4E2A\u5C97\u4F4D\u6539\u4E00\u6B21\u7B80\u5386\uFF0C\u9762\u8BD5\u65F6\u53CD\u800C\u8BB2\u4E0D\u4E00\u81F4\u3002" })
		    ] }),
		    list.state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime70.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u7B80\u5386\u2026" }),
		    list.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime70.jsx)(ErrorLine, { children: list.state.message }),
		      /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("button", { type: "button", className: "jh-btn", onClick: list.reload, children: "\u91CD\u8BD5" })
		    ] }),
		    list.state.status === "ok" && items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("div", { className: "jh-card", children: /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u7B80\u5386\u3002\u5EFA\u4E00\u7248\u4E4B\u540E\uFF0C\u9644\u4EF6\uFF08PDF / Word\uFF09\u4E0E\u5C97\u4F4D\u5B9A\u5236\u90FD\u4F1A\u56F4\u7ED5\u5B83\u5DE5\u4F5C\u3002" }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("div", { className: "jh-resume-shell", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("aside", { className: "jh-resume-side", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("div", { className: "jh-resume-side-head", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime70.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              placeholder: "\u641C\u7D22\u7248\u672C\u2026",
		              "aria-label": "\u641C\u7D22\u7248\u672C",
		              value: query,
		              onChange: (event) => setQuery(event.target.value)
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime70.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("ul", { className: "jh-resume-list", children: [
		          shown.map((item) => {
		            const issues = issuesById[item.id];
		            const active = selected === item.id;
		            return /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)(
		              "button",
		              {
		                type: "button",
		                className: `jh-resume-item${active ? " jh-resume-item-active" : ""}`,
		                "data-resume-id": item.id,
		                "aria-current": active ? "true" : void 0,
		                onClick: () => pick(item.id),
		                children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("span", { className: "jh-resume-item-top", children: [
		                    /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("span", { className: "jh-resume-name", children: item.name }),
		                    item.isDefault ? /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("i", { className: "jh-badge-on", children: "\u542F\u7528\u4E2D" }) : null
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("span", { className: "jh-resume-sub", children: [
		                    item.direction || "\u672A\u586B\u65B9\u5411",
		                    " \xB7 ",
		                    RESUME_LANGUAGE_LABEL[item.language],
		                    item.state === "archived" ? " \xB7 \u5DF2\u5F52\u6863" : ""
		                  ] }),
		                  /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("span", { className: "jh-resume-chips", children: [
		                    item.counts.skills > 0 ? /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("i", { className: "jh-chip", children: [
		                      "\u6280\u80FD ",
		                      item.counts.skills
		                    ] }) : null,
		                    item.counts.experiences > 0 ? /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("i", { className: "jh-chip", children: [
		                      "\u7ECF\u5386 ",
		                      item.counts.experiences
		                    ] }) : null,
		                    item.counts.projects > 0 ? /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("i", { className: "jh-chip", children: [
		                      "\u9879\u76EE ",
		                      item.counts.projects
		                    ] }) : null,
		                    item.counts.files > 0 ? /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("i", { className: "jh-chip", children: [
		                      "\u9644\u4EF6 ",
		                      item.counts.files
		                    ] }) : null,
		                    item.issues > 0 ? /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)(
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
		                    item.counts.skills === 0 && item.counts.experiences === 0 && item.issues === 0 ? /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("i", { className: "jh-chip jh-chip-quiet", children: "\u8FD8\u662F\u7A7A\u7684" }) : null
		                  ] })
		                ]
		              }
		            ) }, item.id);
		          }),
		          shown.length === 0 && items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime70.jsxs)("p", { className: "jh-muted", children: [
		            "\u6CA1\u6709\u5339\u914D\u300C",
		            query,
		            "\u300D\u7684\u7248\u672C\u3002"
		          ] }) }) : null
		        ] })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("section", { className: "jh-resume-work", children: selected === null ? /* @__PURE__ */ (0, import_jsx_runtime70.jsx)("p", { className: "jh-muted", children: "\u9009\u5DE6\u8FB9\u4E00\u7248\u7B80\u5386\u5F00\u59CB\u7F16\u8F91\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime70.jsx)(
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

		// src/client/screens/settings/index.tsx
		var import_react35 = require("react");

		// src/client/net/ops.ts
		async function closeTodo(id) {
		  await request(`/todos/${String(id)}/close`, {
		    method: "POST",
		    body: JSON.stringify({})
		  });
		}
		async function resumeConfirmAction(id) {
		  const result = await request(
		    `/todos/${String(id)}/confirm-actions/resume`,
		    { method: "POST", body: JSON.stringify({}) }
		  );
		  return { intent: result.intent, note: result.note };
		}
		async function fetchSettings(signal) {
		  return await request("/settings", signal === void 0 ? {} : { signal });
		}
		async function revealDataDir() {
		  const result = await request("/system/reveal", {
		    method: "POST",
		    body: JSON.stringify({})
		  });
		  return { dir: result.dir, ok: result.ok, reason: result.reason ?? null };
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
		async function fetchStorage(signal) {
		  return await request("/maintenance/storage", signal === void 0 ? {} : { signal });
		}
		async function previewCleanup() {
		  return await request("/maintenance/cleanup/preview", {
		    method: "POST",
		    body: JSON.stringify({})
		  });
		}
		async function runCleanup(input = {}) {
		  const result = await request("/maintenance/cleanup", {
		    method: "POST",
		    body: JSON.stringify({ confirm: true, ...input })
		  });
		  return result.result;
		}
		function dataExportUrl(format) {
		  return `${ROUTE_PREFIX}/data/export?format=${format}`;
		}
		async function importJobsPayload(input) {
		  const result = await request("/data/import", {
		    method: "POST",
		    body: JSON.stringify(input)
		  });
		  return result.result;
		}

		// src/client/format/risk-story.ts
		function riskStory(current) {
		  const { levels, dailyLimits, cooldownMinutes, requireApproval, auditEnabled } = current.guard;
		  const windowRaw = current.guard.sendWindow.trim();
		  const allowed = [];
		  if (levels.l3Greeting) allowed.push("\u6253\u62DB\u547C");
		  if (levels.l4Application) allowed.push("\u6295\u9012");
		  if (levels.l4Reply) allowed.push("\u56DE\u590D");
		  const parts = [];
		  if (allowed.length === 0) {
		    parts.push("\u4E09\u4E2A\u53D1\u9001\u5206\u5C42\u5168\u5173\u7740 \u2014\u2014 \u8FD9\u4E2A\u5DE5\u5177\u4E00\u6B65\u90FD\u4E0D\u4F1A\u66FF\u4F60\u53D1\u51FA\u53BB");
		  } else {
		    parts.push(`\u5141\u8BB8\u53D1\u9001\uFF1A${allowed.join(" / ")}`);
		    parts.push(
		      `\u6BCF\u5929\u6BCF\u5E73\u53F0 \u6253\u62DB\u547C ${String(dailyLimits.greeting)} \xB7 \u6295\u9012 ${String(dailyLimits.application)} \xB7 \u56DE\u590D ${String(dailyLimits.reply)}`
		    );
		    if (windowRaw === "") parts.push("\u4E0D\u9650\u53D1\u9001\u65F6\u6BB5");
		    else if (parseWindow(windowRaw) === null) parts.push(`\u53D1\u9001\u65F6\u6BB5\u914D\u7F6E\u65E0\u6CD5\u89E3\u6790\uFF1A\u300C${windowRaw}\u300D\u2014\u2014 \u95F8\u95E8\u4F1A\u62D2\u7EDD\u6240\u6709\u53D1\u9001`);
		    else parts.push(`\u53D1\u9001\u65F6\u6BB5 ${windowRaw}\uFF08\u672C\u5730\u65F6\u95F4\uFF09`);
		    parts.push(
		      current.guard.dayOffProbability > 0 ? `\u968F\u673A\u4F11\u606F\u65E5 ${String(Math.round(current.guard.dayOffProbability * 100))}%` : "\u6CA1\u6709\u968F\u673A\u4F11\u606F\u65E5"
		    );
		    parts.push(cooldownMinutes > 0 ? `\u540C\u516C\u53F8\u51B7\u5374 ${String(cooldownMinutes)} \u5206\u949F` : "\u6CA1\u6709\u51B7\u5374\u671F");
		  }
		  parts.push(requireApproval ? "\u9AD8\u5371\u52A8\u4F5C\u9700\u4F60\u786E\u8BA4" : "\u9AD8\u5371\u52A8\u4F5C\u4E0D\u518D\u4E8C\u6B21\u786E\u8BA4");
		  parts.push(auditEnabled ? "\u5BA1\u8BA1\u5DF2\u5F00" : "\u5BA1\u8BA1\u5DF2\u5173\uFF08\u989D\u5EA6\u8BA1\u6570\u4F1A\u5931\u771F\uFF09");
		  if (!current.ai.enabled) parts.push("\u6A21\u578B\u5DF2\u5173\uFF08\u5168\u90E8\u8D70\u89C4\u5219 / \u6A21\u677F\uFF09");
		  const needsAttention = allowed.length === 0 || !requireApproval || !auditEnabled || windowRaw !== "" && parseWindow(windowRaw) === null;
		  return { text: `${parts.join("\uFF1B")}\u3002`, tone: needsAttention ? "jh-story-warn" : "jh-story-ok" };
		}

		// src/client/ui/number-field.tsx
		var import_react30 = require("react");
		var import_jsx_runtime71 = require("react/jsx-runtime");
		function NumberField(props) {
		  const [draft, setDraft] = (0, import_react30.useState)(String(props.value));
		  const focused = (0, import_react30.useRef)(false);
		  (0, import_react30.useEffect)(() => {
		    if (!focused.current) setDraft(String(props.value));
		  }, [props.value]);
		  const commit = () => {
		    const parsed = Number.parseInt(draft.trim(), 10);
		    if (!Number.isFinite(parsed)) {
		      setDraft(String(props.value));
		      return;
		    }
		    const clamped = Math.min(props.max, Math.max(props.min, parsed));
		    setDraft(String(clamped));
		    if (clamped !== props.value) props.onCommit(clamped);
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime71.jsxs)("span", { className: "jh-number", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime71.jsx)(
		      "input",
		      {
		        type: "number",
		        min: props.min,
		        max: props.max,
		        step: 1,
		        "aria-label": props.label,
		        disabled: props.disabled === true,
		        value: draft,
		        onFocus: () => {
		          focused.current = true;
		        },
		        onChange: (event) => setDraft(event.target.value),
		        onBlur: () => {
		          focused.current = false;
		          commit();
		        },
		        onKeyDown: (event) => {
		          if (event.key === "Enter") {
		            event.preventDefault();
		            commit();
		          }
		        }
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime71.jsx)("span", { className: "jh-number-unit", children: props.unit })
		  ] });
		}

		// src/client/ui/switch.tsx
		var import_jsx_runtime72 = require("react/jsx-runtime");
		function Switch(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime72.jsxs)("span", { className: "jh-switch", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime72.jsx)(
		      "input",
		      {
		        type: "checkbox",
		        role: "switch",
		        "aria-label": props.label,
		        checked: props.checked,
		        disabled: props.disabled === true,
		        onChange: (event) => props.onChange(event.target.checked)
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime72.jsx)("span", { className: "jh-switch-track", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime72.jsx)("span", { className: "jh-switch-thumb" }) })
		  ] });
		}

		// src/client/screens/settings/guard-panel.tsx
		var import_jsx_runtime73 = require("react/jsx-runtime");
		var GUARD_LIMITS = {
		  daily: { min: 0, max: 500 },
		  cooldownMinutes: { min: 0, max: 7 * 24 * 60 },
		  batchLimit: { min: 1, max: 50 }
		};
		function GuardPanel(props) {
		  const { current, busy, write } = props;
		  const setLevel = (key, label, next) => {
		    write({ guard: { levels: { [key]: next } } }, `\u5DF2${next ? "\u5F00\u542F" : "\u5173\u95ED"}\u300C${label}\u300D\u3002`);
		  };
		  const setLimit = (bucket, label, next) => {
		    write(
		      { guard: { dailyLimits: { [bucket]: next } } },
		      next <= 0 ? `\u5DF2\u628A\u300C${label}\u300D\u7684\u6BCF\u65E5\u989D\u5EA6\u8BBE\u4E3A 0 \u2014\u2014 \u8FD9\u4E00\u7C7B\u52A8\u4F5C\u4ECA\u5929\u4E00\u5F8B\u4F1A\u88AB\u95F8\u95E8\u62D2\u7EDD\u3002` : `\u5DF2\u628A\u300C${label}\u300D\u7684\u6BCF\u65E5\u989D\u5EA6\u6539\u4E3A ${String(next)} \u6761\uFF08\u6BCF\u4E2A\u5E73\u53F0\uFF09\u3002`
		    );
		  };
		  const setGuardNumber = (key, label, unit, next) => {
		    write({ guard: { [key]: next } }, `\u5DF2\u628A\u300C${label}\u300D\u6539\u4E3A ${String(next)} ${unit}\u3002`);
		  };
		  const windowRaw = current.guard.sendWindow.trim();
		  const parsedWindow = windowRaw === "" ? null : parseWindow(windowRaw);
		  const defaultWindow = parseWindow(current.derived.defaults.guard.sendWindow);
		  const windowStart = parsedWindow?.start ?? defaultWindow?.start ?? "";
		  const windowEnd = parsedWindow?.end ?? defaultWindow?.end ?? "";
		  const setWindow = (start, end) => {
		    if (start === "" || end === "") return;
		    write({ guard: { sendWindow: `${start}-${end}` } }, `\u5DF2\u628A\u53D1\u9001\u65F6\u6BB5\u6539\u4E3A ${start}-${end}\uFF08\u672C\u5730\u65F6\u95F4\uFF09\u3002`);
		  };
		  const defaults = current.derived.defaults.guard;
		  return /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("h2", { className: "jh-card-title", children: "\u7CFB\u7EDF\u63A7\u5236\u4E2D\u5FC3" }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("h3", { className: "jh-section-title", children: "\u53D1\u9001\u5206\u5C42\uFF08L3 / L4\uFF09" }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "L3 \u6253\u62DB\u547C",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(FieldHint, { text: "\u5141\u8BB8\u53D1\u51FA\u7B2C\u4E00\u6761\u6253\u62DB\u547C\u6D88\u606F\u3002\u5173\u6389\u4E4B\u540E\uFF0C\u6240\u6709\u6253\u62DB\u547C\u90FD\u4F1A\u88AB\u95F8\u95E8\u62D2\u7EDD\u3002\u51FA\u5382\u9ED8\u8BA4\u5F00\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		        Switch,
		        {
		          checked: current.guard.levels.l3Greeting,
		          disabled: busy,
		          label: "L3 \u6253\u62DB\u547C",
		          onChange: (next) => setLevel("l3Greeting", "L3 \u6253\u62DB\u547C", next)
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "L4 \u6295\u9012",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(FieldHint, { text: "\u5141\u8BB8\u771F\u7684\u70B9\u4E0B\u5E73\u53F0\u7684\u300C\u6295\u9012\u300D\u6309\u94AE\u3002\u9ED8\u8BA4\u5173\u95ED \u2014\u2014 \u8FD9\u662F\u6700\u4E0D\u53EF\u9006\u7684\u4E00\u6B65\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		        Switch,
		        {
		          checked: current.guard.levels.l4Application,
		          disabled: busy,
		          label: "L4 \u6295\u9012",
		          onChange: (next) => setLevel("l4Application", "L4 \u6295\u9012", next)
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "L4 \u56DE\u590D",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(FieldHint, { text: "\u5141\u8BB8\u56DE\u590D HR \u53D1\u6765\u7684\u6D88\u606F\u3002\u9ED8\u8BA4\u5173\u95ED\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		        Switch,
		        {
		          checked: current.guard.levels.l4Reply,
		          disabled: busy,
		          label: "L4 \u56DE\u590D",
		          onChange: (next) => setLevel("l4Reply", "L4 \u56DE\u590D", next)
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("h3", { className: "jh-section-title", children: "\u6BCF\u65E5\u989D\u5EA6\uFF08\u6BCF\u4E2A\u5E73\u53F0\uFF09" }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-limits", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("label", { className: "jh-limit", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("span", { className: "jh-field-label", children: "\u6253\u62DB\u547C" }),
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          NumberField,
		          {
		            value: current.guard.dailyLimits.greeting,
		            min: GUARD_LIMITS.daily.min,
		            max: GUARD_LIMITS.daily.max,
		            unit: "\u6761",
		            label: "\u6253\u62DB\u547C\u7684\u6BCF\u65E5\u989D\u5EA6",
		            disabled: busy,
		            onCommit: (next) => setLimit("greeting", "\u6253\u62DB\u547C", next)
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("label", { className: "jh-limit", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("span", { className: "jh-field-label", children: "\u6295\u9012" }),
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          NumberField,
		          {
		            value: current.guard.dailyLimits.application,
		            min: GUARD_LIMITS.daily.min,
		            max: GUARD_LIMITS.daily.max,
		            unit: "\u6761",
		            label: "\u6295\u9012\u7684\u6BCF\u65E5\u989D\u5EA6",
		            disabled: busy,
		            onCommit: (next) => setLimit("application", "\u6295\u9012", next)
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("label", { className: "jh-limit", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("span", { className: "jh-field-label", children: "\u56DE\u590D" }),
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          NumberField,
		          {
		            value: current.guard.dailyLimits.reply,
		            min: GUARD_LIMITS.daily.min,
		            max: GUARD_LIMITS.daily.max,
		            unit: "\u6761",
		            label: "\u56DE\u590D\u7684\u6BCF\u65E5\u989D\u5EA6",
		            disabled: busy,
		            onCommit: (next) => setLimit("reply", "\u56DE\u590D", next)
		          }
		        )
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("p", { className: "jh-note", children: /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		      InlineMd,
		      {
		        text: `\u989D\u5EA6\u662F**\u4F60\u81EA\u5DF1\u7684\u9884\u7B97**\uFF1B\u95F8\u95E8\u8FD8\u4F1A\u4E0E\u5E73\u53F0\u4FA7\u4E0A\u9650\u53D6\u8F83\u5C0F\u8005 \u2014\u2014 \u6240\u4EE5\u8C03\u5927\u4E0D\u4F1A\u7ED5\u8FC7\u5E73\u53F0\u7EA2\u7EBF\u3002\u586B 0 \u8868\u793A\u8FD9\u4E00\u7C7B\u52A8\u4F5C\u4ECA\u5929\u5B8C\u5168\u4E0D\u505A\u3002\u51FA\u5382\u9ED8\u8BA4\uFF1A\u6253\u62DB\u547C ${String(defaults.dailyLimits.greeting)} \xB7 \u6295\u9012 ${String(defaults.dailyLimits.application)} \xB7 \u56DE\u590D ${String(defaults.dailyLimits.reply)}\u3002`
		      }
		    ) }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("h3", { className: "jh-section-title", children: "\u53D1\u9001\u65F6\u95F4\u4E0E\u8282\u594F" }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl-stack", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "\u53D1\u9001\u65F6\u6BB5",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          FieldHint,
		          {
		            text: `\u53EA\u5728\u8FD9\u4E2A\u672C\u5730\u65F6\u95F4\u7A97\u53E3\u5185\u53D1\u9001\uFF08\u652F\u6301\u8DE8\u5348\u591C\uFF0C\u5982 22:00-06:00\uFF09\u3002\u51CC\u6668/\u6DF1\u591C\u53D1\u6D88\u606F\u662F\u6700\u5F3A\u7684\u673A\u5668\u4FE1\u53F7\u4E4B\u4E00\uFF0C\u6240\u4EE5\u51FA\u5382\u9ED8\u8BA4\u9650\u5236\u5728 ${defaults.sendWindow}\u3002\u70B9\u300C\u8BBE\u4E3A\u4E0D\u9650\u300D\u8868\u793A\u4EFB\u4F55\u65F6\u95F4\u90FD\u53EF\u4EE5\u53D1\u3002`
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-timerange", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          "input",
		          {
		            type: "time",
		            className: "jh-input jh-time",
		            "aria-label": "\u53D1\u9001\u65F6\u6BB5\u5F00\u59CB",
		            disabled: busy,
		            value: windowStart,
		            onChange: (event) => setWindow(event.target.value, windowEnd)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("span", { className: "jh-timerange-sep", children: "\u81F3" }),
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          "input",
		          {
		            type: "time",
		            className: "jh-input jh-time",
		            "aria-label": "\u53D1\u9001\u65F6\u6BB5\u7ED3\u675F",
		            disabled: busy,
		            value: windowEnd,
		            onChange: (event) => setWindow(windowStart, event.target.value)
		          }
		        ),
		        windowRaw === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-tiny",
		            disabled: busy,
		            onClick: () => write({ guard: { sendWindow: "" } }, "\u5DF2\u6539\u4E3A\uFF1A\u4E0D\u9650\u53D1\u9001\u65F6\u6BB5\uFF08\u4EFB\u4F55\u65F6\u95F4\u90FD\u53EF\u4EE5\u53D1\uFF09\u3002"),
		            children: "\u8BBE\u4E3A\u4E0D\u9650"
		          }
		        )
		      ] })
		    ] }),
		    windowRaw !== "" && parsedWindow === null ? /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("div", { className: "jh-alert jh-alert-warn", role: "alert", children: /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("p", { className: "jh-alert-body", children: [
		      "\u53D1\u9001\u65F6\u6BB5\u914D\u7F6E\u65E0\u6CD5\u89E3\u6790\uFF1A",
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("code", { children: windowRaw }),
		      " \u2014\u2014 \u95F8\u95E8\u4F1A fail-closed\uFF0C",
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("b", { children: "\u6240\u6709\u53D1\u9001\u90FD\u4F1A\u88AB\u62D2\u7EDD" }),
		      "\u3002\u7528\u4E0A\u9762\u4E24\u4E2A\u65F6\u95F4\u6846\u6539\u56DE\u5408\u6CD5\u503C\uFF0C\u6216\u70B9\u300C\u8BBE\u4E3A\u4E0D\u9650\u300D\u3002"
		    ] }) }) : null,
		    windowRaw === "" ? /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("p", { className: "jh-note", children: "\u5F53\u524D\uFF1A\u4E0D\u9650\u65F6\u6BB5\u3002\u4E0A\u9762\u4E24\u4E2A\u6846\u663E\u793A\u7684\u662F\u51FA\u5382\u9ED8\u8BA4\u65F6\u6BB5 \u2014\u2014 \u6539\u5176\u4E2D\u4EFB\u4F55\u4E00\u683C\u5C31\u4F1A\u542F\u7528\u5B83\u3002" }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "\u968F\u673A\u4F11\u606F\u65E5",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          FieldHint,
		          {
		            text: `\u6309\u5929\u786E\u5B9A\u6027\u547D\u4E2D\uFF1A\u547D\u4E2D\u7684\u90A3\u4E00\u5929\u6574\u4F53\u4E0D\u53D1\u9001\uFF0C\u6A21\u62DF"\u4EBA\u4E0D\u4F1A\u5929\u5929\u6295"\u7684\u8282\u594F\u3002\u51FA\u5382\u9ED8\u8BA4 ${String(Math.round(defaults.dayOffProbability * 100))}%\uFF0C\u586B 0 \u8868\u793A\u53D6\u6D88\u3002\u540C\u4E00\u5929\u91CC\u7ED3\u8BBA\u4E0D\u4F1A\u53D8\uFF08\u4E0D\u662F\u6BCF\u6B21\u8C03\u7528\u91CD\u63B7\uFF09\uFF0C\u6309\u6574\u6570\u767E\u5206\u6BD4\u4FDD\u5B58\u3002`
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		        NumberField,
		        {
		          value: Math.round(current.guard.dayOffProbability * 100),
		          min: 0,
		          max: 100,
		          unit: "%",
		          label: "\u968F\u673A\u4F11\u606F\u65E5\u6982\u7387\uFF08\u767E\u5206\u6BD4\uFF09",
		          disabled: busy,
		          onCommit: (next) => write(
		            { guard: { dayOffProbability: next / 100 } },
		            next <= 0 ? "\u5DF2\u53D6\u6D88\u968F\u673A\u4F11\u606F\u65E5\u3002" : `\u5DF2\u628A\u968F\u673A\u4F11\u606F\u65E5\u6982\u7387\u6539\u4E3A ${String(next)}%\u3002`
		          )
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "\u51B7\u5374\u671F",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          FieldHint,
		          {
		            text: `\u540C\u4E00\u5BB6\u516C\u53F8\u5728\u591A\u5C11\u5206\u949F\u5185\u4E0D\u5141\u8BB8\u91CD\u590D\u6295\u9012\u3002\u9632\u8BEF\u6295\u4E0E\u9632\u98CE\u63A7\uFF0C\u4E0D\u5EFA\u8BAE\u8BBE\u6210 0\u3002\u51FA\u5382\u9ED8\u8BA4 ${String(defaults.cooldownMinutes)} \u5206\u949F\uFF0824 \u5C0F\u65F6\uFF09\u3002`
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		        NumberField,
		        {
		          value: current.guard.cooldownMinutes,
		          min: GUARD_LIMITS.cooldownMinutes.min,
		          max: GUARD_LIMITS.cooldownMinutes.max,
		          unit: "\u5206\u949F",
		          label: "\u540C\u4E00\u516C\u53F8\u91CD\u590D\u6295\u9012\u7684\u51B7\u5374\u671F",
		          disabled: busy,
		          onCommit: (next) => setGuardNumber("cooldownMinutes", "\u51B7\u5374\u671F", "\u5206\u949F", next)
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsx)("h3", { className: "jh-section-title", children: "\u5BA1\u6279\u3001\u5BA1\u8BA1\u4E0E\u6A21\u578B\u4E0A\u9650" }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "\u9AD8\u5371\u52A8\u4F5C\u5FC5\u987B\u5BA1\u6279",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(FieldHint, { text: "\u9AD8\u5371\u52A8\u4F5C\uFF08\u6295\u9012 / \u56DE\u590D / \u6253\u62DB\u547C\uFF09\u662F\u5426\u5FC5\u987B\u5148\u7ECF\u4F60\u786E\u8BA4\u3002\u6A21\u578B\u4E0D\u5F97\u4FEE\u6539\u8FD9\u4E00\u9879\uFF08\xA722.4\uFF09\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		        Switch,
		        {
		          checked: current.guard.requireApproval,
		          disabled: busy,
		          label: "\u9AD8\u5371\u52A8\u4F5C\u5FC5\u987B\u5BA1\u6279",
		          onChange: (next) => write(
		            { guard: { requireApproval: next } },
		            next ? "\u5DF2\u6539\u4E3A\uFF1A\u9AD8\u5371\u52A8\u4F5C\u5FC5\u987B\u5BA1\u6279\u3002" : "\u5DF2\u6539\u4E3A\uFF1A\u9AD8\u5371\u52A8\u4F5C\u4E0D\u518D\u4E8C\u6B21\u786E\u8BA4 \u2014\u2014 \u8BF7\u786E\u8BA4\u4F60\u4E86\u89E3\u8FD9\u4E2A\u540E\u679C\u3002"
		          )
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "\u5BA1\u8BA1\u7559\u75D5",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(FieldHint, { text: "\u662F\u5426\u628A\u6240\u6709\u52A8\u4F5C\u5199\u8FDB\u5BA1\u8BA1\u8868\u3002\u6A21\u578B\u4E0D\u5F97\u5173\u95ED\u5B83\uFF08\xA722.4\uFF09\u3002\u5173\u6389\u4E4B\u540E\u989D\u5EA6\u7684\u8BA1\u6570\u4E5F\u5C31\u6CA1\u4E86\u6765\u6E90\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		        Switch,
		        {
		          checked: current.guard.auditEnabled,
		          disabled: busy,
		          label: "\u5BA1\u8BA1\u7559\u75D5",
		          onChange: (next) => write(
		            { guard: { auditEnabled: next } },
		            next ? "\u5DF2\u5F00\u542F\u5BA1\u8BA1\u7559\u75D5\u3002" : "\u5DF2\u5173\u95ED\u5BA1\u8BA1 \u2014\u2014 \u52A8\u4F5C\u5C06\u4E0D\u518D\u7559\u75D5\uFF0C\u989D\u5EA6\u8BA1\u6570\u4E5F\u4F1A\u5931\u771F\u3002"
		          )
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("span", { className: "jh-field-label", children: [
		        "\u6279\u91CF\u4E0A\u9650",
		        /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		          FieldHint,
		          {
		            text: `\u6A21\u578B\u5355\u6B21\u8C03\u7528\u6700\u591A\u6D89\u53CA\u591A\u5C11\u4E2A\u5C97\u4F4D\uFF08\xA722.4\uFF09\u3002\u8D85\u51FA\u5FC5\u987B\u5206\u6279\u5E76\u9010\u6279\u5BA1\u6279\u3002\u51FA\u5382\u9ED8\u8BA4 ${String(defaults.batchLimit)} \u4E2A\u3002`
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(
		        NumberField,
		        {
		          value: current.guard.batchLimit,
		          min: GUARD_LIMITS.batchLimit.min,
		          max: GUARD_LIMITS.batchLimit.max,
		          unit: "\u4E2A",
		          label: "\u6A21\u578B\u5355\u6B21\u8C03\u7528\u6D89\u53CA\u7684\u5C97\u4F4D\u6570\u4E0A\u9650",
		          disabled: busy,
		          onCommit: (next) => setGuardNumber("batchLimit", "\u6279\u91CF\u4E0A\u9650", "\u4E2A\u5C97\u4F4D", next)
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime73.jsxs)("p", { className: "jh-note", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime73.jsx)(InlineMd, { text: "\u6A21\u578B**\u4E0D\u80FD**\u4FEE\u6539\u8FD9\u4E9B\u952E\uFF1A" }),
		      current.derived.modelForbidden.join(" / "),
		      "\uFF1B\u6A21\u578B\u80FD\u6539\u7684\u53EA\u6709\uFF1A",
		      current.derived.modelEditable.join(" / "),
		      "\u3002\u8FD9\u662F\u786C\u7F16\u7801\u7684\u6821\u9A8C\uFF0C\u4E0D\u662F\u7EA6\u5B9A\u3002"
		    ] })
		  ] });
		}

		// src/client/screens/settings/purposes-panel.tsx
		var import_jsx_runtime74 = require("react/jsx-runtime");
		var PURPOSE_GROUPS = [
		  { title: "\u5339\u914D\u4E0E\u89E3\u6790", purposes: ["match_score", "explain", "jd_summary", "resume_tailor"] },
		  {
		    title: "\u6C9F\u901A\u4E0E\u4E92\u52A8",
		    purposes: ["greeting_draft", "resume_tone_check", "message_extract", "reply_draft"]
		  },
		  {
		    title: "\u8F85\u52A9\u4E0E\u51B3\u7B56",
		    purposes: [
		      "interview_prep",
		      "mock_interview",
		      "company_intel",
		      "stage_extract",
		      "offer_compare",
		      "cover_letter"
		    ]
		  }
		];
		function PurposesPanel(props) {
		  const { current, busy, write } = props;
		  const masterOn = current.ai.enabled;
		  const grouped = new Set(PURPOSE_GROUPS.flatMap((group) => group.purposes));
		  const leftovers = current.derived.purposes.filter((item) => !grouped.has(item.purpose)).map((item) => item.purpose);
		  const groups = leftovers.length === 0 ? PURPOSE_GROUPS : [...PURPOSE_GROUPS, { title: "\u5176\u5B83", purposes: leftovers }];
		  return /* @__PURE__ */ (0, import_jsx_runtime74.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime74.jsx)("h2", { className: "jh-card-title", children: "\u6A21\u578B\u7528\u9014" }),
		    /* @__PURE__ */ (0, import_jsx_runtime74.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime74.jsxs)("span", { className: "jh-field-label", children: [
		        "\u6A21\u578B\u603B\u5F00\u5173",
		        /* @__PURE__ */ (0, import_jsx_runtime74.jsx)(FieldHint, { text: "\u5173\u6389\u4E4B\u540E\u4E00\u5207\u8D70\u89C4\u5219 / \u6A21\u677F\u964D\u7EA7\uFF0C\u529F\u80FD\u4E0D\u4F1A\u5D29\uFF08J10\uFF09\u2014\u2014 \u53EA\u662F\u4E0D\u518D\u5916\u53D1\u4EFB\u4F55\u5B57\u6BB5\u3002\u5355\u9879\u5F00\u5173\u4F1A\u4FDD\u7559\u7740\uFF0C\u91CD\u65B0\u6253\u5F00\u603B\u5F00\u5173\u540E\u6309\u539F\u6837\u751F\u6548\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime74.jsx)(
		        Switch,
		        {
		          checked: masterOn,
		          disabled: busy,
		          label: "\u6A21\u578B\u603B\u5F00\u5173",
		          onChange: (next) => write(
		            { ai: { enabled: next } },
		            next ? "\u5DF2\u5F00\u542F\u6A21\u578B \u2014\u2014 \u6309\u4E0B\u9762\u7684\u5355\u9879\u5F00\u5173\u6267\u884C\u3002" : "\u5DF2\u5173\u95ED\u6A21\u578B \u2014\u2014 \u5168\u90E8\u7528\u9014\u964D\u7EA7\u4E3A\u89C4\u5219 / \u6A21\u677F\u3002"
		          )
		        }
		      )
		    ] }),
		    masterOn ? null : /* @__PURE__ */ (0, import_jsx_runtime74.jsx)("p", { className: "jh-note", children: /* @__PURE__ */ (0, import_jsx_runtime74.jsx)(InlineMd, { text: "\u6A21\u578B\u603B\u5F00\u5173\u5DF2\u5173\u95ED\uFF1A\u4E0B\u9762\u6BCF\u4E00\u9879\u73B0\u5728\u90FD\u8D70\u89C4\u5219 / \u6A21\u677F\uFF0C\u4E0D\u5BF9\u5916\u53D1\u9001\u4EFB\u4F55\u5B57\u6BB5\u3002\u5355\u9879\u5F00\u5173**\u4ECD\u7136\u53EF\u4EE5\u6539** \u2014\u2014 \u5B83\u4EEC\u8BB0\u7684\u662F\u4F60\u7684\u610F\u5411\uFF0C\u91CD\u65B0\u6253\u5F00\u603B\u5F00\u5173\u540E\u6309\u8FD9\u4E2A\u610F\u5411\u751F\u6548\u3002" }) }),
		    groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime74.jsxs)("div", { className: "jh-purpose-group", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime74.jsx)("h3", { className: "jh-section-title", children: group.title }),
		      /* @__PURE__ */ (0, import_jsx_runtime74.jsx)("div", { className: "jh-purpose-grid", children: group.purposes.map((key) => {
		        const item = current.derived.purposes.find((entry) => entry.purpose === key);
		        if (item === void 0) return null;
		        const on = current.ai.purposes[key] !== false;
		        const byDefault = current.derived.defaults.purposes[key] !== false;
		        return /* @__PURE__ */ (0, import_jsx_runtime74.jsxs)(
		          "label",
		          {
		            className: "jh-purpose",
		            title: `${item.label}\uFF08${key}\uFF09\xB7 \u51FA\u5382\u9ED8\u8BA4${byDefault ? "\u5F00" : "\u5173"}`,
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime74.jsx)("span", { className: "jh-purpose-name", children: item.label }),
		              /* @__PURE__ */ (0, import_jsx_runtime74.jsx)(
		                Switch,
		                {
		                  checked: on,
		                  disabled: busy,
		                  label: `${item.label}\uFF08\u51FA\u5382\u9ED8\u8BA4${byDefault ? "\u5F00" : "\u5173"}\uFF09${masterOn ? "" : "\uFF0C\u6A21\u578B\u603B\u5F00\u5173\u5DF2\u5173\u95ED\uFF0C\u6682\u4E0D\u751F\u6548"}`,
		                  onChange: (next) => write(
		                    { ai: { purposes: { [key]: next } } },
		                    `\u5DF2${next ? "\u5F00\u542F" : "\u5173\u95ED"}\u300C${item.label}\u300D\u3002`
		                  )
		                }
		              )
		            ]
		          },
		          key
		        );
		      }) })
		    ] }, group.title)),
		    /* @__PURE__ */ (0, import_jsx_runtime74.jsxs)("p", { className: "jh-note", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime74.jsx)(InlineMd, { text: "\u6309**\u7528\u9014**\u5206\u5F00\u5F00\u5173\uFF1A\u5173\u6389\u54EA\u4E00\u9879\uFF0C\u90A3\u4E00\u9879\u5C31\u8D70\u89C4\u5219 / \u6A21\u677F\uFF0C\u5176\u4F59\u4E0D\u53D7\u5F71\u54CD\u3002" }),
		      "\u6D89\u53CA\u7B80\u5386\u5185\u5BB9\u7684\u51E0\u9879\u9ED8\u8BA4\u5173\u7740 \u2014\u2014 \u90A3\u4F1A\u628A\u7B80\u5386\u53D1\u7ED9\u6A21\u578B\uFF0C\u5C5E\u4E8E\u4F60\u5E94\u5F53\u663E\u5F0F\u540C\u610F\u7684\u8303\u56F4\u3002"
		    ] })
		  ] });
		}

		// src/shared/config/browser.ts
		var BROWSER_IDLE_DEFAULT_MIN = 10;
		var BROWSER_IDLE_MIN_MIN = 0;
		var BROWSER_IDLE_MAX_MIN = 240;
		var BROWSER_CLOSE_AFTER_RUN_MS = 3e3;

		// src/client/screens/settings/browser-panel.tsx
		var import_jsx_runtime75 = require("react/jsx-runtime");
		function BrowserPanel(props) {
		  const { current, busy, write } = props;
		  const idleMinutes = current.browser.idleCloseMinutes;
		  const closeAfterRun = current.browser.closeAfterRun;
		  return /* @__PURE__ */ (0, import_jsx_runtime75.jsxs)(import_jsx_runtime75.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime75.jsx)("h3", { className: "jh-section-title", children: "\u6D4F\u89C8\u5668" }),
		    /* @__PURE__ */ (0, import_jsx_runtime75.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime75.jsxs)("span", { className: "jh-field-label", children: [
		        "\u6BCF\u8F6E\u91C7\u96C6\u7ED3\u675F\u540E\u5173\u95ED",
		        /* @__PURE__ */ (0, import_jsx_runtime75.jsx)(
		          FieldHint,
		          {
		            text: `\u6253\u5F00\u540E\uFF1A\u4E00\u8F6E\u91C7\u96C6\uFF08\u542B\u4E00\u8F6E\u91CC\u4E32\u884C\u8DD1\u7684\u591A\u4E2A\u65B9\u6848\uFF09\u5168\u90E8\u8DD1\u5B8C\uFF0C\u91C7\u96C6\u6D4F\u89C8\u5668\u5C31\u81EA\u52A8\u5173\u6389\uFF0C\u4E0D\u7559\u5728\u684C\u9762\u4E0A\u3002\u4EE3\u4EF7\u662F"\u8FDE\u7740\u70B9\u4E24\u6B21\u7ACB\u5373\u91C7\u96C6"\u65F6\u7B2C\u4E8C\u6B21\u8981\u591A\u82B1\u51E0\u79D2\u91CD\u65B0\u6253\u5F00\u6D4F\u89C8\u5668 \u2014\u2014 \u767B\u5F55\u6001\u5728\u78C1\u76D8\u4E0A\uFF0C\u4E0D\u4F1A\u4E22\u3002\u6B63\u5728\u767B\u5F55\u5F15\u5BFC\u4E2D\u6216\u6B63\u5728\u91C7\u96C6\u65F6\u7EDD\u4E0D\u4F1A\u88AB\u5173\u6389\u3002\u5173\u6389\u5B83\uFF0C\u624D\u8F6E\u5230\u4E0B\u9762\u7684\u7A7A\u95F2\u65F6\u957F\u8BF4\u4E86\u7B97\u3002`
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime75.jsx)(
		        Switch,
		        {
		          checked: closeAfterRun,
		          disabled: busy,
		          label: "\u6BCF\u8F6E\u91C7\u96C6\u7ED3\u675F\u540E\u5173\u95ED\u91C7\u96C6\u6D4F\u89C8\u5668",
		          onChange: (next) => write(
		            { browser: { closeAfterRun: next } },
		            next ? `\u5DF2\u6539\u4E3A\uFF1A\u6BCF\u8F6E\u91C7\u96C6\u7ED3\u675F\u540E\u5173\u95ED\u91C7\u96C6\u6D4F\u89C8\u5668\uFF08\u8DD1\u5B8C\u7EA6 ${String(BROWSER_CLOSE_AFTER_RUN_MS / 1e3)} \u79D2\u540E\uFF09\u3002` : "\u5DF2\u6539\u4E3A\uFF1A\u91C7\u96C6\u7ED3\u675F\u540E\u4E0D\u81EA\u52A8\u5173\u95ED\uFF0C\u6539\u7531\u7A7A\u95F2\u65F6\u957F\u51B3\u5B9A\u3002"
		          )
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime75.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime75.jsxs)("span", { className: "jh-field-label", children: [
		        "\u7A7A\u95F2\u540E\u81EA\u52A8\u5173\u95ED",
		        /* @__PURE__ */ (0, import_jsx_runtime75.jsx)(
		          FieldHint,
		          {
		            text: `\u91C7\u96C6\u8981\u590D\u7528\u4F60\u81EA\u5DF1\u767B\u5F55\u8FC7\u7684\u6D4F\u89C8\u5668\uFF0C\u6240\u4EE5\u5B83\u662F headful \u7684\uFF08\u4F60\u80FD\u770B\u89C1\u90A3\u4E2A\u7A97\u53E3\uFF09\u3002\u7528\u5B8C\u4E00\u76F4\u5F00\u7740\u4F1A\u5360\u5185\u5B58\uFF0C\u6240\u4EE5\u7A7A\u95F2\u5230\u70B9\u5C31\u81EA\u52A8\u5173\u6389\uFF1B\u4E0B\u4E00\u6B21\u91C7\u96C6\u4F1A\u91CD\u65B0\u6253\u5F00\uFF0C\u767B\u5F55\u6001\u5728\u78C1\u76D8\u4E0A\u3001\u4E0D\u4F1A\u4E22\u3002\u586B 0 \u8868\u793A\u4E0D\u81EA\u52A8\u5173\u95ED\u3002\u9ED8\u8BA4 ${String(BROWSER_IDLE_DEFAULT_MIN)} \u5206\u949F\u3002\u4E0A\u9762\u90A3\u4E2A\u5F00\u5173\u6253\u5F00\u65F6\uFF0C\u8FD9\u4E00\u683C\u4E0D\u8D77\u4F5C\u7528\u3002`
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime75.jsx)(
		        NumberField,
		        {
		          value: idleMinutes,
		          min: BROWSER_IDLE_MIN_MIN,
		          max: BROWSER_IDLE_MAX_MIN,
		          unit: "\u5206\u949F",
		          label: "\u91C7\u96C6\u6D4F\u89C8\u5668\u7A7A\u95F2\u591A\u5C11\u5206\u949F\u540E\u81EA\u52A8\u5173\u95ED",
		          disabled: busy || closeAfterRun,
		          onCommit: (next) => write(
		            { browser: { idleCloseMinutes: next } },
		            next <= 0 ? "\u5DF2\u6539\u4E3A\uFF1A\u6D4F\u89C8\u5668\u7A7A\u95F2\u540E\u4E0D\u81EA\u52A8\u5173\u95ED\u3002" : `\u5DF2\u6539\u4E3A\uFF1A\u6D4F\u89C8\u5668\u7A7A\u95F2 ${String(next)} \u5206\u949F\u540E\u81EA\u52A8\u5173\u95ED\u3002`
		          )
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime75.jsxs)("p", { className: "jh-note", children: [
		      closeAfterRun ? `\u5F53\u524D\uFF1A\u6BCF\u8F6E\u91C7\u96C6\u7ED3\u675F\u540E\u5173\u95ED\uFF08\u8DD1\u5B8C\u7EA6 ${String(BROWSER_CLOSE_AFTER_RUN_MS / 1e3)} \u79D2\uFF1B\u4E0A\u9762\u7684\u7A7A\u95F2\u65F6\u957F\u6B64\u523B\u4E0D\u8D77\u4F5C\u7528\uFF09\u3002` : idleMinutes <= 0 ? "\u5F53\u524D\uFF1A\u4E0D\u81EA\u52A8\u5173\u95ED \u2014\u2014 \u6D4F\u89C8\u5668\u4F1A\u4E00\u76F4\u5F00\u7740\uFF0C\u76F4\u5230\u4F60\u5173\u6389\u5B83\u6216\u5378\u8F7D\u63D2\u4EF6\u3002" : `\u5F53\u524D\uFF1A\u7A7A\u95F2 ${String(idleMinutes)} \u5206\u949F\u540E\u5173\u95ED\u3002`,
		      " ",
		      "\u6B63\u5728\u767B\u5F55\u6216\u6B63\u5728\u91C7\u96C6\u65F6\u4E0D\u4F1A\u88AB\u5173\u6389\u3002"
		    ] })
		  ] });
		}

		// src/client/screens/settings/resources-panel.tsx
		var import_jsx_runtime76 = require("react/jsx-runtime");
		function ResourcesPanel(props) {
		  const { current, busy, write } = props;
		  const roundBudgetMinutes = current.crawl.roundBudgetMinutes;
		  return /* @__PURE__ */ (0, import_jsx_runtime76.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime76.jsx)("h2", { className: "jh-card-title", children: "\u8FD0\u884C\u8D44\u6E90" }),
		    /* @__PURE__ */ (0, import_jsx_runtime76.jsx)(BrowserPanel, { current, busy, write }),
		    /* @__PURE__ */ (0, import_jsx_runtime76.jsx)("h3", { className: "jh-section-title", children: "\u91C7\u96C6\u8282\u594F" }),
		    /* @__PURE__ */ (0, import_jsx_runtime76.jsxs)("div", { className: "jh-ctl", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime76.jsxs)("span", { className: "jh-field-label", children: [
		        "\u5355\u8F6E\u91C7\u96C6\u6700\u591A\u8DD1\u591A\u4E45",
		        /* @__PURE__ */ (0, import_jsx_runtime76.jsx)(
		          FieldHint,
		          {
		            text: `\u4E00\u8F6E = \u4E00\u4E2A\u65B9\u6848\u7684\u4E00\u6B21\u8FD0\u884C\uFF1B\u591A\u5173\u952E\u8BCD\u65B9\u6848\u4F1A\u9010\u4E2A\u5173\u952E\u8BCD\u8DD1\uFF0C\u65B0\u5C97\u4F4D\u8FD8\u4F1A\u9010\u6761\u70B9\u8FDB\u8BE6\u60C5\u9875\uFF0C\u6240\u4EE5\u8017\u65F6\u968F\u914D\u7F6E\u653E\u5927\u3002\u5230\u70B9\u540E**\u4E0D\u518D\u5F00\u59CB**\u65B0\u7684\u5E73\u53F0\u6216\u5173\u952E\u8BCD\uFF08\u6B63\u5728\u8DD1\u7684\u90A3\u4E00\u9875\u8DD1\u5B8C\u5C31\u505C\uFF09\uFF0C\u5DF2\u6293\u5230\u7684\u7167\u5E38\u5165\u5E93\uFF0C\u5269\u4E0B\u7684\u7559\u5230\u4E0B\u4E00\u8F6E\u5E76\u6309\u300C\u672C\u8F6E\u5DF2\u5230\u65F6\u9650\u300D\u5982\u5B9E\u663E\u793A\u3002\u9ED8\u8BA4 ${String(CRAWL_ROUND_BUDGET_DEFAULT_MIN)} \u5206\u949F\u3002\u8FD9\u4E0D\u662F\u8282\u6D41\u9600\uFF0C\u662F\u4FDD\u9669\u4E1D \u2014\u2014 \u5BF9\u5E94\u7528\u6237\u80FD\u63A5\u53D7\u7684"\u70B9\u4E00\u4E0B\u6700\u591A\u7B49\u591A\u4E45"\u3002`
		          }
		        )
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime76.jsx)(
		        NumberField,
		        {
		          value: roundBudgetMinutes,
		          min: CRAWL_ROUND_BUDGET_MIN_MIN,
		          max: CRAWL_ROUND_BUDGET_MAX_MIN,
		          unit: "\u5206\u949F",
		          label: "\u5355\u8F6E\u91C7\u96C6\u6700\u591A\u8DD1\u591A\u5C11\u5206\u949F",
		          disabled: busy,
		          onCommit: (next) => write(
		            { crawl: { roundBudgetMinutes: next } },
		            `\u5DF2\u628A\u5355\u8F6E\u91C7\u96C6\u9884\u7B97\u6539\u4E3A ${String(next)} \u5206\u949F\uFF08\u4E0B\u4E00\u8F6E\u5F00\u59CB\u751F\u6548\uFF09\u3002`
		          )
		        }
		      )
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime76.jsxs)("p", { className: "jh-note", children: [
		      "\u5F53\u524D\uFF1A\u4E00\u8F6E\u6700\u591A ",
		      String(roundBudgetMinutes),
		      " \u5206\u949F\u3002\u6539\u5B8C\u4E0D\u7528\u91CD\u542F\uFF0C\u4E0B\u4E00\u8F6E\u5C31\u5730\u751F\u6548\u3002"
		    ] })
		  ] });
		}

		// src/client/screens/settings/config-panel.tsx
		var import_jsx_runtime77 = require("react/jsx-runtime");
		function ConfigPanel(props) {
		  const { current, busy, write } = props;
		  if (current === null) {
		    return /* @__PURE__ */ (0, import_jsx_runtime77.jsx)("section", { className: "jh-card", children: props.error === null ? /* @__PURE__ */ (0, import_jsx_runtime77.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime77.jsx)("p", { className: "jh-error", role: "alert", children: props.error }) });
		  }
		  const story = riskStory(current);
		  return (
		    // `.jh-set-wrap` 是容器查询的上下文（见 styles/screens/settings.ts）——
		    // 两栏网格的断点判定的是**这一块**有多宽，不是窗口有多宽。
		    // 它带 containment，所以只能包住配置页（这一页没有 position:absolute 的弹窗层）；
		    // 日志页与数据页都有（抽屉 / 清理确认弹窗），那两页不套这个类。
		    /* @__PURE__ */ (0, import_jsx_runtime77.jsxs)("div", { className: "jh-set-wrap", children: [
		      props.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime77.jsx)("div", { className: "jh-alert jh-alert-error", role: "alert", children: /* @__PURE__ */ (0, import_jsx_runtime77.jsxs)("p", { className: "jh-alert-body", children: [
		        props.error,
		        /* @__PURE__ */ (0, import_jsx_runtime77.jsx)("br", {}),
		        "\u4E0B\u9762\u663E\u793A\u7684\u662F\u300C\u4E0A\u4E00\u6B21\u6210\u529F\u8BFB\u5230\u7684\u300D\u8BBE\u7F6E\uFF0C\u53EF\u80FD\u5DF2\u7ECF\u548C\u670D\u52A1\u7AEF\u4E0D\u4E00\u81F4\u3002"
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime77.jsxs)("section", { className: "jh-card", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime77.jsx)("h2", { className: "jh-card-title", children: "\u5F53\u524D\u98CE\u63A7\u6001\u52BF" }),
		        /* @__PURE__ */ (0, import_jsx_runtime77.jsx)("p", { className: `jh-story ${story.tone}`, children: story.text })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime77.jsxs)("div", { className: "jh-set-grid", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime77.jsx)(PurposesPanel, { current, busy, write }),
		        /* @__PURE__ */ (0, import_jsx_runtime77.jsx)(GuardPanel, { current, busy, write }),
		        /* @__PURE__ */ (0, import_jsx_runtime77.jsx)(ResourcesPanel, { current, busy, write })
		      ] })
		    ] })
		  );
		}

		// src/client/screens/settings/data-panel.tsx
		var import_react31 = require("react");

		// src/shared/config/retention.ts
		var RETENTION_MIN_DAYS = 0;
		var RETENTION_MAX_DAYS = 3650;

		// src/client/screens/settings/data-panel.tsx
		var import_jsx_runtime78 = require("react/jsx-runtime");
		var CHUNK_ROWS = 300;
		var RETENTION_FIELDS = [
		  { key: "crawlRunsDays", label: "\u6293\u53D6\u8FD0\u884C\u8BB0\u5F55", hint: "\u6BCF\u8F6E\u6293\u53D6\u7684\u6267\u884C\u8BB0\u5F55\u3002\u6E05\u6389\u53EA\u5F71\u54CD\u300C\u8FD0\u884C\u5386\u53F2\u300D\u3002" },
		  { key: "auditLogDays", label: "\u64CD\u4F5C\u5BA1\u8BA1", hint: "\u6BCF\u6B21\u8FC7\u95F8\u95E8\u52A8\u4F5C\u7684\u7559\u75D5\uFF08\u5B57\u6BB5\u6458\u8981\uFF0C\u4E0D\u542B\u6B63\u6587\uFF09\u3002" },
		  { key: "llmCallsDays", label: "\u6A21\u578B\u8C03\u7528\u7559\u75D5", hint: "\u6BCF\u6B21\u6A21\u578B\u8C03\u7528\u7684\u5916\u53D1\u5B57\u6BB5\u6E05\u5355\u3002\u9ED8\u8BA4\u6C38\u4E45\u4FDD\u7559\u3002" },
		  { key: "pendingRepairDays", label: "\u5DF2\u5904\u7406\u7684\u5F85\u4FEE\u590D\u8BB0\u5F55", hint: "\u5DF2\u4E22\u5F03/\u5DF2\u4FEE\u590D\u7684\u9694\u79BB\u8BB0\u5F55\uFF1B\u4ECD\u5F85\u5904\u7406\u7684\u4E0D\u4F1A\u88AB\u6E05\u3002" },
		  { key: "jdTextDays", label: "JD \u539F\u6587\u4E0E\u6458\u8981", hint: "\u4F53\u79EF\u5927\u5934\u3002\u53EA\u6E05\u5B57\u6BB5\u3001\u4E0D\u5220\u5C97\u4F4D \u2014\u2014 \u4EE3\u4EF7\u662F\u56DE\u770B\u4E0D\u4E86\u539F\u6587\u3002" },
		  { key: "jobsDays", label: "\u4ECE\u6CA1\u88AB\u78B0\u8FC7\u7684\u8001\u5C97\u4F4D", hint: "\u6536\u85CF\u8FC7\u3001\u6295\u8FC7\u3001\u804A\u8FC7\u7684\u5C97\u4F4D\u6C38\u4E0D\u81EA\u52A8\u5220\u3002" }
		];
		function formatBytes(bytes) {
		  if (bytes < 1024) return `${String(bytes)} B`;
		  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
		}
		function reasonOf5(error) {
		  return error instanceof ApiError ? error.display : String(error);
		}
		function DataPanel(props) {
		  const [storageRevision, setStorageRevision] = (0, import_react31.useState)(0);
		  const storage = useAsync((signal) => fetchStorage(signal), [storageRevision]);
		  const retention = props.current?.retention ?? null;
		  const defaults = props.current?.derived.defaults.retention ?? null;
		  const [draft, setDraft] = (0, import_react31.useState)(null);
		  const shownDays = (key) => draft?.[key] ?? retention?.[key] ?? 0;
		  const [plan, setPlan] = (0, import_react31.useState)(null);
		  const [selected, setSelected] = (0, import_react31.useState)([]);
		  const [planning, setPlanning] = (0, import_react31.useState)(false);
		  const [confirming, setConfirming] = (0, import_react31.useState)(false);
		  const [running, setRunning] = (0, import_react31.useState)(false);
		  const [cleanupResult, setCleanupResult] = (0, import_react31.useState)(null);
		  const [importResult, setImportResult] = (0, import_react31.useState)(null);
		  const [importing, setImporting] = (0, import_react31.useState)(false);
		  const loadPlan = async () => {
		    setPlanning(true);
		    setCleanupResult(null);
		    try {
		      const next = await previewCleanup();
		      setPlan(next);
		      setSelected(next.items.filter((item) => item.willRun).map((item) => item.id));
		    } catch (error) {
		      props.notify("error", reasonOf5(error));
		    } finally {
		      setPlanning(false);
		    }
		  };
		  const execute = async () => {
		    setConfirming(false);
		    setRunning(true);
		    try {
		      const result = await runCleanup({ only: selected });
		      setCleanupResult(
		        result.totalRows === 0 ? "\u6CA1\u6709\u9700\u8981\u6E05\u7406\u7684\u6570\u636E \u2014\u2014 \u4E00\u4E2A\u5B57\u8282\u90FD\u6CA1\u52A8\u3002" : `\u5DF2\u6E05\u7406 ${String(result.totalRows)} \u884C\uFF1A\u6587\u4EF6 ${formatBytes(result.dbBytesBefore)} \u2192 ${formatBytes(result.dbBytesAfter)}${result.vacuumed ? "\uFF08\u5DF2 VACUUM\uFF09" : "\uFF08VACUUM \u672A\u6267\u884C\uFF0C\u6587\u4EF6\u6682\u65F6\u4E0D\u4F1A\u53D8\u5C0F\uFF09"}`
		      );
		      props.notify("ok", "\u6E05\u7406\u5B8C\u6210");
		      setPlan(null);
		      setStorageRevision((value) => value + 1);
		    } catch (error) {
		      props.notify("error", reasonOf5(error));
		    } finally {
		      setRunning(false);
		    }
		  };
		  const saveRetention = () => {
		    const raw = draft;
		    if (raw === null) return;
		    const patch = {};
		    let clamped = 0;
		    for (const [key, value] of Object.entries(raw)) {
		      if (typeof value !== "number") continue;
		      const next = Math.min(RETENTION_MAX_DAYS, Math.max(RETENTION_MIN_DAYS, value));
		      if (next !== value) clamped += 1;
		      patch[key] = next;
		    }
		    setDraft(null);
		    void props.write(
		      { retention: patch },
		      clamped === 0 ? "\u4FDD\u7559\u7B56\u7565\u5DF2\u4FDD\u5B58\uFF08\u4E0B\u6B21\u9884\u89C8 / \u6E05\u7406\u5373\u751F\u6548\uFF09" : `\u4FDD\u7559\u7B56\u7565\u5DF2\u4FDD\u5B58 \u2014\u2014 \u6709 ${String(clamped)} \u9879\u8D85\u51FA ${String(RETENTION_MIN_DAYS)}\u2013${String(RETENTION_MAX_DAYS)} \u5929\uFF0C\u5DF2\u6309\u8FB9\u754C\u6536\u655B\u3002`
		    );
		  };
		  const importFile = async (file) => {
		    setImporting(true);
		    setImportResult(null);
		    try {
		      const buffer = await file.arrayBuffer();
		      let text;
		      try {
		        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
		      } catch {
		        try {
		          text = new TextDecoder("gbk").decode(buffer);
		        } catch {
		          throw new Error("\u8BFB\u4E0D\u51FA\u8FD9\u4E2A\u6587\u4EF6\u7684\u6587\u5B57\u7F16\u7801\u3002\u8BF7\u53E6\u5B58\u4E3A CSV UTF-8 \u518D\u8BD5\u3002");
		        }
		      }
		      const format = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
		      if (format === "json") {
		        setImportResult(await importJobsPayload({ format, content: text }));
		      } else {
		        setImportResult(await importCsvInBatches(text));
		      }
		      props.notify("ok", "\u5BFC\u5165\u5B8C\u6210");
		    } catch (error) {
		      props.notify("error", reasonOf5(error));
		    } finally {
		      setImporting(false);
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)(import_jsx_runtime78.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("h2", { className: "jh-card-title", children: "\u4FDD\u7559\u7B56\u7565" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(FieldHint, { text: "\u5355\u4F4D\u662F\u300C\u5929\u300D\uFF0C0 = \u6C38\u4E45\u4FDD\u7559\u3002\u6295\u9012\u8BB0\u5F55\u3001\u6253\u62DB\u547C\u3001\u6D88\u606F\u3001\u9762\u8BD5\u3001\u7B80\u5386\u4E0E\u9644\u4EF6**\u4E0D\u5728\u6E05\u7406\u8303\u56F4\u5185**\uFF08\u4E0B\u9762\u300C\u78C1\u76D8\u5360\u7528\u300D\u91CC\u5217\u4E3A\u957F\u671F\u4FDD\u7559\uFF09\u2014\u2014 \u5B83\u4EEC\u662F\u5F52\u56E0\u4E0E\u590D\u76D8\u7684\u8D44\u4EA7\uFF0C\u53EA\u80FD\u7531\u4F60\u81EA\u5DF1\u5220\u3002" })
		      ] }),
		      retention === null ? /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)(import_jsx_runtime78.Fragment, { children: [
		        RETENTION_FIELDS.map((field) => /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-ctl", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("span", { className: "jh-field-label", children: [
		            field.label,
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		              FieldHint,
		              {
		                text: `${field.hint}\uFF08\u51FA\u5382\u9ED8\u8BA4 ${String(defaults?.[field.key] ?? 0)} \u5929\uFF1B0 = \u6C38\u4E45\u4FDD\u7559\uFF09`
		              }
		            )
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		            "input",
		            {
		              className: "jh-input jh-input-narrow",
		              type: "number",
		              min: RETENTION_MIN_DAYS,
		              max: RETENTION_MAX_DAYS,
		              "aria-label": field.label,
		              value: String(shownDays(field.key)),
		              disabled: props.busy,
		              onChange: (event) => {
		                const value = Number.parseInt(event.target.value, 10);
		                setDraft({ ...draft ?? {}, [field.key]: Number.isFinite(value) ? value : 0 });
		              }
		            }
		          )
		        ] }, field.key)),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-ctl", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("span", { className: "jh-field-label", children: [
		            "\u542F\u52A8\u65F6\u81EA\u52A8\u6E05\u7406",
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(FieldHint, { text: "\u9ED8\u8BA4\u5173\u3002\u5F00\u542F\u540E\u6BCF\u6B21\u542F\u52A8\u63D2\u4EF6\u65F6\u6309\u4E0A\u9762\u7684\u4FDD\u7559\u671F\u6E05\u4E00\u6B21\uFF08\u5E76 VACUUM\uFF09\u3002\u5220\u9664\u4E0D\u53EF\u9006\uFF0C\u5EFA\u8BAE\u5148\u624B\u52A8\u8DD1\u4E00\u6B21\u300C\u9884\u89C8\u6E05\u7406\u300D\u770B\u6E05\u4F1A\u5220\u4EC0\u4E48\u518D\u6253\u5F00\u3002" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		            Switch,
		            {
		              checked: retention?.autoCleanEnabled === true,
		              disabled: props.busy,
		              label: "\u542F\u52A8\u65F6\u81EA\u52A8\u6E05\u7406",
		              onChange: (next) => void props.write(
		                { retention: { autoCleanEnabled: next } },
		                next ? "\u5DF2\u5F00\u542F\u542F\u52A8\u65F6\u81EA\u52A8\u6E05\u7406" : "\u5DF2\u5173\u95ED\u542F\u52A8\u65F6\u81EA\u52A8\u6E05\u7406"
		              )
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-details-actions", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              disabled: props.busy || draft === null,
		              onClick: saveRetention,
		              children: "\u4FDD\u5B58\u4FDD\u7559\u671F"
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		            "button",
		            {
		              type: "button",
		              className: "jh-btn jh-btn-inline",
		              disabled: props.busy || defaults === null,
		              onClick: () => {
		                setDraft(null);
		                void props.write(
		                  { retention: defaults },
		                  "\u5DF2\u6062\u590D\u51FA\u5382\u9ED8\u8BA4\u4FDD\u7559\u671F"
		                );
		              },
		              children: "\u6062\u590D\u9ED8\u8BA4"
		            }
		          )
		        ] })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("h2", { className: "jh-card-title", children: "\u78C1\u76D8\u5360\u7528" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: storage.reload, children: "\u5237\u65B0" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(FieldHint, { text: storage.state.status === "ok" ? storage.state.data.note : "\u6309\u8868\u5B57\u8282\u6570\u6765\u81EA SQLite \u7684 dbstat\uFF08\u771F\u5B9E\u5206\u9875\u5927\u5C0F\uFF09\u3002" })
		      ] }),
		      storage.state.status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(ErrorLine, { children: storage.state.message }) : null,
		      storage.state.status !== "ok" ? /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(LoadingLine, { children: "\u6B63\u5728\u7EDF\u8BA1\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)(import_jsx_runtime78.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("ul", { className: "jh-kv", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { children: "\u6570\u636E\u76EE\u5F55" }),
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { title: storage.state.data.dataDir, children: storage.state.data.dataDir })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { children: "\u6570\u636E\u5E93\u6587\u4EF6" }),
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("span", { children: [
		              formatBytes(storage.state.data.db.bytes),
		              storage.state.data.db.walBytes > 0 ? ` + WAL ${formatBytes(storage.state.data.db.walBytes)}` : ""
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { children: "\u7B80\u5386\u9644\u4EF6" }),
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("span", { children: [
		              storage.state.data.attachments.fileCount,
		              " \u4E2A\u6587\u4EF6 \xB7 ",
		              formatBytes(storage.state.data.attachments.bytes)
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { children: "\u5BFC\u51FA\u5F52\u6863" }),
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("span", { children: [
		              storage.state.data.exports.fileCount,
		              " \u4E2A\u6587\u4EF6 \xB7 ",
		              formatBytes(storage.state.data.exports.bytes)
		            ] })
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("details", { className: "jh-details", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("summary", { children: "\u770B\u6309\u8868 / \u6309\u7C7B\u578B\u7684\u660E\u7EC6" }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("p", { className: "jh-muted", children: "\u5360\u7528\u6700\u5927\u7684\u8868\uFF1A" }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("table", { className: "jh-table jh-table-roomy", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("th", { scope: "col", children: "\u8868" }),
		              /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("th", { scope: "col", className: "jh-num", children: "\u5360\u7528" }),
		              /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("th", { scope: "col", className: "jh-num", children: "\u884C\u6570" })
		            ] }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("tbody", { children: storage.state.data.tables.slice(0, 12).map((table) => /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("tr", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("td", { children: table.table }),
		              /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("td", { className: "jh-num", children: formatBytes(table.bytes) }),
		              /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("td", { className: "jh-num", children: table.rows })
		            ] }, table.table)) })
		          ] }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("p", { className: "jh-muted", children: "\u6309\u7C7B\u578B\uFF08\u6E05\u7406\u53E3\u5F84\uFF09\uFF1A" }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("ul", { className: "jh-kv", children: storage.state.data.types.map((type) => /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("li", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("span", { title: type.note, children: [
		              type.label,
		              type.auto ? "" : "\uFF08\u957F\u671F\u4FDD\u7559\uFF09"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("span", { children: [
		              type.rows,
		              " \u884C \xB7 ",
		              formatBytes(type.bytes),
		              type.auto && type.retentionDays > 0 ? ` \xB7 \u4FDD\u7559 ${String(type.retentionDays)} \u5929` : ""
		            ] })
		          ] }, type.id)) })
		        ] })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("h2", { className: "jh-card-title", children: "\u6E05\u7406" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { className: "jh-spacer" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline",
		            disabled: planning || running,
		            onClick: () => void loadPlan(),
		            children: planning ? "\u6B63\u5728\u9884\u89C8\u2026" : "\u9884\u89C8\u6E05\u7406\uFF08\u4E0D\u6539\u4EFB\u4F55\u6570\u636E\uFF09"
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(FieldHint, { text: "\u9884\u89C8\u53EA\u8BFB\u3001\u53EF\u53CD\u590D\u70B9\u3002\u6267\u884C\u6E05\u7406\u4F1A\u771F\u7684\u5220\u6570\u636E\uFF0C\u800C\u4E14\u4E0D\u53EF\u9006 \u2014\u2014 \u6240\u4EE5\u5FC5\u987B\u5148\u9884\u89C8\u3001\u52FE\u9009\u3001\u518D\u5728\u5F39\u7A97\u91CC\u786E\u8BA4\u3002\u6267\u884C\u540E\u4F1A\u8DD1\u4E00\u6B21 VACUUM\uFF0C\u6587\u4EF6\u624D\u4F1A\u771F\u7684\u53D8\u5C0F\u3002" })
		      ] }),
		      cleanupResult === null ? null : /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("p", { className: "jh-note", children: cleanupResult }),
		      plan === null ? /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("p", { className: "jh-muted", children: '\u8FD8\u6CA1\u6709\u9884\u89C8\u3002\u70B9\u4E0A\u9762\u7684\u6309\u94AE\u770B"\u6309\u73B0\u5728\u7684\u4FDD\u7559\u671F\u4F1A\u5220\u6389\u4EC0\u4E48"\u3002' }) : /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)(import_jsx_runtime78.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("p", { className: "jh-muted", children: [
		          "\u5171 ",
		          plan.totalRows,
		          " \u884C \xB7 \u9884\u8BA1\u91CA\u653E ",
		          formatBytes(plan.totalBytes),
		          " \xB7 \u6570\u636E\u5E93\u5F53\u524D",
		          " ",
		          formatBytes(plan.dbBytesBefore),
		          "\uFF08VACUUM \u540E\u624D\u4F1A\u771F\u7684\u53D8\u5C0F\uFF09"
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("ul", { className: "jh-tailor-notes jh-clean-list", children: plan.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("label", { className: "jh-check", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		              "input",
		              {
		                type: "checkbox",
		                checked: selected.includes(item.id),
		                disabled: !item.willRun,
		                onChange: (event) => setSelected(
		                  (current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
		                )
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("span", { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("b", { children: item.label }),
		              "\uFF1A",
		              item.rows,
		              " \u884C / ",
		              formatBytes(item.bytes)
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("div", { className: "jh-muted", children: item.reason }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("div", { className: "jh-muted", children: item.describe })
		        ] }, item.id)) }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("p", { className: "jh-muted", children: plan.note }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("div", { className: "jh-details-actions", children: /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		          "button",
		          {
		            type: "button",
		            className: "jh-btn jh-btn-inline jh-btn-danger",
		            disabled: running || selected.length === 0,
		            onClick: () => setConfirming(true),
		            children: running ? "\u6E05\u7406\u4E2D\u2026" : `\u6267\u884C\u6E05\u7406\uFF08${String(plan.items.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.rows, 0))} \u884C\uFF09`
		          }
		        ) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("section", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-form-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("h2", { className: "jh-card-title", children: "\u5BFC\u51FA\u4E0E\u5BFC\u5165" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(FieldHint, { text: "\u5BFC\u51FA\u7684 JSON \u662F\u5168\u91CF\u7ED3\u6784\u5316\u5907\u4EFD\uFF08\u6362\u673A\u5668\u7559\u5E95\u8BA4\u51C6\u5B83\uFF09\uFF1BCSV \u662F\u7ED9 Excel \u770B\u7684\uFF08\u5E26 BOM\uFF0C\u6253\u5F00\u4E0D\u4E71\u7801\uFF09\uFF1B\u5F52\u6863\u591A\u5E26\u7B80\u5386\u9644\u4EF6\u7684\u539F\u6587\u4EF6\u3002\u5BFC\u5165\u53EA\u505A**\u5C97\u4F4D**\uFF0C\u4E14\u662F\u5E42\u7B49\u7684 \u2014\u2014 \u540C\u4E00\u4EFD\u8868\u5BFC\u4E24\u6B21\u53EA\u4F1A\u66F4\u65B0\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-details-actions", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("a", { className: "jh-btn jh-btn-inline", href: dataExportUrl("json"), download: true, children: "\u5BFC\u51FA JSON\uFF08\u5168\u91CF\u5907\u4EFD\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("a", { className: "jh-btn jh-btn-inline", href: dataExportUrl("csv"), download: true, children: "\u5BFC\u51FA CSV\uFF08Excel \u53EF\u8BFB\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("a", { className: "jh-btn jh-btn-inline", href: dataExportUrl("archive"), download: true, children: "\u5BFC\u51FA\u5F52\u6863\uFF08\u542B\u7B80\u5386\u9644\u4EF6\uFF09" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { className: "jh-row-head", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("label", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("span", { className: "jh-field-label", children: "\u5BFC\u5165\u5C97\u4F4D\u6E05\u5355" }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		            "input",
		            {
		              className: "jh-input",
		              type: "file",
		              accept: ".csv,.json,text/csv,application/json",
		              disabled: importing || props.busy,
		              onChange: (event) => {
		                const file = event.target.files?.[0];
		                event.target.value = "";
		                if (file !== void 0) void importFile(file);
		              }
		            }
		          )
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(FieldHint, { text: "\u652F\u6301 CSV\uFF08UTF-8\uFF1BGBK \u4F1A\u81EA\u52A8\u8BD5\u4E00\u6B21\uFF09\u4E0E JSON \u7684\u5C97\u4F4D\u6570\u7EC4\u3002Excel \u7684 .xlsx \u4E8C\u8FDB\u5236\u4E0D\u652F\u6301 \u2014\u2014 \u8BF7\u53E6\u5B58\u4E3A CSV UTF-8\u3002\u8868\u5934\u53EF\u4EE5\u7528\u300C\u5C97\u4F4D\u6807\u9898 / \u6807\u9898 / \u804C\u4F4D\u300D\uFF0C\u4E5F\u8BA4\u300C\u516C\u53F8 / \u85AA\u8D44 / \u57CE\u5E02 / \u6765\u6E90\u94FE\u63A5\u300D\u7B49\u5E38\u89C1\u53EB\u6CD5\u3002" })
		      ] }),
		      importing ? /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u5BFC\u5165\u2026" }) : null,
		      importResult === null ? null : /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("div", { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("p", { className: "jh-note", children: [
		          "\u65B0\u589E ",
		          importResult.inserted,
		          " \xB7 \u66F4\u65B0 ",
		          importResult.updated,
		          " \xB7 \u8DF3\u8FC7 ",
		          importResult.skipped,
		          "\uFF08\u5171\u89E3\u6790",
		          " ",
		          importResult.received,
		          " \u884C\uFF09"
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("p", { className: "jh-muted", children: importResult.note }),
		        importResult.errors.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("details", { className: "jh-details", open: true, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("summary", { children: [
		            "\u9010\u884C\u95EE\u9898\uFF08",
		            importResult.errors.length,
		            " \u6761\uFF09"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("ul", { className: "jh-tailor-notes", children: importResult.errors.map((error, index) => /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("li", { className: "jh-muted", children: [
		            "\u7B2C ",
		            error.row,
		            " \u884C\uFF1A",
		            error.message
		          ] }, `${String(error.row)}-${String(index)}`)) })
		        ] })
		      ] })
		    ] }),
		    confirming ? /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(
		      Modal,
		      {
		        title: "\u786E\u8BA4\u6E05\u7406\u6570\u636E",
		        label: "\u6E05\u7406\u6570\u636E\u786E\u8BA4",
		        onClose: () => setConfirming(false),
		        footer: /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)(import_jsx_runtime78.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => setConfirming(false), children: "\u53D6\u6D88" }),
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline jh-btn-danger", onClick: () => void execute(), children: "\u786E\u8BA4\u6E05\u7406\uFF0C\u4E14\u4E0D\u53EF\u6062\u590D" })
		        ] }),
		        children: /* @__PURE__ */ (0, import_jsx_runtime78.jsxs)("p", { className: "jh-alert-body", children: [
		          "\u5C06\u4F1A\u6E05\u7406 ",
		          selected.length,
		          " \u7C7B\u3001\u5171",
		          " ",
		          plan?.items.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.rows, 0) ?? 0,
		          " \u884C\u3002",
		          /* @__PURE__ */ (0, import_jsx_runtime78.jsx)(InlineMd, { text: "\u8FD9\u4E00\u6B65**\u4E0D\u53EF\u64A4\u9500**\uFF0C\u4E14\u53EA\u6E05\u7406\u4E0A\u9762\u5217\u51FA\u7684\u90A3\u51E0\u7C7B\uFF08\u6295\u9012\u8BB0\u5F55\u3001\u6253\u62DB\u547C\u3001\u6D88\u606F\u3001\u9762\u8BD5\u3001\u7B80\u5386\u4E0E\u9644\u4EF6\u90FD\u4E0D\u5728\u5176\u4E2D\uFF09\u3002" })
		        ] })
		      }
		    ) : null
		  ] });
		}
		async function importCsvInBatches(text) {
		  const quoted = text.includes('"');
		  const lines = text.split(/\r?\n/);
		  const header = lines[0] ?? "";
		  const body = lines.slice(1).filter((line) => line.trim() !== "");
		  if (quoted || body.length <= CHUNK_ROWS) {
		    return await importJobsPayload({ format: "csv", content: text });
		  }
		  const aggregate = {
		    format: "csv",
		    received: 0,
		    inserted: 0,
		    updated: 0,
		    skipped: 0,
		    errors: [],
		    moreErrors: 0,
		    note: ""
		  };
		  for (let start = 0; start < body.length; start += CHUNK_ROWS) {
		    const chunk = [header, ...body.slice(start, start + CHUNK_ROWS)].join("\r\n");
		    const result = await importJobsPayload({ format: "csv", content: chunk });
		    aggregate.received += result.received;
		    aggregate.inserted += result.inserted;
		    aggregate.updated += result.updated;
		    aggregate.skipped += result.skipped;
		    aggregate.errors.push(...result.errors);
		    aggregate.moreErrors += result.moreErrors;
		    aggregate.note = result.note;
		  }
		  return { ...aggregate, errors: aggregate.errors.slice(0, 20) };
		}

		// src/client/screens/settings/logs-panel.tsx
		var import_react34 = require("react");

		// src/client/net/overview.ts
		async function fetchHealth(signal) {
		  return await request("/health", signal === void 0 ? {} : { signal });
		}
		async function fetchToday(signal) {
		  return await request("/today", signal === void 0 ? {} : { signal });
		}
		async function fetchGuardUsage(platformId, signal) {
		  const suffix = platformId === void 0 || platformId === "" ? "" : `?platformId=${encodeURIComponent(platformId)}`;
		  return await request(`/guard/usage${suffix}`, signal === void 0 ? {} : { signal });
		}

		// src/shared/contract/enums/guard.ts
		var ACTOR_LABEL = {
		  gui: "\u754C\u9762\u4E0A\u7684\u4F60",
		  model: "\u6A21\u578B\uFF08\u5BF9\u8BDD\u91CC\u53D1\u8D77\uFF09",
		  schedule: "\u5B9A\u65F6\u4EFB\u52A1",
		  user: "\u7528\u6237"
		};
		function actorLabel(actor) {
		  return ACTOR_LABEL[actor] ?? actor;
		}
		var AUDIT_RESULT_LABEL = {
		  ok: "\u5DF2\u6267\u884C",
		  denied: "\u88AB\u62D2\u7EDD",
		  error: "\u51FA\u9519"
		};
		var AUDIT_RESULT_TONE = {
		  ok: "ok",
		  denied: "warn",
		  error: "error"
		};
		function auditResultLabel(result) {
		  return AUDIT_RESULT_LABEL[result] ?? result;
		}
		function auditResultTone(result) {
		  return AUDIT_RESULT_TONE[result] ?? "warn";
		}

		// src/client/screens/settings/audit-table.tsx
		var import_jsx_runtime79 = require("react/jsx-runtime");
		function AuditTable(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime79.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("h2", { className: "jh-card-title", children: "\u64CD\u4F5C\u5BA1\u8BA1" }),
		    props.audit.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime79.jsx)(ErrorLine, { children: props.audit.message }),
		    props.audit.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime79.jsxs)(import_jsx_runtime79.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("div", { className: "jh-filters", children: /* @__PURE__ */ (0, import_jsx_runtime79.jsxs)("span", { className: "jh-filter-note", children: [
		        "\u5171 ",
		        props.audit.data.count,
		        " \u6761 \xB7 \u8868\u91CC\u663E\u793A\u6700\u8FD1 ",
		        props.audit.data.items.length,
		        " \u6761"
		      ] }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime79.jsxs)("table", { className: "jh-table jh-table-roomy", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime79.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("th", { scope: "col", children: "\u65F6\u95F4" }),
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("th", { scope: "col", children: "\u8C01" }),
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("th", { scope: "col", children: "\u52A8\u4F5C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("th", { scope: "col", className: "jh-cell-status", children: "\u7ED3\u679C" }),
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("th", { scope: "col", children: "\u8BF4\u660E" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("tbody", { children: props.audit.data.items.map((record) => /* @__PURE__ */ (0, import_jsx_runtime79.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("td", { children: record.at.slice(5, 16).replace("T", " ") }),
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("td", { children: actorLabel(record.actor) }),
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("code", { children: record.action }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("td", { className: "jh-cell-status", children: /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("span", { className: `jh-tag jh-tone-${auditResultTone(record.result)}`, children: auditResultLabel(record.result) }) }),
		          /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("td", { className: "jh-muted", children: record.reason ?? "\u2014" })
		        ] }, record.id)) })
		      ] }) }),
		      props.audit.data.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u5BA1\u8BA1\u8BB0\u5F55 \u2014\u2014 \u5B83\u53EA\u8BB0\u300C\u8FC7\u95F8\u95E8\u300D\u7684\u52A8\u4F5C\uFF08\u53D1\u9001 / \u6295\u9012 / \u56DE\u590D / \u6539\u95F8\u95E8\u914D\u7F6E\uFF09\uFF0C\u4ECA\u5929\u8FD8\u6CA1\u89E6\u53D1\u8FC7\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime79.jsx)("p", { className: "jh-note", children: props.audit.data.note })
		    ] })
		  ] });
		}

		// src/client/screens/settings/diagnostics-panel.tsx
		var import_react32 = require("react");

		// src/client/ui/icons.tsx
		var import_jsx_runtime80 = require("react/jsx-runtime");
		function IconCopy() {
		  return /* @__PURE__ */ (0, import_jsx_runtime80.jsxs)(
		    "svg",
		    {
		      width: "14",
		      height: "14",
		      viewBox: "0 0 16 16",
		      fill: "none",
		      stroke: "currentColor",
		      strokeWidth: "1.4",
		      strokeLinejoin: "round",
		      "aria-hidden": "true",
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime80.jsx)("rect", { x: "5.5", y: "5.5", width: "9", height: "9", rx: "1.5" }),
		        /* @__PURE__ */ (0, import_jsx_runtime80.jsx)("path", { d: "M10.5 5.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h2.5" })
		      ]
		    }
		  );
		}
		function IconFolder() {
		  return /* @__PURE__ */ (0, import_jsx_runtime80.jsx)(
		    "svg",
		    {
		      width: "14",
		      height: "14",
		      viewBox: "0 0 16 16",
		      fill: "none",
		      stroke: "currentColor",
		      strokeWidth: "1.4",
		      strokeLinejoin: "round",
		      "aria-hidden": "true",
		      children: /* @__PURE__ */ (0, import_jsx_runtime80.jsx)("path", { d: "M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 2h5.5A1.5 1.5 0 0 1 14.5 6.5v5A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5z" })
		    }
		  );
		}

		// src/client/screens/settings/diagnostics-panel.tsx
		var import_jsx_runtime81 = require("react/jsx-runtime");
		function DiagnosticsPanel(props) {
		  const health = props.health;
		  const copyPath = async (path) => {
		    if (await copyText(path)) {
		      props.notify("ok", "\u5DF2\u590D\u5236\u6570\u636E\u6587\u4EF6\u8DEF\u5F84\u3002");
		      return;
		    }
		    props.notify("error", "\u590D\u5236\u5931\u8D25 \u2014\u2014 \u6D4F\u89C8\u5668\u4E0D\u5141\u8BB8\u5199\u526A\u8D34\u677F\uFF0C\u8BF7\u624B\u52A8\u9009\u4E2D\u8DEF\u5F84\u590D\u5236\u3002");
		  };
		  const revealDir = async () => {
		    try {
		      const result = await revealDataDir();
		      props.notify(
		        result.ok ? "ok" : "error",
		        result.ok ? `\u5DF2\u5728\u7CFB\u7EDF\u6587\u4EF6\u7BA1\u7406\u5668\u4E2D\u6253\u5F00\uFF1A${result.dir}` : `\u6253\u4E0D\u5F00\u6587\u4EF6\u5939\uFF1A${result.reason ?? "\u672A\u77E5\u539F\u56E0"}\uFF08${result.dir}\uFF09`
		      );
		    } catch (error) {
		      props.notify("error", error instanceof ApiError ? error.display : String(error));
		    }
		  };
		  const dataPath = health.status === "ok" && health.data.dataReady ? health.data.dataPath : null;
		  return /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("h2", { className: "jh-card-title", children: "\u8BCA\u65AD" }),
		    health.status !== "ok" ? /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u8BCA\u65AD\u4FE1\u606F\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)(import_jsx_runtime81.Fragment, { children: [
		      health.data.dataReady ? /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)(import_jsx_runtime81.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-stats", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-stat", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("b", { children: health.data.version }),
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("span", { children: [
		              "\u7248\u672C \xB7 ",
		              health.data.phase
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime81.jsx)(LiveUptimeCard, { uptimeMs: health.data.hostUptimeMs }),
		          /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-stat", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("b", { children: health.data.tools === null ? "\u2014" : health.data.tools.registered.length }),
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("span", { children: "\u5DF2\u6302\u8F7D\u5DE5\u5177" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-stat", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("b", { children: [
		              health.data.jobCount,
		              " / ",
		              health.data.companyCount
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("span", { children: "\u5C97\u4F4D / \u516C\u53F8" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)(
		            "div",
		            {
		              className: `jh-stat${health.data.pendingRepairCount > 0 ? " jh-stat-warn" : ""}`,
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("b", { children: health.data.pendingRepairCount }),
		                /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("span", { children: "\u5F85\u4FEE\u590D" })
		              ]
		            }
		          )
		        ] }),
		        dataPath === null ? null : /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-field", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("span", { className: "jh-field-label", children: "\u6570\u636E\u6587\u4EF6" }),
		          /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-path", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("code", { title: dataPath, children: dataPath }),
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-icon-btn",
		                title: "\u590D\u5236\u8DEF\u5F84",
		                "aria-label": "\u590D\u5236\u6570\u636E\u6587\u4EF6\u8DEF\u5F84",
		                onClick: () => void copyPath(dataPath),
		                children: /* @__PURE__ */ (0, import_jsx_runtime81.jsx)(IconCopy, {})
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime81.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-icon-btn",
		                title: "\u6253\u5F00\u6240\u5728\u6587\u4EF6\u5939",
		                "aria-label": "\u6253\u5F00\u6570\u636E\u6587\u4EF6\u6240\u5728\u6587\u4EF6\u5939",
		                onClick: () => void revealDir(),
		                children: /* @__PURE__ */ (0, import_jsx_runtime81.jsx)(IconFolder, {})
		              }
		            )
		          ] })
		        ] })
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-alert jh-alert-error", role: "alert", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("div", { className: "jh-alert-head", children: /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("span", { className: "jh-alert-title", children: "\u6570\u636E\u5C42\u672A\u5C31\u7EEA" }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("p", { className: "jh-alert-body", children: health.data.dataError ?? "\u6CA1\u6709\u53EF\u8BFB\u7684\u5931\u8D25\u539F\u56E0 \u2014\u2014 \u6570\u636E\u5C42\u5C1A\u672A\u5C31\u7EEA\u3002" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-ctl", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("span", { className: "jh-field-label", children: "\u79BB\u7EBF\u6A21\u5F0F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("span", { className: health.data.offline ? "jh-warn" : "jh-muted", children: health.data.offline ? "\u5DF2\u5F00\u542F \u2014\u2014 \u6293\u53D6\u4E0E\u767B\u5F55\u5F15\u5BFC\u4F1A\u88AB\u62D2\u7EDD" : "\u5173\u95ED" })
		      ] }),
		      health.data.tools !== null && health.data.tools.failed.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("p", { className: "jh-error", children: [
		        "\u5DE5\u5177\u6CE8\u518C\u5931\u8D25\uFF1A",
		        health.data.tools.failed.map((item) => `${item.name}\uFF08${item.reason}\uFF09`).join(" \xB7 ")
		      ] })
		    ] })
		  ] });
		}
		function LiveUptimeCard(props) {
		  const [elapsed, setElapsed] = (0, import_react32.useState)(0);
		  (0, import_react32.useEffect)(() => {
		    setElapsed(0);
		    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1e3);
		    return () => window.clearInterval(timer);
		  }, [props.uptimeMs]);
		  return /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("div", { className: "jh-stat", title: "\u9762\u677F\u8BFB\u53D6\u65F6\u7684\u5BBF\u4E3B\u8FD0\u884C\u65F6\u957F + \u672C\u5730\u7ECF\u8FC7\u65F6\u95F4\uFF0C\u6BCF\u79D2\u81EA\u589E", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime81.jsxs)("b", { children: [
		      Math.round(props.uptimeMs / 1e3) + elapsed,
		      "s"
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime81.jsx)("span", { children: "\u8FD0\u884C\u65F6\u957F" })
		  ] });
		}

		// src/client/screens/settings/llm-calls-table.tsx
		var import_jsx_runtime82 = require("react/jsx-runtime");
		function LlmCallsTable(props) {
		  const llmItems = props.llm.status === "ok" ? props.llm.data.items : [];
		  const purposes = [...new Set(llmItems.map((item) => item.purpose))].sort();
		  const needle = props.query.trim().toLowerCase();
		  const shown = llmItems.filter((item) => {
		    if (props.purpose !== "" && item.purpose !== props.purpose) return false;
		    if (props.status === "ok" && !item.ok) return false;
		    if (props.status === "fail" && item.ok) return false;
		    if (needle === "") return true;
		    return [item.purpose, props.labelOf(item.purpose), item.model ?? "", item.errorCode ?? "", item.fields.join(" ")].join(" ").toLowerCase().includes(needle);
		  });
		  const usage = (props.llm.status === "ok" ? props.llm.data.stats : []).map((item) => ({
		    purpose: item.purpose,
		    calls: item.calls,
		    tokens: item.promptTokens + item.completionTokens
		  })).sort((left, right) => right.tokens - left.tokens);
		  return /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("h2", { className: "jh-card-title", children: "\u6A21\u578B\u8C03\u7528\u7559\u75D5\uFF08\u6211\u53D1\u4E86\u4EC0\u4E48\u7ED9\u6A21\u578B\uFF09" }),
		    props.llm.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime82.jsx)(ErrorLine, { children: props.llm.message }),
		    props.llm.status === "ok" && /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)(import_jsx_runtime82.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)("div", { className: "jh-filters", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)(
		          "select",
		          {
		            className: "jh-select",
		            "aria-label": "\u6309\u573A\u666F\u7B5B\u9009",
		            value: props.purpose,
		            onChange: (event) => props.setPurpose(event.target.value),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("option", { value: "", children: "\u5168\u90E8\u573A\u666F" }),
		              purposes.map((item) => /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)("option", { value: item, children: [
		                props.labelOf(item),
		                "\uFF08",
		                item,
		                "\uFF09"
		              ] }, item))
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)(
		          "select",
		          {
		            className: "jh-select",
		            "aria-label": "\u6309\u72B6\u6001\u7B5B\u9009",
		            value: props.status,
		            onChange: (event) => props.setStatus(event.target.value),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("option", { value: "all", children: "\u5168\u90E8\u72B6\u6001" }),
		              /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("option", { value: "ok", children: "\u6210\u529F" }),
		              /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("option", { value: "fail", children: "\u5931\u8D25" })
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime82.jsx)(
		          "input",
		          {
		            className: "jh-input jh-input-grow",
		            type: "search",
		            "aria-label": "\u641C\u7D22\u8C03\u7528\u8BB0\u5F55",
		            placeholder: "\u641C\u7D22\u573A\u666F / \u6A21\u578B / \u5B57\u6BB5 / \u9519\u8BEF\u2026",
		            value: props.query,
		            onChange: (event) => props.setQuery(event.target.value)
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)("span", { className: "jh-filter-note", children: [
		          "\u663E\u793A ",
		          shown.length,
		          " / ",
		          llmItems.length,
		          " \u6761"
		        ] })
		      ] }),
		      usage.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)(import_jsx_runtime82.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("h3", { className: "jh-section-title", children: "\u6309\u7528\u9014\u6C47\u603B\uFF08\u4E0D\u53D7\u4E0A\u9762\u7684\u7B5B\u9009\u5F71\u54CD\uFF09" }),
		        /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("div", { className: "jh-usage", children: usage.map((item) => /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)("span", { className: "jh-usage-item", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("span", { className: "jh-usage-name", children: props.labelOf(item.purpose) }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("span", { className: "jh-usage-num", children: item.calls }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("span", { className: "jh-usage-unit", children: "\u6B21" }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("span", { className: "jh-usage-num", children: item.tokens }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("span", { className: "jh-usage-unit", children: "token" })
		        ] }, item.purpose)) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("div", { className: "jh-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)("table", { className: "jh-table jh-table-roomy", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)("tr", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("th", { scope: "col", children: "\u65F6\u95F4" }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("th", { scope: "col", children: "\u7528\u9014" }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("th", { scope: "col", children: "\u6A21\u578B" }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("th", { scope: "col", children: "\u5916\u53D1\u5B57\u6BB5" }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("th", { scope: "col", className: "jh-num", children: "Token" }),
		          /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("th", { scope: "col", className: "jh-cell-status", children: "\u7ED3\u679C" })
		        ] }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("tbody", { children: shown.map((call) => {
		          const result = resultOf(call);
		          return /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)("tr", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("td", { children: call.at.slice(5, 16).replace("T", " ") }),
		            /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("td", { children: props.labelOf(call.purpose) }),
		            /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("td", { children: call.model ?? "\u2014" }),
		            /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("td", { children: call.fields.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("span", { className: "jh-muted", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime82.jsxs)(
		              "button",
		              {
		                type: "button",
		                className: "jh-link jh-payload-link",
		                "aria-label": `\u67E5\u770B\u8FD9\u6B21\u8C03\u7528\u7684\u5B8C\u6574\u7559\u75D5\uFF08\u5916\u53D1 ${String(call.fields.length)} \u4E2A\u5B57\u6BB5\uFF09`,
		                onClick: () => props.onOpenPayload(call),
		                children: [
		                  "\u5DF2\u9009\u4E2D ",
		                  call.fields.length,
		                  " \u9879"
		                ]
		              }
		            ) }),
		            /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("td", { className: "jh-num", children: call.promptTokens + call.completionTokens }),
		            /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("td", { className: "jh-cell-status", children: /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("span", { className: `jh-tag jh-tag-clip ${result.tone}`, title: result.full, children: result.text }) })
		          ] }, call.id);
		        }) })
		      ] }) }),
		      llmItems.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("p", { className: "jh-muted", children: "\u8FD8\u6CA1\u6709\u8C03\u7528\u8BB0\u5F55 \u2014\u2014 \u6A21\u578B\u603B\u5F00\u5173\u5173\u7740\u3001\u6216\u8005\u8FD8\u6CA1\u8DD1\u8FC7\u8981\u7528\u6A21\u578B\u7684\u6D3B\u65F6\uFF0C\u8FD9\u91CC\u5C31\u662F\u7A7A\u7684\u3002" }),
		      llmItems.length > 0 && shown.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u5339\u914D\u7684\u8C03\u7528\u8BB0\u5F55 \u2014\u2014 \u6E05\u6389\u4E0A\u9762\u7684\u7B5B\u9009\u6761\u4EF6\u518D\u770B\u770B\u3002" }),
		      /* @__PURE__ */ (0, import_jsx_runtime82.jsx)("p", { className: "jh-note", children: props.llm.data.note })
		    ] })
		  ] });
		}
		function resultOf(call) {
		  if (call.ok) return { text: "\u6210\u529F", tone: "jh-tone-ok", full: "\u6210\u529F" };
		  const raw = call.errorCode ?? "\u5931\u8D25";
		  const soft = raw.includes("\u7A7A\u5185\u5BB9");
		  return {
		    text: soft ? "\u6A21\u578B\u8FD4\u56DE\u7A7A\u5185\u5BB9" : raw,
		    tone: soft ? "jh-tone-warn" : "jh-tone-error",
		    full: raw
		  };
		}

		// src/client/screens/settings/payload-drawer.tsx
		var import_react33 = require("react");
		var import_jsx_runtime83 = require("react/jsx-runtime");
		function PayloadDrawer(props) {
		  const dialogRef = (0, import_react33.useRef)(null);
		  useDialogA11y(dialogRef, props.onClose);
		  const call = props.call;
		  const json = JSON.stringify(
		    {
		      id: call.id,
		      at: call.at,
		      purpose: call.purpose,
		      purposeLabel: props.purposeLabel,
		      provider: call.provider,
		      model: call.model,
		      fields: call.fields,
		      fieldCount: call.fields.length,
		      promptTokens: call.promptTokens,
		      completionTokens: call.completionTokens,
		      totalTokens: call.promptTokens + call.completionTokens,
		      ok: call.ok,
		      errorCode: call.errorCode,
		      durationMs: call.durationMs,
		      ref: call.ref
		    },
		    null,
		    2
		  );
		  const copyJson = async () => {
		    if (await copyText(json)) {
		      props.notify("ok", "\u5DF2\u590D\u5236\u8FD9\u6B21\u8C03\u7528\u7684\u5B8C\u6574\u7559\u75D5\uFF08JSON\uFF09\u3002");
		      return;
		    }
		    props.notify("error", "\u590D\u5236\u5931\u8D25 \u2014\u2014 \u6D4F\u89C8\u5668\u4E0D\u5141\u8BB8\u5199\u526A\u8D34\u677F\uFF0C\u8BF7\u624B\u52A8\u9009\u4E2D JSON \u590D\u5236\u3002");
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime83.jsxs)("div", { className: "jh-drawer-layer", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime83.jsx)(
		      "button",
		      {
		        type: "button",
		        className: "jh-drawer-backdrop",
		        "aria-label": "\u5173\u95ED\u7559\u75D5\u660E\u7EC6",
		        onClick: props.onClose
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime83.jsxs)(
		      "aside",
		      {
		        className: "jh-drawer",
		        role: "dialog",
		        "aria-modal": "true",
		        "aria-label": "\u6A21\u578B\u8C03\u7528\u7559\u75D5\u660E\u7EC6",
		        tabIndex: -1,
		        ref: dialogRef,
		        "data-job-hunter": "llm-payload-drawer",
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime83.jsxs)("header", { className: "jh-drawer-head", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime83.jsxs)("span", { className: "jh-drawer-title", children: [
		              "\u7559\u75D5\u660E\u7EC6 #",
		              call.id
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime83.jsx)("button", { type: "button", className: "jh-icon-btn", "aria-label": "\u5173\u95ED", onClick: props.onClose, children: "\xD7" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime83.jsxs)("div", { className: "jh-drawer-body", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime83.jsx)("div", { className: "jh-copy-head", children: /* @__PURE__ */ (0, import_jsx_runtime83.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline jh-btn-tiny",
		                onClick: () => void copyJson(),
		                children: "\u590D\u5236 JSON"
		              }
		            ) }),
		            /* @__PURE__ */ (0, import_jsx_runtime83.jsx)("p", { className: "jh-note jh-json-hint", children: /* @__PURE__ */ (0, import_jsx_runtime83.jsx)(InlineMd, { text: "\u7559\u75D5\u8868\u91CC\u53EA\u6709**\u5B57\u6BB5\u6E05\u5355\u4E0E\u957F\u5EA6**\uFF0C\u6CA1\u6709\u6B63\u6587 \u2014\u2014 \u5916\u53D1\u6B63\u6587\u4E0D\u5165\u5BA1\u8BA1\u8868\uFF08\xA74.1 \u9690\u79C1\u7B56\u7565\uFF09\u3002" }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime83.jsx)("pre", { className: "jh-json", children: json })
		          ] })
		        ]
		      }
		    )
		  ] });
		}

		// src/client/screens/settings/logs-panel.tsx
		var import_jsx_runtime84 = require("react/jsx-runtime");
		var LOG_LIMIT = 50;
		function LogsPanel(props) {
		  const health = useAsync((signal) => fetchHealth(signal), [props.revision], { keepPrevious: true });
		  const llm = useAsync((signal) => fetchLlmCalls(LOG_LIMIT, signal), [props.revision], {
		    keepPrevious: true
		  });
		  const audit = useAsync((signal) => fetchAudit(LOG_LIMIT, {}, signal), [props.revision], {
		    keepPrevious: true
		  });
		  const [purpose, setPurpose] = (0, import_react34.useState)("");
		  const [status, setStatus] = (0, import_react34.useState)("all");
		  const [query, setQuery] = (0, import_react34.useState)("");
		  const [payload, setPayload] = (0, import_react34.useState)(null);
		  return /* @__PURE__ */ (0, import_jsx_runtime84.jsxs)(import_jsx_runtime84.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime84.jsx)(DiagnosticsPanel, { health: health.state, notify: props.notify }),
		    /* @__PURE__ */ (0, import_jsx_runtime84.jsx)(
		      LlmCallsTable,
		      {
		        llm: llm.state,
		        labelOf: props.labelOf,
		        purpose,
		        setPurpose,
		        status,
		        setStatus,
		        query,
		        setQuery,
		        onOpenPayload: setPayload
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime84.jsx)(AuditTable, { audit: audit.state }),
		    payload === null ? null : /* @__PURE__ */ (0, import_jsx_runtime84.jsx)(
		      PayloadDrawer,
		      {
		        call: payload,
		        purposeLabel: props.labelOf(payload.purpose),
		        notify: props.notify,
		        onClose: () => setPayload(null)
		      }
		    )
		  ] });
		}

		// src/client/screens/settings/index.tsx
		var import_jsx_runtime85 = require("react/jsx-runtime");
		var SETTINGS_TABS = [
		  // 这一格里有模型用途、系统控制中心（闸门）与运行资源三张卡，
		  // 所以名字取"模型与**系统**配置"而不是"模型与安全配置" —— 见 config-panel 的注释。
		  ["config", "\u6A21\u578B\u4E0E\u7CFB\u7EDF\u914D\u7F6E"],
		  ["logs", "\u8BCA\u65AD\u4E0E\u8C03\u7528\u65E5\u5FD7"],
		  // 第三个分区（§18 / J8）：保留期、磁盘占用、清理、导出导入。
		  // 为什么不塞进「诊断」：那一屏回答"出问题时怎么自查"，这一屏回答"我的数据现在多大、
		  // 能不能搬走" —— 使用时机不同（前者出事才看，后者隔几个月看一次），放一起会互相干扰。
		  ["data", "\u6570\u636E\u4E0E\u5B58\u50A8"]
		];
		function SettingsScreen(props) {
		  const settings = useAsync((signal) => fetchSettings(signal), [props.revision], {
		    keepPrevious: true
		  });
		  const [tab, setTab] = (0, import_react35.useState)("config");
		  const [message, setMessage] = (0, import_react35.useState)(null);
		  const [busy, setBusy] = (0, import_react35.useState)(false);
		  const lastSettings = (0, import_react35.useRef)(null);
		  if (settings.state.status === "ok") lastSettings.current = settings.state.data;
		  const current = settings.state.status === "ok" ? settings.state.data : lastSettings.current;
		  const write = async (patch, okText) => {
		    setBusy(true);
		    try {
		      await updateSettings(patch);
		      setMessage({ tone: "ok", text: okText });
		      settings.reload();
		    } catch (error) {
		      setMessage({ tone: "error", text: error instanceof ApiError ? error.display : String(error) });
		      settings.reload();
		    } finally {
		      setBusy(false);
		    }
		  };
		  const labelOf = (purpose) => current?.derived.purposes.find((item) => item.purpose === purpose)?.label ?? purpose;
		  const tabRefs = (0, import_react35.useRef)([]);
		  const onTabKeyDown = (event, index) => {
		    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		    event.preventDefault();
		    const delta = event.key === "ArrowRight" ? 1 : -1;
		    const nextIndex = (index + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length;
		    const next = SETTINGS_TABS[nextIndex];
		    if (next === void 0) return;
		    setTab(next[0]);
		    tabRefs.current[nextIndex]?.focus();
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime85.jsxs)("div", { className: "jh-screen jh-screen-settings", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime85.jsxs)("div", { className: "jh-row-head", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime85.jsx)("h2", { className: "jh-card-title", children: "\u8BBE\u7F6E\u4E0E\u8BCA\u65AD" }),
		      /* @__PURE__ */ (0, import_jsx_runtime85.jsx)("span", { className: "jh-muted", children: "\u6293\u53D6\u989D\u5EA6\u3001\u5BA1\u6279\u4E0E\u5BA1\u8BA1\u5F00\u5173\u53EA\u80FD\u7531\u4F60\u5728\u754C\u9762\u4E0A\u6539 \u2014\u2014 \u6A21\u578B\u6539\u4E0D\u4E86\uFF08\xA722.4\uFF09" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime85.jsx)("div", { className: "jh-modes jh-set-tabs", role: "tablist", "aria-label": "\u8BBE\u7F6E\u5206\u533A", children: SETTINGS_TABS.map(([key, label], index) => /* @__PURE__ */ (0, import_jsx_runtime85.jsx)(
		      "button",
		      {
		        id: `jh-set-tab-${key}`,
		        ref: (element) => {
		          tabRefs.current[index] = element;
		        },
		        type: "button",
		        role: "tab",
		        "aria-selected": tab === key,
		        "aria-controls": `jh-set-panel-${key}`,
		        tabIndex: tab === key ? 0 : -1,
		        className: `jh-mode${tab === key ? " jh-mode-active" : ""}`,
		        onClick: () => setTab(key),
		        onKeyDown: (event) => onTabKeyDown(event, index),
		        children: label
		      },
		      key
		    )) }),
		    message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime85.jsx)("div", { className: "jh-card jh-card-tight", children: /* @__PURE__ */ (0, import_jsx_runtime85.jsx)(
		      "p",
		      {
		        className: message.tone === "error" ? "jh-error" : "jh-ok",
		        role: message.tone === "error" ? "alert" : "status",
		        children: message.text
		      }
		    ) }),
		    tab === "config" ? /* @__PURE__ */ (0, import_jsx_runtime85.jsx)("div", { role: "tabpanel", id: "jh-set-panel-config", "aria-labelledby": "jh-set-tab-config", children: /* @__PURE__ */ (0, import_jsx_runtime85.jsx)(
		      ConfigPanel,
		      {
		        current,
		        error: settings.state.status === "error" ? settings.state.hint ?? settings.state.message : null,
		        busy,
		        write
		      }
		    ) }) : tab === "logs" ? /* @__PURE__ */ (0, import_jsx_runtime85.jsx)("div", { role: "tabpanel", id: "jh-set-panel-logs", "aria-labelledby": "jh-set-tab-logs", children: /* @__PURE__ */ (0, import_jsx_runtime85.jsx)(
		      LogsPanel,
		      {
		        revision: props.revision,
		        labelOf,
		        notify: (tone, text) => setMessage({ tone, text })
		      }
		    ) }) : /* @__PURE__ */ (0, import_jsx_runtime85.jsx)("div", { role: "tabpanel", id: "jh-set-panel-data", "aria-labelledby": "jh-set-tab-data", children: /* @__PURE__ */ (0, import_jsx_runtime85.jsx)(
		      DataPanel,
		      {
		        current,
		        busy,
		        write,
		        notify: (tone, text) => setMessage({ tone, text })
		      }
		    ) })
		  ] });
		}

		// src/client/screens/today/index.tsx
		var import_react37 = require("react");

		// src/client/hooks/use-sticky.ts
		var import_react36 = require("react");
		function useSticky(state) {
		  const last = (0, import_react36.useRef)(null);
		  if (state.status === "ok") last.current = state.data;
		  return state.status === "ok" ? state.data : state.status === "loading" ? last.current : null;
		}

		// src/client/screens/today/next-run-card.tsx
		var import_jsx_runtime86 = require("react/jsx-runtime");
		function NextRunCard(props) {
		  const { sched, worst, nextTrigger, now, feedback } = props;
		  return /* @__PURE__ */ (0, import_jsx_runtime86.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime86.jsxs)("div", { className: "jh-today-head", children: [
		      worst === null ? /* @__PURE__ */ (0, import_jsx_runtime86.jsx)("span", { className: "jh-muted", children: sched !== null && sched.planStatus.length > 0 ? "\u6CA1\u6709\u542F\u7528\u5B9A\u65F6\u7684\u65B9\u6848 \u2014\u2014 \u6570\u636E\u4E0D\u4F1A\u81EA\u52A8\u66F4\u65B0\u3002" : "\u8FD8\u6CA1\u6709\u91C7\u96C6\u65B9\u6848\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime86.jsx)(FreshnessBadge, { level: worst.freshness.level, hours: worst.freshness.hoursSinceSuccess }),
		      /* @__PURE__ */ (0, import_jsx_runtime86.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime86.jsx)(
		        "button",
		        {
		          type: "button",
		          className: "jh-btn jh-btn-inline jh-btn-primary",
		          disabled: feedback.running || (sched?.readOnly ?? false),
		          onClick: () => void props.onStartCrawl(),
		          children: feedback.running ? "\u6267\u884C\u4E2D\u2026" : "\u7ACB\u5373\u91C7\u96C6"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime86.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: props.onGoCollect, children: "\u53BB\u914D\u7F6E" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime86.jsxs)("p", { className: "jh-muted", children: [
		      nextTrigger === null ? "\u6CA1\u6709\u542F\u7528\u5B9A\u65F6\u7684\u65B9\u6848 \u2014\u2014 \u53EA\u4F1A\u5728\u4F60\u70B9\u300C\u7ACB\u5373\u91C7\u96C6\u300D\u65F6\u8DD1\u3002" : `\u4E0B\u6B21\u81EA\u52A8\u91C7\u96C6\uFF1A${formatClock(new Date(nextTrigger.nextRunAt))}\uFF08${formatRelative(new Date(nextTrigger.nextRunAt), now)}\uFF09${formatJitter(nextTrigger.jitterMs) === null ? "" : ` \xB7 ${String(formatJitter(nextTrigger.jitterMs))}`} \xB7 \u65B9\u6848\u300C${nextTrigger.planName}\u300D`,
		      sched?.paused === true ? /* @__PURE__ */ (0, import_jsx_runtime86.jsx)(InlineMd, { text: " \xB7 **\u5B9A\u65F6\u5DF2\u6682\u505C**\uFF08\u624B\u52A8\u4ECD\u7136\u53EF\u7528\uFF09" }) : null
		    ] }),
		    sched?.refreshSuggested === true && sched.refreshHint !== null && /* @__PURE__ */ (0, import_jsx_runtime86.jsx)("p", { className: "jh-warn", children: sched.refreshHint }),
		    sched?.readOnly === true && /* @__PURE__ */ (0, import_jsx_runtime86.jsxs)("p", { className: "jh-error", children: [
		      "\u672C\u5B9E\u4F8B\u53EA\u8BFB\uFF1A",
		      sched.readOnlyReason ?? "\u53E6\u4E00\u4E2A\u5B9E\u4F8B\u6B63\u5728\u8FD0\u884C"
		    ] }),
		    feedback.message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime86.jsx)("p", { className: feedback.tone === "error" ? "jh-error" : "jh-muted", children: feedback.message })
		  ] });
		}

		// src/shared/contract/enums/today.ts
		var TODO_LEVEL_LABEL = {
		  info: "\u63D0\u793A",
		  warn: "\u63D0\u9192",
		  urgent: "\u7D27\u6025"
		};
		var TODO_KIND_LABEL = {
		  "adapter-degraded": "\u9002\u914D\u5668\u964D\u7EA7",
		  "adapter-broken": "\u9002\u914D\u5668\u5931\u6548",
		  "yield-drop": "\u91CF\u7EA7\u9AA4\u964D",
		  "login-required": "\u9700\u8981\u767B\u5F55",
		  blocked: "\u98CE\u63A7\u6682\u505C",
		  "new-jobs": "\u65B0\u5C97\u4F4D",
		  "catch-up": "\u8865\u6293\u6B20\u8D26",
		  "confirm-action": "\u5F85\u786E\u8BA4\u52A8\u4F5C",
		  deadline: "\u786C\u622A\u6B62"
		};

		// src/client/format/today.ts
		function planIdOf(todo) {
		  if (todo.detail === null || typeof todo.detail !== "object") return null;
		  const value = todo.detail.planId;
		  return typeof value === "number" ? value : null;
		}
		function confirmTargetJobIdOf(todo) {
		  if (todo.detail === null || typeof todo.detail !== "object") return null;
		  const target = todo.detail.target;
		  if (target === null || target === void 0 || typeof target !== "object") return null;
		  const value = target.jobId;
		  return typeof value === "number" ? value : null;
		}
		function todoLevelLabel(level) {
		  return TODO_LEVEL_LABEL[level] ?? level;
		}
		function todoKindLabel(kind) {
		  return TODO_KIND_LABEL[kind] ?? kind;
		}

		// src/client/screens/today/todo-list.tsx
		var import_jsx_runtime87 = require("react/jsx-runtime");
		function TodoList(props) {
		  const todos = props.todos;
		  return /* @__PURE__ */ (0, import_jsx_runtime87.jsxs)("section", { className: "jh-card", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime87.jsx)("h2", { className: "jh-card-title", children: "\u5F85\u529E" }),
		    todos.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime87.jsx)("p", { className: "jh-muted", children: "\u6CA1\u6709\u5F85\u529E\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime87.jsx)("ul", { className: "jh-todos", children: todos.map((todo) => {
		      const planId = planIdOf(todo);
		      const confirmJobId = confirmTargetJobIdOf(todo);
		      return /* @__PURE__ */ (0, import_jsx_runtime87.jsxs)("li", { className: `jh-todo jh-todo-${todo.level}`, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime87.jsx)("span", { className: "jh-todo-level", children: todoLevelLabel(todo.level) }),
		        /* @__PURE__ */ (0, import_jsx_runtime87.jsxs)("div", { className: "jh-todo-body", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime87.jsx)("div", { className: "jh-todo-title", children: todo.title }),
		          /* @__PURE__ */ (0, import_jsx_runtime87.jsxs)("div", { className: "jh-muted", children: [
		            todoKindLabel(todo.kind),
		            todo.ref === null ? "" : ` \xB7 ${todo.ref}`
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime87.jsxs)("div", { className: "jh-todo-actions", children: [
		            todo.kind === "catch-up" && planId !== null && /* @__PURE__ */ (0, import_jsx_runtime87.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: props.running,
		                onClick: () => void props.onCatchUp(planId),
		                children: "\u7ACB\u5373\u8865\u8DD1"
		              }
		            ),
		            todo.kind === "login-required" && todo.ref !== null && /* @__PURE__ */ (0, import_jsx_runtime87.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: props.running || props.readOnly,
		                onClick: () => void props.onLogin(todo.ref),
		                children: "\u53BB\u767B\u5F55"
		              }
		            ),
		            todo.kind === "confirm-action" && confirmJobId !== null && /* @__PURE__ */ (0, import_jsx_runtime87.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: props.running,
		                onClick: () => void props.onResumeConfirm(todo.id, confirmJobId),
		                children: "\u53BB\u5904\u7406"
		              }
		            ),
		            todo.kind === "blocked" && /* @__PURE__ */ (0, import_jsx_runtime87.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: props.onGoCollect, children: "\u53BB\u786E\u8BA4\u6062\u590D" }),
		            /* @__PURE__ */ (0, import_jsx_runtime87.jsx)(
		              "button",
		              {
		                type: "button",
		                className: "jh-btn jh-btn-inline",
		                disabled: props.running,
		                onClick: () => void props.onIgnore(todo.id),
		                children: "\u5FFD\u7565"
		              }
		            )
		          ] })
		        ] })
		      ] }, todo.id);
		    }) })
		  ] });
		}

		// src/client/screens/today/index.tsx
		var import_jsx_runtime88 = require("react/jsx-runtime");
		function TodayScreen(props) {
		  const today = useAsync((signal) => fetchToday(signal), [props.revision]);
		  const scheduler = useAsync((signal) => fetchSchedulerStatus(signal), [props.revision]);
		  const platforms = useAsync((signal) => fetchPlatforms(signal), [props.revision]);
		  const usage = useAsync((signal) => fetchGuardUsage(void 0, signal), [props.revision]);
		  const [feedback, setFeedback] = (0, import_react37.useState)(IDLE);
		  const now = (0, import_react37.useMemo)(() => /* @__PURE__ */ new Date(), [props.revision]);
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
		    usage.reload();
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
		    const summary = nextTrigger === null ? await runDefaultPlan() : { ...await runPlan(nextTrigger.planId), planName: nextTrigger.planName };
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
		  const resumeConfirm = async (todoId, jobId) => {
		    setFeedback({ running: true, tone: "ok", message: "\u6B63\u5728\u6253\u5F00\u8FD9\u6761\u52A8\u4F5C\u7684\u76EE\u6807\u5C97\u4F4D\u2026" });
		    try {
		      await resumeConfirmAction(todoId);
		      setFeedback(IDLE);
		      props.onGoJob(jobId);
		    } catch (error) {
		      report(error);
		    }
		  };
		  const ignoreTodo = (todoId) => act("\u5DF2\u5FFD\u7565", async () => {
		    await closeTodo(todoId);
		    return "\u5DF2\u5FFD\u7565\u8FD9\u6761\u5F85\u529E";
		  });
		  const data = useSticky(today.state);
		  const sched = useSticky(scheduler.state);
		  const platformItems = useSticky(platforms.state)?.items ?? [];
		  const usageData = useSticky(usage.state);
		  const usageRows = (usageData?.platforms ?? []).flatMap(
		    (platform) => platform.actions.filter((entry) => entry.used > 0 || entry.remaining === 0).map((entry) => ({ ...entry, displayName: platform.displayName }))
		  );
		  const unhealthy = platformItems.filter(
		    (item) => item.health !== "healthy" || // 「没检测过」不是「未登录」（与「采集」页同一条口径）：全新安装时
		    // `account_state` 是空的，把空当未登录会让首屏对每个平台都报一次假警报，
		    // 而调度侧恰恰把这种账号当"可以跑"（见 platformGate 的注释）。
		    !item.account.loggedIn && item.account.lastCheckAt !== null
		  );
		  const measured = sched === null ? [] : sched.planStatus.filter((item) => item.enabled);
		  const worst = measured.length === 0 ? null : measured.reduce(
		    (acc, item) => (item.freshness.hoursSinceSuccess ?? Number.POSITIVE_INFINITY) > (acc.freshness.hoursSinceSuccess ?? Number.POSITIVE_INFINITY) ? item : acc
		  );
		  const nextTrigger = sched === null || sched.triggers.length === 0 ? null : [...sched.triggers].sort(
		    (left, right) => left.nextRunAt < right.nextRunAt ? -1 : left.nextRunAt > right.nextRunAt ? 1 : 0
		  )[0] ?? null;
		  return /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("div", { className: "jh-screen", children: [
		    today.state.status === "loading" && data === null && /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("p", { className: "jh-muted", children: "\u6B63\u5728\u8BFB\u53D6\u4ECA\u65E5\u6982\u51B5\u2026" }),
		    today.state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("h2", { className: "jh-card-title", children: "\u8BFB\u4E0D\u5230\u4ECA\u65E5\u6982\u51B5" }),
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)(ErrorLine, { children: today.state.message }),
		      today.state.hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("p", { className: "jh-muted", children: today.state.hint }),
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("button", { type: "button", className: "jh-btn", onClick: today.reload, children: "\u91CD\u8BD5" })
		    ] }),
		    data !== null && !data.dataReady && /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("div", { className: "jh-card", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("h2", { className: "jh-card-title", children: "\u6570\u636E\u5C42\u672A\u5C31\u7EEA" }),
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("p", { className: "jh-error", children: data.dataError ?? "\u672A\u77E5\u539F\u56E0" }),
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("p", { className: "jh-muted", children: "\u63D2\u4EF6\u672C\u8EAB\u662F\u6302\u7740\u7684 \u2014\u2014 \u8FD9\u91CC\u5982\u5B9E\u62A5\u544A\u539F\u56E0\uFF0C\u800C\u4E0D\u662F\u8BA9\u754C\u9762\u9759\u9ED8\u53D8\u7A7A\u3002" })
		    ] }),
		    data !== null && data.offline && /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("div", { className: "jh-card jh-card-tight", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("h2", { className: "jh-card-title", children: "\u79BB\u7EBF\u6A21\u5F0F\u5DF2\u5F00\u542F" }),
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("p", { className: "jh-muted", children: [
		        "\u6293\u53D6\u4E0E\u767B\u5F55\u5F15\u5BFC\u5DF2\u88AB\u62D2\u7EDD \u2014\u2014 \u8FD9\u662F\u300C\u81EA\u52A8\u5316\u6D4B\u8BD5\u7EDD\u4E0D\u8BBF\u95EE\u771F\u5B9E\u62DB\u8058\u7AD9\u300D\u7684\u5F00\u5173\u5728\u8D77\u4F5C\u7528\u3002 \u53BB\u6389\u73AF\u5883\u53D8\u91CF ",
		        /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("code", { children: "DSH_JOB_HUNTER_NO_NETWORK" }),
		        " \u91CD\u542F\u5373\u53EF\u89E3\u9664\u3002"
		      ] })
		    ] }),
		    data !== null && data.dataReady && /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)(import_jsx_runtime88.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)(
		        NextRunCard,
		        {
		          sched,
		          worst,
		          nextTrigger,
		          now,
		          feedback,
		          onStartCrawl: startCrawl,
		          onGoCollect: props.onGoCollect
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("p", { className: "jh-muted jh-health-line", children: [
		        "\u5E73\u53F0\u5065\u5EB7\uFF1A",
		        platformItems.length === 0 ? "\u8FD8\u6CA1\u6709\u6CE8\u518C\u5E73\u53F0" : unhealthy.length === 0 ? "\u5168\u90E8\u6B63\u5E38" : unhealthy.map(
		          (item) => `${item.id} ${item.health !== "healthy" ? HEALTH_STATE_LABEL[item.health] : "\u672A\u767B\u5F55"}`
		        ).join(" \xB7 "),
		        " \xB7 ",
		        /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("button", { type: "button", className: "jh-link", onClick: props.onGoCollect, children: "\u770B\u7EC6\u8282" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("div", { className: "jh-stats", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("button", { type: "button", className: "jh-stat", onClick: props.onGoJobs, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("b", { children: data.newJobs24h }),
		          /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("span", { children: "24 \u5C0F\u65F6\u65B0\u589E" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("button", { type: "button", className: "jh-stat", onClick: props.onGoJobs, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("b", { children: data.jobCount }),
		          /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("span", { children: "\u5C97\u4F4D\u603B\u6570" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)(
		          "button",
		          {
		            type: "button",
		            className: `jh-stat${data.pendingRepair > 0 ? " jh-stat-warn" : ""}`,
		            title: "\u88AB\u5B57\u6BB5\u65AD\u8A00\u62E6\u4E0B\u7684\u8BB0\u5F55\uFF08\u6CA1\u8FDB\u4E3B\u8868\uFF09\u3002\u70B9\u8FDB\u53BB\u770B\u574F\u5728\u54EA\u4E2A\u5B57\u6BB5\u3001\u6837\u672C\u662F\u54EA\u4E2A\u5C97\u4F4D\uFF0C\u5E76\u4FEE\u9009\u62E9\u5668\u3002",
		            onClick: props.onGoCollect,
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("b", { children: data.pendingRepair }),
		              /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("span", { children: "\u5F85\u4FEE\u590D\u8BB0\u5F55" })
		            ]
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("div", { className: `jh-stat${data.todos.some((todo) => todo.level === "urgent") ? " jh-stat-error" : ""}`, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("b", { children: data.openTodoCount }),
		          /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("span", { children: "\u5F85\u529E" })
		        ] })
		      ] }),
		      usageRows.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("section", { className: "jh-card jh-card-tight", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("h2", { className: "jh-card-title", children: "\u4ECA\u65E5\u989D\u5EA6\u4F59\u91CF" }),
		        /* @__PURE__ */ (0, import_jsx_runtime88.jsx)("ul", { className: "jh-kv", children: usageRows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("li", { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("span", { children: [
		            row.displayName,
		            " \xB7 ",
		            row.bucket === "greeting" ? "\u6253\u62DB\u547C" : row.bucket === "application" ? "\u6295\u9012" : "\u56DE\u590D"
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime88.jsxs)("span", { children: [
		            "\u5DF2\u7528 ",
		            row.used,
		            "/",
		            row.limit,
		            row.remaining > 0 ? `\uFF08\u5269 ${row.remaining}\uFF09` : "\uFF08\u5DF2\u7528\u6EE1\uFF09",
		            row.limitedBy === "platform" ? " \xB7 \u4E0A\u9650\u6765\u81EA\u5E73\u53F0\u4FA7" : ""
		          ] })
		        ] }, `${row.displayName}-${row.action}`)) })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime88.jsx)(
		        TodoList,
		        {
		          todos: data.todos,
		          running: feedback.running,
		          readOnly: sched?.readOnly ?? false,
		          onCatchUp: catchUp,
		          onLogin: login,
		          onResumeConfirm: resumeConfirm,
		          onGoCollect: props.onGoCollect,
		          onIgnore: ignoreTodo
		        }
		      )
		    ] })
		  ] });
		}

		// src/client/hooks/use-event-stream.ts
		var import_react38 = require("react");
		function useEventStream(onHint) {
		  const [status, setStatus] = (0, import_react38.useState)("connecting");
		  const [lastEventAt, setLastEventAt] = (0, import_react38.useState)(null);
		  const hintRef = (0, import_react38.useRef)(onHint);
		  hintRef.current = onHint;
		  (0, import_react38.useEffect)(() => {
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

		// src/client/app/panel.tsx
		var import_jsx_runtime89 = require("react/jsx-runtime");
		function ScreenBody(props) {
		  return /* @__PURE__ */ (0, import_jsx_runtime89.jsx)("div", { className: "jh-body", role: "main", children: /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(ScreenErrorBoundary, { name: tabLabelOf(props.screen), children: props.children }, props.screen) });
		}
		function JobHunterPanel() {
		  const [screen, setScreen] = (0, import_react39.useState)("today");
		  const [selected, setSelected] = (0, import_react39.useState)(null);
		  const [revision, setRevision] = (0, import_react39.useState)(0);
		  const timer = (0, import_react39.useRef)(null);
		  (0, import_react39.useEffect)(
		    () => () => {
		      if (timer.current !== null) window.clearTimeout(timer.current);
		    },
		    []
		  );
		  const onHint = (0, import_react39.useCallback)((type) => {
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
		  (0, import_react39.useEffect)(() => {
		    const apply2 = (intent) => {
		      setScreen("jobs");
		      setSelected(intent.jobId);
		    };
		    const first = consumePanelIntent();
		    if (first !== null) apply2(first);
		    return subscribePanelIntent(apply2);
		  }, []);
		  return /* @__PURE__ */ (0, import_jsx_runtime89.jsxs)("div", { className: "jh-root", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime89.jsxs)("header", { className: "jh-topbar", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime89.jsx)("h1", { className: "jh-title", children: "\u6C42\u804C\u627E\u5DE5\u4F5C" }),
		      /* @__PURE__ */ (0, import_jsx_runtime89.jsx)("span", { className: "jh-badge", children: PHASE }),
		      /* @__PURE__ */ (0, import_jsx_runtime89.jsx)("nav", { className: "jh-tabs", "aria-label": "\u6C42\u804C\u627E\u5DE5\u4F5C\u5206\u533A", children: TABS.map((tab) => /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(
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
		      /* @__PURE__ */ (0, import_jsx_runtime89.jsx)("span", { className: "jh-spacer" }),
		      /* @__PURE__ */ (0, import_jsx_runtime89.jsxs)("span", { className: `jh-live jh-live-${stream.status}`, title: PLUGIN_ID, role: "status", children: [
		        /* @__PURE__ */ (0, import_jsx_runtime89.jsx)("i", { className: "jh-dot", "aria-hidden": "true" }),
		        STREAM_LABEL[stream.status] ?? stream.status
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime89.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: backToConversation, children: "\u8FD4\u56DE\u5BF9\u8BDD\u533A" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(ScreenBody, { screen, children: screen === "today" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(
		      TodayScreen,
		      {
		        revision,
		        onGoJobs: () => setScreen("jobs"),
		        onGoJob: (jobId) => {
		          setSelected(jobId);
		          setScreen("jobs");
		        },
		        onGoCollect: () => setScreen("collect")
		      }
		    ) : screen === "collect" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(CollectScreen, { revision, onGoSettings: () => setScreen("settings") }) : screen === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(SettingsScreen, { revision }) : screen === "pipeline" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(
		      PipelineScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "inbox" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(
		      InboxScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "interviews" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(
		      InterviewsScreen,
		      {
		        revision,
		        onChanged: () => setRevision((value) => value + 1),
		        onSelectJob: setSelected
		      }
		    ) : screen === "campus" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(CampusScreen, { revision, onChanged: () => setRevision((value) => value + 1) }) : screen === "board" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(
		      BoardScreen,
		      {
		        revision,
		        onDrillDown: () => {
		          setSelected(null);
		          setScreen("pipeline");
		        }
		      }
		    ) : screen === "resumes" ? /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(ResumesScreen, { revision, onChanged: () => setRevision((value) => value + 1) }) : /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(
		      JobsScreen,
		      {
		        revision,
		        selected,
		        onSelect: setSelected,
		        onChanged: () => setRevision((value) => value + 1)
		      }
		    ) }),
		    screen === "jobs" || selected === null ? null : /* @__PURE__ */ (0, import_jsx_runtime89.jsx)(
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

		// src/client/styles/screens/campus.ts
		var CAMPUS = `
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
		`;

		// src/client/styles/screens/collect.ts
		var COLLECT_BUTTONS = `
		/* \u2500\u2500 \u7B2C\u4E09\u8F6E\u4FEE\u590D\uFF1A12px \u2192 12.5px\u3002\u91C7\u96C6\u9875/\u65B9\u6848\u5361\u91CC\u7684\u300C\u91CD\u65B0\u68C0\u6D4B\u300D\u300C\u7F16\u8F91\u300D\u300C\u5220\u9664\u300D
		   \u90FD\u662F\u8FD9\u4E00\u6863\uFF0C\u800C\u5361\u7247\u6807\u9898\u540C\u65F6\u4ECE 13px \u63D0\u5230 14px \u2014\u2014 \u4E24\u8005\u672C\u6765\u53EA\u5DEE 1px\uFF0C
		   \u4E00\u63D0\u5C31\u53D8\u6210 2px\uFF0C\u6309\u94AE\u7684\u6807\u7B7E\u53CD\u800C\u6BD4\u5B83\u6240\u5C5E\u6A21\u5757\u7684\u6B63\u6587\u8FD8\u5C0F\u300212.5px \u6536\u7A84\u8FD9\u4E2A\u843D\u5DEE\u3002 */
		.jh-btn-tiny{padding:3px 8px;font-size:12.5px;border-radius:6px;margin-left:6px}
		`;
		var PLANS = `
		.jh-plan-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		.jh-plan-item{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
		  background:var(--dsw-alias-bg-layer-1);font-size:12.5px}
		.jh-plan-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 4px}

		.jh-card-editing{border-color:var(--dsw-alias-brand-primary)}
		.jh-card-error{border-color:var(--dsw-alias-state-error-secondary)}
		.jh-fieldset{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px 12px;margin:0 0 12px}
		.jh-fieldset legend{font-size:12px;font-weight:600;padding:0 4px;color:var(--dsw-alias-label-secondary)}
		.jh-check{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer}
		.jh-check input{cursor:pointer}
		`;
		var COLLECT_USABILITY = `
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
		/* \u6B63\u5E38\u6001\uFF08\u672C\u7A97\u53E3\u8D1F\u8D23\u91C7\u96C6\uFF09**\u4E0D\u7ED9\u6846\u4E5F\u4E0D\u7ED9\u5E95**\u3002
		   \u5B83\u672C\u6765\u5C31\u957F\u5728\u300C\u8FD0\u884C\u72B6\u6001\u300D\u90A3\u5F20 .jh-card \u91CC\u9762\uFF0C\u518D\u5957\u4E00\u5C42\u8FB9\u6846+\u586B\u5145\u5C31\u662F
		   "\u5361\u7247\u5957\u5361\u7247" \u2014\u2014 \u672C\u9875\u6700\u591A\u7684\u5730\u65B9\u53E0\u4E86\u4E09\u5C42\uFF08.jh-card \u2192 .jh-lease \u2192 \u5185\u5C42\u8BF4\u660E\uFF09\u3002
		   \u53EA\u6709\u5F02\u5E38\u6001\uFF08\u672C\u7A97\u53E3\u53EA\u8BFB\uFF09\u624D\u7528\u8FB9\u6846\u628A\u5B83\u62AC\u51FA\u6765\uFF0C\u56E0\u4E3A\u90A3\u65F6\u5B83\u624D\u771F\u7684\u9700\u8981\u88AB\u770B\u89C1\u3002 */
		.jh-lease-ok{border-color:transparent;background:transparent}
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

		/* \u72B6\u6001\u5706\u70B9\uFF1A\u72B6\u6001\u7531\u5B83\u65C1\u8FB9\u7684\u6587\u5B57\u8BF4\u6E05\uFF0C\u5706\u70B9\u53EA\u662F**\u8F85\u52A9**\uFF08\u4E0D\u8BA9\u989C\u8272\u5355\u72EC\u627F\u8F7D\u4FE1\u606F\uFF09\u3002
		   \u989C\u8272\u7528 --jh-*-fg\uFF08\u6DF1\u8272\u6DF7\u8272\u53D8\u4F53\uFF09\u800C**\u4E0D\u662F** state-*-primary\uFF1A
		   \u540E\u8005\u5F53\u5E95\u8272\u65F6\u4E0E\u9875\u9762/\u5361\u7247\u80CC\u666F\u7684\u5BF9\u6BD4\u5EA6\u53EA\u6709 2.0\u20132.2:1\uFF0C\u800C WCAG 1.4.11 \u5BF9
		   "\u627F\u8F7D\u610F\u4E49\u7684\u975E\u6587\u672C\u56FE\u5F62"\u8981\u6C42 3:1 \u2014\u2014 \u5C0F\u5706\u70B9\u5C24\u5176\u5BB9\u6613\u5728\u8FD9\u79CD\u68C0\u67E5\u4E0A\u88AB\u5FFD\u89C6\u3002
		   \u6DF7\u8272\u53D8\u4F53\u5B9E\u6D4B\uFF1A\u6210\u529F 5.3:1 / \u8B66\u544A 5.9:1 / \u5371\u9669 9.8:1\uFF08\u6D45\u8272\u4E3B\u9898\uFF09\u3002
		   \u2500\u2500 \u7B2C\u516D\u8F6E\uFF1A\u5B83\u539F\u6765\u670D\u52A1\u7684\u662F\u300C\u5E73\u53F0\u660E\u7EC6\u300D\u90A3\u6761 .jh-status-list\uFF08\u5DF2\u968F\u8BE5\u5217\u8868\u4E00\u8D77\u5220\u9664\uFF1A
		   \u5E73\u53F0\u72B6\u6001\u73B0\u5728\u7528\u6807\u51C6\u5FBD\u6807\u8868\u8FBE\uFF09\u3002\u5217\u8868\u6CA1\u4E86\uFF0C\u5706\u70B9\u7559\u4E0B \u2014\u2014 \u91C7\u96C6\u9875\u9876\u90E8\u5DE5\u5177\u6761\u7684
		   \u8C03\u5EA6\u72B6\u6001\u6307\u793A\u5668\u5728\u7528\uFF08\u5706\u70B9 + "\u5B9A\u65F6\u8FD0\u884C\u4E2D/\u5DF2\u6682\u505C"\uFF09\u3002 */
		.jh-status-dot{flex:none;width:8px;height:8px;border-radius:50%;
		  background:var(--dsw-alias-label-tertiary)}
		.jh-status-dot-on{background:var(--jh-ok-fg)}
		.jh-status-dot-warn{background:var(--jh-warn-fg)}
		.jh-status-dot-bad{background:var(--jh-error-fg)}
		`;
		var PLAN_EDITOR_MODAL = `
		/* \u2500\u2500 \u91C7\u96C6\u65B9\u6848\u5F39\u7A97\uFF08\u7B2C\u516D\u8F6E\uFF1A\u5206\u6B65 + \u8868\u683C\u5316\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u8FD9\u4E00\u6574\u5757\u53EA\u670D\u52A1\u300C\u65B0\u589E/\u7F16\u8F91\u91C7\u96C6\u65B9\u6848\u300D\u5F39\u7A97\uFF0C\u653E\u4E00\u8D77\u662F\u4E3A\u4E86\u4E0B\u6B21\u6539\u5B83\u4E0D\u7528\u5728
		   1000 \u884C CSS \u91CC\u7FFB\u3002\u9488\u5BF9\u8BC4\u5BA1\u7684\u4E09\u6761\u7ED3\u6784\u6539\u52A8\uFF1A
		     \u2460 .jh-steps      \u2014\u2014 \u5206\u6B65\u6761\uFF0C\u53D6\u4EE3"\u4E00\u4E2A\u5F39\u7A97\u65E0\u9650\u5F80\u4E0B\u6EDA"\uFF1B
		     \u2461 .jh-table-plan \u2014\u2014 \u5E73\u53F0\u8868\uFF0C\u53D6\u4EE3"\u4E0A\u9762\u52FE\u4E00\u904D\u5E73\u53F0\u3001\u4E0B\u9762\u518D\u9010\u5E73\u53F0\u586B\u4E00\u904D\u9875\u6570"\uFF1B
		     \u2462 .jh-affix      \u2014\u2014 \u540E\u7F00\u6309\u94AE\uFF0C\u53D6\u4EE3"\u8F93\u5165\u6846\u65C1\u8FB9\u6F02\u7740\u4E00\u4E2A\u6309\u94AE"\u3002
		   \u6298\u53E0\u5F00\u5173\uFF08.jh-plan-toggle / .jh-plan-panel\uFF09\u6CBF\u5C97\u4F4D\u5E93\u90A3\u4E00\u5957\u5199\u6CD5\uFF0C
		   \u4F46**\u53E6\u8D77\u7C7B\u540D**\uFF1A\u901A\u7528\u540D\u5728\u8FD9\u4E2A\u4ED3\u5E93\u91CC\u5DF2\u7ECF\u649E\u8FC7\u4E00\u6B21\uFF08\u89C1 .jh-jobs-filters \u90A3\u6BB5\u6CE8\u91CA\uFF09\u3002
		   \u26A0\uFE0F \u6CE8\u91CA\u91CC\u4E00\u5F8B\u4E0D\u5199\u53CD\u5F15\u53F7 \u2014\u2014 \u8FD9\u6BB5 CSS \u662F\u6A21\u677F\u5B57\u7B26\u4E32\uFF0C\u53CD\u5F15\u53F7\u4F1A\u628A\u5B57\u7B26\u4E32\u622A\u65AD
		   \uFF08OPTIMIZATION-PLAN.md \xA71.3 \u7B2C 2 \u6761\uFF0C\u672C\u9879\u76EE\u5DF2\u4E3A\u6B64\u8E29\u8FC7\u4E09\u6B21\uFF09\u3002*/
		.jh-steps{display:flex;align-items:center;gap:2px;flex-wrap:wrap;margin:0 0 12px}
		.jh-step{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;
		  padding:4px 10px;border-radius:999px;cursor:pointer;border:1px solid transparent;
		  background:transparent;color:var(--dsw-alias-label-secondary)}
		.jh-step:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
		.jh-step:disabled{cursor:default;opacity:.5}
		.jh-step-no{display:inline-flex;align-items:center;justify-content:center;flex:none;
		  width:16px;height:16px;border-radius:50%;font-size:10.5px;font-weight:700;
		  background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
		.jh-step-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);
		  font-weight:600}
		.jh-step-on .jh-step-no{background:var(--dsw-alias-brand-primary);
		  color:var(--dsw-alias-label-primary-foreground)}
		.jh-step-sep{color:var(--dsw-alias-border-l4);font-size:11px;flex:none}
		/* \u6BCF\u6B65\u81F3\u5C11\u5360\u8FD9\u4E48\u9AD8\uFF1A\u5426\u5219\u4ECE"\u5B57\u6BB5\u591A"\u7684\u7B2C 1 \u6B65\u5207\u5230"\u5B57\u6BB5\u5C11"\u7684\u7B2C 3 \u6B65\u65F6\uFF0C
		   \u5F39\u7A97\u4F1A\u7A81\u7136\u7F29\u4E00\u622A\uFF0C\u5E95\u680F\u8DDF\u7740\u8DF3 \u2014\u2014 \u800C\u5E95\u680F\u521A\u521A\u624D\u88AB\u8981\u6C42\u5438\u5E95\u3002 */
		.jh-step-body{min-height:150px}

		/* \u6298\u53E0\u5F00\u5173\uFF1A\u4E0E\u5C97\u4F4D\u5E93\u300C\u9AD8\u7EA7\u7B5B\u9009\u300D\u540C\u4E00\u5957\u8BED\u6CD5\uFF08\u4E00\u884C\u5C0F\u5B57 + \u524D\u7F6E\u6307\u793A\u7B26\uFF09 */
		.jh-plan-toggle{display:flex;align-items:center;gap:6px;align-self:flex-start;
		  padding:2px 0;border:0;background:transparent;cursor:pointer;text-align:left;font:inherit}
		.jh-plan-caret{color:var(--jh-muted-fg);font-size:10px;line-height:1;flex:0 0 auto}
		.jh-plan-toggle-text{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
		.jh-plan-toggle:hover .jh-plan-toggle-text{color:var(--dsw-alias-label-primary)}
		.jh-plan-panel{display:flex;flex-direction:column;gap:8px;margin-top:6px}
		/* \u26A0\uFE0F \u5FC5\u987B\u663E\u5F0F\u5199\uFF1A.jh-plan-panel \u7684 display:flex \u4F1A\u76D6\u6389 UA \u6837\u5F0F\u8868\u91CC\u7684 [hidden]\uFF0C
		   \u5C11\u4E86\u8FD9\u6761\uFF0C\u6298\u53E0\u533A\u6839\u672C\u6536\u4E0D\u8D77\u6765\uFF08.jh-jobs-filter-panel \u4E3A\u540C\u4E00\u4E2A\u539F\u56E0\u5199\u8FC7\u4E00\u904D\uFF09\u3002 */
		.jh-plan-panel[hidden]{display:none}

		/* \u540E\u7F00\u6309\u94AE\uFF1A\u4E0E\u8F93\u5165\u6846\u62FC\u6210**\u4E00\u4E2A**\u63A7\u4EF6\uFF08\u8BC4\u5BA1\uFF1A"\u6309\u94AE\u4E0E\u8F93\u5165\u6846\u5BF9\u9F50\u8131\u8282"\uFF09\u3002
		   \u8F93\u5165\u6846\u7559\u4E0B\u53F3\u8FB9\u6846\u5F53\u5206\u9694\u7EBF\uFF0C\u6309\u94AE\u53BB\u6389\u5DE6\u8FB9\u6846\u4E0E\u5DE6\u5706\u89D2\u3002 */
		.jh-affix{display:flex;align-items:stretch;width:100%}
		.jh-affix>.jh-input{flex:1 1 auto;min-width:0;border-top-right-radius:0;
		  border-bottom-right-radius:0}
		.jh-affix-btn{flex:none;margin:0;border-left:0;white-space:nowrap;
		  border-top-left-radius:0;border-bottom-left-radius:0}

		/* \u5E73\u53F0\u8868\uFF1A\u52FE\u9009 / \u5E73\u53F0 / \u72B6\u6001 / \u9875\u6570\u4E0A\u9650 / \u9650\u5236\u3002
		   \u5217\u5BBD\u7B56\u7565\u6284 .jh-table-matrix\uFF1A\u975E\u672B\u5217\u6536\u7F29\u5230\u5185\u5BB9\u5BBD\uFF0C"\u9650\u5236"\u5217\u5403\u6389\u5269\u4F59 \u2014\u2014
		   \u5426\u5219"\u9875\u6570\u4E0A\u9650"\u4F1A\u88AB\u62C9\u6210\u4E00\u5927\u7247\u7A7A\u767D\uFF0C\u800C\u771F\u6B63\u8981\u770B\u7684\u90A3\u6BB5\u8BF4\u660E\u88AB\u6324\u7A84\u3002 */
		.jh-table-plan{min-width:560px}
		.jh-table-plan th:not(:last-child),.jh-table-plan td:not(:last-child){width:1%;white-space:nowrap}
		.jh-table-plan td.jh-col-check,.jh-table-plan th.jh-col-check{text-align:center;padding-right:0}
		/* \u8868\u683C\u91CC\u7684\u6570\u5B57\u6846\u4E0D\u80FD\u7528 .jh-input \u7684 width:100%\uFF08\u4F1A\u628A"\u9650\u5236"\u5217\u9876\u6CA1\uFF09 */
		.jh-pages-input{width:72px;padding:4px 6px;text-align:right;
		  font-variant-numeric:tabular-nums}
		/* \u8868\u683C\u5DE5\u5177\u6761\uFF1A\u5168\u9009 / \u8BA1\u6570\u5728\u5DE6\uFF0C\u6279\u91CF\u8BBE\u7F6E\u5728\u53F3 \u2014\u2014 \u4E0E\u300C\u5DF2\u52FE\u9009\u7684\u884C\u300D\u5728\u89C6\u89C9\u4E0A\u8D34\u5728\u4E00\u8D77 */
		.jh-batch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 6px}
		.jh-batch .jh-input{width:72px;padding:4px 6px;text-align:right;
		  font-variant-numeric:tabular-nums}

		/* \u8C03\u5EA6\uFF1A\u65F6\u6BB5\u4E0E\u8FD0\u884C\u65E5**\u540C\u4E00\u884C**\uFF08\u8BC4\u5BA1\uFF1A"\u4FDD\u6301\u4E0E\u65F6\u95F4\u6BB5\u9009\u62E9\u5668\u540C\u4E00\u884C\u5BF9\u9F50"\uFF09\u3002
		   flex-wrap \u4FDD\u8BC1\u7A84\u5C4F/\u5F39\u51FA\u5F0F\u952E\u76D8\u4E0B\u9010\u9879\u6362\u884C\uFF0C\u800C\u4E0D\u662F\u628A\u67D0\u4E2A\u63A7\u4EF6\u538B\u6241\u3002 */
		.jh-schedule-row{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
		.jh-schedule-row .jh-field{margin:0}
		.jh-schedule-row .jh-timerange{margin:0}

		/* \u5361\u7247\u5185\u7684\u8B66\u544A Banner\uFF08\u628A"\u8FDE\u7EED\u5931\u8D25 N \u6B21"\u8FD9\u7C7B\u6838\u5FC3\u98CE\u9669\u62AC\u51FA\u6765\uFF09\u3002
		   \u2500\u2500 \u7528**\u5DE6\u4FA7\u8272\u6761**\u800C\u4E0D\u662F\u586B\u5145\u5E95\u8272\uFF1A\u5B83\u957F\u5728 .jh-plan-card \u91CC\u9762\uFF0C\u800C\u90A3\u5F20\u5361\u81EA\u5DF1
		   \u5DF2\u7ECF\u6709\u8FB9\u6846\u548C\u80CC\u666F\uFF0C\u518D\u53E0\u4E00\u5757\u5B9E\u5FC3\u8272\u5C31\u662F"\u5361\u7247\u5957\u5361\u7247\u5957\u8272\u5757"\uFF08\u4E09\u5C42\u8FB9\u754C\uFF0C
		   \u6BCF\u5C42\u7684\u89C6\u89C9\u843D\u70B9\u90FD\u88AB\u91CD\u7F6E\u4E00\u6B21\uFF09\u3002
		   \u5DE6\u8FB9\u6846\u53D6 currentColor\uFF0C\u989C\u8272\u4ECD\u7136\u53EA\u7531\u4E0B\u9762\u4E24\u6761\u7684 color \u51B3\u5B9A \u2014\u2014 \u52A0\u4E00\u4E2A\u8272\u8C03
		   \u4E0D\u5FC5\u540C\u65F6\u6539\u4E24\u5904\uFF0C\u4E5F\u4E0D\u4F1A\u51FA\u73B0"\u5E95\u8272\u662F\u9EC4\u3001\u6587\u5B57\u662F\u7EA2"\u7684\u4E0D\u4E00\u81F4\u3002 */
		.jh-banner{display:flex;flex-direction:column;gap:2px;margin-top:8px;
		  padding:2px 0 2px 10px;border-left:3px solid currentColor;
		  font-size:12.5px;line-height:1.6}
		.jh-banner-title{font-weight:600}
		.jh-banner-warn{color:var(--jh-warn-fg)}
		.jh-banner-error{color:var(--jh-error-fg)}

		/* \u65B9\u6848\u5361\u7247\uFF1A\u660E\u786E\u8FB9\u6846\uFF0C\u4E0E\u5361\u7247\u80CC\u666F\u62C9\u5F00\u5C42\u6B21\u3002
		   \u2500\u2500 \u53BB\u6389\u4E86\u539F\u6765\u90A3\u5C42 box-shadow:0 1px 3px rgba(0,0,0,.07)\uFF1A\u5B83\u538B\u5728
		   .jh-card \u7684\u80CC\u666F\u4E0A\uFF0C\u6D45\u8272\u4E3B\u9898\u91CC\u51E0\u4E4E\u770B\u4E0D\u51FA\uFF0C\u6DF1\u8272\u4E3B\u9898\u91CC\u5B8C\u5168\u6D88\u5931\uFF0C
		   \u800C\u5B83\u5E26\u6765\u7684"\u8FD9\u662F\u5361\u7247\u91CC\u7684\u5361\u7247"\u90A3\u5C42\u6697\u793A\u5374\u662F\u5B9E\u5B9E\u5728\u5728\u7684 \u2014\u2014 \u7559\u8FB9\u6846\u5C31\u591F\u3002 */
		.jh-plan-card{padding:11px 13px;border-radius:10px;border:1px solid var(--dsw-alias-border-l3);
		  background:var(--dsw-alias-bg-layer-1);font-size:12.5px}
		.jh-plan-name{font-size:13.5px}

		/* \u6309\u94AE\u6743\u91CD\uFF1A\u5371\u9669 / \u8B66\u793A\u3002\u4E3B\u64CD\u4F5C\u590D\u7528\u5DF2\u6709\u7684 .jh-btn-primary\u3002
		   \u989C\u8272\u4E00\u5F8B\u8D70\u4E3B\u9898\u53D8\u91CF\uFF08\xA75.3\uFF09\uFF0C\u4E0D\u5199\u6B7B red\u3002 */
		/* \u5371\u9669\u64CD\u4F5C\uFF1A**\u5B9E\u5E95**\u3002
		   \u6CE8\u610F\u5E95\u8272\u7528\u7684\u662F --jh-error-fg\uFF08\u8BED\u4E49\u8272\u4E0E label-primary \u6DF7\u51FA\u7684\u6DF1\u8272\u53D8\u4F53\uFF09\uFF0C\u4E0D\u662F\u4E3B\u9898\u7684
		   state-error-primary \u2014\u2014 \u5B9E\u6D4B\u540E\u8005\u914D\u767D\u5B57\u6070\u597D **4.4996:1**\uFF0C\u6BD4 AA \u7684 4.5 \u5DEE\u4E00\u70B9\u70B9\uFF0C
		   \u5C5E\u4E8E"\u770B\u7740\u6CA1\u95EE\u9898\u3001\u91CF\u4E86\u5C31\u662F\u4E0D\u8FBE\u6807"\u3002\u6362\u6210\u6DF7\u8272\u540E\u662F 9.79:1\uFF0C\u89C6\u89C9\u4E0A\u4ECD\u662F\u660E\u786E\u7684\u7EA2\u3002 */
		`;
		var RUNS_TABLE = `
		/* \u5C0F\u5C4F\u7B56\u7565\uFF1A**\u6709\u610F\u7684\u6A2A\u5411\u6EDA\u52A8**\uFF08quality-gates \xA75 \u5141\u8BB8\uFF0C\u6761\u4EF6\u662F\u4FDD\u7559\u884C\u8EAB\u4EFD\u4E0E\u4E3B\u64CD\u4F5C\uFF09\u3002
		   \u8868\u683C\u7ED9\u4E00\u4E2A min-width \u8BA9\u5217\u4E0D\u88AB\u538B\u6210\u4E00\u6761\uFF1B\u5BB9\u5668 overflow-x:auto \u627F\u62C5\u6EDA\u52A8\u3002 */
		.jh-table-scroll{overflow-x:auto;overscroll-behavior-x:contain}
		/* \u8FD0\u884C\u8868\u6BD4\u4EE5\u524D\u5BBD\u4E86\uFF08\u7B2C\u516D\u8F6E\u8865\u4E86 \u5E73\u53F0 / \u547D\u4E2D / \u9694\u79BB / \u8017\u65F6 \u56DB\u5217\uFF09\uFF1A
		   \u4E0B\u9650\u5B9A\u5728 720px\uFF0C\u7A84\u5C4F\u4E0B\u5B81\u53EF\u6A2A\u5411\u6EDA\u52A8\uFF0C\u4E5F\u522B\u628A\u5217\u538B\u5230\u8BFB\u4E0D\u51FA\u6765
		   \u2014\u2014 \u7B2C\u4E00\u5217\u7C98\u4F4F\uFF0C\u6EDA\u52A8\u65F6\u4ECD\u7136\u8BA4\u5F97\u51FA\u8FD9\u662F\u54EA\u4E00\u884C\u3002 */
		.jh-table-runs{min-width:720px}
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
		`;
		var PLATFORM_MATRIX = `
		/* \u2500\u2500 \u5E73\u53F0\u603B\u89C8\u77E9\u9635\uFF08\u6279\u6B21 5\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u4E0E\u300C\u6700\u8FD1\u8FD0\u884C\u300D\u540C\u4E00\u5957\u5217\u5BBD\u7B56\u7565\uFF1A\u975E\u6700\u540E\u4E00\u5217\u6536\u7F29\u5230\u5185\u5BB9\u5BBD\uFF0C\u6700\u540E\u4E00\u5217\u5403\u6389\u5269\u4F59\uFF1B
		   \u7B2C\u4E00\u5217\u7C98\u4F4F\uFF0C"\u6A2A\u5411\u6EDA\u52A8\u65F6\u4ECD\u8BA4\u5F97\u51FA\u8FD9\u662F\u54EA\u4E00\u884C"\u3002 */
		.jh-table-matrix{min-width:640px}
		.jh-table-matrix th:not(:last-child),.jh-table-matrix td:not(:last-child){width:1%;white-space:nowrap}
		.jh-table-matrix th.jh-col-sticky,.jh-table-matrix td.jh-col-sticky{
		  position:sticky;left:0;z-index:1;background:var(--dsw-alias-bg-layer-1)}
		/* "\u4ECA\u5929\u80FD\u8DD1"\u90A3\u4E00\u683C\uFF1A\u957F\u539F\u56E0\u622A\u65AD\u663E\u793A\uFF0C\u5168\u6587\u8FDB title\u3002
		   \u4E3A\u4EC0\u4E48\u4E0D\u505A\u4E00\u5957\u77ED\u6807\u7B7E \u2014\u2014 \u90A3\u4F1A\u662F**\u7B2C\u4E8C\u4EFD\u6587\u6848**\uFF0C\u8FDF\u65E9\u4E0E SKIP_REASON_LABEL \u6F02\u79FB\uFF0C
		   \u7528\u6237\u5C31\u5728\u77E9\u9635\u4E0E\u522B\u5904\u8BFB\u5230\u4E24\u79CD\u8BF4\u6CD5\u3002\u622A\u65AD + \u60AC\u505C\u662F\u540C\u4E00\u4EFD\u6587\u6848\u7684\u4E24\u79CD\u5448\u73B0\u3002 */
		.jh-clip{display:inline-block;max-width:18em;overflow:hidden;text-overflow:ellipsis;
		  white-space:nowrap;vertical-align:bottom}
		`;

		// src/client/styles/shell.ts
		var ENTRY_ICON = `
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
		`;
		var SHELL = `
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
		`;
		var OVERLAY = `
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
		`;

		// src/client/styles/views/freshness.ts
		var FRESHNESS = `
		/* \u2500\u2500 D-19\uFF1A\u65B0\u9C9C\u5EA6\u5FBD\u7AE0\u4E0E\u91C7\u96C6\u9875\uFF08U9\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		/* \u4E09\u7EA7\u5404\u81EA\u4E00\u4E2A\u8272\u9636\uFF0C\u4E14**\u6C38\u8FDC\u5E26\u6587\u5B57**\uFF1A\u53EA\u7ED9\u989C\u8272\u7528\u6237\u5206\u4E0D\u6E05"\u574F\u4E86"\u8FD8\u662F"\u65E7\u4E86"\u3002 */
		.jh-fresh{flex:0 0 auto;font-size:11.5px;font-weight:600;line-height:20px;padding:0 9px;
		  border-radius:999px;white-space:nowrap}
		.jh-fresh-fresh{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}
		.jh-fresh-stale{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
		.jh-fresh-cold{background:var(--jh-error-bg);color:var(--jh-error-fg)}
		`;

		// src/client/styles/screens/board.ts
		var FUNNEL = `
		/* \u2500\u2500 \u770B\u677F\u6F0F\u6597\uFF1A\u8FDE\u7EED\u68AF\u5F62\uFF08\u7B2C\u4E03\u8F6E\u91CD\u505A\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u6539\u524D\u5B83\u662F"\u4E00\u884C\u4E00\u6839 8px \u6A2A\u6761"\uFF0C\u5B9E\u6D4B\u8BFB\u8D77\u6765\u50CF"\u6587\u672C + \u7834\u6298\u53F7"\uFF0C\u770B\u4E0D\u51FA\u6F0F\u6597\u3002
		   \u6539\u540E\u6BCF\u5C42\u7684\u5F62\u72B6\u9AD8\u5EA6\u662F\u6574\u884C\uFF0834px\uFF09\uFF0C\u4E0A\u4E0B\u5404\u7559 1px \u7F1D\uFF1A
		   \u7F1D\u8BA9\u76F8\u90BB\u4E24\u5C42\u770B\u5F97\u51FA\u8FB9\u754C\uFF0C\u800C\u5DE6\u53F3\u8FB9\u7F18\u7531**\u540C\u4E00\u7EC4\u5BBD\u5EA6**\u7B97\u51FA\u6765\uFF08\u4E0B\u5C42\u4E0A\u8FB9\u7F18 = \u4E0A\u5C42\u4E0B\u8FB9\u7F18\uFF09\uFF0C
		   \u6240\u4EE5\u4E03\u5C42\u62FC\u8D77\u6765\u662F\u4E00\u6761\u8FDE\u7EED\u7684\u6F0F\u6597\u3002\u5BBD\u5EA6\u662F\u6570\u636E\u9A71\u52A8\u7684\u51E0\u4F55\u91CF\uFF0C\u8D70 inline style\u3002 */
		.jh-funnel-chart{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;font-size:12px}
		.jh-funnel-block{display:flex;flex-direction:column}
		/* \u603B\u4F53\u5206\u6BB5\u6807\u9898\uFF1A\u63A5\u89E6\u94FE\u8DEF\u4E0E\u6295\u9012\u94FE\u8DEF\u5206\u5F00\u5199\u6E05\u695A */
		.jh-funnel-seg{font-size:11px;font-weight:600;letter-spacing:.06em;margin:10px 0 4px;
		  color:var(--dsw-alias-label-secondary)}
		.jh-funnel-block:first-child .jh-funnel-seg{margin-top:0}
		/* \u5141\u8BB8\u6362\u884C\u662F\u7ED9\u7A84\u9762\u677F\u7684\u4E0B\u9650\uFF1A\u5F62\u72B6\u6700\u5C0F 140px\uFF0C\u653E\u4E0D\u4E0B\u5C31\u6574\u884C\u4E0B\u79FB\uFF08\u6240\u6709\u884C\u540C\u65F6\u6362\uFF0C\u5F62\u72B6\u4E0D\u4F1A\u9519\u4F4D\uFF09 */
		.jh-funnel-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 9px}
		.jh-funnel-label{flex:0 0 84px;color:var(--dsw-alias-label-secondary)}
		.jh-funnel-track{position:relative;flex:1 1 140px;min-width:0;height:34px}
		.jh-funnel-fill{position:absolute;left:0;right:0;top:1px;bottom:1px;
		  background:var(--dsw-alias-brand-primary);opacity:.8}
		/* \u6295\u9012\u9636\u6BB5\u6362\u4E00\u6863\u8272\uFF1A\u4E00\u773C\u5206\u5F97\u6E05\u54EA\u4E9B\u662F"\u6211\u505A\u7684\u52A8\u4F5C"\u3001\u54EA\u4E9B\u662F\u62DB\u8058\u65B9\u7684\u56DE\u5E94 */
		.jh-funnel-fill-apply{background:var(--dsw-alias-button-info-fill);opacity:1}
		/* min-height:24px \u662F WCAG 2.2 \u7684\u89E6\u8FBE\u4E0B\u9650\uFF08\u5BA1\u6838 B-8 \u8BB0\u8FC7\u5B83\u539F\u6765\u53EA\u6709 40\xD720\uFF09 */
		.jh-funnel-count{flex:0 0 44px;min-height:24px;text-align:right;font-variant-numeric:tabular-nums;
		  border:0;background:transparent;cursor:pointer;font:inherit;font-weight:600;
		  color:var(--jh-business-fg);text-decoration:underline;padding:0}
		.jh-funnel-count:hover{color:var(--dsw-alias-label-primary)}
		.jh-funnel-rate{flex:0 0 48px;text-align:right;font-variant-numeric:tabular-nums;
		  color:var(--dsw-alias-label-secondary)}
		.jh-funnel-drop{flex:0 0 52px;text-align:right;font-size:11px;color:var(--jh-muted-fg)}
		`;
		var BOARD_FILTERS = `
		/* \u2500\u2500 \u770B\u677F\uFF1A\u5168\u5C40\u7B5B\u9009\u533A\uFF08\xA713 U8\uFF0C\u7B2C\u4E03\u8F6E\u6805\u683C\u5316\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u4E00\u5904\u7B5B\u9009\uFF0C\u56DB\u4E2A\u6A21\u5757\u4E00\u8D77\u91CD\u7B97 \u2014\u2014 \u6240\u4EE5\u5B83\u5FC5\u987B\u957F\u5F97\u50CF"\u6574\u9875\u7684\u5F00\u5173"\uFF1A
		   \u72EC\u7ACB\u9762\u677F\u5361 + **\u7B49\u5BBD\u7B49\u8DDD\u7684\u6805\u683C**\uFF083 \u5217\uFF0C\u7A84\u9762\u677F\u964D\u4E3A 2 \u5217 / 1 \u5217\uFF09\uFF0C
		   \u52A8\u4F5C\uFF08\u91CD\u7F6E / \u67E5\u8BE2\uFF09\u5355\u72EC\u4E00\u884C\u9760\u53F3\uFF0C\u5B57\u6BB5\u4E0D\u4F1A\u56E0\u4E3A\u6309\u94AE\u51FA\u73B0\u6216\u6D88\u5931\u800C\u4F4D\u79FB\u3002
		   \u5224\u65AD"\u7A84\u4E0D\u7A84"\u7684\u662F**\u9762\u677F**\u5BBD\u5EA6\uFF08container query\uFF09\uFF0C\u4E0E\u5C97\u4F4D\u5E93\u4E24\u680F\u540C\u4E00\u4E2A\u7406\u7531\u3002 */
		.jh-filter-panel{container-type:inline-size}
		.jh-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px}
		.jh-filter-grid .jh-field{margin:0}
		/* \u6805\u683C\u91CC\u7684\u63A7\u4EF6\u4E00\u5F8B\u586B\u6EE1\u683C\u5B50\uFF1A\u65E5\u671F/\u641C\u7D22/\u4E0B\u62C9\u7684\u5BBD\u5EA6\u56E0\u6B64\u5929\u7136\u4E00\u81F4 */
		.jh-filter-grid .jh-input,.jh-filter-grid .jh-select{width:100%;max-width:none}
		/* \u52A8\u4F5C\u884C\u5355\u72EC\u4E00\u884C\u3001\u9760\u53F3\u3002\u7C7B\u540D\u523B\u610F**\u4E0D\u53EB** .jh-filter-actions \u2014\u2014
		   \u90A3\u4E2A\u540D\u5B57\u5DF2\u7ECF\u88AB\u5C97\u4F4D\u5E93\u7684\u9AD8\u7EA7\u7B5B\u9009\u5757\u5360\u7740\uFF08\u90A3\u8FB9\u662F\u6807\u9898\u884C\u5185 margin-left:auto \u53F3\u63A8\uFF09\uFF0C
		   \u4E24\u5904\u610F\u56FE\u4E0D\u540C\uFF0C\u590D\u7528\u4E00\u4E2A\u7C7B\u540D\u5FC5\u7136\u4E92\u76F8\u6539\u574F\uFF08\u672C\u9879\u76EE\u5DF2\u5728\u8FD9\u7C7B\u91CD\u590D\u89C4\u5219\u4E0A\u8E29\u8FC7\u5751\uFF09\u3002 */
		.jh-filter-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px}
		@container (max-width: 620px){
		  .jh-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
		}
		@container (max-width: 400px){
		  .jh-filter-grid{grid-template-columns:minmax(0,1fr)}
		}

		.jh-table{border-collapse:collapse;width:100%;font-size:12px}
		.jh-table th,.jh-table td{border-bottom:1px solid var(--dsw-alias-border-l2);padding:4px 6px;text-align:left}
		.jh-table th{color:var(--dsw-alias-label-secondary);font-weight:500}
		`;
		var SALARY_BOX = `
		/* \u2500\u2500 \u6279\u6B21 F\uFF1A\u85AA\u8D44\u7BB1\u7EBF\u56FE\uFF08\u6A2A\u5411\uFF0CP25\u2013P75 \u9AD8\u4EAE\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u7528**\u6A2A\u5411**\u753B\uFF1A\u85AA\u8D44\u56DE\u7B54"\u591A\u5C11"\u800C\u4E0D\u662F"\u4EC0\u4E48\u65F6\u5019"\uFF0C\u6A2A\u7740\u6BD4\u7AD6\u7740\u597D\u8BFB\uFF0C
		   \u4E5F\u548C\u4E0A\u9762\u7684\u6F0F\u6597\u540C\u4E00\u5957\u89C6\u89C9\u8BED\u8A00\u3002\u9AD8\u4EAE\u7684\u662F\u7BB1\u4F53\uFF08P25\u2013P75\uFF09\uFF0C
		   \u4E24\u7AEF\u7684\u987B\u662F\u6700\u5C0F/\u6700\u5927\u503C \u2014\u2014 \u523B\u610F\u4E0D\u505A\u79BB\u7FA4\u70B9\u5254\u9664\uFF0C\u5254\u4E86\u4F1A\u628A\u771F\u5B9E\u7684\u9AD8\u85AA\u5C97\u5220\u6389\u3002
		   container-type \u662F\u7ED9\u4E0B\u9762\u7684\u7A84\u9762\u677F\u964D\u7EA7\u7528\u7684\uFF08\u5224\u65AD"\u7A84\u4E0D\u7A84"\u7684\u662F**\u9762\u677F**\u5BBD\u5EA6\uFF09\u3002 */
		.jh-box{display:flex;flex-direction:column;gap:2px;margin:10px 0 4px;container-type:inline-size}
		/* \u60AC\u6D6E\u5361\u7247\u8981\u5B9A\u4F4D\u5728\u8F68\u9053\u4E0A\u65B9\uFF0C\u6240\u4EE5\u8F68\u9053\u5916\u5C42\u5355\u72EC\u627F\u62C5 position:relative */
		.jh-box-plot{position:relative}
		.jh-box-track{position:relative;height:26px;cursor:help}
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
		/* \u60AC\u505C\u5230\u4E2D\u4F4D\u6570\u65F6\u628A\u5B83\u53D8\u7C97 \u2014\u2014 \u4F4D\u7F6E\u7531\u9F20\u6807\u6A2A\u5411\u4F4D\u7F6E\u5C31\u8FD1\u5224\u5B9A\uFF0C\u6CA1\u6709\u989D\u5916\u7684\u547D\u4E2D\u533A\u5143\u7D20 */
		.jh-box-median[data-hot="1"]{width:3px;margin-left:-0.5px}

		/* \u60AC\u6D6E\u5361\u7247\uFF1A\u76F4\u63A5\u7ED9\u5206\u4F4D\u6570\u4E4B\u5DEE\u4E0E\u6837\u672C\u6784\u6210\uFF0C\u66FF\u4EE3\u539F\u6765"\u56FE\u4E0B\u65B9\u4E00\u6BB5\u7B97\u6CD5\u8BF4\u660E"\u3002
		   \u7EDD\u5BF9\u5B9A\u4F4D + pointer-events:none\uFF1A\u5B83\u4E0D\u5360\u7248\u9762\u3001\u4E5F\u4E0D\u4F1A\u628A\u9F20\u6807\u4ECE\u8F68\u9053\u4E0A\u62A2\u8D70\u3002 */
		.jh-box-tip{position:absolute;right:0;bottom:calc(100% + 8px);z-index:2;width:264px;
		  box-sizing:border-box;padding:8px 10px;border-radius:9px;font-size:12px;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);
		  box-shadow:0 6px 20px var(--jh-shadow-ink);pointer-events:none}
		.jh-box-tip-row{display:flex;align-items:baseline;gap:10px;margin:0;line-height:1.9;
		  color:var(--dsw-alias-label-secondary)}
		.jh-box-tip-row>b{margin-left:auto;font-variant-numeric:tabular-nums;
		  color:var(--dsw-alias-label-primary)}
		.jh-box-tip-row[data-hot="1"]>span,.jh-box-tip-row[data-hot="1"]>b{font-weight:700;
		  color:var(--jh-business-fg)}
		.jh-box-tip-note{margin:6px 0 0;padding-top:6px;font-size:11.5px;line-height:1.6;
		  border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}

		/* \u6570\u503C\u8F74\uFF08\u7B2C\u4E03\u8F6E\u65B0\u589E\uFF09\u3002
		   \u539F\u6765\u523B\u5EA6\u662F justify-content:space-between \u7684\u4E00\u884C\u5B57 \u2014\u2014 P25 / \u4E2D\u4F4D / P75 \u88AB\u5747\u5300\u94FA\u5F00\uFF0C
		   \u8BFB\u8D77\u6765\u50CF"\u4E09\u70B9\u7B49\u8DDD"\uFF0C\u90A3\u662F**\u5047\u5750\u6807**\u3002\u8FD9\u91CC\u6BCF\u4E2A\u523B\u5EA6\u6309\u771F\u5B9E\u6570\u503C\u5B9A\u4F4D\uFF08left:X%\uFF09\uFF0C
		   \u5E76\u7528 data-anchor \u51B3\u5B9A\u6807\u7B7E\u5411\u54EA\u8FB9\u5BF9\u9F50\uFF0C\u514D\u5F97\u9996\u5C3E\u4E24\u4E2A\u6807\u7B7E\u8DD1\u51FA\u753B\u5E03\u3002 */
		.jh-box-axis{position:relative;height:38px;border-top:1px solid var(--dsw-alias-border-l2)}
		.jh-box-tickmark{position:absolute;top:0;width:1px;height:5px;transform:translateX(-50%);
		  background:var(--dsw-alias-border-l4)}
		.jh-box-ticklabel{position:absolute;top:7px;display:flex;flex-direction:column;align-items:center;
		  white-space:nowrap;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
		.jh-box-ticklabel>i{font-style:normal;font-size:10.5px}
		.jh-box-ticklabel>b{font-weight:600;font-variant-numeric:tabular-nums;
		  color:var(--dsw-alias-label-primary)}
		.jh-box-ticklabel[data-anchor="center"]{transform:translateX(-50%)}
		.jh-box-ticklabel[data-anchor="start"]{transform:translateX(0);align-items:flex-start}
		.jh-box-ticklabel[data-anchor="end"]{transform:translateX(-100%);align-items:flex-end}
		/* \u4E2D\u4F4D\u6570\u662F\u8FD9\u5757\u6570\u636E\u7684\u7ED3\u8BBA\uFF0C\u6240\u4EE5\u5B83\u7684\u523B\u5EA6\u662F\u552F\u4E00\u5E26\u8272\u7684 */
		.jh-box-ticklabel-key>b{color:var(--jh-business-fg)}
		.jh-box-ticklabel[data-hot="1"]>i,.jh-box-ticklabel[data-hot="1"]>b{font-weight:700;
		  color:var(--jh-business-fg)}
		/* \u7A84\u9762\u677F\uFF08\u2264400px\uFF09\u4E0B\u4E09\u4E2A\u523B\u5EA6\u5FC5\u7136\u53E0\u5B57 \u2014\u2014 \u5B9E\u6D4B 320px \u65F6\u8F68\u9053\u53EA\u6709 141px\uFF0C
		   \u800C"P25 12000"\u8FD9\u6837\u7684\u6807\u7B7E\u672C\u8EAB\u5C31\u6709 34px \u5BBD\uFF0C\u9760"\u4F4D\u7F6E\u5DEE \u22659%"\u8FD9\u6761\u89C4\u5219\u62E6\u4E0D\u4F4F\u3002
		   \u8FD9\u65F6\u53EA\u7559\u4E2D\u4F4D\u6570 \u2014\u2014 \u4E00\u4E2A\u6570\u5B57\u90FD\u6CA1\u4E22\uFF1A\u4E94\u6570\u6982\u62EC**\u5E38\u9A7B**\u5728\u56FE\u4E0B\u9762\u90A3\u4E00\u884C
		   .jh-metric-row \u91CC\uFF08\u5B83\u4E0D\u53D7\u5BB9\u5668\u67E5\u8BE2\u5F71\u54CD\uFF0C\u4E5F\u662F\u952E\u76D8/\u89E6\u5C4F\u7528\u6237\u552F\u4E00\u7684\u8BFB\u6570\u5165\u53E3\uFF09\u3002 */
		@container (max-width: 400px){
		  .jh-box-ticklabel:not(.jh-box-ticklabel-key){display:none}
		}
		.jh-baseline{margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
		`;
		var BOARD_V2 = `
		/* \u2500\u2500 \u7B2C\u4E03\u8F6E\uFF082026-09-18\uFF09\uFF1A\u6570\u636E\u770B\u677F\u6309"\u4FE1\u606F\u566A\u97F3 / \u56FE\u5F62\u5316 / \u89C6\u89C9\u5C42\u7EA7"\u91CD\u6392 \u2500\u2500
		   \u8FD9\u4E00\u8F6E\u4FEE\u7684\u662F**\u53EF\u8BFB\u6027**\uFF08\xA77 \u4FEE\u7684\u662F\u53EF\u8FBE\u6027\uFF09\u3002\u4E09\u4EF6\u4E8B\uFF1A
		     \u2460 \u7B5B\u9009\u533A\u6805\u683C\u5316 + \u8349\u7A3F\u6001\uFF1A6 \u4E2A\u5B57\u6BB5\u4E00\u6837\u5BBD\u3001\u4E00\u6837\u95F4\u8DDD\uFF0C\u52A8\u4F5C\u72EC\u7ACB\u6210\u884C\uFF08\u89C1\u4E0A\u9762\u7684
		        .jh-filter-grid\uFF09\uFF1B
		     \u2461 \u6BCF\u4E2A\u6570\u636E\u6A21\u5757\u4E00\u5F20**\u9762\u677F\u5361**\uFF1A\u6807\u9898 16px\u3001\u53F3\u4E0A\u89D2\u6302\u6837\u672C\u5FBD\u7AE0\uFF0C\u957F\u53E3\u5F84\u8BF4\u660E\u6536\u8FDB
		        \u300C\u53E3\u5F84\u8BF4\u660E\u300D\u5C55\u5F00\u9879\u6216\u95EE\u53F7 \u2014\u2014 \u9996\u5C4F\u53EA\u7559\u7ED3\u8BBA\uFF1B
		     \u2462 \u8868\u683C\uFF1A\u6570\u503C\u5217\u53F3\u5BF9\u9F50\u3001\u8868\u5934\u6709\u5E95\u8272\u3001\u884C\u8DDD\u52A0\u5927\u3001\u7A7A\u503C\u7EDF\u4E00\u6210\u7070\u8272\u7834\u6298\u53F7\u3002

		   \u4E24\u4E2A\u523B\u610F**\u6CA1\u6709**\u7167\u529E\u7684\u53D6\u503C\uFF08\u90FD\u6709\u5B9E\u6D4B\u7406\u7531\uFF0C\u4E0D\u662F\u6F0F\u505A\uFF09\uFF1A
		     * \u5706\u89D2\u4ECD\u662F 10px\uFF08\u5EFA\u8BAE 8px\uFF09\uFF1A\u5168\u9879\u76EE 10 \u4E2A\u5C4F\u7684\u5361\u7247\u90FD\u662F 10px\uFF0C\u5355\u7ED9\u770B\u677F\u6362\u6210 8px
		       \u53EA\u4F1A\u8BA9"\u8FD9\u4E00\u5C4F\u7684\u5361\u7247\u957F\u5F97\u4E0D\u4E00\u6837"\uFF0C\u4E0D\u5E26\u6765\u4EFB\u4F55\u6536\u76CA\uFF1B
		     * \u8BF4\u660E\u6587\u5B57\u8D70 --jh-muted-fg / label-secondary\uFF08\u5EFA\u8BAE\u56FA\u5B9A #8C8C8C\uFF09\uFF1A
		       #8C8C8C \u538B\u5728\u767D\u5E95\u4E0A\u7EA6 3.2:1\uFF0C\u8FBE\u4E0D\u5230\u6B63\u6587\u8981\u6C42\u7684 4.5:1\uFF0C\u800C\u4E14 \xA75.3 \u8981\u6C42\u989C\u8272
		       \u4E00\u5F8B\u8D70\u4E3B\u9898\u53D8\u91CF \u2014\u2014 \u786C\u7F16\u7801\u7684\u7070\u5728\u6DF1\u8272\u4E3B\u9898\u4E0B\u8FD8\u4F1A\u76F4\u63A5\u5931\u6548\u3002 */

		.jh-screen-title{font-size:18px;font-weight:600;margin:0}

		/* \u9762\u677F\u5361\uFF1A.jh-card \u5DF2\u7ECF\u7ED9\u4E86\u63CF\u8FB9 / \u5706\u89D2 / \u5E95\u8272\uFF0C\u8FD9\u91CC\u53EA\u8865\u4E00\u5C42\u5FAE\u9634\u5F71 \u2014\u2014
		   \u767D\u5E95\u5361\u7247\u753B\u5728\u767D\u9875\u9762\u4E0A\u65F6\uFF0C\u9634\u5F71\u662F\u552F\u4E00\u80FD\u8BF4\u660E"\u8FD9\u662F\u4E00\u5757\u72EC\u7ACB\u5185\u5BB9"\u7684\u4E1C\u897F\u3002
		   \u8D70 --jh-shadow-card\uFF08\u4E0E\u5F39\u7A97/\u60AC\u6D6E\u5361\u7684 --jh-shadow-ink \u662F\u4E24\u4E2A\u89D2\u8272\uFF0C\u89C1 tokens.ts\uFF09\u3002 */
		.jh-panel{box-shadow:0 1px 2px var(--jh-shadow-card)}
		.jh-panel-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}
		.jh-panel-title{font-size:16px;font-weight:600;margin:0}
		/* \u9762\u677F\u5185\u7684\u4E8C\u7EA7\u6807\u9898\uFF1A\u6BD4\u6B63\u6587\uFF0813px\uFF09\u7565\u5927\u3001\u6BD4\u9762\u677F\u6807\u9898\uFF0816px\uFF09\u5C0F\u4E24\u6863 */
		.jh-panel-sub{font-size:13px;font-weight:600;margin:14px 0 6px;
		  color:var(--dsw-alias-label-primary)}
		/* \u9762\u677F\u5E95\u90E8\u4E00\u884C\uFF1A\u5DE6\u8FB9\u653E\u5FC5\u987B\u5E38\u9A7B\u7684\u8BFB\u6570\uFF08\u6837\u672C\u91CF\uFF09\uFF0C\u53F3\u8FB9\u653E\u6309\u9700\u5C55\u5F00\u7684\u4F9D\u636E */
		.jh-panel-foot{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:10px}
		.jh-details-inline{flex:none;margin-top:0}
		.jh-details-inline>p{margin:6px 0 0;max-width:640px;text-align:left}

		/* \u8868\u683C\uFF1A\u8868\u5934\u6709\u5E95\u8272\u3001\u5355\u5143\u683C\u5185\u8FB9\u8DDD\u52A0\u5927\u3001\u6570\u503C\u5217\u53F3\u5BF9\u9F50\u3002
		   \u9009\u62E9\u5668\u5199\u6210 .jh-table.jh-table-board\uFF08\u4E24\u4E2A\u7C7B\uFF09\u800C\u4E0D\u662F\u53EA\u5199 .jh-table-board \u2014\u2014
		   \u57FA\u7840\u89C4\u5219 .jh-table td{text-align:left} \u4E0E\u5B83\u662F\u540C\u4E00\u6863\u7279\u5F02\u6027\uFF0C
		   \u9760\u6587\u4EF6\u5148\u540E\u51B3\u80DC\u8D1F\u592A\u8106\u5F31\uFF08\u672C\u9879\u76EE\u4E3A\u6B64\u8E29\u8FC7\u4E00\u6B21\uFF1A.jh-num \u66FE\u88AB .jh-table td \u538B\u8FC7\u53BB\uFF09\u3002 */
		.jh-table.jh-table-board th,.jh-table.jh-table-board td{padding:7px 10px;vertical-align:middle}
		.jh-table.jh-table-board th{background:var(--dsw-alias-markdown-tag);font-weight:600;
		  color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l3)}
		.jh-table.jh-table-board td.jh-num,.jh-table.jh-table-board th.jh-num{text-align:right}
		/* \u884C\u5185\u6807\u7B7E\uFF08"\u6837\u672C\u5C11" / "\u56DE\u590D\u7387\u6700\u9AD8"\uFF09\u8DDF\u5728\u5206\u7EC4\u540D\u540E\u9762\uFF0C\u7ED9\u4E00\u70B9\u95F4\u8DDD */
		.jh-table.jh-table-board td .jh-tag{margin-left:8px}

		/* "\u8868\u73B0\u6700\u597D\u7684\u4E00\u884C"\uFF1A\u6D45\u7EFF\u5E95\u3002
		   \u7528 10% \u6DF7\u8272\u800C\u4E0D\u662F\u5B9E\u8272 \u2014\u2014 \u5B83\u8981\u80FD\u88AB\u4E00\u773C\u626B\u5230\uFF0C\u4F46\u4E0D\u80FD\u76D6\u8FC7\u8868\u5934\uFF0C
		   \u4E5F\u4E0D\u80FD\u8BA9\u5355\u5143\u683C\u91CC\u7684\u6B63\u6587\u6389\u51FA\u5BF9\u6BD4\u5EA6\u3002\u653E\u5728\u6587\u4EF6\u672B\u5C3E\u662F\u6709\u610F\u7684\uFF1A
		   .jh-table tbody tr:hover \u4E0E\u5B83\u662F\u540C\u4E00\u6863\u7279\u5F02\u6027\uFF0C\u9760\u987A\u5E8F\u51B3\u80DC\u8D1F\u3002 */
		.jh-table tbody tr.jh-row-best{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)}
		.jh-table tbody tr.jh-row-best:hover{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent)}

		/* \u7A7A\u503C\uFF1A\u5168\u9879\u76EE\u7EDF\u4E00\u662F\u540C\u4E00\u4E2A\u5B57\u7B26\uFF08\u5BA1\u6838 \xA79.1\uFF09\uFF0C\u8FD9\u91CC\u53EA\u7ED9\u5B83\u4E00\u4E2A"\u660E\u786E\u7684\u7A7A"\u7684\u7070 \u2014\u2014
		   \u6DF1\u7070\u4F1A\u88AB\u8BFB\u6210"\u4E00\u4E2A\u5F88\u5C0F\u7684\u6570\u5B57"\uFF0C\u6D45\u7070\u624D\u662F"\u8FD9\u91CC\u6CA1\u6709\u6570\u636E"\u3002 */
		.jh-cell-empty{color:var(--jh-muted-fg)}

		/* \u5FBD\u7AE0\uFF1A\u9762\u677F\u53F3\u4E0A\u89D2\u7684\u6837\u672C\u91CF / \u8868\u683C\u91CC\u7684\u5224\u65AD\u6807\u7B7E\u3002
		   quiet = \u6837\u672C\u591F\uFF08\u5B89\u9759\u5230\u4E0D\u8BE5\u62A2\u6CE8\u610F\u529B\uFF09\uFF0Cwarn = \u6837\u672C\u4E0D\u8DB3\uFF08\u6D45\u9EC4\u5E95 + \u6DF1\u8272\u5B57\uFF0C
		   \u4E0D\u662F"\u9971\u548C\u8272\u5E95\u914D\u767D\u5B57"\u2014\u2014 \u90A3\u4E2A\u914D\u65B9\u672C\u9879\u76EE\u5DF2\u7ECF\u56E0\u4E3A 2.15:1 \u4FEE\u8FC7\u4E00\u6B21\uFF09\u3002 */
		.jh-tag-quiet{background:transparent;border:1px dashed var(--dsw-alias-border-l3);
		  color:var(--dsw-alias-label-secondary);font-weight:400}
		.jh-tag-warn{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
		.jh-tag-best{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}

		/* \u85AA\u8D44\u4E94\u6570\u6982\u62EC\uFF1A\u4E00\u6392\u884C\u5185\u6307\u6807\uFF0C\u7D27\u8DDF\u7BB1\u7EBF\u56FE\u3002\u6570\u503C\u52A0\u7C97\u3001\u4E2D\u4F4D\u6570\u5E26\u8272 \u2014\u2014
		   "\u4E3B\u6838\u5FC3\u6307\u6807\u8981\u9AD8\u4EAE"\u7684\u5177\u4F53\u843D\u6CD5\uFF08\u4E5F\u662F\u8FD9\u4E00\u5757\u552F\u4E00\u9700\u8981\u4E00\u773C\u8BB0\u4F4F\u7684\u6570\uFF09\u3002
		   \u5B83\u662F**\u56FE\u4E4B\u5916\u7684\u5E38\u9A7B\u8BFB\u6570**\uFF1A\u6781\u503C\u5728\u56FE\u4E0A\u6839\u672C\u6CA1\u6709\u523B\u5EA6\uFF0C\u7A84\u9762\u677F\u8FD8\u4F1A\u628A\u523B\u5EA6\u6536\u6389\uFF0C
		   \u6240\u4EE5\u8FD9\u4E00\u884C\u4E0D\u662F\u88C5\u9970\uFF0C\u662F\u952E\u76D8 / \u89E6\u5C4F\u7528\u6237\u62FF\u5230\u8FD9\u4E9B\u6570\u7684\u552F\u4E00\u5165\u53E3\u3002 */
		.jh-metric-row{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:12px}
		.jh-metric{display:flex;flex-direction:column;gap:1px;min-width:64px}
		.jh-metric>span{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
		.jh-metric>b{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
		.jh-metric-key>b{color:var(--jh-business-fg)}
		`;

		// src/client/styles/screens/jobs.ts
		var JOBS_FILTERS = `
		/* \u2500\u2500 \u5C97\u4F4D\u5E93\u7B5B\u9009\u533A\uFF1A\u4E00\u6761\u5E38\u89C4\u5DE5\u5177\u6761 + \u4E00\u4E2A\u300C\u9AD8\u7EA7\u7B5B\u9009\u300D\u6298\u53E0 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u4E0D\u5E26 .jh-filters \u7684\u524D\u7F00\uFF1A\u90A3\u4E2A\u7C7B\u5728\u6D41\u6C34\u7EBF\u5C4F\uFF08\u85AA\u8D44\u53E3\u5F84\u5207\u6362\uFF09\u91CC\u662F\u4E00\u884C\u6A2A\u6392\uFF0C
		   \u628A\u5B83\u6539\u6210\u7EB5\u6392\u4F1A\u8FDE\u5E26\u6539\u574F\u90A3\u8FB9 \u2014\u2014 \u5C97\u4F4D\u5E93\u8FD9\u91CC\u53E6\u8D77\u4E00\u4E2A\u7C7B\u540D\u3002
		   \u2500\u2500 2026-09-18 \u91CD\u505A\uFF1A\u4E0A\u4E00\u7248\u5728\u8FD9\u91CC\u5806\u4E86\u5757\u6807\u9898\u3001\u6807\u9898\u7AD6\u6761\u3001\u5757\u95F4\u5206\u9694\u7EBF\u300172px \u6807\u7B7E\u7F51\u683C \u2014\u2014
		   \u4E00\u5C4F\u91CC\u52A0\u4E86\u4E00\u6574\u5957\u8868\u5355\u88C5\u9970\uFF0C\u800C\u63A7\u4EF6\u672C\u8EAB\u6CA1\u53D8\u591A\u3002\u8FD9\u4E00\u7248\u5168\u90E8\u780D\u6389\uFF0C\u53EA\u7559\u4E09\u6837\u4E1C\u897F\uFF1A
		   \u4E00\u6761\u5DE5\u5177\u6761\u3001\u4E00\u884C\u6298\u53E0\u5F00\u5173\u3001\u4E00\u4E2A\u6CA1\u6709\u8FB9\u6846\u7684\u6298\u53E0\u9762\u677F\u3002\u5206\u7EC4\u9760**\u95F4\u8DDD**\u5C31\u591F\u4E86\u3002
		   \u7C7B\u540D\u4E00\u5F8B\u5E26 jh-jobs- \u524D\u7F00\uFF1A\u901A\u7528\u540D\uFF08jh-filter-panel \u4E4B\u7C7B\uFF09\u4F1A\u548C\u6D41\u6C34\u7EBF\u5C4F\u649E \u2014\u2014 \u5DF2\u7ECF\u649E\u8FC7\u4E00\u6B21\u3002 */
		.jh-jobs-filters{display:flex;flex-direction:column;gap:8px;margin:0 0 12px}
		/* \u5E38\u89C4\u5DE5\u5177\u6761\uFF1A\u4E00\u6392\u8F93\u5165\u6846 / \u4E0B\u62C9\uFF0C\u6309\u94AE\u7D27\u8DDF\u5728\u6700\u540E\u4E00\u4E2A\u63A7\u4EF6\u540E\u9762\uFF08\u4E0D\u63A8\u53F3\uFF09 */
		.jh-jobs-filter-line{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
		.jh-jobs-filters .jh-input,.jh-jobs-filters .jh-select{width:auto}
		/* \u5BBD\u5EA6\u6863\u4F4D\u8981\u5728**\u540C\u4E00\u5C42\u9009\u62E9\u5668**\u4E0A\u91CD\u65B0\u88C1\u51B3\uFF1A\u4E0A\u9762\u90A3\u6761 width:auto \u662F (0,2,0)\uFF0C
		   \u6BD4 .jh-input-md \u7684 (0,1,0) \u9AD8 \u2014\u2014 \u4E0D\u5728\u8FD9\u91CC\u91CD\u5199\u4E00\u904D\uFF0C\u7B5B\u9009\u6761\u91CC\u7684\u63A7\u4EF6\u4F1A\u5168\u90E8\u9000\u56DE
		   \u6D4F\u89C8\u5668\u9ED8\u8BA4\u5BBD\u5EA6\uFF08\u770B\u677F\u7684 .jh-filterbar .jh-input-sm \u540C\u7406\uFF09\u3002
		   \uFF08\u539F\u5148\u8FD9\u91CC\u8FD8\u6709\u4E00\u6761 .jh-input-sm\uFF1A\u7B2C\u56DB\u8F6E\u7ED9\u4E24\u4E2A\u6587\u672C\u6846\u52A0\u4E0A\u53EF\u89C1\u6807\u7B7E\u540E\uFF0C
		   \u5B83\u4EEC\u6539\u7531\u4E0B\u9762\u7684 .jh-jobs-filter-text \u5B9A\u5BBD\uFF0C\u90A3\u6761\u5DF2\u6210\u6B7B\u89C4\u5219\uFF0C\u5220\u6389\u3002\uFF09 */
		/* \u4E2D\u7B49\u5BBD\u5EA6\uFF08\u57CE\u5E02 / \u72B6\u6001 / \u65B0\u589E\u65F6\u95F4\uFF09\uFF1A130px \u88C5\u4E0D\u4E0B\u300C\u5168\u90E8\u57CE\u5E02\u300D\u8FD9\u7C7B\u9009\u9879\u6587\u5B57 */
		.jh-jobs-filters .jh-input-md{width:150px}
		/* \u2500\u2500 \u5E26\u53EF\u89C1\u6807\u7B7E\u7684\u6587\u672C\u6846\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P1-4\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5173\u952E\u8BCD\u4E0E\u6700\u4F4E\u6708\u85AA\u539F\u5148**\u53EA\u6709 placeholder \u5F53\u6807\u7B7E**\uFF08caption \u6863\uFF0C\u767D\u5E95\u4E0A 2.6:1\uFF09\uFF0C
		   \u800C\u4E14\u4E00\u5F00\u59CB\u8F93\u5165\u8FD9\u6BB5\u6587\u5B57\u5C31\u6D88\u5931\u4E86\uFF0C\u7528\u6237\u6CA1\u6CD5\u56DE\u770B\u8FD9\u4E2A\u6846\u662F\u5E72\u4EC0\u4E48\u7684\u3002
		   \u73B0\u5728\u6807\u7B7E\u56DE\u5230\u63A7\u4EF6\u65C1\u8FB9\uFF1Alabel-secondary\uFF085.80:1\uFF09\uFF0C\u4E0E\u6298\u53E0\u9762\u677F\u91CC\u90A3\u4E00\u5217 76px \u6807\u7B7E
		   \u662F\u540C\u4E00\u4E2A\u8BED\u8A00\uFF0C\u53EA\u662F\u8FD9\u91CC\u6A2A\u6392 \u2014\u2014 \u5DE5\u5177\u6761\u4ECD\u7136\u662F\u4E00\u6761\u7EBF\uFF0C\u6CA1\u6709\u53D8\u9AD8\u3002 */
		.jh-jobs-filter-text{display:flex;align-items:center;gap:6px;flex:1 1 220px;min-width:180px}
		.jh-jobs-filter-text>span{flex:0 0 auto;font-size:12px;color:var(--dsw-alias-label-secondary);
		  white-space:nowrap}
		.jh-jobs-filter-text .jh-input{flex:1 1 auto;min-width:0;width:auto}
		/* \u6700\u4F4E\u6708\u85AA\u662F\u7A84\u5B57\u6BB5\uFF0C\u4E0D\u53C2\u4E0E\u4F38\u5C55\u3002\u9009\u62E9\u5668\u5199\u6210\u4E24\u4E2A\u7C7B\uFF08(0,3,0)\uFF09\u800C\u4E0D\u662F\u4E00\u4E2A \u2014\u2014
		   \u4E0A\u9762\u90A3\u6761 .jh-jobs-filter-text .jh-input{width:auto} \u4E0E\u5B83\u662F\u540C\u4E00\u6863\u7279\u5F02\u6027\uFF0C
		   \u53EA\u9760\u5148\u540E\u6765\u88C1\u51B3\u592A\u8106\u5F31\uFF08\u672C\u9879\u76EE\u4E3A\u8FD9\u7C7B\u95EE\u9898\u8E29\u8FC7\u4E00\u6B21\uFF09\u3002 */
		.jh-jobs-filter-text.jh-jobs-filter-text-narrow{flex:0 0 auto}
		.jh-jobs-filter-text.jh-jobs-filter-text-narrow .jh-input{width:90px}
		/* \u6761\u4EF6\u6539\u4E86\u4F46\u8FD8\u6CA1\u70B9\u300C\u7B5B\u9009\u300D\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P2-12\uFF09\uFF1A
		   \u6298\u53E0\u5F00\u5173\u4E0A\u7684\u300C\u5DF2\u9009 N \u9879\u300D\u7B97\u7684\u662F**\u8349\u7A3F**\uFF0C\u5217\u8868\u5934\u680F\u90A3\u53E5\u7B97\u7684\u662F**\u5DF2\u751F\u6548**\u7684\u6761\u4EF6 \u2014\u2014
		   \u4E24\u8005\u53EF\u4EE5\u4E0D\u4E00\u81F4\uFF0C\u8FD9\u884C\u5B57\u628A\u5DEE\u522B\u76F4\u63A5\u8BF4\u51FA\u6765\uFF0C\u514D\u5F97\u7528\u6237\u4EE5\u4E3A"\u5DF2\u7ECF\u7B5B\u8FC7\u4E86"\u3002 */
		.jh-jobs-filter-pending{font-size:12px;font-weight:600;color:var(--jh-warn-fg)}
		/* \u300C\u4FDD\u5B58\u4E3A\u89C6\u56FE\u300D\u7684\u5C31\u5730\u8F93\u5165\uFF08\u6279\u6B21 B2\uFF09\uFF1A\u4E0E\u5DE5\u5177\u6761\u91CC\u5176\u5B83\u63A7\u4EF6\u540C\u9AD8\u540C\u5BBD\u6863\uFF0C
		   150px \u591F\u5199\u300C\u6DF1\u5733 Java 20K+\u300D\u8FD9\u79CD\u540D\u5B57\uFF08\u4E0A\u9650 40 \u5B57\u7531 maxLength \u7BA1\uFF09\u3002 */
		.jh-jobs-view-name{width:150px}
		/* \u6298\u53E0\u5F00\u5173\uFF1A\u53EA\u6709\u4E00\u884C\u5C0F\u5B57\uFF0C\u56FE\u6807\u5728\u6700\u524D\u9762\u6307\u793A\u5C55\u5F00\u6001\u3002
		   align-self \u8BA9\u5B83\u53EA\u5360\u6587\u5B57\u90A3\u70B9\u5BBD\u5EA6 \u2014\u2014 \u6574\u884C\u53EF\u70B9\u7684\u9690\u5F62\u5927\u6309\u94AE\u4F1A\u76D6\u4F4F\u4E0B\u9762\u7684\u9762\u677F\u8FB9\u7F18\u3002 */
		.jh-jobs-filter-toggle{display:flex;align-items:center;gap:6px;align-self:flex-start;
		  padding:2px 0;border:0;background:transparent;cursor:pointer;text-align:left;font:inherit}
		.jh-jobs-filter-caret{color:var(--jh-muted-fg);font-size:10px;line-height:1;flex:0 0 auto}
		.jh-jobs-filter-toggle-text{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
		.jh-jobs-filter-toggle:hover .jh-jobs-filter-toggle-text{color:var(--dsw-alias-label-primary)}
		/* \u6298\u53E0\u5F00\u5173\u65C1\u8FB9\u90A3\u884C\u5C0F\u5B57\u3002**\u5171\u7528\u540D**\uFF1A\u5C97\u4F4D\u5E93\u7684\u300C\u9AD8\u7EA7\u7B5B\u9009\u300D\u4E0E\u8BBE\u7F6E\u9875\u7684\u7528\u91CF\u5361\u7247\u90FD\u5728\u7528\u5B83\uFF0C
		   \u6240\u4EE5\u5B83\u4E0D\u8DDF\u7740\u4E0B\u9762\u90A3\u6279\u5E26 jh-jobs- \u524D\u7F00\u7684\u7C7B\u540D\u4E00\u8D77\u6539\uFF08\u6539\u4E86\u4F1A\u628A\u8BBE\u7F6E\u9875\u90A3\u4E24\u5904\u53D8\u6210\u88F8\u6587\u5B57\uFF09\u3002 */
		.jh-filter-note{font-size:12px;color:var(--jh-muted-fg)}
		/* \u6536\u8D77\u72B6\u6001\u4E0B\u6709\u751F\u6548\u6761\u4EF6\uFF1A\u67D3\u6210\u54C1\u724C\u8272\u3002\u6298\u53E0\u7684\u6761\u4EF6\u4E0D\u80FD\u53D8\u6210\u9690\u5F62\u6761\u4EF6 \u2014\u2014
		   \u5426\u5219\u7528\u6237\u4F1A\u4EE5\u4E3A"\u6211\u4EC0\u4E48\u90FD\u6CA1\u9009"\uFF0C\u800C\u5217\u8868\u786E\u5B9E\u662F\u7B5B\u8FC7\u7684\u3002 */
		.jh-filter-note-on{color:var(--dsw-alias-brand-text);font-weight:600}
		/* \u6298\u53E0\u9762\u677F\uFF1A**\u6CA1\u6709\u8FB9\u6846\u3001\u6CA1\u6709\u5E95\u8272\u3001\u6CA1\u6709\u6807\u9898**\uFF0C\u53EA\u6709"\u6807\u7B7E + \u63A7\u4EF6"\u4E24\u5217\u4E0E\u884C\u8DDD\u3002
		   76px \u7684\u6807\u7B7E\u5217\u662F\u6309\u6700\u957F\u90A3\u4E2A\u6807\u7B7E\u91CF\u51FA\u6765\u7684\uFF1A\u300C\u65B0\u589E\u65F6\u95F4\u300D\uFF084 \u5B57 \u2248 48px\uFF09+ 4px + 14px \u95EE\u53F7 = 66px\u3002 */
		.jh-jobs-filter-panel{display:flex;flex-direction:column;gap:8px}
		/* \u26A0\uFE0F \u5FC5\u987B\u663E\u5F0F\u5199\uFF1A.jh-jobs-filter-panel \u7684 display:flex \u4F1A\u76D6\u6389 UA \u6837\u5F0F\u8868\u91CC\u7684 [hidden]\uFF0C
		   \u5C11\u4E86\u8FD9\u6761\uFF0C\u6298\u53E0\u7684\u9AD8\u7EA7\u7B5B\u9009\u6839\u672C\u6536\u4E0D\u8D77\u6765\u3002 */
		.jh-jobs-filter-panel[hidden]{display:none}
		.jh-jobs-filter-row{display:flex;align-items:flex-start;gap:10px}
		.jh-jobs-filter-label{flex:0 0 76px;display:inline-flex;align-items:center;gap:4px;
		  padding-top:5px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
		/* \u63A7\u4EF6\u5217\uFF1Achips / \u4E0B\u62C9 / \u590D\u9009\u6846\u90FD\u4ECE\u540C\u4E00\u6761\u5DE6\u4FA7\u7EBF\u5F00\u59CB */
		.jh-jobs-filter-body{flex:1 1 auto;min-width:0;display:flex;flex-wrap:wrap;gap:5px;align-items:center}
		`;
		var JOBS = `
		/* \u2500\u2500 U1 \u5C97\u4F4D\u5E93 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-listbar{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}
		/* \u5217\u8868\u5934\u680F\u53F3\u4FA7\uFF1A\u6392\u5E8F + \u5206\u9875\u3002\u6392\u5E8F\u642C\u5230\u8FD9\u513F\u800C\u4E0D\u662F\u7559\u5728\u7B5B\u9009\u6761\u91CC \u2014\u2014
		   \u5B83\u51B3\u5B9A"\u7ED3\u679C\u600E\u4E48\u6392"\uFF0C\u662F\u5217\u8868\u81EA\u5DF1\u7684\u4E8B\uFF0C\u6539\u5B8C\u5F53\u573A\u751F\u6548\u3002 */
		.jh-listbar-right{display:flex;align-items:center;gap:12px;margin-left:auto}
		.jh-sort{display:inline-flex;align-items:center;gap:6px}
		.jh-sort-label{font-size:12px;color:var(--jh-muted-fg)}
		.jh-sort-select{width:auto}
		.jh-jobs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		/* \u5361\u7247 = \u9009\u62E9\u4E3B\u533A\u57DF + \u53F3\u4FA7\u884C\u5185\u52A8\u4F5C\u7AD6\u6392\uFF08\u6253\u62DB\u547C / \u6295\u9012\u7B80\u5386 / \u5212\u6389\uFF09\u3002\u5217\u6210\u4E00\u884C\u662F\u56E0\u4E3A
		   \u4E3B\u6309\u94AE\u6A2A\u8D2F\u6574\u5F20\u5361\uFF0C\u884C\u5185\u6309\u94AE\u4E0D\u80FD\u5D4C\u8FDB\u5B83\u5185\u90E8\uFF08button \u4E0D\u80FD\u5957 button\uFF09\uFF1B\u628A\u5B83\u4EEC\u5E73\u653E\u5728\u4E3B\u6309\u94AE\u53F3\u8FB9\u3002 */
		.jh-job-row{display:flex;align-items:stretch;gap:8px}
		.jh-job-row .jh-job{flex:1 1 auto}
		.jh-job-quick{display:flex;flex-direction:column;gap:6px;justify-content:center;flex:0 0 auto}
		.jh-job-qk{width:34px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
		  background:transparent;color:var(--jh-muted-fg);cursor:pointer;font-size:15px;line-height:1}
		.jh-job-qk:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);
		  background:var(--dsw-alias-interactive-bg-hover)}
		.jh-job-qk:disabled{opacity:.5;cursor:default}
		/* \u5212\u6389\uFF08ignored\uFF09\u662F\u8FD9\u4E00\u5217\u552F\u4E00\u7684\u5904\u7F6E\u6001\u5F00\u5173\uFF0C\u9009\u4E2D\u540E\u67D3\u7EA2\uFF1A\u4E0E\u8BE6\u60C5\u91CC\u7684\u52A8\u4F5C\u6761\u540C\u4E00\u5957\u8BED\u4E49\u3002
		   \u2500\u2500 \u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF08\u5BA1\u6838 P1-3\uFF09\uFF1A\u8FD9\u91CC\u539F\u5148\u662F state-error-primary\uFF08\u6D45\u8272 #ec1313\uFF09\u2014\u2014
		   \u540C\u4E00\u4EFD\u6837\u5F0F\u5728 .jh-btn-danger \u7684\u6CE8\u91CA\u91CC\u65E9\u5C31\u91CF\u8FC7"\u5B83\u5F53\u5C0F\u5B57\u538B\u5728\u6D45\u8272\u9762\u4E0A\u53EA\u6709 2.54:1"\uFF0C
		   \u53EA\u662F\u6CA1\u63A8\u5E7F\u5230\u8FD9\u4E00\u5904\u3002\u5B57\u5F62\u4E0E\u63CF\u8FB9\u7EDF\u4E00\u6539\u8D70 --jh-error-fg\uFF08\u6DF1\u8272\u53D8\u4F53\uFF09\u3002 */
		.jh-job-qk-ign{color:var(--jh-error-fg);border-color:var(--jh-error-fg);
		  background:var(--dsw-alias-interactive-bg-active)}
		/* \u5361\u7247\u5FC5\u987B\u6709\u8FB9\u754C\uFF1A\u767D\u5E95 + 4% \u63CF\u8FB9\u753B\u5728\u767D\u9875\u9762\u4E0A\u7B49\u4E8E\u6CA1\u6709\u5361\u7247\uFF0C\u6EDA\u52A8\u65F6\u5BB9\u6613\u770B\u4E32\u884C\u3002
		   \u9634\u5F71\u4E0D\u5199\u6B7B\u9ED1\u8272\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P2-10\uFF09\uFF1A\u989C\u8272\u4E00\u5F8B\u8D70\u4E3B\u9898\u53D8\u91CF\uFF0C\u8FD9\u91CC\u7528 label-primary
		   \u7684\u6DF7\u8272 \u2014\u2014 \u6DF1\u8272\u4E3B\u9898\u4E0B\u5B83\u662F\u6D45\u8272\uFF0C\u9634\u5F71\u968F\u4E4B\u53D8\u6210\u4E00\u5C42\u6781\u6DE1\u7684\u6D45\u8272\u8FB9\u7F18\uFF0C\u4ECD\u7136\u8BFB\u4F5C"\u6D6E\u8D77"\uFF1B
		   \u5199\u6B7B rgba(0,0,0,\xB7) \u7684\u8BDD\u5728\u6DF1\u8272\u5E95\u4E0A\u4F1A\u5F7B\u5E95\u6D88\u5931\uFF0C\u800C\u60AC\u6D6E\u4E0E\u9009\u4E2D\u6B63\u662F\u9760\u5B83\u8868\u8FBE\u62AC\u5347\u3002 */
		.jh-job{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;cursor:pointer;
		  box-sizing:border-box;padding:12px 14px;border-radius:10px;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);
		  box-shadow:0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
		  color:var(--dsw-alias-label-primary);transition:border-color .12s,box-shadow .12s}
		.jh-job:hover{border-color:var(--dsw-alias-border-l4);
		  box-shadow:0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)}
		/* \u9009\u4E2D\uFF1A\u52A0\u6DF1\u63CF\u8FB9 + \u66F4\u5B9E\u7684\u5E95\u3002
		   \u4E0D\u518D\u7528 inset \u5DE6\u4FA7\u8272\u6761 \u2014\u2014 \u5361\u7247\u5DE6\u8FB9\u6302\u4E00\u6761\u7AD6\u7EBF\u5728\u5BC6\u96C6\u5217\u8868\u91CC\u5F88\u5435\uFF0C
		   \u800C\u4E14\u548C"\u8FB9\u6846"\u91CD\u590D\u8868\u8FBE\u4E86\u4E24\u904D\u3002 */
		.jh-job-active{border-color:var(--dsw-alias-brand-primary);
		  background:var(--dsw-alias-interactive-bg-active);
		  box-shadow:0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)}
		.jh-job-main{flex:1 1 auto;min-width:0}
		/* \u2500\u2500 \u6807\u9898\u4E0E\u85AA\u8D44\u7684\u5C42\u7EA7\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P2-13\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u4E0A\u4E00\u7248\u6807\u9898 14.5px\u3001\u85AA\u8D44 15px\uFF1A\u4E24\u4E2A\u6700\u8BE5\u88AB\u626B\u5230\u7684\u5B57\u6BB5\u53EA\u5DEE 0.5px\uFF0C\u800C\u4E14**\u85AA\u8D44\u66F4\u5927** \u2014\u2014
		   \u4E0E\u540C\u6587\u4EF6\u91CC"13 \u4E0E 12.5 \u53EA\u5DEE 0.5px\uFF0C\u6807\u9898\u5C42\u7EA7\u7B49\u4E8E\u4E0D\u5B58\u5728"\u7684\u5224\u636E\u81EA\u76F8\u77DB\u76FE\u3002
		   \u73B0\u5728\u628A\u987A\u5E8F\u6446\u6B63\u5E76\u62C9\u5F00\u4E00\u6574\u6863\uFF1A\u6807\u9898 15px\uFF08\u6BD4\u6B63\u6587 13px \u9AD8\u4E00\u6863\uFF0C\u662F\u8FD9\u5F20\u5361\u7684\u7B2C\u4E00\u773C\uFF09\uFF0C
		   \u85AA\u8D44 14px/700 + \u4E1A\u52A1\u8272\uFF08\u9760\u5B57\u91CD\u4E0E\u989C\u8272\u4FDD\u6301\u9192\u76EE\uFF0C\u4E0D\u518D\u9760\u538B\u8FC7\u6807\u9898\u7684\u5B57\u53F7\uFF09\u3002 */
		.jh-job-title{font-size:15px;font-weight:600;margin:0 0 3px;line-height:1.5}
		.jh-job-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;
		  font-size:12px;color:var(--dsw-alias-label-secondary)}
		/* \u85AA\u8D44\u7684\u989C\u8272\u8D70 --jh-business-fg\uFF1Astate-business-primary \u76F4\u63A5\u5F53\u6587\u5B57\u8272\u5728\u767D\u8272\u5361\u7247\u4E0A\u53EA\u6709
		   4.23:1\uFF0C\u800C 14px/700 \u4E5F\u591F\u4E0D\u4E0A"\u5927\u6587\u672C"\u95E8\u69DB\uFF08\u9700 \u226518.66px \u4E14 \u2265700\uFF09\u2192 \u5FC5\u987B 4.5:1\u3002
		   \u6DF7\u8272\u540E\u5B9E\u6D4B\u6D45\u8272 4.51:1\u3001\u6DF1\u8272 8.78:1\u3002 */
		.jh-salary{font-size:14px;font-weight:700;color:var(--jh-business-fg)}
		/* \u516C\u53F8\u540D\u662F\u6B21\u8981\u4FE1\u606F\uFF0C\u4F46\u4E5F\u4E0D\u80FD\u6DE1\u5230\u8BFB\u4E0D\u51FA\uFF1A\u7528\u6B63\u6587\u8272 */
		.jh-job-company{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;
		  color:var(--dsw-alias-label-primary)}
		/* \u6765\u6E90\uFF08\u5E73\u53F0\uFF09\u4E0E\u65B0\u9C9C\u5EA6\uFF1A\u5361\u7247\u4E0A\u7684\u7B2C\u4E09\u6863\u4FE1\u606F\uFF0C\u6392\u5728\u6807\u7B7E\u4E4B\u524D\u3001\u6BD4 meta \u66F4\u6DE1\u3002
		   \u2500\u2500 \u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF08\u5BA1\u6838 P1-2\uFF09\uFF1A\u5B83\u539F\u5148\u662F label-tertiary\uFF0C\u6D45\u8272 #81858c \u914D\u767D\u53EA\u6709 3.71:1\u3002
		   \u8FD9\u91CC\u5199\u7684\u4E0D\u662F\u88C5\u9970\uFF0C\u662F"\u8FD9\u5C97\u591A\u4E45\u6CA1\u51FA\u73B0\u4E86"\u8FD9\u79CD\u8981\u8BFB\u7684\u5224\u65AD\u4F9D\u636E\uFF0C\u800C\u4E14\u540C\u6587\u4EF6\u4E0B\u65B9\u7684
		   PAGER_CONTRAST_FIX \u65E9\u5C31\u4E3A"\u9875\u7801\u7701\u7565\u53F7"\u4E0B\u8FC7\u540C\u6837\u7684\u7ED3\u8BBA \u2014\u2014 \u53EA\u662F\u6CA1\u63A8\u5E7F\u5230\u8FD9\u4E00\u6761\u3002
		   \u7EDF\u4E00\u8D70 --jh-muted-fg\uFF1A\u6D45\u8272 5.22:1\u3001\u6DF1\u8272 6.76:1\u3002 */
		.jh-job-origin{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 0;
		  font-size:11.5px;color:var(--jh-muted-fg)}
		/* \u6807\u7B7E\u884C\u5728\u5217\u8868\u5361\u91CC\u7684\u4E0A\u95F4\u8DDD\uFF08\u5BB9\u5668\u672C\u8EAB\u7684\u552F\u4E00\u5B9A\u4E49\u5728 primitives \u7684 .jh-tags\uFF09 */
		.jh-job-main .jh-tags{margin-top:6px}
		/* \u91CD\u53D6\u671F\u95F4\u7684\u63D0\u793A\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P2-6\uFF09\uFF1A\u5217\u8868\u4E0D\u518D\u6574\u5757\u6D88\u5931\uFF0C\u800C\u662F\u5C31\u5730\u8BF4\u660E\u5728\u66F4\u65B0 */
		.jh-refreshing{font-size:12px;color:var(--jh-muted-fg)}
		/* \u56DE\u6267\u884C\u9996\u7684\u5C0F\u6807\u8BB0\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P3\uFF09\uFF1A\u539F\u6765\u662F \u2705/\u274C emoji \u2014\u2014 \u4E0E
		   "\u624B\u753B SVG \u662F\u56E0\u4E3A\u5B57\u5F62\u5728\u90E8\u5206\u4E2D\u6587\u5B57\u4F53\u91CC\u4F1A\u9000\u56DE\u8C46\u8150\u5757"\u90A3\u5957\u7406\u7531\u6B63\u597D\u76F8\u53CD\uFF0C
		   \u800C\u4E14\u5404\u5E73\u53F0\u5B57\u5F62\u4E0D\u4E00\u81F4\u3002\u8FD9\u91CC\u7528\u5B83\u65C1\u8FB9\u90A3\u4E24\u679A SVG\uFF08\u89C1 jobs \u76EE\u5F55\u7684 icons.tsx\uFF09\u3002 */
		.jh-receipt-mark{display:inline-flex;align-items:center;vertical-align:-3px;margin-right:4px}
		.jh-receipt-mark svg{display:block}
		`;
		var JOBS_DEDUP = `
		/* \u2500\u2500 \u8DE8\u5E73\u53F0\u53BB\u91CD\uFF08\u6279\u6B21 4\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5FBD\u7AE0\u662F**\u8BFB\u6570**\u4E0D\u662F\u64CD\u4F5C\uFF08\u64CD\u4F5C\u662F\u5361\u7247\u4E0B\u9762\u90A3\u679A\u300C\u8DE8\u5E73\u53F0\u5BF9\u7167\u300D\u5F00\u5173\uFF09\uFF0C\u6240\u4EE5\u5B83\u505A\u6210\u4E00\u679A
		   \u4F4E\u8C03\u7684\u63CF\u8FB9\u80F6\u56CA\uFF1A\u989C\u8272\u7528 label-secondary \u800C\u4E0D\u662F\u54C1\u724C\u8272 \u2014\u2014 \u5B83\u8868\u8FBE\u7684\u662F
		   "\u8FD9\u6761\u5C97\u4F4D\u5728\u522B\u5904\u4E5F\u6709\u4E00\u4EFD"\uFF0C\u4E0D\u662F"\u8FD9\u662F\u91CD\u70B9"\u3002 */
		.jh-dedup-badge{display:inline-block;padding:0 6px;border-radius:999px;
		  border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);
		  font-size:10.5px;line-height:16px}
		/* \u884C\u5185\u4E09\u4E2A\u52A8\u4F5C\uFF08\u6253\u62DB\u547C / \u6295\u9012\u7B80\u5386 / \u5212\u6389\uFF09**\u5F62\u72B6\u5B8C\u5168\u4E00\u81F4**\uFF1A\u90FD\u662F 34px \u65B9\u5757 + \u4E00\u4E2A\u56FE\u6807\u3002
		   \u8FD9\u4E00\u5217\u4E0D\u968F\u6587\u6848\u957F\u77ED\u6296\u52A8\uFF0C\u4E5F\u4E0D\u5403\u5361\u7247\u5BBD\u5EA6\uFF1B\u52A8\u4F5C\u542B\u4E49\u7531 tooltip \u4E0E aria-label \u8BF4\u3002
		   \u56FE\u6807\u662F 14px \u624B\u753B SVG\uFF08\u89C1 jobs.tsx \u7684 IconChat / IconSend\uFF09\uFF0C\u4E0E 15px \u7684 \u2715 / \u2605 \u5B57\u5F62
		   \u540C\u4E00\u6863\u89C6\u89C9\u91CD\u91CF \u2014\u2014 \u4E00\u5217\u91CC\u6DF7\u7740\u5B57\u5F62\u56FE\u6807\u548C SVG \u56FE\u6807\uFF0C\u9760\u7684\u662F\u5C3A\u5BF8\u5BF9\u9F50\uFF0C\u4E0D\u662F\u989C\u8272\u3002 */
		/* \u4E09\u4E2A\u65B9\u5757\u5171\u7528\u540C\u4E00\u5957\u5C45\u4E2D\uFF1A\u5B57\u5F62\uFF08\u2715\uFF09\u4E0E SVG \u7684\u57FA\u7EBF\u5B8C\u5168\u4E0D\u540C\uFF0C\u4EA4\u7ED9 flex \u5C45\u4E2D\u624D\u4E0D\u4F1A
		   \u4E00\u4E2A\u504F\u4E0A\u4E00\u4E2A\u504F\u4E0B\u3002 */
		.jh-job-quick .jh-job-qk{display:inline-flex;align-items:center;justify-content:center}
		.jh-job-quick .jh-job-qk svg{display:block}
		/* \u8DE8\u5E73\u53F0\u5BF9\u7167\u7684\u5F00\u5173\uFF1A\u6392\u5728\u5361\u7247**\u4E0B\u9762**\uFF08\u5361\u7247\u81EA\u5DF1\u662F\u4E2A\u6309\u94AE\uFF0C\u91CC\u9762\u585E\u4E0D\u8FDB\u6309\u94AE\uFF09\uFF0C
		   \u6240\u4EE5\u7528\u4E00\u679A\u4F4E\u8C03\u7684\u6587\u5B57\u5F00\u5173\uFF0C\u800C\u4E0D\u662F\u518D\u505A\u4E00\u4E2A\u65B9\u5757 \u2014\u2014 \u5B83\u662F\u5BF9\u4E00\u884C\u6570\u636E\u7684"\u5C55\u5F00\u8BFB\u6570"\uFF0C
		   \u4E0D\u662F\u5BF9\u5C97\u4F4D\u7684\u52A8\u4F5C\u3002 */
		.jh-dedup-toggle{margin:4px 0 0 10px;padding:2px 8px;
		  border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;
		  color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:18px;cursor:pointer}
		.jh-dedup-toggle:hover{border-color:var(--dsw-alias-border-l4);
		  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
		.jh-dedup-toggle-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);
		  background:var(--dsw-alias-interactive-bg-active)}
		/* \u5C55\u5F00\u7684\u5BF9\u7167\u9762\u677F\uFF1A\u8D34\u5728\u90A3\u4E00\u884C\u4E0B\u9762\uFF0C\u5DE6\u8FB9\u7EBF\u4E0E\u5361\u7247\u5BF9\u9F50\uFF0C\u8BA9\u4EBA\u770B\u51FA\u5B83\u5C5E\u4E8E\u54EA\u4E00\u884C */
		.jh-dedup-pane{margin:6px 0 2px 10px;padding:8px 10px;border-left:2px solid var(--dsw-alias-border-l3);
		  display:flex;flex-direction:column;gap:6px}
		.jh-dedup-pane .jh-table-matrix{min-width:0}
		`;
		var PAGER = `
		/* \u5206\u9875\u5668\uFF1A\u53EA\u6709"\u4E0A\u4E00\u9875/\u4E0B\u4E00\u9875"\u4E24\u4E2A\u6587\u5B57\u6309\u94AE\u65F6\uFF0C\u7528\u6237\u4E0D\u77E5\u9053\u603B\u5171\u6709\u591A\u5C11\u9875 */
		.jh-pager{display:flex;align-items:center;gap:4px;margin-left:auto}
		.jh-pg{min-width:28px;height:28px;padding:0 8px;font-size:12.5px;cursor:pointer;
		  border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;
		  color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
		.jh-pg:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
		.jh-pg:disabled{opacity:.4;cursor:default}
		.jh-pg-active{border-color:transparent;font-weight:600;
		  background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
		`;
		var PAGER_CONTRAST_FIX = `
		/* \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF1A\u4E0B\u9762\u8FD9\u51E0\u5904\u539F\u672C\u7528 label-tertiary\uFF0C\u6D45\u8272 #81858c \u914D\u767D\u53EA\u6709 3.71:1\u3002
		   \u5B83\u4EEC\u90FD\u662F**\u8981\u8BFB\u7684**\u6587\u672C\uFF08\u9875\u7801\u7701\u7565\u53F7\u3001\u5931\u5206\u6743\u91CD\u3001\u5C97\u4F4D\u7F16\u53F7\u3001\u770B\u677F\u8BA1\u6570\u3001\u8BF4\u660E\u56FE\u6807\uFF09\uFF0C
		   \u4E0D\u662F\u53EF\u5FFD\u7565\u7684\u88C5\u9970 \u2014\u2014 \u540C\u6587\u4EF6 :801-804 \u5C31\u4E3A .jh-field-flag \u4E0B\u8FC7\u8FD9\u4E2A\u7ED3\u8BBA\u3002
		   \u7EDF\u4E00\u8D70 --jh-muted-fg\uFF1A\u6D45\u8272 9.59:1\u3001\u6DF1\u8272 11.15:1\u3002 */
		.jh-pg-gap{color:var(--jh-muted-fg);padding:0 2px}
		`;
		var JOBS_SPLIT = `
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
		/* \u2500\u2500 \u7A84\u9762\u677F / \u89E6\u5C4F\u6863\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P2-11 \u4E0E P3\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u4E24\u4EF6\u4E8B\u90FD\u8DDF\u7740**\u9762\u677F**\u5BBD\u5EA6\u8D70\uFF0C\u6240\u4EE5\u7528 container query\uFF0C\u800C\u4E0D\u662F max-width:480px \u90A3\u6761
		   \u89C6\u53E3\u67E5\u8BE2\uFF1A\u9762\u677F\u88AB\u6324\u5230 400px \u65F6\u7A97\u53E3\u53EF\u80FD\u8FD8\u6709 1400px \u5BBD\uFF08responsive.ts \u91CC\u90A3\u7EC4
		   .jh-col-hide-sm \u5C31\u662F\u6309\u89C6\u53E3\u7B97\u7684\uFF0C\u5728\u8FD9\u4E00\u5C4F\u4F1A\u5931\u7075 \u2014\u2014 \u660E\u7EC6\u8868\u4F1A\u6A2A\u5411\u6EA2\u51FA\u800C\u4E0D\u662F\u9690\u85CF\u5217\uFF09\u3002 */
		@container (max-width: 520px){
		  .jh-job-pick{padding:6px}
		  .jh-job-pick input{width:24px;height:24px}
		}
		@container (max-width: 480px){
		  .jh-dedup-pane .jh-col-hide-sm{display:none}
		}
		`;

		// src/client/styles/views/job-detail.ts
		var MATCH_AND_FLAGS = `
		/* \u2500\u2500 P4\uFF1A\u5339\u914D\u5206\u4E0E\u98CE\u9669\u6807\u6CE8 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-job-signals{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}
		.jh-score{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;
		  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
		/* \u5206\u6570\u5DF2\u8FC7\u671F\uFF08\u7B2C\u4E94\u8F6E\uFF0C\u6279\u6B21 A2\uFF09\uFF1A\u6362\u7B80\u5386\u4E4B\u540E\u5E93\u91CC\u90A3\u4E2A\u5206\u5C31\u4E0D\u518D\u4EE3\u8868"\u5F53\u524D\u5339\u914D\u5EA6"\u3002
		   \u5B83\u4ECD\u7136\u6709\u4FE1\u606F\u91CF\uFF08\u65E7\u7B80\u5386\u4E0B\u7684\u76F8\u5BF9\u6392\u5E8F\uFF09\uFF0C\u6240\u4EE5**\u4E0D\u9690\u85CF\u3001\u4E0D\u5220\u6389**\uFF0C\u53EA\u662F\u4E0D\u518D\u770B\u8D77\u6765
		   \u548C\u5F53\u524D\u5206\u6570\u4E00\u6837\u53EF\u4FE1\uFF1A\u53BB\u6389\u586B\u5145\u3001\u6587\u5B57\u8F6C muted\u3002\u5F62\u72B6\u4E0D\u53D8 \u2192 \u4E0D\u4F1A\u9020\u6210\u884C\u9AD8\u8DF3\u52A8\u3002
		   "\u4E3A\u4EC0\u4E48\u8FC7\u671F"\u7531\u6587\u5B57\u4E0E tooltip \u8BF4\u660E\uFF08\u89C1 job-row \u7684\u300C\uFF08\u6309\u65E7\u7B80\u5386\uFF09\u300D\uFF09\u3002 */
		.jh-score-stale{background:transparent;color:var(--jh-muted-fg);
		  box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l3)}
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
		`;
		var DETAIL = `
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
		/* \u63D0\u793A\u5217\u8868\uFF1A**\u4E00\u6761\u4E00\u884C**\u3002\u4E0A\u4E00\u7248\u662F"\xB7 \u63D0\u793A\u4E00 \xB7 \u63D0\u793A\u4E8C"\u8FDE\u6392\u6210\u4E00\u6BB5\uFF0C
		   \u8BFB\u8D77\u6765\u662F\u4E00\u5757\u6587\u5B57\u800C\u4E0D\u662F\u51E0\u6761\u53EF\u9010\u6761\u5904\u7406\u7684\u4E8B\uFF08\u8BC4\u5BA1\u539F\u8BDD\uFF1A"\u6587\u5B57\u7011\u5E03"\uFF09\u3002 */
		.jh-alert-list{margin:0;padding-left:18px;font-size:12.5px;line-height:1.7;
		  color:var(--dsw-alias-label-primary)}
		.jh-alert-list li{margin:2px 0}

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

		/* JD \u539F\u6587\u3002\u6293\u4E0B\u6765\u7684\u6587\u672C\u81EA\u5E26\u6362\u884C\u4E0E\u7F29\u8FDB\uFF08\u5217\u8868\u9879\u3001\u7A7A\u884C\uFF09\uFF0Cpre-wrap \u539F\u6837\u4FDD\u7559\uFF1B
		   anywhere \u9632\u6B62\u957F\u4E32\uFF08URL\u3001\u65E0\u7A7A\u683C\u82F1\u6587\uFF09\u628A\u5361\u7247\u6491\u5BBD\u3002
		   \u989C\u8272\u523B\u610F\u7528 primary \u800C\u4E0D\u662F secondary \u2014\u2014 \u8FD9\u662F\u8981\u8BFB\u7684\u6B63\u6587\uFF0C\u4E0D\u662F\u8BF4\u660E\u6587\u5B57\u3002 */
		.jh-jd{margin:0 0 8px;font-size:13px;line-height:1.75;white-space:pre-wrap;
		  overflow-wrap:anywhere;color:var(--dsw-alias-label-primary)}
		`;
		var TAILOR_AND_FILE = `
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
		`;
		var COMPANY_REVIEW_AND_SIBLINGS = `
		/* \u4EBA\u5DE5\u590D\u6838\u6761\uFF1A\u4E0E\u4E0A\u9762\u7684\u753B\u50CF\u7EDF\u8BA1\u7528\u4E00\u6761\u5206\u9694\u7EBF\u9694\u5F00 \u2014\u2014 \u4E0A\u9762\u662F**\u89C4\u5219\u7B97\u7684**\uFF0C
		   \u4E0B\u9762\u662F**\u4F60\u5199\u7684**\uFF0C\u4E24\u8005\u6027\u8D28\u4E0D\u540C\uFF0C\u4E0D\u8BE5\u6DF7\u6210\u4E00\u7247\u3002 */
		.jh-review{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0 0;
		  padding:10px 0 0;border-top:1px solid var(--dsw-alias-border-l1)}
		.jh-review-field{display:inline-flex;align-items:center;gap:6px;font-size:12px;
		  color:var(--dsw-alias-label-secondary)}

		/* \u300C\u8FD9\u5BB6\u516C\u53F8\u7684\u5176\u5B83\u5C97\u4F4D\u300D\uFF1A\u6574\u884C\u53EF\u70B9\uFF08\u5207\u5230\u90A3\u4E2A\u5C97\u4F4D\u7684\u8BE6\u60C5\uFF09\u3002
		   \u7528\u5757\u7EA7\u6587\u672C\u6309\u94AE\u800C\u4E0D\u662F\u4E0B\u5212\u7EBF\u94FE\u63A5 \u2014\u2014 \u4E00\u6392\u5341\u51E0\u6761\u4E0B\u5212\u7EBF\u5728\u8BE6\u60C5\u680F\u91CC\u592A\u5435\u3002 */
		.jh-siblings{list-style:none;margin:0;padding:0}
		.jh-siblings li{margin:0}
		.jh-sibling{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;width:100%;
		  text-align:left;border:0;background:transparent;font:inherit;font-size:12.5px;
		  padding:5px 6px;border-radius:6px;color:var(--dsw-alias-label-primary)}
		.jh-sibling:hover{background:var(--dsw-alias-interactive-bg-hover)}
		/* \u62BD\u5C49\u91CC\u6CA1\u6709"\u5207\u6362\u5C97\u4F4D"\u7684\u4E0A\u4E0B\u6587\uFF0C\u6E32\u67D3\u6210\u7EAF\u6587\u672C \u2014\u2014 \u5220\u6389 hover \u53CD\u9988\u514D\u5F97\u770B\u7740\u50CF\u80FD\u70B9 */
		.jh-sibling-static{cursor:default}
		.jh-sibling-static:hover{background:transparent}
		.jh-sibling-meta{color:var(--dsw-alias-label-secondary);font-size:11.5px}
		`;

		// src/client/styles/screens/messages.ts
		var MESSAGES = `
		.jh-messages,.jh-interviews{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
		.jh-message,.jh-interview{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
		  background:var(--dsw-alias-bg-layer-1)}
		.jh-message-hr{border-color:var(--dsw-alias-brand-primary)}
		.jh-message-me{border-color:var(--dsw-alias-border-l2)}
		.jh-message-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px}
		.jh-message-body{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
		.jh-message-reply{display:flex;flex-direction:column;gap:6px;margin-top:6px}
		.jh-interview-conflict{border-color:var(--dsw-alias-state-warn-primary)}
		`;

		// src/client/styles/screens/pipeline.ts
		var PIPELINE_GROUP = `
		/* \u2500\u2500 P7\uFF1A\u6D41\u6C34\u7EBF\u770B\u677F / \u6D88\u606F / \u9762\u8BD5 / \u6570\u636E\u770B\u677F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		`;
		var PIPELINE = `
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
		`;

		// src/client/styles/screens/resumes.ts
		var RESUMES = `
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
		/* \u5361\u7247\u6807\u9898\u884C\u91CC\u7684\u7D27\u51D1\u4E0B\u62C9\uFF1Awidth:100% \u53EA\u5728\u8868\u5355\u91CC\u5408\u7406\uFF0C\u653E\u8FDB\u6807\u9898\u884C\u4F1A\u6491\u6EE1\u6574\u884C\u3002 */
		.jh-select-inline{width:auto;flex:0 0 auto;max-width:200px;padding:3px 8px;font-size:12px}
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
		`;

		// src/client/styles/primitives.ts
		var SCREEN = `
		/* \u2500\u2500 \u5C4F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
		.jh-screen{padding:16px 18px;max-width:1000px}
		.jh-card{max-width:1000px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
		  background:var(--dsw-alias-bg-layer-1);padding:14px 16px;margin:0 0 12px}
		.jh-card-tight{padding:12px 14px;margin:14px 0}
		`;
		var CARD_TITLE = `
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
		`;
		var CONTROLS = `
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
		/* \u7528 a \u5F53\u6309\u94AE\uFF08\u5BFC\u51FA\u7684\u4E0B\u8F7D\u94FE\u63A5\uFF09\uFF1A\u53BB\u6389\u94FE\u63A5\u4E0B\u5212\u7EBF\uFF0C\u5426\u5219"\u6309\u94AE\u4E0A\u5E26\u4E0B\u5212\u7EBF"\u770B\u7740\u50CF\u6CA1\u505A\u5B8C */
		a.jh-btn{display:inline-block;text-decoration:none;text-align:center}
		/* \u6279\u91CF\u6253\u62DB\u547C\u5F39\u7A97\u91CC\u7684\u6B63\u6587\u7F16\u8F91\u6846\uFF1A\u5B83\u662F\u4E3B\u5185\u5BB9\uFF08\u7528\u6237\u8981\u9010\u6761\u8BFB\u4E00\u904D\u518D\u53D1\uFF09\uFF0C\u6240\u4EE5\u7ED9\u5B83\u6574\u884C\u5BBD\u5EA6\u4E0E\u53EF\u8BFB\u884C\u9AD8 */
		.jh-greeting-edit{width:100%;margin:4px 0 2px;resize:vertical;font:inherit;line-height:1.5;box-sizing:border-box}
		/* \u6279\u91CF\u5DE5\u5177\u6761\uFF1A\u4E0E"\u5DF2\u52FE\u9009\u7684\u884C"\u8D34\u5728\u4E00\u8D77\uFF08\u540C plan-editor \u7684\u8868\u683C\u5DE5\u5177\u6761\uFF09 */
		.jh-picked{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px;
		  padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px}
		/* \u5C97\u4F4D\u884C\u524D\u7684\u52FE\u9009\u6846\uFF1A\u5355\u72EC\u4E00\u5217\uFF0C\u4E0D\u4E0E"\u70B9\u5F00\u8BE6\u60C5"\u62A2\u70B9\u51FB\u533A\u57DF\u3002
		   \u2500\u2500 \u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF08\u5BA1\u6838 P2-11\uFF09\uFF1A\u5B83\u539F\u5148\u662F\u4E2A**\u4E0D\u5305 label \u7684\u88F8 input**\uFF0C\u547D\u4E2D\u533A\u5C31\u662F\u63A7\u4EF6
		   \u81EA\u8EAB\uFF08\u5B9E\u6D4B\u7EA6 13\xD713px\uFF09\uFF0C\u53C8\u548C\u76F8\u90BB\u7684\u5361\u7247\u6309\u94AE\u53EA\u9694 8px \u2014\u2014 \u89E6\u5C4F\u4E0A\u5F88\u5BB9\u6613\u70B9\u6210"\u6253\u5F00\u8BE6\u60C5"\uFF0C
		   \u800C\u4E14\u4F4E\u4E8E WCAG 2.2 AA 2.5.8 \u7684 24\xD724\u3002\u73B0\u5728\u5305\u6210 label\uFF08\u6574\u5757\u90FD\u80FD\u52FE\uFF09\u3001\u63A7\u4EF6\u63D0\u5230 18px\u3001
		   \u56DB\u5468\u7559 4\u20135px \u5185\u8FB9\u8DDD\uFF0C\u547D\u4E2D\u533A\u7EA6 26\xD726\uFF1B\u66F4\u5BBD\u7684\u76EE\u6807\u5728\u4E0B\u9762\u90A3\u7EC4\u5BB9\u5668\u67E5\u8BE2\u91CC\u7ED9\u89E6\u5C4F\u6863\u3002 */
		.jh-job-pick{display:flex;align-items:center;justify-content:center;align-self:flex-start;
		  margin-top:1px;padding:4px 5px;border-radius:6px;cursor:pointer}
		.jh-job-pick:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.jh-job-pick input{width:18px;height:18px;margin:0;cursor:pointer}
		/* \u9AD8\u5371\u52A8\u4F5C\u7684\u786E\u8BA4\u6587\u6848\uFF08\u5BBF\u4E3B renderApproval \u7ED9\u7684\u591A\u884C\u6587\u672C\uFF09\u3002
		   \u5FC5\u987B\u539F\u6837\u4FDD\u7559\u6362\u884C\uFF1A\u90A3\u4E9B\u884C\u5404\u662F\u4E00\u4EF6\u4E8B\uFF08\u5E73\u53F0/\u5C97\u4F4D/\u7528\u4E86\u54EA\u7248\u7B80\u5386/\u540C\u65F6\u4F1A\u53D1\u751F\u4EC0\u4E48\uFF09\uFF0C
		   \u6298\u6210\u4E00\u5768\u4E4B\u540E\u7528\u6237\u5C31\u6CA1\u6CD5\u9010\u884C\u6838\u5BF9\u4E86\u3002 */
		.jh-approval{white-space:pre-wrap;margin:0;font:inherit;font-size:13px;line-height:1.6;
		  padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;
		  background:var(--dsw-alias-interactive-bg-hover);overflow-x:auto}
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
		/* \u56FE\u6807\u6309\u94AE\uFF1A\u547D\u4E2D\u533A\u6709\u4E0B\u9650\u3002
		   \u2500\u2500 \u539F\u6765 padding:2px 6px + font-size:18px + line-height:1 = **22\xD722px**\uFF0C
		   WCAG 2.5.8\uFF08AA\uFF09\u8981\u6C42 24\xD724\u3002\u8FD9\u4E2A\u7C7B\u88AB\u6BCF\u4E2A\u5F39\u7A97\u7684\u5173\u95ED\u952E\u4E0E\u53CD\u9988\u6761\u5173\u95ED\u952E\u5171\u7528\uFF0C
		   \u662F\u6574\u4E2A\u754C\u9762\u91CC\u6700\u5E38\u88AB\u70B9\u3001\u53C8\u6700\u5BB9\u6613\u88AB\u70B9\u6B6A\u7684\u4E24\u4E2A\u63A7\u4EF6\u4E4B\u4E00\u3002
		   min-* \u53EA\u5728\u5185\u5BB9\u5C0F\u4E8E 24px \u65F6\u8D77\u4F5C\u7528\uFF0C\u6240\u4EE5\u4E0D\u4F1A\u628A\u672C\u6765\u5C31\u5927\u7684\u56FE\u6807\u6309\u94AE\u6491\u5F00\u3002 */
		.jh-icon-btn{display:inline-flex;align-items:center;justify-content:center;
		  min-width:24px;min-height:24px;
		  border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1;
		  padding:2px 6px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
		.jh-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}

		/* \u2500\u2500 \u952E\u76D8\u805A\u7126\u73AF\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P3\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u8F93\u5165\u7C7B\u63A7\u4EF6\u4E00\u76F4\u6709\u805A\u7126\u6837\u5F0F\uFF08\u89C1 .jh-input\uFF09\uFF0C\u4F46\u8FD9\u4E00\u6279**\u81EA\u7ED8\u6309\u94AE**\u6B64\u524D\u4E00\u5904\u90FD\u6CA1\u6709\uFF1A
		   chip / \u5206\u9875 / \u5C97\u4F4D\u5361\u7247 / \u884C\u5185\u52A8\u4F5C / \u6298\u53E0\u5F00\u5173 / \u56FE\u6807\u6309\u94AE / \u6807\u7B7E\u9875\u5168\u9760 UA \u9ED8\u8BA4\u73AF \u2014\u2014
		   \u5F62\u72B6\u4E0E\u53EF\u89C1\u5EA6\u4E0D\u7531\u6211\u4EEC\u63A7\u5236\uFF0C\u6DF1\u6D45\u4E24\u5957\u4E3B\u9898\u4E0B\u4E5F\u4E0D\u7EDF\u4E00\u3002
		   \u8FD9\u91CC\u7EDF\u4E00\u6210\u4E0E\u8F93\u5165\u6846\u540C\u4E00\u5957\u8BED\u8A00\uFF1A2px \u4E3B\u9898\u8272\u63CF\u8FB9 + 2px \u504F\u79FB\uFF08\u4E0D\u5360\u5E03\u5C40\u3001\u4E0D\u5F15\u8D77\u91CD\u6392\uFF09\u3002
		   \u6CE8\u610F\u53EA\u8986\u76D6\u771F\u6B63\u53EF\u805A\u7126\u7684\u5143\u7D20\uFF0C\u4E0D\u7ED9\u88C5\u9970\u6027\u7684 span \u52A0\u3002 */
		.jh-btn:focus-visible,.jh-chip:focus-visible,.jh-pg:focus-visible,.jh-job:focus-visible,
		.jh-job-qk:focus-visible,.jh-dedup-toggle:focus-visible,.jh-jobs-filter-toggle:focus-visible,
		.jh-icon-btn:focus-visible,.jh-link:focus-visible,.jh-tab:focus-visible,.jh-seg:focus-visible,
		.jh-err-chip:focus-visible,.jh-notice-close:focus-visible{
		  outline:2px solid var(--dsw-alias-link);outline-offset:2px}

		.jh-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
		.jh-chip{padding:3px 9px;font-size:12px;line-height:18px;border-radius:999px;cursor:pointer;
		  border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);
		  transition:border-color .12s,background .12s}
		.jh-chip:hover{border-color:var(--dsw-alias-border-l4)}
		.jh-chip-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);
		  background:var(--dsw-alias-interactive-bg-active)}
		/* \u8D1F\u5411\u8FC7\u6EE4\uFF08\u5C4F\u853D\u6807\u6CE8\uFF09\u4E0E\u6B63\u5411\u7B5B\u9009**\u5916\u89C2\u5FC5\u987B\u4E0D\u540C**\uFF1A\u5B83\u4EEC\u7684\u4F5C\u7528\u65B9\u5411\u76F8\u53CD\u3002
		   \u6B63\u5411 chips \u662F"\u6211\u8981\u8FD9\u4E9B"\uFF0C\u8FD9\u91CC\u505A\u6210"\u6211\u8981\u8EB2\u5F00\u8FD9\u4E9B"\u2014\u2014\u6D45\u7EA2\u5E95 + \u7981\u6B62\u56FE\u6807 + \u7EA2\u8272\u6587\u5B57\uFF0C
		   \u9009\u4E2D\u540E\u6574\u5757\u53D8\u5B9E\u5FC3\u7EA2\uFF1A\u4E00\u773C\u80FD\u770B\u51FA"\u6211\u5C4F\u853D\u4E86\u51E0\u4E2A\u5751"\u3002
		   \u914D\u8272\u6CBF\u7528\u672C\u6587\u4EF6\u5DF2\u7ECF\u9A8C\u8BC1\u8FC7\u7684\u7EC4\u5408\uFF1A--jh-error-bg\uFF089% \u6DF7\u8272\uFF09\u914D --jh-error-fg\uFF08\u6DF1\u8272\u53D8\u4F53\uFF09\uFF0C
		   \u9009\u4E2D\u6001\u662F --jh-error-fg \u5B9E\u5E95\u914D label-primary-foreground\uFF08\u4E0E .jh-file-pdf \u540C\u4E00\u914D\u65B9\uFF09\u3002 */
		.jh-chip-neg{display:inline-flex;align-items:center;gap:4px;
		  border-color:transparent;background:var(--jh-error-bg);color:var(--jh-error-fg)}
		/* \u56FE\u6807\u7528 \u2715 \u800C\u4E0D\u662F \u2298\uFF1A\u2715 \u5728\u672C\u9879\u76EE\u91CC\u5DF2\u7ECF\u7528\u7740\uFF08\u5C97\u4F4D\u5361\u7247\u7684\u300C\u5212\u6389\u300D\uFF09\uFF0C
		   \u5B57\u5F62\u4E00\u5B9A\u6709\uFF1B\u2298 \u5728\u90E8\u5206\u4E2D\u6587\u5B57\u4F53\u91CC\u4F1A\u9000\u56DE\u8C46\u8150\u5757\u3002\u8BED\u4E49\u4E5F\u4E00\u81F4 \u2014\u2014 \u4E24\u4E2A\u90FD\u662F"\u4E0D\u8981\u5B83"\u3002 */
		.jh-chip-neg::before{content:'\u2715';font-size:11px;line-height:1;flex:none}
		.jh-chip-neg:hover{border-color:var(--dsw-alias-state-error-secondary)}
		.jh-chip-neg-on{background:var(--jh-error-fg);border-color:transparent;
		  color:var(--dsw-alias-label-primary-foreground)}
		.jh-filters .jh-input,.jh-filters .jh-select{width:auto}
		/* \u5173\u952E\u8BCD\u5403\u6389\u5269\u4F59\u5BBD\u5EA6\uFF1A\u7B5B\u9009\u533A\u53F3\u4FA7\u4E0D\u518D\u7A7A\u4E00\u5927\u7247 */
		.jh-input-grow{flex:1 1 220px;min-width:180px}
		.jh-input-sm{width:130px}
		`;
		var TAG_AND_STATE = `
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
		/* \u2500\u2500 \u6807\u7B7E\u5BB9\u5668\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P1-1\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   .jh-tags \u8FD9\u4E2A\u7C7B\u540D\u5728\u5C97\u4F4D\u5E93\u4E0E\u5C97\u4F4D\u8BE6\u60C5\u91CC\u90FD\u7528\u4E86\uFF0C\u4F46**\u5168\u4ED3\u5E93\u6CA1\u6709\u5B9A\u4E49** \u2014\u2014
		   \u5C11\u4E86\u5B83\uFF0C\u6807\u7B7E\u5C31\u662F\u4E00\u5806\u76F8\u90BB\u7684 inline-block\uFF1A.jh-tag \u81EA\u5DF1\u6CA1\u6709\u5916\u8FB9\u8DDD\uFF0C\u5BB9\u5668\u4E5F\u4E0D\u7ED9
		   gap\uFF0C\u76F8\u90BB\u6807\u7B7E\u7684\u5E95\u8272\u76F4\u63A5\u8D34\u5728\u4E00\u8D77\uFF0C\u6574\u6392\u8BFB\u8D77\u6765\u662F\u4E00\u6761\u8FDE\u7EED\u7070\u6761\uFF08\u5706\u89D2\u53EA\u5728\u4E24\u7AEF\uFF09\uFF0C
		   "\u5206\u7C7B\u6807\u8BB0"\u7684\u8BED\u4E49\u5C31\u4E22\u4E86\u3002\u8FD9\u91CC\u8865\u4E0A\u552F\u4E00\u4E00\u6761\u5B9A\u4E49\uFF08\u4E0D\u518D\u5404\u81EA\u590D\u5236\uFF09\u3002 */
		.jh-tags{display:flex;flex-wrap:wrap;gap:5px}
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
		/* \u2500\u2500 \u8FDB\u7A0B\u5FBD\u7AE0\uFF1A\u5728\u6D41\u7A0B\u91CC\u7684\u4E09\u6863\uFF08\u7B2C\u4E94\u8F6E\uFF0C\u6279\u6B21 C1\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5C97\u4F4D\u5E93\u7684\u5361\u7247\u4E0A\u53EA\u653E**\u4E00\u679A**\u72B6\u6001\u80F6\u56CA\uFF08\u54EA\u4E00\u679A\u89C1 format/job.ts \u7684 jobProgressBadgeOf\uFF09\uFF0C
		   \u6240\u4EE5\u914D\u8272\u8981\u80FD\u8868\u8FBE"\u8D70\u5230\u54EA\u4E00\u6B65\u4E86"\uFF1A
		     \xB7 progress\uFF08\u5DF2\u6253\u62DB\u547C / \u5DF2\u9001\u8FBE / \u5DF2\u6295\u9012 / \u5DF2\u67E5\u770B\uFF09\u2014\u2014 \u6211\u4EEC\u8FD9\u8FB9\u52A8\u8FC7\u4E86\uFF0C\u5728\u7B49\u5BF9\u65B9\uFF0C
		       \u4E0E .jh-state-new \u5171\u7528\u540C\u4E00\u5957\uFF08business \u6D45\u5E95 + \u54C1\u724C\u8272\u6587\u5B57\uFF09\uFF1A\u90FD\u662F"\u8FD8\u6CA1\u7ED3\u679C"\uFF1B
		     \xB7 ok\uFF08HR \u5DF2\u56DE\u590D / \u5DF2\u7EA6\u9762 / \u9762\u8BD5\u4E2D / \u5DF2\u9762\u8BD5 / Offer\uFF09\u2014\u2014 \u771F\u6B63\u6709\u56DE\u97F3\uFF0C
		       \u4E0E .jh-fresh-fresh \u5171\u7528 --jh-ok-bg / --jh-ok-fg\uFF08\u90A3\u5BF9 token \u5DF2\u91CF\u8FC7\u5BF9\u6BD4\u5EA6\uFF09\uFF1B
		     \xB7 closed\uFF08\u5DF2\u62D2\u7EDD / \u65E0\u56DE\u590D\uFF09\u2014\u2014 \u7EC8\u6001\u8981\u5B89\u9759\uFF0C\u7528\u4E2D\u6027\u5E95 + muted \u6587\u5B57\uFF0C\u4E0D\u62A2\u6CE8\u610F\u529B\u3002 */
		.jh-state-progress{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-brand-text)}
		.jh-state-ok{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}
		.jh-state-closed{background:var(--dsw-alias-bg-overlay);color:var(--jh-muted-fg)}
		`;
		var LINK = `
		/* \u552F\u4E00\u7684 .jh-link \u5B9A\u4E49\uFF08\u539F\u5148\u8FD9\u91CC\u548C\u4E0A\u9762\u5404\u5199\u4E86\u4E00\u4EFD\uFF0C\u4E0A\u9762\u90A3\u4EFD\u88AB\u8FD9\u4E00\u4EFD\u8986\u76D6 \u2014\u2014 \u5DF2\u5408\u5E76\uFF09\u3002
		   \u989C\u8272\u8D70 --jh-muted-fg\uFF1F\u4E0D\uFF1A\u94FE\u63A5\u8981\u770B\u5F97\u51FA\u6765\u662F\u94FE\u63A5\uFF0C\u6240\u4EE5\u8D70 --jh-business-fg \u5E76\u5E26\u4E0B\u5212\u7EBF\u3002
		   \u2500\u2500 \u7B2C\u4E8C\u8F6E\u4FEE\u590D\uFF1A\u5408\u5E76\u65F6**\u4E0D\u80FD**\u7528 --dsw-alias-link \u2014\u2014 \u5B83\u5728\u6D45\u8272\u4E0B\u662F #4176e6\uFF0C
		   \u538B\u5728\u767D\u5361\u7247\u4E0A\u53EA\u6709 4.23:1\uFF0C\u4E0D\u5230\u6B63\u6587\u8981\u6C42\u7684 4.5:1\uFF08.jh-funnel-count \u6B63\u662F\u8E29\u4E86\u8FD9\u4E2A\uFF09\u3002 */
		.jh-link{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;
		  color:var(--jh-business-fg);text-decoration:underline;padding:0}
		.jh-link:hover{text-decoration:underline}
		`;
		var MODAL_SEG_TIMERANGE = `
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
		  background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 40px var(--jh-shadow-ink);
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

		/* \u2500\u2500 \u53EF\u5C55\u5F00\u7684\u8BF4\u660E\uFF08FieldHint\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u95EE\u53F7\u73B0\u5728\u662F\u4E00\u4E2A\u771F\u6B63\u7684 <button>\uFF0C\u6298\u53E0\u65F6\u5B83\u5728\u7248\u9762\u4E0A\u4E0E\u6539\u4E4B\u524D**\u9010\u50CF\u7D20\u4E00\u81F4**
		   \uFF08\u8BF4\u660E\u6587\u5B57\u843D\u5728 .jh-sr-only \u91CC\uFF0C\u4E0D\u5360\u4F4D\uFF09\uFF0C\u70B9\u5F00\u624D\u628A\u8BF4\u660E\u644A\u5728\u4E0B\u9762\u3002
		   \u4E09\u4EF6\u4E8B\u5FC5\u987B\u663E\u5F0F\u5199\uFF0C\u5426\u5219 <button> \u4F1A\u5E26\u4E0A UA \u81EA\u5DF1\u7684\u76D2\u5B50\u6A21\u578B\uFF1A
		     \xB7 font-family:inherit \u2014\u2014 UA \u7ED9 button \u7684\u662F\u7CFB\u7EDF UI \u5B57\u4F53\uFF0C\u4E0D\u662F\u7EE7\u627F\u7684\uFF1B
		     \xB7 padding:0          \u2014\u2014 UA \u7ED9 button \u7684\u662F 1px 6px\uFF1B
		     \xB7 box-sizing:content-box \u2014\u2014 \u6D4F\u89C8\u5668\u7ED9 button \u7684\u9ED8\u8BA4\u503C\u662F border-box\uFF0C
		       \u800C\u539F\u6765\u90A3\u4E2A span \u662F content-box\uFF08\u5168\u4ED3\u5E93\u6CA1\u6709\u5168\u5C40\u91CD\u7F6E\uFF09\u3002\u4E0D\u6539\u56DE\u6765\u7684\u8BDD
		       .jh-field-hint \u7684 14px \u4F1A\u8FDE\u8FB9\u6846\u4E00\u8D77\u7B97\uFF0C\u5706\u70B9\u6574\u4F53\u7F29\u6C34 2px\u3002
		   vertical-align \u6302\u5728**\u5916\u5C42\u8FD9\u5C42**\u4E0A\uFF1A\u5185\u5C42\u6362\u6210 button \u4E4B\u540E\uFF0C\u53C2\u4E0E\u884C\u5185\u5BF9\u9F50\u7684
		   \u662F\u5916\u5C42\u8FD9\u4E2A span\uFF0C\u800C\u4E0D\u662F\u91CC\u9762\u90A3\u4E2A\u5706\u70B9\uFF08inline \u53D8\u4F53\u5E38\u51FA\u73B0\u5728\u6B63\u6587\u6BB5\u843D\u91CC\uFF09\u3002 */
		.jh-hint-wrap{position:relative;vertical-align:middle}
		.jh-hint-wrap>.jh-field-hint,.jh-hint-wrap>.jh-hint{
		  font-family:inherit;padding:0;cursor:pointer;position:relative}
		/* \u89E6\u8FBE\u5C3A\u5BF8\uFF08WCAG 2.2 AA 2.5.8 \u8981\u6C42 24\xD724\uFF09\uFF1A\u8FD9\u4E24\u4E2A\u95EE\u53F7\u7684\u5B9E\u9645\u5C3A\u5BF8\u662F 16\xD716 / 15\xD715
		   \uFF08content-box \u7684 14px + 1px \u8FB9\u6846\uFF09\uFF0C\u5374\u662F\u5168\u9879\u76EE**\u6700\u9AD8\u9891**\u7684\u70B9\u51FB\u76EE\u6807 \u2014\u2014 \u8BBE\u7F6E\u9875\u51E0\u4E4E
		   \u6BCF\u4E00\u884C\u63A7\u4EF6\u90FD\u6302\u7740\u5B83\u3002\u505A\u6CD5\uFF1A\u89C6\u89C9\u5706\u70B9\u9010\u50CF\u7D20\u4E0D\u52A8\uFF0C\u7528\u4F2A\u5143\u7D20\u628A\u547D\u4E2D\u533A\u5411\u5916\u6269 5px
		   \uFF0816 \u2192 26\uFF09\u3002\u4E0D\u7528 padding \u6491\uFF1A\u90A3\u4F1A\u628A\u6BCF\u4E00\u884C\u63A7\u4EF6\u7684\u9AD8\u5EA6\u90FD\u6539\u6389\uFF0C\u800C\u672C\u6587\u4EF6\u4E0A\u9762\u627F\u8BFA\u8FC7
		   "\u6298\u53E0\u65F6\u4E0E\u6539\u4E4B\u524D\u9010\u50CF\u7D20\u4E00\u81F4"\u3002 */
		.jh-hint-wrap>.jh-field-hint::after,.jh-hint-wrap>.jh-hint::after{
		  content:'';position:absolute;inset:-5px;border-radius:50%}
		.jh-hint-wrap>.jh-field-hint{box-sizing:content-box}
		/* inline \u53D8\u4F53\uFF08.jh-hint\uFF0C\u5B9A\u4E49\u5728 job-detail.ts\uFF09\u6CA1\u6709\u81EA\u5DF1\u7684\u8FB9\u6846\uFF0C
		   \u4E0D\u52A0\u8FD9\u6761\u5C31\u4F1A\u9732\u51FA <button> \u7684 UA \u8FB9\u6846\u3002 */
		.jh-hint-wrap>.jh-hint{border:0}
		.jh-hint-wrap>.jh-field-hint:focus-visible,.jh-hint-wrap>.jh-hint:focus-visible{
		  outline:2px solid var(--dsw-alias-link);outline-offset:1px}
		/* \u5C55\u5F00\u540E\u7684\u8BF4\u660E\uFF1A\u5C31\u5730\u5360\u4E00\u884C\u3002\u4E0D\u7528\u7EDD\u5BF9\u5B9A\u4F4D \u2014\u2014 \u8FD9\u4E9B\u95EE\u53F7\u591A\u5728\u5F39\u7A97\u91CC\uFF0C
		   \u800C .jh-modal-body \u662F overflow:auto\uFF0C\u6D6E\u5C42\u4F1A\u88AB\u88C1\u6389\u3002 */
		.jh-hint-text{display:block;margin:5px 0 0;padding:0 2px;max-width:48ch;
		  font-size:12px;line-height:1.6;text-align:left;color:var(--dsw-alias-label-secondary)}

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
		`;
		var DESTRUCTIVE_BUTTONS = `
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
		   \u73B0\u5728\u7EDF\u4E00\u6210\u4E0E .jh-tag \u540C\u4E00\u6863\u7684\u5C0F\u5706\u89D2\u77E9\u5F62\uFF084px\uFF09\u3002
		   \u2500\u2500 \u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF1A\u7EDF\u4E00\u4E4B\u540E\u5B83\u662F **19px \u9AD8**\uFF08line-height 17px + \u4E0A\u4E0B\u5404 1px \u8FB9\u6846\uFF09\uFF0C
		   \u800C\u5B83\u662F**\u5931\u8D25\u8BE6\u60C5\u7684\u552F\u4E00\u5165\u53E3** \u2014\u2014 \u539F\u56E0\u3001\u6392\u67E5\u6B65\u9AA4\u3001\u539F\u59CB trace \u5168\u5728\u90A3\u6247\u95E8\u540E\u9762\u3002
		   WCAG 2.5.8\uFF08AA\uFF09\u8981\u6C42 24\xD724\uFF0C\u6240\u4EE5\u8865 min-height\uFF08\u6A2A\u5411\u7531\u6587\u5B57\u957F\u5EA6\u5929\u7136\u8D85\u8FC7 24\uFF09\u3002 */
		.jh-err-chip{display:inline-flex;align-items:center;gap:5px;cursor:pointer;font:inherit;
		  font-size:11.5px;line-height:17px;min-height:24px;padding:0 8px;border-radius:4px;
		  border:1px solid var(--dsw-alias-state-error-secondary);
		  background:var(--jh-error-bg);color:var(--jh-error-fg)}
		.jh-err-chip:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)}
		.jh-err-chip-short{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:9em}
		.jh-err-chip-more{font-size:10.5px;opacity:.75;text-decoration:underline;flex:none}
		/* \u8B66\u793A\u56FE\u6807\uFF1A\u5F62\u72B6\u672C\u8EAB\u4E5F\u8868\u610F\uFF08\u4E0D\u53EA\u9760\u989C\u8272\uFF09\u3002 */
		.jh-err-chip-icon{flex:none;font-size:10px;line-height:1}
		`;
		var QUALITY_GATES = `
		/* \u2500\u2500 quality-gates \u6536\u5C3E\uFF1A\u8868\u683C\u72B6\u6001 / \u5C0F\u5C4F\u7B56\u7565 / \u7A7A\u6001 / \u52A0\u8F7D\u6001 / \u53CD\u9988\u53EF\u5173\u95ED \u2500\u2500 */

		/* Table \u7684\u5FC5\u67E5\u72B6\u6001\u91CC\u6709 row hover \u2014\u2014 \u539F\u6765\u6CA1\u6709\uFF0C\u626B\u884C\u65F6\u4F1A\u4E22\u5931"\u9F20\u6807\u5728\u54EA\u4E00\u884C"\u7684\u53CD\u9988 */
		.jh-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}
		/* \u4F46\u884C hover \u4F1A\u628A\u5E95\u8272\u94FA\u5230 .jh-muted\uFF08label-secondary\uFF09\u7684\u6587\u5B57\u4E0B\u9762\uFF0C\u800C\u672C\u4ED3\u5E93\u7684\u4E0D\u53D8\u5F0F\u662F
		   "secondary \u53EA\u80FD\u538B\u5728 bg-base / bg-layer-1 \u8FD9\u7C7B\u5361\u7247\u8868\u9762\u4E0A\uFF0C\u4E0D\u8981\u538B\u5728 bg-overlay /
		   interactive-* \u4E0A"\uFF08\u89C1 tokens.ts \u7684\u5B9E\u6D4B\uFF1Abg-overlay \u4E0A\u53EA\u6709 3.85:1\uFF09\u2014\u2014
		   \u884C hover \u7528\u7684\u6B63\u662F interactive-bg-hover\u3002
		   \u505A\u6CD5\uFF1A\u60AC\u505C\u65F6\u628A\u6B21\u8981\u8BF4\u660E\u63D0\u5230 label-primary\u3002\u8FD9\u4E2A\u7EC4\u5408\u4E0E\u672C\u9879\u76EE\u6240\u6709\u53EF\u60AC\u505C\u63A7\u4EF6
		   \uFF08.jh-btn / .jh-icon-btn / .jh-sibling\uFF09\u7528\u7684\u662F\u540C\u4E00\u5957\uFF0C\u4E0D\u518D\u8BA9\u6587\u5B57\u538B\u5728\u6CA1\u91CF\u8FC7\u7684\u5E95\u8272\u4E0A\u3002 */
		.jh-table tbody tr:hover .jh-muted{color:var(--dsw-alias-label-primary)}

		/* \u2500\u2500 \u52A8\u6548\u964D\u7EA7\uFF08\u7B2C\u56DB\u8F6E\u4FEE\u590D\uFF0C\u5BA1\u6838 P3\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5168\u9879\u76EE\u6B64\u524D\u6CA1\u6709\u4EFB\u4F55 prefers-reduced-motion \u5206\u652F\u3002\u8FD9\u91CC\u7684\u8FC7\u6E21\u90FD\u662F 120\u2013140ms \u7684\u989C\u8272 /
		   \u8FB9\u6846 / \u4F4D\u79FB\uFF08\u6CA1\u6709\u89C6\u5DEE\u3001\u6CA1\u6709\u81EA\u52A8\u64AD\u653E\uFF09\uFF0C\u6240\u4EE5\u964D\u7EA7\u505A\u6CD5\u5C31\u662F\u628A\u65F6\u957F\u538B\u6389\uFF0C\u800C\u4E0D\u662F\u6362\u4E00\u5957\u52A8\u6548\u3002
		   \u4F5C\u7528\u57DF**\u5FC5\u987B**\u9650\u5B9A\u5728 .jh-root \u4E4B\u5185\uFF1A\u6837\u5F0F\u662F\u6CE8\u5165\u5230 document \u7684\uFF0C\u5199\u88F8 * \u4F1A\u8BEF\u4F24\u5BBF\u4E3B\u754C\u9762\u3002 */
		@media (prefers-reduced-motion: reduce){
		  .jh-root *,.jh-root *::before,.jh-root *::after{
		    transition-duration:.01ms !important;animation-duration:.01ms !important}}
		`;
		var EMPTY_AND_FEEDBACK = `
		/* \u7A7A\u6001\uFF1A\u539F\u56E0 + \u4E0B\u4E00\u6B65\uFF08rules \xA74.3 / quality-gates \xA72 "\u7A7A\u6570\u636E\u65F6\u7ED9\u51FA\u539F\u56E0\u548C\u4E0B\u4E00\u6B65"\uFF09*/
		.jh-empty{display:flex;flex-direction:column;gap:4px;padding:12px 0}

		/* \u52A0\u8F7D\u6001\uFF1A\u5360\u4F4D\u884C\u4FDD\u6301\u5E03\u5C40\u7A33\u5B9A\uFF08\u4E0D\u8981\u628A"\u6B63\u5728\u8BFB\u53D6"\u663E\u793A\u6210"\u6CA1\u6709\u6570\u636E"\uFF09*/
		.jh-skeleton-row{color:var(--dsw-alias-label-secondary);text-align:center}

		/* \u53CD\u9988\u6761\uFF1A\u53EF\u5173\u95ED */
		.jh-feedback{display:flex;align-items:flex-start;gap:8px}
		.jh-feedback p{flex:1 1 auto;min-width:0}
		.jh-feedback-close{flex:0 0 auto}
		`;
		var SWITCH_AND_NUMBER = `
		/* Switch \u5F00\u5173\u3002
		   \u2500\u2500 \u4E3A\u4EC0\u4E48\u4E0D\u7528 .jh-check \u90A3\u5957\u590D\u9009\u6846\uFF1A\u8BBE\u7F6E\u9875\u7684\u8FD9 8 \u4E2A\u5F00\u5173\u90FD\u662F**\u5373\u65F6\u751F\u6548**\u7684
		   \u5F00\u5173\uFF08\u4E0D\u662F"\u9009\u4E86\u518D\u63D0\u4EA4"\u7684\u8868\u5355\u9879\uFF09\uFF0C\u62E8\u6746\u5F62\u6001\u8868\u8FBE"\u73B0\u5728\u5C31\u662F\u5F00\u7740\u7684"\u66F4\u76F4\u63A5\u3002
		   "\u5F00"\u7528 brand-primary\uFF08\u8FD1\u9ED1 / \u6DF1\u8272\u4E0B\u662F\u6D45\u8272\uFF09\u800C**\u4E0D\u662F**\u8BED\u4E49\u7EFF\uFF1A
		   \u6253\u5F00 L4 \u6295\u9012\u610F\u5473\u7740"\u5141\u8BB8\u5DE5\u5177\u81EA\u52A8\u6295\u9012"\uFF0C\u90A3\u662F\u6743\u9650\u7684\u5F00\u542F\uFF0C\u4E0D\u662F"\u53D8\u597D\u4E86"\u2014\u2014
		   \u7EFF\u8272\u4F1A\u8BFB\u6210\u5B89\u5168\u3002
		   \u2500\u2500 \u65E0\u969C\u788D\uFF1A\u771F checkbox\uFF08role=switch\uFF09\u5728\u4E0B\u9762\uFF0C\u89C6\u89C9\u62E8\u6746 aria-hidden\uFF1B
		   \u952E\u76D8\u805A\u7126\u8D70 :focus-visible \u7684\u4E3B\u9898\u8272\u5149\u73AF\uFF0C\u4E0E .jh-input \u540C\u4E00\u5957\u8BED\u6CD5\u3002 */
		.jh-switch{position:relative;display:inline-flex;flex:none;border-radius:999px}
		.jh-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
		.jh-switch input:disabled{cursor:default}
		.jh-switch-track{position:relative;box-sizing:border-box;flex:none;width:34px;height:20px;
		  border-radius:999px;background:var(--dsw-alias-bg-overlay);
		  border:1px solid var(--dsw-alias-border-l3);
		  transition:background .14s,border-color .14s}
		.jh-switch-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
		  background:var(--dsw-alias-label-secondary);transition:transform .14s,background .14s}
		.jh-switch input:checked+.jh-switch-track{background:var(--dsw-alias-brand-primary);
		  border-color:var(--dsw-alias-brand-primary)}
		.jh-switch input:checked+.jh-switch-track .jh-switch-thumb{transform:translate(14px,0);
		  background:var(--dsw-alias-label-primary-foreground)}
		.jh-switch input:focus-visible+.jh-switch-track{box-shadow:0 0 0 3px var(--dsw-alias-state-business-tertiary)}
		.jh-switch input:disabled+.jh-switch-track{opacity:.45}

		/* \u6570\u5B57\u8F93\u5165\u6846\uFF08\u5E26\u5355\u4F4D\u540E\u7F00\uFF09\u3002
		   \u4E0D\u7528 .jh-input \u662F\u56E0\u4E3A\u5355\u4F4D\u4F1A\u7AD9\u5728\u8F93\u5165\u6846\u5916\u9762\uFF1A\u8FD9\u91CC\u628A\u63CF\u8FB9\u7ED9\u5916\u58F3\u3001\u8F93\u5165\u6846\u672C\u4F53\u900F\u660E\uFF0C
		   \u4E8E\u662F"20 \u5206\u949F"\u6574\u4F53\u662F\u4E00\u4E2A\u63A7\u4EF6\u3002\u805A\u7126\u5149\u73AF\u4E0E .jh-input \u4FDD\u6301\u4E00\u81F4\u3002 */
		.jh-number{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;width:118px;
		  padding:0 9px;border-radius:8px;background:var(--dsw-alias-bg-base);
		  border:1px solid var(--dsw-alias-border-l3)}
		.jh-number:hover{border-color:var(--dsw-alias-border-l4)}
		.jh-number:focus-within{border-color:var(--dsw-alias-link);
		  box-shadow:0 0 0 3px var(--dsw-alias-state-business-tertiary)}
		.jh-number input{flex:1 1 auto;min-width:0;width:100%;box-sizing:border-box;border:0;
		  background:transparent;font:inherit;font-size:13px;padding:6px 0;
		  color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
		.jh-number input:focus{outline:none}
		/* \u539F\u751F\u4E0A\u4E0B\u7BAD\u5934\uFF1A13px \u7684\u5BC6\u96C6\u8868\u5355\u91CC\u592A\u6324\uFF0C\u4E14\u5404\u5E73\u53F0\u5916\u89C2\u4E0D\u4E00\u81F4 */
		.jh-number input::-webkit-outer-spin-button,
		.jh-number input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
		.jh-number-unit{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}
		`;

		// src/client/styles/tokens.ts
		var SEMANTIC_TEXT = `
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

		   \u2463 **--jh-*-fg \u540C\u65F6\u88AB\u5F53\u6210"\u5B9E\u5E95\u586B\u5145"\u4E0E"\u6587\u5B57\u8272"\u7528** \u2014\u2014 \u53D8\u91CF\u540D\u672C\u8EAB\u6CA1\u6709\u533A\u5206\u5F00
		      "\u5728\u6D45\u5E95\u4E0A\u5F53\u6587\u5B57"\u4E0E"\u5F53\u5B9E\u5E95\u914D\u767D\u5B57"\u4E24\u79CD\u89D2\u8272\u3002\u6DF1\u8272\u4E3B\u9898\u4E0B label-primary \u662F\u6D45\u8272\uFF0C
		      \u6DF7\u51FA\u6765\u7684\u53D8\u4F53\u4E5F\u8DDF\u7740\u53D8\u6D45\uFF0C\u4E8E\u662F"\u6DF7\u8272\u5F53\u5E95 + label-primary-foreground \u5F53\u524D\u666F"
		      \u90A3\u51E0\u5904\uFF08.jh-todo-level / .jh-tag-* / .jh-chip-neg-on\u2026\uFF09\u5728\u6DF1\u8272\u4E0B\u65B9\u5411\u662F\u53CD\u7684\u3002

		      \u2500\u2500 \u8FD9\u4E00\u6761**\u66FE\u7ECF**\u6253\u7B97\u9760\u62C6\u51FA\u4E00\u7EC4 --jh-*-text \u6765\u89E3\uFF0C\u4F46\u90A3\u6B21\u62C6\u5206\u6CA1\u6709\u843D\u5730\uFF1A
		      \u5168\u4ED3\u5E93\u641C\u4E0D\u5230\u4EFB\u4F55 --jh-*-text \u7684\u5B9A\u4E49\u6216\u5F15\u7528\uFF0C\u4E24\u79CD\u89D2\u8272\u81F3\u4ECA\u5171\u7528\u540C\u4E00\u4E2A\u503C\u3002
		      \u73B0\u5728\u628A\u7ED3\u8BBA\u5199\u6E05\u695A\uFF0C\u4E0D\u518D\u7559\u4E00\u53E5\u4E0E\u5B9E\u73B0\u4E0D\u7B26\u7684\u8BDD\uFF1A

		      **\u4E00\u4E2A\u503C\u540C\u65F6\u670D\u52A1\u4E24\u79CD\u89D2\u8272\u662F\u6210\u7ACB\u7684\uFF0C\u524D\u63D0\u662F\u8FD9\u4E24\u6761\u4E0D\u53D8\u5F0F\u90FD\u5B88\u7740** \u2014\u2014
		        \xB7 \u5F53**\u5B9E\u5E95**\u7528\u65F6\uFF0C\u524D\u666F\u5FC5\u987B\u53D6 label-primary-foreground\uFF08\u5B83\u4E0E label-primary
		          \u6C38\u8FDC\u53CD\u5411\uFF0C\u6240\u4EE5\u5E95\u8272\u8DDF\u7740 label-primary \u8D70\u65F6\uFF0C\u524D\u666F\u81EA\u52A8\u662F\u5BF9\u7684\uFF09\uFF1B
		        \xB7 \u5F53**\u6587\u5B57**\u7528\u65F6\uFF0C\u5FC5\u987B\u538B\u5728 bg-base / bg-layer-1 \u8FD9\u7C7B\u5361\u7247\u8868\u9762\u4E0A
		          \uFF08\u4E0D\u8981\u538B\u5728 bg-overlay / interactive-* \u4E0A \u2014\u2014 \u90A3\u4E9B\u5E95\u8272\u7684\u53D6\u503C\u6CA1\u91CF\u8FC7\uFF09\u3002
		      \u6DF7\u8272\u672C\u8EAB\u671D label-primary \u9760\u62E2\uFF0C\u800C label-primary \u5C31\u662F"\u5F53\u524D\u4E3B\u9898\u7684\u6B63\u6587\u8272"\uFF0C
		      \u6240\u4EE5\u8FD9\u4E24\u6761\u4E0D\u53D8\u5F0F\u4E00\u65E6\u6210\u7ACB\uFF0C\u4E24\u5957\u4E3B\u9898\u90FD\u4F1A\u81EA\u52A8\u53CD\u5411\u3002
		      \u5C06\u6765\u82E5\u8981\u771F\u7684\u62C6\u5F00\u8FD9\u4E24\u4E2A\u53D8\u91CF\uFF0C\u5148\u6309\u4E0A\u9762\u4E24\u6761\u628A\u7528\u6CD5\u5BA1\u4E00\u904D\uFF0C\u518D\u52A8\u503C\u3002 */
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
		  --jh-ok-bg:var(--dsw-alias-state-success-tertiary);
		  /* \u6295\u5F71\u8272\u3002**\u523B\u610F\u662F\u4E00\u4E2A\u5B57\u9762\u503C\uFF0C\u4E5F\u523B\u610F\u4E0D\u8DDF label-primary \u6DF7\u8272** \u2014\u2014
		     \u6295\u5F71\u5728\u4E24\u5957\u4E3B\u9898\u4E0B\u90FD\u5FC5\u987B\u662F"\u6697\u7684"\uFF0C\u800C label-primary \u5728\u6DF1\u8272\u4E3B\u9898\u91CC\u662F\u6D45\u8272\uFF0C
		     \u6DF7\u51FA\u6765\u7684\u4F1A\u662F\u53D1\u5149\uFF0C\u4E0D\u662F\u6295\u5F71\u3002\u6536\u6210\u4E00\u4E2A\u53D8\u91CF\u662F\u4E3A\u4E86\u8BA9"\u5F39\u7A97\u7684\u6295\u5F71"\u53EA\u6709\u4E00\u5904\u5B9A\u4E49
		     \uFF08\u539F\u6765\u662F\u6563\u5728\u5404\u6587\u4EF6\u91CC\u7684 rgba(0,0,0,\u2026)\uFF09\uFF1B\u5C06\u6765\u5BBF\u4E3B\u4E3B\u9898\u82E5\u7ED9\u51FA elevation \u4EE4\u724C\uFF0C
		     \u6539\u8FD9\u4E00\u884C\u5373\u53EF\u3002 */
		  --jh-shadow-ink:rgba(0,0,0,.22);
		  /* \u5361\u7247\u7684\u5206\u5C42\u9634\u5F71\uFF1A\u4E0E\u4E0A\u9762\u7684"\u6D6E\u5C42\u62AC\u5347"\u4E0D\u662F\u4E00\u4E2A\u89D2\u8272 \u2014\u2014 \u767D\u5E95\u5361\u7247\u753B\u5728\u767D\u9875\u9762\u4E0A\u65F6\uFF0C
		     \u8FD9\u4E00\u5C42\u8C08\u7684\u53EA\u662F"\u8FD9\u662F\u4E00\u5757\u72EC\u7ACB\u5185\u5BB9"\uFF0C\u6BD4\u5F39\u7A97/\u60AC\u6D6E\u5361\u5F31\u4E00\u4E2A\u6570\u91CF\u7EA7\u3002 */
		  --jh-shadow-card:rgba(0,0,0,.04)}
		`;

		// src/client/styles/screens/settings.ts
		var SETTINGS = `
		/* \u2500\u2500 U10 \u8BBE\u7F6E\u9875\u91CD\u6392\uFF082026-09-18\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   \u5B9E\u6D4B\u7684\u4E09\u4E2A\u95EE\u9898\uFF1A
		     \u2460 6 \u4E2A\u5E73\u7EA7 h2 \u7EB5\u5411\u5355\u5217\u6392\u4E0B\u6765\uFF0C\u5BBD\u5C4F\u4E0B\u53F3\u4FA7\u4E00\u5927\u7247\u7A7A\u767D\uFF1B
		     \u2461 \u914D\u7F6E\uFF08\u6A21\u578B\u7528\u9014 / \u95F8\u95E8 / \u6D4F\u89C8\u5668\uFF09\u4E0E\u8BCA\u65AD\uFF08\u8BCA\u65AD / \u7559\u75D5 / \u5BA1\u8BA1\uFF09\u6DF7\u5728\u540C\u4E00\u5C4F\uFF0C
		        \u60F3\u5173\u6389\u67D0\u4E00\u4E2A\u7528\u9014\u5F97\u5148\u6EDA\u8FC7\u6574\u5C4F\u65E5\u5FD7\uFF1B
		     \u2462 \u5F00\u5173\u4E0E\u989D\u5EA6\u662F**\u7EAF\u6587\u672C**\uFF08"\u5F00 / \u5173"\u3001"\u6253\u62DB\u547C 20 \xB7 \u6295\u9012 10 \xB7 \u56DE\u590D 30"\uFF09\uFF0C
		        \u770B\u8D77\u6765\u50CF\u8BFB\u6570\u800C\u4E0D\u662F\u80FD\u6539\u7684\u63A7\u4EF6\u3002
		   \u505A\u6CD5\uFF1A\u4E8C\u7EA7\u6807\u7B7E\u9875 + \u5BB9\u5668\u67E5\u8BE2\u9A71\u52A8\u7684\u4E24\u680F\u7F51\u683C + \u771F\u6B63\u7684 Switch / \u6570\u5B57\u8F93\u5165\u6846\u3002
		   \u914D\u7F6E\u9875\u73B0\u5728\u662F**\u4E09\u5F20\u5361**\uFF08\u6A21\u578B\u7528\u9014 / \u7CFB\u7EDF\u63A7\u5236\u4E2D\u5FC3 / \u8FD0\u884C\u8D44\u6E90\uFF09\u2014\u2014 \u300C\u8FD0\u884C\u8D44\u6E90\u300D
		   \uFF08\u6D4F\u89C8\u5668 + \u91C7\u96C6\u8282\u594F\uFF09\u662F\u4ECE\u95F8\u95E8\u90A3\u5F20\u5361\u91CC\u62C6\u51FA\u6765\u7684\uFF0C\u7406\u7531\u89C1 config-panel.tsx\u3002
		   \u4E3A\u4EC0\u4E48\u7528 container query \u800C\u4E0D\u662F media query\uFF1A\u51B3\u5B9A"\u653E\u4E0D\u653E\u5F97\u4E0B\u4E24\u680F"\u7684\u662F**\u9762\u677F**
		   \u6709\u591A\u5BBD\uFF08\u4FA7\u680F\u4E00\u5C55\u5F00\u3001\u5BF9\u8BDD\u533A\u4E00\u6324\uFF0C\u7A97\u53E3\u8FD8\u5BBD\u7740\u5462\u9762\u677F\u5DF2\u7ECF\u653E\u4E0D\u4E0B\u4E86\uFF09\uFF0C
		   \u4E0E\u5C97\u4F4D\u5E93\u7684\u4E24\u680F\u7F51\u683C\uFF08.jh-jobs-split\uFF09\u540C\u4E00\u4E2A\u7406\u7531\u3002 */
		.jh-screen-settings{max-width:1360px}
		.jh-set-tabs{margin:0 0 12px}
		.jh-set-wrap{container-type:inline-size}
		/* \u8FD9\u4E00\u5C4F\u7684\u5361\u7247\u7EDF\u4E00\u653E\u5230 1360\uFF1A.jh-card \u81EA\u5E26\u7684 max-width:1000px \u4F1A\u8BA9\u9876\u90E8\u7684
		   \u300C\u5F53\u524D\u98CE\u63A7\u6001\u52BF\u300D\u6BD4\u4E0B\u9762\u4E24\u680F\u7F51\u683C\u7A84\u4E00\u622A\uFF0C\u770B\u8D77\u6765\u50CF\u6CA1\u5BF9\u9F50\u3002
		   \u2500\u2500 2026-09-20\uFF1A\u4F5C\u7528\u57DF\u4ECE .jh-set-wrap>.jh-card\uFF08\u53EA\u6709\u914D\u7F6E\u9875\u5728 wrap \u91CC\uFF09\u6539\u6210**\u6574\u5C4F**\u3002
		   \u539F\u56E0\uFF1A\u4E09\u4E2A\u5206\u533A\u7684\u5185\u5BB9\u5BBD\u5EA6\u539F\u672C\u662F 1360 / 1000 / 964\uFF08\u6570\u636E\u9875\u8FD8\u591A\u5957\u4E86\u4E00\u5C42 .jh-screen
		   \u7684\u5185\u8FB9\u8DDD\uFF09\uFF0C\u5207\u5206\u533A\u65F6\u6574\u7247\u5185\u5BB9\u4F1A\u8DF3\u4E00\u4E0B\u5BBD\u5EA6\u3002
		   \u4E3A\u4EC0\u4E48\u4E0D\u662F"\u7ED9\u6BCF\u4E2A tabpanel \u90FD\u52A0 .jh-set-wrap"\uFF08\u90A3\u6837\u53EA\u6539\u4E00\u884C\uFF09\uFF1A.jh-set-wrap \u5E26
		   container-type:inline-size\uFF0C\u7B49\u4E8E\u7ED9\u9762\u677F\u52A0\u4E86\u4E00\u5C42 containment \u2014\u2014 \u800C\u6E05\u7406\u786E\u8BA4\u5F39\u7A97
		   \uFF08Modal\uFF09\u4E0E\u7559\u75D5\u62BD\u5C49\uFF08PayloadDrawer\uFF09\u90FD\u662F position:absolute \u5C42\uFF0Ccontainment \u4F1A\u8BA9
		   \u5B83\u4EEC\u6539\u4E3A\u76F8\u5BF9\u9762\u677F\u5B9A\u4F4D\uFF1A\u9762\u677F\u5F88\u9AD8\u3001\u7528\u6237\u53C8\u6EDA\u5230\u4E86\u4E0B\u9762\u65F6\uFF0C\u5F39\u7A97\u4F1A\u843D\u5728\u89C6\u53E3\u4E4B\u5916\u3002
		   \u5BBD\u5EA6\u5F52\u4E00\u4E0D\u9700\u8981 containment\uFF0C\u6240\u4EE5\u7528\u4F5C\u7528\u57DF\u9009\u62E9\u5668\uFF0C\u4E0D\u52A8\u9762\u677F\u672C\u8EAB\u3002 */
		.jh-screen-settings .jh-card{max-width:none}
		.jh-set-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
		/* \u95F4\u8DDD\u4EA4\u7ED9 grid gap\uFF1A\u5361\u7247\u81EA\u5E26 margin-bottom\uFF0C\u4E24\u680F\u65F6\u5DE6\u53F3\u4E24\u5F20\u5361\u7684\u4E0B\u5916\u8FB9\u8DDD\u4F1A\u53D8\u6210\u53CC\u4EFD */
		.jh-set-grid>.jh-card{margin:0}
		@container (min-width: 880px){
		  .jh-set-grid{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);align-items:start}
		}

		/* \u63A7\u5236\u884C\uFF1A\u5DE6\u8FB9\u662F\u6807\u7B7E\uFF08\u53EF\u5E26\u95EE\u53F7\u8BF4\u660E\uFF09\uFF0C\u53F3\u8FB9\u662F\u63A7\u4EF6\u3002
		   \u7528 grid \u800C\u4E0D\u662F flex \u2014\u2014 \u6807\u7B7E\u6709\u957F\u6709\u77ED\uFF0Cgrid \u8BA9\u540C\u4E00\u5F20\u5361\u91CC\u6240\u6709\u63A7\u4EF6\u5DE6\u8FB9\u7F18\u5BF9\u9F50\u3002 */
		.jh-ctl{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;
		  gap:10px;padding:7px 0}
		.jh-ctl+.jh-ctl,.jh-ctl-stack+.jh-ctl{border-top:1px solid var(--dsw-alias-border-l1)}
		/* \u63A7\u5236\u884C\u7684\u53E6\u4E00\u79CD\u5F62\u6001\uFF1A\u6807\u7B7E\u5728\u4E0A\u3001\u63A7\u4EF6\u5728\u4E0B\u3002
		   \u7ED9"\u63A7\u4EF6\u672C\u8EAB\u5F88\u5BBD"\u7684\u884C\u7528 \u2014\u2014 \u53D1\u9001\u65F6\u6BB5\u662F\u4E24\u4E2A time \u8F93\u5165 + \u4E00\u4E2A\u6309\u94AE\uFF08\u7EA6 360px\uFF09\uFF0C
		   \u5728\u4E24\u680F\u5E03\u5C40\u6700\u7A84\u7684\u90A3\u4E00\u6863\uFF08\u5BB9\u5668 880px \u65F6\u53F3\u680F\u5185\u5BB9\u5BBD\u7EA6 361px\uFF09\u6A2A\u6392\u4F1A\u628A\u6807\u7B7E\u6324\u6210\u4E00\u5217\u5B57\u3002
		   \u7A84\u7684\u65F6\u5019\u6574\u884C\u6362\u6210\u4E0A\u4E0B\u6392\uFF0C\u5BBD\u7684\u65F6\u5019\u4E5F\u4E0D\u96BE\u770B\uFF08\u4E0E\u300C\u6BCF\u65E5\u989D\u5EA6\u300D\u4E09\u683C\u540C\u4E00\u5957\u8BED\u6CD5\uFF09\u3002 */
		.jh-ctl-stack{display:flex;flex-direction:column;gap:4px;padding:7px 0}

		/* \u6E05\u7406\u6E05\u5355\u7684\u52FE\u9009\u6846\uFF1A\u539F\u751F checkbox \u53EA\u6709 13\xD713\uFF0C\u800C\u8FD9\u91CC\u7684\u52FE\u9009\u662F"\u8981\u5220\u54EA\u4E9B"\u7684\u552F\u4E00\u5165\u53E3\u3002
		   \u4E0E .jh-job-pick \u540C\u4E00\u4E2A\u7406\u7531\u4E0E\u505A\u6CD5\uFF08\u90A3\u91CC\u5DF2\u63D0\u5230 18px + \u5185\u8FB9\u8DDD\uFF09\u3002
		   \u4F5C\u7528\u57DF\u53EA\u7ED9\u8FD9\u4E00\u5904\u6E05\u5355\uFF1A.jh-check \u5168\u4ED3\u5E93\u6709 7 \u4E2A\u4F7F\u7528\u70B9\uFF0C\u6539\u5168\u5C40\u4F1A\u8FDE\u5E26\u6539\u5230
		   \u7B5B\u9009\u680F\u4E0E\u51E0\u4E2A\u5F39\u7A97\u7684\u884C\u9AD8\uFF0C\u90A3\u4E0D\u662F\u8FD9\u6B21\u8981\u52A8\u7684\u4E1C\u897F\u3002 */
		.jh-clean-list .jh-check{padding:2px 0}
		.jh-clean-list .jh-check input{width:18px;height:18px;margin:0}
		`;
		var SETTINGS_PURPOSES_AND_USAGE = `
		/* \u6A21\u578B\u7528\u9014\uFF1A\u6309\u4E1A\u52A1\u5206\u7EC4\uFF0C\u6BCF\u7EC4\u4E00\u4E2A\u4E09\u5217\u7F51\u683C\uFF08\u7A84\u9762\u677F\u81EA\u52A8\u964D\u4E3A\u4E24\u5217 / \u4E00\u5217\uFF09\u3002
		   14 \u9879\u5E73\u94FA\u4E00\u5217\u662F\u539F\u6765"\u9875\u9762\u5F88\u957F"\u7684\u4E3B\u8981\u6765\u6E90\u4E4B\u4E00\u3002
		   148px \u4F1A\u5728\u8FD9\u4E2A\u5BBD\u5EA6\u4E0B\u6392\u6210 4 \u5217 \u2014\u2014 190px \u624D\u662F"\u4E24\u680F\u5E03\u5C40\u4E0B\u6B63\u597D\u4E09\u5217"\uFF083\xD7190+2\xD710=590\uFF09\u3002 */
		.jh-purpose-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
		  gap:0 10px}
		.jh-purpose{display:flex;align-items:center;justify-content:space-between;gap:8px;
		  min-width:0;padding:5px 8px;border-radius:7px;cursor:pointer}
		.jh-purpose:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.jh-purpose-name{font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;
		  white-space:nowrap}

		/* \u989D\u5EA6\u90A3\u4E09\u683C\uFF1A\u6807\u7B7E\u5728\u4E0A\u3001\u8F93\u5165\u6846\u5728\u4E0B\uFF08\u6A2A\u6392\u653E\u4E0D\u4E0B"\u6253\u62DB\u547C / \u6295\u9012 / \u56DE\u590D"\u4E09\u4E2A\u5B8C\u6574\u6807\u7B7E\uFF09 */
		.jh-limits{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 12px}
		.jh-limit{display:flex;flex-direction:column;gap:4px;min-width:0}
		.jh-limit .jh-number{width:100%}

		/* \u53D1\u9001\u65F6\u6BB5\u8FD9\u4E24\u4E2A time \u8F93\u5165\u5728\u63A7\u5236\u884C\u91CC\uFF08.jh-ctl \u662F grid\uFF09\uFF1A.jh-timerange \u81EA\u5E26\u4E0B\u5916\u8FB9\u8DDD\uFF0C
		   \u5728\u884C\u5185\u4F1A\u628A\u8FD9\u884C\u6491\u9AD8\uFF0C\u6240\u4EE5\u6E05\u6389\u3002 */
		.jh-ctl .jh-timerange{margin:0}

		/* \u6309\u7528\u9014\u6C47\u603B\uFF08\u7559\u75D5\uFF09\uFF1A\u6BCF\u4E2A\u7528\u9014\u4E00\u683C\uFF0C\u6A2A\u5411\u6392\u5F00\u3002
		   \u610F\u56FE\u662F"\u54EA\u51E0\u9879\u5728\u70E7 token"\u2014\u2014\u5B83\u652F\u6491"\u8BE5\u5173\u6389\u54EA\u4E2A\u7528\u9014"\u8FD9\u4E2A\u51B3\u7B56\uFF0C\u6240\u4EE5\u653E\u5728\u8868\u683C\u4E0A\u65B9\u3002 */
		.jh-usage{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
		  gap:6px 14px;margin:0 0 12px}
		.jh-usage-item{display:flex;align-items:baseline;gap:6px;min-width:0;font-size:12px}
		.jh-usage-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
		  color:var(--dsw-alias-label-primary)}
		.jh-usage-num{font-variant-numeric:tabular-nums;font-weight:600}
		.jh-usage-unit{color:var(--jh-muted-fg)}

		/* \u8BBE\u7F6E\u9875\u90A3\u4E24\u5F20\u8868\uFF08\u7559\u75D5 / \u5BA1\u8BA1\uFF09\uFF1A\u4E0E\u300C\u6700\u8FD1\u8FD0\u884C\u300D\u300C\u5E73\u53F0\u77E9\u9635\u300D\u540C\u4E00\u6863\u5185\u8FB9\u8DDD\u3002
		   \u57FA\u7840\u6863\u662F 4px 6px \u2014\u2014 \u800C\u8FD9\u4E24\u5F20\u8868\u7684\u5355\u5143\u683C\u91CC\u653E\u7684\u662F 19px \u9AD8\u7684\u72B6\u6001\u6807\u7B7E\uFF0C
		   \u8D34\u8FB9\u4F1A\u5F88\u6324\uFF08\u7B2C\u4E09\u8F6E\u5DF2\u5728 .jh-table-runs/-matrix \u4E0A\u4E0B\u8FC7\u540C\u6837\u7684\u7ED3\u8BBA\uFF0C\u53EA\u662F\u6CA1\u63A8\u5E7F\u5230\u8FD9\u4E24\u5F20\uFF09\u3002 */
		.jh-table-roomy th,.jh-table-roomy td{padding:7px 10px;vertical-align:middle}
		/* \u65F6\u95F4\u5217\uFF1A\u5DE6\u5BF9\u9F50 + \u7B49\u5BBD\u6570\u5B57\uFF08\u4E0E .jh-table-runs \u7684\u7B2C\u4E00\u5217\u540C\u4E00\u5957\uFF09\uFF0C
		   **\u4E0D\u80FD**\u53F3\u5BF9\u9F50 \u2014\u2014 \u8868\u5934\u662F\u5DE6\u5BF9\u9F50\u7684\uFF0C\u5355\u5143\u683C\u53F3\u5BF9\u9F50\u4F1A\u8BA9\u5217\u5185\u9519\u4F4D\u3002 */
		.jh-table-roomy td:first-child{font-variant-numeric:tabular-nums;white-space:nowrap}

		/* \u6570\u636E\u6587\u4EF6\u90A3\u4E00\u884C\uFF1A\u8DEF\u5F84\u622A\u65AD + \u4E24\u4E2A\u52A8\u4F5C\u3002
		   \u2500\u2500 \u622A\u65AD\u800C\u4E0D\u662F\u6362\u884C\uFF1A\u4E00\u6761 60 \u5B57\u7B26\u7684\u7EDD\u5BF9\u8DEF\u5F84\u6362\u4E09\u884C\u4F1A\u628A\u6574\u4E2A\u8BCA\u65AD\u5361\u6491\u9AD8\uFF0C
		   \u800C\u5B83 99% \u7684\u65F6\u5019\u53EA\u662F"\u770B\u7740\u5BF9"\uFF1B\u8981\u5B8C\u6574\u5185\u5BB9\u6709 title \u4E0E\u590D\u5236\u6309\u94AE\u3002 */
		.jh-path{display:flex;align-items:center;gap:4px;min-width:0}
		.jh-path code{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
		  font-family:ui-monospace,Consolas,monospace;font-size:12px;padding:2px 6px;border-radius:5px;
		  background:var(--dsw-alias-markdown-inline-code)}
		/* \u89E6\u8FBE\u5C3A\u5BF8\uFF1AWCAG 2.2 \u7684 24\xD724\u3002.jh-icon-btn \u9ED8\u8BA4\u53EA\u6709 18px \u9AD8 \u2014\u2014 \u56FE\u6807\u6309\u94AE\u6700\u5BB9\u6613
		   \u5728\u8FD9\u6761\u4E0A\u88AB\u6F0F\u6389\uFF08\u5BA1\u6838\u91CC .jh-chip-x 13\xD713 \u5C31\u662F\u540C\u7C7B\u95EE\u9898\uFF09\u3002 */
		.jh-path .jh-icon-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;
		  min-width:24px;min-height:24px;padding:0}
		.jh-path .jh-icon-btn svg{display:block}

		/* \u8C03\u7528\u7559\u75D5\u7684\u300C\u5916\u53D1\u5B57\u6BB5\u300D\uFF1A\u5355\u5143\u683C\u91CC\u53EA\u7559\u4E00\u4E2A\u6570\u91CF\uFF0C\u70B9\u5F00\u624D\u770B\u5B8C\u6574 payload */
		.jh-payload-link{font-size:12px}
		/* \u7ED3\u679C\u5217\u7684\u72B6\u6001\u6807\u7B7E\uFF1A\u9519\u8BEF\u5217\u5B58\u7684\u662F\u5BBF\u4E3B\u7684\u9519\u8BEF\u6D88\u606F\uFF08\u53EF\u80FD\u4E00\u6574\u53E5\uFF09\uFF0C
		   \u6807\u7B7E\u672C\u8EAB\u9650\u5BBD\u622A\u65AD\uFF0C\u5168\u6587\u8FDB title \u2014\u2014 \u5426\u5219\u4E00\u53E5\u8BDD\u4F1A\u628A"\u7ED3\u679C"\u5217\u6491\u5230\u534A\u5F20\u8868\u5BBD\u3002 */
		.jh-tag-clip{max-width:16em;overflow:hidden;text-overflow:ellipsis}
		/* Payload JSON \u67E5\u770B\u5668\uFF08\u62BD\u5C49\u91CC\uFF09\u3002\u7B49\u5BBD + \u53EF\u6A2A\u5411\u6EDA\u52A8\uFF1AJSON \u6298\u884C\u540E\u5F88\u96BE\u8BFB\u3002 */
		.jh-json{margin:0;padding:10px 12px;border-radius:8px;max-height:56vh;overflow:auto;
		  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-markdown-code-block);
		  font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;
		  white-space:pre;color:var(--dsw-alias-label-primary)}
		.jh-json-hint{margin:0 0 8px}

		/* \u2500\u2500 \u91C7\u96C6\u9875\u91CD\u6784\uFF08\u7B2C\u516D\u8F6E\uFF0C2026-09-18\uFF09\uFF1A\u5206\u533A + \u56FA\u5B9A\u5DE5\u5177\u6761 + \u4E3B\u4ECE\u8868\u683C \u2500\u2500\u2500\u2500\u2500\u2500
		   \u8FD9\u4E00\u8F6E\u4FEE\u7684\u662F**\u53EF\u7528\u6027**\uFF1A\u539F\u6765\u300C\u89E6\u53D1\u4E0E\u8FD0\u884C / \u91C7\u96C6\u65B9\u6848 / \u8DE8\u5E73\u53F0\u53BB\u91CD / \u5E73\u53F0\u603B\u89C8 /
		   \u5E73\u53F0\u660E\u7EC6\u300D\u4E94\u4E2A\u6A21\u5757\u4E00\u62C9\u5230\u5E95 \u2014\u2014 \u6539\u914D\u7F6E\u8981\u7A7F\u8FC7\u72B6\u6001\u533A\uFF0C\u627E\u6309\u94AE\u8981\u9010\u5361\u626B\u63CF\uFF0C
		   \u800C\u300C\u5E73\u53F0\u603B\u89C8\u300D\u4E0E\u300C\u5E73\u53F0\u660E\u7EC6\u300D\u8BF4\u7684\u8FD8\u662F\u540C\u4E00\u6279\u5E73\u53F0\u3002\u4E09\u5904\u5BF9\u5E94\u4E09\u7EC4\u65B0\u6837\u5F0F\u3002 */

		/* \u2460 \u9876\u90E8\u56FA\u5B9A\u5DE5\u5177\u6761\uFF1A\u5206\u533A\u5207\u6362 + \u5168\u5C40\u64CD\u4F5C\u3002
		   \u8D1F\u5916\u8FB9\u8DDD\u62B5\u6389 .jh-screen \u7684 padding\uFF0C\u8BA9\u8FD9\u6761\u6A2A\u8D2F\u6574\u5C4F\u5E76\u8D34\u4F4F\u6EDA\u52A8\u5BB9\u5668\u9876\u90E8\uFF1B
		   \u5E95\u8272\u5FC5\u987B**\u4E0D\u900F\u660E**\uFF08bg-base\uFF09\uFF0C\u5426\u5219\u6EDA\u52A8\u65F6\u4E0B\u9762\u7684\u5185\u5BB9\u4F1A\u4ECE\u5B83\u8EAB\u4E0B\u900F\u51FA\u6765\u3002 */
		.jh-collect-bar{position:sticky;top:0;z-index:3;display:flex;align-items:center;
		  gap:8px;flex-wrap:wrap;margin:-16px -18px 12px;padding:10px 18px;
		  background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1)}
		.jh-collect-bar .jh-modes{flex:0 0 auto}
		/* \u8C03\u5EA6\u72B6\u6001\uFF1A\u5C0F\u5706\u70B9 + \u4E00\u53E5\u8BDD\u3002\u5B83\u56DE\u7B54"\u73B0\u5728\u662F\u4EC0\u4E48\u72B6\u6001"\uFF0C
		   \u6309\u94AE\u6587\u6848\u56DE\u7B54"\u70B9\u4E0B\u53BB\u4F1A\u53D1\u751F\u4EC0\u4E48" \u2014\u2014 \u4E24\u8005\u90FD\u8981\u6709\uFF0C\u7F3A\u4E00\u4E2A\u5C31\u5F97\u731C\u3002 */
		.jh-collect-switch{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;
		  color:var(--dsw-alias-label-secondary);white-space:nowrap}

		/* \u2461 \u9876\u90E8\u4E24\u680F\uFF08\u8FD0\u884C\u72B6\u6001 / \u5F53\u524D\u751F\u6548\u65B9\u6848\uFF09\u3002
		   \u5224\u65AD"\u7A84\u4E0D\u7A84"\u7684\u662F**\u9762\u677F**\u5BBD\u5EA6\uFF08container query\uFF09\uFF0C\u4E0D\u662F\u7A97\u53E3\u5BBD\u5EA6\uFF1A
		   \u4FA7\u680F\u4E00\u5C55\u5F00\u3001\u5BF9\u8BDD\u533A\u4E00\u6324\uFF0C\u7A97\u53E3\u8FD8\u5BBD\u7740\uFF0C\u9762\u677F\u5DF2\u7ECF\u653E\u4E0D\u4E0B\u4E24\u680F\u4E86\u3002
		   \u9876\u90E8\u7559\u767D\u7531 .jh-collect-top \u8D1F\u8D23\uFF0C\u6240\u4EE5\u683C\u5B50\u91CC\u7684\u5361\u4E0D\u518D\u81EA\u5E26\u4E0B\u5916\u8FB9\u8DDD\u3002 */
		.jh-collect-top{container-type:inline-size;margin:0 0 12px}
		.jh-collect-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);
		  gap:12px;align-items:start}
		.jh-collect-grid>.jh-card{margin:0}
		@container (max-width:760px){
		  .jh-collect-grid{grid-template-columns:minmax(0,1fr)}
		}
		/* \u65B9\u6848\u5361\u7684\u64CD\u4F5C\u884C\u653E**\u53F3\u4E0B\u89D2**\uFF1A\u8BFB\u914D\u7F6E\u5185\u5BB9\u65F6\u4E0D\u4F1A\u88AB\u4E00\u6392\u6309\u94AE\u4ECE\u4E2D\u95F4\u6253\u65AD\u3002
		   \u539F\u5148\u6309\u94AE\u6324\u5728\u6807\u9898\u53F3\u4FA7\uFF0C\u4E0E\u6807\u9898\u4E89\u540C\u4E00\u884C\u3002 */
		.jh-plan-actions{display:flex;gap:6px;justify-content:flex-end;
		  margin-top:10px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
		/* .jh-btn-tiny \u81EA\u5E26 margin-left:6px\uFF0C\u8FD9\u91CC\u662F flex + gap\uFF0C\u4E0D\u8981\u53E0\u52A0 */
		.jh-plan-actions .jh-btn{margin-left:0}
		.jh-plan-switch{margin:0 0 8px}

		/* \u2462 \u8868\u683C\uFF1A\u5185\u8FB9\u8DDD / \u5BF9\u9F50 / \u884C\u72B6\u6001\u3002
		   \u5B9E\u6D4B\u539F\u6765 th/td \u662F padding:4px 6px \u2014\u2014 \u5185\u5BB9\u8D34\u8FB9\u3001\u884C\u4E0E\u884C\u7CCA\u5728\u4E00\u8D77\uFF1B\u800C"\u72B6\u6001"\u683C\u91CC
		   \u653E\u7684\u662F 19px \u9AD8\u7684\u5FBD\u6807\uFF0C\u9700\u8981**\u5C45\u4E2D**\u624D\u4E0D\u50CF\u6324\u5728\u5DE6\u8FB9\u3002\u6570\u5B57\u4ECD\u7136\u53F3\u5BF9\u9F50\uFF08.jh-num\uFF09\u3002 */
		.jh-table-matrix th,.jh-table-matrix td{padding:8px 10px;vertical-align:middle}
		.jh-table-runs th,.jh-table-runs td{padding:7px 10px;vertical-align:middle}
		.jh-table th.jh-cell-status,.jh-table td.jh-cell-status{text-align:center}
		/* \u64CD\u4F5C\u5217\uFF1A\u767B\u5F55\u6001\u5FBD\u6807 + \u51E0\u9897\u6309\u94AE\u6392\u5728\u540C\u4E00\u884C\u3001\u53F3\u5BF9\u9F50\u3002
		   \u4E0E"\u6570\u5B57\u53F3\u5BF9\u9F50"\u540C\u4E00\u5957\u8BED\u6CD5 \u2014\u2014 \u626B\u8FD9\u4E00\u5217\u65F6\uFF0C\u51E0\u9897\u6309\u94AE\u843D\u5728\u540C\u4E00\u6761\u7AD6\u7EBF\u4E0A\u3002
		   \u8868\u683C\u7684\u6700\u540E\u4E00\u5217\u4F1A\u5403\u6389\u5269\u4F59\u5BBD\u5EA6\uFF08\u89C1 PLATFORM_MATRIX \u7684\u5217\u5BBD\u7B56\u7565\uFF09\uFF0C
		   \u6240\u4EE5\u7A84\u9762\u677F\u4E0B\u8FD9\u4E00\u683C\u5148\u88AB\u538B\u7F29\uFF1A\u5141\u8BB8\u6362\u884C\uFF0C\u522B\u8BA9\u6309\u94AE\u6324\u6210\u4E00\u6761\u8BFB\u4E0D\u4E86\u7684\u6A2A\u7EBF\u3002
		   .jh-btn-tiny \u81EA\u5E26 margin-left:6px \u2014\u2014 \u8FD9\u91CC\u662F flex + gap\uFF0C\u4E0D\u8981\u53E0\u52A0\u3002 */
		.jh-table td.jh-cell-actions{text-align:right}
		.jh-row-actions{display:flex;align-items:center;justify-content:flex-end;
		  gap:6px;flex-wrap:wrap}
		.jh-row-actions .jh-btn{margin-left:0}

		/* \u5E73\u53F0\u8BCA\u65AD\u660E\u7EC6\uFF08PlatformDetail\uFF09\u3002\u5B83\u73B0\u5728\u662F**\u5F39\u7A97\u5185\u5BB9**\uFF0C\u6240\u4EE5\u4E0D\u518D\u6709
		   "\u5DE6\u8FB9\u4E00\u6761\u7AD6\u7EBF\u8868\u793A\u5C5E\u4E8E\u4E0A\u9762\u90A3\u4E00\u884C" \u2014\u2014 \u5F39\u7A97\u672C\u8EAB\u5C31\u662F\u90A3\u4EFD\u5F52\u5C5E\u3002
		   \uFF08\u539F\u5148\u5B83\u662F\u77E9\u9635\u91CC\u7684\u884C\u5185\u5C55\u5F00\uFF1B\u90A3\u4E00\u5957\u89C4\u5219\u5DF2\u968F\u5C55\u5F00\u4E00\u8D77\u5220\u6389\uFF1A\u6B7B\u89C4\u5219\u7559\u7740\u6BD4\u5220\u6389\u66F4\u7CDF\uFF0C
		   \u4E0B\u4E00\u4E2A\u4EBA\u4F1A\u4EE5\u4E3A\u884C\u5185\u5C55\u5F00\u8FD9\u79CD\u5199\u6CD5\u8FD8\u5728\u7528\u3002\uFF09 */
		.jh-plat-detail{display:flex;flex-direction:column;gap:4px}
		.jh-plat-detail .jh-kv{margin:0 0 8px}
		/* \u8FD9\u91CC\u66FE\u7ECF\u6709\u4E00\u6761 .jh-plat-detail-row\uFF08\u653E"\u767B\u5F55 \u5FBD\u6807 + \u767B\u5F55\u6309\u94AE"\u90A3\u4E00\u884C\uFF09\u3002
		   \u968F\u7740\u767B\u5F55\u52A8\u4F5C\u56DE\u5230\u77E9\u9635\u884C\u91CC\uFF0C\u5B83\u6CA1\u6709\u4F7F\u7528\u8005\u4E86\u3002 */
		.jh-plat-detail-actions{display:flex;gap:6px;margin-top:6px}
		/* \u660E\u7EC6\u5F39\u7A97\u91CC\u90A3\u9897\u6309\u94AE\u4E0E .jh-btn-tiny \u7684 margin-left \u4E0D\u53E0\u52A0\uFF08\u540C .jh-plan-actions\uFF09 */
		.jh-plat-detail-actions .jh-btn{margin-left:0}

		/* \u80FD\u529B\u77E9\u9635\uFF08\u8BCA\u65AD\u4E0E\u660E\u7EC6\u5206\u533A\uFF09\uFF1A12 \u5217\uFF0C**\u4E0D\u5957\u7528** .jh-table-matrix \u7684\u5217\u5BBD\u7B56\u7565 \u2014\u2014
		   \u90A3\u4E00\u5957\u4F1A nowrap \u6240\u6709\u975E\u672B\u5217\uFF0C\u800C\u8FD9\u91CC"\u6210\u719F\u5EA6"\u683C\u4E0B\u9762\u8FD8\u6302\u7740"\u5DF2\u77E5\u7F3A\u53E3"\u7684\u8BF4\u660E\u53E5\uFF0C
		   nowrap \u4F1A\u628A\u5B83\u538B\u6210\u4E00\u6761\u8BFB\u4E0D\u4E86\u7684\u6A2A\u7EBF\u3002\u5141\u8BB8\u6362\u884C\u3001\u7ED9\u4E00\u4E2A\u6700\u5C0F\u5BBD\u5EA6\u8BA9\u5B83\u6A2A\u5411\u6EDA\u52A8\u3002 */
		.jh-table-caps{min-width:900px}
		.jh-table-caps th,.jh-table-caps td{padding:7px 10px;vertical-align:top;text-align:left}
		/* \u9996\u5217\u7C98\u4F4F\uFF1A\u4E0E\u300C\u5E73\u53F0\u72B6\u6001\u603B\u89C8\u300D\u540C\u4E00\u5957\u505A\u6CD5\uFF08\u89C1 PLATFORM_MATRIX \u90A3\u6BB5\uFF09\u3002
		   900px \u7684\u8868\u5728\u7A84\u5C4F\u4E00\u5B9A\u4F1A\u6A2A\u6ED1\uFF0C\u800C\u6A2A\u6ED1\u5230\u53F3\u8FB9\u51E0\u5217\u65F6\uFF0C\u6CA1\u6709\u7C98\u6027\u9996\u5217\u5C31\u770B\u4E0D\u51FA
		   \u8FD9\u4E00\u884C\u662F\u54EA\u4E2A\u5E73\u53F0 \u2014\u2014 "\u4FDD\u7559\u884C\u8EAB\u4EFD"\u662F\u672C\u9879\u76EE\u5141\u8BB8\u6A2A\u6ED1\u7684\u524D\u63D0\u3002
		   \u53EA\u501F"\u7C98\u4F4F"\u8FD9\u4E00\u4EF6\u4E8B\uFF0C**\u4E0D\u501F** width:1% \u90A3\u5957\u5217\u5BBD\u7B56\u7565\uFF08\u539F\u56E0\u89C1\u4E0A\u9762\u90A3\u6761\u6CE8\u91CA\uFF09\u3002 */
		.jh-table-caps th.jh-col-sticky,.jh-table-caps td.jh-col-sticky{
		  position:sticky;left:0;z-index:1;background:var(--dsw-alias-bg-layer-1)}
		`;

		// src/client/styles/responsive.ts
		var SMALL_TOP = `
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
		`;
		var SMALL = `
		/* \u2500\u2500 \u5C0F\u5C4F\uFF08\u2264480px\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
		   quality-gates \xA75 \u8981\u6C42 375px \u53EF\u7528\uFF1Brules \xA77 \u8981\u6C42\u5F39\u7A97\u5728\u79FB\u52A8\u7AEF\u8003\u8651\u5E95\u90E8\u62BD\u5C49/\u5168\u5C4F\u9875\u3002 */
		@media (max-width:480px){
		  /* \u5F39\u7A97\uFF1A\u5C0F\u5C4F\u53D8\u6210\u63A5\u8FD1\u5168\u5C4F\u7684\u9875\u9762\uFF0C\u800C\u4E0D\u662F\u5361\u7247\u7559 16px \u8FB9 */
		  .jh-modal-layer{padding:0;align-items:stretch}
		  .jh-modal{max-height:100%;height:100%;border-radius:0;border-left:0;border-right:0}
		  .jh-modal-md,.jh-modal-lg{max-width:none}
		  /* \u4F4E\u5BC6\u5EA6\uFF1A\u5C0F\u5C4F\u9690\u85CF\u300C\u66F4\u65B0\u300D\u5217\uFF0C\u4FDD\u7559 \u65F6\u95F4/\u72B6\u6001/\u65B0\u589E/\u7ED3\u679C\u8BF4\u660E \u8FD9\u56DB\u5217\u5173\u952E\u4FE1\u606F */
		  .jh-table-runs .jh-col-hide-sm{display:none}
		  /* \u77E9\u9635\u540C\u7406\uFF1A\u5C0F\u5C4F\u5148\u8BA9\u300C\u6210\u719F\u5EA6\u300D\u300C\u4EA7\u91CF\u300D\u8BA9\u4F4D\uFF0C\u7559\u4E0B \u5E73\u53F0/\u4ECA\u5929\u80FD\u8DD1/\u767B\u5F55/\u5065\u5EB7/\u989D\u5EA6/\u6700\u8FD1\u4E00\u8F6E */
		  .jh-table-matrix .jh-col-hide-sm{display:none}
		  /* \u80FD\u529B\u77E9\u9635\uFF1A\u8BA9\u300C\u6210\u719F\u5EA6\u300D\u300C\u4E0A\u6B21\u9A8C\u8BC1\u300D\u4E24\u5217\u9000\u573A\uFF08\u5B83\u4EEC\u6700\u4E0D\u8BA9\u4F4D\uFF09\uFF0C
		     \u5176\u4F59\u7167\u65E7\u6A2A\u6ED1 \u2014\u2014 \u9996\u5217\u5DF2\u7ECF\u7C98\u4F4F\uFF0C\u6A2A\u6ED1\u65F6\u4ECD\u8BA4\u5F97\u51FA\u662F\u54EA\u4E00\u884C */
		  .jh-table-caps .jh-col-hide-sm{display:none}
		  /* \u91C7\u96C6\u9875\u9876\u90E8\u5DE5\u5177\u6761\uFF1A\u8FD9\u91CC\u88C5\u7740 3 \u4E2A\u5206\u533A\u6309\u94AE + \u72B6\u6001 + 3 \u4E2A\u5168\u5C40\u6309\u94AE\uFF0C
		     375px \u4E0B\u5FC5\u7136\u6298\u6210 2~3 \u884C\u3002\u5B83\u539F\u6765\u8FD8\u5E26 position:sticky \u2014\u2014
		     \u7B49\u4E8E\u5E38\u9A7B\u5403\u6389\u89C6\u53E3\u9AD8\u5EA6\u7684 1/4~1/3\uFF0C\u800C\u5B83\u4E0B\u9762\u662F\u8FD9\u4E00\u9875\u771F\u6B63\u8981\u770B\u7684\u5185\u5BB9\u3002
		     \u7A84\u5C4F\u6539\u56DE\u968F\u9875\u9762\u6EDA\u52A8\uFF1A"\u968F\u624B\u591F\u5F97\u7740"\u5728\u8FD9\u91CC\u4E0D\u5982"\u770B\u5F97\u89C1\u5185\u5BB9"\u91CD\u8981\u3002 */
		  .jh-collect-bar{position:static}
		  /* \u72B6\u6001\u53EA\u7559\u5706\u70B9\uFF08\u4E0E\u9876\u680F .jh-live \u540C\u4E00\u5957\u964D\u7EA7\uFF09\u3002\u5706\u70B9\u672C\u8EAB\u662F aria-hidden\uFF0C
		     \u6240\u4EE5\u72B6\u6001\u5BF9\u8BFB\u5C4F\u4ECD\u7136\u5B8C\u6574 \u2014\u2014 \u9760\u7684\u5C31\u662F\u88AB\u9690\u6389\u7684\u8FD9\u4E00\u5C42\u6587\u5B57\u3002 */
		  .jh-collect-switch-text{display:none}
		  .jh-clip{max-width:11em}
		  /* \u4E3B\u8981\u64CD\u4F5C\u5728\u5C0F\u5C4F\u4ECD\u7136\u627E\u5F97\u5230\uFF1A\u65B9\u6848\u5361\u7684\u52A8\u4F5C\u6362\u884C\u4E14\u5DE6\u5BF9\u9F50\uFF0C\u4E0D\u6324\u6210\u4E00\u6761 */
		  .jh-plan-head{gap:4px}
		  .jh-plan-head .jh-btn{flex:0 0 auto}
		  /* \u65F6\u95F4\u8303\u56F4\u5728\u5C0F\u5C4F\u6362\u884C\u663E\u793A\uFF0C\u907F\u514D\u4E24\u4E2A\u8F93\u5165\u6846\u88AB\u538B\u6241 */
		  .jh-timerange{gap:6px}
		  .jh-time{width:100%;max-width:160px}
		}
		`;

		// src/client/styles/screens/today.ts
		var TODAY = `
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
		`;
		var TODAY_HEALTH = `
		.jh-today-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
		.jh-health-line{font-size:12.5px}
		`;

		// src/client/styles/toolviews.ts
		var TOOLVIEW_CARD = `
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
		`;

		// src/client/styles/index.ts
		function installStyles() {
		  for (const stale of document.querySelectorAll(`style[data-plugin="${PLUGIN_ID}"]`)) stale.remove();
		  const style = document.createElement("style");
		  style.setAttribute("data-plugin", PLUGIN_ID);
		  style.textContent = CSS;
		  document.head.appendChild(style);
		  return () => style.remove();
		}
		var CSS = [ENTRY_ICON, SEMANTIC_TEXT, SHELL, SCREEN, CARD_TITLE, CONTROLS, JOBS_FILTERS, TODAY, COLLECT_BUTTONS, JOBS, JOBS_DEDUP, TAG_AND_STATE, PAGER, PAGER_CONTRAST_FIX, JOBS_SPLIT, MATCH_AND_FLAGS, DETAIL, OVERLAY, TOOLVIEW_CARD, RESUMES, TAILOR_AND_FILE, PIPELINE_GROUP, PIPELINE, MESSAGES, FUNNEL, BOARD_FILTERS, CAMPUS, FRESHNESS, TODAY_HEALTH, LINK, PLANS, COMPANY_REVIEW_AND_SIBLINGS, SALARY_BOX, COLLECT_USABILITY, MODAL_SEG_TIMERANGE, PLAN_EDITOR_MODAL, DESTRUCTIVE_BUTTONS, QUALITY_GATES, RUNS_TABLE, PLATFORM_MATRIX, EMPTY_AND_FEEDBACK, SETTINGS, SWITCH_AND_NUMBER, SETTINGS_PURPOSES_AND_USAGE, SMALL_TOP, SMALL, BOARD_V2].join("\n");

		// src/client/toolviews/greeting-card.tsx
		var import_react41 = require("react");

		// src/client/toolviews/parts.tsx
		var import_react40 = require("react");

		// src/shared/text/tool-format.ts
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
		  return (0, import_react40.createElement)(
		    "div",
		    { className: "jh-tv", "data-tone": tone },
		    (0, import_react40.createElement)(
		      "div",
		      { className: "jh-tv-head" },
		      (0, import_react40.createElement)("span", { className: "jh-tv-title" }, title),
		      subtitle === void 0 || subtitle === "" ? null : (0, import_react40.createElement)("span", { className: "jh-tv-sub" }, subtitle),
		      (0, import_react40.createElement)("span", { className: "jh-spacer" }),
		      actions === void 0 ? null : (0, import_react40.createElement)("span", { className: "jh-tv-actions" }, actions),
		      inspect === void 0 ? null : (0, import_react40.createElement)(
		        "button",
		        { type: "button", className: "jh-tv-link", onClick: inspect },
		        "\u67E5\u770B"
		      )
		    ),
		    children === void 0 ? null : (0, import_react40.createElement)("div", { className: "jh-tv-body" }, children)
		  );
		}
		function JobRow2(props) {
		  const { job, onOpen } = props;
		  return (0, import_react40.createElement)(
		    "button",
		    {
		      type: "button",
		      className: "jh-tv-job",
		      onClick: () => onOpen(job.id),
		      title: "\u5728\u4E3B\u9762\u677F\u91CC\u6253\u5F00\u8FD9\u4E2A\u5C97\u4F4D"
		    },
		    (0, import_react40.createElement)("span", { className: "jh-tv-job-id" }, `#${String(job.id)}`),
		    (0, import_react40.createElement)("span", { className: "jh-tv-job-title" }, job.title),
		    (0, import_react40.createElement)("span", { className: "jh-tv-job-meta" }, [job.company, job.city].filter((p) => p !== "").join(" \xB7 ")),
		    (0, import_react40.createElement)("span", { className: "jh-spacer" }),
		    (0, import_react40.createElement)("span", { className: "jh-tv-job-salary" }, job.salary),
		    (0, import_react40.createElement)("span", { className: "jh-tv-job-score" }, job.score)
		  );
		}
		function useAction() {
		  const [busy, setBusy] = (0, import_react40.useState)(false);
		  const [error, setError] = (0, import_react40.useState)(null);
		  const [result, setResult] = (0, import_react40.useState)(null);
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
		var import_jsx_runtime90 = require("react/jsx-runtime");
		function GreetingCard(props) {
		  const { block, inspect } = props;
		  const settled = isSettled(block);
		  const text = textOf(block);
		  const failed = block.isError === true;
		  const [copied, setCopied] = (0, import_react41.useState)(false);
		  const parsed = splitDraft(text);
		  const jobId = jobIdOf(props);
		  return /* @__PURE__ */ (0, import_jsx_runtime90.jsxs)(
		    CardShell,
		    {
		      title: "\u6253\u62DB\u547C\u8BDD\u672F",
		      subtitle: failed ? block.error?.code ?? "\u5931\u8D25" : settled ? parsed.source : "\u6B63\u5728\u751F\u6210\u2026",
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      actions: settled && !failed ? /* @__PURE__ */ (0, import_jsx_runtime90.jsx)(
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
		        !settled ? /* @__PURE__ */ (0, import_jsx_runtime90.jsx)("p", { className: "jh-tv-note", children: "\u6B63\u5728\u751F\u6210\u2026\u6A21\u578B\u4E0D\u53EF\u7528\u65F6\u4F1A\u81EA\u52A8\u9000\u56DE\u5185\u7F6E\u6A21\u677F\u3002" }) : failed ? /* @__PURE__ */ (0, import_jsx_runtime90.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : /* @__PURE__ */ (0, import_jsx_runtime90.jsxs)(import_jsx_runtime90.Fragment, { children: [
		          /* @__PURE__ */ (0, import_jsx_runtime90.jsx)("pre", { className: "jh-tv-pre jh-tv-pre-body", children: parsed.body }),
		          parsed.meta === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime90.jsx)("p", { className: "jh-tv-note", children: parsed.meta }),
		          /* @__PURE__ */ (0, import_jsx_runtime90.jsx)("p", { className: "jh-tv-note", children: "\u8FD8\u6CA1\u6709\u53D1\u9001 \u2014\u2014 \u53D1\u9001\u662F\u9AD8\u5371\u52A8\u4F5C\uFF0C\u9700\u8981\u5728\u9762\u677F\u91CC\u786E\u8BA4\u3002" })
		        ] }),
		        jobId === null || !settled || failed ? null : /* @__PURE__ */ (0, import_jsx_runtime90.jsx)("div", { className: "jh-tv-foot", children: /* @__PURE__ */ (0, import_jsx_runtime90.jsx)(
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
		var import_react42 = require("react");
		var import_jsx_runtime91 = require("react/jsx-runtime");
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
		  const [copied, setCopied] = (0, import_react42.useState)(false);
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
		  return /* @__PURE__ */ (0, import_jsx_runtime91.jsxs)(
		    CardShell,
		    {
		      title: "\u5C97\u4F4D\u8BE6\u60C5",
		      subtitle: failed ? block.error?.code ?? "\u5931\u8D25" : settled ? titleLine : "\u6B63\u5728\u8BFB\u53D6\u2026",
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      actions: jobId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime91.jsxs)(import_jsx_runtime91.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled: mark.busy, onClick: onMark, children: mark.busy ? "\u6536\u85CF\u4E2D\u2026" : "\u6536\u85CF" }),
		        /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", disabled: draft.busy, onClick: onDraft, children: draft.busy ? "\u751F\u6210\u4E2D\u2026" : "\u751F\u6210\u8BDD\u672F" }),
		        /* @__PURE__ */ (0, import_jsx_runtime91.jsx)(
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
		        failed ? /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : !settled ? /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("p", { className: "jh-tv-note", children: "\u6B63\u5728\u8BFB\u53D6\u5C97\u4F4D\u8BE6\u60C5\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("div", { className: "jh-tv-rows", children: rows.map(
		          (row, index) => row === null ? null : /* @__PURE__ */ (0, import_jsx_runtime91.jsxs)("div", { className: "jh-tv-row", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("span", { className: "jh-tv-label", children: row.key }),
		            /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("span", { className: "jh-tv-value", children: row.value })
		          ] }, `${row.key}-${String(index)}`)
		        ) }),
		        mark.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("p", { className: "jh-tv-error", children: mark.error }),
		        mark.result === null ? null : /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("p", { className: "jh-tv-ok", children: mark.result }),
		        draft.error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("p", { className: "jh-tv-error", children: draft.error }),
		        draft.result === null ? null : /* @__PURE__ */ (0, import_jsx_runtime91.jsxs)("div", { className: "jh-tv-draft", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("pre", { className: "jh-tv-pre", children: draft.result }),
		          /* @__PURE__ */ (0, import_jsx_runtime91.jsxs)("div", { className: "jh-tv-foot", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime91.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime91.jsx)("span", { className: "jh-tv-note", children: "\u8FD9\u6BB5**\u8FD8\u6CA1\u6709\u53D1\u9001** \u2014\u2014 \u53D1\u9001\u8981\u53BB\u9762\u677F\u91CC\u786E\u8BA4\u3002" })
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
		var import_jsx_runtime92 = require("react/jsx-runtime");
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
		  return /* @__PURE__ */ (0, import_jsx_runtime92.jsxs)(
		    CardShell,
		    {
		      title,
		      subtitle,
		      tone: failed ? "error" : "normal",
		      ...inspect === void 0 ? {} : { inspect },
		      children: [
		        running ? /* @__PURE__ */ (0, import_jsx_runtime92.jsx)("p", { className: "jh-tv-note", children: toolName === "job_search" ? "\u6B63\u5728\u6293\u53D6 \u2014\u2014 \u4F1A\u771F\u7684\u6253\u5F00\u6D4F\u89C8\u5668\uFF0C\u901A\u5E38\u5341\u51E0\u79D2\u5230\u4E00\u5206\u949F\u3002" : "\u6B63\u5728\u8BFB\u53D6\u2026" }) : failed ? /* @__PURE__ */ (0, import_jsx_runtime92.jsx)("p", { className: "jh-tv-error", children: text === "" ? "\u8FD9\u6B21\u8C03\u7528\u5931\u8D25\u4E86\u3002" : text }) : jobs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime92.jsx)("p", { className: "jh-tv-note", children: text === "" ? "\u6CA1\u6709\u7ED3\u679C\u3002" : text }) : /* @__PURE__ */ (0, import_jsx_runtime92.jsx)("div", { className: "jh-tv-jobs", children: jobs.map((job) => /* @__PURE__ */ (0, import_jsx_runtime92.jsx)(JobRow2, { job, onOpen: (id) => openJobInPanel(id) }, job.id)) }),
		        running || failed || jobs.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime92.jsx)("div", { className: "jh-tv-foot", children: /* @__PURE__ */ (0, import_jsx_runtime92.jsx)("button", { type: "button", className: "jh-btn jh-btn-inline", onClick: () => openJobInPanel(jobs[0].id), children: "\u53BB\u9762\u677F\u770B\u5168\u90E8" }) })
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

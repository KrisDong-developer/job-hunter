/**
 * v1 建表 DDL（ARCHITECTURE §7）。
 *
 * **与 §3 目录树的一处差异**：文档写的是 `schema.sql` 文件，这里改成 TS 模块导出。
 * 理由：宿主半由 `tsc` 逐文件输出、测试由 esbuild 打包，两种产物都不会自动带上
 * 同目录的 `.sql`；一旦没带上，运行期才报“文件找不到”。把 DDL 作为字符串常量放进
 * 模块里，产物天然自包含，也仍然只有**一份**权威来源（不存在与 .sql 漂移的问题）。
 *
 * 约定：
 *   * 时间一律 ISO-8601 字符串（UTC），字段名以 `_at` 结尾；
 *   * 布尔存 INTEGER 0/1；
 *   * 结构化小对象存 `*_json`，**只存标量 JSON**（§4.3 P7）；
 *   * 阶段后置的表（resume / greeting / application / interview / audit_log / llm_call …）
 *     由各自阶段的迁移补上，不预建空壳 —— 免得设计与实现漂移；
 *   * 连接级 PRAGMA 归 `db.ts`，这里只建表。
 */
export const SCHEMA_V1 = `-- ── 平台与账号（绝不存密码）────────────────────────────────────────────
CREATE TABLE platform (
  id                TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 1,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  health_state      TEXT NOT NULL DEFAULT 'healthy',
  health_reason     TEXT,
  fail_streak       INTEGER NOT NULL DEFAULT 0,
  last_ok_at        TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE account_state (
  platform_id  TEXT PRIMARY KEY REFERENCES platform(id) ON DELETE CASCADE,
  logged_in    INTEGER NOT NULL DEFAULT 0,
  hidden_from_current_employer INTEGER,
  last_check_at TEXT,
  hint         TEXT,
  updated_at   TEXT NOT NULL
);

-- ── 搜索方案 ──────────────────────────────────────────────────────────
CREATE TABLE plan (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  platforms_json TEXT NOT NULL DEFAULT '[]',
  criteria_json  TEXT NOT NULL DEFAULT '{}',
  keywords_json  TEXT NOT NULL DEFAULT '[]',
  exclude_json   TEXT NOT NULL DEFAULT '[]',
  schedule_json  TEXT NOT NULL DEFAULT '{}',
  enabled        INTEGER NOT NULL DEFAULT 1,
  last_run_at    TEXT,
  next_run_at    TEXT,
  created_at     TEXT NOT NULL
);

-- ── 抓取运行（§7.0 状态机之一）───────────────────────────────────────
CREATE TABLE crawl_run (
  id          INTEGER PRIMARY KEY,
  plan_id     INTEGER REFERENCES plan(id) ON DELETE SET NULL,
  platform_id TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  state       TEXT NOT NULL,
  pages       INTEGER NOT NULL DEFAULT 0,
  found       INTEGER NOT NULL DEFAULT 0,
  inserted    INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  quarantined INTEGER NOT NULL DEFAULT 0,
  error_code  TEXT,
  error_msg   TEXT,
  log_ref     TEXT
);
CREATE INDEX idx_crawl_run_platform_started ON crawl_run(platform_id, started_at DESC);

-- ── 公司（一等实体）───────────────────────────────────────────────────
CREATE TABLE company (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  name_norm    TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  industry     TEXT,
  size         TEXT,
  nature       TEXT,
  blacklisted  INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   TEXT NOT NULL
);
-- name_norm 唯一：归一化后的名字就是实体身份。
-- 模糊合并留给 P4 的 dedup_group（铁律：不确定宁可不合并）。
CREATE UNIQUE INDEX ux_company_name_norm ON company(name_norm);

CREATE TABLE company_profile (
  company_id       INTEGER PRIMARY KEY REFERENCES company(id) ON DELETE CASCADE,
  job_count        INTEGER NOT NULL DEFAULT 0,
  stack_diversity  INTEGER NOT NULL DEFAULT 0,
  geo_spread       INTEGER NOT NULL DEFAULT 0,
  onsite_ratio     REAL,
  name_keyword_hits INTEGER NOT NULL DEFAULT 0,
  publish_rhythm_json TEXT NOT NULL DEFAULT '{}',
  outsourcing_score REAL,
  fraud_score      REAL,
  manual_label     TEXT,
  updated_at       TEXT NOT NULL
);

-- ── 岗位 ──────────────────────────────────────────────────────────────
CREATE TABLE job (
  id              INTEGER PRIMARY KEY,
  platform_id     TEXT NOT NULL,
  platform_job_id TEXT NOT NULL,
  dedup_group_id  INTEGER,
  title           TEXT NOT NULL,
  company_id      INTEGER REFERENCES company(id) ON DELETE SET NULL,
  salary_raw      TEXT NOT NULL DEFAULT '',
  salary_min      INTEGER,
  salary_max      INTEGER,
  salary_months   INTEGER,
  city            TEXT NOT NULL DEFAULT '',
  district        TEXT NOT NULL DEFAULT '',
  landmark        TEXT,
  exp_req         TEXT NOT NULL DEFAULT '',
  edu_req         TEXT NOT NULL DEFAULT '',
  tags_json       TEXT NOT NULL DEFAULT '[]',
  jd_text         TEXT,
  jd_summary      TEXT,
  published_at    TEXT,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  crawled_at      TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  snapshot_ref    TEXT,
  match_score     REAL,
  match_reasons_json TEXT,
  state           TEXT NOT NULL DEFAULT 'new'
);
-- 单平台内幂等：重复跑不产生重复数据（§6.1 / §4.10.1）
CREATE UNIQUE INDEX ux_job_platform ON job(platform_id, platform_job_id);
CREATE INDEX idx_job_state      ON job(state);
CREATE INDEX idx_job_city       ON job(city);
CREATE INDEX idx_job_salary_min ON job(salary_min);
CREATE INDEX idx_job_crawled_at ON job(crawled_at);
CREATE INDEX idx_job_company    ON job(company_id);
CREATE INDEX idx_job_dedup      ON job(dedup_group_id);

-- ── 脏数据隔离队列（§4.2.4）─────────────────────────────────────────
-- 字段断言不合格的记录**不写主表**；原始片段留在这里，供修好选择器后重放解析。
CREATE TABLE pending_repair (
  id              INTEGER PRIMARY KEY,
  platform_id     TEXT NOT NULL,
  crawl_run_id    INTEGER REFERENCES crawl_run(id) ON DELETE SET NULL,
  captured_at     TEXT NOT NULL,
  missing_fields_json TEXT NOT NULL,
  raw_json        TEXT NOT NULL,
  raw_html        TEXT,
  source_url      TEXT,
  replay_state    TEXT NOT NULL DEFAULT 'pending',
  replayed_at     TEXT,
  replayed_job_id INTEGER REFERENCES job(id) ON DELETE SET NULL,
  note            TEXT
);
CREATE INDEX idx_pending_repair_platform ON pending_repair(platform_id, replay_state);

-- ── 逐核心字段的连续缺失计数（§4.2.4）────────────────────────────────
-- 任一字段连续缺失达阈值 → 适配器降级 + 主动告警。
CREATE TABLE adapter_field_health (
  platform_id      TEXT NOT NULL,
  field            TEXT NOT NULL,
  consecutive_miss INTEGER NOT NULL DEFAULT 0,
  miss_total       INTEGER NOT NULL DEFAULT 0,
  hit_total        INTEGER NOT NULL DEFAULT 0,
  last_miss_at     TEXT,
  last_hit_at      TEXT,
  PRIMARY KEY (platform_id, field)
);

-- ── 系统 ──────────────────────────────────────────────────────────────
CREATE TABLE todo (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'info',
  title       TEXT NOT NULL,
  ref         TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  due_at      TEXT,
  state       TEXT NOT NULL DEFAULT 'open',
  read_at     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_todo_state ON todo(state, level);

-- 配置以 DB 为权威（ADR-19 / D-18）：选择器与字段→URL 映射都存在这里，
-- 形如 scope='platform' / scope_ref='51job' / key='selectors'。
CREATE TABLE setting (
  key        TEXT NOT NULL,
  scope      TEXT NOT NULL,
  scope_ref  TEXT NOT NULL DEFAULT '',
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key, scope, scope_ref)
);
`

/**
 * v2：情报引擎（P4）。
 *
 * 四张表都对应 §7 的设计：
 *   * `dictionary`      —— 黑话/信号词表（§4.10.3：词表驱动、命中即产出解释与权重、**不走 LLM**）；
 *   * `job_flag`        —— 岗位标注（外包 / 诈骗 / 僵尸 / 薪资虚标 / 黑话命中），带 `evidence_json`；
 *   * `company_signal`  —— 公司维度的信号累积（识别引擎的依据在这里留痕，也是合并可逆的凭据）；
 *   * `dedup_group`     —— 跨平台去重分组，`basis` 记录**合并依据**（§4.10.1 铁律 3）。
 */
export const SCHEMA_V2 = `
-- ── 词表（黑话 / 外包 / 诈骗 / 僵尸 / 薪资信号）─────────────────────
CREATE TABLE dictionary (
  id      INTEGER PRIMARY KEY,
  kind    TEXT NOT NULL,
  scope   TEXT NOT NULL DEFAULT 'global',
  term    TEXT NOT NULL,
  meaning TEXT,
  weight  REAL NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1
);
-- 同一个词在同一个 kind+scope 下只能有一条，便于幂等播种
CREATE UNIQUE INDEX ux_dictionary_term ON dictionary(kind, scope, term);
CREATE INDEX idx_dictionary_kind ON dictionary(kind, enabled);

-- ── 岗位标注（每条证据都要能指回原文）───────────────────────────────
CREATE TABLE job_flag (
  id            INTEGER PRIMARY KEY,
  job_id        INTEGER NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  flag_type     TEXT NOT NULL,
  score         REAL NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  computed_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_job_flag ON job_flag(job_id, flag_type);
CREATE INDEX idx_job_flag_type ON job_flag(flag_type);

-- ── 公司信号（识别引擎的依据留痕；也是公司合并可逆的凭据）──────────
CREATE TABLE company_signal (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  weight        REAL NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'rule',
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_company_signal_company ON company_signal(company_id, type);

-- ── 跨平台去重分组（§4.10.1）────────────────────────────────────────
CREATE TABLE dedup_group (
  id             INTEGER PRIMARY KEY,
  primary_job_id INTEGER REFERENCES job(id) ON DELETE SET NULL,
  member_ids_json TEXT NOT NULL DEFAULT '[]',
  basis          TEXT NOT NULL,
  score          REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_dedup_group_primary ON dedup_group(primary_job_id);
`

/**
 * v3：安全与工具（P5）。
 *
 *   * `audit_log` —— 每一次过闸门的动作（§4.4.3）。**只存字段摘要与长度**：
 *     简历全文、话术全文这类涉敏正文一律不入审计表（§4.1 审计表隐私策略），
 *     否则审计表自己会变成隐私黑洞；
 *   * `llm_call`   —— 每次模型调用的**外发字段清单**与 token（I5：用户必须能查到
 *     "我的哪些数据被发给了模型"）。与 `audit_log` 分开，便于独立查询与独立保留期。
 */
export const SCHEMA_V3 = `
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY,
  at            TEXT NOT NULL,
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  target_json   TEXT NOT NULL DEFAULT '{}',
  detail_json   TEXT NOT NULL DEFAULT '{}',
  result        TEXT NOT NULL,
  reason        TEXT,
  approval_json TEXT,
  duration_ms   INTEGER,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_audit_at ON audit_log(at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor, at DESC);

CREATE TABLE llm_call (
  id                INTEGER PRIMARY KEY,
  at                TEXT NOT NULL,
  purpose           TEXT NOT NULL,
  provider          TEXT,
  model             TEXT,
  fields_json       TEXT NOT NULL DEFAULT '[]',
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  ref_json          TEXT NOT NULL DEFAULT '{}',
  ok                INTEGER NOT NULL DEFAULT 1,
  error_code        TEXT,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_llm_call_at ON llm_call(at DESC);
CREATE INDEX idx_llm_call_purpose ON llm_call(purpose, at DESC);
`

/**
 * v4：简历与附件（P6，§7 / §11.3 / §17）。
 *
 *   * `resume`      —— **版本化**是核心：§3.2 明确"简历是资产，按岗位方向维护 2–3 版"，
 *     而不是每投一个岗位生成一版。所以既有 `direction`（方向）又有 `name`（版本名）；
 *   * `resume.rev`  —— 版本号。`job.score_rev` 与它比对来判断"这个分是不是过期了"（§4.1）；
 *   * `resume_file` —— 生成出来的附件（PDF/DOCX/HTML）。`path` 是**相对**
 *     `$DSH_HOME/job-hunter/files/` 的路径，这样换机器/换目录只改一个根；
 *   * `tailoring`   —— 针对某个岗位的定制结果。`adopted` 记录用户是否采用；
 *     `outcome` 留给 P7 的归因（"这版定制有没有带来回复"）。
 *
 * 两张表都**不删数据**：简历是用户资产，只能由用户显式删除（§18 保留策略）。
 * 所以外键用 `ON DELETE CASCADE` 只在用户真的删简历时生效，别处一律不碰。
 *
 * `job` 上新增两列，落实 §4.1 那条"最容易出的看起来对、其实全错的 bug"：
 *   `score_rev` / `score_resume_id` 记下"这个分是拿哪一版简历、哪个 rev 算的"。
 */
export const SCHEMA_V4 = `
CREATE TABLE resume (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  direction    TEXT NOT NULL DEFAULT '',
  language     TEXT NOT NULL DEFAULT 'zh',
  content_json TEXT NOT NULL DEFAULT '{}',
  state        TEXT NOT NULL DEFAULT 'active',
  is_default   INTEGER NOT NULL DEFAULT 0,
  rev          INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_resume_state ON resume(state);
CREATE INDEX idx_resume_default ON resume(is_default, direction);

CREATE TABLE resume_file (
  id         INTEGER PRIMARY KEY,
  resume_id  INTEGER NOT NULL REFERENCES resume(id) ON DELETE CASCADE,
  format     TEXT NOT NULL,
  template   TEXT NOT NULL DEFAULT 'concise',
  path       TEXT NOT NULL,
  bytes      INTEGER NOT NULL DEFAULT 0,
  file_name  TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_resume_file_resume ON resume_file(resume_id, created_at DESC);

CREATE TABLE tailoring (
  id           INTEGER PRIMARY KEY,
  resume_id    INTEGER NOT NULL REFERENCES resume(id) ON DELETE CASCADE,
  job_id       INTEGER REFERENCES job(id) ON DELETE SET NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  via          TEXT NOT NULL DEFAULT 'rule',
  notes_json   TEXT NOT NULL DEFAULT '[]',
  adopted      INTEGER NOT NULL DEFAULT 0,
  outcome      TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_tailoring_resume ON tailoring(resume_id, created_at DESC);
CREATE INDEX idx_tailoring_job ON tailoring(job_id, created_at DESC);

-- §4.1：匹配分是简历版本的函数。算分时记下用的是哪一版、哪个 rev。
ALTER TABLE job ADD COLUMN score_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job ADD COLUMN score_resume_id INTEGER;
`

/**
 * v5：跟进与看板（P7，§7 / §11.3 / §12）。
 *
 * 这张库里现在有**四套独立状态机**（§7.0 明确要求不得合并）：
 *   `job.state` / `greeting.stage` / `application.stage` / `crawl_run.state`。
 * 本迁移补的是后两套里缺的那部分 + 消息 + 面试。
 *
 * `stage_event` 是这一版最重要的表：§12.1 的转移表里"自动识别"与"人工打勾"混在一起，
 * 只存当前状态就无法回答"这个状态是谁、什么时候、凭什么改的"。
 * 所以**每一次状态变更都留一条事件**，主表上的 `stage` 只是便于查询的冗余。
 *
 * `greeting` 与 `message` 刻意分开：
 *   * `greeting` 是"我主动发起的第一次接触"，带模板与接触态；
 *   * `message` 是"双方往来"，有方向。
 * 合并成一张表会让"我发的第一条"与"HR 回的那条"挤在同一个 stage 字段上。
 */
export const SCHEMA_V5 = `
CREATE TABLE greeting_template (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  vars_json  TEXT NOT NULL DEFAULT '[]',
  scene      TEXT NOT NULL DEFAULT '',
  uses       INTEGER NOT NULL DEFAULT 0,
  replies    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE greeting (
  id          INTEGER PRIMARY KEY,
  job_id      INTEGER REFERENCES job(id) ON DELETE SET NULL,
  platform_id TEXT NOT NULL,
  template_id INTEGER REFERENCES greeting_template(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  sent_at     TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'platform',
  actor       TEXT NOT NULL DEFAULT 'gui',
  stage       TEXT NOT NULL DEFAULT 'greeted',
  stage_at    TEXT NOT NULL,
  replied_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_greeting_job ON greeting(job_id, sent_at DESC);
CREATE INDEX idx_greeting_stage ON greeting(stage, stage_at DESC);

CREATE TABLE message (
  id              INTEGER PRIMARY KEY,
  platform_id     TEXT NOT NULL,
  conversation_id TEXT NOT NULL DEFAULT '',
  direction       TEXT NOT NULL,
  content         TEXT NOT NULL,
  at              TEXT NOT NULL,
  attachment_ref  TEXT,
  job_id          INTEGER REFERENCES job(id) ON DELETE SET NULL,
  read_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_message_job ON message(job_id, at DESC);
CREATE INDEX idx_message_unread ON message(read_at, at DESC);

CREATE TABLE application (
  id             INTEGER PRIMARY KEY,
  job_id         INTEGER REFERENCES job(id) ON DELETE SET NULL,
  resume_id      INTEGER REFERENCES resume(id) ON DELETE SET NULL,
  resume_file_id INTEGER REFERENCES resume_file(id) ON DELETE SET NULL,
  channel        TEXT NOT NULL DEFAULT 'platform',
  sent_at        TEXT NOT NULL,
  stage          TEXT NOT NULL DEFAULT 'sent',
  stage_at       TEXT NOT NULL,
  actor          TEXT NOT NULL DEFAULT 'gui',
  note           TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_application_job ON application(job_id, sent_at DESC);
CREATE INDEX idx_application_stage ON application(stage, stage_at DESC);

-- 状态变更留痕：谁、什么时候、从哪到哪、凭什么
CREATE TABLE stage_event (
  id           INTEGER PRIMARY KEY,
  entity       TEXT NOT NULL,
  entity_id    INTEGER NOT NULL,
  from_stage   TEXT,
  to_stage     TEXT NOT NULL,
  at           TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual',
  evidence_ref TEXT,
  note         TEXT
);
CREATE INDEX idx_stage_event_entity ON stage_event(entity, entity_id, at DESC);

CREATE TABLE interview (
  id             INTEGER PRIMARY KEY,
  application_id INTEGER REFERENCES application(id) ON DELETE CASCADE,
  job_id         INTEGER REFERENCES job(id) ON DELETE SET NULL,
  round          INTEGER NOT NULL DEFAULT 1,
  at             TEXT NOT NULL,
  tz             TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  place          TEXT,
  link           TEXT,
  contact        TEXT,
  kind           TEXT NOT NULL DEFAULT 'video',
  state          TEXT NOT NULL DEFAULT 'pending',
  commute_min    INTEGER,
  review_json    TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_interview_at ON interview(at);
CREATE INDEX idx_interview_job ON interview(job_id, at DESC);

-- 面试错题本（§7「复盘与决策」）：同一个问题被问第二遍时要能立刻翻出来
CREATE TABLE question_note (
  id            INTEGER PRIMARY KEY,
  question      TEXT NOT NULL,
  my_answer     TEXT NOT NULL DEFAULT '',
  better_answer TEXT NOT NULL DEFAULT '',
  topic         TEXT NOT NULL DEFAULT '',
  company_id    INTEGER REFERENCES company(id) ON DELETE SET NULL,
  interview_id  INTEGER REFERENCES interview(id) ON DELETE SET NULL,
  times         INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_question_topic ON question_note(topic);
`

/**
 * v6：校招与海外支线（P8，§4.L / §4.M / §11.5）。
 *
 * 两条支线各自有**不可逆节点**，这是它们与社招主线最大的差别，也是这一版的设计中心：
 *   * 校招：**笔试/测评有硬截止，错过即终态**；**三方协议签署前后状态必须显著区分**（违约有真实代价）；
 *   * 海外：**时区算错 = 直接错过面试**，所以面试时间必须双重显示。
 *
 * `assessment.due_at` 与 `tripartite.sign_deadline` 是**强提醒**的来源：
 * 它们会被 U0 与待办系统当作 urgent 处理，而不是普通通知（§12.7 / 决策记录第 3 条）。
 *
 * `visa_requirement` 单独立表而不是给 `job` 加一列，因为它是**带来源与不确定性的判断**：
 * 同一个岗位可能有多条互相矛盾的证据，"到底提不提供担保"是一个需要展示依据与置信度的结论，
 * 而不是一个可以直接覆盖的字段。
 *
 * 另外给 `job` 加三个识别列（可空，识别不出来就是 NULL 而不是猜一个值）。
 */
export const SCHEMA_V6 = `
CREATE TABLE campus_application (
  id             INTEGER PRIMARY KEY,
  company_id     INTEGER REFERENCES company(id) ON DELETE SET NULL,
  job_id         INTEGER REFERENCES job(id) ON DELETE SET NULL,
  batch          TEXT NOT NULL DEFAULT 'autumn',
  stage          TEXT NOT NULL DEFAULT 'intent',
  stage_at       TEXT NOT NULL,
  apply_open_at  TEXT,
  apply_close_at TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_campus_stage ON campus_application(stage, stage_at DESC);
CREATE INDEX idx_campus_company ON campus_application(company_id);
CREATE INDEX idx_campus_window ON campus_application(apply_close_at);

CREATE TABLE assessment (
  id                    INTEGER PRIMARY KEY,
  campus_application_id INTEGER REFERENCES campus_application(id) ON DELETE CASCADE,
  platform              TEXT NOT NULL DEFAULT '',
  kind                  TEXT NOT NULL DEFAULT 'written',
  at                    TEXT,
  due_at                TEXT,
  duration_min          INTEGER,
  state                 TEXT NOT NULL DEFAULT 'pending',
  result                TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_assessment_due ON assessment(due_at);
CREATE INDEX idx_assessment_app ON assessment(campus_application_id);

CREATE TABLE talk_session (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER REFERENCES company(id) ON DELETE SET NULL,
  at          TEXT NOT NULL,
  place       TEXT,
  online      INTEGER NOT NULL DEFAULT 0,
  url         TEXT,
  worth_going TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_talk_at ON talk_session(at);

CREATE TABLE tripartite (
  id                    INTEGER PRIMARY KEY,
  campus_application_id INTEGER REFERENCES campus_application(id) ON DELETE CASCADE,
  issued_at             TEXT,
  sign_deadline         TEXT,
  state                 TEXT NOT NULL DEFAULT 'pending',
  penalty_summary       TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_tripartite_state ON tripartite(state, sign_deadline);

CREATE TABLE visa_requirement (
  id             INTEGER PRIMARY KEY,
  job_id         INTEGER REFERENCES job(id) ON DELETE CASCADE,
  stance         TEXT NOT NULL DEFAULT 'unknown',
  identity_limit TEXT,
  evidence_json  TEXT NOT NULL DEFAULT '[]',
  source         TEXT NOT NULL DEFAULT 'rule',
  uncertainty    TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_visa_job ON visa_requirement(job_id);
CREATE INDEX idx_visa_stance ON visa_requirement(stance);

CREATE TABLE cover_letter (
  id         INTEGER PRIMARY KEY,
  job_id     INTEGER REFERENCES job(id) ON DELETE CASCADE,
  resume_id  INTEGER REFERENCES resume(id) ON DELETE SET NULL,
  language   TEXT NOT NULL DEFAULT 'en',
  content    TEXT NOT NULL,
  via        TEXT NOT NULL DEFAULT 'rule',
  notes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cover_letter_job ON cover_letter(job_id, created_at DESC);

-- 识别列：**可空**。识别不出来就留 NULL，不猜一个值（猜错比留空更糟）
ALTER TABLE job ADD COLUMN campus_batch TEXT;
ALTER TABLE job ADD COLUMN remote_kind TEXT;
ALTER TABLE job ADD COLUMN visa_stance TEXT;
`

/**
 * v7 · 调度模型（D-19 / SR-1…SR-37）。
 *
 * 四处都是**语义修正**，不是加装饰：
 *
 * 1. `plan.last_attempt_at` 与 `last_success_at` **拆开**（SR-7）。
 *    原来只有一个 `last_run_at`，于是"试过但失败了"和"真的拿到数据了"分不出来 ——
 *    失败也推进它，新鲜度就永远看起来是新鲜的（最坏的一种谎）。
 * 2. `plan.fail_streak` / `backoff_until` / `risk_paused`（SR-20/21/22）。
 *    退避与风控暂停必须是**持久化**的：插件不是守护进程，重启后还得记得"这个平台别碰"。
 * 3. `plan.timezone`（SR-5）。存本地墙钟 + 时区快照，不存推算出来的绝对 UTC。
 * 4. `plan.post_process_json`（SR-44）+ `crawl_run.reason` / `skip_reason`（SR-28/29/17）。
 *
 * 旧的 `schedule_json` 里的 `hour` / `minute` **不动**：历史数据要在读取时被
 * `normalizeSchedule` 翻译成窗口（`hour:9 → 09:00–10:00`），迁移里改 JSON 反而更难回滚。
 */
export const SCHEMA_V7 = `
ALTER TABLE plan ADD COLUMN last_attempt_at TEXT;
ALTER TABLE plan ADD COLUMN last_success_at TEXT;
ALTER TABLE plan ADD COLUMN fail_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plan ADD COLUMN backoff_until TEXT;
ALTER TABLE plan ADD COLUMN risk_paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plan ADD COLUMN risk_reason TEXT;
ALTER TABLE plan ADD COLUMN timezone TEXT;
ALTER TABLE plan ADD COLUMN post_process_json TEXT NOT NULL DEFAULT '{}';
-- 历史回填：旧库只有 last_run_at。把它同时当成"尝试过"与"成功过" ——
-- 这是唯一不撒谎的选择（我们**不知道**那一次到底成没成），并且下一次运行就会纠正它。
UPDATE plan SET last_attempt_at = last_run_at WHERE last_run_at IS NOT NULL;
UPDATE plan SET last_success_at = last_run_at WHERE last_run_at IS NOT NULL;

ALTER TABLE crawl_run ADD COLUMN reason TEXT;
ALTER TABLE crawl_run ADD COLUMN skip_reason TEXT;
CREATE INDEX idx_crawl_run_started ON crawl_run(started_at DESC);
`

/**
 * v8 · 索引修正（纯索引增删，零表重建）。
 *
 * 三处改动都是**对着 repo 层真实 SQL 核对过**的，不是照搬通用模板：
 *
 * 1. 未读消息（`pipeline.ts` → `WHERE read_at IS NULL ORDER BY at DESC`）。
 *    原 `(read_at, at DESC)` 会把**全部已读历史**一起索引，而业务只关心未读那几条。
 *    改成部分索引后只索引未读行，体积与写入开销都随已读增长而保持恒定。
 * 2. 词表（`dictionary.ts` → 两条读取路径都以 `enabled = 1` 为先导）。
 *    部分索引只留启用词条，同时服务 `kind = ?` 过滤与 `ORDER BY term`。
 * 3. 级联删除的外键索引：SQLite **不会**自动为外键建索引。父表行被删除时，
 *    子表若没有对应索引只能全表扫描。这里只给**真会删父表且子表预期行多**的两个
 *    级联点补索引；`ON DELETE SET NULL` 的那些（plan / resume / job）父表几乎不删，
 *    暂不预加，免得白付写入开销。
 */
export const SCHEMA_V8 = `
-- 未读消息：只索引 read_at IS NULL 的行
DROP INDEX idx_message_unread;
CREATE INDEX idx_message_unread ON message(at DESC) WHERE read_at IS NULL;

-- 词表：只索引启用词条
DROP INDEX idx_dictionary_kind;
CREATE INDEX idx_dictionary_active ON dictionary(kind, term) WHERE enabled = 1;

-- 级联删除路径上的外键索引（interview → application、tripartite → campus_application 均为 CASCADE）
CREATE INDEX idx_interview_application ON interview(application_id);
CREATE INDEX idx_tripartite_campus ON tripartite(campus_application_id);
`

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
export declare const SCHEMA_V1 = "-- \u2500\u2500 \u5E73\u53F0\u4E0E\u8D26\u53F7\uFF08\u7EDD\u4E0D\u5B58\u5BC6\u7801\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE platform (\n  id                TEXT PRIMARY KEY,\n  display_name      TEXT NOT NULL,\n  enabled           INTEGER NOT NULL DEFAULT 1,\n  capabilities_json TEXT NOT NULL DEFAULT '{}',\n  health_state      TEXT NOT NULL DEFAULT 'healthy',\n  health_reason     TEXT,\n  fail_streak       INTEGER NOT NULL DEFAULT 0,\n  last_ok_at        TEXT,\n  created_at        TEXT NOT NULL\n);\n\nCREATE TABLE account_state (\n  platform_id  TEXT PRIMARY KEY REFERENCES platform(id) ON DELETE CASCADE,\n  logged_in    INTEGER NOT NULL DEFAULT 0,\n  hidden_from_current_employer INTEGER,\n  last_check_at TEXT,\n  hint         TEXT,\n  updated_at   TEXT NOT NULL\n);\n\n-- \u2500\u2500 \u641C\u7D22\u65B9\u6848 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE plan (\n  id             INTEGER PRIMARY KEY,\n  name           TEXT NOT NULL,\n  platforms_json TEXT NOT NULL DEFAULT '[]',\n  criteria_json  TEXT NOT NULL DEFAULT '{}',\n  keywords_json  TEXT NOT NULL DEFAULT '[]',\n  exclude_json   TEXT NOT NULL DEFAULT '[]',\n  schedule_json  TEXT NOT NULL DEFAULT '{}',\n  enabled        INTEGER NOT NULL DEFAULT 1,\n  last_run_at    TEXT,\n  next_run_at    TEXT,\n  created_at     TEXT NOT NULL\n);\n\n-- \u2500\u2500 \u6293\u53D6\u8FD0\u884C\uFF08\u00A77.0 \u72B6\u6001\u673A\u4E4B\u4E00\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE crawl_run (\n  id          INTEGER PRIMARY KEY,\n  plan_id     INTEGER REFERENCES plan(id) ON DELETE SET NULL,\n  platform_id TEXT NOT NULL,\n  started_at  TEXT NOT NULL,\n  ended_at    TEXT,\n  state       TEXT NOT NULL,\n  pages       INTEGER NOT NULL DEFAULT 0,\n  found       INTEGER NOT NULL DEFAULT 0,\n  inserted    INTEGER NOT NULL DEFAULT 0,\n  updated     INTEGER NOT NULL DEFAULT 0,\n  skipped     INTEGER NOT NULL DEFAULT 0,\n  quarantined INTEGER NOT NULL DEFAULT 0,\n  error_code  TEXT,\n  error_msg   TEXT,\n  log_ref     TEXT\n);\nCREATE INDEX idx_crawl_run_platform_started ON crawl_run(platform_id, started_at DESC);\n\n-- \u2500\u2500 \u516C\u53F8\uFF08\u4E00\u7B49\u5B9E\u4F53\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE company (\n  id           INTEGER PRIMARY KEY,\n  name         TEXT NOT NULL,\n  name_norm    TEXT NOT NULL,\n  aliases_json TEXT NOT NULL DEFAULT '[]',\n  industry     TEXT,\n  size         TEXT,\n  nature       TEXT,\n  blacklisted  INTEGER NOT NULL DEFAULT 0,\n  note         TEXT,\n  created_at   TEXT NOT NULL\n);\n-- name_norm \u552F\u4E00\uFF1A\u5F52\u4E00\u5316\u540E\u7684\u540D\u5B57\u5C31\u662F\u5B9E\u4F53\u8EAB\u4EFD\u3002\n-- \u6A21\u7CCA\u5408\u5E76\u7559\u7ED9 P4 \u7684 dedup_group\uFF08\u94C1\u5F8B\uFF1A\u4E0D\u786E\u5B9A\u5B81\u53EF\u4E0D\u5408\u5E76\uFF09\u3002\nCREATE UNIQUE INDEX ux_company_name_norm ON company(name_norm);\n\nCREATE TABLE company_profile (\n  company_id       INTEGER PRIMARY KEY REFERENCES company(id) ON DELETE CASCADE,\n  job_count        INTEGER NOT NULL DEFAULT 0,\n  stack_diversity  INTEGER NOT NULL DEFAULT 0,\n  geo_spread       INTEGER NOT NULL DEFAULT 0,\n  onsite_ratio     REAL,\n  name_keyword_hits INTEGER NOT NULL DEFAULT 0,\n  publish_rhythm_json TEXT NOT NULL DEFAULT '{}',\n  outsourcing_score REAL,\n  fraud_score      REAL,\n  manual_label     TEXT,\n  updated_at       TEXT NOT NULL\n);\n\n-- \u2500\u2500 \u5C97\u4F4D \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE job (\n  id              INTEGER PRIMARY KEY,\n  platform_id     TEXT NOT NULL,\n  platform_job_id TEXT NOT NULL,\n  dedup_group_id  INTEGER,\n  title           TEXT NOT NULL,\n  company_id      INTEGER REFERENCES company(id) ON DELETE SET NULL,\n  salary_raw      TEXT NOT NULL DEFAULT '',\n  salary_min      INTEGER,\n  salary_max      INTEGER,\n  salary_months   INTEGER,\n  city            TEXT NOT NULL DEFAULT '',\n  district        TEXT NOT NULL DEFAULT '',\n  landmark        TEXT,\n  exp_req         TEXT NOT NULL DEFAULT '',\n  edu_req         TEXT NOT NULL DEFAULT '',\n  tags_json       TEXT NOT NULL DEFAULT '[]',\n  jd_text         TEXT,\n  jd_summary      TEXT,\n  published_at    TEXT,\n  first_seen_at   TEXT NOT NULL,\n  last_seen_at    TEXT NOT NULL,\n  crawled_at      TEXT NOT NULL,\n  source_url      TEXT NOT NULL,\n  snapshot_ref    TEXT,\n  match_score     REAL,\n  match_reasons_json TEXT,\n  state           TEXT NOT NULL DEFAULT 'new'\n);\n-- \u5355\u5E73\u53F0\u5185\u5E42\u7B49\uFF1A\u91CD\u590D\u8DD1\u4E0D\u4EA7\u751F\u91CD\u590D\u6570\u636E\uFF08\u00A76.1 / \u00A74.10.1\uFF09\nCREATE UNIQUE INDEX ux_job_platform ON job(platform_id, platform_job_id);\nCREATE INDEX idx_job_state      ON job(state);\nCREATE INDEX idx_job_city       ON job(city);\nCREATE INDEX idx_job_salary_min ON job(salary_min);\nCREATE INDEX idx_job_crawled_at ON job(crawled_at);\nCREATE INDEX idx_job_company    ON job(company_id);\nCREATE INDEX idx_job_dedup      ON job(dedup_group_id);\n\n-- \u2500\u2500 \u810F\u6570\u636E\u9694\u79BB\u961F\u5217\uFF08\u00A74.2.4\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n-- \u5B57\u6BB5\u65AD\u8A00\u4E0D\u5408\u683C\u7684\u8BB0\u5F55**\u4E0D\u5199\u4E3B\u8868**\uFF1B\u539F\u59CB\u7247\u6BB5\u7559\u5728\u8FD9\u91CC\uFF0C\u4F9B\u4FEE\u597D\u9009\u62E9\u5668\u540E\u91CD\u653E\u89E3\u6790\u3002\nCREATE TABLE pending_repair (\n  id              INTEGER PRIMARY KEY,\n  platform_id     TEXT NOT NULL,\n  crawl_run_id    INTEGER REFERENCES crawl_run(id) ON DELETE SET NULL,\n  captured_at     TEXT NOT NULL,\n  missing_fields_json TEXT NOT NULL,\n  raw_json        TEXT NOT NULL,\n  raw_html        TEXT,\n  source_url      TEXT,\n  replay_state    TEXT NOT NULL DEFAULT 'pending',\n  replayed_at     TEXT,\n  replayed_job_id INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  note            TEXT\n);\nCREATE INDEX idx_pending_repair_platform ON pending_repair(platform_id, replay_state);\n\n-- \u2500\u2500 \u9010\u6838\u5FC3\u5B57\u6BB5\u7684\u8FDE\u7EED\u7F3A\u5931\u8BA1\u6570\uFF08\u00A74.2.4\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n-- \u4EFB\u4E00\u5B57\u6BB5\u8FDE\u7EED\u7F3A\u5931\u8FBE\u9608\u503C \u2192 \u9002\u914D\u5668\u964D\u7EA7 + \u4E3B\u52A8\u544A\u8B66\u3002\nCREATE TABLE adapter_field_health (\n  platform_id      TEXT NOT NULL,\n  field            TEXT NOT NULL,\n  consecutive_miss INTEGER NOT NULL DEFAULT 0,\n  miss_total       INTEGER NOT NULL DEFAULT 0,\n  hit_total        INTEGER NOT NULL DEFAULT 0,\n  last_miss_at     TEXT,\n  last_hit_at      TEXT,\n  PRIMARY KEY (platform_id, field)\n);\n\n-- \u2500\u2500 \u7CFB\u7EDF \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE todo (\n  id          INTEGER PRIMARY KEY,\n  kind        TEXT NOT NULL,\n  level       TEXT NOT NULL DEFAULT 'info',\n  title       TEXT NOT NULL,\n  ref         TEXT,\n  detail_json TEXT NOT NULL DEFAULT '{}',\n  due_at      TEXT,\n  state       TEXT NOT NULL DEFAULT 'open',\n  read_at     TEXT,\n  created_at  TEXT NOT NULL\n);\nCREATE INDEX idx_todo_state ON todo(state, level);\n\n-- \u914D\u7F6E\u4EE5 DB \u4E3A\u6743\u5A01\uFF08ADR-19 / D-18\uFF09\uFF1A\u9009\u62E9\u5668\u4E0E\u5B57\u6BB5\u2192URL \u6620\u5C04\u90FD\u5B58\u5728\u8FD9\u91CC\uFF0C\n-- \u5F62\u5982 scope='platform' / scope_ref='51job' / key='selectors'\u3002\nCREATE TABLE setting (\n  key        TEXT NOT NULL,\n  scope      TEXT NOT NULL,\n  scope_ref  TEXT NOT NULL DEFAULT '',\n  value_json TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY (key, scope, scope_ref)\n);\n";
/**
 * v2：情报引擎（P4）。
 *
 * 四张表都对应 §7 的设计：
 *   * `dictionary`      —— 黑话/信号词表（§4.10.3：词表驱动、命中即产出解释与权重、**不走 LLM**）；
 *   * `job_flag`        —— 岗位标注（外包 / 诈骗 / 僵尸 / 薪资虚标 / 黑话命中），带 `evidence_json`；
 *   * `company_signal`  —— 公司维度的信号累积（识别引擎的依据在这里留痕，也是合并可逆的凭据）；
 *   * `dedup_group`     —— 跨平台去重分组，`basis` 记录**合并依据**（§4.10.1 铁律 3）。
 */
export declare const SCHEMA_V2 = "\n-- \u2500\u2500 \u8BCD\u8868\uFF08\u9ED1\u8BDD / \u5916\u5305 / \u8BC8\u9A97 / \u50F5\u5C38 / \u85AA\u8D44\u4FE1\u53F7\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE dictionary (\n  id      INTEGER PRIMARY KEY,\n  kind    TEXT NOT NULL,\n  scope   TEXT NOT NULL DEFAULT 'global',\n  term    TEXT NOT NULL,\n  meaning TEXT,\n  weight  REAL NOT NULL DEFAULT 1,\n  enabled INTEGER NOT NULL DEFAULT 1\n);\n-- \u540C\u4E00\u4E2A\u8BCD\u5728\u540C\u4E00\u4E2A kind+scope \u4E0B\u53EA\u80FD\u6709\u4E00\u6761\uFF0C\u4FBF\u4E8E\u5E42\u7B49\u64AD\u79CD\nCREATE UNIQUE INDEX ux_dictionary_term ON dictionary(kind, scope, term);\nCREATE INDEX idx_dictionary_kind ON dictionary(kind, enabled);\n\n-- \u2500\u2500 \u5C97\u4F4D\u6807\u6CE8\uFF08\u6BCF\u6761\u8BC1\u636E\u90FD\u8981\u80FD\u6307\u56DE\u539F\u6587\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE job_flag (\n  id            INTEGER PRIMARY KEY,\n  job_id        INTEGER NOT NULL REFERENCES job(id) ON DELETE CASCADE,\n  flag_type     TEXT NOT NULL,\n  score         REAL NOT NULL DEFAULT 0,\n  evidence_json TEXT NOT NULL DEFAULT '[]',\n  computed_at   TEXT NOT NULL\n);\nCREATE UNIQUE INDEX ux_job_flag ON job_flag(job_id, flag_type);\nCREATE INDEX idx_job_flag_type ON job_flag(flag_type);\n\n-- \u2500\u2500 \u516C\u53F8\u4FE1\u53F7\uFF08\u8BC6\u522B\u5F15\u64CE\u7684\u4F9D\u636E\u7559\u75D5\uFF1B\u4E5F\u662F\u516C\u53F8\u5408\u5E76\u53EF\u9006\u7684\u51ED\u636E\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE company_signal (\n  id            INTEGER PRIMARY KEY,\n  company_id    INTEGER NOT NULL REFERENCES company(id) ON DELETE CASCADE,\n  type          TEXT NOT NULL,\n  evidence_json TEXT NOT NULL DEFAULT '{}',\n  weight        REAL NOT NULL DEFAULT 0,\n  source        TEXT NOT NULL DEFAULT 'rule',\n  created_at    TEXT NOT NULL\n);\nCREATE INDEX idx_company_signal_company ON company_signal(company_id, type);\n\n-- \u2500\u2500 \u8DE8\u5E73\u53F0\u53BB\u91CD\u5206\u7EC4\uFF08\u00A74.10.1\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCREATE TABLE dedup_group (\n  id             INTEGER PRIMARY KEY,\n  primary_job_id INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  member_ids_json TEXT NOT NULL DEFAULT '[]',\n  basis          TEXT NOT NULL,\n  score          REAL NOT NULL DEFAULT 0,\n  created_at     TEXT NOT NULL\n);\nCREATE INDEX idx_dedup_group_primary ON dedup_group(primary_job_id);\n";
/**
 * v3：安全与工具（P5）。
 *
 *   * `audit_log` —— 每一次过闸门的动作（§4.4.3）。**只存字段摘要与长度**：
 *     简历全文、话术全文这类涉敏正文一律不入审计表（§4.1 审计表隐私策略），
 *     否则审计表自己会变成隐私黑洞；
 *   * `llm_call`   —— 每次模型调用的**外发字段清单**与 token（I5：用户必须能查到
 *     "我的哪些数据被发给了模型"）。与 `audit_log` 分开，便于独立查询与独立保留期。
 */
export declare const SCHEMA_V3 = "\nCREATE TABLE audit_log (\n  id            INTEGER PRIMARY KEY,\n  at            TEXT NOT NULL,\n  actor         TEXT NOT NULL,\n  action        TEXT NOT NULL,\n  target_json   TEXT NOT NULL DEFAULT '{}',\n  detail_json   TEXT NOT NULL DEFAULT '{}',\n  result        TEXT NOT NULL,\n  reason        TEXT,\n  approval_json TEXT,\n  duration_ms   INTEGER,\n  created_at    TEXT NOT NULL\n);\nCREATE INDEX idx_audit_at ON audit_log(at DESC);\nCREATE INDEX idx_audit_action ON audit_log(action, at DESC);\nCREATE INDEX idx_audit_actor ON audit_log(actor, at DESC);\n\nCREATE TABLE llm_call (\n  id                INTEGER PRIMARY KEY,\n  at                TEXT NOT NULL,\n  purpose           TEXT NOT NULL,\n  provider          TEXT,\n  model             TEXT,\n  fields_json       TEXT NOT NULL DEFAULT '[]',\n  prompt_tokens     INTEGER NOT NULL DEFAULT 0,\n  completion_tokens INTEGER NOT NULL DEFAULT 0,\n  ref_json          TEXT NOT NULL DEFAULT '{}',\n  ok                INTEGER NOT NULL DEFAULT 1,\n  error_code        TEXT,\n  duration_ms       INTEGER NOT NULL DEFAULT 0,\n  created_at        TEXT NOT NULL\n);\nCREATE INDEX idx_llm_call_at ON llm_call(at DESC);\nCREATE INDEX idx_llm_call_purpose ON llm_call(purpose, at DESC);\n";
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
export declare const SCHEMA_V4 = "\nCREATE TABLE resume (\n  id           INTEGER PRIMARY KEY,\n  name         TEXT NOT NULL,\n  direction    TEXT NOT NULL DEFAULT '',\n  language     TEXT NOT NULL DEFAULT 'zh',\n  content_json TEXT NOT NULL DEFAULT '{}',\n  state        TEXT NOT NULL DEFAULT 'active',\n  is_default   INTEGER NOT NULL DEFAULT 0,\n  rev          INTEGER NOT NULL DEFAULT 1,\n  created_at   TEXT NOT NULL,\n  updated_at   TEXT NOT NULL\n);\nCREATE INDEX idx_resume_state ON resume(state);\nCREATE INDEX idx_resume_default ON resume(is_default, direction);\n\nCREATE TABLE resume_file (\n  id         INTEGER PRIMARY KEY,\n  resume_id  INTEGER NOT NULL REFERENCES resume(id) ON DELETE CASCADE,\n  format     TEXT NOT NULL,\n  template   TEXT NOT NULL DEFAULT 'concise',\n  path       TEXT NOT NULL,\n  bytes      INTEGER NOT NULL DEFAULT 0,\n  file_name  TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\nCREATE INDEX idx_resume_file_resume ON resume_file(resume_id, created_at DESC);\n\nCREATE TABLE tailoring (\n  id           INTEGER PRIMARY KEY,\n  resume_id    INTEGER NOT NULL REFERENCES resume(id) ON DELETE CASCADE,\n  job_id       INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  content_json TEXT NOT NULL DEFAULT '{}',\n  via          TEXT NOT NULL DEFAULT 'rule',\n  notes_json   TEXT NOT NULL DEFAULT '[]',\n  adopted      INTEGER NOT NULL DEFAULT 0,\n  outcome      TEXT,\n  created_at   TEXT NOT NULL\n);\nCREATE INDEX idx_tailoring_resume ON tailoring(resume_id, created_at DESC);\nCREATE INDEX idx_tailoring_job ON tailoring(job_id, created_at DESC);\n\n-- \u00A74.1\uFF1A\u5339\u914D\u5206\u662F\u7B80\u5386\u7248\u672C\u7684\u51FD\u6570\u3002\u7B97\u5206\u65F6\u8BB0\u4E0B\u7528\u7684\u662F\u54EA\u4E00\u7248\u3001\u54EA\u4E2A rev\u3002\nALTER TABLE job ADD COLUMN score_rev INTEGER NOT NULL DEFAULT 0;\nALTER TABLE job ADD COLUMN score_resume_id INTEGER;\n";
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
export declare const SCHEMA_V5 = "\nCREATE TABLE greeting_template (\n  id         INTEGER PRIMARY KEY,\n  name       TEXT NOT NULL,\n  body       TEXT NOT NULL,\n  vars_json  TEXT NOT NULL DEFAULT '[]',\n  scene      TEXT NOT NULL DEFAULT '',\n  uses       INTEGER NOT NULL DEFAULT 0,\n  replies    INTEGER NOT NULL DEFAULT 0,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE TABLE greeting (\n  id          INTEGER PRIMARY KEY,\n  job_id      INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  platform_id TEXT NOT NULL,\n  template_id INTEGER REFERENCES greeting_template(id) ON DELETE SET NULL,\n  content     TEXT NOT NULL,\n  sent_at     TEXT NOT NULL,\n  channel     TEXT NOT NULL DEFAULT 'platform',\n  actor       TEXT NOT NULL DEFAULT 'gui',\n  stage       TEXT NOT NULL DEFAULT 'greeted',\n  stage_at    TEXT NOT NULL,\n  replied_at  TEXT,\n  created_at  TEXT NOT NULL\n);\nCREATE INDEX idx_greeting_job ON greeting(job_id, sent_at DESC);\nCREATE INDEX idx_greeting_stage ON greeting(stage, stage_at DESC);\n\nCREATE TABLE message (\n  id              INTEGER PRIMARY KEY,\n  platform_id     TEXT NOT NULL,\n  conversation_id TEXT NOT NULL DEFAULT '',\n  direction       TEXT NOT NULL,\n  content         TEXT NOT NULL,\n  at              TEXT NOT NULL,\n  attachment_ref  TEXT,\n  job_id          INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  read_at         TEXT,\n  created_at      TEXT NOT NULL\n);\nCREATE INDEX idx_message_job ON message(job_id, at DESC);\nCREATE INDEX idx_message_unread ON message(read_at, at DESC);\n\nCREATE TABLE application (\n  id             INTEGER PRIMARY KEY,\n  job_id         INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  resume_id      INTEGER REFERENCES resume(id) ON DELETE SET NULL,\n  resume_file_id INTEGER REFERENCES resume_file(id) ON DELETE SET NULL,\n  channel        TEXT NOT NULL DEFAULT 'platform',\n  sent_at        TEXT NOT NULL,\n  stage          TEXT NOT NULL DEFAULT 'sent',\n  stage_at       TEXT NOT NULL,\n  actor          TEXT NOT NULL DEFAULT 'gui',\n  note           TEXT,\n  created_at     TEXT NOT NULL\n);\nCREATE INDEX idx_application_job ON application(job_id, sent_at DESC);\nCREATE INDEX idx_application_stage ON application(stage, stage_at DESC);\n\n-- \u72B6\u6001\u53D8\u66F4\u7559\u75D5\uFF1A\u8C01\u3001\u4EC0\u4E48\u65F6\u5019\u3001\u4ECE\u54EA\u5230\u54EA\u3001\u51ED\u4EC0\u4E48\nCREATE TABLE stage_event (\n  id           INTEGER PRIMARY KEY,\n  entity       TEXT NOT NULL,\n  entity_id    INTEGER NOT NULL,\n  from_stage   TEXT,\n  to_stage     TEXT NOT NULL,\n  at           TEXT NOT NULL,\n  source       TEXT NOT NULL DEFAULT 'manual',\n  evidence_ref TEXT,\n  note         TEXT\n);\nCREATE INDEX idx_stage_event_entity ON stage_event(entity, entity_id, at DESC);\n\nCREATE TABLE interview (\n  id             INTEGER PRIMARY KEY,\n  application_id INTEGER REFERENCES application(id) ON DELETE CASCADE,\n  job_id         INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  round          INTEGER NOT NULL DEFAULT 1,\n  at             TEXT NOT NULL,\n  tz             TEXT NOT NULL DEFAULT 'Asia/Shanghai',\n  place          TEXT,\n  link           TEXT,\n  contact        TEXT,\n  kind           TEXT NOT NULL DEFAULT 'video',\n  state          TEXT NOT NULL DEFAULT 'pending',\n  commute_min    INTEGER,\n  review_json    TEXT NOT NULL DEFAULT '{}',\n  created_at     TEXT NOT NULL,\n  updated_at     TEXT NOT NULL\n);\nCREATE INDEX idx_interview_at ON interview(at);\nCREATE INDEX idx_interview_job ON interview(job_id, at DESC);\n\n-- \u9762\u8BD5\u9519\u9898\u672C\uFF08\u00A77\u300C\u590D\u76D8\u4E0E\u51B3\u7B56\u300D\uFF09\uFF1A\u540C\u4E00\u4E2A\u95EE\u9898\u88AB\u95EE\u7B2C\u4E8C\u904D\u65F6\u8981\u80FD\u7ACB\u523B\u7FFB\u51FA\u6765\nCREATE TABLE question_note (\n  id            INTEGER PRIMARY KEY,\n  question      TEXT NOT NULL,\n  my_answer     TEXT NOT NULL DEFAULT '',\n  better_answer TEXT NOT NULL DEFAULT '',\n  topic         TEXT NOT NULL DEFAULT '',\n  company_id    INTEGER REFERENCES company(id) ON DELETE SET NULL,\n  interview_id  INTEGER REFERENCES interview(id) ON DELETE SET NULL,\n  times         INTEGER NOT NULL DEFAULT 1,\n  created_at    TEXT NOT NULL,\n  updated_at    TEXT NOT NULL\n);\nCREATE INDEX idx_question_topic ON question_note(topic);\n";
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
export declare const SCHEMA_V6 = "\nCREATE TABLE campus_application (\n  id             INTEGER PRIMARY KEY,\n  company_id     INTEGER REFERENCES company(id) ON DELETE SET NULL,\n  job_id         INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  batch          TEXT NOT NULL DEFAULT 'autumn',\n  stage          TEXT NOT NULL DEFAULT 'intent',\n  stage_at       TEXT NOT NULL,\n  apply_open_at  TEXT,\n  apply_close_at TEXT,\n  note           TEXT,\n  created_at     TEXT NOT NULL,\n  updated_at     TEXT NOT NULL\n);\nCREATE INDEX idx_campus_stage ON campus_application(stage, stage_at DESC);\nCREATE INDEX idx_campus_company ON campus_application(company_id);\nCREATE INDEX idx_campus_window ON campus_application(apply_close_at);\n\nCREATE TABLE assessment (\n  id                    INTEGER PRIMARY KEY,\n  campus_application_id INTEGER REFERENCES campus_application(id) ON DELETE CASCADE,\n  platform              TEXT NOT NULL DEFAULT '',\n  kind                  TEXT NOT NULL DEFAULT 'written',\n  at                    TEXT,\n  due_at                TEXT,\n  duration_min          INTEGER,\n  state                 TEXT NOT NULL DEFAULT 'pending',\n  result                TEXT,\n  created_at            TEXT NOT NULL,\n  updated_at            TEXT NOT NULL\n);\nCREATE INDEX idx_assessment_due ON assessment(due_at);\nCREATE INDEX idx_assessment_app ON assessment(campus_application_id);\n\nCREATE TABLE talk_session (\n  id          INTEGER PRIMARY KEY,\n  company_id  INTEGER REFERENCES company(id) ON DELETE SET NULL,\n  at          TEXT NOT NULL,\n  place       TEXT,\n  online      INTEGER NOT NULL DEFAULT 0,\n  url         TEXT,\n  worth_going TEXT,\n  note        TEXT,\n  created_at  TEXT NOT NULL\n);\nCREATE INDEX idx_talk_at ON talk_session(at);\n\nCREATE TABLE tripartite (\n  id                    INTEGER PRIMARY KEY,\n  campus_application_id INTEGER REFERENCES campus_application(id) ON DELETE CASCADE,\n  issued_at             TEXT,\n  sign_deadline         TEXT,\n  state                 TEXT NOT NULL DEFAULT 'pending',\n  penalty_summary       TEXT,\n  created_at            TEXT NOT NULL,\n  updated_at            TEXT NOT NULL\n);\nCREATE INDEX idx_tripartite_state ON tripartite(state, sign_deadline);\n\nCREATE TABLE visa_requirement (\n  id             INTEGER PRIMARY KEY,\n  job_id         INTEGER REFERENCES job(id) ON DELETE CASCADE,\n  stance         TEXT NOT NULL DEFAULT 'unknown',\n  identity_limit TEXT,\n  evidence_json  TEXT NOT NULL DEFAULT '[]',\n  source         TEXT NOT NULL DEFAULT 'rule',\n  uncertainty    TEXT,\n  created_at     TEXT NOT NULL\n);\nCREATE INDEX idx_visa_job ON visa_requirement(job_id);\nCREATE INDEX idx_visa_stance ON visa_requirement(stance);\n\nCREATE TABLE cover_letter (\n  id         INTEGER PRIMARY KEY,\n  job_id     INTEGER REFERENCES job(id) ON DELETE CASCADE,\n  resume_id  INTEGER REFERENCES resume(id) ON DELETE SET NULL,\n  language   TEXT NOT NULL DEFAULT 'en',\n  content    TEXT NOT NULL,\n  via        TEXT NOT NULL DEFAULT 'rule',\n  notes_json TEXT NOT NULL DEFAULT '[]',\n  created_at TEXT NOT NULL\n);\nCREATE INDEX idx_cover_letter_job ON cover_letter(job_id, created_at DESC);\n\n-- \u8BC6\u522B\u5217\uFF1A**\u53EF\u7A7A**\u3002\u8BC6\u522B\u4E0D\u51FA\u6765\u5C31\u7559 NULL\uFF0C\u4E0D\u731C\u4E00\u4E2A\u503C\uFF08\u731C\u9519\u6BD4\u7559\u7A7A\u66F4\u7CDF\uFF09\nALTER TABLE job ADD COLUMN campus_batch TEXT;\nALTER TABLE job ADD COLUMN remote_kind TEXT;\nALTER TABLE job ADD COLUMN visa_stance TEXT;\n";
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
export declare const SCHEMA_V7 = "\nALTER TABLE plan ADD COLUMN last_attempt_at TEXT;\nALTER TABLE plan ADD COLUMN last_success_at TEXT;\nALTER TABLE plan ADD COLUMN fail_streak INTEGER NOT NULL DEFAULT 0;\nALTER TABLE plan ADD COLUMN backoff_until TEXT;\nALTER TABLE plan ADD COLUMN risk_paused INTEGER NOT NULL DEFAULT 0;\nALTER TABLE plan ADD COLUMN risk_reason TEXT;\nALTER TABLE plan ADD COLUMN timezone TEXT;\nALTER TABLE plan ADD COLUMN post_process_json TEXT NOT NULL DEFAULT '{}';\n-- \u5386\u53F2\u56DE\u586B\uFF1A\u65E7\u5E93\u53EA\u6709 last_run_at\u3002\u628A\u5B83\u540C\u65F6\u5F53\u6210\"\u5C1D\u8BD5\u8FC7\"\u4E0E\"\u6210\u529F\u8FC7\" \u2014\u2014\n-- \u8FD9\u662F\u552F\u4E00\u4E0D\u6492\u8C0E\u7684\u9009\u62E9\uFF08\u6211\u4EEC**\u4E0D\u77E5\u9053**\u90A3\u4E00\u6B21\u5230\u5E95\u6210\u6CA1\u6210\uFF09\uFF0C\u5E76\u4E14\u4E0B\u4E00\u6B21\u8FD0\u884C\u5C31\u4F1A\u7EA0\u6B63\u5B83\u3002\nUPDATE plan SET last_attempt_at = last_run_at WHERE last_run_at IS NOT NULL;\nUPDATE plan SET last_success_at = last_run_at WHERE last_run_at IS NOT NULL;\n\nALTER TABLE crawl_run ADD COLUMN reason TEXT;\nALTER TABLE crawl_run ADD COLUMN skip_reason TEXT;\nCREATE INDEX idx_crawl_run_started ON crawl_run(started_at DESC);\n";
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
export declare const SCHEMA_V8 = "\n-- \u672A\u8BFB\u6D88\u606F\uFF1A\u53EA\u7D22\u5F15 read_at IS NULL \u7684\u884C\nDROP INDEX idx_message_unread;\nCREATE INDEX idx_message_unread ON message(at DESC) WHERE read_at IS NULL;\n\n-- \u8BCD\u8868\uFF1A\u53EA\u7D22\u5F15\u542F\u7528\u8BCD\u6761\nDROP INDEX idx_dictionary_kind;\nCREATE INDEX idx_dictionary_active ON dictionary(kind, term) WHERE enabled = 1;\n\n-- \u7EA7\u8054\u5220\u9664\u8DEF\u5F84\u4E0A\u7684\u5916\u952E\u7D22\u5F15\uFF08interview \u2192 application\u3001tripartite \u2192 campus_application \u5747\u4E3A CASCADE\uFF09\nCREATE INDEX idx_interview_application ON interview(application_id);\nCREATE INDEX idx_tripartite_campus ON tripartite(campus_application_id);\n";
/**
 * v9 · 方案级平台的**覆盖项**（批次 3 数据模型侧）。
 *
 * ## 为什么需要这一列
 *
 * 方案级只有一份 `criteria` 与一个 `maxPages`，而平台的真实上限差得很远
 * （waiqi 的服务端翻页是坏的 → 1 页；zhaopin → 10 页）。于是"方案设 5 页"在 waiqi 上
 * 被**静默截断**成 1 页；想临时把一个平台停掉，只能把它从 `platforms` 里删掉 ——
 * 而删掉就丢了"这个方案包含它"的意图，重复方案的判定也跟着变。
 *
 * ## 为什么是 `{}` 默认 + **稀疏**存储
 *
 * 只存用户**真的改过**的平台。默认（启用 + 用方案级页数）不落库，
 * 于是"什么都没配"的方案在库里的形状与升级前**完全一致** —— 升级与回滚都安全。
 *
 * ## 为什么不塞进 `platforms_json` 变成对象数组
 *
 * `platforms` 是**集合与顺序**（6 处调用方按它遍历），覆盖项是**按 id 查的稀疏表**。
 * 两者访问方式不同；混成一个对象数组会让每处遍历都多一层解包，
 * 而收益只是"少一列"。分开存，各自表达各自的东西。
 */
export declare const SCHEMA_V9 = "\nALTER TABLE plan ADD COLUMN platform_overrides_json TEXT NOT NULL DEFAULT '{}';\n";
/**
 * v10 · Offer（§4.H H1/H3/H4）。
 *
 * ## 为什么现在才建这张表
 *
 * 在此之前，"拿到 offer"只以 `application.stage = 'offer'` 的形式存在 ——
 * 那是一个**阶段**，不是一份**报价**。而 H1 要的是逐项对比（月 base × 月数、
 * 公积金比例与基数、试用期比例、竞业补偿、违约金…），H3 要的是截止倒计时。
 * 这些字段塞进 `application` 会把投递流水线变成一张什么都不是的表。
 *
 * ## 为什么明细是 `comp_json` + 少量标量列
 *
 * 明细有 20 项、且随时可能加项（谈薪的坑只会越踩越多），逐项建列意味着每加一项
 * 都要一次迁移；而对比表**不靠 SQL 聚合**（它是在内存里逐项渲染的，见
 * `shared/domain/offer-comp.ts` 的字段清单），所以 JSON 足够。
 *
 * 但有三样**必须能查**，所以留成真列：
 *   * `annual_cash` —— 排序与"谁给得多"要靠它（也是 U0 与今日提醒的入口）；
 *   * `deadline` —— 截止倒计时要按它排序、筛选"7 天内到期"；
 *   * `state` —— "还没决定的"是唯一的提醒对象（`OFFER_OPEN_STATES`）。
 *
 * ## 三条外键都是 SET NULL，且都允许为空
 *
 * offer 经常来自**平台之外**（官网直投、内推、猎头），未必有对应的 `job` 行；
 * 也未必经过本工具的投递动作。所以 `company_name` 单独留一列：
 * 公司不在库里时，登记的公司名不能丢。
 */
export declare const SCHEMA_V10 = "\nCREATE TABLE offer (\n  id             INTEGER PRIMARY KEY,\n  company_id     INTEGER REFERENCES company(id) ON DELETE SET NULL,\n  company_name   TEXT NOT NULL DEFAULT '',\n  job_id         INTEGER REFERENCES job(id) ON DELETE SET NULL,\n  application_id INTEGER REFERENCES application(id) ON DELETE SET NULL,\n  role           TEXT NOT NULL DEFAULT '',\n  comp_json      TEXT NOT NULL DEFAULT '{}',\n  annual_cash    INTEGER,\n  deadline       TEXT,\n  state          TEXT NOT NULL DEFAULT 'pending',\n  note           TEXT,\n  created_at     TEXT NOT NULL,\n  updated_at     TEXT NOT NULL\n);\nCREATE INDEX idx_offer_state ON offer(state, deadline);\nCREATE INDEX idx_offer_company ON offer(company_id);\n\n-- \u9519\u9898\u672C\u6309\"\u516C\u53F8\"\u56DE\u6EAF\uFF08\"\u8FD9\u5BB6\u95EE\u8FC7\u4EC0\u4E48\"\uFF09\u6B64\u524D\u6CA1\u6709\u7D22\u5F15\uFF0C\u53EA\u80FD\u5168\u8868\u626B\nCREATE INDEX idx_question_company ON question_note(company_id);\n";
/**
 * v11 · 岗位库新增两个筛选/排序入口所需的索引（第五轮，批次 A）。
 *
 * 两条都是**对着 repo 层真实 SQL 核对过**的：
 *
 * 1. `match_score`：`ORDER BY j.match_score` 与 `WHERE j.match_score >= ?`
 *    此前都是全表扫描 + 临时排序。它是这一轮新增的**主排序键**（"今天最值得看的几条"），
 *    走的是热路径，必须建索引。
 * 2. `first_seen_at`：`WHERE j.first_seen_at >= ?`（「只看新增」）与首屏
 *    「今日新增」（`countSince`）都在用它过滤，而它此前没有索引 ——
 *    这两处每天都要跑，却一直靠全表扫描。
 *
 * 注意 `match_score` 允许为 NULL（未打分的岗位）：SQLite 的索引会收录 NULL 行，
 * 而查询里 `ORDER BY match_score IS NULL` 的前置就是为了把 NULL 排到最后 ——
 * 索引仍可用，不用额外写部分索引。
 */
export declare const SCHEMA_V11 = "\nCREATE INDEX idx_job_match_score ON job(match_score);\nCREATE INDEX idx_job_first_seen_at ON job(first_seen_at);\n";
//# sourceMappingURL=schema.d.ts.map
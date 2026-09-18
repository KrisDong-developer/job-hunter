/**
 * 平台事实表（成熟度 + 登录需求）。
 *
 * ## 为什么单独一张表，而不是写在各适配器里
 *
 * 这两样是**人对平台的认知**，不是代码逻辑：成熟到什么程度、哪个环节要登录。
 * 它们最怕的不是写错，而是**散**：散在 10 个文件里，没人能一眼看出
 * "哪几个平台其实是没验过的"。集中一张表，才能：
 *   * 一次 review 全看清（改一个平台时也顺带看到邻居的状态）；
 *   * 被契约测试钉住（`test/platform/registry.test.ts`：注册了的适配器必须有事实行）；
 *   * 直接进 DTO 给界面（用户勾平台前就能看到"这个还只是实验性的"）。
 *
 * ## 填表纪律
 *
 *   * `unknown` **是合法值**，而且比猜一个值更有用 ——
 *     "我们不知道它要不要登录"本身就是用户该知道的信息；
 *   * `verifiedAt` 只在**真有真机验证记录**时填。有夹具但没标注日期的填 `null`；
 *   * `notes` 写**已知缺口/陷阱**，写到人看了就知道该怎么办的程度
 *     （"详情页需 securityId" 比 "部分未实现" 有用）。
 */
import type { AuthRequirementValue } from '../../shared/enums.js'
import type { AdapterMaturityFact, AuthRequirementFact } from './types.js'

export interface PlatformFacts {
  maturity: AdapterMaturityFact
  authRequirement: AuthRequirementFact
  /**
   * 平台的**每日动作安全上限**（平台事实）。
   *
   * 与用户的 `dailyLimits` 是**两层**：用户设的是"我今天想投多少"，
   * 这里是"这个平台允许多少"（超出会被限流、甚至标记账号）。取两者**较小的**。
   *
   * `undefined` = **不知道** —— 那时只有用户自己的额度在管。
   * 不知道就不编一个保守值：编出来的数字会平白拦掉合法使用，
   * 而"少投了几个"和"被平台盯上"都由用户承担，不该由我们瞎猜。
   */
  dailyCaps?: { greeting?: number; application?: number }
}

/** 不知道就说不。没验证过的环节一律 `unknown`。 */
const U: AuthRequirementValue = 'unknown'

/**
 * 已注册平台的认知表。键 = `SiteAdapter.id`。
 *
 * 分级口径见 `MATURITY_LEVEL_LABEL`；这里的分档依据是**证据强度**：
 *   * `stable`       = 真实夹具 + 真机冒烟通过；
 *   * `calibrated`   = 真实探针/响应夹具验证过，但有已知未覆盖的部分；
 *   * `experimental` = 夹具缺失、关键契约未确证、或没有测试；
 *   * `disabled`     = 平台侧已不可用（需改配置才启用）。
 */
export const PLATFORM_FACTS: Record<string, PlatformFacts> = {
  '51job': {
    maturity: {
      level: 'stable',
      verifiedAt: '2026-09-18',
      notes: '真实夹具 51job-sz.html（684KB）+ 真机冒烟（20 条 / 四核心字段 20/20）。阿里云 WAF 滑块；「今日投递太多」需 200ms×10 轮询。',
    },
    authRequirement: { crawl: 'none', detail: U, actions: 'required' },
  },
  zhaopin: {
    maturity: {
      level: 'stable',
      verifiedAt: '2026-09-18',
      notes: '列表与详情夹具取自真实 dump（合成结构）。投递上限约 100；第 2 页起用无 query path；详情页有 AB 分流兜底。',
    },
    // 平台侧硬事实：投递上限约 100（ADAPTERS §7.2 实测）
    dailyCaps: { application: 100 },
    authRequirement: { crawl: 'none', detail: 'required', actions: 'required' },
  },
  liepin: {
    maturity: {
      level: 'stable',
      verifiedAt: '2026-09-18',
      notes:
        '真实探针夹具（列表 p1/p2 + 接口 JSON），校准 42/42。检测「CDP 控制页面」本身且探测调试端口 → 必须 patchright 启动式。聊天按钮需 hover。' +
        '2026-09-18 未登录定谳：全新 profile（无 Cookie）未登录态下搜索列表完整可用（42 卡 + 接口采样成功），夹具即该次捕获 —— 适配器 searchWithoutLogin=true 成立。',
    },
    // crawl=none：**未登录实测**（2026-09-18，全新 profile）—— 搜索列表完整出数。
    // 曾经写成 required 是无据的猜测，与适配器声明矛盾；detail（securityId 类）/actions 仍需登录。
    authRequirement: { crawl: 'none', detail: 'required', actions: 'required' },
  },
  zhipin: {
    maturity: {
      level: 'calibrated',
      verifiedAt: '2026-09-18',
      notes:
        '只有**未登录**夹具：单页 15 条、无分页区、薪资元素在但为空。详情页要带完整 securityId（登录后才有），登录夹具补齐后再升档。' +
        '打招呼/收件箱/附件选择器取自求职者端生产实现 BossHunter（`executor/sender.py`、`executor/monitor.py`）：' +
        '沟通入口 `.btn-startchat`/`.op-btn-chat`、首次沟通弹窗 `.dialog-wrap.startchat-dialog`、会话输入框 `#chat-input`、' +
        '会话行 `li[role=listitem]`、平台简历弹窗 `.choose-resume-dialog`。' +
        '已知缺口：BOSS 求职者网页端**没有会话内上传本地文件的入口**（BossHunter 实证），故 sendResume 的本地 PDF 只能 fail-closed、走平台简历。',
    },
    // 平台侧硬事实：打招呼日上限约 150（ADAPTERS §7.2 实测）
    dailyCaps: { greeting: 150 },
    authRequirement: { crawl: 'none', detail: 'required', actions: 'required' },
  },
  lagou: {
    maturity: {
      level: 'experimental',
      verifiedAt: null,
      notes: '夹具缺失（`test/fixtures/lagou-search.html` 不存在 → 用例被 skip），选择器自称「经典结构、待校准」。滑块验证。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
  waiqi: {
    maturity: {
      level: 'calibrated',
      verifiedAt: '2026-09-18',
      notes: '真实响应夹具（页面 + 载荷）。服务端翻页坏 → 声明 1 页（≤50 条/页）是平台事实，不是保守取舍。接口 code=1022 表示未登录。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
  guopin: {
    maturity: {
      level: 'experimental',
      verifiedAt: null,
      notes: '**当前完备度最低的在注册适配器**：城市码表为空、分页未确证、`hasNextPage` 恒 false、且没有任何测试（只有探针）。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
  sinojobs: {
    maturity: {
      level: 'calibrated',
      verifiedAt: null,
      notes: '真实响应/页面夹具（列表 + 载荷 + 详情）。按接口 `total` 判页。夹具未标注抓取日期。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
  indeed: {
    maturity: {
      level: 'disabled',
      verifiedAt: null,
      notes: '默认 host `cn.indeed.com` 已停运。属「已注册但默认不可用」：需在 DB 覆盖里换 host 才可能启用。Cloudflare challenge 走 captcha 判定。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
  hiredchina: {
    maturity: {
      level: 'calibrated',
      verifiedAt: null,
      notes: '列表可用（`?page=N`，实测 749 页）；详情页选择器待校准。测试用的是内联合成 HTML（按探针实测结构还原），不是保存的真实页面。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
}

/**
 * 取某个平台的事实。
 *
 * 未登记的 id **不抛错**（否则新增适配器会以最难查的方式失败），
 * 而是给一个**保守默认**：实验性 + 全部未验证。
 * 这会同时让它在界面上显示为"实验"，以及被契约测试点名。
 */
export function platformFacts(id: string): PlatformFacts {
  return (
    PLATFORM_FACTS[id] ?? {
      maturity: { level: 'experimental', verifiedAt: null, notes: '未登记的平台事实 —— 请补 PLATFORM_FACTS。' },
      authRequirement: { crawl: U, detail: U, actions: U },
    }
  )
}

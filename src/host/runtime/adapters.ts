/**
 * 适配器注册表：**平台清单与注册样板只有这一份**。
 *
 * ## 为什么要抽出来
 *
 * 注册一个平台要做的四件事是固定的：读 DB 覆盖（`setting(key='adapter-config')`）→
 * 合并到代码默认值 → 构造适配器 → 记一行"配置来源"日志。十个平台就是十份同样的代码，
 * 而其中任何一份漏掉一条（比如忘了传随机延时、或忘了登记 `platform` 行）都**不会报错**：
 * 表现只是"某个平台的行为悄悄和别人不一样"。
 *
 * 这与批次 6 抽 `platform/config-merge.ts` 是同一条理由（那里抽掉的是 `merge*` 的样板）。
 * 现在这里抽掉**注册**这一层，于是新增平台 = 在下面表里加一行；
 * 而"注册的适配器必须有对应的 `platform` 行"这个不变量由 `registerAdapters` 保证。
 *
 * ## 每个平台为什么长这样
 *
 * 表里每一条上方的注释记的是**平台事实**（分页参数未确证 / 被 Cloudflare 挡 /
 * 城市表为空且封闭…）。那不是装饰：改默认配置或换适配器实现前先读它，
 * 否则很容易把"刻意保守"当成"没写完"。更细的锚点与实测记录在各适配器文件头。
 */
import { PLUGIN_ID, REQUEST_DELAY_MAX_MS, REQUEST_DELAY_MIN_MS } from '../../shared/constants.js'
import { createFiftyOneAdapter, mergeFiftyOneConfig } from '../platform/adapters/fiftyone-job.js'
import { createGuopinAdapter, mergeGuopinConfig } from '../platform/adapters/guopin.js'
import { createHiredChinaAdapter, mergeHiredChinaConfig } from '../platform/adapters/hiredchina.js'
import { createIndeedAdapter, mergeIndeedConfig } from '../platform/adapters/indeed.js'
import { createLagouAdapter, mergeLagouConfig } from '../platform/adapters/lagou.js'
import { createLiepinAdapter, mergeLiepinConfig } from '../platform/adapters/liepin.js'
import { createSinoJobsAdapter, mergeSinoJobsConfig } from '../platform/adapters/sinojobs.js'
import { createWaiqiAdapter, mergeWaiqiConfig } from '../platform/adapters/waiqi-job.js'
import { createZhaopinAdapter, mergeZhaopinConfig } from '../platform/adapters/zhaopin.js'
import { createZhipinAdapter, mergeZhipinConfig } from '../platform/adapters/zhipin.js'
import type { AdapterRegistry } from '../platform/registry.js'
import type { SiteAdapter } from '../platform/types.js'
import type { Store } from '../store/store.js'
import type { Clock } from '../util/time.js'

/** 只用到 info —— 装配点的 logger 形状这里不需要整个。 */
export interface AdapterLogger {
  info(message: string): void
}

/** 一个平台的注册规格。 */
export interface AdapterSpec {
  /** 与 `setting` 里 `adapter-config` 的作用域键、以及适配器自己声明的 `id` 必须一致。 */
  id: string
  /** 用 DB 里那份覆盖（可能为 undefined）构造适配器。 */
  build: (override: unknown, delayRangeMs: [number, number]) => SiteAdapter
  /** 没有 DB 覆盖时要额外说的一句话（拼在"配置来源"后面）。 */
  noOverrideNote?: string
}

/**
 * **平台清单**。顺序即注册顺序（也是 `/platforms` 与城市取值域的遍历顺序）。
 *
 * P5：请求之间要随机延时，别踩出规律性的节奏 —— 十个平台共用同一档区间，
 * 所以它由 `registerAdapters` 统一注入，不在每行里各写一遍。
 */
export const ADAPTER_SPECS: readonly AdapterSpec[] = [
  {
    id: '51job',
    build: (override, delayRangeMs) =>
      createFiftyOneAdapter({ config: mergeFiftyOneConfig(override), delayRangeMs }),
  },

  // 拉勾（lagou.com）：列表公开可爬，但被 WAF 滑块挡门（antiBot=high）——
  // 关键词进路径段、城市用中文名；翻页读「下一页」真实 href，不自己拼拼音 slug。
  // 详见适配器文件头。
  {
    id: 'lagou',
    build: (override, delayRangeMs) =>
      createLagouAdapter({ config: mergeLagouConfig(override), delayRangeMs }),
  },

  // 神仙外企（waiqi.com）：列表走接口、DOM 不承载岗位数据 —— 详见适配器文件头。
  {
    id: 'waiqi',
    build: (override, delayRangeMs) =>
      createWaiqiAdapter({ config: mergeWaiqiConfig(override), delayRangeMs }),
  },

  // 智联招聘（zhaopin.com）：搜索页是 /sou/jl<城市码>，**不是** /jobs?jl= 那条老路由 ——
  // 两条路由的 DOM 完全不同，详见适配器文件头。
  {
    id: 'zhaopin',
    build: (override, delayRangeMs) =>
      createZhaopinAdapter({ config: mergeZhaopinConfig(override), delayRangeMs }),
  },

  // 猎聘（liepin.com）：风控最强（检测"CDP 控制页面"本身）—— 依赖 D-17a
  // 环境一致性三件套（patchright 引擎 + stealth 注入 + 端口守卫，平台层已就位）。
  // 适配器只做 URL 导航 + 语义锚点解析 + 判墙即停；锚点待 probe:liepin 夹具校准。
  {
    id: 'liepin',
    build: (override, delayRangeMs) =>
      createLiepinAdapter({ config: mergeLiepinConfig(override), delayRangeMs }),
  },

  // BOSS 直聘（zhipin.com）：与猎聘同路线（D-17a 三件套）。2026-09-18 夹具校准：
  // 未登录可搜（薪资隐藏 → requiredFields 不含 salary_raw）；详情选择器来自
  // BossHunter site-patterns（2026-05-26 验证）。
  {
    id: 'zhipin',
    build: (override, delayRangeMs) =>
      createZhipinAdapter({ config: mergeZhipinConfig(override), delayRangeMs }),
  },

  // Indeed（cn.indeed.com）：⚠️ 中国大陆站 2022 起停运，2026-09-18 实测搜索入口
  // 302 重定向到 www.indeed.com 并被 Cloudflare 验证墙拦截。适配器按 Indeed JCS
  // 稳定语义锚点实现，判墙即停（captcha/blank）；默认 host=cn.indeed.com 不可用，
  // 需配 DB 覆盖换仍运营的域（如 sg/de.indeed.com）并校准夹具后才真实启用。
  {
    id: 'indeed',
    build: (override, delayRangeMs) =>
      createIndeedAdapter({ config: mergeIndeedConfig(override), delayRangeMs }),
    noOverrideNote: '⚠️ 中国大陆站已停运，默认 host 不可用',
  },

  // 国聘网（iguopin.com）：「国聘行动」官方平台，央企/国企/事业单位为主。
  // 2026-09-18 真实线上调研（列表页 /jobList?keyword=，详情 /job/detail?id=）。
  // v1 语义锚点单页采集：分页参数与城市码未确证，**不编** —— 见适配器文件头。
  {
    id: 'guopin',
    build: (override, delayRangeMs) =>
      createGuopinAdapter({ config: mergeGuopinConfig(override), delayRangeMs }),
  },

  // HiredChina（hiredchina.com）：面向在华外国人的招聘平台（eChinacities 同源）。
  // 2026-09-18 真实调研 + 浏览器探针校准：列表 /<lang>/jobs 是 Next.js RSC 服务端渲染
  // （可抓 DOM，无需页面内调接口）；卡片字段按 Tailwind 底色徽章区分；翻页 ?page=N 已实测。
  // 主站 www.hiredchina.com raw HTTP 会吃 Cloudflare managed challenge（真浏览器 + 登录态可过）；
  // 探针/夹具走同源子域 hcweb.gicexpat.com（不拦截）。城市筛选参数未确证 → v1 不筛 —— 见适配器文件头。
  {
    id: 'hiredchina',
    build: (override, delayRangeMs) =>
      createHiredChinaAdapter({ config: mergeHiredChinaConfig(override), delayRangeMs }),
  },

  // SinoJobs 中欧招聘（sinojobs.com.cn）：中欧双向求职平台，岗位多为德企/欧洲企业在华
  // 与海外职位。列表**不在 DOM 里**（AJAX 渲染）—— 与 waiqi 同款「页面内调接口」路线，
  // POST /Recruitment/indexAjaxPage.html 匿名可读、可翻页、筛选参数全部实测生效。
  {
    id: 'sinojobs',
    build: (override, delayRangeMs) =>
      createSinoJobsAdapter({ config: mergeSinoJobsConfig(override), delayRangeMs }),
  },
]

export interface RegisterAdaptersOptions {
  store: Store
  registry: AdapterRegistry
  clock: Clock
  logger?: AdapterLogger
}

/**
 * 按 `ADAPTER_SPECS` 注册全部适配器，并顺带登记平台实体。
 *
 * 两件事必须一起做：`account_state` 有指向 `platform` 的外键，而用户可能在
 * 第一次抓取之前就先点「登录」—— 所以"注册了适配器却没有 platform 行"会让登录直接失败。
 */
export function registerAdapters(options: RegisterAdaptersOptions): void {
  const { store, registry, clock } = options
  const logger = options.logger
  const delayRangeMs: [number, number] = [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS]

  for (const spec of ADAPTER_SPECS) {
    // 适配器配置以 DB 为权威（ADR-19）：DB 覆盖合并到代码默认值之上
    const override = store.setting.get<unknown>('adapter-config', 'platform', spec.id)
    const adapter = spec.build(override, delayRangeMs)
    // 表里的 id 要读 DB 覆盖，适配器里的 id 决定注册键 —— 两者不一致会注册到一个
    // 用错配置的平台下，而且不报错。宁可在这里断掉。
    if (adapter.id !== spec.id) {
      throw new Error(`适配器表 id 与实现不符：表里是 ${spec.id}，实际构造出 ${adapter.id}`)
    }
    registry.register(adapter)
    const note = override === undefined && spec.noOverrideNote !== undefined ? `；${spec.noOverrideNote}` : ''
    logger?.info(
      `[${PLUGIN_ID}] 适配器 ${spec.id} 已注册（配置来源：${override === undefined ? '代码默认' : 'DB 覆盖'}${note}）`,
    )
    store.platform.ensure(
      { id: adapter.id, displayName: adapter.displayName, capabilities: adapter.capabilities },
      clock(),
    )
  }
}

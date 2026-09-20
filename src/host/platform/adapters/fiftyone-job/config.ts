/**
 * 51job 的配置面：选择器集、字段 → URL 参数映射、默认值与合并函数、排序/时间窗取值域、
 * 城市码表、页数上限、判墙信号常量 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * 完整实测记录（排序取值来源、`issueDate` 恒空、城市码与判墙信号的逐条理由）见 `./index.ts` 文件头。
 */
import { mergeAdapterConfig } from '../../config-merge.js'

/** 51job 列表页的选择器集。**每一项都可以在 UI 里改。** */
export interface FiftyOneSelectors {
  /** 卡片容器。 */
  card: string
  title: string
  salary: string
  area: string
  tags: string
  company: string
  /** 公司行里的「行业 / 性质 / 规模」三个 span。 */
  companyMeta: string
  /** 承载跟踪载荷的元素（里面有 jobId / 发布时间 / 经验 / 学历）。 */
  tracking: string
  /** 跟踪载荷所在的属性名。 */
  trackingAttr: string
}

/**
 * 字段 → URL 参数的映射。这一层**无法自动推导**，必须每平台人工建一次（§4.2.2）。
 *
 * SR-40 追加了"抓取深度"三件套（页数/排序/时间窗）的映射 ——
 * 它们**也**是 URL 参数，所以同样进配置、同样可人工修。
 */
export interface FiftyOneUrlParams {
  base: string
  keywordParam: string
  cityParam: string
  pageParam: string
  /** 排序方式（`sortType`）。取值域见 `SORT_OPTIONS`。 */
  sortParam: string
  /** 发布时间窗（`issueDate`），单位=天。 */
  postedWithinParam: string
}

/**
 * 51job 支持的排序取值域（探针实测 2026-09，搜索页「综合/活跃/最新/薪资/距离」五个按钮）。
 *
 * 取值来自探针逐项点击排序按钮后，读取 API `we.51job.com/api/job/search-pc` 请求里
 * `sortType=` 的实值（并用激活态 `.ss.on` 双重确认）：
 *
 * | 按钮文字 | sortType |
 * |---|---|
 * | 综合排序 | `0` |
 * | 最新优先 | `1` |
 * | 薪资优先 | `3` |
 * | 活跃职位优先 | `5` |
 * | 距离优先 | （未启用，无实值） |
 *
 * ⚠️ **「距离优先」故意不列出**：探针点击后按钮无「on」高亮、也不发请求（疑似依赖
 * 定位/经纬度上下文，当前未启用时点击不生效）。没测出实值就不编 —— 编错了用户选了
 * 只会静默拿到另一种排序（更糟）。所以 `render` 里只有上面四档。
 *
 * **只在声明里出现**：界面据它渲染下拉，校验据它拒绝非法值。
 * 加一项只需要改这里和 `SORT_OPTIONS`。
 */
export const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '综合排序' },
  { value: '1', label: '最新优先' },
  { value: '3', label: '薪资优先' },
  { value: '5', label: '活跃职位优先' },
]

/**
 * 发布时间窗取值域（天）。
 *
 * **探针实测：本页面不存在「发布时间」筛选控件**（全文无「24小时/三天/一周/一个月」等文案）。
 * API 虽保留 `issueDate` 参数但恒为空。所以值域为空 —— 界面据此禁用该维度并给出原因，
 * 而不是摆一堆点击后不生效的选项。
 */
export const POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = []

/** 页数上限：再大也不会更"全"，只会更容易触发风控。 */
export const FIFTYONE_MAX_PAGES = 5

export interface FiftyOneConfig {
  selectors: FiftyOneSelectors
  urlParams: FiftyOneUrlParams
  /** 城市名 → 平台城市码。 */
  cityCodes: Record<string, string>
  /** 详情页 URL 模板，`{jobId}` 会被替换。 */
  detailUrlTemplate: string
}

export const DEFAULT_FIFTYONE_CONFIG: FiftyOneConfig = {
  selectors: {
    card: '.joblist-item',
    title: '.jname',
    salary: '.sal',
    // ⚠️ 顶栏筛选区也有同名 `.area`，必须限定在卡片内（`.joblist-item .area`），
    //    否则可能抓到顶栏的「地点」筛选而非某张卡片的地址（探针 2026-09 提示）。
    area: '.joblist-item .area',
    tags: '.joblist-item-tags .tag',
    company: '.cname',
    companyMeta: '.bc .dc',
    tracking: '[sensorsname="JobShortExposure"]',
    trackingAttr: 'sensorsdata',
  },
  urlParams: {
    base: 'https://we.51job.com/pc/search',
    keywordParam: 'keyword',
    cityParam: 'jobArea',
    pageParam: 'pageNum',
    sortParam: 'sortType',
    postedWithinParam: 'issueDate',
  },
  cityCodes: {
    北京: '010000',
    上海: '020000',
    广州: '030200',
    深圳: '040000',
    天津: '050000',
    重庆: '060000',
    南京: '070200',
    苏州: '070300',
    杭州: '080200',
    成都: '090200',
    青岛: '120300',
    郑州: '170200',
    武汉: '180200',
    长沙: '190200',
    西安: '200200',
  },
  detailUrlTemplate: 'https://jobs.51job.com/all/{jobId}.html',
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeFiftyOneConfig(override: unknown): FiftyOneConfig {
  // 通用合并（`platform/config-merge.ts`）：分组浅合并 + 字符串空值保护 +
  // 只认默认值里已有的键。以前这里是一份手写实现 —— 10 个适配器各写一遍
  // 同一套语义，漏掉哪一条都只会以"某平台配置突然被清空"的形式暴露。
  return mergeAdapterConfig(DEFAULT_FIFTYONE_CONFIG, override)
}

/**
 * 51job 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 两条必须显式带上，否则会**悄悄改变行为**：
 *   * 阿里云 WAF 滑块：`waf-nc-title` 文案 + `aliyunwaf_` 脚本名（get_jobs 实战特征）；
 *   * 登录墙用的是**很宽的词**（`登录|注册|扫码`），而不是通用词表里那几个完整短语 ——
 *     收紧成"扫码登录"这类短语会让一条"登录后继续"的墙**判不出来**，
 *     而 `auth.isLoggedIn` 正是靠 `block !== 'login-required'` 反推的：
 *     判不出来就会报告"已登录"，然后安静地抓到 0 条（正是本项目一直在修的那类静默失败）；
 *   * `loginTextLength` 放到极大 = **保留**它原本"没有长度上限"的语义。
 *     通用词表的 800 上限是为了防"导航栏里有『登录』但没卡片"的误判，
 *     那是个**收紧**，应当作为独立改动 + 独立断言来做，不能混在迁移里。
 */
export const FIFTYONE_BLOCK_SIGNALS = {
  captchaSelectors: ['.waf-nc-title', 'script[name^="aliyunwaf_"]'],
  loginText: ['登录', '注册', '扫码'],
  loginTextLength: 1_000_000,
  // 51job 的 blank 阈值是 80（不是通用的 120）：它的空结果页有一两百字的筛选器文案，
  // 阈值放大到 120 会让"搜到 0 条"被误判成"页面空白"，错误码与界面提示都跟着变。
  blankTextLength: 80,
} as const

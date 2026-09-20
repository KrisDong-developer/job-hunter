/**
 * 拉勾网（lagou.com）适配器 —— 2026-09-18 基于真实平台调研。
 *
 * ## 调研来源（2026-09-18 线上抓取 + 搜索量抽样，多次互证）
 *
 * 抓取 `https://www.lagou.com/hangzhou-zhaopin/Python/`、`/jobs/list_AR`、`/jobs/list_Python`
 * 三个真实列表页（另见 docs/ADAPTERS.md 的调研记录）：
 *
 * ## 路由与 URL（**相机里的关键事实**）
 *
 * | 用途 | URL 形态 | 说明 |
 * |---|---|---|
 * | 搜索第 1 页 | `/jobs/list_<关键词>?city=<城市中文名>&px=new` | **关键词进路径**（`list_Java`），城市用**中文名**进 query，**不是数字码** —— 这跟其它平台都不一样 |
 * | 已登录详情 | `/wn/jobs/<纯数字id>.html?show=<token>` | 岗位 id 是**纯数字**（可作幂等键） |
 * | 分页 | `/hangzhou-zhaopin/Python/2/` | 城市拼**拼音 slug 段**，页码是尾部 `/2/`；slug 无法逐城推导 |
 * | 公司 | `/gongsi/v1/<hash>.html` | — |
 *
 * **翻页因此用「读真实 href」而不是自己拼**：第 2 页起读上一页分页区「下一页」链接的真实
 * href（`/hangzhou-zhaopin/Python/2/` 这种），与 zhaopin 的 `nextPageUrlInPage` 同一套路
 * （ADR-9 URL 导航、无 query、贴近站点自己生成的链接）。页码码段走不正也不敢猜。
 *
 * ## 风控强度（本平台最要紧的调研结论）
 *
 * 拉勾 **2020 年后重建 + 上了 WAF**：对 V8/Playwright 探测流量高频返回一个滑块验证页
 * （`appkey: "CF_APP_WAF"`、`sceneId` 随机、请求头注入 `userUserId`），URL 形如
 * `/s/list_<随机hex>`，正文「为了更好的访问体验，请滑动滑块进行验证」。
 * → **antiBot 定 `high`**；`detectBlock` 必须把这套滑块页与极验/阿里云 nc 一起判 `captcha`，
 *   命中即停不重试（C12）。
 *
 * 与此同时，**列表页本身是公开可爬的**（未登录就能拿到职位与薪资明文，本调研的 SEO
 * 直出页即证据），所以 `searchWithoutLogin: true`。`searchWithoutLogin:true` 与
 * `antiBot:high` 并存是拉勾的实情：**能不能进门是反爬的事，进不进得来不是登录的事**。
 *
 * ## 选择器现状（诚实声明）
 *
 * 本次调研拿到的是**内容结构**（标题/地点/薪资/经验/学历/公司/融资/标签），不是构建产物
 * 的 class。拉勾列表页是 Vue 重写，class 混淆且未做真机抓取校准 —— 按项目铁律**不编经典
 * 时代的选择器当真值**：默认选择器射到经典结构（`.con_list_item`/`.position_link`/
 * `.money`/`.company_name`…），但解析体用**语义模式**（薪资/经验/学历/地点从卡片文本抠，
 * 与猎聘同一族做法），锚不中的字段留空进 `pending_repair`。等 `npm run probe:lagou` 保存
 * 真实夹具（`test/fixtures/lagou-search.html`）后校准。
 *
 * ## 城市
 *
 * `city` 参数就是**中文城市名**（`city=深圳`、全国不带该参数）。所以不需要城市码表：
 * 任何中文城市名都能直接拼，UI 枚举用内置 20 城（identity 映射），别处城市自由文本也能收。
 *
 * ## 本目录分工
 *
 * * `index.ts` —— 只导出 `createLagouAdapter` 与 `LagouAdapterOptions`；含 `nextUrlByPage` 与
 *   `lastCriteria` 两个页面对象级的 WeakMap 编排状态（它们是编排，不是配置）。
 * * `config.ts` —— 选择器 / URL 参数 / 值域 / 判墙信号 / 默认配置与 `merge*`（配置面）。
 * * `urls.ts` —— 搜索 URL / 接口地址 / 请求体的宿主机侧构造（不碰 `document`）。
 * * `api.ts` —— 页面内 fetch 通道 + 响应 → `RawJob` 的解析（v2 双通道）。
 * * `page.ts` —— `page.evaluate` 送进浏览器的自包含解析函数（列表 / 详情 / 翻页 / 登录态）。
 * * 配置面（`DEFAULT_*` / `merge*`）一律从 `./config.js` 取，本文件不转出。
 */
import type { AdapterLogger, SiteAdapter } from '../../types.js';
import type { LagouConfig } from './config.js';
export interface LagouAdapterOptions {
    config?: LagouConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
    /** 诊断日志：只用于上报"接口通道静默降级了"这一类**不报警的坏法**。 */
    logger?: AdapterLogger;
}
/** 构造拉勾网适配器。 */
export declare function createLagouAdapter(options?: LagouAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map
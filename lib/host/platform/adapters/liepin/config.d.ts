/**
 * 会话/动作选择器集（`sayHello` / `reply` 用；全部来自 2026-09-19 / 09-20 两次登录态实测）。
 */
export interface LiepinChatSelectors {
    /**
     * 详情页「聊一聊 / 继续聊」入口（2026-09-19 实测 `a.btn-main` / `a.btn-chat`）。
     *
     * ⚠️ 平台事实：按钮**hover 后才出现**（get_jobs 实测），所以流程是先悬停再点击；
     * 按钮文案被平台拒绝时也会立刻从「聊一聊」翻成「继续聊」（乐观假象）——
     * **只当点击目标，不当"已联系"的判据**。
     */
    chatButton: string;
    /**
     * 入口候选里要**排除**的祖先容器：详情页侧边栏的「我的沟通 / 我的投递」
     * （`.sider-bar-item-box`，2026-09-19 实测按文档顺序会先命中它们 —— 白点一轮）。
     */
    chatButtonExclude: string;
    /** 入口文案（「聊一聊」或「继续聊」—— 两种状态都是同一个按钮）。 */
    chatButtonText: string;
    /**
     * 「简历完整度不足」弹窗（2026-09-19 实测：`open-chat` 被拒时弹它，
     * HTTP 仍是 200、code 30011 —— 这是**拒绝路径唯一的 DOM 证据**）。
     */
    completeResumeModal: string;
    /**
     * 收件箱抽屉入口（侧边栏 `#im-c-entry`，**不是 `<a>`**、按 href 找命中 0）。
     * ⚠️ 标题会从「我的沟通」变成「有新消息」（有未读时）—— 只能按选择器定位。
     */
    drawerEntry: string;
    /** 抽屉里的会话行（2026-09-20 实测 `.im-ui-contact-item`；内层还有 unread 徽章）。 */
    contactRow: string;
    /** 会话行副标题（实测格式「HR·公司名」—— reply 按公司匹配就靠它）。 */
    contactRowSub: string;
    /**
     * 会话输入框（2026-09-20 实测 `<textarea class="ant-im-input ant-im-input-borderless im-ui-textarea"
     * placeholder="请输入文字，按Enter键发送" rows="2">`）。
     */
    composer: string;
    /** 「我发出的」消息条目（`.im-ui-message-item-send`）。 */
    myMessage: string;
    /** 我方消息正文节点（`.im-ui-txt.send`）。 */
    messageText: string;
    /**
     * 我方消息的发送中图标（`.im-ui-message-item-loadingicon-send`）。
     * 实测空闲时带 `hide` 类 ⇒「文本在 + 图标在转」= pending，「文本在 + 图标 hide」= delivered。
     */
    messageLoading: string;
}
/** 发送后轮询确认送达的节奏（与 zhipin 的 `ZhipinDeliveryPoll` 同形）。 */
export interface LiepinDeliveryPoll {
    attempts: number;
    intervalMs: number;
}
/** 结构锚点集（2026-09-18 由 v8 探针真实夹具校准）。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface LiepinSelectors {
    /** 卡片容器（get_jobs 生产验证 + 夹具确认：`div._40108Nrnc3.job-card-pc-container`）。 */
    card: string;
    /**
     * 职位链接：猎聘给语义属性 `data-nick="job-detail-job-info"`（比 href 更精确，
     * 夹具确认每张真职位卡恰好一条；广告卡没有）。标题/薪资/经验/学历都在这个链接内。
     */
    jobLink: string;
    /** 公司信息盒：`data-nick="job-detail-company-info"`，内含公司名/行业/规模三个 span。 */
    companyInfoBox: string;
    /** 标题节点：链接内带 title 属性的 div（夹具：`<div class="ellipsis-1" title="招聘Java工程师">`）。 */
    titleNode: string;
    /** 分页容器（AntD）。 */
    pagination: string;
    /** 「下一页」按钮所在 li（get_jobs 生产验证）。 */
    nextPage: string;
    /** 「下一页」disabled 的类名标记。 */
    nextPageDisabledClass: string;
    /**
     * ── 详情页（2026-09-18 详情探针夹具 `liepin-detail.html` 校准）──────
     * 详情页是 SSR 直出（真实文本就在 DOM 里），未登录也能读到 JD 正文。
     */
    /** 职位名（详情页）。 */
    detailTitle: string;
    /** 薪资。**必须限定在 `.name-box` 内** —— 裸 `.salary` 会命中侧栏推荐岗位。 */
    detailSalary: string;
    /** 关键信息行：「佛山-顺德区 5年以上 本科 招5人 9月17日更新」。 */
    detailProperties: string;
    /**
     * 公司名（详情页）。取 `公司信息` 侧栏卡片里的名字节点。
     *
     * ⚠️ **不能复用列表页的 `job-detail-company-info`**：夹具里这个 `data-nick`
     * 在详情页出现 20 次，**全部**落在 `section.love-job-container`（「猜你喜欢」
     * 推荐位），第一个命中是别家公司的岗位卡 —— 会静默把公司名写错。
     */
    detailCompany: string;
    /** JD 所在容器（语义类名，SSR 输出）。 */
    detailIntroSection: string;
    /**
     * JD 所在块的 `dt` 文案。**用文案当锚点而不是类名**：同一容器里有多个 `dl`，
     * 只有 `dt=职位介绍` 那块是正文，其余是「其他信息」（语言/行业/部门要求）。
     */
    detailIntroTitleText: string;
    /**
     * ── 登录态标记（2026-09-19 由两份快照对比定案）─────────────────────
     * 只认**结构性信号**，不认文案 —— 文案会改，而且「登录/注册」这类字样在页脚也可能出现。
     */
    /** **已登录**才有：页头「你好，<名字>」+ 头像那个下拉（`id` 是 `header-quick-menu-user-info`）。 */
    loggedInMarker: string;
    /**
     * **未登录**才有：`.header-quick-menu-not-login-item`（类名自带 `not-login` 语义）。
     *
     * ⚠️ 别把它和已登录态的 `class="header-quick-menu-login"`（页头快捷菜单容器）搞混 ——
     * 后者**没有** `not-`，而且**未登录页里存在的是 `id="header-quick-menu-login"`（登录链接那个 span）**。
     * 一字之差、id 与 class 含义相反，差点写错。
     */
    notLoggedInMarker: string;
}
/** 字段 → URL 参数映射（get_jobs `getSearchUrl()` 同款：city 与 dq 双参数）。 */
export interface LiepinUrlParams {
    base: string;
    keywordParam: string;
    cityParam: string;
    cityAliasParam: string;
    /** 页码参数（**0 起**；本项目的 criteria.page 是 1 起，构造时换算）。 */
    pageParam: string;
}
export interface LiepinConfig {
    selectors: LiepinSelectors;
    chatSelectors: LiepinChatSelectors;
    urlParams: LiepinUrlParams;
    /**
     * 城市名 → 平台城市码（**370 个实测值**，2026-09-19 逐省点开「请选择城市」弹窗采得）。
     *
     * ⚠️ 这份表**一次都不要靠猜**：错一个码就会把用户搜到另一个城市去，而且看不出来。
     * 采样方式、原始数据与三个坑见 `test/fixtures/liepin-city-codes.json`；
     * 重新采样跑 `npm run probe:liepin-chat`。
     *
     * `全国` → 空串 = **不带城市参数**（平台自己的全国码是 410，两者不是一回事）。
     * 未列出的城市 `buildSearchUrl` 返回 null（入口层拒绝）—— 单测会检查这里的城市
     * 都在跨平台城市目录 `CITY_DIRECTORY` 里。
     */
    cityCodes: Record<string, string>;
    /**
     * 搜索接口的**静态请求头**（2026-09-19 逐组削减实测出的最小充分集，见 `LIEPIN_API_HEADERS`）。
     *
     * 为什么放进配置：其中 `x-fscp-std-info` 的 `client_id` 与 `x-fscp-version` 是**前端版本号**
     * 一类的值，猎聘发版就可能变。DB 覆盖（`adapter-config`）能在不改代码的前提下补上，
     * 探针 `npm run probe:liepin-chat` 会在线复验这套头是否还有效。
     */
    apiHeaders: Record<string, string>;
    /** 薪资文本模式（字符串形态，会序列化进页面）。 */
    salaryPattern: string;
    /** 职位链接里抠平台 id 的模式。 */
    jobIdPattern: string;
    /**
     * ── 平台的**数字 job id**：从卡片 href 的埋点参数 `pgRef` 里抠（2026-09-20 定案）──
     *
     * 猎聘同一张岗位卡上有**两个 id**，而且它们不是一回事（实测 42/42 张卡）：
     *
     * | 来源 | 形态 | 例 |
     * |---|---|---|
     * | 详情页 URL 路径 | `/job/<10 位>.shtml` | `1984775119` |
     * | `href` 的 `pgRef` 埋点 | `job_listcard%40<kind>_<8 位>%3A<n>` | `84775119` |
     * | 搜索接口 `job.jobId` | 8 位数字 | `84775119` |
     * | IM（`open-chat` / 消息里的岗位卡） | 8 位数字 | `84775119` |
     *
     * ⚠️ **这个模式修掉的是一个真 bug**：适配器是双通道（接口优先、失败回退 DOM），
     * 而两条通道原先各拿一套 id —— 接口通道给 `job.jobId`（8 位），DOM 通道给 URL 路径 id
     * （10 位）。同一批岗位在两轮之间换了通道，就会被幂等 upsert 当成**两批新岗位**各写一遍。
     * 实测证据（`test/fixtures/liepin-search.html` × `liepin-search-api.json`，同一批 42 条）：
     * DOM 的 `pgRef` 数字 id 集合与接口 `job.jobId` 集合**完全相等（42/42，零差异）**，
     * 而 URL 路径 id 只有 **19/42** 相等（那 19 条是 `/a/` 形态，两种 id 恰好同值）。
     *
     * 所以本表把 **`pgRef` 的数字 id 定为规范 id**（它同时是 IM 侧的 join 键），
     * 抠不到时回退 URL 路径 id 并记 note（那种记录与接口通道**可能对不上**，
     * 由字段/幂等层如实暴露，而不是猜）。
     */
    jobPgRefPattern: string;
    /** 城市模式：猎聘把城市包在【】里（夹具实测：`Java工程师【佛山-顺德区】急聘…`）。 */
    cityPattern: string;
    /** 经验词模式（链接文本尾部匹配，夹具实测如「5年以上」）。 */
    expPattern: string;
    /** 学历词模式（夹具实测如「本科」）。 */
    eduPattern: string;
    /**
     * v2 接口化解析（P1）：非空时 `readListPage` 先在页面上下文里 POST 搜索接口，
     * 失败/为空自动回退 DOM 解析（双通道，永不比 v1 差）。
     * ⚠️ 请求体里的 `ckId` 透传字段留空 —— 真实页面会带会话 ckId，留空是否被
     * 服务端接受**待下次真实抓取验证**；不接受也无妨，会静默走 DOM 通道。
     */
    searchApiOrigin: string;
    searchApiPath: string;
    /** 接口是否启用（false = 强制 DOM 通道，校准/排障用）。 */
    searchApiEnabled: boolean;
    /**
     * ── 收件箱（会话列表）接口 ───────────────────────────────────────────
     *
     * `POST {searchApiOrigin}/api/com.liepin.im.c.contact.get-contact-list`，
     * 表单体（见 `buildContactListBody`）。2026-09-20 探针实测：
     * **六项静态头 + 三项现造遥测**才通（只给静态头就 `-1400`），
     * 而 `imId` 留空即可（服务端靠 cookie 认人）。
     */
    contactListApiPath: string;
    /** 每页条数（照抄页面自己发的 30）。 */
    contactListPageSize: number;
    /**
     * 最多翻几页。
     *
     * ⚠️ 翻页**不能看响应里的 `hasNext` / `hasMore` / `totalCount` / `pageSize`**：
     * 实测 `list.length = 8` 时这四个值全是 0/false（全是坏的）。唯一的停手判据是
     * **"本页不满一页即到底"**（与智联 `talkListMaxPages` 同一套路）。
     */
    contactListMaxPages: number;
    /**
     * ── 高危动作的节奏（与 zhipin 的三档停留同形）─────────────────────────
     *
     * `[0, 0]` = 关闭（离线测试靠它把每个用例从十几秒压到毫秒）。
     */
    /** 打招呼前在岗位详情页「看一会儿」的区间（打开即动手是最强的机器信号）。 */
    dwellBeforeGreetMs: [number, number];
    /** 回复前的「读完再回」区间（比打招呼短）。 */
    dwellBeforeReplyMs: [number, number];
    /** 动作流程里等按钮/弹窗/输入框出现的时间上限（ms）。 */
    actionWaitMs: number;
    /** 发送后的送达校验轮询（次数 × 间隔）。 */
    deliveryPoll: LiepinDeliveryPoll;
}
export declare const LIEPIN_SALARY_PATTERN = "\\d+(?:\\.\\d+)?\\s*[-~]\\s*\\d+(?:\\.\\d+)?\\s*[kK\u4E07](?:\\s*[\u00B7x\u00D7]\\s*\\d+\\s*\u85AA)?|\\d+(?:\\.\\d+)?\\s*[kK\u4E07]\\s*\u4EE5\u4E0A|\u9762\u8BAE";
/** 岗位链接形态（夹具实测两种并存）：`/job/<纯数字>.shtml`（普通岗）与
 * `/a/<纯数字>.shtml`（Agent/劳务类岗，如「测试工程师（不要Java）」）。
 * 两者都是真实职位，都要收。
 */
export declare const LIEPIN_JOB_ID_PATTERN = "/(?:job|a)/(\\d+)\\.shtml";
/**
 * 卡片 href 的埋点参数 `pgRef` 里的**数字 job id**（= 接口的 `job.jobId`、IM 的 join 键）。
 *
 * 实测形态两种（`encode` 后）：`…job_listcard%402_84775119%3A1`（`/job/` 类岗）
 * 与 `…job_listcard%401_79162695%3A1`（`/a/` 类岗）—— `%40`=`@`、`%3A`=`:`。
 * 也接受未编码写法（同一条 href 在别的上下文里给的是原文）。
 */
export declare const LIEPIN_JOB_PGREF_PATTERN = "job_listcard(?:%40|@)\\d+_(\\d+)(?:%3A|:)";
/**
 * 搜索接口（v2 接口化解析，2026-09-18 采样）：
 * `POST https://api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`。
 * 响应比 DOM 富（labels/refreshTime/compId/recruiter），refreshTime 让
 * publishedAt 首次可用。请求体结构来自真实采样（见 fixtures/liepin-search-api.json）。
 */
export declare const LIEPIN_SEARCH_API_PATH = "/api/com.liepin.searchfront4c.pc-search-job";
/**
 * 会话列表接口（收件箱的唯一通道，2026-09-20 实测）：
 * `POST {searchApiOrigin}/api/com.liepin.im.c.contact.get-contact-list`。
 *
 * 为什么收件箱走**接口**而不是 DOM：抽屉（AntD drawer）里的会话行实测只有
 * **名字 / 公司 / 头衔 / 未读徽章 / 时间**（`.im-ui-contact-title-name` /
 * `.im-ui-contact-title-sub` / `.ant-im-badge-count`）——**没有最后一条消息的正文**，
 * 而合同要的 `lastMessage` 与方向判据（`unReadCnt` / `extType`）都只在接口里。
 */
export declare const LIEPIN_CONTACT_LIST_API_PATH = "/api/com.liepin.im.c.contact.get-contact-list";
/**
 * 搜索接口的**静态请求头** —— 2026-09-19 用"逐组削减"实测出的最小充分集。
 *
 * ## 为什么这份常量必须存在（真踩过）
 *
 * `readListPage` 是**双通道**（接口优先、失败静默回退 DOM），而接口这条一度是**死代码**：
 * 当初只带了 `content-type`，服务端一律回 `{"flag":0,"code":"-1400","msg":"出错了（400）！"}`
 * （HTTP 仍是 200），于是**每次都静默回退 DOM**，丢掉了接口独有的
 * `publishedAt`（`refreshTime`）/`industry`/`companySize`/`labels` —— 而且**没有任何信号**。
 *
 * ## 实测（`npm run probe:liepin-chat` 的变体实验，一次只动一个变量）
 *
 * | 请求头 | 结果 |
 * |---|---|
 * | 页面原样（对照组） | `flag=1`，42 条 |
 * | 页面头 + **适配器构造的 body** | `flag=1`，42 条 ⇒ **body 构造没问题**（`ckId` 留空无妨） |
 * | 只有 `content-type` | ❌ `-1400` |
 * | 本常量（六项静态）+ **遥测三项** | `flag=1`，42 条 |
 * | 本常量**不含**遥测三项 | ❌ `-1400` ⇒ **门就是 `x-fscp-*` 这一族的完整性** |
 * | 去掉 `x-xsrf-token` | `flag=1` ⇒ **xsrf 不需要**（所以不必去读任何 cookie） |
 * | 遥测三项改用**自造值**（随机 UUID / 当前页 URL / 空串） | `flag=1` ⇒ 可以自己造 |
 *
 * 结论：**这六项静态头 + 三个自造的 `x-fscp-*`**（见 `fetchListInPage`）就够，
 * 不需要 `x-xsrf-token`、也不需要从页面的请求里抄任何东西。
 *
 * ⚠️ `x-fscp-std-info` 的 `client_id: 40108` 与 DOM 里那串 `_40108cpKKS` 类名前缀**同号**
 * （互相印证这是前端应用号）；`x-fscp-version: 1.1` 与 `client_id` 都是**会随发版变的值**，
 * 所以放在 `LiepinConfig.apiHeaders` 里允许 DB 覆盖。
 */
export declare const LIEPIN_API_HEADERS: Record<string, string>;
/** 城市：夹具实测「Java工程师【佛山-顺德区】急聘15-30k·14薪」——【】里就是城市。 */
export declare const LIEPIN_CITY_PATTERN = "\u3010([^\u3011]{2,15})\u3011";
/** 经验/学历词表（夹具实测位于链接文本尾部，如「5年以上本科」）。 */
export declare const LIEPIN_EXP_PATTERN = "(\\d+\u5E74\u4EE5\u4E0A|\\d+\u5E74\u4EE5\u5185|1\u5E74\u4EE5\u4E0B|\u7ECF\u9A8C\u4E0D\u9650|\u5728\u6821\u751F|\u5E94\u5C4A\u751F)";
export declare const LIEPIN_EDU_PATTERN = "(\u672C\u79D1|\u7855\u58EB|\u535A\u58EB|\u5927\u4E13|\u5B66\u5386\u4E0D\u9650|\u4E2D\u4E13|\u9AD8\u4E2D|MBA|\u7EDF\u62DB\u672C\u79D1)";
/**
 * 单次抓取的页数上限。猎聘 antiBot=high，给得比 51job/智联更保守：
 * 默认 3 页、上限 8 页。
 */
export declare const LIEPIN_DEFAULT_MAX_PAGES = 3;
export declare const LIEPIN_MAX_PAGES = 8;
/**
 * ── 搜索筛选的取值域与 body 字段映射（2026-09-23 真机调研接入）─────────────────
 *
 * ## 证据链（三方交叉）
 *
 * 1. **字典接口**（第一方，最全）：页面自己会 POST
 *    `com.liepin.searchfront4c.pc-search-job-cond-init`（body `selectedDqCode=410`），
 *    返回 13 组值域（educations/compScales/financeStages/compNatures/jobKinds/pubTimes/
 *    workExperiences/yearSalaries/industries…）——探针原样摘录；
 * 2. **页面平铺选项**：搜索页筛选条的 `data-key/data-code/data-name` 三元组
 *    （workYearCode/salaryCode/pubTime/compTag 与字典逐条一致，互相印证）；
 * 3. **效果验证**（`pubTime=7` 作阳性对照）：在页面上下文重放搜索接口，
 *    8 个字段各挑一个代表值，返回的 jobId 集合与基线**全部明显不同** ——
 *    猎聘的筛选**全部生效**（这点比 BOSS 干脆：joblist 那边部分参数被忽略）。
 *
 * ## 为什么值域表敢用：它是**接口原样输出**（原始摘录见
 *   `test/fixtures/liepin-cond-init.json`），不是从 DOM 抄的文案。
 *
 * ## 不接的维度（如实记录）
 *   * `industry`（H01-H15 树形码 + 150+ 二级 children）—— 与 BOSS/智联的行业
 *     同一决定：树形码先不接；
 *   * `compTag`（qua_* 公司标签：500强/独角兽等 6 项）—— 页面有、字典有，
 *     价值边际低，暂不接；
 *   * `salaries`（月薪段 0$3-60$999）—— 与 `salaryCode`（年薪档）语义重复，
 *     页面「薪资」平铺用的是年薪档，跟页面走。
 */
export declare const LIEPIN_FILTER_OPTIONS: {
    /** body 字段 `workYearCode`（字典 `workExperiences`；`$` 是平台的区间分隔符）。 */
    experience: {
        value: string;
        label: string;
    }[];
    /** body 字段 `eduLevel`（字典 `educations`）。 */
    degree: {
        value: string;
        label: string;
    }[];
    /** body 字段 `salaryCode`（字典 `yearSalaries`——猎聘页面的「薪资」是**年薪档**）。 */
    salary: {
        value: string;
        label: string;
    }[];
    /** body 字段 `compScale`（字典 `compScales`）。 */
    scale: {
        value: string;
        label: string;
    }[];
    /** body 字段 `compStage`（字典 `financeStages`）。 */
    stage: {
        value: string;
        label: string;
    }[];
    /** body 字段 `compKind`（字典 `compNatures`）。 */
    companyType: {
        value: string;
        label: string;
    }[];
    /** body 字段 `pubTime`（字典 `pubTimes`；空串=不限，由"不选"表达，不进值域）。 */
    postedWithinDays: {
        value: string;
        label: string;
    }[];
    /** body 字段 `jobKind`（字典 `jobKinds`——猎聘特有：职位由谁发布）。 */
    recruiterType: {
        value: string;
        label: string;
    }[];
};
/**
 * 维度键 → 搜索接口 body 字段（`mainSearchPcConditionForm` 的槽位名，请求采样原样）。
 * 与 BOSS 的 `ZHIPIN_BODY_FIELDS` 同构：声明里 `wire: { target: 'body', param }` 用它。
 */
export declare const LIEPIN_BODY_FIELDS: Record<keyof typeof LIEPIN_FILTER_OPTIONS, string>;
export declare const DEFAULT_LIEPIN_CONFIG: LiepinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeLiepinConfig(override: unknown): LiepinConfig;
/**
 * 猎聘特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 *   * 验证码：多出 `.geetest_box` / `#nc_1_wrapper`（探针实测的极验容器），
 *     以及阿里云 WAF 的 `waf-nc-title` + `aliyunwaf_` 脚本名；
 *   * `blankOnAboutProtocol`：风控命中时 `security.min.js` 会
 *     `location.replace('about:blank')` **把页面销毁** —— 那不是文案也不是 DOM 特征，
 *     是结构性判据，所以只能是开关；
 *   * `skipLoginWall`：猎聘的登录墙文案**尚无实测证据**，原实现明确写着"不判"
 *     （宁可让 blank / 0 条暴露，也不猜）。这里把它变成**显式开关** ——
 *     不判也是一种决定，要写出来，而不是靠"通用词表里恰好没有它要的词"。
 */
export declare const LIEPIN_BLOCK_SIGNALS: {
    readonly captchaSelectors: readonly [".geetest_box", "#nc_1_wrapper", ".waf-nc-title", "script[name^=\"aliyunwaf_\"]"];
};
export declare const LIEPIN_BLOCK_FLAGS: {
    readonly blankOnAboutProtocol: true;
    readonly skipLoginWall: true;
};
//# sourceMappingURL=config.d.ts.map
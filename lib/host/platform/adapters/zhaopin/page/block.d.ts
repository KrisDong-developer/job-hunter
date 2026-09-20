/**
 * 智联**判墙**的页面上下文函数（`guard.detectBlock` 与动作链的断言共用一份实现）。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { BlockKind } from '../../../../../shared/contract/enums/crawl.js';
import type { BlockSignalSet } from '../../../block-signals.js';
/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 验证。
 *
 * 关键取舍：智联**加了筛选参数**时会返回 0 条 + 「登录之后再搜索」而不是报错，
 * 这是典型的**静默失败** —— 会被误读成"没有岗位"。所以这里必须把它识别成
 * `login-required`，让调用方知道是被墙了。
 *
 * 反过来，`/sou/` 的正常结果页**不会**出现登录闸门，所以"有卡片"就足以否定登录墙。
 */
export declare function detectBlockInPage(arg: {
    card: string;
    loginPopup: string;
    noJobTip: string;
    /**
     * **通用词表**（由 `signalsOf(...)` 在宿主侧组装后传进来）。
     *
     * 智联走的是"**共享词表、自有结构**"这条路：验证码选择器 / 限流 / 配额 / blank 阈值
     * 用共享的那一份，但**判断流程仍是它自己的** —— 因为下面那段载荷探针
     * （`__INITIAL_STATE__.positionList` 配平）与 `noJobTip` 的组合判据是它独有的，
     * 硬塞进 `detectBlockWithSignals` 只会让那个共享函数长出一堆平台分支。
     */
    signals: BlockSignalSet;
}): BlockKind | null;
//# sourceMappingURL=block.d.ts.map
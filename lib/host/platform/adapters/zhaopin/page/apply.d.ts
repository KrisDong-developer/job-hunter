/**
 * 智联**投递**（详情页「立即投递」入口与结果弹窗）的页面上下文函数。
 *
 * 页面函数只负责"看"（入口文案 / 元素中心坐标 / 成功弹窗是否可见），不负责比对文案 ——
 * 「立即投递」这个期望值在 `../config.ts` 的 `ZHAOPIN_APPLY_ENTRY_TEXT`，比对在宿主机侧。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
/**
 * 投递入口当前是哪句话（自包含）。
 *
 * 为什么只读文案就够：入口容器 `.summary-planes__action` 投递前后**都在**，
 * 变的只是里面那个按钮的文案（「立即投递」→「继续沟通」）—— 判"能不能投"必须靠文案。
 */
export declare function applyEntryStateInPage(arg: {
    selector: string;
}): {
    found: boolean;
    text: string;
};
/**
 * 定位一个**可见**元素的中心坐标（自包含）。只定位、不点击 ——
 * 点击由 host 侧的真鼠标完成（DOM `el.click()` 的 `isTrusted=false` 是最廉价的自动化特征）。
 */
export declare function elementCenterInPage(arg: {
    selector: string;
}): {
    found: boolean;
    x: number;
    y: number;
    text: string;
};
/**
 * 成功弹窗是否**可见且**写着预期那句话（自包含）。
 *
 * 两步都要：只看"元素在不在"会被模板里那个隐藏的弹窗骗到（`.deliver-greeting-modal`
 * 在没投递时也可能存在于 DOM 里），只看文案又会把别的提示当成投递成功。
 */
export declare function applySuccessInPage(arg: {
    selector: string;
    textIncludes: string;
}): {
    visible: boolean;
    text: string;
};
//# sourceMappingURL=apply.d.ts.map
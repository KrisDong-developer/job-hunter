/**
 * LinkedIn 的**判墙与登录检测页面上下文函数**。
 *
 * ⚠️ **自包含警告**：本文件的函数在真机上**脱离模块作用域**执行，不得引用模块级的常量
 * 或工具函数；只做**读**（Trusted Types 红线，见 `./list.ts` 文件头）。
 * 完整调研记录见 `../index.ts` 文件头。
 */
/**
 * **在页面上下文里**读地址级的墙信号（结构性判据，比文案可靠）。
 *
 *   * `/authwall`（或被 302 到登录页）→ `'authwall'` → 调用方判 `login-required`；
 *   * `/checkpoint`、`/captcha` → `'checkpoint'` → 调用方判 `captcha`。
 *
 * 为什么不放 `detectBlockWithSignals` 的 urlPatterns：那里的 URL 特征**一律判 captcha**，
 * 而 authwall 是登录墙 —— 语义错了会把用户引去「重试/等待」而不是「登录」。
 */
export function wallKindInPage() {
    let path = '';
    let href = '';
    try {
        path = location.pathname;
        href = location.href;
    }
    catch {
        return null;
    }
    if (path.startsWith('/authwall') || path.startsWith('/login') || path.startsWith('/uas/login')) {
        return 'authwall';
    }
    if (path.startsWith('/checkpoint') || path.startsWith('/captcha'))
        return 'checkpoint';
    // href 兜底：某些风控处置不换 pathname（历史路由 / hash 路由）。
    if (href.includes('/authwall'))
        return 'authwall';
    if (href.includes('/checkpoint/challenge'))
        return 'checkpoint';
    return null;
}
/**
 * **在页面上下文里**判登录态：页头 global-nav 的「我」区（头像）在不在。
 *
 * 判据由 2026-09-20 `probe:linkedin-login` 的两侧对比定案（选择器由宿主机传入，
 * 见 `LinkedInConfig.loggedInSelector`）：`.global-nav__me-photo` / `.global-nav__me`
 * 已登录侧各 1 命中、未登录侧 0。⚠️ 判据按**正常页面**校准 —— 登录页上没有
 * global-nav，在那儿判会恒「未登录」，所以 `auth.checkUrl` 用搜索页。
 */
export function isLoggedInInPage(arg) {
    try {
        return document.querySelector(arg.selector) !== null;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=guard.js.map
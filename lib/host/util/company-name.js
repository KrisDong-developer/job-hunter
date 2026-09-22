/**
 * 公司名归一化（§4.10.1 的**第 1 级**：归一化）。
 *
 * 只做「去地域前缀 + 去公司后缀 + 全半角/大小写/空白统一」，产出用于建索引与精确比对的键。
 * 第 2~5 级（别名表 / 包含关系 / 编辑距离 / 不确定不合并）属于去重漏斗，在 P4 与
 * `dedup_group` 一起实现 —— **这里刻意不做任何模糊合并**（铁律 1：不确定宁可不合并）。
 */
/** 常见地域前缀。匹配时长的优先，且允许省略「市 / 省 / 自治区」。 */
const REGION_PREFIXES = [
    '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门',
    '北京', '上海', '天津', '重庆', '广州', '深圳', '杭州', '南京', '成都', '武汉', '西安', '苏州',
    '长沙', '郑州', '青岛', '宁波', '东莞', '佛山', '合肥', '福州', '厦门', '济南', '大连', '沈阳',
    '哈尔滨', '昆明', '贵阳', '南昌', '无锡', '常州', '珠海', '中山', '惠州', '泉州', '石家庄', '太原',
    '南宁', '兰州', '乌鲁木齐', '呼和浩特', '银川', '西宁', '拉萨', '海口', '三亚', '温州', '嘉兴',
    '南通', '徐州', '烟台', '潍坊', '保定', '洛阳', '绍兴', '台州', '金华', '汕头', '江门', '湛江',
];
/** 公司后缀。**长的排前面**，否则「有限公司」会先把「股份有限公司」切坏。 */
export const COMPANY_SUFFIXES = [
    '股份有限公司', '有限责任公司', '集团有限公司', '控股集团有限公司', '科技股份有限公司',
    // 分支机构后缀要排在「公司」前面，否则「XX深圳分公司」会被切成「XX深圳分」
    '分公司', '支公司', '办事处', '营业部', '分部', '分店',
    '有限公司', '集团有限公司', '公司', '集团', '控股', '股份',
    '信息技术', '网络科技', '网络技术', '信息科技', '电子科技', '智能科技', '数据科技',
    '科技', '技术', '实业', '投资', '企业管理', '电子商务', '文化传播', '传媒',
    '研究院', '研究所', '事务所', '工作室', '中心', '商行', '经营部', '服务部',
];
/**
 * **只剥法人/机构形态**的后缀表 —— 岗位跨平台合并用的硬键走这一份。
 *
 * 为什么必须与上面那张表分开（这是一条真踩过的坑）：
 * 上面那张为了"跨平台能把同一家公司配上"，把「科技 / 技术 / 网络科技 / 中心 / 服务部」
 * 这类**行业词**也剥了。于是「XX网络科技有限公司」与「XX网络技术有限公司」会归一到同一个
 * 「XX网络」—— 公司硬键相等，再撞上同名岗位（「Java开发」这种通用标题遍地都是）、
 * 同城、同薪资档，**两个真岗位就被自动合并了**。而合并的代价项目自己写着：
 * 投递记录会串，而且用户很难发现。
 *
 * 所以分层：硬键只剥**确定不属于公司名的部分**（法人形态与分支机构），
 * 行业词的差异降级成"疑似"（`compareJobs` 里的 `candidate`）—— 不自动合并，
 * 但会报出来让人看一眼。取向与铁律 1 一致：宁可漏，不可错。
 */
export const LEGAL_SUFFIXES = [
    '股份有限公司', '有限责任公司', '集团有限公司', '控股集团有限公司',
    '分公司', '支公司', '办事处', '营业部', '分部', '分店',
    '有限公司', '公司', '集团', '控股', '股份',
];
/** 全角 → 半角。 */
function toHalfWidth(input) {
    let out = '';
    for (const char of input) {
        const code = char.codePointAt(0) ?? 0;
        if (code === 0x3000)
            out += ' ';
        else if (code >= 0xff01 && code <= 0xff5e)
            out += String.fromCodePoint(code - 0xfee0);
        else
            out += char;
    }
    return out;
}
/**
 * 去掉紧跟地域名后面的「市 / 省 / 自治区 / 特别行政区」。
 * 注意是**删掉**这个字，不是保留 —— 早先写成 `replace(/^(.*?)(市|省)/, '$1$2')`
 * 等于原地不动，结果「深圳市明泰海科」永远去不掉「市」。
 */
function stripRegionSuffix(value) {
    return value.replace(/^(市|省|自治区|特别行政区)/, '');
}
/**
 * 归一化公司名（**宽松**：地域 + 法人后缀 + 行业词都剥）。
 * @param raw 原始公司名，如 `北京字节跳动科技有限公司`
 * @returns 归一化键，如 `字节跳动`；输入不可用时返回空串
 */
export function normalizeCompanyName(raw) {
    return stripCompanyName(raw, COMPANY_SUFFIXES);
}
/**
 * 归一化公司名（**严格**：只剥地域 + 法人/机构后缀，行业词**保留**）。
 *
 * 用于岗位跨平台合并的**硬键**：它相等才允许自动合并。行业词不同的情况
 * （「XX网络科技」vs「XX网络技术」）会落到宽松键相等、严格键不等 →
 * 由 `compareJobs` 判成"疑似"，而不是合并。理由见 `LEGAL_SUFFIXES` 上面的说明。
 *
 * @param raw 原始公司名，如 `北京字节跳动科技有限公司`
 * @returns 严格键，如 `字节跳动科技`
 */
export function strictCompanyName(raw) {
    return stripCompanyName(raw, LEGAL_SUFFIXES);
}
/**
 * 归一化的共同实现：反复剥离头部地域 / 尾部地域 / 尾部后缀，直到不再变化。
 *
 * 后缀表由调用方给：宽松键带行业词、严格键不带。**只有表不同，算法必须只有一份** ——
 * 两份实现迟早会漂移，而漂移的表现是"同一个公司名在两条路径上归一出两个键"。
 */
function stripCompanyName(raw, suffixes) {
    if (typeof raw !== 'string')
        return '';
    // 括号内容一般是地域/分支标注（「腾讯（深圳）科技有限公司」），先整块摘掉再归一化。
    // 这正是第 1 级「去地域前缀」要的效果，且比只删括号字符可靠得多。
    const cleaned = toHalfWidth(raw)
        .replace(/[（(][^（()）]*[)）]/g, '')
        .replace(/\s+/g, '')
        .replace(/[()（）【】[\]]/g, '')
        .toLowerCase();
    if (cleaned === '')
        return '';
    let value = cleaned;
    /*
     * 反复剥离，直到不再变化。**每一轮同时考虑三种切口**：
     *   ① 头部地域（北京字节跳动…）
     *   ② 尾部地域（…有限公司深圳分公司 —— 分公司形态的地域夹在中间）
     *   ③ 尾部公司/分支机构后缀
     *
     * 早先只做 ① 和 ③、而且分成两段循环：结果「华为技术有限公司」被剥成「华为」，
     * 而「华为技术有限公司深圳分公司」因为「分公司」不在后缀表里只剥到「…深圳分」，
     * 两边永远对不上 —— 同一个集团的不同分支会被当成两家公司。
     */
    let changed = true;
    let guard = 0;
    while (changed && guard < 8) {
        changed = false;
        guard += 1;
        const head = REGION_PREFIXES.find((region) => value.startsWith(region) && value.length - region.length >= 2);
        if (head !== undefined) {
            value = stripRegionSuffix(value.slice(head.length));
            changed = true;
            continue;
        }
        const tail = REGION_PREFIXES.find((region) => value.endsWith(region) && value.length - region.length >= 2);
        if (tail !== undefined) {
            value = value.slice(0, value.length - tail.length);
            changed = true;
            continue;
        }
        const suffix = suffixes.find((candidate) => value.endsWith(candidate) && value.length - candidate.length >= 2);
        if (suffix !== undefined) {
            value = value.slice(0, value.length - suffix.length);
            changed = true;
        }
    }
    // 兜底：全被切掉说明这套规则对该公司名不适用，退回未切的形态
    return value === '' ? cleaned : value;
}
/**
 * 同一条公司名的两个形态是否指向同一实体 —— **只做精确比对**。
 * 模糊合并留给 P4 的去重漏斗，并必须记录依据（`dedup_group.basis`）。
 */
export function sameCompany(a, b) {
    const left = normalizeCompanyName(a);
    const right = normalizeCompanyName(b);
    return left !== '' && left === right;
}
//# sourceMappingURL=company-name.js.map
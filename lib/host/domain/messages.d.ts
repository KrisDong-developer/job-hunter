/**
 * 消息中心（§4.3 里归 `outreach`，P7 独立成服务；§13 U6）。
 *
 * **为什么从 outreach 里拆出来**：§4.3 的服务表写的是"关键方法（示意）"，
 * 而消息中心自己有完整的一套语义（会话分组、未读、回复、邀约识别、与接触态联动），
 * 塞进话术生成里会让两边都变模糊。拆开之后职责很干净：
 *   * `outreach`  = 我**生成**什么
 *   * `messages`  = 双方**往来了**什么
 *
 * ## 一条硬规则：识别 != 改状态
 *
 * §13 U6 要求"识别面试邀约"。但**识别出来只作为建议**：
 * 规则识别一定会误判（"感谢您的关注"和"邀请您面试"长得可以很像），
 * 而状态一旦被误改，用户就会漏掉一个真正在推进的岗位。
 * 所以这里只产出 `inviteSignal`，改状态是另一次显式动作（并且会写 `stage_event`）。
 */
import type { InterviewKind, MessageDirection, ReplyScenario } from '../../shared/enums.js';
import type { InboxDto, InterviewSuggestionDto, MessageDto, ReplyDraftDto } from '../../shared/dto.js';
import type { AiService } from '../ai/client.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
/**
 * 面试邀约的规则词表。
 *
 * 刻意**保守**：宁可漏判（用户自己看得见消息）也不要误判成"要面试了"。
 * 所以只收"几乎只可能出现在邀约里"的词，不收"沟通""聊聊"这类中性词。
 */
export declare const INVITE_KEYWORDS: readonly ["面试", "面谈", "笔试", "复试", "初试", "一面", "二面", "终面", "视频面试", "电话沟通", "约个时间", "预约时间", "方便的时间", "入职时间", "薪资期望", "offer", "录用", "简历通过", "安排面试"];
/** 只在 HR 发来的消息里找信号 —— 我自己说的"期待面试"不算邀约。 */
export declare function detectInvite(content: string, direction: MessageDirection): {
    hit: boolean;
    keywords: string[];
};
/** 抽出来的结构化结果。识别不到就给 null，绝不填假值。 */
export interface NormalizedExtract {
    at: string | null;
    kind: InterviewKind | null;
    place: string | null;
    link: string | null;
}
/**
 * 规则降级识别：**保守**，只为常见写法定中轴 ——
 * 中文日期/时间/关键字 + URL + 地点关键词。宁可漏，不给假。
 * 导出供测试直接断言（同 `detectInvite`）。
 */
export declare function ruleExtract(content: string): NormalizedExtract;
export interface MessageService {
    record(input: {
        platformId: string;
        direction: MessageDirection;
        content: string;
        jobId?: number | null;
        conversationId?: string;
        attachmentRef?: string | null;
        at?: string;
    }): MessageDto;
    /**
     * **幂等**记录：同「平台 + 会话 + 方向 + 正文」已存在时返回既有那条（`created: false`）。
     *
     * 给收件箱同步用：平台会话列表只给"每个会话的最后一条消息"，反复同步必然重复 ——
     * `message` 表没有唯一索引，去重只能在这一层做。
     */
    recordOnce(input: {
        platformId: string;
        direction: MessageDirection;
        content: string;
        jobId?: number | null;
        conversationId?: string;
        attachmentRef?: string | null;
        at?: string;
    }): {
        message: MessageDto;
        created: boolean;
    };
    inbox(filter?: {
        jobId?: number;
        unreadOnly?: boolean;
        limit?: number;
    }): InboxDto;
    /**
     * 回复一条消息。**高危**：这是真正对外发消息。
     * 走闸门（模型发起必然审批），并且回复内容会进审批文案的正文。
     */
    reply(input: {
        messageId: number;
        content: string;
        actor: string;
        guiConfirmed?: boolean;
    }): Promise<MessageDto>;
    /** 识别面试邀约信号（规则）。 */
    markRead(id: number): boolean;
    unreadCount(): number;
    /**
     * 从消息里抽出面试时间/地点/形式（「一键进日程」的前置判断）。
     * **只识别不写库**：模型可用走模型，否则规则降级；结果要用户确认后才创建面试。
     */
    extractInterview(id: number): Promise<InterviewSuggestionDto>;
    /**
     * 按情境拟一段回复草稿。**只生成、不发送**：发送走 `reply`（闸门 + 两段式确认）。
     */
    draftReply(input: {
        messageId: number;
        scenario: ReplyScenario;
    }): Promise<ReplyDraftDto>;
}
export interface MessageDeps {
    store: Store;
    clock?: Clock;
    /** 识别面试安排的模型能力；缺省时退化为纯规则识别。 */
    ai?: AiService;
    guardRun?: <T>(input: {
        action: string;
        actor: string;
        danger: 'low' | 'mid' | 'high';
        target?: {
            jobId?: number;
            platformId?: string;
            companyId?: number;
        };
        payload?: Record<string, unknown>;
        guiConfirmed?: boolean;
    }, fn: () => Promise<T>) => Promise<T>;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export declare function createMessageService(deps: MessageDeps): MessageService;
//# sourceMappingURL=messages.d.ts.map
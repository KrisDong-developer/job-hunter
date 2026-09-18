export interface RevealResult {
    /** 实际尝试打开的目录（界面如实回显它）。 */
    dir: string;
    /** 是否认为打开了。 */
    ok: boolean;
    /** 失败原因（成功时为 null）。 */
    reason: string | null;
}
/**
 * 打开数据文件所在目录。
 *
 * ## 为什么现在会等结果（上一版刻意不等）
 *
 * 上一版不看子进程结果、直接返回成功，界面于是无条件提示"已打开" ——
 * 在没有文件管理器的环境（headless / 精简容器）里，那是**对着用户撒谎**，
 * 而本项目明确拒绝这种静默失败（见 `index.tsx` 对"静默消失"的处理）。
 *
 * ## 只看 ENOENT，不看退出码
 *
 * Windows 的 explorer.exe 即便成功也常常返回退出码 1 —— 拿退出码判成败会把
 * "正常打开了"报成失败。真正可判的失败只有一种：**命令本身不存在**（ENOENT），
 * 例如 Linux 容器里没有 xdg-open。所以只有它会变成 `ok: false`。
 */
export declare function revealDataFile(dataPath: string): Promise<RevealResult>;
//# sourceMappingURL=reveal.d.ts.map
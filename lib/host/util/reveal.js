/**
 * 在系统文件管理器里定位一个目录。
 *
 * 为什么必须在宿主半：浏览器里**没有**任何 API 能打开本机的文件夹。
 * 这是「设置 → 诊断与调用日志 → 数据文件」那一行「打开所在文件夹」按钮的实现。
 *
 * 安全边界（与 §22.4 同一种思路）：入口只接受**数据文件路径**，
 * 由本模块自己取它的父目录 —— 界面无法让宿主去打开任意目录，
 * 这个能力不是"打开任意路径"的通用原语。路由那层还要过同源校验（POST）。
 */
import { execFile } from 'node:child_process';
import { dirname } from 'node:path';
/** 各平台"打开一个目录"的官方做法。 */
function commandFor(dir) {
    if (process.platform === 'win32')
        return { file: 'explorer.exe', args: [dir] };
    if (process.platform === 'darwin')
        return { file: 'open', args: [dir] };
    return { file: 'xdg-open', args: [dir] };
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
export async function revealDataFile(dataPath) {
    const dir = dirname(dataPath);
    const { file, args } = commandFor(dir);
    return await new Promise((resolve) => {
        // `timeout`：某些平台的 xdg-open 会一直挂着直到文件管理器退出，
        // 那会把这一条 HTTP 请求拖住。到点杀掉子进程，回调给出的错误不是 ENOENT，
        // 于是按"已经交出去了"处理 —— 界面不该为一件我们已经做完的事干等。
        execFile(file, args, { timeout: 3000 }, (error) => {
            const code = error?.code;
            if (code === 'ENOENT') {
                resolve({ dir, ok: false, reason: `系统里找不到「${file}」，无法打开文件夹` });
                return;
            }
            resolve({ dir, ok: true, reason: null });
        });
    });
}
//# sourceMappingURL=reveal.js.map
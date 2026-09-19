/**
 * 最小 ZIP 容器（**零依赖**，只用 `node:zlib`）。
 *
 * ## 为什么自己写
 *
 * 需要的只是"若干小文件的 deflate 打包"，标准库就够。为这点事往一个要打进
 * 宿主进程的插件里塞一个 zip 库不划算 —— 这条理由与 `render/docx.ts` 当初
 * 手写 OOXML 容器时是同一个（那处注释还在）。
 *
 * ## 两个调用方
 *
 *   * `render/docx.ts` —— 简历 → .docx（OOXML 就是一个 zip）；
 *   * `domain/portability.ts` —— 数据导出归档（csv/*.csv + files/* 附件）。
 *
 * 抽出来的直接原因就是第二个调用方：两份 `buildZip` 迟早会漂移，
 * 而"其中一个写错了中央目录"的表现是**某些解压软件能开、Word/Excel 打不开**，
 * 这种不一致极难归因。
 *
 * ## 硬约束
 *
 *   * 通用标志位 11（UTF-8 文件名）**必须置位**：我们的文件名与内容是中文；
 *   * 外部属性字段必须是 **4 字节**：写成 2 字节会让整条中央目录记录短 6 字节，
 *     其后所有字段（尤其是本地头偏移量）全部错位，解压端直接判"文件损坏"；
 *   * 时间戳**写死**（见 `DOS_DATE`）：同一份输入必须产出同一串字节，
 *     否则"同样的内容导两次"会得到不同文件，破坏去重与测试的可重复性。
 */
import { deflateRawSync } from 'node:zlib'

/**
 * CRC-32（IEEE 802.3）查表实现。
 *
 * ZIP 的每个中央目录项都要存**未压缩数据**的 CRC —— 这不是可选项，
 * 解压端据此判断文件有没有损坏。表只建一次，模块级缓存。
 */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * 固定的 DOS 时间戳（2026-01-01 00:00:00）。
 *
 * 用当前时间会让"同一份内容打包两次"得到不同字节，破坏去重与测试的可重复性。
 */
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value & 0xffff, 0)
  return buffer
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0, 0)
  return buffer
}

export interface ZipEntry {
  name: string
  data: Buffer
}

/**
 * 打一个 ZIP（只支持 deflate，够用）。
 *
 * 结构严格按 PKWARE APPNOTE：local file header → 压缩数据 → 中央目录 → EOCD。
 *
 * 刻意**不写目录项**（`word/`、`csv/` 这类）：中央目录里没有它们，解压端也会按名字建目录，
 * 少几个条目就少几处可以写错的地方。
 */
export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const compressed = deflateRawSync(entry.data, { level: 9 })
    const checksum = crc32(entry.data)

    const local = Buffer.concat([
      u32(0x04034b50), // local file header
      u16(20), // 解压所需版本：2.0 = deflate
      u16(0x0800), // 通用标志：bit 11 = 文件名为 UTF-8
      u16(8), // 压缩方法 8 = deflate
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(checksum),
      u32(compressed.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0), // 无 extra field：长度写 0 就必须真的没有
      nameBytes,
    ])
    locals.push(local, compressed)

    centrals.push(
      Buffer.concat([
        u32(0x02014b50), // central directory header
        u16(20), // 生成方版本
        u16(20), // 解压所需版本
        u16(0x0800), // 通用标志：与本地头保持一致
        u16(8), // 压缩方法
        u16(DOS_TIME),
        u16(DOS_DATE),
        u32(checksum),
        u32(compressed.length),
        u32(entry.data.length),
        u16(nameBytes.length),
        u16(0), // extra field 长度
        u16(0), // comment 长度
        u16(0), // 起始磁盘号
        u16(0), // 内部属性
        u32(0), // 外部属性必须是 **4 字节**：写成 u16 会让整条记录短 6 字节，
        // 后面所有字段（尤其是本地头偏移量）全部错位，解压端直接报文件损坏。
        u32(offset),
        nameBytes,
      ]),
    )

    offset += local.length + compressed.length
  }

  const central = Buffer.concat(centrals)
  const end = Buffer.concat([
    u32(0x06054b50), // end of central directory
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0), // 无注释
  ])

  return Buffer.concat([...locals, central, end])
}

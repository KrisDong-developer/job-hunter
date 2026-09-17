/**
 * 简历 → **真正的 .docx**（§17 R2）。
 *
 * 为什么不是"改名成 .docx 的 HTML"：
 *   HR 的 ATS 会解析附件正文，Word 也会按 OOXML 渲染。把 HTML 换个后缀，
 *   在别人的 Word 里就是一坨纯文本或者直接打不开 —— 对求职者来说这是**静默失败**，
 *   比导出报错糟得多。
 *
 * 为什么自己写 ZIP 而不引依赖：
 *   容器需要的只是"若干小文件的 deflate 打包"，标准库就够（`node:zlib`）。
 *   为这点事往一个要打进宿主进程的插件里塞一个 zip 库，不划算。
 *
 * 本文件**只依赖 `node:zlib`**：没有 IO、没有外部进程、没有 npm 依赖，
 * 同一份输入永远产出同一串字节（时间戳写死，便于测试与去重）。
 */
import { deflateRawSync } from 'node:zlib';
// ─────────────────────────────────────────────────────────────────────
// ZIP 容器
// ─────────────────────────────────────────────────────────────────────
/**
 * CRC-32（IEEE 802.3）查表实现。
 *
 * ZIP 的每个中央目录项都要存**未压缩数据**的 CRC —— 这不是可选项，
 * 解压端（Word / ATS）据此判断文件有没有损坏。表只建一次，模块级缓存。
 */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
})();
function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
        const byte = bytes[index] ?? 0;
        crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
/**
 * 固定的 DOS 时间戳（2026-01-01 00:00:00）。
 *
 * 用当前时间会让"同一份简历导两次"得到不同字节，破坏去重与测试的可重复性；
 * 而导出时间对 HR 没有任何意义（真要有意义，也是文件名里的日期）。
 */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
function u16(value) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value & 0xffff, 0);
    return buffer;
}
function u32(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value >>> 0, 0);
    return buffer;
}
/**
 * 手写 ZIP（store 之外只支持 deflate）。
 *
 * 结构严格按 PKWARE APPNOTE：local file header → 压缩数据 → 中央目录 → EOCD。
 * 位 11（UTF-8 名）必须置位：我们的 XML 内容与文件名都可能是中文。
 *
 * 刻意**不写目录项**（`word/` 这类）：中央目录里没有它们，解压端也会按名字建目录，
 * 少几个条目就少几处可以写错的地方。
 */
function buildZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const entry of entries) {
        const nameBytes = Buffer.from(entry.name, 'utf8');
        const compressed = deflateRawSync(entry.data, { level: 9 });
        const checksum = crc32(entry.data);
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
        ]);
        locals.push(local, compressed);
        centrals.push(Buffer.concat([
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
        ]));
        offset += local.length + compressed.length;
    }
    const central = Buffer.concat(centrals);
    const end = Buffer.concat([
        u32(0x06054b50), // end of central directory
        u16(0),
        u16(0),
        u16(entries.length),
        u16(entries.length),
        u32(central.length),
        u32(offset),
        u16(0), // 无注释
    ]);
    return Buffer.concat([...locals, central, end]);
}
// ─────────────────────────────────────────────────────────────────────
// 文本与样式
// ─────────────────────────────────────────────────────────────────────
/**
 * XML 转义（含属性用不到的控制字符剔除）。
 *
 * `w:t` 里出现裸 `&` 或 `<` 会让 Word 判定文档损坏并弹"文件已损坏"，
 * 而那份文件对用户来说就是"导出失败但没有任何提示"。
 */
function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        // 控制字符在 XML 1.0 里非法（除 \t \n \r），保留它们同样会让 Word 拒收。
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}
function paletteOf(template) {
    return template === 'professional' ? { accent: '1F4E79' } : { accent: '000000' };
}
/** 一个 `<w:r>`：可选直接格式 + `xml:space="preserve"`（不必猜哪些文本首尾有空格）。 */
function run(text, props = '') {
    const properties = props === '' ? '' : `<w:rPr>${props}</w:rPr>`;
    return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}
/** 一个 `<w:p>`：所有段落都从这里出去，保证 pPr 顺序合法。 */
function paragraph(text, options = {}) {
    const parts = [];
    if (options.style !== undefined)
        parts.push(`<w:pStyle w:val="${options.style}"/>`);
    if (options.border === true) {
        parts.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="BFBFBF"/></w:pBdr>');
    }
    if (options.indent !== undefined) {
        parts.push(`<w:ind w:left="${String(options.indent)}" w:hanging="210"/>`);
    }
    if (options.align !== undefined)
        parts.push(`<w:jc w:val="${options.align}"/>`);
    if (options.after !== undefined)
        parts.push(`<w:spacing w:after="${String(options.after)}"/>`);
    const properties = parts.length === 0 ? '' : `<w:pPr>${parts.join('')}</w:pPr>`;
    const runProps = [];
    if (options.bold === true)
        runProps.push('<w:b/>');
    if (options.color !== undefined)
        runProps.push(`<w:color w:val="${options.color}"/>`);
    if (options.halfPoints !== undefined)
        runProps.push(`<w:sz w:val="${String(options.halfPoints)}"/>`);
    return `<w:p>${properties}${text === '' ? '' : run(text, runProps.join(''))}</w:p>`;
}
// ─────────────────────────────────────────────────────────────────────
// 内容映射（与 HTML 渲染器保持**同一套**段落顺序与判空规则）
// ─────────────────────────────────────────────────────────────────────
/** 只给一端时补「至今」；两端都没有就整段省略。 */
function formatRange(start, end) {
    const from = start?.trim() ?? '';
    const to = end?.trim() ?? '';
    if (from !== '' && to !== '')
        return `${from} – ${to}`;
    if (from !== '')
        return `${from} – 至今`;
    if (to !== '')
        return to;
    return '';
}
function has(value) {
    return value !== undefined && value.trim() !== '';
}
function basicsParagraphs(basics, palette) {
    const out = [];
    if (has(basics.name))
        out.push(paragraph(basics.name, { style: 'Title' }));
    if (has(basics.title)) {
        out.push(paragraph(basics.title, { align: 'center', bold: true, halfPoints: 22, color: palette.accent }));
    }
    const contacts = [];
    if (has(basics.phone))
        contacts.push(basics.phone);
    if (has(basics.email))
        contacts.push(basics.email);
    if (has(basics.city))
        contacts.push(basics.city);
    for (const link of basics.links ?? []) {
        const label = has(link.label) ? link.label : link.url;
        if (has(label))
            contacts.push(label);
    }
    if (contacts.length > 0)
        out.push(paragraph(contacts.join(' · '), { align: 'center', halfPoints: 19 }));
    // docx 与 HTML 的可选字段策略必须一致：默认不写年龄/年限，避免误投。
    const meta = [];
    if (typeof basics.years === 'number')
        meta.push(`工作经验：${String(basics.years)} 年`);
    if (typeof basics.age === 'number')
        meta.push(`年龄：${String(basics.age)} 岁`);
    if (meta.length > 0)
        out.push(paragraph(meta.join(' · '), { align: 'center', halfPoints: 19 }));
    return out;
}
function experienceParagraphs(experience) {
    const heading = [experience.company, has(experience.title) ? experience.title : '']
        .filter((part) => part !== '')
        .join(' · ');
    const tail = [formatRange(experience.start, experience.end), has(experience.city) ? experience.city : '']
        .filter((part) => part !== '')
        .join(' | ');
    const out = [];
    if (heading !== '' || tail !== '') {
        out.push(paragraph([heading, tail].filter((part) => part !== '').join('　　'), { style: 'Heading2' }));
    }
    for (const highlight of experience.highlights) {
        out.push(paragraph(`• ${highlight}`, { indent: 210, after: 20 }));
    }
    if ((experience.stack ?? []).length > 0) {
        out.push(paragraph(`技术栈：${(experience.stack ?? []).join(' / ')}`, { halfPoints: 19, color: '595959' }));
    }
    return out;
}
function projectParagraphs(project) {
    const headingBits = [project.name];
    if (has(project.role))
        headingBits.push(project.role);
    const heading = headingBits.join(' · ');
    const out = [];
    out.push(paragraph([heading, has(project.period) ? project.period : ''].filter((part) => part !== '').join('　　'), {
        style: 'Heading2',
    }));
    for (const highlight of project.highlights) {
        out.push(paragraph(`• ${highlight}`, { indent: 210, after: 20 }));
    }
    if ((project.stack ?? []).length > 0) {
        out.push(paragraph(`技术栈：${(project.stack ?? []).join(' / ')}`, { halfPoints: 19, color: '595959' }));
    }
    return out;
}
function educationParagraphs(education) {
    const parts = [education.school];
    if (has(education.major))
        parts.push(education.major);
    if (has(education.degree))
        parts.push(education.degree);
    const range = formatRange(education.start, education.end);
    return [
        paragraph([parts.join(' · '), range].filter((part) => part !== '').join('　　'), { bold: true, after: 20 }),
    ];
}
/**
 * `word/document.xml` 正文段落。
 *
 * 段落顺序与判空规则**刻意与 HTML 渲染器一致**（简介 → 技能 → 工作 → 项目 → 教育 → 其他，
 * 空的整段不输出）。两处各写一份映射是权衡后的选择：抽公共模块会让两个渲染器
 * 互相绑死，而它们的差异（配色、分页、缩进）恰恰都长在映射函数里。
 */
function documentParagraphs(content, template) {
    const palette = paletteOf(template);
    const out = [];
    out.push(...basicsParagraphs(content.basics, palette));
    if (has(content.summary)) {
        out.push(paragraph('个人简介', { style: 'Heading1', border: true }));
        out.push(paragraph(content.summary, { after: 60 }));
    }
    if (content.skills.length > 0) {
        out.push(paragraph('技能', { style: 'Heading1', border: true }));
        for (const skill of content.skills) {
            const notes = [];
            if (has(skill.level))
                notes.push(skill.level);
            if (typeof skill.years === 'number')
                notes.push(`${String(skill.years)} 年`);
            if (has(skill.evidence))
                notes.push(skill.evidence);
            out.push(paragraph(notes.length === 0 ? skill.name : `${skill.name}（${notes.join(' · ')}）`, { after: 20 }));
        }
    }
    if (content.experiences.length > 0) {
        out.push(paragraph('工作经历', { style: 'Heading1', border: true }));
        for (const experience of content.experiences)
            out.push(...experienceParagraphs(experience));
    }
    if (content.projects.length > 0) {
        out.push(paragraph('项目经历', { style: 'Heading1', border: true }));
        for (const project of content.projects)
            out.push(...projectParagraphs(project));
    }
    if (content.education.length > 0) {
        out.push(paragraph('教育', { style: 'Heading1', border: true }));
        for (const education of content.education)
            out.push(...educationParagraphs(education));
    }
    const extras = content.extras.filter((extra) => has(extra.label) && has(extra.text));
    if (extras.length > 0) {
        out.push(paragraph('其他', { style: 'Heading1', border: true }));
        for (const extra of extras)
            out.push(paragraph(`${extra.label}：${extra.text}`, { after: 20 }));
    }
    return out;
}
// ─────────────────────────────────────────────────────────────────────
// OOXML 部件
// ─────────────────────────────────────────────────────────────────────
/**
 * 六个部件的最小集合。
 *
 * 只列**真的存在**的部件：`[Content_Types].xml` 里声明了一个不存在的 part，
 * Word 会直接报"内容有问题"并拒绝打开，比缺 part 更难排查。
 */
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
/**
 * 样式表。
 *
 * 字体必须在 `docDefaults` 里显式给 eastAsia：只设 `ascii` 的话，
 * Word 会把中文丢给主题字体，在不同机器上排版完全不一样（R1）。
 * 字号用半点（21 = 10.5pt）。
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="30"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;
/** 文档属性（可选部件）：能让 HR 在文件列表/属性面板里直接看到是谁的简历。 */
function coreProps(content) {
    const name = escapeXml(has(content.basics.name) ? content.basics.name : '未填写姓名');
    const title = escapeXml(has(content.basics.title) ? content.basics.title : '简历');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${title}</dc:title><dc:creator>${name}</dc:creator><cp:lastModifiedBy>${name}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>`;
}
const APP_PROPS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>DSH Job Hunter</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>`;
function documentXml(content, template) {
    const paragraphs = documentParagraphs(content, template).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="794" w:right="794" w:bottom="794" w:left="794" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}
// ─────────────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────────────
/** 把结构化简历渲染成**真正的 .docx**（OOXML + 自建 ZIP 容器）。 */
export function renderResumeDocx(content, options = {}) {
    const template = options.template ?? 'concise';
    // 顺序固定，便于测试断言"条目集合恰好是这些"。
    const entries = [
        { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
        { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
        { name: 'docProps/app.xml', data: Buffer.from(APP_PROPS, 'utf8') },
        { name: 'docProps/core.xml', data: Buffer.from(coreProps(content), 'utf8') },
        { name: 'word/document.xml', data: Buffer.from(documentXml(content, template), 'utf8') },
        { name: 'word/styles.xml', data: Buffer.from(STYLES, 'utf8') },
        { name: 'word/_rels/document.xml.rels', data: Buffer.from(DOCUMENT_RELS, 'utf8') },
    ];
    return buildZip(entries);
}
//# sourceMappingURL=docx.js.map
import { buildZip } from './zip.js';
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
    return template === 'professional'
        ? { accent: '1F4E79', rule: '1F4E79', muted: '6B7280', subtle: '4B5563' }
        : { accent: '111827', rule: '111827', muted: '6B7280', subtle: '4B5563' };
}
/** 一个 `<w:r>`：可选直接格式 + `xml:space="preserve"`（不必猜哪些文本首尾有空格）。 */
function run(text, props = '') {
    const properties = props === '' ? '' : `<w:rPr>${props}</w:rPr>`;
    return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}
/** 整段跑同一套格式时的糖衣（绝大多数段落都是这种）。 */
function paragraph(text, options = {}) {
    return richParagraph([{ ...options, text }], options);
}
/** 一个 `<w:p>`：所有段落都从这里出去，保证 pPr 顺序合法。 */
function richParagraph(runs, options = {}) {
    const parts = [];
    if (options.style !== undefined)
        parts.push(`<w:pStyle w:val="${options.style}"/>`);
    if (options.border === true) {
        parts.push(`<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${options.borderColor ?? '111827'}"/></w:pBdr>`);
    }
    if (options.indent !== undefined) {
        parts.push(`<w:ind w:left="${String(options.indent)}" w:hanging="210"/>`);
    }
    if (options.rightTabAt !== undefined) {
        parts.push(`<w:tabs><w:tab w:val="right" w:pos="${String(options.rightTabAt)}"/></w:tabs>`);
    }
    if (options.align !== undefined)
        parts.push(`<w:jc w:val="${options.align}"/>`);
    if (options.after !== undefined)
        parts.push(`<w:spacing w:after="${String(options.after)}"/>`);
    const properties = parts.length === 0 ? '' : `<w:pPr>${parts.join('')}</w:pPr>`;
    const body = runs
        .map((spec) => {
        if (spec.text === '')
            return '';
        const props = [];
        if (spec.bold === true)
            props.push('<w:b/>');
        if (spec.underline === true)
            props.push('<w:u w:val="single"/>');
        if (spec.color !== undefined)
            props.push(`<w:color w:val="${spec.color}"/>`);
        if (spec.halfPoints !== undefined)
            props.push(`<w:sz w:val="${String(spec.halfPoints)}"/>`);
        if (spec.spacing !== undefined)
            props.push(`<w:spacing w:val="${String(spec.spacing)}"/>`);
        return run(spec.text, props.join(''));
    })
        .join('');
    return `<w:p>${properties}${body}</w:p>`;
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
/** 版心宽度（twip）：A4 宽 11906 − 左右页边距各 794。右对齐制表位落在它的右端。 */
const CONTENT_WIDTH_TWIP = 11906 - 794 * 2;
function basicsParagraphs(basics, palette) {
    // 先收集成描述、最后统一补边框：页眉那条贯穿线要画在**最后一行**上，
    // 而最后一行是哪一行取决于用户填了哪些可选字段。
    const blocks = [];
    // 姓名与求职意向**同一行**（与 HTML 的 .resume-headline 对齐）
    const headline = [];
    if (has(basics.name)) {
        headline.push({ text: basics.name, bold: true, halfPoints: 40, color: palette.accent });
    }
    if (has(basics.title)) {
        headline.push({ text: `${headline.length === 0 ? '' : '　'}${basics.title}`, halfPoints: 22, color: palette.subtle });
    }
    if (headline.length > 0)
        blocks.push({ runs: headline, options: { after: 20 } });
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
    if (contacts.length > 0) {
        blocks.push({
            runs: [{ text: contacts.join(' · '), halfPoints: 19, color: palette.subtle }],
            options: { after: 20 },
        });
    }
    // 年限与年龄：docx 侧一直是无条件写出的（HTML 侧默认隐藏，那条差异早于本轮）。
    // 本轮只把"求职意向"并进姓名行，不动这两个字段的既有策略，免得顺手改掉行为。
    const meta = [];
    if (typeof basics.years === 'number')
        meta.push(`工作经验：${String(basics.years)} 年`);
    if (typeof basics.age === 'number')
        meta.push(`年龄：${String(basics.age)} 岁`);
    if (meta.length > 0) {
        blocks.push({
            runs: [{ text: meta.join(' · '), halfPoints: 19, color: palette.subtle }],
            options: { after: 20 },
        });
    }
    // 整份文档只有页眉这一条**深色**贯穿线（段落标题那条是浅灰分界线，见 sectionTitle）
    const last = blocks.at(-1);
    if (last !== undefined)
        last.options = { ...last.options, border: true, borderColor: palette.rule, after: 90 };
    return blocks.map((block) => richParagraph(block.runs, block.options));
}
/**
 * 经历 / 项目的抬头：公司（粗）＋ 职位（常规灰）…… 时间（灰、右对齐制表位）。
 *
 * 用制表位而不是全角空格（早先是 `join('　　')`）：全角空格只是"看起来推到了右边"，
 * 一旦公司名稍长就会把时间挤到下一行，而且右边界参差不齐。
 */
function headingParagraph(left, tail, palette) {
    const runs = [...left];
    if (tail !== '')
        runs.push({ text: `\t${tail}`, color: palette.muted, halfPoints: 19 });
    return richParagraph(runs, { rightTabAt: CONTENT_WIDTH_TWIP, after: 30 });
}
function experienceParagraphs(experience, palette) {
    const left = [];
    if (has(experience.company))
        left.push({ text: experience.company, bold: true });
    if (has(experience.title))
        left.push({ text: `　${experience.title}`, color: palette.subtle });
    const tail = [formatRange(experience.start, experience.end), has(experience.city) ? experience.city : '']
        .filter((part) => part !== '')
        .join(' | ');
    const out = [];
    if (left.length > 0 || tail !== '')
        out.push(headingParagraph(left, tail, palette));
    for (const highlight of experience.highlights) {
        out.push(paragraph(`• ${highlight}`, { indent: 210, after: 40 }));
    }
    if ((experience.stack ?? []).length > 0) {
        // 技术栈：前缀加粗、取值用次级灰（原来整行是最浅的 #6B7280，会读成正文）
        out.push(richParagraph([
            { text: '技术栈 ', bold: true, halfPoints: 18, color: palette.muted },
            { text: (experience.stack ?? []).join(' / '), halfPoints: 18, color: palette.subtle },
        ], { after: 20 }));
    }
    return out;
}
function projectParagraphs(project, palette) {
    const left = [{ text: project.name, bold: true }];
    if (has(project.role))
        left.push({ text: `　${project.role}`, color: palette.subtle });
    const out = [headingParagraph(left, has(project.period) ? project.period : '', palette)];
    for (const highlight of project.highlights) {
        out.push(paragraph(`• ${highlight}`, { indent: 210, after: 40 }));
    }
    if ((project.stack ?? []).length > 0) {
        out.push(richParagraph([
            { text: '技术栈 ', bold: true, halfPoints: 18, color: palette.muted },
            { text: (project.stack ?? []).join(' / '), halfPoints: 18, color: palette.subtle },
        ], { after: 20 }));
    }
    return out;
}
function educationParagraphs(education, palette) {
    // 学校是锚点（加粗），专业/学历退成常规灰 —— 与 HTML 同一套层级
    const extra = [has(education.major) ? education.major : '', has(education.degree) ? education.degree : '']
        .filter((part) => part !== '')
        .join(' · ');
    const range = formatRange(education.start, education.end);
    const runs = [{ text: education.school, bold: true }];
    if (extra !== '')
        runs.push({ text: ` · ${extra}`, color: palette.subtle });
    if (range !== '')
        runs.push({ text: `\t${range}`, color: palette.muted, halfPoints: 19 });
    return [richParagraph(runs, { rightTabAt: CONTENT_WIDTH_TWIP, after: 20 })];
}
/**
 * `word/document.xml` 正文段落。
 *
 * 段落顺序与判空规则**刻意与 HTML 渲染器一致**（简介 → 技能 → 工作 → 项目 → 教育 → 其他，
 * 空的整段不输出）。两处各写一份映射是权衡后的选择：抽公共模块会让两个渲染器
 * 互相绑死，而它们的差异（配色、分页、缩进）恰恰都长在映射函数里。
 */
/**
 * 段落标题：11pt 加粗 + 字距 + **文字下划线**。
 *
 * 早先是 `border: true`（段落下边框）—— 那会横贯整个版心，正是"表格模板"观感的来源，
 * 也是这次在 HTML 侧一起去掉的东西。Word 里段落边框没法只跟到文字末尾，
 * 所以改用文字下划线：效果最接近 HTML 的 `inline-block` 短横线。
 */
function sectionTitle(text, palette) {
    return paragraph(text, {
        style: 'Heading1',
        bold: true,
        halfPoints: 24,
        color: palette.accent,
        spacing: 16,
        // 浅灰分界线（1pt / #E5E7EB）：与 HTML 的 border-bottom 一致。
        // 关键是**浅** —— 早先那版用中灰横线 + 13pt 标题，整页读成了表格。
        border: true,
        borderColor: 'E5E7EB',
        after: 80,
    });
}
function documentParagraphs(content, template) {
    const palette = paletteOf(template);
    const out = [];
    out.push(...basicsParagraphs(content.basics, palette));
    if (has(content.summary)) {
        out.push(sectionTitle('个人简介', palette));
        out.push(paragraph(content.summary, { after: 60 }));
    }
    if (content.skills.length > 0) {
        out.push(sectionTitle('技能', palette));
        // 与 HTML 的技能云一致：名字加粗、备注浅灰，成对流动，而不是一行一个
        const runs = [];
        for (const skill of content.skills) {
            if (runs.length > 0)
                runs.push({ text: '　　' });
            runs.push({ text: skill.name, bold: true });
            const notes = [];
            if (has(skill.level))
                notes.push(skill.level);
            if (typeof skill.years === 'number')
                notes.push(`${String(skill.years)} 年`);
            if (has(skill.evidence))
                notes.push(skill.evidence);
            if (notes.length > 0)
                runs.push({ text: ` ${notes.join(' · ')}`, color: palette.muted, halfPoints: 18 });
        }
        out.push(richParagraph(runs, { after: 60 }));
    }
    if (content.experiences.length > 0) {
        out.push(sectionTitle('工作经历', palette));
        for (const experience of content.experiences)
            out.push(...experienceParagraphs(experience, palette));
    }
    if (content.projects.length > 0) {
        out.push(sectionTitle('项目经历', palette));
        for (const project of content.projects)
            out.push(...projectParagraphs(project, palette));
    }
    if (content.education.length > 0) {
        out.push(sectionTitle('教育', palette));
        for (const education of content.education)
            out.push(...educationParagraphs(education, palette));
    }
    const extras = content.extras.filter((extra) => has(extra.label) && has(extra.text));
    if (extras.length > 0) {
        out.push(sectionTitle('其他', palette));
        for (const extra of extras) {
            out.push(richParagraph([{ text: extra.label, bold: true }, { text: `　${extra.text}`, color: palette.subtle }], { after: 20 }));
        }
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
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="111827"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="30"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;
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
const rawEditor = document.querySelector("#rawEditor");
const preview = document.querySelector("#preview");
const formatReport = document.querySelector("#formatReport");
const statusText = document.querySelector("#statusText");
const wordCount = document.querySelector("#wordCount");
const blockCount = document.querySelector("#blockCount");

const EMPTY_MESSAGE = "粘贴飞书正文后，这里会显示公众号预览。";

const baseDocumentStyle = {
  paper: "#ffffff",
  ink: "#1f2329",
  muted: "#646a73",
  accent: "#3370ff",
  soft: "#f2f5ff",
  font: "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif",
};

const allowedStyleProperties = new Set([
  "background-color",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "box-sizing",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-width",
  "overflow",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "vertical-align",
  "white-space",
  "width",
]);

const blockTags = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "FIGURE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "LI",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "UL",
]);

let lastOutputHtml = "";

const sampleHtml = `
  <h1 style="font-size: 30px; line-height: 1.35; color: #172b4d; font-weight: 800;">飞书原文格式自适应转换</h1>
  <p style="font-size: 16px; line-height: 1.95; color: #1f2329;">这次工具不会再套固定主题，而是读取飞书文档自己带出来的颜色、字号、缩进和加粗。</p>
  <h2 style="font-size: 21px; color: #245bdb; border-left: 5px solid #245bdb; padding-left: 12px;">适合什么场景？</h2>
  <p style="line-height: 1.95;">同一作者的飞书模板、运营团队的固定文章格式、或者每篇风格都不同的专栏，都可以直接按原文转换。</p>
  <blockquote style="background-color: #f2f5ff; border-left: 4px solid #245bdb; padding: 12px 16px; color: #334155;">核心原则：保留原文格式，补齐公众号需要的内联样式。</blockquote>
  <ul style="line-height: 1.9;">
    <li><strong style="color: #d83931;">复制飞书正文</strong>，粘贴到左侧。</li>
    <li>工具识别格式并生成右侧预览。</li>
    <li>复制富文本到公众号后台。</li>
  </ul>
`;

function styleText(styleMap) {
  return Object.entries(styleMap)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function normalizeText(text) {
  return text.replace(/\u00a0/g, " ");
}

function isEmptyHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent.trim() === "" && !tmp.querySelector("img,table,hr");
}

function cleanSource(root) {
  root.querySelectorAll("script,style,meta,link,iframe,object,embed,form,input,button,textarea,select").forEach((node) => node.remove());
  root.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "class" || name === "id" || name.startsWith("data-")) {
        node.removeAttribute(attr.name);
      }
    });
  });
}

function safeCssValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/expression|javascript:|behavior:|@import|<|>|url\s*\(/i.test(trimmed)) return "";
  return trimmed.replace(/["']/g, "");
}

function parseStyle(style = "") {
  const result = {};
  style.split(";").forEach((part) => {
    const index = part.indexOf(":");
    if (index === -1) return;
    let property = part.slice(0, index).trim().toLowerCase();
    const value = safeCssValue(part.slice(index + 1));
    if (!value) return;
    if (property === "background") property = "background-color";
    if (!allowedStyleProperties.has(property)) return;
    result[property] = value;
  });
  return result;
}

function styleFromNode(node) {
  const style = parseStyle(node.getAttribute("style") || "");
  const align = node.getAttribute("align");
  if (align && /^(left|center|right|justify)$/i.test(align)) style["text-align"] = align.toLowerCase();
  return style;
}

function mergeStyles(...styles) {
  return Object.assign({}, ...styles);
}

function tagName(node) {
  return node.tagName.toLowerCase();
}

function inlineChildren(node, profile) {
  return [...node.childNodes].map((child) => transformNode(child, profile, true)).join("");
}

function blockChildren(node, profile) {
  return [...node.childNodes].map((child) => transformNode(child, profile, false)).join("");
}

function transformNode(node, profile, inline = false) {
  if (node.nodeType === Node.TEXT_NODE) return esc(normalizeText(node.textContent));
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = tagName(node);
  const ownStyle = styleFromNode(node);
  const children = inlineChildren(node, profile).trim();

  if (!children && !["br", "img", "hr"].includes(tag)) return "";
  if (tag === "br") return "<br>";

  if (tag === "strong" || tag === "b") {
    return wrapInline("strong", children, mergeStyles({ "font-weight": "700" }, ownStyle));
  }

  if (tag === "em" || tag === "i") {
    return wrapInline("em", children, mergeStyles({ "font-style": "italic" }, ownStyle));
  }

  if (tag === "u") {
    return wrapInline("span", children, mergeStyles({ "text-decoration": "underline" }, ownStyle));
  }

  if (tag === "s" || tag === "strike" || tag === "del") {
    return wrapInline("span", children, mergeStyles({ "text-decoration": "line-through" }, ownStyle));
  }

  if (tag === "code" && inline) {
    return wrapInline(
      "code",
      children,
      mergeStyles(
        {
          "font-family": "Menlo,Consolas,monospace",
          "font-size": "0.92em",
          "background-color": profile.soft,
          padding: "2px 5px",
          "border-radius": "4px",
        },
        ownStyle,
      ),
    );
  }

  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const safeHref = /^https?:\/\//i.test(href) || href.startsWith("#") ? href : "";
    const linkStyle = mergeStyles({ color: profile.accent, "text-decoration": "none" }, ownStyle);
    return `<a href="${esc(safeHref)}" style="${styleText(linkStyle)}">${children}</a>`;
  }

  if (tag === "span") {
    return Object.keys(ownStyle).length ? wrapInline("span", children, ownStyle) : children;
  }

  if (/^h[1-6]$/.test(tag)) return headingHtml(tag, children, ownStyle, profile);
  if (tag === "blockquote") return quoteHtml(children, ownStyle, profile);
  if (tag === "ul" || tag === "ol") return listHtml(node, tag, ownStyle, profile);
  if (tag === "li") return listItemHtml(children, ownStyle, profile);
  if (tag === "pre") return preHtml(node, ownStyle, profile);
  if (tag === "img") return imageHtml(node, ownStyle);
  if (tag === "table") return tableHtml(node, ownStyle, profile);
  if (tag === "hr") return `<hr style="${styleText(mergeStyles({ margin: "24px 0", border: "0", "border-top": `1px solid ${profile.accent}` }, ownStyle))}">`;

  if (tag === "p") return paragraphHtml(children, ownStyle, profile);

  if (["div", "section", "article", "main", "figure"].includes(tag)) {
    if (containsBlockElement(node)) {
      const content = blockChildren(node, profile);
      return Object.keys(ownStyle).length ? `<section style="${styleText(blockContainerStyle(ownStyle, profile))}">${content}</section>` : content;
    }
    return paragraphHtml(children, ownStyle, profile);
  }

  return inline ? (Object.keys(ownStyle).length ? wrapInline("span", children, ownStyle) : children) : paragraphHtml(children, ownStyle, profile);
}

function wrapInline(tag, content, style) {
  return `<${tag} style="${styleText(style)}">${content}</${tag}>`;
}

function containsBlockElement(node) {
  return [...node.childNodes].some((child) => child.nodeType === Node.ELEMENT_NODE && blockTags.has(child.tagName));
}

function blockContainerStyle(sourceStyle, profile) {
  const containerStyle = { ...sourceStyle };
  delete containerStyle.color;
  delete containerStyle["font-size"];
  delete containerStyle["font-weight"];
  delete containerStyle["font-style"];
  delete containerStyle["text-decoration"];

  return mergeStyles(
    {
      margin: "0 auto",
      "box-sizing": "border-box",
      color: profile.ink,
      "font-family": profile.font,
    },
    containerStyle,
  );
}

function paragraphHtml(content, sourceStyle, profile) {
  return `<p style="${styleText(
    mergeStyles(
      {
        margin: "0 0 16px",
        color: profile.ink,
        "font-size": "16px",
        "line-height": "1.9",
        "letter-spacing": "0",
        "text-align": "left",
      },
      sourceStyle,
    ),
  )}">${content}</p>`;
}

function headingHtml(tag, content, sourceStyle, profile) {
  const level = Number(tag.slice(1));
  const defaults = {
    1: { margin: "0 0 22px", "font-size": "28px", "line-height": "1.35", "font-weight": "800" },
    2: { margin: "28px 0 16px", "font-size": "22px", "line-height": "1.45", "font-weight": "800" },
    3: { margin: "22px 0 12px", "font-size": "18px", "line-height": "1.55", "font-weight": "700" },
    4: { margin: "18px 0 10px", "font-size": "17px", "line-height": "1.55", "font-weight": "700" },
    5: { margin: "16px 0 8px", "font-size": "16px", "line-height": "1.55", "font-weight": "700" },
    6: { margin: "14px 0 8px", "font-size": "15px", "line-height": "1.55", "font-weight": "700" },
  };
  return `<${tag} style="${styleText(mergeStyles({ color: profile.ink, "letter-spacing": "0" }, defaults[level], sourceStyle))}">${content}</${tag}>`;
}

function quoteHtml(content, sourceStyle, profile) {
  return `<blockquote style="${styleText(
    mergeStyles(
      {
        margin: "18px 0",
        padding: "12px 16px",
        color: profile.muted,
        "background-color": profile.soft,
        "border-left": `4px solid ${profile.accent}`,
        "line-height": "1.85",
      },
      sourceStyle,
    ),
  )}">${content}</blockquote>`;
}

function listHtml(node, tag, sourceStyle, profile) {
  const items = [...node.children]
    .filter((child) => child.tagName?.toLowerCase() === "li")
    .map((child) => transformNode(child, profile))
    .join("");
  return `<${tag} style="${styleText(
    mergeStyles(
      {
        margin: "14px 0 18px",
        padding: "0 0 0 24px",
        color: profile.ink,
        "line-height": "1.9",
        "list-style-type": tag === "ul" ? "disc" : "decimal",
      },
      sourceStyle,
    ),
  )}">${items}</${tag}>`;
}

function listItemHtml(content, sourceStyle, profile) {
  return `<li style="${styleText(mergeStyles({ margin: "6px 0", padding: "0 0 0 2px", color: profile.ink }, sourceStyle))}">${content}</li>`;
}

function preHtml(node, sourceStyle, profile) {
  return `<pre style="${styleText(
    mergeStyles(
      {
        margin: "18px 0",
        padding: "16px",
        color: "#ffffff",
        "background-color": "#1f2329",
        "border-radius": "8px",
        overflow: "auto",
        "font-family": "Menlo,Consolas,monospace",
        "font-size": "13px",
        "line-height": "1.75",
        "white-space": "pre-wrap",
      },
      sourceStyle,
    ),
  )}">${esc(node.textContent)}</pre>`;
}

function imageHtml(node, sourceStyle) {
  const src = node.getAttribute("src") || "";
  const alt = node.getAttribute("alt") || "";
  if (!src || /^javascript:/i.test(src)) return "";
  const imageStyle = mergeStyles({ display: "block", width: "100%", "max-width": "100%", height: "auto" }, sourceStyle);
  return `<p style="${styleText({ margin: "22px 0", "text-align": "center" })}"><img src="${esc(src)}" alt="${esc(alt)}" style="${styleText(imageStyle)}"></p>`;
}

function tableHtml(table, sourceStyle, profile) {
  const rows = [...table.querySelectorAll("tr")].map((row) => {
    const cells = [...row.children].map((cell) => {
      const cellTag = tagName(cell) === "th" ? "th" : "td";
      const cellStyle = mergeStyles(
        {
          padding: "9px 8px",
          border: "1px solid #d0d5dd",
          color: profile.ink,
          "font-size": "14px",
          "line-height": "1.65",
          "font-weight": cellTag === "th" ? "700" : "400",
          "background-color": cellTag === "th" ? profile.soft : profile.paper,
          "vertical-align": "top",
        },
        styleFromNode(cell),
      );
      return `<${cellTag} style="${styleText(cellStyle)}">${inlineChildren(cell, profile)}</${cellTag}>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  });
  return `<table style="${styleText(
    mergeStyles(
      {
        width: "100%",
        margin: "18px 0",
        "border-collapse": "collapse",
        "table-layout": "fixed",
      },
      sourceStyle,
    ),
  )}"><tbody>${rows.join("")}</tbody></table>`;
}

function plainTextToHtml(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listType = "";

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = "";
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    if (line.startsWith(">")) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s*/, ""))}</blockquote>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join("");
}

function inlineMarkdown(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2">$1</a>');
}

function analyzeDocument(root) {
  const profile = { ...baseDocumentStyle };
  const colorCounts = new Map();
  const backgroundCounts = new Map();
  const fontSizes = new Set();
  const blockNames = new Map();
  let styledNodeCount = 0;

  root.querySelectorAll("*").forEach((node) => {
    const style = styleFromNode(node);
    if (Object.keys(style).length) styledNodeCount += 1;
    if (style.color) colorCounts.set(style.color, (colorCounts.get(style.color) || 0) + 1);
    if (style["background-color"]) backgroundCounts.set(style["background-color"], (backgroundCounts.get(style["background-color"]) || 0) + 1);
    if (style["font-size"]) fontSizes.add(style["font-size"]);
    if (blockTags.has(node.tagName)) {
      blockNames.set(node.tagName.toLowerCase(), (blockNames.get(node.tagName.toLowerCase()) || 0) + 1);
    }
  });

  const sortedColors = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
  const firstAccent = sortedColors.find((color) => !isNeutralColor(color));
  profile.accent = firstAccent || profile.accent;
  profile.soft = [...backgroundCounts.keys()].find((color) => color !== profile.paper) || profile.soft;

  return {
    ...profile,
    colors: sortedColors.slice(0, 6),
    fontSizes: [...fontSizes].slice(0, 6),
    blocks: [...blockNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    styledNodeCount,
    images: root.querySelectorAll("img").length,
    tables: root.querySelectorAll("table").length,
    links: root.querySelectorAll("a[href]").length,
  };
}

function isNeutralColor(color) {
  const normalized = color.toLowerCase().replace(/\s/g, "");
  return ["#000", "#000000", "#1f2329", "#333", "#333333", "rgb(0,0,0)", "rgba(0,0,0,1)"].includes(normalized);
}

function renderReport(profile) {
  const colorItems = profile.colors.length
    ? profile.colors.map((color) => `<span class="color-chip"><i style="background:${esc(color)}"></i>${esc(color)}</span>`).join("")
    : '<span class="muted-line">未检测到显式颜色</span>';
  const fontItems = profile.fontSizes.length
    ? profile.fontSizes.map((size) => `<span class="metric-pill">${esc(size)}</span>`).join("")
    : '<span class="muted-line">按默认字号补齐</span>';
  const blockItems = profile.blocks.length
    ? profile.blocks.map(([name, count]) => `<span class="metric-pill">${name} ${count}</span>`).join("")
    : '<span class="muted-line">暂无块级结构</span>';

  formatReport.innerHTML = `
    <div class="report-section">
      <span class="report-label">样式来源</span>
      <strong>跟随当前飞书文档</strong>
      <p>已识别 ${profile.styledNodeCount} 个带样式节点。</p>
    </div>
    <div class="report-section">
      <span class="report-label">颜色</span>
      <div class="chip-grid">${colorItems}</div>
    </div>
    <div class="report-section">
      <span class="report-label">字号</span>
      <div class="chip-grid">${fontItems}</div>
    </div>
    <div class="report-section">
      <span class="report-label">结构</span>
      <div class="chip-grid">${blockItems}</div>
    </div>
    <div class="report-section compact-metrics">
      <span>图片 ${profile.images}</span>
      <span>表格 ${profile.tables}</span>
      <span>链接 ${profile.links}</span>
    </div>
  `;
}

function convert() {
  let sourceHtml = rawEditor.innerHTML;

  if (isEmptyHtml(sourceHtml)) {
    renderEmpty();
    return;
  }

  if (!/<[a-z][\s\S]*>/i.test(sourceHtml)) {
    sourceHtml = plainTextToHtml(rawEditor.innerText);
  }

  const root = document.createElement("div");
  root.innerHTML = sourceHtml;
  cleanSource(root);

  const profile = analyzeDocument(root);
  const body = [...root.childNodes].map((node) => transformNode(node, profile)).join("");
  lastOutputHtml = `<section style="${styleText({
    margin: "0 auto",
    padding: "28px 22px 34px",
    "max-width": "677px",
    "box-sizing": "border-box",
    background: profile.paper,
    color: profile.ink,
    "font-family": profile.font,
  })}">${body}</section>`;

  preview.innerHTML = lastOutputHtml;
  renderReport(profile);
  updateStats();
  setStatus("已按当前飞书文档格式转换，可复制到公众号后台。");
}

function renderEmpty() {
  lastOutputHtml = `<section style="${styleText({
    padding: "32px 22px",
    background: baseDocumentStyle.paper,
    color: baseDocumentStyle.muted,
    "font-family": baseDocumentStyle.font,
    "line-height": "1.8",
  })}"><p style="${styleText({ margin: "0", "font-size": "15px", color: baseDocumentStyle.muted })}">${EMPTY_MESSAGE}</p></section>`;
  preview.innerHTML = lastOutputHtml;
  formatReport.innerHTML = '<div class="empty-report">粘贴飞书文档后，会在这里显示识别到的样式。</div>';
  wordCount.textContent = "0 字";
  blockCount.textContent = "0 段";
}

function updateStats() {
  const text = preview.innerText.replace(/\s/g, "");
  wordCount.textContent = `${text.length} 字`;
  blockCount.textContent = `${preview.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,table").length} 段`;
}

function setStatus(message) {
  statusText.textContent = message;
}

async function copyRich() {
  if (!lastOutputHtml || preview.innerText.trim() === EMPTY_MESSAGE) {
    setStatus("还没有可复制的内容。");
    return;
  }

  const plain = preview.innerText;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([lastOutputHtml], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } else {
      fallbackCopyHtml();
    }
    setStatus("已复制富文本：可以去公众号后台直接粘贴。");
  } catch (error) {
    fallbackCopyHtml();
    setStatus("已使用兼容模式复制，若格式丢失请再点一次复制。");
  }
}

function fallbackCopyHtml() {
  const range = document.createRange();
  range.selectNodeContents(preview);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("copy");
  selection.removeAllRanges();
}

async function copyHtmlSource() {
  if (!lastOutputHtml) return;
  try {
    await navigator.clipboard.writeText(lastOutputHtml);
    setStatus("已复制 HTML 源码。");
  } catch (error) {
    fallbackCopyText(lastOutputHtml);
    setStatus("已使用兼容模式复制 HTML 源码。");
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function pasteFromClipboard() {
  rawEditor.focus();
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes("text/html")) {
        rawEditor.innerHTML = await (await item.getType("text/html")).text();
        convert();
        setStatus("已读取剪贴板中的富文本，并按原文格式转换。");
        return;
      }
      if (item.types.includes("text/plain")) {
        rawEditor.innerHTML = plainTextToHtml(await (await item.getType("text/plain")).text());
        convert();
        setStatus("已读取剪贴板中的纯文本，并补齐基础排版。");
        return;
      }
    }
  } catch (error) {
    setStatus("浏览器未授权读取剪贴板，请在左侧输入区手动粘贴。");
  }
}

rawEditor.addEventListener("input", convert);
rawEditor.addEventListener("paste", () => window.setTimeout(convert, 0));
document.querySelector("#pasteButton").addEventListener("click", pasteFromClipboard);
document.querySelector("#clearButton").addEventListener("click", () => {
  rawEditor.innerHTML = "";
  convert();
  rawEditor.focus();
  setStatus("已清空。");
});
document.querySelector("#loadSample").addEventListener("click", () => {
  rawEditor.innerHTML = sampleHtml;
  convert();
});
document.querySelector("#copyRich").addEventListener("click", copyRich);
document.querySelector("#copyRichSecondary").addEventListener("click", copyRich);
document.querySelector("#copyHtml").addEventListener("click", copyHtmlSource);

renderEmpty();

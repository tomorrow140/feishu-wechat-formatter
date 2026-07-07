const rawEditor = document.querySelector("#rawEditor");
const preview = document.querySelector("#preview");
const formatReport = document.querySelector("#formatReport");
const modeButtons = document.querySelectorAll("[data-format-mode]");
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
  "font",
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
  "text-indent",
  "vertical-align",
  "white-space",
  "width",
  "list-style-type",
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
let currentFormatMode = "source";

const sampleHtml = `
  <h1 style="font-size: 30px; line-height: 1.35; color: #172b4d; font-weight: 800;">飞书原文格式自适应转换</h1>
  <p style="font-size: 16px; line-height: 1.95; color: #1f2329;">这次工具可以一键改成公众号更适合阅读的样子，同时识别飞书里标过的重点。</p>
  <p style="font-size: 21px; color: #245bdb; font-weight: 800;">1、自动识别标题和重点句</p>
  <p style="line-height: 1.95;">短标题、编号标题会变成更清楚的标题。飞书里的<strong style="color: #d83931;">加粗重点</strong>、<span style="background-color: #fff59d;">黄色高亮句子</span>会被保留下来。</p>
  <blockquote style="background-color: #f2f5ff; border-left: 4px solid #245bdb; padding: 12px 16px; color: #334155;">核心原则：正文更耐读，重点更醒目，复制到公众号后格式更稳定。</blockquote>
  <ul style="line-height: 1.9;">
    <li><strong style="color: #d83931;">复制飞书正文</strong>，粘贴到左侧。</li>
    <li>工具自动排版并生成右侧预览。</li>
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
  inlineEmbeddedStyles(root);
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

function inlineEmbeddedStyles(root) {
  const styleTextContent = [...root.querySelectorAll("style")]
    .map((node) => node.textContent || "")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  if (!styleTextContent.trim()) return;

  const originalInlineStyles = new WeakMap();
  root.querySelectorAll("*").forEach((node) => {
    originalInlineStyles.set(node, styleFromNode(node));
  });

  const ruleStylesByNode = new WeakMap();
  const rulePrioritiesByNode = new WeakMap();
  const rulePattern = /([^{}@]+)\{([^{}]+)\}/g;
  let match;
  let ruleOrder = 0;
  while ((match = rulePattern.exec(styleTextContent))) {
    ruleOrder += 1;
    const ruleStyle = parseStyle(match[2]);
    if (!Object.keys(ruleStyle).length) continue;

    match[1]
      .split(",")
      .map((selector) => selector.trim())
      .filter(isSupportedCssSelector)
      .forEach((selector) => {
        const specificity = selectorSpecificity(selector);
        let nodes = [];
        try {
          nodes = [...root.querySelectorAll(selector)];
        } catch (error) {
          nodes = [];
        }

        nodes.forEach((node) => {
          const nodeRuleStyle = ruleStylesByNode.get(node) || {};
          const nodeRulePriorities = rulePrioritiesByNode.get(node) || {};
          Object.entries(ruleStyle).forEach(([property, value]) => {
            const priority = { specificity, order: ruleOrder };
            if (stylePriorityWins(nodeRulePriorities[property], priority)) {
              nodeRuleStyle[property] = value;
              nodeRulePriorities[property] = priority;
            }
          });
          ruleStylesByNode.set(node, nodeRuleStyle);
          rulePrioritiesByNode.set(node, nodeRulePriorities);
        });
      });
  }

  root.querySelectorAll("*").forEach((node) => {
    const ruleStyle = ruleStylesByNode.get(node) || {};
    const originalStyle = originalInlineStyles.get(node) || {};
    const mergedStyle = mergeStyles(ruleStyle, originalStyle);
    if (Object.keys(mergedStyle).length) node.setAttribute("style", styleText(mergedStyle));
  });
}

function isSupportedCssSelector(selector) {
  return (
    selector.length > 0 &&
    selector.length <= 160 &&
    !/[{}<:"'`~+]|::?/.test(selector) &&
    /^[#.a-zA-Z0-9_\-\s>]+$/.test(selector)
  );
}

function selectorSpecificity(selector) {
  const idCount = (selector.match(/#[a-zA-Z0-9_-]+/g) || []).length;
  const classCount = (selector.match(/\.[a-zA-Z0-9_-]+/g) || []).length;
  const tagCount = selector
    .split(/\s+|>/)
    .map((part) => part.replace(/[#.][a-zA-Z0-9_-]+/g, "").trim())
    .filter(Boolean).length;
  return [idCount, classCount, tagCount];
}

function stylePriorityWins(current, incoming) {
  if (!current) return true;
  for (let index = 0; index < incoming.specificity.length; index += 1) {
    if (incoming.specificity[index] > current.specificity[index]) return true;
    if (incoming.specificity[index] < current.specificity[index]) return false;
  }
  return incoming.order >= current.order;
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
    if (property === "font") {
      Object.assign(result, parseFontShorthand(value));
      return;
    }
    result[property] = value;
  });
  return result;
}

function parseFontShorthand(value) {
  const result = {};
  const sizeMatch = value.match(/(?:^|\s)(\d+(?:\.\d+)?(?:px|pt|em|rem|%))(?:\s*\/\s*([^\s]+))?/i);
  if (!sizeMatch) return result;

  const beforeSize = value.slice(0, sizeMatch.index).trim();
  const afterSize = value.slice((sizeMatch.index || 0) + sizeMatch[0].length).trim();
  const beforeParts = beforeSize.split(/\s+/).filter(Boolean);

  beforeParts.forEach((part) => {
    const normalized = part.toLowerCase();
    if (["italic", "oblique", "normal"].includes(normalized) && !result["font-style"]) {
      result["font-style"] = normalized;
      return;
    }
    if ((["bold", "bolder", "lighter"].includes(normalized) || /^[1-9]00$/.test(normalized)) && !result["font-weight"]) {
      result["font-weight"] = normalized;
    }
  });

  result["font-size"] = sizeMatch[1];
  if (sizeMatch[2]) result["line-height"] = sizeMatch[2];
  if (afterSize) result["font-family"] = afterSize;
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

const inheritedTextProperties = [
  "color",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-decoration",
  "text-indent",
  "white-space",
];

function textInheritedStyle(style) {
  const inherited = {};
  inheritedTextProperties.forEach((property) => {
    if (style[property]) inherited[property] = style[property];
  });
  return inherited;
}

function tagName(node) {
  return node.tagName.toLowerCase();
}

function inlineChildren(node, profile, inheritedStyle = {}) {
  return [...node.childNodes].map((child) => transformNode(child, profile, true, inheritedStyle)).join("");
}

function blockChildren(node, profile, inheritedStyle = {}) {
  return [...node.childNodes].map((child) => transformNode(child, profile, false, inheritedStyle)).join("");
}

function transformNode(node, profile, inline = false, inheritedStyle = {}) {
  if (node.nodeType === Node.TEXT_NODE) return esc(normalizeText(node.textContent));
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = tagName(node);
  const ownStyle = styleFromNode(node);
  const sourceStyle = profile.mode === "source" ? mergeStyles(inheritedStyle, ownStyle) : ownStyle;
  const childInheritedStyle = profile.mode === "source" ? mergeStyles(inheritedStyle, textInheritedStyle(ownStyle)) : {};
  const children = inlineChildren(node, profile, childInheritedStyle).trim();

  if (!children && !["br", "img", "hr"].includes(tag)) return "";
  if (tag === "br") return "<br>";

  if (tag === "strong" || tag === "b") {
    if (profile.mode === "smart") {
      profile.keyMarks += 1;
      return wrapInline("strong", children, smartInlineStyle(ownStyle, profile, true));
    }
    return wrapInline("strong", children, mergeStyles(sourceStyle, { "font-weight": "700" }));
  }

  if (tag === "em" || tag === "i") {
    if (profile.mode === "smart") {
      return wrapInline("em", children, mergeStyles({ color: profile.accent, "font-style": "normal" }, smartInlineStyle(ownStyle, profile)));
    }
    return wrapInline("em", children, mergeStyles(sourceStyle, { "font-style": "italic" }));
  }

  if (tag === "u") {
    return wrapInline("span", children, mergeStyles(sourceStyle, { "text-decoration": "underline" }));
  }

  if (tag === "s" || tag === "strike" || tag === "del") {
    return wrapInline("span", children, mergeStyles(sourceStyle, { "text-decoration": "line-through" }));
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
        sourceStyle,
      ),
    );
  }

  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const safeHref = /^https?:\/\//i.test(href) || href.startsWith("#") ? href : "";
    const linkStyle = mergeStyles({ color: profile.accent, "text-decoration": "none" }, sourceStyle);
    return `<a href="${esc(safeHref)}" style="${styleText(linkStyle)}">${children}</a>`;
  }

  if (tag === "span") {
    if (profile.mode === "smart") return smartSpanHtml(children, ownStyle, profile);
    return Object.keys(sourceStyle).length ? wrapInline("span", children, sourceStyle) : children;
  }

  if (/^h[1-6]$/.test(tag)) {
    if (tag === "h1") profile.titleAssigned = true;
    profile.seenContent = true;
    return headingHtml(tag, children, sourceStyle, profile);
  }
  if (tag === "blockquote") return quoteHtml(children, sourceStyle, profile);
  if (tag === "ul" || tag === "ol") return listHtml(node, tag, sourceStyle, profile, childInheritedStyle);
  if (tag === "li") return listItemHtml(children, sourceStyle, profile);
  if (tag === "pre") return preHtml(node, sourceStyle, profile);
  if (tag === "img") return imageHtml(node, sourceStyle);
  if (tag === "table") return tableHtml(node, sourceStyle, profile, childInheritedStyle);
  if (tag === "hr") return `<hr style="${styleText(mergeStyles({ margin: "24px 0", border: "0", "border-top": `1px solid ${profile.accent}` }, sourceStyle))}">`;

  if (tag === "p") {
    if (profile.mode === "smart") {
      const promoted = smartPromotedHeading(node, children, ownStyle, profile);
      if (promoted) return promoted;
    }
    profile.seenContent = true;
    return paragraphHtml(children, sourceStyle, profile);
  }

  if (["div", "section", "article", "main", "figure"].includes(tag)) {
    if (containsBlockElement(node)) {
      const content = blockChildren(node, profile, childInheritedStyle);
      return Object.keys(sourceStyle).length ? `<section style="${styleText(blockContainerStyle(sourceStyle, profile))}">${content}</section>` : content;
    }
    if (profile.mode === "smart") {
      const promoted = smartPromotedHeading(node, children, ownStyle, profile);
      if (promoted) return promoted;
    }
    profile.seenContent = true;
    return paragraphHtml(children, sourceStyle, profile);
  }

  return inline ? (Object.keys(sourceStyle).length ? wrapInline("span", children, sourceStyle) : children) : paragraphHtml(children, sourceStyle, profile);
}

function wrapInline(tag, content, style) {
  return `<${tag} style="${styleText(style)}">${content}</${tag}>`;
}

function numericPx(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)px/);
  return match ? Number(match[1]) : 0;
}

function fontWeightValue(style) {
  const weight = String(style["font-weight"] || "").toLowerCase();
  if (weight === "bold") return 700;
  const parsed = Number(weight);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSoftBackground(color) {
  if (!color) return false;
  const normalized = color.toLowerCase().replace(/\s/g, "");
  return !["transparent", "none", "#fff", "#ffffff", "rgb(255,255,255)", "rgba(255,255,255,1)"].includes(normalized);
}

function isMarkedStyle(style, profile) {
  return (
    isSoftBackground(style["background-color"]) ||
    fontWeightValue(style) >= 600 ||
    (style.color && !isNeutralColor(style.color) && style.color !== profile.ink)
  );
}

function smartInlineStyle(sourceStyle, profile, strong = false) {
  const marked = isMarkedStyle(sourceStyle, profile) || strong;
  if (isSoftBackground(sourceStyle["background-color"])) {
    return {
      color: profile.ink,
      "background-color": "#fff59d",
      padding: "1px 4px",
      "border-radius": "3px",
      "font-weight": "700",
    };
  }
  if (marked) {
    return {
      color: sourceStyle.color && !isNeutralColor(sourceStyle.color) ? sourceStyle.color : profile.accent,
      "font-weight": "700",
    };
  }
  return {};
}

function smartSpanHtml(children, sourceStyle, profile) {
  if (!Object.keys(sourceStyle).length) return children;
  if (!isMarkedStyle(sourceStyle, profile)) return children;
  profile.keyMarks += 1;
  return wrapInline("span", children, smartInlineStyle(sourceStyle, profile));
}

function smartPromotedHeading(node, children, sourceStyle, profile) {
  const text = normalizeText(node.textContent).trim();
  if (!text) return "";
  const headingStyle = mergeStyles(sourceStyle, dominantChildTextStyle(node, sourceStyle));
  const shortEnough = text.length <= 58;
  const numbered = /^([0-9０-９]+[、.．]|[一二三四五六七八九十]+[、.．])/.test(text);
  const styledHeading = fontWeightValue(headingStyle) >= 600 || numericPx(headingStyle["font-size"]) >= 19;
  const firstTitle = !profile.seenContent && shortEnough && !/[。！？!?]$/.test(text);

  if (!profile.titleAssigned && (firstTitle || (shortEnough && numericPx(headingStyle["font-size"]) >= 24))) {
    profile.titleAssigned = true;
    profile.seenContent = true;
    profile.autoHeadings += 1;
    return headingHtml("h1", children, headingStyle, profile);
  }

  if (shortEnough && (numbered || styledHeading)) {
    profile.seenContent = true;
    profile.autoHeadings += 1;
    return headingHtml("h2", children, headingStyle, profile);
  }

  return "";
}

function dominantChildTextStyle(node, fallbackStyle = {}) {
  const candidates = [...node.querySelectorAll("span,strong,b")]
    .map((child) => {
      const style = styleFromNode(child);
      if ((tagName(child) === "strong" || tagName(child) === "b") && !style["font-weight"]) {
        style["font-weight"] = "700";
      }
      return style;
    })
    .filter((style) => Object.keys(style).length);
  const dominant = {};

  candidates.forEach((style) => {
    if (!dominant.color && style.color) dominant.color = style.color;
    if (!dominant["font-size"] && style["font-size"]) dominant["font-size"] = style["font-size"];
    if (fontWeightValue(style) > fontWeightValue(dominant)) dominant["font-weight"] = style["font-weight"];
  });

  return mergeStyles(fallbackStyle, dominant);
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
  if (profile.mode === "smart") {
    if (isSoftBackground(sourceStyle["background-color"])) {
      profile.keyMarks += 1;
      return `<p style="${styleText({
        margin: "18px 0",
        padding: "12px 14px",
        color: profile.ink,
        "background-color": "#fff8cc",
        "border-left": "4px solid #f2c94c",
        "font-size": "16px",
        "line-height": "1.9",
        "letter-spacing": "0",
      })}">${content}</p>`;
    }

    return `<p style="${styleText({
      margin: "0 0 18px",
      color: profile.ink,
      "font-size": "16px",
      "line-height": "1.95",
      "letter-spacing": "0",
      "text-align": "left",
    })}">${content}</p>`;
  }

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
  if (profile.mode === "smart") {
    const smartDefaults = {
      1: {
        margin: "0 0 26px",
        color: profile.accent,
        "font-size": "32px",
        "line-height": "1.38",
        "font-weight": "800",
        "letter-spacing": "0",
        "border-bottom": `3px solid ${profile.accent}`,
        padding: "0 0 12px",
      },
      2: {
        margin: "30px 0 16px",
        color: profile.accent,
        "font-size": "24px",
        "line-height": "1.48",
        "font-weight": "800",
        "letter-spacing": "0",
        "border-left": `5px solid ${profile.accent}`,
        padding: "0 0 0 10px",
      },
      3: {
        margin: "24px 0 12px",
        color: profile.accent,
        "font-size": "20px",
        "line-height": "1.55",
        "font-weight": "800",
        "letter-spacing": "0",
      },
    };
    return `<${tag} style="${styleText(smartDefaults[Math.min(level, 3)])}">${content}</${tag}>`;
  }

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
  if (profile.mode === "smart") {
    return `<blockquote style="${styleText({
      margin: "20px 0",
      padding: "14px 16px",
      color: "#394150",
      "background-color": "#f6f8fb",
      "border-left": `4px solid ${profile.accent}`,
      "border-radius": "0 6px 6px 0",
      "font-size": "15px",
      "line-height": "1.85",
    })}">${content}</blockquote>`;
  }

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

function listHtml(node, tag, sourceStyle, profile, inheritedStyle = {}) {
  const items = [...node.children]
    .filter((child) => child.tagName?.toLowerCase() === "li")
    .map((child) => transformNode(child, profile, false, inheritedStyle))
    .join("");
  const defaults = {
    margin: profile.mode === "smart" ? "14px 0 20px" : "14px 0 18px",
    padding: "0 0 0 24px",
    color: profile.ink,
    "font-size": profile.mode === "smart" ? "16px" : undefined,
    "line-height": profile.mode === "smart" ? "1.9" : "1.9",
    "list-style-type": tag === "ul" ? "disc" : "decimal",
  };
  return `<${tag} style="${styleText(profile.mode === "smart" ? defaults : mergeStyles(defaults, sourceStyle))}">${items}</${tag}>`;
}

function listItemHtml(content, sourceStyle, profile) {
  if (profile.mode === "smart") {
    return `<li style="${styleText({ margin: "7px 0", padding: "0 0 0 2px", color: profile.ink })}">${content}</li>`;
  }
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

function tableHtml(table, sourceStyle, profile, inheritedStyle = {}) {
  const rows = [...table.querySelectorAll("tr")].map((row) => {
    const cells = [...row.children].map((cell) => {
      const cellTag = tagName(cell) === "th" ? "th" : "td";
      const ownCellStyle = styleFromNode(cell);
      const cellSourceStyle = profile.mode === "source" ? mergeStyles(inheritedStyle, ownCellStyle) : ownCellStyle;
      const cellInheritedStyle = profile.mode === "source" ? mergeStyles(inheritedStyle, textInheritedStyle(ownCellStyle)) : {};
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
        cellSourceStyle,
      );
      return `<${cellTag} style="${styleText(cellStyle)}">${inlineChildren(cell, profile, cellInheritedStyle)}</${cellTag}>`;
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
  const headingAccent =
    [...root.querySelectorAll("h2,h3,h4,h5,h6")]
      .map((node) => styleFromNode(node).color)
      .find((color) => color && !isNeutralColor(color)) ||
    [...root.querySelectorAll("h1")]
      .map((node) => styleFromNode(node).color)
      .find((color) => color && !isNeutralColor(color));
  profile.accent = headingAccent || firstAccent || profile.accent;
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
    mode: currentFormatMode,
    keyMarks: 0,
    autoHeadings: 0,
    seenContent: false,
    titleAssigned: !!root.querySelector("h1"),
  };
}

function isNeutralColor(color) {
  const normalized = color.toLowerCase().replace(/\s/g, "");
  if (
    [
      "#000",
      "#000000",
      "#1f2329",
      "#333",
      "#333333",
      "black",
      "gray",
      "grey",
      "darkgray",
      "darkgrey",
      "dimgray",
      "dimgrey",
      "rgb(0,0,0)",
      "rgba(0,0,0,1)",
    ].includes(normalized)
  ) {
    return true;
  }

  const rgb = parseColorToRgb(normalized);
  if (!rgb) return false;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  return max - min < 32;
}

function parseColorToRgb(color) {
  const shortHex = color.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((part) => parseInt(part + part, 16));
    return { r, g, b };
  }

  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return {
      r: parseInt(hex[1].slice(0, 2), 16),
      g: parseInt(hex[1].slice(2, 4), 16),
      b: parseInt(hex[1].slice(4, 6), 16),
    };
  }

  const rgb = color.match(/^rgba?\((\d+),(\d+),(\d+)(?:,[^)]+)?\)$/i);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  return null;
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
      <span class="report-label">排版模式</span>
      <strong>${profile.mode === "smart" ? "公众号一键排版" : "保持飞书原格式"}</strong>
      <p>${profile.mode === "smart" ? "自动优化标题、正文行距和重点句。" : `已识别 ${profile.styledNodeCount} 个带样式节点，并补齐继承样式。`}</p>
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
      <span>标题 ${profile.autoHeadings}</span>
      <span>重点 ${profile.keyMarks}</span>
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
    padding: "28px 0 34px",
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
    padding: "32px 0",
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
modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFormatMode = button.dataset.formatMode;
    modeButtons.forEach((item) => {
      const active = item.dataset.formatMode === currentFormatMode;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    convert();
  });
});

renderEmpty();

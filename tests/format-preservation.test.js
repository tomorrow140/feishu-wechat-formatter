#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "google-chrome",
  "google-chrome-stable",
  "chromium",
].filter(Boolean);

function findChrome() {
  for (const candidate of chromeCandidates) {
    if (candidate.includes(path.sep) && fs.existsSync(candidate)) return candidate;
    const probe = spawnSync("which", [candidate], { encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  return "";
}

const chromePath = findChrome();
if (!chromePath) {
  console.error("未找到 Chrome/Chromium。可通过 CHROME_BIN=/path/to/chrome 指定浏览器。");
  process.exit(1);
}

const runnerPath = path.join(os.tmpdir(), `feishu-wechat-format-test-${Date.now()}.html`);
const appUrl = `file://${path.join(rootDir, "index.html")}`;
const cssText = fs.readFileSync(path.join(rootDir, "styles.css"), "utf8");

if (/font-size\s*:\s*clamp\(/i.test(cssText)) {
  console.error("页面 UI 不应使用 viewport 参与计算的 clamp 字号，请改为固定字号加媒体查询。");
  process.exit(1);
}

const runnerHtml = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>format preservation test</title></head>
  <body data-test-result="pending">
    <iframe id="app" src="${appUrl}" style="width:1200px;height:900px"></iframe>
    <script>
      const feishuLikeHtml = \`
        <style>
          .doc { font: normal 400 17px/1.88 "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2329; text-align: left; }
          .title { color: rgb(36, 91, 219); font-size: 26px; font-weight: 800; margin-bottom: 12px; }
          .indent { text-indent: 2em; line-height: 2; }
          .accent { color: #d83931; font-size: 18px; font-weight: 700; }
          .center { text-align: center; font-family: "Songti SC", serif; }
          .quote { border-left: 3px solid #d0d5dd; background-color: #f6f8fb; padding: 10px 12px; color: #475569; }
          .feishu-seq-2 { display: list-item; list-style-type: decimal; counter-reset: list-item 1; }
          table td { color: #245bdb; font-size: 14px; background-color: #f2f5ff; }
        </style>
        <div class="doc" data-lark-record-data="removed">
          <p class="title">1、岗位和角色在融合，但 PM 不会消失</p>
          <p class="indent">正文段落需要保留字体、字号、颜色、行距和首行缩进。</p>
          <p>这一句里有 <span class="accent">红色重点</span>、<span style="background-color: #fff59d;">黄色高亮</span> 和 <strong>加粗文字</strong>。</p>
          <p>00 的感受：这类段落应该被公众号排版识别成单独的个人感受块，<span style="color: #245bdb;">内部蓝色也要回到正文色</span>。</p>
          <blockquote class="quote">引用块需要保留左边框、背景和文字颜色，<span style="color: #245bdb;">引用内部蓝色也要回到正文色</span>。</blockquote>
          <p class="center"><u>下划线文字</u>、<s>删除线文字</s>、<code style="color: #111827;">inline code</code>、<a href="https://example.com/demo">安全链接</a></p>
          <h2 class="feishu-seq-2" seq-level="auto" style="font-size: 20px; font-weight: 700;">搭建内容创作工作流，持续 Vibe Coding</h2>
          <ol start="1">
            <li value="1">先通过飞书进行撰写</li>
            <li>写完以后，再转换成公众号富文本</li>
          </ol>
          <h2 data-list-index="3" style="display: list-item; list-style-type: decimal; font-size: 20px; font-weight: 700;">内容创作倒逼我学习最新资讯和技术</h2>
          <ol start="2"><li value="3">显式续号列表项</li></ol>
          <h2 seq="4" seq-level="auto" style="display: list-item; list-style-type: decimal; font-size: 20px; font-weight: 700;">把可复用的能力沉淀成 Skills</h2>
          <ol start="5"><li><h2 style="font-size: 20px; font-weight: 700;">嵌套在列表项里的飞书标题</h2></li></ol>
          <p style="font-size: 28px; font-weight: 800;">阶段 1：级联式语音系统</p>
          <p>阶段说明正文不应该影响阶段标题层级。</p>
          <h1>阶段二：轮次式语音模型</h1>
          <p>第二阶段的说明正文。</p>
          <img src="https://example.com/feishu-image.png" alt="飞书图片" style="width: 320px; border-radius: 6px;">
          <img data-src="https://example.com/lazy-feishu-image.png" alt="懒加载图片" width="280" height="160" style="border-radius: 8px;">
          <img src="https://example.com/right-image.png" alt="右对齐图片" style="width: 180px; text-align: right;">
          <p class="title">2、IC和管理者的关系：管理者和IC不会消失</p>
          <ul style="list-style-type: square;"><li style="font-size: 15px;">列表项保留字号和项目符号</li></ul>
          <table>
            <tr><th colspan="2">表格标题跨两列</th></tr>
            <tr><td rowspan="2">合并行单元格</td><td>表格单元格保留颜色和背景</td></tr>
            <tr><td>第二行内容</td></tr>
          </table>
        </div>
      \`;

      function assert(condition, message, details) {
        if (!condition) {
          throw new Error(message + (details ? "\\n" + details : ""));
        }
      }

      function includesAll(source, checks) {
        return checks.every((item) => source.includes(item));
      }

      const appFrame = document.querySelector("#app");
      let testStarted = false;

      function startTest() {
        if (testStarted) return;
        const loadedFrame = appFrame.contentWindow;
        if (!loadedFrame || typeof loadedFrame.convert !== "function") {
          setTimeout(startTest, 50);
          return;
        }
        testStarted = true;
        setTimeout(async () => {
          try {
            const frame = document.querySelector("#app").contentWindow;
            const doc = frame.document;
            const clipboardWrites = [];
            frame.ClipboardItem = class MockClipboardItem {
              constructor(items) {
                this.items = items;
                this.types = Object.keys(items);
              }
            };
            Object.defineProperty(frame.navigator, "clipboard", {
              configurable: true,
              value: {
                write: async (items) => {
                  clipboardWrites.push(items);
                },
              },
            });

            doc.querySelector("#rawEditor").innerHTML = feishuLikeHtml;
            frame.convert();

            const output = doc.querySelector("#preview").innerHTML;
            const report = doc.querySelector("#formatReport").innerText;
            const sourceModeActive = doc.querySelector('[data-format-mode="source"]').classList.contains("active");
            const frameElement = document.querySelector("#app");

            assert(sourceModeActive, "默认模式应该是保持原格式");
            assert(output.includes("岗位和角色在融合"), "应该保留正文内容", output);
            assert(!/<style|class=|data-lark/i.test(output), "输出不应保留 style/class/data-lark 等飞书或页面专用标记", output);
            assert(includesAll(output, ["color:rgb(36, 91, 219)", "font-size:26px", "font-weight:800"]), "标题颜色、字号、加粗应保留为内联样式", output);
            assert(includesAll(output, ["text-indent:2em", "line-height:2"]), "正文分段的缩进和行距应保留", output);
            assert(includesAll(output, ["color:#d83931", "font-size:18px", "font-weight:700"]), "重点文字颜色、字号和加粗应保留", output);
            assert(includesAll(output, ["background-color:#f6f8fb", "border-left:3px solid #d0d5dd", "color:#475569"]), "引用块的背景、左边框和文字颜色应保留", output);
            assert(includesAll(output, ["text-align:center", "font-family:Songti SC, serif"]), "居中对齐和字体族应保留", output);
            assert(includesAll(output, ["text-decoration:underline", "text-decoration:line-through"]), "下划线和删除线应保留", output);
            assert(output.includes("<code") && output.includes("inline code") && output.includes("color:#111827"), "行内代码和代码颜色应保留", output);
            assert(output.includes('href="https://example.com/demo"') && output.includes("安全链接"), "安全链接 href 和文本应保留", output);
            assert(output.includes('src="https://example.com/feishu-image.png"') && output.includes('alt="飞书图片"'), "图片 src 和 alt 应保留", output);
            assert(output.includes("width:320px") && output.includes("border-radius:6px"), "图片尺寸和圆角样式应保留", output);
            assert(output.includes('src="https://example.com/lazy-feishu-image.png"') && output.includes('alt="懒加载图片"'), "data-src 图片地址和 alt 应转为公众号可识别的 img", output);
            assert(output.includes("width:280px") && output.includes("height:160px") && output.includes("border-radius:8px"), "图片 width/height 属性和圆角样式应保留", output);
            assert(output.includes('src="https://example.com/right-image.png"') && output.includes('<p style="margin:22px 0;text-align:right">'), "图片对齐方式应保留到外层段落", output);
            assert(output.includes("list-style-type:square") && output.includes("font-size:15px"), "列表样式和列表项字号应保留", output);
            assert(output.includes(">2. 搭建内容创作工作流，持续 Vibe Coding</h2>"), "飞书 CSS counter-reset 标题应保留为 2，而不能重置成 1", output);
            assert(output.includes(">3. 内容创作倒逼我学习最新资讯和技术</h2>"), "飞书 data-list-index=3 标题应在清理 data 属性前保留续号", output);
            assert(output.includes(">4. 把可复用的能力沉淀成 Skills</h2>"), "飞书 seq=4 标题应继续保留原文序号", output);
            assert(output.includes(">5. 嵌套在列表项里的飞书标题</h2>") && output.includes("list-style-type:none"), "嵌套在列表项里的标题应读取 ol start，并关闭外层重复 marker", output);
            assert(!output.includes("display:list-item") && !output.includes("counter-reset") && !output.includes(">1. 搭建内容创作工作流"), "飞书标题不应继续依赖会重置编号的列表计数样式", output);
            assert(output.includes('<ol start="1"') && output.includes('<ol start="2"') && output.includes('<li value="3"'), "章节内从 1 开始的列表及显式续号列表都应保留", output);
            assert(includesAll(output, ["color:#245bdb", "font-size:14px", "background-color:#f2f5ff"]), "表格单元格颜色、字号和背景应保留", output);
            assert(output.includes('colspan="2"') && output.includes('rowspan="2"'), "表格合并单元格的 colspan 和 rowspan 应保留", output);
            assert(/已识别\\s+\\d+\\s+个带样式节点/.test(report), "格式识别报告应该显示样式节点数量", report);
            assert(report.includes("图片 3"), "格式识别报告应该统计图片", report);
            assert(report.includes("链接 1"), "格式识别报告应该统计安全链接", report);
            assert(!doc.querySelector(".intro-details").open, "实现逻辑详情应默认折叠，保持页面简洁");

            frameElement.style.width = "390px";
            doc.body.offsetWidth;
            assert(
              doc.documentElement.scrollWidth <= doc.documentElement.clientWidth + 1,
              "390px 手机宽度不应出现横向溢出",
              "scrollWidth=" + doc.documentElement.scrollWidth + ", clientWidth=" + doc.documentElement.clientWidth,
            );

            await frame.copyRich();
            assert(clipboardWrites.length === 1, "复制富文本时应写入一次剪贴板");
            const clipboardItem = clipboardWrites[0][0];
            assert(clipboardItem.types.includes("text/html"), "剪贴板应包含 text/html 富文本");
            assert(clipboardItem.types.includes("text/plain"), "剪贴板应包含 text/plain 纯文本");
            const copiedHtml = await clipboardItem.items["text/html"].text();
            const copiedPlain = await clipboardItem.items["text/plain"].text();
            assert(copiedHtml.includes("font-size:26px") && copiedHtml.includes("text-indent:2em"), "复制到公众号的 HTML 应保留关键内联样式", copiedHtml);
            assert(copiedHtml.includes("background-color:#f6f8fb") && copiedHtml.includes('href="https://example.com/demo"'), "复制到公众号的 HTML 应保留引用块和链接", copiedHtml);
            assert(copiedHtml.includes('src="https://example.com/feishu-image.png"') && copiedHtml.includes("width:320px"), "复制到公众号的 HTML 应保留图片和图片样式", copiedHtml);
            assert(copiedHtml.includes('src="https://example.com/lazy-feishu-image.png"') && copiedHtml.includes("height:160px"), "复制到公众号的 HTML 应保留 data-src 图片和尺寸", copiedHtml);
            assert(copiedHtml.includes('src="https://example.com/right-image.png"') && copiedHtml.includes("text-align:right"), "复制到公众号的 HTML 应保留图片对齐", copiedHtml);
            assert(copiedHtml.includes('colspan="2"') && copiedHtml.includes('rowspan="2"'), "复制到公众号的 HTML 应保留表格合并单元格", copiedHtml);
            assert(copiedPlain.includes("岗位和角色在融合") && copiedPlain.includes("正文段落需要保留"), "复制到公众号的纯文本应保留正文内容", copiedPlain);
            assert(copiedPlain.includes("引用块需要保留") && copiedPlain.includes("安全链接"), "复制到公众号的纯文本应保留引用和链接文本", copiedPlain);
            assert(doc.querySelector("#statusText").innerText.includes("已复制富文本"), "复制成功后应提示已复制富文本");

            doc.querySelector('[data-wechat-style="editorial"]').click();
            const smartOutput = doc.querySelector("#preview").innerHTML;
            const smartReport = doc.querySelector("#formatReport").innerText;
            assert(doc.querySelector('[data-format-mode="smart"]').classList.contains("active"), "点击公众号风格后应自动切到公众号排版");
            assert(doc.querySelector('[data-wechat-style="editorial"]').classList.contains("active"), "人物红风格按钮应进入选中态");
            const numberedHeadingCount = (smartOutput.match(/border-left:5px solid #b42318/g) || []).length;
            const stageHeadingCount = (smartOutput.match(/border-left:4px solid #b42318/g) || []).length;
            assert(numberedHeadingCount >= 2, "同级编号标题应使用标准 H2 竖线样式", smartOutput);
            assert(stageHeadingCount === 0, "阶段标题不应再使用主题色竖线", smartOutput);
            assert(!smartOutput.includes("border-bottom:3px solid #b42318"), "编号标题不应被提升为 H1 横线样式", smartOutput);
            assert(smartOutput.includes(">2. 搭建内容创作工作流，持续 Vibe Coding</h2>"), "公众号排版也应保留飞书标题 seq=2", smartOutput);
            assert(smartOutput.includes(">3. 内容创作倒逼我学习最新资讯和技术</h2>"), "公众号排版也应保留飞书标题 seq=3", smartOutput);
            assert(smartOutput.includes(">4. 把可复用的能力沉淀成 Skills</h2>"), "公众号排版也应保留飞书标题 seq=4", smartOutput);
            assert(smartOutput.includes(">5. 嵌套在列表项里的飞书标题</h2>") && smartOutput.includes("list-style-type:none"), "公众号排版应避免嵌套标题出现双编号", smartOutput);
            assert(smartOutput.includes('<ol start="1"') && smartOutput.includes('<ol start="2"') && smartOutput.includes('<li value="3"'), "公众号排版应保留章节内列表起点及显式续号", smartOutput);
            assert(smartOutput.includes("<h2") && smartOutput.includes("阶段 1：级联式语音系统"), "阶段类标题应按 H2 输出", smartOutput);
            assert(!smartOutput.includes("<h1") && smartOutput.includes("阶段二：轮次式语音模型"), "飞书 H1 形式的阶段标题也应降为 H2", smartOutput);
            assert(
              smartOutput.includes('<h2 style="margin:24px 0 12px;color:#1f2329;font-size:19px;line-height:1.55;font-weight:700;letter-spacing:0">阶段 1：级联式语音系统</h2>'),
              "阶段标题应使用正文黑、19px / 700 且无竖线的纯文字 H2 视觉",
              smartOutput,
            );
            assert(smartOutput.includes("黄色高亮") && smartOutput.includes("font-weight:700"), "公众号排版应把正文重点统一处理为加粗", smartOutput);
            assert(!smartOutput.includes("background-color:#ffe8cc"), "公众号排版中的正文重点不应再使用高亮底色", smartOutput);
            assert(
              smartOutput.includes("background-color:#f6f7f8") &&
                smartOutput.includes("00 的感受") &&
                smartOutput.includes("border-left:4px solid #f43f5e") &&
                smartOutput.includes("color:#1f2329") &&
                smartOutput.includes("font-size:15px") &&
                smartOutput.includes("font-weight:600"),
              "00 的感受段落应识别为浅灰底、主题竖线、默认文字色的个人感受块",
              smartOutput,
            );
            assert(
              /<span style="[^"]*color:#1f2329[^"]*">内部蓝色也要回到正文色<\\/span>/.test(smartOutput),
              "个人感受内部从飞书带来的蓝色 span 也应改成正文标准色",
              smartOutput,
            );
            assert(
              smartOutput.includes("background-color:#f6f7f8") &&
                smartOutput.includes("border-left:3px solid #d0d5dd") &&
                smartOutput.includes("color:#1f2329") &&
                smartOutput.includes("font-weight:400"),
              "引用块应使用浅灰底、灰色细竖线、默认文字色和正常字重",
              smartOutput,
            );
            assert(
              /<span style="[^"]*color:#1f2329[^"]*">引用内部蓝色也要回到正文色<\\/span>/.test(smartOutput),
              "引用内部从飞书带来的蓝色 span 也应改成正文标准色",
              smartOutput,
            );
            assert(smartReport.includes("公众号一键排版 · 人物红") && smartReport.includes("感受 1"), "格式报告应显示当前风格和个人感受数量", smartReport);

            doc.querySelector('[data-wechat-style="business"]').click();
            const businessOutput = doc.querySelector("#preview").innerHTML;
            assert(businessOutput.includes("color:#8a5a00") && businessOutput.includes("border-left:4px solid #d19a25"), "切换商业金后预览应立即换成商业金标题和个人感受竖线配色", businessOutput);

            document.body.dataset.testResult = "pass";
            document.body.textContent = JSON.stringify({ ok: true, report: smartReport });
          } catch (error) {
            document.body.dataset.testResult = "fail";
            document.body.textContent = JSON.stringify({ ok: false, message: error.message });
          }
        }, 120);
      }

      appFrame.addEventListener("load", startTest);
      if (appFrame.contentDocument && appFrame.contentDocument.readyState !== "loading") {
        startTest();
      }
      setTimeout(startTest, 200);
    </script>
  </body>
</html>`;

try {
  fs.writeFileSync(runnerPath, runnerHtml);
  const result = spawnSync(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--allow-file-access-from-files",
      "--virtual-time-budget=2500",
      "--dump-dom",
      `file://${runnerPath}`,
    ],
    { encoding: "utf8" },
  );

  const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0 || !combinedOutput.includes('data-test-result="pass"')) {
    console.error(combinedOutput);
    process.exit(result.status || 1);
  }

  console.log("格式保真回归验证通过：字体、字号、颜色、分段、列表、表格样式均输出为公众号可用的内联样式，页面默认简洁、移动端无横向溢出，富文本复制写入 text/html 和 text/plain。");
} finally {
  fs.rmSync(runnerPath, { force: true });
}

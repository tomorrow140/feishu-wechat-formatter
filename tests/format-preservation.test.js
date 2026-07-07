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
          table td { color: #245bdb; font-size: 14px; background-color: #f2f5ff; }
        </style>
        <div class="doc" data-lark-record-data="removed">
          <p class="title">1、岗位和角色在融合，但 PM 不会消失</p>
          <p class="indent">正文段落需要保留字体、字号、颜色、行距和首行缩进。</p>
          <p>这一句里有 <span class="accent">红色重点</span> 和 <strong>加粗文字</strong>。</p>
          <ul style="list-style-type: square;"><li style="font-size: 15px;">列表项保留字号和项目符号</li></ul>
          <table><tr><td>表格单元格保留颜色和背景</td></tr></table>
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

      document.querySelector("#app").addEventListener("load", () => {
        setTimeout(() => {
          try {
            const frame = document.querySelector("#app").contentWindow;
            const doc = frame.document;
            doc.querySelector("#rawEditor").innerHTML = feishuLikeHtml;
            frame.convert();

            const output = doc.querySelector("#preview").innerHTML;
            const report = doc.querySelector("#formatReport").innerText;
            const sourceModeActive = doc.querySelector('[data-format-mode="source"]').classList.contains("active");

            assert(sourceModeActive, "默认模式应该是保持原格式");
            assert(output.includes("岗位和角色在融合"), "应该保留正文内容", output);
            assert(!/<style|class=|data-lark/i.test(output), "输出不应保留 style/class/data-lark 等飞书或页面专用标记", output);
            assert(includesAll(output, ["color:rgb(36, 91, 219)", "font-size:26px", "font-weight:800"]), "标题颜色、字号、加粗应保留为内联样式", output);
            assert(includesAll(output, ["text-indent:2em", "line-height:2"]), "正文分段的缩进和行距应保留", output);
            assert(includesAll(output, ["color:#d83931", "font-size:18px", "font-weight:700"]), "重点文字颜色、字号和加粗应保留", output);
            assert(output.includes("list-style-type:square") && output.includes("font-size:15px"), "列表样式和列表项字号应保留", output);
            assert(includesAll(output, ["color:#245bdb", "font-size:14px", "background-color:#f2f5ff"]), "表格单元格颜色、字号和背景应保留", output);
            assert(/已识别\\s+\\d+\\s+个带样式节点/.test(report), "格式识别报告应该显示样式节点数量", report);

            document.body.dataset.testResult = "pass";
            document.body.textContent = JSON.stringify({ ok: true, report });
          } catch (error) {
            document.body.dataset.testResult = "fail";
            document.body.textContent = JSON.stringify({ ok: false, message: error.message });
          }
        }, 120);
      });
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

  console.log("格式保真回归验证通过：字体、字号、颜色、分段、列表、表格样式均输出为公众号可用的内联样式。");
} finally {
  fs.rmSync(runnerPath, { force: true });
}

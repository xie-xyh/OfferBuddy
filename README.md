<div align="center">
  <img src="assets/offerbuddy-logo-v3-128.png" alt="OfferBuddy Logo" width="96" />
  <h1>OfferBuddy</h1>
  <p><strong>AI 驱动的简历自动填写 Chrome 扩展</strong></p>
  <p>识别招聘网页表单，按你的简历（Markdown）一键填写<br/>过程全程可见，只填不提交，经历用原文</p>
  <p>
    <a href="#-功能特性">功能特性</a> ·
    <a href="#-快速开始">快速开始</a> ·
    <a href="#-支持的模型厂商">模型厂商</a> ·
    <a href="#-工作原理">工作原理</a> ·
    <a href="#-路线图">路线图</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome MV3" />
    <img src="https://img.shields.io/badge/version-0.5.1-0E8A66" alt="version" />
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="license" />
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
  </p>
</div>

---

## ✨ 功能特性

- **⚡ 一键填写** — 在招聘页面点一下，自动识别表单字段并调用大模型填写，全程只需几秒
- **👀 过程全程可见** — 页面右上角实时进度徽标；自动滚动跟随：蓝色脉冲 = 正在填，绿色描边 = 已填好
- **📄 经历用原文** — 项目/工作/教育等长经历逐字使用简历原文，不压缩、不概括、不改写
- **📥 上传简历解析** — 支持 PDF / DOCX / MD / TXT，本地提取文本（文件不离开本机），AI 整理为 Markdown；内容为空直接导入，非空可选覆盖 / 追加 / 取消
- **🧩 添加多条经历** — 识别「＋ 添加教育/工作/项目经历」按钮，按简历段数自动补齐条目再填写
- **🎯 选择类字段精准匹配** — 下拉框精确/包含/数字三级匹配（年龄、年限、毕业年份）；日期兼容「1995年6月」等中文写法
- **🧱 多段经历对齐** — 同名字段自动编号（教育经历 #1 / #2），按简历经历顺序一一对应填写
- **✋ 不覆盖已填内容** — 已有值的字段默认跳过，勾选「覆盖已有内容」才重写；填错可安全重跑
- **✅ 本地校验 + 收尾提醒** — 邮箱/电话/日期/链接按类型校验，不合法标黄；结束后必填但留空的字段统一标黄
- **🧩 自定义控件** — 支持 contenteditable 富文本；实验性支持 div 伪下拉（自动展开快照选项后点选）
- **🔁 失败自动重试** — 网络抖动/超时/5xx/返回格式异常时自动重试，最多 3 次
- **⚛️ 框架兼容** — 原生 setter + `input`/`change` 事件写值，React/Vue 受控组件不会被框架刷掉
- **🤖 多厂商模型** — DeepSeek / OpenAI / Moonshot（Kimi）/ 智谱 GLM / 通义千问 / 任意 OpenAI 兼容接口，Key 按厂商分存
- **🛡 安全默认** — 绝不自动提交表单；简历里没有的信息留空不编造；按需注入，不常驻后台

## 🚀 快速开始

### 1. 安装

```bash
git clone git@github.com:xie-xyh/OfferBuddy.git
```

打开 `chrome://extensions` → 右上角开启「开发者模式」→「加载已解压的扩展程序」→ 选择克隆下来的 `OfferBuddy` 目录。

### 2. 配置

点击扩展图标 →「设置」：

| 配置项 | 说明 |
| --- | --- |
| **厂商** | 卡片选择，自动填充 Base URL 与模型候选 |
| **Key** | 对应厂商的 API Key，仅存本机 `chrome.storage.local`，按厂商分开保存 |
| **模型** | 下拉选择，选「自定义」厂商时可自由输入 |
| **简历** | 粘贴完整 Markdown 简历；或点「上传文件解析」导入 PDF / DOCX / MD / TXT |
| **填写偏好** | 可选，如「期望薪资一律填面议」 |

### 3. 使用

1. 打开招聘网站的投递/申请表页面
2. 点扩展图标 →「自动填写本页」
3. 看着它逐个字段填写（添加条目 → 生成内容 → 逐字段回填）
4. **逐项核对，手动提交**

### 本地演示

```bash
cd OfferBuddy && python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/demo/form.html
```

演示页包含：模拟 React 受控组件输入框、「添加教育经历」按钮、年龄/毕业年份/工作年限等选择类字段。建议简历里写两段教育经历来测试完整能力。

## 🤖 支持的模型厂商

| 厂商 | 候选模型 | 默认 |
| --- | --- | --- |
| DeepSeek | `deepseek-v4-flash` / `deepseek-v4-pro` | `deepseek-v4-flash` |
| OpenAI | `gpt-5.6-luna` / `gpt-5.6-terra` / `gpt-5.6` / `gpt-5.5` / `gpt-5.4-mini` | `gpt-5.6-luna` |
| Moonshot（Kimi） | `kimi-k3` / `kimi-k2.6` / `kimi-k2.7-code` | `kimi-k3` |
| 智谱 GLM | `glm-4.7-flash` / `glm-4.7` / `glm-5.1` / `glm-5.2` | `glm-4.7-flash` |
| 通义千问 | `qwen3.6-flash` / `qwen3.7-plus` / `qwen3.7-max` | `qwen3.6-flash` |
| 自定义 | 任意 OpenAI 兼容接口 | — |

> 模型列表核实于 2026-07；旧模型 ID（如 `deepseek-chat`）会自动映射到新型号。

## 🧠 工作原理

```
点击「自动填写本页」
        │
        ▼
content.js 按需注入 ──► 识别表单字段（label / 分组 / 选项 / 必填）
        │
        ▼
检测到「＋ 添加」按钮？ ──► PLAN_ENTRIES：大模型按简历段数决定点几次 ──► 自动点击补齐条目
        │
        ▼
GENERATE_FILL：简历 + 字段上下文 ──► LLM（JSON mode, temperature 0）
        │
        ▼
逐字段可见回填：滚动定位 → 蓝色脉冲 → 原生 setter 写入 → 绿色描边
        │
        ▼
人工核对，手动提交（插件永远不替你点提交）
```

关键技术点：

- **受控组件兼容**：通过 `HTMLInputElement.prototype.value` 原生 setter 写值并派发事件，绕过 React/Vue 的值跟踪
- **分组语义**：每个字段携带所在板块标题（如「项目经验」），复合字段（起止时间的年/月下拉）按语义拆分填写
- **条目规划与填写分离**：两次 LLM 调用，先定结构（点几次添加），再定内容（每个字段填什么）

## 🛡 安全与边界

- API Key 仅存本机浏览器，按厂商分开存储，代码仓库不含任何 Key
- 点击填写时，简历与页面字段会发送给你配置的 API 地址，属预期行为
- 不自动提交、不绕过验证码/登录、不读取与填写无关的页面数据
- 权限最小化：只要 `storage` / `activeTab` / `scripting`，按需注入而非全站常驻
- 多步表单：填完当前页后手动点「下一步」，再点一次「自动填写本页」即可
- 「添加条目」基于按钮文本与容器位置的启发式识别，个别站点若未识别，可先手动添加再触发填写
- `<input type="file">`（附件上传）受浏览器安全限制无法自动填充

## 📁 项目结构

```
OfferBuddy/
├── manifest.json        # MV3 清单（permissions: storage / activeTab / scripting）
├── background.js        # Service Worker：prompt 构造、多厂商 API 调用
├── content.js           # 页面注入：字段识别 / 添加条目 / 回填 / 过程可视化
├── popup.html / .js     # 弹窗：触发填写、展示结果
├── options.html / .js   # 设置页：厂商 / Key / 模型 / 简历 / 偏好
├── shared/              # 纯逻辑 UMD 模块（浏览器与 Node 测试共用）
│   ├── core.js          # 校验 / 匹配 / 日期归一 / 分组编号 / JSON 解析
│   └── providers.js     # 厂商预设
├── tests/               # node:test 测试（npm test）
├── styles.css           # popup 与设置页样式
├── vendor/              # 本地解析库（pdf.js / mammoth / marked / DOMPurify）
├── assets/              # 图标
└── demo/form.html       # 本地模拟招聘表单（含受控组件与添加条目模拟）
```

## 🔧 开发

```bash
npm test            # 运行测试（node:test，零依赖）
```

- **先测试后提交**：新功能 / 修复必须先更新 `tests/` 并保证 `npm test` 全绿（已内置 pre-commit 钩子强制执行，克隆后运行一次 `git config core.hooksPath .githooks` 启用）
- 纯逻辑一律放 `shared/`（UMD，Node 可直接 require 测试），DOM / chrome API 代码保持薄层
- 详细约定见 [AGENTS.md](AGENTS.md)

## 🗺 路线图

- [ ] 字段填写历史与按站点自定义映射
- [ ] 多简历切换、按岗位生成求职信
- [ ] 附件（PDF 简历）管理提醒
- [ ] Firefox 适配
- [ ] 上架 Chrome Web Store

## 🤝 贡献

欢迎 Issue 和 PR！如果你有某个招聘网站的填写适配问题，附上页面结构（字段类型、是否多步表单）会非常有帮助。

## 📄 License

[MIT](LICENSE) © xie-xyh

---

<div align="center">
  如果这个项目帮你省下了重复填表的时间，欢迎点一个 ⭐️
</div>

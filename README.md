<div align="center">
  <img src="assets/offerbuddy-logo-v3-128.png" alt="OfferBuddy" width="88" />
  <h1>OfferBuddy</h1>
  <p>把简历交给浏览器，少填几遍重复的招聘表单。</p>
  <p>
    <a href="#快速开始">快速开始</a> ·
    <a href="#支持范围">支持范围</a> ·
    <a href="#数据与权限">数据与权限</a> ·
    <a href="#开发">开发</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3" />
    <img src="https://img.shields.io/badge/version-0.5.4-0E8A66" alt="version 0.5.4" />
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
  </p>
</div>

![OfferBuddy 自动填写招聘表单](docs/images/fill-form.png)

OfferBuddy 是一个 Chrome 扩展。它读取当前招聘页面的表单结构，根据你的简历生成填写内容，再把结果逐项写回页面。

填写过程会直接显示在页面上，已有内容默认保留，提交按钮始终由你自己点击。

## 它解决什么问题

同一份姓名、教育经历和项目描述，换个招聘网站往往还要再填一次。OfferBuddy 保存一份 Markdown 简历，在需要时完成这些重复工作：

- 从 PDF、DOCX、Markdown 或 TXT 导入简历
- 识别普通输入框、下拉框、单选框、复选框和富文本框
- 按简历数量补充多段教育、工作或项目经历
- 跳过已有内容，并标出仍未填写的必填项
- 使用 DeepSeek、OpenAI、Kimi、GLM、通义千问或其他 OpenAI 兼容接口

## 快速开始

### 1. 安装扩展

```bash
git clone git@github.com:xie-xyh/OfferBuddy.git
```

打开 `chrome://extensions`，开启右上角的「开发者模式」，点击「加载已解压的扩展程序」，选择刚刚克隆的 `OfferBuddy` 目录。

代码更新后，需要回到这个页面点击一次「重新加载」。

### 2. 配置模型

打开扩展设置，选择厂商并填写 API Key。点击「测试并保存」，看到绿色提示后即可继续。

![配置 API](docs/images/setup-api.png)

Key 只保存在 `chrome.storage.local`。不同厂商的 Key 分开存储，切换厂商时不会互相覆盖。

### 3. 导入简历

进入「简历」区域，点击编辑，然后上传 PDF、DOCX、Markdown 或 TXT 文件。OfferBuddy 会先在本地提取文字，再调用你配置的模型整理为 Markdown。

![导入并检查简历](docs/images/import-resume.png)

解析完成后先检查内容，再点击保存。你也可以直接粘贴已经整理好的 Markdown。

### 4. 填写招聘页面

打开投递页面，点击扩展图标，再点击「自动填写本页」。页面会滚动到正在处理的字段，并用绿色描边标记已经填好的内容。

最后逐项核对并手动提交。如果页面有下一步，进入下一页后再运行一次即可。

## 支持范围

| 能力 | 当前支持 |
| --- | --- |
| 浏览器 | Chrome，Manifest V3 |
| 简历文件 | PDF、DOCX、Markdown、TXT |
| 表单控件 | input、textarea、select、radio、checkbox、contenteditable |
| 前端框架 | 原生页面，以及常见的 React、Vue 受控输入框 |
| 模型接口 | 内置厂商和 OpenAI 兼容接口 |
| 多段经历 | 教育、工作、实习、项目等可重复条目 |

模型候选列表维护在 [`shared/providers.js`](shared/providers.js)。自定义接口需要提供 Base URL 和模型名。

以下情况仍需手动处理：

- 文件上传控件。浏览器不允许扩展替你选择本地附件
- 验证码、登录和提交操作
- 结构非常规且无法识别的自定义下拉框
- 需要跨页面保存状态的复杂流程

## 工作方式

```mermaid
flowchart LR
    A["简历文件"] --> B["本地提取文字"]
    B --> C["模型整理为 Markdown"]
    C --> D["保存在浏览器"]
    D --> E["读取当前页面字段"]
    E --> F["模型生成字段映射"]
    F --> G["逐项写回并等待核对"]
```

字段识别和页面写入由内容脚本完成。模型只负责整理简历和生成字段映射，不会直接操作网页。

项目、工作和教育描述会优先使用简历原文。简历里没有的信息不会自动补写。

## 数据与权限

- API Key 存在浏览器本地存储中，不会写入仓库
- PDF 和 DOCX 的文字提取在本地完成
- 整理简历时，提取出的文字会发送到你配置的模型接口
- 填写表单时，简历和当前页面字段会发送到同一接口
- 扩展不会点击提交，也不会处理验证码或绕过登录

扩展使用 `storage`、`activeTab` 和 `scripting` 权限。自定义 API 地址会单独请求对应的主机权限。

## 本地演示

仓库带有一个不发送网络请求的招聘表单，可用于检查字段识别和多段经历：

```bash
python3 -m http.server 8080
```

浏览器打开 [http://localhost:8080/demo/form.html](http://localhost:8080/demo/form.html)，然后运行 OfferBuddy。

## 开发

项目不依赖构建工具，加载仓库目录即可调试。

```bash
npm test
git config core.hooksPath .githooks
```

测试使用 Node 内置的 `node:test`。任何功能改动或 bug 修复都要先更新 `tests/`，再提交代码。纯逻辑放在 `shared/`，DOM 和 `chrome.*` 调用保持在页面脚本中。

主要文件：

| 文件 | 用途 |
| --- | --- |
| `background.js` | 调用模型接口，处理长请求和重试 |
| `content.js` | 识别字段并写回页面 |
| `options.js` | API、简历和填写偏好设置 |
| `shared/` | 浏览器与 Node 测试共用的纯逻辑 |
| `tests/` | 单元测试和解析库冒烟测试 |
| `demo/form.html` | 本地演示表单 |

更完整的维护约定见 [`AGENTS.md`](AGENTS.md)。

## 后续计划

- 按站点保存字段映射
- 多份简历与岗位切换
- 求职信生成
- Firefox 支持
- Chrome Web Store 发布

## 许可证

[MIT](LICENSE) © xie-xyh

# OfferBuddy — AI 简历自动填写（Chrome 扩展）

基于 DeepSeek 大模型的 Manifest V3 Chrome 扩展：在招聘网页上一键识别表单字段，按你的简历（Markdown）自动填写，填充结果绿框高亮，人工核对后自行提交。

## 功能

- 按需注入：点击 popup 按钮才对当前页生效，不常驻、不读取浏览历史
- 字段识别：覆盖 `input`（text/email/tel/number/date/month/url 等）、`textarea`、`select`、`radio`、`checkbox`，自动提取 label / placeholder / 选项
- 大模型填写：简历 + 页面字段发给 DeepSeek（默认 `deepseek-chat`），返回「字段序号 → 值」
- 框架兼容：用原生 setter + `input`/`change` 事件写值，React/Vue 受控组件不会被清掉
- 安全默认：**绝不自动提交表单**；简历里没有的信息留空不编造；已填字段绿框高亮便于核对

## 安装（开发者模式）

1. 打开 `chrome://extensions`，右上角开启「开发者模式」
2. 点「加载已解压的扩展程序」，选择本目录（`chrome-resume-autofill/`）
3. 固定扩展图标到工具栏

## 配置

右键扩展图标 →「选项」，或点 popup 里的「打开设置」：

- **API Key**：你的 DeepSeek Key（`sk-...`），只保存在本机 `chrome.storage.local`
- **Base URL**：默认 `https://api.deepseek.com`；如用自建代理改成你的地址（保存时会请求该站点权限）
- **模型**：默认 `deepseek-chat`
- **我的简历（Markdown）**：粘贴完整简历
- **附加填写指令**：可选，如「期望薪资一律填面议」

「测试连接」会请求 `GET {Base URL}/models` 验证 Key 可用。

## 使用

1. 打开招聘网站的投递/申请表页面（http/https）
2. 点扩展图标 →「自动填写本页」
3. 等待几秒（大模型调用约 5–20s），已填字段会出现绿框
4. **逐项核对，手动提交**

本地演示：在本目录起个静态服务打开演示表单——

```bash
cd chrome-resume-autofill && python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/demo/form.html
```

演示页包含一个「模拟 React 受控组件」的输入框，用来验证填写值不会被框架刷掉。

## 安全与边界

- API Key 仅存本机浏览器；代码仓库中不包含任何 Key
- 点击填写时，简历内容与页面字段会发送给你配置的 API 地址（默认 DeepSeek），属预期行为
- 不自动提交、不绕过验证码/登录、不读取与填写无关的页面数据
- 多步表单：填完当前页后手动点「下一步」，再点一次「自动填写本页」即可
- `<input type="file">`（附件上传）出于浏览器安全限制无法自动填充

## 目录结构

```
manifest.json      MV3 清单（permissions: storage / activeTab / scripting）
background.js      Service Worker：构造 prompt、调 DeepSeek API
content.js         页面注入：字段识别 + 回填 + 高亮
popup.html/.js     弹窗：触发填写、展示结果
options.html/.js   设置页：Key / Base URL / 模型 / 简历 / 附加指令
styles.css         popup / options 样式
demo/form.html     本地模拟招聘表单（含受控组件模拟）
```

## 后续可扩展

- 字段填写历史与按站点自定义映射
- 多简历切换、按岗位生成求职信
- 附件（PDF 简历）管理提醒

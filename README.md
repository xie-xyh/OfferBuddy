# OfferBuddy — AI 简历自动填写（Chrome 扩展）

基于大模型的 Manifest V3 Chrome 扩展：在招聘网页上一键识别表单字段，按你的简历（Markdown）自动填写，填充结果绿框高亮，人工核对后自行提交。支持 DeepSeek / OpenAI / Moonshot（Kimi）/ 智谱 GLM / 通义千问及任意 OpenAI 兼容接口。

## 功能

- 按需注入：点击 popup 按钮才对当前页生效，不常驻、不读取浏览历史
- 字段识别：覆盖 `input`（text/email/tel/number/date/month/url 等）、`textarea`、`select`、`radio`、`checkbox`，自动提取 label / placeholder / 选项
- 经历用原文：项目/工作/教育等长经历字段直接使用简历原文，不压缩、不改写
- 过程可视化：页面右上角实时徽标显示进度；填写时自动滚动到对应字段，蓝色脉冲表示「正在填」、绿色描边表示「已填」
- 添加条目：识别「添加教育经历/工作经历」等按钮，由大模型按简历段数自动点击补全条目后再填
- 选择类匹配：select 精确/包含/数字三级匹配（年龄、年限、毕业年份等）；日期兼容「1995年6月」等中文写法
- 框架兼容：用原生 setter + `input`/`change` 事件写值，React/Vue 受控组件不会被清掉
- 安全默认：**绝不自动提交表单**；简历里没有的信息留空不编造

## 安装（开发者模式）

1. 打开 `chrome://extensions`，右上角开启「开发者模式」
2. 点「加载已解压的扩展程序」，选择本目录（`chrome-resume-autofill/`）
3. 固定扩展图标到工具栏

## 配置

右键扩展图标 →「选项」，或点 popup 里的「设置」：

- **厂商**：DeepSeek / OpenAI / Moonshot（Kimi）/ 智谱 GLM / 通义千问 / 自定义（OpenAI 兼容接口）
- **Key**：对应厂商的 API Key，只保存在本机 `chrome.storage.local`，按厂商分开存储、互不影响
- **Base URL**：选厂商后自动填入，可改为自建代理地址（保存时会请求该站点权限）
- **模型**：选厂商后给出候选，可自由输入其他模型名
- **简历**：粘贴完整 Markdown 简历
- **填写偏好**：可选，如「期望薪资一律填面议」

「测试连接」优先请求 `GET {Base URL}/models`，该接口不存在时降级为最小对话请求验证。

## 使用

1. 打开招聘网站的投递/申请表页面（http/https）
2. 点扩展图标 →「自动填写本页」
3. 页面右上角出现进度徽标，表单会自动滚动跟随填写过程（添加条目 → 大模型生成 → 逐字段填写）
4. **逐项核对，手动提交**

本地演示：在本目录起个静态服务打开演示表单——

```bash
cd chrome-resume-autofill && python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/demo/form.html
```

演示页包含：「模拟 React 受控组件」输入框（验证填写值不被框架刷掉）、「添加教育经历」按钮（验证多条目能力）、年龄/毕业年份/工作年限等选择类字段。建议简历里写两段教育经历来测试。

## 安全与边界

- API Key 仅存本机浏览器；代码仓库中不包含任何 Key
- 点击填写时，简历内容与页面字段会发送给你配置的 API 地址（默认 DeepSeek），属预期行为
- 不自动提交、不绕过验证码/登录、不读取与填写无关的页面数据
- 多步表单：填完当前页后手动点「下一步」，再点一次「自动填写本页」即可
- 「添加条目」基于按钮文本与容器位置的启发式识别，个别结构特殊的站点若未自动添加，可先手动点「添加」再触发填写
- `<input type="file">`（附件上传）出于浏览器安全限制无法自动填充

## 目录结构

```
manifest.json      MV3 清单（permissions: storage / activeTab / scripting）
background.js      Service Worker：构造 prompt、调 DeepSeek API
content.js         页面注入：字段识别 + 添加条目 + 回填 + 过程可视化
popup.html/.js     弹窗：触发填写、展示结果
options.html/.js   设置页：Key / Base URL / 模型 / 简历 / 附加指令
styles.css         popup / options 样式
demo/form.html     本地模拟招聘表单（含受控组件模拟）
```

## 后续可扩展

- 字段填写历史与按站点自定义映射
- 多简历切换、按岗位生成求职信
- 附件（PDF 简历）管理提醒

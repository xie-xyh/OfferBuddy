# AGENTS.md — OfferBuddy 维护约定

本文件约束所有在本仓库工作的 AI / 人类维护者。

## 测试（硬性要求）

- **先测试后提交**：任何新功能、行为改动、bug 修复，必须先写或更新 `tests/` 下的测试，并确认 `npm test`（即 `node --test tests/`）全绿，才允许提交。
- 仓库配有 pre-commit 钩子自动跑测试，未通过会拒绝提交。启用方式（克隆后执行一次）：
  ```bash
  git config core.hooksPath .githooks
  ```
- **可测试性约定**：纯逻辑（字段校验、选项匹配、日期归一、分组编号、JSON 解析、厂商预设等）必须放在 `shared/` 下的 UMD 模块（`shared/core.js` / `shared/providers.js`），浏览器挂 `globalThis.OB` / `OB_PROVIDERS`，Node 测试直接 `require`。DOM / chrome.* API 代码保持薄层，不写进可测逻辑。
- 新功能没有对应测试的 PR / 提交，视为未完成。

## 代码结构

```
manifest.json        MV3 清单
background.js        Service Worker（importScripts shared/core.js）
content.js           页面注入（popup 注入时先注入 shared/core.js）
popup.* / options.*  弹窗 / 设置页（options.html 需引入 shared 两个模块）
shared/core.js       纯逻辑（UMD）
shared/providers.js  厂商预设（UMD；模型列表变更需注明核实日期与来源）
tests/               node:test 测试
vendor/              第三方库（pdf.js / mammoth / marked / DOMPurify）
demo/form.html       本地演示表单
```

## 提交与版本

- 提交信息用中文，前缀遵循 `feat: / fix: / docs: / chore: / test:`。
- 用户可见改动同步更新 `manifest.json` 版本号（feat→minor、fix→patch）与 README 顶部版本徽章。
- 模型列表更新必须来自官方文档或 API 实测，禁止凭印象填写。

## 安全

- 任何 API Key 不得写入仓库文件；Key 只存 `chrome.storage.local`，按厂商分存。
- 不引入需要联网的第三方服务（简历解析库必须本地化，放 `vendor/`）。

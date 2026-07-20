/* OfferBuddy — vendor 解析库冒烟测试
   用 tests/fixtures 下的真实样本验证 pdf.js / mammoth 能提取文本，
   防止 vendor 文件损坏或 API 变化导致「上传解析」静默失效。
   运行：node --test */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const VENDOR = p => path.join(__dirname, '..', 'vendor', p);
const FIXTURE = p => path.join(__dirname, 'fixtures', p);

test('pdf.js 能提取 PDF 文本', async () => {
  const pdfjsLib = require(VENDOR('pdf.min.js'));
  pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR('pdf.worker.min.js');
  const data = new Uint8Array(fs.readFileSync(FIXTURE('sample.pdf')));
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  assert.ok(pdf.numPages >= 1);
  const page = await pdf.getPage(1);
  const tc = await page.getTextContent();
  const text = tc.items.map(it => it.str).join(' ');
  assert.match(text, /Zhang San Resume/);
  assert.match(text, /13800000000/);
});

test('mammoth 能提取 DOCX 文本', async () => {
  const mammoth = require(VENDOR('mammoth.browser.min.js'));
  const buf = fs.readFileSync(FIXTURE('sample.docx'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const res = await mammoth.extractRawText({ arrayBuffer: ab });
  assert.match(res.value, /Zhang San Resume/);
  assert.match(res.value, /13800000000/);
});

/* OfferBuddy — shared/core.js 单元测试
   运行：node --test tests/ */

const test = require('node:test');
const assert = require('node:assert/strict');
const OB = require('../shared/core.js');

/* ---------- validateValue ---------- */

test('validateValue: email 合法与非法', () => {
  assert.equal(OB.validateValue({ type: 'email' }, 'a@b.com'), 'a@b.com');
  assert.equal(OB.validateValue({ type: 'email' }, 'not-an-email'), null);
  assert.equal(OB.validateValue({ type: 'email' }, 'a@b'), null);
});

test('validateValue: 电话', () => {
  assert.equal(OB.validateValue({ type: 'tel' }, '13812345678'), '13812345678');
  assert.equal(OB.validateValue({ type: 'tel' }, '+86 138-1234-5678'), '+86 138-1234-5678');
  assert.equal(OB.validateValue({ type: 'tel' }, 'abc'), null);
  assert.equal(OB.validateValue({ type: 'tel' }, '12'), null);
});

test('validateValue: 数字从文本中提取', () => {
  assert.equal(OB.validateValue({ type: 'number' }, '28岁'), '28');
  assert.equal(OB.validateValue({ type: 'number' }, '约 3.5 年'), '3.5');
  assert.equal(OB.validateValue({ type: 'number' }, '很多'), null);
});

test('validateValue: URL', () => {
  assert.equal(OB.validateValue({ type: 'url' }, 'github.com/xie-xyh'), 'github.com/xie-xyh');
  assert.equal(OB.validateValue({ type: 'url' }, 'https://example.com/a'), 'https://example.com/a');
  assert.equal(OB.validateValue({ type: 'url' }, '没有空格 的网址'), null);
});

test('validateValue: 日期与月份归一', () => {
  assert.equal(OB.validateValue({ type: 'date' }, '1995年6月3日'), '1995-06-03');
  assert.equal(OB.validateValue({ type: 'date' }, '1995年6月'), '1995-06-01');
  assert.equal(OB.validateValue({ type: 'date' }, '1995/6/3'), '1995-06-03');
  assert.equal(OB.validateValue({ type: 'month' }, '1995年6月'), '1995-06');
  assert.equal(OB.validateValue({ type: 'date' }, '明年'), null);
});

test('validateValue: 普通文本透传，空值拒绝', () => {
  assert.equal(OB.validateValue({ type: 'text' }, '张三'), '张三');
  assert.equal(OB.validateValue({ type: 'textarea' }, '一段经历'), '一段经历');
  assert.equal(OB.validateValue({ type: 'text' }, '   '), null);
});

/* ---------- matchOption ---------- */

const opts = arr => arr.map(t => ({ text: t, value: t }));

test('matchOption: 精确匹配', () => {
  assert.equal(OB.matchOption(opts(['大专', '本科', '硕士']), '本科').text, '本科');
});

test('matchOption: 包含匹配', () => {
  assert.equal(OB.matchOption(opts(['应届毕业生', '1-3 年', '3-5 年']), '3-5').text, '3-5 年');
});

test('matchOption: 数字匹配（年龄/年份）', () => {
  assert.equal(OB.matchOption(opts(['25 岁', '28 岁', '30 岁']), '28').text, '28 岁');
  assert.equal(OB.matchOption(opts(['2018 年', '2019 年', '2020 年']), '2019').text, '2019 年');
});

test('matchOption: 无匹配返回 null', () => {
  assert.equal(OB.matchOption(opts(['A', 'B']), 'zzz'), null);
});

/* ---------- assignEntryNumbers ---------- */

test('assignEntryNumbers: 多段经历编号，单段不标', () => {
  const fields = [
    { group: '教育经历', label: '学校名称' },
    { group: '教育经历', label: '专业' },
    { group: '教育经历', label: '学校名称' },
    { group: '教育经历', label: '专业' },
    { group: '项目经验', label: '项目名称' },
  ];
  OB.assignEntryNumbers(fields);
  assert.equal(fields[0].entry, 1);
  assert.equal(fields[1].entry, 1);
  assert.equal(fields[2].entry, 2);
  assert.equal(fields[3].entry, 2);
  assert.equal(fields[4].entry, undefined);
});

test('assignEntryNumbers: 无 group 不参与编号', () => {
  const fields = [
    { group: '', label: '姓名' },
    { group: '', label: '姓名' },
  ];
  OB.assignEntryNumbers(fields);
  assert.equal(fields[0].entry, undefined);
  assert.equal(fields[1].entry, undefined);
});

/* ---------- isAddButtonText ---------- */

test('isAddButtonText: 识别各类添加按钮', () => {
  assert.ok(OB.isAddButtonText('＋ 添加'));
  assert.ok(OB.isAddButtonText('添加'));
  assert.ok(OB.isAddButtonText('添加教育经历'));
  assert.ok(OB.isAddButtonText('新增一条工作经历'));
  assert.ok(!OB.isAddButtonText('提交申请'));
  assert.ok(!OB.isAddButtonText(''));
  assert.ok(!OB.isAddButtonText('添加一段非常非常非常长的描述文字'));
});

/* ---------- parseJsonObject ---------- */

test('parseJsonObject: 直接 JSON / 夹杂文本 / 非法输入', () => {
  assert.deepEqual(OB.parseJsonObject('{"0":"张三"}'), { 0: '张三' });
  assert.deepEqual(OB.parseJsonObject('答案如下：{"0":"张三"} 以上'), { 0: '张三' });
  assert.equal(OB.parseJsonObject('[1,2,3]'), null);
  assert.equal(OB.parseJsonObject('hello'), null);
});

/* ---------- resolveModel ---------- */

test('resolveModel: 旧模型映射到新型号', () => {
  assert.equal(OB.resolveModel('deepseek-chat'), 'deepseek-v4-flash');
  assert.equal(OB.resolveModel('deepseek-reasoner'), 'deepseek-v4-pro');
  assert.equal(OB.resolveModel('kimi-k3'), 'kimi-k3');
});

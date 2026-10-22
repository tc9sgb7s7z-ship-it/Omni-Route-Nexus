#!/usr/bin/env node
'use strict';

// Read-only quality gate for the standalone Omn.html city registry.
// Run: node scripts/validate-cities.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
const report = (kind, file, id, message) => {
  const entry = { file, id: String(id || '-'), message };
  (kind === 'error' ? errors : warnings).push(entry);
  const command = kind === 'error' ? 'error' : 'warning';
  const escape = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A');
  console.log('::' + command + ' file=' + escape(file) + ',title=' + escape(id || 'City data') + '::' + escape(message));
};
const fail = (file, id, message) => report('error', file, id, message);
const warn = (file, id, message) => report('warning', file, id, message);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('Omn.html');
const match = html.match(/const\s+cityDatabase\s*=\s*\[([\s\S]*?)\];/);
if (!match) {
  fail('Omn.html', 'cityDatabase', '未找到 cityDatabase 配置数组');
  process.exitCode = 1;
} else {
  const entries = [...match[1].matchAll(/\{\s*name:\s*"([^"]+)"\s*,\s*country:\s*"([^"]+)"\s*,\s*file:\s*"(cities\/[^"]+\.js)"\s*\}/g)]
    .map(m => ({ name: m[1].split(' (')[0].trim(), country: m[2], file: m[3] }));
  if (!entries.length) fail('Omn.html', 'cityDatabase', '没有识别到任何城市注册项');
  const allNames = new Map(entries.map(x => [x.name, x.file]));
  const aliases = { '弗赖堡': ['弗莱堡'], '佛罗伦萨': ['弗洛伦萨', '翡冷翠'] };
  const seen = new Set();
  let totalSpots = 0;
  for (const entry of entries) {
    const { file, country, name } = entry;
    if (seen.has(file)) { fail('Omn.html', name, '重复注册文件 ' + file); continue; }
    seen.add(file);
    if (!/^cities\/[a-z0-9_-]+\.js$/.test(file)) { fail('Omn.html', name, '无效城市路径 ' + file); continue; }
    if (!fs.existsSync(path.join(root, file))) { fail(file, name, '城市文件不存在'); continue; }
    let source;
    try { source = read(file); } catch (e) { fail(file, name, '文件无法读取: ' + e.message); continue; }
    const sandbox = { window: Object.create(null) };
    try {
      new vm.Script(source, { filename: file }).runInNewContext(sandbox, { timeout: 1000 });
    } catch (e) {
      fail(file, name, 'JavaScript 语法或执行失败: ' + e.message);
      continue;
    }
    const data = sandbox.window.CITY_DATA;
    if (!data || typeof data !== 'object' || !data.city_meta || !Array.isArray(data.spots)) {
      fail(file, name, '未正确注册 window.CITY_DATA / city_meta / spots');
      continue;
    }
    const meta = data.city_meta;
    if (meta.country !== country) fail(file, name, '国家不匹配: 注册 ' + country + '，数据 ' + String(meta.country));
    const actual = String(meta.city_name || '').trim();
    if (!actual) {
      fail(file, name, 'city_meta.city_name 为空');
    } else if (actual !== name && !(aliases[name] || []).includes(actual)) {
      if (allNames.has(actual) && allNames.get(actual) !== file) {
        fail(file, name, '疑似串城市数据: 当前文件显示为 ' + actual + '，对应 ' + allNames.get(actual));
      } else {
        warn(file, name, '城市名称可能为别称: 注册 ' + name + '，数据 ' + actual + '；请确认 Omn.html 加载器是否兼容');
      }
    }
    if (!Number.isFinite(meta.center_lat) || !Number.isFinite(meta.center_lon)) {
      fail(file, name, '城市中心经纬度无效');
    }
    if (!data.spots.length) fail(file, name, '景点数组为空');
    if (data.spots.length !== 50) warn(file, name, '景点数量为 ' + data.spots.length + '，与常见 50 条不一致（不影响通过）');
    const ids = new Set();
    data.spots.forEach((spot, i) => {
      const id = spot && spot.id ? String(spot.id) : 'spot#' + (i + 1);
      if (!spot || typeof spot !== 'object') { fail(file, id, '景点不是有效对象'); return; }
      if (!spot.id) fail(file, id, '缺少 id');
      if (ids.has(id)) fail(file, id, '重复景点 ID');
      ids.add(id);
      for (const key of ['name', 'dur', 'desc_long']) {
        if (typeof spot[key] !== 'string' || !spot[key].trim()) fail(file, id, '缺少或无效字段 ' + key);
      }
      if (!Array.isArray(spot.act)) fail(file, id, 'act 必须为数组');
      if (!Array.isArray(spot.season)) warn(file, id, 'season 不是数组');
      if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon) ||
          Math.abs(spot.lat) > 90 || Math.abs(spot.lon) > 180) {
        fail(file, id, '经纬度无效：' + String(spot.lat) + ', ' + String(spot.lon));
      } else if (Number.isFinite(meta.center_lat) && Number.isFinite(meta.center_lon)) {
        const rad = Math.PI / 180;
        const a = Math.sin((spot.lat-meta.center_lat)*rad/2)**2 +
          Math.cos(spot.lat*rad)*Math.cos(meta.center_lat*rad)*
          Math.sin((spot.lon-meta.center_lon)*rad/2)**2;
        const km = 6371*2*Math.atan2(Math.sqrt(Math.min(1,a)), Math.sqrt(Math.max(0,1-a)));
        if (km > 120) warn(file, id, '距离城市中心约 ' + Math.round(km) + ' 公里；可能为远郊行程，也可能是经纬度错误');
      }
    });
    totalSpots += data.spots.length;
  }
  console.log('\nCity data check: ' + entries.length + ' cities, ' + totalSpots +
    ' spots, ' + errors.length + ' errors, ' + warnings.length + ' warnings');
  if (errors.length) {
    console.error('校验未通过。仅报告问题，未修改任何城市文件。');
    process.exitCode = 1;
  } else {
    console.log('校验通过。提示信息（warning）不阻止通过。');
  }
}

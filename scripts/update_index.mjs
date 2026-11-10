import fs from 'node:fs';

let content = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

const target = `<div class="card" id="filedash" data-v="file_dashboard" hidden>
      <div class="fd-head"><div><h2 id="fdTitle">لوحة الملف</h2><small id="fdSub"></small></div>
        <div><a id="fdOpen" target="_blank" rel="noopener">↗ شاشة كاملة</a> <button id="fdHide" type="button" title="إخفاء">✕</button></div></div>`;

const replacement = `<div class="card" id="filedash" data-v="file_dashboard" hidden>
      <div class="fd-head">
        <div class="fd-head-info"><h2 id="fdTitle">لوحة الملف</h2><small id="fdSub"></small></div>
        <div class="fd-selector-wrap">
          <label for="fdSelect" class="sr-only">اختر اللوحة أو المشروع</label>
          <select id="fdSelect" class="chipsel fd-select" title="اختر اللوحة أو المشروع" aria-label="اختر اللوحة أو المشروع"></select>
        </div>
        <div class="fd-actions"><a id="fdOpen" target="_blank" rel="noopener">↗ شاشة كاملة</a> <button id="fdHide" type="button" title="إخفاء">✕</button></div>
      </div>`;

if (!content.includes(target)) {
  console.error('Target not found in index.html');
  process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync('index.html', content, 'utf8');
console.log('index.html updated successfully!');

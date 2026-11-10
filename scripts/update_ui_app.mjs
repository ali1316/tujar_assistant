import fs from 'node:fs';

// 1. Update public/js/ui.js
let uiJs = fs.readFileSync('public/js/ui.js', 'utf8').replace(/\r\n/g, '\n');

const uiTarget = `  const fdt = $('#fdTitle');
  const fds = $('#fdSub');
  const fdo = $('#fdOpen');
  if (fdt) fdt.textContent = 'لوحة الملف';
  if (fds) fds.textContent = sub || title || '';
  if (fdo) fdo.href = \`/d/\${id}\`;
  if (frame) frame.src = \`/d/\${id}?embed=1\`;`;

const uiReplacement = `  const fdt = $('#fdTitle');
  const fds = $('#fdSub');
  const fdo = $('#fdOpen');
  const fdSel = $('#fdSelect');
  if (fdt) fdt.textContent = title ? title : 'لوحة البيانات';
  if (fds) fds.textContent = sub || '';
  if (fdo) fdo.href = \`/d/\${id}\`;
  if (frame) frame.src = \`/d/\${id}?embed=1\`;
  if (fdSel && id) fdSel.value = String(id);`;

if (!uiJs.includes(uiTarget)) {
  console.error('uiTarget not found in public/js/ui.js');
  process.exit(1);
}
uiJs = uiJs.replace(uiTarget, uiReplacement);
fs.writeFileSync('public/js/ui.js', uiJs, 'utf8');
console.log('public/js/ui.js updated successfully!');

// 2. Update public/js/app.js
let appJs = fs.readFileSync('public/js/app.js', 'utf8').replace(/\r\n/g, '\n');

// 2a. Update projects table rendering
const projTarget = `    const TH = cols => \`<thead><tr>\${cols.map(([c, t]) => \`<th scope="col" class="\${c}">\${t}</th>\`).join('')}</tr></thead>\`;
    const projEl = $('#projects');
    if (projEl) {
      projEl.innerHTML = '<caption class="sr-only">جدول المشاريع: الحالة ونسبة الإنجاز والمسؤول</caption>' +
        TH([['c-id', '#'], ['c-name', 'المشروع'], ['c-dept', 'الإدارة'], ['c-status', 'الحالة'], ['c-prog', 'الإنجاز'], ['c-owner', 'المسؤول']]) +
        '<tbody>' +
        d.projects.map(p => \`<tr><td class="num c-id">\${num(p.id)}</td><td class="c-name">\${esc(p.name)}</td><td class="c-dept">\${esc(p.department)}</td><td class="c-status"><span class="tag \${esc(p.status)}">\${esc(p.status)}</span></td>
          <td class="c-prog"><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="\${+p.progress || 0}" aria-label="نسبة إنجاز \${esc(p.name)}"><i style="width:\${+p.progress || 0}%"></i></div><span class="num pct" aria-hidden="true">\${num(p.progress)}٪</span></div></td><td class="c-owner">\${esc(p.owner)}</td></tr>\`).join('') +
        '</tbody>';
    }`;

const projReplacement = `    const TH = cols => \`<thead><tr>\${cols.map(([c, t]) => \`<th scope="col" class="\${c}">\${t}</th>\`).join('')}</tr></thead>\`;
    const projEl = $('#projects');
    if (projEl) {
      projEl.innerHTML = '<caption class="sr-only">جدول المشاريع: الحالة ونسبة الإنجاز والمسؤول</caption>' +
        TH([['c-id', '#'], ['c-name', 'المشروع'], ['c-dept', 'الإدارة'], ['c-status', 'الحالة'], ['c-prog', 'الإنجاز'], ['c-owner', 'المسؤول'], ['c-act', 'لوحة المشروع']]) +
        '<tbody>' +
        d.projects.map(p => \`<tr><td class="num c-id">\${num(p.id)}</td><td class="c-name">\${esc(p.name)}</td><td class="c-dept">\${esc(p.department)}</td><td class="c-status"><span class="tag \${esc(p.status)}">\${esc(p.status)}</span></td>
          <td class="c-prog"><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="\${+p.progress || 0}" aria-label="نسبة إنجاز \${esc(p.name)}"><i style="width:\${+p.progress || 0}%"></i></div><span class="num pct" aria-hidden="true">\${num(p.progress)}٪</span></div></td>
          <td class="c-owner">\${esc(p.owner)}</td>
          <td class="c-act"><button type="button" class="btn-proj-dash" data-proj-id="\${p.id}" data-dash-id="\${p.dashboard_id || ''}" title="فتح لوحة مشروع \${esc(p.name)}">عرض اللوحة ↗</button></td>
        </tr>\`).join('') +
        '</tbody>';

      if (!projEl.__boundDash) {
        projEl.__boundDash = true;
        projEl.addEventListener('click', async e => {
          const btn = e.target.closest('.btn-proj-dash');
          if (!btn) return;
          const projId = +btn.dataset.projId;
          let dashId = +btn.dataset.dashId;
          const tr = btn.closest('tr');
          const name = tr?.querySelector('.c-name')?.textContent || 'مشروع #' + projId;
          if (!dashId) {
            const catalog = await apiJson('/api/dashboards/catalog').catch(() => null);
            const found = catalog?.projects?.find(p => p.projectId === projId);
            if (found?.dashboardId) dashId = found.dashboardId;
          }
          if (dashId) {
            await showDash(dashId, name, 'مشروع رقم #' + projId, true, true);
          }
        });
      }
    }

    // تحديث قائمة لوحات المشاريع والتقارير في الشريط العلوي للوحة
    const fdSel = $('#fdSelect');
    if (fdSel) {
      apiJson('/api/dashboards/catalog').then(catalog => {
        if (!catalog) return;
        let html = '<option value="">-- اختر المشروع أو التقرير التنفيذي --</option>';
        if (catalog.projects?.length) {
          html += '<optgroup label="🚀 لوحات المشاريع الاستراتيجية">';
          catalog.projects.forEach(p => {
            html += \`<option value="\${p.dashboardId}" data-sub="مشروع #\${p.projectId}: \${esc(p.name)}">\${esc(p.title || p.name)} (\${esc(p.status)} - \${p.progress}%)</option>\`;
          });
          html += '</optgroup>';
        }
        if (catalog.portfolios?.length) {
          html += '<optgroup label="📊 التقارير والمحافظ التنفيذية">';
          catalog.portfolios.forEach(d => {
            html += \`<option value="\${d.id}" data-sub="\${esc(d.title)}">\${esc(d.title)}</option>\`;
          });
          html += '</optgroup>';
        }
        if (catalog.files?.length) {
          html += '<optgroup label="📁 لوحات الملفات والوثائق">';
          catalog.files.forEach(f => {
            html += \`<option value="\${f.id}" data-sub="\${esc(f.title)}">\${esc(f.title)}</option>\`;
          });
          html += '</optgroup>';
        }
        fdSel.innerHTML = html;
        if (CUR_DASH?.id) fdSel.value = String(CUR_DASH.id);
      }).catch(() => {});

      if (!fdSel.__bound) {
        fdSel.__bound = true;
        fdSel.addEventListener('change', async e => {
          const dashId = +e.target.value;
          if (!dashId) return;
          const opt = e.target.selectedOptions[0];
          await showDash(dashId, opt.textContent, opt?.dataset?.sub || '', true, true);
        });
      }
    }`;

if (!appJs.includes(projTarget)) {
  console.error('projTarget not found in public/js/app.js');
  process.exit(1);
}
appJs = appJs.replace(projTarget, projReplacement);

// 2b. Update duplicate handling in upload
const dupTarget = `  if (d.duplicate) {
    note(\`📄 «\${d.name}» مرفوع من قبل (ملف #\${d.id}) ومحفوظ في Drive\`);
    const links = [];
    if (d.drive_url) links.push(['📁 عرض في Drive', d.drive_url]);
    jr.finish('الملف موجود مسبقاً — ما كررناه', [\`ملف #\${d.id}\`, d.name], links, { rest: 'skip' });
    return;
  }`;

const dupReplacement = `  if (d.duplicate) {
    note(\`📄 «\${d.name}» موجود مسبقاً (ملف #\${d.id})\`);
    const links = [];
    if (d.drive_url) links.push(['📁 عرض في Drive', d.drive_url]);
    jr.finish('الملف موجود مسبقاً — تم استرجاع لوحته', [\`ملف #\${d.id}\`, d.name], links, { rest: 'skip' });
    if (d.dashboard?.id) {
      showDash(d.dashboard.id, d.dashboard.title, 'من ملف: ' + d.name);
      note(\`📊 تم فتح لوحة الملف #\${d.dashboard.id}: \${d.dashboard.title}\`);
    } else {
      apiJson(\`/api/docs/\${d.id}/dashboard\`, {}).then(g => {
        if (g?.ok) showDash(g.id, g.title, 'من ملف: ' + d.name);
      }).catch(() => {});
    }
    loadDashboard();
    return;
  }`;

if (!appJs.includes(dupTarget)) {
  console.error('dupTarget not found in public/js/app.js');
  process.exit(1);
}
appJs = appJs.replace(dupTarget, dupReplacement);

fs.writeFileSync('public/js/app.js', appJs, 'utf8');
console.log('public/js/app.js updated successfully!');

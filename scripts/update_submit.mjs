import fs from 'node:fs';

let appJs = fs.readFileSync('public/js/app.js', 'utf8').replace(/\r\n/g, '\n');

const target = `  if (!running || !agent.connected) {
    try {
      await agent.start({ mic: false, mode: modeFor(), voice: VOICE });
      running = true;
      agent.sendText(t);
      if (txt) txt.value = '';
      $('#send')?.setAttribute('aria-disabled', 'true');
      return;
    } catch (err) {
      console.log('[app] Live WebSocket unavailable, using REST Chat:', err.message);
    }
  } else {
    agent.sendText(t);
    if (txt) txt.value = '';
    $('#send')?.setAttribute('aria-disabled', 'true');
    return;
  }`;

const replacement = `  const notifyLiveScreenContext = () => {
    if (agent?.connected && (ACTIVE_DASH_SPEC?.title || CUR_DASH?.title)) {
      const dTitle = ACTIVE_DASH_SPEC?.title || CUR_DASH?.title;
      const kpisStr = (ACTIVE_DASH_SPEC?.kpis || []).map(k => \`\${k.label}: \${k.value} \${k.unit || ''}\`).slice(0, 4).join('، ');
      agent.sendText(\`[تحديث الشاشة] المعروض حالياً أمام فواز: لوحة «\${dTitle}». \${ACTIVE_DASH_SPEC?.headline ? \`النتيجة الأهم: \${ACTIVE_DASH_SPEC.headline}.\` : ''} \${kpisStr ? \`المؤشرات: \${kpisStr}.\` : ''}\`, { silent: true });
    }
  };

  if (!running || !agent.connected) {
    try {
      await agent.start({ mic: false, mode: modeFor(), voice: VOICE });
      running = true;
      notifyLiveScreenContext();
      agent.sendText(t);
      if (txt) txt.value = '';
      $('#send')?.setAttribute('aria-disabled', 'true');
      return;
    } catch (err) {
      console.log('[app] Live WebSocket unavailable, using REST Chat:', err.message);
    }
  } else {
    notifyLiveScreenContext();
    agent.sendText(t);
    if (txt) txt.value = '';
    $('#send')?.setAttribute('aria-disabled', 'true');
    return;
  }`;

if (!appJs.includes(target)) {
  console.error('target not found in public/js/app.js');
  process.exit(1);
}

appJs = appJs.replace(target, replacement);
fs.writeFileSync('public/js/app.js', appJs, 'utf8');
console.log('public/js/app.js submit updated successfully!');

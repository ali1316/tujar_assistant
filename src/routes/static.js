import { Router } from 'express';

const router = Router();

const UI_FILES = [
  'index.html',
  'gemini-live-agent.js',
  'pcm-recorder.js',
  'hud.js',
  'speech.js',
  'ui-control.js',
  'assistant.js',
  'eleven-agent.js',
  'text-guard.js',
];

// الواجهة (ملفات محددة فقط)
for (const f of UI_FILES) {
  router.get(f === 'index.html' ? '/' : `/${f}`, (req, res) =>
    res.sendFile(f, { root: '.', headers: { 'Cache-Control': 'no-cache' } })
  );
}

// مكتبات الرسم والخط من السيرفر نفسه (بدل CDN)
const VENDOR = {
  'vega.min.js': 'node_modules/vega/build/vega.min.js',
  'vega-lite.min.js': 'node_modules/vega-lite/build/vega-lite.min.js',
  'vega-embed.min.js': 'node_modules/vega-embed/build/vega-embed.min.js',
  'chart.umd.js': 'node_modules/chart.js/dist/chart.umd.js',
  'echarts.min.js': 'node_modules/echarts/dist/echarts.min.js',
  'tabulator.min.js': 'node_modules/tabulator-tables/dist/js/tabulator.min.js',
  'tabulator_midnight.min.css': 'node_modules/tabulator-tables/dist/css/tabulator_midnight.min.css',
};

router.get('/vendor/:f', (req, res) =>
  VENDOR[req.params.f]
    ? res.sendFile(VENDOR[req.params.f], { root: '.', maxAge: '30d', immutable: true })
    : res.status(404).end()
);

router.get(/^\/vendor\/plex\/((?:files\/)?[\w.-]+\.(?:css|woff2?))$/, (req, res) =>
  res.sendFile(
    `node_modules/@fontsource/ibm-plex-sans-arabic/${req.params[0]}`,
    { root: '.', maxAge: '30d', immutable: true },
    e => e && res.status(404).end()
  )
);

// هوية اتحاد الغرف (الشعار)
const BRAND_FILES = [
  'fsc-logo.svg',
  'fsc-logo-dark.svg',
  'fsc-logo-white.svg',
  'tujar-logo-original.png',
  'tujar-logo-white.png',
];

router.get('/brand/:f', (req, res) => {
  if (!BRAND_FILES.includes(req.params.f)) return res.status(404).end();
  res
    .type(req.params.f.endsWith('.png') ? 'image/png' : 'image/svg+xml')
    .set('Cache-Control', 'public, max-age=86400')
    .sendFile(req.params.f, { root: 'brand' });
});

// فتح داشبورد مستقل بالرقم
router.get('/d/:id', (req, res) =>
  res.sendFile('dash.html', { root: '.', headers: { 'Cache-Control': 'no-cache' } })
);

export { router as staticRouter };

// UI Control — نورة تغيّر شكل الواجهة بأمر صوتي (خطوط، ألوان، أحجام، جداول، CSS مخصص)
// الإعدادات تنحفظ في الداتابيس (/api/ui) فتبقى بعد التحديث ولكل من يفتح اللوحة.

// خطوط عربية من Google Fonts
export const FONTS = {
  'IBM Plex Sans Arabic': 'عصري ومتوازن (الافتراضي)',
  'Cairo': 'واضح ومناسب للوحات',
  'Tajawal': 'خفيف وأنيق',
  'Almarai': 'رسمي ونظيف',
  'Noto Kufi Arabic': 'كوفي حديث',
  'Noto Naskh Arabic': 'نسخ تقليدي للقراءة',
  'Readex Pro': 'تقني ومستقبلي',
  'Changa': 'عريض وحماسي',
  'El Messiri': 'فاخر بلمسة تراثية',
  'Reem Kufi': 'كوفي هندسي',
  'Lalezar': 'عناوين جريئة',
  'Amiri': 'كلاسيكي أدبي',
  'Markazi Text': 'صحفي',
  'Rubik': 'ناعم ومدوّر',
  'Baloo Bhaijaan 2': 'مرح ودائري',
  'Lemonada': 'مرح وعصري',
  'Kufam': 'كوفي للعناوين',
  'Aref Ruqaa': 'خط رقعة',
  'Mada': 'بسيط ومريح',
  'Harmattan': 'خفيف ومقروء',
};

// ثيمات جاهزة (ألوان)
export const THEMES = {
  'ليلي أزرق': { bg: '#0f1420', card: '#171e2e', line: '#253049', ink: '#e8edf7', mute: '#8a96b0', acc: '#4f8cff' },
  'فاتح': { bg: '#f4f6fa', card: '#ffffff', line: '#dde3ec', ink: '#18202e', mute: '#5b6678', acc: '#2f6fdc' },
  'أخضر سعودي': { bg: '#0c1712', card: '#12221a', line: '#1f3a2b', ink: '#e6f4ec', mute: '#8fb5a0', acc: '#1fa463' },
  'ذهبي صحراوي': { bg: '#17130c', card: '#221c12', line: '#3a301f', ink: '#f5ecdc', mute: '#b8a684', acc: '#d9a441' },
  'بنفسجي ملكي': { bg: '#130f1f', card: '#1c162e', line: '#2e2549', ink: '#ece8f7', mute: '#9e93bb', acc: '#8b5cf6' },
  'هولوجرام': { bg: '#03101c', card: '#071a2b', line: '#0e3550', ink: '#dff8ff', mute: '#7fb6c8', acc: '#3ee6ff' },
  'وردي ليلي': { bg: '#1a0f16', card: '#26161f', line: '#3e2433', ink: '#f7e8f0', mute: '#bb93a8', acc: '#ec4899' },
};

const TARGETS = { table: '--fs-table', kpi: '--fs-kpi', chat: '--fs-chat', header: '--fs-header', titles: '--fs-titles' };
const TARGET_AR = { all: 'كل الواجهة', table: 'الجداول', kpi: 'البطاقات والأرقام', chat: 'المحادثة', header: 'العنوان الرئيسي', titles: 'عناوين الأقسام' };
const TABLE_STYLES = { default: 'افتراضي', striped: 'مخطط', compact: 'مضغوط', bordered: 'بحدود', glass: 'زجاجي', cards: 'بطاقات' };
const hex = v => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v || '');

export function createUIControl({ api, hud, onChange = () => {} }) {
  const root = document.documentElement;
  const cssTag = document.getElementById('nora-css');
  let state = { font: 'IBM Plex Sans Arabic', colors: {}, sizes: {}, zoom: 1, table: 'default', radius: 12, css: [] };
  const history = [];

  function loadFont(name) {
    if (name === 'IBM Plex Sans Arabic' || document.querySelector(`link[data-font="${name}"]`)) return Promise.resolve();
    return new Promise(res => {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.dataset.font = name;
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;600;700&display=swap`;
      l.onload = () => document.fonts.load(`16px "${name}"`).then(res, res); l.onerror = res;
      document.head.append(l);
    });
  }

  async function apply(s, flash = true) {
    await loadFont(s.font);
    root.style.setProperty('--font', `'${s.font}'`);
    for (const [k, v] of Object.entries(s.colors || {})) if (hex(v)) root.style.setProperty(`--${k}`, v);
    for (const [k, v] of Object.entries(s.sizes || {})) if (TARGETS[k]) root.style.setProperty(TARGETS[k], v);
    root.style.setProperty('--radius', `${s.radius ?? 12}px`);
    document.body.style.zoom = s.zoom && s.zoom !== 1 ? s.zoom : '';
    document.body.className = document.body.className.replace(/\btbl-\w+/g, '').trim();
    if (s.table && s.table !== 'default') document.body.classList.add(`tbl-${s.table}`);
    cssTag.textContent = (s.css || []).map(c => `/* ${c.description || ''} */\n${c.css}`).join('\n');
    if (flash) document.querySelectorAll('.card,.kpi').forEach(e => { e.classList.remove('ui-flash'); void e.offsetWidth; e.classList.add('ui-flash'); });
  }

  async function commit(change) {
    history.push(JSON.stringify(state));
    Object.assign(state, change);
    await apply(state);
    try { await api('/api/ui', state); } catch {}
    onChange(state);
  }

  // التحميل الأول من الداتابيس
  async function init() {
    try { const s = await api('/api/ui'); if (s && s.font) { state = { ...state, ...s }; await apply(state, false); } } catch {}
  }

  // ====== أدوات نورة ======
  const tools = {
    async set_font({ font }) {
      const name = Object.keys(FONTS).find(f => f.toLowerCase() === String(font).toLowerCase()) ||
        Object.keys(FONTS).find(f => f.toLowerCase().includes(String(font).toLowerCase()));
      if (!name) return { error: 'الخط غير متوفر', available: Object.keys(FONTS) };
      await commit({ font: name });
      return { ok: true, font: name, style: FONTS[name] };
    },
    async show_fonts() {
      await Promise.all(Object.keys(FONTS).map(loadFont));
      if (hud?.showFontGallery) hud.showFontGallery(FONTS, state.font, n => tools.set_font({ font: n }));
      return { shown: true, fonts: Object.entries(FONTS).map(([n, d]) => `${n} (${d})`), current: state.font };
    },
    async set_theme({ theme }) {
      const name = Object.keys(THEMES).find(t => t === theme) || Object.keys(THEMES).find(t => t.includes(theme) || theme?.includes(t));
      if (!name) return { error: 'ثيم غير معروف', available: Object.keys(THEMES) };
      await commit({ colors: { ...THEMES[name] } });
      return { ok: true, theme: name, colors: THEMES[name] };
    },
    async set_colors(c) {
      const allowed = ['bg', 'card', 'line', 'ink', 'mute', 'acc', 'ok', 'warn', 'bad'];
      const colors = { ...state.colors };
      const applied = {};
      for (const k of allowed) if (hex(c[k])) { colors[k] = c[k]; applied[k] = c[k]; }
      if (!Object.keys(applied).length) return { error: 'لازم ألوان بصيغة hex مثل #1fa463', keys: allowed };
      await commit({ colors });
      return { ok: true, applied };
    },
    async set_text_size({ target = 'all', scale }) {
      scale = Math.max(0.6, Math.min(2.2, +scale || 1));
      if (target === 'all') { await commit({ zoom: scale }); return { ok: true, target: TARGET_AR.all, scale }; }
      if (!TARGETS[target]) return { error: 'هدف غير معروف', targets: Object.keys(TARGET_AR) };
      await commit({ sizes: { ...state.sizes, [target]: scale } });
      return { ok: true, target: TARGET_AR[target], scale };
    },
    async set_table_style({ style }) {
      if (!TABLE_STYLES[style]) return { error: 'نمط غير معروف', styles: TABLE_STYLES };
      await commit({ table: style });
      return { ok: true, style: TABLE_STYLES[style] };
    },
    async set_corners({ radius }) {
      radius = Math.max(0, Math.min(28, +radius || 0));
      await commit({ radius });
      return { ok: true, radius };
    },
    async apply_custom_css({ css, description = '' }) {
      css = String(css || '');
      if (/<|script|javascript:|expression\s*\(|@import(?!\s+url\(["']?https:\/\/fonts\.googleapis\.com)/i.test(css) || /url\((?!["']?(data:|https:\/\/fonts\.g))/i.test(css))
        return { error: 'CSS مرفوض لأسباب أمنية (ممنوع سكربتات أو روابط خارجية)' };
      if (css.length > 4000) return { error: 'CSS طويل جداً' };
      await commit({ css: [...(state.css || []), { css, description }].slice(-12) });
      return { ok: true, description, rules: (css.match(/\{/g) || []).length };
    },
    async undo_ui() {
      const prev = history.pop();
      if (!prev) return { error: 'ما فيه تغيير أرجع عنه' };
      state = JSON.parse(prev); await apply(state); try { await api('/api/ui', state); } catch {}
      return { ok: true, state: describe() };
    },
    async reset_ui() {
      await commit({ font: 'IBM Plex Sans Arabic', colors: { ...THEMES['ليلي أزرق'] }, sizes: {}, zoom: 1, table: 'default', radius: 12, css: [] });
      return { ok: true, message: 'رجعت الواجهة للشكل الأصلي' };
    },
    async get_ui_state() { return describe(); },
  };

  function describe() {
    return {
      font: state.font, table: TABLE_STYLES[state.table], zoom: state.zoom, radius: state.radius,
      colors: state.colors, sizes: Object.fromEntries(Object.entries(state.sizes || {}).map(([k, v]) => [TARGET_AR[k], v])),
      custom_css: (state.css || []).map(c => c.description),
    };
  }

  return { init, tools, get state() { return state; } };
}

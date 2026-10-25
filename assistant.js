// قدرات المساعد في المتصفح: فتح التطبيقات والمواقع، ومسودات واتساب، وفتح الداشبوردات اللي تبنيها نورة
const APPS = {
  whatsapp: 'https://web.whatsapp.com',
  gmail: 'https://mail.google.com',
  calendar: 'https://calendar.google.com',
  drive: 'https://drive.google.com',
  youtube: 'https://www.youtube.com',
  google: 'https://www.google.com',
  maps: 'https://maps.google.com',
  notion: 'https://www.notion.so',
  linkedin: 'https://www.linkedin.com',
  x: 'https://x.com',
  github: 'https://github.com',
  claude: 'https://claude.ai',
  chatgpt: 'https://chatgpt.com',
  metricool: 'https://app.metricool.com',
  aistudio: 'https://aistudio.google.com',
  render: 'https://dashboard.render.com',
  outlook: 'https://outlook.office.com',
  teams: 'https://teams.microsoft.com',
};
const SEARCH = {
  google: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  youtube: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  maps: q => `https://www.google.com/maps/search/${encodeURIComponent(q)}`,
  gmail: q => `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`,
  drive: q => `https://drive.google.com/drive/search?q=${encodeURIComponent(q)}`,
  x: q => `https://x.com/search?q=${encodeURIComponent(q)}`,
  github: q => `https://github.com/search?q=${encodeURIComponent(q)}`,
  linkedin: q => `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(q)}`,
};

export const ASSISTANT_APPS = Object.keys(APPS);

export function createAssistant({ api, hud, note = () => {} }) {
  // فتح رابط: لو المتصفح منع النافذة، نعرض زر كبير في نافذة HUD
  function openUrl(url, label) {
    const w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch {} return { opened: true, url }; }
    hud?.showLink?.(url, label);
    return { opened: false, url, note: 'المتصفح منع فتح النافذة تلقائياً؛ ظهر للمستخدم زر «افتح». اطلبي منه يضغطه، أو يسمح للموقع بالنوافذ المنبثقة مرة وحدة.' };
  }

  const tools = {
    open_app({ app, query, url, phone, message }) {
      let target, label;
      if (app === 'whatsapp' && (phone || message)) {
        const digits = String(phone || '').replace(/\D/g, '').replace(/^00/, '').replace(/^0(5\d{8})$/, '966$1');
        target = `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
        label = digits ? `محادثة واتساب مع ${digits}` : 'واتساب مع مسودة الرسالة';
      } else if (url) {
        if (!/^https:\/\//i.test(url)) return { error: 'أفتح روابط https بس' };
        target = url; label = url;
      } else if (APPS[app]) {
        target = query && SEARCH[app] ? SEARCH[app](query) : APPS[app];
        label = query ? `${app}: ${query}` : app;
      } else if (query) {
        target = SEARCH.google(query); label = `بحث: ${query}`;
      } else return { error: 'وش التطبيق أو الرابط؟', apps: ASSISTANT_APPS };
      note(`🚀 نورة تفتح: ${label}`);
      return { ...openUrl(target, label), app: app || 'url', draft: message || undefined };
    },
    async build_dashboard(args) {
      const r = await api('/api/tools/build_dashboard', args);
      if (r.ok) { note(`📊 داشبورد جديد #${r.id}: ${args.title}`); return { ...r, ...openUrl(r.url, `داشبورد: ${args.title}`) }; }
      return r;
    },
    async open_dashboard({ id }) {
      return openUrl(`/d/${id}`, `داشبورد #${id}`);
    },
  };
  return { tools, openUrl };
}

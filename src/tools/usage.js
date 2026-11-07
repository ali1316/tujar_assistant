import { kvGet } from '../../store.js';

// استهلاك التوكنز: المتصفح يرسل أرقام كل جلسة، وننحفظ مجاميع يومية
export const usageTools = {
  get_token_usage: {
    declaration: {
      name: 'get_token_usage',
      description: 'يعرض استهلاك التوكنز للمحادثات الصوتية: اليوم، آخر الأيام، وآخر الجلسات (لكل محرك).',
      parameters: { type: 'OBJECT', properties: {} },
    },
    run: async () => {
      const u = (await kvGet('usage')) || { days: {}, sessions: [] };
      const today = new Date().toISOString().slice(0, 10);
      return {
        today: u.days[today] || {},
        last_days: Object.fromEntries(Object.entries(u.days).sort().slice(-7)),
        recent_sessions: u.sessions.slice(-8),
        note: 'محرك فواز ما يرجّع أرقام توكنز، فالأرقام لنورة (Gemini) بالأساس',
      };
    },
  },
};

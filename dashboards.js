// باني الداشبوردات: نورة تصمم داشبورد كامل (بطاقات + رسوم ECharts + جداول Tabulator) وينحفظ برابط ثابت /d/:id
import { dashAdd, dashGet, dashList } from './store.js';

const j = (s, what) => {
  if (s && typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { throw new Error(`${what}: JSON غير صالح (${e.message})`); }
};

export const dashboardTools = {
  build_dashboard: {
    declaration: {
      name: 'build_dashboard',
      description: `تبني داشبورد كامل جديد كصفحة مستقلة برابط ثابت، وتفتحه للمستخدم. استخدميها لما يطلب "سوّي لي داشبورد/لوحة/تقرير مرئي عن كذا".
اجلبي الأرقام الحقيقية بالأدوات أولاً. المكوّنات:
- kpis: 3-6 بطاقات أرقام (label, value, unit, delta اختياري مثل "+12%").
- charts: 1-6 رسوم، كل واحد option بصيغة Apache ECharts كنص JSON (series + xAxis/yAxis أو pie/gauge/radar/funnel/heatmap/sankey...). بدون دوال JavaScript. span=2 للرسم العريض.
- tables: 0-3 جداول، columns قائمة أسماء الأعمدة، rows_json مصفوفة صفوف JSON (كل صف مصفوفة قيم بنفس ترتيب الأعمدة).
- insights: 2-4 ملاحظات قصيرة مفيدة.
قواعد اللوحة التنفيذية:
- headline: سطر واحد فوق اللوحة يقول أهم نتيجة أو أكبر مشكلة برقمها (مثل "الخصومات في نوفمبر وديسمبر 16-17% أكلت الهامش"). headline_flag=true لو هو مشكلة.
- عنوان كل رسم يكون سؤال إدارة يجاوبه الرسم (مثل "هل الخصومات تأكل الهامش؟")، وinsight جملة الجواب برقمها.
- flag في الرسم: أسماء الفئات اللي فيها مشكلة (تنرسم بالأحمر). flag في المؤشر: "bad" أو "good".
- actions: 2-5 إجراءات «وش نسوي بعدها» مرتبة من الأكبر أثراً للأقل، كل وحدة: action (فعل واضح)، impact (الأثر المتوقع برقم لو متاح)، why (الدليل من اللوحة).
- لا تخترعين أرقام ولا تحطين أحمر بدون دليل من البيانات.`,
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          subtitle: { type: 'STRING' },
          headline: { type: 'STRING', description: 'أهم نتيجة أو أكبر مشكلة بسطر واحد مع رقمها' },
          headline_flag: { type: 'BOOLEAN', description: 'true لو السطر مشكلة تحتاج انتباه' },
          kpis: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, value: { type: 'NUMBER' }, unit: { type: 'STRING' }, delta: { type: 'STRING' }, flag: { type: 'STRING', description: 'bad أو good' } }, required: ['label', 'value'] } },
          charts: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING', description: 'سؤال الإدارة اللي يجاوبه الرسم' }, echarts_option: { type: 'STRING' }, span: { type: 'INTEGER' }, insight: { type: 'STRING', description: 'جواب السؤال بجملة ورقم' }, flag: { type: 'ARRAY', items: { type: 'STRING' }, description: 'أسماء الفئات اللي فيها مشكلة' } }, required: ['title', 'echarts_option'] } },
          tables: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, columns: { type: 'ARRAY', items: { type: 'STRING' } }, rows_json: { type: 'STRING' } }, required: ['title', 'columns', 'rows_json'] } },
          insights: { type: 'ARRAY', items: { type: 'STRING' } },
          actions: { type: 'ARRAY', description: 'وش نسوي بعدها، مرتبة من الأكبر أثراً', items: { type: 'OBJECT', properties: { action: { type: 'STRING' }, impact: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['action'] } },
        },
        required: ['title'],
      },
    },
    write: true,
    run: async ({ title, subtitle = '', kicker, designed_by, headline, headline_flag, kpis = [], charts = [], tables = [], insights = [], actions = [], provenance, interactive }) => {
      try {
        const txt = (v, n) => typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined;
        const spec = {
          title, subtitle, kicker, designed_by,
          headline: txt(headline, 240), headline_flag: headline_flag === true || headline_flag === 'true' || undefined,
          kpis: kpis.slice(0, 6).map(k => ({ ...k, flag: ['bad', 'good'].includes(k.flag) ? k.flag : undefined })),
          charts: charts.slice(0, 6).map(c => ({ title: c.title, span: c.span === 2 ? 2 : 1, size: c.size, insight: txt(c.insight, 240), flag: Array.isArray(c.flag) ? c.flag.map(String).slice(0, 20) : undefined, option: j(c.echarts_option, `الرسم «${c.title}»`) })),
          tables: tables.slice(0, 3).map(t => {
            const rows = j(t.rows_json, `الجدول «${t.title}»`);
            if (!Array.isArray(rows)) throw new Error(`الجدول «${t.title}»: rows_json لازم مصفوفة`);
            return { title: t.title, columns: t.columns, rows: rows.slice(0, 500) };
          }),
          insights: insights.slice(0, 5),
          actions: (Array.isArray(actions) ? actions : []).filter(a => a && txt(a.action, 300)).slice(0, 6).map(a => ({ action: txt(a.action, 300), impact: txt(a.impact, 160), why: txt(a.why, 240) })),
          ...(provenance && typeof provenance === 'object' ? { provenance } : {}),
          ...(interactive && typeof interactive === 'object' && Array.isArray(interactive.rows) ? { interactive: { ...interactive, rows: interactive.rows.slice(0, 5000) } } : {}),
          generated_at: new Date().toISOString(),
        };
        const id = await dashAdd(title, spec);
        return { ok: true, id, url: `/d/${id}`, widgets: { kpis: spec.kpis.length, charts: spec.charts.length, tables: spec.tables.length, actions: spec.actions.length, headline: !!spec.headline } };
      } catch (e) {
        return { error: e.message + ' — صحّحي وأعيدي المحاولة' };
      }
    },
  },
  list_dashboards: {
    declaration: { name: 'list_dashboards', description: 'تعرض الداشبوردات اللي بنيتيها سابقاً (رقم، عنوان، تاريخ).', parameters: { type: 'OBJECT', properties: {} } },
    run: async () => ({ dashboards: (await dashList()).map(d => ({ ...d, url: `/d/${d.id}` })) }),
  },
};

export { dashGet, dashList };

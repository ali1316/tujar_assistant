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
- insights: 2-4 ملاحظات قصيرة مفيدة.`,
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          subtitle: { type: 'STRING' },
          kpis: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, value: { type: 'NUMBER' }, unit: { type: 'STRING' }, delta: { type: 'STRING' } }, required: ['label', 'value'] } },
          charts: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, echarts_option: { type: 'STRING' }, span: { type: 'INTEGER' } }, required: ['title', 'echarts_option'] } },
          tables: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, columns: { type: 'ARRAY', items: { type: 'STRING' } }, rows_json: { type: 'STRING' } }, required: ['title', 'columns', 'rows_json'] } },
          insights: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['title'],
      },
    },
    write: true,
    run: async ({ title, subtitle = '', kpis = [], charts = [], tables = [], insights = [] }) => {
      try {
        const spec = {
          title, subtitle,
          kpis: kpis.slice(0, 6),
          charts: charts.slice(0, 6).map(c => ({ title: c.title, span: c.span === 2 ? 2 : 1, option: j(c.echarts_option, `الرسم «${c.title}»`) })),
          tables: tables.slice(0, 3).map(t => {
            const rows = j(t.rows_json, `الجدول «${t.title}»`);
            if (!Array.isArray(rows)) throw new Error(`الجدول «${t.title}»: rows_json لازم مصفوفة`);
            return { title: t.title, columns: t.columns, rows: rows.slice(0, 500) };
          }),
          insights: insights.slice(0, 5),
          generated_at: new Date().toISOString(),
        };
        const id = await dashAdd(title, spec);
        return { ok: true, id, url: `/d/${id}`, widgets: { kpis: spec.kpis.length, charts: spec.charts.length, tables: spec.tables.length } };
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

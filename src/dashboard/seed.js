// src/dashboard/seed.js - تهيئة وتأكيد وجود الداشبورد التنفيذي الأساسي
import { dashAdd, dashList } from '../../store.js';
import { dashGet } from '../../dashboards.js';
import { getCurrentDash, setCurrentDash } from '../../file-dash.js';

export const SAUDI_CHAMBERS_2026_SPEC = {
  title: 'تقرير الأداء السنوي 2026 - الغرف السعودية',
  subtitle: 'نظرة شاملة على العمليات والمبادرات',
  kicker: 'التقرير السنوي الشامل',
  designed_by: 'نورة · مستشار التحول الرقمي',
  headline: 'معدل حل الشكاوى 96.8% مع 400 شكوى لم تُحل من أصل 12,450',
  headline_flag: false,
  kpis: [
    { label: 'إجمالي العمليات السنوية', value: 2418250, unit: 'عمليات', delta: 'زيادة 12% مقارنة بالعام السابق' },
    { label: 'الإيرادات السنوية', value: 148000000, unit: 'ريال سعودي', delta: 'نمو 5% سنوياً' },
    { label: 'معدل حل الشكاوى', value: 96.8, unit: '%', flag: 'good', delta: 'تحسن ملحوظ عن المستهدف' },
    { label: 'نسبة التحول الرقمي', value: 98.4, unit: '%', flag: 'good', delta: 'مرتفع جداً' }
  ],
  charts: [
    {
      title: 'موقف معالجة الشكاوى السنوية (حل الشكاوى مقابل المعلقة)',
      span: 1,
      insight: 'تم إغلاق 12,050 شكوى بنجاح (96.8%)، مع تبقي 400 شكوى معلقة تتطلب التدخل السريع',
      flag: ['شكاوى معلقة لم تُحل'],
      option: {
        tooltip: { trigger: 'item', formatter: '{b}: {c} شكوى ({d}%)' },
        legend: { bottom: '0', left: 'center', textStyle: { color: '#8ea3bd' } },
        series: [{
          name: 'حالة الشكاوى',
          type: 'pie',
          radius: ['45%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 8, borderColor: '#081726', borderWidth: 2 },
          data: [
            { value: 12050, name: 'شكاوى محلولة بنجاح', itemStyle: { color: '#59c48f' } },
            { value: 400, name: 'شكاوى معلقة لم تُحل', itemStyle: { color: '#e0705f' } }
          ],
          label: { show: true, position: 'outside', color: '#c9d6e6', formatter: '{b}: {c}' }
        }]
      }
    },
    {
      title: 'الهيكل المالي: توزيع الإيرادات والفائض والمصروفات التشغيلية',
      span: 2,
      insight: 'حققت الغرف إيرادات سنوية 148.5M ريال مع فائض تشغيلي 36.2M ريال بعد مصروفات 112.3M ريال',
      option: {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
          type: 'category',
          data: ['إجمالي الإيرادات', 'المصروفات التشغيلية', 'الفائض التشغيلي المحقق'],
          axisLabel: { color: '#8ea3bd', interval: 0 }
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#8ea3bd', formatter: v => (v / 1e6) + 'M' },
          splitLine: { lineStyle: { color: '#1d3a5a' } }
        },
        series: [{
          name: 'المبلغ (ريال سعودي)',
          type: 'bar',
          barMaxWidth: 56,
          data: [
            { value: 148500000, itemStyle: { color: '#5f86b3' } },
            { value: 112300000, itemStyle: { color: '#d1a65c' } },
            { value: 36200000, itemStyle: { color: '#59c48f' } }
          ],
          label: { show: true, position: 'top', color: '#eef2f7', formatter: p => (p.value / 1e6).toFixed(1) + 'M ر.س' }
        }]
      }
    },
    {
      title: 'توزيع العمليات الرقمية بين كبرى الغرف التجارية (17 غرفة)',
      span: 2,
      insight: 'غرف الرياض وجدة والشرقية تستحوذ على 81.4% من إجمالي العمليات الرقمية للاتحاد',
      option: {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
          type: 'category',
          data: ['غرفة الرياض', 'غرفة جدة', 'غرفة الشرقية', 'غرفة مكة المكرمة', 'بقية الغرف (13 غرفة)'],
          axisLabel: { color: '#8ea3bd', interval: 0 }
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#8ea3bd', formatter: v => (v / 1000) + 'K' },
          splitLine: { lineStyle: { color: '#1d3a5a' } }
        },
        series: [{
          name: 'العمليات السنوية',
          type: 'bar',
          barMaxWidth: 50,
          data: [
            { value: 820000, itemStyle: { color: '#5f86b3' } },
            { value: 610000, itemStyle: { color: '#4fb3a9' } },
            { value: 540000, itemStyle: { color: '#d1a65c' } },
            { value: 260000, itemStyle: { color: '#8fa7c4' } },
            { value: 188250, itemStyle: { color: '#9b86c9' } }
          ],
          label: { show: true, position: 'top', color: '#eef2f7', formatter: p => (p.value / 1000).toLocaleString('ar-SA') + ' ألف' }
        }]
      }
    },
    {
      title: 'معدل وفر أيام العمل بفضل أتمتة الخدمات والتحول الرقمي',
      span: 1,
      insight: 'وفرت منصة الخدمات الإلكترونية 650 ألف يوم عمل لرجال الأعمال والمشتركين',
      option: {
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: ['قبل التحول الرقمي', 'الوضع الحالي 2026'],
          axisLabel: { color: '#8ea3bd' }
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#8ea3bd', formatter: '{value} يوم' },
          splitLine: { lineStyle: { color: '#1d3a5a' } }
        },
        series: [{
          name: 'متوسط زمن معالجة المعاملة (أيام)',
          type: 'bar',
          barMaxWidth: 44,
          data: [
            { value: 4.2, itemStyle: { color: '#e0705f' } },
            { value: 0.3, itemStyle: { color: '#59c48f' } }
          ],
          label: { show: true, position: 'top', color: '#eef2f7', formatter: '{c} يوم' }
        }]
      }
    }
  ],
  insights: [
    'وصل إجمالي العمليات السنوية إلى 2,418,250 عملية بنمو سنوي 12% مقارنة بالعام السابق مدفوعاً بجهود التحول الرقمي.',
    'الإيرادات السنوية حققت 148 مليون ريال بنمو 5%، مع تحقيق فائض تشغيلي قدره 36.2 مليون ريال بنسبة هامش 24.4%.',
    'معدل حل الشكاوى بلغ 96.8%، مع تبقي 400 شكوى معلقة من أصل 12,450 تتطلب معالجة عاجلة لإغلاق ملفاتها.',
    'نسبة التحول الرقمي بلغت 98.4% مع انخفاض زمن معالجة المعاملات من 4.2 أيام إلى ساعات معدودة ووفر 650,000 يوم عمل.'
  ],
  actions: [
    { action: 'تشكيل فريق عمل سريع لمعالجة الـ 400 شكوى المعلقة', impact: 'رفع نسبة حل الشكاوى إلى 99.5% وتقليل زمن الإغلاق', why: '400 شكوى لم تُحل حتى نهاية الفترة' },
    { action: 'توسيع الربط الإلكتروني للغرف الطرفية (13 غرفة)', impact: 'زيادة العمليات الرقمية بنسبة 25% في المناطق الواعدة', why: 'استحواذ 3 غرف رئيسية على 81.4% من العمليات' },
    { action: 'إعادة استثمار الفائض التشغيلي (36.2M ريال) في البنية السحابية', impact: 'تسريع الأتمتة الكاملة وخفض تكاليف الصيانة بنسبة 18%', why: 'توفر فائض مالي تشغيلي قوي في ميزانية 2026' }
  ],
  tables: [
    {
      title: 'أداء الغرف التجارية السعودية في المؤشرات الرئيسية',
      columns: ['الغرفة التجارية', 'العمليات السنوية', 'نسبة التحول الرقمي', 'الشكاوى المستلمة', 'المحلولة', 'نسبة الإنجاز'],
      rows: [
        ['غرفة الرياض', '820,000', '99.1%', '4,200', '4,110', '97.8%'],
        ['غرفة جدة', '610,000', '98.6%', '3,150', '3,055', '97.0%'],
        ['غرفة الشرقية', '540,000', '98.5%', '2,800', '2,710', '96.8%'],
        ['غرفة مكة المكرمة', '260,000', '97.4%', '1,300', '1,245', '95.8%'],
        ['بقية الغرف (13)', '188,250', '96.2%', '1,000', '930', '93.0%']
      ]
    }
  ]
};

export async function getOrSeedExecutiveDashboard() {
  try {
    const cur = await getCurrentDash();
    if (cur?.id && cur.title !== 'test dashboard') {
      const d = await dashGet(+cur.id);
      if (d?.spec?.charts?.length) return cur;
    }

    const list = await dashList();
    const valid = list?.find(d => d.title && d.title !== 'test dashboard');
    if (valid) {
      const d = await dashGet(+valid.id);
      if (d?.spec?.charts?.length) {
        await setCurrentDash({ id: valid.id, title: valid.title, doc_name: '12_التقرير_السنوي_الشامل_لاداء_الغرف_السعوديه_2026.json' });
        return { ...valid, doc_name: '12_التقرير_السنوي_الشامل_لاداء_الغرف_السعوديه_2026.json' };
      }
    }

    // بناء الداشبورد التنفيذي الافتراضي ببيانات الأداء السنوي الحقيقية
    const id = await dashAdd(SAUDI_CHAMBERS_2026_SPEC.title, SAUDI_CHAMBERS_2026_SPEC);
    const seeded = {
      id,
      title: SAUDI_CHAMBERS_2026_SPEC.title,
      doc_name: '12_التقرير_السنوي_الشامل_لاداء_الغرف_السعوديه_2026.json',
      spec: SAUDI_CHAMBERS_2026_SPEC
    };
    await setCurrentDash(seeded);
    return seeded;
  } catch (err) {
    console.error('[dashboard/seed] error:', err.message);
    return null;
  }
}

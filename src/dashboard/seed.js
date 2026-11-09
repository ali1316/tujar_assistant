// src/dashboard/seed.js - تهيئة وتأكيد وجود الداشبورد التنفيذي الأساسي
import { dashAdd, dashList } from '../../store.js';
import { getCurrentDash, setCurrentDash } from '../../file-dash.js';

export async function getOrSeedExecutiveDashboard() {
  try {
    const cur = await getCurrentDash();
    if (cur?.id) return cur;

    const list = await dashList();
    if (list?.length) {
      const latest = list[0];
      await setCurrentDash({ id: latest.id, title: latest.title });
      return latest;
    }

    // بناء الداشبورد التنفيذي الافتراضي بمواصفات ECharts و Tabulator كاملة
    const spec = {
      title: 'لوحة قيادة التحول الرقمي ومشاريع الغرف 2026',
      subtitle: 'منصة تُجّار · اتحاد الغرف السعودية',
      kicker: 'المحفظة الاستراتيجية',
      designed_by: 'نورة · مستشار التحول الرقمي',
      headline: 'نسبة الإنجاز الإجمالية للمحفظة بلغت 64% مع رصد تأخر حرج في مسار أتمتة رخص البناء والربط السحابي',
      headline_flag: true,
      kpis: [
        { label: 'إجمالي الميزانية', value: 5800000, unit: 'ر.س', delta: '+12% سنوي' },
        { label: 'المصروف الفعلي', value: 2130000, unit: 'ر.س', delta: '36.7% من الميزانية' },
        { label: 'نسبة الإنجاز', value: 64, unit: '%', flag: 'good' },
        { label: 'المشاريع المتأخرة', value: 1, unit: 'مشروع', flag: 'bad' },
        { label: 'تذاكر الدعم المفتوحة', value: 0, unit: 'تذكرة' }
      ],
      charts: [
        {
          title: 'ما هي نسب إنجاز المشاريع الحالية مقارنة بالمستهدف؟',
          span: 2,
          insight: 'لوحة مؤشرات الأداء حققت 100% اكتمال، بينما أتمتة رخص البناء متأخرة عند 40%',
          flag: ['أتمتة رخص البناء'],
          option: {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: {
              type: 'category',
              data: ['أتمتة رخص البناء', 'لوحة مؤشرات الأداء', 'منصة البلاغات الذكية', 'ترحيل الأنظمة للسحابة', 'بوابة الخدمات الإلكترونية'],
              axisLabel: { color: '#8ea3bd', interval: 0, rotate: 15 }
            },
            yAxis: {
              type: 'value',
              max: 100,
              axisLabel: { color: '#8ea3bd', formatter: '{value}%' },
              splitLine: { lineStyle: { color: '#1d3a5a' } }
            },
            series: [{
              name: 'نسبة الإنجاز',
              type: 'bar',
              data: [
                { value: 40, itemStyle: { color: '#e0705f' } },
                { value: 100, itemStyle: { color: '#59c48f' } },
                { value: 30, itemStyle: { color: '#d1a65c' } },
                { value: 15, itemStyle: { color: '#e6b450' } },
                { value: 65, itemStyle: { color: '#5f86b3' } }
              ],
              label: { show: true, position: 'top', color: '#eef2f7', formatter: '{c}%' }
            }]
          }
        },
        {
          title: 'كيف تتوزع ميزانية التحول الرقمي بين الإدارات؟',
          span: 1,
          insight: 'قطاع تقنية المعلومات يستحوذ على 55% من إجمالي الميزانية المرصودة',
          option: {
            tooltip: { trigger: 'item', formatter: '{b}: {c} ر.س ({d}%)' },
            legend: { bottom: '0', left: 'center', textStyle: { color: '#8ea3bd' } },
            series: [{
              name: 'الميزانية',
              type: 'pie',
              radius: ['40%', '70%'],
              avoidLabelOverlap: false,
              itemStyle: { borderRadius: 8, borderColor: '#081726', borderWidth: 2 },
              data: [
                { value: 3200000, name: 'تقنية المعلومات', itemStyle: { color: '#5f86b3' } },
                { value: 1200000, name: 'التخطيط العمراني', itemStyle: { color: '#e0705f' } },
                { value: 800000, name: 'الاستراتيجية', itemStyle: { color: '#59c48f' } },
                { value: 600000, name: 'خدمة المستفيدين', itemStyle: { color: '#d1a65c' } }
              ]
            }]
          }
        }
      ],
      tables: [
        {
          title: 'موقف المشاريع الاستراتيجية المعتمدة',
          columns: ['#', 'المشروع', 'الإدارة', 'المسؤول', 'الميزانية', 'نسبة الإنجاز', 'الحالة'],
          rows_json: JSON.stringify([
            ['1', 'بوابة الخدمات الإلكترونية', 'تقنية المعلومات', 'سارة العتيبي', '1,800,000 ر.س', '65%', 'قيد التنفيذ'],
            ['2', 'أتمتة رخص البناء', 'التخطيط العمراني', 'خالد الحربي', '1,200,000 ر.س', '40%', 'متأخر'],
            ['3', 'لوحة مؤشرات الأداء', 'الاستراتيجية', 'نورة القحطاني', '800,000 ر.س', '100%', 'مكتمل'],
            ['4', 'منصة البلاغات الذكية', 'خدمة المستفيدين', 'فهد الشمري', '600,000 ر.س', '30%', 'قيد التنفيذ'],
            ['5', 'ترحيل الأنظمة للسحابة', 'تقنية المعلومات', 'سارة العتيبي', '1,400,000 ر.س', '15%', 'متوقف']
          ])
        }
      ],
      insights: [
        'تم استهلاك 36.7% فقط من الميزانية المخصصة مع تحقيق 64% من أهداف الربع.',
        'مشروع أتمتة رخص البناء يتطلب معالجة عاجلة مع فريق التخطيط العمراني لتفادي تأخير الإطلاق.',
        'جميع تذاكر الدعم الفني مغلقة بدون أي بلاغات حرجة معلقة.'
      ],
      actions: [
        { action: 'اعتماد خطة تسريع مشروع أتمتة رخص البناء', impact: 'تقليص التأخير بمقدار 18 يوماً', why: 'تجاوز الجدول الزمني بنسبة 15%' },
        { action: 'بدء مرحلة الاختبار الميداني لبوابة الخدمات', impact: 'إطلاق تجريبي لـ 500 مستفيد', why: 'وصول الإنجاز لـ 65%' },
        { action: 'إعادة جدولة ميزانية ترحيل السحابة غير المستغلة', impact: 'وفر مالي قدره 1.19 مليون ريال', why: 'توقف المشروع مؤقتاً لدراسة المتطلبات' }
      ]
    };

    const id = await dashAdd(spec.title, spec);
    const seeded = { id, title: spec.title };
    await setCurrentDash(seeded);
    console.log(`[dashboard] Seeded default executive dashboard #${id}`);
    return seeded;
  } catch (err) {
    console.error('[dashboard/seed] failed:', err.message);
    return null;
  }
}

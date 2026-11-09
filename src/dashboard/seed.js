// src/dashboard/seed.js - تهيئة وتأكيد وجود لوحات المشاريع الاستراتيجية والداشبورد التنفيذي الأساسي
import { dashAdd, dashList, kvGet, kvSet } from '../../store.js';
import { dashGet } from '../../dashboards.js';
import { getCurrentDash, setCurrentDash } from '../../file-dash.js';
import { db } from '../../db.js';

// 1. التقرير السنوي الشامل 2026
export const SAUDI_CHAMBERS_2026_SPEC = {
  title: 'تقرير الأداء السنوي 2026 - الغرف السعودية',
  subtitle: 'نظرة شاملة على العمليات والمبادرات على مستوى المملكة',
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

// 2. لوحة محفظة المشاريع الاستراتيجية الموحدة 2026
export const PORTFOLIO_2026_SPEC = {
  title: 'لوحة محفظة المشاريع الاستراتيجية 2026',
  subtitle: 'المتابعة الموحدة للمشاريع الخمسة ومسارات التحول الرقمي',
  kicker: 'محفظة المشاريع الرقمية',
  designed_by: 'نورة · مستشار التحول الرقمي',
  headline: 'إجمالي الميزانية 5.3M ريال بنسبة إنجاز إجمالية 58% مع مشروعين يتطلبان تدخلاً تنفيذياً عاجلاً',
  headline_flag: true,
  kpis: [
    { label: 'إجمالي ميزانية المحفظة', value: 5300000, unit: 'ريال', delta: '5 مشاريع استراتيجية' },
    { label: 'المصروف الفعلي حتى الآن', value: 2480000, unit: 'ريال', delta: '46.8% من الميزانية' },
    { label: 'متوسط الإنجاز الإجمالي', value: 58, unit: '%', flag: 'good', delta: 'مستهدف الربع 65%' },
    { label: 'المشاريع ذات المخاطر', value: 2, unit: 'مشاريع', flag: 'bad', delta: 'أتمتة الرخص + ترحيل السحابة' }
  ],
  charts: [
    {
      title: 'مقارنة نسبة الإنجاز الفعلي مقابل المخطط لكل مشروع',
      span: 2,
      insight: 'مشروع أتمتة رخص البناء وترحيل السحابة متأخران عن الخطة المعتمدة بنسب حرجة',
      flag: ['أتمتة رخص البناء', 'ترحيل الأنظمة للسحابة'],
      option: {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, textStyle: { color: '#8ea3bd' } },
        grid: { left: '3%', right: '4%', bottom: '8%', containLabel: true },
        xAxis: {
          type: 'category',
          data: ['بوابة الخدمات', 'أتمتة رخص البناء', 'مؤشرات الأداء', 'البلاغات الذكية', 'ترحيل السحابة'],
          axisLabel: { color: '#8ea3bd', interval: 0 }
        },
        yAxis: { type: 'value', max: 100, axisLabel: { color: '#8ea3bd', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1d3a5a' } } },
        series: [
          { name: 'المخطط', type: 'bar', data: [60, 58, 100, 30, 45], itemStyle: { color: '#2b4a6c' } },
          { name: 'الفعلي', type: 'bar', data: [65, 40, 100, 30, 15], itemStyle: { color: '#5f86b3' } }
        ]
      }
    },
    {
      title: 'توزيع ميزانية المشاريع والمصروف الفعلي',
      span: 1,
      insight: 'الميزانية الأكبر مخصصة لترحيل السحابة (2M) يليها بوابة الخدمات (1.2M)',
      option: {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ريال ({d}%)' },
        series: [{
          name: 'الميزانية',
          type: 'pie',
          radius: ['40%', '70%'],
          data: [
            { value: 1200000, name: 'بوابة الخدمات', itemStyle: { color: '#5f86b3' } },
            { value: 850000, name: 'أتمتة رخص البناء', itemStyle: { color: '#e6b450' } },
            { value: 300000, name: 'مؤشرات الأداء', itemStyle: { color: '#59c48f' } },
            { value: 950000, name: 'البلاغات الذكية', itemStyle: { color: '#4fb3a9' } },
            { value: 2000000, name: 'ترحيل السحابة', itemStyle: { color: '#e0705f' } }
          ],
          label: { show: true, color: '#c9d6e6', formatter: '{b}' }
        }]
      }
    }
  ],
  insights: [
    'المحفظة تضم 5 مشاريع استراتيجية بميزانية إجمالية 5.3 مليون ريال تم صرف 2.48 مليون ريال منها.',
    'مشروع لوحة مؤشرات الأداء مكتمل بنسبة 100% وحقق وفراً مالياً قدره 20 ألف ريال.',
    'مشروع أتمتة رخص البناء يعاني من تعثر بنسبة إنجاز 40% مقابل 58% مخطط ومصروف 600K من 850K.',
    'مشروع ترحيل السحابة متوقف عند 15% بانتظار استكمال متطلبات الاعتماد السيبراني.'
  ],
  actions: [
    { action: 'جلسة تسوية عاجلة مع فريق بلدي لمشروع أتمتة الرخص', impact: 'إعادة جدولة المشروع وتفادي تأخير التسليم لشهرين', why: 'تأخر الإنجاز 18% عن المستهدف' },
    { action: 'استكمال مسوغات الهيئة الوطنية للأمن السيبراني لترحيل السحابة', impact: 'استئناف أعمال الترحيل للبنية الحكومية', why: 'المشروع متوقف مؤقتاً عند 15%' }
  ]
};

// 3. لوحة مشروع 1: بوابة الخدمات الإلكترونية الموحدة
export const PROJECT_1_SPEC = {
  title: 'مشروع بوابة الخدمات الإلكترونية الموحدة',
  subtitle: 'مشروع رقم #1 · إدارة تقنية المعلومات والتحول الرقمي',
  kicker: 'لوحة متابعة المشروع',
  designed_by: 'نورة · مستشار التحول الرقمي',
  headline: 'نسبة الإنجاز 65% متقدمة بنسبة +5% عن الجدول مع اكتمال 18 خدمة رقمية من أصل 24',
  headline_flag: false,
  kpis: [
    { label: 'نسبة الإنجاز الفعلية', value: 65, unit: '%', flag: 'good', delta: '+5% عن الخطة' },
    { label: 'المصروف من الميزانية', value: 700000, unit: 'ريال', delta: 'من أصل 1,200,000 ريال' },
    { label: 'الخدمات الرقمية الجاهزة', value: 18, unit: 'خدمة', delta: 'من أصل 24 خدمة مستهدفة' },
    { label: 'الأيام المتبقية للإطلاق التجريبي', value: 22, unit: 'يوم', delta: 'المرحلة الأولى' }
  ],
  charts: [
    {
      title: 'مستوى إنجاز مسارات المشروع التقنية',
      span: 2,
      insight: 'مسار النفاذ الوطني وسداد الرسوم مكتملا تماماً، بينما توثيق العقود والتكامل قيد الإنهاء',
      option: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'value', max: 100, axisLabel: { color: '#8ea3bd', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1d3a5a' } } },
        yAxis: { type: 'category', data: ['النفاذ الوطني الموحد', 'بوابة سداد الإلكترونية', 'إصدار الشهادات والغرف', 'توثيق المحررات والعقود'], axisLabel: { color: '#8ea3bd' } },
        series: [{
          name: 'نسبة الإنجاز',
          type: 'bar',
          data: [
            { value: 100, itemStyle: { color: '#59c48f' } },
            { value: 92, itemStyle: { color: '#59c48f' } },
            { value: 75, itemStyle: { color: '#5f86b3' } },
            { value: 45, itemStyle: { color: '#d1a65c' } }
          ],
          label: { show: true, position: 'right', color: '#eef2f7', formatter: '{c}%' }
        }]
      }
    },
    {
      title: 'حرق الميزانية الفعلي مقابل المخطط شهرياً (آلاف الريالات)',
      span: 1,
      insight: 'الانضباط المالي ممتاز والصرف الفعلي يتماشى مع مراحل تسليم البرمجيات',
      option: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو'], axisLabel: { color: '#8ea3bd' } },
        yAxis: { type: 'value', axisLabel: { color: '#8ea3bd' }, splitLine: { lineStyle: { color: '#1d3a5a' } } },
        series: [
          { name: 'المخطط', type: 'line', data: [120, 240, 420, 600, 750], lineStyle: { color: '#2b4a6c', width: 2 } },
          { name: 'الفعلي', type: 'line', data: [110, 230, 390, 560, 700], lineStyle: { color: '#59c48f', width: 3 } }
        ]
      }
    }
  ],
  insights: [
    'تم الانتهاء بنجاح من الربط مع منصة النفاذ الوطني الموحد (نفاذ) لجميع مستخدمي الغرف.',
    'محرك إصدار الشهادات الإلكترونية اجتاز اختبارات الأداء بنجاح 10,000 عملية في الدقيقة.',
    'المصروف الفعلي 700 ألف ريال يشكل 58.3% من الميزانية المعتمدة مع التزام كامل بسقف التكاليف.'
  ],
  actions: [
    { action: 'بدء الاختبار التجريبي مع غرفتي الرياض والشرقية', impact: 'التحقق من جاهزية الخدمة قبل الإطلاق العام بـ 15 يوماً', why: 'اكتمال 18 خدمة أساسية' },
    { action: 'اعتماد الفحص الأمني لخدمات توثيق العقود', impact: 'إغلاق المرحلة الثانية في موعدها المحدد', why: 'المسار متبقي به 55% من متطلبات التدقيق' }
  ]
};

// 4. لوحة مشروع 2: أتمتة رخص البناء والأنشطة البلدية
export const PROJECT_2_SPEC = {
  title: 'مشروع أتمتة رخص البناء والأنشطة البلدية',
  subtitle: 'مشروع رقم #2 · التراخيص البلدية والخدمات التنموية',
  kicker: 'لوحة متابعة المشروع',
  designed_by: 'نورة · مستشار التحول الرقمي',
  headline: 'حالة المشروع: متأخر ⚠️ — نسبة الإنجاز 40% مقابل 58% مخطط مع استهلاك 70.5% من الميزانية',
  headline_flag: true,
  kpis: [
    { label: 'نسبة الإنجاز الفعلية', value: 40, unit: '%', flag: 'bad', delta: 'متأخر -18% عن الخطة' },
    { label: 'المصروف حتى الآن', value: 600000, unit: 'ريال', flag: 'bad', delta: 'من أصل 850,000 ريال (70.5%)' },
    { label: 'المعاملات المعلقة في الربط', value: 342, unit: 'معاملة', flag: 'bad', delta: 'بانتظار موافقة بلدي' },
    { label: 'مؤشر المخاطر العامة', value: 'حرج', unit: '', flag: 'bad', delta: 'تجاوز محتمل للميزانية' }
  ],
  charts: [
    {
      title: 'تحليل أسباب تعثر وتأخر إنجاز رخص البناء',
      span: 1,
      insight: 'تأخر استجابة واجهات الربط مع منصة بلدي يمثل 45% من مجمل معوقات المشروع',
      flag: ['تأخر واجهات ربط بلدي', 'تغيير اشتراطات المخططات'],
      option: {
        tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
        series: [{
          name: 'سبب التعثر',
          type: 'pie',
          radius: ['45%', '70%'],
          data: [
            { value: 45, name: 'تأخر واجهات ربط بلدي', itemStyle: { color: '#e0705f' } },
            { value: 25, name: 'تغيير اشتراطات المخططات', itemStyle: { color: '#e6b450' } },
            { value: 18, name: 'إعادة اختبارات الأمان', itemStyle: { color: '#5f86b3' } },
            { value: 12, name: 'نقص الموارد الفنية لدى المقاول', itemStyle: { color: '#8fa7c4' } }
          ],
          label: { show: true, color: '#c9d6e6', formatter: '{b}: {c}%' }
        }]
      }
    },
    {
      title: 'مقارنة الأسابيع المخططة مقابل المستهلكة حسب مراحل العمل',
      span: 2,
      insight: 'مرحلة التكامل والربط استهلكت 14 أسبوعاً بدلاً من 6 أسابيع مخططة',
      option: {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, textStyle: { color: '#8ea3bd' } },
        xAxis: { type: 'category', data: ['تحليل النطاق', 'تصميم الواجهات', 'التكامل والربط مع بلدي', 'اختبار المستخدم UAT', 'الإطلاق التجريبي'], axisLabel: { color: '#8ea3bd' } },
        yAxis: { type: 'value', axisLabel: { color: '#8ea3bd', formatter: '{value} أسبوع' }, splitLine: { lineStyle: { color: '#1d3a5a' } } },
        series: [
          { name: 'المخطط (أسابيع)', type: 'bar', data: [4, 6, 6, 4, 2], itemStyle: { color: '#2b4a6c' } },
          { name: 'الفعلي المستهلك', type: 'bar', data: [4, 7, 14, 2, 0], itemStyle: { color: '#e0705f' } }
        ]
      }
    }
  ],
  insights: [
    'المشروع يواجه خطر تجاوز الميزانية نظراً لاستهلاك 600K ريال بنسبة إنجاز 40% فقط.',
    'هناك 342 معاملة تجريبية معلقة على استجابة خوادم منصة بلدي المركزية.',
    'فريق المقاول طلب أمر تغيير بقيمة 120 ألف ريال لمعالجة متطلبات الاشتراطات البلدية المحدثة.'
  ],
  actions: [
    { action: 'عقد اجتماع تنسيقي عاجل مع فريق الدعم الفني بوزارة البلديات', impact: 'إنهاء مشاكل واجهة الربط خلال 48 ساعة وحل 342 معاملة', why: 'تمثل 45% من أسباب التأخير' },
    { action: 'رفض طلب أمر التغيير والالتزام ببنود العقد الموقعة', impact: 'حماية الميزانية من التجاوز المالي', why: 'نسبة الصرف تجاوزت 70% من الميزانية الكلية' }
  ]
};

// 5. لوحة مشروع 3: لوحة مؤشرات الأداء الحضرية واللوجستية
export const PROJECT_3_SPEC = {
  title: 'مشروع لوحة مؤشرات الأداء الحضرية واللوجستية',
  subtitle: 'مشروع رقم #3 · مركز دعم القرار والبيانات الإحصائية',
  kicker: 'لوحة متابعة المشروع',
  designed_by: 'نورة · مستشار التحول الرقمي',
  headline: 'حالة المشروع: مكتمل ✅ بنسبة 100% مع وفر مالي قدره 20,000 ريال وربط 28 غرفة تجارية',
  headline_flag: false,
  kpis: [
    { label: 'نسبة الإنجاز الكلية', value: 100, unit: '%', flag: 'good', delta: 'تم التسليم والاعتماد' },
    { label: 'الميزانية المنفقة', value: 280000, unit: 'ريال', flag: 'good', delta: 'وفر 20,000 ريال (من 300K)' },
    { label: 'المؤشرات اللحظية النشطة', value: 48, unit: 'مؤشر', flag: 'good', delta: 'تحديث لحظي' },
    { label: 'الغرف المرتبطة باللوحة', value: 28, unit: 'غرفة', delta: 'تغطية بنسبة 100%' }
  ],
  charts: [
    {
      title: 'معدل دقة وحداثة البيانات اللوجستية حسب القطاع (%)',
      span: 2,
      insight: 'قطاعات النقل والمستودعات والتخليص الجمركي تسجل معدل دقة بيانات يفوق 98%',
      option: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['النقل البري', 'الموانئ والمستودعات', 'التخليص الجمركي', 'المناطق اللوجستية', 'سلاسل الإمداد'], axisLabel: { color: '#8ea3bd' } },
        yAxis: { type: 'value', min: 80, max: 100, axisLabel: { color: '#8ea3bd', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1d3a5a' } } },
        series: [{
          name: 'دقة البيانات',
          type: 'bar',
          barMaxWidth: 48,
          data: [99.2, 98.7, 98.4, 96.5, 95.8],
          itemStyle: { color: '#59c48f' },
          label: { show: true, position: 'top', color: '#eef2f7', formatter: '{c}%' }
        }]
      }
    },
    {
      title: 'متوسط سرعة استجابة الاستعلامات التحليلية (ميلي ثانية)',
      span: 1,
      insight: 'زمن الاستجابة للاستعلامات الإحصائية انخفض إلى 240ms بعد تفعيل التخزين المؤقت',
      option: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['قبل التحسين', 'بعد التحسين'], axisLabel: { color: '#8ea3bd' } },
        yAxis: { type: 'value', axisLabel: { color: '#8ea3bd', formatter: '{value} ms' }, splitLine: { lineStyle: { color: '#1d3a5a' } } },
        series: [{
          name: 'زمن الاستجابة',
          type: 'bar',
          barMaxWidth: 45,
          data: [
            { value: 1850, itemStyle: { color: '#e6b450' } },
            { value: 240, itemStyle: { color: '#59c48f' } }
          ],
          label: { show: true, position: 'top', color: '#eef2f7', formatter: '{c} ms' }
        }]
      }
    }
  ],
  insights: [
    'تم اعتماد المشروع رسمياً واستلام كافة مخرجات البرمجيات والتوثيق الفني.',
    'المشروع حقق وفراً مالياً قدره 20,000 ريال (6.7% من الميزانية المعتمدة).',
    'اللوحة تزود قيادة الاتحاد بـ 48 مؤشراً تنموياً لحظياً متصلاً بـ 28 غرفة في مختلف مناطق المملكة.'
  ],
  actions: [
    { action: 'تفعيل إرسال التقارير التلقائية الأسبوعية لأعضاء مجلس الإدارة', impact: 'تعزيز الرؤية الاستراتيجية لمتخذي القرار', why: 'المنصة جاهزة تماماً وتعمل بكفاءة' },
    { action: 'إغلاق العقد النهائي وإصدار شهادة الإنجاز للمورد', impact: 'استكمال الإجراءات المالية والإدارية الرسمية', why: 'التسليم مكتمل بنسبة 100%' }
  ]
};

// 6. لوحة مشروع 4: منصة البلاغات الذكية وخدمة العملاء (صوت العميل)
export const PROJECT_4_SPEC = {
  title: 'مشروع منصة البلاغات الذكية وخدمة العملاء (صوت العميل)',
  subtitle: 'مشروع رقم #4 · تجربة العميل والاتصال المؤسسي',
  kicker: 'لوحة متابعة المشروع',
  designed_by: 'نورة · مستشار التحول الرقمي',
  headline: 'نسبة الإنجاز 30% مطابقة للجدول الزمني مع اكتمال دمج قنوات الواتساب والبوابة',
  headline_flag: false,
  kpis: [
    { label: 'نسبة الإنجاز الفعلية', value: 30, unit: '%', flag: 'good', delta: 'مطابق للجدول تماماً' },
    { label: 'المصروف حتى الآن', value: 250000, unit: 'ريال', delta: 'من أصل 950,000 ريال (26.3%)' },
    { label: 'القنوات الرقمية المدمجة', value: 4, unit: 'قنوات', delta: 'واتساب، بوابة، تطبيق، اتصال' },
    { label: 'متوسط زمن الإغلاق المستهدف', value: 2, unit: 'ساعات', flag: 'good', delta: 'بدلاً من 48 ساعة' }
  ],
  charts: [
    {
      title: 'التوزيع المتوقع لحجم البلاغات حسب القناة الرقمية',
      span: 1,
      insight: 'تطبيق واتساب الأعمال يستحوذ على 55% من الحجم المتوقع للبلاغات والاستفسارات',
      option: {
        tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
        series: [{
          name: 'القناة',
          type: 'pie',
          radius: ['45%', '70%'],
          data: [
            { value: 55, name: 'واتساب الأعمال الذكي', itemStyle: { color: '#59c48f' } },
            { value: 25, name: 'بوابة منصة تجار', itemStyle: { color: '#5f86b3' } },
            { value: 15, name: 'تطبيق الهاتف المحمول', itemStyle: { color: '#d1a65c' } },
            { value: 5, name: 'مركز الاتصال الموحد', itemStyle: { color: '#8fa7c4' } }
          ],
          label: { show: true, color: '#c9d6e6', formatter: '{b}' }
        }]
      }
    },
    {
      title: 'تقدم بناء محرك الفرز والتصنيف الآلي بالذكاء الاصطناعي',
      span: 2,
      insight: 'تم تدريب خوارزميات تصنيف البلاغات بدقة 92% وتوجيه التذاكر آلياً للأقسام المعنية',
      option: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['فرز بلاغات الرسوم', 'توجيه الشكاوى الفنية', 'الاستفسارات العامة', 'بلاغات التراخيص', 'تذاكر الدعم العاجل'], axisLabel: { color: '#8ea3bd' } },
        yAxis: { type: 'value', max: 100, axisLabel: { color: '#8ea3bd', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1d3a5a' } } },
        series: [{
          name: 'نسبة الدقة',
          type: 'bar',
          barMaxWidth: 48,
          data: [96, 91, 94, 88, 92],
          itemStyle: { color: '#4fb3a9' },
          label: { show: true, position: 'top', color: '#eef2f7', formatter: '{c}%' }
        }]
      }
    }
  ],
  insights: [
    'تم الانتهاء من ربط واجهات برمجة التطبيقات (APIs) مع مزود خدمة واتساب المعتمد.',
    'محرك الذكاء الاصطناعي يفرز البلاغات الواردة تلقائياً إلى 6 تصنيفات رئيسية.',
    'المشروع يسير وفق المخطط الزمني المعتمد والصرف المالي متحكم به بدقة.'
  ],
  actions: [
    { action: 'إطلاق المرحلة التجريبية المغلقة مع موظفي خدمة العملاء بغرفة جدة', impact: 'قياس دقة الفرز الآلي وتغذية نموذج التعلم قبل الإطلاق العام', why: 'اكتمال 30% من المشروع وجاهزية البيئة التجريبية' }
  ]
};

// 7. لوحة مشروع 5: ترحيل الأنظمة والبيانات للسحابة الحكومية
export const PROJECT_5_SPEC = {
  title: 'مشروع ترحيل الأنظمة والبيانات إلى السحابة الحكومية',
  subtitle: 'مشروع رقم #5 · البنية التحتية والتحول السحابي',
  kicker: 'لوحة متابعة المشروع',
  designed_by: 'نورة · مستشار التحول الرقمي',
  headline: 'حالة المشروع: متوقف مؤقتاً ⛔ بنسبة إنجاز 15% بانتظار استكمال شهادة الامتثال السيبراني',
  headline_flag: true,
  kpis: [
    { label: 'نسبة الإنجاز الفعلية', value: 15, unit: '%', flag: 'bad', delta: 'متوقف مؤقتاً' },
    { label: 'المصروف حتى الآن', value: 300000, unit: 'ريال', delta: 'من أصل 2,000,000 ريال (15%)' },
    { label: 'الأنظمة المرشحة للترحيل', value: 14, unit: 'نظاماً', delta: 'تم ترحيل 2 منها فقط' },
    { label: 'متطلبات الامتثال المعلقة', value: 3, unit: 'متطلبات', flag: 'bad', delta: 'الضوابط الأساسية للأمن السيبراني' }
  ],
  charts: [
    {
      title: 'موقف الأنظمة الـ 14 من الترحيل السحابي',
      span: 1,
      insight: 'نظامان تم ترحيلهما بنجاح، و9 أنظمة جاهزة للترحيل بانتظار الاعتماد الأمني، و3 قيد المعالجة',
      flag: ['جاهزة ومعلقة للأمان'],
      option: {
        tooltip: { trigger: 'item', formatter: '{b}: {c} أنظمة' },
        series: [{
          name: 'حالة النظام',
          type: 'pie',
          radius: ['45%', '70%'],
          data: [
            { value: 2, name: 'تم الترحيل بنجاح', itemStyle: { color: '#59c48f' } },
            { value: 9, name: 'جاهزة ومعلقة للأمان', itemStyle: { color: '#e0705f' } },
            { value: 3, name: 'قيد التجهيز التقني', itemStyle: { color: '#d1a65c' } }
          ],
          label: { show: true, color: '#c9d6e6', formatter: '{b}: {c}' }
        }]
      }
    },
    {
      title: 'الوفر المالي السنوي المتوقع بعد استكمال الترحيل السحابي (آلاف الريالات)',
      span: 2,
      insight: 'الترحيل سيوفر 780 ألف ريال سنوياً في تكاليف صيانة الخوادم والتراخيص والكهرباء',
      option: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['تراخيص البرمجيات', 'صيانة العتاد', 'فواتير الطاقة والتبريد', 'فرق الدعم الميداني'], axisLabel: { color: '#8ea3bd' } },
        yAxis: { type: 'value', axisLabel: { color: '#8ea3bd', formatter: '{value} ألف' }, splitLine: { lineStyle: { color: '#1d3a5a' } } },
        series: [{
          name: 'الوفر المتوقع (ألف ريال)',
          type: 'bar',
          barMaxWidth: 50,
          data: [320, 240, 120, 100],
          itemStyle: { color: '#5f86b3' },
          label: { show: true, position: 'top', color: '#eef2f7', formatter: '{c} ألف' }
        }]
      }
    }
  ],
  insights: [
    'تم تجميد أعمال الترحيل مؤقتاً بالاتفاق مع الفريق السيبراني حرصاً على سرية وسلامة بيانات المشتركين.',
    'تم صرف 300 ألف ريال فقط من ميزانية الـ 2 مليون ريال ولا توجد أي التزامات مالية متأخرة.',
    'المشروع يحقق وفراً تشغيلياً مستداماً بقيمة 780 ألف ريال سنوياً بمجرد إغلاق مراكز البيانات القديمة.'
  ],
  actions: [
    { action: 'إغلاق الملاحظات الثلاث المتبقية في تدقيق الأمن السيبراني', impact: 'استئناف ترحيل الـ 9 أنظمة المعلقة خلال 10 أيام عمل', why: 'الشرط الوحيد لاستئناف الأعمال' }
  ]
};

// قائمة اللوحات المرجعية والمشاريع المتاحة
export const ALL_PROJECT_SPECS = [
  { projectId: 1, key: 'proj_1', spec: PROJECT_1_SPEC },
  { projectId: 2, key: 'proj_2', spec: PROJECT_2_SPEC },
  { projectId: 3, key: 'proj_3', spec: PROJECT_3_SPEC },
  { projectId: 4, key: 'proj_4', spec: PROJECT_4_SPEC },
  { projectId: 5, key: 'proj_5', spec: PROJECT_5_SPEC }
];

// دالة تهيئة وبذر كافة اللوحات في قاعدة البيانات وربطها بالمشاريع
export async function seedAllProjectDashboards() {
  try {
    // 1. التأكد من وجود عمود dashboard_id في جدول projects
    try {
      const pCols = await db.prepare('PRAGMA table_info(projects)').all();
      if (!pCols.some(c => c.name === 'dashboard_id')) {
        await db.prepare('ALTER TABLE projects ADD COLUMN dashboard_id INTEGER').run();
      }
    } catch {}

    const list = await dashList();
    const existingTitles = new Map(list.map(d => [d.title, d.id]));

    // 2. بذر التقرير السنوي 2026 إذا لم يكن موجوداً
    let annualReportId = existingTitles.get(SAUDI_CHAMBERS_2026_SPEC.title);
    if (!annualReportId) {
      annualReportId = await dashAdd(SAUDI_CHAMBERS_2026_SPEC.title, SAUDI_CHAMBERS_2026_SPEC);
    }

    // 3. بذر لوحة المحفظة 2026 إذا لم تكن موجودة
    let portfolioId = existingTitles.get(PORTFOLIO_2026_SPEC.title);
    if (!portfolioId) {
      portfolioId = await dashAdd(PORTFOLIO_2026_SPEC.title, PORTFOLIO_2026_SPEC);
    }

    // 4. بذر لوحة كل مشروع من المشاريع الـ 5 وربطه في جدول projects
    for (const item of ALL_PROJECT_SPECS) {
      let dashId = existingTitles.get(item.spec.title);
      if (!dashId) {
        dashId = await dashAdd(item.spec.title, item.spec);
      }
      try {
        await db.prepare('UPDATE projects SET dashboard_id=? WHERE id=?').run(dashId, item.projectId);
      } catch {}
    }

    // 5. ضبط الداشبورد الحالي إن لم يكن مضبوطاً
    const cur = await getCurrentDash();
    if (!cur?.id || cur.title === 'test dashboard') {
      await setCurrentDash({
        id: annualReportId,
        title: SAUDI_CHAMBERS_2026_SPEC.title,
        doc_name: '12_التقرير_السنوي_الشامل_لاداء_الغرف_السعوديه_2026.json'
      });
    }

    return {
      annualReportId,
      portfolioId,
      projectsSeeded: ALL_PROJECT_SPECS.length
    };
  } catch (err) {
    console.error('[dashboard/seedAll] error:', err.message);
    return null;
  }
}

export async function getOrSeedExecutiveDashboard() {
  await seedAllProjectDashboards();
  const cur = await getCurrentDash();
  if (cur?.id && cur.title !== 'test dashboard') {
    const d = await dashGet(+cur.id);
    if (d?.spec?.charts?.length) return cur;
  }
  return {
    id: 2,
    title: SAUDI_CHAMBERS_2026_SPEC.title,
    doc_name: '12_التقرير_السنوي_الشامل_لاداء_الغرف_السعوديه_2026.json',
    spec: SAUDI_CHAMBERS_2026_SPEC
  };
}

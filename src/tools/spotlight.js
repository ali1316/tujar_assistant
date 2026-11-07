// أداة الإخراج والتوجيه البصري للشاشة (Choreographed Screen Spotlight)
// تتيح لنورة تسليط الضوء على بطاقات أو رسوم أو صفوف في الجداول بتوهج ذهبي وشارة نبض أثناء الشرح الصوتي

export const spotlightTools = {
  spotlight_element: {
    declaration: {
      name: 'spotlight_element',
      description: 'تسليط الضوء البصري (Spotlight) على عنصر محدد في الشاشة (بطاقة مؤشر، صف جدول، رسم بياني، أو محدد CSS) مع هالة ذهبية وشارة نبض مرافقة أثناء الشرح الصوتي.',
      parameters: {
        type: 'OBJECT',
        properties: {
          target: {
            type: 'STRING',
            description: 'محدد العنصر المراد تمييزه: محدد CSS مثل #kpis أو #projects، أو سمة بيانات مثل [data-project-id="1"]، أو نص داخل صف جدول أو بطاقة',
          },
          label: {
            type: 'STRING',
            description: 'شارة نبض تنفيذية مرافقة تظهر فوق العنصر لشرح ما تشير إليه نورة',
          },
          durationMs: {
            type: 'INTEGER',
            description: 'مدة تسليط الضوء بالملي ثانية قبل إزالته تلقائياً (الافتراضي 5000)',
          },
        },
        required: ['target'],
      },
    },
    run: async ({ target, label, durationMs = 5000, style } = {}) => {
      if (!target) {
        return { ok: false, error: 'target مطلوب لتسليط الضوء' };
      }
      return {
        ok: true,
        action: 'spotlight',
        target,
        label: label || null,
        durationMs: typeof durationMs === 'number' ? durationMs : 5000,
        style: style || null,
      };
    },
  },
};

export const spotlight_element = spotlightTools.spotlight_element;

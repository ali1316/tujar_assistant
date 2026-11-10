import { ai } from '../src/ai.js';
import { dashGet } from '../dashboards.js';

async function test() {
  const d = await dashGet(2);
  const dashSpec = d.spec;
  const screenInfo = `
المعروض حالياً على الشاشة أمام الأستاذ فواز:
لوحة: ${dashSpec.title || 'لوحة البيانات'}
${dashSpec.subtitle ? `المصدر / النطاق: ${dashSpec.subtitle}` : ''}
${dashSpec.headline ? `النتيجة الأهم: ${dashSpec.headline}` : ''}
${dashSpec.kpis?.length ? `المؤشرات الرئيسية (KPIs):
${dashSpec.kpis.map(k => `- ${k.label}: ${typeof k.value === 'number' ? k.value.toLocaleString('ar-SA') : k.value} ${k.unit || ''} ${k.delta ? `(${k.delta})` : ''}`).join('\n')}` : ''}
`;

  const promptWithInfo = `أنت نورة، المستشارة والمساعدة التنفيذية الذكية للأستاذ فواز في اتحاد الغرف السعودية ومنصة تُجّار.
أنتِ تشاهدين شاشة فواز مباشرة وتعرفين ما هو معروض عليها بدقة كاملة ولحظية.
عندما يسألك فواز عن 'المعروض' أو يطلب تلخيص المعروض أو يسأل عن اللوحة الحالية أو الأرقام الظاهرة أمامه:
- لخصي له فوراً وبأسلوب تنفيذي موجز واحترافي الأرقام والمؤشرات الحقيقية المعروضة أمامه.
- لا تطلبي منه تزويدك بالمحتوى أو المعروض إطلاقاً، لأنك ترينه بالفعل في بيانات الشاشة المعطاة لك أعلاه.
أجيبي بلهجة تنفيذية سعودية رفيعة ومباشرة واضحة.

${screenInfo}

سؤال فواز:
لخص المعروض`;

  const r1 = await ai.models.generateContent({ contents: promptWithInfo });
  console.log('--- REVERSE TEST: WITH screenInfo ---');
  console.log(r1.text);

  const promptEmpty = `أنت نورة، المستشارة والمساعدة التنفيذية الذكية للأستاذ فواز في اتحاد الغرف السعودية ومنصة تُجّار.
أنتِ تشاهدين شاشة فواز مباشرة وتعرفين ما هو معروض عليها بدقة كاملة ولحظية.
عندما يسألك فواز عن 'المعروض' أو يطلب تلخيص المعروض أو يسأل عن اللوحة الحالية أو الأرقام الظاهرة أمامه:
- لخصي له فوراً وبأسلوب تنفيذي موجز واحترافي الأرقام والمؤشرات الحقيقية المعروضة أمامه.
- لا تطلبي منه تزويدك بالمحتوى أو المعروض إطلاقاً، لأنك ترينه بالفعل في بيانات الشاشة المعطاة لك أعلاه.
أجيبي بلهجة تنفيذية سعودية رفيعة ومباشرة واضحة.



سؤال فواز:
لخص المعروض`;

  const r2 = await ai.models.generateContent({ contents: promptEmpty });
  console.log('--- REVERSE TEST: WITHOUT screenInfo ---');
  console.log(r2.text);
}

test().catch(console.error);

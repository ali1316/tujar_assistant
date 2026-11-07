import { ACCESS_CODE } from '../config.js';

// رمز الدخول لكل مسارات /api
export function authMiddleware(req, res, next) {
  if (!ACCESS_CODE || (req.get('x-access-code') || req.query.code) === ACCESS_CODE) {
    return next();
  }

  // فتح رابط /api مباشرة من المتصفح: صفحة توضيحية بدل JSON مربك (الواجهة نفسها ترسل الرمز في الهيدر)
  if (req.method === 'GET' && req.accepts(['json', 'html']) === 'html' && !req.get('x-access-code')) {
    return res.status(401).type('html').send(
      '<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:system-ui;padding:40px;background:#0f1720;color:#e8e2d6"><h2>هذا رابط داخلي للسيرفر</h2><p>روابط <code>/api</code> تستخدمها واجهة نورة من الداخل ومحمية برمز الدخول. افتح الصفحة الرئيسية:</p><p><a style="color:#d1a65c" href="/">نورة ←</a></p></body>'
    );
  }

  res.status(401).json({ error: 'رمز الدخول غلط' });
}

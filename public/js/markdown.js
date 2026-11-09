// public/js/markdown.js - منسق النصوص التنفيذية ومحول Markdown لواجهة نورة
// يحوّل النصوص الخام من النماذج اللغوية إلى بطاقات تنفيذية راقية متوافقة مع معايير Apple HIG

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * تحويل نص Markdown التنفيذي إلى عناصر HTML منسقة بالكامل
 */
export function formatMarkdown(text) {
  if (!text) return '';

  let raw = String(text);

  // معالجة النصوص المضغوطة لتفريق العناوين والنقاط المدمجة في نفس السطر
  raw = raw.replace(/\s+(###\s+)/g, '\n\n$1');
  raw = raw.replace(/\s+(##\s+)/g, '\n\n$1');
  raw = raw.replace(/:\s*\*\s+/g, ':\n* ');
  raw = raw.replace(/([.؛?!])\s*\*\s+/g, '$1\n* ');
  raw = raw.replace(/([^\n\d])\s+\*\s+/g, '$1\n* ');
  raw = raw.replace(/([.؛?!])\s*(\d+[\.\)]\s+)/g, '$1\n$2');

  const lines = raw.split(/\r?\n/);
  const out = [];

  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  const inlineFormat = (str) => {
    let s = escapeHtml(str);
    // Bold with triple or double asterisks
    s = s.replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="exec-bold"><em>$1</em></strong>');
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong class="exec-bold">$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong class="exec-bold">$1</strong>');
    // Italic with CommonMark whitespace guard
    s = s.replace(/\*(?!\s)([^*]+?)(?<!\s)\*/gu, '<em class="exec-em">$1</em>');
    s = s.replace(/\*([^*]+)\*/g, '<em class="exec-em">$1</em>');
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code class="exec-code">$1</code>');
    // Key figures and percentages highlight (e.g. 64%, 5.3M ريال)
    s = s.replace(/(\d+(?:[.,]\d+)?\s*(?:%|٪|مليار ريال|مليون ريال|مليار|مليون|ريال|ر\.س|مشروعاً|مشاريع|مشروع|تذاكر|تذكرة))/gu, '<span class="exec-kpi-chip">$1</span>');
    return s;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Headings (###, ##, #)
    const h3Match = trimmed.match(/^###\s+(.*)/);
    const h2Match = trimmed.match(/^##\s+(.*)/);
    const h1Match = trimmed.match(/^#\s+(.*)/);

    if (h1Match || h2Match || h3Match) {
      closeLists();
      const content = inlineFormat((h1Match || h2Match || h3Match)[1]);
      out.push(`
        <div class="exec-section-header">
          <span class="exec-section-bar"></span>
          <h4 class="exec-section-title">${content}</h4>
        </div>
      `);
      continue;
    }

    // Horizontal Rule
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeLists();
      out.push('<hr class="exec-divider">');
      continue;
    }

    // Unordered List Items (*, -, •)
    const ulMatch = line.match(/^\s*[*\-•]\s+(.*)/);
    if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul class="exec-ul">'); inUl = true; }
      out.push(`
        <li class="exec-li">
          <span class="exec-bullet"></span>
          <div class="exec-li-body">${inlineFormat(ulMatch[1])}</div>
        </li>
      `);
      continue;
    }

    // Ordered List Items (1. 2. etc.)
    const olMatch = line.match(/^\s*(\d+)[\.\)]\s+(.*)/);
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol class="exec-ol">'); inOl = true; }
      out.push(`
        <li class="exec-li">
          <span class="exec-num-badge">${olMatch[1]}</span>
          <div class="exec-li-body">${inlineFormat(olMatch[2])}</div>
        </li>
      `);
      continue;
    }

    // Blank line -> Paragraph spacing
    if (!trimmed) {
      closeLists();
      out.push('<div class="exec-gap"></div>');
      continue;
    }

    // Regular Paragraph
    closeLists();
    out.push(`<p class="exec-p">${inlineFormat(line)}</p>`);
  }

  closeLists();
  return out.join('\n');
}

/**
 * بناء بطاقة رسالة المستخدم (فواز)
 */
export function buildUserCard(text) {
  const card = document.createElement('div');
  card.className = 'm u exec-msg-card exec-user-card';
  card.innerHTML = `
    <div class="exec-card-head">
      <div class="exec-user-badge">
        <span class="exec-user-avatar">👤</span>
        <span class="exec-user-name">فواز</span>
      </div>
      <span class="exec-msg-time">${new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="exec-user-body">${escapeHtml(text)}</div>
  `;
  return card;
}

/**
 * بناء بطاقة إجابة المساعد التنفيذي (نورة) مع الدعم الكامل للـ Markdown وأزرار النسخ والاستماع
 */
export function buildAssistantCard(text, { onSpeak = null, isOld = false } = {}) {
  const card = document.createElement('div');
  card.className = `m a exec-msg-card exec-assistant-card ${isOld ? 'old' : ''}`;

  const formattedHtml = formatMarkdown(text);

  card.innerHTML = `
    <div class="exec-card-head">
      <div class="exec-agent-badge">
        <span class="exec-agent-icon">🏛️</span>
        <div class="exec-agent-meta">
          <span class="exec-agent-name">نورة</span>
          <span class="exec-agent-role">مستشار التحول الرقمي</span>
        </div>
      </div>
      <div class="exec-card-actions">
        <button type="button" class="exec-action-btn exec-copy-btn" title="نسخ النص" aria-label="نسخ الملخص">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span class="btn-lbl">نسخ</span>
        </button>
        <button type="button" class="exec-action-btn exec-speak-btn" title="استمع للملخص" aria-label="استمع للملخص بصوت نورة">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
          <span class="btn-lbl">استمع</span>
        </button>
      </div>
    </div>
    <div class="exec-card-content">
      ${formattedHtml}
    </div>
  `;

  // تفعيل زر النسخ للحافظة
  const copyBtn = card.querySelector('.exec-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.classList.add('copied');
        const lbl = copyBtn.querySelector('.btn-lbl');
        if (lbl) lbl.textContent = 'تم النسخ ✓';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          if (lbl) lbl.textContent = 'نسخ';
        }, 2000);
      } catch (err) {
        console.warn('Clipboard copy failed:', err.message);
      }
    });
  }

  // تفعيل زر الاستماع الصوتي
  const speakBtn = card.querySelector('.exec-speak-btn');
  if (speakBtn) {
    speakBtn.addEventListener('click', () => {
      if (typeof onSpeak === 'function') {
        onSpeak(text);
      } else if (window.__nora?.speak) {
        const clean = text.replace(/[*#`_⟨⟩]/g, ' ').replace(/\s+/g, ' ').trim();
        window.__nora.speak(clean);
      } else if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const cleanText = text.replace(/[#*`_]/g, '');
        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.lang = 'ar-SA';
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
      }
    });
  }

  return card;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Helper: Lightweight DOM implementation for Node.js testing
class MockClassList {
  constructor(el, initial = '') {
    this.el = el;
    this.set = new Set(String(initial).split(/\s+/).filter(Boolean));
  }

  add(...classes) {
    for (const c of classes) {
      if (c) this.set.add(c);
    }
    this.el.attributes.class = Array.from(this.set).join(' ');
  }

  remove(...classes) {
    for (const c of classes) {
      if (c) this.set.delete(c);
    }
    this.el.attributes.class = Array.from(this.set).join(' ');
  }

  contains(c) {
    return this.set.has(c);
  }

  toggle(c, force) {
    if (force !== undefined) {
      if (force) this.add(c); else this.remove(c);
      return force;
    }
    if (this.contains(c)) {
      this.remove(c);
      return false;
    }
    this.add(c);
    return true;
  }

  toString() {
    return Array.from(this.set).join(' ');
  }
}

class MockElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attrs };
    this.id = attrs.id || '';
    this.classList = new MockClassList(this, attrs.class || '');
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.nodeType = 1;
    this._text = '';
    this.scrolled = false;
    this.scrollOptions = null;
  }

  get className() {
    return this.classList.toString();
  }

  set className(v) {
    this.classList = new MockClassList(this, v || '');
    this.attributes.class = v || '';
  }

  get textContent() {
    if (this._text) return this._text;
    return this.children.map(c => c.textContent).join(' ');
  }

  set textContent(v) {
    this._text = v;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  scrollIntoView(opts) {
    this.scrolled = true;
    this.scrollOptions = opts;
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
    if (k === 'id') this.id = v;
    if (k === 'class') {
      this.classList = new MockClassList(this, v || '');
    }
  }

  getAttribute(k) {
    return this.attributes[k];
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

function matchesSelector(el, selector) {
  const sel = selector.trim();
  if (sel.includes(',')) {
    return sel.split(',').some(p => matchesSelector(el, p.trim()));
  }

  let rem = sel;

  // Attribute selector [key="value"] or [key]
  const attrMatch = rem.match(/\[([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?\]/);
  if (attrMatch) {
    const [full, attrKey, attrVal] = attrMatch;
    if (!(attrKey in el.attributes)) return false;
    if (attrVal !== undefined && el.attributes[attrKey] !== attrVal) return false;
    rem = rem.replace(full, '');
  }

  // ID selector #id
  const idMatch = rem.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1] && el.attributes.id !== idMatch[1]) return false;
    rem = rem.replace(idMatch[0], '');
  }

  // Class selectors .class
  const classMatches = rem.match(/\.([a-zA-Z0-9_-]+)/g);
  if (classMatches) {
    for (const cm of classMatches) {
      if (!el.classList.contains(cm.slice(1))) return false;
      rem = rem.replace(cm, '');
    }
  }

  // Tag selector
  const tag = rem.trim();
  if (tag && tag !== '*' && el.tagName !== tag.toUpperCase()) {
    return false;
  }

  return true;
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }

  querySelector(selector) {
    if (matchesSelector(this.body, selector)) return this.body;
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

class MockWindow extends EventTarget {
  constructor(doc) {
    super();
    this.document = doc;
  }
}

function setupMockEnvironment() {
  const doc = new MockDocument();
  const win = new MockWindow(doc);

  // Build standard mock dashboard DOM structure
  const kpis = doc.createElement('div');
  kpis.setAttribute('id', 'kpis');
  kpis.setAttribute('class', 'kpis');

  const kpi1 = doc.createElement('div');
  kpi1.setAttribute('class', 'kpi');
  kpi1.textContent = 'إجمالي الميزانية 5,300,000 ريال';
  kpis.appendChild(kpi1);

  const kpi2 = doc.createElement('div');
  kpi2.setAttribute('class', 'kpi');
  kpi2.textContent = 'المصروف 2,130,000 ريال';
  kpis.appendChild(kpi2);

  doc.body.appendChild(kpis);

  const projectsSec = doc.createElement('div');
  projectsSec.setAttribute('class', 'card sec');
  projectsSec.setAttribute('id', 'projects-sec');

  const h2 = doc.createElement('h2');
  h2.textContent = 'المشاريع';
  projectsSec.appendChild(h2);

  const table = doc.createElement('table');
  table.setAttribute('id', 'projects');

  const trHead = doc.createElement('tr');
  const th1 = doc.createElement('th');
  th1.textContent = 'المشروع';
  const th2 = doc.createElement('th');
  th2.textContent = 'الحالة';
  trHead.appendChild(th1);
  trHead.appendChild(th2);
  table.appendChild(trHead);

  const tr1 = doc.createElement('tr');
  tr1.setAttribute('data-project-id', '1');
  const td1 = doc.createElement('td');
  td1.textContent = 'منصة التحول الرقمي';
  const td2 = doc.createElement('td');
  td2.textContent = 'قيد التنفيذ';
  tr1.appendChild(td1);
  tr1.appendChild(td2);
  table.appendChild(tr1);

  const tr2 = doc.createElement('tr');
  tr2.setAttribute('data-project-id', '2');
  const td3 = doc.createElement('td');
  td3.textContent = 'بوابة اتحاد الغرف';
  const td4 = doc.createElement('td');
  td4.textContent = 'مكتمل';
  tr2.appendChild(td3);
  tr2.appendChild(td4);
  table.appendChild(tr2);

  projectsSec.appendChild(table);
  doc.body.appendChild(projectsSec);

  return { doc, win, kpis, table, tr1, tr2 };
}

// --------------------------------------------------------------------------
// 1. Tool registration and declaration tests
// --------------------------------------------------------------------------
test('spotlight_element tool is registered in src/tools/registry.js', async () => {
  const { tools, spotlight_element } = await import('../src/tools/registry.js');
  assert.ok(tools.spotlight_element, 'tools.spotlight_element must be registered');
  assert.ok(spotlight_element, 'spotlight_element must be exported from registry.js');
  assert.equal(tools.spotlight_element.declaration.name, 'spotlight_element');
  assert.equal(tools.spotlight_element.declaration.parameters.type, 'OBJECT');
  assert.ok('target' in tools.spotlight_element.declaration.parameters.properties);
  assert.ok('label' in tools.spotlight_element.declaration.parameters.properties);
  assert.ok('durationMs' in tools.spotlight_element.declaration.parameters.properties);
  assert.deepEqual(tools.spotlight_element.declaration.parameters.required, ['target']);
});

test('spotlight_element runs and executes correctly via handler', async () => {
  const { executeTool } = await import('../src/tools/handler.js');
  const res = await executeTool('spotlight_element', {
    target: '#kpis',
    label: 'المؤشرات المالية الرئيسية',
    durationMs: 4000,
  });

  assert.equal(res.ok, true);
  assert.equal(res.action, 'spotlight');
  assert.equal(res.target, '#kpis');
  assert.equal(res.label, 'المؤشرات المالية الرئيسية');
  assert.equal(res.durationMs, 4000);
});

test('spotlight_element is declared and exported in src/voice/declarations.js', async () => {
  const { activeDeclarations, spotlight_element, spotlightDeclaration } = await import('../src/voice/declarations.js');
  assert.ok(spotlight_element, 'spotlight_element must be exported in declarations.js');
  assert.ok(spotlightDeclaration, 'spotlightDeclaration must be exported in declarations.js');
  assert.equal(spotlightDeclaration.name, 'spotlight_element');

  const allDecls = activeDeclarations();
  const found = allDecls.find(d => d.name === 'spotlight_element');
  assert.ok(found, 'spotlight_element must be present in activeDeclarations');
});

// --------------------------------------------------------------------------
// 2. ScreenSpotlight class unit tests (public/js/spotlight.js)
// --------------------------------------------------------------------------
test('ScreenSpotlight resolves various targets: CSS selector, data-attribute, and table row text', async () => {
  const { ScreenSpotlight } = await import('../public/js/spotlight.js');
  const { doc, win, kpis, table, tr1, tr2 } = setupMockEnvironment();

  const spotlight = new ScreenSpotlight({ document: doc, window: win, autoListen: false });

  // CSS ID
  assert.equal(spotlight.resolveTarget('#kpis'), kpis);
  assert.equal(spotlight.resolveTarget('#projects'), table);

  // Bracketed data-attribute
  assert.equal(spotlight.resolveTarget('[data-project-id="1"]'), tr1);
  assert.equal(spotlight.resolveTarget('[data-project-id="2"]'), tr2);

  // Unbracketed data-attribute
  assert.equal(spotlight.resolveTarget('data-project-id="1"'), tr1);

  // Table row text content
  assert.equal(spotlight.resolveTarget('منصة التحول الرقمي'), tr1);
  assert.equal(spotlight.resolveTarget('بوابة اتحاد الغرف'), tr2);
  assert.equal(spotlight.resolveTarget('التحول الرقمي'), tr1);

  // Direct element
  assert.equal(spotlight.resolveTarget(tr1), tr1);

  // Non-matching target returns null safely
  assert.equal(spotlight.resolveTarget('#non-existent-xyz'), null);
  assert.equal(spotlight.resolveTarget(''), null);
  assert.equal(spotlight.resolveTarget(null), null);
});

test('ScreenSpotlight adds glowing aura, scroll, and executive pulse badge', async () => {
  const { ScreenSpotlight } = await import('../public/js/spotlight.js');
  const { doc, win, tr1 } = setupMockEnvironment();

  const spotlight = new ScreenSpotlight({ document: doc, window: win, autoListen: false });

  const el = spotlight.highlight({
    target: '[data-project-id="1"]',
    label: 'المشروع الأعلى ميزانية',
    durationMs: 3000,
  });

  assert.equal(el, tr1);
  assert.ok(tr1.classList.contains('spotlight-active'), 'Element should have spotlight-active class');
  assert.ok(tr1.scrolled, 'Element should trigger scrollIntoView');

  // Verify badge
  const badge = tr1.querySelector('.spotlight-badge');
  assert.ok(badge, 'Badge should be attached to element');
  assert.ok(badge.textContent.includes('المشروع الأعلى ميزانية'), 'Badge should show label');
  assert.ok(badge.querySelector('.spotlight-pulse'), 'Badge should contain pulse dot');
});

test('ScreenSpotlight automatically cleans up previous spotlight when new target arrives', async () => {
  const { ScreenSpotlight } = await import('../public/js/spotlight.js');
  const { doc, win, tr1, tr2 } = setupMockEnvironment();

  const spotlight = new ScreenSpotlight({ document: doc, window: win, autoListen: false });

  spotlight.highlight({ target: '[data-project-id="1"]', label: 'المشروع الأول' });
  assert.ok(tr1.classList.contains('spotlight-active'));
  assert.ok(tr1.querySelector('.spotlight-badge'));

  // Switch to project 2
  spotlight.highlight({ target: '[data-project-id="2"]', label: 'المشروع الثاني' });

  // Project 1 must be cleaned up
  assert.ok(!tr1.classList.contains('spotlight-active'), 'First element should lose spotlight-active');
  assert.equal(tr1.querySelector('.spotlight-badge'), null, 'First element badge should be removed');

  // Project 2 must be highlighted
  assert.ok(tr2.classList.contains('spotlight-active'), 'Second element should have spotlight-active');
  assert.ok(tr2.querySelector('.spotlight-badge'), 'Second element should have badge');
});

test('ScreenSpotlight clear() removes active class, badge, and custom styles', async () => {
  const { ScreenSpotlight } = await import('../public/js/spotlight.js');
  const { doc, win, kpis } = setupMockEnvironment();

  const spotlight = new ScreenSpotlight({ document: doc, window: win, autoListen: false });

  spotlight.highlight({
    target: '#kpis',
    label: 'مؤشرات الأداء',
    style: { boxShadow: '0 0 40px gold' },
  });

  assert.ok(kpis.classList.contains('spotlight-active'));
  assert.equal(kpis.style.boxShadow, '0 0 40px gold');
  assert.ok(kpis.querySelector('.spotlight-badge'));

  spotlight.clear();

  assert.ok(!kpis.classList.contains('spotlight-active'));
  assert.equal(kpis.style.boxShadow, '');
  assert.equal(kpis.querySelector('.spotlight-badge'), null);
});

test('ScreenSpotlight auto-cleans up after durationMs', async () => {
  const { ScreenSpotlight } = await import('../public/js/spotlight.js');
  const { doc, win, tr1 } = setupMockEnvironment();

  const spotlight = new ScreenSpotlight({ document: doc, window: win, autoListen: false });

  spotlight.highlight({
    target: '[data-project-id="1"]',
    label: 'تنظيف تلقائي سريع',
    durationMs: 30,
  });

  assert.ok(tr1.classList.contains('spotlight-active'));

  await new Promise(resolve => setTimeout(resolve, 60));

  assert.ok(!tr1.classList.contains('spotlight-active'), 'Should clean up after durationMs');
  assert.equal(tr1.querySelector('.spotlight-badge'), null);
});

test('ScreenSpotlight handles optional presentation backdrop overlay', async () => {
  const { ScreenSpotlight } = await import('../public/js/spotlight.js');
  const { doc, win, kpis } = setupMockEnvironment();

  const spotlight = new ScreenSpotlight({ document: doc, window: win, autoListen: false });

  spotlight.highlight({
    target: '#kpis',
    label: 'عرض تنفيذي',
    backdrop: true,
  });

  const backdrop = doc.querySelector('.spotlight-backdrop');
  assert.ok(backdrop, 'Backdrop element should be created');
  assert.ok(backdrop.classList.contains('visible'), 'Backdrop should have visible class');

  spotlight.clear();
  assert.equal(doc.querySelector('.spotlight-backdrop'), null, 'Backdrop should be cleaned up');
});

test('ScreenSpotlight listens to window events: executive:spotlight and executive:spotlight:clear', async () => {
  const { ScreenSpotlight } = await import('../public/js/spotlight.js');
  const { doc, win, tr2 } = setupMockEnvironment();

  const spotlight = new ScreenSpotlight({ document: doc, window: win, autoListen: true });

  // Dispatch executive:spotlight CustomEvent
  win.dispatchEvent(new CustomEvent('executive:spotlight', {
    detail: {
      target: 'بوابة اتحاد الغرف',
      label: 'المشروع المكتمل',
    },
  }));

  assert.ok(tr2.classList.contains('spotlight-active'), 'Event should trigger spotlight on tr2');
  assert.ok(tr2.querySelector('.spotlight-badge'), 'Event should create badge');

  // Dispatch clear event
  win.dispatchEvent(new CustomEvent('executive:spotlight:clear'));
  assert.ok(!tr2.classList.contains('spotlight-active'), 'Clear event should remove spotlight');

  spotlight.destroy();
});

// --------------------------------------------------------------------------
// 3. CSS file inspection tests
// --------------------------------------------------------------------------
test('public/css/components.css contains required spotlight classes and gold glow', () => {
  const css = fs.readFileSync(new URL('../public/css/components.css', import.meta.url), 'utf8');

  assert.ok(css.includes('.spotlight-active'), 'Missing .spotlight-active');
  assert.ok(css.includes('0 0 25px rgba(212, 175, 55, 0.7)'), 'Missing exact gold box-shadow: 0 0 25px rgba(212, 175, 55, 0.7)');
  assert.ok(css.includes('.spotlight-pulse'), 'Missing .spotlight-pulse');
  assert.ok(css.includes('.spotlight-badge'), 'Missing .spotlight-badge');
  assert.ok(css.includes('.spotlight-backdrop'), 'Missing .spotlight-backdrop');
});

import fs from 'node:fs';

let css = fs.readFileSync('public/css/components.css', 'utf8').replace(/\r\n/g, '\n');

const dockTarget = `body.log-open #dock {
  position: fixed;
  inset-inline: unset;
  left: 0;
  right: auto;
  bottom: 0;
  width: min(460px, 92vw);
  max-width: 460px;
  margin: 0;
  padding: 8px 12px 12px;
  align-items: stretch;
  background: rgba(10, 22, 38, 0.98);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border-right: 1px solid rgba(212, 168, 83, 0.28);
  border-top: 1px solid rgba(34, 58, 86, 0.7);
  border-radius: 0 0 16px 0;
  z-index: 100;
  box-shadow: 16px 0 48px rgba(0, 0, 0, 0.72);
  box-sizing: border-box;
}`;

const dockReplacement = `body.log-open #dock {
  position: fixed !important;
  inset-inline: unset !important;
  inset-inline-start: 0 !important;
  inset-inline-end: auto !important;
  left: 0 !important;
  right: auto !important;
  bottom: 0 !important;
  width: min(460px, 92vw) !important;
  max-width: 460px !important;
  margin: 0 !important;
  padding: 8px 12px 12px !important;
  align-items: stretch !important;
  background: rgba(10, 22, 38, 0.98) !important;
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border-right: 1px solid rgba(212, 168, 83, 0.28) !important;
  border-top: 1px solid rgba(34, 58, 86, 0.7) !important;
  border-radius: 0 0 16px 0 !important;
  z-index: 100 !important;
  box-shadow: 16px 0 48px rgba(0, 0, 0, 0.72) !important;
  box-sizing: border-box !important;
}`;

if (!css.includes(dockTarget)) {
  console.error('dockTarget not found in components.css');
  process.exit(1);
}

css = css.replace(dockTarget, dockReplacement);

// Append project dashboard button and selector styling if not already present
if (!css.includes('.btn-proj-dash')) {
  css += `

/* --------------------------------------------------------------------------
   Project Dashboard Switcher & Table Actions
   -------------------------------------------------------------------------- */
.btn-proj-dash {
  background: rgba(209, 166, 92, 0.12);
  color: var(--sand, #e8d3a8);
  border: 1px solid rgba(209, 166, 92, 0.35);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12.5px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.btn-proj-dash:hover {
  background: rgba(209, 166, 92, 0.28);
  border-color: var(--gold, #d1a65c);
  color: #fff;
  transform: translateY(-1px);
}
.btn-proj-dash:active {
  transform: translateY(0);
}

.fd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.fd-head-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fd-selector-wrap {
  flex: 1;
  max-width: 440px;
  display: flex;
  align-items: center;
}
.fd-select {
  width: 100%;
  max-width: 100%;
  background: #0e243d;
  color: var(--sand, #e8d3a8);
  border: 1px solid rgba(212, 168, 83, 0.4);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s ease;
}
.fd-select:focus {
  border-color: var(--gold, #d1a65c);
  box-shadow: 0 0 0 2px rgba(209, 166, 92, 0.25);
}
.fd-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
`;
}

fs.writeFileSync('public/css/components.css', css, 'utf8');
console.log('public/css/components.css updated successfully!');

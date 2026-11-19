// src/routes/executive.js - Complete Executive Suite Router
// Combines: Morning Briefing, Risk Radar, Boardroom Report & Export, What-If Simulator
import { Router } from 'express';
import { generateExecutiveBriefing, EXECUTIVE_BRIEFING_SESSION_KEY } from '../executive/briefing.js';
import { analyzeExecutiveRisks } from '../executive/radar.js';
import { generateExecutiveReport } from '../executive/report.js';
import { simulateScenario, deriveProjectControls } from '../executive/simulator.js';
import { handleSpeak } from '../voice/tts.js';
import { db } from '../../db.js';
import { kvGet, kvDelete } from '../../store.js';

export const executiveRouter = Router();

// =============================================================================
// 1. Morning Executive Audio Briefing (الموجز الصباحي)
// =============================================================================
// GET /api/executive/briefing - Returns structured briefing with cues, metrics and session delta
executiveRouter.get('/api/executive/briefing', async (req, res) => {
  try {
    const briefing = await generateExecutiveBriefing(req.query);
    res.json(briefing);
  } catch (err) {
    console.error('[executive-route] briefing generation error:', err);
    res.status(500).json({ ok: false, error: err.message || 'فشل في توليد الموجز التنفيذي' });
  }
});

// GET /api/executive/briefing/session - Returns current session tracking and delta status
executiveRouter.get('/api/executive/briefing/session', async (req, res) => {
  try {
    const session = await kvGet(EXECUTIVE_BRIEFING_SESSION_KEY);
    res.json({
      ok: true,
      hasSession: Boolean(session),
      session: session || null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/executive/briefing/session/reset - Resets briefing session history baseline
executiveRouter.post('/api/executive/briefing/session/reset', async (req, res) => {
  try {
    await kvDelete([EXECUTIVE_BRIEFING_SESSION_KEY]);
    res.json({ ok: true, message: 'تم إعادة تعيين جلسة الموجز التنفيذي بنجاح' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/executive/briefing/audio - Streams live audio for the morning briefing
executiveRouter.get('/api/executive/briefing/audio', async (req, res) => {
  try {
    const briefing = await generateExecutiveBriefing(req.query);
    const mockReq = {
      body: {
        text: briefing.text,
        voice: req.query.voice || undefined,
      },
    };
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Audio synthesis timeout')), 3000)
    );
    await Promise.race([handleSpeak(mockReq, res), timeout]);
  } catch (err) {
    console.warn('[executive-route] briefing audio fallback:', err.message);
    if (!res.headersSent) {
      res.status(503).json({ ok: false, fallback: 'speechSynthesis', error: err.message || 'فشل توليد الصوت للموجز التنفيذي' });
    } else {
      res.end();
    }
  }
});

// =============================================================================
// 2. Risk & Discrepancy Radar (رادار المخاطر والتناقضات)
// =============================================================================
// GET /api/executive/radar - Queries portfolio risks, budget overruns, delays, and Auto-DK discrepancies
executiveRouter.get('/api/executive/radar', async (req, res) => {
  try {
    const { category = 'all', severity = 'all' } = req.query;
    const allRisks = await analyzeExecutiveRisks();

    let risks = allRisks;
    if (category && category !== 'all') {
      risks = risks.filter(r => r.category === category);
    }
    if (severity && severity !== 'all') {
      risks = risks.filter(r => r.severity === severity);
    }

    const criticalCount = allRisks.filter(r => r.severity === 'critical').length;
    const warningCount = allRisks.filter(r => r.severity === 'warning').length;
    const infoCount = allRisks.filter(r => r.severity === 'info').length;

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      summary: {
        total: allRisks.length,
        critical: criticalCount,
        warning: warningCount,
        info: infoCount,
      },
      risks,
      alerts: risks,
    });
  } catch (err) {
    console.error('[executive-route] error analyzing risks:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/executive/radar/check - Manual/scheduled trigger for risk check
executiveRouter.post('/api/executive/radar/check', async (req, res) => {
  try {
    const allRisks = await analyzeExecutiveRisks();
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      total: allRisks.length,
      alerts: allRisks,
      risks: allRisks,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =============================================================================
// 3. Boardroom Report & WhatsApp Brief (تقرير المعالي)
// =============================================================================
let lastReportCache = null;

// GET /api/executive/report - Fetches report as JSON, WhatsApp text, or streamed PDF
executiveRouter.get('/api/executive/report', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const title = req.query.title;
    const department = req.query.department;
    const status = req.query.status;
    const filter = (department || status) ? { department, status } : undefined;

    const report = await generateExecutiveReport({ title, filter });
    lastReportCache = report;

    if (format === 'pdf') {
      const filename = encodeURIComponent((report.metadata?.title || 'تقرير_المجلس_التنفيذي') + '.pdf');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', report.pdfBuffer.length);
      return res.send(report.pdfBuffer);
    }

    res.json({
      ok: true,
      text: report.whatsappText,
      whatsappText: report.whatsappText,
      metadata: report.metadata,
      downloadUrl: '/api/executive/report/pdf',
    });
  } catch (err) {
    console.error('[executive-route] error getting report:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/executive/report - Generates report metadata and WhatsApp brief
executiveRouter.post('/api/executive/report', async (req, res) => {
  try {
    const { title, filter } = req.body || {};
    const report = await generateExecutiveReport({ title, filter });
    lastReportCache = report;

    res.json({
      ok: true,
      whatsappText: report.whatsappText,
      text: report.whatsappText,
      metadata: report.metadata,
      downloadUrl: '/api/executive/report/pdf',
    });
  } catch (err) {
    console.error('[executive-route] error generating report:', err);
    res.status(500).json({ ok: false, error: 'تعذر توليد التقرير التنفيذي', details: err.message });
  }
});

// GET /api/executive/report/pdf - Streams executive branded PDF file
executiveRouter.get('/api/executive/report/pdf', async (req, res) => {
  try {
    const title = req.query.title;
    const department = req.query.department;
    const status = req.query.status;

    let report = null;
    if (!title && !department && !status && lastReportCache) {
      report = lastReportCache;
    } else {
      report = await generateExecutiveReport({
        title,
        filter: (department || status) ? { department, status } : undefined,
      });
      lastReportCache = report;
    }

    const filename = encodeURIComponent((report.metadata?.title || 'تقرير_المجلس_التنفيذي') + '.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', report.pdfBuffer.length);
    res.send(report.pdfBuffer);
  } catch (err) {
    console.error('[executive-route] error streaming PDF:', err);
    res.status(500).json({ error: 'تعذر تحميل ملف PDF', details: err.message });
  }
});

// =============================================================================
// 4. What-If Scenario Simulator (محاكاة القرارات التنفيذية)
// =============================================================================
// POST /api/executive/simulate - Models budget injection/cuts and timeline shifts
executiveRouter.post('/api/executive/simulate', async (req, res) => {
  try {
    const { projectId, projectName, budgetDelta, timelineDeltaDays, targetStatus, scenarioQuery } = req.body || {};
    const result = await simulateScenario({
      projectId,
      projectName,
      budgetDelta: budgetDelta != null ? Number(budgetDelta) : 0,
      timelineDeltaDays: timelineDeltaDays != null ? Number(timelineDeltaDays) : 0,
      targetStatus,
      scenarioQuery,
    });
    res.json(result);
  } catch (err) {
    const status = err.message?.includes('غير موجود') || err.message?.includes('لم يتم العثور') ? 404 : 400;
    res.status(status).json({ ok: false, error: err.message });
  }
});

// GET /api/executive/projects - Lists portfolio projects for simulation cockpit with dynamic controls
executiveRouter.get('/api/executive/projects', async (req, res) => {
  try {
    const projects = await db.all('SELECT id, name, department, status, progress, budget, spent, owner, due_date, start_date, dashboard_id FROM projects ORDER BY id ASC');
    const enriched = projects.map(p => {
      const startDate = new Date(p.start_date || '2026-01-01');
      const dueDate = new Date(p.due_date || '2026-12-31');
      const plannedDays = Math.max(30, Math.round((dueDate.getTime() - startDate.getTime()) / 86400000));
      const refDate = new Date('2026-09-01');
      const elapsed = Math.max(15, Math.round((refDate.getTime() - startDate.getTime()) / 86400000));
      const vel = (p.progress || 0) > 0 ? (p.progress / elapsed) : (100 / plannedDays);
      const remDays = p.progress >= 100 ? 0 : Math.max(1, Math.round((100 - (p.progress || 0)) / Math.max(0.05, vel)));
      const controls = deriveProjectControls(p, remDays);
      return {
        ...p,
        controls,
        budgetRange: controls.budgetRange,
        timelineRange: controls.timelineRange,
        strategyPackages: controls.strategyPackages,
      };
    });
    res.json({ ok: true, projects: enriched });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/executive/file-capabilities/:docId - Checks whether a file has project simulation levers or other UI components
executiveRouter.get('/api/executive/file-capabilities/:docId', async (req, res) => {
  try {
    const docId = Number(req.params.docId);
    const doc = await db.prepare('SELECT id, name, category, summary FROM documents WHERE id=?').get(docId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: 'الملف غير موجود' });
    }

    // Check associated projects
    let linkedProjects = [];
    try {
      linkedProjects = await db.prepare('SELECT p.* FROM projects p WHERE p.name LIKE ?').all(`%${doc.name.replace(/\.[^.]+$/, '')}%`);
    } catch {}

    const isProjectDocument = linkedProjects.length > 0 || /مشروع|مبادرة|خطة|جدول|تكلفة|ميزانية|إنجاز/i.test(doc.name + ' ' + (doc.summary || ''));

    res.json({
      ok: true,
      documentId: docId,
      documentName: doc.name,
      isProjectDocument,
      componentType: isProjectDocument ? 'whatif_simulator' : 'document_analytics',
      projects: linkedProjects,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Shared apply handler for both /api/executive/apply and /api/executive/simulate/apply
async function handleApplySimulation(req, res) {
  try {
    const { projectId, budgetDelta = 0, timelineDeltaDays = 0, newBudget, newDueDate, newStatus } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ ok: false, error: 'معرّف المشروع مطلوب لاعتماد الخطة' });
    }

    const current = await db.get('SELECT * FROM projects WHERE id = ?', [Number(projectId)]);
    if (!current) {
      return res.status(404).json({ ok: false, error: 'المشروع غير موجود' });
    }

    const updatedBudget = newBudget != null ? Number(newBudget) : (Number(current.budget) + Number(budgetDelta || 0));
    let updatedDueDate = newDueDate || current.due_date;
    if (!newDueDate && timelineDeltaDays) {
      const d = new Date(current.due_date);
      d.setDate(d.getDate() + Number(timelineDeltaDays));
      updatedDueDate = d.toISOString().split('T')[0];
    }
    const updatedStatus = newStatus || current.status;

    await db.run(
      'UPDATE projects SET budget = ?, due_date = ?, status = ? WHERE id = ?',
      [updatedBudget, updatedDueDate, updatedStatus, Number(projectId)]
    );

    const updatedProject = await db.get('SELECT * FROM projects WHERE id = ?', [Number(projectId)]);

    res.json({
      ok: true,
      message: `تم اعتماد تعديل خطة مشروع «${current.name}» بنجاح وتحديث السجلات التنفيذية.`,
      project: updatedProject,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// POST /api/executive/apply - Confirms and applies simulated changes to project
executiveRouter.post('/api/executive/apply', handleApplySimulation);
// POST /api/executive/simulate/apply - Alias for convenience
executiveRouter.post('/api/executive/simulate/apply', handleApplySimulation);

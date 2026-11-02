import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { seedDatabaseIfEmpty } from './src/db/seed.ts';
import {
  getAllImageAssets,
  getAllManufacturers,
  getAllPrinterModels,
  getPrinterModelBySlugOrId,
  getDiagnosticBundle,
  getAllRepairGuides,
  getAllMaterials,
  getAllErrorCodes,
  getAllMaintenanceProcedures,
  createModelRequest,
  recordDiagnosticOutcome,
  getCoverageAndAdminSummary,
  adminCreateManufacturer,
  adminCreatePrinterModel,
  adminUpdateModelVerification,
  adminUpdateRequestStatus,
} from './src/db/repository.ts';
import {
  registerUserAccount,
  loginUserAccount,
  authenticateBearerToken,
  logoutBearerToken,
  saveOrUpdateDiagnosticSession,
  loadDiagnosticSessionById,
  claimGuestDiagnosticSession,
  listUserDiagnosticSessions,
  deleteDiagnosticSession,
  submitRepairGuideFeedback,
  getRepairGuideFeedbackSummary,
} from './src/db/sessionAndFeedbackRepo.ts';

dotenv.config();

seedDatabaseIfEmpty();

const ADMIN_PASSCODE = process.env.FIXMYPRINT_ADMIN_PASSCODE || 'fixmyprint-admin-2026';

function requireAdminPasscode(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers['x-admin-passcode'];
  if (!provided || provided !== ADMIN_PASSCODE) {
    res.status(401).json({ error: 'Unauthorized: Valid admin passcode required.' });
    return;
  }
  next();
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function getOptionalUser(req: Request) {
  const token = extractBearerToken(req);
  return authenticateBearerToken(token);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '8mb' }));

  // 1. Bootstrap full reference snapshot for fast client navigation & search
  app.get('/api/bootstrap', (_req, res) => {
    try {
      const manufacturers = getAllManufacturers();
      const models = getAllPrinterModels();
      const images = getAllImageAssets();
      const diagnostics = getDiagnosticBundle();
      const guides = getAllRepairGuides();
      const materials = getAllMaterials();
      const errorCodes = getAllErrorCodes();
      const maintenance = getAllMaintenanceProcedures();
      const coverage = getCoverageAndAdminSummary();

      res.json({
        manufacturers,
        models,
        images,
        diagnostics,
        guides,
        materials,
        errorCodes,
        maintenance,
        coverageCounts: coverage.counts,
      });
    } catch (error: unknown) {
      console.error('Bootstrap API error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to load database reference data.',
      });
    }
  });

  // 2. Individual printer lookup
  app.get('/api/printers/:slug', (req, res) => {
    try {
      const model = getPrinterModelBySlugOrId(req.params.slug);
      if (!model) {
        res.status(404).json({ error: 'Printer model not found in verified catalog.' });
        return;
      }
      res.json(model);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load printer.' });
    }
  });

  // 3. Unified search across models, brands, error codes, symptoms, and guides
  app.get('/api/search', (req, res) => {
    try {
      const raw = String(req.query.q || '').trim();
      const q = raw.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!q) {
        res.json({ models: [], guides: [], errorCodes: [], categories: [] });
        return;
      }
      const norm = (s: string) => s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
      const models = getAllPrinterModels().filter((m) =>
        norm(`${m.name} ${m.manufacturerName || ''} ${m.family}`).includes(q)
      );
      const guides = getAllRepairGuides().filter((g) =>
        norm(`${g.title} ${g.symptoms.join(' ')}`).includes(q)
      );
      const errorCodes = getAllErrorCodes().filter(
        (e) =>
          e.code.toLowerCase().includes(raw.toLowerCase()) ||
          norm(`${e.code} ${e.verifiedMeaning} ${e.manufacturerName || ''}`).includes(q)
      );
      const { categories } = getDiagnosticBundle();
      const matchedCategories = categories.filter((c) =>
        norm(`${c.title} ${c.shortDescription}`).includes(q)
      );

      res.json({
        models: models.slice(0, 12),
        guides: guides.slice(0, 8),
        errorCodes: errorCodes.slice(0, 8),
        categories: matchedCategories,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Search failed.' });
    }
  });

  // 4. User-submitted missing printer model request (clearly queued as PENDING_REVIEW, never auto-published)
  app.post('/api/model-requests', (req, res) => {
    try {
      const { manufacturerName, modelName, technology, notes } = req.body || {};
      if (!manufacturerName || !modelName) {
        res.status(400).json({ error: 'Manufacturer name and model name are required.' });
        return;
      }
      const tech = technology === 'RESIN' ? 'RESIN' : 'FDM';
      const created = createModelRequest({
        manufacturerName: String(manufacturerName),
        modelName: String(modelName),
        technology: tech,
        notes: String(notes || ''),
      });
      res.status(201).json(created);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to submit request.' });
    }
  });

  // 5. Record diagnostic / repair guide outcome ("Did this fix the problem?")
  app.post('/api/diagnostic-outcomes', (req, res) => {
    try {
      const { printerModelId, categoryId, materialCode, answers, topCauseCode, guideSlug, outcome, feedbackNotes } =
        req.body || {};
      if (outcome !== 'RESOLVED' && outcome !== 'NOT_RESOLVED') {
        res.status(400).json({ error: 'Outcome must be RESOLVED or NOT_RESOLVED.' });
        return;
      }
      const saved = recordDiagnosticOutcome({
        printerModelId,
        categoryId,
        materialCode,
        answers: Array.isArray(answers) ? answers : [],
        topCauseCode,
        guideSlug,
        outcome,
        feedbackNotes,
      });
      res.status(201).json(saved);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to record outcome.' });
    }
  });

  // 6. Optional Server-Side Gemini Symptom Interpreter (strictly bounded to verified catalog IDs; graceful fallback if no key)
  app.post('/api/symptom-interpret', async (req, res) => {
    try {
      const { description, printerSlug } = req.body || {};
      const text = String(description || '').trim();
      if (!text) {
        res.status(400).json({ error: 'Please enter a symptom description.' });
        return;
      }

      const { categories, questions } = getDiagnosticBundle();
      const selectedPrinter = printerSlug ? getPrinterModelBySlugOrId(String(printerSlug)) : null;

      // Deterministic keyword matcher (always runs as baseline and fallback if GEMINI_API_KEY is absent/placeholder)
      const lower = text.toLowerCase();
      let fallbackCategorySlug =
        selectedPrinter?.technology === 'RESIN'
          ? 'resin-adhesion-supports-delamination'
          : 'first-layer-adhesion-warping';

      if (lower.includes('resin') || lower.includes('fep') || lower.includes('vat') || lower.includes('support')) {
        fallbackCategorySlug = 'resin-adhesion-supports-delamination';
      } else if (lower.includes('lcd') || lower.includes('pixel') || lower.includes('exposure')) {
        fallbackCategorySlug = 'resin-screen-exposure-curing';
      } else if (lower.includes('string') || lower.includes('ooz') || lower.includes('blob') || lower.includes('zit') || lower.includes('wet')) {
        fallbackCategorySlug = 'stringing-blobs-surface-quality';
      } else if (lower.includes('clog') || lower.includes('jam') || lower.includes('click') || lower.includes('under') || lower.includes('grind') || lower.includes('creep')) {
        fallbackCategorySlug = 'extrusion-clogs-feeding';
      } else if (lower.includes('shift') || lower.includes('belt') || lower.includes('ghost') || lower.includes('ring') || lower.includes('spaghetti')) {
        fallbackCategorySlug = 'layer-shifting-ringing-spaghetti';
      } else if (lower.includes('ams') || lower.includes('mmu') || lower.includes('cfs') || lower.includes('purge') || lower.includes('probe') || lower.includes('loadcell') || lower.includes('error')) {
        fallbackCategorySlug = 'bed-mesh-probe-multicolor-ams';
      }

      const apiKey = process.env.GEMINI_API_KEY;
      const hasValidKey = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.length > 10);

      if (!hasValidKey) {
        res.json({
          mode: 'DETERMINISTIC_RULES',
          suggestedCategorySlug: fallbackCategorySlug,
          suggestedOptionIds: [],
          clarifyingNote:
            'Matched using FixMyPrint deterministic symptom rules. Select your exact visual fault pattern on the next step to confirm.',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const allowedCategories = categories
        .filter((c) => !selectedPrinter || c.technology === 'BOTH' || c.technology === selectedPrinter.technology)
        .map((c) => ({ slug: c.slug, title: c.title, description: c.shortDescription }));

      const allowedOptions = questions.flatMap((q) =>
        q.options.map((o) => ({ id: o.id, label: o.label }))
      );

      const systemInstruction = `You are a strictly constrained symptom-mapping classifier for FixMyPrint.
CRITICAL RULES:
1. NEVER invent printer specifications, temperatures, menu paths, or repair instructions.
2. NEVER recommend manual bed leveling unless the verified printer data explicitly states manualTrammingProcedureAllowed=true.
3. Map the user's free-text description ONLY to one of the provided category slugs and up to 2 matching option IDs.
4. Keep clarifyingNote to 1–2 plain-English sentences noting what the wizard will verify next.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: JSON.stringify({
          userSymptomText: text.slice(0, 600),
          verifiedPrinterContext: selectedPrinter
            ? {
                name: selectedPrinter.name,
                technology: selectedPrinter.technology,
                bedLevelingCategory: selectedPrinter.bedLevelingCategory,
                manualTrammingAllowed: selectedPrinter.fdmSpecs?.manualTrammingProcedureAllowed ?? false,
              }
            : 'Unspecified printer',
          allowedCategories,
          allowedOptions,
        }),
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedCategorySlug: { type: Type.STRING },
              suggestedOptionIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              clarifyingNote: { type: Type.STRING },
            },
            required: ['suggestedCategorySlug', 'suggestedOptionIds', 'clarifyingNote'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const validSlug = allowedCategories.some((c) => c.slug === parsed.suggestedCategorySlug)
        ? parsed.suggestedCategorySlug
        : fallbackCategorySlug;
      const validOptionIds = Array.isArray(parsed.suggestedOptionIds)
        ? parsed.suggestedOptionIds.filter((id: string) => allowedOptions.some((o) => o.id === id))
        : [];

      res.json({
        mode: 'AI_ASSISTED_BOUNDED',
        suggestedCategorySlug: validSlug,
        suggestedOptionIds: validOptionIds,
        clarifyingNote: String(parsed.clarifyingNote || 'Mapped symptom to structured diagnostic workflow.'),
      });
    } catch (error: unknown) {
      console.error('Symptom interpretation fallback triggered:', error);
      res.json({
        mode: 'DETERMINISTIC_FALLBACK',
        suggestedCategorySlug: 'first-layer-adhesion-warping',
        suggestedOptionIds: [],
        clarifyingNote: 'Proceeding with deterministic rule-based wizard.',
      });
    }
  });

  // 6b. Photo-Assisted Print Defect & Screen Error Triage (Server-Side Gemini Vision, strictly bounded to verified catalog)
  app.post('/api/photo-triage', async (req, res) => {
    try {
      const { imageBase64, mimeType, printerSlug, userNote } = req.body || {};
      const cleanBase64 = String(imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
      const cleanMime = String(mimeType || 'image/jpeg').trim();

      if (!cleanBase64 || cleanBase64.length < 32) {
        res.status(400).json({ error: 'Please select a valid photo of your print defect or printer screen.' });
        return;
      }

      const { categories, questions } = getDiagnosticBundle();
      const selectedPrinter = printerSlug ? getPrinterModelBySlugOrId(String(printerSlug)) : null;
      const errorCodes = getAllErrorCodes();

      const allowedCategories = categories
        .filter((c) => !selectedPrinter || c.technology === 'BOTH' || c.technology === selectedPrinter.technology)
        .map((c) => ({ slug: c.slug, title: c.title, technology: c.technology }));

      const allowedFaultCodes =
        selectedPrinter?.technology === 'RESIN'
          ? [
              'resin_adhesion_failure',
              'resin_supports_failing',
              'resin_layer_separation',
              'resin_screen_exposure',
            ]
          : selectedPrinter?.technology === 'FDM'
          ? [
              'first_layer_not_sticking',
              'corners_warping',
              'nozzle_too_high',
              'nozzle_too_low',
              'uneven_squish',
              'stringing',
              'blobs_and_zits',
              'under_extrusion',
              'over_extrusion',
              'clogged_nozzle',
              'filament_grinding',
              'heat_creep',
              'layer_shifting',
              'ringing_ghosting',
              'rough_surfaces',
              'gaps_between_walls',
              'poor_bridging',
              'spaghetti_failure',
              'bed_mesh_probe_error',
              'filament_loading_failure',
              'multicolor_purge_problem',
            ]
          : [
              'first_layer_not_sticking',
              'corners_warping',
              'nozzle_too_high',
              'nozzle_too_low',
              'stringing',
              'blobs_and_zits',
              'under_extrusion',
              'over_extrusion',
              'layer_shifting',
              'ringing_ghosting',
              'spaghetti_failure',
              'resin_adhesion_failure',
              'resin_supports_failing',
              'resin_layer_separation',
              'resin_screen_exposure',
            ];

      const allowedOptions = questions.flatMap((q) =>
        q.options.map((o) => ({ id: o.id, label: o.label }))
      );

      const scopedErrorCodes = errorCodes
        .filter((e) => !selectedPrinter || e.manufacturerId === selectedPrinter.manufacturerId)
        .map((e) => ({ code: e.code, meaning: e.verifiedMeaning, brand: e.manufacturerName }));

      const fallbackCategorySlug =
        selectedPrinter?.technology === 'RESIN'
          ? 'resin-adhesion-supports-delamination'
          : 'first-layer-adhesion-warping';

      const apiKey = process.env.GEMINI_API_KEY;
      const hasValidKey = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.length > 10);

      if (!hasValidKey) {
        res.json({
          mode: 'DETERMINISTIC_FALLBACK',
          observationSummary:
            'Vision API key is not configured in this local environment. Showing top hardware-matched fault patterns to compare visually.',
          matchedFaults:
            selectedPrinter?.technology === 'RESIN'
              ? [
                  {
                    faultCode: 'resin_adhesion_failure',
                    confidenceLabel: 'Common MSLA Fault',
                    reason: 'Verify whether cured layers remained on the vat film or separated from supports.',
                  },
                  {
                    faultCode: 'resin_supports_failing',
                    confidenceLabel: 'Possible Match',
                    reason: 'Compare support tip detachment vs horizontal delamination.',
                  },
                ]
              : [
                  {
                    faultCode: 'first_layer_not_sticking',
                    confidenceLabel: 'Common FDM Fault',
                    reason: 'Compare first-layer bead squish and adhesion against the reference diagram.',
                  },
                  {
                    faultCode: 'under_extrusion',
                    confidenceLabel: 'Possible Match',
                    reason: 'Check for sparse perimeters, gaps, or intermittent filament starvation.',
                  },
                ],
          suggestedCategorySlug: fallbackCategorySlug,
          suggestedOptionIds: [],
          detectedErrorCode: null,
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const systemInstruction = `You are a strictly bounded 3D print visual fault & screen error classifier for FixMyPrint.
CRITICAL RULES:
1. Analyze the uploaded photo (which may show a failed 3D print, extruder/hotend/vat hardware, or a printer LCD error screen).
2. Classify ONLY into the provided allowedFaultCodes, allowedCategories, allowedOptions, and scopedErrorCodes.
3. NEVER invent unverified error codes, temperatures, or manual bed-wheel instructions for auto-leveling printers.
4. Return 1 to 3 matchedFaults ordered from best visual match to secondary possibility, with concise technician reasoning.`;

      const requestContents = {
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: cleanBase64,
            },
          },
          {
            text: JSON.stringify({
              userOptionalNote: String(userNote || '').slice(0, 300),
              printerContext: selectedPrinter
                ? {
                    name: selectedPrinter.name,
                    manufacturer: selectedPrinter.manufacturerName,
                    technology: selectedPrinter.technology,
                    bedLevelingCategory: selectedPrinter.bedLevelingCategory,
                  }
                : 'Unspecified printer',
              allowedCategories,
              allowedFaultCodes,
              allowedOptions,
              scopedErrorCodes,
            }),
          },
        ],
      };

      const requestConfig = {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            observationSummary: { type: Type.STRING },
            matchedFaults: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  faultCode: { type: Type.STRING },
                  confidenceLabel: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['faultCode', 'confidenceLabel', 'reason'],
              },
            },
            suggestedCategorySlug: { type: Type.STRING },
            suggestedOptionIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            detectedErrorCode: { type: Type.STRING },
          },
          required: [
            'observationSummary',
            'matchedFaults',
            'suggestedCategorySlug',
            'suggestedOptionIds',
          ],
        },
      };

      const candidateModels = [
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
        'gemini-4-argon',
      ];
      let response;
      let lastErr: unknown = null;
      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: requestContents,
            config: requestConfig,
          });
          lastErr = null;
          break;
        } catch (err: unknown) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isRetryable =
            msg.includes('503') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('429') ||
            msg.includes('404') ||
            msg.includes('NOT_FOUND');
          if (!isRetryable) {
            throw err;
          }
        }
      }
      if (!response) {
        throw lastErr || new Error('Vision model temporarily unavailable.');
      }

      const parsed = JSON.parse(response.text || '{}');
      const validSlug = allowedCategories.some((c) => c.slug === parsed.suggestedCategorySlug)
        ? parsed.suggestedCategorySlug
        : fallbackCategorySlug;

      const validFaults = Array.isArray(parsed.matchedFaults)
        ? parsed.matchedFaults
            .filter((f: { faultCode?: string }) => f && allowedFaultCodes.includes(String(f.faultCode)))
            .slice(0, 3)
        : [];

      const validOptionIds = Array.isArray(parsed.suggestedOptionIds)
        ? parsed.suggestedOptionIds.filter((id: string) => allowedOptions.some((o) => o.id === id))
        : [];

      const rawCode = String(parsed.detectedErrorCode || '').trim();
      const matchedErrorObj = rawCode
        ? scopedErrorCodes.find((e) => e.code.toLowerCase() === rawCode.toLowerCase())
        : undefined;

      res.json({
        mode: 'VISION_BOUNDED',
        observationSummary: String(
          parsed.observationSummary || 'Analyzed visual print pattern against verified FixMyPrint fault signatures.'
        ),
        matchedFaults: validFaults,
        suggestedCategorySlug: validSlug,
        suggestedOptionIds: validOptionIds,
        detectedErrorCode: matchedErrorObj ? matchedErrorObj.code : null,
      });
    } catch (error: unknown) {
      console.error('Photo triage error:', error);
      let friendlyMessage = 'Unable to analyze photo right now. Please select a visual category below.';
      if (error instanceof Error && error.message) {
        try {
          const parsedErr = JSON.parse(error.message);
          friendlyMessage =
            parsedErr?.error?.message || error.message;
        } catch {
          friendlyMessage = error.message;
        }
      }
      res.status(503).json({ error: friendlyMessage });
    }
  });

  // 7. Coverage & Data Quality transparency endpoint (publicly auditable & used by Admin)
  app.get('/api/coverage', (_req, res) => {
    try {
      res.json(getCoverageAndAdminSummary());
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load coverage.' });
    }
  });

  // 8. Protected Admin Content Management endpoints
  app.post('/api/admin/verify-passcode', requireAdminPasscode, (_req, res) => {
    res.json({ authenticated: true });
  });

  app.post('/api/admin/manufacturers', requireAdminPasscode, (req, res) => {
    try {
      const { name, country, websiteUrl, supportUrl, supportsFdm, supportsResin, notes } = req.body || {};
      if (!name || !websiteUrl) {
        res.status(400).json({ error: 'Manufacturer name and official website URL are required.' });
        return;
      }
      const created = adminCreateManufacturer({
        name: String(name),
        country: String(country || 'Unspecified'),
        websiteUrl: String(websiteUrl),
        supportUrl: String(supportUrl || websiteUrl),
        supportsFdm: Boolean(supportsFdm),
        supportsResin: Boolean(supportsResin),
        notes: String(notes || ''),
      });
      res.status(201).json(created);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add manufacturer.' });
    }
  });

  app.post('/api/admin/models', requireAdminPasscode, (req, res) => {
    try {
      const body = req.body || {};
      if (!body.manufacturerId || !body.name || !body.summary) {
        res.status(400).json({ error: 'Manufacturer, exact model name, and summary are required.' });
        return;
      }
      if (body.completenessStatus === 'VERIFIED' && !String(body.sourceUrl || '').startsWith('http')) {
        res.status(400).json({
          error: 'Validation failed: A model cannot be marked VERIFIED without an official http(s) source URL.',
        });
        return;
      }
      const created = adminCreatePrinterModel(body);
      res.status(201).json(created);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create printer model.' });
    }
  });

  app.patch('/api/admin/models/:id/status', requireAdminPasscode, (req, res) => {
    try {
      const { completenessStatus } = req.body || {};
      adminUpdateModelVerification(req.params.id, String(completenessStatus));
      res.json({ updated: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update status.' });
    }
  });

  app.patch('/api/admin/requests/:id', requireAdminPasscode, (req, res) => {
    try {
      const { status } = req.body || {};
      adminUpdateRequestStatus(req.params.id, status);
      res.json({ updated: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update request.' });
    }
  });

  // 9. User Authentication Endpoints (Optional accounts for 90-day multi-device saved diagnostic sessions)
  app.post('/api/auth/register', (req, res) => {
    try {
      const { email, password, displayName } = req.body || {};
      const result = registerUserAccount({
        email: String(email || ''),
        password: String(password || ''),
        displayName: displayName ? String(displayName) : undefined,
      });
      res.status(201).json(result);
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Registration failed.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = loginUserAccount({
        email: String(email || ''),
        password: String(password || ''),
      });
      res.json(result);
    } catch (error: unknown) {
      res.status(401).json({ error: error instanceof Error ? error.message : 'Sign-in failed.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    logoutBearerToken(extractBearerToken(req));
    res.json({ loggedOut: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getOptionalUser(req);
    if (!user) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, user });
  });

  // 10. Ongoing Diagnostic Session Persistence, Bookmarking & Expiration Endpoints
  app.post('/api/diagnostic-sessions/save', (req, res) => {
    try {
      const currentUser = getOptionalUser(req);
      const body = req.body || {};
      const { session, resumeToken } = saveOrUpdateDiagnosticSession(
        {
          sessionId: body.sessionId || null,
          resumeToken: body.resumeToken || null,
          title: body.title || null,
          printerSlug: body.printerSlug || null,
          useGenericMode: Boolean(body.useGenericMode),
          genericTechnology: body.genericTechnology === 'RESIN' ? 'RESIN' : 'FDM',
          materialCode: body.materialCode || null,
          categoryId: body.categoryId || null,
          answersByQuestionId:
            body.answersByQuestionId && typeof body.answersByQuestionId === 'object'
              ? body.answersByQuestionId
              : {},
          symptomText: body.symptomText || null,
          status: body.status || 'IN_PROGRESS',
        },
        currentUser
      );

      const bookmarkPath = resumeToken
        ? `/diagnose?session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(resumeToken)}`
        : `/diagnose?session=${encodeURIComponent(session.id)}`;

      res.status(body.sessionId ? 200 : 201).json({
        session,
        resumeToken,
        bookmarkPath,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save diagnostic session.';
      const status = msg.startsWith('Unauthorized') ? 403 : 400;
      res.status(status).json({ error: msg });
    }
  });

  app.get('/api/diagnostic-sessions/mine', (req, res) => {
    try {
      const currentUser = getOptionalUser(req);
      if (!currentUser) {
        res.status(401).json({ error: 'Sign in required to list account diagnostic sessions.' });
        return;
      }
      const list = listUserDiagnosticSessions(currentUser.id);
      res.json(list);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load sessions.' });
    }
  });

  app.get('/api/diagnostic-sessions/:id', (req, res) => {
    try {
      const currentUser = getOptionalUser(req);
      const resumeToken = req.query.token ? String(req.query.token) : null;
      const result = loadDiagnosticSessionById(req.params.id, resumeToken, currentUser);

      if (result.status === 'OK') {
        res.json({ session: result.session });
        return;
      }
      if (result.status === 'EXPIRED') {
        res.status(410).json({
          code: 'SESSION_EXPIRED',
          error: 'This saved diagnostic session has expired.',
          expiredAt: result.expiredAt,
          ownershipMode: result.ownershipMode,
          title: result.title,
        });
        return;
      }
      if (result.status === 'AUTH_REQUIRED') {
        res.status(401).json({
          code: 'AUTH_REQUIRED',
          error: 'Sign in to access this account-protected diagnostic session.',
          title: result.title,
        });
        return;
      }
      if (result.status === 'FORBIDDEN' || result.status === 'INVALID_TOKEN') {
        res.status(403).json({
          code: result.status,
          error:
            result.status === 'FORBIDDEN'
              ? 'This diagnostic session belongs to a different user account.'
              : 'Invalid or missing bookmark token for this guest session.',
        });
        return;
      }
      res.status(404).json({ code: 'NOT_FOUND', error: 'Saved diagnostic session not found.' });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load session.' });
    }
  });

  app.post('/api/diagnostic-sessions/:id/claim', (req, res) => {
    try {
      const currentUser = getOptionalUser(req);
      if (!currentUser) {
        res.status(401).json({ error: 'Please sign in first to attach this session to your account.' });
        return;
      }
      const { resumeToken } = req.body || {};
      const claimed = claimGuestDiagnosticSession(req.params.id, String(resumeToken || ''), currentUser);
      res.json({
        session: claimed,
        bookmarkPath: `/diagnose?session=${encodeURIComponent(claimed.id)}`,
      });
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to claim session.' });
    }
  });

  app.delete('/api/diagnostic-sessions/:id', (req, res) => {
    try {
      const currentUser = getOptionalUser(req);
      const resumeToken = req.query.token ? String(req.query.token) : null;
      const deleted = deleteDiagnosticSession(req.params.id, resumeToken, currentUser);
      if (!deleted) {
        res.status(404).json({ error: 'Session not found.' });
        return;
      }
      res.json({ deleted: true });
    } catch (error: unknown) {
      res.status(403).json({ error: error instanceof Error ? error.message : 'Failed to delete session.' });
    }
  });

  // 11. Completed Repair Guide Feedback Endpoints (Helpfulness, Outcome, Printer Association & Step Comments)
  app.get('/api/guides/:slug/feedback', (req, res) => {
    try {
      const printerFilter = req.query.printer ? String(req.query.printer) : null;
      const summary = getRepairGuideFeedbackSummary(req.params.slug, printerFilter);
      res.json(summary);
    } catch (error: unknown) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Failed to load guide feedback.' });
    }
  });

  app.post('/api/guides/:slug/feedback', (req, res) => {
    try {
      const currentUser = getOptionalUser(req);
      const body = req.body || {};
      const created = submitRepairGuideFeedback(
        {
          guideSlugOrId: req.params.slug,
          printerModelIdOrSlug: body.printerModelIdOrSlug || null,
          helpfulnessRating: Number(body.helpfulnessRating),
          outcome: body.outcome,
          generalComment: body.generalComment || null,
          stepComments: Array.isArray(body.stepComments) ? body.stepComments : [],
          completedSteps: Array.isArray(body.completedSteps) ? body.completedSteps : [],
        },
        currentUser
      );
      res.status(201).json(created);
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to submit guide feedback.' });
    }
  });

  // Vite middleware for development or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use('/src/assets/images', express.static(path.join(process.cwd(), 'src/assets/images')));
    app.use('/assets', express.static(path.join(process.cwd(), 'public/assets')));
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FixMyPrint server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

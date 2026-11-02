import { eq, asc, desc } from 'drizzle-orm';
import { db } from './index.ts';
import {
  manufacturers,
  printerModels,
  printerVariants,
  sourceReferences,
  imageAssets,
  diagnosticCategories,
  diagnosticQuestions,
  diagnosticOptions,
  diagnosticCauses,
  repairGuides,
  materialsReference,
  errorCodes,
  maintenanceProcedures,
  modelRequests,
  diagnosticSessions,
} from './schema.ts';
import { getRecentGuideFeedbackForAdmin } from './sessionAndFeedbackRepo.ts';
import type {
  ManufacturerDTO,
  PrinterModelDTO,
  PrinterVariantDTO,
  SourceReferenceDTO,
  ImageAssetDTO,
  DiagnosticCategoryDTO,
  DiagnosticQuestionDTO,
  DiagnosticCauseDTO,
  RepairGuideDTO,
  MaterialReferenceDTO,
  ErrorCodeDTO,
  MaintenanceItemDTO,
  ModelRequestDTO,
} from '../types/domain.ts';

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getAllImageAssets(): ImageAssetDTO[] {
  try {
    return db.select().from(imageAssets).all();
  } catch (error) {
    console.error('Database query failed in getAllImageAssets:', error);
    throw new Error('Failed to load image assets.', { cause: error });
  }
}

export function getAllManufacturers(): ManufacturerDTO[] {
  try {
    const mfgs = db.select().from(manufacturers).orderBy(asc(manufacturers.name)).all();
    const models = db.select({ manufacturerId: printerModels.manufacturerId }).from(printerModels).all();
    const countMap = new Map<string, number>();
    for (const m of models) {
      countMap.set(m.manufacturerId, (countMap.get(m.manufacturerId) || 0) + 1);
    }
    return mfgs.map((m) => ({
      ...m,
      modelCount: countMap.get(m.id) || 0,
    }));
  } catch (error) {
    console.error('Database query failed in getAllManufacturers:', error);
    throw new Error('Failed to load manufacturers.', { cause: error });
  }
}

export function getAllPrinterModels(): PrinterModelDTO[] {
  try {
    const mfgs = db.select().from(manufacturers).all();
    const mfgMap = new Map(mfgs.map((m) => [m.id, m]));
    const rows = db.select().from(printerModels).orderBy(asc(printerModels.name)).all();
    const allVariants = db.select().from(printerVariants).all();
    const allSources = db
      .select()
      .from(sourceReferences)
      .where(eq(sourceReferences.entityType, 'PRINTER_MODEL'))
      .all();

    return rows.map((r) => {
      const mfg = mfgMap.get(r.manufacturerId);
      const variants: PrinterVariantDTO[] = allVariants
        .filter((v) => v.modelId === r.id)
        .map((v) => ({
          id: v.id,
          modelId: v.modelId,
          name: v.name,
          notes: v.notes,
          differencesJson: safeJsonParse<string[]>(v.differencesJson, []),
        }));
      const sources: SourceReferenceDTO[] = allSources
        .filter((s) => s.entityId === r.id)
        .map((s) => ({
          id: s.id,
          entityType: s.entityType as SourceReferenceDTO['entityType'],
          entityId: s.entityId,
          title: s.title,
          url: s.url,
          sourceType: s.sourceType as SourceReferenceDTO['sourceType'],
          sectionReference: s.sectionReference,
          verifiedDate: s.verifiedDate,
          verificationStatus: s.verificationStatus as SourceReferenceDTO['verificationStatus'],
        }));

      return {
        id: r.id,
        slug: r.slug,
        manufacturerId: r.manufacturerId,
        manufacturerName: mfg?.name || 'Unknown Manufacturer',
        manufacturerSlug: mfg?.slug || '',
        name: r.name,
        family: r.family,
        generation: r.generation,
        technology: r.technology as PrinterModelDTO['technology'],
        releaseStatus: r.releaseStatus as PrinterModelDTO['releaseStatus'],
        bedLevelingCategory: r.bedLevelingCategory as PrinterModelDTO['bedLevelingCategory'],
        completenessStatus: r.completenessStatus as PrinterModelDTO['completenessStatus'],
        lastVerifiedDate: r.lastVerifiedDate,
        summary: r.summary,
        officialManualUrl: r.officialManualUrl,
        officialSupportUrl: r.officialSupportUrl,
        imageAssetId: r.imageAssetId,
        fdmSpecs: safeJsonParse(r.fdmSpecsJson, null),
        resinSpecs: safeJsonParse(r.resinSpecsJson, null),
        variants,
        sources,
      };
    });
  } catch (error) {
    console.error('Database query failed in getAllPrinterModels:', error);
    throw new Error('Failed to load printer models.', { cause: error });
  }
}

export function getPrinterModelBySlugOrId(slugOrId: string): PrinterModelDTO | null {
  const all = getAllPrinterModels();
  return all.find((m) => m.slug === slugOrId || m.id === slugOrId) || null;
}

export function getDiagnosticBundle(): {
  categories: DiagnosticCategoryDTO[];
  questions: DiagnosticQuestionDTO[];
  causes: DiagnosticCauseDTO[];
} {
  try {
    const cats = db
      .select()
      .from(diagnosticCategories)
      .orderBy(asc(diagnosticCategories.sortOrder))
      .all() as DiagnosticCategoryDTO[];

    const qRows = db
      .select()
      .from(diagnosticQuestions)
      .orderBy(asc(diagnosticQuestions.stepOrder))
      .all();
    const optRows = db.select().from(diagnosticOptions).all();

    const questions: DiagnosticQuestionDTO[] = qRows.map((q) => ({
      id: q.id,
      categoryId: q.categoryId,
      code: q.code,
      prompt: q.prompt,
      helpText: q.helpText,
      stepOrder: q.stepOrder,
      conditions: safeJsonParse(q.conditionsJson, {}),
      options: optRows.filter((o) => o.questionId === q.id),
    }));

    const causeRows = db.select().from(diagnosticCauses).all();
    const causes: DiagnosticCauseDTO[] = causeRows.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      technology: c.technology as DiagnosticCauseDTO['technology'],
      plainExplanation: c.plainExplanation,
      distinguishingChecks: safeJsonParse<string[]>(c.distinguishingChecksJson, []),
      safetyNotes: c.safetyNotes,
      isManualBedLevelingProcedure: c.isManualBedLevelingProcedure,
      recommendedGuideSlug: c.recommendedGuideSlug,
      conditions: safeJsonParse(c.conditionsJson, { matchingOptionIds: [], baseWeight: 20 }),
    }));

    return { categories: cats, questions, causes };
  } catch (error) {
    console.error('Database query failed in getDiagnosticBundle:', error);
    throw new Error('Failed to load diagnostic knowledge base.', { cause: error });
  }
}

export function getAllRepairGuides(): RepairGuideDTO[] {
  try {
    const rows = db.select().from(repairGuides).all();
    const sources = db
      .select()
      .from(sourceReferences)
      .where(eq(sourceReferences.entityType, 'REPAIR_GUIDE'))
      .all();

    return rows.map((g) => ({
      id: g.id,
      slug: g.slug,
      title: g.title,
      technology: g.technology as RepairGuideDTO['technology'],
      difficulty: g.difficulty as RepairGuideDTO['difficulty'],
      estimatedTime: g.estimatedTime,
      applicableFamilies: safeJsonParse<string[]>(g.applicableFamiliesJson, []),
      applicableModelIds: safeJsonParse<string[]>(g.applicableModelIdsJson, []),
      requiresManualBedScrews: g.requiresManualBedScrews,
      symptoms: safeJsonParse<string[]>(g.symptomsJson, []),
      toolsNeeded: safeJsonParse<string[]>(g.toolsNeededJson, []),
      partsNeeded: safeJsonParse<string[]>(g.partsNeededJson, []),
      safetyWarnings: safeJsonParse<string[]>(g.safetyWarningsJson, []),
      serviceBoundaryNote: g.serviceBoundaryNote,
      modelSpecificMenuNotes: safeJsonParse<Record<string, string>>(g.modelSpecificMenuNotesJson, {}),
      steps: safeJsonParse(g.stepsJson, []),
      verificationProcedure: g.verificationProcedure,
      ifNotFixedBranches: safeJsonParse(g.ifNotFixedBranchesJson, []),
      lastVerifiedDate: g.lastVerifiedDate,
      verificationStatus: g.verificationStatus as RepairGuideDTO['verificationStatus'],
      sources: sources
        .filter((s) => s.entityId === g.id)
        .map((s) => ({
          id: s.id,
          entityType: 'REPAIR_GUIDE',
          entityId: s.entityId,
          title: s.title,
          url: s.url,
          sourceType: s.sourceType as SourceReferenceDTO['sourceType'],
          sectionReference: s.sectionReference,
          verifiedDate: s.verifiedDate,
          verificationStatus: s.verificationStatus as SourceReferenceDTO['verificationStatus'],
        })),
    }));
  } catch (error) {
    console.error('Database query failed in getAllRepairGuides:', error);
    throw new Error('Failed to load repair guides.', { cause: error });
  }
}

export function getAllMaterials(): MaterialReferenceDTO[] {
  try {
    const rows = db.select().from(materialsReference).all();
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      technology: r.technology as MaterialReferenceDTO['technology'],
      category: r.category,
      nozzleTempRangeC:
        r.nozzleTempMinC !== null && r.nozzleTempMaxC !== null
          ? { min: r.nozzleTempMinC, max: r.nozzleTempMaxC }
          : null,
      bedTempRangeC:
        r.bedTempMinC !== null && r.bedTempMaxC !== null
          ? { min: r.bedTempMinC, max: r.bedTempMaxC }
          : null,
      enclosureRequirement: r.enclosureRequirement as MaterialReferenceDTO['enclosureRequirement'],
      dryingGuidance: r.dryingGuidance,
      coolingGuidance: r.coolingGuidance,
      hardwareCompatibilityNotes: r.hardwareCompatibilityNotes,
      hardenedNozzleRequired: r.hardenedNozzleRequired,
      exposureNotesResin: r.exposureNotesResin,
      safetyGuidance: r.safetyGuidance,
      lastVerifiedDate: r.lastVerifiedDate,
    }));
  } catch (error) {
    console.error('Database query failed in getAllMaterials:', error);
    throw new Error('Failed to load material library.', { cause: error });
  }
}

export function getAllErrorCodes(): ErrorCodeDTO[] {
  try {
    const mfgs = db.select().from(manufacturers).all();
    const mfgMap = new Map(mfgs.map((m) => [m.id, m.name]));
    const rows = db.select().from(errorCodes).all();
    return rows.map((r) => ({
      id: r.id,
      manufacturerId: r.manufacturerId,
      manufacturerName: mfgMap.get(r.manufacturerId) || 'Unknown',
      applicableFamilies: safeJsonParse<string[]>(r.applicableFamiliesJson, []),
      firmwareContext: r.firmwareContext,
      code: r.code,
      verifiedMeaning: r.verifiedMeaning,
      likelyCauses: safeJsonParse<string[]>(r.likelyCausesJson, []),
      recommendedChecks: safeJsonParse<string[]>(r.recommendedChecksJson, []),
      officialSourceUrl: r.officialSourceUrl,
      lastVerifiedDate: r.lastVerifiedDate,
    }));
  } catch (error) {
    console.error('Database query failed in getAllErrorCodes:', error);
    throw new Error('Failed to load error codes.', { cause: error });
  }
}

export function getAllMaintenanceProcedures(): MaintenanceItemDTO[] {
  try {
    const rows = db.select().from(maintenanceProcedures).all();
    return rows.map((r) => ({
      id: r.id,
      technology: r.technology as MaintenanceItemDTO['technology'],
      componentCategory: r.componentCategory,
      title: r.title,
      applicableSystems: safeJsonParse<string[]>(r.applicableSystemsJson, []),
      intervalGuidance: r.intervalGuidance,
      procedureSummary: r.procedureSummary,
      lubricantOrCleaner: r.lubricantOrCleaner,
      doNotApplyTo: safeJsonParse<string[]>(r.doNotApplyToJson, []),
      safetyWarning: r.safetyWarning,
      lastVerifiedDate: r.lastVerifiedDate,
    }));
  } catch (error) {
    console.error('Database query failed in getAllMaintenanceProcedures:', error);
    throw new Error('Failed to load maintenance procedures.', { cause: error });
  }
}

export function createModelRequest(input: {
  manufacturerName: string;
  modelName: string;
  technology: 'FDM' | 'RESIN';
  notes: string;
}): ModelRequestDTO {
  try {
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const submittedAt = new Date().toISOString();
    const record = {
      id,
      manufacturerName: input.manufacturerName.trim().slice(0, 80),
      modelName: input.modelName.trim().slice(0, 120),
      technology: input.technology,
      notes: input.notes.trim().slice(0, 500),
      status: 'PENDING_REVIEW' as const,
      submittedAt,
    };
    db.insert(modelRequests).values(record).run();
    return record;
  } catch (error) {
    console.error('Database insert failed in createModelRequest:', error);
    throw new Error('Failed to submit printer model request.', { cause: error });
  }
}

export function recordDiagnosticOutcome(input: {
  printerModelId?: string | null;
  categoryId?: string | null;
  materialCode?: string | null;
  answers: string[];
  topCauseCode?: string | null;
  guideSlug?: string | null;
  outcome: 'RESOLVED' | 'NOT_RESOLVED';
  feedbackNotes?: string;
}) {
  try {
    const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    db.insert(diagnosticSessions)
      .values({
        id,
        printerModelId: input.printerModelId || null,
        categoryId: input.categoryId || null,
        materialCode: input.materialCode || null,
        answersJson: JSON.stringify(input.answers || []),
        topCauseCode: input.topCauseCode || null,
        guideSlug: input.guideSlug || null,
        outcome: input.outcome,
        feedbackNotes: input.feedbackNotes ? input.feedbackNotes.slice(0, 400) : null,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { id, recorded: true };
  } catch (error) {
    console.error('Database insert failed in recordDiagnosticOutcome:', error);
    throw new Error('Failed to save diagnostic feedback.', { cause: error });
  }
}

export function getCoverageAndAdminSummary() {
  try {
    const mfgs = getAllManufacturers();
    const models = getAllPrinterModels();
    const guides = getAllRepairGuides();
    const errors = getAllErrorCodes();
    const materials = getAllMaterials();
    const requests = db
      .select()
      .from(modelRequests)
      .orderBy(desc(modelRequests.submittedAt))
      .all() as ModelRequestDTO[];
    const outcomes = db
      .select()
      .from(diagnosticSessions)
      .orderBy(desc(diagnosticSessions.createdAt))
      .limit(50)
      .all();

    const verifiedModels = models.filter((m) => m.completenessStatus === 'VERIFIED');
    const partialOrUnverifiedModels = models.filter((m) => m.completenessStatus !== 'VERIFIED');
    const manufacturersWithoutModels = mfgs.filter((m) => (m.modelCount || 0) === 0);
    const feedbackAdmin = getRecentGuideFeedbackForAdmin();

    return {
      counts: {
        manufacturersTotal: mfgs.length,
        manufacturersWithSeededModels: mfgs.length - manufacturersWithoutModels.length,
        manufacturersAwaitingModelImport: manufacturersWithoutModels.length,
        modelsTotal: models.length,
        fdmModels: models.filter((m) => m.technology === 'FDM').length,
        resinModels: models.filter((m) => m.technology === 'RESIN').length,
        verifiedSpecModels: verifiedModels.length,
        partialOrUnverifiedModels: partialOrUnverifiedModels.length,
        repairGuidesTotal: guides.length,
        errorCodesTotal: errors.length,
        materialsTotal: materials.length,
        pendingModelRequests: requests.filter((r) => r.status === 'PENDING_REVIEW').length,
        recordedOutcomes: outcomes.length,
        guideFeedbackTotal: feedbackAdmin.totalFeedbackCount,
        flaggedGuideStepsTotal: feedbackAdmin.flaggedStepCommentsCount,
        activeSavedSessionsTotal: feedbackAdmin.activeSavedSessionsCount,
      },
      manufacturersWithoutModels: manufacturersWithoutModels.map((m) => ({
        id: m.id,
        name: m.name,
        supportsFdm: m.supportsFdm,
        supportsResin: m.supportsResin,
      })),
      requests,
      recentOutcomes: outcomes,
      recentGuideFeedback: feedbackAdmin.recentFeedback,
    };
  } catch (error) {
    console.error('Database query failed in getCoverageAndAdminSummary:', error);
    throw new Error('Failed to compute catalog coverage summary.', { cause: error });
  }
}

export function adminCreateManufacturer(input: {
  name: string;
  country: string;
  websiteUrl: string;
  supportUrl: string;
  supportsFdm: boolean;
  supportsResin: boolean;
  notes: string;
}) {
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const id = `mfg_${slug.replace(/-/g, '_')}_${Date.now().toString().slice(-4)}`;
  db.insert(manufacturers)
    .values({
      id,
      slug,
      name: input.name.trim(),
      country: input.country.trim() || 'Unspecified',
      websiteUrl: input.websiteUrl.trim(),
      supportUrl: input.supportUrl.trim() || input.websiteUrl.trim(),
      supportsFdm: input.supportsFdm,
      supportsResin: input.supportsResin,
      isCommunityOpenSource: false,
      notes: input.notes.trim(),
    })
    .run();
  return { id, slug };
}

export function adminCreatePrinterModel(input: {
  manufacturerId: string;
  name: string;
  family: string;
  generation: string;
  technology: 'FDM' | 'RESIN';
  releaseStatus: string;
  bedLevelingCategory: string;
  completenessStatus: string;
  summary: string;
  officialManualUrl: string;
  sourceTitle: string;
  sourceUrl: string;
  fdmSpecs?: unknown;
  resinSpecs?: unknown;
}) {
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const id = `mdl_${slug.replace(/-/g, '_')}_${Date.now().toString().slice(-4)}`;
  const today = new Date().toISOString().slice(0, 10);

  db.insert(printerModels)
    .values({
      id,
      slug,
      manufacturerId: input.manufacturerId,
      name: input.name.trim(),
      family: input.family.trim() || 'General Series',
      generation: input.generation.trim() || '1st Gen',
      technology: input.technology,
      releaseStatus: input.releaseStatus,
      bedLevelingCategory: input.technology === 'RESIN' ? 'NOT_APPLICABLE_RESIN' : input.bedLevelingCategory,
      completenessStatus: input.sourceUrl ? input.completenessStatus : 'UNVERIFIED',
      lastVerifiedDate: today,
      summary: input.summary.trim(),
      officialManualUrl: input.officialManualUrl.trim() || null,
      officialSupportUrl: input.officialManualUrl.trim() || null,
      imageAssetId: null,
      fdmSpecsJson: input.technology === 'FDM' && input.fdmSpecs ? JSON.stringify(input.fdmSpecs) : null,
      resinSpecsJson: input.technology === 'RESIN' && input.resinSpecs ? JSON.stringify(input.resinSpecs) : null,
    })
    .run();

  if (input.sourceUrl.trim()) {
    db.insert(sourceReferences)
      .values({
        id: `src_${Date.now()}`,
        entityType: 'PRINTER_MODEL',
        entityId: id,
        title: input.sourceTitle.trim() || `${input.name} Official Documentation`,
        url: input.sourceUrl.trim(),
        sourceType: 'OFFICIAL_MANUAL',
        sectionReference: null,
        verifiedDate: today,
        verificationStatus: input.completenessStatus,
      })
      .run();
  }

  return { id, slug };
}

export function adminUpdateModelVerification(modelId: string, completenessStatus: string) {
  const today = new Date().toISOString().slice(0, 10);
  db.update(printerModels)
    .set({ completenessStatus, lastVerifiedDate: today })
    .where(eq(printerModels.id, modelId))
    .run();
}

export function adminUpdateRequestStatus(requestId: string, status: 'PENDING_REVIEW' | 'RESEARCHING' | 'ADDED' | 'DECLINED') {
  db.update(modelRequests).set({ status }).where(eq(modelRequests.id, requestId)).run();
}

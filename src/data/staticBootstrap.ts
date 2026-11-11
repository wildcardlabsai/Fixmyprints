import type { BootstrapPayload, CoverageCounts } from '../context/AppDataContext.tsx';
import {
  SEED_IMAGE_ASSETS,
  SEED_MANUFACTURERS,
  SEED_PRINTER_MODELS,
  SEED_VARIANTS,
  SEED_SOURCES,
} from '../db/seedCatalog.ts';
import {
  SEED_DIAGNOSTIC_CATEGORIES,
  SEED_DIAGNOSTIC_QUESTIONS,
  SEED_DIAGNOSTIC_CAUSES,
  SEED_REPAIR_GUIDES,
  SEED_MATERIALS,
  SEED_ERROR_CODES,
  SEED_MAINTENANCE,
} from '../db/seedDiagnostics.ts';

let cachedPayload: BootstrapPayload | null = null;

export function getStaticBootstrapPayload(): BootstrapPayload {
  if (cachedPayload) {
    return cachedPayload;
  }

  const mfgMap = new Map(SEED_MANUFACTURERS.map((m) => [m.id, m]));

  const countMap = new Map<string, number>();
  for (const m of SEED_PRINTER_MODELS) {
    countMap.set(m.manufacturerId, (countMap.get(m.manufacturerId) || 0) + 1);
  }

  const manufacturers = SEED_MANUFACTURERS.map((m) => ({
    ...m,
    modelCount: countMap.get(m.id) || 0,
  }));

  const models = SEED_PRINTER_MODELS.map((m) => {
    const mfg = mfgMap.get(m.manufacturerId);
    const variants = SEED_VARIANTS.filter((v) => v.modelId === m.id);
    const sources = SEED_SOURCES.filter((s) => s.entityId === m.id && s.entityType === 'PRINTER_MODEL');
    return {
      ...m,
      manufacturerName: mfg?.name || 'Unknown Manufacturer',
      manufacturerSlug: mfg?.slug || '',
      variants,
      sources,
    };
  });

  const guides = SEED_REPAIR_GUIDES.map((g) => {
    const sources = SEED_SOURCES.filter((s) => s.entityId === g.id && s.entityType === 'REPAIR_GUIDE');
    return {
      ...g,
      sources: g.sources && g.sources.length > 0 ? g.sources : sources,
    };
  });

  const errorCodes = SEED_ERROR_CODES.map((e) => {
    const mfg = mfgMap.get(e.manufacturerId);
    return {
      ...e,
      manufacturerName: mfg?.name || 'Unknown',
    };
  });

  const fdmCount = models.filter((m) => m.technology === 'FDM').length;
  const resinCount = models.filter((m) => m.technology === 'RESIN').length;
  const verifiedCount = models.filter((m) => m.completenessStatus === 'VERIFIED').length;
  const partialCount = models.filter((m) => m.completenessStatus !== 'VERIFIED').length;
  const mfgWithModels = manufacturers.filter((m) => (m.modelCount || 0) > 0).length;
  const mfgAwaiting = manufacturers.filter((m) => (m.modelCount || 0) === 0).length;

  const coverageCounts: CoverageCounts = {
    manufacturersTotal: manufacturers.length,
    manufacturersWithSeededModels: mfgWithModels,
    manufacturersAwaitingModelImport: mfgAwaiting,
    modelsTotal: models.length,
    fdmModels: fdmCount,
    resinModels: resinCount,
    verifiedSpecModels: verifiedCount,
    partialOrUnverifiedModels: partialCount,
    repairGuidesTotal: guides.length,
    errorCodesTotal: errorCodes.length,
    materialsTotal: SEED_MATERIALS.length,
    pendingModelRequests: 0,
    recordedOutcomes: 0,
    guideFeedbackTotal: 0,
    flaggedGuideStepsTotal: 0,
    activeSavedSessionsTotal: 0,
  };

  cachedPayload = {
    manufacturers,
    models,
    images: SEED_IMAGE_ASSETS,
    diagnostics: {
      categories: SEED_DIAGNOSTIC_CATEGORIES,
      questions: SEED_DIAGNOSTIC_QUESTIONS,
      causes: SEED_DIAGNOSTIC_CAUSES,
    },
    guides,
    materials: SEED_MATERIALS,
    errorCodes,
    maintenance: SEED_MAINTENANCE,
    coverageCounts,
  };

  return cachedPayload;
}

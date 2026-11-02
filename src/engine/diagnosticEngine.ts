import type {
  PrinterModelDTO,
  PrinterTechnology,
  DiagnosticQuestionDTO,
  DiagnosticCauseDTO,
  RankedCauseResult,
  ConfidenceBadge,
  MaterialReferenceDTO,
  RepairGuideDTO,
} from '../types/domain.ts';

export interface DiagnosticContext {
  printer: PrinterModelDTO | null;
  genericTechnology?: PrinterTechnology;
  categoryId: string;
  materialCode?: string | null;
  selectedOptionIds: string[];
}

export function getEffectiveTechnology(ctx: DiagnosticContext): PrinterTechnology {
  if (ctx.printer) return ctx.printer.technology;
  return ctx.genericTechnology || 'FDM';
}

export function canPrinterUseManualBedTramming(printer: PrinterModelDTO | null): boolean {
  if (!printer) {
    // Unknown / unlisted generic printer: DO NOT assume manual bed wheels exist unless verified!
    return false;
  }
  if (printer.technology === 'RESIN') {
    return false;
  }
  const allowedCategories = new Set(['MANUAL_SCREWS_WHEELS', 'HYBRID_MANUAL_AND_AUTO']);
  if (!allowedCategories.has(printer.bedLevelingCategory)) {
    return false;
  }
  return Boolean(printer.fdmSpecs?.hasManualBedScrews && printer.fdmSpecs?.manualTrammingProcedureAllowed);
}

export function printerHasAutoLeveling(printer: PrinterModelDTO | null): boolean {
  if (!printer || printer.technology === 'RESIN') return false;
  const autoCategories = new Set([
    'AUTO_PROBE_MESH',
    'AUTO_LOAD_CELL_NOZZLE',
    'STRAIN_GAUGE_INTEGRATED',
    'MANUFACTURER_AUTO_SYSTEM',
    'HYBRID_MANUAL_AND_AUTO',
  ]);
  return autoCategories.has(printer.bedLevelingCategory) || Boolean(printer.fdmSpecs?.autoMeshCapable);
}

export function filterApplicableQuestions(
  allQuestions: DiagnosticQuestionDTO[],
  ctx: DiagnosticContext
): DiagnosticQuestionDTO[] {
  const tech = getEffectiveTechnology(ctx);
  const manualAllowed = canPrinterUseManualBedTramming(ctx.printer);
  const autoCapable = printerHasAutoLeveling(ctx.printer);
  const hasMultiMaterial = Boolean(ctx.printer?.fdmSpecs?.multiMaterialSystem);
  const hasFilamentSensor = Boolean(ctx.printer?.fdmSpecs?.filamentRunoutSensor);

  return allQuestions
    .filter((q) => {
      const cond = q.conditions;

      if (cond.technologies && !cond.technologies.includes(tech)) {
        return false;
      }

      if (cond.categoryIds && !cond.categoryIds.includes(ctx.categoryId)) {
        return false;
      }

      if (cond.requireManualBedScrews && !manualAllowed) {
        return false;
      }

      if (cond.forbidManualBedScrews && manualAllowed) {
        return false;
      }

      if (cond.requireAutoLeveling && ctx.printer && !autoCapable) {
        return false;
      }

      if (cond.requireMultiMaterial && ctx.printer && !hasMultiMaterial) {
        return false;
      }

      if (cond.requireFilamentSensor && ctx.printer && !hasFilamentSensor) {
        return false;
      }

      if (cond.requirePreviousOptionIds && cond.requirePreviousOptionIds.length > 0) {
        const hasAny = cond.requirePreviousOptionIds.some((id) => ctx.selectedOptionIds.includes(id));
        if (!hasAny) return false;
      }

      if (cond.excludePreviousOptionIds && cond.excludePreviousOptionIds.length > 0) {
        const hasExcluded = cond.excludePreviousOptionIds.some((id) => ctx.selectedOptionIds.includes(id));
        if (hasExcluded) return false;
      }

      return true;
    })
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

export function evaluateDiagnosticCauses(
  allCauses: DiagnosticCauseDTO[],
  allQuestions: DiagnosticQuestionDTO[],
  ctx: DiagnosticContext
): RankedCauseResult[] {
  const tech = getEffectiveTechnology(ctx);
  const manualAllowed = canPrinterUseManualBedTramming(ctx.printer);
  const autoCapable = printerHasAutoLeveling(ctx.printer);

  const optionLabelMap = new Map<string, string>();
  for (const q of allQuestions) {
    for (const opt of q.options) {
      optionLabelMap.set(opt.id, opt.label);
    }
  }

  const results: RankedCauseResult[] = [];

  for (const cause of allCauses) {
    const cond = cause.conditions;

    // 1. Strict technology isolation (FDM vs RESIN)
    if (cause.technology !== tech) continue;
    if (cond.technologies && !cond.technologies.includes(tech)) continue;

    // 2. Hard safety & capability gate: NEVER recommend manual bed tramming unless verified!
    if (cause.isManualBedLevelingProcedure || cond.requireManualTrammingAllowed) {
      if (!manualAllowed) {
        continue;
      }
    }

    // 3. Bed leveling category allow/forbid checks
    if (ctx.printer) {
      if (
        cond.allowedBedLevelingCategories &&
        cond.allowedBedLevelingCategories.length > 0 &&
        !cond.allowedBedLevelingCategories.includes(ctx.printer.bedLevelingCategory)
      ) {
        continue;
      }
      if (
        cond.forbiddenBedLevelingCategories &&
        cond.forbiddenBedLevelingCategories.includes(ctx.printer.bedLevelingCategory)
      ) {
        continue;
      }
      if (cond.requireAutoLeveling && !autoCapable) {
        continue;
      }
      if (cond.requireFilamentSensor && !ctx.printer.fdmSpecs?.filamentRunoutSensor) {
        continue;
      }
      if (cond.requireMultiMaterial && !ctx.printer.fdmSpecs?.multiMaterialSystem) {
        continue;
      }
    } else {
      // Unlisted / generic mode: do not trigger strictly auto-only or multi-material-only rules unless symptom matches
      if (cond.requireManualTrammingAllowed) continue;
    }

    // 4. Category relevance
    const inCategory = !cond.categoryIds || cond.categoryIds.includes(ctx.categoryId);

    // 5. Evidence matching
    const matchedReasons: string[] = [];
    let score = inCategory ? cond.baseWeight : 0;

    for (const optId of ctx.selectedOptionIds) {
      if (cond.matchingOptionIds.includes(optId)) {
        score += 25;
        const lbl = optionLabelMap.get(optId);
        if (lbl) matchedReasons.push(`Matches selected symptom: "${lbl}"`);
      }
      if (cond.contradictingOptionIds?.includes(optId)) {
        score -= 30;
      }
    }

    if (score <= 15) continue;

    // 6. Build model-specific guidance note from verified printer record
    let modelSpecificNote: string | null = null;
    if (ctx.printer) {
      const fdm = ctx.printer.fdmSpecs;
      const resin = ctx.printer.resinSpecs;
      if (cause.code === 'AUTO_LEVEL_NOZZLE_OOZE_OR_OFFSET' && fdm) {
        modelSpecificNote = `${ctx.printer.name} uses ${fdm.bedLevelingHardware}. ${
          fdm.calibrationMenuPath ? `Verified menu path: ${fdm.calibrationMenuPath}. ` : ''
        }Do not adjust manual bed screws.`;
      } else if (cause.code === 'PROBE_MESH_MANUAL_Z_OFFSET_MISMATCH' && fdm) {
        modelSpecificNote = `${ctx.printer.name} generates an automatic mesh via ${fdm.bedLevelingHardware}, but Z-offset requires: ${fdm.zOffsetMethod}`;
      } else if (cause.code === 'MANUAL_FOUR_CORNER_BED_TRAMMING' && fdm) {
        modelSpecificNote = `${ctx.printer.name} uses ${fdm.bedLevelingHardware}. ${
          fdm.calibrationMenuPath ? `Procedure path: ${fdm.calibrationMenuPath}.` : ''
        }`;
      } else if (cause.code === 'HEAT_CREEP_CHAMBER_SOFTENING' && fdm) {
        if (fdm.enclosureType.includes('Enclosed') && (!ctx.materialCode || ctx.materialCode === 'PLA' || ctx.materialCode === 'TPU')) {
          score += 15;
          matchedReasons.push(`${ctx.printer.name} has an enclosed chamber (${fdm.enclosureType}) which traps heat when printing low-softening-point ${ctx.materialCode || 'PLA'}.`);
          modelSpecificNote = `On ${ctx.printer.name}, vent the top lid/door (and keep active chamber heating OFF) when printing PLA, PETG, or TPU.`;
        }
      } else if (resin && cause.technology === 'RESIN') {
        modelSpecificNote = `${ctx.printer.name} (${resin.screenTechnology}, ${resin.releaseFilmType}): ${
          resin.vatHeatingCapable
            ? 'Enable built-in vat/chamber pre-heating to 25–30°C prior to print start.'
            : 'Model has no built-in vat heater—verify ambient room/resin temperature is 25–30°C.'
        }`;
      }
    } else {
      modelSpecificNote =
        'Generic diagnostic mode active (unlisted printer model). Verify your hardware mechanism in your official user manual before performing mechanical adjustments.';
    }

    const confidenceLabel: ConfidenceBadge =
      score >= 65 ? 'Strong match' : score >= 42 ? 'Possible cause' : 'Needs checking';

    results.push({
      cause,
      confidenceLabel,
      matchedReasons,
      modelSpecificNote,
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

export function isGuideCompatibleWithPrinter(guide: RepairGuideDTO, printer: PrinterModelDTO | null): boolean {
  if (!printer) {
    return !guide.requiresManualBedScrews;
  }
  if (guide.technology !== printer.technology) {
    return false;
  }
  if (guide.requiresManualBedScrews && !canPrinterUseManualBedTramming(printer)) {
    return false;
  }
  return true;
}

export function checkMaterialCompatibilityWithPrinter(
  material: MaterialReferenceDTO,
  printer: PrinterModelDTO
): { compatible: 'COMPATIBLE' | 'CAUTION_UPGRADE_NEEDED' | 'INCOMPATIBLE' | 'UNKNOWN'; explanation: string } {
  if (material.technology !== printer.technology) {
    return {
      compatible: 'INCOMPATIBLE',
      explanation: `${material.name} is a ${material.technology} material and cannot be used in a ${printer.technology} printer.`,
    };
  }

  if (printer.technology === 'RESIN') {
    return {
      compatible: 'COMPATIBLE',
      explanation: `405nm photopolymer compatible with ${printer.name}. ${
        material.code === 'RESIN_TOUGH_HIGH_TEMP' && !printer.resinSpecs?.vatHeatingCapable
          ? 'Note: External warming to 25–30°C recommended since this printer lacks an integrated vat heater.'
          : 'Calibrate exposure time using a test matrix.'
      }`,
    };
  }

  const fdm = printer.fdmSpecs;
  if (!fdm) {
    return { compatible: 'UNKNOWN', explanation: 'Verified hotend/bed specifications are incomplete for this model.' };
  }

  if (material.nozzleTempRangeC && fdm.maxNozzleTempC !== null && fdm.maxNozzleTempC < material.nozzleTempRangeC.min) {
    return {
      compatible: 'INCOMPATIBLE',
      explanation: `Requires ${material.nozzleTempRangeC.min}°C minimum nozzle temp, exceeding ${printer.name}'s ${fdm.maxNozzleTempC}°C limit.`,
    };
  }

  if (material.bedTempRangeC && fdm.maxBedTempC !== null && fdm.maxBedTempC < material.bedTempRangeC.min) {
    return {
      compatible: 'INCOMPATIBLE',
      explanation: `Requires ${material.bedTempRangeC.min}°C minimum heated bed, exceeding ${printer.name}'s ${fdm.maxBedTempC}°C bed limit.`,
    };
  }

  if (
    material.enclosureRequirement.startsWith('Required') &&
    fdm.enclosureType === 'Open Frame'
  ) {
    return {
      compatible: 'CAUTION_UPGRADE_NEEDED',
      explanation: `${printer.name} has an Open Frame; ${material.code} requires a draft-free enclosure to prevent severe warping and layer cracking.`,
    };
  }

  if (material.hardenedNozzleRequired) {
    const hotendLower = fdm.hotendType.toLowerCase();
    const alreadyHardened =
      hotendLower.includes('hardened') || hotendLower.includes('bimetal') || hotendLower.includes('tri-metal');
    if (!alreadyHardened) {
      return {
        compatible: 'CAUTION_UPGRADE_NEEDED',
        explanation: `Abrasive fibers require upgrading ${printer.name}'s stock nozzle/gears to hardened steel (0.6 mm recommended).`,
      };
    }
  }

  return {
    compatible: 'COMPATIBLE',
    explanation: `Supported within ${printer.name}'s verified ${fdm.maxNozzleTempC}°C hotend, ${fdm.maxBedTempC}°C bed, and ${fdm.enclosureType} configuration.`,
  };
}

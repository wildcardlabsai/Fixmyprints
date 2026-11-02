import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  SEED_PRINTER_MODELS,
  SEED_MANUFACTURERS,
  SEED_VARIANTS,
} from '../../db/seedCatalog.ts';
import {
  SEED_DIAGNOSTIC_QUESTIONS,
  SEED_DIAGNOSTIC_CAUSES,
  SEED_REPAIR_GUIDES,
  SEED_MATERIALS,
} from '../../db/seedDiagnostics.ts';
import {
  canPrinterUseManualBedTramming,
  filterApplicableQuestions,
  evaluateDiagnosticCauses,
  isGuideCompatibleWithPrinter,
  checkMaterialCompatibilityWithPrinter,
} from '../diagnosticEngine.ts';
import { initializeDatabaseSchema } from '../../db/index.ts';
import { seedDatabaseIfEmpty } from '../../db/seed.ts';

function getPrinter(idOrSlug: string) {
  const found = SEED_PRINTER_MODELS.find((m) => m.id === idOrSlug || m.slug === idOrSlug);
  if (!found) {
    throw new Error(`Test setup error: Printer ${idOrSlug} not found in SEED_PRINTER_MODELS`);
  }
  return found;
}

describe('FixMyPrint Model-Aware Diagnostic & Capability Engine', () => {
  describe('CRITICAL REGRESSION: Printers without manual bed wheels NEVER receive manual tramming instructions', () => {
    const nonManualPrinterIds = [
      'mdl_flashforge_ad5m', // Flashforge Adventurer 5M (Strain-gauge auto)
      'mdl_flashforge_ad5x', // Flashforge AD5X
      'mdl_bambu_a1', // Bambu Lab A1 (Eddy-current + nozzle force sensor)
      'mdl_bambu_a1_mini', // Bambu Lab A1 mini
      'mdl_bambu_p1s', // Bambu Lab P1S
      'mdl_bambu_x1c', // Bambu Lab X1 Carbon
      'mdl_bambu_h2d', // Bambu Lab H2D
      'mdl_prusa_mk4s', // Prusa MK4S (Loadcell nozzle tap)
      'mdl_prusa_core_one', // Prusa CORE One
      'mdl_prusa_mk3s_plus', // Prusa MK3S+ (Rigid standoffs + SuperPINDA mesh + Live-Z, NO bed wheels)
      'mdl_prusa_xl', // Prusa XL
      'mdl_creality_ender3_v3_se', // Ender-3 V3 SE (CR-Touch + strain sensor, rigid bed)
      'mdl_creality_k1c', // Creality K1C
      'mdl_creality_k2_plus', // Creality K2 Plus
      'mdl_elegoo_centauri_carbon', // Elegoo Centauri Carbon
      'mdl_anycubic_kobra_3', // Anycubic Kobra 3 (LeviQ 3.0)
      'mdl_qidi_plus4', // QIDI Plus4
      'mdl_sovol_sv08', // Sovol SV08 (Quad-Gantry-Leveling flying gantry, fixed bed)
      'mdl_voron_24_r2', // Voron 2.4 R2 (QGL flying gantry, fixed bed)
      'mdl_elegoo_saturn_4_ultra', // Resin MSLA
      'mdl_formlabs_form_4', // Resin LFD
    ];

    it.each(nonManualPrinterIds)(
      'blocks manual 4-wheel tramming questions, causes, and guides for %s',
      (printerId) => {
        const printer = getPrinter(printerId);

        // 1. Capability gate must return false
        expect(canPrinterUseManualBedTramming(printer)).toBe(false);

        // 2. Questions requiring manual bed screws must be filtered out
        const questions = filterApplicableQuestions(SEED_DIAGNOSTIC_QUESTIONS, {
          printer,
          categoryId: 'cat_first_layer',
          selectedOptionIds: ['opt_fl_uneven', 'opt_fl_high_drag'],
        });
        expect(questions.some((q) => q.conditions.requireManualBedScrews)).toBe(false);

        // 3. Even if a user somehow passed manual corner option IDs, ranked causes MUST NOT include manual bed leveling
        const rankedCauses = evaluateDiagnosticCauses(
          SEED_DIAGNOSTIC_CAUSES,
          SEED_DIAGNOSTIC_QUESTIONS,
          {
            printer,
            categoryId: 'cat_first_layer',
            selectedOptionIds: ['opt_fl_uneven', 'opt_fl_high_drag', 'opt_fl_wheels_untrammed'],
          }
        );

        for (const result of rankedCauses) {
          expect(result.cause.isManualBedLevelingProcedure).toBe(false);
          expect(result.cause.code).not.toBe('MANUAL_FOUR_CORNER_BED_TRAMMING');
          expect(result.cause.recommendedGuideSlug).not.toBe('manual-four-point-bed-tramming-procedure');
        }

        // 4. Manual bed tramming repair guide must be flagged incompatible
        const manualGuide = SEED_REPAIR_GUIDES.find((g) => g.requiresManualBedScrews);
        expect(manualGuide).toBeDefined();
        expect(isGuideCompatibleWithPrinter(manualGuide!, printer)).toBe(false);
      }
    );

    it('sweeps EVERY printer in the catalog to verify zero leaks on manualTrammingProcedureAllowed=false machines', () => {
      for (const printer of SEED_PRINTER_MODELS) {
        const explicitlyAllowed = Boolean(
          printer.technology === 'FDM' &&
            printer.fdmSpecs?.hasManualBedScrews &&
            printer.fdmSpecs?.manualTrammingProcedureAllowed
        );
        expect(canPrinterUseManualBedTramming(printer)).toBe(explicitlyAllowed);
      }
    });
  });

  describe('Positive Capability Verification: Manual & Hybrid Bed-Wheel Printers', () => {
    it('allows manual 4-corner tramming workflow on Creality Ender-3 V2 and Elegoo Neptune 4 Pro', () => {
      const ender3V2 = getPrinter('mdl_creality_ender3_v2');
      const neptune4Pro = getPrinter('mdl_elegoo_neptune_4_pro');

      expect(canPrinterUseManualBedTramming(ender3V2)).toBe(true);
      expect(canPrinterUseManualBedTramming(neptune4Pro)).toBe(true);

      const questions = filterApplicableQuestions(SEED_DIAGNOSTIC_QUESTIONS, {
        printer: ender3V2,
        categoryId: 'cat_first_layer',
        selectedOptionIds: ['opt_fl_uneven'],
      });
      expect(questions.some((q) => q.conditions.requireManualBedScrews)).toBe(true);

      const causes = evaluateDiagnosticCauses(
        SEED_DIAGNOSTIC_CAUSES,
        SEED_DIAGNOSTIC_QUESTIONS,
        {
          printer: neptune4Pro,
          categoryId: 'cat_first_layer',
          selectedOptionIds: ['opt_fl_uneven', 'opt_fl_wheels_untrammed'],
        }
      );
      expect(causes.some((c) => c.cause.code === 'MANUAL_FOUR_CORNER_BED_TRAMMING')).toBe(true);
    });

    it('distinguishes Prusa MK3S+ SuperPINDA mesh + manual Live-Z from 4-wheel tramming and load-cell auto Z', () => {
      const mk3s = getPrinter('mdl_prusa_mk3s_plus');
      expect(mk3s.bedLevelingCategory).toBe('AUTO_PROBE_MESH');
      expect(canPrinterUseManualBedTramming(mk3s)).toBe(false);

      const causes = evaluateDiagnosticCauses(
        SEED_DIAGNOSTIC_CAUSES,
        SEED_DIAGNOSTIC_QUESTIONS,
        {
          printer: mk3s,
          categoryId: 'cat_first_layer',
          selectedOptionIds: ['opt_fl_high_drag'],
        }
      );
      expect(causes.some((c) => c.cause.code === 'PROBE_MESH_MANUAL_Z_OFFSET_MISMATCH')).toBe(true);
      expect(causes.some((c) => c.cause.isManualBedLevelingProcedure)).toBe(false);
    });
  });

  describe('Strict FDM vs MSLA Resin Workflow Isolation', () => {
    it('never mixes FDM nozzle/extruder causes into MSLA Resin printers and vice versa', () => {
      const saturn4 = getPrinter('mdl_elegoo_saturn_4_ultra');
      const bambuP1S = getPrinter('mdl_bambu_p1s');

      const resinCauses = evaluateDiagnosticCauses(
        SEED_DIAGNOSTIC_CAUSES,
        SEED_DIAGNOSTIC_QUESTIONS,
        {
          printer: saturn4,
          categoryId: 'cat_resin_adhesion_peel',
          selectedOptionIds: ['opt_res_empty_plate'],
        }
      );
      expect(resinCauses.length).toBeGreaterThan(0);
      expect(resinCauses.every((c) => c.cause.technology === 'RESIN')).toBe(true);

      const fdmCauses = evaluateDiagnosticCauses(
        SEED_DIAGNOSTIC_CAUSES,
        SEED_DIAGNOSTIC_QUESTIONS,
        {
          printer: bambuP1S,
          categoryId: 'cat_extrusion_clog',
          selectedOptionIds: ['opt_ext_stops_midprint'],
        }
      );
      expect(fdmCauses.length).toBeGreaterThan(0);
      expect(fdmCauses.every((c) => c.cause.technology === 'FDM')).toBe(true);

      for (const guide of SEED_REPAIR_GUIDES) {
        if (guide.technology === 'FDM') {
          expect(isGuideCompatibleWithPrinter(guide, saturn4)).toBe(false);
        } else {
          expect(isGuideCompatibleWithPrinter(guide, bambuP1S)).toBe(false);
        }
      }
    });
  });

  describe('Missing / Unlisted Generic Printer Mode & Variants', () => {
    it('handles unlisted generic printer (printer: null) conservatively without assuming manual bed wheels', () => {
      expect(canPrinterUseManualBedTramming(null)).toBe(false);

      const genericCauses = evaluateDiagnosticCauses(
        SEED_DIAGNOSTIC_CAUSES,
        SEED_DIAGNOSTIC_QUESTIONS,
        {
          printer: null,
          genericTechnology: 'FDM',
          categoryId: 'cat_first_layer',
          selectedOptionIds: ['opt_fl_no_stick'],
        }
      );
      expect(genericCauses.length).toBeGreaterThan(0);
      expect(genericCauses.every((c) => !c.cause.isManualBedLevelingProcedure)).toBe(true);
      expect(genericCauses[0].modelSpecificNote).toContain('Generic diagnostic mode');
    });

    it('documents distinct model variants accurately (e.g. Bambu P1P vs P1S, Adventurer 5M Pro)', () => {
      expect(SEED_VARIANTS.length).toBeGreaterThanOrEqual(5);
      const p1pVariant = SEED_VARIANTS.find((v) => v.name.includes('P1P'));
      expect(p1pVariant).toBeDefined();
      expect(p1pVariant!.differencesJson.length).toBeGreaterThan(0);
    });
  });

  describe('Material Hardware Compatibility Rules', () => {
    it('flags bed temperature, open-frame enclosure, and hardened nozzle constraints accurately', () => {
      const a1Mini = getPrinter('mdl_bambu_a1_mini'); // 80°C max bed
      const ender3V2 = getPrinter('mdl_creality_ender3_v2'); // Open frame, brass nozzle
      const x1c = getPrinter('mdl_bambu_x1c'); // Enclosed, hardened steel nozzle

      const absMat = SEED_MATERIALS.find((m) => m.code === 'ABS')!;
      const cfMat = SEED_MATERIALS.find((m) => m.code === 'PA_CF') || SEED_MATERIALS.find((m) => m.hardenedNozzleRequired)!;

      // ABS requires >=90°C bed -> incompatible with A1 mini's 80°C bed
      expect(checkMaterialCompatibilityWithPrinter(absMat, a1Mini).compatible).toBe('INCOMPATIBLE');

      // ABS on open-frame Ender-3 V2 (100°C bed) -> caution upgrade needed (draft-free enclosure)
      expect(checkMaterialCompatibilityWithPrinter(absMat, ender3V2).compatible).toBe('CAUTION_UPGRADE_NEEDED');

      // Carbon-fiber abrasive material on brass-nozzle Ender-3 V2 -> caution or incompatible
      const cfOnEnder = checkMaterialCompatibilityWithPrinter(cfMat, ender3V2);
      expect(['INCOMPATIBLE', 'CAUTION_UPGRADE_NEEDED']).toContain(cfOnEnder.compatible);

      // Carbon-fiber on hardened-nozzle Enclosed X1C -> compatible
      expect(checkMaterialCompatibilityWithPrinter(cfMat, x1c).compatible).toBe('COMPATIBLE');
    });
  });

  describe('Relational SQLite Schema & Transactional Seed Integrity', () => {
    it('initializes all tables and seeds 35+ manufacturers and verified models into an in-memory SQLite database', () => {
      const memDb = new Database(':memory:');
      memDb.pragma('foreign_keys = ON');
      initializeDatabaseSchema(memDb);
      seedDatabaseIfEmpty(memDb);

      const mfgCount = (memDb.prepare('SELECT COUNT(*) as c FROM manufacturers').get() as { c: number }).c;
      const modelCount = (memDb.prepare('SELECT COUNT(*) as c FROM printer_models').get() as { c: number }).c;
      const sourceCount = (memDb.prepare('SELECT COUNT(*) as c FROM source_references').get() as { c: number }).c;

      expect(mfgCount).toBe(SEED_MANUFACTURERS.length);
      expect(mfgCount).toBeGreaterThanOrEqual(35);
      expect(modelCount).toBe(SEED_PRINTER_MODELS.length);
      expect(sourceCount).toBeGreaterThanOrEqual(10);

      // Idempotency check: calling seedDatabaseIfEmpty a second time must not duplicate records
      seedDatabaseIfEmpty(memDb);
      const mfgCountAfter = (memDb.prepare('SELECT COUNT(*) as c FROM manufacturers').get() as { c: number }).c;
      expect(mfgCountAfter).toBe(mfgCount);

      memDb.close();
    });
  });
});

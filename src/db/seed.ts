import type Database from 'better-sqlite3';
import { sqlite, initializeDatabaseSchema } from './index.ts';
import {
  SEED_IMAGE_ASSETS,
  SEED_MANUFACTURERS,
  SEED_PRINTER_MODELS,
  SEED_VARIANTS,
  SEED_SOURCES,
} from './seedCatalog.ts';
import {
  SEED_DIAGNOSTIC_CATEGORIES,
  SEED_DIAGNOSTIC_QUESTIONS,
  SEED_DIAGNOSTIC_CAUSES,
  SEED_REPAIR_GUIDES,
  SEED_MATERIALS,
  SEED_ERROR_CODES,
  SEED_MAINTENANCE,
} from './seedDiagnostics.ts';

export function seedDatabaseIfEmpty(rawDb: Database.Database = sqlite) {
  initializeDatabaseSchema(rawDb);

  const countRow = rawDb.prepare('SELECT COUNT(*) as cnt FROM manufacturers').get() as { cnt: number };
  if (countRow.cnt > 0) {
    return;
  }

  const runSeed = rawDb.transaction(() => {
    const insertImg = rawDb.prepare(`
      INSERT INTO image_assets (id, title, url, diagram_type, alt_text, caption, license, attribution)
      VALUES (@id, @title, @url, @diagramType, @altText, @caption, @license, @attribution)
    `);
    for (const img of SEED_IMAGE_ASSETS) {
      insertImg.run(img);
    }

    const insertMfg = rawDb.prepare(`
      INSERT INTO manufacturers (id, slug, name, country, website_url, support_url, supports_fdm, supports_resin, is_community_open_source, notes)
      VALUES (@id, @slug, @name, @country, @websiteUrl, @supportUrl, @supportsFdm, @supportsResin, @isCommunityOpenSource, @notes)
    `);
    for (const m of SEED_MANUFACTURERS) {
      insertMfg.run({
        ...m,
        supportsFdm: m.supportsFdm ? 1 : 0,
        supportsResin: m.supportsResin ? 1 : 0,
        isCommunityOpenSource: m.isCommunityOpenSource ? 1 : 0,
      });
    }

    const insertModel = rawDb.prepare(`
      INSERT INTO printer_models (
        id, slug, manufacturer_id, name, family, generation, technology, release_status,
        bed_leveling_category, completeness_status, last_verified_date, summary,
        official_manual_url, official_support_url, image_asset_id, fdm_specs_json, resin_specs_json
      ) VALUES (
        @id, @slug, @manufacturerId, @name, @family, @generation, @technology, @releaseStatus,
        @bedLevelingCategory, @completenessStatus, @lastVerifiedDate, @summary,
        @officialManualUrl, @officialSupportUrl, @imageAssetId, @fdmSpecsJson, @resinSpecsJson
      )
    `);
    for (const mdl of SEED_PRINTER_MODELS) {
      insertModel.run({
        id: mdl.id,
        slug: mdl.slug,
        manufacturerId: mdl.manufacturerId,
        name: mdl.name,
        family: mdl.family,
        generation: mdl.generation,
        technology: mdl.technology,
        releaseStatus: mdl.releaseStatus,
        bedLevelingCategory: mdl.bedLevelingCategory,
        completenessStatus: mdl.completenessStatus,
        lastVerifiedDate: mdl.lastVerifiedDate,
        summary: mdl.summary,
        officialManualUrl: mdl.officialManualUrl,
        officialSupportUrl: mdl.officialSupportUrl,
        imageAssetId: mdl.imageAssetId,
        fdmSpecsJson: mdl.fdmSpecs ? JSON.stringify(mdl.fdmSpecs) : null,
        resinSpecsJson: mdl.resinSpecs ? JSON.stringify(mdl.resinSpecs) : null,
      });
    }

    const insertVariant = rawDb.prepare(`
      INSERT INTO printer_variants (id, model_id, name, notes, differences_json)
      VALUES (@id, @modelId, @name, @notes, @differencesJson)
    `);
    for (const v of SEED_VARIANTS) {
      insertVariant.run({
        id: v.id,
        modelId: v.modelId,
        name: v.name,
        notes: v.notes,
        differencesJson: JSON.stringify(v.differencesJson),
      });
    }

    const insertSource = rawDb.prepare(`
      INSERT INTO source_references (id, entity_type, entity_id, title, url, source_type, section_reference, verified_date, verification_status)
      VALUES (@id, @entityType, @entityId, @title, @url, @sourceType, @sectionReference, @verifiedDate, @verificationStatus)
    `);
    for (const s of SEED_SOURCES) {
      insertSource.run(s);
    }

    const insertCat = rawDb.prepare(`
      INSERT INTO diagnostic_categories (id, slug, title, technology, short_description, visual_fault_code, image_asset_id, sort_order)
      VALUES (@id, @slug, @title, @technology, @shortDescription, @visualFaultCode, @imageAssetId, @sortOrder)
    `);
    for (const c of SEED_DIAGNOSTIC_CATEGORIES) {
      insertCat.run(c);
    }

    const insertQuestion = rawDb.prepare(`
      INSERT INTO diagnostic_questions (id, category_id, code, prompt, help_text, step_order, conditions_json)
      VALUES (@id, @categoryId, @code, @prompt, @helpText, @stepOrder, @conditionsJson)
    `);
    const insertOption = rawDb.prepare(`
      INSERT INTO diagnostic_options (id, question_id, label, explanation, visual_fault_code, image_asset_id)
      VALUES (@id, @questionId, @label, @explanation, @visualFaultCode, @imageAssetId)
    `);
    for (const q of SEED_DIAGNOSTIC_QUESTIONS) {
      insertQuestion.run({
        id: q.id,
        categoryId: q.categoryId,
        code: q.code,
        prompt: q.prompt,
        helpText: q.helpText,
        stepOrder: q.stepOrder,
        conditionsJson: JSON.stringify(q.conditions),
      });
      for (const opt of q.options) {
        insertOption.run(opt);
      }
    }

    const insertCause = rawDb.prepare(`
      INSERT INTO diagnostic_causes (
        id, code, title, technology, plain_explanation, distinguishing_checks_json,
        safety_notes, is_manual_bed_leveling_procedure, recommended_guide_slug, conditions_json
      ) VALUES (
        @id, @code, @title, @technology, @plainExplanation, @distinguishingChecksJson,
        @safetyNotes, @isManualBedLevelingProcedure, @recommendedGuideSlug, @conditionsJson
      )
    `);
    for (const cause of SEED_DIAGNOSTIC_CAUSES) {
      insertCause.run({
        id: cause.id,
        code: cause.code,
        title: cause.title,
        technology: cause.technology,
        plainExplanation: cause.plainExplanation,
        distinguishingChecksJson: JSON.stringify(cause.distinguishingChecks),
        safetyNotes: cause.safetyNotes,
        isManualBedLevelingProcedure: cause.isManualBedLevelingProcedure ? 1 : 0,
        recommendedGuideSlug: cause.recommendedGuideSlug,
        conditionsJson: JSON.stringify(cause.conditions),
      });
    }

    const insertGuide = rawDb.prepare(`
      INSERT INTO repair_guides (
        id, slug, title, technology, difficulty, estimated_time,
        applicable_families_json, applicable_model_ids_json, requires_manual_bed_screws,
        symptoms_json, tools_needed_json, parts_needed_json, safety_warnings_json,
        service_boundary_note, model_specific_menu_notes_json, steps_json,
        verification_procedure, if_not_fixed_branches_json, last_verified_date, verification_status
      ) VALUES (
        @id, @slug, @title, @technology, @difficulty, @estimatedTime,
        @applicableFamiliesJson, @applicableModelIdsJson, @requiresManualBedScrews,
        @symptomsJson, @toolsNeededJson, @partsNeededJson, @safetyWarningsJson,
        @serviceBoundaryNote, @modelSpecificMenuNotesJson, @stepsJson,
        @verificationProcedure, @ifNotFixedBranchesJson, @lastVerifiedDate, @verificationStatus
      )
    `);
    for (const g of SEED_REPAIR_GUIDES) {
      insertGuide.run({
        id: g.id,
        slug: g.slug,
        title: g.title,
        technology: g.technology,
        difficulty: g.difficulty,
        estimatedTime: g.estimatedTime,
        applicableFamiliesJson: JSON.stringify(g.applicableFamilies),
        applicableModelIdsJson: JSON.stringify(g.applicableModelIds),
        requiresManualBedScrews: g.requiresManualBedScrews ? 1 : 0,
        symptomsJson: JSON.stringify(g.symptoms),
        toolsNeededJson: JSON.stringify(g.toolsNeeded),
        partsNeededJson: JSON.stringify(g.partsNeeded),
        safetyWarningsJson: JSON.stringify(g.safetyWarnings),
        serviceBoundaryNote: g.serviceBoundaryNote,
        modelSpecificMenuNotesJson: JSON.stringify(g.modelSpecificMenuNotes),
        stepsJson: JSON.stringify(g.steps),
        verificationProcedure: g.verificationProcedure,
        ifNotFixedBranchesJson: JSON.stringify(g.ifNotFixedBranches),
        lastVerifiedDate: g.lastVerifiedDate,
        verificationStatus: g.verificationStatus,
      });
    }

    const insertMat = rawDb.prepare(`
      INSERT INTO materials_reference (
        id, code, name, technology, category, nozzle_temp_min_c, nozzle_temp_max_c,
        bed_temp_min_c, bed_temp_max_c, enclosure_requirement, drying_guidance,
        cooling_guidance, hardware_compatibility_notes, hardened_nozzle_required,
        exposure_notes_resin, safety_guidance, last_verified_date
      ) VALUES (
        @id, @code, @name, @technology, @category, @nozzleTempMinC, @nozzleTempMaxC,
        @bedTempMinC, @bedTempMaxC, @enclosureRequirement, @dryingGuidance,
        @coolingGuidance, @hardwareCompatibilityNotes, @hardenedNozzleRequired,
        @exposureNotesResin, @safetyGuidance, @lastVerifiedDate
      )
    `);
    for (const mat of SEED_MATERIALS) {
      insertMat.run({
        id: mat.id,
        code: mat.code,
        name: mat.name,
        technology: mat.technology,
        category: mat.category,
        nozzleTempMinC: mat.nozzleTempRangeC?.min ?? null,
        nozzleTempMaxC: mat.nozzleTempRangeC?.max ?? null,
        bedTempMinC: mat.bedTempRangeC?.min ?? null,
        bedTempMaxC: mat.bedTempRangeC?.max ?? null,
        enclosureRequirement: mat.enclosureRequirement,
        dryingGuidance: mat.dryingGuidance,
        coolingGuidance: mat.coolingGuidance,
        hardwareCompatibilityNotes: mat.hardwareCompatibilityNotes,
        hardenedNozzleRequired: mat.hardenedNozzleRequired ? 1 : 0,
        exposureNotesResin: mat.exposureNotesResin,
        safetyGuidance: mat.safetyGuidance,
        lastVerifiedDate: mat.lastVerifiedDate,
      });
    }

    const insertErr = rawDb.prepare(`
      INSERT INTO error_codes (
        id, manufacturer_id, applicable_families_json, firmware_context, code,
        verified_meaning, likely_causes_json, recommended_checks_json,
        official_source_url, last_verified_date
      ) VALUES (
        @id, @manufacturerId, @applicableFamiliesJson, @firmwareContext, @code,
        @verifiedMeaning, @likelyCausesJson, @recommendedChecksJson,
        @officialSourceUrl, @lastVerifiedDate
      )
    `);
    for (const err of SEED_ERROR_CODES) {
      insertErr.run({
        id: err.id,
        manufacturerId: err.manufacturerId,
        applicableFamiliesJson: JSON.stringify(err.applicableFamilies),
        firmwareContext: err.firmwareContext,
        code: err.code,
        verifiedMeaning: err.verifiedMeaning,
        likelyCausesJson: JSON.stringify(err.likelyCauses),
        recommendedChecksJson: JSON.stringify(err.recommendedChecks),
        officialSourceUrl: err.officialSourceUrl,
        lastVerifiedDate: err.lastVerifiedDate,
      });
    }

    const insertMaint = rawDb.prepare(`
      INSERT INTO maintenance_procedures (
        id, technology, component_category, title, applicable_systems_json,
        interval_guidance, procedure_summary, lubricant_or_cleaner,
        do_not_apply_to_json, safety_warning, last_verified_date
      ) VALUES (
        @id, @technology, @componentCategory, @title, @applicableSystemsJson,
        @intervalGuidance, @procedureSummary, @lubricantOrCleaner,
        @doNotApplyToJson, @safetyWarning, @lastVerifiedDate
      )
    `);
    for (const m of SEED_MAINTENANCE) {
      insertMaint.run({
        id: m.id,
        technology: m.technology,
        componentCategory: m.componentCategory,
        title: m.title,
        applicableSystemsJson: JSON.stringify(m.applicableSystems),
        intervalGuidance: m.intervalGuidance,
        procedureSummary: m.procedureSummary,
        lubricantOrCleaner: m.lubricantOrCleaner,
        doNotApplyToJson: JSON.stringify(m.doNotApplyTo),
        safetyWarning: m.safetyWarning,
        lastVerifiedDate: m.lastVerifiedDate,
      });
    }
  });

  runSeed();
}

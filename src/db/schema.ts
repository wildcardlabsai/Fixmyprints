import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const manufacturers = sqliteTable('manufacturers', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  websiteUrl: text('website_url').notNull(),
  supportUrl: text('support_url').notNull(),
  supportsFdm: integer('supports_fdm', { mode: 'boolean' }).notNull().default(true),
  supportsResin: integer('supports_resin', { mode: 'boolean' }).notNull().default(false),
  isCommunityOpenSource: integer('is_community_open_source', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes').notNull().default(''),
});

export const imageAssets = sqliteTable('image_assets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  url: text('url'),
  diagramType: text('diagram_type'),
  altText: text('alt_text').notNull(),
  caption: text('caption').notNull(),
  license: text('license').notNull(),
  attribution: text('attribution').notNull(),
});

export const printerModels = sqliteTable(
  'printer_models',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    manufacturerId: text('manufacturer_id')
      .notNull()
      .references(() => manufacturers.id),
    name: text('name').notNull(),
    family: text('family').notNull(),
    generation: text('generation').notNull(),
    technology: text('technology').notNull(), // FDM | RESIN
    releaseStatus: text('release_status').notNull(), // CURRENT | DISCONTINUED | LEGACY_SUPPORTED | OPEN_SOURCE_KIT
    bedLevelingCategory: text('bed_leveling_category').notNull(),
    completenessStatus: text('completeness_status').notNull(), // VERIFIED | PARTIAL | COMMUNITY_CORROBORATED | UNVERIFIED | OUTDATED
    lastVerifiedDate: text('last_verified_date').notNull(),
    summary: text('summary').notNull(),
    officialManualUrl: text('official_manual_url'),
    officialSupportUrl: text('official_support_url'),
    imageAssetId: text('image_asset_id'),
    fdmSpecsJson: text('fdm_specs_json'),
    resinSpecsJson: text('resin_specs_json'),
  },
  (table) => [
    index('idx_printer_models_manufacturer').on(table.manufacturerId),
    index('idx_printer_models_technology').on(table.technology),
    index('idx_printer_models_leveling').on(table.bedLevelingCategory),
  ]
);

export const printerVariants = sqliteTable('printer_variants', {
  id: text('id').primaryKey(),
  modelId: text('model_id')
    .notNull()
    .references(() => printerModels.id),
  name: text('name').notNull(),
  notes: text('notes').notNull(),
  differencesJson: text('differences_json').notNull(),
});

export const sourceReferences = sqliteTable(
  'source_references',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    sourceType: text('source_type').notNull(),
    sectionReference: text('section_reference'),
    verifiedDate: text('verified_date').notNull(),
    verificationStatus: text('verification_status').notNull(),
  },
  (table) => [index('idx_sources_entity').on(table.entityType, table.entityId)]
);

export const diagnosticCategories = sqliteTable('diagnostic_categories', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  technology: text('technology').notNull(), // FDM | RESIN | BOTH
  shortDescription: text('short_description').notNull(),
  visualFaultCode: text('visual_fault_code').notNull(),
  imageAssetId: text('image_asset_id'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const diagnosticQuestions = sqliteTable('diagnostic_questions', {
  id: text('id').primaryKey(),
  categoryId: text('category_id'),
  code: text('code').notNull().unique(),
  prompt: text('prompt').notNull(),
  helpText: text('help_text').notNull(),
  stepOrder: integer('step_order').notNull(),
  conditionsJson: text('conditions_json').notNull(),
});

export const diagnosticOptions = sqliteTable('diagnostic_options', {
  id: text('id').primaryKey(),
  questionId: text('question_id')
    .notNull()
    .references(() => diagnosticQuestions.id),
  label: text('label').notNull(),
  explanation: text('explanation').notNull(),
  visualFaultCode: text('visual_fault_code'),
  imageAssetId: text('image_asset_id'),
});

export const diagnosticCauses = sqliteTable('diagnostic_causes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  technology: text('technology').notNull(),
  plainExplanation: text('plain_explanation').notNull(),
  distinguishingChecksJson: text('distinguishing_checks_json').notNull(),
  safetyNotes: text('safety_notes'),
  isManualBedLevelingProcedure: integer('is_manual_bed_leveling_procedure', { mode: 'boolean' })
    .notNull()
    .default(false),
  recommendedGuideSlug: text('recommended_guide_slug'),
  conditionsJson: text('conditions_json').notNull(),
});

export const repairGuides = sqliteTable('repair_guides', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  technology: text('technology').notNull(),
  difficulty: text('difficulty').notNull(),
  estimatedTime: text('estimated_time'),
  applicableFamiliesJson: text('applicable_families_json').notNull(),
  applicableModelIdsJson: text('applicable_model_ids_json').notNull(),
  requiresManualBedScrews: integer('requires_manual_bed_screws', { mode: 'boolean' })
    .notNull()
    .default(false),
  symptomsJson: text('symptoms_json').notNull(),
  toolsNeededJson: text('tools_needed_json').notNull(),
  partsNeededJson: text('parts_needed_json').notNull(),
  safetyWarningsJson: text('safety_warnings_json').notNull(),
  serviceBoundaryNote: text('service_boundary_note').notNull(),
  modelSpecificMenuNotesJson: text('model_specific_menu_notes_json').notNull(),
  stepsJson: text('steps_json').notNull(),
  verificationProcedure: text('verification_procedure').notNull(),
  ifNotFixedBranchesJson: text('if_not_fixed_branches_json').notNull(),
  lastVerifiedDate: text('last_verified_date').notNull(),
  verificationStatus: text('verification_status').notNull(),
});

export const materialsReference = sqliteTable('materials_reference', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  technology: text('technology').notNull(),
  category: text('category').notNull(),
  nozzleTempMinC: integer('nozzle_temp_min_c'),
  nozzleTempMaxC: integer('nozzle_temp_max_c'),
  bedTempMinC: integer('bed_temp_min_c'),
  bedTempMaxC: integer('bed_temp_max_c'),
  enclosureRequirement: text('enclosure_requirement').notNull(),
  dryingGuidance: text('drying_guidance').notNull(),
  coolingGuidance: text('cooling_guidance').notNull(),
  hardwareCompatibilityNotes: text('hardware_compatibility_notes').notNull(),
  hardenedNozzleRequired: integer('hardened_nozzle_required', { mode: 'boolean' }).notNull().default(false),
  exposureNotesResin: text('exposure_notes_resin'),
  safetyGuidance: text('safety_guidance').notNull(),
  lastVerifiedDate: text('last_verified_date').notNull(),
});

export const errorCodes = sqliteTable(
  'error_codes',
  {
    id: text('id').primaryKey(),
    manufacturerId: text('manufacturer_id')
      .notNull()
      .references(() => manufacturers.id),
    applicableFamiliesJson: text('applicable_families_json').notNull(),
    firmwareContext: text('firmware_context').notNull(),
    code: text('code').notNull(),
    verifiedMeaning: text('verified_meaning').notNull(),
    likelyCausesJson: text('likely_causes_json').notNull(),
    recommendedChecksJson: text('recommended_checks_json').notNull(),
    officialSourceUrl: text('official_source_url').notNull(),
    lastVerifiedDate: text('last_verified_date').notNull(),
  },
  (table) => [index('idx_error_codes_code').on(table.code)]
);

export const maintenanceProcedures = sqliteTable('maintenance_procedures', {
  id: text('id').primaryKey(),
  technology: text('technology').notNull(),
  componentCategory: text('component_category').notNull(),
  title: text('title').notNull(),
  applicableSystemsJson: text('applicable_systems_json').notNull(),
  intervalGuidance: text('interval_guidance').notNull(),
  procedureSummary: text('procedure_summary').notNull(),
  lubricantOrCleaner: text('lubricant_or_cleaner').notNull(),
  doNotApplyToJson: text('do_not_apply_to_json').notNull(),
  safetyWarning: text('safety_warning'),
  lastVerifiedDate: text('last_verified_date').notNull(),
});

export const modelRequests = sqliteTable('model_requests', {
  id: text('id').primaryKey(),
  manufacturerName: text('manufacturer_name').notNull(),
  modelName: text('model_name').notNull(),
  technology: text('technology').notNull(),
  notes: text('notes').notNull(),
  status: text('status').notNull().default('PENDING_REVIEW'),
  submittedAt: text('submitted_at').notNull(),
});

export const diagnosticSessions = sqliteTable('diagnostic_sessions', {
  id: text('id').primaryKey(),
  printerModelId: text('printer_model_id'),
  categoryId: text('category_id'),
  materialCode: text('material_code'),
  answersJson: text('answers_json').notNull(),
  topCauseCode: text('top_cause_code'),
  guideSlug: text('guide_slug'),
  outcome: text('outcome').notNull(), // RESOLVED | NOT_RESOLVED | IN_PROGRESS
  feedbackNotes: text('feedback_notes'),
  createdAt: text('created_at').notNull(),
});

export const userAccounts = sqliteTable('user_accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userAccounts.id),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_auth_sessions_user').on(table.userId)]
);

export const repairGuideFeedback = sqliteTable(
  'repair_guide_feedback',
  {
    id: text('id').primaryKey(),
    guideId: text('guide_id')
      .notNull()
      .references(() => repairGuides.id),
    guideSlug: text('guide_slug').notNull(),
    printerModelId: text('printer_model_id').references(() => printerModels.id),
    userId: text('user_id').references(() => userAccounts.id),
    helpfulnessRating: integer('helpfulness_rating').notNull(),
    outcome: text('outcome').notNull(), // FIXED | PARTIALLY_FIXED | NOT_FIXED
    generalComment: text('general_comment'),
    stepCommentsJson: text('step_comments_json').notNull(),
    completedStepsJson: text('completed_steps_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_guide_feedback_guide').on(table.guideId),
    index('idx_guide_feedback_printer').on(table.printerModelId),
  ]
);

export const savedDiagnosticSessions = sqliteTable(
  'saved_diagnostic_sessions',
  {
    id: text('id').primaryKey(),
    resumeTokenHash: text('resume_token_hash').notNull(),
    userId: text('user_id').references(() => userAccounts.id),
    title: text('title').notNull(),
    printerSlug: text('printer_slug'),
    printerModelId: text('printer_model_id').references(() => printerModels.id),
    useGenericMode: integer('use_generic_mode', { mode: 'boolean' }).notNull().default(false),
    genericTechnology: text('generic_technology').notNull().default('FDM'),
    materialCode: text('material_code'),
    categoryId: text('category_id'),
    answersByQuestionIdJson: text('answers_by_question_id_json').notNull(),
    symptomText: text('symptom_text'),
    status: text('status').notNull().default('IN_PROGRESS'), // IN_PROGRESS | RESULTS_READY | RESOLVED
    expiresAt: text('expires_at').notNull(),
    lastAccessedAt: text('last_accessed_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_saved_diag_user').on(table.userId),
    index('idx_saved_diag_expires').on(table.expiresAt),
  ]
);

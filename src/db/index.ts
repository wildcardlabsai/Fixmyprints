import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'fs';
import path from 'path';
import * as schema from './schema.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = process.env.FIXMYPRINT_DB_PATH || path.join(dataDir, 'fixmyprint.sqlite');
export const sqlite = new Database(dbFile);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function initializeDatabaseSchema(rawDb: Database.Database = sqlite) {
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS manufacturers (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      website_url TEXT NOT NULL,
      support_url TEXT NOT NULL,
      supports_fdm INTEGER NOT NULL DEFAULT 1,
      supports_resin INTEGER NOT NULL DEFAULT 0,
      is_community_open_source INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS image_assets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT,
      diagram_type TEXT,
      alt_text TEXT NOT NULL,
      caption TEXT NOT NULL,
      license TEXT NOT NULL,
      attribution TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS printer_models (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      manufacturer_id TEXT NOT NULL REFERENCES manufacturers(id),
      name TEXT NOT NULL,
      family TEXT NOT NULL,
      generation TEXT NOT NULL,
      technology TEXT NOT NULL,
      release_status TEXT NOT NULL,
      bed_leveling_category TEXT NOT NULL,
      completeness_status TEXT NOT NULL,
      last_verified_date TEXT NOT NULL,
      summary TEXT NOT NULL,
      official_manual_url TEXT,
      official_support_url TEXT,
      image_asset_id TEXT,
      fdm_specs_json TEXT,
      resin_specs_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_printer_models_manufacturer ON printer_models(manufacturer_id);
    CREATE INDEX IF NOT EXISTS idx_printer_models_technology ON printer_models(technology);
    CREATE INDEX IF NOT EXISTS idx_printer_models_leveling ON printer_models(bed_leveling_category);

    CREATE TABLE IF NOT EXISTS printer_variants (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL REFERENCES printer_models(id),
      name TEXT NOT NULL,
      notes TEXT NOT NULL,
      differences_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_references (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      source_type TEXT NOT NULL,
      section_reference TEXT,
      verified_date TEXT NOT NULL,
      verification_status TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sources_entity ON source_references(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS diagnostic_categories (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      technology TEXT NOT NULL,
      short_description TEXT NOT NULL,
      visual_fault_code TEXT NOT NULL,
      image_asset_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS diagnostic_questions (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      code TEXT NOT NULL UNIQUE,
      prompt TEXT NOT NULL,
      help_text TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      conditions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS diagnostic_options (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES diagnostic_questions(id),
      label TEXT NOT NULL,
      explanation TEXT NOT NULL,
      visual_fault_code TEXT,
      image_asset_id TEXT
    );

    CREATE TABLE IF NOT EXISTS diagnostic_causes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      technology TEXT NOT NULL,
      plain_explanation TEXT NOT NULL,
      distinguishing_checks_json TEXT NOT NULL,
      safety_notes TEXT,
      is_manual_bed_leveling_procedure INTEGER NOT NULL DEFAULT 0,
      recommended_guide_slug TEXT,
      conditions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repair_guides (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      technology TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      estimated_time TEXT,
      applicable_families_json TEXT NOT NULL,
      applicable_model_ids_json TEXT NOT NULL,
      requires_manual_bed_screws INTEGER NOT NULL DEFAULT 0,
      symptoms_json TEXT NOT NULL,
      tools_needed_json TEXT NOT NULL,
      parts_needed_json TEXT NOT NULL,
      safety_warnings_json TEXT NOT NULL,
      service_boundary_note TEXT NOT NULL,
      model_specific_menu_notes_json TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      verification_procedure TEXT NOT NULL,
      if_not_fixed_branches_json TEXT NOT NULL,
      last_verified_date TEXT NOT NULL,
      verification_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials_reference (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      technology TEXT NOT NULL,
      category TEXT NOT NULL,
      nozzle_temp_min_c INTEGER,
      nozzle_temp_max_c INTEGER,
      bed_temp_min_c INTEGER,
      bed_temp_max_c INTEGER,
      enclosure_requirement TEXT NOT NULL,
      drying_guidance TEXT NOT NULL,
      cooling_guidance TEXT NOT NULL,
      hardware_compatibility_notes TEXT NOT NULL,
      hardened_nozzle_required INTEGER NOT NULL DEFAULT 0,
      exposure_notes_resin TEXT,
      safety_guidance TEXT NOT NULL,
      last_verified_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS error_codes (
      id TEXT PRIMARY KEY,
      manufacturer_id TEXT NOT NULL REFERENCES manufacturers(id),
      applicable_families_json TEXT NOT NULL,
      firmware_context TEXT NOT NULL,
      code TEXT NOT NULL,
      verified_meaning TEXT NOT NULL,
      likely_causes_json TEXT NOT NULL,
      recommended_checks_json TEXT NOT NULL,
      official_source_url TEXT NOT NULL,
      last_verified_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_error_codes_code ON error_codes(code);

    CREATE TABLE IF NOT EXISTS maintenance_procedures (
      id TEXT PRIMARY KEY,
      technology TEXT NOT NULL,
      component_category TEXT NOT NULL,
      title TEXT NOT NULL,
      applicable_systems_json TEXT NOT NULL,
      interval_guidance TEXT NOT NULL,
      procedure_summary TEXT NOT NULL,
      lubricant_or_cleaner TEXT NOT NULL,
      do_not_apply_to_json TEXT NOT NULL,
      safety_warning TEXT,
      last_verified_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_requests (
      id TEXT PRIMARY KEY,
      manufacturer_name TEXT NOT NULL,
      model_name TEXT NOT NULL,
      technology TEXT NOT NULL,
      notes TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      submitted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS diagnostic_sessions (
      id TEXT PRIMARY KEY,
      printer_model_id TEXT,
      category_id TEXT,
      material_code TEXT,
      answers_json TEXT NOT NULL,
      top_cause_code TEXT,
      guide_slug TEXT,
      outcome TEXT NOT NULL,
      feedback_notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user_accounts(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

    CREATE TABLE IF NOT EXISTS repair_guide_feedback (
      id TEXT PRIMARY KEY,
      guide_id TEXT NOT NULL REFERENCES repair_guides(id),
      guide_slug TEXT NOT NULL,
      printer_model_id TEXT REFERENCES printer_models(id),
      user_id TEXT REFERENCES user_accounts(id),
      helpfulness_rating INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      general_comment TEXT,
      step_comments_json TEXT NOT NULL,
      completed_steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_guide_feedback_guide ON repair_guide_feedback(guide_id);
    CREATE INDEX IF NOT EXISTS idx_guide_feedback_printer ON repair_guide_feedback(printer_model_id);

    CREATE TABLE IF NOT EXISTS saved_diagnostic_sessions (
      id TEXT PRIMARY KEY,
      resume_token_hash TEXT NOT NULL,
      user_id TEXT REFERENCES user_accounts(id),
      title TEXT NOT NULL,
      printer_slug TEXT,
      printer_model_id TEXT REFERENCES printer_models(id),
      use_generic_mode INTEGER NOT NULL DEFAULT 0,
      generic_technology TEXT NOT NULL DEFAULT 'FDM',
      material_code TEXT,
      category_id TEXT,
      answers_by_question_id_json TEXT NOT NULL,
      symptom_text TEXT,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      expires_at TEXT NOT NULL,
      last_accessed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_saved_diag_user ON saved_diagnostic_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_saved_diag_expires ON saved_diagnostic_sessions(expires_at);
  `);
}

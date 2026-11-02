import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabaseSchema } from '../index.ts';
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
  getRecentGuideFeedbackForAdmin,
  GUEST_BOOKMARK_TTL_DAYS,
  AUTHENTICATED_SESSION_TTL_DAYS,
} from '../sessionAndFeedbackRepo.ts';

function createSeededMemoryDb(): Database.Database {
  const memDb = new Database(':memory:');
  memDb.pragma('foreign_keys = ON');
  initializeDatabaseSchema(memDb);

  memDb
    .prepare(
      `INSERT INTO manufacturers (id, slug, name, country, website_url, support_url, supports_fdm, supports_resin, is_community_open_source, notes)
       VALUES ('mfg_bambu', 'bambu-lab', 'Bambu Lab', 'China', 'https://bambulab.com', 'https://wiki.bambulab.com', 1, 0, 0, ''),
              ('mfg_creality', 'creality', 'Creality', 'China', 'https://creality.com', 'https://wiki.creality.com', 1, 1, 0, '')`
    )
    .run();

  memDb
    .prepare(
      `INSERT INTO printer_models (
         id, slug, manufacturer_id, name, family, generation, technology,
         release_status, bed_leveling_category, completeness_status,
         last_verified_date, summary
       ) VALUES
         ('mdl_bambu_p1s', 'bambu-lab-p1s', 'mfg_bambu', 'Bambu Lab P1S', 'P1 Series', 'Current', 'FDM', 'CURRENT', 'AUTO_LOAD_CELL_NOZZLE', 'VERIFIED', '2026-03-01', 'Enclosed CoreXY FDM printer'),
         ('mdl_ender_3_v2', 'creality-ender-3-v2', 'mfg_creality', 'Creality Ender-3 V2', 'Ender-3 Series', 'V2', 'FDM', 'LEGACY_SUPPORTED', 'MANUAL_SCREWS_WHEELS', 'VERIFIED', '2026-03-01', 'Cartesian bed-slinger')`
    )
    .run();

  memDb
    .prepare(
      `INSERT INTO diagnostic_categories (
         id, slug, title, technology, short_description, visual_fault_code, sort_order
       ) VALUES (
         'cat_extrusion', 'extrusion-clogs-feeding', 'Extrusion, Clogs & Filament Feeding', 'FDM', 'Under-extrusion and nozzle jams', 'under_extrusion', 1
       )`
    )
    .run();

  const stepsJson = JSON.stringify([
    {
      stepNumber: 1,
      title: 'Unload Filament & Heat Nozzle',
      instruction: 'Heat hotend to printing temperature and retract filament.',
      expectedObservation: 'Filament exits extruder cleanly.',
    },
    {
      stepNumber: 2,
      title: 'Insert Nylon/PLA Cleaning Strand & Cool to Pull Temp',
      instruction: 'Push filament until slight extrusion, then cool to 95°C for PLA.',
      expectedObservation: 'Filament solidifies around internal debris.',
    },
    {
      stepNumber: 3,
      title: 'Perform Firm Vertical Cold Pull',
      instruction: 'Pull upward steadily when target temperature is reached.',
      expectedObservation: 'Conical nozzle tip impression with dark debris.',
    },
  ]);

  memDb
    .prepare(
      `INSERT INTO repair_guides (
         id, slug, title, technology, difficulty, estimated_time,
         applicable_families_json, applicable_model_ids_json, requires_manual_bed_screws,
         symptoms_json, tools_needed_json, parts_needed_json, safety_warnings_json,
         service_boundary_note, model_specific_menu_notes_json, steps_json,
         verification_procedure, if_not_fixed_branches_json, last_verified_date, verification_status
       ) VALUES (
         'gd_cold_pull', 'cold-pull-and-hotend-nozzle-clog-clearing',
         'Cold Pull & Hotend Nozzle Clog Clearing', 'FDM', 'MODERATE', '20–30 minutes',
         '[]', '[]', 0, '[]', '[]', '[]', '[]',
         'Safe user maintenance', '[]', ?, 'Extrude 100mm cleanly in air.', '[]', '2026-03-01', 'VERIFIED'
       )`
    )
    .run(stepsJson);

  return memDb;
}

describe('Repair Guide Feedback & Ongoing Diagnostic Sessions', () => {
  let memDb: Database.Database;
  const baseDate = new Date('2026-04-01T12:00:00.000Z');

  beforeEach(() => {
    memDb = createSeededMemoryDb();
  });

  it('stores repair guide helpfulness rating, resolution outcome, printer model association, and step-specific clarity comments', () => {
    const fb1 = submitRepairGuideFeedback(
      {
        guideSlugOrId: 'cold-pull-and-hotend-nozzle-clog-clearing',
        printerModelIdOrSlug: 'bambu-lab-p1s',
        helpfulnessRating: 5,
        outcome: 'FIXED',
        generalComment: 'Cleared burnt PETG carbon speck on the second pull.',
        completedSteps: [1, 2, 3],
        stepComments: [
          {
            stepNumber: 2,
            issueType: 'INCORRECT_FOR_MODEL',
            comment: 'On P1S firmware, press extruder manual unload before cooling below 170°C.',
          },
        ],
      },
      null,
      memDb,
      baseDate
    );

    expect(fb1.guideId).toBe('gd_cold_pull');
    expect(fb1.printerModelId).toBe('mdl_bambu_p1s');
    expect(fb1.printerModelName).toBe('Bambu Lab P1S');
    expect(fb1.helpfulnessRating).toBe(5);
    expect(fb1.outcome).toBe('FIXED');
    expect(fb1.stepComments).toHaveLength(1);
    expect(fb1.stepComments[0].stepTitle).toContain('Cool to Pull Temp');

    // Second submission for another printer model
    submitRepairGuideFeedback(
      {
        guideSlugOrId: 'cold-pull-and-hotend-nozzle-clog-clearing',
        printerModelIdOrSlug: 'creality-ender-3-v2',
        helpfulnessRating: 3,
        outcome: 'PARTIALLY_FIXED',
        generalComment: 'Bowden tube gap also needed reseating.',
        stepComments: [
          {
            stepNumber: 2,
            issueType: 'UNCLEAR_INSTRUCTION',
            comment: 'Clarify whether Bowden coupler should be removed first.',
          },
        ],
      },
      null,
      memDb,
      baseDate
    );

    const overall = getRepairGuideFeedbackSummary(
      'cold-pull-and-hotend-nozzle-clog-clearing',
      null,
      memDb
    );
    expect(overall.totalCount).toBe(2);
    expect(overall.averageRating).toBe(4);
    expect(overall.fixedCount).toBe(1);
    expect(overall.partiallyFixedCount).toBe(1);
    expect(overall.flaggedStepCounts[2]).toBe(2);

    const p1sOnly = getRepairGuideFeedbackSummary(
      'cold-pull-and-hotend-nozzle-clog-clearing',
      'bambu-lab-p1s',
      memDb
    );
    expect(p1sOnly.totalCount).toBe(1);
    expect(p1sOnly.averageRating).toBe(5);
    expect(p1sOnly.items[0].printerModelName).toBe('Bambu Lab P1S');

    const adminAudit = getRecentGuideFeedbackForAdmin(memDb);
    expect(adminAudit.totalFeedbackCount).toBe(2);
    expect(adminAudit.flaggedStepCommentsCount).toBe(2);
  });

  it('rejects out-of-range ratings and non-existent step numbers in repair guide feedback', () => {
    expect(() =>
      submitRepairGuideFeedback(
        {
          guideSlugOrId: 'cold-pull-and-hotend-nozzle-clog-clearing',
          helpfulnessRating: 6,
          outcome: 'FIXED',
        },
        null,
        memDb,
        baseDate
      )
    ).toThrow(/between 1 and 5/i);

    expect(() =>
      submitRepairGuideFeedback(
        {
          guideSlugOrId: 'cold-pull-and-hotend-nozzle-clog-clearing',
          helpfulnessRating: 4,
          outcome: 'NOT_FIXED',
          stepComments: [{ stepNumber: 99, comment: 'Non-existent step' }],
        },
        null,
        memDb,
        baseDate
      )
    ).toThrow(/Invalid step number/i);
  });

  it('saves guest diagnostic sessions with cryptographic bookmark tokens and enforces 7-day expiration', () => {
    const saved = saveOrUpdateDiagnosticSession(
      {
        printerSlug: 'bambu-lab-p1s',
        materialCode: 'PETG',
        categoryId: 'cat_extrusion',
        answersByQuestionId: { q_ext_1: 'opt_clicking_yes' },
        symptomText: 'Extruder clicks 15 minutes into PETG print',
      },
      null,
      memDb,
      baseDate
    );

    expect(saved.resumeToken).toBeTruthy();
    expect(saved.session.ownershipMode).toBe('GUEST_BOOKMARK');
    expect(saved.session.printerModelName).toBe('Bambu Lab P1S');
    expect(saved.session.answersByQuestionId).toEqual({ q_ext_1: 'opt_clicking_yes' });

    // Loading without token or wrong token must be denied
    const missingTokenRes = loadDiagnosticSessionById(saved.session.id, null, null, memDb, baseDate);
    expect(missingTokenRes.status).toBe('INVALID_TOKEN');

    const wrongTokenRes = loadDiagnosticSessionById(
      saved.session.id,
      'wrong-token-value',
      null,
      memDb,
      baseDate
    );
    expect(wrongTokenRes.status).toBe('INVALID_TOKEN');

    // Loading with valid bookmark token within 7 days succeeds
    const validRes = loadDiagnosticSessionById(
      saved.session.id,
      saved.resumeToken,
      null,
      memDb,
      new Date(baseDate.getTime() + 3 * 24 * 60 * 60 * 1000)
    );
    expect(validRes.status).toBe('OK');
    if (validRes.status === 'OK') {
      expect(validRes.session.answersByQuestionId.q_ext_1).toBe('opt_clicking_yes');
    }

    // Loading after 8 days (> GUEST_BOOKMARK_TTL_DAYS) returns structured EXPIRED state
    const afterEightDays = new Date(
      baseDate.getTime() + (GUEST_BOOKMARK_TTL_DAYS + 1) * 24 * 60 * 60 * 1000
    );
    const expiredRes = loadDiagnosticSessionById(
      saved.session.id,
      saved.resumeToken,
      null,
      memDb,
      afterEightDays
    );
    expect(expiredRes.status).toBe('EXPIRED');
    if (expiredRes.status === 'EXPIRED') {
      expect(expiredRes.ownershipMode).toBe('GUEST_BOOKMARK');
    }
  });

  it('handles user authentication, owner-locked 90-day sessions, and guest-to-account session claiming', () => {
    // 1. Register user A and user B
    const regA = registerUserAccount(
      { email: 'TechA@Workshop.io', password: 'secure-password-123', displayName: 'Tech A' },
      memDb,
      baseDate
    );
    const regB = registerUserAccount(
      { email: 'techb@workshop.io', password: 'another-password-456', displayName: 'Tech B' },
      memDb,
      baseDate
    );

    expect(authenticateBearerToken(regA.token, memDb, baseDate)?.email).toBe('techa@workshop.io');

    // Verify login & logout
    const loginA = loginUserAccount(
      { email: 'techa@workshop.io', password: 'secure-password-123' },
      memDb,
      baseDate
    );
    expect(authenticateBearerToken(loginA.token, memDb, baseDate)?.id).toBe(regA.user.id);
    logoutBearerToken(loginA.token, memDb);
    expect(authenticateBearerToken(loginA.token, memDb, baseDate)).toBeNull();

    // 2. Guest creates bookmark first, then Tech A claims it into 90-day private account storage
    const guestSaved = saveOrUpdateDiagnosticSession(
      {
        printerSlug: 'creality-ender-3-v2',
        materialCode: 'PLA',
        categoryId: 'cat_extrusion',
        answersByQuestionId: { q1: 'opt_a' },
      },
      null,
      memDb,
      baseDate
    );

    const claimed = claimGuestDiagnosticSession(
      guestSaved.session.id,
      guestSaved.resumeToken!,
      regA.user,
      memDb,
      baseDate
    );
    expect(claimed.ownershipMode).toBe('AUTHENTICATED_USER');
    expect(claimed.userId).toBe(regA.user.id);

    // 3. Unauthenticated request now gets AUTH_REQUIRED; User B gets FORBIDDEN; User A gets OK even 30 days later
    expect(
      loadDiagnosticSessionById(claimed.id, null, null, memDb, baseDate).status
    ).toBe('AUTH_REQUIRED');

    expect(
      loadDiagnosticSessionById(claimed.id, null, regB.user, memDb, baseDate).status
    ).toBe('FORBIDDEN');

    const day30 = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const loadedDay30 = loadDiagnosticSessionById(claimed.id, null, regA.user, memDb, day30);
    expect(loadedDay30.status).toBe('OK');

    // Sliding 90-day TTL means 30 + 90 = day 120 from baseDate!
    // Accessing on day 100 (70 days after day 30 access) still succeeds because of sliding refresh:
    const day100 = new Date(baseDate.getTime() + 100 * 24 * 60 * 60 * 1000);
    expect(loadDiagnosticSessionById(claimed.id, null, regA.user, memDb, day100).status).toBe('OK');

    // Accessing 95 days after day 100 without intervening activity expires cleanly:
    const day195 = new Date(
      day100.getTime() + (AUTHENTICATED_SESSION_TTL_DAYS + 5) * 24 * 60 * 60 * 1000
    );
    // Note: day195 is only 5 days past expiration (< 30-day hard purge grace), so status is EXPIRED
    expect(loadDiagnosticSessionById(claimed.id, null, regA.user, memDb, day195).status).toBe(
      'EXPIRED'
    );

    // Listing active sessions for User A on day 100 returns 1 session; deleting removes it
    expect(listUserDiagnosticSessions(regA.user.id, memDb, day100).active).toHaveLength(1);
    expect(deleteDiagnosticSession(claimed.id, null, regA.user, memDb)).toBe(true);
    expect(listUserDiagnosticSessions(regA.user.id, memDb, day100).active).toHaveLength(0);
  });
});

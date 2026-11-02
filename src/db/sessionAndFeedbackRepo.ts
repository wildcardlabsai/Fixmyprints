import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './index.ts';
import type {
  GuideFeedbackSummaryDTO,
  GuideOutcomeStatus,
  PrinterTechnology,
  RepairGuideFeedbackDTO,
  RepairStepDTO,
  SavedDiagnosticSessionDTO,
  StepCommentItem,
  StepIssueType,
  UserAccountDTO,
} from '../types/domain.ts';

export const GUEST_BOOKMARK_TTL_DAYS = 7;
export const AUTHENTICATED_SESSION_TTL_DAYS = 90;
export const AUTH_TOKEN_TTL_DAYS = 30;
export const HARD_PURGE_GRACE_DAYS = 30;

function addDaysIso(fromDate: Date, days: number): string {
  return new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function safeCompareHex(hexA: string, hexB: string): boolean {
  if (!hexA || !hexB || hexA.length !== hexB.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(hexA, 'hex'), Buffer.from(hexB, 'hex'));
  } catch {
    return false;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return safeCompareHex(derived, expectedHex);
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ============================================================================
// 1. USER AUTHENTICATION & BEARER SESSIONS
// ============================================================================

export function registerUserAccount(
  input: { email: string; password: string; displayName?: string },
  rawDb: Database.Database = sqlite,
  now: Date = new Date()
): { user: UserAccountDTO; token: string; expiresAt: string } {
  const normalizedEmail = String(input.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Please provide a valid email address.');
  }
  if (!input.password || input.password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const existing = rawDb
    .prepare('SELECT id FROM user_accounts WHERE email = ?')
    .get(normalizedEmail) as { id: string } | undefined;
  if (existing) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }

  const displayName =
    (input.displayName || '').trim().slice(0, 60) || normalizedEmail.split('@')[0];

  try {
    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const createdAt = now.toISOString();
    const passwordHash = hashPassword(input.password);

    rawDb
      .prepare(
        `INSERT INTO user_accounts (id, email, display_name, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(userId, normalizedEmail, displayName, passwordHash, createdAt);

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = addDaysIso(now, AUTH_TOKEN_TTL_DAYS);

    rawDb
      .prepare(
        `INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(tokenHash, userId, expiresAt, createdAt);

    return {
      user: { id: userId, email: normalizedEmail, displayName, createdAt },
      token: rawToken,
      expiresAt,
    };
  } catch (error) {
    console.error('Database error in registerUserAccount:', error);
    throw new Error('Unable to create user account.', { cause: error });
  }
}

export function loginUserAccount(
  input: { email: string; password: string },
  rawDb: Database.Database = sqlite,
  now: Date = new Date()
): { user: UserAccountDTO; token: string; expiresAt: string } {
  const normalizedEmail = String(input.email || '').trim().toLowerCase();
  const row = rawDb
    .prepare(
      `SELECT id, email, display_name as displayName, password_hash as passwordHash, created_at as createdAt
       FROM user_accounts WHERE email = ?`
    )
    .get(normalizedEmail) as
    | { id: string; email: string; displayName: string; passwordHash: string; createdAt: string }
    | undefined;

  if (!row || !verifyPassword(String(input.password || ''), row.passwordHash)) {
    throw new Error('Invalid email or password.');
  }

  try {
    const nowIso = now.toISOString();
    rawDb.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(nowIso);

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = addDaysIso(now, AUTH_TOKEN_TTL_DAYS);

    rawDb
      .prepare(
        `INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(tokenHash, row.id, expiresAt, nowIso);

    return {
      user: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        createdAt: row.createdAt,
      },
      token: rawToken,
      expiresAt,
    };
  } catch (error) {
    console.error('Database error in loginUserAccount:', error);
    throw new Error('Unable to sign in right now.', { cause: error });
  }
}

export function authenticateBearerToken(
  rawToken: string | null | undefined,
  rawDb: Database.Database = sqlite,
  now: Date = new Date()
): UserAccountDTO | null {
  if (!rawToken || rawToken.length < 16) return null;
  try {
    const tokenHash = hashToken(rawToken);
    const row = rawDb
      .prepare(
        `SELECT s.expires_at as expiresAt, u.id, u.email, u.display_name as displayName, u.created_at as createdAt
         FROM auth_sessions s
         JOIN user_accounts u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(tokenHash) as
      | { expiresAt: string; id: string; email: string; displayName: string; createdAt: string }
      | undefined;

    if (!row) return null;
    if (row.expiresAt <= now.toISOString()) {
      rawDb.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      createdAt: row.createdAt,
    };
  } catch (error) {
    console.error('Database error in authenticateBearerToken:', error);
    return null;
  }
}

export function logoutBearerToken(rawToken: string | null | undefined, rawDb: Database.Database = sqlite): void {
  if (!rawToken) return;
  try {
    rawDb.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(rawToken));
  } catch (error) {
    console.error('Database error in logoutBearerToken:', error);
  }
}

// ============================================================================
// 2. SAVED DIAGNOSTIC SESSIONS (BOOKMARKING, EXPIRATION & OWNERSHIP)
// ============================================================================

interface RawSavedSessionRow {
  id: string;
  resume_token_hash: string;
  user_id: string | null;
  title: string;
  printer_slug: string | null;
  printer_model_id: string | null;
  printer_model_name?: string | null;
  use_generic_mode: number;
  generic_technology: string;
  material_code: string | null;
  category_id: string | null;
  category_title?: string | null;
  answers_by_question_id_json: string;
  symptom_text: string | null;
  status: string;
  expires_at: string;
  last_accessed_at: string;
  created_at: string;
  updated_at: string;
}

function mapSavedSessionRow(row: RawSavedSessionRow): SavedDiagnosticSessionDTO {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    printerSlug: row.printer_slug,
    printerModelId: row.printer_model_id,
    printerModelName: row.printer_model_name || null,
    useGenericMode: Boolean(row.use_generic_mode),
    genericTechnology: (row.generic_technology === 'RESIN' ? 'RESIN' : 'FDM') as PrinterTechnology,
    materialCode: row.material_code,
    categoryId: row.category_id,
    categoryTitle: row.category_title || null,
    answersByQuestionId: safeParseJson<Record<string, string>>(row.answers_by_question_id_json, {}),
    symptomText: row.symptom_text,
    status: (row.status as SavedDiagnosticSessionDTO['status']) || 'IN_PROGRESS',
    ownershipMode: row.user_id ? 'AUTHENTICATED_USER' : 'GUEST_BOOKMARK',
    expiresAt: row.expires_at,
    lastAccessedAt: row.last_accessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function purgeHardExpiredSessions(rawDb: Database.Database = sqlite, now: Date = new Date()): number {
  const purgeCutoff = addDaysIso(now, -HARD_PURGE_GRACE_DAYS);
  const res = rawDb
    .prepare('DELETE FROM saved_diagnostic_sessions WHERE expires_at < ?')
    .run(purgeCutoff);
  return res.changes;
}

export interface SaveDiagnosticSessionInput {
  sessionId?: string | null;
  resumeToken?: string | null;
  title?: string | null;
  printerSlug?: string | null;
  useGenericMode?: boolean;
  genericTechnology?: PrinterTechnology;
  materialCode?: string | null;
  categoryId?: string | null;
  answersByQuestionId?: Record<string, string>;
  symptomText?: string | null;
  status?: 'IN_PROGRESS' | 'RESULTS_READY' | 'RESOLVED';
}

export function saveOrUpdateDiagnosticSession(
  input: SaveDiagnosticSessionInput,
  currentUser: UserAccountDTO | null,
  rawDb: Database.Database = sqlite,
  now: Date = new Date()
): { session: SavedDiagnosticSessionDTO; resumeToken: string | null } {
  purgeHardExpiredSessions(rawDb, now);

  const nowIso = now.toISOString();
  const genericTech: PrinterTechnology = input.genericTechnology === 'RESIN' ? 'RESIN' : 'FDM';

  let resolvedPrinterId: string | null = null;
  let resolvedPrinterSlug: string | null = null;
  let resolvedPrinterName: string | null = null;

  if (input.printerSlug) {
    const pRow = rawDb
      .prepare('SELECT id, slug, name FROM printer_models WHERE slug = ? OR id = ?')
      .get(input.printerSlug, input.printerSlug) as { id: string; slug: string; name: string } | undefined;
    if (pRow) {
      resolvedPrinterId = pRow.id;
      resolvedPrinterSlug = pRow.slug;
      resolvedPrinterName = pRow.name;
    }
  }

  let resolvedCategoryTitle: string | null = null;
  if (input.categoryId) {
    const cRow = rawDb
      .prepare('SELECT id, title FROM diagnostic_categories WHERE id = ? OR slug = ?')
      .get(input.categoryId, input.categoryId) as { id: string; title: string } | undefined;
    if (cRow) {
      resolvedCategoryTitle = cRow.title;
    }
  }

  const autoTitle = [
    resolvedPrinterName || (input.useGenericMode ? `Generic ${genericTech}` : 'Unspecified Printer'),
    resolvedCategoryTitle || 'Ongoing Troubleshooting',
  ].join(' · ');

  const title = (input.title || '').trim().slice(0, 120) || autoTitle;
  const answersJson = JSON.stringify(input.answersByQuestionId || {});
  const status = input.status || 'IN_PROGRESS';
  const symptomText = input.symptomText ? String(input.symptomText).trim().slice(0, 600) : null;

  // Update existing session if sessionId provided
  if (input.sessionId) {
    const existing = rawDb
      .prepare('SELECT * FROM saved_diagnostic_sessions WHERE id = ?')
      .get(input.sessionId) as RawSavedSessionRow | undefined;

    if (!existing) {
      throw new Error('Saved diagnostic session not found.');
    }

    if (existing.expires_at <= nowIso) {
      throw new Error('Cannot update an expired diagnostic session. Save as a new session instead.');
    }

    if (existing.user_id) {
      if (!currentUser || currentUser.id !== existing.user_id) {
        throw new Error('Unauthorized: Only the session owner can update this saved session.');
      }
    } else {
      const candidateHash = input.resumeToken ? hashToken(input.resumeToken) : '';
      if (!safeCompareHex(candidateHash, existing.resume_token_hash)) {
        throw new Error('Unauthorized: Valid bookmark token required to update guest session.');
      }
    }

    // If guest session is updated while signed in, keep ownership as-is unless explicitly claimed, OR refresh TTL
    const ttlDays = existing.user_id ? AUTHENTICATED_SESSION_TTL_DAYS : GUEST_BOOKMARK_TTL_DAYS;
    const newExpiresAt = addDaysIso(now, ttlDays);

    rawDb
      .prepare(
        `UPDATE saved_diagnostic_sessions
         SET title = ?,
             printer_slug = ?,
             printer_model_id = ?,
             use_generic_mode = ?,
             generic_technology = ?,
             material_code = ?,
             category_id = ?,
             answers_by_question_id_json = ?,
             symptom_text = ?,
             status = ?,
             expires_at = ?,
             last_accessed_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        title,
        resolvedPrinterSlug,
        resolvedPrinterId,
        input.useGenericMode ? 1 : 0,
        genericTech,
        input.materialCode || null,
        input.categoryId || null,
        answersJson,
        symptomText,
        status,
        newExpiresAt,
        nowIso,
        nowIso,
        existing.id
      );

    const updated = rawDb
      .prepare(
        `SELECT s.*, pm.name as printer_model_name, dc.title as category_title
         FROM saved_diagnostic_sessions s
         LEFT JOIN printer_models pm ON pm.id = s.printer_model_id
         LEFT JOIN diagnostic_categories dc ON dc.id = s.category_id
         WHERE s.id = ?`
      )
      .get(existing.id) as RawSavedSessionRow;

    return {
      session: mapSavedSessionRow(updated),
      resumeToken: existing.user_id ? null : input.resumeToken || null,
    };
  }

  // Create new saved session
  try {
    const id = `ds_${crypto.randomBytes(8).toString('hex')}`;
    const rawResumeToken = crypto.randomBytes(24).toString('base64url');
    const resumeTokenHash = hashToken(rawResumeToken);
    const userId = currentUser?.id || null;
    const ttlDays = userId ? AUTHENTICATED_SESSION_TTL_DAYS : GUEST_BOOKMARK_TTL_DAYS;
    const expiresAt = addDaysIso(now, ttlDays);

    rawDb
      .prepare(
        `INSERT INTO saved_diagnostic_sessions (
          id, resume_token_hash, user_id, title, printer_slug, printer_model_id,
          use_generic_mode, generic_technology, material_code, category_id,
          answers_by_question_id_json, symptom_text, status, expires_at,
          last_accessed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        resumeTokenHash,
        userId,
        title,
        resolvedPrinterSlug,
        resolvedPrinterId,
        input.useGenericMode ? 1 : 0,
        genericTech,
        input.materialCode || null,
        input.categoryId || null,
        answersJson,
        symptomText,
        status,
        expiresAt,
        nowIso,
        nowIso,
        nowIso
      );

    const created = rawDb
      .prepare(
        `SELECT s.*, pm.name as printer_model_name, dc.title as category_title
         FROM saved_diagnostic_sessions s
         LEFT JOIN printer_models pm ON pm.id = s.printer_model_id
         LEFT JOIN diagnostic_categories dc ON dc.id = s.category_id
         WHERE s.id = ?`
      )
      .get(id) as RawSavedSessionRow;

    return {
      session: mapSavedSessionRow(created),
      resumeToken: userId ? null : rawResumeToken,
    };
  } catch (error) {
    console.error('Database error in saveOrUpdateDiagnosticSession:', error);
    throw new Error('Failed to save diagnostic session.', { cause: error });
  }
}

export type LoadSessionResult =
  | { status: 'OK'; session: SavedDiagnosticSessionDTO }
  | { status: 'NOT_FOUND' }
  | { status: 'EXPIRED'; expiredAt: string; ownershipMode: 'GUEST_BOOKMARK' | 'AUTHENTICATED_USER'; title: string }
  | { status: 'AUTH_REQUIRED'; title: string }
  | { status: 'FORBIDDEN' }
  | { status: 'INVALID_TOKEN' };

export function loadDiagnosticSessionById(
  sessionId: string,
  resumeToken: string | null | undefined,
  currentUser: UserAccountDTO | null,
  rawDb: Database.Database = sqlite,
  now: Date = new Date()
): LoadSessionResult {
  purgeHardExpiredSessions(rawDb, now);

  const row = rawDb
    .prepare(
      `SELECT s.*, pm.name as printer_model_name, dc.title as category_title
       FROM saved_diagnostic_sessions s
       LEFT JOIN printer_models pm ON pm.id = s.printer_model_id
       LEFT JOIN diagnostic_categories dc ON dc.id = s.category_id
       WHERE s.id = ?`
    )
    .get(sessionId) as RawSavedSessionRow | undefined;

  if (!row) {
    return { status: 'NOT_FOUND' };
  }

  const nowIso = now.toISOString();

  // Check authorization BEFORE revealing inner answers, though expiration status can be reported safely
  if (row.user_id) {
    if (!currentUser) {
      return { status: 'AUTH_REQUIRED', title: row.title };
    }
    if (currentUser.id !== row.user_id) {
      return { status: 'FORBIDDEN' };
    }
  } else {
    const candidateHash = resumeToken ? hashToken(resumeToken) : '';
    if (!safeCompareHex(candidateHash, row.resume_token_hash)) {
      return { status: 'INVALID_TOKEN' };
    }
  }

  if (row.expires_at <= nowIso) {
    return {
      status: 'EXPIRED',
      expiredAt: row.expires_at,
      ownershipMode: row.user_id ? 'AUTHENTICATED_USER' : 'GUEST_BOOKMARK',
      title: row.title,
    };
  }

  // Sliding TTL refresh for authenticated sessions, and last_accessed_at update for all active sessions
  const nextExpiresAt = row.user_id
    ? addDaysIso(now, AUTHENTICATED_SESSION_TTL_DAYS)
    : row.expires_at;

  rawDb
    .prepare('UPDATE saved_diagnostic_sessions SET last_accessed_at = ?, expires_at = ? WHERE id = ?')
    .run(nowIso, nextExpiresAt, row.id);

  row.last_accessed_at = nowIso;
  row.expires_at = nextExpiresAt;

  return { status: 'OK', session: mapSavedSessionRow(row) };
}

export function claimGuestDiagnosticSession(
  sessionId: string,
  resumeToken: string,
  currentUser: UserAccountDTO,
  rawDb: Database.Database = sqlite,
  now: Date = new Date()
): SavedDiagnosticSessionDTO {
  const row = rawDb
    .prepare('SELECT * FROM saved_diagnostic_sessions WHERE id = ?')
    .get(sessionId) as RawSavedSessionRow | undefined;

  if (!row) {
    throw new Error('Saved diagnostic session not found.');
  }
  const nowIso = now.toISOString();
  if (row.expires_at <= nowIso) {
    throw new Error('This guest bookmark has expired and can no longer be claimed.');
  }
  if (row.user_id && row.user_id !== currentUser.id) {
    throw new Error('This session is already owned by another account.');
  }
  if (!row.user_id) {
    const candidateHash = resumeToken ? hashToken(resumeToken) : '';
    if (!safeCompareHex(candidateHash, row.resume_token_hash)) {
      throw new Error('Valid bookmark token required to claim this guest session.');
    }
  }

  const extendedExpiresAt = addDaysIso(now, AUTHENTICATED_SESSION_TTL_DAYS);
  rawDb
    .prepare(
      `UPDATE saved_diagnostic_sessions
       SET user_id = ?, expires_at = ?, last_accessed_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(currentUser.id, extendedExpiresAt, nowIso, nowIso, sessionId);

  const updated = rawDb
    .prepare(
      `SELECT s.*, pm.name as printer_model_name, dc.title as category_title
       FROM saved_diagnostic_sessions s
       LEFT JOIN printer_models pm ON pm.id = s.printer_model_id
       LEFT JOIN diagnostic_categories dc ON dc.id = s.category_id
       WHERE s.id = ?`
    )
    .get(sessionId) as RawSavedSessionRow;

  return mapSavedSessionRow(updated);
}

export function listUserDiagnosticSessions(
  userId: string,
  rawDb: Database.Database = sqlite,
  now: Date = new Date()
): { active: SavedDiagnosticSessionDTO[]; expiredCount: number } {
  purgeHardExpiredSessions(rawDb, now);
  const nowIso = now.toISOString();

  const rows = rawDb
    .prepare(
      `SELECT s.*, pm.name as printer_model_name, dc.title as category_title
       FROM saved_diagnostic_sessions s
       LEFT JOIN printer_models pm ON pm.id = s.printer_model_id
       LEFT JOIN diagnostic_categories dc ON dc.id = s.category_id
       WHERE s.user_id = ?
       ORDER BY s.updated_at DESC`
    )
    .all(userId) as RawSavedSessionRow[];

  const active: SavedDiagnosticSessionDTO[] = [];
  let expiredCount = 0;

  for (const r of rows) {
    if (r.expires_at > nowIso) {
      active.push(mapSavedSessionRow(r));
    } else {
      expiredCount += 1;
    }
  }

  return { active, expiredCount };
}

export function deleteDiagnosticSession(
  sessionId: string,
  resumeToken: string | null | undefined,
  currentUser: UserAccountDTO | null,
  rawDb: Database.Database = sqlite
): boolean {
  const row = rawDb
    .prepare('SELECT id, user_id, resume_token_hash FROM saved_diagnostic_sessions WHERE id = ?')
    .get(sessionId) as { id: string; user_id: string | null; resume_token_hash: string } | undefined;

  if (!row) return false;

  if (row.user_id) {
    if (!currentUser || currentUser.id !== row.user_id) {
      throw new Error('Unauthorized to delete this saved session.');
    }
  } else {
    const candidateHash = resumeToken ? hashToken(resumeToken) : '';
    if (!safeCompareHex(candidateHash, row.resume_token_hash)) {
      throw new Error('Valid bookmark token required to delete this guest session.');
    }
  }

  rawDb.prepare('DELETE FROM saved_diagnostic_sessions WHERE id = ?').run(sessionId);
  return true;
}

// ============================================================================
// 3. REPAIR GUIDE FEEDBACK (RATING, OUTCOME & STEP-SPECIFIC COMMENTS)
// ============================================================================

const ALLOWED_ISSUE_TYPES = new Set<StepIssueType>([
  'UNCLEAR_INSTRUCTION',
  'INCORRECT_FOR_MODEL',
  'MISSING_TOOL_OR_WARNING',
  'OTHER',
]);

export interface SubmitGuideFeedbackInput {
  guideSlugOrId: string;
  printerModelIdOrSlug?: string | null;
  helpfulnessRating: number;
  outcome: GuideOutcomeStatus;
  generalComment?: string | null;
  stepComments?: {
    stepNumber: number;
    issueType?: StepIssueType;
    comment: string;
  }[];
  completedSteps?: number[];
}

export function submitRepairGuideFeedback(
  input: SubmitGuideFeedbackInput,
  currentUser: UserAccountDTO | null,
  rawDb: Database.Database = sqlite,
  now: Date = new Date()
): RepairGuideFeedbackDTO {
  const guideRow = rawDb
    .prepare('SELECT id, slug, title, steps_json FROM repair_guides WHERE slug = ? OR id = ?')
    .get(input.guideSlugOrId, input.guideSlugOrId) as
    | { id: string; slug: string; title: string; steps_json: string }
    | undefined;

  if (!guideRow) {
    throw new Error('Repair guide not found.');
  }

  const rating = Math.round(Number(input.helpfulnessRating));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Helpfulness rating must be between 1 and 5.');
  }

  const validOutcomes = new Set<GuideOutcomeStatus>(['FIXED', 'PARTIALLY_FIXED', 'NOT_FIXED']);
  if (!validOutcomes.has(input.outcome)) {
    throw new Error('Outcome must be FIXED, PARTIALLY_FIXED, or NOT_FIXED.');
  }

  let resolvedPrinterId: string | null = null;
  let resolvedPrinterName: string | null = null;
  if (input.printerModelIdOrSlug) {
    const pRow = rawDb
      .prepare('SELECT id, name FROM printer_models WHERE id = ? OR slug = ?')
      .get(input.printerModelIdOrSlug, input.printerModelIdOrSlug) as
      | { id: string; name: string }
      | undefined;
    if (!pRow) {
      throw new Error('Selected printer model does not exist in catalog.');
    }
    resolvedPrinterId = pRow.id;
    resolvedPrinterName = pRow.name;
  }

  const guideSteps = safeParseJson<RepairStepDTO[]>(guideRow.steps_json, []);
  const stepMap = new Map(guideSteps.map((s) => [s.stepNumber, s.title]));

  const sanitizedStepComments: StepCommentItem[] = [];
  for (const item of input.stepComments || []) {
    const stepNum = Number(item.stepNumber);
    const trimmed = String(item.comment || '').trim().slice(0, 500);
    if (!trimmed) continue;
    const stepTitle = stepMap.get(stepNum);
    if (!stepTitle) {
      throw new Error(`Invalid step number (${stepNum}) for guide "${guideRow.title}".`);
    }
    const issueType: StepIssueType =
      item.issueType && ALLOWED_ISSUE_TYPES.has(item.issueType) ? item.issueType : 'UNCLEAR_INSTRUCTION';
    sanitizedStepComments.push({
      stepNumber: stepNum,
      stepTitle,
      issueType,
      comment: trimmed,
    });
  }

  const sanitizedCompletedSteps = Array.from(
    new Set(
      (input.completedSteps || [])
        .map((n) => Number(n))
        .filter((n) => stepMap.has(n))
    )
  ).sort((a, b) => a - b);

  const generalComment = input.generalComment ? String(input.generalComment).trim().slice(0, 800) || null : null;

  try {
    const id = `gfb_${crypto.randomBytes(8).toString('hex')}`;
    const createdAt = now.toISOString();

    rawDb
      .prepare(
        `INSERT INTO repair_guide_feedback (
          id, guide_id, guide_slug, printer_model_id, user_id,
          helpfulness_rating, outcome, general_comment,
          step_comments_json, completed_steps_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        guideRow.id,
        guideRow.slug,
        resolvedPrinterId,
        currentUser?.id || null,
        rating,
        input.outcome,
        generalComment,
        JSON.stringify(sanitizedStepComments),
        JSON.stringify(sanitizedCompletedSteps),
        createdAt
      );

    // Also record in diagnostic_sessions outcome log so resolution telemetry stays unified
    rawDb
      .prepare(
        `INSERT INTO diagnostic_sessions (
          id, printer_model_id, category_id, material_code, answers_json,
          top_cause_code, guide_slug, outcome, feedback_notes, created_at
        ) VALUES (?, ?, NULL, NULL, '[]', NULL, ?, ?, ?, ?)`
      )
      .run(
        `sess_gfb_${crypto.randomBytes(6).toString('hex')}`,
        resolvedPrinterId,
        guideRow.slug,
        input.outcome === 'FIXED' ? 'RESOLVED' : 'NOT_RESOLVED',
        generalComment,
        createdAt
      );

    return {
      id,
      guideId: guideRow.id,
      guideSlug: guideRow.slug,
      guideTitle: guideRow.title,
      printerModelId: resolvedPrinterId,
      printerModelName: resolvedPrinterName,
      userId: currentUser?.id || null,
      authorDisplayName: currentUser?.displayName || null,
      helpfulnessRating: rating,
      outcome: input.outcome,
      generalComment,
      stepComments: sanitizedStepComments,
      completedSteps: sanitizedCompletedSteps,
      createdAt,
    };
  } catch (error) {
    console.error('Database error in submitRepairGuideFeedback:', error);
    throw new Error('Failed to save repair guide feedback.', { cause: error });
  }
}

interface RawFeedbackJoinRow {
  id: string;
  guide_id: string;
  guide_slug: string;
  guide_title: string;
  printer_model_id: string | null;
  printer_model_name: string | null;
  user_id: string | null;
  author_display_name: string | null;
  helpfulness_rating: number;
  outcome: GuideOutcomeStatus;
  general_comment: string | null;
  step_comments_json: string;
  completed_steps_json: string;
  created_at: string;
}

export function getRepairGuideFeedbackSummary(
  guideSlugOrId: string,
  printerModelIdOrSlug?: string | null,
  rawDb: Database.Database = sqlite
): GuideFeedbackSummaryDTO {
  const guideRow = rawDb
    .prepare('SELECT id, slug FROM repair_guides WHERE slug = ? OR id = ?')
    .get(guideSlugOrId, guideSlugOrId) as { id: string; slug: string } | undefined;

  if (!guideRow) {
    throw new Error('Repair guide not found.');
  }

  let printerFilterId: string | null = null;
  if (printerModelIdOrSlug) {
    const pRow = rawDb
      .prepare('SELECT id FROM printer_models WHERE id = ? OR slug = ?')
      .get(printerModelIdOrSlug, printerModelIdOrSlug) as { id: string } | undefined;
    if (pRow) printerFilterId = pRow.id;
  }

  const rows = (
    printerFilterId
      ? rawDb
          .prepare(
            `SELECT f.*, g.title as guide_title, pm.name as printer_model_name, u.display_name as author_display_name
             FROM repair_guide_feedback f
             JOIN repair_guides g ON g.id = f.guide_id
             LEFT JOIN printer_models pm ON pm.id = f.printer_model_id
             LEFT JOIN user_accounts u ON u.id = f.user_id
             WHERE f.guide_id = ? AND f.printer_model_id = ?
             ORDER BY f.created_at DESC`
          )
          .all(guideRow.id, printerFilterId)
      : rawDb
          .prepare(
            `SELECT f.*, g.title as guide_title, pm.name as printer_model_name, u.display_name as author_display_name
             FROM repair_guide_feedback f
             JOIN repair_guides g ON g.id = f.guide_id
             LEFT JOIN printer_models pm ON pm.id = f.printer_model_id
             LEFT JOIN user_accounts u ON u.id = f.user_id
             WHERE f.guide_id = ?
             ORDER BY f.created_at DESC`
          )
          .all(guideRow.id)
  ) as RawFeedbackJoinRow[];

  let ratingSum = 0;
  let fixedCount = 0;
  let partiallyFixedCount = 0;
  let notFixedCount = 0;
  const flaggedStepCounts: Record<number, number> = {};

  const items: RepairGuideFeedbackDTO[] = rows.map((r) => {
    ratingSum += r.helpfulness_rating;
    if (r.outcome === 'FIXED') fixedCount += 1;
    else if (r.outcome === 'PARTIALLY_FIXED') partiallyFixedCount += 1;
    else notFixedCount += 1;

    const stepComments = safeParseJson<StepCommentItem[]>(r.step_comments_json, []);
    for (const sc of stepComments) {
      flaggedStepCounts[sc.stepNumber] = (flaggedStepCounts[sc.stepNumber] || 0) + 1;
    }

    return {
      id: r.id,
      guideId: r.guide_id,
      guideSlug: r.guide_slug,
      guideTitle: r.guide_title,
      printerModelId: r.printer_model_id,
      printerModelName: r.printer_model_name,
      userId: r.user_id,
      authorDisplayName: r.author_display_name,
      helpfulnessRating: r.helpfulness_rating,
      outcome: r.outcome,
      generalComment: r.general_comment,
      stepComments,
      completedSteps: safeParseJson<number[]>(r.completed_steps_json, []),
      createdAt: r.created_at,
    };
  });

  const totalCount = items.length;
  const averageRating = totalCount > 0 ? Math.round((ratingSum / totalCount) * 10) / 10 : null;

  return {
    guideId: guideRow.id,
    guideSlug: guideRow.slug,
    totalCount,
    averageRating,
    fixedCount,
    partiallyFixedCount,
    notFixedCount,
    flaggedStepCounts,
    items: items.slice(0, 25),
  };
}

export function getRecentGuideFeedbackForAdmin(rawDb: Database.Database = sqlite): {
  totalFeedbackCount: number;
  flaggedStepCommentsCount: number;
  activeSavedSessionsCount: number;
  recentFeedback: RepairGuideFeedbackDTO[];
} {
  const nowIso = new Date().toISOString();
  const rows = rawDb
    .prepare(
      `SELECT f.*, g.title as guide_title, pm.name as printer_model_name, u.display_name as author_display_name
       FROM repair_guide_feedback f
       JOIN repair_guides g ON g.id = f.guide_id
       LEFT JOIN printer_models pm ON pm.id = f.printer_model_id
       LEFT JOIN user_accounts u ON u.id = f.user_id
       ORDER BY f.created_at DESC
       LIMIT 40`
    )
    .all() as RawFeedbackJoinRow[];

  const totalFeedbackCount = (
    rawDb.prepare('SELECT COUNT(*) as c FROM repair_guide_feedback').get() as { c: number }
  ).c;

  const activeSavedSessionsCount = (
    rawDb
      .prepare('SELECT COUNT(*) as c FROM saved_diagnostic_sessions WHERE expires_at > ?')
      .get(nowIso) as { c: number }
  ).c;

  let flaggedStepCommentsCount = 0;
  const allStepJsons = rawDb
    .prepare('SELECT step_comments_json FROM repair_guide_feedback')
    .all() as { step_comments_json: string }[];
  for (const r of allStepJsons) {
    flaggedStepCommentsCount += safeParseJson<StepCommentItem[]>(r.step_comments_json, []).length;
  }

  const recentFeedback: RepairGuideFeedbackDTO[] = rows.map((r) => ({
    id: r.id,
    guideId: r.guide_id,
    guideSlug: r.guide_slug,
    guideTitle: r.guide_title,
    printerModelId: r.printer_model_id,
    printerModelName: r.printer_model_name,
    userId: r.user_id,
    authorDisplayName: r.author_display_name,
    helpfulnessRating: r.helpfulness_rating,
    outcome: r.outcome,
    generalComment: r.general_comment,
    stepComments: safeParseJson<StepCommentItem[]>(r.step_comments_json, []),
    completedSteps: safeParseJson<number[]>(r.completed_steps_json, []),
    createdAt: r.created_at,
  }));

  return {
    totalFeedbackCount,
    flaggedStepCommentsCount,
    activeSavedSessionsCount,
    recentFeedback,
  };
}

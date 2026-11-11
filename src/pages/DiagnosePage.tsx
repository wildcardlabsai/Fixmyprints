import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  ExternalLink,
  Wrench,
  Bookmark,
  Copy,
  Check,
  Lock,
  Clock,
  ShieldCheck,
  Eye,
  Camera,
  Star,
  X,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useWorkshop } from '../context/WorkshopContext.tsx';
import { ResilientFaultVisual, TechnicalFaultDiagram } from '../components/FaultVisuals.tsx';
import { PrinterSilhouette, resolveHardwareArchetype } from '../components/PrinterSilhouette.tsx';
import { MobileHandoffQrPopover } from '../components/MobileHandoffQrPopover.tsx';
import { formatBedLevelingLabel } from '../components/Layout.tsx';
import {
  filterApplicableQuestions,
  evaluateDiagnosticCauses,
  canPrinterUseManualBedTramming,
} from '../engine/diagnosticEngine.ts';
import type { PrinterTechnology, SavedDiagnosticSessionDTO } from '../types/domain.ts';

interface PhotoTriageResult {
  mode: string;
  observationSummary: string;
  matchedFaults: { faultCode: string; confidenceLabel: string; reason: string }[];
  suggestedCategorySlug: string;
  suggestedOptionIds: string[];
  detectedErrorCode: string | null;
}

async function compressPhotoForTriage(file: File): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const srcUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format. Please upload a JPEG, PNG, or WebP photo.'));
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const fallbackBase64 = srcUrl.split(',')[1] || '';
          resolve({ base64: fallbackBase64, mimeType: file.type || 'image/jpeg', dataUrl: srcUrl });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.84);
        const base64 = compressedUrl.split(',')[1] || '';
        resolve({ base64, mimeType: 'image/jpeg', dataUrl: compressedUrl });
      };
      img.src = srcUrl;
    };
    reader.readAsDataURL(file);
  });
}

const ALL_25_FAULT_VISUALS: { code: string; label: string; tech: PrinterTechnology; summary: string; assetId?: string }[] = [
  { code: 'first_layer_not_sticking', label: 'First layer not sticking', tech: 'FDM', summary: 'Extruded plastic skates across the build surface without bonding.', assetId: 'img_fault_first_layer' },
  { code: 'corners_warping', label: 'Corners lifting and warping', tech: 'FDM', summary: 'Thermal contraction pulls sharp corners upward off the bed mid-print.' },
  { code: 'nozzle_too_high', label: 'Nozzle too high', tech: 'FDM', summary: 'Round spaghetti-like beads with zero squish between adjacent lines.', assetId: 'img_fault_first_layer' },
  { code: 'nozzle_too_low', label: 'Nozzle too low', tech: 'FDM', summary: 'Translucent scrape marks and sharp ploughed plastic ridges beside nozzle.' },
  { code: 'uneven_squish', label: 'Uneven first-layer squish', tech: 'FDM', summary: 'Fused lines on one side of the bed and loose/scraping lines on the other.' },
  { code: 'stringing', label: 'Stringing', tech: 'FDM', summary: 'Fine cobweb hairs stretched across open non-print travel spaces.', assetId: 'img_fault_stringing' },
  { code: 'blobs_and_zits', label: 'Blobs and zits', tech: 'FDM', summary: 'Raised pimples or heavy seam bumps along outer perimeters.', assetId: 'img_fault_stringing' },
  { code: 'under_extrusion', label: 'Under-extrusion', tech: 'FDM', summary: 'Spongy, porous walls and missing infill lines from starved flow.', assetId: 'img_fault_under_extrusion' },
  { code: 'over_extrusion', label: 'Over-extrusion', tech: 'FDM', summary: 'Swollen dimensions, bulging corners, and scarred top solid layers.' },
  { code: 'clogged_nozzle', label: 'Clogged nozzle', tech: 'FDM', summary: 'Complete or partial hotend orifice blockage halting filament exit.', assetId: 'img_fault_under_extrusion' },
  { code: 'filament_grinding', label: 'Filament grinding', tech: 'FDM', summary: 'Extruder gear chews a crescent divot into stationary filament.' },
  { code: 'heat_creep', label: 'Heat creep', tech: 'FDM', summary: 'Print starts cleanly then jams 20–60 minutes in as heat rises into cold end.' },
  { code: 'layer_shifting', label: 'Layer shifting', tech: 'FDM', summary: 'Upper layers step sideways abruptly along X or Y axis.', assetId: 'img_fault_layer_shift' },
  { code: 'ringing_ghosting', label: 'Ringing and ghosting', tech: 'FDM', summary: 'Repeating wavy ripples echoing around sharp corners or embossed text.' },
  { code: 'rough_surfaces', label: 'Rough surfaces', tech: 'FDM', summary: 'Chattered walls, pillowed tops, or scarred overhang undersides.' },
  { code: 'gaps_between_walls', label: 'Gaps between walls', tech: 'FDM', summary: 'Unbonded voids between inner/outer perimeters or infill starts.' },
  { code: 'poor_bridging', label: 'Poor bridging', tech: 'FDM', summary: 'Drooping loops across unsupported horizontal spans.' },
  { code: 'spaghetti_failure', label: 'Spaghetti failures', tech: 'FDM', summary: 'Detached model or mid-air extrusion creating tangled filament nests.', assetId: 'img_fault_first_layer' },
  { code: 'bed_mesh_probe_error', label: 'Bed mesh or probe errors', tech: 'FDM', summary: 'Load-cell, strain-gauge, eddy, or inductive probing aborts before print.' },
  { code: 'filament_loading_failure', label: 'Filament loading failures', tech: 'FDM', summary: 'Filament snags at sensor/extruder inlet or fails to grab gears.' },
  { code: 'multicolor_purge_problem', label: 'Multi-colour swaps & purge problems', tech: 'FDM', summary: 'AMS / MMU / CFS retraction overload or backed-up purge chute.' },
  { code: 'resin_adhesion_failure', label: 'Resin adhesion failures', tech: 'RESIN', summary: 'Empty build plate with flat cured silhouette stuck to vat release film.', assetId: 'img_fault_resin_delamination' },
  { code: 'resin_supports_failing', label: 'Resin supports failing', tech: 'RESIN', summary: 'Supports print on plate, but model rips free from support tips.', assetId: 'img_fault_resin_delamination' },
  { code: 'resin_layer_separation', label: 'Resin layer separation', tech: 'RESIN', summary: 'Horizontal delamination splits mid-model from suction or cold resin.', assetId: 'img_fault_resin_delamination' },
  { code: 'resin_screen_exposure', label: 'Resin screen or exposure problems', tech: 'RESIN', summary: 'Vertical laser holes, solid cured bricks, or soft over-exposed detail.' },
];

type WizardStep = 1 | 2 | 3 | 4;

type SessionHydrationBanner =
  | { type: 'LOADING' }
  | { type: 'EXPIRED'; title: string; expiredAt: string; ownershipMode: 'GUEST_BOOKMARK' | 'AUTHENTICATED_USER' }
  | { type: 'AUTH_REQUIRED'; title: string }
  | { type: 'ACCESS_ERROR'; message: string };

export const DiagnosePage: React.FC = () => {
  const { data, loading, getImageById } = useAppData();
  const {
    user,
    authLoading,
    guestBookmarks,
    accountSessions,
    openAuthModal,
    authFetch,
    saveGuestBookmarkLocally,
    removeGuestBookmarkLocally,
    refreshAccountSessions,
  } = useAuth();
  const { workshopPrinters, primaryPrinter, openWorkshopModal } = useWorkshop();
  const [searchParams, setSearchParams] = useSearchParams();
  const didAutoLoadWorkshopRef = useRef(false);

  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [printerFilterQuery, setPrinterFilterQuery] = useState('');
  const [selectedPrinterSlug, setSelectedPrinterSlug] = useState<string>('');
  const [useGenericMode, setUseGenericMode] = useState<boolean>(false);
  const [genericTechnology, setGenericTechnology] = useState<PrinterTechnology>('FDM');
  const [selectedMaterialCode, setSelectedMaterialCode] = useState<string>('PLA');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, string>>({});
  const [showVisualGallery, setShowVisualGallery] = useState(false);

  // Optional free-text symptom helper
  const [symptomText, setSymptomText] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [interpretNote, setInterpretNote] = useState<string | null>(null);

  // Optional Photo-Assisted Print Defect Triage state
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoResult, setPhotoResult] = useState<PhotoTriageResult | null>(null);

  // Outcome reporting state
  const [outcomeSubmitted, setOutcomeSubmitted] = useState<'RESOLVED' | 'NOT_RESOLVED' | null>(null);

  // Ongoing Diagnostic Session Persistence & Bookmarking State
  const [activeSavedSession, setActiveSavedSession] = useState<SavedDiagnosticSessionDTO | null>(null);
  const [activeResumeToken, setActiveResumeToken] = useState<string | null>(null);
  const [sessionTitleInput, setSessionTitleInput] = useState<string>('');
  const [sessionSaving, setSessionSaving] = useState<boolean>(false);
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null);
  const [sessionSaveFeedback, setSessionSaveFeedback] = useState<string | null>(null);
  const [copiedBookmark, setCopiedBookmark] = useState<boolean>(false);
  const [hydrationBanner, setHydrationBanner] = useState<SessionHydrationBanner | null>(null);
  const [claimingSession, setClaimingSession] = useState<boolean>(false);

  useEffect(() => {
    document.title = 'Diagnose a 3D Printing Problem – FixMyPrint';
  }, []);

  const sessionParamId = searchParams.get('session');
  const tokenParam = searchParams.get('token');

  // Sync direct URL query params (?printer=...&category=...&mode=generic) when not loading a saved session
  useEffect(() => {
    if (!data || sessionParamId) return;
    const pSlug = searchParams.get('printer');
    const cSlug = searchParams.get('category');
    const mode = searchParams.get('mode');

    let hasPrinter = false;
    let hasCategory = false;

    if (pSlug) {
      const found = data.models.find((m) => m.slug === pSlug || m.id === pSlug);
      if (found) {
        setSelectedPrinterSlug(found.slug);
        setUseGenericMode(false);
        hasPrinter = true;
        if (found.technology === 'RESIN') {
          setSelectedMaterialCode('RESIN_STD_ABS');
        }
      }
    } else if (mode === 'generic') {
      setUseGenericMode(true);
      setSelectedPrinterSlug('');
      hasPrinter = true;
    }

    if (cSlug) {
      const cat = data.diagnostics.categories.find((c) => c.slug === cSlug || c.id === cSlug);
      if (cat) {
        setSelectedCategoryId(cat.id);
        hasCategory = true;
        if (!pSlug && mode !== 'generic') {
          setUseGenericMode(true);
        }
        if (cat.technology === 'RESIN' && !pSlug) {
          setGenericTechnology('RESIN');
          setSelectedMaterialCode('RESIN_STD_ABS');
        }
      }
    }

    if (hasCategory) {
      setActiveStep(3);
    } else if (hasPrinter) {
      setActiveStep(2);
    } else if (!didAutoLoadWorkshopRef.current && primaryPrinter) {
      const wsModel = data.models.find((m) => m.slug === primaryPrinter.slug);
      if (wsModel) {
        didAutoLoadWorkshopRef.current = true;
        setSelectedPrinterSlug(wsModel.slug);
        setUseGenericMode(false);
        setSelectedMaterialCode(
          primaryPrinter.preferredMaterialCode ||
            (wsModel.technology === 'RESIN' ? 'RESIN_STD_ABS' : 'PLA')
        );
        setActiveStep(2);
      }
    }
  }, [data, searchParams, sessionParamId, primaryPrinter]);

  // Hydrate saved diagnostic session when ?session=<id> is present in URL
  useEffect(() => {
    if (!data || !sessionParamId || authLoading) return;
    if (activeSavedSession?.id === sessionParamId && hydrationBanner?.type !== 'AUTH_REQUIRED') {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setHydrationBanner({ type: 'LOADING' });
        setSessionSaveError(null);

        const fallbackLocalBookmark = guestBookmarks.find((b) => b.sessionId === sessionParamId);
        const effectiveToken = tokenParam || fallbackLocalBookmark?.resumeToken || null;

        const query = effectiveToken ? `?token=${encodeURIComponent(effectiveToken)}` : '';
        const res = await authFetch(
          `/api/diagnostic-sessions/${encodeURIComponent(sessionParamId)}${query}`
        );
        const json = await res.json();

        if (cancelled) return;

        if (res.ok && json.session) {
          const loaded: SavedDiagnosticSessionDTO = json.session;
          setActiveSavedSession(loaded);
          setActiveResumeToken(loaded.ownershipMode === 'GUEST_BOOKMARK' ? effectiveToken : null);
          setSessionTitleInput(loaded.title);
          setSelectedPrinterSlug(loaded.printerSlug || '');
          setUseGenericMode(Boolean(loaded.useGenericMode));
          setGenericTechnology(loaded.genericTechnology || 'FDM');
          setSelectedMaterialCode(
            loaded.materialCode || (loaded.genericTechnology === 'RESIN' ? 'RESIN_STD_ABS' : 'PLA')
          );
          setSelectedCategoryId(loaded.categoryId || '');
          setAnswersByQuestionId(loaded.answersByQuestionId || {});
          setSymptomText(loaded.symptomText || '');
          setOutcomeSubmitted(loaded.status === 'RESOLVED' ? 'RESOLVED' : null);
          setHydrationBanner(null);

          if (loaded.status === 'RESULTS_READY' || loaded.status === 'RESOLVED') {
            setActiveStep(4);
          } else if (loaded.categoryId) {
            setActiveStep(3);
          } else if (loaded.printerSlug || loaded.useGenericMode) {
            setActiveStep(2);
          } else {
            setActiveStep(1);
          }
          return;
        }

        if (res.status === 410 && json.code === 'SESSION_EXPIRED') {
          removeGuestBookmarkLocally(sessionParamId);
          setActiveSavedSession(null);
          setHydrationBanner({
            type: 'EXPIRED',
            title: json.title || 'Saved Diagnostic Session',
            expiredAt: json.expiredAt || '',
            ownershipMode: json.ownershipMode || 'GUEST_BOOKMARK',
          });
          return;
        }

        if (res.status === 401 && json.code === 'AUTH_REQUIRED') {
          setActiveSavedSession(null);
          setHydrationBanner({
            type: 'AUTH_REQUIRED',
            title: json.title || 'Account Diagnostic Session',
          });
          return;
        }

        setActiveSavedSession(null);
        setHydrationBanner({
          type: 'ACCESS_ERROR',
          message:
            json.error ||
            'Could not open this saved diagnostic session. Check that your bookmark URL is complete.',
        });
      } catch {
        if (!cancelled) {
          setHydrationBanner({
            type: 'ACCESS_ERROR',
            message: 'Network error while loading your saved diagnostic session.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    data,
    sessionParamId,
    tokenParam,
    user,
    authLoading,
    activeSavedSession?.id,
    hydrationBanner?.type,
    guestBookmarks,
    authFetch,
    removeGuestBookmarkLocally,
  ]);

  const selectedPrinter = useMemo(() => {
    if (!data || !selectedPrinterSlug) return null;
    return data.models.find((m) => m.slug === selectedPrinterSlug) || null;
  }, [data, selectedPrinterSlug]);

  const selectedCategory = useMemo(() => {
    if (!data || !selectedCategoryId) return null;
    return data.diagnostics.categories.find((c) => c.id === selectedCategoryId) || null;
  }, [data, selectedCategoryId]);

  const effectiveTech: PrinterTechnology = selectedPrinter ? selectedPrinter.technology : genericTechnology;

  const availableCategories = useMemo(() => {
    if (!data) return [];
    return data.diagnostics.categories.filter(
      (c) => c.technology === 'BOTH' || c.technology === effectiveTech
    );
  }, [data, effectiveTech]);

  const availableMaterials = useMemo(() => {
    if (!data) return [];
    return data.materials.filter((m) => m.technology === effectiveTech);
  }, [data, effectiveTech]);

  const selectedOptionIds = useMemo(() => Object.values(answersByQuestionId), [answersByQuestionId]);

  const applicableQuestions = useMemo(() => {
    if (!data || !selectedCategoryId) return [];
    return filterApplicableQuestions(data.diagnostics.questions, {
      printer: selectedPrinter,
      genericTechnology,
      categoryId: selectedCategoryId,
      materialCode: selectedMaterialCode,
      selectedOptionIds,
    });
  }, [data, selectedPrinter, genericTechnology, selectedCategoryId, selectedMaterialCode, selectedOptionIds]);

  const answeredApplicableCount = useMemo(
    () => applicableQuestions.filter((q) => Boolean(answersByQuestionId[q.id])).length,
    [applicableQuestions, answersByQuestionId]
  );

  const allQuestionsAnswered =
    applicableQuestions.length > 0 && answeredApplicableCount === applicableQuestions.length;

  const rankedCauses = useMemo(() => {
    if (!data || !selectedCategoryId || !allQuestionsAnswered) return [];
    return evaluateDiagnosticCauses(data.diagnostics.causes, data.diagnostics.questions, {
      printer: selectedPrinter,
      genericTechnology,
      categoryId: selectedCategoryId,
      materialCode: selectedMaterialCode,
      selectedOptionIds,
    });
  }, [data, selectedCategoryId, allQuestionsAnswered, selectedPrinter, genericTechnology, selectedMaterialCode, selectedOptionIds]);

  const filteredModelsForPicker = useMemo(() => {
    if (!data) return [];
    const q = printerFilterQuery
      .toLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!q) return data.models;
    return data.models.filter((m) => {
      const haystack = `${m.name} ${m.manufacturerName || ''} ${m.family}`
        .toLowerCase()
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ');
      return haystack.includes(q);
    });
  }, [data, printerFilterQuery]);

  const resumableBookmarkUrl = useMemo(() => {
    if (!activeSavedSession) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (activeSavedSession.ownershipMode === 'GUEST_BOOKMARK' && activeResumeToken) {
      return `${origin}/diagnose?session=${encodeURIComponent(activeSavedSession.id)}&token=${encodeURIComponent(activeResumeToken)}`;
    }
    return `${origin}/diagnose?session=${encodeURIComponent(activeSavedSession.id)}`;
  }, [activeSavedSession, activeResumeToken]);

  const handleSaveSession = useCallback(
    async (saveAsNew = false) => {
      try {
        setSessionSaving(true);
        setSessionSaveError(null);
        setSessionSaveFeedback(null);

        const computedStatus =
          outcomeSubmitted === 'RESOLVED'
            ? 'RESOLVED'
            : allQuestionsAnswered
            ? 'RESULTS_READY'
            : 'IN_PROGRESS';

        const res = await authFetch('/api/diagnostic-sessions/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: saveAsNew ? null : activeSavedSession?.id || null,
            resumeToken: saveAsNew ? null : activeResumeToken,
            title: sessionTitleInput.trim() || null,
            printerSlug: selectedPrinterSlug || null,
            useGenericMode,
            genericTechnology,
            materialCode: selectedMaterialCode,
            categoryId: selectedCategoryId || null,
            answersByQuestionId,
            symptomText: symptomText.trim() || null,
            status: computedStatus,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setSessionSaveError(json.error || 'Unable to save diagnostic session.');
          return;
        }

        const saved: SavedDiagnosticSessionDTO = json.session;
        const returnedToken: string | null = json.resumeToken || null;
        setActiveSavedSession(saved);
        setActiveResumeToken(returnedToken);
        setSessionTitleInput(saved.title);
        setHydrationBanner(null);

        if (saved.ownershipMode === 'GUEST_BOOKMARK' && returnedToken) {
          const bookmarkPath = `/diagnose?session=${encodeURIComponent(saved.id)}&token=${encodeURIComponent(returnedToken)}`;
          saveGuestBookmarkLocally({
            sessionId: saved.id,
            resumeToken: returnedToken,
            title: saved.title,
            bookmarkPath,
            expiresAt: saved.expiresAt,
            updatedAt: saved.updatedAt,
          });
          setSearchParams({ session: saved.id, token: returnedToken }, { replace: true });
          setSessionSaveFeedback(
            `Saved 7-day guest bookmark (expires ${saved.expiresAt.slice(0, 10)}).`
          );
        } else {
          await refreshAccountSessions();
          setSearchParams({ session: saved.id }, { replace: true });
          setSessionSaveFeedback(
            `Saved to account (90-day sliding expiry: ${saved.expiresAt.slice(0, 10)}).`
          );
        }
      } catch {
        setSessionSaveError('Network error while saving diagnostic session.');
      } finally {
        setSessionSaving(false);
      }
    },
    [
      outcomeSubmitted,
      allQuestionsAnswered,
      authFetch,
      activeSavedSession?.id,
      activeResumeToken,
      sessionTitleInput,
      selectedPrinterSlug,
      useGenericMode,
      genericTechnology,
      selectedMaterialCode,
      selectedCategoryId,
      answersByQuestionId,
      symptomText,
      saveGuestBookmarkLocally,
      setSearchParams,
      refreshAccountSessions,
    ]
  );

  async function handleClaimActiveGuestSession() {
    if (!activeSavedSession || !activeResumeToken || !user) return;
    try {
      setClaimingSession(true);
      setSessionSaveError(null);
      const res = await authFetch(
        `/api/diagnostic-sessions/${encodeURIComponent(activeSavedSession.id)}/claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeToken: activeResumeToken }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setSessionSaveError(json.error || 'Could not attach session to your account.');
        return;
      }
      removeGuestBookmarkLocally(activeSavedSession.id);
      setActiveSavedSession(json.session);
      setActiveResumeToken(null);
      setSearchParams({ session: json.session.id }, { replace: true });
      await refreshAccountSessions();
      setSessionSaveFeedback(
        `Locked to ${user.displayName} (90-day sliding expiry: ${json.session.expiresAt.slice(0, 10)}).`
      );
    } catch {
      setSessionSaveError('Network error while claiming guest session.');
    } finally {
      setClaimingSession(false);
    }
  }

  async function handleCopyBookmarkUrl() {
    if (!resumableBookmarkUrl) return;
    try {
      await navigator.clipboard?.writeText(resumableBookmarkUrl);
      setCopiedBookmark(true);
      setTimeout(() => setCopiedBookmark(false), 2500);
    } catch {
      setCopiedBookmark(false);
    }
  }

  function detachSessionAndStartFresh() {
    setActiveSavedSession(null);
    setActiveResumeToken(null);
    setSessionTitleInput('');
    setSessionSaveError(null);
    setSessionSaveFeedback(null);
    setHydrationBanner(null);
    setSelectedCategoryId('');
    setAnswersByQuestionId({});
    setOutcomeSubmitted(null);
    setInterpretNote(null);
    setActiveStep(1);
    setSearchParams({}, { replace: true });
  }

  async function handleInterpretSymptom(e: React.FormEvent) {
    e.preventDefault();
    if (!symptomText.trim() || !data) return;
    try {
      setInterpreting(true);
      setInterpretNote(null);
      let json: {
        suggestedCategorySlug?: string;
        suggestedOptionIds?: string[];
        clarifyingNote?: string;
      } | null = null;

      try {
        const res = await fetch('/api/symptom-interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: symptomText,
            printerSlug: selectedPrinter?.slug || null,
          }),
        });
        if (res.ok) {
          json = await res.json();
        }
      } catch {
        // Fall back to local keyword rule engine below
      }

      // If backend API is not running (e.g. static Vercel host), use deterministic keyword heuristics
      if (!json || !json.suggestedCategorySlug) {
        const lower = symptomText.toLowerCase();
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

        json = {
          suggestedCategorySlug: fallbackCategorySlug,
          suggestedOptionIds: [],
          clarifyingNote: 'Matched using FixMyPrint deterministic symptom rules. Select your exact visual fault pattern on the next step to confirm.',
        };
      }

      if (json.suggestedCategorySlug) {
        const matchedCat = data.diagnostics.categories.find((c) => c.slug === json.suggestedCategorySlug);
        if (matchedCat) {
          if (!selectedPrinter && matchedCat.technology === 'RESIN') {
            setUseGenericMode(true);
            setGenericTechnology('RESIN');
          } else if (!selectedPrinter && !useGenericMode) {
            setUseGenericMode(true);
          }
          setSelectedCategoryId(matchedCat.id);
          setActiveStep(3);
        }
      }
      if (Array.isArray(json.suggestedOptionIds) && json.suggestedOptionIds.length > 0) {
        const nextAnswers: Record<string, string> = {};
        for (const q of data.diagnostics.questions) {
          for (const opt of q.options) {
            if (json.suggestedOptionIds.includes(opt.id)) {
              nextAnswers[q.id] = opt.id;
            }
          }
        }
        setAnswersByQuestionId((prev) => ({ ...prev, ...nextAnswers }));
      }
      setInterpretNote(json.clarifyingNote || 'Mapped symptom to structured category.');
    } catch {
      setInterpretNote('Select a problem category below to continue with deterministic diagnostics.');
    } finally {
      setInterpreting(false);
    }
  }

  async function handleReportOutcome(outcome: 'RESOLVED' | 'NOT_RESOLVED', topCauseCode?: string, guideSlug?: string | null) {
    setOutcomeSubmitted(outcome);
    await fetch('/api/diagnostic-outcomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerModelId: selectedPrinter?.id || null,
        categoryId: selectedCategoryId,
        materialCode: selectedMaterialCode,
        answers: selectedOptionIds,
        topCauseCode: topCauseCode || null,
        guideSlug: guideSlug || null,
        outcome,
      }),
    }).catch(() => {});
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !data) return;

    setPhotoError(null);
    setPhotoResult(null);
    setPhotoAnalyzing(true);

    try {
      const { base64, mimeType, dataUrl } = await compressPhotoForTriage(file);
      setPhotoPreviewUrl(dataUrl);

      const res = await fetch('/api/photo-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          printerSlug: selectedPrinter?.slug || null,
          userNote: symptomText.trim() || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPhotoError(json.error || 'Could not analyze photo.');
        return;
      }
      setPhotoResult(json as PhotoTriageResult);
    } catch (err: unknown) {
      setPhotoError(
        err instanceof Error ? err.message : 'Unable to process image file. Select a category below.'
      );
    } finally {
      setPhotoAnalyzing(false);
    }
  }

  function applyPhotoTriageCategory(categorySlug: string, optionIds: string[] = []) {
    if (!data) return;
    const cat = data.diagnostics.categories.find((c) => c.slug === categorySlug);
    if (!cat) return;

    if (!selectedPrinter && !useGenericMode) {
      setUseGenericMode(true);
      if (cat.technology === 'RESIN') {
        setGenericTechnology('RESIN');
        setSelectedMaterialCode('RESIN_STD_ABS');
      }
    }

    setSelectedCategoryId(cat.id);
    const nextAnswers: Record<string, string> = {};
    if (optionIds.length > 0) {
      for (const q of data.diagnostics.questions) {
        const hit = q.options.find((o) => optionIds.includes(o.id));
        if (hit) nextAnswers[q.id] = hit.id;
      }
    }
    setAnswersByQuestionId(nextAnswers);
    setOutcomeSubmitted(null);
    setActiveStep(3);
  }

  function resetWizard() {
    setSelectedCategoryId('');
    setAnswersByQuestionId({});
    setOutcomeSubmitted(null);
    setInterpretNote(null);
    setPhotoResult(null);
    setPhotoPreviewUrl(null);
    setPhotoError(null);
    setSessionSaveFeedback(null);
    setActiveStep(selectedPrinter || useGenericMode ? 2 : 1);
  }

  if (loading || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-6">
        <div className="h-16 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 h-72 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="lg:col-span-8 h-96 bg-white rounded-xl border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  const printerReady = Boolean(selectedPrinter || useGenericMode);
  const manualTrammingPermitted = canPrinterUseManualBedTramming(selectedPrinter);
  const { label: archetypeLabel } = resolveHardwareArchetype(selectedPrinter, effectiveTech);
  const hasDiagnosticProgress = Boolean(
    selectedPrinter ||
      useGenericMode ||
      selectedCategoryId ||
      Object.keys(answersByQuestionId).length > 0 ||
      symptomText.trim() ||
      activeSavedSession
  );

  const nowIso = new Date().toISOString();
  const validGuestBookmarks = guestBookmarks.filter((b) => b.expiresAt > nowIso);

  const stepsMeta: {
    step: WizardStep;
    label: string;
    done: boolean;
    enabled: boolean;
    sublabel?: string;
  }[] = [
    {
      step: 1,
      label: 'Printer',
      done: printerReady,
      enabled: true,
      sublabel: selectedPrinter ? selectedPrinter.name : useGenericMode ? `Generic ${effectiveTech}` : undefined,
    },
    {
      step: 2,
      label: 'Problem',
      done: Boolean(selectedCategoryId),
      enabled: true,
      sublabel: selectedCategory ? selectedCategory.title : undefined,
    },
    {
      step: 3,
      label: 'Diagnose',
      done: allQuestionsAnswered,
      enabled: Boolean(selectedCategoryId),
      sublabel:
        selectedCategoryId && applicableQuestions.length > 0
          ? `${answeredApplicableCount}/${applicableQuestions.length}`
          : undefined,
    },
    {
      step: 4,
      label: 'Fix',
      done: Boolean(outcomeSubmitted === 'RESOLVED'),
      enabled: Boolean(selectedCategoryId && allQuestionsAnswered),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      {/* Top Bar: Title + 4-Step Horizontal Progress Stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-950">
              Diagnose a 3D Printing Problem
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowVisualGallery((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>{showVisualGallery ? 'Hide 25-Fault Atlas' : 'Compare 25 Fault Examples'}</span>
            </button>
            {(selectedCategoryId || Object.keys(answersByQuestionId).length > 0) && (
              <button
                type="button"
                onClick={resetWizard}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset checks
              </button>
            )}
          </div>
        </div>

        {/* 4-Step Progress Stepper (1. Printer -> 2. Problem -> 3. Diagnose -> 4. Fix) */}
        <nav aria-label="Diagnostic progress" className="pt-4 border-t border-slate-100">
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {stepsMeta.map((item) => {
              const isCurrent = activeStep === item.step;
              return (
                <li key={item.step}>
                  <button
                    type="button"
                    disabled={!item.enabled}
                    onClick={() => item.enabled && setActiveStep(item.step)}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors flex items-center gap-3 ${
                      isCurrent
                        ? 'border-blue-600 bg-blue-50/50'
                        : item.done
                        ? 'border-slate-200 bg-white hover:border-slate-400'
                        : item.enabled
                        ? 'border-slate-200 bg-slate-50/60 hover:bg-white'
                        : 'border-slate-100 bg-slate-50/40 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 tabular-nums ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : item.done
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.done && !isCurrent ? '✓' : item.step}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-950 truncate">{item.label}</p>
                      {item.sublabel && (
                        <p className="text-[11px] text-slate-500 truncate tabular-nums">{item.sublabel}</p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {/* Session Hydration Notices: Expired, Auth Required, or Invalid Token */}
      {hydrationBanner?.type === 'LOADING' && (
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 text-xs text-blue-900">
          Restoring your saved diagnostic session...
        </div>
      )}

      {hydrationBanner?.type === 'EXPIRED' && (
        <div className="p-5 rounded-xl border border-amber-300 bg-amber-50/90 space-y-3">
          <div className="flex items-start gap-2.5">
            <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-amber-950">
                Saved Diagnostic Session Expired: {hydrationBanner.title}
              </h2>
              <p className="text-xs text-amber-900 leading-relaxed">
                This {hydrationBanner.ownershipMode === 'GUEST_BOOKMARK' ? '7-day guest bookmark' : '90-day account session'}{' '}
                expired on <strong className="tabular-nums">{hydrationBanner.expiredAt.slice(0, 10)}</strong>.{' '}
                {hydrationBanner.ownershipMode === 'GUEST_BOOKMARK'
                  ? 'Guest bookmark links automatically expire after 7 days. Sign in before saving if you want 90-day sliding retention.'
                  : 'Account sessions expire after 90 days without activity.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pl-7">
            <button
              type="button"
              onClick={detachSessionAndStartFresh}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-700 rounded-lg hover:bg-amber-800"
            >
              Start Fresh Diagnostic Session
            </button>
            {!user && (
              <button
                type="button"
                onClick={() => openAuthModal('REGISTER')}
                className="px-3.5 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100"
              >
                Create Account for 90-Day Sessions
              </button>
            )}
          </div>
        </div>
      )}

      {hydrationBanner?.type === 'AUTH_REQUIRED' && (
        <div className="p-5 rounded-xl border border-blue-200 bg-blue-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Lock className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-950">
                Account Sign-In Required: {hydrationBanner.title}
              </h2>
              <p className="text-xs text-slate-700">
                This ongoing diagnostic session is privately locked to a FixMyPrint account. Sign in to resume your exact questions and printer settings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => openAuthModal('LOGIN')}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap"
            >
              Sign In to Resume
            </button>
            <button
              type="button"
              onClick={detachSessionAndStartFresh}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              New Session
            </button>
          </div>
        </div>
      )}

      {hydrationBanner?.type === 'ACCESS_ERROR' && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-red-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{hydrationBanner.message}</span>
          </p>
          <button
            type="button"
            onClick={detachSessionAndStartFresh}
            className="px-3 py-1.5 text-xs font-semibold text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 shrink-0"
          >
            Start Fresh Session
          </button>
        </div>
      )}

      {/* Collapsible 25-Fault Visual Reference Atlas */}
      {showVisualGallery && (
        <section className="border border-slate-200/90 rounded-2xl p-6 bg-white shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">25-Symptom Visual Reference Atlas</h2>
              <p className="text-xs text-slate-600">
                Compare photographs and cross-sectional diagrams across all 21 FDM and 4 MSLA resin fault signatures.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowVisualGallery(false)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-950"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-1">
            {ALL_25_FAULT_VISUALS.map((vf) => (
              <div key={vf.code} className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                <ResilientFaultVisual
                  asset={vf.assetId ? getImageById(vf.assetId) : null}
                  faultCode={vf.code}
                  preferDiagram={!vf.assetId}
                  className="w-full h-32"
                />
                <div className="p-3 space-y-1">
                  <p className="text-xs text-slate-500">{vf.tech}</p>
                  <p className="text-sm font-semibold text-slate-900">{vf.label}</p>
                  <p className="text-xs text-slate-600">{vf.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Two-Column Diagnostic Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT STICKY SIDEBAR: Active Printer Card, Material & Session Bookmarking */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-5 order-2 lg:order-1">
          {/* Active Hardware Profile Card */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-4">
            {selectedPrinter ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
                    <PrinterSilhouette model={selectedPrinter} className="w-12 h-12" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 truncate">{selectedPrinter.manufacturerName}</p>
                    <h2 className="text-base font-bold text-slate-950 truncate">{selectedPrinter.name}</h2>
                    <button
                      type="button"
                      onClick={() => setActiveStep(1)}
                      className="text-xs font-semibold text-blue-600 hover:underline mt-0.5"
                    >
                      Change printer
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-slate-100">
                  <p>
                    Architecture: <strong className="text-slate-900">{archetypeLabel}</strong>
                  </p>
                  <p>
                    Leveling: <strong className="text-slate-900">{formatBedLevelingLabel(selectedPrinter.bedLevelingCategory)}</strong>
                  </p>
                </div>

                {selectedPrinter.technology === 'FDM' && (
                  <p className="text-xs text-slate-700 bg-[#f6f9fc] border border-slate-200/80 rounded-lg p-2.5 leading-relaxed">
                    {manualTrammingPermitted
                      ? 'Manual corner bed wheels verified: 4-corner tramming checks enabled.'
                      : 'Automatic / rigid bed verified: manual bed-wheel instructions are automatically suppressed.'}
                  </p>
                )}

                <Link
                  to={`/printers/${selectedPrinter.slug}`}
                  className="inline-block text-xs font-semibold text-slate-600 hover:text-blue-600"
                >
                  Open full {selectedPrinter.name} spec sheet →
                </Link>
              </div>
            ) : useGenericMode ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 shrink-0">
                    <PrinterSilhouette technology={genericTechnology} className="w-11 h-11" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Generic Hardware Route</p>
                    <h2 className="text-base font-bold text-slate-950">
                      Unlisted {genericTechnology} Printer
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveStep(1)}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Select exact printer model
                    </button>
                  </div>
                </div>
                <div className="flex gap-1.5 p-1 bg-slate-100 rounded-lg">
                  {(['FDM', 'RESIN'] as PrinterTechnology[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setGenericTechnology(t);
                        setSelectedCategoryId('');
                        setAnswersByQuestionId({});
                        setSelectedMaterialCode(t === 'RESIN' ? 'RESIN_STD_ABS' : 'PLA');
                      }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        genericTechnology === t
                          ? 'bg-white text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t === 'FDM' ? 'FDM Filament' : 'MSLA Resin'}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500">Active Printer</p>
                <p className="text-sm font-bold text-slate-950">No printer selected yet</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Choose your printer in Step 1 so probe, bed-leveling, and extrusion checks adapt to your exact machine.
                </p>
              </div>
            )}

            {/* Loaded Material Selector */}
            <div className="pt-3 border-t border-slate-100">
              <label htmlFor="diag-material-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Loaded Material / Resin
              </label>
              <select
                id="diag-material-select"
                value={selectedMaterialCode}
                onChange={(e) => setSelectedMaterialCode(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {availableMaterials.map((mat) => (
                  <option key={mat.id} value={mat.code}>
                    {mat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Compact Save & Bookmark Ongoing Session Card */}
          {hasDiagnosticProgress && (
            <section
              aria-label="Save and bookmark diagnostic progress"
              className="p-5 rounded-xl border border-slate-200 bg-white space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-950 flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{activeSavedSession ? 'Saved Session' : 'Bookmark Progress'}</span>
                </h3>
                {activeSavedSession && (
                  <button
                    type="button"
                    onClick={detachSessionAndStartFresh}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-900"
                  >
                    New session
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {activeSavedSession
                  ? activeSavedSession.ownershipMode === 'AUTHENTICATED_USER'
                    ? `Locked to account · Expires ${activeSavedSession.expiresAt.slice(0, 10)}`
                    : `7-day guest bookmark · Expires ${activeSavedSession.expiresAt.slice(0, 10)}`
                  : user
                  ? `Saves privately to ${user.displayName} (90-day sliding retention).`
                  : 'Generate a 7-day resumable link, or sign in for 90-day account sync.'}
              </p>

              <input
                type="text"
                value={sessionTitleInput}
                onChange={(e) => setSessionTitleInput(e.target.value)}
                aria-label="Optional session bookmark label"
                placeholder="Optional label (e.g. P1S PETG check)..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />

              <button
                type="button"
                disabled={sessionSaving}
                onClick={() => handleSaveSession(false)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>
                  {sessionSaving
                    ? 'Saving...'
                    : activeSavedSession
                    ? 'Update Saved Session'
                    : 'Save & Bookmark Progress'}
                </span>
              </button>

              {activeSavedSession && resumableBookmarkUrl && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      id="session-bookmark-url"
                      type="text"
                      readOnly
                      aria-label="Resumable session URL"
                      value={resumableBookmarkUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={handleCopyBookmarkUrl}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shrink-0"
                    >
                      {copiedBookmark ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <MobileHandoffQrPopover
                      compact
                      url={resumableBookmarkUrl}
                      title={activeSavedSession.title || 'Saved Diagnostic Session'}
                      subtitle="Scan on your phone to resume this exact diagnostic session at your printer."
                      buttonLabel="QR"
                    />
                  </div>

                  {activeSavedSession.ownershipMode === 'GUEST_BOOKMARK' && (
                    user ? (
                      <button
                        type="button"
                        disabled={claimingSession}
                        onClick={handleClaimActiveGuestSession}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          {claimingSession ? 'Attaching...' : 'Attach to Account (90 Days)'}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAuthModal('REGISTER')}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50/70 border border-blue-200 rounded-md hover:bg-blue-100"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Sign in to Keep for 90 Days</span>
                      </button>
                    )
                  )}
                </div>
              )}

              {sessionSaveFeedback && (
                <p className="text-xs font-medium text-emerald-700 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{sessionSaveFeedback}</span>
                </p>
              )}

              {sessionSaveError && (
                <p className="text-xs font-medium text-red-700 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{sessionSaveError}</span>
                </p>
              )}
            </section>
          )}

          {/* Recent Saved Sessions Quick Resume Card */}
          {!activeSavedSession &&
            !hydrationBanner &&
            ((user && accountSessions.length > 0) || (!user && validGuestBookmarks.length > 0)) && (
              <div className="p-4 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-2.5 text-xs">
                <p className="font-bold text-slate-950 flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-blue-600" />
                  <span>Resume Recent Session</span>
                </p>
                <p className="text-slate-600 truncate">
                  {user ? accountSessions[0].title : validGuestBookmarks[0].title}
                </p>
                <div className="flex items-center gap-2">
                  <Link
                    to={
                      user
                        ? `/diagnose?session=${encodeURIComponent(accountSessions[0].id)}`
                        : validGuestBookmarks[0].bookmarkPath
                    }
                    className="flex-1 text-center px-3 py-1.5 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Resume
                  </Link>
                  <button
                    type="button"
                    onClick={() => openAuthModal('SESSIONS')}
                    className="px-3 py-1.5 font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    All ({user ? accountSessions.length : validGuestBookmarks.length})
                  </button>
                </div>
              </div>
            )}
        </aside>

        {/* RIGHT FOCUSED STEP WORKSPACE */}
        <div className="lg:col-span-8 space-y-6 order-1 lg:order-2">
          {/* STEP 1: SELECT YOUR PRINTER */}
          {activeStep === 1 && (
            <section className="p-6 sm:p-7 rounded-xl border border-slate-200 bg-white space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">Step 1 of 4</p>
                  <h2 className="text-xl font-bold text-slate-950 mt-0.5">Select Your Printer Model</h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Hardware-verified specs prevent wrong calibration instructions (such as advising manual bed wheels on load-cell machines).
                  </p>
                </div>
                {printerReady && (
                  <button
                    type="button"
                    onClick={() => setActiveStep(2)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shrink-0 self-start sm:self-auto"
                  >
                    <span>Continue to Problem</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 1-Click My Workshop Pinned Printers */}
              {workshopPrinters.length > 0 && (
                <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-950 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-blue-600" />
                      <span>My Workshop Printers</span>
                    </span>
                    <button
                      type="button"
                      onClick={openWorkshopModal}
                      className="text-blue-700 font-semibold hover:underline"
                    >
                      Manage
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {workshopPrinters.map((wp) => {
                      const wm = data.models.find((mod) => mod.slug === wp.slug);
                      if (!wm) return null;
                      const activeWs = selectedPrinterSlug === wm.slug && !useGenericMode;
                      return (
                        <button
                          key={wm.slug}
                          type="button"
                          onClick={() => {
                            setSelectedPrinterSlug(wm.slug);
                            setUseGenericMode(false);
                            setSelectedMaterialCode(
                              wp.preferredMaterialCode ||
                                (wm.technology === 'RESIN' ? 'RESIN_STD_ABS' : 'PLA')
                            );
                            setAnswersByQuestionId({});
                            setOutcomeSubmitted(null);
                            setActiveStep(selectedCategoryId ? 3 : 2);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                            activeWs
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-blue-200 bg-white text-slate-900 hover:border-blue-500'
                          }`}
                        >
                          <span>{wm.name}</span>
                          <span className={activeWs ? 'text-blue-100' : 'text-slate-500'}>
                            · {wp.preferredMaterialCode}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <input
                type="search"
                value={printerFilterQuery}
                onChange={(e) => setPrinterFilterQuery(e.target.value)}
                placeholder="Search by brand or model (e.g. Bambu A1, Ender 3, MK4S, Adventurer 5M, Saturn 4 Ultra)..."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                {filteredModelsForPicker.map((m) => {
                  const isSelected = selectedPrinterSlug === m.slug && !useGenericMode;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedPrinterSlug(m.slug);
                        setUseGenericMode(false);
                        setAnswersByQuestionId({});
                        setOutcomeSubmitted(null);
                        if (m.technology === 'RESIN') {
                          setSelectedMaterialCode('RESIN_STD_ABS');
                          if (selectedCategoryId && !selectedCategoryId.includes('resin')) {
                            setSelectedCategoryId('');
                          }
                        } else if (selectedMaterialCode.startsWith('RESIN')) {
                          setSelectedMaterialCode('PLA');
                          setSelectedCategoryId('');
                        }
                        setActiveStep(selectedCategoryId ? 3 : 2);
                      }}
                      className={`text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600'
                          : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-2xs'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950 truncate">{m.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {m.manufacturerName} · {m.technology} · {formatBedLevelingLabel(m.bedLevelingCategory)}
                        </p>
                      </div>
                      <PrinterSilhouette model={m} className="w-9 h-9 shrink-0" />
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setUseGenericMode(true);
                    setSelectedPrinterSlug('');
                    setAnswersByQuestionId({});
                    setActiveStep(2);
                  }}
                  className={`px-3.5 py-2 rounded-lg font-semibold border transition-colors ${
                    useGenericMode
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  My printer is not listed — Use Generic Diagnostic Mode
                </button>
                <Link to="/printers?request=1" className="text-slate-600 hover:text-slate-950 underline">
                  Request a missing printer model
                </Link>
              </div>
            </section>
          )}

          {/* STEP 2: SELECT PROBLEM CATEGORY, UPLOAD DEFECT PHOTO, OR DESCRIBE SYMPTOM */}
          {activeStep === 2 && (
            <section className="space-y-6">
              {/* Triage Helpers Grid: Plain-English Matcher + Photo Defect Upload */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Plain-English Symptom Matcher */}
                <form
                  onSubmit={handleInterpretSymptom}
                  className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <label htmlFor="symptom-free-text" className="block text-sm font-bold text-slate-950">
                      Describe the symptom
                    </label>
                    <p className="text-xs text-slate-500">
                      Maps your description to verified {effectiveTech} diagnostic categories.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="symptom-free-text"
                      type="text"
                      value={symptomText}
                      onChange={(e) => setSymptomText(e.target.value)}
                      placeholder="e.g. First layer skates or extruder clicks..."
                      className="flex-1 min-w-0 px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={interpreting || !symptomText.trim()}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {interpreting ? 'Matching...' : 'Match Text'}
                    </button>
                  </div>
                  {interpretNote && <p className="text-xs text-slate-700 font-medium">{interpretNote}</p>}
                </form>

                {/* Photo-Assisted Print Defect & Screen Error Triage */}
                <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 flex flex-col justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-950">
                      Upload defect or error-screen photo (optional)
                    </p>
                    <p className="text-xs text-slate-500">
                      Compares a print failure or LCD fault code against our verified catalog.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-[#f6f9fc] border border-dashed border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50/40 transition-colors">
                      <Camera className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>
                        {photoAnalyzing
                          ? 'Inspecting print photo...'
                          : photoPreviewUrl
                          ? 'Choose Another Photo'
                          : 'Upload Print or Screen Photo'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelected}
                        disabled={photoAnalyzing}
                        className="sr-only"
                      />
                    </label>
                    {photoPreviewUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoPreviewUrl(null);
                          setPhotoResult(null);
                          setPhotoError(null);
                        }}
                        aria-label="Clear uploaded photo"
                        className="p-2 text-slate-400 hover:text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {photoError && (
                    <p className="text-xs text-red-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{photoError}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Photo Triage Matched Faults Results Panel */}
              {photoResult && (
                <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/40 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      {photoPreviewUrl && (
                        <img
                          src={photoPreviewUrl}
                          alt="Uploaded print defect preview"
                          className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0 bg-white"
                        />
                      )}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-blue-700">
                          Visual Fault Triage · Bounded to Verified {effectiveTech} Catalog
                        </p>
                        <p className="text-xs text-slate-800 leading-relaxed">
                          {photoResult.observationSummary}
                        </p>
                        {photoResult.detectedErrorCode && (
                          <Link
                            to={`/reference?code=${encodeURIComponent(photoResult.detectedErrorCode)}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 underline pt-0.5"
                          >
                            Detected error code {photoResult.detectedErrorCode} — View official reference →
                          </Link>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        applyPhotoTriageCategory(
                          photoResult.suggestedCategorySlug,
                          photoResult.suggestedOptionIds
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shrink-0 self-start"
                    >
                      <span>Open Suggested Workflow</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {photoResult.matchedFaults.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {photoResult.matchedFaults.map((mf) => {
                        const meta = ALL_25_FAULT_VISUALS.find((v) => v.code === mf.faultCode);
                        return (
                          <div
                            key={mf.faultCode}
                            className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col"
                          >
                            <TechnicalFaultDiagram faultCode={mf.faultCode} className="w-full h-24 border-b border-slate-100" />
                            <div className="p-3 space-y-1 text-xs">
                              <p className="text-[11px] font-semibold text-blue-700">
                                {mf.confidenceLabel}
                              </p>
                              <p className="font-bold text-slate-950">
                                {meta ? meta.label : mf.faultCode}
                              </p>
                              <p className="text-slate-600 leading-snug">{mf.reason}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Visual Category Cards */}
              <div className="p-6 sm:p-7 rounded-xl border border-slate-200 bg-white space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Step 2 of 4</p>
                    <h2 className="text-xl font-bold text-slate-950 mt-0.5">Select Problem Category</h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Showing verified {effectiveTech} fault families for{' '}
                      <strong>{selectedPrinter ? selectedPrinter.name : `Generic ${effectiveTech}`}</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(1)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950 shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Printer
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {availableCategories.map((cat) => {
                    const active = selectedCategoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          if (!printerReady) setUseGenericMode(true);
                          setSelectedCategoryId(cat.id);
                          setAnswersByQuestionId({});
                          setOutcomeSubmitted(null);
                          setActiveStep(3);
                        }}
                        className={`text-left rounded-xl border overflow-hidden transition-all flex flex-col ${
                          active
                            ? 'border-blue-600 ring-1 ring-blue-600 bg-blue-50/30'
                            : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm'
                        }`}
                      >
                        <ResilientFaultVisual
                          asset={getImageById(cat.imageAssetId)}
                          faultCode={cat.visualFaultCode}
                          className="w-full h-36 border-b border-slate-100"
                        />
                        <div className="p-4 space-y-1">
                          <p className="text-xs text-slate-500">{cat.technology}</p>
                          <p className="text-sm font-bold text-slate-950">{cat.title}</p>
                          <p className="text-xs text-slate-600 leading-relaxed">{cat.shortDescription}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* STEP 3: ANSWER MODEL-AWARE VISUAL QUESTIONS */}
          {activeStep === 3 && selectedCategoryId && (
            <section className="space-y-5">
              <div className="p-5 sm:p-6 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Step 3 of 4 · {selectedCategory?.title}
                  </p>
                  <h2 className="text-xl font-bold text-slate-950 mt-0.5">
                    Compare Symptoms &amp; Answer Checks
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    <span className="tabular-nums font-semibold">
                      {answeredApplicableCount} of {applicableQuestions.length}
                    </span>{' '}
                    checks answered for{' '}
                    <strong>{selectedPrinter ? selectedPrinter.name : `Generic ${effectiveTech} Printer`}</strong>.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveStep(2)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Change Problem
                  </button>
                  {allQuestionsAnswered && (
                    <button
                      type="button"
                      onClick={() => setActiveStep(4)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      <span>See Diagnosis &amp; Fix</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                {applicableQuestions.map((question, qIndex) => {
                  const chosenOptId = answersByQuestionId[question.id];
                  return (
                    <div
                      key={question.id}
                      className="p-5 sm:p-6 border border-slate-200 rounded-xl bg-white space-y-4"
                    >
                      <div>
                        <p className="text-xs font-medium text-slate-500 tabular-nums">
                          Question {qIndex + 1} of {applicableQuestions.length}
                        </p>
                        <h3 className="text-base sm:text-lg font-bold text-slate-950 mt-0.5">
                          {question.prompt}
                        </h3>
                        <p className="text-xs text-slate-600 mt-1">{question.helpText}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {question.options.map((opt) => {
                          const selected = chosenOptId === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                const next = { ...answersByQuestionId, [question.id]: opt.id };
                                setAnswersByQuestionId(next);
                                setOutcomeSubmitted(null);
                              }}
                              className={`text-left rounded-xl border overflow-hidden transition-all flex flex-col ${
                                selected
                                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                                  : 'border-slate-200 bg-white hover:border-blue-400'
                              }`}
                            >
                              {opt.visualFaultCode && (
                                <div className="border-b border-slate-100">
                                  <TechnicalFaultDiagram faultCode={opt.visualFaultCode} className="w-full h-32" />
                                </div>
                              )}
                              <div className="p-4 space-y-1.5">
                                <p className="text-sm font-semibold text-slate-950">{opt.label}</p>
                                <p className="text-xs text-slate-600 leading-relaxed">{opt.explanation}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {allQuestionsAnswered && (
                <div className="p-5 rounded-2xl bg-blue-600 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div>
                    <p className="text-sm font-bold">All diagnostic checks answered</p>
                    <p className="text-xs text-blue-100">
                      Ready to rank plausible causes and open your step-by-step repair procedure.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(4)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-blue-950 bg-white rounded-lg hover:bg-blue-50 shrink-0"
                  >
                    <span>View Ranked Causes &amp; Fix</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </section>
          )}

          {/* STEP 4: RANKED DIAGNOSIS & RECOMMENDED FIX */}
          {activeStep === 4 && selectedCategoryId && allQuestionsAnswered && (
            <section className="space-y-5" aria-live="polite">
              <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">
                    Step 4 of 4 · Assessment Complete
                  </p>
                  <h2 className="text-2xl font-bold text-slate-950">
                    Most Likely Causes &amp; Recommended Fix
                  </h2>
                  <p className="text-xs text-slate-600">
                    {selectedCategory?.title} ·{' '}
                    <strong>{selectedPrinter ? selectedPrinter.name : `Generic ${effectiveTech}`}</strong> ·{' '}
                    <strong>{selectedMaterialCode}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveStep(3)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Edit Answers
                  </button>
                  {selectedPrinter?.officialSupportUrl && (
                    <a
                      href={selectedPrinter.officialSupportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                    >
                      <span>{selectedPrinter.manufacturerName} Docs</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {rankedCauses.length === 0 ? (
                <div className="p-6 border border-slate-200 rounded-2xl bg-white text-sm text-slate-700">
                  No high-confidence cause matched this combination. Try reviewing your answers in{' '}
                  <button
                    type="button"
                    onClick={() => setActiveStep(3)}
                    className="text-blue-600 font-semibold underline"
                  >
                    Step 3
                  </button>{' '}
                  or browse the{' '}
                  <Link to="/guides" className="text-blue-600 font-semibold underline">
                    Repair Guides directory
                  </Link>
                  .
                </div>
              ) : (
                <div className="space-y-5">
                  {rankedCauses.map((result, idx) => {
                    const linkedGuide = result.cause.recommendedGuideSlug
                      ? data.guides.find((g) => g.slug === result.cause.recommendedGuideSlug)
                      : null;

                    return (
                      <article
                        key={result.cause.id}
                        className={`p-6 rounded-xl border bg-white space-y-4 ${
                          idx === 0 ? 'border-slate-900' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-3">
                            <span
                              className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 tabular-nums ${
                                idx === 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-500">
                                Cause {idx + 1} ·{' '}
                                <span
                                  className={
                                    result.confidenceLabel === 'Strong match'
                                      ? 'text-emerald-700 font-bold'
                                      : result.confidenceLabel === 'Possible cause'
                                      ? 'text-blue-700 font-bold'
                                      : 'text-amber-700 font-bold'
                                  }
                                >
                                  {result.confidenceLabel}
                                </span>
                              </p>
                              <h3 className="text-xl font-bold text-slate-950 mt-0.5">{result.cause.title}</h3>
                            </div>
                          </div>
                        </div>

                        <p className="text-sm text-slate-700 leading-relaxed">{result.cause.plainExplanation}</p>

                        {result.modelSpecificNote && (
                          <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 text-xs text-slate-900">
                            <strong className="font-semibold text-blue-950">Model-Specific Hardware Check: </strong>
                            {result.modelSpecificNote}
                          </div>
                        )}

                        {result.matchedReasons.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-slate-700">Why this matches your answers:</p>
                            <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                              {result.matchedReasons.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-slate-900">
                            Quick verification checks to confirm:
                          </p>
                          <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                            {result.cause.distinguishingChecks.map((chk, i) => (
                              <li key={i}>{chk}</li>
                            ))}
                          </ul>
                        </div>

                        {result.cause.safetyNotes && (
                          <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <span>
                              <strong>Safety:</strong> {result.cause.safetyNotes}
                            </span>
                          </div>
                        )}

                        {linkedGuide && (
                          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                            <div className="text-xs text-slate-600">
                              Recommended fix: <strong className="text-slate-950">{linkedGuide.title}</strong>
                              {linkedGuide.estimatedTime ? ` (${linkedGuide.estimatedTime})` : ''}
                            </div>
                            <Link
                              to={`/guides/${linkedGuide.slug}${selectedPrinter ? `?printer=${selectedPrinter.slug}` : ''}`}
                              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              <span>Open Step-by-Step Repair Guide</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {/* Outcome Feedback Loop */}
                  <div className="p-5 border border-slate-200/90 rounded-2xl bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950">
                        Did these diagnostic checks identify or resolve your issue?
                      </h4>
                      <p className="text-xs text-slate-600">
                        Outcomes are recorded to audit rule effectiveness across printer models.
                      </p>
                    </div>
                    {outcomeSubmitted ? (
                      <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        {outcomeSubmitted === 'RESOLVED'
                          ? 'Recorded: Issue resolved. Happy printing!'
                          : 'Recorded: Try the secondary ranked cause above or open the Repair Guide branches.'}
                      </p>
                    ) : (
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleReportOutcome(
                              'RESOLVED',
                              rankedCauses[0]?.cause.code,
                              rankedCauses[0]?.cause.recommendedGuideSlug
                            )
                          }
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
                        >
                          Yes, fixed it
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleReportOutcome(
                              'NOT_RESOLVED',
                              rankedCauses[0]?.cause.code,
                              rankedCauses[0]?.cause.recommendedGuideSlug
                            )
                          }
                          className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                        >
                          Not yet — need next check
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

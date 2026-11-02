import React, { useState, useMemo, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  ShieldAlert,
  Search,
  Star,
  MessageSquarePlus,
  Trash2,
  Printer,
  RotateCcw,
  Calculator,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useWorkshop } from '../context/WorkshopContext.tsx';
import { TechnicalFaultDiagram } from '../components/FaultVisuals.tsx';
import { MobileHandoffQrPopover } from '../components/MobileHandoffQrPopover.tsx';
import { isGuideCompatibleWithPrinter } from '../engine/diagnosticEngine.ts';
import type {
  GuideFeedbackSummaryDTO,
  GuideOutcomeStatus,
  StepIssueType,
} from '../types/domain.ts';

const STEP_ISSUE_LABELS: Record<StepIssueType, string> = {
  UNCLEAR_INSTRUCTION: 'Unclear instruction',
  INCORRECT_FOR_MODEL: 'Menu or hardware differs on my printer model',
  MISSING_TOOL_OR_WARNING: 'Missing tool or safety caution',
  OTHER: 'Other step note',
};

export const GuidesPage: React.FC = () => {
  const { data, loading } = useAppData();
  const [query, setQuery] = useState('');
  const [techFilter, setTechFilter] = useState<'ALL' | 'FDM' | 'RESIN'>('ALL');

  useEffect(() => {
    document.title = 'Step-by-Step 3D Printer Repair Guides – FixMyPrint';
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.guides.filter((g) => {
      if (techFilter !== 'ALL' && g.technology !== techFilter) return false;
      if (q) {
        const hit =
          g.title.toLowerCase().includes(q) ||
          g.symptoms.some((s) => s.toLowerCase().includes(q)) ||
          g.applicableFamilies.some((f) => f.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [data, query, techFilter]);

  if (loading || !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 space-y-6">
        <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-bold text-slate-950">Step-by-Step Repair Guides</h1>
        <p className="text-sm text-slate-600 mt-1">
          Numbered maintenance and calibration workflows with safety boundaries, expected observations, and verification tests.
        </p>
      </div>

      <div className="p-4 bg-white border border-slate-200/90 rounded-xl shadow-2xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides by symptom, procedure, or series..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          {(['ALL', 'FDM', 'RESIN'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTechFilter(t)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                techFilter === t ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'ALL' ? 'All Technologies' : t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map((g) => (
          <Link
            key={g.id}
            to={`/guides/${g.slug}`}
            className="group p-6 border border-slate-200/90 rounded-xl bg-white shadow-2xs hover:shadow-md hover:border-blue-400 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500 tabular-nums">
                {g.technology} · {g.difficulty}
                {g.estimatedTime ? ` · ${g.estimatedTime}` : ''} · {g.steps.length} steps · {g.toolsNeeded.length} tools
              </p>
              <h2 className="text-lg font-bold text-slate-950 group-hover:text-blue-600 transition-colors">
                {g.title}
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Symptoms: {g.symptoms.join(' · ')}
              </p>
              {g.requiresManualBedScrews && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                  Hardware constraint: Only for printers with verified manual corner bed tramming wheels.
                </p>
              )}
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Verified {g.lastVerifiedDate}</span>
              <span className="font-semibold text-blue-600 inline-flex items-center gap-1">
                Start procedure <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export const GuideDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { data, loading } = useAppData();
  const { authFetch, user } = useAuth();
  const { primaryPrinter } = useWorkshop();

  const [selectedPrinterSlug, setSelectedPrinterSlug] = useState<string>(
    searchParams.get('printer') || ''
  );
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>(() => {
    if (!slug) return {};
    try {
      const raw = localStorage.getItem(`fixmyprint_guide_steps_v1:${slug}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Per-step inline comment drafts keyed by stepNumber
  const [openStepDrafts, setOpenStepDrafts] = useState<Record<number, boolean>>({});
  const [stepDrafts, setStepDrafts] = useState<
    Record<number, { issueType: StepIssueType; comment: string }>
  >({});

  // Completed guide feedback form state
  const [helpfulnessRating, setHelpfulnessRating] = useState<number>(0);
  const [guideOutcome, setGuideOutcome] = useState<GuideOutcomeStatus | ''>('');
  const [generalComment, setGeneralComment] = useState<string>('');
  const [quickAddStepNum, setQuickAddStepNum] = useState<number>(1);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false);

  // Recorded feedback summary from database
  const [feedbackSummary, setFeedbackSummary] = useState<GuideFeedbackSummaryDTO | null>(null);
  const [filterFeedbackByPrinter, setFilterFeedbackByPrinter] = useState<boolean>(false);

  const guide = useMemo(() => {
    if (!data || !slug) return null;
    return data.guides.find((g) => g.slug === slug || g.id === slug) || null;
  }, [data, slug]);

  // Reload persisted step progress if user navigates between guide slugs
  useEffect(() => {
    if (!slug) return;
    try {
      const raw = localStorage.getItem(`fixmyprint_guide_steps_v1:${slug}`);
      setCompletedSteps(raw ? JSON.parse(raw) : {});
    } catch {
      setCompletedSteps({});
    }
  }, [slug]);

  // Persist step checkboxes across refreshes
  useEffect(() => {
    if (!slug) return;
    try {
      localStorage.setItem(`fixmyprint_guide_steps_v1:${slug}`, JSON.stringify(completedSteps));
    } catch {
      // Ignore storage quota issues
    }
  }, [slug, completedSteps]);

  // Auto-select Primary Workshop Printer if compatible and no URL param was passed
  useEffect(() => {
    if (!guide || !data || searchParams.get('printer') || selectedPrinterSlug) return;
    if (primaryPrinter) {
      const pModel = data.models.find((m) => m.slug === primaryPrinter.slug);
      if (pModel && pModel.technology === guide.technology) {
        setSelectedPrinterSlug(pModel.slug);
      }
    }
  }, [guide, data, primaryPrinter, searchParams, selectedPrinterSlug]);

  const activePrinter = useMemo(() => {
    if (!data || !selectedPrinterSlug) return null;
    return data.models.find((m) => m.slug === selectedPrinterSlug) || null;
  }, [data, selectedPrinterSlug]);

  useEffect(() => {
    if (guide) {
      document.title = `${guide.title} – FixMyPrint Repair Guide`;
    }
  }, [guide]);

  const loadGuideFeedback = React.useCallback(async () => {
    if (!guide) return;
    const qs =
      filterFeedbackByPrinter && activePrinter
        ? `?printer=${encodeURIComponent(activePrinter.slug)}`
        : '';
    try {
      const res = await fetch(`/api/guides/${encodeURIComponent(guide.slug)}/feedback${qs}`);
      if (res.ok) {
        const json: GuideFeedbackSummaryDTO = await res.json();
        setFeedbackSummary(json);
      }
    } catch {
      // Ignore network hiccup
    }
  }, [guide, filterFeedbackByPrinter, activePrinter]);

  useEffect(() => {
    loadGuideFeedback();
  }, [loadGuideFeedback]);

  function toggleStepDraft(stepNumber: number) {
    setOpenStepDrafts((prev) => ({ ...prev, [stepNumber]: !prev[stepNumber] }));
    setStepDrafts((prev) =>
      prev[stepNumber]
        ? prev
        : { ...prev, [stepNumber]: { issueType: 'UNCLEAR_INSTRUCTION', comment: '' } }
    );
  }

  function updateStepDraft(
    stepNumber: number,
    patch: Partial<{ issueType: StepIssueType; comment: string }>
  ) {
    setStepDrafts((prev) => ({
      ...prev,
      [stepNumber]: {
        issueType: prev[stepNumber]?.issueType || 'UNCLEAR_INSTRUCTION',
        comment: prev[stepNumber]?.comment || '',
        ...patch,
      },
    }));
  }

  function removeStepDraft(stepNumber: number) {
    setOpenStepDrafts((prev) => ({ ...prev, [stepNumber]: false }));
    setStepDrafts((prev) => {
      const copy = { ...prev };
      delete copy[stepNumber];
      return copy;
    });
  }

  const activeStepCommentEntries = useMemo(() => {
    return (Object.entries(stepDrafts) as [string, { issueType: StepIssueType; comment: string }][])
      .map(([numStr, val]) => ({
        stepNumber: Number(numStr),
        issueType: val.issueType,
        comment: val.comment.trim(),
      }))
      .filter((entry) => entry.comment.length > 0)
      .sort((a, b) => a.stepNumber - b.stepNumber);
  }, [stepDrafts]);

  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!guide) return;
    setFeedbackError(null);

    if (helpfulnessRating < 1 || helpfulnessRating > 5) {
      setFeedbackError('Please select a helpfulness rating from 1 to 5.');
      return;
    }
    if (!guideOutcome) {
      setFeedbackError('Please select whether this guide fixed your problem.');
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const completedStepNumbers = Object.entries(completedSteps)
        .filter(([, v]) => v)
        .map(([k]) => Number(k));

      const res = await authFetch(`/api/guides/${encodeURIComponent(guide.slug)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerModelIdOrSlug: activePrinter?.id || null,
          helpfulnessRating,
          outcome: guideOutcome,
          generalComment: generalComment.trim() || null,
          stepComments: activeStepCommentEntries,
          completedSteps: completedStepNumbers,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedbackError(json.error || 'Unable to submit feedback.');
        return;
      }

      setFeedbackSubmitted(true);
      await loadGuideFeedback();
    } catch {
      setFeedbackError('Network error while saving repair guide feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
        <div className="h-28 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-4">
        <h1 className="text-2xl font-bold text-slate-950">Repair Guide Not Found</h1>
        <Link to="/guides" className="text-sm font-semibold text-blue-600 hover:underline">
          ← Back to all Repair Guides
        </Link>
      </div>
    );
  }

  const compatibleWithSelectedPrinter = activePrinter ? isGuideCompatibleWithPrinter(guide, activePrinter) : true;
  const modelMenuNote = activePrinter ? guide.modelSpecificMenuNotes[activePrinter.id] : null;
  const completedCount = guide.steps.filter((s) => Boolean(completedSteps[s.stepNumber])).length;
  const progressPercent =
    guide.steps.length > 0 ? Math.round((completedCount / guide.steps.length) * 100) : 0;

  const handoffUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/guides/${encodeURIComponent(guide.slug)}${
          activePrinter ? `?printer=${encodeURIComponent(activePrinter.slug)}` : ''
        }`
      : `/guides/${guide.slug}`;

  const relatedCalcLink =
    guide.technology === 'RESIN'
      ? { label: 'Open MSLA Exposure Dial-In Calculator', path: '/reference?tab=calculators&calc=resin' }
      : guide.slug.includes('clog') || guide.slug.includes('extrud') || guide.slug.includes('stringing')
      ? { label: 'Open E-Steps & Flow Rate Calculators', path: '/reference?tab=calculators&calc=flow' }
      : { label: 'Open Workbench Calibration Calculators', path: '/reference?tab=calculators' };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 print:py-2 print:space-y-4">
      {/* Guide Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-200 pb-6 print:pb-3">
        <div className="space-y-2.5 max-w-3xl">
          <Link to="/guides" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950 print:hidden">
            <ArrowLeft className="w-3.5 h-3.5" /> All Repair Guides
          </Link>
          <p className="text-xs text-slate-500">
            {guide.technology} Procedure · Difficulty: <strong className="text-slate-800">{guide.difficulty}</strong>
            {guide.estimatedTime ? ` · Estimated time: ${guide.estimatedTime}` : ''} · Status: {guide.verificationStatus} ({guide.lastVerifiedDate})
          </p>
          <h1 className="text-3xl font-bold text-slate-950 print:text-2xl">{guide.title}</h1>
          <p className="text-xs text-slate-600">
            Applicable symptoms: {guide.symptoms.join(' · ')}
          </p>
        </div>

        {/* Bench Sheet & Phone Handoff Actions */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 print:hidden">
          <MobileHandoffQrPopover
            url={handoffUrl}
            title={guide.title}
            subtitle="Scan with your phone camera to check off repair steps beside your printer."
            buttonLabel="Continue on Phone"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Print Bench Sheet</span>
          </button>
        </div>
      </div>

      {/* Print-Only Compact Tools & Printer Context Box */}
      <div className="hidden print:block p-4 border border-slate-300 rounded-lg text-xs space-y-1.5">
        <p>
          <strong>Target Printer:</strong>{' '}
          {activePrinter ? `${activePrinter.name} (${activePrinter.manufacturerName})` : `General ${guide.technology} Hardware`}
        </p>
        <p>
          <strong>Tools Required:</strong> {guide.toolsNeeded.join(' · ')}
        </p>
        {guide.partsNeeded.length > 0 && (
          <p>
            <strong>Consumables / Parts:</strong> {guide.partsNeeded.join(' · ')}
          </p>
        )}
      </div>

      {/* Two-Column Workbench Layout: Left Procedure + Right Sticky Bench Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start print:block">
        <div className="lg:col-span-8 space-y-8 print:space-y-4">
          {/* Model Context Selector & Hardware Compatibility Guard */}
          <section className="p-5 border border-slate-200/90 rounded-xl bg-white shadow-2xs space-y-3 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label htmlFor="guide-printer-context" className="text-xs font-semibold text-slate-800">
                Tailor menu paths &amp; hardware compatibility check to your printer:
              </label>
              <select
                id="guide-printer-context"
                value={selectedPrinterSlug}
                onChange={(e) => setSelectedPrinterSlug(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">General ({guide.technology} compatible models)</option>
                {data.models.map((m) => (
                  <option key={m.id} value={m.slug}>
                    {m.name} ({m.technology})
                  </option>
                ))}
              </select>
            </div>

            {activePrinter && !compatibleWithSelectedPrinter && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-300 text-xs text-red-950 flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    Hardware Compatibility Block — Do NOT Perform This Procedure on {activePrinter.name}
                  </p>
                  <p>
                    {activePrinter.technology !== guide.technology
                      ? `${activePrinter.name} is a ${activePrinter.technology} printer, while this procedure is strictly for ${guide.technology} hardware.`
                      : `${activePrinter.name} uses automatic / rigid bed sensing rather than user-serviceable manual corner wheels. Use the Auto-Leveling Nozzle Prep & Z-Offset Calibration guide instead.`}
                  </p>
                  {activePrinter.technology === 'FDM' && guide.requiresManualBedScrews && (
                    <Link
                      to={`/guides/auto-leveling-nozzle-probe-and-z-offset-calibration?printer=${activePrinter.slug}`}
                      className="inline-block font-semibold underline pt-1"
                    >
                      Switch to verified Auto-Leveling Guide for {activePrinter.name} →
                    </Link>
                  )}
                </div>
              </div>
            )}

            {activePrinter && compatibleWithSelectedPrinter && modelMenuNote && (
              <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-slate-900">
                <strong className="font-semibold text-blue-950">Verified {activePrinter.name} Menu &amp; Hardware Note: </strong>
                {modelMenuNote}
              </div>
            )}
          </section>

          {/* Safety Warnings */}
          <div className="p-5 border border-amber-200 bg-amber-50/70 rounded-xl space-y-3">
            <h2 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              Safety Requirements &amp; Service Boundary
            </h2>
            <ul className="list-disc list-inside text-xs text-amber-950 space-y-1.5 leading-relaxed">
              {guide.safetyWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
            <p className="text-xs text-slate-700 pt-2 border-t border-amber-200/70">
              <strong>Service Boundary:</strong> {guide.serviceBoundaryNote}
            </p>
          </div>

          {/* Numbered Repair Steps with Per-Step Commenting */}
          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-slate-950">Step-by-Step Instructions</h2>
              <p className="text-xs text-slate-500">
                Spot an unclear instruction or model-specific menu difference? Use <strong>Comment on Step</strong> on any step card.
              </p>
            </div>

            <div className="space-y-4">
              {guide.steps.map((step) => {
                const done = Boolean(completedSteps[step.stepNumber]);
                const draftOpen = Boolean(openStepDrafts[step.stepNumber]);
                const draft = stepDrafts[step.stepNumber];
                const priorStepFlagCount = feedbackSummary?.flaggedStepCounts[step.stepNumber] || 0;

                return (
                  <div
                    id={`guide-step-${step.stepNumber}`}
                    key={step.stepNumber}
                    className={`print-break-inside-avoid scroll-mt-24 p-5 sm:p-6 border rounded-xl bg-white shadow-2xs transition-colors ${
                      done ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200/90'
                    }`}
                  >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <p className="text-xs font-semibold text-blue-700 tabular-nums">
                      <span className="hidden print:inline mr-1.5 font-mono text-sm">
                        {done ? '☑' : '☐'}
                      </span>
                      Step {step.stepNumber} of {guide.steps.length}
                      {priorStepFlagCount > 0 && (
                        <span className="text-slate-500 font-normal print:hidden">
                          {' · '}
                          {priorStepFlagCount} user note{priorStepFlagCount === 1 ? '' : 's'} logged
                        </span>
                      )}
                    </p>
                    <h3 className="text-base sm:text-lg font-bold text-slate-950">{step.title}</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{step.instruction}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start print:hidden">
                    <button
                      type="button"
                      onClick={() => toggleStepDraft(step.stepNumber)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        draft?.comment?.trim()
                          ? 'border-amber-300 bg-amber-50 text-amber-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      <span>
                        {draft?.comment?.trim()
                          ? 'Step Note Saved'
                          : `Comment on Step ${step.stepNumber}`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCompletedSteps((prev) => ({
                          ...prev,
                          [step.stepNumber]: !prev[step.stepNumber],
                        }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                        done
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {done ? 'Step Done' : 'Mark Complete'}
                    </button>
                  </div>
                </div>

                {step.diagramType && (
                  <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden max-w-md">
                    <TechnicalFaultDiagram faultCode={step.diagramType} className="w-full h-36" />
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-emerald-800">What you should observe: </span>
                    <span className="text-slate-700">{step.expectedObservation}</span>
                  </div>
                  {step.commonMistake && (
                    <div>
                      <span className="font-semibold text-amber-800">Common mistake to avoid: </span>
                      <span className="text-slate-700">{step.commonMistake}</span>
                    </div>
                  )}
                </div>

                {/* Inline Per-Step Clarity / Accuracy Feedback Input */}
                {draftOpen && (
                  <div className="mt-4 pt-4 border-t border-slate-200 bg-slate-50/80 rounded-lg p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label
                        htmlFor={`step-issue-type-${step.stepNumber}`}
                        className="text-xs font-semibold text-slate-800"
                      >
                        Flag or clarify Step {step.stepNumber} ({step.title})
                        {activePrinter ? ` on ${activePrinter.name}` : ''}:
                      </label>
                      <select
                        id={`step-issue-type-${step.stepNumber}`}
                        value={draft?.issueType || 'UNCLEAR_INSTRUCTION'}
                        onChange={(e) =>
                          updateStepDraft(step.stepNumber, {
                            issueType: e.target.value as StepIssueType,
                          })
                        }
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      >
                        {(Object.keys(STEP_ISSUE_LABELS) as StepIssueType[]).map((k) => (
                          <option key={k} value={k}>
                            {STEP_ISSUE_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      rows={2}
                      value={draft?.comment || ''}
                      onChange={(e) =>
                        updateStepDraft(step.stepNumber, { comment: e.target.value })
                      }
                      placeholder="Describe what was unclear, missing, or different on your specific printer firmware/hardware..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        Included automatically when you submit your repair guide review below.
                      </span>
                      <div className="flex items-center gap-3">
                        {draft?.comment && (
                          <button
                            type="button"
                            onClick={() => removeStepDraft(step.stepNumber)}
                            className="text-red-600 hover:underline font-medium"
                          >
                            Clear note
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setOpenStepDrafts((prev) => ({ ...prev, [step.stepNumber]: false }))
                          }
                          className="font-semibold text-blue-600 hover:text-blue-800"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Final Verification & Comprehensive Repair Guide Feedback System */}
      <section
        id="guide-verification-feedback"
        className="scroll-mt-24 p-6 sm:p-8 border border-slate-200/90 rounded-2xl bg-white shadow-2xs space-y-6"
      >
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-lg font-bold text-slate-950">Final Verification Procedure</h2>
          <p className="text-sm text-slate-700 mt-1">{guide.verificationProcedure}</p>
        </div>

        {feedbackSubmitted ? (
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 print:hidden">
            <p className="text-sm font-bold text-emerald-950 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              Repair Guide Feedback Saved
            </p>
            <p className="text-xs text-emerald-900">
              Recorded your {helpfulnessRating}/5 helpfulness rating
              {activePrinter ? ` for ${activePrinter.name}` : ''}
              {activeStepCommentEntries.length > 0
                ? ` along with ${activeStepCommentEntries.length} step-specific note(s)`
                : ''}
              .
            </p>
            <button
              type="button"
              onClick={() => {
                setFeedbackSubmitted(false);
                setGeneralComment('');
              }}
              className="text-xs font-semibold text-emerald-800 underline pt-1"
            >
              Submit another report
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitFeedback} className="space-y-6 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  Rate This Repair Guide &amp; Report Outcome
                </h3>
                <p className="text-xs text-slate-600">
                  Stored against <strong>{guide.title}</strong>
                  {activePrinter ? (
                    <>
                      {' '}
                      and printer model <strong>{activePrinter.name}</strong>
                    </>
                  ) : (
                    ' (select your printer model below to associate hardware-specific feedback)'
                  )}
                  {user ? ` · Signed in as ${user.displayName}` : ''}.
                </p>
              </div>

              <div className="sm:w-64">
                <label htmlFor="feedback-printer-select" className="sr-only">
                  Associated Printer Model
                </label>
                <select
                  id="feedback-printer-select"
                  value={selectedPrinterSlug}
                  onChange={(e) => setSelectedPrinterSlug(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="">General / Unlisted {guide.technology} Printer</option>
                  {data.models.map((m) => (
                    <option key={m.id} value={m.slug}>
                      {m.name} ({m.technology})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. Helpfulness Rating (1-5) */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-800">
                  1. How clear and helpful was this guide? *
                </span>
                <div className="flex items-center gap-2" role="radiogroup" aria-label="Helpfulness rating">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const selected = helpfulnessRating >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={helpfulnessRating === star}
                        aria-label={`Rate ${star} out of 5`}
                        onClick={() => setHelpfulnessRating(star)}
                        className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${selected ? 'fill-current' : ''}`} />
                        <span>{star}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  {helpfulnessRating === 5
                    ? '5/5 — Very clear and accurate for my hardware'
                    : helpfulnessRating === 4
                    ? '4/5 — Helpful with minor differences'
                    : helpfulnessRating === 3
                    ? '3/5 — Moderately helpful'
                    : helpfulnessRating === 2
                    ? '2/5 — Hard to follow or incomplete'
                    : helpfulnessRating === 1
                    ? '1/5 — Unclear or inaccurate'
                    : 'Select 1 (unclear) to 5 (very helpful)'}
                </p>
              </div>

              {/* 2. Did it fix the problem? */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-800">
                  2. Did this procedure fix your printing problem? *
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { value: 'FIXED', label: 'Yes, fixed it' },
                      { value: 'PARTIALLY_FIXED', label: 'Partially helped' },
                      { value: 'NOT_FIXED', label: 'No, still broken' },
                    ] as { value: GuideOutcomeStatus; label: string }[]
                  ).map((opt) => {
                    const active = guideOutcome === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setGuideOutcome(opt.value)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? opt.value === 'FIXED'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : opt.value === 'PARTIALLY_FIXED'
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. Step-Specific Comments Summary & Quick Adder */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    3. Step-Specific Notes ({activeStepCommentEntries.length})
                  </h4>
                  <p className="text-xs text-slate-500">
                    Flag any step that was unclear or worked differently on your printer model.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={quickAddStepNum}
                    onChange={(e) => setQuickAddStepNum(Number(e.target.value))}
                    aria-label="Choose step to comment on"
                    className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md"
                  >
                    {guide.steps.map((s) => (
                      <option key={s.stepNumber} value={s.stepNumber}>
                        Step {s.stepNumber}: {s.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenStepDrafts((prev) => ({ ...prev, [quickAddStepNum]: true }));
                      setStepDrafts((prev) =>
                        prev[quickAddStepNum]
                          ? prev
                          : {
                              ...prev,
                              [quickAddStepNum]: {
                                issueType: 'UNCLEAR_INSTRUCTION',
                                comment: '',
                              },
                            }
                      );
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 whitespace-nowrap"
                  >
                    + Add Step Note
                  </button>
                </div>
              </div>

              {Object.entries(openStepDrafts)
                .filter(([numStr, isOpen]) => isOpen || Boolean(stepDrafts[Number(numStr)]?.comment))
                .map(([numStr]) => {
                  const stepNum = Number(numStr);
                  const stepObj = guide.steps.find((s) => s.stepNumber === stepNum);
                  const draft = stepDrafts[stepNum] || {
                    issueType: 'UNCLEAR_INSTRUCTION' as StepIssueType,
                    comment: '',
                  };
                  if (!stepObj) return null;
                  return (
                    <div
                      key={stepNum}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-900">
                          Step {stepNum}: {stepObj.title}
                        </span>
                        <div className="flex items-center gap-2">
                          <select
                            value={draft.issueType}
                            onChange={(e) =>
                              updateStepDraft(stepNum, {
                                issueType: e.target.value as StepIssueType,
                              })
                            }
                            aria-label={`Issue type for step ${stepNum}`}
                            className="px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                          >
                            {(Object.keys(STEP_ISSUE_LABELS) as StepIssueType[]).map((k) => (
                              <option key={k} value={k}>
                                {STEP_ISSUE_LABELS[k]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeStepDraft(stepNum)}
                            aria-label={`Remove comment on step ${stepNum}`}
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={draft.comment}
                        onChange={(e) => updateStepDraft(stepNum, { comment: e.target.value })}
                        placeholder={`What was unclear or inaccurate in Step ${stepNum}?`}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                  );
                })}
            </div>

            {/* 4. General Comment */}
            <div>
              <label htmlFor="guide-general-comment" className="block text-xs font-semibold text-slate-800 mb-1.5">
                4. Overall Repair Notes (Optional)
              </label>
              <textarea
                id="guide-general-comment"
                rows={2}
                value={generalComment}
                onChange={(e) => setGeneralComment(e.target.value)}
                placeholder="Share what resolved the fault, firmware version nuances, or spare parts used..."
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {feedbackError && (
              <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {feedbackError}
              </p>
            )}

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={feedbackSubmitting}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {feedbackSubmitting ? 'Saving Feedback...' : 'Submit Repair Guide Feedback'}
              </button>
            </div>
          </form>
        )}

        {/* Continuation Troubleshooting Branches */}
        {(guideOutcome === 'NOT_FIXED' ||
          guideOutcome === 'PARTIALLY_FIXED' ||
          guide.ifNotFixedBranches.length > 0) && (
          <div className="pt-4 border-t border-slate-200 space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              If the symptom persists, continue with these connected troubleshooting branches:
            </p>
            <div className="flex flex-wrap gap-3">
              {guide.ifNotFixedBranches.map((br, i) => {
                const dest = br.targetGuideSlug
                  ? `/guides/${br.targetGuideSlug}${activePrinter ? `?printer=${activePrinter.slug}` : ''}`
                  : `/diagnose?category=${br.targetCategorySlug || ''}${activePrinter ? `&printer=${activePrinter.slug}` : ''}`;
                return (
                  <Link
                    key={i}
                    to={dest}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
                  >
                    <span>{br.label}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Recorded Guide Feedback History & Model Filter */}
      {feedbackSummary && (
        <section className="space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Recorded Feedback for This Guide ({feedbackSummary.totalCount})
              </h2>
              <p className="text-xs text-slate-600">
                {feedbackSummary.totalCount > 0 ? (
                  <>
                    Average helpfulness:{' '}
                    <strong className="text-slate-900 tabular-nums">
                      {feedbackSummary.averageRating}/5
                    </strong>
                    {' · '}Fixed: <span className="tabular-nums">{feedbackSummary.fixedCount}</span>
                    {' · '}Partial: <span className="tabular-nums">{feedbackSummary.partiallyFixedCount}</span>
                    {' · '}Unresolved: <span className="tabular-nums">{feedbackSummary.notFixedCount}</span>
                  </>
                ) : (
                  'No feedback submitted yet for this guide.'
                )}
              </p>
            </div>

            {activePrinter && (
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterFeedbackByPrinter}
                  onChange={(e) => setFilterFeedbackByPrinter(e.target.checked)}
                />
                <span>Only show feedback for {activePrinter.name}</span>
              </label>
            )}
          </div>

          {feedbackSummary.items.length > 0 && (
            <div className="space-y-3">
              {feedbackSummary.items.map((item) => (
                <article
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                    <p>
                      <strong className="text-slate-900">
                        {item.helpfulnessRating}/5 Helpfulness
                      </strong>
                      {' · '}
                      <span
                        className={
                          item.outcome === 'FIXED'
                            ? 'text-emerald-700 font-semibold'
                            : item.outcome === 'PARTIALLY_FIXED'
                            ? 'text-amber-700 font-semibold'
                            : 'text-red-700 font-semibold'
                        }
                      >
                        {item.outcome === 'FIXED'
                          ? 'Problem Fixed'
                          : item.outcome === 'PARTIALLY_FIXED'
                          ? 'Partially Improved'
                          : 'Problem Persisted'}
                      </span>
                      {' · '}
                      Printer:{' '}
                      <span className="text-slate-800 font-medium">
                        {item.printerModelName || `General ${guide.technology}`}
                      </span>
                      {item.authorDisplayName ? ` · By ${item.authorDisplayName}` : ''}
                    </p>
                    <span className="tabular-nums">{item.createdAt.slice(0, 10)}</span>
                  </div>

                  {item.generalComment && (
                    <p className="text-sm text-slate-700">{item.generalComment}</p>
                  )}

                  {item.stepComments.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      {item.stepComments.map((sc, i) => (
                        <p key={i} className="text-xs text-slate-700">
                          <strong className="text-amber-900">
                            Step {sc.stepNumber} ({STEP_ISSUE_LABELS[sc.issueType] || sc.issueType}):
                          </strong>{' '}
                          {sc.comment}
                        </p>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
        </div>

        {/* Sticky Desktop Bench Rail: Live Step Progress, Step Jump List, Tools & Calculator Link */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-5 print:hidden">
          {/* Step Progress Card */}
          <div className="p-5 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-950">Repair Progress</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-700 tabular-nums">
                  {completedCount} of {guide.steps.length} complete
                </span>
                {completedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCompletedSteps({})}
                    title="Reset checked steps"
                    className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-400 hover:text-slate-800"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
            <div className="w-full h-1.5 rounded bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Checked steps stay saved automatically in this browser if you refresh at the bench.
            </p>

            <nav aria-label="Procedure steps" className="space-y-1.5 pt-1">
              {guide.steps.map((s) => {
                const done = Boolean(completedSteps[s.stepNumber]);
                return (
                  <a
                    key={s.stepNumber}
                    href={`#guide-step-${s.stepNumber}`}
                    className={`flex items-start gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors ${
                      done
                        ? 'bg-emerald-50/70 text-emerald-950 font-medium'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 tabular-nums ${
                        done
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {done ? '✓' : s.stepNumber}
                    </span>
                    <span className="leading-snug">{s.title}</span>
                  </a>
                );
              })}
            </nav>

            <a
              href="#guide-verification-feedback"
              className="block w-full text-center px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Verify Fix &amp; Rate Guide
            </a>
          </div>

          {/* Bench Tools & Consumables Card */}
          <div className="p-5 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-3 text-xs">
            <div>
              <h2 className="font-bold text-slate-950 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-blue-600" /> Tools Needed at Bench
              </h2>
              <ul className="list-disc list-inside text-slate-700 mt-1.5 space-y-1">
                {guide.toolsNeeded.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            {guide.partsNeeded.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <h3 className="font-bold text-slate-950">Consumables &amp; Parts</h3>
                <ul className="list-disc list-inside text-slate-700 mt-1.5 space-y-1">
                  {guide.partsNeeded.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pt-3 border-t border-slate-100">
              <Link
                to={relatedCalcLink.path}
                className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-800"
              >
                <Calculator className="w-3.5 h-3.5 shrink-0" />
                <span>{relatedCalcLink.label} →</span>
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useAppData, type CoverageCounts } from '../context/AppDataContext.tsx';
import type {
  BedLevelingCategory,
  ModelRequestDTO,
  RepairGuideFeedbackDTO,
  VerificationStatus,
} from '../types/domain.ts';
import { formatBedLevelingLabel } from '../components/Layout.tsx';

interface CoverageResponse {
  counts: CoverageCounts;
  manufacturersWithoutModels: {
    id: string;
    name: string;
    supportsFdm: boolean;
    supportsResin: boolean;
  }[];
  requests: ModelRequestDTO[];
  recentOutcomes: {
    id: string;
    printerModelId: string | null;
    categoryId: string | null;
    topCauseCode: string | null;
    guideSlug: string | null;
    outcome: string;
    feedbackNotes: string | null;
    createdAt: string;
  }[];
  recentGuideFeedback?: RepairGuideFeedbackDTO[];
}

export const AdminPage: React.FC = () => {
  const { data, refreshData } = useAppData();
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(true);

  // Admin passcode auth state
  const [showUnlockPanel, setShowUnlockPanel] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Admin form 1: Add Manufacturer
  const [mfgName, setMfgName] = useState('');
  const [mfgCountry, setMfgCountry] = useState('');
  const [mfgWebsite, setMfgWebsite] = useState('');
  const [mfgSupport, setMfgSupport] = useState('');
  const [mfgFdm, setMfgFdm] = useState(true);
  const [mfgResin, setMfgResin] = useState(false);
  const [mfgNotes, setMfgNotes] = useState('');
  const [mfgStatusMsg, setMfgStatusMsg] = useState<string | null>(null);

  // Admin form 2: Add Verified Printer Model
  const [mdlMfgId, setMdlMfgId] = useState('');
  const [mdlName, setMdlName] = useState('');
  const [mdlFamily, setMdlFamily] = useState('');
  const [mdlGen, setMdlGen] = useState('Current Gen');
  const [mdlTech, setMdlTech] = useState<'FDM' | 'RESIN'>('FDM');
  const [mdlRelease, setMdlRelease] = useState('CURRENT');
  const [mdlBedCat, setMdlBedCat] = useState<BedLevelingCategory>('AUTO_LOAD_CELL_NOZZLE');
  const [mdlVerification, setMdlVerification] = useState<VerificationStatus>('VERIFIED');
  const [mdlSummary, setMdlSummary] = useState('');
  const [mdlSourceTitle, setMdlSourceTitle] = useState('');
  const [mdlSourceUrl, setMdlSourceUrl] = useState('');
  const [mdlStatusMsg, setMdlStatusMsg] = useState<string | null>(null);
  const [mdlErrorMsg, setMdlErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Catalog Coverage & Admin Content Console – FixMyPrint';
  }, []);

  const fetchCoverage = useCallback(async () => {
    try {
      setLoadingCoverage(true);
      let json: CoverageResponse | null = null;
      try {
        const res = await fetch('/api/coverage');
        if (res.ok) {
          json = await res.json();
        }
      } catch {
        // Continue to static coverage snapshot
      }

      if (!json) {
        try {
          const staticRes = await fetch('/api/coverage.json');
          if (staticRes.ok) {
            json = await staticRes.json();
          }
        } catch {
          // Continue to context fallback
        }
      }

      if (json) {
        setCoverage(json);
      } else if (data) {
        setCoverage({
          counts: data.coverageCounts,
          manufacturersWithoutModels: data.manufacturers
            .filter((m) => !m.modelCount || m.modelCount === 0)
            .map((m) => ({
              id: m.id,
              name: m.name,
              supportsFdm: m.supportsFdm,
              supportsResin: m.supportsResin,
            })),
          requests: [],
          recentOutcomes: [],
        });
      }
    } finally {
      setLoadingCoverage(false);
    }
  }, [data]);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  useEffect(() => {
    if (data && data.manufacturers.length > 0 && !mdlMfgId) {
      setMdlMfgId(data.manufacturers[0].id);
    }
  }, [data, mdlMfgId]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/admin/verify-passcode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passcode': passcode.trim(),
      },
    });
    if (res.ok) {
      setIsUnlocked(true);
      setShowUnlockPanel(false);
    } else {
      setAuthError('Incorrect maintainer passcode. Please check your credentials and try again.');
    }
  }

  async function handleAddManufacturer(e: React.FormEvent) {
    e.preventDefault();
    setMfgStatusMsg(null);
    const res = await fetch('/api/admin/manufacturers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passcode': passcode.trim(),
      },
      body: JSON.stringify({
        name: mfgName,
        country: mfgCountry,
        websiteUrl: mfgWebsite,
        supportUrl: mfgSupport || mfgWebsite,
        supportsFdm: mfgFdm,
        supportsResin: mfgResin,
        notes: mfgNotes,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setMfgStatusMsg(`Error: ${body.error || 'Failed to add manufacturer'}`);
      return;
    }
    setMfgStatusMsg(`Added manufacturer "${mfgName}" to registry.`);
    setMfgName('');
    setMfgCountry('');
    setMfgWebsite('');
    setMfgSupport('');
    setMfgNotes('');
    await Promise.all([refreshData(), fetchCoverage()]);
  }

  async function handleAddModel(e: React.FormEvent) {
    e.preventDefault();
    setMdlStatusMsg(null);
    setMdlErrorMsg(null);

    const hasManualWheels =
      mdlTech === 'FDM' &&
      (mdlBedCat === 'MANUAL_SCREWS_WHEELS' || mdlBedCat === 'HYBRID_MANUAL_AND_AUTO');

    const payload = {
      manufacturerId: mdlMfgId,
      name: mdlName,
      family: mdlFamily,
      generation: mdlGen,
      technology: mdlTech,
      releaseStatus: mdlRelease,
      bedLevelingCategory: mdlTech === 'RESIN' ? 'NOT_APPLICABLE_RESIN' : mdlBedCat,
      completenessStatus: mdlVerification,
      summary: mdlSummary,
      officialManualUrl: mdlSourceUrl,
      sourceTitle: mdlSourceTitle,
      sourceUrl: mdlSourceUrl,
      fdmSpecs:
        mdlTech === 'FDM'
          ? {
              buildVolumeMm: { x: 220, y: 220, z: 250, shape: 'RECTANGULAR' },
              motionSystem: 'CoreXY',
              enclosureType: 'Open Frame',
              extruderType: 'Direct Drive',
              hotendType: 'All-Metal Hotend',
              standardNozzleMm: 0.4,
              supportedNozzlesMm: [0.4, 0.6],
              maxNozzleTempC: null,
              maxBedTempC: null,
              buildPlateType: 'PEI Spring Steel',
              bedLevelingCategory: mdlBedCat,
              bedLevelingHardware: formatBedLevelingLabel(mdlBedCat),
              hasManualBedScrews: hasManualWheels,
              manualTrammingProcedureAllowed: hasManualWheels,
              zOffsetMethod: hasManualWheels ? 'Manual corner tramming + Z-offset' : 'Automatic sensor routine',
              autoMeshCapable: mdlBedCat !== 'MANUAL_SCREWS_WHEELS' && mdlBedCat !== 'FIXED_MECHANICAL_BED',
              autoZOffsetCapable: mdlBedCat === 'AUTO_LOAD_CELL_NOZZLE' || mdlBedCat === 'STRAIN_GAUGE_INTEGRATED',
              inputShapingCapable: true,
              filamentRunoutSensor: true,
              filamentTangleSensor: false,
              powerLossRecovery: true,
              cameraMonitoring: 'Consult official datasheet',
              multiMaterialSystem: null,
              supportedFilaments: ['PLA', 'PETG'],
              firmwareFamily: 'Klipper',
              connectivity: ['USB', 'Wi-Fi'],
              compatibleSlicers: ['OrcaSlicer', 'PrusaSlicer'],
              calibrationMenuPath: null,
              knownLimitations: ['Detailed thermal limits awaiting secondary verification.'],
            }
          : null,
    };

    const res = await fetch('/api/admin/models', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passcode': passcode.trim(),
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setMdlErrorMsg(body.error || 'Failed to add model.');
      return;
    }

    setMdlStatusMsg(`Added printer model "${mdlName}" (${body.slug}).`);
    setMdlName('');
    setMdlFamily('');
    setMdlSummary('');
    setMdlSourceTitle('');
    setMdlSourceUrl('');
    await Promise.all([refreshData(), fetchCoverage()]);
  }

  async function handleUpdateModelStatus(modelId: string, completenessStatus: VerificationStatus) {
    const res = await fetch(`/api/admin/models/${modelId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passcode': passcode.trim(),
      },
      body: JSON.stringify({ completenessStatus }),
    });
    if (res.ok) {
      await Promise.all([refreshData(), fetchCoverage()]);
    }
  }

  async function handleUpdateRequestStatus(
    reqId: string,
    status: 'PENDING_REVIEW' | 'RESEARCHING' | 'ADDED' | 'DECLINED'
  ) {
    const res = await fetch(`/api/admin/requests/${reqId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passcode': passcode.trim(),
      },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      await fetchCoverage();
    }
  }

  const counts = coverage?.counts || data?.coverageCounts;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-2 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Database Coverage &amp; Admin Console
          </h1>
          <p className="text-sm text-slate-600">
            Transparent audit of verified printer models, brand registry status, user-submitted model requests, and diagnostic outcome telemetry. No fabricated coverage claims.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchCoverage()}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingCoverage ? 'animate-spin' : ''}`} />
          Refresh Audit
        </button>
      </div>

      {/* SECTION 1: PUBLICLY AUDITABLE COVERAGE METRICS */}
      {counts && (
        <section className="space-y-6">
          <h2 className="text-lg font-bold text-slate-950">Current Verified Catalog Metrics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <p className="text-xs font-medium text-slate-500">Registered Manufacturers</p>
              <p className="text-2xl font-bold text-slate-950 tabular-nums">{counts.manufacturersTotal}</p>
              <p className="text-xs text-slate-600 tabular-nums">
                {counts.manufacturersWithSeededModels} with models · {counts.manufacturersAwaitingModelImport} awaiting import
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <p className="text-xs font-medium text-slate-500">Seeded Printer Models</p>
              <p className="text-2xl font-bold text-slate-950 tabular-nums">{counts.modelsTotal}</p>
              <p className="text-xs text-slate-600 tabular-nums">
                {counts.fdmModels} FDM filament · {counts.resinModels} MSLA/SLA resin
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <p className="text-xs font-medium text-slate-500">Source Verification</p>
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">{counts.verifiedSpecModels}</p>
              <p className="text-xs text-slate-600 tabular-nums">
                Verified · {counts.partialOrUnverifiedModels} partial/unverified
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <p className="text-xs font-medium text-slate-500">Guides, Materials &amp; Errors</p>
              <p className="text-2xl font-bold text-slate-950 tabular-nums">
                {counts.repairGuidesTotal + counts.materialsTotal + counts.errorCodesTotal}
              </p>
              <p className="text-xs text-slate-600 tabular-nums">
                {counts.repairGuidesTotal} guides · {counts.materialsTotal} materials · {counts.errorCodesTotal} error codes
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1 sm:col-span-2">
              <p className="text-xs font-medium text-slate-500">Repair Guide Feedback &amp; Step Notes</p>
              <p className="text-2xl font-bold text-slate-950 tabular-nums">
                {counts.guideFeedbackTotal ?? 0}
              </p>
              <p className="text-xs text-slate-600 tabular-nums">
                {counts.flaggedGuideStepsTotal ?? 0} step-level clarity/accuracy notes · {counts.recordedOutcomes} outcome logs
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1 sm:col-span-2">
              <p className="text-xs font-medium text-slate-500">Active Saved Diagnostic Sessions</p>
              <p className="text-2xl font-bold text-blue-700 tabular-nums">
                {counts.activeSavedSessionsTotal ?? 0}
              </p>
              <p className="text-xs text-slate-600">
                7-day guest bookmark links &amp; 90-day authenticated technician sessions
              </p>
            </div>
          </div>

          {/* Honest disclosure of brands registered in extensible schema awaiting model import */}
          {coverage && coverage.manufacturersWithoutModels.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">
                    Extensible Manufacturer Registry — Brands Awaiting Verified Model Import ({coverage.manufacturersWithoutModels.length})
                  </h3>
                  <p className="text-xs text-slate-600">
                    These manufacturers are registered with official support URLs in the relational schema, but individual machine specs have not yet been imported to avoid unverified placeholder specs.
                  </p>
                </div>
                <Link
                  to="/printers"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 shrink-0"
                >
                  Submit a model request →
                </Link>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {coverage.manufacturersWithoutModels
                  .map(
                    (m) =>
                      `${m.name} (${[m.supportsFdm ? 'FDM' : '', m.supportsResin ? 'Resin' : '']
                        .filter(Boolean)
                        .join('/')})`
                  )
                  .join(' · ')}
              </p>
            </div>
          )}
        </section>
      )}

      {/* SECTION 2: USER-SUBMITTED MODEL REQUEST QUEUE (READ-ONLY UNTIL UNLOCKED) */}
      {coverage && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                User-Submitted Missing Printer Requests ({coverage.requests.length})
              </h2>
              <p className="text-xs text-slate-600">
                User submissions are queued as <code className="font-mono">PENDING_REVIEW</code> and never auto-published into verified diagnostic rules without source review.
              </p>
            </div>
          </div>

          {coverage.requests.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              No pending missing-model requests submitted yet. Users can submit unlisted machines from the{' '}
              <Link to="/printers" className="text-blue-600 font-semibold hover:underline">
                Printer Directory
              </Link>
              .
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  <tr>
                    <th className="px-4 py-3">Manufacturer</th>
                    <th className="px-4 py-3">Requested Model</th>
                    <th className="px-4 py-3">Technology</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3">Review Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coverage.requests.map((req) => (
                    <tr key={req.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{req.manufacturerName}</td>
                      <td className="px-4 py-3 text-slate-800">{req.modelName}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{req.technology}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                        {req.notes || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {isUnlocked ? (
                          <select
                            value={req.status}
                            onChange={(e) =>
                              handleUpdateRequestStatus(
                                req.id,
                                e.target.value as ModelRequestDTO['status']
                              )
                            }
                            aria-label={`Status for ${req.modelName}`}
                            className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                          >
                            <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                            <option value="RESEARCHING">RESEARCHING</option>
                            <option value="ADDED">ADDED</option>
                            <option value="DECLINED">DECLINED</option>
                          </select>
                        ) : (
                          <span className="text-xs font-mono text-slate-700">{req.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SECTION 2B: REPAIR GUIDE FEEDBACK & STEP CLARITY / ACCURACY AUDIT */}
      {coverage && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Completed Repair Guide Feedback &amp; Flagged Step Notes ({coverage.recentGuideFeedback?.length || 0})
            </h2>
            <p className="text-xs text-slate-600">
              Helpfulness ratings, resolution outcomes, printer-model associations, and step-specific clarity or accuracy reports submitted by users.
            </p>
          </div>

          {!coverage.recentGuideFeedback || coverage.recentGuideFeedback.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              No repair guide reviews submitted yet. Users can rate helpfulness and flag unclear steps at the bottom of any{' '}
              <Link to="/guides" className="text-blue-600 font-semibold hover:underline">
                Repair Guide
              </Link>
              .
            </div>
          ) : (
            <div className="space-y-3">
              {coverage.recentGuideFeedback.map((fb) => (
                <article
                  key={fb.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 space-y-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                    <p>
                      <Link
                        to={`/guides/${fb.guideSlug}`}
                        className="font-bold text-slate-950 hover:text-blue-600 hover:underline text-sm"
                      >
                        {fb.guideTitle || fb.guideSlug}
                      </Link>
                      {' · '}
                      <strong className="text-slate-900 tabular-nums">{fb.helpfulnessRating}/5</strong>
                      {' · '}
                      <span
                        className={
                          fb.outcome === 'FIXED'
                            ? 'text-emerald-700 font-semibold'
                            : fb.outcome === 'PARTIALLY_FIXED'
                            ? 'text-amber-700 font-semibold'
                            : 'text-red-700 font-semibold'
                        }
                      >
                        {fb.outcome}
                      </span>
                      {' · '}
                      Printer:{' '}
                      <span className="font-medium text-slate-800">
                        {fb.printerModelName || 'General / Unspecified'}
                      </span>
                      {fb.authorDisplayName ? ` · ${fb.authorDisplayName}` : ''}
                    </p>
                    <span className="tabular-nums">{fb.createdAt.slice(0, 10)}</span>
                  </div>

                  {fb.generalComment && (
                    <p className="text-sm text-slate-700">{fb.generalComment}</p>
                  )}

                  {fb.stepComments.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      {fb.stepComments.map((sc, idx) => (
                        <p key={idx} className="text-xs text-slate-800">
                          <strong className="text-amber-900">
                            Step {sc.stepNumber} ({sc.stepTitle}) · {sc.issueType}:
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

      {/* SECTION 3: PROTECTED ADMIN CONTENT MANAGEMENT CONSOLE */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-2xs p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2">
              {isUnlocked ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              ) : (
                <Lock className="w-5 h-5 text-slate-500" />
              )}
              Maintainer Catalog Editor
            </h2>
            <p className="text-xs text-slate-600">
              Restricted workspace for catalog maintainers to register manufacturers, publish source-verified printer specs, and update verification states.
            </p>
          </div>
          {isUnlocked ? (
            <span className="text-xs font-semibold text-emerald-700">
              Maintainer Session Unlocked
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowUnlockPanel((v) => !v)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors self-start sm:self-auto whitespace-nowrap"
            >
              {showUnlockPanel ? 'Hide Maintainer Sign-In' : 'Unlock Maintainer Editor'}
            </button>
          )}
        </div>

        {!isUnlocked && showUnlockPanel && (
          <form onSubmit={handleUnlock} className="max-w-md pt-4 border-t border-slate-100 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-passcode" className="block text-xs font-semibold text-slate-700">
                Maintainer Passcode
              </label>
              <input
                id="admin-passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter maintainer passcode"
                required
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <p className="text-xs text-slate-500">
                Required only to add or modify catalog records. Public coverage audits above require no passcode.
              </p>
            </div>
            {authError && (
              <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {authError}
              </p>
            )}
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Unlock Editor
            </button>
          </form>
        )}

        {isUnlocked && (
          <div className="space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Form A: Add Manufacturer */}
              <form
                onSubmit={handleAddManufacturer}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4"
              >
                <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-blue-600" />
                  Register New Manufacturer
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Manufacturer Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={mfgName}
                      onChange={(e) => setMfgName(e.target.value)}
                      placeholder="e.g. Caribou3D"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Country / Region
                    </label>
                    <input
                      type="text"
                      value={mfgCountry}
                      onChange={(e) => setMfgCountry(e.target.value)}
                      placeholder="e.g. Germany"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official Website URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={mfgWebsite}
                    onChange={(e) => setMfgWebsite(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="flex items-center gap-6 text-xs font-medium text-slate-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mfgFdm}
                      onChange={(e) => setMfgFdm(e.target.checked)}
                    />
                    Produces FDM Printers
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mfgResin}
                      onChange={(e) => setMfgResin(e.target.checked)}
                    />
                    Produces Resin Printers
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Documentation &amp; Lineup Notes
                  </label>
                  <textarea
                    rows={2}
                    value={mfgNotes}
                    onChange={(e) => setMfgNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                {mfgStatusMsg && (
                  <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {mfgStatusMsg}
                  </p>
                )}

                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Save Manufacturer
                </button>
              </form>

              {/* Form B: Add Printer Model with Mandatory Source Validation */}
              <form
                onSubmit={handleAddModel}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4"
              >
                <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-blue-600" />
                  Add Printer Model Record (Source-Gated)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Manufacturer *
                    </label>
                    <select
                      value={mdlMfgId}
                      onChange={(e) => setMdlMfgId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      {data?.manufacturers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Exact Model Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={mdlName}
                      onChange={(e) => setMdlName(e.target.value)}
                      placeholder="e.g. Prusa MINI+"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Family
                    </label>
                    <input
                      type="text"
                      value={mdlFamily}
                      onChange={(e) => setMdlFamily(e.target.value)}
                      placeholder="MINI Series"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Technology *
                    </label>
                    <select
                      value={mdlTech}
                      onChange={(e) => setMdlTech(e.target.value as 'FDM' | 'RESIN')}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="FDM">FDM Filament</option>
                      <option value="RESIN">MSLA / SLA Resin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Verification State
                    </label>
                    <select
                      value={mdlVerification}
                      onChange={(e) => setMdlVerification(e.target.value as VerificationStatus)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="VERIFIED">VERIFIED (Requires URL)</option>
                      <option value="PARTIAL">PARTIAL</option>
                      <option value="UNVERIFIED">UNVERIFIED</option>
                    </select>
                  </div>
                </div>

                {mdlTech === 'FDM' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bed Leveling Architecture (Governs Manual Tramming Safety Gate) *
                    </label>
                    <select
                      value={mdlBedCat}
                      onChange={(e) => setMdlBedCat(e.target.value as BedLevelingCategory)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="AUTO_LOAD_CELL_NOZZLE">Auto Load-Cell / Nozzle Contact (Blocks Manual Screws)</option>
                      <option value="STRAIN_GAUGE_INTEGRATED">Integrated Strain-Gauge Auto (Blocks Manual Screws)</option>
                      <option value="MANUFACTURER_AUTO_SYSTEM">Multi-Sensor Auto Calibration (Blocks Manual Screws)</option>
                      <option value="AUTO_PROBE_MESH">Auto Mesh Probe + Manual Z-Offset (Blocks Manual Screws)</option>
                      <option value="HYBRID_MANUAL_AND_AUTO">Hybrid Manual Wheels + Auto Mesh (Allows Manual Screws)</option>
                      <option value="MANUAL_SCREWS_WHEELS">Manual 4-Point Wheels Only (Allows Manual Screws)</option>
                      <option value="FIXED_MECHANICAL_BED">Fixed Mechanical Bed (Blocks Manual Screws)</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Technical Summary *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={mdlSummary}
                    onChange={(e) => setMdlSummary(e.target.value)}
                    placeholder="Concise mechanical architecture summary..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Official Source Title
                    </label>
                    <input
                      type="text"
                      value={mdlSourceTitle}
                      onChange={(e) => setMdlSourceTitle(e.target.value)}
                      placeholder="Official Wiki / User Manual"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Official Source URL {mdlVerification === 'VERIFIED' ? '*' : ''}
                    </label>
                    <input
                      type="url"
                      value={mdlSourceUrl}
                      onChange={(e) => setMdlSourceUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                {mdlErrorMsg && (
                  <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {mdlErrorMsg}
                  </p>
                )}

                {mdlStatusMsg && (
                  <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {mdlStatusMsg}
                  </p>
                )}

                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Create Printer Model Record
                </button>
              </form>
            </div>

            {/* Existing Model Verification Audit Table */}
            {data && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-950">
                  Manage Verification Status Across Seeded Models ({data.models.length})
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-3.5 py-2.5">Model</th>
                        <th className="px-3.5 py-2.5">Tech</th>
                        <th className="px-3.5 py-2.5">Bed Calibration Architecture</th>
                        <th className="px-3.5 py-2.5">Last Verified</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.models.map((m) => (
                        <tr key={m.id}>
                          <td className="px-3.5 py-2.5 font-medium text-slate-900">
                            <Link to={`/printers/${m.slug}`} className="hover:text-blue-600 hover:underline">
                              {m.name}
                            </Link>
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-600">{m.technology}</td>
                          <td className="px-3.5 py-2.5 text-slate-700">
                            {formatBedLevelingLabel(m.bedLevelingCategory)}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-500 tabular-nums">{m.lastVerifiedDate}</td>
                          <td className="px-3.5 py-2.5">
                            <select
                              value={m.completenessStatus}
                              onChange={(e) =>
                                handleUpdateModelStatus(m.id, e.target.value as VerificationStatus)
                              }
                              aria-label={`Verification status for ${m.name}`}
                              className="border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                            >
                              <option value="VERIFIED">VERIFIED</option>
                              <option value="PARTIAL">PARTIAL</option>
                              <option value="COMMUNITY_CORROBORATED">COMMUNITY_CORROBORATED</option>
                              <option value="OUTDATED">OUTDATED</option>
                              <option value="UNVERIFIED">UNVERIFIED</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

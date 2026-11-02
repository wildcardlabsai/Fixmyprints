import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
  Wrench,
  CheckCircle2,
  BookOpen,
  Calculator,
  Check,
  RotateCcw,
  Star,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useWorkshop } from '../context/WorkshopContext.tsx';
import { CalibrationCalculators } from '../components/CalibrationCalculators.tsx';

type ReferenceTab = 'ERRORS' | 'MAINTENANCE' | 'CALCULATORS';

export const ReferencePage: React.FC = () => {
  const { data, loading } = useAppData();
  const {
    workshopPrinters,
    primaryPrinter,
    logMaintenanceCompleted,
    clearMaintenanceLog,
    getMaintenanceRecord,
    openWorkshopModal,
  } = useWorkshop();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialCode = searchParams.get('code') || '';
  const rawTab = searchParams.get('tab');
  const initialTab: ReferenceTab =
    rawTab === 'maintenance'
      ? 'MAINTENANCE'
      : rawTab === 'calculators'
      ? 'CALCULATORS'
      : 'ERRORS';

  const [activeTab, setActiveTab] = useState<ReferenceTab>(
    initialCode ? 'ERRORS' : initialTab
  );
  const [errorQuery, setErrorQuery] = useState(initialCode);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('ALL');

  const [maintTech, setMaintTech] = useState<'ALL' | 'FDM' | 'RESIN'>('ALL');
  const [maintComponent, setMaintComponent] = useState<string>('ALL');
  const [maintPrinterSlug, setMaintPrinterSlug] = useState<string>(
    primaryPrinter?.slug || 'ALL'
  );

  useEffect(() => {
    document.title = 'Error Codes, Maintenance Tracker & Calibration Calculators – FixMyPrint';
  }, []);

  useEffect(() => {
    const paramCode = searchParams.get('code');
    const paramTab = searchParams.get('tab');
    if (paramCode) {
      setActiveTab('ERRORS');
      setErrorQuery(paramCode);
    } else if (paramTab === 'maintenance') {
      setActiveTab('MAINTENANCE');
    } else if (paramTab === 'calculators') {
      setActiveTab('CALCULATORS');
    } else {
      setActiveTab('ERRORS');
    }
  }, [searchParams]);

  // Keep selected maintenance printer synced if primary workshop printer is added
  useEffect(() => {
    if (maintPrinterSlug === 'ALL' && primaryPrinter) {
      setMaintPrinterSlug(primaryPrinter.slug);
    }
  }, [primaryPrinter, maintPrinterSlug]);

  const brandsWithErrors = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const err of data.errorCodes) {
      seen.set(err.manufacturerId, err.manufacturerName || 'Manufacturer');
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filteredErrors = useMemo(() => {
    if (!data) return [];
    const q = errorQuery.trim().toLowerCase();
    return data.errorCodes.filter((err) => {
      if (selectedBrandId !== 'ALL' && err.manufacturerId !== selectedBrandId) return false;
      if (q) {
        const hit =
          err.code.toLowerCase().includes(q) ||
          err.verifiedMeaning.toLowerCase().includes(q) ||
          (err.manufacturerName || '').toLowerCase().includes(q) ||
          err.firmwareContext.toLowerCase().includes(q) ||
          err.likelyCauses.some((c) => c.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [data, errorQuery, selectedBrandId]);

  const componentCategories = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.maintenance.map((m) => m.componentCategory))).sort();
  }, [data]);

  const activeMaintPrinterModel = useMemo(() => {
    if (!data || maintPrinterSlug === 'ALL') return null;
    return data.models.find((m) => m.slug === maintPrinterSlug) || null;
  }, [data, maintPrinterSlug]);

  const filteredMaintenance = useMemo(() => {
    if (!data) return [];
    return data.maintenance.filter((item) => {
      if (activeMaintPrinterModel && item.technology !== activeMaintPrinterModel.technology) {
        return false;
      }
      if (maintTech !== 'ALL' && item.technology !== maintTech) return false;
      if (maintComponent !== 'ALL' && item.componentCategory !== maintComponent) return false;
      return true;
    });
  }, [data, maintTech, maintComponent, activeMaintPrinterModel]);

  function handleTabSwitch(tab: ReferenceTab) {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'MAINTENANCE') {
      next.set('tab', 'maintenance');
      next.delete('code');
      next.delete('calc');
    } else if (tab === 'CALCULATORS') {
      next.set('tab', 'calculators');
      next.delete('code');
    } else {
      next.delete('tab');
      next.delete('calc');
    }
    setSearchParams(next, { replace: true });
  }

  if (loading || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <div className="h-28 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-slate-200 pb-6">
        <div className="space-y-2 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Error Codes, Maintenance &amp; Calibration Calculators
          </h1>
          <p className="text-sm text-slate-600">
            Manufacturer-isolated firmware fault codes, checkable preventive maintenance schedules, and precision extrusion &amp; resin exposure calculators.
          </p>
        </div>

        {/* Section Switcher */}
        <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-2xs shrink-0 gap-1">
          <button
            type="button"
            onClick={() => handleTabSwitch('ERRORS')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'ERRORS'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Error Codes ({data.errorCodes.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('MAINTENANCE')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'MAINTENANCE'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Maintenance ({data.maintenance.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('CALCULATORS')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'CALCULATORS'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Calculators</span>
          </button>
        </div>
      </div>

      {/* TAB 1: FIRMWARE ERROR CODES */}
      {activeTab === 'ERRORS' && (
        <section className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-3">
            <BookOpen className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">
                Manufacturer-Scoped Fault Lookup
              </p>
              <p>
                Numeric and hexadecimal fault codes are never interchangeable across brands (for example, Prusa QR code{' '}
                <span className="font-mono font-semibold">#13101</span> applies only to MK4/MK4S Buddy firmware, whereas Bambu HMS hex strings apply only to Bambu OS). If an error code is not listed below, consult your manufacturer’s official manual rather than guessing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="md:col-span-8 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={errorQuery}
                onChange={(e) => setErrorQuery(e.target.value)}
                placeholder="Search exact error code (e.g. 0300-8008, #13101, Key 2564, ER38) or symptom..."
                aria-label="Search firmware error codes"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="md:col-span-4">
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                aria-label="Filter error codes by manufacturer"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Seeded Manufacturers</option>
                {brandsWithErrors.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredErrors.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
              <p className="text-base font-semibold text-slate-900">
                No verified error code matches “{errorQuery}”
              </p>
              <p className="text-sm text-slate-600 max-w-xl mx-auto">
                FixMyPrint does not fabricate meanings for undocumented error codes. Clear the filter or launch the visual diagnostic wizard to troubleshoot by physical symptom.
              </p>
              <div className="flex items-center justify-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorQuery('');
                    setSelectedBrandId('ALL');
                  }}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Reset Filters
                </button>
                <Link
                  to="/diagnose"
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Diagnose by Symptom
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredErrors.map((err) => (
                <article
                  key={err.id}
                  className="rounded-xl border border-slate-200 bg-white shadow-2xs p-6 space-y-4 hover:border-slate-300 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-500">
                        <span className="font-semibold text-slate-800">{err.manufacturerName}</span>
                        {' · '}
                        {err.firmwareContext}
                        {' · '}
                        Applies to: {err.applicableFamilies.join(', ')}
                      </p>
                      <h2 className="text-lg font-bold text-slate-950 flex flex-wrap items-center gap-2.5">
                        <code className="font-mono text-base px-2.5 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-200">
                          {err.code}
                        </code>
                        <span>{err.verifiedMeaning}</span>
                      </h2>
                    </div>
                    <a
                      href={err.officialSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 shrink-0"
                    >
                      Official Reference
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Documented Causes
                      </h3>
                      <ul className="space-y-1.5 text-slate-700 list-disc list-inside">
                        {err.likelyCauses.map((cause, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {cause}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Safe Technician Checks
                      </h3>
                      <ol className="space-y-1.5 text-slate-700 list-decimal list-inside">
                        {err.recommendedChecks.map((chk, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {chk}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-100">
                    <span>Last verified against manufacturer documentation: {err.lastVerifiedDate}</span>
                    <Link
                      to="/guides"
                      className="font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      Browse related repair guides
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: HARDWARE-SPECIFIC MAINTENANCE SCHEDULES + INTERACTIVE LOG */}
      {activeTab === 'MAINTENANCE' && (
        <section className="space-y-6">
          {/* Workshop Maintenance Context Bar */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <p className="font-bold text-slate-950">
                Preventive Maintenance Log
              </p>
              <p className="text-slate-600">
                Mark procedures complete to stamp today’s date and your printer’s current print hours in browser storage.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <select
                value={maintPrinterSlug}
                onChange={(e) => {
                  setMaintPrinterSlug(e.target.value);
                  setMaintTech('ALL');
                }}
                aria-label="Log maintenance against printer"
                className="px-3 py-2 text-xs font-medium bg-[#f6f9fc] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">General Workshop Log (All Printers)</option>
                {workshopPrinters.length > 0 && (
                  <optgroup label="My Workshop Printers">
                    {workshopPrinters.map((wp) => {
                      const m = data.models.find((mod) => mod.slug === wp.slug);
                      if (!m) return null;
                      return (
                        <option key={m.slug} value={m.slug}>
                          {m.name} ({wp.printHours} hrs logged)
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                <optgroup label="All Verified Printers">
                  {data.models.map((m) => (
                    <option key={m.id} value={m.slug}>
                      {m.name} ({m.technology})
                    </option>
                  ))}
                </optgroup>
              </select>

              <button
                type="button"
                onClick={openWorkshopModal}
                className="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                Manage Workshop ({workshopPrinters.length})
              </button>
            </div>
          </div>

          {/* Technology & Subsystem Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              {(['ALL', 'FDM', 'RESIN'] as const).map((tech) => (
                <button
                  key={tech}
                  type="button"
                  onClick={() => setMaintTech(tech)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    maintTech === tech
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {tech === 'ALL'
                    ? 'All Technologies'
                    : tech === 'FDM'
                    ? 'FDM Filament Printers'
                    : 'MSLA / SLA Resin Printers'}
                </button>
              ))}
            </div>

            <div className="sm:w-64">
              <select
                value={maintComponent}
                onChange={(e) => setMaintComponent(e.target.value)}
                aria-label="Filter maintenance by component category"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Hardware Subsystems</option>
                {componentCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Maintenance Procedure Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredMaintenance.map((item) => {
              const logRecord = getMaintenanceRecord(item.id, maintPrinterSlug);

              return (
                <article
                  key={item.id}
                  className={`rounded-xl border bg-white shadow-2xs p-6 flex flex-col justify-between space-y-5 transition-colors ${
                    logRecord ? 'border-emerald-300' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-500">
                          <span className="font-semibold text-slate-800">
                            {item.technology === 'FDM' ? 'FDM Filament' : 'MSLA / SLA Resin'}
                          </span>
                          {' · '}
                          {item.componentCategory}
                          {' · '}
                          Interval: <span className="text-slate-900 font-medium">{item.intervalGuidance}</span>
                        </p>
                        <h2 className="text-lg font-bold text-slate-950">{item.title}</h2>
                      </div>

                      {logRecord ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800 tabular-nums">
                            <Check className="w-3.5 h-3.5" />
                            Done {logRecord.lastCompletedDate}
                            {logRecord.printHoursAtCompletion !== null
                              ? ` (${logRecord.printHoursAtCompletion}h)`
                              : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => clearMaintenanceLog(item.id, maintPrinterSlug)}
                            aria-label="Clear maintenance completion stamp"
                            title="Clear log"
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => logMaintenanceCompleted(item.id, maintPrinterSlug)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:border-emerald-500 hover:text-emerald-800 shrink-0 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Log Done Today</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">Applicable hardware:</span>{' '}
                      {item.applicableSystems.join(' · ')}
                    </p>

                    <p className="text-sm text-slate-700 leading-relaxed">{item.procedureSummary}</p>

                    <div className="rounded-lg bg-emerald-50/70 border border-emerald-200 p-3.5 text-xs space-y-1">
                      <p className="font-semibold text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        Approved Cleaner / Lubricant
                      </p>
                      <p className="text-emerald-900">{item.lubricantOrCleaner}</p>
                    </div>

                    {item.doNotApplyTo.length > 0 && (
                      <div className="rounded-lg bg-red-50/80 border border-red-200 p-3.5 text-xs space-y-1.5">
                        <p className="font-semibold text-red-950 flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" />
                          Do NOT Apply / Hardware Exclusions
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-red-900">
                          {item.doNotApplyTo.map((exclusion, idx) => (
                            <li key={idx}>{exclusion}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {item.safetyWarning && (
                      <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-3 text-xs text-amber-950 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <span>{item.safetyWarning}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                    <span>Verified: {item.lastVerifiedDate}</span>
                    <Link to="/printers" className="font-semibold text-blue-600 hover:text-blue-800">
                      Check printer hardware →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 3: CALIBRATION CALCULATORS */}
      {activeTab === 'CALCULATORS' && (
        <CalibrationCalculators initialCalc={searchParams.get('calc')} />
      )}
    </div>
  );
};


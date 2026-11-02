import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  PlusCircle,
  CheckCircle2,
  ArrowRight,
  Star,
  Columns3,
  X,
  Wrench,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useWorkshop } from '../context/WorkshopContext.tsx';
import { formatBedLevelingLabel } from '../components/Layout.tsx';
import { PrinterSilhouette, resolveHardwareArchetype } from '../components/PrinterSilhouette.tsx';

export const PrintersPage: React.FC = () => {
  const { data, loading, refreshData } = useAppData();
  const { workshopPrinters, isPinned, toggleWorkshopPrinter, openWorkshopModal } = useWorkshop();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState('');
  const [selectedBrandSlug, setSelectedBrandSlug] = useState<string>('ALL');
  const [techFilter, setTechFilter] = useState<'ALL' | 'FDM' | 'RESIN'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CURRENT' | 'LEGACY'>('ALL');
  const [sortBy, setSortBy] = useState<'NAME' | 'BRAND' | 'TECH'>('NAME');
  const [page, setPage] = useState(1);
  const pageSize = 9;

  // Side-by-side comparison state (up to 3 models)
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  // Request missing printer form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqBrand, setReqBrand] = useState('');
  const [reqModel, setReqModel] = useState('');
  const [reqTech, setReqTech] = useState<'FDM' | 'RESIN'>('FDM');
  const [reqNotes, setReqNotes] = useState('');
  const [reqSuccess, setReqSuccess] = useState(false);

  function toggleCompareModel(slug: string) {
    setCompareSlugs((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((s) => s !== slug);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), slug];
      }
      return [...prev, slug];
    });
  }

  const comparedModels = useMemo(() => {
    if (!data) return [];
    return compareSlugs
      .map((s) => data.models.find((m) => m.slug === s))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }, [data, compareSlugs]);

  useEffect(() => {
    document.title = '3D Printer Hardware Directory – FixMyPrint';
  }, []);

  useEffect(() => {
    const brandParam = searchParams.get('brand');
    const reqParam = searchParams.get('request');
    const qParam = searchParams.get('q');
    if (brandParam) setSelectedBrandSlug(brandParam);
    if (reqParam === '1') setShowRequestForm(true);
    if (qParam !== null) {
      setQuery(qParam);
      setPage(1);
    }
  }, [searchParams]);

  const filteredModels = useMemo(() => {
    if (!data) return [];
    const q = query
      .toLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return data.models
      .filter((m) => {
        if (selectedBrandSlug !== 'ALL' && m.manufacturerSlug !== selectedBrandSlug) return false;
        if (techFilter !== 'ALL' && m.technology !== techFilter) return false;
        if (statusFilter === 'CURRENT' && m.releaseStatus !== 'CURRENT' && m.releaseStatus !== 'OPEN_SOURCE_KIT') {
          return false;
        }
        if (statusFilter === 'LEGACY' && m.releaseStatus === 'CURRENT') return false;
        if (q) {
          const haystack = `${m.name} ${m.manufacturerName || ''} ${m.family} ${m.summary}`
            .toLowerCase()
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ');
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'BRAND') return (a.manufacturerName || '').localeCompare(b.manufacturerName || '');
        if (sortBy === 'TECH') return a.technology.localeCompare(b.technology);
        return a.name.localeCompare(b.name);
      });
  }, [data, query, selectedBrandSlug, techFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredModels.length / pageSize));
  const currentPageModels = filteredModels.slice((page - 1) * pageSize, page * pageSize);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!reqBrand.trim() || !reqModel.trim()) return;
    const res = await fetch('/api/model-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manufacturerName: reqBrand,
        modelName: reqModel,
        technology: reqTech,
        notes: reqNotes,
      }),
    });
    if (res.ok) {
      setReqSuccess(true);
      setReqBrand('');
      setReqModel('');
      setReqNotes('');
      await refreshData();
    }
  }

  if (loading || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-6">
        <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-52 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-52 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-52 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">3D Printer Library</h1>
          <p className="text-sm text-slate-600 mt-1">
            Currently indexing <span className="tabular-nums font-semibold">{data.models.length}</span> verified model families across{' '}
            <span className="tabular-nums font-semibold">{data.manufacturers.length}</span> registered FDM and MSLA resin manufacturers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openWorkshopModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
          >
            <Star className="w-3.5 h-3.5" />
            <span>My Workshop ({workshopPrinters.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowRequestForm((v) => !v);
              setReqSuccess(false);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4 text-blue-600" />
            <span>Request Unlisted Model</span>
          </button>
        </div>
      </div>

      {/* Pinned My Workshop Quick Strip */}
      {workshopPrinters.length > 0 && (
        <section className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-950 mr-1">
              My Workshop:
            </span>
            {workshopPrinters.map((wp) => {
              const m = data.models.find((mod) => mod.slug === wp.slug);
              if (!m) return null;
              return (
                <Link
                  key={m.slug}
                  to={`/diagnose?printer=${m.slug}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-900 font-semibold hover:border-slate-400 transition-colors"
                >
                  <span>{m.name}</span>
                  {wp.isPrimary && <span className="text-[11px] font-normal text-slate-500">· Primary</span>}
                </Link>
              );
            })}
          </div>
          <button
            type="button"
            onClick={openWorkshopModal}
            className="text-xs font-semibold text-blue-700 hover:underline shrink-0 self-start sm:self-auto"
          >
            Edit Workshop &amp; Hours →
          </button>
        </section>
      )}

      {/* Request Missing Printer Panel */}
      {showRequestForm && (
        <section className="p-6 border border-slate-200 rounded-xl bg-slate-50/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950">Request Official Data Import for a Missing Printer</h2>
              <p className="text-xs text-slate-600">
                User requests enter the Admin Verification Queue as Pending Review and are never published as verified specs until checked against manufacturer manuals.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRequestForm(false)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Close
            </button>
          </div>

          {reqSuccess ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Model request logged in the Admin Review Queue. In the meantime, you can use our clearly labelled Generic Diagnostic Mode.
              </span>
              <Link to="/diagnose?mode=generic" className="font-semibold underline whitespace-nowrap ml-4">
                Start Generic Diagnosis →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmitRequest} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Manufacturer *</label>
                <input
                  type="text"
                  required
                  value={reqBrand}
                  onChange={(e) => setReqBrand(e.target.value)}
                  placeholder="e.g. Rat Rig, FLSUN..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Exact Model Name *</label>
                <input
                  type="text"
                  required
                  value={reqModel}
                  onChange={(e) => setReqModel(e.target.value)}
                  placeholder="e.g. V-Core 4 400, V400..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Technology</label>
                <select
                  value={reqTech}
                  onChange={(e) => setReqTech(e.target.value as 'FDM' | 'RESIN')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="FDM">FDM / FFF Filament</option>
                  <option value="RESIN">Resin / MSLA / SLA</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="Manual link or variant note"
                  className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap"
                >
                  Submit
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Filter & Search Bar */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-xl shadow-2xs grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
        <div className="md:col-span-4 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search manufacturer, model, or series..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="md:col-span-3">
          <select
            aria-label="Filter by manufacturer"
            value={selectedBrandSlug}
            onChange={(e) => {
              setSelectedBrandSlug(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          >
            <option value="ALL">All Manufacturers ({data.manufacturers.length})</option>
            {data.manufacturers.map((m) => (
              <option key={m.id} value={m.slug}>
                {m.name} ({m.modelCount || 0})
              </option>
            ))}
          </select>
        </div>

        {/* Technology Segmented Filter */}
        <div className="md:col-span-3 flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['ALL', 'FDM', 'RESIN'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTechFilter(t);
                setPage(1);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                techFilter === t ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'ALL' ? 'All Tech' : t}
            </button>
          ))}
        </div>

        <div className="md:col-span-2 flex gap-2">
          <select
            aria-label="Filter by release status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | 'CURRENT' | 'LEGACY');
              setPage(1);
            }}
            className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
          >
            <option value="ALL">All Generations</option>
            <option value="CURRENT">Current / Open-Kit</option>
            <option value="LEGACY">Legacy / Discontinued</option>
          </select>
        </div>
      </div>

      {/* Results Grid */}
      {currentPageModels.length === 0 ? (
        <div className="p-10 border border-slate-200 rounded-xl text-center space-y-3 bg-slate-50/50">
          <p className="text-base font-semibold text-slate-900">No verified printer records match your current filter.</p>
          <p className="text-xs text-slate-600 max-w-lg mx-auto">
            Some registered manufacturers in our extensible registry do not yet have verified model records imported. We never fabricate specifications—request a model import or run Generic Diagnostic Mode.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => {
                setSelectedBrandSlug('ALL');
                setTechFilter('ALL');
                setStatusFilter('ALL');
                setQuery('');
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Reset filters
            </button>
            <button
              type="button"
              onClick={() => setShowRequestForm(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Request this model
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentPageModels.map((model) => {
            const buildVol = model.fdmSpecs?.buildVolumeMm || model.resinSpecs?.buildVolumeMm;
            const { label: archetypeLabel } = resolveHardwareArchetype(model);
            const secondaryMetricLabel =
              model.technology === 'FDM' ? 'Max Nozzle' : 'Screen / Optics';
            const secondaryMetricValue =
              model.technology === 'FDM'
                ? model.fdmSpecs?.maxNozzleTempC
                  ? `${model.fdmSpecs.maxNozzleTempC} °C`
                  : model.fdmSpecs?.hotendType || 'Verified'
                : model.resinSpecs?.xyResolutionMicrons || model.resinSpecs?.screenTechnology || 'MSLA';

            const inCompare = compareSlugs.includes(model.slug);
            const pinned = isPinned(model.slug);

            return (
              <div
                key={model.id}
                className={`border rounded-xl bg-white shadow-2xs hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4 ${
                  inCompare
                    ? 'border-blue-600 ring-1 ring-blue-600'
                    : 'border-slate-200/90 hover:border-blue-400'
                }`}
              >
                <div className="space-y-4">
                  {/* Hardware Silhouette & Archetype Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">
                        {model.manufacturerName} ·{' '}
                        {model.releaseStatus === 'LEGACY_SUPPORTED'
                          ? 'Legacy Supported'
                          : model.releaseStatus === 'OPEN_SOURCE_KIT'
                          ? 'Open-Source Kit'
                          : 'Current Line'}
                      </p>
                      <h2 className="text-lg font-bold text-slate-950 mt-0.5 leading-snug">
                        <Link to={`/printers/${model.slug}`} className="hover:text-blue-600">
                          {model.name}
                        </Link>
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">{archetypeLabel}</p>
                    </div>
                    <Link
                      to={`/printers/${model.slug}`}
                      aria-label={`View ${model.name} hardware profile`}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0 hover:border-slate-300 transition-colors"
                    >
                      <PrinterSilhouette model={model} className="w-12 h-12" />
                    </Link>
                  </div>

                  {/* Scannable 3-Metric Hardware Grid */}
                  <dl className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-[#f6f9fc] border border-slate-200/70 text-xs">
                    <div>
                      <dt className="text-[11px] text-slate-500">Build Volume</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5 truncate">
                        {buildVol ? `${buildVol.x}×${buildVol.y}×${buildVol.z}` : 'Pending'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-slate-500 truncate">{secondaryMetricLabel}</dt>
                      <dd className="font-semibold text-slate-900 tabular-nums mt-0.5 truncate">
                        {secondaryMetricValue}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-slate-500">Calibration</dt>
                      <dd className="font-semibold text-slate-900 mt-0.5 truncate" title={formatBedLevelingLabel(model.bedLevelingCategory)}>
                        {model.technology === 'RESIN'
                          ? 'Vat / Plate'
                          : model.fdmSpecs?.manualTrammingProcedureAllowed
                          ? 'Manual Wheels'
                          : 'Auto Sensor'}
                      </dd>
                    </div>
                  </dl>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{model.summary}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => toggleCompareModel(model.slug)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-semibold transition-colors ${
                        inCompare
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <Columns3 className="w-3.5 h-3.5" />
                      <span>{inCompare ? 'Comparing' : 'Compare'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleWorkshopPrinter(model.slug)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-semibold transition-colors ${
                        pinned
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${pinned ? 'fill-emerald-600 text-emerald-600' : ''}`} />
                      <span>{pinned ? 'In Workshop' : 'Pin'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <Link
                      to={`/printers/${model.slug}`}
                      className="text-slate-700 hover:text-blue-600 inline-flex items-center gap-1"
                    >
                      Specs &amp; Sources <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    <Link
                      to={`/diagnose?printer=${model.slug}`}
                      className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      Diagnose
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination & Sort Controls */}
      {filteredModels.length > pageSize && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600">
          <span className="tabular-nums">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredModels.length)} of{' '}
            {filteredModels.length} models
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-40"
            >
              Previous
            </button>
            <span className="tabular-nums font-medium px-2">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Extensible Manufacturer Registry Transparency Table */}
      <section className="pt-8 border-t border-slate-200 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Complete Manufacturer Registry ({data.manufacturers.length} Brands)</h2>
          <p className="text-xs text-slate-600">
            Manufacturers with 0 imported models are explicitly marked rather than padded with unverified specifications.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
          {data.manufacturers.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setSelectedBrandSlug(m.slug);
                setPage(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`text-left p-2.5 rounded-lg border transition-colors ${
                selectedBrandSlug === m.slug
                  ? 'border-blue-600 bg-blue-50/60'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <p className="font-semibold text-slate-900 truncate">{m.name}</p>
              <p className="text-slate-500 tabular-nums mt-0.5">
                {m.modelCount || 0} verified {m.modelCount === 1 ? 'model' : 'models'}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Floating Side-by-Side Comparison Bar */}
      {comparedModels.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-4xl mx-auto p-3.5 sm:p-4 rounded-2xl bg-slate-950 text-white shadow-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-blue-300 tabular-nums">
              Compare ({comparedModels.length}/3):
            </span>
            {comparedModels.map((m) => (
              <span
                key={m.slug}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-white font-medium"
              >
                <span>{m.name}</span>
                <button
                  type="button"
                  onClick={() => toggleCompareModel(m.slug)}
                  aria-label={`Remove ${m.name} from comparison`}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCompareSlugs([])}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setCompareModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Compare Specs Side-by-Side</span>
            </button>
          </div>
        </div>
      )}

      {/* Side-by-Side Hardware & Filament Capability Comparison Modal */}
      {compareModalOpen && comparedModels.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Side-by-side printer hardware comparison"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCompareModalOpen(false);
          }}
        >
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  Side-by-Side Printer Spec &amp; Capability Comparison
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                aria-label="Close comparison"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-3 pr-4 w-44 text-slate-500 font-semibold align-bottom">
                      Specification
                    </th>
                    {comparedModels.map((m) => (
                      <th key={m.slug} className="py-3 px-4 min-w-[200px] align-top">
                        <div className="space-y-2">
                          <div className="w-12 h-12 rounded-xl bg-[#f6f9fc] border border-slate-200 flex items-center justify-center">
                            <PrinterSilhouette model={m} className="w-9 h-9" />
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-slate-500">
                              {m.manufacturerName} · {m.technology}
                            </p>
                            <p className="text-sm font-bold text-slate-950">{m.name}</p>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Architecture</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-2.5 px-4">
                        {resolveHardwareArchetype(m).label}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Build Volume</td>
                    {comparedModels.map((m) => {
                      const bv = m.fdmSpecs?.buildVolumeMm || m.resinSpecs?.buildVolumeMm;
                      return (
                        <td key={m.slug} className="py-2.5 px-4 font-mono font-semibold text-slate-950 tabular-nums">
                          {bv ? `${bv.x} × ${bv.y} × ${bv.z} mm` : 'Pending'}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Motion / Optics</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-2.5 px-4">
                        {m.fdmSpecs
                          ? `${m.fdmSpecs.motionSystem} · ${m.fdmSpecs.extruderType}`
                          : m.resinSpecs
                          ? `${m.resinSpecs.screenTechnology} (${m.resinSpecs.xyResolutionMicrons})`
                          : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Enclosure / Thermal</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-2.5 px-4">
                        {m.fdmSpecs
                          ? m.fdmSpecs.enclosureType
                          : m.resinSpecs
                          ? m.resinSpecs.vatHeatingCapable
                            ? 'Active Vat Heating Supported'
                            : 'Unheated Vat (Room Temp Dependent)'
                          : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Max Nozzle / Bed Temp</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-2.5 px-4 tabular-nums">
                        {m.fdmSpecs
                          ? `${m.fdmSpecs.maxNozzleTempC ?? '—'} °C Nozzle · ${m.fdmSpecs.maxBedTempC ?? '—'} °C Bed`
                          : m.resinSpecs
                          ? `Release film: ${m.resinSpecs.releaseFilmType}`
                          : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Calibration &amp; Leveling</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-2.5 px-4">
                        {formatBedLevelingLabel(m.bedLevelingCategory)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Manual Bed Wheels</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-2.5 px-4">
                        {m.technology === 'RESIN'
                          ? m.resinSpecs?.levelingMechanism || 'MSLA Plate'
                          : m.fdmSpecs?.manualTrammingProcedureAllowed
                          ? 'Yes — 4-Corner Manual Wheels'
                          : 'No — Auto / Rigid Bed'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Multi-Material</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-2.5 px-4">
                        {m.fdmSpecs?.multiMaterialSystem || 'Single-material stock'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">Supported Materials</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-2.5 px-4 leading-relaxed">
                        {m.fdmSpecs
                          ? m.fdmSpecs.supportedFilaments.join(', ')
                          : 'Standard 405nm UV, ABS-Like, Tough, Water-Washable'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-900">Actions</td>
                    {comparedModels.map((m) => (
                      <td key={m.slug} className="py-3 px-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/diagnose?printer=${m.slug}`}
                            onClick={() => setCompareModalOpen(false)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>Diagnose</span>
                          </Link>
                          <Link
                            to={`/printers/${m.slug}`}
                            onClick={() => setCompareModalOpen(false)}
                            className="px-3 py-1.5 font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                          >
                            Full Profile
                          </Link>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

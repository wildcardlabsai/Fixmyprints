import React, { useState, useMemo, useEffect } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAppData } from '../context/AppDataContext.tsx';
import { checkMaterialCompatibilityWithPrinter } from '../engine/diagnosticEngine.ts';

export const MaterialsPage: React.FC = () => {
  const { data, loading } = useAppData();
  const [techTab, setTechTab] = useState<'FDM' | 'RESIN'>('FDM');
  const [selectedPrinterSlug, setSelectedPrinterSlug] = useState<string>('');

  useEffect(() => {
    document.title = 'Filament & MSLA Resin Reference Library – FixMyPrint';
  }, []);

  const selectedPrinter = useMemo(() => {
    if (!data || !selectedPrinterSlug) return null;
    return data.models.find((m) => m.slug === selectedPrinterSlug) || null;
  }, [data, selectedPrinterSlug]);

  const materialsList = useMemo(() => {
    if (!data) return [];
    return data.materials.filter((m) => m.technology === techTab);
  }, [data, techTab]);

  if (loading || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-6">
        <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-80 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-950">Filament &amp; Photopolymer Resin Library</h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Values below are general polymer starting ranges. Always consult your specific filament spool or resin bottle datasheet for brand-specific formulations (such as high-speed PLA+ or fast MSLA resins).
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start">
          <button
            type="button"
            onClick={() => setTechTab('FDM')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              techTab === 'FDM' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            FDM Filaments (PLA–PC/CF)
          </button>
          <button
            type="button"
            onClick={() => setTechTab('RESIN')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              techTab === 'RESIN' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            MSLA / SLA Resins
          </button>
        </div>
      </div>

      {/* Live Printer Capability Checker */}
      <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-slate-950">Check Hardware Compatibility Against Your Printer</p>
          <p className="text-xs text-slate-600">
            Compares nozzle temperature, heated bed limit, enclosure type, and hardened nozzle requirements.
          </p>
        </div>
        <select
          aria-label="Select printer to verify material compatibility"
          value={selectedPrinterSlug}
          onChange={(e) => {
            const slug = e.target.value;
            setSelectedPrinterSlug(slug);
            const found = data.models.find((m) => m.slug === slug);
            if (found) setTechTab(found.technology);
          }}
          className="px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg sm:w-80"
        >
          <option value="">Select a printer model to check limits...</option>
          {data.models.map((m) => (
            <option key={m.id} value={m.slug}>
              {m.name} ({m.technology})
            </option>
          ))}
        </select>
      </div>

      {/* Material Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {materialsList.map((mat) => {
          const compat = selectedPrinter ? checkMaterialCompatibilityWithPrinter(mat, selectedPrinter) : null;
          return (
            <div key={mat.id} className="p-6 border border-slate-200 rounded-xl bg-white space-y-4">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <p className="text-xs text-slate-500">
                    {mat.category} · {mat.enclosureRequirement}
                  </p>
                  <h2 className="text-lg font-bold text-slate-950 mt-0.5">{mat.name}</h2>
                </div>
                {mat.nozzleTempRangeC && mat.bedTempRangeC && (
                  <div className="text-right font-mono text-xs tabular-nums shrink-0">
                    <p className="text-slate-900 font-semibold">
                      Nozzle: {mat.nozzleTempRangeC.min}–{mat.nozzleTempRangeC.max}°C
                    </p>
                    <p className="text-slate-600">
                      Bed: {mat.bedTempRangeC.min}–{mat.bedTempRangeC.max}°C
                    </p>
                  </div>
                )}
              </div>

              {compat && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    compat.compatible === 'COMPATIBLE'
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : compat.compatible === 'CAUTION_UPGRADE_NEEDED'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                      : 'bg-red-50/70 border-red-200 text-red-950'
                  }`}
                >
                  <p className="font-semibold flex items-center gap-1.5">
                    {compat.compatible === 'COMPATIBLE' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    <span>{selectedPrinter?.name}: {compat.compatible.replace(/_/g, ' ')}</span>
                  </p>
                  <p className="mt-1">{compat.explanation}</p>
                </div>
              )}

              <dl className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                <div>
                  <dt className="font-semibold text-slate-900 inline">Active Drying &amp; Storage: </dt>
                  <dd className="inline">{mat.dryingGuidance}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-900 inline">
                    {mat.technology === 'RESIN' ? 'Wash & Post-Cure: ' : 'Part Cooling & Chamber: '}
                  </dt>
                  <dd className="inline">{mat.coolingGuidance}</dd>
                </div>
                {mat.exposureNotesResin && (
                  <div>
                    <dt className="font-semibold text-slate-900 inline">MSLA Exposure Baseline: </dt>
                    <dd className="inline">{mat.exposureNotesResin}</dd>
                  </div>
                )}
                <div>
                  <dt className="font-semibold text-slate-900 inline">Hardware Notes: </dt>
                  <dd className="inline">{mat.hardwareCompatibilityNotes}</dd>
                </div>
                <div className="pt-2 border-t border-slate-100 text-slate-600">
                  <strong className="text-slate-800">Safety: </strong>
                  {mat.safetyGuidance}
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
};

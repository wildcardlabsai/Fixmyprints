import React, { useMemo, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Wrench, ExternalLink, AlertTriangle, CheckCircle2, FileText, Star } from 'lucide-react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useWorkshop } from '../context/WorkshopContext.tsx';
import { formatBedLevelingLabel } from '../components/Layout.tsx';
import { PrinterSilhouette } from '../components/PrinterSilhouette.tsx';
import {
  isGuideCompatibleWithPrinter,
  checkMaterialCompatibilityWithPrinter,
  canPrinterUseManualBedTramming,
} from '../engine/diagnosticEngine.ts';

export const PrinterDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading } = useAppData();
  const { isPinned, toggleWorkshopPrinter } = useWorkshop();

  const model = useMemo(() => {
    if (!data || !slug) return null;
    return data.models.find((m) => m.slug === slug || m.id === slug) || null;
  }, [data, slug]);

  useEffect(() => {
    if (model) {
      document.title = `${model.name} Troubleshooting, Specs & Repair Guides – FixMyPrint`;
    }
  }, [model]);

  const compatibleGuides = useMemo(() => {
    if (!data || !model) return [];
    return data.guides.filter((g) => isGuideCompatibleWithPrinter(g, model));
  }, [data, model]);

  const relatedErrorCodes = useMemo(() => {
    if (!data || !model) return [];
    return data.errorCodes.filter((e) => e.manufacturerId === model.manufacturerId);
  }, [data, model]);

  const materialChecks = useMemo(() => {
    if (!data || !model) return [];
    return data.materials
      .filter((mat) => mat.technology === model.technology)
      .map((mat) => ({
        material: mat,
        result: checkMaterialCompatibilityWithPrinter(mat, model),
      }));
  }, [data, model]);

  if (loading || !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 space-y-6">
        <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-4">
        <h1 className="text-2xl font-bold text-slate-950">Printer Model Not Found</h1>
        <p className="text-sm text-slate-600">
          This printer slug is not yet in our verified database. You can browse all verified printers or submit a model request.
        </p>
        <Link to="/printers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Printer Library
        </Link>
      </div>
    );
  }

  const manualTrammingAllowed = canPrinterUseManualBedTramming(model);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      {/* Breadcrumb & Primary Action Header */}
      <div className="space-y-4 p-5 sm:p-6 rounded-xl border border-slate-200 bg-white shadow-2xs">
        <Link to="/printers" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950">
          <ArrowLeft className="w-3.5 h-3.5" /> Printer Library / {model.manufacturerName}
        </Link>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4 max-w-3xl">
            <div className="hidden sm:flex w-20 h-20 rounded-xl bg-[#f6f9fc] border border-slate-200/80 items-center justify-center shrink-0">
              <PrinterSilhouette model={model} className="w-16 h-16" />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                {model.manufacturerName} · {model.family} · Generation: {model.generation} · Verification:{' '}
                <strong className="text-emerald-700">{model.completenessStatus}</strong> (Last verified {model.lastVerifiedDate})
              </p>
              <h1 className="text-3xl font-bold text-slate-950 tracking-tight">{model.name}</h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">{model.summary}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleWorkshopPrinter(model.slug)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                isPinned(model.slug)
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Star
                className={`w-4 h-4 ${
                  isPinned(model.slug) ? 'fill-emerald-600 text-emerald-600' : 'text-slate-500'
                }`}
              />
              <span>{isPinned(model.slug) ? 'In My Workshop' : 'Pin to Workshop'}</span>
            </button>
            <Link
              to={`/diagnose?printer=${model.slug}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs whitespace-nowrap transition-colors"
            >
              <Wrench className="w-4 h-4" />
              <span>Diagnose {model.name}</span>
            </Link>
            {model.officialManualUrl && (
              <a
                href={model.officialManualUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap transition-colors"
              >
                <span>Official Manual / Wiki</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Model-Aware Calibration & Bed Leveling Classification Callout */}
      <section className="p-5 sm:p-6 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
        <h2 className="text-base font-bold text-slate-950">
          Verified Calibration &amp; Bed Leveling Architecture: {formatBedLevelingLabel(model.bedLevelingCategory)}
        </h2>
        {model.fdmSpecs && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
            <div className="space-y-1.5">
              <p>
                <strong className="text-slate-900">Probing Hardware:</strong> {model.fdmSpecs.bedLevelingHardware}
              </p>
              <p>
                <strong className="text-slate-900">Z-Offset Method:</strong> {model.fdmSpecs.zOffsetMethod}
              </p>
              {model.fdmSpecs.calibrationMenuPath && (
                <p>
                  <strong className="text-slate-900">Verified Menu Path:</strong>{' '}
                  <span className="font-mono text-slate-900">{model.fdmSpecs.calibrationMenuPath}</span>
                </p>
              )}
            </div>
            <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
              <p className="font-semibold text-slate-900">
                {manualTrammingAllowed
                  ? 'Manual Corner Tramming Supported'
                  : 'Automatic / Constrained Bed — Do Not Use Generic 4-Wheel Leveling'}
              </p>
              <p className="text-slate-600 leading-relaxed">
                {manualTrammingAllowed
                  ? 'Official documentation includes 4-corner manual hand-wheel adjustment for baseline bed tramming.'
                  : 'FixMyPrint automatically blocks generic manual wheel-turning instructions for this printer to prevent skewing factory-calibrated sensors or rigid standoffs.'}
              </p>
            </div>
          </div>
        )}
        {model.resinSpecs && (
          <div className="text-xs text-slate-700 space-y-1.5">
            <p>
              <strong className="text-slate-900">Build Plate Mechanism:</strong> {model.resinSpecs.levelingMechanism} ·{' '}
              <strong className="text-slate-900">Release Film:</strong> {model.resinSpecs.releaseFilmType}
            </p>
            {model.resinSpecs.calibrationMenuPath && (
              <p>
                <strong className="text-slate-900">Verified Menu Path:</strong>{' '}
                <span className="font-mono">{model.resinSpecs.calibrationMenuPath}</span>
              </p>
            )}
          </div>
        )}
      </section>

      {/* Structured Specifications Table */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-xl font-bold text-slate-950">Verified Technical Specifications</h2>
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <dl className="divide-y divide-slate-200 text-sm">
              {model.fdmSpecs && (
                <>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Build Volume (X×Y×Z)</dt>
                    <dd className="col-span-2 font-mono tabular-nums text-slate-900">
                      {model.fdmSpecs.buildVolumeMm.x} × {model.fdmSpecs.buildVolumeMm.y} × {model.fdmSpecs.buildVolumeMm.z} mm
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Motion &amp; Enclosure</dt>
                    <dd className="col-span-2 text-slate-900">
                      {model.fdmSpecs.motionSystem} · {model.fdmSpecs.enclosureType}
                      {model.fdmSpecs.activeChamberTempC ? ` (Active heater up to ${model.fdmSpecs.activeChamberTempC}°C)` : ''}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Extruder &amp; Hotend</dt>
                    <dd className="col-span-2 text-slate-900">
                      {model.fdmSpecs.extruderType} — {model.fdmSpecs.hotendType}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Nozzle Sizes</dt>
                    <dd className="col-span-2 font-mono tabular-nums text-slate-900">
                      {model.fdmSpecs.standardNozzleMm} mm stock (supports {model.fdmSpecs.supportedNozzlesMm.join(', ')} mm)
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Max Temperatures</dt>
                    <dd className="col-span-2 font-mono tabular-nums text-slate-900">
                      Nozzle: {model.fdmSpecs.maxNozzleTempC ?? 'Unknown'}°C · Bed: {model.fdmSpecs.maxBedTempC ?? 'Unknown'}°C
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Build Plate</dt>
                    <dd className="col-span-2 text-slate-900">{model.fdmSpecs.buildPlateType}</dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Sensors &amp; Shaping</dt>
                    <dd className="col-span-2 text-slate-900">
                      Input Shaping: {model.fdmSpecs.inputShapingCapable ? 'Yes' : 'No'} · Runout Sensor:{' '}
                      {model.fdmSpecs.filamentRunoutSensor ? 'Yes' : 'No'} · Tangle/Load Detection:{' '}
                      {model.fdmSpecs.filamentTangleSensor ? 'Yes' : 'No'}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Multi-Material System</dt>
                    <dd className="col-span-2 text-slate-900">
                      {model.fdmSpecs.multiMaterialSystem || 'Single-material stock (no multiplexer configured)'}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Firmware &amp; Slicers</dt>
                    <dd className="col-span-2 text-slate-900">
                      {model.fdmSpecs.firmwareFamily} · {model.fdmSpecs.compatibleSlicers.join(', ')}
                    </dd>
                  </div>
                </>
              )}

              {model.resinSpecs && (
                <>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Build Volume (X×Y×Z)</dt>
                    <dd className="col-span-2 font-mono tabular-nums text-slate-900">
                      {model.resinSpecs.buildVolumeMm.x} × {model.resinSpecs.buildVolumeMm.y} × {model.resinSpecs.buildVolumeMm.z} mm
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Screen &amp; Resolution</dt>
                    <dd className="col-span-2 text-slate-900">
                      {model.resinSpecs.screenTechnology} ({model.resinSpecs.resolutionPixels} · {model.resinSpecs.xyResolutionMicrons})
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">UV Light Source</dt>
                    <dd className="col-span-2 text-slate-900">{model.resinSpecs.lightSource}</dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Vat &amp; Heating</dt>
                    <dd className="col-span-2 text-slate-900">
                      {model.resinSpecs.releaseFilmType} · Built-in Vat/Chamber Heater:{' '}
                      {model.resinSpecs.vatHeatingCapable ? 'Yes' : 'No'}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-3">
                    <dt className="text-slate-500">Compatible Slicers</dt>
                    <dd className="col-span-2 text-slate-900">{model.resinSpecs.compatibleSlicers.join(', ')}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </div>

        {/* Known Model-Specific Quirks, Variants & Sources */}
        <div className="lg:col-span-5 space-y-6">
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-950">Model-Specific Quirks &amp; Limitations</h2>
            <div className="p-5 border border-amber-200 bg-amber-50/50 rounded-xl space-y-2.5">
              {(model.fdmSpecs?.knownLimitations || model.resinSpecs?.knownLimitations || []).map((note, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-800 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>

          {model.variants && model.variants.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-slate-950">Documented Family Variants &amp; Revisions</h2>
              <div className="space-y-2.5">
                {model.variants.map((v) => (
                  <div key={v.id} className="p-4 border border-slate-200 rounded-xl bg-white space-y-1.5">
                    <p className="text-sm font-semibold text-slate-950">{v.name}</p>
                    <p className="text-xs text-slate-600">{v.notes}</p>
                    <ul className="list-disc list-inside text-xs text-slate-700 space-y-0.5">
                      {v.differencesJson.map((d, idx) => (
                        <li key={idx}>{d}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-950">Verified Source Evidence</h2>
            {model.sources && model.sources.length > 0 ? (
              <div className="space-y-2">
                {model.sources.map((src) => (
                  <div key={src.id} className="p-3.5 border border-slate-200 rounded-lg bg-white text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        {src.title}
                      </span>
                      <span className="text-emerald-700 font-medium whitespace-nowrap">{src.verificationStatus}</span>
                    </div>
                    {src.sectionReference && <p className="text-slate-600">Ref: {src.sectionReference}</p>}
                    <div className="flex items-center justify-between text-slate-500 pt-1">
                      <span>Checked {src.verifiedDate}</span>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        Source URL <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Official manual link listed in header above.</p>
            )}
          </div>
        </div>
      </section>

      {/* Compatible Repair Guides (Hardware-Filtered!) */}
      <section className="space-y-4 pt-6 border-t border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Compatible Step-by-Step Repair Guides</h2>
          <p className="text-xs text-slate-600">
            Procedures incompatible with {model.name} (such as manual 4-wheel tramming on non-manual beds or cross-technology resin/FDM guides) are automatically excluded.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {compatibleGuides.map((g) => (
            <Link
              key={g.id}
              to={`/guides/${g.slug}?printer=${model.slug}`}
              className="p-4 border border-slate-200 rounded-xl bg-white hover:border-blue-400 transition-colors flex flex-col justify-between space-y-2"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-950">{g.title}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Difficulty: {g.difficulty}
                  {g.estimatedTime ? ` · Est. ${g.estimatedTime}` : ''}
                </p>
                {g.modelSpecificMenuNotes[model.id] && (
                  <p className="text-xs text-blue-800 bg-blue-50/70 rounded p-2 mt-2">
                    Includes verified {model.name} menu path &amp; hardware notes
                  </p>
                )}
              </div>
              <span className="text-xs font-semibold text-blue-600 pt-1">Open guide →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Verified Material Compatibility Matrix for this exact Printer */}
      <section className="space-y-4 pt-6 border-t border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Hardware-Checked Material Compatibility</h2>
          <p className="text-xs text-slate-600">
            Evaluated directly against {model.name}'s documented nozzle temp, bed temp, enclosure, and nozzle hardness.
          </p>
        </div>
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-3 px-4 font-semibold">Material</th>
                <th className="py-3 px-4 font-semibold">Compatibility Status</th>
                <th className="py-3 px-4 font-semibold">Model-Specific Hardware Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {materialChecks.map(({ material, result }) => (
                <tr key={material.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-medium text-slate-900">{material.name}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {result.compatible === 'COMPATIBLE' && (
                      <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Compatible
                      </span>
                    )}
                    {result.compatible === 'CAUTION_UPGRADE_NEEDED' && (
                      <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Upgrade / Enclosure Needed
                      </span>
                    )}
                    {result.compatible === 'INCOMPATIBLE' && (
                      <span className="text-red-700 font-semibold">Exceeds Hardware Limits</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">{result.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {relatedErrorCodes.length > 0 && (
        <section className="space-y-3 pt-6 border-t border-slate-200">
          <h2 className="text-xl font-bold text-slate-950">{model.manufacturerName} Firmware Error Codes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relatedErrorCodes.map((err) => (
              <div key={err.id} className="p-4 border border-slate-200 rounded-xl bg-white space-y-1.5">
                <p className="font-mono text-sm font-bold text-slate-950">{err.code}</p>
                <p className="text-xs text-slate-700">{err.verifiedMeaning}</p>
                <Link
                  to={`/reference?code=${encodeURIComponent(err.code)}`}
                  className="inline-block text-xs font-semibold text-blue-600 hover:underline pt-1"
                >
                  View checks &amp; official source →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

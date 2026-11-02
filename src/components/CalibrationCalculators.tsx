import React, { useState, useMemo, useEffect } from 'react';
import { Copy, Check, AlertTriangle, CheckCircle2, Calculator } from 'lucide-react';

export type CalculatorSlug = 'esteps' | 'flow' | 'resin';

interface CalibrationCalculatorsProps {
  initialCalc?: string | null;
}

export const CalibrationCalculators: React.FC<CalibrationCalculatorsProps> = ({ initialCalc }) => {
  const [activeCalc, setActiveCalc] = useState<CalculatorSlug>('esteps');

  useEffect(() => {
    if (initialCalc === 'flow' || initialCalc === 'resin' || initialCalc === 'esteps') {
      setActiveCalc(initialCalc);
    }
  }, [initialCalc]);

  // --- 1. E-Steps & Klipper rotation_distance State ---
  const [firmwareMode, setFirmwareMode] = useState<'MARLIN' | 'KLIPPER'>('KLIPPER');
  const [measureMode, setMeasureMode] = useState<'MARK_120' | 'DIRECT'>('MARK_120');
  const [currentValue, setCurrentValue] = useState<string>('22.678');
  const [requestedMm, setRequestedMm] = useState<string>('100');
  const [markStartMm, setMarkStartMm] = useState<string>('120');
  const [remainingMm, setRemainingMm] = useState<string>('23.5');
  const [directActualMm, setDirectActualMm] = useState<string>('96.5');
  const [copiedEsteps, setCopiedEsteps] = useState(false);

  // Switch sensible default when toggling firmware
  function handleSwitchFirmware(mode: 'MARLIN' | 'KLIPPER') {
    setFirmwareMode(mode);
    if (mode === 'MARLIN' && Number(currentValue) < 55) {
      setCurrentValue('93.0');
    } else if (mode === 'KLIPPER' && Number(currentValue) >= 55) {
      setCurrentValue('22.678');
    }
  }

  const estepsResult = useMemo(() => {
    const cur = parseFloat(currentValue);
    const req = parseFloat(requestedMm);
    const startMark = parseFloat(markStartMm);
    const rem = parseFloat(remainingMm);
    const dir = parseFloat(directActualMm);

    const actualExtruded = measureMode === 'MARK_120' ? startMark - rem : dir;
    if (
      !Number.isFinite(cur) ||
      cur <= 0 ||
      !Number.isFinite(req) ||
      req <= 0 ||
      !Number.isFinite(actualExtruded) ||
      actualExtruded <= 0
    ) {
      return null;
    }

    // Marlin E-steps: newSteps = currentSteps * (requested / actual)
    // Klipper rotation_distance: newRD = currentRD * (actual / requested)
    const newValue =
      firmwareMode === 'MARLIN'
        ? cur * (req / actualExtruded)
        : cur * (actualExtruded / req);

    const errorPct = ((actualExtruded - req) / req) * 100;
    const severeSlipWarning = Math.abs(errorPct) > 15;

    const formattedValue =
      firmwareMode === 'MARLIN' ? newValue.toFixed(2) : newValue.toFixed(3);
    const snippet =
      firmwareMode === 'MARLIN'
        ? `M92 E${formattedValue}\nM500`
        : `rotation_distance: ${formattedValue}`;

    return {
      actualExtruded: Number(actualExtruded.toFixed(2)),
      formattedValue,
      errorPct: Number(errorPct.toFixed(1)),
      severeSlipWarning,
      snippet,
    };
  }, [
    firmwareMode,
    measureMode,
    currentValue,
    requestedMm,
    markStartMm,
    remainingMm,
    directActualMm,
  ]);

  // --- 2. Flow Rate / Extrusion Multiplier State ---
  const [flowMethod, setFlowMethod] = useState<'ORCA_TWO_PASS' | 'ORCA_YOLO' | 'WALL_CALIPER'>(
    'ORCA_TWO_PASS'
  );
  const [baseFlow, setBaseFlow] = useState<string>('0.98');
  const [pass1Mod, setPass1Mod] = useState<string>('5');
  const [pass2Mod, setPass2Mod] = useState<string>('0');
  const [yoloMod, setYoloMod] = useState<string>('-0.02');
  const [targetWallMm, setTargetWallMm] = useState<string>('0.42');
  const [measuredWall1, setMeasuredWall1] = useState<string>('0.44');
  const [measuredWall2, setMeasuredWall2] = useState<string>('0.45');
  const [measuredWall3, setMeasuredWall3] = useState<string>('0.44');
  const [measuredWall4, setMeasuredWall4] = useState<string>('0.45');
  const [copiedFlow, setCopiedFlow] = useState(false);

  const flowResult = useMemo(() => {
    const cur = parseFloat(baseFlow);
    if (!Number.isFinite(cur) || cur <= 0) return null;

    if (flowMethod === 'ORCA_TWO_PASS') {
      const p1 = parseFloat(pass1Mod);
      const p2 = parseFloat(pass2Mod || '0');
      if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
      const afterPass1 = (cur * (100 + p1)) / 100;
      const finalFlow = (afterPass1 * (100 + p2)) / 100;
      return {
        intermediateLabel: `Pass 1 Flow Ratio: ${afterPass1.toFixed(4)}`,
        finalFlow: finalFlow.toFixed(4),
        percentNote: `${(finalFlow * 100).toFixed(2)}% in Cura / Simplify3D`,
      };
    }

    if (flowMethod === 'ORCA_YOLO') {
      const mod = parseFloat(yoloMod);
      if (!Number.isFinite(mod)) return null;
      const finalFlow = cur + mod;
      if (finalFlow <= 0) return null;
      return {
        intermediateLabel: `Additive YOLO delta (${mod >= 0 ? `+${mod}` : mod})`,
        finalFlow: finalFlow.toFixed(4),
        percentNote: `${(finalFlow * 100).toFixed(2)}% in Cura / Simplify3D`,
      };
    }

    const target = parseFloat(targetWallMm);
    const walls = [measuredWall1, measuredWall2, measuredWall3, measuredWall4]
      .map((w) => parseFloat(w))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!Number.isFinite(target) || target <= 0 || walls.length === 0) return null;
    const avg = walls.reduce((acc, v) => acc + v, 0) / walls.length;
    const finalFlow = cur * (target / avg);
    return {
      intermediateLabel: `Average measured wall: ${avg.toFixed(3)} mm (Target: ${target.toFixed(2)} mm)`,
      finalFlow: finalFlow.toFixed(4),
      percentNote: `${(finalFlow * 100).toFixed(2)}% in Cura / Simplify3D`,
    };
  }, [
    flowMethod,
    baseFlow,
    pass1Mod,
    pass2Mod,
    yoloMod,
    targetWallMm,
    measuredWall1,
    measuredWall2,
    measuredWall3,
    measuredWall4,
  ]);

  // --- 3. MSLA Resin Exposure Dial-In State ---
  const [normalExpSec, setNormalExpSec] = useState<string>('2.4');
  const [bottomExpSec, setBottomExpSec] = useState<string>('28');
  const [layerHeightUm, setLayerHeightUm] = useState<'30' | '50' | '100'>('50');
  const [matrixOutcome, setMatrixOutcome] = useState<
    'HEAVY_UNDER' | 'SLIGHT_UNDER' | 'DIALED' | 'SLIGHT_OVER' | 'HEAVY_OVER'
  >('SLIGHT_UNDER');
  const [ambientTempBand, setAmbientTempBand] = useState<'COLD' | 'IDEAL' | 'WARM'>('IDEAL');

  const resinResult = useMemo(() => {
    const curNorm = parseFloat(normalExpSec);
    const curBot = parseFloat(bottomExpSec);
    if (!Number.isFinite(curNorm) || curNorm <= 0 || !Number.isFinite(curBot) || curBot <= 0) {
      return null;
    }

    let factor = 1.0;
    if (matrixOutcome === 'HEAVY_UNDER') factor = 1.22;
    if (matrixOutcome === 'SLIGHT_UNDER') factor = 1.1;
    if (matrixOutcome === 'SLIGHT_OVER') factor = 0.92;
    if (matrixOutcome === 'HEAVY_OVER') factor = 0.82;

    if (ambientTempBand === 'COLD') factor *= 1.12;
    if (ambientTempBand === 'WARM') factor *= 0.96;

    const nextNormal = Math.max(0.8, curNorm * factor);
    const recommendedBottomMin = Math.max(15, Math.round(nextNormal * 10));
    const recommendedBottomMax = Math.round(nextNormal * 14);
    const safeLiftNote =
      ambientTempBand === 'COLD'
        ? 'Cold resin (<20 °C) increases viscosity sharply: warm resin bottle/vat to 22–25 °C or slow initial stage-1 lift speed to 40–50 mm/min with a 1.0–1.5 s light-off / wait-before-print delay.'
        : layerHeightUm === '30'
        ? 'At 30 µm layers, add a 1.0 s Wait Before Print (Rest After Retract) to prevent blooming on fine miniatures.'
        : 'Standard two-stage lift (60 mm/min for first 2–3 mm peel, then 180 mm/min) keeps FEP/PFA peel forces low.';

    return {
      nextNormal: nextNormal.toFixed(2),
      deltaSec: (nextNormal - curNorm >= 0 ? '+' : '') + (nextNormal - curNorm).toFixed(2),
      recommendedBottomRange: `${recommendedBottomMin}–${recommendedBottomMax} s`,
      safeLiftNote,
    };
  }, [normalExpSec, bottomExpSec, layerHeightUm, matrixOutcome, ambientTempBand]);

  async function copySnippet(text: string, which: 'ESTEPS' | 'FLOW') {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'ESTEPS') {
        setCopiedEsteps(true);
        setTimeout(() => setCopiedEsteps(false), 2000);
      } else {
        setCopiedFlow(true);
        setTimeout(() => setCopiedFlow(false), 2000);
      }
    } catch {
      // Ignore clipboard failure
    }
  }

  return (
    <section className="space-y-6">
      {/* Sub-navigation between the 3 Workbench Calculators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          {
            slug: 'esteps' as const,
            title: '1. Extruder E-Steps & rotation_distance',
            desc: 'Mechanical filament feed distance math for Klipper & Marlin',
          },
          {
            slug: 'flow' as const,
            title: '2. Slicer Flow Rate / Extrusion Multiplier',
            desc: 'OrcaSlicer / Bambu Pass 1 & 2, YOLO, and caliper wall formulas',
          },
          {
            slug: 'resin' as const,
            title: '3. MSLA Resin Exposure Dial-In',
            desc: 'Normal exposure, bottom cure range & viscosity-safe peel guidance',
          },
        ].map((item) => {
          const active = activeCalc === item.slug;
          return (
            <button
              key={item.slug}
              type="button"
              onClick={() => setActiveCalc(item.slug)}
              className={`text-left p-4 rounded-xl border transition-all ${
                active
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 shadow-2xs'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <p className="text-sm font-bold text-slate-950 flex items-center gap-2">
                <Calculator className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.title}</span>
              </p>
              <p className="text-xs text-slate-600 mt-1">{item.desc}</p>
            </button>
          );
        })}
      </div>

      {/* CALCULATOR 1: EXTRUDER E-STEPS / ROTATION DISTANCE */}
      {activeCalc === 'esteps' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 bg-white space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Extruder E-Steps &amp; Klipper <code className="font-mono text-base">rotation_distance</code>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Calibrate in free air (or slowly at full printing temp) so hotend back-pressure does not skew mechanical gear calibration.
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSwitchFirmware('KLIPPER')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                    firmwareMode === 'KLIPPER' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Klipper
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchFirmware('MARLIN')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                    firmwareMode === 'MARLIN' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Marlin (M92)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label htmlFor="calc-cur-val" className="block font-semibold text-slate-800 mb-1">
                  {firmwareMode === 'KLIPPER'
                    ? 'Current rotation_distance (mm)'
                    : 'Current E-Steps (steps/mm)'}
                </label>
                <input
                  id="calc-cur-val"
                  type="number"
                  step="any"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label htmlFor="calc-req-mm" className="block font-semibold text-slate-800 mb-1">
                  Commanded Extrusion Length (mm)
                </label>
                <input
                  id="calc-req-mm"
                  type="number"
                  step="any"
                  value={requestedMm}
                  onChange={(e) => setRequestedMm(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">Measurement Method:</span>
                <button
                  type="button"
                  onClick={() => setMeasureMode('MARK_120')}
                  className={`px-3 py-1 rounded-md border font-medium ${
                    measureMode === 'MARK_120'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-300 text-slate-600'
                  }`}
                >
                  Mark at 120 mm &amp; Measure Remaining
                </button>
                <button
                  type="button"
                  onClick={() => setMeasureMode('DIRECT')}
                  className={`px-3 py-1 rounded-md border font-medium ${
                    measureMode === 'DIRECT'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-300 text-slate-600'
                  }`}
                >
                  Enter Actual Extruded Length Directly
                </button>
              </div>

              {measureMode === 'MARK_120' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label htmlFor="calc-mark-start" className="block font-semibold text-slate-800 mb-1">
                      Initial Reference Mark Above Inlet (mm)
                    </label>
                    <input
                      id="calc-mark-start"
                      type="number"
                      step="any"
                      value={markStartMm}
                      onChange={(e) => setMarkStartMm(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="calc-rem-mm" className="block font-semibold text-slate-800 mb-1">
                      Remaining Distance to Mark After Extruding (mm)
                    </label>
                    <input
                      id="calc-rem-mm"
                      type="number"
                      step="any"
                      value={remainingMm}
                      onChange={(e) => setRemainingMm(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs">
                  <label htmlFor="calc-direct-mm" className="block font-semibold text-slate-800 mb-1">
                    Measured Filament Pulled Into Extruder (mm)
                  </label>
                  <input
                    id="calc-direct-mm"
                    type="number"
                    step="any"
                    value={directActualMm}
                    onChange={(e) => setDirectActualMm(e.target.value)}
                    className="w-full sm:w-64 px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 bg-white space-y-4">
            <h3 className="text-sm font-bold text-slate-950">
              Calculated Result
            </h3>
            {estepsResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#f6f9fc] border border-slate-200/80 space-y-1">
                  <p className="text-xs text-slate-600">
                    New {firmwareMode === 'KLIPPER' ? 'Klipper rotation_distance' : 'Marlin E-Steps'}
                  </p>
                  <p className="text-3xl font-bold font-mono text-slate-950 tabular-nums">
                    {estepsResult.formattedValue}
                    <span className="text-sm font-sans font-medium text-slate-500 ml-2">
                      {firmwareMode === 'KLIPPER' ? 'mm' : 'steps/mm'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 tabular-nums pt-1">
                    Actual filament pulled: <strong>{estepsResult.actualExtruded} mm</strong> (
                    {estepsResult.errorPct >= 0 ? `+${estepsResult.errorPct}%` : `${estepsResult.errorPct}%`})
                  </p>
                </div>

                {estepsResult.severeSlipWarning && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>Mechanical Slip Check:</strong> Over 15% discrepancy usually indicates a partial nozzle clog, low extruder idler tension, or extruding too fast (`F60` / 1 mm/s is recommended) rather than a firmware constant error.
                    </span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      {firmwareMode === 'KLIPPER'
                        ? 'Paste into printer.cfg [extruder]'
                        : 'Send via G-code Console'}
                    </span>
                    <button
                      type="button"
                      onClick={() => copySnippet(estepsResult.snippet, 'ESTEPS')}
                      className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"
                    >
                      {copiedEsteps ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedEsteps ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto">
                    {estepsResult.snippet}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Enter positive numeric measurements to calculate.</p>
            )}
          </div>
        </div>
      )}

      {/* CALCULATOR 2: FLOW RATE / EXTRUSION MULTIPLIER */}
      {activeCalc === 'flow' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 bg-white space-y-5">
            <div className="space-y-1 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-950">
                Slicer Flow Rate / Extrusion Multiplier Calculator
              </h2>
              <p className="text-xs text-slate-600">
                Tune per filament profile after verifying extruder mechanical steps and printing temperature.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { id: 'ORCA_TWO_PASS' as const, label: 'Orca / Bambu Studio (Pass 1 & 2)' },
                { id: 'ORCA_YOLO' as const, label: 'OrcaSlicer YOLO Mode' },
                { id: 'WALL_CALIPER' as const, label: 'Hollow Cube Wall Thickness' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFlowMethod(m.id)}
                  className={`px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                    flowMethod === m.id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label htmlFor="flow-base" className="block font-semibold text-slate-800 mb-1">
                  Current Filament Flow Ratio (e.g. 0.98)
                </label>
                <input
                  id="flow-base"
                  type="number"
                  step="0.001"
                  value={baseFlow}
                  onChange={(e) => setBaseFlow(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {flowMethod === 'ORCA_TWO_PASS' && (
                <>
                  <div>
                    <label htmlFor="flow-p1" className="block font-semibold text-slate-800 mb-1">
                      Best Pass 1 Chip Label (-20 to +20)
                    </label>
                    <input
                      id="flow-p1"
                      type="number"
                      step="1"
                      value={pass1Mod}
                      onChange={(e) => setPass1Mod(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="flow-p2" className="block font-semibold text-slate-800 mb-1">
                      Best Pass 2 Chip Label (0 down to -9, leave 0 if only running Pass 1)
                    </label>
                    <input
                      id="flow-p2"
                      type="number"
                      step="1"
                      value={pass2Mod}
                      onChange={(e) => setPass2Mod(e.target.value)}
                      className="w-full sm:w-64 px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </>
              )}

              {flowMethod === 'ORCA_YOLO' && (
                <div>
                  <label htmlFor="flow-yolo" className="block font-semibold text-slate-800 mb-1">
                    Best YOLO Chip Modifier (e.g. -0.02 or +0.03)
                  </label>
                  <input
                    id="flow-yolo"
                    type="number"
                    step="0.005"
                    value={yoloMod}
                    onChange={(e) => setYoloMod(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              {flowMethod === 'WALL_CALIPER' && (
                <div>
                  <label htmlFor="flow-target-wall" className="block font-semibold text-slate-800 mb-1">
                    Sliced Single-Wall Line Width (mm)
                  </label>
                  <input
                    id="flow-target-wall"
                    type="number"
                    step="0.01"
                    value={targetWallMm}
                    onChange={(e) => setTargetWallMm(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}
            </div>

            {flowMethod === 'WALL_CALIPER' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-100">
                {[
                  { label: 'Wall 1 (mm)', val: measuredWall1, set: setMeasuredWall1 },
                  { label: 'Wall 2 (mm)', val: measuredWall2, set: setMeasuredWall2 },
                  { label: 'Wall 3 (mm)', val: measuredWall3, set: setMeasuredWall3 },
                  { label: 'Wall 4 (mm)', val: measuredWall4, set: setMeasuredWall4 },
                ].map((w, idx) => (
                  <div key={idx}>
                    <label className="block font-semibold text-slate-700 mb-1">{w.label}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={w.val}
                      onChange={(e) => w.set(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 bg-white space-y-4">
            <h3 className="text-sm font-bold text-slate-950">
              Calculated Flow Ratio
            </h3>
            {flowResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#f6f9fc] border border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Orca / Bambu / PrusaSlicer Ratio</span>
                    <button
                      type="button"
                      onClick={() => copySnippet(flowResult.finalFlow, 'FLOW')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      {copiedFlow ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedFlow ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-3xl font-bold font-mono text-slate-950 tabular-nums">
                    {flowResult.finalFlow}
                  </p>
                  <p className="text-xs text-slate-600 pt-1">{flowResult.intermediateLabel}</p>
                  <p className="text-xs text-slate-500">{flowResult.percentNote}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    Recommended calibration order: <strong>1. Dry Filament → 2. Temperature Tower → 3. Flow Ratio → 4. Pressure Advance / K-Factor</strong>.
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Enter valid positive numbers to compute flow ratio.</p>
            )}
          </div>
        </div>
      )}

      {/* CALCULATOR 3: MSLA RESIN EXPOSURE DIAL-IN */}
      {activeCalc === 'resin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 bg-white space-y-5">
            <div className="space-y-1 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-950">
                MSLA Resin Exposure &amp; Peel Safety Helper
              </h2>
              <p className="text-xs text-slate-600">
                Interpret Validation Matrix or Cones of Calibration prints and compensate for cold workshop resin viscosity.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="resin-norm" className="block font-semibold text-slate-800 mb-1">
                  Current Normal Exposure (s)
                </label>
                <input
                  id="resin-norm"
                  type="number"
                  step="0.1"
                  value={normalExpSec}
                  onChange={(e) => setNormalExpSec(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="resin-bot" className="block font-semibold text-slate-800 mb-1">
                  Current Bottom Exposure (s)
                </label>
                <input
                  id="resin-bot"
                  type="number"
                  step="1"
                  value={bottomExpSec}
                  onChange={(e) => setBottomExpSec(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="resin-lh" className="block font-semibold text-slate-800 mb-1">
                  Layer Height (µm)
                </label>
                <select
                  id="resin-lh"
                  value={layerHeightUm}
                  onChange={(e) => setLayerHeightUm(e.target.value as '30' | '50' | '100')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="30">30 µm (0.03 mm Detail)</option>
                  <option value="50">50 µm (0.05 mm Standard)</option>
                  <option value="100">100 µm (0.10 mm Draft)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label htmlFor="resin-outcome" className="block font-semibold text-slate-800 mb-1">
                  Calibration Print Observation
                </label>
                <select
                  id="resin-outcome"
                  value={matrixOutcome}
                  onChange={(e) => setMatrixOutcome(e.target.value as typeof matrixOutcome)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="HEAVY_UNDER">Heavily under-exposed (Success cones failed / missing pins)</option>
                  <option value="SLIGHT_UNDER">Slightly under-exposed (More pins than holes / soft tips)</option>
                  <option value="DIALED">Crisp &amp; balanced (Equal pins/holes, clean dimensional fit)</option>
                  <option value="SLIGHT_OVER">Slightly over-exposed (Failure cones forming / tight holes)</option>
                  <option value="HEAVY_OVER">Heavily over-exposed (Fused slots / swollen details)</option>
                </select>
              </div>

              <div>
                <label htmlFor="resin-temp" className="block font-semibold text-slate-800 mb-1">
                  Resin / Enclosure Temperature
                </label>
                <select
                  id="resin-temp"
                  value={ambientTempBand}
                  onChange={(e) => setAmbientTempBand(e.target.value as typeof ambientTempBand)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="COLD">Cold Garage / Room (&lt; 20 °C / 68 °F)</option>
                  <option value="IDEAL">Ideal Vat Temperature (21–26 °C / 70–79 °F)</option>
                  <option value="WARM">Warm / Heated Vat (&gt; 27 °C / 80 °F)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 bg-white space-y-4">
            <h3 className="text-sm font-bold text-slate-950">
              Recommended Next Test Settings
            </h3>
            {resinResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#f6f9fc] border border-slate-200/80 space-y-1">
                  <p className="text-xs text-slate-600">Suggested Normal Exposure</p>
                  <p className="text-3xl font-bold font-mono text-slate-950 tabular-nums">
                    {resinResult.nextNormal} s
                    <span className="text-xs font-sans font-semibold text-blue-700 ml-2">
                      ({resinResult.deltaSec} s)
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 pt-1">
                    Suggested Bottom Exposure Range: <strong>{resinResult.recommendedBottomRange}</strong>
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-900 leading-relaxed">
                  <strong className="text-blue-950">Motion &amp; Viscosity Note: </strong>
                  {resinResult.safeLiftNote}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Enter positive exposure values to compute recommendation.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

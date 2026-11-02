import React, { useState } from 'react';
import type { ImageAssetDTO } from '../types/domain.ts';

interface FaultDiagramProps {
  faultCode: string;
  className?: string;
}

export const TechnicalFaultDiagram: React.FC<FaultDiagramProps> = ({ faultCode, className = 'w-full h-44' }) => {
  switch (faultCode) {
    case 'nozzle_too_high':
    case 'first_layer_not_sticking':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="Technical cross-section showing nozzle too high above build plate with round unbonded filament strands">
          <rect x="20" y="122" width="280" height="16" rx="2" fill="#cbd5e1" />
          <line x1="20" y1="122" x2="300" y2="122" stroke="#475569" strokeWidth="2" />
          {/* Nozzle */}
          <polygon points="142,24 178,24 172,58 164,74 156,74 148,58" fill="#64748b" />
          <rect x="157" y="74" width="6" height="8" fill="#d97706" />
          {/* Round un-squished strands */}
          <circle cx="92" cy="112" r="9" fill="#2563eb" />
          <circle cx="122" cy="112" r="9" fill="#2563eb" />
          <circle cx="160" cy="108" r="9" fill="#2563eb" />
          <path d="M160 82 Q 165 98 188 104 T 236 113" fill="none" stroke="#2563eb" strokeWidth="8" strokeLinecap="round" />
          {/* Clearance dimension */}
          <line x1="195" y1="82" x2="235" y2="82" stroke="#dc2626" strokeDasharray="3 3" />
          <text x="204" y="46" fontSize="11" fontWeight="600" fill="#0f172a">Z-Gap Too High</text>
          <text x="204" y="61" fontSize="10" fill="#475569">Round bead · zero squish</text>
        </svg>
      );

    case 'nozzle_too_low':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="Technical cross-section showing nozzle scraping too close to build plate with ploughed ridges">
          <rect x="20" y="122" width="280" height="16" rx="2" fill="#cbd5e1" />
          <line x1="20" y1="122" x2="300" y2="122" stroke="#475569" strokeWidth="2" />
          {/* Nozzle pushed right down */}
          <polygon points="142,58 178,58 172,94 164,116 156,116 148,94" fill="#64748b" />
          {/* Ploughed side ridges */}
          <path d="M75 121 L95 113 L103 121 L125 112 L133 121 L188 121 L196 111 L210 121" fill="#2563eb" opacity="0.85" />
          <text x="24" y="44" fontSize="11" fontWeight="600" fill="#dc2626">Z-Gap Too Low (&lt;0.05 mm)</text>
          <text x="24" y="59" fontSize="10" fill="#475569">Ploughed side ridges &amp; backpressure</text>
        </svg>
      );

    case 'uneven_squish':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="Technical diagram showing tilted bed plane with good squish on left and loose round beads on right">
          <polygon points="24,114 296,134 296,146 24,126" fill="#cbd5e1" />
          <line x1="24" y1="114" x2="296" y2="134" stroke="#475569" strokeWidth="2" />
          {/* Left squished stadium beads */}
          <rect x="46" y="107" width="28" height="7" rx="3.5" fill="#16a34a" />
          <rect x="76" y="109" width="28" height="7" rx="3.5" fill="#16a34a" />
          {/* Right loose round beads */}
          <circle cx="220" cy="118" r="7" fill="#dc2626" />
          <circle cx="250" cy="121" r="7" fill="#dc2626" />
          <text x="28" y="42" fontSize="11" fontWeight="600" fill="#0f172a">Plane Tilt / Uncompensated Mesh</text>
          <text x="28" y="57" fontSize="10" fill="#475569">Fused left side · detached right side</text>
        </svg>
      );

    case 'corners_warping':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="Diagram showing thermal contraction curling bottom corners upward off heated bed">
          <rect x="20" y="124" width="280" height="14" rx="2" fill="#cbd5e1" />
          <path d="M60 108 Q 110 124 160 124 Q 210 124 260 108 L 254 68 L 66 68 Z" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
          {/* Upward curl arrows */}
          <path d="M52 118 L52 94 M47 99 L52 94 L57 99" stroke="#d97706" strokeWidth="2" fill="none" />
          <path d="M268 118 L268 94 M263 99 L268 94 L273 99" stroke="#d97706" strokeWidth="2" fill="none" />
          <text x="86" y="44" fontSize="11" fontWeight="600" fill="#0f172a">Upper Layer Thermal Shrinkage</text>
          <text x="98" y="88" fontSize="10" fill="#1e3a8a">Internal cooling stress</text>
        </svg>
      );

    case 'clogged_nozzle':
    case 'heat_creep':
    case 'filament_grinding':
    case 'under_extrusion':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="Hotend cross-section showing heat creep bulge and extruder gear grinding notch">
          {/* Extruder gears */}
          <circle cx="136" cy="36" r="14" fill="none" stroke="#334155" strokeWidth="3" strokeDasharray="4 2" />
          <circle cx="184" cy="36" r="14" fill="none" stroke="#334155" strokeWidth="3" strokeDasharray="4 2" />
          {/* Heatsink fins */}
          <rect x="130" y="60" width="60" height="6" fill="#94a3b8" />
          <rect x="130" y="70" width="60" height="6" fill="#94a3b8" />
          <rect x="130" y="80" width="60" height="6" fill="#94a3b8" />
          {/* Heater block */}
          <rect x="138" y="96" width="44" height="24" rx="2" fill="#f59e0b" opacity="0.25" stroke="#d97706" strokeWidth="1.5" />
          <polygon points="150,120 170,120 163,138 157,138" fill="#b45309" />
          {/* Filament path with grinding notch & heat-creep plug */}
          <path d="M155 12 L155 30 Q159 36 155 42 L155 76 L151 92 L169 92 L165 76 L165 12 Z" fill="#2563eb" />
          <circle cx="160" cy="128" r="4" fill="#dc2626" />
          <text x="198" y="39" fontSize="10" fontWeight="600" fill="#dc2626">Gear grind</text>
          <text x="198" y="88" fontSize="10" fontWeight="600" fill="#b45309">Heat-creep plug</text>
          <text x="198" y="131" fontSize="10" fill="#475569">Carbonized clog</text>
        </svg>
      );

    case 'over_extrusion':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="Cross-section of over-extruded layers bulging outward beyond nominal perimeter width">
          <line x1="90" y1="30" x2="90" y2="135" stroke="#94a3b8" strokeDasharray="4 3" />
          <line x1="230" y1="30" x2="230" y2="135" stroke="#94a3b8" strokeDasharray="4 3" />
          {[112, 94, 76, 58].map((y, idx) => (
            <rect key={idx} x="78" y={y} width="164" height="20" rx="10" fill="#2563eb" opacity="0.85" stroke="#1e40af" />
          ))}
          <text x="96" y="42" fontSize="11" fontWeight="600" fill="#0f172a">Flow Ratio Excess (&gt;100%)</text>
        </svg>
      );

    case 'stringing':
    case 'blobs_and_zits':
    case 'poor_bridging':
    case 'gaps_between_walls':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="Two printed pillars with travel stringing wisps and perimeter zits">
          <rect x="64" y="40" width="44" height="96" rx="2" fill="#3b82f6" />
          <rect x="212" y="40" width="44" height="96" rx="2" fill="#3b82f6" />
          <line x1="108" y1="54" x2="212" y2="58" stroke="#60a5fa" strokeWidth="1.5" />
          <line x1="108" y1="74" x2="212" y2="70" stroke="#60a5fa" strokeWidth="1.2" />
          <line x1="108" y1="96" x2="212" y2="99" stroke="#60a5fa" strokeWidth="1.5" />
          <circle cx="110" cy="74" r="3.5" fill="#1d4ed8" />
          <circle cx="210" cy="58" r="3.5" fill="#1d4ed8" />
          <rect x="40" y="136" width="240" height="8" fill="#cbd5e1" />
          <text x="116" y="32" fontSize="11" fontWeight="600" fill="#0f172a">Travel Ooze &amp; Seam Zits</text>
        </svg>
      );

    case 'layer_shifting':
    case 'ringing_ghosting':
    case 'spaghetti_failure':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="Printed block exhibiting sudden X-axis horizontal layer shift">
          <rect x="40" y="132" width="240" height="10" fill="#cbd5e1" />
          <rect x="90" y="88" width="110" height="44" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
          <rect x="118" y="44" width="110" height="44" fill="#bfdbfe" stroke="#dc2626" strokeWidth="2" />
          <path d="M90 66 L112 66 M107 61 L112 66 L107 71" stroke="#dc2626" strokeWidth="2" fill="none" />
          <text x="36" y="32" fontSize="11" fontWeight="600" fill="#0f172a">ΔX Step Loss / Pulley Slip</text>
        </svg>
      );

    case 'resin_adhesion_failure':
    case 'resin_supports_failing':
    case 'resin_layer_separation':
    case 'resin_screen_exposure':
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="MSLA resin build plate above vat showing peel suction and support tip separation">
          {/* Top build plate */}
          <rect x="138" y="14" width="44" height="14" fill="#64748b" />
          <rect x="76" y="28" width="168" height="12" fill="#475569" />
          {/* Supports */}
          {[96, 116, 136, 156, 176, 196, 216].map((x) => (
            <line key={x} x1={x} y1="40" x2={x} y2="74" stroke="#64748b" strokeWidth="2.5" />
          ))}
          {/* Delaminated resin part */}
          <polygon points="90,74 224,74 214,96 100,96" fill="#94a3b8" />
          <polygon points="104,104 210,104 196,120 118,120" fill="#dc2626" opacity="0.8" />
          {/* Resin vat */}
          <path d="M48 112 L48 140 L272 140 L272 112" fill="none" stroke="#0f172a" strokeWidth="3" />
          <line x1="50" y1="138" x2="270" y2="138" stroke="#3b82f6" strokeWidth="2" />
          <text x="58" y="154" fontSize="10" fill="#1e3a8a">405nm UV Mono LCD + PFA Release Film</text>
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 320 160" className={`bg-slate-50 ${className}`} role="img" aria-label="3D printer diagnostic schematic">
          <rect x="80" y="32" width="160" height="96" rx="6" fill="none" stroke="#64748b" strokeWidth="2" />
          <line x1="96" y1="64" x2="224" y2="64" stroke="#94a3b8" strokeWidth="2" />
          <polygon points="152,64 168,64 160,82" fill="#2563eb" />
          <line x1="104" y1="108" x2="216" y2="108" stroke="#334155" strokeWidth="3" />
          <text x="102" y="146" fontSize="10" fill="#475569">Sensor &amp; Kinematics Check</text>
        </svg>
      );
  }
};

interface ResilientFaultVisualProps {
  asset?: ImageAssetDTO | null;
  faultCode?: string | null;
  preferDiagram?: boolean;
  className?: string;
}

export const ResilientFaultVisual: React.FC<ResilientFaultVisualProps> = ({
  asset,
  faultCode,
  preferDiagram = false,
  className = 'w-full h-44',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (!preferDiagram && asset?.url && !imgFailed) {
    return (
      <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
        <img
          src={asset.url}
          alt={asset.altText}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return <TechnicalFaultDiagram faultCode={faultCode || asset?.diagramType || 'default'} className={className} />;
};

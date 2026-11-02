import React from 'react';
import type { PrinterModelDTO, PrinterTechnology } from '../types/domain.ts';

interface PrinterSilhouetteProps {
  model?: PrinterModelDTO | null;
  technology?: PrinterTechnology;
  className?: string;
}

export type HardwareArchetype =
  | 'ENCLOSED_COREXY'
  | 'OPEN_CARTESIAN'
  | 'DELTA_FDM'
  | 'MSLA_RESIN';

export function resolveHardwareArchetype(
  model?: PrinterModelDTO | null,
  fallbackTech: PrinterTechnology = 'FDM'
): { archetype: HardwareArchetype; label: string } {
  const tech = model?.technology || fallbackTech;
  if (tech === 'RESIN') {
    return { archetype: 'MSLA_RESIN', label: 'MSLA Vat Photopolymer' };
  }

  const motion = (model?.fdmSpecs?.motionSystem || '').toLowerCase();
  const enclosure = (model?.fdmSpecs?.enclosureType || '').toLowerCase();

  if (motion.includes('delta')) {
    return { archetype: 'DELTA_FDM', label: 'Delta Kinematics FDM' };
  }
  if (
    motion.includes('corexy') &&
    (enclosure.includes('enclosed') || enclosure.includes('chamber') || !enclosure.includes('open'))
  ) {
    return { archetype: 'ENCLOSED_COREXY', label: 'Enclosed CoreXY FDM' };
  }
  if (motion.includes('corexy')) {
    return { archetype: 'ENCLOSED_COREXY', label: 'Open-Frame CoreXY FDM' };
  }
  return { archetype: 'OPEN_CARTESIAN', label: 'Cartesian / Cantilever FDM' };
}

export const PrinterSilhouette: React.FC<PrinterSilhouetteProps> = ({
  model,
  technology = 'FDM',
  className = 'w-14 h-14',
}) => {
  const { archetype } = resolveHardwareArchetype(model, technology);

  if (archetype === 'MSLA_RESIN') {
    return (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <rect x="14" y="8" width="36" height="32" rx="4" fill="#E0F0FF" stroke="#0070E0" strokeWidth="2" />
        <line x1="32" y1="12" x2="32" y2="27" stroke="#0B1A2A" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="23" y="26" width="18" height="3.5" rx="1" fill="#0B1A2A" />
        <rect x="18" y="35" width="28" height="5" rx="1.5" fill="#4DA8FF" stroke="#005BB8" strokeWidth="1.5" />
        <rect x="12" y="40" width="40" height="16" rx="3" fill="#FFFFFF" stroke="#0B1A2A" strokeWidth="2" />
        <rect x="25" y="45" width="14" height="6" rx="1.5" fill="#EFF7FF" stroke="#0070E0" strokeWidth="1.5" />
      </svg>
    );
  }

  if (archetype === 'DELTA_FDM') {
    return (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <rect x="14" y="8" width="36" height="6" rx="2" fill="#0B1A2A" />
        <line x1="17" y1="14" x2="17" y2="50" stroke="#0B1A2A" strokeWidth="2.2" />
        <line x1="47" y1="14" x2="47" y2="50" stroke="#0B1A2A" strokeWidth="2.2" />
        <line x1="32" y1="14" x2="32" y2="50" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="2 2" />
        <line x1="17" y1="22" x2="32" y2="34" stroke="#0070E0" strokeWidth="2" />
        <line x1="47" y1="22" x2="32" y2="34" stroke="#0070E0" strokeWidth="2" />
        <rect x="28" y="32" width="8" height="6" rx="1.5" fill="#0070E0" />
        <ellipse cx="32" cy="48" rx="13" ry="3" fill="#E0F0FF" stroke="#0070E0" strokeWidth="1.6" />
        <rect x="13" y="50" width="38" height="6" rx="2" fill="#0B1A2A" />
      </svg>
    );
  }

  if (archetype === 'ENCLOSED_COREXY') {
    return (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <rect x="11" y="9" width="42" height="46" rx="5" fill="#FFFFFF" stroke="#0B1A2A" strokeWidth="2" />
        <rect x="16" y="15" width="32" height="31" rx="2.5" fill="#F0F7FF" stroke="#BFE0FF" strokeWidth="1.5" />
        <line x1="16" y1="21" x2="48" y2="21" stroke="#0B1A2A" strokeWidth="2" />
        <rect x="28" y="17" width="8" height="10" rx="2" fill="#0070E0" />
        <path d="M31 27L32 30L33 27H31Z" fill="#0B1A2A" />
        <rect x="20" y="39" width="24" height="3" rx="1" fill="#0B1A2A" />
        <rect x="25" y="33" width="14" height="6" rx="1" fill="#4DA8FF" opacity="0.85" />
        <rect x="26" y="49" width="12" height="3" rx="1" fill="#0070E0" />
      </svg>
    );
  }

  // Default: OPEN_CARTESIAN / Bed-Slinger / Cantilever
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M17 48V12H47V48" stroke="#0B1A2A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="14" y1="26" x2="50" y2="26" stroke="#0B1A2A" strokeWidth="2" />
      <rect x="28" y="21" width="9" height="10" rx="2" fill="#0070E0" />
      <path d="M31.5 31L32.5 34L33.5 31H31.5Z" fill="#0B1A2A" />
      <rect x="26" y="36" width="13" height="6" rx="1" fill="#E0F0FF" stroke="#0070E0" strokeWidth="1.5" />
      <line x1="18" y1="43" x2="46" y2="43" stroke="#0070E0" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="12" y="48" width="40" height="7" rx="2.5" fill="#0B1A2A" />
    </svg>
  );
};

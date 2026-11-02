export type PrinterTechnology = 'FDM' | 'RESIN';

export type BedLevelingCategory =
  | 'MANUAL_SCREWS_WHEELS'
  | 'AUTO_PROBE_MESH'
  | 'AUTO_LOAD_CELL_NOZZLE'
  | 'STRAIN_GAUGE_INTEGRATED'
  | 'MANUFACTURER_AUTO_SYSTEM'
  | 'HYBRID_MANUAL_AND_AUTO'
  | 'FIXED_MECHANICAL_BED'
  | 'NOT_APPLICABLE_RESIN'
  | 'UNKNOWN_INSUFFICIENT_DOCS';

export type VerificationStatus = 'VERIFIED' | 'PARTIAL' | 'COMMUNITY_CORROBORATED' | 'UNVERIFIED' | 'OUTDATED';

export type ReleaseStatus = 'CURRENT' | 'DISCONTINUED' | 'LEGACY_SUPPORTED' | 'OPEN_SOURCE_KIT';

export type ConfidenceBadge = 'Strong match' | 'Possible cause' | 'Needs checking';

export interface ManufacturerDTO {
  id: string;
  slug: string;
  name: string;
  country: string;
  websiteUrl: string;
  supportUrl: string;
  supportsFdm: boolean;
  supportsResin: boolean;
  isCommunityOpenSource: boolean;
  notes: string;
  modelCount?: number;
}

export interface SourceReferenceDTO {
  id: string;
  entityType: 'PRINTER_MODEL' | 'REPAIR_GUIDE' | 'ERROR_CODE' | 'MATERIAL' | 'MAINTENANCE';
  entityId: string;
  title: string;
  url: string;
  sourceType: 'OFFICIAL_PRODUCT_PAGE' | 'OFFICIAL_MANUAL' | 'OFFICIAL_WIKI' | 'OFFICIAL_GITHUB' | 'TECHNICAL_CORROBORATION' | 'COMMUNITY_DOCUMENTATION';
  sectionReference: string | null;
  verifiedDate: string;
  verificationStatus: VerificationStatus;
}

export interface PrinterVariantDTO {
  id: string;
  modelId: string;
  name: string;
  notes: string;
  differencesJson: string[];
}

export interface FdmSpecs {
  buildVolumeMm: { x: number; y: number; z: number; shape?: 'RECTANGULAR' | 'DELTA_CYLINDRICAL' };
  motionSystem: 'CoreXY' | 'Cartesian Bed-Slinger' | 'Cartesian Flying-Gantry' | 'Delta' | 'CoreXZ' | 'Cartesian Z-Bed';
  enclosureType: 'Fully Enclosed' | 'Enclosed with Active Chamber Heater' | 'Open Frame' | 'Optional Enclosure';
  extruderType: 'Direct Drive' | 'Bowden' | 'Dual Direct Drive (IDEX / Toolchanger)' | 'Dual Bowden';
  hotendType: string;
  standardNozzleMm: number;
  supportedNozzlesMm: number[];
  maxNozzleTempC: number | null;
  maxBedTempC: number | null;
  activeChamberTempC?: number | null;
  buildPlateType: string;
  bedLevelingCategory: BedLevelingCategory;
  bedLevelingHardware: string;
  hasManualBedScrews: boolean;
  manualTrammingProcedureAllowed: boolean;
  zOffsetMethod: string;
  autoMeshCapable: boolean;
  autoZOffsetCapable: boolean;
  inputShapingCapable: boolean;
  filamentRunoutSensor: boolean;
  filamentTangleSensor: boolean;
  powerLossRecovery: boolean;
  cameraMonitoring: string;
  multiMaterialSystem: string | null;
  supportedFilaments: string[];
  firmwareFamily: 'Klipper' | 'Marlin' | 'Bambu Proprietary' | 'Prusa Buddy Firmware' | 'RepRap / Custom' | 'UltiMaker Griffin';
  connectivity: string[];
  compatibleSlicers: string[];
  calibrationMenuPath: string | null;
  knownLimitations: string[];
}

export interface ResinSpecs {
  buildVolumeMm: { x: number; y: number; z: number };
  screenTechnology: string;
  resolutionPixels: string;
  xyResolutionMicrons: string;
  lightSource: string;
  releaseFilmType: string;
  vatHeatingCapable: boolean;
  levelingMechanism: 'Auto Spring/Sensor Leveling' | '4-Point Allen Screw Ball-Joint' | '4-Point Flange Plate' | 'Factory Pre-Calibrated LFD';
  hasManualLevelingScrews: boolean;
  resinLevelSensor: boolean;
  cameraMonitoring: string;
  connectivity: string[];
  compatibleSlicers: string[];
  calibrationMenuPath: string | null;
  knownLimitations: string[];
}

export interface PrinterModelDTO {
  id: string;
  slug: string;
  manufacturerId: string;
  manufacturerName?: string;
  manufacturerSlug?: string;
  name: string;
  family: string;
  generation: string;
  technology: PrinterTechnology;
  releaseStatus: ReleaseStatus;
  bedLevelingCategory: BedLevelingCategory;
  completenessStatus: VerificationStatus;
  lastVerifiedDate: string;
  summary: string;
  officialManualUrl: string | null;
  officialSupportUrl: string | null;
  imageAssetId: string | null;
  fdmSpecs: FdmSpecs | null;
  resinSpecs: ResinSpecs | null;
  variants?: PrinterVariantDTO[];
  sources?: SourceReferenceDTO[];
}

export interface ImageAssetDTO {
  id: string;
  title: string;
  url: string | null;
  diagramType: string | null;
  altText: string;
  caption: string;
  license: string;
  attribution: string;
}

export interface DiagnosticCategoryDTO {
  id: string;
  slug: string;
  title: string;
  technology: 'FDM' | 'RESIN' | 'BOTH';
  shortDescription: string;
  visualFaultCode: string;
  imageAssetId: string | null;
  sortOrder: number;
}

export interface DiagnosticOptionDTO {
  id: string;
  questionId: string;
  label: string;
  explanation: string;
  visualFaultCode: string | null;
  imageAssetId: string | null;
}

export interface QuestionCondition {
  technologies?: PrinterTechnology[];
  requireManualBedScrews?: boolean;
  forbidManualBedScrews?: boolean;
  requireAutoLeveling?: boolean;
  requireMultiMaterial?: boolean;
  requireFilamentSensor?: boolean;
  requirePreviousOptionIds?: string[];
  excludePreviousOptionIds?: string[];
  categoryIds?: string[];
}

export interface DiagnosticQuestionDTO {
  id: string;
  categoryId: string | null;
  code: string;
  prompt: string;
  helpText: string;
  stepOrder: number;
  conditions: QuestionCondition;
  options: DiagnosticOptionDTO[];
}

export interface CauseCondition {
  technologies?: PrinterTechnology[];
  categoryIds?: string[];
  allowedBedLevelingCategories?: BedLevelingCategory[];
  forbiddenBedLevelingCategories?: BedLevelingCategory[];
  requireManualTrammingAllowed?: boolean;
  requireAutoLeveling?: boolean;
  requireFilamentSensor?: boolean;
  requireMultiMaterial?: boolean;
  matchingOptionIds: string[];
  contradictingOptionIds?: string[];
  baseWeight: number;
}

export interface DiagnosticCauseDTO {
  id: string;
  code: string;
  title: string;
  technology: PrinterTechnology;
  plainExplanation: string;
  distinguishingChecks: string[];
  safetyNotes: string | null;
  isManualBedLevelingProcedure: boolean;
  recommendedGuideSlug: string | null;
  conditions: CauseCondition;
}

export interface RankedCauseResult {
  cause: DiagnosticCauseDTO;
  confidenceLabel: ConfidenceBadge;
  matchedReasons: string[];
  modelSpecificNote: string | null;
  score: number;
}

export interface RepairStepDTO {
  stepNumber: number;
  title: string;
  instruction: string;
  expectedObservation: string;
  commonMistake: string | null;
  diagramType: string | null;
}

export interface RepairGuideDTO {
  id: string;
  slug: string;
  title: string;
  technology: PrinterTechnology;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced / Technician';
  estimatedTime: string | null;
  applicableFamilies: string[];
  applicableModelIds: string[];
  requiresManualBedScrews: boolean;
  symptoms: string[];
  toolsNeeded: string[];
  partsNeeded: string[];
  safetyWarnings: string[];
  serviceBoundaryNote: string;
  modelSpecificMenuNotes: Record<string, string>;
  steps: RepairStepDTO[];
  verificationProcedure: string;
  ifNotFixedBranches: { label: string; targetGuideSlug?: string; targetCategorySlug?: string }[];
  lastVerifiedDate: string;
  verificationStatus: VerificationStatus;
  sources?: SourceReferenceDTO[];
}

export interface MaterialReferenceDTO {
  id: string;
  code: string;
  name: string;
  technology: PrinterTechnology;
  category: string;
  nozzleTempRangeC: { min: number; max: number } | null;
  bedTempRangeC: { min: number; max: number } | null;
  enclosureRequirement: 'Not required (open air preferred for overhangs)' | 'Recommended for large parts' | 'Required (draft-free heated/enclosed chamber)' | 'UV-shielded cover required';
  dryingGuidance: string;
  coolingGuidance: string;
  hardwareCompatibilityNotes: string;
  hardenedNozzleRequired: boolean;
  exposureNotesResin: string | null;
  safetyGuidance: string;
  lastVerifiedDate: string;
}

export interface ErrorCodeDTO {
  id: string;
  manufacturerId: string;
  manufacturerName?: string;
  applicableFamilies: string[];
  firmwareContext: string;
  code: string;
  verifiedMeaning: string;
  likelyCauses: string[];
  recommendedChecks: string[];
  officialSourceUrl: string;
  lastVerifiedDate: string;
}

export interface MaintenanceItemDTO {
  id: string;
  technology: PrinterTechnology;
  componentCategory: string;
  title: string;
  applicableSystems: string[];
  intervalGuidance: string;
  procedureSummary: string;
  lubricantOrCleaner: string;
  doNotApplyTo: string[];
  safetyWarning: string | null;
  lastVerifiedDate: string;
}

export interface ModelRequestDTO {
  id: string;
  manufacturerName: string;
  modelName: string;
  technology: PrinterTechnology;
  notes: string;
  status: 'PENDING_REVIEW' | 'RESEARCHING' | 'ADDED' | 'DECLINED';
  submittedAt: string;
}

export type StepIssueType =
  | 'UNCLEAR_INSTRUCTION'
  | 'INCORRECT_FOR_MODEL'
  | 'MISSING_TOOL_OR_WARNING'
  | 'OTHER';

export interface StepCommentItem {
  stepNumber: number;
  stepTitle: string;
  issueType: StepIssueType;
  comment: string;
}

export type GuideOutcomeStatus = 'FIXED' | 'PARTIALLY_FIXED' | 'NOT_FIXED';

export interface RepairGuideFeedbackDTO {
  id: string;
  guideId: string;
  guideSlug: string;
  guideTitle?: string;
  printerModelId: string | null;
  printerModelName?: string | null;
  userId: string | null;
  authorDisplayName?: string | null;
  helpfulnessRating: number;
  outcome: GuideOutcomeStatus;
  generalComment: string | null;
  stepComments: StepCommentItem[];
  completedSteps: number[];
  createdAt: string;
}

export interface GuideFeedbackSummaryDTO {
  guideId: string;
  guideSlug: string;
  totalCount: number;
  averageRating: number | null;
  fixedCount: number;
  partiallyFixedCount: number;
  notFixedCount: number;
  flaggedStepCounts: Record<number, number>;
  items: RepairGuideFeedbackDTO[];
}

export interface UserAccountDTO {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface SavedDiagnosticSessionDTO {
  id: string;
  userId: string | null;
  title: string;
  printerSlug: string | null;
  printerModelId: string | null;
  printerModelName?: string | null;
  useGenericMode: boolean;
  genericTechnology: PrinterTechnology;
  materialCode: string | null;
  categoryId: string | null;
  categoryTitle?: string | null;
  answersByQuestionId: Record<string, string>;
  symptomText: string | null;
  status: 'IN_PROGRESS' | 'RESULTS_READY' | 'RESOLVED';
  ownershipMode: 'GUEST_BOOKMARK' | 'AUTHENTICATED_USER';
  expiresAt: string;
  lastAccessedAt: string;
  createdAt: string;
  updatedAt: string;
}

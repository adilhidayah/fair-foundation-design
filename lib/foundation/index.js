// ==========================================================================
// FOUNDATION CALCULATION LIBRARY — entry point
// Re-exports every pure calculation function, grouped by where they live.
// Import from here rather than reaching into individual files, so callers
// don't need to know the internal folder layout.
//
// Status:
//   shared/ — bearingCapacity, loadCombinations, stabilityCheck,
//             pedestalCheck (incl. anchor bolts), footingCheck,
//             soilProperties, settlementCheck, windLoad, seismicLoad
//   static/ — loadingData, foundationSizing (vessel/tank/heat-exchanger)
//   rotating/ — loadingData, vibrationCheck, foundationSizing
//   reciprocating/ — loadingData, dynamicForceCheck, foundationSizing
//   piperack/ — loadingData, loadCombinations, foundationSizing (per pier)
//   skidMounted/ — loadingData, foundationSizing
//   import/ — textParsers (OCR / pasted text -> candidates for user review)
// ==========================================================================

export {
  terzaghiFactors,
  meyerhofFactors,
  terzaghiShapeFactors,
  bearingCapacityCheck
} from './shared/bearingCapacity.js';

export {
  defaultCombos,
  combineLoadCombo,
  buildStdCombos,
  buildLrfdCombos,
  stdComboVector,
  LOAD_KINDS,
  DEFAULT_KIND_BY_CODE,
  loadTypeVector,
  buildComboBase
} from './shared/loadCombinations.js?v=20260925i'; // ?v= browser cache-buster (LRFD set buildLrfdCombos added)

export {
  evaluateFoundationCombo,
  evaluateBiaxialFooting,
  pedestalOffsetMoments,
  combineFootingChecks,
  biaxialSoilPressure,
  meyerhofEffectiveArea,
  evaluatePileCombo
} from './shared/stabilityCheck.js?v=20261009h'; // ?v= browser cache-buster (Meyerhof effective area added)

export {
  DEFAULT_P_MULTIPLIERS,
  pileLayoutCheck,
  pileGridInfo,
  pileGroupEfficiency,
  lateralPMultipliers,
  evaluatePileGroupCombo
} from './shared/pileGroup.js?v=20260927f'; // ?v= browser cache-buster (apply switch for group efficiency)

export {
  pileShearFraction,
  oneWayPileShear,
  signedDistanceToRect,
  punchingPileShear
} from './shared/pileCapShear.js';

export {
  pmInteractionCurve,
  phiMnAtP,
  searchPedestalBars,
  computeGoverningCa1,
  computeAnchorCapacity,
  evaluateAnchorCombo
} from './shared/pedestalCheck.js';

export {
  oneWayShearCheck,
  twoWayShearCheck,
  eccentricPunchingStress,
  pileCapMoment,
  pileCapMomentAxis,
  flexuralDesign
} from './shared/footingCheck.js';

export {
  correctSPT,
  phiFromSPT,
  cuFromSPT,
  esFromSPT,
  soilDefaults
} from './shared/soilProperties.js';

export {
  influenceFactor,
  elasticSettlement,
  consolidationSettlement,
  settlementCheck
} from './shared/settlementCheck.js';

export {
  WIND_EXPOSURE,
  windForceASCE716
} from './shared/windLoad.js';

export {
  FA_TABLE,
  FV_TABLE,
  SS_BREAKPOINTS,
  S1_BREAKPOINTS,
  designSpectralAccel,
  seismicResponseCoefficient
} from './shared/seismicLoad.js';

export {
  parseLoadTypeText,
  parseEquipmentWeightText,
  parseFactorCell,
  parseComboImport,
  parseFoundationDimText
} from './import/textParsers.js?v=20260927f'; // ?v= browser cache-buster

export {
  foundationSizing,
  foundationSizing as staticFoundationSizing,
  foundationGeometryCheck
} from './static/foundationSizing.js?v=20260927f'; // ?v= browser cache-buster (block may project above grade)

export {
  lateralToBase as staticLateralToBase,
  staticDeadLoad,
  staticLiveLoad,
  staticWindLoad,
  staticSeismicLoad,
  staticLoadingData
} from './static/loadingData.js';

export {
  lateralToBase as rotatingLateralToBase,
  rotatingDeadLoad,
  unbalanceForce,
  rotatingLoadingData
} from './rotating/loadingData.js';

export {
  naturalFrequency as rotatingNaturalFrequency,
  resonanceCheck,
  vibrationAmplitude,
  rotatingVibrationCheck
} from './rotating/vibrationCheck.js';

export {
  rotatingFoundationSizing
} from './rotating/foundationSizing.js';

export {
  lateralToBase as reciprocatingLateralToBase,
  unbalancedToBase,
  unbalancedMoment,
  reciprocatingLoadingData
} from './reciprocating/loadingData.js';

export {
  naturalFrequency as reciprocatingNaturalFrequency,
  resonanceCheckTwoOrders,
  amplitudeAt,
  reciprocatingDynamicCheck
} from './reciprocating/dynamicForceCheck.js';

export {
  reciprocatingFoundationSizing
} from './reciprocating/foundationSizing.js';

export {
  pipeVerticalLoad,
  frictionLoad,
  anchorThrust,
  rackWindLoad,
  piperackLoadingData
} from './piperack/loadingData.js';

export {
  piperackCombos
} from './piperack/loadCombinations.js';

export {
  pierSelfWeight,
  sizePierFooting
} from './piperack/foundationSizing.js';

export {
  sumBoltReactions,
  skidLoadingData
} from './skidMounted/loadingData.js';

export {
  skidFoundationSizing
} from './skidMounted/foundationSizing.js';

// --------------------------------------------------------------------------
// Dispatcher by equipment type (Section 1 — General input decides this).
// Pure string mapping — no DOM, no dynamic import, so UI can drive which
// category module + which checks are relevant per PROJECT_INSTRUCTIONS §5.
// --------------------------------------------------------------------------

export const EQUIPMENT_CATEGORIES = [
  'static',
  'rotating',
  'reciprocating',
  'piperack',
  'skidMounted'
];

const EQUIPMENT_TO_CATEGORY = {
  vessel: 'static',
  tank: 'static',
  heatExchanger: 'static',
  heat_exchanger: 'static',
  static: 'static',
  pump: 'rotating',
  centrifugalCompressor: 'rotating',
  turbine: 'rotating',
  motor: 'rotating',
  rotating: 'rotating',
  pistonCompressor: 'reciprocating',
  dieselEngine: 'reciprocating',
  reciprocating: 'reciprocating',
  pipeRack: 'piperack',
  piperack: 'piperack',
  pipe_rack: 'piperack',
  skid: 'skidMounted',
  packageUnit: 'skidMounted',
  skidMounted: 'skidMounted'
};

export function getCategoryForEquipment(equipmentType) {
  if (!equipmentType) return null;
  const key = String(equipmentType).trim();
  return EQUIPMENT_TO_CATEGORY[key] || EQUIPMENT_TO_CATEGORY[key.toLowerCase()] || null;
}

const BASE_CHECKS = ['bearing', 'stability', 'settlement', 'pedestal', 'footing'];

export function requiredChecksForCategory(category) {
  if (category === 'rotating') return [...BASE_CHECKS, 'vibration'];
  if (category === 'reciprocating') return [...BASE_CHECKS, 'dynamicForce'];
  if (category === 'piperack') return [...BASE_CHECKS, 'twoDirectionStability'];
  if (category === 'skidMounted') return [...BASE_CHECKS, 'anchorConcentration'];
  return [...BASE_CHECKS];
}


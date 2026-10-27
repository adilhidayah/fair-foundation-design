// ==========================================================================
// STEEL CONNECTION LIBRARY — entry point (AISC 360-16 / AISC 341-16, ASD or LRFD)
// Standard connection catalogue SC-01..SC-06 (types.js) with the same ids and parameter names as the standard drawings in
// E:\KERJA\TOOLS\Drawing\Sambungan. Pure functions, units mm / MPa / kN / kN·m. No DOM.
//   materials.js — bolt grades and sizes (Tables J3.2, J3.3M, J3.4M), steel grades with Ry/Rt (AISC 341 Table A3.1)
//   checks.js    — limit states (bolts, bearing, tension, shear, block shear, Whitmore, plate buckling, welds, J10)
//   demand.js    — required strength by mode: analysis / omega0 / ocbf-brace / omf-moment (project decision)
//   types.js     — catalogue + checkConnection({ type, params, forces, method })
//   tables.js    — standard variant tables per type (capacity by bisection on the same checks) + pickVariant
// Validation: node lib/steel/validation/validation_connection_part1.mjs
// ==========================================================================
export { BOLT_GRADES, BOLT_SIZES, STEEL, WELD, bolt, steel } from './materials.js';
export * from './checks.js';
export { DEMAND_MODES, connectionDemand } from './demand.js';
export { CATALOGUE, checkConnection, SC01, SC02, SC03, SC04, SC05, SC06 } from './types.js';
export { LOAD_KEYS, LOAD_LABEL, VARIANTS, variantCapacity, capacityTable, pickVariant } from './tables.js';

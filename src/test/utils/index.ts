/**
 * Barrel exports for shared test utilities — mock HTTP servers, stdio
 * protocol helpers, and fixture data used across unit and end-to-end
 * tests. This directory is test infrastructure (not part of the
 * production dependency graph) and is excluded from Knip analysis.
 */
export * from './helpers.js';

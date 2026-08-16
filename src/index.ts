export {
  defineStilltrue,
  type StilltrueConfig,
  type DriftCheck,
  type DriftResult,
  type DriftOutcome,
  type CheckContext,
  type Compare,
  type CompareFn,
} from './config.ts';
export { corpus, json, surname, htmlToText, type CorpusOptions } from './helpers.ts';
export { runDrift, runDriftCheck, type RunDriftOptions } from './runner.ts';
export { resolveCompare } from './compare.ts';

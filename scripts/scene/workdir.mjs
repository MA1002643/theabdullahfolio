// Where the scene scripts stage raw clips, extracted frames and probe output.
//
// These scripts were originally written against the per-session scratchpad the
// agent that authored them happened to own, as an absolute path baked into each
// file. That path is session-scoped: every one of them was dead by the time the
// work shipped, so a script documented in the README as the provenance of an
// asset could not actually be re-run by anyone. One overridable default fixes
// that for all of them.
//
// The directory is CREATED on import rather than merely resolved — several of
// these scripts write their first output minutes into a decode, and a missing
// directory should not be discovered there.
import { mkdirSync } from 'node:fs';

export const WORK = process.env.SCRATCH ?? './.scene-work';

mkdirSync(WORK, { recursive: true });

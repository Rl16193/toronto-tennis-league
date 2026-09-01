import { execFileSync } from 'node:child_process';

// The review baseline is always the `dev-anuj` branch. It is not always reachable under the same
// name: CI supplies an explicit SHA, and local clones may carry `dev-anuj` on a remote other than
// `origin` (or only as a local branch). Resolve it explicitly so a missing ref fails loudly rather
// than silently degrading a gate into "everything changed, nothing checked".
export const BASE_BRANCH = 'dev-anuj';

const tryGit = (args, cwd) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const resolvesToCommit = (ref, cwd) => tryGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd) !== null;

export const comparisonBaseCandidates = (cwd) => {
  const candidates = [];
  const override = process.env.ARCHITECTURE_BASE_SHA;
  if (override) candidates.push(override);
  candidates.push(`origin/${BASE_BRANCH}`);
  for (const remote of (tryGit(['remote'], cwd) || '').split('\n').map((name) => name.trim()).filter(Boolean)) {
    if (remote !== 'origin') candidates.push(`${remote}/${BASE_BRANCH}`);
  }
  candidates.push(BASE_BRANCH);
  return candidates;
};

export const resolveComparisonBase = (cwd) =>
  comparisonBaseCandidates(cwd).find((candidate) => resolvesToCommit(candidate, cwd)) ?? null;

export const comparisonBaseError = (cwd) =>
  `Could not resolve the ${BASE_BRANCH} comparison base. Tried: ${comparisonBaseCandidates(cwd).join(', ')}. ` +
  `Fetch the branch (git fetch <remote> ${BASE_BRANCH}) or set ARCHITECTURE_BASE_SHA to an explicit commit.`;

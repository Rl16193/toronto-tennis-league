# Project-local Agent Skills

This inventory records the skills discoverable from this repository. The lock file is the machine-readable installation record; this document explains routing and provenance without copying third-party skill contents.

Last verified against commit `29690a3812a1391bf5a471b7efa7dc41d610c146` plus the uncommitted project-local skill installation.

## Firebase Agent Skills

Source: `firebase/agent-skills` on GitHub. These are existing project-local skills preserved from the repository and tracked in `skills-lock.json` with computed hashes.

| Local skill | Purpose | Use when |
| --- | --- | --- |
| `firebase-ai-logic-basics` | Firebase AI Logic setup and usage | AI Logic or model integration |
| `firebase-app-hosting-basics` | App Hosting configuration and emulation | App Hosting work |
| `firebase-auth-basics` | Firebase Auth setup and client patterns | Sign-in, identity, or auth boundaries |
| `firebase-basics` | Firebase CLI, project, and local environment basics | CLI/project operations |
| `firebase-crashlytics` | Crashlytics setup | Mobile crash reporting |
| `firebase-data-connect` | Data Connect schemas and SDKs | Data Connect work |
| `firebase-firestore` | Firestore setup, data models, indexes, and rules | Any Firestore change or audit |
| `firebase-hosting-basics` | Hosting configuration and deployment | Hosting changes; never bypass environment gates |
| `firebase-remote-config-basics` | Remote Config | Remote Config work |
| `firebase-security-rules-auditor` | Adversarial Firestore rules review | Every rules change and security audit |
| `xcode-project-setup` | Firebase iOS project configuration | Future mobile setup only |

## Diagram Design

- Source: `anujraja/diagram-design`, requested user fork.
- Local path: `.agents/skills/diagram-design/`.
- Skill entry point: `.agents/skills/diagram-design/SKILL.md`.
- Upstream HEAD observed at installation: `da45d4a79a76dc0742c8554b7eabe551db100701`.
- Installer lock hash: `02bce599218f974d17a6b36c07b6246eec7e4dfa791cb1c158bc3bc61fb7becf`.
- Use for architecture, data model, data flow, authorization, delivery, and modernization diagrams. Preserve editable HTML plus SVG/PNG exports where tooling permits.
- The skill’s style guide is still the shipped default. Before the first committed diagram, complete its style-gate decision and record the choice.

## gstack

- Source: `garrytan/gstack` on GitHub.
- Local path: `.agents/skills/gstack/`.
- Upstream HEAD observed at installation: `60e51342b54553cf4347ce7a786cae508125053e`.
- Local suite version: `1.67.2.0`.
- Installer lock hash for the root router: `845bbc368b6878914a53e28b60ff9be7aa2eabd689f6514842b159b46544982a`.
- The project-local copy includes the upstream router and subskills. Available workflows include `autoplan`, `plan-ceo-review`, `plan-eng-review`, `plan-devex-review`, `review`, `investigate`, `cso`, `qa`, `qa-only`, `document-generate`, `document-release`, `retro`, `careful`, `guard`, and `freeze`, plus the upstream suite’s other specialized skills. Inspect the matching nested `SKILL.md` before use.
- Do not invoke gstack workflows that merge to `main`, deploy production, or rewrite history. In this project, “ship” means a reviewed commit pushed to `origin/dev-anuj` only.

## Project-specific skill

- `.claude/skills/deploy-rules/SKILL.md` is repository-local operational guidance for Firebase rules deployment. It is not represented in `skills-lock.json`; review it before any rules deployment and keep deployment explicitly environment-gated.

## Update procedure

1. Inspect the upstream source and current lock file.
2. Install into `.agents/skills/` without `-g`.
3. Review the exact file diff and source revision/hash.
4. Update this inventory and `skills-lock.json` together.
5. Run the relevant validation, commit the change separately, and push only to `dev-anuj`.

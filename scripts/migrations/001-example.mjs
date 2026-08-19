import { emptyReport, parseMigrationArgs, printReport, usage } from './lib/cli.mjs';

// Synthetic records make this executable example safe in every environment. Copy this file for
// A real migration should replace the fixture scan with scanCollection() and opt into bounded
// cursor flags only after implementing and testing that scan.
const FIXTURE = [
  { id: 'example-001', eligible: true },
  { id: 'example-002', eligible: false },
];

const main = () => {
  const args = parseMigrationArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.apply) {
    throw new Error('The example migration is a template and refuses --apply. Copy it first.');
  }

  const report = emptyReport();
  const start = args.resume ? FIXTURE.findIndex((row) => row.id === args.resume) + 1 : 0;
  const page = FIXTURE.slice(start, args.limit ? start + args.limit : undefined);
  for (const row of page) {
    report.scanned += 1;
    if (!row.eligible) {
      report.skipped += 1;
      continue;
    }
    report.eligible += 1;
    report.planned += 1;
    console.log(`[dry-run] would change ${row.id}`);
  }
  printReport(report, args);
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

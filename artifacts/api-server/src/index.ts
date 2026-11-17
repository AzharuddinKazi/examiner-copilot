import app from "./app";
import { logger } from "./lib/logger";
import { recoverInterruptedRuns } from "./lib/assess/run";
import { recoverInterruptedProposals } from "./lib/ingest/run";
import { removeDemoData } from "./lib/dataset";
import { ensureScopeBanks } from "./lib/scope-banks";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  removeDemoData()
    .then((r) => { if (r.removed) logger.info("demo data removed; workspace is live"); })
    .catch((e) => logger.error({ err: e }, "could not remove demo data"))
    .then(() => ensureScopeBanks())
    .then((added) => { if (added?.length) logger.info({ added }, "added in-scope banks to an empty library"); })
    .catch((e) => logger.error({ err: e }, "could not add in-scope banks"));
  recoverInterruptedProposals().catch((e) => logger.error({ err: e }, "could not recover interrupted ingestion proposals"));
  recoverInterruptedRuns().catch((e) => logger.error({ err: e }, "could not recover interrupted assessments"));
});

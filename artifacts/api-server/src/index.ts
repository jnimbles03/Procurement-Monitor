import app from "./app";
import { logger } from "./lib/logger";
import { initScheduler } from "./services/scheduler";
import { autoSeedIfEmpty } from "./lib/autoSeed";

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

  autoSeedIfEmpty().catch((err) => {
    logger.error({ err }, "Auto-seed encountered an error");
  });

  initScheduler().catch((schedErr) => {
    logger.error({ err: schedErr }, "Failed to start scheduler");
  });
});

import { app, InvocationContext, Timer } from '@azure/functions';
import { readdir, readFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BatchRepository } from '../repositories/BatchRepository';
import { InvoicePipeline } from '../pipeline/InvoicePipeline';
import { sha256 } from '../utils/fileHash';
import { DATA } from '../utils/paths';
import { logger } from '../utils/logger';

// Timer trigger: drains data/input/ into data/processed/ and runs the pipeline on each
// file. One tick = one Batch (§3). NOT an HTTP endpoint.
export async function timerIngest(_timer: Timer, _ctx: InvocationContext): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(DATA.input);
  } catch {
    return; // input dir missing → nothing to do
  }

  const files = entries.filter((f) => !f.startsWith('.')); // skip .gitkeep / dotfiles
  if (files.length === 0) return;

  await mkdir(DATA.processed, { recursive: true });
  const batch = await BatchRepository.create('timer');
  logger.info(`timer: batch ${batch.id}, ${files.length} file(s)`);

  // Sequential: the hash-dedup check is app-layer (no unique constraint), so two
  // identical files in one tick must be processed one-at-a-time for the 2nd to see the 1st.
  for (const name of files) {
    const src = path.join(DATA.input, name);
    try {
      const buffer = await readFile(src);
      // Claim the file by moving it out of input/ BEFORE the pipeline, so the next tick
      // can't re-read it. Content-hash name keeps it idempotent / collision-free.
      const fileHash = sha256(buffer);
      const dest = path.join(DATA.processed, `${fileHash}_${name}`);
      await rename(src, dest);
      await InvoicePipeline.run({ fileName: name, filePath: dest, buffer }, batch.id);
    } catch (err) {
      logger.error(`timer: failed on ${name}`, err);
    }
  }
}

app.timer('timerIngest', {
  schedule: '*/5 * * * * *', // every 5s (6-field NCRONTAB: sec min hour day month dow)
  runOnStartup: false,
  handler: timerIngest,
});

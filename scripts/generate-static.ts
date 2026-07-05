import fs from 'fs/promises';
import path from 'path';
import { scrapeAll } from '../scrapers/index';

async function main(): Promise<void> {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const publicDir = path.join(projectRoot, 'public');
  const outputDir = path.join(projectRoot, 'site');
  const apiDir = path.join(outputDir, 'api');

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.cp(publicDir, outputDir, { recursive: true });
  await fs.mkdir(apiDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, '.nojekyll'), '');

  const data = await scrapeAll(true);
  const payload = JSON.stringify({ ok: true, ...data }, null, 2);

  await fs.writeFile(path.join(apiDir, 'events.json'), payload);
  await fs.writeFile(path.join(apiDir, 'concerts.json'), payload);

  console.log(`Generated ${data.upcoming.length} upcoming events in ${outputDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

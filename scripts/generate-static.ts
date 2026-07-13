import fs from 'fs/promises';
import path from 'path';
import { scrapeAll } from '../scrapers/index';
import type { ScrapedData } from '../scrapers/types';

async function readFallbackData(projectRoot: string): Promise<ScrapedData | undefined> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'api', 'events.json'), 'utf8');
    const data = JSON.parse(raw) as Partial<ScrapedData>;
    if (!Array.isArray(data.upcoming) || !Array.isArray(data.past)) return undefined;
    return data as ScrapedData;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const publicDir = path.join(projectRoot, 'public');
  const outputDir = path.join(projectRoot, 'site');
  const apiDir = path.join(outputDir, 'api');

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.cp(publicDir, outputDir, { recursive: true });
  await fs.mkdir(apiDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, '.nojekyll'), '');

  const fallbackData = await readFallbackData(projectRoot);
  const data = await scrapeAll(true, fallbackData);
  const payload = JSON.stringify({ ok: true, ...data }, null, 2);

  await fs.writeFile(path.join(apiDir, 'events.json'), payload);

  console.log(`Generated ${data.upcoming.length} upcoming events in ${outputDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

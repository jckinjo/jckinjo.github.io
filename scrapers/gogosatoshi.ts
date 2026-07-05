import puppeteer from 'puppeteer';
import { parseDate, googleCalendarUrl } from './utils';
import type { Concert, Source } from './types';

export const source: Source = {
  name: 'GOGO SATOSHI',
  url: 'https://www.gogosatoshi.com/shows',
  color: '#c0392b',
};

// Matches: "2026.6.27 (sat) Event Title"
const EVENT_LINE = /^(\d{4}\.\d{1,2}\.\d{1,2})\s*\([a-z]{2,3}\)\s*(.*)/i;

export async function scrape(): Promise<Concert[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise<void>(r => setTimeout(r, 3000));

    const fullText = await page.evaluate(() => document.body.innerText);
    // Strip zero-width and invisible Unicode chars before trimming
    const lines = fullText.split('\n')
      .map((l: string) => l.replace(/[\u200b\u200c\u200d\ufeff\u3000]/g, '').trim())
      .filter(Boolean);

    const concerts: Concert[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(EVENT_LINE);
      if (!m) { i++; continue; }

      const dateStr = m[1];       // "2026.6.27"
      const titleRaw = m[2].trim(); // "Live in Denpo-G 2026"

      const date = parseDate(dateStr);
      if (!date || date < today) { i++; continue; }

      // Collect following lines until the next event or separator "***"
      const contextLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (EVENT_LINE.test(next) || next === '***' || next === '▼' || /^▼\d{4}/.test(next)) break;
        contextLines.push(next);
        j++;
      }
      i = j;

      const context = contextLines.join(' ');

      // Venue: line starting with "Venue :"
      const venueLine = contextLines.find(l => /^Venue\s*:/i.test(l));
      const venue = venueLine ? venueLine.replace(/^Venue\s*:\s*/i, '').trim() : null;

      // Time: "Start HH:MM"
      const timeMatch = context.match(/Start\s*(\d{1,2}:\d{2})/i);

      // Price: "Fee X,XXX円" or "Ticket X,XXX円"
      const priceMatch = context.match(/(?:Fee|Ticket)\s*([\d,]+円)/i);

      const title = titleRaw || 'GOGO SATOSHI Live';

      concerts.push({
        title,
        date,
        dateDisplay: dateStr,
        time: timeMatch ? timeMatch[1] : null,
        price: priceMatch ? priceMatch[1] : null,
        venue,
        location: null,
        url: source.url,
        source: source.name,
        sourceUrl: source.url,
        sourceColor: source.color,
        calendarUrl: googleCalendarUrl({ title, date, time: timeMatch ? timeMatch[1] : null, venue: venue || '', url: source.url, source: source.name }),
      });
    }

    return concerts;
  } finally {
    await browser.close();
  }
}

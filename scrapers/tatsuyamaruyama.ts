import puppeteer from 'puppeteer';
import { parseDate, googleCalendarUrl } from './utils';
import type { Concert, Source } from './types';

export const source: Source = {
  name: '丸山達也',
  url: 'https://tatsuyamaruyama.com/live',
  color: '#16a085',
};

// Matches: "2026年2月21日(土) 札幌市立大学..."
const EVENT_LINE = /^(\d{4}年\d{1,2}月\d{1,2}日)[（(][日月火水木金土][）)]\s*(.*)/;

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
    await new Promise<void>(r => setTimeout(r, 2000));

    const fullText = await page.evaluate(() => document.body.innerText);
    const lines = fullText.split('\n').map((l: string) => l.trim()).filter(Boolean);

    const concerts: Concert[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(EVENT_LINE);
      if (!m) { i++; continue; }

      const dateStr = m[1];       // "2026年2月21日"
      const titleRaw = m[2].trim(); // event name after the date+weekday

      const date = parseDate(dateStr);
      if (!date || date < today) { i++; continue; }

      // Collect context lines
      const contextLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        if (EVENT_LINE.test(lines[j])) break;
        contextLines.push(lines[j]);
        j++;
      }
      i = j;

      const context = contextLines.join(' ');

      // Venue: "[会場] ..."
      const venueMatch = context.match(/\[会場\]\s*([^\[]+)/);
      const venue = venueMatch ? venueMatch[1].trim() : null;

      // Time: "[時間] ..."
      const timeMatch = context.match(/\[時間\]\s*([\d:]+)/);

      // Price: "[料金] ..."
      const priceMatch = context.match(/\[料金\]\s*([^\[]+)/);

      const title = titleRaw || '丸山達也 Live';

      concerts.push({
        title,
        date,
        dateDisplay: dateStr,
        time: timeMatch ? timeMatch[1] : null,
        price: priceMatch ? priceMatch[1].trim() : null,
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

import axios from 'axios';
import * as cheerio from 'cheerio';
import { googleCalendarUrl, axiosConfig } from './utils';
import type { Concert, Source } from './types';

export const source: Source = {
  name: '井草聖二',
  url: 'https://www.igusaseiji.com',
  color: '#27ae60',
};

const CONCERT_PAGE = 'https://www.igusaseiji.com/1246712531124691254012488.html';

// Parse Japanese/numeric date with explicit base year
function parseDateWithYear(str: string | null | undefined, baseYear: number): Date | null {
  if (!str) return null;
  str = str.trim();

  // 2026年3月25日 / 2026/3/25
  let m = str.match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  // M月D日 or M/D — use explicit baseYear
  m = str.match(/(\d{1,2})[月\/](\d{1,2})/);
  if (m) return new Date(baseYear, +m[1] - 1, +m[2]);

  return null;
}

// Prefixes that indicate meta-info lines, not event titles
const META_PREFIXES = /^(会場|時間|料金|チケット|ご予約|主催|招聘|後援|開場|開演|OPEN|LIVE|START|TEL|tel|http|www|e\+|イープラス|ローソン|一般|高校|中学|小学|障害|介護|✳|※|＊|\*)/i;

// Lines that mark a year section
const YEAR_HEADER = /^[-\s・]*(\d{4})年[-\s・]*$/;

// Lines that start with OR contain a strong date signal (weekday indicator)
const DATE_START = /^(\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}|\d{4}[年\/]\d{1,2}[月\/]\d{1,2})/;
const DATE_WITH_WEEKDAY = /(\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2})[(\s（][日月火水木金土][)）]/;

export async function scrape(): Promise<Concert[]> {
  const res = await axios.get<string>(CONCERT_PAGE, axiosConfig());
  const $ = cheerio.load(res.data);
  const concerts: Concert[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const content = $('#wsite-content');

  // Replace <br> tags with newline markers before extracting text
  content.find('br').replaceWith('\n');

  const rawLines = content
    .text()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let currentYear = new Date().getFullYear();

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Track year section from headers like "- 2026年 -"
    const yearMatch = line.match(YEAR_HEADER);
    if (yearMatch) {
      currentYear = +yearMatch[1];
      continue;
    }

    // Skip meta-info lines
    if (META_PREFIXES.test(line)) continue;

    // Process lines that start with OR contain a date pattern (weekday is a strong signal)
    const hasDateAtStart = DATE_START.test(line);
    const hasDateWithWeekday = DATE_WITH_WEEKDAY.test(line);
    if (!hasDateAtStart && !hasDateWithWeekday) continue;

    const date = parseDateWithYear(line, currentYear);
    if (!date) continue;

    // Past dates (including past years) are skipped
    if (date < today) continue;

    // Extract date display and title from the same line
    const datePatternMatch = line.match(DATE_START) || line.match(/(\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2})/);
    let titleFromLine = '';
    if (datePatternMatch) {
      const dateIdx = line.indexOf(datePatternMatch[0]);
      titleFromLine = line
        .slice(dateIdx + datePatternMatch[0].length)
        .replace(/^[\s（(]*[日月火水木金土][）)\s・]*/, '')
        .trim();
    }

    // Clean up title: stop at first metadata marker 【
    if (titleFromLine) {
      titleFromLine = titleFromLine.split('【')[0].replace(/\s+/g, ' ').trim();
    }

    // Collect next few context lines for venue/price/time
    const contextLines: string[] = [];
    for (let j = i + 1; j < Math.min(i + 8, rawLines.length); j++) {
      const next = rawLines[j];
      if (YEAR_HEADER.test(next)) break;
      if (DATE_START.test(next) && !META_PREFIXES.test(next)) break;
      contextLines.push(next);
    }
    const context = contextLines.join(' ');

    // Venue: line starting with 会場
    const venueLine = contextLines.find((l) => /^会場/.test(l));
    const venue = venueLine
      ? venueLine.replace(/^会場\s*[：:]\s*/, '').split(/[\s　]/)[0]
      : null;

    // Price: prefer 一般 price, else first yen amount
    const priceLineM = context.match(/料金\s*[：:]\s*([^\n※]+)/);
    let priceMatch: RegExpMatchArray | null = null;
    if (priceLineM) {
      priceMatch = priceLineM[1].match(/一般\s*([\d,]+円)/) || priceLineM[1].match(/([\d,]+円)/);
    }
    if (!priceMatch) priceMatch = context.match(/[¥￥][\d,]+|\d[\d,]+円/);

    // Time
    const timeMatch = context.match(/開演\s*(\d{1,2}[：:]\d{2})/);

    const title =
      titleFromLine ||
      contextLines
        .find((l) => l.length > 3 && !META_PREFIXES.test(l))
        ?.split('【')[0]
        .trim() ||
      line;

    concerts.push({
      title,
      date,
      dateDisplay: datePatternMatch ? datePatternMatch[0] : '',
      time: timeMatch ? timeMatch[1].replace('：', ':') : null,
      price: priceMatch ? priceMatch[1] ?? priceMatch[0] : null,
      venue,
      location: null,
      url: CONCERT_PAGE,
      source: source.name,
      sourceUrl: source.url,
      sourceColor: source.color,
      calendarUrl: googleCalendarUrl({
        title,
        date,
        time: timeMatch ? timeMatch[1].replace('：', ':') : null,
        venue: venue || '',
        url: CONCERT_PAGE,
        source: source.name,
      }),
    });
  }

  return concerts;
}

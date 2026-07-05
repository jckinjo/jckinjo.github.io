import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseDate, googleCalendarUrl, axiosConfig } from './utils';
import type { Concert, Source } from './types';

export const source: Source = {
  name: 'DEPAPEPE',
  url: 'https://rainbow-e.co.jp/depapepe/live/',
  color: '#e67e22',
};

interface DetailResult {
  date: Date | null;
  time: string | null;
  venue: string | null;
  price: string | null;
}

// Fetch a detail page and extract date/venue/price/time
async function fetchDetail(url: string): Promise<DetailResult> {
  try {
    const res = await axios.get<string>(url, axiosConfig(8000));
    const $ = cheerio.load(res.data);

    // Get all text from the main post content
    const text = $('body').text().replace(/\s+/g, ' ');

    // 日時：2026年7月12日（日）  or  日程：2026年3月28日（土）
    const dateMatch = text.match(/(?:日時|日程)[：:]\s*([\d年月日（）\s\(\)日月火水木金土]+)/);
    const date = dateMatch ? parseDate(dateMatch[1]) : null;

    // 開演 HH:MM
    const timeMatch = text.match(/開演\s*(\d{1,2}:\d{2}|[\d]{1,2}時[\d]{2}分?)/);

    // 会場：venue_name
    const venueMatch = text.match(/会場[：:]\s*([^\s料金問合※\n]{2,40})/);
    const venue = venueMatch ? venueMatch[1].trim() : null;

    // 料金：price — extract 一般 price first, else first ¥ amount
    const priceLine = text.match(/料金[：:]\s*([^\n※]+)/);
    let price: string | null = null;
    if (priceLine) {
      const line = priceLine[1];
      const generalM = line.match(/一般\s*([\d,]+円)/);
      const anyM = line.match(/([\d,]+円)/);
      price = generalM ? generalM[1] : (anyM ? anyM[1] : null);
    }

    return {
      date,
      time: timeMatch ? timeMatch[1] : null,
      venue,
      price,
    };
  } catch {
    return { date: null, time: null, venue: null, price: null };
  }
}

interface Entry {
  title: string;
  url: string;
  dateFromTitle: Date | null;
  rawTitle: string;
}

interface EntryWithDetail extends Entry {
  date: Date | null;
  detail: Partial<DetailResult>;
}

export async function scrape(): Promise<Concert[]> {
  const res = await axios.get<string>(source.url, axiosConfig());
  const $ = cheerio.load(res.data);

  // Collect all article entries first
  const entries: Entry[] = [];
  $('article.title-list').each((_, article) => {
    const $a = $(article);
    const link = $a.find('a.link').first();
    const href = link.attr('href') || '';
    const rawTitle = link.find('h3.title span, h3.title').first().text().trim();
    if (!rawTitle || rawTitle.length < 5) return;

    const title = rawTitle.replace(/^【LIVE】/i, '').replace(/^\d{4}\/\d{1,2}\/\d{1,2}[-\d\/]*\s*/, '').trim();
    const url = href.startsWith('http') ? href : `https://rainbow-e.co.jp${href}`;
    const dateFromTitle = parseDate(rawTitle);

    entries.push({ title, url, dateFromTitle, rawTitle });
  });

  // For entries without a date in the title, fetch detail pages in parallel
  const results: EntryWithDetail[] = await Promise.all(
    entries.map(async (entry) => {
      if (entry.dateFromTitle) {
        return { ...entry, date: entry.dateFromTitle, detail: {} };
      }
      const detail = await fetchDetail(entry.url);
      return { ...entry, date: detail.date, detail };
    })
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return results
    .filter(e => !e.date || e.date >= today)
    .map(e => ({
      title: e.title,
      date: e.date,
      dateDisplay: e.date ? '' : '',
      time: e.detail?.time || null,
      price: e.detail?.price || null,
      venue: e.detail?.venue || null,
      location: null,
      url: e.url,
      source: source.name,
      sourceUrl: source.url,
      sourceColor: source.color,
      calendarUrl: e.date
        ? googleCalendarUrl({ title: e.title, date: e.date, time: e.detail?.time || null, venue: e.detail?.venue || '', url: e.url, source: source.name })
        : null,
    }));
}

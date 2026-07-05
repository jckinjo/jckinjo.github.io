import type { AxiosRequestConfig } from 'axios';

/**
 * Parse a date string in various Japanese/English formats.
 * Returns a Date object or null.
 */
export function parseDate(str: string | null | undefined): Date | null {
  if (!str) return null;
  str = str.trim().replace(/\s+/g, ' ');

  // 2026年3月25日 / 2026/3/25 / 2026-3-25 / 2026.3.25
  let m = str.match(/(\d{4})[年\/\-\.](\d{1,2})[月\/\-\.](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  // 3月25日 / 3/25 (infer year)
  m = str.match(/(\d{1,2})[月\/](\d{1,2})/);
  if (m) {
    const now = new Date();
    const year = now.getFullYear();
    let d = new Date(year, +m[1] - 1, +m[2]);
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      d = new Date(year + 1, +m[1] - 1, +m[2]);
    }
    return d;
  }

  // March 25, 2026
  const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  m = str.toLowerCase().match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2})[,\s]+(\d{4})/);
  if (m && MONTHS[m[1]] !== undefined) {
    return new Date(+m[3], MONTHS[m[1]], +m[2]);
  }

  return null;
}

export function cleanText(str: string | null | undefined): string | null {
  if (!str) return str ?? null;
  return str.replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

function toCalDate(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${mo}${d}`;
}

function toCalDateTimeValue(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${y}${mo}${d}T${h}${m}00`;
}

function toCalDateTime(date: Date, time: string, offsetHours = 0): string {
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(date);
  dt.setHours((hh || 0) + offsetHours, mm || 0, 0, 0);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const h = String(dt.getHours()).padStart(2, '0');
  const m = String(dt.getMinutes()).padStart(2, '0');
  return `${y}${mo}${d}T${h}${m}00`;
}

/**
 * Build a Google Calendar "add event" URL.
 */
export function googleCalendarUrl(params: {
  title: string | null;
  date: Date | null;
  time: string | null | undefined;
  venue: string | null | undefined;
  url: string;
  source: string;
  endDate?: Date | null;
}): string | null {
  const { title, date, time, venue, url, source, endDate } = params;
  if (!date) return null;
  let start: string;
  let end: string;
  if (endDate && time) {
    start = toCalDateTimeValue(date);
    end = toCalDateTimeValue(endDate);
  } else if (time) {
    start = toCalDateTime(date, time);
    end = toCalDateTime(date, time, 2);
  } else {
    start = toCalDate(date);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    end = toCalDate(nextDay);
  }
  const text = encodeURIComponent(title || source);
  const loc = encodeURIComponent(venue || '');
  const details = encodeURIComponent(`${source}\n${url}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${loc}&ctz=Asia%2FTokyo`;
}

/**
 * Build a common axios config with browser-like headers and timeout.
 */
export function axiosConfig(timeout = 10000): AxiosRequestConfig {
  return {
    timeout,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'ja,en;q=0.9',
    },
  };
}

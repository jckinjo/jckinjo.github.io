import axios from 'axios';
import * as cheerio from 'cheerio';
import { axiosConfig, cleanText, googleCalendarUrl } from './utils';
import type { Source, TrackedEvent } from './types';

export const source: Source = {
  name: '川崎市アートセンター 映像館',
  url: 'https://kawasaki-ac.jp/movie/schedule/',
  color: '#ec4899',
  category: 'movie',
};

const VENUE = '川崎市アートセンター アルテリオ映像館';
const LOCATION = '神奈川県川崎市麻生区万福寺6-7-1';

function absoluteUrl(href: string | undefined): string {
  return new URL(href || source.url, source.url).toString();
}

function dateFromAreaId(id: string | undefined): Date | null {
  const m = id?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function dateWithTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result;
}

function endDateFromDuration(start: Date, duration: string | null): Date | null {
  const m = duration?.match(/(\d+)h(?:(\d+))?/i);
  if (!m) return null;

  const end = new Date(start);
  end.setMinutes(end.getMinutes() + Number(m[1]) * 60 + Number(m[2] || 0));
  return end;
}

function formatDateDisplay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}

function detailsFrom(showtime: string | null, caution: string | null): string | null {
  const duration = showtime?.replace(/^\[/, '').replace(/\]$/, '');
  return cleanText([duration ? `上映時間 ${duration}` : null, caution].filter(Boolean).join(' / '));
}

function targetWeekendBounds(today: Date): { start: Date; end: Date } {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const daysUntilSaturday = day === 0 ? 6 : day === 6 ? 0 : 6 - day;
  start.setDate(start.getDate() + daysUntilSaturday);

  const end = new Date(start);
  end.setDate(start.getDate() + 2);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

export async function scrape(): Promise<TrackedEvent[]> {
  const res = await axios.get<string>(source.url, axiosConfig());
  const $ = cheerio.load(res.data);
  const events: TrackedEvent[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekend = targetWeekendBounds(today);

  $('.movie-schedule .area').each((_, area) => {
    const startDate = dateFromAreaId($(area).attr('id'));
    if (!startDate) return;

    $(area)
      .find('table')
      .first()
      .find('tr')
      .slice(1)
      .each((__, row) => {
        $(row)
          .find('td')
          .each((dayIndex, cell) => {
            const $cell = $(cell);
            if ($cell.hasClass('close')) return;

            const time = cleanText($cell.find('.time').first().text());
            const title = cleanText($cell.find('.ttl').first().text());
            if (!time || !title) return;

            const date = new Date(startDate);
            date.setDate(startDate.getDate() + dayIndex);
            if (date < today) return;
            if (date < weekend.start || date >= weekend.end) return;

            const href = $cell.find('.ttl a').first().attr('href');
            const url = absoluteUrl(href);
            const showtime = cleanText($cell.find('.showtime').first().text());
            const caution = cleanText($cell.find('.coution').first().text());
            const start = dateWithTime(date, time);
            const endDate = endDateFromDuration(start, showtime);

            events.push({
              title,
              date: start,
              dateDisplay: formatDateDisplay(date),
              time,
              price: caution?.includes('特別料金') ? '特別料金' : null,
              venue: VENUE,
              location: LOCATION,
              details: detailsFrom(showtime, caution),
              url,
              source: source.name,
              sourceUrl: source.url,
              sourceColor: source.color,
              sourceCategory: source.category,
              calendarUrl: googleCalendarUrl({
                title,
                date: start,
                time,
                venue: VENUE,
                url,
                source: source.name,
                endDate,
              }),
            });
          });
      });
  });

  return events;
}

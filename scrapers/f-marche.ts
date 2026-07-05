import axios from 'axios';
import * as cheerio from 'cheerio';
import { axiosConfig, cleanText, googleCalendarUrl } from './utils';
import type { Source, TrackedEvent } from './types';

export const source: Source = {
  name: 'しんゆりフェスティバル・マルシェ',
  url: 'https://f-marche.com/',
  color: '#84cc16',
  category: 'market',
};

const TITLE = 'しんゆりフェスティバル・マルシェ';
const VENUE = '小田急線・新百合ヶ丘駅南口 ペデストリアンデッキ';
const LOCATION = '神奈川県川崎市麻生区 新百合ヶ丘駅南口';

interface ParsedLine {
  month: number;
  days: number[];
  startTime: string;
  endTime: string;
  kind: string | null;
}

function cleanScheduleText(str: string | null | undefined): string | null {
  return cleanText(str?.normalize('NFKC').replace(/\u3000/g, ' '));
}

function textLines($: cheerio.CheerioAPI, cell: Parameters<cheerio.CheerioAPI>[0]): string[] {
  const clone = $(cell).clone();
  clone.find('br').replaceWith('\n');
  return clone
    .text()
    .split('\n')
    .map((line) => cleanScheduleText(line))
    .filter((line): line is string => Boolean(line && !line.startsWith('※')));
}

function parseYear($: cheerio.CheerioAPI): number {
  const text = cleanScheduleText($('#schedule').text()) || '';
  const year = text.match(/(\d{4})年\s*開催スケジュール/);
  return year ? Number(year[1]) : new Date().getFullYear();
}

function parseTimeRange(line: string): { startTime: string; endTime: string } | null {
  const match = line.match(/(\d{1,2}:\d{2})\s*[〜~～-]\s*(\d{1,2}:\d{2})/);
  return match ? { startTime: match[1], endTime: match[2] } : null;
}

function parseLine(line: string, fallbackMonth: number | null, fallbackKind: string | null): ParsedLine | null {
  const timeRange = parseTimeRange(line);
  if (!timeRange) return null;

  let kind = fallbackKind;
  let datePart = line.slice(0, line.indexOf(timeRange.startTime));

  if (datePart.includes('ナイトマルシェ')) {
    kind = 'ナイトマルシェ';
    datePart = datePart.replace(/^.*?ナイトマルシェ/, '');
  } else if (datePart.includes('ビアフェスタ')) {
    kind = 'ビアフェスタ';
    datePart = datePart.replace(/^.*?ビアフェスタ/, '');
  }

  let currentMonth = fallbackMonth;
  const days: number[] = [];
  for (const match of datePart.matchAll(/(?:(\d{1,2})月)?\s*(\d{1,2})日/g)) {
    if (match[1]) currentMonth = Number(match[1]);
    days.push(Number(match[2]));
  }

  if (!currentMonth || days.length === 0) return null;
  return { month: currentMonth, days, startTime: timeRange.startTime, endTime: timeRange.endTime, kind };
}

function dateWithTime(year: number, month: number, day: number, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
}

function formatDateDisplay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}

function eventTitle(vol: string, kind: string | null): string {
  return kind ? `${TITLE} ${vol} ${kind}` : `${TITLE} ${vol}`;
}

export async function scrape(): Promise<TrackedEvent[]> {
  const res = await axios.get<string>(source.url, axiosConfig());
  const $ = cheerio.load(res.data);
  const events: TrackedEvent[] = [];
  const year = parseYear($);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  $('#schedule table')
    .last()
    .find('tr')
    .each((_, row) => {
      const vol = cleanScheduleText($(row).find('th').first().text());
      const cell = $(row).find('td').first().get(0);
      if (!vol || !cell) return;

      let currentMonth: number | null = null;
      let currentKind: string | null = null;
      for (const line of textLines($, cell)) {
        const parsed = parseLine(line, currentMonth, currentKind);
        if (!parsed) continue;

        currentMonth = parsed.month;
        currentKind = parsed.kind;

        for (const day of parsed.days) {
          const date = dateWithTime(year, parsed.month, day, parsed.startTime);
          const dateOnly = new Date(date);
          dateOnly.setHours(0, 0, 0, 0);
          if (dateOnly < today) continue;

          const title = eventTitle(vol, parsed.kind);
          const endDate = dateWithTime(year, parsed.month, day, parsed.endTime);
          events.push({
            title,
            date,
            dateDisplay: formatDateDisplay(date),
            time: parsed.startTime,
            price: null,
            venue: VENUE,
            location: LOCATION,
            details: `開催時間 ${parsed.startTime}〜${parsed.endTime}`,
            url: `${source.url}#schedule`,
            source: source.name,
            sourceUrl: source.url,
            sourceColor: source.color,
            sourceCategory: source.category,
            calendarUrl: googleCalendarUrl({
              title,
              date,
              time: parsed.startTime,
              venue: VENUE,
              url: `${source.url}#schedule`,
              source: source.name,
              endDate,
            }),
          });
        }
      }
    });

  return events;
}

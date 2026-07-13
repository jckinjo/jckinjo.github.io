import axios from 'axios';
import * as cheerio from 'cheerio';
import { axiosConfig, cleanText, googleCalendarUrl } from './utils';
import type { Source, TrackedEvent } from './types';

export const source: Source = {
  name: 'connpass 人気ランキング',
  url: 'https://connpass.com/ranking/',
  color: '#d9534f',
  category: 'meetup',
};

function parseDateValue(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatJstTime(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function formatJstDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${part('year')}.${part('month')}.${part('day')}`;
}

function hasOnlineAttendanceHint(text: string | null): boolean {
  if (!text) return false;
  return /(オンライン(?:開催|配信|参加|あり|有り)|現地[・･\/／+＋&＆、]?オンライン|ハイブリッド|hybrid)/i.test(text);
}

function isOfflineTokyo(place: string | null, attendanceHint: string | null): place is string {
  if (!place) return false;
  if (/(オンライン|online|場所未定|会場未定|未定)/i.test(place)) return false;
  if (hasOnlineAttendanceHint(attendanceHint)) return false;
  return /東京都?|東京/.test(place);
}

function detailsOf(item: ReturnType<cheerio.CheerioAPI>): string | null {
  const rank = cleanText(item.find('.label_ranking').first().text());
  const group = cleanText(item.find('.series_title').first().text());
  const subtitle = cleanText(item.find('.event_subtitle').first().text());
  const participants = cleanText(item.find('.event_participants').first().text());
  return cleanText(
    [
      rank ? `ランキング ${rank}位` : null,
      group,
      subtitle,
      participants ? `参加 ${participants}` : null,
    ]
      .filter(Boolean)
      .join(' / ')
  );
}

export function parseConnpassRankingHtml(html: string): TrackedEvent[] {
  const $ = cheerio.load(html);

  return $('.ranking_event_list')
    .toArray()
    .map((el): TrackedEvent | null => {
      const item = $(el);
      const title = cleanText(item.find('.event_title a').first().text());
      const url = item.find('.event_title a').first().attr('href') || source.url;
      const startDate = parseDateValue(item.find('.dtstart .value-title').first().attr('title'));
      const endDate = parseDateValue(item.find('.dtend .value-title').first().attr('title'));
      const location = cleanText(item.find('.event_place').first().text());
      const attendanceHint = cleanText(
        [
          title,
          item.find('.event_subtitle').first().text(),
        ]
          .filter(Boolean)
          .join(' ')
      );

      if (!title || !startDate || !isOfflineTokyo(location, attendanceHint)) return null;

      const time = formatJstTime(startDate);

      return {
        title,
        date: startDate,
        dateDisplay: formatJstDate(startDate),
        time,
        price: null,
        venue: location,
        location,
        details: detailsOf(item),
        url,
        source: source.name,
        sourceUrl: source.url,
        sourceColor: source.color,
        sourceCategory: source.category,
        calendarUrl: googleCalendarUrl({
          title,
          date: startDate,
          time,
          venue: location,
          url,
          source: source.name,
          endDate,
        }),
      };
    })
    .filter((event): event is TrackedEvent => event !== null);
}

export async function scrape(): Promise<TrackedEvent[]> {
  const config = axiosConfig(15000);
  const response = await axios.get<string>(source.url, config);
  return parseConnpassRankingHtml(response.data);
}

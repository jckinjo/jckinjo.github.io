import axios from 'axios';
import * as cheerio from 'cheerio';
import { axiosConfig, cleanText, googleCalendarUrl } from './utils';
import type { Scraper, Source, TrackedEvent } from './types';

type JsonRecord = Record<string, unknown>;

interface MeetupScraperOptions {
  name: string;
  url: string;
  color: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? cleanText(value) : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function refValue(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return stringValue(value.__ref);
}

function parseDateValue(value: unknown): Date | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(raw);
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

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\u2028/g, '\n');
}

function extractFee(description: unknown): string | null {
  if (typeof description !== 'string') return null;

  const line = stripMarkdown(description)
    .split(/\r?\n/)
    .map((l) => cleanText(l))
    .find((l): l is string => Boolean(l && /\bFee\s*[:：]/i.test(l)));

  return cleanText(line?.replace(/^.*?\bFee\s*[:：]\s*/i, ''));
}

function venueFromApollo(state: JsonRecord, event: JsonRecord): JsonRecord | null {
  const venueRef = refValue(event.venue);
  if (!venueRef) return null;
  const venue = state[venueRef];
  return isRecord(venue) ? venue : null;
}

function venueName(venue: JsonRecord | null, isOnline: boolean): string | null {
  const name = stringValue(venue?.name);
  if (!name && isOnline) return 'Online';
  if (name?.toLowerCase() === 'online event') return 'Online';
  return name;
}

function venueLocation(venue: JsonRecord | null): string | null {
  const address = stringValue(venue?.address);
  const city = stringValue(venue?.city);
  const country = stringValue(venue?.country);
  return cleanText([address, city, country?.toUpperCase()].filter(Boolean).join(', ')) || null;
}

function attendeeDetails(event: JsonRecord): string | null {
  if (!isRecord(event.going)) return null;
  const totalCount = numberValue(event.going.totalCount);
  return totalCount === null ? null : `${totalCount}人参加予定`;
}

function collectJsonLdEvents(value: unknown, events: JsonRecord[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdEvents(item, events));
    return;
  }

  if (!isRecord(value)) return;

  const type = value['@type'];
  const isEvent = type === 'Event' || (Array.isArray(type) && type.includes('Event'));
  if (isEvent) events.push(value);

  if (Array.isArray(value['@graph'])) collectJsonLdEvents(value['@graph'], events);
}

function eventsFromJsonLd($: cheerio.CheerioAPI, source: Source): TrackedEvent[] {
  const events: JsonRecord[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectJsonLdEvents(JSON.parse($(el).text()), events);
    } catch {
      // Ignore non-JSON script blocks.
    }
  });

  return events
    .map((event): TrackedEvent | null => {
      const date = parseDateValue(event.startDate);
      if (!date) return null;

      const endDate = parseDateValue(event.endDate);
      const title = stringValue(event.name) || source.name;
      const url = stringValue(event.url) || source.url;
      const location = isRecord(event.location) ? event.location : null;
      const attendanceMode = stringValue(event.eventAttendanceMode);
      const isOnline = Boolean(attendanceMode?.includes('Online'));
      const address = isRecord(location?.address) ? location.address : null;
      const streetAddress = stringValue(address?.streetAddress);
      const locality = stringValue(address?.addressLocality);
      const country = stringValue(address?.addressCountry);
      const venue = stringValue(location?.name) || (isOnline ? 'Online' : null);
      const locationText = cleanText([streetAddress, locality, country?.toUpperCase()].filter(Boolean).join(', ')) || null;

      return {
        title,
        date,
        dateDisplay: formatJstDate(date),
        time: formatJstTime(date),
        price: extractFee(event.description),
        venue,
        location: locationText,
        details: null,
        url,
        source: source.name,
        sourceUrl: source.url,
        sourceColor: source.color,
        sourceCategory: source.category,
        calendarUrl: googleCalendarUrl({
          title,
          date,
          time: formatJstTime(date),
          venue,
          url,
          source: source.name,
          endDate,
        }),
      } satisfies TrackedEvent;
    })
    .filter((event): event is TrackedEvent => event !== null);
}

function eventsFromApollo($: cheerio.CheerioAPI, source: Source): TrackedEvent[] {
  const raw = $('#__NEXT_DATA__').text();
  if (!raw) return [];

  let state: unknown;
  try {
    const nextData = JSON.parse(raw);
    state = nextData?.props?.pageProps?.__APOLLO_STATE__;
  } catch {
    return [];
  }

  if (!isRecord(state)) return [];

  return Object.values(state)
    .filter((item): item is JsonRecord => isRecord(item) && item.__typename === 'Event')
    .filter((event) => stringValue(event.status) !== 'PAST')
    .map((event): TrackedEvent | null => {
      const date = parseDateValue(event.dateTime);
      if (!date) return null;

      const endDate = parseDateValue(event.endTime);
      const title = stringValue(event.title) || source.name;
      const url = stringValue(event.eventUrl) || source.url;
      const isOnline = event.isOnline === true || stringValue(event.eventType) === 'ONLINE';
      const venue = venueFromApollo(state, event);
      const venueText = venueName(venue, isOnline);

      return {
        title,
        date,
        dateDisplay: formatJstDate(date),
        time: formatJstTime(date),
        price: extractFee(event.description),
        venue: venueText,
        location: venueLocation(venue),
        details: attendeeDetails(event),
        url,
        source: source.name,
        sourceUrl: source.url,
        sourceColor: source.color,
        sourceCategory: source.category,
        calendarUrl: googleCalendarUrl({
          title,
          date,
          time: formatJstTime(date),
          venue: venueText,
          url,
          source: source.name,
          endDate,
        }),
      } satisfies TrackedEvent;
    })
    .filter((event): event is TrackedEvent => event !== null);
}

export function createMeetupScraper(options: MeetupScraperOptions): Scraper {
  const source: Source = {
    ...options,
    category: 'meetup',
  };

  return {
    source,
    async scrape(): Promise<TrackedEvent[]> {
      const res = await axios.get<string>(source.url, axiosConfig(15000));
      const $ = cheerio.load(res.data);
      const events = eventsFromApollo($, source);
      return events.length > 0 ? events : eventsFromJsonLd($, source);
    },
  };
}

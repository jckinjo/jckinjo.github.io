import * as kotaroOshio from './kotaro-oshio';
import * as depapepe from './depapepe';
import * as igusaseiji from './igusaseiji';
import * as gogosatoshi from './gogosatoshi';
import * as tatsuyamaruyama from './tatsuyamaruyama';
import * as spocaleBasketballJapan from './spocale-basketball-japan';
import * as kawasakiArtCenterMovie from './kawasaki-art-center-movie';
import * as fMarche from './f-marche';
import * as ipokabu from './ipokabu';
import * as nowhereTokyo from './nowhere-tokyo';
import { createMeetupScraper } from './meetup';
import type { Scraper, ScrapedData, TrackedEvent } from './types';

const tokyoExpatSocialClub = createMeetupScraper({
  name: 'Tokyo Expat Social Club',
  url: 'https://www.meetup.com/tokyo-expat-social-club/',
  color: '#e51937',
});

const chillRunCrewTokyo = createMeetupScraper({
  name: 'Chill Run Crew Tokyo',
  url: 'https://www.meetup.com/chillruncrew-tokyo/',
  color: '#0ea5e9',
});

const scrapers: Scraper[] = [
  kotaroOshio,
  depapepe,
  igusaseiji,
  gogosatoshi,
  tatsuyamaruyama,
  spocaleBasketballJapan,
  kawasakiArtCenterMovie,
  fMarche,
  ipokabu,
  nowhereTokyo,
  tokyoExpatSocialClub,
  chillRunCrewTokyo,
];

// Simple in-memory cache: { data, expiresAt }
interface Cache {
  data: ScrapedData;
  expiresAt: number;
}

let cache: Cache | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function clean(str: string | null | undefined): string | null {
  if (!str) return str ?? null;
  return str.replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

function fallbackEventsFor(sourceName: string, fallbackData?: ScrapedData): TrackedEvent[] {
  if (!fallbackData) return [];

  return fallbackData.upcoming
    .filter((event) => event.source === sourceName && !event.isPlaceholder)
    .map((event) => ({
      ...event,
      // Static JSON stores dates as ISO strings; restore them before sorting.
      date: event.date ? new Date(event.date as unknown as string) : null,
    }))
    .filter((event) => !event.date || !Number.isNaN(event.date.getTime()));
}

export async function scrapeAll(forceRefresh = false, fallbackData?: ScrapedData): Promise<ScrapedData> {
  if (!forceRefresh && cache && Date.now() < cache.expiresAt) {
    return cache.data;
  }

  const results = await Promise.allSettled(scrapers.map((s) => s.scrape()));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allEvents: TrackedEvent[] = [];

  results.forEach((result, i) => {
    const scraperMeta = scrapers[i].source;
    let events: TrackedEvent[];
    if (result.status === 'fulfilled') {
      events = result.value;
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      events = fallbackEventsFor(scraperMeta.name, fallbackData);
      console.error(
        `[${scraperMeta.name}] scrape failed: ${message}` +
          (events.length ? `; kept ${events.length} cached event(s)` : '')
      );
    }
    // Normalize whitespace/zero-width chars in all string fields
    events = events.map(c => ({
      ...c,
      title: clean(c.title),
      venue: clean(c.venue),
      location: clean(c.location),
      details: clean(c.details),
      dateDisplay: clean(c.dateDisplay),
      sourceCategory: c.sourceCategory || scraperMeta.category,
    }));

    if (events.length === 0) {
      // Return a "visit site" placeholder so the source is still shown in the UI
      allEvents.push({
        id: `${scraperMeta.name}-placeholder`,
        title: null,
        date: null,
        dateDisplay: null,
        time: null,
        price: null,
        venue: null,
        location: null,
        details: null,
        url: scraperMeta.url,
        source: scraperMeta.name,
        sourceUrl: scraperMeta.url,
        sourceColor: scraperMeta.color,
        sourceCategory: scraperMeta.category,
        calendarUrl: null,
        isPlaceholder: true,
      });
    } else {
      events.forEach((c, j) => {
        allEvents.push({ id: `${scraperMeta.name}-${j}`, ...c });
      });
    }
  });

  // Sort: events with dates first (chronological), then placeholders
  allEvents.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.getTime() - b.date.getTime();
  });

  // Separate upcoming from past
  const upcoming = allEvents.filter((c) => !c.date || c.date >= today);
  const past = allEvents.filter((c) => c.date && c.date < today);

  const data: ScrapedData = { upcoming, past, scrapedAt: new Date().toISOString() };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

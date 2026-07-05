import axios from 'axios';
import * as cheerio from 'cheerio';
import { axiosConfig, cleanText, googleCalendarUrl, parseDate } from './utils';
import type { Source, TrackedEvent } from './types';

export const source: Source = {
  name: 'バスケットボール日本代表',
  url: 'https://spocale.com/sports/5/team_and_players/519',
  color: '#f59e0b',
  category: 'sports',
};

function absoluteUrl(href: string): string {
  return new URL(href, source.url).toString();
}

function normalizeDetails(text: string | null): string | null {
  return cleanText(text?.replace(/\u3000\|\u3000/g, ' | '));
}

export async function scrape(): Promise<TrackedEvent[]> {
  const res = await axios.get<string>(source.url, axiosConfig());
  const $ = cheerio.load(res.data);
  const events: TrackedEvent[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentDate: Date | null = null;
  $('.custom-calendar-table .games_calendar')
    .first()
    .children()
    .each((_, el) => {
      const $el = $(el);

      if ($el.hasClass('table-header')) {
        currentDate = parseDate($el.find('.current-date-text').first().text());
        return;
      }

      if (!$el.hasClass('table-list') || !currentDate) return;

      const $link = $el.find('> a').first();
      if ($link.length === 0) return;

      const team1 = cleanText($link.find('.versus01').first().text());
      const team2 = cleanText($link.find('.versus02').first().text());
      const fallbackName = cleanText($link.find('.game-name').first().text());
      const title = team1 && team2 ? `${team1} VS ${team2}` : fallbackName || source.name;

      const time = cleanText($link.find('> .time.en').first().text());
      const venue = cleanText($link.find('.game-detail .access.pc').first().text());
      const details = normalizeDetails($link.find('.game-detail p').first().text());
      const href = $link.attr('href');
      const url = href ? absoluteUrl(href) : source.url;
      const date = new Date(currentDate);

      if (date < today) return;

      events.push({
        title,
        date,
        dateDisplay: cleanText($el.prevAll('.table-header').first().find('.current-date-text').text()),
        time,
        price: null,
        venue,
        location: null,
        details,
        url,
        source: source.name,
        sourceUrl: source.url,
        sourceColor: source.color,
        sourceCategory: source.category,
        calendarUrl: googleCalendarUrl({ title, date, time, venue, url, source: source.name }),
      });
    });

  return events;
}

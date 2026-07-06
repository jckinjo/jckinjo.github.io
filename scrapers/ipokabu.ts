import axios from 'axios';
import * as cheerio from 'cheerio';
import { axiosConfig, cleanText, googleCalendarUrl } from './utils';
import type { Source, TrackedEvent } from './types';

export const source: Source = {
  name: '庶民のIPO',
  url: 'https://ipokabu.net/yotei/',
  color: '#22c55e',
  category: 'market',
};

const BB_CELL_SELECTOR = '.ipo_yotei2, .ipo_bosyu2, .td_ipo_syuryo';

interface ParsedIpo {
  company: string;
  code: string | null;
  market: string | null;
  leadManager: string | null;
  url: string;
  listingDate: Date;
  bookBuildingStart: Date | null;
  bookBuildingRange: string | null;
}

function absoluteUrl(href: string | undefined): string {
  return new URL(href || source.url, source.url).toString();
}

function normalizeText(str: string | null | undefined): string | null {
  return cleanText(str?.normalize('NFKC').replace(/\u3000/g, ' '));
}

function sectionYear($section: cheerio.Cheerio<any>): number | null {
  const match = normalizeText($section.find('h2').first().text())?.match(/(\d{4})年/);
  return match ? Number(match[1]) : null;
}

function parseMonthDay(text: string | null | undefined): { month: number; day: number } | null {
  const match = normalizeText(text)?.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  return { month: Number(match[1]), day: Number(match[2]) };
}

function dateFromMonthDay(year: number, monthDay: { month: number; day: number }): Date {
  return new Date(year, monthDay.month - 1, monthDay.day, 0, 0, 0, 0);
}

function bookBuildingStartDate(listingDate: Date, text: string | null | undefined): Date | null {
  const monthDay = parseMonthDay(text);
  if (!monthDay) return null;

  const listingMonth = listingDate.getMonth() + 1;
  const year = monthDay.month > listingMonth ? listingDate.getFullYear() - 1 : listingDate.getFullYear();
  return dateFromMonthDay(year, monthDay);
}

function formatDateDisplay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}

function detailsFor(entry: ParsedIpo): string | null {
  return cleanText(
    [
      entry.code ? `証券コード ${entry.code}` : null,
      entry.market ? `市場 ${entry.market}` : null,
      entry.bookBuildingRange ? `BB期間 ${entry.bookBuildingRange}` : null,
      entry.leadManager ? `主幹事 ${entry.leadManager}` : null,
    ]
      .filter(Boolean)
      .join(' / ')
  );
}

function eventFromEntry(entry: ParsedIpo, kind: 'listing' | 'bookBuildingStart'): TrackedEvent {
  const isListing = kind === 'listing';
  const date = isListing ? entry.listingDate : entry.bookBuildingStart;
  const title = `${entry.company} ${isListing ? '上場日' : 'ブックビルディング開始'}`;

  return {
    title,
    date,
    dateDisplay: date ? formatDateDisplay(date) : null,
    time: null,
    price: null,
    venue: null,
    location: null,
    details: detailsFor(entry),
    url: entry.url,
    source: source.name,
    sourceUrl: source.url,
    sourceColor: source.color,
    sourceCategory: source.category,
    calendarUrl: date
      ? googleCalendarUrl({
          title,
          date,
          time: null,
          venue: null,
          url: entry.url,
          source: source.name,
        })
      : null,
  };
}

function parseIpoRow(
  $: cheerio.CheerioAPI,
  row: Parameters<cheerio.CheerioAPI>[0],
  year: number
): ParsedIpo | null {
  const $row = $(row);
  const $companyCell = $row.find('.td_kigyo').first();
  const $companyLink = $companyCell.find('a[href^="/ipo/"]').first();
  const company = normalizeText($companyLink.text());
  if (!company) return null;

  const listingMonthDay = parseMonthDay($row.children('td').first().text());
  if (!listingMonthDay) return null;

  const $bbCell = $row.find(BB_CELL_SELECTOR).first();
  const bookBuildingRange = normalizeText($bbCell.text());
  const listingDate = dateFromMonthDay(year, listingMonthDay);

  return {
    company,
    code: normalizeText($row.find('.td_code2').first().text()),
    market: normalizeText($row.next('tr').find('.td_sijo2').first().text()),
    leadManager: normalizeText($companyCell.find('.ipo_syu a').first().text()),
    url: absoluteUrl($companyLink.attr('href')),
    listingDate,
    bookBuildingStart: bookBuildingStartDate(listingDate, bookBuildingRange),
    bookBuildingRange,
  };
}

export async function scrape(): Promise<TrackedEvent[]> {
  const res = await axios.get<string>(source.url, axiosConfig());
  const $ = cheerio.load(res.data);
  const events: TrackedEvent[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  $('.tb_ipo_sch section').each((_, section) => {
    const $section = $(section);
    const year = sectionYear($section);
    if (!year) return;

    $section.find('.nosp table').each((__, table) => {
      const hasBookBuildingColumn = $(table)
        .find('th')
        .toArray()
        .some((th) => normalizeText($(th).text())?.includes('ブックビルディング'));
      if (!hasBookBuildingColumn) return;

      $(table)
        .find('tr')
        .each((___, row) => {
          const entry = parseIpoRow($, row, year);
          if (!entry) return;

          const listingEvent = eventFromEntry(entry, 'listing');
          if (listingEvent.date && listingEvent.date >= today) events.push(listingEvent);

          const bookBuildingEvent = eventFromEntry(entry, 'bookBuildingStart');
          if (bookBuildingEvent.date && bookBuildingEvent.date >= today) events.push(bookBuildingEvent);
        });
    });
  });

  return events;
}

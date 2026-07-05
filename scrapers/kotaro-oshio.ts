import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseDate, googleCalendarUrl, axiosConfig } from './utils';
import type { Concert, Source } from './types';

export const source: Source = {
  name: '押尾コータロー',
  url: 'https://www.kotaro-oshio.com/schedule/live/',
  color: '#8e44ad',
};

export async function scrape(): Promise<Concert[]> {
  const res = await axios.get<string>(source.url, axiosConfig());
  const $ = cheerio.load(res.data);
  const concerts: Concert[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  $('article.h2a').each((_, article) => {
    const $a = $(article);

    // Title: h2 text (strip the embedded calendar link text)
    const $h2 = $a.find('h2').first();
    $h2.find('a').remove(); // remove embedded Google Calendar anchor
    const title = $h2.text().trim();
    if (!title) return;

    let dateStr = '';
    let venue = '';
    let price = '';

    $a.find('dl.live_info').each((_, dl) => {
      const imgSrc = $(dl).find('dt img').attr('src') || '';
      const ddText = $(dl).find('dd').text().trim();

      if (imgSrc.includes('icon_date')) {
        dateStr = ddText;
      } else if (imgSrc.includes('icon_place')) {
        venue = ddText;
      } else if (imgSrc.includes('icon_fee')) {
        const m = ddText.match(/[\d,]+円/);
        if (m) price = m[0];
      }
    });

    const date = parseDate(dateStr);
    if (!date || date < today) return;

    // Extract open/start times
    const timeMatch = dateStr.match(/開演\s*(\d{1,2}:\d{2})/);

    concerts.push({
      title,
      date,
      dateDisplay: dateStr.split('　')[0].trim(),
      time: timeMatch ? timeMatch[1] : null,
      price: price || null,
      venue: venue || null,
      location: null,
      url: source.url,
      source: source.name,
      sourceUrl: source.url,
      sourceColor: source.color,
      calendarUrl: googleCalendarUrl({ title, date, time: timeMatch ? timeMatch[1] : null, venue, url: source.url, source: source.name }),
    });
  });

  return concerts;
}

import axios from 'axios';
import { axiosConfig, cleanText, googleCalendarUrl } from './utils';
import type { Source, TrackedEvent } from './types';

export const source: Source = {
  name: '飛地・東京',
  url: 'https://www.instagram.com/nowhere__tokyo/',
  color: '#e1306c',
  category: 'meetup',
};

const PROFILE_API = 'https://www.instagram.com/api/v1/users/web_profile_info/';
const CANCELLED_PATTERN = /(?:活動)?(?:中止|終止|取消|キャンセル)/;

interface InstagramCaptionEdge {
  node?: { text?: string };
}

interface InstagramPostNode {
  shortcode?: string;
  taken_at_timestamp?: number;
  edge_media_to_caption?: { edges?: InstagramCaptionEdge[] };
}

interface InstagramProfileResponse {
  data?: {
    user?: {
      edge_owner_to_timeline_media?: {
        edges?: Array<{ node?: InstagramPostNode }>;
      };
    };
  };
  status?: string;
}

interface ParsedDateTime {
  date: Date;
  dateDisplay: string;
  time: string | null;
  endDate: Date | null;
}

function captionOf(post: InstagramPostNode): string {
  return post.edge_media_to_caption?.edges?.[0]?.node?.text || '';
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateTime(caption: string, postedAt: Date): ParsedDateTime | null {
  const searchableCaption = caption.normalize('NFKC');
  const labelled = searchableCaption.match(
    /(?:活動時間|時間間?|日時)\s*[:：]?\s*(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日[^\n]*/
  );
  const fullDate = searchableCaption.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日[^\n]*/);
  const slashDate = searchableCaption.match(/(?:活動時間|時間間?|日時)\s*[:：]?\s*(?:(\d{4})[/.])?(\d{1,2})[/.](\d{1,2})[^\n]*/);
  const match = labelled || fullDate || slashDate;
  if (!match) return null;

  const year = match[1] ? Number(match[1]) : postedAt.getFullYear();
  const month = Number(match[2]);
  const day = Number(match[3]);
  const line = match[0];
  const times = line.match(/(\d{1,2}:\d{2})\s*(?:[~〜～–—-]\s*(\d{1,2}:\d{2}))?/);
  const time = times?.[1] || null;
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
  }

  let endDate: Date | null = null;
  if (times?.[2]) {
    const [hours, minutes] = times[2].split(':').map(Number);
    endDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  return {
    date,
    dateDisplay: `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`,
    time,
    endDate,
  };
}

function field(caption: string, labels: string): string | null {
  const match = caption.match(new RegExp(`(?:${labels})\\s*[:：]\\s*([^\\n]+)`));
  return cleanText(match?.[1]);
}

function titleOf(caption: string): string | null {
  return cleanText(caption.split(/\r?\n/).find((line) => line.trim()));
}

function locationOf(caption: string): string | null {
  return field(caption, '地點|地点|場所|会場')?.replace(/^[📍\s]+/, '') || null;
}

function detailsOf(caption: string): string | null {
  return cleanText(
    [field(caption, '分享嘉賓|嘉賓|ゲスト'), field(caption, '領讀者|领读者'), field(caption, '名額|名额')]
      .filter(Boolean)
      .join(' / ')
  );
}

export function parseInstagramTimeline(posts: InstagramPostNode[], now = new Date()): TrackedEvent[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const cancelledDates = new Set<string>();
  for (const post of posts) {
    const caption = captionOf(post);
    if (!CANCELLED_PATTERN.test(caption)) continue;
    const postedAt = new Date((post.taken_at_timestamp || 0) * 1000);
    const parsed = parseDateTime(caption, postedAt);
    if (parsed) cancelledDates.add(dateKey(parsed.date));
  }

  return posts
    .map((post): TrackedEvent | null => {
      const caption = captionOf(post);
      if (!caption || CANCELLED_PATTERN.test(caption)) return null;

      const postedAt = new Date((post.taken_at_timestamp || 0) * 1000);
      const parsed = parseDateTime(caption, postedAt);
      const title = titleOf(caption);
      if (!parsed || !title || parsed.date < today || cancelledDates.has(dateKey(parsed.date))) return null;

      const url = post.shortcode
        ? `https://www.instagram.com/p/${post.shortcode}/`
        : source.url;
      const location = locationOf(caption);
      const venue = location?.match(/飛地[・·]?東京|東京飛地書店|飛地書店/)?.[0] || '飛地・東京';

      return {
        title,
        date: parsed.date,
        dateDisplay: parsed.dateDisplay,
        time: parsed.time,
        price: field(caption, '入場費用|費用|料金'),
        venue,
        location,
        details: detailsOf(caption),
        url,
        source: source.name,
        sourceUrl: source.url,
        sourceColor: source.color,
        sourceCategory: source.category,
        calendarUrl: googleCalendarUrl({
          title,
          date: parsed.date,
          time: parsed.time,
          venue: location || venue,
          url,
          source: source.name,
          endDate: parsed.endDate,
        }),
      };
    })
    .filter((event): event is TrackedEvent => event !== null);
}

export async function scrape(): Promise<TrackedEvent[]> {
  const config = axiosConfig(15000);
  config.headers = {
    ...config.headers,
    'X-IG-App-ID': '936619743392459',
  };

  const response = await axios.get<InstagramProfileResponse>(PROFILE_API, {
    ...config,
    params: { username: 'nowhere__tokyo' },
  });
  const posts = response.data.data?.user?.edge_owner_to_timeline_media?.edges
    ?.map((edge) => edge.node)
    .filter((post): post is InstagramPostNode => Boolean(post));

  if (response.data.status !== 'ok' || !posts) {
    throw new Error('Instagram profile response did not include timeline posts');
  }

  return parseInstagramTimeline(posts);
}

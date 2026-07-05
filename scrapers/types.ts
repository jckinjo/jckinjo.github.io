export type SourceCategory = 'concert' | 'sports' | 'meetup' | 'movie' | 'market';

export interface TrackedEvent {
  title: string | null;
  date: Date | null;
  dateDisplay: string | null;
  time: string | null;
  price: string | null;
  venue: string | null;
  location: string | null;
  details?: string | null;
  url: string;
  source: string;
  sourceUrl: string;
  sourceColor: string;
  sourceCategory?: SourceCategory;
  calendarUrl: string | null;
  isPlaceholder?: boolean;
  id?: string;
}

export type Concert = TrackedEvent;

export interface Source {
  name: string;
  url: string;
  color: string;
  category?: SourceCategory;
}

export interface Scraper {
  scrape(): Promise<TrackedEvent[]>;
  source: Source;
}

export interface ScrapedData {
  upcoming: TrackedEvent[];
  past: TrackedEvent[];
  scrapedAt: string;
}

import type { RawJob, SourceConfig } from '../shared/types.js';
import type { PoliteHttp } from './http.js';

/** Context handed to every adapter — fetch through this, never raw fetch. */
export interface ScrapeContext {
  http: PoliteHttp;
  config: SourceConfig;
  log: (msg: string) => void;
  /** Injected clock for testable date parsing. */
  now: Date;
}

/** Board adapter: one file in src/sources/boards/ + one entry in config/sources.yaml. */
export interface BoardAdapter {
  id: string;
  fetch(ctx: ScrapeContext): Promise<RawJob[]>;
}

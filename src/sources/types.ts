import type { RawJob, SourceConfig } from '../shared/types.js';
import type { HttpClient } from './http.js';

/** Context handed to every adapter — fetch through this, never raw fetch.
 *  http is host-scoped per source (board adapters can only reach their own
 *  configured host — see scopeHttp). */
export interface ScrapeContext {
  http: HttpClient;
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

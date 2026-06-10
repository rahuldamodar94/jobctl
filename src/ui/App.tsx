/**
 * The single triage page — the entire UI.
 * Layout: header (scrape button, last-run strip, CSV, resume drawer)
 *         → filter bar → bulk-action bar (when rows selected) → dense table.
 * State model: filters drive a debounced fetch; status changes update the row
 * in place (no reload, so the row doesn't jump away mid-triage); a running
 * scrape is observed by polling /api/runs/latest every 2s.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  bulkStatus,
  clearDemoJobs,
  fetchJobs,
  filtersToParams,
  getConfig,
  getDemoCount,
  getJudgeStatus,
  getStats,
  latestRun,
  loadDemoJobs,
  patchJob,
  startJudge,
  startScrape,
  stopJudge,
  stopScrape,
  type AppConfig,
  type Filters,
  type JudgeStatus,
  type RunSummary,
  type Stats,
  type UiJob,
} from './api.js';
import { FilterBar } from './components/FilterBar.js';
import { JobRow } from './components/JobRow.js';
import { RunStatusStrip } from './components/RunStatusStrip.js';
import { ResumeDrawer } from './components/ResumeDrawer.js';
import { Onboarding } from './components/Onboarding.js';
import { Settings, type Tab as SettingsTab } from './components/Settings.js';
import { Button, Skeleton } from './components/ui.js';
import { JOB_STATUSES } from '../shared/types.js';
import { Play, Download, FileText, Settings as SettingsIcon, Crosshair, SearchX, Sparkles, Gavel, Square } from 'lucide-react';

// Bulk actions target every status EXCEPT 'new' (you don't bulk-reset to new —
// it's the untriaged default). Sourced from the shared vocab, not re-listed.
const BULK_STATUSES = JOB_STATUSES.filter((s) => s !== 'new');

const DEFAULT_FILTERS: Filters = {
  q: '',
  status: 'new,interested', // Active view: untriaged queue + things you're tracking
  category: '',
  minScore: '30',
  postedWithin: '14',
  match: 'matched',
  location: '',
  sort: 'score',
  verdict: '',
};

/** secondary icon-button (anchors + buttons share one look in the app bar) */
const ICON_BTN =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-surface-2/70 text-muted transition-all hover:bg-surface-3 hover:text-ink';

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Always-current filters for behavior-stable callbacks: reload and the row
  // handlers read filtersRef.current instead of closing over `filters`, so they
  // keep a stable identity. That's what lets JobRow be memoized (a memoized row
  // retains an old handler closure, but it routes through these ref-reading
  // callbacks, so it never acts on stale filters).
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [jobs, setJobs] = useState<UiJob[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [run, setRun] = useState<RunSummary | null>(null);
  const [judge, setJudge] = useState<JudgeStatus | null>(null);
  const [stopping, setStopping] = useState(false); // scrape-stop click in flight
  const [judgeStopping, setJudgeStopping] = useState(false); // judge-stop click in flight
  const [notice, setNotice] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [demoCount, setDemoCount] = useState(0);
  const [resumeGenEnabled, setResumeGenEnabled] = useState(false);
  // Domain dropdown vocabulary — from the user's config
  const [vocab, setVocab] = useState<Pick<AppConfig, 'categories'>>({ categories: [] });
  const [stats, setStats] = useState<Stats | null>(null);
  // How many rows are hidden purely by the Score/Posted refinements — drives the
  // "Show them" rescue when a status looks empty only because its jobs scored low.
  const [hiddenByRefinement, setHiddenByRefinement] = useState(0);
  // gates skeleton vs empty-state on first paint (before the first fetch lands)
  const [hasLoaded, setHasLoaded] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>(undefined);
  const [judgeNudgeDismissed, setJudgeNudgeDismissed] = useState(false);
  const openSettings = (tab?: SettingsTab) => { setSettingsTab(tab); setShowSettings(true); };
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const judgePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seededRef = useRef(false); // seed default filters from ui_prefs once

  // Server state is the single source of truth for "running" — survives page
  // reloads mid-scrape and covers CLI-triggered scrapes too.
  const scraping = run?.status === 'running';

  // Lazy loading: jobs accumulate in pages of PAGE_SIZE as the user scrolls.
  // `epoch` guards against a stale page landing after the filters changed.
  // serverConsumedRef = how many server rows we've actually pulled for the
  // current filter set; it ONLY grows by the count fetched per page. We use it
  // (not jobs.length) as the SQL OFFSET, because jobs.length shrinks when a
  // triaged row leaves the view — using that would skip/duplicate a row at a
  // page boundary (M2). Reset to 0 on every fresh reload.
  const epochRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const serverConsumedRef = useRef(0);

  const reload = useCallback(
    (opts: { keepSelection?: boolean } = {}) => {
      const epoch = ++epochRef.current;
      loadingRef.current = false; // any in-flight loadMore is now stale — unblock
      fetchJobs(filtersRef.current).then((r) => {
        if (epoch !== epochRef.current) return; // filters changed mid-flight
        setHasLoaded(true);
        setJobs(r.jobs);
        setTotal(r.total);
        serverConsumedRef.current = r.jobs.length; // fresh page set → reset offset base
        // poll-driven refreshes keep the user's bulk selection intact
        if (!opts.keepSelection) setSelected(new Set());
      });
      // pipeline counts can shift on any reload (status changes, new scrape).
      // Pass filters so each pill's count == what clicking it shows (WYSIWYG).
      getStats(filtersRef.current).then(setStats).catch(() => {});
    },
    []
  );

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const epoch = epochRef.current;
    // OFFSET from the STABLE consumed counter, not jobs.length (which shrinks
    // when a triaged row leaves the view → would skip/dupe at a page boundary).
    fetchJobs(filtersRef.current, serverConsumedRef.current)
      .then((r) => {
        if (epoch === epochRef.current) {
          serverConsumedRef.current += r.jobs.length;
          setJobs((js) => [...js, ...r.jobs]);
          setTotal(r.total);
        }
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, []);

  // Reload on filter change. Debounce ONLY the free-text inputs (search + location,
  // 250ms, so we don't fire a request per keystroke); discrete controls — status
  // pills, dropdowns — apply immediately so they feel instant (the old blanket
  // 250ms made every pill click feel laggy).
  const prevFiltersRef = useRef(filters);
  useEffect(() => {
    const prev = prevFiltersRef.current;
    prevFiltersRef.current = filters;
    // only free-text fields changed → debounce; any discrete control → fire now
    const changed = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k] !== prev[k]);
    const onlyTyping = changed.length > 0 && changed.every((k) => k === 'q' || k === 'location');
    const t = setTimeout(reload, onlyTyping ? 250 : 0);
    return () => clearTimeout(t);
  }, [reload, filters]);

  // When the list is empty ONLY because of the Score/Posted refinements, find out
  // how many rows a cleared view would show — powers the "Show them" rescue so a
  // status that looks empty (its jobs all scored low) isn't a dead end.
  useEffect(() => {
    if (total !== 0 || (!filters.minScore && !filters.postedWithin)) {
      setHiddenByRefinement(0);
      return;
    }
    let cancelled = false;
    fetchJobs({ ...filters, minScore: '', postedWithin: '' })
      .then((r) => !cancelled && setHiddenByRefinement(r.total))
      .catch(() => !cancelled && setHiddenByRefinement(0));
    return () => {
      cancelled = true;
    };
  }, [total, filters]);

  // Auto-load the next page when the footer sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && jobs.length < total) loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [jobs.length, total, loadMore]);
  const loadConfig = useCallback(() => {
    getConfig().then((c) => {
      if (!c) return; // fetch failed and no last-known config — keep current state
      setConfig(c);
      setResumeGenEnabled(c.resumeGeneration);
      setVocab({ categories: c.categories ?? [] });
      // seed the default triage view from the user's saved prefs (once)
      if (!seededRef.current) {
        seededRef.current = true;
        const ms = c.uiPrefs?.defaultMinScore;
        const pw = c.uiPrefs?.defaultPostedWithin;
        setFilters((f) => ({
          ...f,
          minScore: ms !== undefined ? String(ms) : f.minScore,
          postedWithin: pw !== undefined ? String(pw) : f.postedWithin,
          // fit-judge on → default the triage view to best-fit-first (STRONG→SKIP)
          sort: c.judgeEnabled ? 'verdict' : f.sort,
        }));
      }
    });
  }, []);

  useEffect(() => {
    latestRun().then(setRun);
    loadConfig();
    getDemoCount().then(setDemoCount).catch(() => {});
    getJudgeStatus().then(setJudge).catch(() => {});
  }, [loadConfig]);

  /** Judge the whole un-judged backlog ≥ floor (recovers a scrape that died
   *  before/during its judge phase). Background run — poll status for progress. */
  const onJudge = async () => {
    setNotice(null);
    setJudgeStopping(false); // clear any stale "Stopping…" from a prior run
    const { ok, error } = await startJudge();
    if (ok) {
      getJudgeStatus().then(setJudge).catch(() => {}); // flip to running → starts the poll
    } else {
      setNotice(error ?? 'Could not start judging.');
    }
  };

  const onLoadDemo = async () => {
    setNotice(null);
    try {
      await loadDemoJobs();
      setDemoCount(await getDemoCount());
      reload();
    } catch (e) {
      setNotice(`Couldn't load sample jobs: ${(e as Error).message}`);
    }
  };
  const onClearDemo = async () => {
    try {
      await clearDemoJobs();
      setDemoCount(0);
      reload();
    } catch (e) {
      setNotice(`Couldn't clear sample jobs: ${(e as Error).message}`);
    }
  };

  // Poll while a scrape is running (including one already running when the
  // page loads). When it finishes, refresh the job list.
  useEffect(() => {
    if (!scraping) return;
    pollRef.current = setInterval(async () => {
      // One bad poll must not kill the interval — latestRun() already returns
      // null on failure, but guard the whole body so nothing can throw out of it.
      try {
        const r = await latestRun();
        if (!r) return; // transient failure — keep polling, leave the strip as-is
        setRun(r);
        if (r.status !== 'running') {
          setStopping(false);
          reload({ keepSelection: true });
          // the scrape ran its own judge phase — refresh the backlog count so the
          // "Judge jobs" button reflects anything it couldn't finish.
          getJudgeStatus().then(setJudge).catch(() => {});
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scraping, reload]);

  // Poll judge progress while a background "Judge jobs" run is in flight; when it
  // finishes, refresh the job list (new verdicts) and the backlog count.
  useEffect(() => {
    if (!judge?.running) return;
    judgePollRef.current = setInterval(async () => {
      try {
        const s = await getJudgeStatus();
        if (!s) return; // transient failure — keep polling
        setJudge(s);
        if (!s.running) {
          setJudgeStopping(false);
          reload({ keepSelection: true });
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => {
      if (judgePollRef.current) clearInterval(judgePollRef.current);
    };
  }, [judge?.running, reload]);

  const onScrape = async () => {
    setNotice(null);
    setStopping(false);
    // The "this takes minutes / runs in background" hint now lives as a hover
    // tooltip on the status pill (RunStatusStrip), not a banner here.
    if (await startScrape()) {
      // Flip to running so the poll starts. If latestRun() momentarily fails
      // (transient → null), fall back to a synthetic running summary rather than
      // setting null (which would read as "not running" and never start the poll).
      const r = await latestRun();
      setRun(
        r ?? {
          id: -1,
          startedAt: new Date().toISOString(),
          completedAt: null,
          status: 'running',
          sources: [],
          totalNew: 0,
          sourcesDone: 0,
          sourcesTotal: 0,
          currentSource: null,
        }
      );
    } else {
      setNotice('Scrape not started — one is already running.');
    }
  };

  /** Cooperative stop — the scrape halts at the next source/company/judge job and
   *  completes as 'cancelled'. The poll reflects the real state. */
  const onStopScrape = async () => {
    setStopping(true);
    await stopScrape();
  };
  const onStopJudge = async () => {
    setJudgeStopping(true);
    await stopJudge();
  };

  /** A failed mutation reverts to server truth: reload + a visible notice —
   *  never leave the optimistic UI silently lying. */
  const onMutationError = useCallback(
    (e: unknown) => {
      setNotice(`Save failed: ${(e as Error).message} — view reloaded.`);
      reload({ keepSelection: true });
    },
    [reload]
  );

  const onStatus = useCallback(
    async (id: number, status: string) => {
      // optimistic: status + Updated column reflect the change instantly
      setJobs((js) =>
        js.map((j) => (j.id === id ? { ...j, status, status_updated_at: new Date().toISOString() } : j))
      );
      try {
        await patchJob(id, { status });
      } catch (e) {
        onMutationError(e);
      }
    },
    [onMutationError]
  );

  /** Does a status still belong in the current view? Mirrors the server's
   *  status-filter semantics (all = everything; empty hides dismissed).
   *  Reads filtersRef so it stays stable (memoized rows call it). */
  const statusVisible = useCallback((status: string): boolean => {
    const f = filtersRef.current.status;
    if (f === 'all') return true;
    if (!f) return status !== 'dismissed';
    return f.split(',').includes(status);
  }, []);

  /** Called by the row when the status interaction fully settles (after the
   *  note popover, if any). Rows that left the filter fade out, then go. */
  const [leavingIds, setLeavingIds] = useState<Set<number>>(new Set());
  const onSettled = useCallback(
    (id: number, status: string) => {
      if (statusVisible(status)) return; // still belongs — keep it in place
      setLeavingIds((s) => new Set(s).add(id));
      setTimeout(() => {
        setJobs((js) => js.filter((j) => j.id !== id));
        setTotal((t) => Math.max(0, t - 1));
        setSelected((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        setLeavingIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }, 320); // just past the 300ms opacity transition
    },
    [statusVisible]
  );

  const onNotes = useCallback(
    async (id: number, notes: string) => {
      setJobs((js) => js.map((j) => (j.id === id ? { ...j, user_notes: notes } : j)));
      try {
        await patchJob(id, { notes });
      } catch (e) {
        onMutationError(e);
      }
    },
    [onMutationError]
  );

  const onBulk = async (status: string) => {
    const ids = [...selected];
    try {
      await bulkStatus(ids, status);
      reload();
    } catch (e) {
      onMutationError(e);
    }
  };

  const toggle = useCallback(
    (id: number) =>
      setSelected((s) => {
        const next = new Set(s);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
    []
  );

  // Stable per-row verdict merge (passed straight to a memoized JobRow). Merges
  // a PATCH into the live row by id — never spreads a row object captured at
  // re-judge-click time, which would revert a status/notes edit made meanwhile.
  const onJudged = useCallback(
    (id: number, patch: Partial<UiJob>) => setJobs((js) => js.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    []
  );

  // first-run: no usable config yet → guided setup (unless the user opened
  // Settings to configure manually)
  if (config && !config.configured && !showSettings) {
    return <Onboarding config={config} onDone={() => { seededRef.current = false; loadConfig(); reload(); }} />;
  }

  const TH = 'sticky top-[57px] z-10 border-b border-line bg-surface px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint';

  return (
    <div className="min-h-screen text-sm">
      {showSettings && (
        <Settings
          config={config}
          initialTab={settingsTab}
          onClose={() => setShowSettings(false)}
          onSaved={() => { seededRef.current = false; loadConfig(); reload(); }}
        />
      )}

      {/* ── App bar ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-emerald-600 shadow-glow-accent">
              <Crosshair className="h-[18px] w-[18px] text-accent-fg" strokeWidth={2.4} />
            </span>
            <span className="text-[17px] font-extrabold tracking-tight text-ink">
              job<span className="text-accent">ctl</span>
            </span>
          </div>
          <div className="hidden h-5 w-px bg-line sm:block" />
          <RunStatusStrip run={run} scraping={scraping} />
          {notice && (
            <span className="rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/25">
              {notice}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* Appears only when the judge is enabled AND there's un-judged work
                ≥ the score floor (or a run is in flight) — e.g. recovering a
                scrape that died before its judge phase finished. */}
            {judge?.enabled && (judge.running || judge.pending > 0) && (
              <Button
                variant="secondary"
                onClick={onJudge}
                loading={judge.running}
                disabled={scraping || judge.running}
                title="Judge un-judged matched jobs above your score floor — no re-scrape needed"
              >
                {!judge.running && <Gavel className="h-4 w-4" />}
                {judge.running
                  ? judge.total > 0
                    ? `Judging ${judge.done}/${judge.total}…`
                    : 'Judging…'
                  : `Judge ${judge.pending} job${judge.pending === 1 ? '' : 's'}`}
              </Button>
            )}
            {judge?.enabled && judge.running && (
              <Button variant="ghost" onClick={onStopJudge} disabled={judgeStopping} title="Stop judging — verdicts already written are kept">
                <Square className="h-3.5 w-3.5" />
                {judgeStopping ? 'Stopping…' : 'Stop'}
              </Button>
            )}
            <Button variant="primary" onClick={onScrape} loading={scraping}>
              {!scraping && <Play className="h-4 w-4" />}
              {scraping ? 'Scraping…' : 'Run scrape'}
            </Button>
            {scraping && (
              <Button variant="ghost" onClick={onStopScrape} disabled={stopping} title="Stop the scrape — it halts at the next source and keeps what it found">
                <Square className="h-3.5 w-3.5" />
                {stopping ? 'Stopping…' : 'Stop'}
              </Button>
            )}
            <div className="flex items-center gap-1">
              <a
                href={`/api/export.csv?${filtersToParams(filters)}`}
                title="Export the current filtered view to CSV (all pages)"
                className={ICON_BTN}
              >
                <Download className="h-[17px] w-[17px]" />
              </a>
              <button onClick={() => setShowResume(true)} title="Resume reference drawer" className={ICON_BTN}>
                <FileText className="h-[17px] w-[17px]" />
              </button>
              <button onClick={() => openSettings()} title="Settings" className={ICON_BTN}>
                <SettingsIcon className="h-[17px] w-[17px]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-4">
        {/* Contextual discovery for the optional fit-judge: a fresh user skips AI
            in onboarding, so nudge them here (dismissible) once they have jobs. */}
        {config?.configured && !config.judgeEnabled && !judgeNudgeDismissed && jobs.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
            <Gavel className="h-3.5 w-3.5 text-accent" />
            <span className="text-muted">
              Turn on the <span className="font-medium text-ink">AI fit-judge</span> to score these jobs against your resume — STRONG/DECENT/WEAK/SKIP, with reasons.
            </span>
            <button onClick={() => openSettings('ai')} className="ml-2 font-medium text-accent hover:underline">
              Set it up
            </button>
            <button onClick={() => setJudgeNudgeDismissed(true)} className="ml-auto font-medium text-faint hover:text-ink">
              Dismiss
            </button>
          </div>
        )}
        {demoCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-muted">
              Showing <span className="tnum font-semibold text-ink">{demoCount}</span> sample jobs so you can explore the UI.
            </span>
            <button onClick={onClearDemo} className="ml-auto font-medium text-accent hover:underline">
              Clear sample jobs
            </button>
          </div>
        )}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          defaults={config?.judgeEnabled ? { ...DEFAULT_FILTERS, sort: 'verdict' } : DEFAULT_FILTERS}
          vocab={vocab}
          stats={stats}
          judgeEnabled={config?.judgeEnabled ?? false}
          verdictFilterEnabled={(config?.judgeEnabled ?? false) && (config?.rubricExists ?? false)}
        />

        {/* bulk action bar (sticks under the app bar while triaging a selection) */}
        {selected.size > 0 && (
          <div className="sticky top-[57px] z-20 mb-2 flex items-center gap-2 rounded-xl border border-accent/30 bg-surface-2/95 px-3 py-2 shadow-raised backdrop-blur animate-fade-up">
            <span className="font-semibold text-ink">{selected.size}</span>
            <span className="text-muted">selected</span>
            <span className="mx-1 h-4 w-px bg-line" />
            {BULK_STATUSES.map((s) => (
              <Button key={s} size="sm" variant="secondary" onClick={() => onBulk(s)} className="capitalize">
                {s}
              </Button>
            ))}
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs font-medium text-muted hover:text-ink">
              Clear
            </button>
          </div>
        )}

        {/* table — overflow stays visible so the note popover can escape its cell */}
        <div className="overflow-visible rounded-xl border border-line bg-surface/40 shadow-soft">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="text-left">
                <th className={`${TH} w-9 rounded-tl-xl`}></th>
                <th className={`${TH} w-16`}>Score</th>
                <th className={`${TH} w-44`}>Company</th>
                <th className={TH}>Title</th>
                <th className={`${TH} w-44`}>Location</th>
                <th className={`${TH} w-24`}>Domain</th>
                <th className={`${TH} w-32`}>Status</th>
                <th className={`${TH} w-20 rounded-tr-xl`} title="when the status last changed (or first seen)">Updated</th>
              </tr>
            </thead>
            <tbody>
              {!hasLoaded
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-line/50">
                      <td className="px-3 py-3"><Skeleton className="h-4 w-4 rounded" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-7 w-7 rounded-full" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-3.5 w-24" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-3.5 w-3/4" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-3.5 w-20" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-3.5 w-12" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-6 w-20 rounded-md" /></td>
                      <td className="px-3 py-3"><Skeleton className="h-3.5 w-10" /></td>
                    </tr>
                  ))
                : jobs.map((j) => (
                    // JobRow is React.memo'd and its comparator IGNORES these
                    // callback props — safe ONLY because the handlers below route
                    // through App's behavior-stable, filtersRef-reading callbacks.
                    // Do NOT capture a live `filters.*` value in these wrappers
                    // (it would go stale on a memoized row); pass ids and let the
                    // stable handler read filtersRef.current.
                    <JobRow
                      key={j.id}
                      job={j}
                      selected={selected.has(j.id)}
                      resumeGenEnabled={resumeGenEnabled}
                      judgeEnabled={config?.judgeEnabled ?? false}
                      leaving={leavingIds.has(j.id)}
                      onToggle={() => toggle(j.id)}
                      onStatus={(s) => onStatus(j.id, s)}
                      onNotes={(n) => onNotes(j.id, n)}
                      onSettled={(s) => onSettled(j.id, s)}
                      onJudged={onJudged}
                    />
                  ))}
              {hasLoaded && jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 animate-fade-up">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 ring-1 ring-line">
                        <SearchX className="h-6 w-6 text-faint" />
                      </span>
                      {hiddenByRefinement > 0 ? (
                        <>
                          <p className="font-semibold text-ink">No jobs match your Score / Posted filters</p>
                          <p className="text-xs text-muted">
                            <span className="tnum font-medium text-ink">{hiddenByRefinement}</span> lower-scored or older
                            job{hiddenByRefinement === 1 ? ' is' : 's are'} hidden by your refinements.
                          </p>
                          <Button variant="primary" size="sm" onClick={() => setFilters({ ...filters, minScore: '', postedWithin: '' })}>
                            <Sparkles className="h-3.5 w-3.5" /> Show them
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-ink">No jobs match the current filters</p>
                          <p className="text-xs text-muted">Try widening your filters, or run a scrape to pull fresh listings.</p>
                          {demoCount === 0 && (
                            <Button variant="secondary" size="sm" onClick={onLoadDemo} className="mt-1">
                              <Sparkles className="h-3.5 w-3.5" /> Load sample jobs
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* sentinel: triggers the next page when scrolled into view */}
        <div ref={sentinelRef} className="mt-3 flex items-center gap-3 text-xs text-faint">
          <span className="tnum">
            {jobs.length} shown · {total} matching
          </span>
          {jobs.length < total && (
            <Button size="sm" variant="ghost" onClick={loadMore}>Load more</Button>
          )}
        </div>
      </main>

      {showResume && <ResumeDrawer onClose={() => setShowResume(false)} />}
    </div>
  );
}

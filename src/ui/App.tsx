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
  fetchJobs,
  filtersToParams,
  getConfig,
  getStats,
  latestRun,
  patchJob,
  startScrape,
  type AppConfig,
  type Filters,
  type RunSummary,
  type Stats,
  type UiJob,
} from './api.js';
import { FilterBar } from './components/FilterBar.js';
import { JobRow } from './components/JobRow.js';
import { RunStatusStrip } from './components/RunStatusStrip.js';
import { ResumeDrawer } from './components/ResumeDrawer.js';
import { Onboarding } from './components/Onboarding.js';
import { Settings } from './components/Settings.js';
import { ImportModal } from './components/ImportModal.js';
import { Button, Skeleton } from './components/ui.js';
import { Play, Download, FileText, Settings as SettingsIcon, Crosshair, SearchX, Sparkles, DownloadCloud } from 'lucide-react';

const DEFAULT_FILTERS: Filters = {
  q: '',
  status: 'new,interested', // Active view: untriaged queue + things you're tracking
  category: '',
  minScore: '30',
  source: '',
  postedWithin: '14',
  role: '',
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
  const [jobs, setJobs] = useState<UiJob[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [run, setRun] = useState<RunSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [resumeGenEnabled, setResumeGenEnabled] = useState(false);
  // dropdown vocabulary (roles/sources/categories) — from the user's config
  const [vocab, setVocab] = useState<Pick<AppConfig, 'roles' | 'sources' | 'categories'>>({
    roles: [],
    sources: [],
    categories: [],
  });
  const [stats, setStats] = useState<Stats | null>(null);
  // How many rows are hidden purely by the Score/Posted refinements — drives the
  // "Show them" rescue when a status looks empty only because its jobs scored low.
  const [hiddenByRefinement, setHiddenByRefinement] = useState(0);
  // gates skeleton vs empty-state on first paint (before the first fetch lands)
  const [hasLoaded, setHasLoaded] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seededRef = useRef(false); // seed default filters from ui_prefs once

  // Server state is the single source of truth for "running" — survives page
  // reloads mid-scrape and covers CLI-triggered scrapes too.
  const scraping = run?.status === 'running';

  // Lazy loading: jobs accumulate in pages of PAGE_SIZE as the user scrolls.
  // `epoch` guards against a stale page landing after the filters changed.
  // jobsLenRef mirrors jobs.length so loadMore reads it WITHOUT a state-updater
  // side effect (which StrictMode double-invokes → duplicate pages).
  const epochRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const jobsLenRef = useRef(0);
  useEffect(() => {
    jobsLenRef.current = jobs.length;
  }, [jobs.length]);

  const reload = useCallback(
    (opts: { keepSelection?: boolean } = {}) => {
      const epoch = ++epochRef.current;
      loadingRef.current = false; // any in-flight loadMore is now stale — unblock
      fetchJobs(filters).then((r) => {
        if (epoch !== epochRef.current) return; // filters changed mid-flight
        setHasLoaded(true);
        setJobs(r.jobs);
        setTotal(r.total);
        // poll-driven refreshes keep the user's bulk selection intact
        if (!opts.keepSelection) setSelected(new Set());
      });
      // pipeline counts can shift on any reload (status changes, new scrape).
      // Pass filters so each pill's count == what clicking it shows (WYSIWYG).
      getStats(filters).then(setStats).catch(() => {});
    },
    [filters]
  );

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const epoch = epochRef.current;
    fetchJobs(filters, jobsLenRef.current)
      .then((r) => {
        if (epoch === epochRef.current) {
          setJobs((js) => [...js, ...r.jobs]);
          setTotal(r.total);
        }
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [filters]);

  // Debounced reload: typing in the search box shouldn't fire one request per
  // keystroke. 250ms is imperceptible for dropdown changes too.
  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
  }, [reload]);

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
      setConfig(c);
      setResumeGenEnabled(c.resumeGeneration);
      setVocab({ roles: c.roles ?? [], sources: c.sources ?? [], categories: c.categories ?? [] });
      // seed the default triage view from the user's saved prefs (once)
      if (!seededRef.current) {
        seededRef.current = true;
        const ms = c.uiPrefs?.defaultMinScore;
        const pw = c.uiPrefs?.defaultPostedWithin;
        if (ms !== undefined || pw !== undefined) {
          setFilters((f) => ({
            ...f,
            minScore: ms !== undefined ? String(ms) : f.minScore,
            postedWithin: pw !== undefined ? String(pw) : f.postedWithin,
          }));
        }
      }
    });
  }, []);

  useEffect(() => {
    latestRun().then(setRun);
    loadConfig();
  }, [loadConfig]);

  // Poll while a scrape is running (including one already running when the
  // page loads). When it finishes, refresh the job list.
  useEffect(() => {
    if (!scraping) return;
    pollRef.current = setInterval(async () => {
      const r = await latestRun();
      setRun(r);
      if (r && r.status !== 'running') reload({ keepSelection: true });
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scraping, reload]);

  const onScrape = async () => {
    setNotice(null);
    if (await startScrape()) {
      setRun(await latestRun()); // flips status to running → starts the poll
    } else {
      setNotice('Scrape not started — one is already running.');
    }
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

  const onStatus = async (id: number, status: string) => {
    // optimistic: status + Updated column reflect the change instantly
    setJobs((js) =>
      js.map((j) => (j.id === id ? { ...j, status, status_updated_at: new Date().toISOString() } : j))
    );
    try {
      await patchJob(id, { status });
    } catch (e) {
      onMutationError(e);
    }
  };

  /** Does a status still belong in the current view? Mirrors the server's
   *  status-filter semantics (all = everything; empty hides dismissed). */
  const statusVisible = (status: string): boolean => {
    const f = filters.status;
    if (f === 'all') return true;
    if (!f) return status !== 'dismissed';
    return f.split(',').includes(status);
  };

  /** Called by the row when the status interaction fully settles (after the
   *  note popover, if any). Rows that left the filter fade out, then go. */
  const [leavingIds, setLeavingIds] = useState<Set<number>>(new Set());
  const onSettled = (id: number, status: string) => {
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
  };

  const onNotes = async (id: number, notes: string) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, user_notes: notes } : j)));
    try {
      await patchJob(id, { notes });
    } catch (e) {
      onMutationError(e);
    }
  };

  const onBulk = async (status: string) => {
    const ids = [...selected];
    try {
      await bulkStatus(ids, status);
      reload();
    } catch (e) {
      onMutationError(e);
    }
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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
            <Button variant="primary" onClick={onScrape} loading={scraping}>
              {!scraping && <Play className="h-4 w-4" />}
              {scraping ? 'Scraping…' : 'Run scrape'}
            </Button>
            <div className="flex items-center gap-1">
              <a
                href={`/api/export.csv?${filtersToParams(filters)}`}
                title="Export the current filtered view to CSV (all pages)"
                className={ICON_BTN}
              >
                <Download className="h-[17px] w-[17px]" />
              </a>
              <button onClick={() => setShowImport(true)} title="Import jobs (LinkedIn, Indeed, …)" className={ICON_BTN}>
                <DownloadCloud className="h-[17px] w-[17px]" />
              </button>
              <button onClick={() => setShowResume(true)} title="Resume reference drawer" className={ICON_BTN}>
                <FileText className="h-[17px] w-[17px]" />
              </button>
              <button onClick={() => setShowSettings(true)} title="Settings" className={ICON_BTN}>
                <SettingsIcon className="h-[17px] w-[17px]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-4">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          defaults={DEFAULT_FILTERS}
          vocab={vocab}
          stats={stats}
          judgeEnabled={config?.judgeEnabled ?? false}
        />

        {/* bulk action bar (sticks under the app bar while triaging a selection) */}
        {selected.size > 0 && (
          <div className="sticky top-[57px] z-20 mb-2 flex items-center gap-2 rounded-xl border border-accent/30 bg-surface-2/95 px-3 py-2 shadow-raised backdrop-blur animate-fade-up">
            <span className="font-semibold text-ink">{selected.size}</span>
            <span className="text-muted">selected</span>
            <span className="mx-1 h-4 w-px bg-line" />
            {['interested', 'applied', 'rejected', 'dismissed'].map((s) => (
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
                      onJudged={(updated) => setJobs((js) => js.map((x) => (x.id === updated.id ? updated : x)))}
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
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => reload({ keepSelection: true })}
        />
      )}
    </div>
  );
}

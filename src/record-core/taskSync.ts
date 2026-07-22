import type { RecordRow, SelectOption } from "./types";
import { TASK_KEYS, type TaskFieldKeys } from "./tasks";

/* Issue-provider sync — a CONFIG SEAM, not an integration. This module owns the
   two things a consumer cannot guess: the SHAPE of what a provider returns, and
   the MAPPING from that shape onto the task record. It deliberately performs no
   network I/O — the consumer supplies `fetchIssues` (their authenticated call,
   their rate-limit policy, their pagination), and everything here stays pure and
   node-testable.

   Nothing here is a live integration and nothing pretends to be: `mockIssues`
   is EXPLICITLY labelled demo data (see `MOCK_NOTICE`), so a surface rendering
   it can say so rather than implying a connected account.

   Wiring one up:

     const patchset = syncIssues(rows, await gh.listIssues(...), GITHUB_MAPPING, {
       objectKey: "tasks", statusMap: { open: "Todo", closed: "Done" },
     });
     patchset.creates.forEach(create); patchset.updates.forEach(u => patch(u.id, u.patch));
*/

/* ------------------------------------------------------- provider shape */

/* The NORMALISED issue — what every provider mapping produces. Fields absent
   from a given provider stay undefined rather than being invented. */
export interface ProviderIssue {
  /* stable provider-side id (Jira "PROJ-123", GitHub node id) */
  externalId: string;
  /* the human-facing key/number shown in the UI ("#482", "PROJ-123") */
  externalKey?: string;
  title: string;
  /* provider's own state string, PRE-mapping ("open", "In Review") */
  state?: string;
  assignee?: string;
  labels?: string[];
  dueDate?: string;      // ISO date
  startDate?: string;    // ISO date
  estimateHours?: number;
  description?: string;
  url?: string;
  /* provider-side parent (epic link, GitHub task-list parent) */
  parentExternalId?: string;
  /* provider-side blockers ("is blocked by" links) */
  blockedByExternalIds?: string[];
  updatedAt?: string;    // ISO instant — drives the "provider is newer" check
}

/* A mapping turns ONE raw provider payload into a ProviderIssue. Consumers write
   these against the provider's real response; the two below are written against
   the documented shapes of the GitHub Issues REST API and the Jira Cloud
   platform API. They are STARTING POINTS: field availability varies with the
   provider's plan, custom fields and requested expansions, so verify against a
   real payload from YOUR instance before relying on any optional field. */
export type IssueMapping<T = unknown> = (raw: T) => ProviderIssue;

/* --- GitHub Issues (REST: GET /repos/{owner}/{repo}/issues) --------------
   The subset consumed below is stable across the documented response. `state`
   is "open" | "closed"; a due date has no native home on a GitHub issue, so it
   is read from the milestone's `due_on` when present. */
export interface GitHubIssuePayload {
  id: number;
  number: number;
  title: string;
  state: string;
  body?: string | null;
  html_url?: string;
  updated_at?: string;
  assignee?: { login: string } | null;
  labels?: (string | { name?: string })[];
  milestone?: { due_on?: string | null } | null;
}

export const GITHUB_MAPPING: IssueMapping<GitHubIssuePayload> = (raw) => ({
  externalId: String(raw.id),
  externalKey: `#${raw.number}`,
  title: raw.title,
  state: raw.state,
  assignee: raw.assignee?.login,
  labels: (raw.labels ?? [])
    .map((l) => (typeof l === "string" ? l : l?.name))
    .filter((l): l is string => !!l),
  dueDate: raw.milestone?.due_on ? raw.milestone.due_on.slice(0, 10) : undefined,
  description: raw.body ?? undefined,
  url: raw.html_url,
  updatedAt: raw.updated_at,
});

/* --- Jira Cloud (REST: GET /rest/api/3/search) ---------------------------
   `duedate` is a plain date; time estimates come back in SECONDS
   (`timeoriginalestimate`). Parent/blocker links depend on the issue link types
   configured in the instance, so `blockedByExternalIds` is derived from links
   whose inward description is the standard "is blocked by". */
export interface JiraIssuePayload {
  id: string;
  key: string;
  fields: {
    summary: string;
    status?: { name?: string };
    assignee?: { displayName?: string; emailAddress?: string } | null;
    labels?: string[];
    duedate?: string | null;
    timeoriginalestimate?: number | null;
    updated?: string;
    parent?: { id?: string } | null;
    issuelinks?: { type?: { inward?: string }; inwardIssue?: { id?: string } }[];
  };
}

export const JIRA_MAPPING: IssueMapping<JiraIssuePayload> = (raw) => {
  const f = raw.fields;
  return {
    externalId: raw.id,
    externalKey: raw.key,
    title: f.summary,
    state: f.status?.name,
    assignee: f.assignee?.displayName ?? f.assignee?.emailAddress ?? undefined,
    labels: f.labels ?? [],
    dueDate: f.duedate ?? undefined,
    estimateHours: typeof f.timeoriginalestimate === "number" ? f.timeoriginalestimate / 3600 : undefined,
    parentExternalId: f.parent?.id ?? undefined,
    blockedByExternalIds: (f.issuelinks ?? [])
      .filter((l) => /is blocked by/i.test(l.type?.inward ?? "") && l.inwardIssue?.id)
      .map((l) => l.inwardIssue!.id!),
    updatedAt: f.updated,
  };
};

/* ---------------------------------------------------------------- sync */

export interface SyncOptions {
  /* provider state → your workflow status. Unmapped states are LEFT ALONE (the
     local status wins) rather than guessed into a wrong column. */
  statusMap?: Record<string, string>;
  /* the field holding the provider id on a task row (default "externalId") */
  externalIdKey?: string;
  externalKeyKey?: string;
  externalUrlKey?: string;
  keys?: Partial<TaskFieldKeys>;
  /* fields the LOCAL side owns — never overwritten by a sync (defaults to the
     day plan and the time log: a provider has no opinion about your day) */
  localOnly?: string[];
  /* skip an update when the local row was edited after the provider's
     `updatedAt` (requires the row to carry `updatedAt`) */
  preferLocalIfNewer?: boolean;
}

export interface SyncPatchset {
  creates: Record<string, unknown>[];
  updates: { id: string; patch: Record<string, unknown> }[];
  /* provider issues that matched nothing and were not created (never silently
     dropped — the caller decides) */
  unmatched: ProviderIssue[];
  /* local tasks carrying an externalId absent from this provider payload —
     candidates for "closed upstream", surfaced rather than auto-deleted */
  orphans: RecordRow[];
}

const DEFAULT_LOCAL_ONLY = [TASK_KEYS.plannedFor, TASK_KEYS.focusOrder, TASK_KEYS.timeEntries, TASK_KEYS.timeSpent];

/* Diff a provider payload against local rows. PURE: returns the patchset, writes
   nothing. Creation bodies carry no id — the caller's store assigns it. */
export function syncIssues(rows: RecordRow[], issues: ProviderIssue[], opts: SyncOptions = {}): SyncPatchset {
  const k = { ...TASK_KEYS, ...opts.keys };
  const idKey = opts.externalIdKey ?? "externalId";
  const keyKey = opts.externalKeyKey ?? "externalKey";
  const urlKey = opts.externalUrlKey ?? "externalUrl";
  const localOnly = new Set(opts.localOnly ?? DEFAULT_LOCAL_ONLY);
  const byExternal = new Map<string, RecordRow>();
  for (const r of rows) {
    const v = r[idKey];
    if (typeof v === "string" && v) byExternal.set(v, r);
  }

  const creates: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const unmatched: ProviderIssue[] = [];
  const seen = new Set<string>();

  for (const iss of issues) {
    seen.add(iss.externalId);
    const body: Record<string, unknown> = {
      [idKey]: iss.externalId,
      [k.title]: iss.title,
    };
    if (iss.externalKey !== undefined) body[keyKey] = iss.externalKey;
    if (iss.url !== undefined) body[urlKey] = iss.url;
    if (iss.assignee !== undefined) body[k.assignee] = iss.assignee;
    if (iss.labels !== undefined) body[k.labels] = iss.labels;
    if (iss.dueDate !== undefined) body[k.dueDate] = iss.dueDate;
    if (iss.startDate !== undefined) body[k.startDate] = iss.startDate;
    if (iss.estimateHours !== undefined) body[k.estimate] = iss.estimateHours;
    if (iss.description !== undefined) body[k.description] = iss.description;
    /* an UNMAPPED provider state leaves the local status untouched */
    const mapped = iss.state ? opts.statusMap?.[iss.state] : undefined;
    if (mapped) body[k.status] = mapped;

    const local = byExternal.get(iss.externalId);
    if (!local) {
      creates.push(body);
      continue;
    }
    if (opts.preferLocalIfNewer && isLocalNewer(local, iss)) continue;

    const patch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body)) {
      if (localOnly.has(key)) continue;
      if (!sameValue(local[key], val)) patch[key] = val;
    }
    if (Object.keys(patch).length) updates.push({ id: local.id, patch });
  }

  const orphans = rows.filter((r) => {
    const v = r[idKey];
    return typeof v === "string" && !!v && !seen.has(v);
  });

  return { creates, updates, unmatched, orphans };
}

const isLocalNewer = (local: RecordRow, iss: ProviderIssue): boolean => {
  const l = typeof local.updatedAt === "string" ? Date.parse(local.updatedAt) : NaN;
  const r = iss.updatedAt ? Date.parse(iss.updatedAt) : NaN;
  return !isNaN(l) && !isNaN(r) && l > r;
};

const sameValue = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
};

/* Second pass: provider-side parent/blocker links reference EXTERNAL ids, which
   only resolve once every row exists locally. Run it after the creates land. */
export function linkIssues(rows: RecordRow[], issues: ProviderIssue[], opts: SyncOptions = {}): { id: string; patch: Record<string, unknown> }[] {
  const k = { ...TASK_KEYS, ...opts.keys };
  const idKey = opts.externalIdKey ?? "externalId";
  const localIdOf = new Map<string, string>();
  for (const r of rows) {
    const v = r[idKey];
    if (typeof v === "string" && v) localIdOf.set(v, r.id);
  }
  const out: { id: string; patch: Record<string, unknown> }[] = [];
  for (const iss of issues) {
    const id = localIdOf.get(iss.externalId);
    if (!id) continue;
    const patch: Record<string, unknown> = {};
    if (iss.parentExternalId) {
      const p = localIdOf.get(iss.parentExternalId);
      if (p) patch[k.parent] = p;
    }
    if (iss.blockedByExternalIds?.length) {
      const deps = iss.blockedByExternalIds.map((e) => localIdOf.get(e)).filter((x): x is string => !!x);
      if (deps.length) patch[k.blockedBy] = deps;
    }
    if (Object.keys(patch).length) out.push({ id, patch });
  }
  return out;
}

/* ------------------------------------------------------------- mock */

/* ‼ DEMO DATA — not a live provider response. A surface rendering these MUST
   label them as such (see MOCK_NOTICE); they exist so the sync seam can be
   exercised and screenshotted without credentials. */
export const MOCK_NOTICE = "Demo data — no issue provider is connected.";

export const mockIssues: ProviderIssue[] = [
  {
    externalId: "gh-9001", externalKey: "#482", title: "Rate limit the public search endpoint",
    state: "open", assignee: "Ines", labels: ["backend", "bug"],
    dueDate: undefined, estimateHours: 8, url: "https://example.invalid/issues/482",
    updatedAt: "2026-07-20T09:12:00.000Z",
  },
  {
    externalId: "gh-9002", externalKey: "#487", title: "Onboarding checklist does not persist",
    state: "open", assignee: "Leo", labels: ["web", "bug"], estimateHours: 4,
    url: "https://example.invalid/issues/487", updatedAt: "2026-07-21T14:03:00.000Z",
    blockedByExternalIds: ["gh-9001"],
  },
  {
    externalId: "gh-9003", externalKey: "#491", title: "Add webhook retry with backoff",
    state: "closed", assignee: "Tom", labels: ["backend"], estimateHours: 6,
    url: "https://example.invalid/issues/491", updatedAt: "2026-07-19T18:40:00.000Z",
  },
];

/* the label options the mock issues imply — handy when seeding a demo object */
export const MOCK_ISSUE_LABELS: SelectOption[] = [
  { value: "backend", color: "teal" },
  { value: "bug", color: "red" },
  { value: "web", color: "blue" },
];

/*
 * Baby Tracker card for Home Assistant.
 * Served by the baby_logger integration; no manual resource setup needed.
 *
 *   type: custom:baby-logger-card
 *   entry_id: <optional, defaults to the first baby>
 *   show_summary: true
 *   show_trends: true
 *   show_log: true
 *   log_entries: 10
 *   days: 7
 *   show_timeline: true
 *   timeline_days: 14         days shown in the sleep timeline
 *   timeline_group: 1         days per line (1 = every day, 7 = weekly average, ...)
 *   timeline_start_hour: 0    hour of day each line starts at (e.g. 18 to keep nights together)
 *   show_nights: true
 *   night_days: 14            nights in the night sleep chart
 *   night_start: "21:00"      optional; defaults to the integration's "Night starts" setting
 *   night_end: "07:00"        optional; defaults to the integration's "Night ends" setting
 *   parts: [header, tiles, buttons, undo, summary, trends, nights, timeline, log]
 *                             optional; the parts to show, in order (replaces the show_* flags)
 *   buttons:                  optional; quick buttons for the "buttons" part, in order
 *     - action: sleep         sleep | diaper_wet | diaper_dirty | diaper_both |
 *       name: Sleep           feed_left | feed_right | feed_bottle | undo
 *       icon: mdi:sleep       (name, icon, color and columns are optional)
 *       color: indigo         HA colour name or CSS colour
 *       columns: 12           width in a 12-column grid
 *   buttons_columns: 3        default buttons per row
 *   units: metric             metric (kg, cm) or imperial (lb + oz, in) for growth
 *   growth_entries: 5         measurements listed under the growth charts
 *   growth_list: collapsed    the measurement list starts collapsed or expanded
 */

const CARD_VERSION = "1.1.0";
const DOMAIN = "baby_logger";

const DIAPER = {
  wet: { label: "Wet", emoji: "💧", color: "#2196f3" },
  dirty: { label: "Dirty", emoji: "💩", color: "#8d6e63" },
  both: { label: "Both", emoji: "💧💩", color: "#ff9800" },
};
const SIDES = {
  left: { label: "Left", icon: "mdi:arrow-left-bold-circle", color: "#ab47bc" },
  right: { label: "Right", icon: "mdi:arrow-right-bold-circle", color: "#5c6bc0" },
  bottle: { label: "Bottle", icon: "mdi:baby-bottle", color: "#26a69a" },
};
const SLEEP_COLORS = { night: "#3f51b5", day: "#ffb300" };
const UNDO_LABELS = {
  diaper: "Diaper logged",
  feeding: "Feeding logged",
  sleep: "Fell asleep",
  wake: "Woke up",
  add_sleep: "Sleep added",
  update_sleep: "Sleep changed",
  delete: "Entry deleted",
  growth: "Measurement logged",
  delete_growth: "Measurement deleted",
  milestone: "Milestone saved",
  clear_milestone: "Milestone cleared",
  add_milestone: "Milestone added",
  delete_milestone: "Milestone deleted",
};
const MILESTONE_CATEGORIES = {
  movement: "Movement",
  communication: "Communication",
  social: "Social",
  firsts: "Firsts",
  custom: "Your milestones",
};
// Milestones not reached yet that the timeline shows before "Show more".
const UPCOMING_SHOWN = 4;
const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;

const DEFAULTS = {
  show_summary: true,
  show_trends: true,
  show_timeline: true,
  show_log: true,
  log_entries: 10,
  days: 7,
  timeline_days: 14,
  timeline_group: 1,
  timeline_start_hour: 0,
  show_nights: true,
  night_days: 14,
  night_start: "",
  night_end: "",
  units: "metric",
  growth_entries: 5,
  growth_list: "collapsed",
};
const NIGHTS_MAX = 366;

// Parts of the card that can be shown, in the editor's default order.
const PARTS = ["header", "tiles", "buttons", "undo", "summary", "trends", "nights", "timeline", "log", "growth", "milestones"];
const PART_LABELS = {
  header: "Header (name and today's counts)",
  tiles: "Diaper / feeding / sleep tiles",
  buttons: "Quick buttons",
  undo: "Undo banner",
  summary: "Night / daytime summary",
  trends: "Trends",
  nights: "Night sleep",
  timeline: "Sleep timeline",
  log: "Log",
  growth: "Growth (weight and length)",
  milestones: "Milestones",
};
// Parts that need the sleep history.
const SLEEP_PARTS = ["nights", "timeline"];

const BUTTON_ACTIONS = {
  sleep: { name: "Sleep", icon: "mdi:sleep", color: "indigo", columns: 12 },
  diaper_wet: { name: "Wet", icon: "mdi:water", color: "blue", action: "diaper", value: "wet" },
  diaper_dirty: { name: "Dirty", icon: "mdi:emoticon-poop", color: "brown", action: "diaper", value: "dirty" },
  diaper_both: { name: "Both", icon: "mdi:water-plus", color: "orange", action: "diaper", value: "both" },
  feed_left: { name: "Left", icon: "mdi:arrow-left-bold-circle", color: "pink", action: "feed", value: "left" },
  feed_right: { name: "Right", icon: "mdi:arrow-right-bold-circle", color: "purple", action: "feed", value: "right" },
  feed_bottle: { name: "Bottle", icon: "mdi:baby-bottle", color: "cyan", action: "feed", value: "bottle" },
  undo: { name: "Undo", icon: "mdi:undo-variant", color: "grey", columns: 12 },
};
const DEFAULT_BUTTONS = Object.keys(BUTTON_ACTIONS);

// Home Assistant theme colours, with the default theme's values as fallback.
const HA_COLORS = {
  red: "#f44336",
  pink: "#e91e63",
  purple: "#926bc7",
  "deep-purple": "#6e41ab",
  indigo: "#3f51b5",
  blue: "#2196f3",
  "light-blue": "#03a9f4",
  cyan: "#00bcd4",
  teal: "#009688",
  green: "#4caf50",
  "light-green": "#8bc34a",
  lime: "#cddc39",
  yellow: "#ffeb3b",
  amber: "#ffc107",
  orange: "#ff9800",
  "deep-orange": "#ff6f22",
  brown: "#795548",
  grey: "#9e9e9e",
  "blue-grey": "#607d8b",
  black: "#000000",
  white: "#ffffff",
};
const TIMELINE_MAX_DAYS = 3 * 366;
const TIMELINE_BINS = 144; // 10 minute resolution for averaged lines

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "2h 05m" for a number of milliseconds. */
export function formatDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const plural = (n, one, many) => `${n ?? "–"} ${n === 1 ? one : many}`;

const hours = (h) => (h === null || h === undefined ? "–" : `${Number(h).toFixed(1)} h`);

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Per day buckets (oldest first) for the last `days` days. */
export function dailyTrends(events, days, now = new Date(), sleepStart = null) {
  const first = startOfDay(now);
  first.setDate(first.getDate() - (days - 1));
  const buckets = [];
  for (let i = 0; i < days; i++) {
    const start = new Date(first);
    start.setDate(first.getDate() + i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    buckets.push({
      start,
      end,
      diapers: { wet: 0, dirty: 0, both: 0 },
      feedings: { left: 0, right: 0, bottle: 0 },
      sleep: 0,
    });
  }
  const sleeps = [];
  for (const e of events) {
    const start = new Date(e.start);
    if (e.kind === "sleep" && e.end) sleeps.push([start, new Date(e.end)]);
    const bucket = buckets.find((b) => start >= b.start && start < b.end);
    if (!bucket) continue;
    if (e.kind === "diaper" && e.diaper_type in bucket.diapers) bucket.diapers[e.diaper_type]++;
    if (e.kind === "feeding") {
      const side = e.sides && e.sides.length ? e.sides[0].side : "left";
      if (side in bucket.feedings) bucket.feedings[side]++;
    }
  }
  if (sleepStart) sleeps.push([new Date(sleepStart), now]);
  for (const b of buckets) {
    for (const [s, e] of sleeps) {
      const overlap = Math.min(e, b.end, now) - Math.max(s, b.start);
      if (overlap > 0) b.sleep += overlap / 3600000;
    }
  }
  return buckets;
}

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Normalised sleep timeline settings from a card config. */
export function timelineSettings(cfg) {
  const group = clampInt(cfg.timeline_group, 1, 366, 1);
  const days = clampInt(cfg.timeline_days, 1, TIMELINE_MAX_DAYS, 14);
  return {
    group,
    lines: Math.max(1, Math.ceil(days / group)),
    startHour: clampInt(cfg.timeline_start_hour, 0, 23, 0),
  };
}

/** Start of the day window `offset` days before the current one. */
function windowStart(anchor, offset) {
  const d = new Date(anchor);
  d.setDate(d.getDate() - offset);
  return d;
}

/** The current line's day starts at `startHour` today, or yesterday if that is still ahead. */
export function timelineAnchor(now, startHour) {
  const anchor = new Date(now);
  anchor.setHours(startHour, 0, 0, 0);
  if (anchor > now) anchor.setDate(anchor.getDate() - 1);
  return anchor;
}

/** Oldest time the timeline needs sleeps from. */
export function timelineRangeStart(settings, now) {
  return windowStart(timelineAnchor(now, settings.startHour), settings.lines * settings.group - 1);
}

function overlapMs(intervals, from, to) {
  let total = 0;
  for (const [s, e] of intervals) {
    if (s >= to) break;
    if (e <= from) continue;
    total += Math.min(e, to) - Math.max(s, from);
  }
  return total;
}

/**
 * Lines for the sleep timeline, newest first.
 *
 * `intervals` are [start, end] Date pairs sorted by start and not overlapping.
 * With one day per line each line has exact `segments` ([from, to] as fractions of
 * the day); with more days per line it has `bins`, the share of those days the
 * baby was asleep in each 10 minute slot (null for slots that haven't happened).
 */
export function timelineRows(intervals, settings, now = new Date()) {
  const anchor = timelineAnchor(now, settings.startHour);
  const rows = [];
  for (let line = 0; line < settings.lines; line++) {
    const days = [];
    for (let i = 0; i < settings.group; i++) {
      const start = windowStart(anchor, line * settings.group + i);
      const end = windowStart(anchor, line * settings.group + i - 1);
      days.push({ start, end, length: end - start, elapsed: Math.max(0, Math.min(end, now) - start) });
    }
    days.reverse(); // oldest first
    const relevant = intervals.filter(([s, e]) => e > days[0].start && s < days[days.length - 1].end);
    const asleep = days.reduce((sum, d) => sum + overlapMs(relevant, d.start, new Date(+d.start + d.elapsed)), 0);
    const elapsed = days.reduce((sum, d) => sum + d.elapsed, 0);
    const row = {
      start: days[0].start,
      end: days[days.length - 1].end,
      days: settings.group,
      // One day: hours asleep (so far). Several: average hours asleep per 24 h.
      hours: settings.group === 1 ? asleep / 3600000 : elapsed ? (asleep / elapsed) * 24 : null,
      elapsed: days.length === 1 ? days[0].elapsed / days[0].length : null,
    };
    if (settings.group === 1) {
      const d = days[0];
      const limit = new Date(+d.start + d.elapsed);
      row.segments = relevant
        .filter(([s, e]) => e > d.start && s < limit)
        .map(([s, e]) => [(Math.max(s, d.start) - d.start) / d.length, (Math.min(e, limit) - d.start) / d.length]);
    } else {
      row.bins = [];
      for (let b = 0; b < TIMELINE_BINS; b++) {
        let share = 0;
        let counted = 0;
        for (const d of days) {
          const from = new Date(+d.start + (d.length * b) / TIMELINE_BINS);
          const to = new Date(+d.start + (d.length * (b + 1)) / TIMELINE_BINS);
          if (from >= now) continue;
          const until = to < now ? to : now;
          share += overlapMs(relevant, from, until) / (until - from);
          counted++;
        }
        row.bins.push(counted ? share / counted : null);
      }
    }
    rows.push(row);
  }
  return rows;
}

const pct = (f) => `${(f * 100).toFixed(3)}%`;

/** CSS gradient that paints one timeline line. */
function timelineGradient(row) {
  const stops = [];
  if (row.segments) {
    let pos = 0;
    for (const [from, to] of row.segments) {
      if (from > pos) stops.push(`var(--bt-awake) ${pct(pos)} ${pct(from)}`);
      stops.push(`var(--bt-sleep) ${pct(from)} ${pct(to)}`);
      pos = to;
    }
    const elapsed = row.elapsed ?? 1;
    if (elapsed > pos) stops.push(`var(--bt-awake) ${pct(pos)} ${pct(elapsed)}`);
    if (elapsed < 1) stops.push(`transparent ${pct(elapsed)} 100%`);
  } else {
    const n = row.bins.length;
    row.bins.forEach((share, i) => {
      const color =
        share === null
          ? "transparent"
          : `color-mix(in srgb, var(--bt-sleep) ${Math.round(share * 100)}%, var(--bt-awake))`;
      stops.push(`${color} ${pct(i / n)} ${pct((i + 1) / n)}`);
    });
  }
  return stops.length ? `linear-gradient(to right, ${stops.join(", ")})` : "transparent";
}

function timelineLabel(row, now) {
  if (row.days === 1) {
    const diff = Math.round((startOfDay(now) - startOfDay(row.start)) / 86400000);
    if (diff === 0) return "Today";
    return row.start.toLocaleDateString([], { weekday: "short", day: "numeric" });
  }
  // Lines are labelled by the dates their days start on.
  const last = new Date(row.end);
  last.setDate(last.getDate() - 1);
  return new Intl.DateTimeFormat([], { day: "numeric", month: "short" }).formatRange(row.start, last);
}

function timelineHtml(rows, settings, now) {
  const ticks = [0, 6, 12, 18, 24]
    .map((h) => {
      const hour = String((settings.startHour + h) % 24).padStart(2, "0");
      return `<span style="left:${(h / 24) * 100}%">${hour}</span>`;
    })
    .join("");
  const lines = rows
    .map((row) => {
      const label = timelineLabel(row, now);
      const value = row.hours === null ? "–" : `${row.hours.toFixed(1)} h`;
      const title = row.days === 1 ? `${label}: ${value} asleep` : `${label}: ${value} asleep per day on average`;
      return `<div class="tl-row" title="${esc(title)}"><span class="tl-label">${esc(label)}</span>
        <span class="tl-bar" style="background:${timelineGradient(row)}"></span><span class="tl-value">${value}</span></div>`;
    })
    .join("");
  const legendItems = [
    ["Asleep", "var(--bt-sleep)"],
    ["Awake", "var(--bt-awake)"],
  ];
  const note = settings.group > 1 ? `<span class="tl-note">Darker = asleep on more of the ${settings.group} days</span>` : "";
  return `<div class="timeline${settings.group > 1 ? " grouped" : ""}">
      <div class="tl-row tl-axis"><span class="tl-label"></span><span class="tl-ticks">${ticks}</span><span class="tl-value"></span></div>
      ${lines}
    </div>
    <div class="legend">${legendItems.map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}${note}</div>`;
}

/** Minutes after midnight for "HH:MM" or "HH:MM:SS", or null. */
export function parseClock(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

const formatClock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Night window settings: the card's own night_start/night_end if both are valid
 * and different, otherwise the integration's night settings.
 */
export function nightSettings(cfg, integration = {}) {
  let start = parseClock(cfg.night_start);
  let end = parseClock(cfg.night_end);
  const custom = start !== null && end !== null && start !== end;
  if (!custom) {
    start = parseClock(integration.night_start) ?? 22 * 60;
    end = parseClock(integration.night_end) ?? 9 * 60;
  }
  return { nights: clampInt(cfg.night_days, 1, NIGHTS_MAX, 14), start, end, custom };
}

function atMinutes(date, minutes) {
  const d = new Date(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/** Start of the most recent night that has begun. */
function lastNightStart(settings, now) {
  const start = atMinutes(now, settings.start);
  if (start > now) start.setDate(start.getDate() - 1);
  return start;
}

/** Oldest time the night chart needs sleeps from. */
export function nightsRangeStart(settings, now) {
  const start = lastNightStart(settings, now);
  start.setDate(start.getDate() - (settings.nights - 1));
  return start;
}

/**
 * Sleep inside the night window for the last `settings.nights` nights, oldest first.
 * `intervals` are sorted, non-overlapping [start, end] Date pairs.
 */
export function nightStats(intervals, settings, now = new Date()) {
  const newest = lastNightStart(settings, now);
  const nights = [];
  for (let k = settings.nights - 1; k >= 0; k--) {
    const start = new Date(newest);
    start.setDate(start.getDate() - k);
    const end = atMinutes(start, settings.end);
    if (settings.end <= settings.start) end.setDate(end.getDate() + 1);
    const until = end < now ? end : now;
    const inside = intervals.filter(([s, e]) => e > start && s < until);
    const asleep = overlapMs(inside, start, until);
    // A wake-up: a sleep ends during the night and another starts before it's over.
    let wakes = 0;
    for (let i = 0; i < inside.length - 1; i++) {
      if (inside[i][1] > start && inside[i][1] < until && inside[i + 1][0] < until) wakes++;
    }
    nights.push({
      start,
      end,
      length: (end - start) / 3600000,
      asleep: asleep / 3600000,
      awake: (until - start - asleep) / 3600000,
      wakes,
      done: end <= now,
    });
  }
  return nights;
}

function nightsHtml(nights, settings) {
  const width = 300;
  const height = 140;
  const top = 14;
  const bottom = 18;
  const left = 22;
  const plotW = width - left;
  const maxH = Math.max(...nights.map((n) => n.length), 1);
  const scale = (height - top - bottom) / maxH;
  const slot = plotW / nights.length;
  const barW = Math.max(2, Math.min(24, slot * 0.7));
  const every = Math.ceil(nights.length / 14);
  const y = (h) => height - bottom - h * scale;
  let svg = "";
  // Hour gridlines.
  const step = maxH > 8 ? 4 : 2;
  for (let h = 0; h <= maxH; h += step) {
    svg += `<line x1="${left}" x2="${width}" y1="${y(h).toFixed(1)}" y2="${y(h).toFixed(1)}" class="grid"/>`;
    svg += `<text x="${left - 4}" y="${(y(h) + 3).toFixed(1)}" class="yaxis">${h}</text>`;
  }
  nights.forEach((n, i) => {
    const x = left + i * slot + (slot - barW) / 2;
    const tip = `${n.start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}: ${n.asleep.toFixed(1)} h asleep, ${n.awake.toFixed(1)} h awake, ${n.wakes} wake-up${n.wakes === 1 ? "" : "s"}${n.done ? "" : " (so far)"}`;
    svg += `<g><title>${esc(tip)}</title>`;
    if (n.awake > 0) {
      svg += `<rect x="${x.toFixed(1)}" y="${y(n.asleep + n.awake).toFixed(1)}" width="${barW.toFixed(1)}" height="${(n.awake * scale).toFixed(1)}" rx="2" fill="var(--bt-awake)"/>`;
    }
    if (n.asleep > 0) {
      svg += `<rect x="${x.toFixed(1)}" y="${y(n.asleep).toFixed(1)}" width="${barW.toFixed(1)}" height="${(n.asleep * scale).toFixed(1)}" rx="2" fill="var(--bt-sleep)"${n.done ? "" : ' opacity="0.6"'}/>`;
    }
    svg += `</g>`;
    if (nights.length <= 14 && n.asleep > 0) {
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y(n.asleep + n.awake) - 3).toFixed(1)}" class="value">${n.asleep.toFixed(1)}</text>`;
    }
    if (i % every === 0 || i === nights.length - 1) {
      const label = nights.length <= 7 ? n.start.toLocaleDateString([], { weekday: "short" }) : String(n.start.getDate());
      svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 4}" class="axis">${esc(label)}</text>`;
    }
  });
  const done = nights.filter((n) => n.done && n.asleep > 0);
  let summary = `<span>No finished nights with sleep logged yet.</span>`;
  if (done.length) {
    const avg = done.reduce((t, n) => t + n.asleep, 0) / done.length;
    const avgWakes = done.reduce((t, n) => t + n.wakes, 0) / done.length;
    svg += `<line x1="${left}" x2="${width}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" class="avg"/>`;
    summary = `<span><b>${avg.toFixed(1)} h</b> asleep on average</span><span>${avgWakes.toFixed(1)} wake-ups per night</span>`;
  }
  const range = `${formatClock(settings.start)}–${formatClock(settings.end)}`;
  return `<div class="night-summary">${summary}<span>Night ${range}</span></div>
    <svg class="nights" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">${svg}</svg>
    <div class="legend"><span><i style="background:var(--bt-sleep)"></i>Asleep</span><span><i style="background:var(--bt-awake)"></i>Awake</span><span><i class="dash"></i>Average</span></div>`;
}

/**
 * Part names from a written `parts` list: trimmed, known and without duplicates.
 */
export function partEntries(list) {
  return [...new Set(list.map((p) => String(p).trim()))].filter((p) => PARTS.includes(p));
}

/** A `buttons` entry as an object with a trimmed action, or null for an unknown action. */
export function buttonEntry(entry) {
  const item = typeof entry === "string" ? { action: entry } : { ...(entry || {}) };
  item.action = String(item.action ?? "").trim();
  return BUTTON_ACTIONS[item.action] ? item : null;
}

/**
 * The parts to render, in order. Without a `parts` option this is what the card
 * has always shown, derived from the show_* flags. The undo banner is added when
 * it isn't listed, so an action can always be undone: above the first part with
 * buttons (quick buttons or tiles), otherwise above the first part whose entries
 * can be added or deleted (growth, milestones or the log). It is left out when the
 * quick buttons already have an Undo button.
 */
export function resolveParts(cfg) {
  let parts;
  if (Array.isArray(cfg.parts)) {
    parts = partEntries(cfg.parts);
  } else {
    parts = ["header", "undo", "tiles"];
    for (const [part, flag] of [
      ["summary", "show_summary"],
      ["trends", "show_trends"],
      ["nights", "show_nights"],
      ["timeline", "show_timeline"],
      ["log", "show_log"],
    ]) {
      if (cfg[flag] ?? DEFAULTS[flag]) parts.push(part);
    }
  }
  const undoButton = parts.includes("buttons") && buttonList(cfg).some((b) => b.action === "undo");
  if (!parts.includes("undo") && !undoButton) {
    const at = parts.findIndex((p) => p === "buttons" || p === "tiles");
    const index = at >= 0 ? at : parts.findIndex((p) => p === "growth" || p === "milestones" || p === "log");
    if (index >= 0) parts.splice(index, 0, "undo");
  }
  return parts;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * The grid the quick buttons sit in: enough columns for both a 12-column width
 * (the `columns` option of a button) and an even split into `buttons_columns`
 * per row, e.g. 60 columns for 5 per row.
 */
export function buttonGrid(cfg) {
  const perRow = clampInt(cfg.buttons_columns, 1, 12, 3);
  return { perRow, columns: (12 * perRow) / gcd(12, perRow) };
}

/**
 * Normalised quick buttons from the `buttons` / `buttons_columns` options.
 * `columns` is the width out of 12 (the button's own `columns`, or an even
 * share of the row); `span` is the width in buttonGrid() columns.
 */
export function buttonList(cfg) {
  const grid = buttonGrid(cfg);
  const entries = Array.isArray(cfg.buttons) ? cfg.buttons : DEFAULT_BUTTONS;
  const seen = new Set();
  const buttons = [];
  for (const entry of entries) {
    const item = buttonEntry(entry);
    if (!item || seen.has(item.action)) continue;
    const { action } = item;
    const base = BUTTON_ACTIONS[action];
    seen.add(action);
    const fixed = item.columns ?? base.columns;
    const columns = fixed != null ? clampInt(fixed, 1, 12, 12) : null;
    buttons.push({
      action,
      name: item.name ? String(item.name) : null,
      icon: item.icon ? String(item.icon) : null,
      color: item.color ? String(item.color) : null,
      columns: columns ?? 12 / grid.perRow,
      span: columns != null ? (columns * grid.columns) / 12 : grid.columns / grid.perRow,
    });
  }
  return buttons;
}

/** A CSS colour for a Home Assistant colour name (e.g. "light-blue") or a CSS colour. */
export function resolveColor(color, fallback = "var(--primary-color)") {
  const value = String(color ?? "").trim();
  if (!value) return fallback;
  const name = value.toLowerCase().replace(/_/g, "-");
  if (name in HA_COLORS) return `var(--${name}-color, ${HA_COLORS[name]})`;
  if (name === "primary" || name === "accent") return `var(--${name}-color)`;
  // Anything else is used as-is, as long as it can't break out of the style attribute.
  return /^[#\w\s(),.%-]+$/.test(value) ? value : fallback;
}

/** A YYYY-MM-DD date as a local Date at midnight. */
function parseDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Today's (local) date as YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const dateLabel = (iso) => parseDay(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

/** A number typed in a form ("4,25" works too), or null. */
const parseNumber = (value) => {
  const n = parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Weight in kg from the growth form: `weight` (kg) or `lb` + `oz`; null when empty. */
export function parseWeight(form, units) {
  if (units === "imperial") {
    const lb = parseNumber(form.lb);
    const oz = parseNumber(form.oz);
    if (lb === null && oz === null) return null;
    const pounds = (lb || 0) + (oz || 0) / 16;
    return pounds > 0 ? pounds * KG_PER_LB : null;
  }
  const kg = parseNumber(form.weight);
  return kg !== null && kg > 0 ? kg : null;
}

/** Length in cm from a value in cm (metric) or inches (imperial); null when empty. */
export function parseLength(value, units) {
  const n = parseNumber(value);
  if (n === null || n <= 0) return null;
  return units === "imperial" ? n * CM_PER_INCH : n;
}

/** "4.25 kg" or "9 lb 6.4 oz"; "" without a value. */
export function formatWeight(kg, units) {
  if (kg === null || kg === undefined) return "";
  if (units === "imperial") {
    const tenthsOfOunce = Math.round((kg / KG_PER_LB) * 160);
    const lb = Math.floor(tenthsOfOunce / 160);
    const oz = (tenthsOfOunce - lb * 160) / 10;
    return `${lb} lb ${oz.toFixed(1).replace(/\.0$/, "")} oz`;
  }
  return `${Number(kg).toFixed(2)} kg`;
}

/** "55.5 cm" or "21.9 in"; "" without a value. */
export function formatLength(cm, units) {
  if (cm === null || cm === undefined) return "";
  return units === "imperial" ? `${(cm / CM_PER_INCH).toFixed(1)} in` : `${Number(cm).toFixed(1)} cm`;
}

/** Age on a date: "at birth", "3 days", "5 weeks", "4 months", "1 year 3 months"; "" if unknown. */
export function formatAge(birthIso, dateIso) {
  if (!birthIso || !dateIso) return "";
  const birth = parseDay(birthIso);
  const day = parseDay(dateIso);
  const days = Math.round((day - birth) / 86400000);
  if (days < 0) return "";
  if (days === 0) return "at birth";
  if (days < 14) return plural(days, "day", "days");
  if (days < 7 * 9) return plural(Math.floor(days / 7), "week", "weeks");
  const months =
    (day.getFullYear() - birth.getFullYear()) * 12 + day.getMonth() - birth.getMonth() - (day.getDate() < birth.getDate() ? 1 : 0);
  if (months < 24) return plural(months, "month", "months");
  const years = Math.floor(months / 12);
  return months % 12 ? `${plural(years, "year", "years")} ${plural(months % 12, "month", "months")}` : plural(years, "year", "years");
}

const monthsLabel = (m) => (m < 24 || m % 12 ? plural(m, "month", "months") : plural(m / 12, "year", "years"));

/**
 * Milestones in timeline order: reached ones by the date reached (oldest first),
 * then the ones not reached yet by typical age; those without one go last.
 */
export function milestoneTimeline(milestones) {
  const list = milestones || [];
  const reached = list.filter((m) => m.date).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const upcoming = list
    .filter((m) => !m.date)
    .map((m, index) => ({ m, index }))
    .sort((a, b) => (a.m.months ?? Infinity) - (b.m.months ?? Infinity) || a.index - b.index)
    .map(({ m }) => m);
  return { reached, upcoming };
}

const STOP_WORDS = new Set(["a", "an", "the", "to", "of", "on", "in", "at", "with", "and", "from", "for", "by", "his", "her", "their", "own", "baby", "said", "says", "say"]);

/** Lower case, without accents or punctuation. */
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const stem = (word) => (word.length > 4 ? word.replace(/(ing|ed|es|s)$/, "") : word);

/** Edit distance where swapping two neighbouring letters counts as one edit. */
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Milestones matching what was typed, best first. Matches the name and the tags,
 * ignoring case, accents and word endings, and allowing small typos.
 */
export function matchMilestones(query, milestones, limit = 6) {
  const phrase = normalizeText(query);
  const tokens = phrase
    .split(" ")
    .filter((t) => t && !STOP_WORDS.has(t))
    .map(stem);
  if (!tokens.length) return [];
  const scored = [];
  for (const m of milestones || []) {
    const texts = [m.name, ...(m.tags || [])].map(normalizeText);
    const words = [...new Set(texts.join(" ").split(" ").filter(Boolean).map(stem))];
    let score = 0;
    let matched = 0;
    let fuzzy = false;
    for (const t of tokens) {
      let best = 0;
      for (const w of words) {
        if (w === t) best = 3;
        else if (best < 2 && t.length >= 2 && w.startsWith(t)) best = 2;
        else if (best < 1 && t.length >= 4 && editDistance(t, w) <= (t.length >= 7 ? 2 : 1)) best = 1;
        if (best === 3) break;
      }
      score += best;
      if (best) matched++;
      if (best === 1) fuzzy = true;
    }
    if (phrase.length >= 3 && texts.some((text) => text.includes(phrase))) score += 4;
    // Every word must match; with three or more words one may be left over.
    if (score && matched >= tokens.length - (tokens.length >= 3 ? 1 : 0)) scored.push({ m, score, fuzzy });
  }
  // Typo matches only count when nothing matches as typed ("walking" isn't "talking").
  if (scored.some((x) => !x.fuzzy)) scored.splice(0, scored.length, ...scored.filter((x) => !x.fuzzy));
  scored.sort((a, b) => b.score - a.score || Number(Boolean(a.m.date)) - Number(Boolean(b.m.date)) || a.m.name.localeCompare(b.m.name));
  return scored.slice(0, limit).map(({ m }) => m);
}

// The latest snapshot (and sleeps) per subscription, so a card that Home Assistant
// builds again renders at full height straight away instead of "Loading…", which
// would make the page shorter for a moment and scroll it back to the top.
const SNAPSHOTS = new Map();
const SLEEPS = new Map();
let defaultEntryId = null;

/**
 * Points of a growth chart, oldest first. x is the age in months when the birth
 * date is known, otherwise days since 1970; y is in the display units.
 */
export function growthPoints(growth, field, birthIso, units) {
  const imperial = units === "imperial";
  const toDisplay = field === "weight_kg" ? (v) => (imperial ? v / KG_PER_LB : v) : (v) => (imperial ? v / CM_PER_INCH : v);
  const birth = birthIso ? parseDay(birthIso) : null;
  return (growth || [])
    .filter((g) => g[field] !== null && g[field] !== undefined)
    .map((g) => {
      const day = parseDay(g.date);
      return { x: birth ? (day - birth) / 86400000 / 30.4375 : day.getTime() / 86400000, y: toDisplay(g[field]), date: g.date };
    })
    .sort((a, b) => a.x - b.x);
}

/** A round step that splits `range` into about `count` parts. */
function niceStep(range, count) {
  const raw = range / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((step) => step >= raw);
}

/** Line chart of growth points over age (months) or dates. */
function growthChart(points, { byAge, unit, decimals }) {
  if (!points.length) return `<div class="message">No measurements yet.</div>`;
  const width = 300;
  const height = 150;
  const left = 34;
  const right = 8;
  const top = 10;
  const bottom = 18;
  let x0 = byAge ? 0 : points[0].x;
  let x1 = points[points.length - 1].x;
  if (byAge) x1 = Math.max(x1, 1);
  if (x1 - x0 < 1) {
    x0 -= 15;
    x1 += 15;
  }
  const ys = points.map((p) => p.y);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  const pad = Math.max((y1 - y0) * 0.1, y1 * 0.05, 0.1);
  y0 = Math.max(0, y0 - pad);
  y1 += pad;
  const sx = (x) => left + ((x - x0) / (x1 - x0)) * (width - left - right);
  const sy = (y) => height - bottom - ((y - y0) / (y1 - y0)) * (height - top - bottom);
  let svg = "";
  const yStep = niceStep(y1 - y0, 4);
  for (let y = Math.ceil(y0 / yStep) * yStep; y <= y1; y += yStep) {
    svg += `<line x1="${left}" x2="${width - right}" y1="${sy(y).toFixed(1)}" y2="${sy(y).toFixed(1)}" class="grid"/>`;
    svg += `<text x="${left - 4}" y="${(sy(y) + 3).toFixed(1)}" class="yaxis">${Number(y.toFixed(2))}</text>`;
  }
  if (byAge) {
    const step = [1, 2, 3, 6, 12, 24, 36].find((s) => (x1 - x0) / s <= 8) ?? 48;
    for (let m = 0; m <= x1; m += step) {
      const label = m >= 24 && m % 12 === 0 ? `${m / 12} y` : `${m} m`;
      svg += `<text x="${sx(m).toFixed(1)}" y="${height - 4}" class="axis">${label}</text>`;
    }
  } else {
    const start = new Date(x0 * 86400000);
    const months = (x1 - x0) / 30.4375;
    const step = [1, 2, 3, 6, 12, 24].find((s) => months / s <= 6) ?? 36;
    const tick = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    for (; tick.getTime() / 86400000 <= x1; tick.setMonth(tick.getMonth() + step)) {
      const x = sx(tick.getTime() / 86400000);
      const label = tick.toLocaleDateString([], step >= 12 ? { year: "numeric" } : { month: "short", year: "2-digit" });
      svg += `<text x="${x.toFixed(1)}" y="${height - 4}" class="axis">${esc(label)}</text>`;
    }
  }
  svg += `<polyline class="series" points="${points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ")}"/>`;
  for (const p of points) {
    svg += `<circle class="point" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3"><title>${esc(dateLabel(p.date))}: ${p.y.toFixed(decimals)} ${unit}</title></circle>`;
  }
  return `<svg class="growth-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">${svg}</svg>`;
}

function describe(e) {
  if (e.kind === "diaper") {
    const d = DIAPER[e.diaper_type] || DIAPER.wet;
    return { emoji: d.emoji, text: `Diaper: ${d.label}` };
  }
  if (e.kind === "feeding") {
    const sides = (e.sides || []).map((s) => (SIDES[s.side] || {}).label || s.side);
    const amount = e.amount_ml ? ` · ${Math.round(e.amount_ml)} ml` : "";
    return { emoji: "🍼", text: `Feeding: ${sides.join(" → ")}${amount}` };
  }
  const ms = new Date(e.end) - new Date(e.start);
  return { emoji: "😴", text: `Sleep ${formatDuration(ms)} (${clock(e.start)}–${clock(e.end)})` };
}

function clock(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(date, now = new Date()) {
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

function stackedBars(buckets, keys, colors, valueFn, { unit = "", decimals = 0 } = {}) {
  const width = 280;
  const height = 110;
  const top = 14;
  const bottom = 18;
  const n = buckets.length;
  const slot = width / n;
  const barWidth = Math.min(28, slot * 0.6);
  const totals = buckets.map((b) => keys.reduce((sum, k) => sum + valueFn(b, k), 0));
  const max = Math.max(1, ...totals);
  const scale = (height - top - bottom) / max;
  let bars = "";
  buckets.forEach((b, i) => {
    const x = i * slot + (slot - barWidth) / 2;
    let y = height - bottom;
    for (const k of keys) {
      const v = valueFn(b, k);
      if (v <= 0) continue;
      const h = v * scale;
      y -= h;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${colors[k]}"><title>${esc(k)}: ${v.toFixed(decimals)}${unit}</title></rect>`;
    }
    const total = totals[i];
    if (Number(total.toFixed(decimals)) > 0) {
      bars += `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" class="value">${total.toFixed(decimals)}</text>`;
    }
    const label = b.start.toLocaleDateString([], { weekday: "narrow" });
    bars += `<text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 4}" class="axis">${esc(label)}</text>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">${bars}</svg>`;
}

function legend(items) {
  return `<div class="legend">${items
    .map(([label, color]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`)
    .join("")}</div>`;
}

class BabyTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._error = null;
    // Where the bottle amount form is open ("tiles" or "buttons"), or false.
    this._bottleOpen = false;
    this._bottleAmount = "";
    // Open forms and what has been typed in them, kept across re-renders.
    this._growthOpen = false;
    this._growthForm = {};
    this._milestoneForm = {};
    this._growthListOpen = null; // null: follow the growth_list option
    this._msOpen = new Set(); // expanded milestones
    this._msAllOpen = false;
    this._msShowAll = false; // all upcoming milestones, not just the next few
    this._addForm = null; // the add-milestone window, when open
    // Bumped whenever a subscription is dropped, so stale in-flight ones are discarded.
    this._generation = 0;
    this._retryAt = 0;
  }

  static getConfigElement() {
    return document.createElement("baby-logger-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    const next = { ...DEFAULTS, ...config };
    const needs = (c) => JSON.stringify(this._dataNeeds(c));
    const changed =
      this._config &&
      (this._config.entry_id !== next.entry_id || this._config.days !== next.days || needs(this._config) !== needs(next));
    this._config = next;
    if (changed) this._resubscribe();
    else if (this._data && this._needsSleeps()) this._ensureSleeps(this._data);
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // After an error, wait before retrying instead of retrying on every state change.
    if (!this._unsub && !this._subscribing && Date.now() >= this._retryAt) this._subscribe();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._timer = window.setInterval(() => this._tick(), 15000);
    this._retryAt = 0;
    if (this._hass && !this._unsub) this._subscribe();
  }

  disconnectedCallback() {
    window.clearInterval(this._timer);
    this._unsubscribe();
  }

  getCardSize() {
    return 10;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  async _subscribe() {
    if (!this._hass || !this._config || this._subscribing || this._unsub || !this.isConnected) return;
    const generation = ++this._generation;
    this._subscribing = true;
    if (!this._data && this._fromCache(this._config.entry_id || defaultEntryId)) this._render();
    try {
      let entryId = this._config.entry_id;
      if (!entryId) {
        const babies = await this._hass.callWS({ type: `${DOMAIN}/babies` });
        if (!babies.length) throw new Error("No baby has been added yet. Add the Baby Tracker integration first.");
        entryId = babies[0].entry_id;
        defaultEntryId = entryId;
      }
      if (generation !== this._generation) return;
      const cacheKey = this._cacheKey(entryId);
      const unsub = await this._hass.connection.subscribeMessage(
        (data) => {
          if (generation !== this._generation) return;
          SNAPSHOTS.set(cacheKey, data);
          this._data = data;
          this._error = null;
          if (this._needsSleeps()) this._ensureSleeps(data);
          this._backgroundRender();
        },
        { type: `${DOMAIN}/subscribe`, entry_id: entryId, days: Number(this._config.days) || 7, ...this._dataNeeds() }
      );
      if (generation !== this._generation) {
        // The card was reconfigured or removed while subscribing.
        Promise.resolve(unsub()).catch(() => {});
        return;
      }
      this._entryId = entryId;
      this._unsub = unsub;
      this._retryAt = 0;
    } catch (err) {
      if (generation !== this._generation) return;
      this._error = err && err.message ? err.message : String(err);
      this._retryAt = Date.now() + 30000;
      this._backgroundRender();
    } finally {
      if (generation === this._generation) this._subscribing = false;
    }
  }

  _parts() {
    return resolveParts(this._config);
  }

  _cacheKey(entryId) {
    const needs = this._dataNeeds();
    return `${entryId}|${Number(this._config.days) || 7}|${needs.growth}|${needs.milestones}`;
  }

  /** Show the last snapshot for this baby (from another card instance) while subscribing. */
  _fromCache(entryId) {
    const data = entryId ? SNAPSHOTS.get(this._cacheKey(entryId)) : null;
    if (!data) return false;
    this._data = data;
    const sleeps = SLEEPS.get(entryId);
    if (sleeps && !this._sleeps) {
      this._sleeps = sleeps.sleeps;
      this._sleepsKey = sleeps.key;
    }
    return true;
  }

  /** The optional data the subscription sends, only for the parts shown. */
  _dataNeeds(config = this._config) {
    const parts = resolveParts(config);
    return { growth: parts.includes("growth"), milestones: parts.includes("milestones") };
  }

  _needsSleeps() {
    return this._parts().some((p) => SLEEP_PARTS.includes(p));
  }

  /** Load the sleeps the timeline and night chart need; again only when the data or range changes. */
  _ensureSleeps(d) {
    const now = new Date();
    const parts = this._parts();
    const starts = [];
    if (parts.includes("timeline")) starts.push(timelineRangeStart(timelineSettings(this._config), now));
    if (parts.includes("nights")) starts.push(nightsRangeStart(nightSettings(this._config, d.settings), now));
    if (!starts.length) return;
    const rangeStart = new Date(Math.min(...starts));
    const key = `${d.entry_id}|${d.revision}|${rangeStart.toISOString()}`;
    if (key === this._sleepsKey || key === this._sleepsLoading) return;
    this._sleepsLoading = key;
    const generation = this._generation;
    this._hass
      .callWS({ type: `${DOMAIN}/sleeps`, entry_id: d.entry_id, start: rangeStart.toISOString() })
      .then((result) => {
        if (generation !== this._generation || this._sleepsLoading !== key) return;
        this._sleeps = result.sleeps.map(([s, e]) => [new Date(s), new Date(e)]);
        this._sleepsKey = key;
        this._sleepsLoading = null;
        SLEEPS.set(d.entry_id, { sleeps: this._sleeps, key });
        this._backgroundRender();
      })
      .catch((err) => {
        if (this._sleepsLoading === key) this._sleepsLoading = null;
        this._sleepsError = err && err.message ? err.message : String(err);
        this._backgroundRender();
      });
  }

  _unsubscribe() {
    this._generation++;
    this._subscribing = false;
    if (this._unsub) {
      const unsub = this._unsub;
      this._unsub = null;
      Promise.resolve(unsub()).catch(() => {});
    }
  }

  _resubscribe() {
    this._unsubscribe();
    this._data = null;
    this._sleeps = null;
    this._sleepsKey = null;
    this._retryAt = 0;
    this._subscribe();
  }

  async _call(service, data = {}) {
    try {
      await this._hass.callService(DOMAIN, service, { config_entry_id: this._entryId, ...data });
      return true;
    } catch (err) {
      this.dispatchEvent(
        new CustomEvent("hass-notification", {
          detail: { message: err && err.message ? err.message : String(err) },
          bubbles: true,
          composed: true,
        })
      );
      return false;
    }
  }

  /** Update relative times without re-rendering inputs. */
  _tick() {
    const root = this.shadowRoot;
    if (!root || !this._data) return;
    const now = Date.now();
    root.querySelectorAll("[data-since]").forEach((el) => {
      el.textContent = formatDuration(now - new Date(el.dataset.since));
    });
    root.querySelectorAll("[data-undo-expires]").forEach((el) => {
      const left = Math.round((new Date(el.dataset.undoExpires) - now) / 1000);
      el.textContent = left > 0 ? `${left}s` : "";
    });
  }

  _handleClick(ev) {
    const target = ev.target.closest("[data-action]");
    if (!target) return;
    const { action, value } = target.dataset;
    switch (action) {
      case "diaper":
        this._call("log_diaper", { type: value });
        break;
      case "feed":
        if (value === "bottle") {
          const source = target.dataset.source || "tiles";
          this._bottleOpen = this._bottleOpen === source ? false : source;
          this._render();
          if (this._bottleOpen) this.shadowRoot.querySelector("#bottle-amount")?.focus();
        } else {
          this._call("log_feeding", { side: value });
        }
        break;
      case "bottle-log": {
        const amount = parseFloat(this.shadowRoot.querySelector("#bottle-amount")?.value);
        this._bottleOpen = false;
        this._call("log_feeding", Number.isFinite(amount) && amount > 0 ? { side: "bottle", amount_ml: amount } : { side: "bottle" });
        break;
      }
      case "bottle-cancel":
        this._bottleOpen = false;
        this._render();
        break;
      case "sleep":
        this._call(this._data && this._data.sleeping ? "end_sleep" : "start_sleep");
        break;
      case "undo":
        this._call("undo");
        break;
      case "growth-open":
        this._growthOpen = !this._growthOpen;
        this._growthForm = { date: todayIso() };
        this._render();
        this.shadowRoot.querySelector("#growth-weight, #growth-lb")?.focus();
        break;
      case "growth-cancel":
        this._growthOpen = false;
        this._render();
        break;
      case "growth-save":
        this._saveGrowth();
        break;
      case "growth-delete": {
        const m = (this._data?.growth || []).find((g) => g.id === value);
        const units = this._config.units;
        const text = m ? [formatWeight(m.weight_kg, units), formatLength(m.length_cm, units)].filter(Boolean).join(", ") : "";
        if (window.confirm(`Delete the measurement${text ? ` (${text})` : ""}?`)) this._call("delete_growth", { event_id: value });
        break;
      }
      case "growth-list":
        this._growthListOpen = !this._growthListIsOpen();
        this._render();
        break;
      case "milestone": {
        // Expand or collapse one milestone in the timeline.
        const open = this._msAllOpen || this._msOpen.has(value);
        if (this._msAllOpen) {
          this._msAllOpen = false;
          this._msOpen = new Set(this._shownMilestones().map((m) => m.key));
        }
        if (open) this._msOpen.delete(value);
        else this._msOpen.add(value);
        this._render();
        break;
      }
      case "milestones-all":
        this._msAllOpen = !this._msAllOpen;
        this._msOpen = new Set();
        this._render();
        break;
      case "milestones-more":
        this._msShowAll = !this._msShowAll;
        this._render();
        break;
      case "milestone-save": {
        const m = (this._data?.milestones || []).find((x) => x.key === value);
        const date = this._milestoneForm[`date-${value}`] ?? m?.date ?? todayIso();
        this._call("set_milestone", { milestone: value, date: date || todayIso() }).then((ok) => {
          if (ok) {
            delete this._milestoneForm[`date-${value}`];
            this._render();
          }
        });
        break;
      }
      case "milestone-clear":
        this._call("clear_milestone", { milestone: value }).then((ok) => {
          if (ok) {
            delete this._milestoneForm[`date-${value}`];
            this._render();
          }
        });
        break;
      case "milestone-delete": {
        const m = (this._data?.milestones || []).find((x) => x.key === value);
        if (window.confirm(`Delete "${m ? m.name : "this milestone"}"?`)) {
          this._msOpen.delete(value);
          this._call("delete_milestone", { milestone: value });
        }
        break;
      }
      case "milestone-add-open":
        this._openAddDialog();
        break;
      case "delete": {
        const event = (this._data?.events || []).find((e) => e.id === value);
        const text = event ? describe(event).text : "this entry";
        if (window.confirm(`Delete "${text}"?`)) this._call("delete_event", { event_id: value });
        break;
      }
      default:
        break;
    }
  }

  /** The parts of the shadow DOM that are created once: style, card and add-milestone window. */
  _ensureShell() {
    if (this._card) return this._card;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card></ha-card><dialog class="ms-dialog"></dialog>`;
    const card = this.shadowRoot.querySelector("ha-card");
    card.addEventListener("click", (ev) => this._handleClick(ev));
    // Remember what is typed in the forms ([data-form] / [data-field] inputs).
    card.addEventListener("input", (ev) => {
      const { form, field } = ev.target.dataset;
      if (form === "growth") this._growthForm[field] = ev.target.value;
      if (form === "milestone") this._milestoneForm[field] = ev.target.value;
      if (ev.target.id === "bottle-amount") this._bottleAmount = ev.target.value;
    });
    card.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || ev.target.tagName !== "INPUT") return;
      const form = ev.target.closest("[data-submit]");
      if (!form) return;
      const { submit, value } = form.dataset;
      const selector = `[data-action="${submit}"]${value ? `[data-value="${CSS.escape(value)}"]` : ""}`;
      form.querySelector(selector)?.click();
    });
    // An update that arrived while a field had focus is shown once it loses focus.
    card.addEventListener("focusout", () => {
      setTimeout(() => {
        if (this._pendingRender && !this._fieldFocused()) this._render();
      }, 0);
    });
    const dialog = this.shadowRoot.querySelector("dialog");
    dialog.addEventListener("click", (ev) => this._handleDialogClick(ev));
    dialog.addEventListener("input", (ev) => this._handleDialogInput(ev));
    dialog.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && ev.target.tagName === "INPUT") {
        ev.preventDefault();
        this._addAsNew();
      }
    });
    dialog.addEventListener("close", () => {
      this._addForm = null;
    });
    this._card = card;
    return card;
  }

  /** Whether a form field in the card has focus (someone is typing or picking a date). */
  _fieldFocused() {
    const active = this.shadowRoot?.activeElement;
    return Boolean(active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName) && this._card?.contains(active));
  }

  /**
   * Re-render for an update nobody asked for (new data, sleeps loaded). Rebuilding
   * the card while a field has focus would close its date picker and could scroll the
   * page, so it waits until the field loses focus.
   */
  _backgroundRender() {
    if (this._fieldFocused()) {
      this._pendingRender = true;
      return;
    }
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    this._pendingRender = false;
    const card = this._ensureShell();
    // Keep focus and caret in a form field across re-renders.
    const active = this.shadowRoot.activeElement;
    const focusId = active && active.id ? active.id : null;
    let caret = null;
    try {
      caret = focusId ? [active.selectionStart, active.selectionEnd] : null;
    } catch (_err) {
      // not every input type has a selection
    }
    let body;
    if (this._error) {
      body = `<div class="message error">${esc(this._error)}</div>`;
    } else if (!this._data) {
      body = `<div class="message loading">Loading…</div>`;
    } else {
      body = this._renderData(this._data);
    }
    card.innerHTML = body;
    const amount = this.shadowRoot.querySelector("#bottle-amount");
    if (amount) amount.value = this._bottleAmount;
    const focused = focusId ? this.shadowRoot.getElementById(focusId) : null;
    if (focused && card.contains(focused)) {
      // preventScroll: restoring focus must not scroll the page to the field.
      focused.focus({ preventScroll: true });
      try {
        if (caret) focused.setSelectionRange(caret[0], caret[1]);
      } catch (_err) {
        // number and date inputs don't support selection ranges
      }
    }
  }

  _saveGrowth() {
    const form = this._growthForm;
    const units = this._config.units;
    const weight = parseWeight(form, units);
    const length = parseLength(units === "imperial" ? form.inches : form.cm, units);
    if (weight === null && length === null) {
      this.shadowRoot.querySelector("#growth-weight, #growth-lb")?.focus();
      return;
    }
    const data = { date: form.date || todayIso() };
    if (weight !== null) data.weight = Math.round(weight * 1000) / 1000;
    if (length !== null) data.length = Math.round(length * 10) / 10;
    this._call("log_growth", data).then((ok) => {
      if (ok) {
        this._growthOpen = false;
        this._growthForm = {};
        this._render();
      }
    });
  }

  _renderData(d) {
    const cfg = this._config;
    const now = new Date();
    const since = (iso) => (iso ? `<span data-since="${esc(iso)}">${formatDuration(now - new Date(iso))}</span>` : "–");

    // Sleep history, shared by the night chart and the timeline.
    let intervals = null;
    if (this._sleeps) {
      intervals = [...this._sleeps];
      if (d.sleep_start) intervals.push([new Date(d.sleep_start), now]);
    }
    const pending = this._sleepsError
      ? `<div class="message error">${esc(this._sleepsError)}</div>`
      : `<div class="message">Loading…</div>`;

    const parts = {
      header: () => this._headerHtml(d),
      undo: () => this._undoHtml(d, now),
      tiles: () => this._tilesHtml(d, since),
      buttons: () => this._buttonsHtml(d, now, since),
      summary: () => this._summaryHtml(d),
      trends: () => this._trendsHtml(d, now),
      nights: () => {
        const settings = nightSettings(cfg, d.settings);
        return `
        <div class="section">
          <div class="section-title">Night sleep</div>
          <div class="chart">${intervals ? nightsHtml(nightStats(intervals, settings, now), settings) : pending}</div>
        </div>`;
      },
      timeline: () => {
        const settings = timelineSettings(cfg);
        const content = intervals ? timelineHtml(timelineRows(intervals, settings, now), settings, now) : pending;
        const title =
          settings.group === 1 ? "Sleep timeline" : `Sleep timeline (${settings.group}-day averages)`;
        return `
        <div class="section">
          <div class="section-title">${title}</div>
          <div class="chart">${content}</div>
        </div>`;
      },
      log: () => this._logHtml(d, now),
      growth: () => this._growthHtml(d),
      milestones: () => this._milestonesHtml(d),
    };
    return this._parts()
      .map((part) => parts[part]())
      .join("");
  }

  _bottleForm(source) {
    return this._bottleOpen === source
      ? `<div class="bottle" data-submit="bottle-log"><input id="bottle-amount" type="number" inputmode="numeric" min="0" step="5" placeholder="Amount (ml, optional)"><button class="small primary" data-action="bottle-log">Log bottle</button><button class="small" data-action="bottle-cancel">Cancel</button></div>`
      : "";
  }

  _headerHtml(d) {
    return `
      <div class="header">
        <div class="name"><ha-icon icon="mdi:baby-face-outline"></ha-icon>${esc(d.name)}</div>
        <div class="chips">
          <span class="chip">${plural(d.today.diapers.total, "diaper", "diapers")}</span>
          <span class="chip">${plural(d.today.feedings.total, "feeding", "feedings")}</span>
          ${d.today.bottle_ml ? `<span class="chip">${Math.round(d.today.bottle_ml)} ml</span>` : ""}
        </div>
      </div>`;
  }

  _undoHtml(d, now) {
    return d.undo
      ? `<div class="undo"><ha-icon icon="mdi:check-circle"></ha-icon><span>${esc(UNDO_LABELS[d.undo.action] || "Saved")}</span>
          <span class="countdown" data-undo-expires="${esc(d.undo.expires)}">${Math.max(0, Math.round((new Date(d.undo.expires) - now) / 1000))}s</span>
          <button class="small" data-action="undo"><ha-icon icon="mdi:undo-variant"></ha-icon>Undo</button></div>`
      : "";
  }

  _tilesHtml(d, since) {
    const lastDiaper = d.last_diaper;
    const lastFeeding = d.last_feeding;
    const diaperSub = lastDiaper
      ? `${DIAPER[lastDiaper.diaper_type]?.emoji || ""} ${esc(DIAPER[lastDiaper.diaper_type]?.label || "")} at ${clock(lastDiaper.start)}`
      : "Nothing logged yet";
    const feedingSides = lastFeeding ? (lastFeeding.sides || []).map((s) => SIDES[s.side]?.label || s.side).join(" → ") : "";
    const feedingSub = lastFeeding
      ? `${esc(feedingSides)}${lastFeeding.amount_ml ? ` · ${Math.round(lastFeeding.amount_ml)} ml` : ""} at ${clock(lastFeeding.start)}`
      : "Nothing logged yet";

    const diaperButtons = Object.entries(DIAPER)
      .map(([key, v]) => `<button class="action" style="--accent:${v.color}" data-action="diaper" data-value="${key}"><span class="emoji">${v.emoji}</span>${v.label}</button>`)
      .join("");
    const feedButtons = Object.entries(SIDES)
      .map(([key, v]) => {
        const next = key === d.next_side ? " next" : "";
        const active = key === "bottle" && this._bottleOpen === "tiles" ? " active" : "";
        return `<button class="action${next}${active}" style="--accent:${v.color}" data-action="feed" data-value="${key}" data-source="tiles"><ha-icon icon="${v.icon}"></ha-icon>${v.label}${next ? '<span class="badge">next</span>' : ""}</button>`;
      })
      .join("");

    const sleeping = d.sleeping;
    const sleepSince = sleeping ? d.sleep_start : d.last_wake;
    const sleepTile = `
      <div class="tile sleep${sleeping ? " sleeping" : ""}">
        <div class="tile-head"><ha-icon icon="${sleeping ? "mdi:sleep" : "mdi:weather-sunny"}"></ha-icon>${sleeping ? "Sleeping" : "Awake"}</div>
        <div class="big">${sleepSince ? since(sleepSince) : "–"}</div>
        <div class="sub">${hours(d.today.sleep_hours)} asleep today</div>
        <div class="buttons"><button class="action wide" style="--accent:${sleeping ? SLEEP_COLORS.day : SLEEP_COLORS.night}" data-action="sleep">
          <span class="emoji">${sleeping ? "☀️" : "😴"}</span>${sleeping ? "Woke up" : "Fell asleep"}</button></div>
      </div>`;

    return `
      <div class="tiles">
        <div class="tile">
          <div class="tile-head"><ha-icon icon="mdi:human-baby-changing-table"></ha-icon>Diaper</div>
          <div class="big">${lastDiaper ? since(lastDiaper.start) : "–"}</div>
          <div class="sub">${diaperSub}</div>
          <div class="buttons">${diaperButtons}</div>
        </div>
        <div class="tile">
          <div class="tile-head"><ha-icon icon="mdi:baby-bottle-outline"></ha-icon>Feeding</div>
          <div class="big">${lastFeeding ? since(lastFeeding.start) : "–"}</div>
          <div class="sub">${feedingSub}</div>
          <div class="buttons">${feedButtons}</div>
          ${this._bottleForm("tiles")}
        </div>
        ${sleepTile}
      </div>`;
  }

  /** Compact one-tap buttons: an icon in a coloured circle and a label. */
  _buttonsHtml(d, now, since) {
    // A feeding logged now would be added to the previous one (side switch).
    const lastFeeding = d.last_feeding;
    const mergeMs = (Number(d.settings?.merge_minutes) || 0) * 60000;
    const sameFeeding =
      Boolean(lastFeeding) && mergeMs > 0 && now - new Date(lastFeeding.end || lastFeeding.start) < mergeMs;

    const buttons = buttonList(this._config)
      .map((b) => {
        const base = BUTTON_ACTIONS[b.action];
        let name = b.name || base.name;
        let icon = b.icon || base.icon;
        let color = b.color || base.color;
        let sub = "";
        let action = base.action;
        let value = base.value;
        let classes = "";
        let badge = "";
        if (b.action === "sleep") {
          action = "sleep";
          if (d.sleeping) {
            name = b.name || "Sleeping 😴";
            sub = d.sleep_start ? `Asleep for ${since(d.sleep_start)} — tap to wake` : "Tap to wake";
            classes = " on";
          } else {
            name = b.name || "Awake ☀️";
            icon = b.icon || "mdi:weather-sunny";
            color = b.color || "amber";
            sub = d.last_wake ? `Awake for ${since(d.last_wake)} — tap to start sleep` : "Tap to start sleep";
          }
        } else if (b.action === "undo") {
          if (!d.undo) return "";
          action = "undo";
          name = b.name || "↩️ Undo";
          const left = Math.max(0, Math.round((new Date(d.undo.expires) - now) / 1000));
          sub = `${esc(UNDO_LABELS[d.undo.action] || "Saved")} · tap within <span data-undo-expires="${esc(d.undo.expires)}">${left}s</span>`;
        } else if (action === "feed") {
          if (value === d.next_side) {
            classes = " next";
            badge = '<span class="badge">next</span>';
          }
          if (value === "bottle" && this._bottleOpen === "buttons") classes += " active";
          if (sameFeeding) sub = "same feeding";
        }
        // Wide buttons put the text next to the icon; narrow ones below it.
        const layout = b.columns >= 6 ? " wide" : "";
        return `<button class="qb${layout}${classes}" style="grid-column: span ${b.span}; --accent: ${resolveColor(color)}"
          data-action="${action}"${value ? ` data-value="${value}"` : ""} data-source="buttons">
          <span class="qb-icon"><ha-icon icon="${esc(icon)}"></ha-icon></span>
          <span class="qb-text"><span class="qb-name">${esc(name)}</span>${sub ? `<span class="qb-sub">${sub}</span>` : ""}</span>${badge}
        </button>`;
      })
      .join("");
    const grid = buttonGrid(this._config).columns;
    return `<div class="quick" style="grid-template-columns: repeat(${grid}, minmax(0, 1fr))">${buttons}</div>${this._bottleForm("buttons")}`;
  }

  _growthHtml(d) {
    const units = this._config.units === "imperial" ? "imperial" : "metric";
    const imperial = units === "imperial";
    const growth = d.growth || [];
    const latest = (field) => [...growth].reverse().find((g) => g[field] !== null && g[field] !== undefined);
    const when = (g) => (g ? `${dateLabel(g.date)}${d.birth_date ? ` · ${formatAge(d.birth_date, g.date)}` : ""}` : "No measurements yet");
    const weight = latest("weight_kg");
    const length = latest("length_cm");
    const byAge = Boolean(d.birth_date);
    const charts = [
      ["Weight", "weight_kg", imperial ? "lb" : "kg", 2, "#26a69a"],
      ["Length", "length_cm", imperial ? "in" : "cm", 1, "#5c6bc0"],
    ]
      .map(
        ([title, field, unit, decimals, color]) =>
          `<div class="chart" style="--accent:${color}"><div class="chart-title">${title} (${unit})</div>
            ${growthChart(growthPoints(growth, field, d.birth_date, units), { byAge, unit, decimals })}</div>`
      )
      .join("");

    const f = this._growthForm;
    const input = (id, field, attrs) =>
      `<input id="${id}" data-form="growth" data-field="${field}" value="${esc(f[field] ?? "")}" ${attrs}>`;
    const number = (id, field, step, placeholder) =>
      input(id, field, `type="number" inputmode="decimal" min="0" step="${step}" placeholder="${placeholder}"`);
    const form = this._growthOpen
      ? `<div class="form" data-submit="growth-save">
          <label>Date ${input("growth-date", "date", `type="date" max="${todayIso()}"`)}</label>
          ${
            imperial
              ? `<label>Weight<span class="pair">${number("growth-lb", "lb", "1", "lb")}${number("growth-oz", "oz", "0.1", "oz")}</span></label>
                 <label>Length (in) ${number("growth-in", "inches", "0.1", "in")}</label>`
              : `<label>Weight (kg) ${number("growth-weight", "weight", "0.01", "kg")}</label>
                 <label>Length (cm) ${number("growth-cm", "cm", "0.1", "cm")}</label>`
          }
          <div class="actions"><button class="small primary" data-action="growth-save">Save</button><button class="small" data-action="growth-cancel">Cancel</button></div>
        </div>`
      : `<div class="form-toggle"><button class="small" data-action="growth-open"><ha-icon icon="mdi:plus"></ha-icon>Add measurement</button></div>`;

    const shown = clampInt(this._config.growth_entries, 0, 100, 5);
    const listOpen = this._growthListIsOpen();
    const rows = [...growth]
      .reverse()
      .slice(0, listOpen ? shown : 0)
      .map((g) => {
        const values = [formatWeight(g.weight_kg, units), formatLength(g.length_cm, units)].filter(Boolean).join(" · ");
        return `<li><span class="emoji">📏</span><span class="text">${esc(values)}</span><span class="time">${esc(when(g))}</span>
            <button class="icon" title="Delete" aria-label="Delete" data-action="growth-delete" data-value="${esc(g.id)}"><ha-icon icon="mdi:close"></ha-icon></button></li>`;
      })
      .join("");

    return `
        <div class="section">
          <div class="section-title">Growth</div>
          <div class="growth-latest">
            <div><div class="label"><ha-icon icon="mdi:scale-bathroom"></ha-icon>Weight</div>
              <div class="value">${weight ? esc(formatWeight(weight.weight_kg, units)) : "–"}</div>
              <div class="sub">${esc(when(weight))}</div></div>
            <div><div class="label"><ha-icon icon="mdi:human-male-height"></ha-icon>Length</div>
              <div class="value">${length ? esc(formatLength(length.length_cm, units)) : "–"}</div>
              <div class="sub">${esc(when(length))}</div></div>
          </div>
          <div class="charts">${charts}</div>
          ${form}
          ${
            growth.length && shown
              ? `<button class="collapse" data-action="growth-list" aria-expanded="${listOpen}">
                  <ha-icon icon="mdi:chevron-${listOpen ? "up" : "down"}"></ha-icon>Measurements<span class="count">${growth.length}</span></button>`
              : ""
          }
          ${rows ? `<ul class="log growth-list">${rows}</ul>` : ""}
        </div>`;
  }

  _growthListIsOpen() {
    return this._growthListOpen ?? this._config.growth_list === "expanded";
  }

  /** The milestones shown in the timeline: all reached ones and the next few (or all) upcoming. */
  _shownMilestones() {
    const { reached, upcoming } = milestoneTimeline(this._data?.milestones);
    return [...reached, ...(this._msShowAll ? upcoming : upcoming.slice(0, UPCOMING_SHOWN))];
  }

  _milestonesHtml(d) {
    const { reached, upcoming } = milestoneTimeline(d.milestones);
    const form = this._milestoneForm;
    const age = (iso) => (d.birth_date ? formatAge(d.birth_date, iso) : "");
    const typical = (m) => (m.months ? `${m.cdc ? "Most by" : "Around"} ${monthsLabel(m.months)}` : "");
    const item = (m) => {
      const done = Boolean(m.date);
      const open = this._msAllOpen || this._msOpen.has(m.key);
      const when = done ? [dateLabel(m.date), age(m.date)].filter(Boolean).join(" · ") : typical(m);
      const details = [];
      if (done) details.push(`Reached on ${dateLabel(m.date)}${age(m.date) ? ` (${age(m.date)})` : ""}`);
      if (m.months) {
        details.push(
          m.cdc
            ? `Most children by ${monthsLabel(m.months)} (CDC)`
            : `Typically around ${monthsLabel(m.months)}`
        );
      }
      if (m.note) details.push(`Note: ${m.note}`);
      const dateField = `date-${m.key}`;
      const panel = open
        ? `<div class="ms-details">
            ${details.map((t) => `<div>${esc(t)}</div>`).join("")}
            <div class="form ms-edit" data-submit="milestone-save" data-value="${esc(m.key)}">
              <label>Reached on
                <input id="ms-date-${esc(m.key)}" type="date" max="${todayIso()}" data-form="milestone" data-field="${esc(dateField)}"
                  value="${esc(form[dateField] ?? m.date ?? todayIso())}"></label>
              <div class="actions">
                <button class="small primary" data-action="milestone-save" data-value="${esc(m.key)}">${done ? "Save date" : "Reached"}</button>
                ${done ? `<button class="small" data-action="milestone-clear" data-value="${esc(m.key)}">Not reached</button>` : ""}
                ${m.custom ? `<button class="small" data-action="milestone-delete" data-value="${esc(m.key)}">Delete</button>` : ""}
              </div>
            </div>
          </div>`
        : "";
      return `<li class="ms${done ? " done" : ""}${open ? " open" : ""}" data-key="${esc(m.key)}">
          <button class="ms-row" data-action="milestone" data-value="${esc(m.key)}" aria-expanded="${open}">
            <span class="ms-dot"><ha-icon icon="${done ? "mdi:check" : m.custom ? "mdi:star-outline" : "mdi:circle-small"}"></ha-icon></span>
            <span class="ms-name">${esc(m.name)}</span>
            ${when ? `<span class="ms-when">${esc(when)}</span>` : ""}
            <ha-icon class="chevron" icon="mdi:chevron-${open ? "up" : "down"}"></ha-icon>
          </button>
          ${panel}
        </li>`;
    };
    const hidden = this._msShowAll ? 0 : Math.max(0, upcoming.length - UPCOMING_SHOWN);
    const shownUpcoming = this._msShowAll ? upcoming : upcoming.slice(0, UPCOMING_SHOWN);
    const timeline = [
      reached.length ? `<li class="ms-label">Reached</li>${reached.map(item).join("")}` : "",
      upcoming.length ? `<li class="ms-label">Up next</li>${shownUpcoming.map(item).join("")}` : "",
    ].join("");
    const more =
      upcoming.length > UPCOMING_SHOWN
        ? `<button class="collapse ms-more" data-action="milestones-more" aria-expanded="${this._msShowAll}">
            <ha-icon icon="mdi:chevron-${this._msShowAll ? "up" : "down"}"></ha-icon>${this._msShowAll ? "Show fewer" : `Show ${hidden} more`}</button>`
        : "";
    return `
        <div class="section milestones">
          <div class="section-title ms-head"><span>Milestones</span>
            <span class="ms-tools">
              <button class="small" data-action="milestones-all" aria-pressed="${this._msAllOpen}">
                <ha-icon icon="mdi:${this._msAllOpen ? "unfold-less-horizontal" : "unfold-more-horizontal"}"></ha-icon>${this._msAllOpen ? "Collapse all" : "Expand all"}</button>
              <button class="small primary" data-action="milestone-add-open"><ha-icon icon="mdi:plus"></ha-icon>Add</button>
            </span>
          </div>
          <ol class="ms-timeline">${timeline}</ol>
          ${more}
        </div>`;
  }

  // ------------------------------------------------------------ add milestone window

  _openAddDialog() {
    const dialog = this.shadowRoot.querySelector("dialog.ms-dialog");
    if (!dialog) return;
    this._addForm = { query: "", date: todayIso(), note: "" };
    const name = this._data?.name ? esc(this._data.name) : "the baby";
    dialog.innerHTML = `
      <div class="dlg">
        <div class="dlg-title">Add milestone</div>
        <label>What did ${name} do?
          <input id="ms-add-query" type="text" maxlength="100" autocomplete="off" placeholder="e.g. rolls over, first swim" data-add="query"></label>
        <ul class="suggestions" role="listbox"></ul>
        <div class="dlg-fields">
          <label>Reached on <input id="ms-add-date" type="date" max="${todayIso()}" data-add="date" value="${todayIso()}"></label>
          <label>Note <input id="ms-add-note" type="text" maxlength="200" placeholder="Optional" data-add="note"></label>
        </div>
        <small>Clear the date to add it as not reached yet.</small>
        <div class="dlg-actions">
          <button class="small" data-action="add-cancel">Cancel</button>
          <button class="small primary" data-action="add-new" disabled>Add as new</button>
        </div>
      </div>`;
    this._updateSuggestions();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("#ms-add-query").focus();
  }

  _closeAddDialog() {
    const dialog = this.shadowRoot.querySelector("dialog.ms-dialog");
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    this._addForm = null;
  }

  /** Update the suggestions and the "Add as new" button without touching the inputs. */
  _updateSuggestions() {
    const dialog = this.shadowRoot.querySelector("dialog.ms-dialog");
    if (!dialog || !this._addForm) return;
    const query = this._addForm.query.trim();
    const matches = matchMilestones(query, this._data?.milestones || []);
    dialog.querySelector(".suggestions").innerHTML = matches
      .map((m) => {
        const status = m.date ? `Reached ${dateLabel(m.date)}` : MILESTONE_CATEGORIES[m.category] || "";
        return `<li><button class="suggestion${m.date ? " done" : ""}" data-action="add-pick" data-value="${esc(m.key)}" role="option">
            <ha-icon icon="${m.date ? "mdi:check-circle" : "mdi:circle-outline"}"></ha-icon>
            <span class="ms-name">${esc(m.name)}</span><span class="ms-when">${esc(status)}</span></button></li>`;
      })
      .join("");
    const exact = matches.some((m) => normalizeText(m.name) === normalizeText(query));
    const add = dialog.querySelector('[data-action="add-new"]');
    add.disabled = !query || exact;
    add.textContent = query ? `Add “${query.length > 30 ? `${query.slice(0, 30)}…` : query}” as new` : "Add as new";
  }

  _handleDialogInput(ev) {
    const field = ev.target.dataset.add;
    if (!field || !this._addForm) return;
    this._addForm[field] = ev.target.value;
    if (field === "query") this._updateSuggestions();
  }

  _handleDialogClick(ev) {
    const dialog = ev.currentTarget;
    // A click on the backdrop closes the window.
    if (ev.target === dialog) {
      this._closeAddDialog();
      return;
    }
    const target = ev.target.closest("[data-action]");
    if (!target || !this._addForm) return;
    const { action, value } = target.dataset;
    if (action === "add-cancel") this._closeAddDialog();
    else if (action === "add-new") this._addAsNew();
    else if (action === "add-pick") {
      const { date, note } = this._addForm;
      const data = { milestone: value, date: date || todayIso() };
      if (note.trim()) data.note = note.trim();
      this._call("set_milestone", data).then((ok) => {
        if (ok) {
          this._closeAddDialog();
          this._msOpen.add(value);
          this._render();
        }
      });
    }
  }

  _addAsNew() {
    if (!this._addForm) return;
    const name = this._addForm.query.trim();
    const button = this.shadowRoot.querySelector('dialog [data-action="add-new"]');
    if (!name || button?.disabled) return;
    const data = { name };
    if (this._addForm.date) data.date = this._addForm.date;
    if (this._addForm.note.trim()) data.note = this._addForm.note.trim();
    this._call("add_milestone", data).then((ok) => {
      if (ok) {
        this._closeAddDialog();
        this._render();
      }
    });
  }

  _summaryHtml(d) {
    const n = d.last_night || {};
    const day = d.daytime || {};
    return `
        <div class="section">
          <div class="summary">
            <div><div class="label"><ha-icon icon="mdi:weather-night"></ha-icon>Last night</div>
              <div class="value">${hours(n.asleep)}</div>
              <div class="sub">${plural(n.wakes, "wake-up", "wake-ups")} · avg ${hours(n.avg_asleep)}</div></div>
            <div><div class="label"><ha-icon icon="mdi:weather-sunny"></ha-icon>${day.done === false ? "Today" : "Daytime"}</div>
              <div class="value">${hours(day.asleep)}</div>
              <div class="sub">${plural(day.naps, "nap", "naps")} · avg ${hours(day.avg_asleep)}</div></div>
          </div>
        </div>`;
  }

  _trendsHtml(d, now) {
    const buckets = dailyTrends(d.events || [], Number(this._config.days) || 7, now, d.sleep_start);
    return `
        <div class="section">
          <div class="section-title">Last ${buckets.length} days</div>
          <div class="charts">
            <div class="chart"><div class="chart-title">Diapers</div>
              ${stackedBars(buckets, Object.keys(DIAPER), Object.fromEntries(Object.entries(DIAPER).map(([k, v]) => [k, v.color])), (b, k) => b.diapers[k])}
              ${legend(Object.values(DIAPER).map((v) => [v.label, v.color]))}</div>
            <div class="chart"><div class="chart-title">Feedings</div>
              ${stackedBars(buckets, Object.keys(SIDES), Object.fromEntries(Object.entries(SIDES).map(([k, v]) => [k, v.color])), (b, k) => b.feedings[k])}
              ${legend(Object.values(SIDES).map((v) => [v.label, v.color]))}</div>
            <div class="chart wide"><div class="chart-title">Sleep (hours)</div>
              ${stackedBars(buckets, ["sleep"], { sleep: SLEEP_COLORS.night }, (b) => b.sleep, { unit: " h", decimals: 1 })}</div>
          </div>
        </div>`;
  }

  _logHtml(d, now) {
    const entries = [...(d.events || [])]
      .sort((a, b) => new Date(b.end || b.start) - new Date(a.end || a.start))
      .slice(0, Number(this._config.log_entries) || 10);
    let lastDay = "";
    const rows = entries
      .map((e) => {
        const when = new Date(e.kind === "sleep" ? e.end : e.start);
        const day = dayLabel(when, now);
        const heading = day !== lastDay ? `<li class="day">${esc(day)}</li>` : "";
        lastDay = day;
        const { emoji, text } = describe(e);
        return `${heading}<li><span class="emoji">${emoji}</span><span class="text">${esc(text)}</span><span class="time">${clock(when.toISOString())}</span>
            <button class="icon" title="Delete" aria-label="Delete" data-action="delete" data-value="${esc(e.id)}"><ha-icon icon="mdi:close"></ha-icon></button></li>`;
      })
      .join("");
    return `
        <div class="section">
          <div class="section-title">Log</div>
          ${rows ? `<ul class="log">${rows}</ul>` : `<div class="message">Nothing logged yet.</div>`}
        </div>`;
  }
}

const STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; overflow: hidden; container: bt-card / inline-size;
    --bt-sleep: ${SLEEP_COLORS.night}; --bt-awake: color-mix(in srgb, ${SLEEP_COLORS.day} 55%, var(--card-background-color)); }
  ha-icon { --mdc-icon-size: 18px; }
  /* Parts can come in any order: symmetric margins collapse between neighbours. */
  ha-card > :first-child { margin-top: 0; }
  ha-card > :last-child { margin-bottom: 0; }
  .message { padding: 8px 0; color: var(--secondary-text-color); }
  .message.error { color: var(--error-color, #db4437); }
  .header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin: 12px 0; }
  .name { display: flex; align-items: center; gap: 8px; font-size: 1.3em; font-weight: 500; }
  .name ha-icon { --mdc-icon-size: 26px; color: var(--primary-color); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 2px 10px; border-radius: 12px; font-size: 0.85em; background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .tiles { display: grid; grid-template-columns: 1fr; gap: 12px; margin: 12px 0; }
  .tile { border-radius: 12px; padding: 12px; background: var(--secondary-background-color); display: flex; flex-direction: column; gap: 4px; }
  .tile.sleeping { background: color-mix(in srgb, ${SLEEP_COLORS.night} 18%, var(--secondary-background-color)); }
  .tile-head { display: flex; align-items: center; gap: 6px; font-weight: 500; color: var(--secondary-text-color); }
  .big { font-size: 1.8em; font-weight: 500; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .sub { font-size: 0.85em; color: var(--secondary-text-color); min-height: 1.2em; }
  .buttons { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  button { font: inherit; cursor: pointer; border: none; color: var(--primary-text-color); }
  button.action { flex: 1 1 0; min-width: 64px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px; border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 16%, var(--card-background-color)); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); position: relative; font-size: 0.9em; }
  button.action:hover { background: color-mix(in srgb, var(--accent) 28%, var(--card-background-color)); }
  button.action:active { transform: scale(0.97); }
  button.action.next, button.action.active { border: 2px solid var(--accent); }
  button.action ha-icon { --mdc-icon-size: 22px; color: var(--accent); }
  button.action.wide { flex-direction: row; justify-content: center; gap: 8px; font-size: 1em; }
  .emoji { font-size: 1.25em; line-height: 1.2; }
  .badge { position: absolute; top: -8px; right: 4px; font-size: 0.7em; padding: 0 6px; border-radius: 8px; background: var(--accent); color: #fff; }
  .bottle { display: flex; gap: 6px; margin-top: 8px; }
  .bottle input { flex: 1; min-width: 0; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
  button.small { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 8px; background: var(--card-background-color); border: 1px solid var(--divider-color); }
  button.small.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
  .undo { display: flex; align-items: center; gap: 8px; margin: 12px 0; padding: 8px 12px; border-radius: 10px;
    background: color-mix(in srgb, var(--success-color, #43a047) 15%, var(--card-background-color)); }
  .undo > ha-icon { color: var(--success-color, #43a047); }
  .undo span:first-of-type { flex: 1; }
  .quick { display: grid; gap: 8px; margin: 12px 0; }
  .qb { position: relative; min-width: 0; min-height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    padding: 8px 4px; border-radius: 12px; background: var(--secondary-background-color); border: 2px solid transparent; text-align: center; }
  .qb.wide { flex-direction: row; justify-content: flex-start; gap: 12px; padding: 8px 12px; text-align: left; }
  .qb:hover { background: color-mix(in srgb, var(--accent) 10%, var(--secondary-background-color)); }
  .qb:active { transform: scale(0.97); }
  .qb.next, .qb.active, .qb.on { border-color: var(--accent); }
  .qb.on { background: color-mix(in srgb, var(--accent) 16%, var(--secondary-background-color)); }
  .qb-icon { flex: none; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
  .qb-icon ha-icon { --mdc-icon-size: 22px; }
  .qb-text { display: flex; flex-direction: column; min-width: 0; max-width: 100%; }
  .qb-name { font-weight: 500; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qb-sub { font-size: 0.75em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .countdown { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; font-size: 0.85em; }
  .section { margin: 16px 0; }
  .section-title { font-weight: 500; margin-bottom: 8px; }
  .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .summary > div { border-radius: 12px; padding: 12px; background: var(--secondary-background-color); }
  .summary .label { display: flex; align-items: center; gap: 6px; color: var(--secondary-text-color); font-size: 0.9em; }
  .summary .value { font-size: 1.4em; font-weight: 500; }
  .charts { display: grid; grid-template-columns: 1fr; gap: 12px; }
  @container bt-card (min-width: 420px) {
    .tiles, .charts { grid-template-columns: 1fr 1fr; }
    .tile.sleep, .chart.wide { grid-column: 1 / -1; }
  }
  @container bt-card (min-width: 700px) {
    .tiles, .charts { grid-template-columns: repeat(3, 1fr); }
    .tile.sleep, .chart.wide { grid-column: auto; }
  }
  .chart { border-radius: 12px; padding: 8px 12px; background: var(--secondary-background-color); }
  .chart-title { font-size: 0.9em; color: var(--secondary-text-color); }
  .chart svg { width: 100%; height: auto; max-height: 170px; display: block; }
  .chart text { font-size: 9px; text-anchor: middle; fill: var(--secondary-text-color); }
  .chart text.value { fill: var(--primary-text-color); }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.75em; color: var(--secondary-text-color); }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .timeline { display: flex; flex-direction: column; gap: 3px; padding: 4px 0 8px; }
  .tl-row { display: grid; grid-template-columns: 5.2em 1fr 3.4em; align-items: center; gap: 8px; font-size: 0.75em; }
  .timeline.grouped .tl-row { grid-template-columns: 7.5em 1fr 3.4em; }
  .tl-label { color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-value { text-align: right; font-variant-numeric: tabular-nums; }
  .tl-bar { height: 12px; border-radius: 3px; background-color: var(--divider-color); }
  .tl-ticks { position: relative; height: 1.2em; color: var(--secondary-text-color); }
  .tl-ticks span { position: absolute; transform: translateX(-50%); }
  .tl-ticks span:first-child { transform: none; }
  .tl-ticks span:last-child { transform: translateX(-100%); }
  .tl-note { color: var(--secondary-text-color); }
  .night-summary { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 0.85em; color: var(--secondary-text-color); padding: 4px 0; }
  .night-summary b { color: var(--primary-text-color); font-size: 1.15em; }
  .night-summary span:last-child { margin-left: auto; }
  .chart svg.nights { max-height: 220px; }
  .chart line.grid { stroke: var(--divider-color); stroke-width: 0.5; }
  .chart line.avg { stroke: var(--primary-text-color); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.7; }
  .chart text.yaxis { text-anchor: end; }
  .legend i.dash { background: none; border-top: 2px dashed var(--primary-text-color); height: 0; width: 14px; opacity: 0.7; vertical-align: 3px; }
  .growth-latest { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .growth-latest > div { border-radius: 12px; padding: 12px; background: var(--secondary-background-color); }
  .growth-latest .label { display: flex; align-items: center; gap: 6px; color: var(--secondary-text-color); font-size: 0.9em; }
  .growth-latest .value { font-size: 1.4em; font-weight: 500; }
  .chart svg.growth-chart { max-height: 200px; }
  .chart circle.point { fill: var(--accent); }
  .chart polyline.series { fill: none; stroke: var(--accent); stroke-width: 1.5; }
  .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; align-items: end; margin-top: 12px;
    padding: 12px; border-radius: 12px; background: var(--secondary-background-color); }
  .form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.8em; color: var(--secondary-text-color); }
  .form input { min-width: 0; padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color);
    color: var(--primary-text-color); font: inherit; font-size: 1rem; }
  .form .pair { display: flex; gap: 4px; }
  .form .pair input { flex: 1; }
  .form .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .form-toggle { margin-top: 12px; }
  .count { font-weight: 400; color: var(--secondary-text-color); font-size: 0.85em; margin-left: 6px; }
  .message.loading { min-height: 240px; }
  button.collapse { display: flex; align-items: center; gap: 4px; width: 100%; margin-top: 12px; padding: 6px 0; background: none;
    border: none; border-top: 1px solid var(--divider-color); color: var(--primary-text-color); font-weight: 500; text-align: left; }
  button.collapse ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
  .growth-list { margin-top: 2px; }
  .ms-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .ms-tools { display: flex; gap: 6px; }
  .ms-tools ha-icon, .form-toggle ha-icon { --mdc-icon-size: 18px; }
  .ms-timeline { list-style: none; margin: 0; padding: 0 0 0 4px; position: relative; }
  .ms-timeline::before { content: ""; position: absolute; left: 15px; top: 4px; bottom: 4px; width: 2px; background: var(--divider-color); }
  .ms-label { position: relative; padding: 10px 0 4px 32px; font-size: 0.75em; font-weight: 500; color: var(--secondary-text-color);
    text-transform: uppercase; letter-spacing: 0.04em; }
  .ms { position: relative; }
  .ms-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 4px 0; background: none; border: none;
    text-align: left; color: var(--primary-text-color); }
  .ms-dot { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; position: relative;
    background: var(--card-background-color); border: 2px solid var(--divider-color); color: var(--secondary-text-color); }
  .ms-dot ha-icon { --mdc-icon-size: 16px; }
  .ms.done .ms-dot { background: var(--success-color, #43a047); border-color: var(--success-color, #43a047); color: #fff; }
  .ms-name { flex: 1; min-width: 0; font-size: 0.92em; line-height: 1.25; }
  .ms-when { flex: none; max-width: 45%; font-size: 0.78em; color: var(--secondary-text-color); text-align: right; }
  .ms-row .chevron { --mdc-icon-size: 18px; color: var(--secondary-text-color); flex: none; }
  .ms.open .ms-row .ms-name { font-weight: 500; }
  .ms-details { margin: 0 0 8px 34px; padding: 8px 10px; border-radius: 10px; background: var(--secondary-background-color);
    font-size: 0.85em; display: grid; gap: 4px; }
  .ms-details .form { margin-top: 4px; }
  .ms-more { border-top: none; margin-top: 4px; font-weight: 400; color: var(--primary-color); }
  dialog.ms-dialog { width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 32px); padding: 0; border: none; border-radius: 16px;
    background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); }
  dialog.ms-dialog::backdrop { background: rgba(0, 0, 0, 0.4); }
  .dlg { display: grid; gap: 10px; padding: 16px; font-family: var(--paper-font-body1_-_font-family, inherit); }
  .dlg-title { font-size: 1.15em; font-weight: 500; }
  .dlg label { display: flex; flex-direction: column; gap: 4px; font-size: 0.8em; color: var(--secondary-text-color); }
  .dlg input { padding: 8px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color);
    color: var(--primary-text-color); font: inherit; font-size: 1rem; min-width: 0; }
  .dlg-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .dlg small { color: var(--secondary-text-color); margin-top: -4px; }
  .dlg-actions { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
  .dlg button[disabled] { opacity: 0.5; cursor: default; }
  .suggestions { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .suggestions:empty { display: none; }
  .suggestion { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border-radius: 10px; text-align: left;
    background: var(--secondary-background-color); border: 1px solid transparent; color: var(--primary-text-color); }
  .suggestion:hover, .suggestion:focus-visible { border-color: var(--primary-color); }
  .suggestion ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: none; }
  .suggestion.done ha-icon { color: var(--success-color, #43a047); }
  .log { list-style: none; margin: 0; padding: 0; }
  .log li { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--divider-color); }
  .log li.day { border: none; padding-top: 10px; font-size: 0.8em; font-weight: 500; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.04em; }
  .log .text { flex: 1; }
  .log .time { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  button.icon { background: none; padding: 4px; border-radius: 50%; color: var(--secondary-text-color); display: inline-flex; }
  button.icon:hover { background: var(--secondary-background-color); color: var(--error-color, #db4437); }
`;

/** The options the editor's part and button lists are built from. */
const listsKey = (config) =>
  JSON.stringify([config.parts, config.buttons, ...["summary", "trends", "nights", "timeline", "log"].map((p) => config[`show_${p}`])]);

class BabyTrackerCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    // Keep the order of hidden parts / buttons while editing, unless the config
    // was changed somewhere else (e.g. in the YAML editor).
    const key = listsKey(config);
    if (key !== this._listsKey) {
      this._listsKey = key;
      this._parts = this._initialParts();
      this._buttons = this._initialButtons();
    }
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      hass
        .callWS({ type: `${DOMAIN}/babies` })
        .then((babies) => {
          this._babies = babies;
          this._render();
        })
        .catch(() => {});
    }
  }

  /** Every part, shown ones first in their order, then the hidden ones. */
  _initialParts() {
    const { parts } = this._config;
    // A written list as-is (an undo banner the card adds itself shows as hidden);
    // otherwise what the card shows today from the show_* flags.
    const shown = Array.isArray(parts)
      ? partEntries(parts)
      : resolveParts({ ...this._config, parts: undefined });
    return [...shown.map((part) => ({ part, on: true })), ...PARTS.filter((p) => !shown.includes(p)).map((part) => ({ part, on: false }))];
  }

  /** Every button action, shown ones first in their order, then the hidden ones. */
  _initialButtons() {
    const raw = Array.isArray(this._config.buttons) ? this._config.buttons : DEFAULT_BUTTONS;
    const byAction = new Map();
    for (const entry of raw) {
      const item = buttonEntry(entry);
      if (item && !byAction.has(item.action)) byAction.set(item.action, item);
    }
    const shown = [...byAction.values()].map((item) => ({ ...item, on: true }));
    const hidden = DEFAULT_BUTTONS.filter((a) => !byAction.has(a)).map((action) => ({ action, on: false }));
    return [...shown, ...hidden];
  }

  _changed(key, value) {
    // Configs written by the editor always have an explicit part list.
    const config = { ...this._config, parts: this._parts.filter((p) => p.on).map((p) => p.part) };
    if (value === "" || value === undefined || value === DEFAULTS[key]) delete config[key];
    else config[key] = value;
    this._fire(config);
  }

  _fire(config) {
    this._config = config;
    this._listsKey = listsKey(config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  /** Write the part list (and the button list when it was edited) to the config. */
  _writeLists(includeButtons) {
    const config = { ...this._config, parts: this._parts.filter((p) => p.on).map((p) => p.part) };
    if (includeButtons) {
      config.buttons = this._buttons
        .filter((b) => b.on)
        .map(({ on, ...item }) => {
          const out = { action: item.action };
          for (const field of ["name", "icon", "color", "columns"]) {
            if (item[field] !== undefined && item[field] !== "") out[field] = item[field];
          }
          return out;
        });
    }
    this._fire(config);
    this._render();
  }

  _listRows(list, kind) {
    return list
      .map((item, index) => {
        const label = kind === "parts" ? PART_LABELS[item.part] : BUTTON_ACTIONS[item.action].name + ` (${item.action})`;
        const fields =
          kind === "buttons"
            ? `<div class="fields">
                <input type="text" placeholder="Name" data-list="buttons" data-index="${index}" data-field="name" value="${esc(item.name ?? "")}">
                <input type="text" placeholder="${esc(BUTTON_ACTIONS[item.action].icon)}" data-list="buttons" data-index="${index}" data-field="icon" value="${esc(item.icon ?? "")}">
                <input type="text" placeholder="${esc(BUTTON_ACTIONS[item.action].color)}" data-list="buttons" data-index="${index}" data-field="color" value="${esc(item.color ?? "")}">
              </div>`
            : "";
        return `<div class="row${item.on ? "" : " off"}">
            <label><input type="checkbox" data-list="${kind}" data-index="${index}" data-op="toggle" ${item.on ? "checked" : ""}> ${esc(label)}</label>
            <span class="arrows">
              <button type="button" title="Move up" data-list="${kind}" data-index="${index}" data-op="up" ${index === 0 ? "disabled" : ""}>▲</button>
              <button type="button" title="Move down" data-list="${kind}" data-index="${index}" data-op="down" ${index === list.length - 1 ? "disabled" : ""}>▼</button>
            </span>
            ${fields}
          </div>`;
      })
      .join("");
  }

  _render() {
    if (!this._config) return;
    const c = { ...DEFAULTS, ...this._config };
    const babies = this._babies || [];
    const options = [`<option value="">First baby</option>`]
      .concat(babies.map((b) => `<option value="${esc(b.entry_id)}" ${b.entry_id === c.entry_id ? "selected" : ""}>${esc(b.name)}</option>`))
      .join("");
    this.innerHTML = `
      <style>
        .bt-editor { display: grid; gap: 12px; padding: 8px 0; }
        .bt-editor label { display: flex; align-items: center; gap: 8px; }
        .bt-editor select, .bt-editor input[type=number], .bt-editor input[type=time], .bt-editor input[type=text] { padding: 6px; font: inherit; }
        .bt-editor small { color: var(--secondary-text-color); margin-top: -8px; }
        .bt-editor h3 { margin: 8px 0 0; font-size: 1em; font-weight: 500; }
        .bt-editor .list { display: grid; gap: 4px; }
        .bt-editor .row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 8px; padding: 4px 8px; border-radius: 8px; background: var(--secondary-background-color); }
        .bt-editor .row.off { opacity: 0.6; }
        .bt-editor .arrows button { font: inherit; padding: 2px 8px; cursor: pointer; }
        .bt-editor .fields { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
        .bt-editor .fields input { min-width: 0; }
      </style>
      <div class="bt-editor">
        <label>Baby <select data-key="entry_id">${options}</select></label>
        <h3>Parts</h3>
        <div class="list">${this._listRows(this._parts, "parts")}</div>
        <small>Hidden undo banner: it still appears above the first buttons / tiles part when an action can be undone, unless the quick buttons have an Undo button.</small>
        <h3>Quick buttons</h3>
        <div class="list">${this._listRows(this._buttons, "buttons")}</div>
        <small>Name, icon and colour are optional. Colours can be Home Assistant names (e.g. light-blue) or CSS colours.</small>
        <label>Buttons per row <input type="number" min="1" max="12" data-key="buttons_columns" value="${esc(c.buttons_columns ?? 3)}"></label>
        <h3>Options</h3>
        <label>Timeline days <input type="number" min="1" max="${TIMELINE_MAX_DAYS}" data-key="timeline_days" value="${esc(c.timeline_days)}"></label>
        <label>Days per timeline line <select data-key="timeline_group" data-number>
          ${[1, 3, 7, 14, 30]
            .concat([1, 3, 7, 14, 30].includes(Number(c.timeline_group)) ? [] : [Number(c.timeline_group)])
            .map((n) => `<option value="${n}" ${Number(c.timeline_group) === n ? "selected" : ""}>${n === 1 ? "Every day" : `Average of ${n} days`}</option>`)
            .join("")}
        </select></label>
        <label>Timeline lines start at <select data-key="timeline_start_hour" data-number>
          ${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${Number(c.timeline_start_hour) === h ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("")}
        </select></label>
        <label>Nights shown <input type="number" min="1" max="${NIGHTS_MAX}" data-key="night_days" value="${esc(c.night_days)}"></label>
        <label>Night from <input type="time" data-key="night_start" value="${esc(c.night_start)}"> to <input type="time" data-key="night_end" value="${esc(c.night_end)}"></label>
        <small>Leave the night times empty to use the integration's Night starts / Night ends settings.</small>
        <label>Log entries <input type="number" min="1" max="100" data-key="log_entries" value="${esc(c.log_entries)}"></label>
        <label>Growth units <select data-key="units">
          <option value="metric" ${c.units === "imperial" ? "" : "selected"}>Metric (kg, cm)</option>
          <option value="imperial" ${c.units === "imperial" ? "selected" : ""}>Imperial (lb + oz, in)</option>
        </select></label>
        <label>Measurements listed under the growth charts <input type="number" min="0" max="100" data-key="growth_entries" value="${esc(c.growth_entries)}"></label>
        <label>Measurement list <select data-key="growth_list">
          <option value="collapsed" ${c.growth_list === "expanded" ? "" : "selected"}>Collapsed</option>
          <option value="expanded" ${c.growth_list === "expanded" ? "selected" : ""}>Expanded</option>
        </select></label>
        <label>Days of history <input type="number" min="1" max="31" data-key="days" value="${esc(c.days)}"></label>
      </div>`;
    this.querySelectorAll("[data-key]").forEach((el) => {
      el.addEventListener("change", (ev) => {
        const key = ev.target.dataset.key;
        let value = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
        if (ev.target.type === "number" || "number" in ev.target.dataset) value = value === "" ? "" : Number(value);
        if (key === "buttons_columns" && value === 3) value = "";
        this._changed(key, value);
      });
    });
    this.querySelectorAll("[data-list][data-op]").forEach((el) => {
      el.addEventListener(el.type === "checkbox" ? "change" : "click", (ev) => {
        const { list, op } = ev.currentTarget.dataset;
        const index = Number(ev.currentTarget.dataset.index);
        const items = this[`_${list}`];
        if (op === "toggle") items[index] = { ...items[index], on: ev.currentTarget.checked };
        else {
          const to = op === "up" ? index - 1 : index + 1;
          if (to < 0 || to >= items.length) return;
          [items[index], items[to]] = [items[to], items[index]];
        }
        this._writeLists(list === "buttons");
      });
    });
    this.querySelectorAll("[data-list][data-field]").forEach((el) => {
      el.addEventListener("change", (ev) => {
        const index = Number(ev.target.dataset.index);
        this._buttons[index] = { ...this._buttons[index], [ev.target.dataset.field]: ev.target.value.trim() };
        this._writeLists(true);
      });
    });
  }
}

if (!customElements.get("baby-logger-card")) {
  customElements.define("baby-logger-card", BabyTrackerCard);
  customElements.define("baby-logger-card-editor", BabyTrackerCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "baby-logger-card",
    name: "Baby Tracker",
    description: "Log diapers, feedings and sleep, with trends and a log.",
    preview: false,
    documentationURL: "https://github.com/Emilhaurum/baby-tracker",
  });
  console.info(`%c BABY-LOGGER-CARD %c ${CARD_VERSION} `, "color:#fff;background:#5c6bc0;font-weight:700", "color:#5c6bc0");
}

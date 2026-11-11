/*
 * Baby Tracker card for Home Assistant.
 * Served by the baby_tracker integration; no manual resource setup needed.
 *
 *   type: custom:baby-tracker-card
 *   entry_id: <optional, defaults to the first baby>
 *   show_summary: true
 *   show_trends: true
 *   show_log: true
 *   log_entries: 10
 *   days: 7
 */

const CARD_VERSION = "1.0.0";
const DOMAIN = "baby_tracker";

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
};

const DEFAULTS = {
  show_summary: true,
  show_trends: true,
  show_log: true,
  log_entries: 10,
  days: 7,
};

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
    this._bottleOpen = false;
    this._bottleAmount = "";
    // Bumped whenever a subscription is dropped, so stale in-flight ones are discarded.
    this._generation = 0;
    this._retryAt = 0;
  }

  static getConfigElement() {
    return document.createElement("baby-tracker-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    const changed = this._config && (this._config.entry_id !== config.entry_id || this._config.days !== config.days);
    this._config = { ...DEFAULTS, ...config };
    if (changed) this._resubscribe();
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
    try {
      let entryId = this._config.entry_id;
      if (!entryId) {
        const babies = await this._hass.callWS({ type: `${DOMAIN}/babies` });
        if (!babies.length) throw new Error("No baby has been added yet. Add the Baby Tracker integration first.");
        entryId = babies[0].entry_id;
      }
      if (generation !== this._generation) return;
      const unsub = await this._hass.connection.subscribeMessage(
        (data) => {
          if (generation !== this._generation) return;
          this._data = data;
          this._error = null;
          this._render();
        },
        { type: `${DOMAIN}/subscribe`, entry_id: entryId, days: Number(this._config.days) || 7 }
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
      this._render();
    } finally {
      if (generation === this._generation) this._subscribing = false;
    }
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
    this._retryAt = 0;
    this._subscribe();
  }

  async _call(service, data = {}) {
    try {
      await this._hass.callService(DOMAIN, service, { config_entry_id: this._entryId, ...data });
    } catch (err) {
      this.dispatchEvent(
        new CustomEvent("hass-notification", {
          detail: { message: err && err.message ? err.message : String(err) },
          bubbles: true,
          composed: true,
        })
      );
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
    const undo = root.querySelector("[data-undo-expires]");
    if (undo) {
      const left = Math.round((new Date(undo.dataset.undoExpires) - now) / 1000);
      undo.textContent = left > 0 ? `${left}s` : "";
    }
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
          this._bottleOpen = !this._bottleOpen;
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

  _render() {
    if (!this.shadowRoot || !this._config) return;
    // Keep focus and caret in the bottle amount field across re-renders.
    const active = this.shadowRoot.activeElement;
    const keepFocus = active && active.id === "bottle-amount";
    const caret = keepFocus ? [active.selectionStart, active.selectionEnd] : null;
    let body;
    if (this._error) {
      body = `<div class="message error">${esc(this._error)}</div>`;
    } else if (!this._data) {
      body = `<div class="message">Loading…</div>`;
    } else {
      body = this._renderData(this._data);
    }
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card>${body}</ha-card>`;
    this.shadowRoot.querySelector("ha-card").addEventListener("click", (ev) => this._handleClick(ev));
    const amount = this.shadowRoot.querySelector("#bottle-amount");
    if (amount) {
      amount.value = this._bottleAmount;
      amount.addEventListener("input", (ev) => {
        this._bottleAmount = ev.target.value;
      });
      amount.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") this.shadowRoot.querySelector('[data-action="bottle-log"]').click();
      });
      if (keepFocus) {
        amount.focus();
        try {
          amount.setSelectionRange(caret[0], caret[1]);
        } catch (_err) {
          // number inputs don't support selection ranges in every browser
        }
      }
    }
  }

  _renderData(d) {
    const cfg = this._config;
    const now = new Date();
    const lastDiaper = d.last_diaper;
    const lastFeeding = d.last_feeding;
    const since = (iso) => (iso ? `<span data-since="${esc(iso)}">${formatDuration(now - new Date(iso))}</span>` : "–");

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
        const active = key === "bottle" && this._bottleOpen ? " active" : "";
        return `<button class="action${next}${active}" style="--accent:${v.color}" data-action="feed" data-value="${key}"><ha-icon icon="${v.icon}"></ha-icon>${v.label}${next ? '<span class="badge">next</span>' : ""}</button>`;
      })
      .join("");
    const bottleForm = this._bottleOpen
      ? `<div class="bottle"><input id="bottle-amount" type="number" inputmode="numeric" min="0" step="5" placeholder="Amount (ml, optional)"><button class="small primary" data-action="bottle-log">Log bottle</button><button class="small" data-action="bottle-cancel">Cancel</button></div>`
      : "";

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

    const undo = d.undo
      ? `<div class="undo"><ha-icon icon="mdi:check-circle"></ha-icon><span>${esc(UNDO_LABELS[d.undo.action] || "Saved")}</span>
          <span class="countdown" data-undo-expires="${esc(d.undo.expires)}">${Math.max(0, Math.round((new Date(d.undo.expires) - now) / 1000))}s</span>
          <button class="small" data-action="undo"><ha-icon icon="mdi:undo-variant"></ha-icon>Undo</button></div>`
      : "";

    let html = `
      <div class="header">
        <div class="name"><ha-icon icon="mdi:baby-face-outline"></ha-icon>${esc(d.name)}</div>
        <div class="chips">
          <span class="chip">${plural(d.today.diapers.total, "diaper", "diapers")}</span>
          <span class="chip">${plural(d.today.feedings.total, "feeding", "feedings")}</span>
          ${d.today.bottle_ml ? `<span class="chip">${Math.round(d.today.bottle_ml)} ml</span>` : ""}
        </div>
      </div>
      ${undo}
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
          ${bottleForm}
        </div>
        ${sleepTile}
      </div>`;

    if (cfg.show_summary) {
      const n = d.last_night || {};
      const day = d.daytime || {};
      html += `
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

    if (cfg.show_trends) {
      const buckets = dailyTrends(d.events || [], Number(cfg.days) || 7, now, d.sleep_start);
      html += `
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

    if (cfg.show_log) {
      const entries = [...(d.events || [])]
        .sort((a, b) => new Date(b.end || b.start) - new Date(a.end || a.start))
        .slice(0, Number(cfg.log_entries) || 10);
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
      html += `
        <div class="section">
          <div class="section-title">Log</div>
          ${rows ? `<ul class="log">${rows}</ul>` : `<div class="message">Nothing logged yet.</div>`}
        </div>`;
    }
    return html;
  }
}

const STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; overflow: hidden; container: bt-card / inline-size; }
  ha-icon { --mdc-icon-size: 18px; }
  .message { padding: 8px 0; color: var(--secondary-text-color); }
  .message.error { color: var(--error-color, #db4437); }
  .header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
  .name { display: flex; align-items: center; gap: 8px; font-size: 1.3em; font-weight: 500; }
  .name ha-icon { --mdc-icon-size: 26px; color: var(--primary-color); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 2px 10px; border-radius: 12px; font-size: 0.85em; background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .tiles { display: grid; grid-template-columns: 1fr; gap: 12px; }
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
  .undo { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 12px; border-radius: 10px;
    background: color-mix(in srgb, var(--success-color, #43a047) 15%, var(--card-background-color)); }
  .undo > ha-icon { color: var(--success-color, #43a047); }
  .undo span:first-of-type { flex: 1; }
  .countdown { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; font-size: 0.85em; }
  .section { margin-top: 16px; }
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
  .log { list-style: none; margin: 0; padding: 0; }
  .log li { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--divider-color); }
  .log li.day { border: none; padding-top: 10px; font-size: 0.8em; font-weight: 500; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.04em; }
  .log .text { flex: 1; }
  .log .time { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  button.icon { background: none; padding: 4px; border-radius: 50%; color: var(--secondary-text-color); display: inline-flex; }
  button.icon:hover { background: var(--secondary-background-color); color: var(--error-color, #db4437); }
`;

class BabyTrackerCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
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

  _changed(key, value) {
    const config = { ...this._config };
    if (value === "" || value === undefined || value === DEFAULTS[key]) delete config[key];
    else config[key] = value;
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _render() {
    if (!this._config) return;
    const c = { ...DEFAULTS, ...this._config };
    const babies = this._babies || [];
    const options = [`<option value="">First baby</option>`]
      .concat(babies.map((b) => `<option value="${esc(b.entry_id)}" ${b.entry_id === c.entry_id ? "selected" : ""}>${esc(b.name)}</option>`))
      .join("");
    const check = (key, label) =>
      `<label><input type="checkbox" data-key="${key}" ${c[key] ? "checked" : ""}> ${label}</label>`;
    this.innerHTML = `
      <style>
        .bt-editor { display: grid; gap: 12px; padding: 8px 0; }
        .bt-editor label { display: flex; align-items: center; gap: 8px; }
        .bt-editor select, .bt-editor input[type=number] { padding: 6px; font: inherit; }
      </style>
      <div class="bt-editor">
        <label>Baby <select data-key="entry_id">${options}</select></label>
        ${check("show_summary", "Show night / daytime summary")}
        ${check("show_trends", "Show trends")}
        ${check("show_log", "Show log")}
        <label>Log entries <input type="number" min="1" max="100" data-key="log_entries" value="${esc(c.log_entries)}"></label>
        <label>Days of history <input type="number" min="1" max="31" data-key="days" value="${esc(c.days)}"></label>
      </div>`;
    this.querySelectorAll("[data-key]").forEach((el) => {
      el.addEventListener("change", (ev) => {
        const key = ev.target.dataset.key;
        let value = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
        if (ev.target.type === "number") value = value === "" ? "" : Number(value);
        this._changed(key, value);
      });
    });
  }
}

if (!customElements.get("baby-tracker-card")) {
  customElements.define("baby-tracker-card", BabyTrackerCard);
  customElements.define("baby-tracker-card-editor", BabyTrackerCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "baby-tracker-card",
    name: "Baby Tracker",
    description: "Log diapers, feedings and sleep, with trends and a log.",
    preview: false,
    documentationURL: "https://github.com/Emilhaurum/baby-tracker",
  });
  console.info(`%c BABY-TRACKER-CARD %c ${CARD_VERSION} `, "color:#fff;background:#5c6bc0;font-weight:700", "color:#5c6bc0");
}

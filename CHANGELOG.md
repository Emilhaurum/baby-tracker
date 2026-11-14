# Changelog

## 1.2.0

- Actions reject times in the future (`time`, `start`, `end`, and moving a sleep in the
  calendar), so a mistyped time can no longer count as today, hide from the card's log or
  leave the baby stuck sleeping (#16).
- Two babies can no longer get the same name through Reconfigure; adding or renaming a baby
  to a taken name shows an error on the form so it can be corrected (#18).
- A side logged afterwards for a time just before a feeding is merged into that feeding
  as its first side (#19).
- Docs: `parts` lists `growth` and `milestones`; growth and milestone date descriptions
  fixed (#21).
- Docs: why Home Assistant 2026.11 is the minimum. Older releases usually show *Custom
  element doesn't exist* instead of the card (#20).
- Milestones: shown as a timeline (reached ones in order, then the next few) instead of the
  full board; tap one to expand it, or expand all at once (#11).
- Milestones: **Add** opens a window that suggests similar milestones as you type; built-in
  milestones have tags (e.g. "walking", "teething"), and accents and small typos are ignored
  (#12).
- Milestones: no more "x of y reached" count (#13).
- `set_milestone` keeps the current note when no `note` is given, so changing a date no
  longer removes it.
- Growth: the measurement list can be collapsed; new `growth_list` option (#14).
- Card: a dashboard that Home Assistant builds again (e.g. when the app resumes) no longer
  jumps back to the top; the card shows its last data straight away (#15).
- Card: updates no longer scroll the page back to a focused form field or close an open date
  picker (#17).

## 1.1.0

- Card: new `parts` option to choose which parts the card shows and in which order
  (`header`, `tiles`, `buttons`, `undo`, `summary`, `trends`, `nights`, `timeline`, `log`).
  Cards without it look exactly as before.
- Card: new `buttons` part with compact one-tap quick buttons (sleep, diapers, feedings,
  undo), configurable with `buttons` (action, name, icon, colour, width) and
  `buttons_columns`.
- Card editor: tick and reorder the parts and the quick buttons, and set a button's name,
  icon and colour.
- Growth: log weight and length (`log_growth`, `delete_growth`), kept for years; new
  `growth` card part with charts over the baby's age, a form to add measurements and a
  history list; metric or imperial (`units` card option); `weight` and `length` sensors.
- Milestones: 31 built-in milestones with typical ages (CDC checklists and common firsts)
  plus your own (`set_milestone`, `clear_milestone`, `add_milestone`,
  `delete_milestone`); new `milestones` card part.
- Optional birth date for each baby (setup and Reconfigure), used to show ages.

## 1.0.1

- Add the `health_wellbeing` category to the integration manifest (used by Home Assistant
  and HACS for browsing; removes the HACS validation warning).

## 1.0.0

First release.

- Config flow: one entry per baby; rename with *Reconfigure*.
- Diapers (wet, dirty, both), feedings (left, right, bottle with optional amount) with
  a configurable same-feeding window, and sleep with an editable sleep calendar.
- Sensors for the last diaper and feeding, today's totals, next breast, sleep today,
  last night and daytime sleep with 7-day averages.
- Buttons, a sleeping switch, and settings for the feeding window and night hours.
- Actions to log after the fact, add sleeps, undo (30 seconds) and delete entries.
- Bundled dashboard card with quick actions, summary, 7-day trends and an editable log.
- Sleep timeline in the card: one line per day showing sleep and awake periods, with a
  configurable number of days, days per line (every day or averages) and start hour.
- Night sleep chart in the card: hours asleep and awake within the night per night,
  with averages and wake-ups; the night window follows the integration's setting or
  can be set per card.
- Logbook entries and `baby_logger_event` events.

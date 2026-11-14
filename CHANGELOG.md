# Changelog

## Unreleased

- Docs: why Home Assistant 2026.11 is the minimum. Older releases often show *Custom
  element doesn't exist* instead of the card (#20).

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

# Baby Tracker for Home Assistant

[![HACS](https://img.shields.io/badge/HACS-Integration-41BDF5.svg)](https://hacs.xyz)
[![Validate](https://github.com/Emilhaurum/baby-tracker/actions/workflows/validate.yml/badge.svg)](https://github.com/Emilhaurum/baby-tracker/actions/workflows/validate.yml)
[![Release](https://img.shields.io/github/v/release/Emilhaurum/baby-tracker)](https://github.com/Emilhaurum/baby-tracker/releases)

Track diaper changes, feedings and sleep from Home Assistant: one tap on a dashboard,
a button on your phone's home screen, a watch, a voice assistant or an automation.
Everything is stored locally in Home Assistant.

| Light | Dark |
| --- | --- |
| ![Baby Tracker card, light theme](docs/card-light.png) | ![Baby Tracker card, dark theme](docs/card-dark.png) |

## Features

- **Diapers**: wet, dirty or both, with a count for today.
- **Feedings**: left, right or bottle (with an optional amount in ml). Entries logged
  within the *same feeding window* (45 minutes by default) of the previous one count as
  a side switch in the same feeding, so a feeding can be *Left → Right → Left*. The
  next breast to start with is suggested.
- **Sleep**: tap when the baby falls asleep and when they wake up. Sleeps are kept in an
  editable calendar, so you can add, move or delete them afterwards.
- **Night and daytime sleep**: hours asleep, wake-ups and naps for the last night and
  today, with 7-day averages. You choose when the night starts and ends.
- **Undo**: every action can be undone for 30 seconds.
- **Sleep timeline**: a waterfall chart with one line per day showing when the baby
  slept and was awake. Show as many days as you like, and either every day or an
  average over several days per line (e.g. weekly), which shades each time of day by
  how often the baby is asleep then.
- **Night sleep chart**: hours asleep and awake within the night for each night, with
  the average and wake-ups per night. The night window is the integration's *Night
  starts* / *Night ends* setting, or one you set on the card.
- **Dashboard card** with quick actions, a summary, 7-day trends, night sleep, the
  sleep timeline and an editable log.
  It is served by the integration, so there is nothing else to install.
- **Several babies**: add the integration once per baby.
- Logbook entries and a `baby_tracker_event` event for every action, for use in automations.

## Installation

### HACS (recommended)

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Emilhaurum&repository=baby-tracker&category=integration)

1. In HACS, search for **Baby Tracker** and download it.
   If it isn't listed yet, add `https://github.com/Emilhaurum/baby-tracker` as a
   [custom repository](https://hacs.xyz/docs/faq/custom_repositories/) of type *Integration*.
2. Restart Home Assistant.

### Manual

1. Download `baby_tracker.zip` from the [latest release](https://github.com/Emilhaurum/baby-tracker/releases/latest).
2. Extract it into `config/custom_components/baby_tracker/`.
3. Restart Home Assistant.

Requires Home Assistant 2026.11 or newer.

## Setup

[![Open your Home Assistant instance and start setting up Baby Tracker.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=baby_tracker)

Go to **Settings → Devices & services → Add integration → Baby Tracker** and enter the
baby's name. Repeat for each baby. To rename a baby later, choose **Reconfigure** on the
integration entry.

## Dashboard card

Edit a dashboard, add a card and pick **Baby Tracker**, or add it in YAML:

```yaml
type: custom:baby-tracker-card
```

| Option | Default | Description |
| --- | --- | --- |
| `entry_id` | first baby | Which baby to show. The visual editor lets you pick by name. |
| `show_summary` | `true` | Show last night and daytime sleep. |
| `show_trends` | `true` | Show the diaper, feeding and sleep charts. |
| `show_nights` | `true` | Show the night sleep chart. |
| `night_days` | `14` | Nights in the night sleep chart (up to 366). |
| `night_start` / `night_end` | integration's setting | Night window for the chart, e.g. `"20:00"` and `"06:00"`. Leave out to use the *Night starts* / *Night ends* settings of the baby. |
| `show_timeline` | `true` | Show the sleep timeline. |
| `timeline_days` | `14` | Days covered by the sleep timeline (up to 1098). |
| `timeline_group` | `1` | Days per timeline line: `1` shows every day, a larger number (e.g. `7`) averages that many days per line. |
| `timeline_start_hour` | `0` | Hour each timeline line starts at. Use e.g. `18` to keep each night on one line. |
| `show_log` | `true` | Show the latest entries, each with a delete button. |
| `log_entries` | `10` | Number of entries in the log. |
| `days` | `7` | Days shown in the charts (1–31). |

Bottle feeds ask for an optional amount. Tap the ✕ next to a log entry to delete it.

A card with the last 30 nights, counting the night as 20:00–06:00:

```yaml
type: custom:baby-tracker-card
show_trends: false
show_timeline: false
show_log: false
night_days: 30
night_start: "20:00"
night_end: "06:00"
```

![Night sleep chart](docs/night-sleep.png)

A card showing four weeks of sleep as weekly averages, with lines running from 18:00 to
18:00 so nights aren't split at midnight:

```yaml
type: custom:baby-tracker-card
show_trends: false
show_log: false
timeline_days: 28
timeline_group: 7
timeline_start_hour: 18
```

![Sleep timeline with weekly averages](docs/timeline-weekly.png)

## Entities

Each baby gets a device with these entities (shown here for a baby called *Alex*):

| Entity | Description |
| --- | --- |
| `sensor.alex_last_diaper` | Time of the last diaper (attribute `type`). |
| `sensor.alex_last_diaper_type` | `wet`, `dirty` or `both`. |
| `sensor.alex_diapers_today` | Diapers since midnight (attributes per type). |
| `sensor.alex_last_feeding` | Start of the last feeding (attributes `side`, `sides`, `amount_ml`, `last_switch`). |
| `sensor.alex_last_feeding_side` | Latest side: `left`, `right` or `bottle`. |
| `sensor.alex_next_feeding_side` | Which breast to start with next. |
| `sensor.alex_feedings_today` | Feedings since midnight (attributes per side). |
| `sensor.alex_bottle_today` | Bottle amount since midnight (ml). |
| `sensor.alex_sleep_today` | Hours slept since midnight, including the current sleep. |
| `sensor.alex_last_night_sleep` | Hours asleep last night, with wake-ups, awake time and 7-night averages. |
| `sensor.alex_daytime_sleep` | Hours asleep during today's daytime, with naps and 7-day averages. |
| `sensor.alex_last_woke_up` | When the baby last woke up. |
| `switch.alex_sleeping` | On while asleep. Turn it on or off to log sleep. |
| `button.alex_diaper_wet` / `_dirty` / `_wet_and_dirty` | Log a diaper. |
| `button.alex_feed_left` / `_right` / `_bottle` | Log a feeding. |
| `button.alex_undo_last_action` | Undo the latest action (available for 30 seconds). |
| `calendar.alex_sleep` | All sleeps. Create, move or delete events to correct them. |
| `number.alex_same_feeding_window` | Minutes within which entries are the same feeding. |
| `time.alex_night_starts` / `time.alex_night_ends` | The night window used for the sleep summary. |

The buttons work well as iOS/Android home screen widgets, on a watch, or with a voice
assistant ("press Feed left").

## Actions

All actions take the baby as `config_entry_id` (pick it in the UI). `time` is optional
and defaults to now, so you can log things after the fact.

| Action | Fields |
| --- | --- |
| `baby_tracker.log_diaper` | `type` (`wet`, `dirty`, `both`), `time` |
| `baby_tracker.log_feeding` | `side` (`left`, `right`, `bottle`), `amount_ml`, `time` |
| `baby_tracker.start_sleep` | `time` |
| `baby_tracker.end_sleep` | `time` |
| `baby_tracker.add_sleep` | `start`, `end` |
| `baby_tracker.undo` | |
| `baby_tracker.delete_event` | `event_id` |

The logging actions return the created entry. For example:

```yaml
action: baby_tracker.log_feeding
data:
  config_entry_id: 01JC0EXAMPLE
  side: bottle
  amount_ml: 90
```

### Automation example

Every action fires a `baby_tracker_event` with `config_entry_id`, `name`, `action`
(`diaper`, `feeding`, `sleep`, `wake`, `undo`, `delete`, `add_sleep`, `update_sleep`)
and details such as `type`, `side` or `minutes`.

```yaml
triggers:
  - trigger: event
    event_type: baby_tracker_event
    event_data:
      action: wake
actions:
  - action: notify.mobile_app_phone
    data:
      message: "{{ trigger.event.data.name }} woke up after {{ trigger.event.data.minutes }} minutes"
```

A reminder when it's been three hours since the last feeding:

```yaml
triggers:
  - trigger: template
    value_template: >
      {% set last = states('sensor.alex_last_feeding') | as_datetime(none) %}
      {{ last is not none and now() - last > timedelta(hours=3) }}
actions:
  - action: notify.mobile_app_phone
    data:
      message: "Time to feed Alex (next: {{ states('sensor.alex_next_feeding_side') }})"
```

## Data and privacy

Everything is stored in Home Assistant's `.storage` folder (`baby_tracker.<entry id>`) and
is included in Home Assistant backups. Removing a baby deletes its history. Nothing is
sent anywhere. Diagnostics leave out the baby's name.

## Development

```bash
python3.14 -m venv .venv && . .venv/bin/activate
pip install -r requirements_test.txt
pip install home-assistant-frontend   # same version Home Assistant pins
scripts/validate.sh          # lint, version check, card syntax, unit tests
scripts/validate.sh --e2e    # also runs the end-to-end test (needs HA 2026.11+ and Playwright)
```

Run this before pushing. GitHub Actions runs validation on pull requests, weekly
(against the latest Home Assistant) and before a release.

`tests/e2e/` holds an end-to-end test that runs against a real Home Assistant
instance and drives the card in Chromium with Playwright. CI runs it on pull requests
and releases, on the minimum supported and the latest Home Assistant release.

### Releasing

1. `python scripts/set_version.py 1.2.3` and commit to `main`.
2. Tag and push: `git tag v1.2.3 && git push origin v1.2.3`.

The release workflow checks that the tag matches the version in the manifest, card and
`pyproject.toml`, runs hassfest, HACS validation, linting, the tests and the end-to-end
tests, then publishes a GitHub release with `baby_tracker.zip` for HACS.

## License

[MIT](LICENSE)

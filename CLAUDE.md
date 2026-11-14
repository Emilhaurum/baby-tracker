# CLAUDE.md

Baby Tracker: a Home Assistant custom integration, published through HACS, for logging a
baby's diapers, feedings, sleep, growth and milestones. It comes with its own dashboard card.

- The domain is **`baby_logger`**, not `baby_tracker`, because another HACS integration
  already uses that domain. The display name is "Baby Tracker" and the repository is
  `baby-tracker`.
- Minimum Home Assistant is 2026.11.0 (`hacs.json`). Python is 3.14.
  - Don't lower the minimum without running the e2e test on a fresh instance several times.
    The Python code and unit tests also pass on 2026.2 and 2026.3, but on 2026.3 to 2026.10
    the dashboard usually shows "Custom element doesn't exist: baby-logger-card". The card
    is registered with `add_extra_js_url`, and those frontends don't pick it up when it
    loads after the dashboard (#20).
  - The unit tests run on the Home Assistant version that
    `pytest-homeassistant-custom-component` pins (see `requirements_test.txt`), which can
    lag behind the minimum. The e2e job covers the minimum and the latest release.
- The default branch is `main`.
- **Branches:** use logical, descriptive names that say what the branch is for, e.g.
  `feature/growth-tracking`, `fix/undo-banner-position` or `docs/readme-actions`. Use one
  branch per change.

## Layout

The integration lives in `custom_components/baby_logger/`:

| File | What it holds |
| --- | --- |
| `tracker.py` | `BabyTracker`, which holds all state and logic: events, sleeps, growth, milestones, undo and storage (a `Store` per config entry). It also checks dates with `_check_date`. Every change goes through `_changed()`, which saves, fires `baby_logger_event` and dispatches `baby_logger_update_{entry_id}`. |
| `stats.py` | Sleep statistics for night and daytime (DST safe). |
| `services.py`, `services.yaml` | Actions. Every action takes `config_entry_id`. |
| `websocket.py` | `baby_logger/subscribe` (a snapshot; `growth` / `milestones` are only included when the flags are set), `baby_logger/sleeps` and `baby_logger/babies`. |
| entity platforms | `sensor.py`, `button.py`, `switch.py`, `number.py`, `time.py`, `calendar.py`. |
| `milestones.py` | The built-in milestone catalogue. |
| `const.py` | Constants. |
| `logbook.py` | Logbook descriptions. |
| `diagnostics.py` | Diagnostics. |
| `translations/en.json` | All user-facing strings, including exception messages. |
| `icons.json` | Entity and action icons. |
| `brand/` | Integration icon and logo images. |
| `frontend/baby-logger-card.js` | The card (`custom:baby-logger-card`). |
| `frontend.py` | Serves the card and registers it, so users need no manual resource. |

About the card:
- It has no dependencies and no build step: a plain web component with shadow DOM that
  renders with `innerHTML`.
- Pure functions are exported so they can be unit tested.
- Escape any user text with `esc()`.

Tests:
- `tests/*.py`: pytest with `pytest-homeassistant-custom-component`. Coverage must be at
  least 90%.
- `tests/js/`: unit tests for the card's exported functions (`node --test`, run with
  `TZ=Europe/Copenhagen` so DST is covered).
- `tests/card/`: browser tests of the card and editor in Playwright. They use a mocked
  `hass` from `harness.html`.
- `tests/e2e/`: the onboarding script `setup_instance.py` and the browser test `card.mjs`,
  both run against a real Home Assistant.

## Commands

```bash
scripts/validate.sh          # ruff, version check, card syntax + JS tests, browser tests, pytest
scripts/validate.sh --e2e    # also starts a real Home Assistant (`hass` on PATH) and runs tests/e2e
ruff format .                # line length 110
python scripts/set_version.py 1.2.3   # bump the version everywhere
```

- Run `scripts/validate.sh --e2e` before pushing.
- hassfest and HACS validation only run in CI (`.github/workflows/validate.yml`). That
  workflow runs on pull requests, weekly and from the release workflow, not on every push.

## Conventions

- **Cards without the new options must not change.** Without `parts`, the card must look
  exactly as before: the layout comes from the `show_*` flags. New card features are
  opt-in parts or options.
- **New actions:**
  - Raise `ServiceValidationError` with a `translation_key` (add the string to
    `translations/en.json`).
  - Make the change undoable with `_set_undo`.
  - Call `_changed()` and add a logbook message.
  - Document the action in `services.yaml`, the README and the changelog.
- **Storage:** values are stored in metric (kg, cm). Imperial is only for input and
  display.
- **Card state:** the card re-renders every minute and on each update. Keep form input in
  `this._*Form` (`data-form` / `data-field` inputs) so typing survives a re-render.
- **Version:** it must match in `manifest.json`, the card and `pyproject.toml` (use
  `scripts/set_version.py`). Add a `CHANGELOG.md` section for each release.
- **README:** keep it up to date. Every change to features, options, entities or actions
  updates the README in the same change, along with the changelog. Images use absolute `raw.githubusercontent.com` URLs so they also render in
  HACS. Screenshots are in `docs/`.

## Releasing

1. Bump the version and merge to `main`.
2. Run **Actions → Release → Run workflow** on `main` with the version, e.g. `1.2.3`.
   - The workflow validates everything, then creates the `v1.2.3` tag and a release with
     `baby_logger.zip` (`hacs.json` has `zip_release`).
   - Pushing a `v1.2.3` tag works too.

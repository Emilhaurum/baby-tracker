"""Constants for the Baby Tracker integration."""

from __future__ import annotations

from datetime import time
from typing import Final

DOMAIN: Final = "baby_logger"

STORAGE_VERSION: Final = 1
STORAGE_KEY_PREFIX: Final = DOMAIN

# Kinds of logged events.
KIND_DIAPER: Final = "diaper"
KIND_FEEDING: Final = "feeding"
KIND_SLEEP: Final = "sleep"
KINDS: Final = (KIND_DIAPER, KIND_FEEDING, KIND_SLEEP)

DIAPER_WET: Final = "wet"
DIAPER_DIRTY: Final = "dirty"
DIAPER_BOTH: Final = "both"
DIAPER_TYPES: Final = (DIAPER_WET, DIAPER_DIRTY, DIAPER_BOTH)

SIDE_LEFT: Final = "left"
SIDE_RIGHT: Final = "right"
SIDE_BOTTLE: Final = "bottle"
FEEDING_SIDES: Final = (SIDE_LEFT, SIDE_RIGHT, SIDE_BOTTLE)

# Settings (adjustable from number / time entities).
SETTING_MERGE_MINUTES: Final = "feeding_merge_minutes"
SETTING_NIGHT_START: Final = "night_start"
SETTING_NIGHT_END: Final = "night_end"

DEFAULT_MERGE_MINUTES: Final = 45
DEFAULT_NIGHT_START: Final = time(22, 0)
DEFAULT_NIGHT_END: Final = time(9, 0)
MAX_MERGE_MINUTES: Final = 120

# How long the latest action can be undone.
UNDO_SECONDS: Final = 30
# Sleeps shorter than this are treated as accidental taps and not recorded.
MIN_SLEEP_SECONDS: Final = 60
# Nights / days included in the night vs daytime sleep statistics.
STATS_DAYS: Final = 8
# Finished nights / days averaged in the statistics.
AVERAGE_OVER: Final = 7

# Fired on the bus for every logged action (usable in automations, shown in logbook).
EVENT_BABY_TRACKER: Final = f"{DOMAIN}_event"

ATTR_CONFIG_ENTRY_ID: Final = "config_entry_id"
ATTR_TYPE: Final = "type"
ATTR_SIDE: Final = "side"
ATTR_AMOUNT_ML: Final = "amount_ml"
ATTR_TIME: Final = "time"
ATTR_START: Final = "start"
ATTR_END: Final = "end"
ATTR_EVENT_ID: Final = "event_id"
ATTR_ACTION: Final = "action"

SERVICE_LOG_DIAPER: Final = "log_diaper"
SERVICE_LOG_FEEDING: Final = "log_feeding"
SERVICE_START_SLEEP: Final = "start_sleep"
SERVICE_END_SLEEP: Final = "end_sleep"
SERVICE_ADD_SLEEP: Final = "add_sleep"
SERVICE_UNDO: Final = "undo"
SERVICE_DELETE_EVENT: Final = "delete_event"

FRONTEND_URL_BASE: Final = f"/{DOMAIN}_static"
CARD_FILENAME: Final = "baby-logger-card.js"

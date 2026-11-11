"""One-tap buttons for Baby Tracker (handy for widgets, watches and voice)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import BabyTrackerConfigEntry
from .const import DIAPER_TYPES, FEEDING_SIDES
from .entity import BabyTrackerEntity
from .tracker import BabyTracker

PARALLEL_UPDATES = 0


@dataclass(frozen=True, kw_only=True)
class BabyButtonDescription(ButtonEntityDescription):
    """Describes a Baby Tracker button."""

    press_fn: Callable[[BabyTracker], object]
    available_fn: Callable[[BabyTracker], bool] = lambda _: True


def _diaper(kind: str) -> BabyButtonDescription:
    return BabyButtonDescription(
        key=f"diaper_{kind}",
        translation_key=f"diaper_{kind}",
        press_fn=lambda t: t.async_log_diaper(kind),
    )


def _feed(side: str) -> BabyButtonDescription:
    return BabyButtonDescription(
        key=f"feed_{side}",
        translation_key=f"feed_{side}",
        press_fn=lambda t: t.async_log_feeding(side),
    )


BUTTONS: tuple[BabyButtonDescription, ...] = (
    *(_diaper(kind) for kind in DIAPER_TYPES),
    *(_feed(side) for side in FEEDING_SIDES),
    BabyButtonDescription(
        key="undo",
        translation_key="undo",
        press_fn=lambda t: t.async_undo(),
        available_fn=lambda t: t.undo_available,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: BabyTrackerConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the buttons."""
    async_add_entities(BabyButton(entry.runtime_data, d) for d in BUTTONS)


class BabyButton(BabyTrackerEntity, ButtonEntity):
    """A Baby Tracker button."""

    entity_description: BabyButtonDescription

    @property
    def available(self) -> bool:
        """Return if the button can be pressed."""
        return self.entity_description.available_fn(self.tracker)

    async def async_press(self) -> None:
        """Log the action."""
        self.entity_description.press_fn(self.tracker)

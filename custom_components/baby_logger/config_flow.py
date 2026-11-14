"""Config flow for Baby Tracker: one entry per baby."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_NAME
from homeassistant.helpers import selector
import voluptuous as vol

from .const import CONF_BIRTH_DATE, DOMAIN

SCHEMA = vol.Schema(
    {
        vol.Required(CONF_NAME): selector.TextSelector(),
        vol.Optional(CONF_BIRTH_DATE): selector.DateSelector(),
    }
)


def _entry_data(
    user_input: dict[str, Any], name: str, current: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Return the entry data with the name and birth date (removed when left empty)."""
    data: dict[str, Any] = {**(current or {}), CONF_NAME: name}
    data.pop(CONF_BIRTH_DATE, None)
    if birth_date := user_input.get(CONF_BIRTH_DATE):
        data[CONF_BIRTH_DATE] = birth_date
    return data


class BabyTrackerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add a baby."""

    VERSION = 1
    MINOR_VERSION = 1

    def _name_taken(self, name: str, exclude_entry_id: str | None = None) -> bool:
        """Return True when another baby already has this name (ignoring case)."""
        return any(
            entry.entry_id != exclude_entry_id and entry.title.casefold() == name.casefold()
            for entry in self._async_current_entries(include_ignore=False)
        )

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Ask for the baby's name and (optionally) birth date."""
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            if not name:
                errors[CONF_NAME] = "name_required"
            elif self._name_taken(name):
                errors[CONF_NAME] = "name_taken"
            else:
                return self.async_create_entry(title=name, data=_entry_data(user_input, name))
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(SCHEMA, user_input),
            errors=errors,
        )

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Rename a baby or change the birth date."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            if not name:
                errors[CONF_NAME] = "name_required"
            elif self._name_taken(name, entry.entry_id):
                errors[CONF_NAME] = "name_taken"
            else:
                return self.async_update_reload_and_abort(
                    entry, title=name, data=_entry_data(user_input, name, dict(entry.data))
                )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(
                SCHEMA,
                user_input or {CONF_NAME: entry.title, CONF_BIRTH_DATE: entry.data.get(CONF_BIRTH_DATE)},
            ),
            errors=errors,
        )

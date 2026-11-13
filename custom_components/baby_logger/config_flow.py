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


def _entry_data(user_input: dict[str, Any], name: str) -> dict[str, Any]:
    """Return the entry data: the name and, if given, the birth date."""
    data: dict[str, Any] = {CONF_NAME: name}
    if birth_date := user_input.get(CONF_BIRTH_DATE):
        data[CONF_BIRTH_DATE] = birth_date
    return data


class BabyTrackerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add a baby."""

    VERSION = 1
    MINOR_VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Ask for the baby's name and (optionally) birth date."""
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            if not name:
                errors[CONF_NAME] = "name_required"
            elif any(e.title.casefold() == name.casefold() for e in self._async_current_entries()):
                return self.async_abort(reason="already_configured")
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
            else:
                return self.async_update_reload_and_abort(
                    entry, title=name, data=_entry_data(user_input, name)
                )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(
                SCHEMA, {CONF_NAME: entry.title, CONF_BIRTH_DATE: entry.data.get(CONF_BIRTH_DATE)}
            ),
            errors=errors,
        )

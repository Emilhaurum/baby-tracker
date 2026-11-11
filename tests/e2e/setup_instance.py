"""End-to-end check against a running Home Assistant instance.

Onboards a fresh instance, adds a baby through the real config flow, exercises
the actions and stores a dashboard that uses the bundled card. Prints the auth
tokens as JSON so a browser test can log in.

    python tests/e2e/setup_instance.py http://localhost:8124
"""

from __future__ import annotations

import asyncio
import json
import sys

import aiohttp

USER = {"name": "Test", "username": "test", "password": "test-pass-123", "language": "en"}


async def wait_for(session: aiohttp.ClientSession, base: str) -> None:
    # The first start installs the requirements of default_config, which can be slow.
    for _ in range(600):
        try:
            async with session.get(f"{base}/api/onboarding") as resp:
                if resp.status == 200:
                    return
        except aiohttp.ClientError:
            pass
        await asyncio.sleep(1)
    raise TimeoutError("Home Assistant did not start")


async def main(base: str) -> None:
    client_id = f"{base}/"
    async with aiohttp.ClientSession() as session:
        await wait_for(session, base)
        async with session.post(
            f"{base}/api/onboarding/users", json={"client_id": client_id, **USER}
        ) as resp:
            assert resp.status == 200, await resp.text()
            code = (await resp.json())["auth_code"]
        async with session.post(
            f"{base}/auth/token",
            data={"grant_type": "authorization_code", "code": code, "client_id": client_id},
        ) as resp:
            tokens = await resp.json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        for step, body in (
            ("core_config", {}),
            ("analytics", {}),
            ("integration", {"client_id": client_id, "redirect_uri": f"{base}/?auth_callback=1"}),
        ):
            async with session.post(f"{base}/api/onboarding/{step}", json=body, headers=headers) as resp:
                assert resp.status == 200, (step, await resp.text())

        # Add the baby through the config flow.
        async with session.post(
            f"{base}/api/config/config_entries/flow", json={"handler": "baby_tracker"}, headers=headers
        ) as resp:
            flow = await resp.json()
            assert flow["type"] == "form", flow
        async with session.post(
            f"{base}/api/config/config_entries/flow/{flow['flow_id']}", json={"name": "Alex"}, headers=headers
        ) as resp:
            result = await resp.json()
            assert result["type"] == "create_entry", result
            entry_id = result["result"]["entry_id"]
        await asyncio.sleep(2)

        async def service(name: str, **data: object) -> dict:
            async with session.post(
                f"{base}/api/services/baby_tracker/{name}?return_response",
                json={"config_entry_id": entry_id, **data},
                headers=headers,
            ) as resp:
                assert resp.status == 200, (name, await resp.text())
                return await resp.json()

        async def state(entity_id: str) -> dict:
            async with session.get(f"{base}/api/states/{entity_id}", headers=headers) as resp:
                assert resp.status == 200, (entity_id, await resp.text())
                return await resp.json()

        await service("log_diaper", type="wet")
        await service("log_diaper", type="dirty")
        await service("log_feeding", side="left")
        merged = await service("log_feeding", side="right")
        assert merged["service_response"]["same_feeding"] is True, merged
        await service("add_sleep", start="2020-01-01 00:00:00", end="2020-01-01 01:00:00")
        await asyncio.sleep(1)

        assert (await state("sensor.alex_diapers_today"))["state"] == "2"
        assert (await state("sensor.alex_feedings_today"))["state"] == "1"
        assert (await state("sensor.alex_next_feeding_side"))["state"] == "left"
        assert (await state("sensor.alex_last_diaper_type"))["state"] == "dirty"
        assert (await state("switch.alex_sleeping"))["state"] == "off"
        assert (await state("button.alex_undo_last_action"))["state"] != "unavailable"

        # The card is loaded on every page without a manual resource.
        async with session.get(f"{base}/") as resp:
            html = await resp.text()
            assert "/baby_tracker_static/baby-tracker-card.js?v=" in html, "card not registered"

        # Store a dashboard using the card.
        async with session.ws_connect(f"{base}/api/websocket") as ws:
            await ws.receive_json()
            await ws.send_json({"type": "auth", "access_token": tokens["access_token"]})
            assert (await ws.receive_json())["type"] == "auth_ok"
            await ws.send_json(
                {
                    "id": 1,
                    "type": "lovelace/dashboards/create",
                    "url_path": "dashboard-baby",
                    "title": "Baby",
                    "icon": "mdi:baby-face-outline",
                    "mode": "storage",
                }
            )
            assert (await ws.receive_json())["success"]
            await ws.send_json(
                {
                    "id": 2,
                    "type": "lovelace/config/save",
                    "url_path": "dashboard-baby",
                    "config": {
                        "views": [
                            {"title": "Baby", "path": "baby", "cards": [{"type": "custom:baby-tracker-card"}]}
                        ]
                    },
                }
            )
            assert (await ws.receive_json())["success"]
            await ws.send_json({"id": 3, "type": "baby_tracker/babies"})
            babies = (await ws.receive_json())["result"]
            assert babies == [{"entry_id": entry_id, "name": "Alex"}], babies

        print(json.dumps({**tokens, "entry_id": entry_id, "client_id": client_id}))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8124"))

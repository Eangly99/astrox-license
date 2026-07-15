# Slash Command Suite

The system consolidates interactions into three root commands: `/license`, `/mylicense`, and `/admin`.

| Command                                     | Arguments                                           | Access        | Description                                                           |
| ------------------------------------------- | --------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `/license generate`                         | `plugin`, `user`, `type`, `[duration]`, `[max-ips]` | Admin / Staff | Create UUID-HMAC license keys.                                        |
| `/license verify`                           | `key`                                               | Admin / Staff | View detailed status and bindings with status buttons.                |
| `/license list`                             | `[user]`, `[plugin]`, `[status]`                    | Admin / Staff | List licenses with filters and pagination.                            |
| `/license transfer`                         | `key`, `new-owner`                                  | Admin / Staff | Transfer ownership, resetting HWID/IP locks.                          |
| `/license revoke`                           | `key`, `[reason]`                                   | Admin / Staff | Deactivates a license key permanently (confirm dialog).               |
| `/mylicense`                                | None                                                | All Users     | View owned licenses, copy full keys, and self-manage whitelisted IPs. |
| `/admin stats`                              | None                                                | Admin         | Dashboard metrics panel displaying system load counts.                |
| `/admin blacklist <add\|remove\|list>`      | `type`, `value`, `reason`                           | Admin         | Block specific keys, HWIDs, or IP ranges globally.                    |
| `/admin audit`                              | `[user]`, `[action]`                                | Admin         | Inspect the 90-day retention system audit trail.                      |
| `/admin plugin <add\|update\|remove\|list>` | `name`, `slug`, `[version]`, `[desc]`               | Admin         | Register and configure target Minecraft plugins.                      |

---

## 📅 Duration Argument Specification

When executing `/license generate` or performing bulk license generation inside administrative modals, the `duration` parameter accepts human-readable string values. The input parser translates these suffixes into millisecond expiration offsets:

- **Standard Suffixes**:
  - `s` — Seconds (e.g., `30s` for short-lived test trials)
  - `m` — Minutes (e.g., `45m`)
  - `h` — Hours (e.g., `12h`)
  - `d` — Days (e.g., `14d` or `30d`)
  - `w` — Weeks (e.g., `2w`)
- **Presets**:
  - `1d` (24 hours)
  - `7d` (7 days)
  - `30d` (30 days)
  - `90d` (90 days)
  - `365d` (365 days)
- **Raw Integers**:
  - Providing a plain integer (e.g., `86400000`) is parsed directly as milliseconds.

> [!NOTE]
> Duration arguments are ignored if the license type is set to `LIFETIME`.

---

## 🎮 Dynamic Bot Presence Status

To provide administrators with immediate operational oversight, the Discord bot dynamically updates its presence on the Discord gateway.

- **Format**: `Playing: Managing X Licenses` (where `X` represents the total active, suspended, and expired licenses in the registry).
- **Refresh Interval**: The status is checked and updated dynamically on boot (after a 5-second Gateway connection stabilization delay) and refreshed automatically every **10 minutes**.


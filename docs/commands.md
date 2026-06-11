# Slash Command Suite

The system consolidates interactions into three high-performance root commands: `/license`, `/mylicense`, and `/admin`.

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

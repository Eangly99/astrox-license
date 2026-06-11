# Java Plugin Integration

To integrate licensing checks inside Spigot/Paper Java plugins, use the following guidelines and helper classes.

## HWID Extraction

To prevent license duplication, extract the machine's hardware ID. The following utility class gathers UUIDs on Windows, Linux, and macOS platforms.

```java
package com.astrox.license.utils;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Locale;

public class HWID {

    public static String getHWID() {
        String os = System.getProperty("os.name").toLowerCase(Locale.ENGLISH);
        try {
            if (os.contains("win")) {
                return getWindowsUUID();
            } else if (os.contains("nix") || os.contains("nux") || os.contains("aix")) {
                return getLinuxUUID();
            } else if (os.contains("mac")) {
                return getMacUUID();
            }
        } catch (Exception e) {
            return System.getProperty("os.arch") + System.getProperty("os.name") + Runtime.getRuntime().availableProcessors();
        }
        return "unknown-hwid";
    }

    private static String getWindowsUUID() throws Exception {
        Process process = Runtime.getRuntime().exec("wmic csproduct get uuid");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.length() > 0 && !line.equalsIgnoreCase("uuid")) {
                    return line;
                }
            }
        }
        throw new Exception("Failed to read Windows UUID");
    }

    private static String getLinuxUUID() throws Exception {
        Process process = Runtime.getRuntime().exec("cat /var/lib/dbus/machine-id");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line = reader.readLine();
            if (line != null) return line.trim();
        }

        process = Runtime.getRuntime().exec("cat /sys/class/dmi/id/product_uuid");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line = reader.readLine();
            if (line != null) return line.trim();
        }
        throw new Exception("Failed to read Linux UUID");
    }

    private static String getMacUUID() throws Exception {
        Process process = Runtime.getRuntime().exec("system_profiler SPHardwareDataType");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains("Hardware UUID")) {
                    return line.split(":")[1].trim();
                }
            }
        }
        throw new Exception("Failed to read Mac UUID");
    }
}
```

## Handshake Manager

Integrate this manager inside your plugin initialization to run verification tasks asynchronously, cache valid states, and process rate-limiting responses.

```java
package com.astrox.license;

import com.astrox.license.utils.HWID;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bukkit.plugin.java.JavaPlugin;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

public class LicenseManager {

    private final JavaPlugin plugin;
    private final String apiUrl;
    private final String licenseKey;
    private final String pluginId;

    private String validationToken = null;
    private long tokenExpiry = 0;

    public LicenseManager(JavaPlugin plugin, String apiUrl, String licenseKey, String pluginId) {
        this.plugin = plugin;
        this.apiUrl = apiUrl;
        this.licenseKey = licenseKey;
        this.pluginId = pluginId;
    }

    public boolean isCached() {
        return validationToken != null && System.currentTimeMillis() < tokenExpiry;
    }

    public CompletableFuture<Boolean> validate() {
        if (isCached()) {
            return CompletableFuture.completedFuture(true);
        }

        String hwid = HWID.getHWID();
        String serverIp = "127.0.0.1";

        JsonObject body = new JsonObject();
        body.addProperty("licenseKey", licenseKey);
        body.addProperty("pluginId", pluginId);
        body.addProperty("serverIp", serverIp);
        body.addProperty("hwid", hwid);

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/api/v1/validate"))
                .header("Content-Type", "application/json")
                .header("User-Agent", "AstroXLicense-Handshake-Java")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();

        return client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(response -> {
                    int status = response.statusCode();
                    if (status == 200) {
                        JsonObject resJson = JsonParser.parseString(response.body()).getAsJsonObject();
                        this.validationToken = resJson.get("token").getAsString();
                        this.tokenExpiry = System.currentTimeMillis() + 55000;
                        return true;
                    } else if (status == 403) {
                        plugin.getLogger().severe("License key is suspended, revoked, or invalid.");
                        return false;
                    } else if (status == 429) {
                        plugin.getLogger().warning("Rate limit hit. Re-trying with cached credentials.");
                        return isCached();
                    }
                    plugin.getLogger().severe("Handshake server returned unexpected status: " + status);
                    return false;
                }).exceptionally(ex -> {
                    plugin.getLogger().severe("Could not establish connection to the license gateway.");
                    return false;
                });
    }
}
```

## Anti-Crack Security

Protecting the Java codebase requires layering check points since Java bytecode can be easily decompiled and edited.

::: warning IMPORTANT SECURITY ADVISORY
Do not store raw URL or endpoint strings in cleartext. Always use string encryption (e.g. XOR) or build them at runtime using character arrays to prevent automated string scanning tools from discovering your licensing server.
:::

### 1. Multi-Stage Heartbeats

Never rely solely on startup checks. Implement an asynchronous scheduler verifying token states at random intervals during runtime.

```java
// Schedule checks at randomized runtimes (e.g., check every 10-15 mins)
Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, () -> {
    manager.validate().thenAccept(ok -> {
        if (!ok) {
            plugin.getLogger().severe("License validation failed. Shutting down plugin functions...");
            Bukkit.getScheduler().runTask(plugin, () -> Bukkit.getPluginManager().disablePlugin(plugin));
        }
    });
}, 12000L, 12000L);
```

### 2. Obfuscation & Bytecode Guards

Ensure your class files run through a bytecode optimizer (e.g., ProGuard or Zelix KlassMaster). Rename licensing classes, and strip debug attributes (source file details, line numbers) from compilation jars to make manual reversing extremely tedious.

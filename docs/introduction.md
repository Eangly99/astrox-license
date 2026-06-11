# Introduction

AstroX License is a production-grade, high-performance license management system designed for Minecraft plugins (Spigot/Paper).

By combining an interactive self-service Discord bot with a secure Fastify REST API, AstroX License allows plugin developers to distribute, verify, and manage licenses with zero friction. The system binds licenses cryptographically to server hardware fingerprints on first use, features IP rate-limiting, and automatically suspends shared licenses performing concurrent handshakes from multiple networks.

## Core Capabilities

### 🔑 Cryptographic Security

License keys are signed cryptographically using timing-safe SHA-256 HMAC prefixes to eliminate key-forging attempts.

### 🔒 Hardware Locks (HWID)

Locks licenses to hardware fingerprints dynamically on first use, blocking unauthorized duplication or sharing.

### 📡 Shared Usage Protection

Automatically flags and suspends licenses performing validation handshakes from more than 3 unique IPs in a 24-hour window.

---
layout: home

hero:
  name: 'AstroX License'
  text: 'Developer Docs'
  tagline: 'A production-grade, cryptographically secure licensing framework for Minecraft plugins.'
  actions:
    - theme: brand
      text: Get Started
      link: /introduction
    - theme: alt
      text: View Slash Commands
      link: /commands

features:
  - icon: 🔑
    title: HMAC Signatures
    details: License keys are signed cryptographically using timing-safe SHA-256 HMAC prefixes to eliminate key-forging attempts.
  - icon: 🔒
    title: HWID Lock
    details: Locks licenses to hardware fingerprints dynamically on first use, blocking unauthorized duplication or redistributions.
  - icon: 📡
    title: Shared Protection
    details: Automatically flags and suspends licenses performing validation handshakes from >3 unique IPs in a 24-hour window.
  - icon: 🤖
    title: Discord Bot Control
    details: Full administrator and self-service slash command dashboard for managing lifecycle actions and IP whitelisting.
  - icon: ⚡
    title: Live Cache Layer
    details: Built-in Keyv cache (Redis/Memory) serving repetitive client validations in milliseconds, saving database cycles.
  - icon: 📋
    title: Audits & Blacklists
    details: Comprehensive audit logging for all operations alongside IP, HWID, and Key blacklists for rapid attack mitigation.
---

# Verification and manual acceptance

## Executed on the available native host

- Windows 11 Pro x64, `10.0.26300`.
- Official Node **v26.13.0 LTS**, checksum verified against its release SHASUMS256.txt. The host's earlier Node 26.10.0 was not used for final validation.
- Native installation with the committed npm lockfile, dependency loading, lint and deterministic tests.
- Initial Fandom checks are superseded by real dos2.wiki HTML/local-index checks for all five subject areas and the two crafting scenarios; exact queries/counts are in source-coverage.md.
- SQLite persistence in a path containing spaces, reopening saved controls, cache deduplication and stale fallback.
- Startup without participation configuration fails closed before attempting Discord login. A later private local configuration enabled a real Gateway login in allowlist mode. The global /dos2 command was registered and read back with integration_types [1], contexts [2], and all five subcommands. DM/account installation behavior remains a manual check.
- Gitleaks **8.30.1**, official release checksum verified. Publication integration tests deliberately place synthetic private values in staged content, a deleted historical file and a commit message, then require a redacted rejection.
- `npm audit --omit=dev`: zero production vulnerabilities at verification time. The pinned upstream-compatible lint toolchain reports development-only advisories and ESLint 9's support notice.

## dos2.wiki adapter verification

The provider migration passes 42 local deterministic tests, including cached raw/index/search persistence, hidden-stat removal, audited DE-field conflicts, Classic exclusions, private payloads and stale fallback. Seven live dos2.wiki checks pass, including a status-effect lookup. Four additional live fuzzy queries verified the 5,045-title catalog and focused cards. Repeating the lookup made no HTTP requests. Embed and select-menu payloads validate through discord.js builders; tests include complete long-recipe pagination, source-section reordering, malformed controls, sitemap destination restrictions and stale-catalog recovery. Only fields listed in [DE verification](de-verification.md) were independently compared with installed DE definitions. The two-account Discord test of this updated adapter remains manual.

## Verified native GitHub-hosted CI

[Native checks run 41336261944](https://github.com/notmike101/divinity-2-discord-bot/actions/runs/41336261944) passed on 2026-11-01 for implementation commit `f5fb3ea43e00272cbce4e7cc0912e3e775577c43`. Both jobs used Node **v26.13.0**, ran npm ci, installed the checksum-verified Gitleaks scanner, passed lint, and passed **17 tests with zero skipped**.

| Host | OS version | Result |
| --- | --- | --- |
| Windows GitHub runner | Windows Server 2025 Datacenter, 10.0.26100 | Passed |
| Ubuntu GitHub runner | Ubuntu 24.04.5 LTS | Passed |

These are native hosted-runner checks, not Docker results. They verify dependency loading, persistence and deterministic interaction/parser tests on both platforms. Live source retrieval and actual Discord Gateway login were checked on the local Windows host; they were not exercised by CI. Native Ubuntu startup with real Discord credentials and the two-account DM checklist remain unperformed.

The implementation is published on main in the target repository. CI emits a non-failing warning about the v4 setup/checkout actions' Node runtime; the application itself ran on the pinned Node 26.13.0.

To reproduce on Ubuntu 24.04 LTS, install Node 26.13.0 and Git, then run:

```sh
node --version
npm ci
node scripts/setup-scanner.js
npm run lint
npm test
npm run check-sources
npm start
```

Without private setup, the last command should stop with the empty-allowlist configuration error. With the private configuration described in README, it should connect to the Gateway and print only the access mode and configured count. Repeat the Discord checklist below. A successful Linux container run would not establish native Ubuntu compatibility; no container exception is required by this implementation.

## Manual two-account Discord smoke test — outstanding

Use only private local configuration for credentials and real user IDs. Do not capture or publish private IDs/tokens in test evidence.

1. Configure User Install and applications.commands. Leave Interactions Endpoint URL unset. Register commands once. Both accounts choose **Add to my apps**.
2. Start the app in allowlist mode with the two participants privately configured. Confirm startup reports allowlist and a count, without identities.
3. In the existing DM/group DM, each participant runs `/dos2 help`, then searches. Exercise craft, skill, item and all search categories. Verify multiple candidates and page navigation on desktop/mobile.
4. Confirm routine result names and mechanical details are shared. For story entries/sections, confirm hidden titles, snippets, URLs and previews remain absent from shared payloads. Each participant separately clicks Reveal and sees useful private result titles/details. The shared result list remains available.
5. Exercise every private control: section/page navigation, related ingredient/page selection, related-link pages, refresh and external source link. Confirm the other participant cannot see these replies. Each person can open their own private view from the same shared control.
6. Change the shared page as one person while the other clicks an older numbered button. Confirm that older button still refers to its original entry. Check no message-limit errors on long recipes.
7. Stop with Ctrl+C, restart, and click an existing shared control. It should still work while the seven-day session is valid. Confirm repeated command invocation recovers from an expired control.
8. Invoke/click as a non-allowlisted test account if available: verify private denial. Change to explicit public mode locally and restart; check new-user access while private controls remain owner-scoped. Restore the intended access setting afterward.
9. Temporarily disconnect the network after a usable lookup. Refresh: cached content should be labeled STALE. A never-fetched record should return a private recoverable error, without exposing source prose in shared output.
10. Verify the Elemental Totem scroll/book distinction, all scroll recipe ingredients/alternatives, blank-book Gift Bag warning and unknown trader data. Source availability must not be described as current merchant stock.
11. Stop the local process and confirm the app is unavailable; restart to restore service. Do not treat an interaction-token expiry as expiry of all future button interactions.

Global registration and Gateway login have been verified. Installation on both accounts and DM interaction behavior remain unverified until the remaining checklist is executed. No mock interaction test substitutes for that acceptance layer.

# DOS2 Discord companion

A local, deterministic reference app for **Divinity: Original Sin 2**, targeting unmodified Definitive Edition. Install it to each Discord account and use `/dos2` in your existing DM or group DM. No Discord server, ordinary message access, model key, paid search API, public web server, WSL, or Docker is needed. The local process must be running for commands/buttons to respond.

## Native setup

Use **Node.js 26.13.0 LTS** on both hosts. Official Node binaries include `node:sqlite` on Windows and Linux; the cache needs no third-party native driver, compiler, Python, or database server. Install Node from [nodejs.org](https://nodejs.org/download/release/v26.13.0/). Use Windows 11 or Ubuntu 24.04 LTS as the setup targets. Git is needed for checkout/publication; the application itself needs only Node/npm and outbound HTTPS/WebSocket access.

Windows PowerShell:

```powershell
cd <your-checkout>
node --version
npm ci
Copy-Item .env.example .env
notepad .env
npm run lint
npm test
npm run check-sources
npm run register-commands
npm run install-link
npm start
```

Ubuntu terminal:

```sh
cd <your-checkout>
node --version
npm ci
cp .env.example .env
chmod 600 .env
${EDITOR:-nano} .env
npm run lint
npm test
npm run check-sources
npm run register-commands
npm run install-link
npm start
```

Both hosts use identical npm scripts and application code. Stop with **Ctrl+C**. Shutdown disconnects the Gateway, waits for pending cache work, then closes SQLite. Relative data paths are resolved beside `package.json`, including paths containing spaces; running `node /path/to/checkout/src/main.js` from another directory works. Do not run two Discord processes for the same application at once.

**Actual verification:** Windows 11 Pro x64, OS version **10.0.26300**, Node **v26.13.0**. See [verification.md](docs/verification.md) for commands and current limitations. Native GitHub-hosted checks also passed on Ubuntu 24.04.5 LTS and Windows Server 2025 (10.0.26100), both with Node 26.13.0: npm ci, scanner setup, lint, and the deterministic tests. See the linked verification report for the exact CI run. Docker tests are not used as a substitute.

## Discord application and both accounts

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications). Copy its **Application ID** from General Information into `DISCORD_APPLICATION_ID` in private `.env`.
2. In **Installation**, enable **User Install**. For its default install settings select **applications.commands** only. Guild Install is unnecessary. Configure an installation link using Discord Provided Link or the URL printed by `npm run install-link`.
3. On the **Bot** page, obtain/reset the application's bot token and save it as `DISCORD_TOKEN` in `.env`. Do not put it in chat, screenshots, source files, or Git. No privileged intents are needed. The client connects with **zero Gateway intents** and receives interactions; it never reads regular chat messages or automates a user account.
4. Leave **Interactions Endpoint URL unset**. This is a Gateway implementation, so there is no HTTP interaction endpoint, inbound port, ngrok, or cloud service.
5. In each person's Discord settings, enable **Advanced → Developer Mode**. Right-click the intended user and use **Copy User ID**. Privately set `ALLOWED_USER_IDS` to the two decimal IDs, separated by a comma. Keep them as strings. Do not add them to `.env.example`, fixtures, CI, commit/PR text, or logs.
6. Run `npm run register-commands` once, and again only after changing the command definition. It POST-upserts the global `dos2` chat-input command by name/type, preserving unrelated commands. No guild ID is used. The payload explicitly sets `integration_types: [1]` (USER_INSTALL) and `contexts: [2]` (PRIVATE_CHANNEL).
7. Run `npm run install-link`. **Both people** open the generated link while signed into their own account and choose **Add to my apps**. Start the local process with `npm start`.
8. Open the existing DM/group DM with your friend and invoke `/dos2 help` or `/dos2 search`. These commands target private channels with other users, not a separate DM with the bot.

If commands are missing, check the application ID matches the token, User Install is enabled, the user installed this application, global registration succeeded, and the DM is with another user. Allow global command propagation/client refresh, then reopen Discord. If clicks time out, check the local process and network. Re-registering at every startup is intentionally avoided.

Current primary references: [applications](https://docs.discord.com/developers/resources/application), [global commands and contexts](https://docs.discord.com/developers/interactions/application-commands), [interaction responses](https://docs.discord.com/developers/interactions/receiving-and-responding), [user installation concepts](https://docs.discord.com/developers/tutorials/developing-a-user-installable-app), [discord.js](https://discord.js.org/docs/packages/discord.js/14.27.0).

## Local participation and configuration

`.env` and all private variants are ignored before any private setup. Only sanitized `.env.example` belongs in Git. An operator-managed process environment is also supported; existing environment values take precedence over `.env`. Change settings locally and restart. Discord users cannot edit access policy.

| Setting | Default / meaning |
| --- | --- |
| `DISCORD_TOKEN` | Required only for Discord startup/registration; blank example |
| `DISCORD_APPLICATION_ID` | Required for startup/registration/install link; blank example |
| `ACCESS_MODE` | `allowlist`; only `allowlist` or explicit `public` accepted |
| `ALLOWED_USER_IDS` | Blank example; comma-separated exact decimal strings |
| `DATA_DIR` | `data` beside package.json; writable directory; absolute paths supported |
| `CACHE_SECONDS` | 21600 (6 hours), range 1–604800 |
| `SESSION_HOURS` | 168 (7 days), range 1–720 |
| `REQUEST_TIMEOUT_MS` | 15000, range 1000–60000 |

Allowlist mode with no identities **stops Discord startup** with an actionable error. It never becomes public implicitly. `ACCESS_MODE=public` explicitly allows anyone who can invoke the user-installed app in its supported context. Repository visibility has no effect on access. Startup logs only the mode and configured user count. Source diagnostics/tests do not need Discord access settings or credentials.

Every command, button, related-page selection, unsupported modal, and autocomplete route checks the actual invoking/clicking actor. Either permitted participant can use shared buttons. Private controls remain owner-scoped in both access modes. Limits are **12 interactions per user per minute**, **60 globally per minute**, plus a bounded source queue of 12 requests; queued requests expire after a minute. Limits reset after a process restart.

## Commands and disclosure

- `/dos2 search query:<text> category:<optional choice>` — all, crafting, skills, items, quests, mechanics.
- `/dos2 craft query:<text>` — crafting and ingredient acquisition.
- `/dos2 skill query:<text>` — spells, skills, statuses.
- `/dos2 item query:<text>` — equipment, items, vendors.
- `/dos2 forum query:<topic or public thread URL>` — targeted Larian DOS2 discussions cached offline.
- `/dos2 fextralife query:<name>` — supplementary Fextralife DOS2 wiki lookup, cached offline.
- `/dos2 help` — usage, broader category coverage, disclosure rules.

Quests includes NPCs and locations; mechanics covers rules. Categories prefer metadata matches and keep useful cross-topic alternatives. Searches normalize whitespace/punctuation and common variants, use curated aliases, rank exact names first, then aliases/phrases/token/edit-distance matches. Misspellings use bounded local fuzzy matching against the cached dos2.wiki sitemap title catalog. No wiki search/API endpoint is called. Distinct scrolls, skillbooks and blank books remain separate entries. There is no generated conversational answer.

Try `conjur incarnte`, `elementl totem skillbok`, `summoning book`, or `teleport gloves`. Exact names rank first; close matches stay separate choices.

Shared output uses **five numbered matches** per page, showing match quality and entry type. Numbered View buttons open a focused embed with a source icon, inline stats, recipe ingredients, used-to-craft items and acquisition where available. A section dropdown opens complete source sections directly; long sections paginate. Technical provenance lives under Source & verification. This layout takes inspiration from the [ARC Raiders information bot](https://github.com/notmike101/discord-bot-arc-raiders-info). Routine item/skill names, crafting recipes, costs, stats and ordinary acquisition details are visible in the conversation. Quest/story entries retain neutral labels and private Reveal controls. Mixed mechanical articles show routine sections and offer Reveal for narrative sections. Clicking Reveal creates a **new ephemeral response for the clicker**, leaving the shared content available. “Reveal result titles” opens a useful private multi-result list. Private views provide section/page navigation, related source pages and ingredient links, refresh, and an external source button. Related-link lists paginate too.

Public section/page/related navigation updates its shared card. All subsequent private navigation and errors remain ephemeral and owner-scoped. A friend can independently click the same shared Reveal button. There is no automatic story understanding or Act-based filtering. Source categories, infobox/schema types and section context guide disclosure; the command category and DE-verification confidence do not control visibility. Source text is escaped and mentions disabled. Do not manually copy private reveals to the shared chat if the other participant wants to avoid spoilers.

## Evidence, cache and sessions

The default runtime source is **dos2.wiki**. **Larian DOS2 forums** and the **Fextralife DOS2 wiki** are separately attributed supplementary lookups, available through their commands and card buttons. See [supplementary source coverage and permissions](docs/supplementary-sources.md). Retrieved supplementary pages and title catalogs persist locally without expiry or automatic revalidation; only the explicit Refresh action fetches an already cached page again. They do not overwrite audited DE facts. The publisher sitemap title catalog (5,045 article titles at verification) and subject indexes support local name matching. Article details are fetched on demand and cached in SQLite; this does not crawl every article. No API/search endpoints or broad-wiki fallback are used. See [source coverage](docs/source-coverage.md) and [DE verification](docs/de-verification.md). Records retain canonical URL, article revision, raw HTML SHA-256, retrieval time, parser version and license. Hidden stat placeholders and navigation are removed. Explicit Classic-only articles/sections are excluded; optional Gift Bag sections are labeled. Only the small set of audited fields described in the verification report is independently checked against installed DE definitions. Other wiki prose remains clearly labeled as a source excerpt, not DE-verified fact.

Recipe tables preserve output, every ingredient/quantity actually written, row-span alternatives and nearby source conditions. Unstated quantities stay unstated. Prose remains a source excerpt, not inferred facts. When no recipe section exists, the app says **“No recipe found in this source”**, which does not prove non-craftability. Mentioning an NPC and item together never creates a sale relationship. Source availability never establishes current merchant stock or save state.

SQLite stores search results, raw index/article HTML, parsed pages and immutable opaque button mappings, **not Discord interaction tokens**. A later click gets its own token. Buttons survive restart until the configured session expiration; they do not inherit the original interaction token's lifetime. Repeat a command after expiry. Controls from the retired Fandom/divinitywiki.com providers must also be recovered by repeating the command; their old cache records are not used by this pipeline. Private source content and participant ownership metadata are local runtime data: protect the data directory like private configuration.

Cache hits avoid requests; identical concurrent requests share work. Empty results cache for at most 60 seconds. Failures do not become empty-result records. Refresh replaces usable data only on success; an outage returns clearly labeled **STALE** data where available. The ordinary cache retains at most 1000 entries; permanent supplementary `offline:*` records are excluded from that eviction. Controls retain at most 20000 entries; old controls may expire earlier if this cap is reached. Expired mappings are pruned on startup/new controls/cache writes. Stop the app before deleting the data directory to reset cache and controls. There is no startup crawl.

HTTP requests allow only dos2.wiki ordinary articles/fixed sitemaps, ordinary articles and the sitemap on the specific Fextralife DOS2 host, and tightly validated read-only Larian thread/board URLs. Every redirect is revalidated. Wiki namespaces/action/query endpoints and forum posting/login/search actions are rejected. Requests are serialized with a 750 ms minimum start gap, bounded response size, timeouts and limited transient retries. The app respects blocked API/search routes and never bypasses access blocks. Diagnostics avoid identities, tokens and raw source/error dumps.

## Checks and safe publication

```sh
npm ci
npm run lint
npm test
npm run check-sources
node scripts/check-supplementary.js
node scripts/setup-scanner.js
npm run check-publication
```

The scanner setup downloads **Gitleaks 8.30.1** from its official release and verifies the release SHA-256 checksum. It uses the host's `tar` (included with modern Windows and Ubuntu) and installs only in ignored `.tools`. Alternatively install Gitleaks yourself and set `GITLEAKS_PATH` to its executable. With no scanner, publication fails closed and the scanner integration test explicitly skips; the CI workflow installs it so that test runs.

`check-publication` audits the Git index, all reachable commits/messages/tags and historical blobs across all local refs (including remote-tracking refs and deleted files), then runs Gitleaks against the staged snapshot and full reachable history with redacted output. Private exact checks load `DISCORD_TOKEN`, comma-separated `ALLOWED_USER_IDS`, and optional comma-separated `PUBLICATION_PRIVATE_VALUES` from local configuration. Ordinary values such as `ACCESS_MODE` are not secrets. If no private values exist, it reports that exact-value coverage is unavailable; this is not a claim those unknown values were checked. Private configuration was supplied locally during verification; it remains ignored and untracked.

To inspect a proposed commit message before committing, save it in ignored `.git/commit-message.txt` and run:

```sh
npm run check-publication -- --message-file=.git/commit-message.txt
```

The command returns nonzero on exposure, scanner failure or malformed index. It reports affected paths/object IDs with private values redacted. Tests create disposable repositories and deliberately place a generated synthetic private value in the index, deleted history, and a commit message, checking rejection and redaction. No actual participant identities are fixtures.

Before **each commit and push**, fetch target history, inspect the tracked list/staged diff, stage intended files explicitly, ensure `.env`/runtime data are untracked, and run the audit. After committing, rerun it so the new commit/message is included. Audit the exact branch to push and verify the destination is `https://github.com/notmike101/divinity-original-sin-2-discord-bot.git`. Do not force-push or rewrite existing history to repair exposure. If history contains protected values, stop publication and arrange remediation with the repository owner.

On hosts using the GitHub App helper, set `GITHUB_AGENT_HELPER` to its local path so the scanner's read-only Git operations use it; publication commands must use that helper and `agent-notmike101[bot]`. Other operators can use their configured Git authentication. No auth token is stored in remotes or the project. The Windows/Ubuntu CI matrix uses read-only permissions, synthetic test users, and uploads no runtime artifacts.

## Project layout and tools

`src/config.js`, `commands.js`, `router.js`, `render.js`, `search.js`, `sources.js`, `http.js`, `domain.js`, and `store.js` separate policy, transport, presentation, ranking, source markup, networking and persistence. Scripts handle registration, install links, source probes and publication independently. There is no runtime LLM, embedding, AI API, model dependency or hidden agent.

The requested [notmike101/eslint-configs](https://github.com/notmike101/eslint-configs) JS/JSDoc packages are vendored, preserving package interfaces, for reproducible public `npm ci` without private-registry access. See [vendor provenance](vendor/README.md). Local overrides explain intentional sequential source work and module style. The upstream-compatible ESLint 9 peer combination currently reports development-only advisories and an unsupported-version notice; production dependency audit is clean as of the recorded run. Do not hide peer conflicts with force/legacy-peer-deps.

Source excerpts/fixtures retain their original licensing and attribution; no ownership of wiki content is claimed. No license was present in the empty target repository; this implementation does not invent a repository-wide license grant.

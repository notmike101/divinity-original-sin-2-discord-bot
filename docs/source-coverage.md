# Current dos2.wiki source coverage

The runtime provider is **dos2.wiki**, targeting **Divinity: Original Sin 2 — Definitive Edition**. Fandom and divinitywiki.com are no longer automatic fallbacks. The earlier [source evaluation](source-evaluation.md) is historical; this note describes the implemented adapter.

## Retrieval and cache

Only ordinary HTTPS article URLs on dos2.wiki are used. The adapter never calls API, REST, Special or search endpoints. Namespaces, query strings, foreign hosts, credentials and unsafe redirects are rejected. Requests are serialized with a 750 ms start gap, bounded queue/response sizes, timeouts and limited transient retries.

Discovery combines normal title lookup with locally ranked links from these fixed indexes, fetched on demand:

| Category | Index articles |
| --- | --- |
| Crafting | Crafting, Ingredients |
| Skills | Skills, Status Effects |
| Items | Items, Armour, Weapons |
| Quests | Quests |
| Mechanics | Physical and Magical Armor, Attributes, Combat Abilities |
| All | Union of these indexes |

This is bounded discovery, not an exhaustive crawl. Related articles are fetched on demand. Exact-title candidates help find pages missing from the indexes; unknown terms are not replaced with arbitrary nearest results.

SQLite persists raw article/index HTML, ranked search results, parsed pages and opaque interaction mappings. Source provenance includes canonical URL, retrieval timestamp, revision, raw HTML SHA-256, parser version and CC BY-SA 4.0 attribution. Default freshness is six hours; empty searches cache for at most one minute. Identical concurrent work is deduplicated. Network, markup and audited-field verification failures preserve usable records as labeled STALE data.

Parser/cache version 3 isolates this pipeline from old broad-wiki records. Existing dos2.wiki controls survive restart. Old provider controls require repeating the lookup; they cannot serve retired cached content.

## Parsing and trust

Canonical identity, first heading, revision and article container are validated before caching. Hidden stat placeholders, scripts/styles, navigation, notice widgets, galleries and unrelated UI are removed. Paragraphs, lists and complete table cells remain. Row spans preserve alternate ingredient relationships; merged empty headers do not create ingredients. Unstated quantities stay unknown.

Classic-only titles and explicitly Classic-only sections are excluded. Optional Gift Bag sections are labeled. This is explicit metadata/heading handling, not perfect semantic detection. Routine names, recipes, stats, skill effects and ordinary acquisition are shared. Narrative entries/sections use private Reveal. Source categories, entity schemas and ancestor headings guide disclosure; query categories do not. Source-only confidence is independent from spoiler visibility. Ambiguous entries remain neutral until classified.

[DE verification](de-verification.md) documents the narrow independent check of installed DE definitions. Audited Elemental Totem/Conjure Incarnate fields and the Elemental Totem skillbook recipe must match before a refreshed page is accepted. Only listed fields receive a verified-facts section. Other source claims are not silently promoted to verified status.

A blank-book used-in table describes recipes consuming the book, not necessarily a recipe for creating it. Missing recipes remain unknown. Item/NPC co-occurrence does not establish a sale relationship or current merchant stock.

## Live evidence

The source-check script verifies fresh discovery and useful details for all seven queries below and reports canonical URLs, revisions, timestamps, section/link counts and verification status. All passed on the local Windows host on 2026-11-01.

| Query | Selected article |
| --- | --- |
| Elemental Totem Skillbook | Elemental Totem Skillbook |
| Blank Summoning Skillbook | Blank Summoning Skillbook |
| Conjure Incarnate | Conjure Incarnate |
| Burning | Burning (Status) |
| Teleportation Gloves | Gloves of Teleportation |
| The Teleporter | The Teleporter |
| physical armour | Physical and Magical Armor |

Deterministic tests separately cover cache reuse/reopening, malformed content, verification conflicts, source outages, Classic exclusions, complete recipes and private payloads. No installed game or Discord credentials are required for those tests.

## Attribution and limits

The dos2-*.html fixtures were retrieved from the correspondingly named dos2.wiki articles on 2026-11-01, retaining representative markup/revisions in minimal page framing. Content is by wiki contributors under [CC BY-SA 4.0 and stated exceptions](https://dos2.wiki/wiki/dos2wiki:Copyrights); consult article history for authors. The older Fandom fixture is retained as historical source material and is not used by the runtime provider.

The wiki is in preview and some prose imports Fandom. Future template changes, missing links, source inaccuracies and uncertain edition provenance remain possible. The app does not certify the entire wiki or current gameplay state. No other internet provider is enabled without separate evidence.

The visible five result candidates are hydrated on demand before rendering shared titles. Unknown related entries use neutral previews; their fetched details are checked again before rendering. Public navigation updates the shared card, while every private reveal/navigation stays owner-scoped. Old private controls remain private after the policy change; repeat the search to obtain new shared controls.

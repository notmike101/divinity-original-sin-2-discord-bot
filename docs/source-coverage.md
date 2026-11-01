# Source coverage and evidence

Checked 2026-11-01 using normal Node HTTP requests, without login or a browser session.

## Fandom — primary

[Divinity Wiki on Fandom](https://divinity.fandom.com/) exposes a working public MediaWiki API at `/api.php`. Both `action=query` search (including generator search plus category metadata) and `action=parse` article HTML were verified. Normal article HTML and robots.txt requests returned a Cloudflare 403 challenge; the public API returned normal JSON. The application uses that API, not challenge solving or cookie/browser replay. Future source blocks fail gracefully. Search discovers up to 25 candidates per provider; this is not an exhaustive database.

The site's [About page](https://divinity.fandom.com/wiki/Divinity_Wiki:About), retrieved through the API, describes a merged wiki covering the Divinity series, maintained by its listed community bureaucrats. API siteinfo identifies Fandom's `divinity2` wiki and [CC-BY-SA licensing](https://www.fandom.com/licensing). Titles/categories are not assumed specific to DOS2 without evidence.

Live results, 2026-11-01, with fresh search and parsed articles:

| Category / query | Top article | Matches | Parsed sections | Related links |
| --- | --- | ---: | ---: | ---: |
| Crafting: Elemental Totem Skillbook | Elemental Totem | 25 | 6 | 23 |
| Crafting: Blank Summoning Skillbook | Blank Summoning Skillbook | 25 | 6 | 7 |
| Skills: Conjure Incarnate | Conjure Incarnate | 22 | 9 | 67 |
| Items: Teleportation Gloves | Gloves of Teleportation | 19 | 5 | 6 |
| Quests: The Teleporter | The Teleporter | 25 | 8 | 12 |
| Mechanics: physical armour | Physical and Magical Armor (Original Sin 2) | 25 | 7 | 0 |

`npm run check-sources` prints machine-readable counts, canonical URLs, timestamps and edition labels and fails if either discovery or parsing is missing or stale. Outputs reflect the current upstream content, not fixed acceptance counts. No Discord credentials are required.

The Elemental Totem article explicitly describes combining its scroll with a Blank Summoning Skillbook. Its scroll recipe table includes Sheet of Paper, Wooden Figurine, and Tormented Soul variants. Row spans are expanded so the output/other ingredients accompany every alternative; no quantity is supplied unless written in the source. The blank-book article's crafting section requires **Gift Bag: Herb Gardens**. It is flagged as gameplay-changing content, not an unmodified-DE recipe. Its trader section is incomplete; the app supplies no invented merchant or acquisition claim. Follow its actual links on demand to inspect evidence.

## divinitywiki.com — probed alternative, limited current coverage

[Divinity Wiki](https://divinitywiki.com/) has its own reachable MediaWiki API and article path `/index.php/Title` (not `/wiki/Title`). Siteinfo reports MediaWiki 1.46.0, English, a distinct wiki database, and no configured rightsinfo license. Its [About page](https://divinitywiki.com/index.php/Divinity_Wiki:About) identifies an unofficial community wiki administered by User:Alex. Its main page describes ongoing contributor work. The probes do **not** establish legal ownership or a migration/content-lineage relationship with Fandom, and the app does not treat the sites as independent corroboration.

Both article retrieval (Main Page, About and the DOS2 overview) and search were probed. Search for `Divinity` returns entries; the representative `Elemental Totem` and `Totem` searches returned zero hits. It is therefore a best-effort fallback, **not verified equivalent coverage** of the five Fandom examples. If Fandom is down and the fallback has no relevant entry, the app reports unavailability or returns labeled usable stale data, not hardcoded facts or a links-only substitute. `/robots.txt` specifies `Crawl-Delay: 20`, respected by the source queue.

## Parsed fields and limits

- Provenance: canonical article URL, source name/provider, retrieval ISO timestamp, parser version, categories and game/edition label.
- Portable infobox label/value fields, including smart-group skill costs/cooldowns/range, are preserved as labeled source text. They are **not** automatically safe for public posting.
- Headings, paragraphs, lists and table rows provide the useful detail fallback. Every retained section can be paginated; no ingredient list is silently truncated.
- Ingredient/related navigation uses actual same-source article links. It does not infer purchases or relationships from co-occurrence.
- Navigation, scripts/styles, advertisements embedded as navigation, galleries, footers, reference lists and repeated UI chrome are removed. Unexpected empty markup fails parsing instead of being cached as an empty success.
- The parser is generic, not a schema for every template. Deeply nested tables, future template changes and source inaccuracies remain limitations. A row-span alternative is a source row, not a synthesized normalized recipe.
- Explicit other-game/mod categories are rejected. Unknown applicability is labeled. DE-specific infobox fields establish that DE fields exist, not that all surrounding prose is DE-only. Mixed Classic/DE articles retain visible uncertainty. Optional Gift Bag requirements are flagged in their section. No automatic Act filter or perfect story detector is claimed.
- All article content and source titles are private by policy; cache records themselves have no public/private designation. All render paths apply visibility anew.

## Fixture attribution

`test/fixtures/elemental-totem.json` is the public API parse response for [Elemental Totem](https://divinity.fandom.com/wiki/Elemental_Totem), retrieved 2026-11-01. It retains source markup for a representative parser regression test. Original content is by Divinity Wiki contributors under the site's CC-BY-SA terms; see [article history](https://divinity.fandom.com/wiki/Elemental_Totem?action=history) for authors. The parser transforms that content into attributed sections. This licensing applies to source content independently from application code. Nothing from private Discord/local configuration is a fixture.

## Further Definitive Edition source evaluation

See [source-evaluation.md](source-evaluation.md) for the 2026-11-01 investigation of dos2.wiki, official DE-data provenance, other candidate sources, their access rules, and integration limits. No additional provider was enabled by that investigation.

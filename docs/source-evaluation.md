# Definitive Edition source evaluation

Investigated 2026-11-01 with ordinary Node HTTP requests and public search. This evaluates **Divinity: Original Sin 2 — Definitive Edition**, not Divinity II: Ego Draconis. No new provider was enabled by this research.

## Recommendation

Use a layered evidence policy rather than treating a whole wiki as Definitive Edition verified:

1. **Edition authority:** the operator's unmodified DOS2 Definitive Edition game/editor data, with game build and module provenance, is the strongest candidate for verifying exact recipes, skill/status definitions and item templates. This is a proposed local verification layer, not an implemented extractor or replacement for live websites. No local game data was inspected during this research.
2. **Best newly identified web candidate:** dos2.wiki for structured item/skill pages and complete linked recipe tables. Its ordinary article/index pages are reachable. Its API/search endpoints are disallowed by its published robots rules, so the bot must not simply point its existing API adapter at this domain. A future adapter would need a small set of permitted index pages and cached local title matching, or explicit operator permission for API/search use. That workflow has not been implemented or fully validated.
3. **Working current live provider:** Fandom's Divinity Wiki API remains verified for search and detail retrieval. Accept only fields with adequate DOS2/DE evidence, keep mixed/unknown edition labels, and retain separate Gift Bag conditions. It is not a certified DE-only database.
4. Keep inaccessible, explicitly automation-restricted, or unversioned recipe collections as human references, not unqualified ingestion fallbacks.

No single public source investigated here establishes complete, strictly DE-only coverage across crafting, skills/statuses, equipment/vendors, quests/locations and mechanics. Reachability alone is not proof of edition accuracy or permission to automate ingestion.

## Sources tested

| Source | What was verified | Edition/provenance | Suitability |
| --- | --- | --- | --- |
| [dos2.wiki](https://dos2.wiki/) | HTTP 200 ordinary skill/item/crafting/quest/mechanics pages; structured skill UID and item root-template UUID; complete linked recipe rows | Specifically DOS2, but some articles explicitly import unedited Fandom prose; quest overview says Classic and DE are both covered. Game-data build provenance was not established. Site advertises early preview state. | Strong candidate for structured fields, with per-field edition validation and permitted HTML/index retrieval. Not a drop-in API/search provider. |
| [Fandom Divinity Wiki](https://divinity.fandom.com/wiki/Elemental_Totem) | Fresh API search and parse both HTTP 200; Elemental Totem parse contains a Definitive Edition tab and DOS2 categories | Multi-game wiki; explicit DE fields on some pages, mixed/unknown prose elsewhere | Operational current provider, with explicit uncertainty. All five areas were already smoke-tested. |
| [Larian Definitive Edition documentation](https://docs.larian.game/Definitive_Edition) | HTTP 200; distinguishes Classic and DE data and instructs linking the Definitive Edition engine to DE data | Official developer documentation | Authority for selecting the correct local edition, not a comprehensive gameplay lookup API. |
| [GameFAQs DE guide](https://gamefaqs.gamespot.com/ps4/236378-divinity-original-sin-ii-definitive-edition/faqs/81674) | Search index exposes crafting and skills chapters under the DE game listing; direct Node retrieval of skills returned Cloudflare HTTP 403 | Explicit DE listing, but full guide/version content could not be verified by normal HTTP | Useful human-reference candidate; not a verified bot source. Do not bypass the block. |
| [Fextralife DOS2 wiki](https://divinityoriginalsin2.wiki.fextralife.com/Elemental_Totem) | Article HTTP 200 and useful skill content; tested guessed /search endpoint returned 404 | DOS2-specific, not proven uniformly DE-only | Exclude automated ingestion without permission: [robots.txt](https://divinityoriginalsin2.wiki.fextralife.com/robots.txt) expressly prohibits automated retrieval without Valnet's written permission. No further extraction is proposed. |
| [Crafting Divinity](https://craftingdivinity.azurewebsites.net/) | HTTP 200 with 277 recipe rows and ingredient columns; About lists 594 items and multiple community inputs | No DE build/version verification; [About](https://craftingdivinity.azurewebsites.net/Home/About) explicitly aggregates Irodemine, wikis, Steam and Reddit | Supplementary recipe candidate only after provenance/edition/reuse validation. It is not independent corroboration of those upstream sites. |
| [Irodemine](http://www.irodemine.com/divinity2/) | Plain HTTP page returns 200 with recipe table and search form; HTTPS requests failed; robots.txt returned 404 | Page heading abbreviates the title as Divinity II, while navigation separately links Original Sin I and table contains DOS2 recipes; DE applicability not established | Lower-priority reference. No search-submission workflow, reuse permission or DE provenance verified. |
| [divinitywiki.com](https://divinitywiki.com/) | Previously verified public API and article retrieval; representative Totem searches empty | Broad Divinity wiki, no equivalent DE subject coverage established | Do not confuse with dos2.wiki or treat as equivalent coverage. |

## dos2.wiki probes and source relationships

The following ordinary pages returned useful HTTP 200 content, without login:

- [Elemental Totem](https://dos2.wiki/wiki/Elemental_Totem): skill requirements, cooldown/range and stable skill UID.
- [Conjure Incarnate](https://dos2.wiki/wiki/Conjure_Incarnate): skill fields, linked infusions and separately headed Gift Bag material.
- [Blank Summoning Skillbook](https://dos2.wiki/wiki/Blank_Summoning_Skillbook): item weight/value, root-template UUID and an explicit used-in table linking multiple skillbook recipes, including Elemental Totem.
- [Crafting](https://dos2.wiki/wiki/Crafting), [Skills](https://dos2.wiki/wiki/Skills), [Items](https://dos2.wiki/wiki/Items), [Quests](https://dos2.wiki/wiki/Quests) and [Physical and Magical Armor](https://dos2.wiki/wiki/Physical_and_Magical_Armor): useful subject indexes or details, with imported-content/mixed-edition caveats.

The structured blank-book recipe relationship is more directly navigable than the current Fandom prose. It does not establish how the blank book itself is acquired or whether a trader currently stocks it. Do not infer either relationship.

The site's [About](https://dos2.wiki/wiki/dos2wiki:About) identifies Matt Hurd as founder/administrator; its main page identifies IndexForged LLC hosting. [Copyrights](https://dos2.wiki/wiki/dos2wiki:Copyrights) and footer specify CC BY-SA 4.0 unless otherwise noted. These statements support attribution/reuse planning, not a blanket assumption that all game assets or imported text have identical provenance. Several subject pages openly mark Fandom imports, so matching prose between the sites is not independent corroboration.

[robots.txt](https://dos2.wiki/robots.txt) disallows `/w/api.php`, `/w/rest.php`, Special pages and search query URLs. A metadata API probe returned JSON, but no further API/search requests were made after reviewing these restrictions. Ordinary article retrieval was tested instead. Creative Commons licensing and automated-endpoint access are separate questions.

## Integration boundary

The running application still uses its existing Fandom-first adapter and best-effort divinitywiki.com fallback. This investigation does **not** silently switch providers or claim a new DE-only pipeline is complete. The next substantive implementation would be a separately tested dos2.wiki HTML/index adapter with precise structured-field extraction, provenance, conservative edition labels and the existing private reveal rules. If strict DE field verification is required, pair it with a versioned local DE-data reference rather than guessing from a wiki's game title.

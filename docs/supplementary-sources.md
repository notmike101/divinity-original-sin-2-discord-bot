# Supplementary sources and offline retrieval

dos2.wiki remains the default lookup and the only provider with the narrow installed-DE field checks in [DE verification](de-verification.md). Supplementary claims are displayed separately, with their original source and edition uncertainty. They do not overwrite verified recipes or stats.

## Fextralife DOS2 wiki

The operator confirmed permission on 2026-11-01 to retrieve from `https://divinityoriginalsin2.wiki.fextralife.com/` provided retrieved information is stored locally and normal use does not repeatedly contact the website. This is a deployment-specific permission statement, not a public redistribution license or permission for other Fextralife sites. The site's general robots/terms restrictions still apply to others without permission.

`/dos2 fextralife query:<name>` searches the locally stored publisher sitemap catalog. The first catalog fetch produced 2,356 ordinary article titles. Only the visible result window and selected/linked articles are retrieved; there is no full article crawl. The **Fextralife lookup** button on another provider's card searches that title.

The article record contains the original HTML, parsed sections, canonical URL, revision, retrieval time and SHA-256. It persists in local SQLite under `offline:fextra:*`. Normal lookups never expire or revalidate it, including across restarts. The **Refresh** button explicitly fetches the selected page again. An error, blocked page, wrong identity or unexpected markup preserves the previous record with a STALE label. Source content is excluded from Git and publication.

Page bodies exclude comments and site navigation. Complete table rows and quantities are preserved; costs and recipes are not inferred from text co-occurrence. Classic-only titles/sections are excluded. Categories and section context drive story disclosure. Fextralife content is source-derived, not independently DE-verified; a Larian support reply in the crafting discussion below specifically cautions that the crafting list may not reflect DE changes.

## Larian DOS2 forums

`/dos2 forum query:<topic>` searches previously retrieved thread titles, a small researched seed set and locally cached topic titles from the first page of DOS2 General (64), Help/Tips/Tricks (67), and Bugs/Technical Problems (68). Titles use conservative term matching to avoid unrelated topics such as “crashing” for “crafting.” The built-in forum search denies guest access; this integration does not use it, authenticate, or scan the entire forum history.

For older or more specific material, `/dos2 forum query:<thread URL>` retrieves a specific public `ubb=showflat&Number=...` thread. Breadcrumb validation requires the DOS2 category and one of those boards or DOS2 Latest News (66). Other games, modding boards, login/profile/posting/actions and foreign redirects are rejected. Thread-page numbers are bounded; additional page links are opened on demand.

The researched initial threads are:

| Discussion | Why it is included | Trust limit |
| --- | --- | --- |
| [crafting without recipe](https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=656574) | Crafting sources and edition caveats | Advice, not an independently checked recipe list |
| [Unable to obtain Skills from Skill books](https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=664912) | Skillbook requirements and troubleshooting replies | Historical reports and support advice; platforms/context differ |
| [Reactive Shot + teleport causing loss of control?](https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=652234) | An explicitly DE co-op interaction report | A report, not proof of a current bug or its cause |
| [New Feature and Gift Bag 3 - Order & Magic](https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=656607) | Optional Pet Power/summoning changes | Gift Bag content is optional, not the unmodified DE baseline |

Only matching discussions are fetched. Each retrieved thread page stores raw HTML and parsed posts together under `offline:forum:*`. Board titles and posts have no automatic refetch; Refresh explicitly updates the selected thread page. A thread URL lets the operator retrieve a topic absent from the cached board list. Posts keep source authors, dates, post IDs, quotations and separate replies. Staff markup is supported, but staff and player posts are all labeled source reports, not automatically certified facts. Profiles, avatars, signatures and unrelated navigation are excluded. Embedded spoiler blocks and narrative topics use private disclosure.

## Local cache and verification

`offline:*` records are excluded from the ordinary 1,000-record cache eviction. They remain until the operator removes the local data. This makes previously retrieved content available without source access. It does not make unseen articles or the Discord connection available offline. Protect and back up `data/companion.sqlite` with the rest of the private runtime data; do not publish cached source content.

`node scripts/check-supplementary.js` checks the researched forum threads and representative Fextralife pages through the same adapters, validates outgoing embed shapes and verifies repeated retrieval makes zero HTTP requests. It uses the persistent cache without forced refresh. Tests separately cover restart persistence, expired timestamps, normal-cache eviction, explicit refresh, malformed-source recovery, URL/redirect restrictions and private-control ownership.

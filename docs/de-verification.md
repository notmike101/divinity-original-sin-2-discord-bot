# Narrow verification against installed Definitive Edition data

On 2026-11-01, read-only static package inspection was necessary because dos2.wiki did not establish a game build for every field. The installed DE executable reports version **3.6.117.3735**. No process was attached to, controlled, restarted or played. No computer-use tool was used and no installed file was written.

The reverse-engineer-anything skill supplied the static-artifact workflow. REA's advertised formats do not include Larian PAK, so [Norbyte LSLib](https://github.com/Norbyte/lslib) **1.20.4** was used to list and extract copies of generated-stat members. Tools and extracted data remain under ignored `.git/`; full game datasets are not committed.

## Compared facts

| Identity | Audited fields from the installed DE definitions |
| --- | --- |
| Elemental Totem / `Summon_TotemFromSurface` | AP 2; source cost 0; cooldown 1; range 13; memory 1 |
| Conjure Incarnate / `Summon_Incarnate` | AP 2; source cost 0; cooldown 6; range 13; memory 1 |
| Elemental Totem Skillbook | `BOOK_Skill_Summoning_Blank_A` + `SCROLL_Summon_TotemFromSurface` produces `SKILLBOOK_Summoning_TotemFromSurface` |

Current dos2.wiki fields and the explicit skillbook recipe table agree with these definitions. No quantities are invented where the wiki does not state them. Skill, scroll, completed skillbook and blank book remain separate identities.

The skill declarations in Shared and Patch1 agree on the audited values. The bounded inspection covered generated-stat members of installed Shared, SharedDOS, Patch packages and Origins, plus the Game package's matching inventory. No competing audited skill declarations were found in those extracted members beyond Shared/Patch1. The recipe tuple is present in Shared's ItemCombos at lines 7683–7694; the skill starts are at lines 550 and 750. This establishes facts in inspected DE definitions, not current runtime load order or an absence of external mods.

## Local evidence identities

| Artifact/member | SHA-256 |
| --- | --- |
| LSLib `ExportTool-v1.20.4.zip` | `5e02368fb8acafda9b45acba37a3f3bf507fc3d65a083a159abbeab06337190e` |
| Shared `Public/Shared/Stats/Generated/Data/Skill_Summon.txt` | `8f6fa117944813cf5513c588ea825a62570206b24a8586aeb863c3b07fe3be8d` |
| Patch1 same skill member | `5a4eaff9f2c03443e01297e51c1f11d85780431bbb7aaeaae3d15963ff2612ff` |
| Shared `Public/Shared/Stats/Generated/ItemCombos.txt` | `fecee6d8248bb68a4bf09892578768efee41e19eed7e7178cf55ec6cc619b182` |
| Patch1 same recipe member | `829ca40193b563f4597b341caee9b08b2894b76b46133aafd0634ba62077a00d` |

Hashes identify retained local bytes; they are not publisher signatures or runtime-execution evidence. Full package hashes and Steam integrity verification were not performed.

## Runtime policy and limits

`src/verification.js` checks only this small audited baseline against freshly parsed wiki fields. Missing or conflicting fields reject refresh; previous usable content can be returned as explicitly STALE. A verified-facts section names only the checked facts. Other article sections remain private, attributed **source excerpts**, not independently DE-verified facts. The baseline does not replace live source retrieval.

Review the baseline if the game build or relevant definitions change, and bump the parser/cache version when changing the verification contract. Tests do not require an installed game.

Unverified scope includes other item/skill values, mechanics prose, quest and vendor state, precise acquisition, current merchant stock, runtime load order and the rest of the wiki. These gaps are not filled from model memory or inferred relationships.

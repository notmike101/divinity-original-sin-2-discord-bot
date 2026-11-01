import { categories } from './domain.js';

/** Global user-installed command definition; POST upserts only this command name/type. */
export const command = {
    name: 'dos2', description: 'Search Divinity: Original Sin 2 references', type: 1,
    integration_types: [1], contexts: [2],
    options: ['search', 'craft', 'skill', 'item', 'forum', 'fextralife', 'help'].map((name) => ({
        type: 1, name, description: name === 'help' ? 'Help and source information' : `Find ${name === 'search' ? 'reference entries' : `${name} entries`}`,
        ...(name === 'help'
            ? {}
            : {
                    options: [
                        { type: 3, name: 'query', description: 'Name or search terms', required: true, max_length: 180 },
                        ...(name === 'search' ? [{ type: 3, name: 'category', description: 'Prefer a subject area', choices: categories.map((value) => ({ name: value, value })) }] : []),
                    ],
                }),
    })),
};
export const help = `Use /dos2 search query:<text>, /dos2 craft, /dos2 skill, or /dos2 item. All search dos2.wiki, Fextralife, Larian forums and locally stored article/post content together. No source-specific command or category is required. Results identify their source; identical names from different sources remain separate references. Supplementary pages stay cached locally without automatic refetch; Refresh explicitly requests an update. Forum discovery is targeted, not a full crawl; DE applicability remains source-dependent.
Categories: crafting includes recipes and ingredient acquisition; skills includes spells and statuses; items includes equipment and vendors; quests includes NPCs and locations; mechanics includes rules. Categories prefer matches rather than hiding useful cross-topic entries.
Partial names, reordered words and common typos work: try conjur incarnte, elementl totem skillbok, summoning book, or teleport gloves. Choose an entry/source from the result dropdown to show stats, recipes and acquisition in the same message. More/Previous results options reach additional matches. A sole result opens automatically. Use its section dropdown for complete details and ingredient links for related items.
All result titles, story content, quest outcomes, recipes, locations and related links are shown directly. No spoiler hiding or Reveal step is applied. Fextralife ranks before dos2.wiki for equally relevant matches; exact names still lead. Source attribution and DE verification labels remain visible. Linked pages retain their own evidence; no save or merchant-stock knowledge.
Controls last 7 days by default and survive restart. An expired control can be recovered by repeating the command. Source refresh failures may return labeled stale content. Participation is configured locally by the operator; restart after changes.`;

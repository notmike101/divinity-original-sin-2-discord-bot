import { categories } from './domain.js';

/** Global user-installed command definition; POST upserts only this command name/type. */
export const command = {
    name: 'dos2', description: 'Search Divinity: Original Sin 2 references', type: 1,
    integration_types: [1], contexts: [2],
    options: ['search', 'craft', 'skill', 'item', 'help'].map((name) => ({
        type: 1, name, description: name === 'help' ? 'Help and spoiler rules' : `Find ${name === 'search' ? 'reference entries' : `${name} entries`}`,
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
export const help = `Use /dos2 search query:<text> category:<optional choice>, /dos2 craft, /dos2 skill, or /dos2 item.
Categories: crafting includes recipes and ingredient acquisition; skills includes spells and statuses; items includes equipment and vendors; quests includes NPCs and locations; mechanics includes rules. Categories prefer matches rather than hiding useful cross-topic entries.
Partial names, reordered words and common typos work: try conjur incarnte, elementl totem skillbok, summoning book, or teleport gloves. Pick a numbered result to open a card with stats, recipes and acquisition. Use its section dropdown for complete details and ingredient links for related items.
Routine item/skill names, recipes, costs, stats and ordinary acquisition information are shared. Story entries and narrative sections use Reveal for a private view. Mixed articles show routine sections first. Private navigation stays private. Source metadata and section rules guide disclosure; there is no automatic story/Act understanding. Edition uncertainty is shown on each article. Linked pages retain their own evidence; no save or merchant-stock knowledge.
Controls last 7 days by default and survive restart. An expired control can be recovered by repeating the command. Source refresh failures may return labeled stale content. Participation is configured locally by the operator; restart after changes.`;

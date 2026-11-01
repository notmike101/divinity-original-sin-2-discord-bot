/** Disclosure uses source metadata, never the slash-command category or verification status. */
const mechanicalTitles = new Set(['Crafting', 'Ingredients', 'Skills', 'Status Effects', 'Items', 'Armour', 'Weapons', 'Attributes', 'Combat Abilities', 'Physical and Magical Armor', 'Action Point', 'Source Point']);
const narrative = /\b(?:spoilers?|quests?|walkthrough|story|plot|lore|dialogue|endings?|outcomes?|character background|origin story)\b/i;

/** Routine entities and rules can be shared. Narrative taxonomy takes precedence. */
export function mechanical(record) {
    if (!record) {
        return false;
    }

    const categories = (record.sourceCategories || []).join(' ');

    if (narrative.test(categories) || /\b(?:npcs?|characters?|locations?)\b/i.test(categories)) {
        return false;
    }

    return ['skill', 'skillbook', 'scroll', 'ingredient', 'item'].includes(record.entityType)
        || mechanicalTitles.has(record.title)
        || /\b(?:skills?|skillbooks?|status effects|ingredients|armour|weapons|items|potions|runes|arrows|abilities|mechanics)\b/i.test(categories)
        || /(?: skillbook| scroll| potion| rune| essence|\(status\))$/i.test(record.title);
}

/** Mechanical pages may contain narrative sections; expose those only through a private reveal. */
export function storySection(record, section) {
    return !mechanical(record) || narrative.test([...(section.headings || []), section.title].join(' '))
        || /\b(?:quest|storyline|plot|dialogue|ending|betrayal|is revealed|reveals that|turns out)\b/i.test(section.text);
}

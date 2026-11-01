import { storySection } from './spoilers.js';
import { safe, chunks } from './text.js';

const labels = { Overview: 'Full description & stats', Crafting: 'Crafting recipe', Locations: 'Where to find', 'Used in': 'Used to craft', 'Ground Spawns': 'Where to find', Traders: 'Vendors', Description: 'Effects & details' };

export const topicLabel = (title) => labels[title] || title;
/** Convert source recipe rows into readable lists, retaining all ingredients and surrounding conditions. */
export function readable(text) {
    let recipe = false; let location = false;

    return text.split('\n').map((line) => {
        if (!line.includes(' | ')) {
            return line;
        }

        const cells = line.split('|').map((cell) => cell.trim());

        if (cells[0] === 'Product' && cells[1] === 'Ingredients') {
            recipe = true;

            return '';
        }

        if (cells[0] === 'Variant/Location' && cells[1] === 'Region') {
            location = true; recipe = false;

            return '';
        }

        if (location && cells.length > 1) {
            return `${cells[0]} — ${cells[1]}${cells[2] ? ` (${cells[2]} spawn(s) listed)` : ''}`;
        }

        if (recipe && cells.length > 1) {
            return `${cells[0] || 'Output not specified by the source'}\n${cells.slice(1).filter(Boolean).map((cell) => `• ${cell}`).join('\n')}`;
        }

        return cells.join(' · ');
    }).join('\n');
}

/** Stable topic keys avoid selecting a different section when source ordering changes. */
export function topics(record, owner) {
    const visible = owner ? record.sections : record.sections.filter((section) => !storySection(record, section));

    return [{ key: 'overview', title: 'Overview', overview: true }, ...visible.filter((s) => !['Verified Definitive Edition facts', 'Recipe availability'].includes(s.title)).map((s) => ({ ...s, key: `source:${JSON.stringify(s.headings || [s.title])}` })), { key: 'provenance', title: 'Source & verification', text: `Source: ${record.source}\nRetrieved: ${record.retrievedAt}\nArticle revision: ${record.revision || 'unknown'}\n${record.edition}\n\n${record.sections.find((s) => s.title === 'Verified Definitive Edition facts')?.text || 'No independent DE checks are recorded for this entry.'}` }];
}

const compact = (text) => {
    const escaped = safe(text);

    return escaped.length > 600 ? `${escaped.slice(0, 597)}…` : escaped;
};

/** Compact item-first overview inspired by the ARC Raiders bot, using source-derived facts only. */
export function overview(record, owner) {
    const fields = []; const facts = record.fields || {};
    const add = (name, value, inline = false) => {
        if (value === undefined || value === null || value === '') {
            return;
        }

        const escaped = safe(value);

        fields.push({ name, value: escaped.length <= 1_024 ? escaped : 'Open the corresponding section for the complete information.', inline });
    };

    for (const [key, label] of Object.entries({ type: 'Type', actionPoints: 'AP cost', sourcePoints: 'Source cost', cooldown: 'Cooldown', memory: 'Memory', range: 'Range', weight: 'Weight', value: 'Value', rarity: 'Rarity', level: 'Level', physicalArmour: 'Physical armour', magicArmour: 'Magic armour' })) {
        const value = facts[key];

        add(label, value === undefined ? undefined : key === 'cooldown' ? `${value} ${Number(value) === 1 ? 'turn' : 'turns'}` : key === 'range' ? `${value} m` : String(value), true);
    }

    add('Requirements', facts.requirements);
    const recipes = (record.recipes || []).filter((recipe) => (recipe.output || '').toLowerCase() === record.title.toLowerCase() && (owner || !storySection(record, { title: 'Crafting', headings: recipe.headings, text: `${recipe.conditions || ''} ${recipe.ingredients.join(' ')}` })));

    if (recipes.length) {
        add('Crafting recipe', recipes.map((recipe) => (recipe.conditions ? `${recipe.conditions}\n` : '') + recipe.ingredients.map((ingredient) => `• ${ingredient}`).join('\n')).join('\n\nOR\n\n'));
    } else if (record.entityType !== 'skill' && (record.entityType || /items|armour|weapons|ingredients/i.test((record.sourceCategories || []).join(' '))) && record.sections.some((section) => section.title === 'Recipe availability')) {
        add('Crafting recipe', 'No recipe found in this source.');
    }

    const uses = (record.usedIn || []).filter((recipe) => owner || !storySection(record, { title: 'Used in', headings: recipe.headings, text: recipe.output || '' }));

    if (uses.some((recipe) => recipe.output)) {
        add('Used to craft', uses.filter((recipe) => recipe.output).map((recipe) => `• ${recipe.output}`).join('\n'));
    }

    if (uses.some((recipe) => !recipe.output)) {
        add('Related crafting', uses.filter((recipe) => !recipe.output).map((recipe) => `Output not specified by source\n${recipe.ingredients.map((ingredient) => `• ${ingredient}`).join('\n')}`).join('\n\n'));
    }

    const acquisition = record.sections.find((section) => /^(?:locations|ground spawns|traders|acquisition|where to find)$/i.test(section.title) && (owner || !storySection(record, section)));

    if (acquisition) {
        add('Where to find', readable(acquisition.text));
    }

    const visible = record.sections.filter((section) => (owner || !storySection(record, section)) && section.title !== 'Verified Definitive Edition facts');
    let summary = facts.summary || visible.find((section) => section.title === 'Overview')?.text || visible[0]?.text || 'Choose a section below for details.';

    if (!owner && storySection(record, { title: 'Description', text: summary })) {
        summary = 'Choose a section below for routine details.';
    }

    let budget = 4_300;
    const visibleFields = fields.map((field) => {
        if (field.name.length + field.value.length > budget) {
            field = { ...field, value: 'Use the section menu for the complete information.' };
        }

        budget -= field.name.length + field.value.length;

        return budget >= 0 ? field : null;
    }).filter(Boolean);

    return { description: compact(summary), fields: visibleFields };
}

export function detailEmbed(record, part, owner, page, stale) {
    const pages = part.overview ? [''] : chunks(readable(part.text));

    page = Math.max(0, Math.min(page, pages.length - 1));
    const content = part.overview ? overview(record, owner) : { description: pages[page] };
    const embed = { title: safe(record.title).slice(0, 240), url: record.url, color: 0xB9_8D_4C, author: { name: record.provider === 'larian' ? 'Larian DOS2 forums · community reports' : record.provider === 'fextralife' ? 'Fextralife DOS2 wiki' : 'dos2.wiki' }, ...content, footer: { text: `${part.overview ? 'Overview' : topicLabel(part.title)}${pages.length > 1 ? ` · ${page + 1}/${pages.length}` : ''} · ${record.verification?.status === 'audited-fields-match' ? (record.verification.fields.includes('skillbook recipe') ? 'Recipe DE-checked' : 'Costs/range DE-checked') : 'Source-derived; DE details unverified'}${stale ? ' · STALE CACHE' : ''}` } };

    const retrieved = new Date(record.retrievedAt);

    if (!Number.isNaN(retrieved.getTime())) {
        embed.timestamp = retrieved.toISOString();
    }

    if (record.image) {
        embed.thumbnail = { url: record.image };
    }

    return { embed, pages, page };
}

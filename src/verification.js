const skillChecks = {
    'Elemental Totem': { skillId: 'Summon_TotemFromSurface', actionPoints: 2, sourcePoints: 0, cooldown: 1, range: 13, memory: 1 },
    'Conjure Incarnate': { skillId: 'Summon_Incarnate', actionPoints: 2, sourcePoints: 0, cooldown: 6, range: 13, memory: 1 },
};

/**
 * Cross-check only audited fields; surrounding wiki prose stays source-only.
 *
 * @param {import('./domain.js').Entry} record - Parsed source article.
 * @returns {import('./domain.js').Entry} Record with narrow evidence labels.
 */
export function verify(record) {
    const expected = skillChecks[record.title];
    const confirmed = [];

    if (expected) {
        for (const [key, value] of Object.entries(expected)) {
            if (record.fields[key] !== value) {
                throw new Error(`DE verification conflict: ${key}. Source refresh rejected.`);
            }
        }

        confirmed.push(`Skill identity: ${expected.skillId}`, `Action points: ${expected.actionPoints}; Source points: ${expected.sourcePoints}`, `Cooldown: ${expected.cooldown} turns; Range: ${expected.range} m; Memory: ${expected.memory} slot(s)`);
    }

    if (record.title === 'Elemental Totem Skillbook') {
        const recipe = record.sections.find((section) => section.title === 'Crafting');
        const rows = recipe?.text.split('\n').filter((line) => line.includes(' | ')).map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean)) || [];
        const row = rows.find((cells) => cells[0] === 'Elemental Totem Skillbook');

        if (!row || row.length !== 3 || row[1] !== 'Blank Summoning Skillbook' || row[2] !== 'Elemental Totem Scroll') {
            throw new Error('DE verification conflict: skillbook recipe. Source refresh rejected.');
        }

        confirmed.push('Recipe output: Elemental Totem Skillbook', 'Ingredients: Blank Summoning Skillbook + Elemental Totem Scroll', 'The source does not state quantities here; none are inferred.');
    }

    record.verification = { status: confirmed.length ? 'audited-fields-match' : 'source-only', gameBuild: '3.6.117.3735', checkedAt: '2026-11-01', reference: 'docs/de-verification.md', fields: expected ? Object.keys(expected) : confirmed.length ? ['skillbook recipe'] : [] };

    if (confirmed.length) {
        record.sections.unshift({ title: 'Verified Definitive Edition facts', text: `${confirmed.join('\n')}\n\nThese fields match the installed DE stat definitions checked on 2026-11-01 (build 3.6.117.3735). Other article sections remain source excerpts.`, evidence: 'Confirmed against installed DE stat definitions; limited to the listed fields' });
        record.edition = 'DOS2 DE: listed audited fields match; remaining source text is not independently verified';
    }

    return record;
}

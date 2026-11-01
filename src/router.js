import { MessageFlags } from 'discord.js';
import { help } from './commands.js';
import { permitted } from './config.js';
import { listView, detailView, payload } from './render.js';

/** Fixed-window limits apply to every actor and the whole local instance. */
export class Limits {
    constructor() {
        this.users = new Map(); this.global = { at: 0, count: 0 };
    }

    allow(id, now = Date.now()) {
        if (now - this.global.at >= 60_000) {
            this.global = { at: now, count: 0 }; this.users.clear();
        }

        const count = this.users.get(id) || 0;

        if (count >= 12 || this.global.count >= 60) {
            return false;
        }

        this.users.set(id, count + 1); this.global.count++;

        return true;
    }
}
/** Navigation updates its existing message; legacy private messages retain their ownership. */
export function router(cfg, store, lookup, limits = new Limits()) {
    const renderList = async (results, page = 0, owner = null, stale = false, unavailable = []) => {
        if (results.length === 1 && lookup.detail) {
            try {
                const result = await lookup.detail(results[0]);
                const card = detailView(store, results[0], result.value, owner, { stale: stale || result.stale, unavailable });

                if (unavailable.length && card.embeds.length) {
                    card.embeds[0].description += `\n\nPartial coverage: ${unavailable.join(', ')} unavailable. Stored matches are still included.`;
                }

                return card;
            } catch {
                return listView(store, results.map((entry) => ({ ...entry, entityType: null, sourceCategories: [] })), 0, owner, stale, unavailable);
            }
        }

        const prepared = !owner && lookup.preview ? await lookup.preview(results, page, 5) : results;

        return listView(store, prepared, page, owner, stale, unavailable);
    };

    return async (interaction) => {
        if (!interaction.isChatInputCommand() && !interaction.isMessageComponent() && !interaction.isAutocomplete() && !interaction.isModalSubmit()) {
            return;
        }

        const reject = async (message) => {
            if (interaction.isAutocomplete()) {
                return interaction.respond([]);
            }

            return interaction.reply({ ...payload(message), flags: MessageFlags.Ephemeral });
        };

        try {
            if (!permitted(cfg, interaction.user.id)) {
                return await reject('You are not permitted to use this app. Ask its operator to update local participation settings.');
            }

            if (interaction.context !== 2) {
                return await reject('Use this app in a DM or group DM with other users.');
            }

            if (!limits.allow(interaction.user.id)) {
                return await reject('Request limit reached. Try again in a minute.');
            }

            if (interaction.isAutocomplete()) {
                return await interaction.respond([]);
            }

            if (interaction.isModalSubmit()) {
                return await reject('This app does not use modals. Repeat /dos2 search.');
            }

            if (interaction.isChatInputCommand()) {
                if (interaction.commandName !== 'dos2') {
                    return await reject('Unknown command.');
                }

                const sub = interaction.options.getSubcommand();

                if (sub === 'help') {
                    return await reject(help);
                }

                const category = { craft: 'crafting', skill: 'skills', item: 'items' }[sub] || interaction.options.getString('category') || 'all';

                await interaction.deferReply();

                try {
                    const result = ['forum', 'fextralife'].includes(sub) ? await lookup[sub].search(interaction.options.getString('query')) : await lookup.search(interaction.options.getString('query'), category);

                    return await interaction.editReply(await renderList(result.value, 0, null, result.stale, result.unavailable));
                } catch {
                    return await interaction.editReply(payload('Lookup unavailable. Try again shortly or use a shorter query.'));
                }
            }

            const state = store.read(interaction.customId);

            if (!state) {
                return await reject('This control expired or is invalid. Repeat /dos2 search to recover.');
            }

            if (state.owner && state.owner !== interaction.user.id) {
                return await reject('This private view belongs to another user. Run /dos2 search for your own view.');
            }

            if (state.kind === 'result') {
                const selected = interaction.values?.[0];

                if (!/^\d{1,2}$/.test(selected || '') || !state.choices?.[Number(selected)]) {
                    return await reject('Invalid result. Choose an option from the result dropdown.');
                }

                const choice = state.choices[Number(selected)];

                if (!choice.entry) {
                    await interaction.deferUpdate();

                    return await interaction.editReply(await renderList(state.results, choice.page, state.owner, state.stale, state.unavailable));
                }

                state.kind = 'detail'; state.entry = choice.entry; state.navigation = true;
            }

            if (state.kind === 'list') {
                const owner = state.owner || null;

                await interaction.deferUpdate();

                return await interaction.editReply(await renderList(state.results, state.page, owner, state.stale, state.unavailable));
            }

            if (['forum', 'fextralife'].includes(state.kind)) {
                const owner = state.owner || null;

                await interaction.deferUpdate();

                const result = await lookup[state.kind].search(state.entry.title);

                return await interaction.editReply(await renderList(result.value, 0, owner, result.stale));
            }

            if (!['detail', 'related', 'section'].includes(state.kind)) {
                return await reject('Invalid control. Repeat /dos2 search.');
            }

            if (state.kind === 'section') {
                const value = interaction.values?.[0];

                if (!/^\d{1,2}$/.test(value || '') || !state.sectionKeys?.[Number(value)]) {
                    return await reject('Invalid section. Choose a section from the card again.');
                }

                const key = state.sectionKeys[Number(value)];

                if (key.startsWith('topic-page:')) {
                    state.topicPage = Number(key.slice(11));
                } else {
                    state.sectionKey = key; state.page = 0;
                }
            }

            let entry = state.entry;

            if (state.kind === 'related') {
                const selected = interaction.values?.[0];

                if (!/^\d{1,2}$/.test(selected || '') || !state.related[Number(selected)]) {
                    return await reject('Invalid related-entry selection. Repeat the lookup.');
                }

                entry = { ...state.related[Number(selected)], provider: state.provider };
            }

            await interaction.deferUpdate();

            const result = await lookup.detail(entry, state.refresh);

            return await interaction.editReply(detailView(store, entry, result.value, state.owner || null, { ...state, stale: result.stale }));
        } catch {
            // Never log source prose, tokens, actor identities, or raw library error objects.
            console.error('Interaction failed (details redacted).');

            if (interaction.deferred || interaction.replied) {
                if (!interaction.ephemeral) {
                    await interaction.editReply(payload('Unable to retrieve this entry. Repeat /dos2 search.')).catch(() => {
                    });
                } else {
                    await interaction.editReply(payload('Source unavailable or unsupported entry. Try the source later or choose another result.')).catch(() => {
                    });
                }
            } else {
                await reject('Unable to process this interaction. Repeat /dos2 search.').catch(() => {
                });
            }
        }
    };
}

/**
 * Source-derived records; visibility is decided at render time.
 *
 * @typedef {object} Entry
 * @property {string} title - Canonical source title.
 * @property {string} url - Canonical source article URL.
 * @property {string} source - Source attribution.
 * @property {string} retrievedAt - ISO retrieval time.
 * @property {string} parserVersion - Parser provenance.
 * @property {string} edition - Explicit metadata or uncertainty.
 * @property {Array<{title: string, text: string}>} sections - Ordered complete source excerpts.
 * @property {Array<{title: string, url: string}>} related - Actual article links.
 */
export const PARSER_VERSION = '1';
export const categories = ['all', 'crafting', 'skills', 'items', 'quests', 'mechanics'];

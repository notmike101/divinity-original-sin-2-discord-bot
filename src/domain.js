/**
 * Source-derived records; visibility is decided at render time.
 *
 * @typedef {object} Entry
 * @property {string} title - Canonical source title.
 * @property {string} url - Canonical source article URL.
 * @property {string} source - Source attribution.
 * @property {string} retrievedAt - ISO retrieval time.
 * @property {string} parserVersion - Parser provenance.
 * @property {string[]} [sourceCategories] - Categories from the source article, not query filters.
 * @property {string | null} [entityType] - Entity type established by source infobox/schema.
 * @property {string} edition - Explicit metadata or uncertainty.
 * @property {string} revision - Source article revision ID.
 * @property {string} contentHash - SHA-256 of retrieved source HTML.
 * @property {string} license - Source reuse/attribution label.
 * @property {Record<string, string | number>} fields - Only reliably parsed source fields.
 * @property {object} [verification] - Narrow audited-field status, never whole-page certification.
 * @property {Array<{title: string, text: string, evidence?: string, headings?: string[]}>} sections - Ordered complete source excerpts.
 * @property {Array<{title: string, url: string}>} related - Actual article links.
 */
export const PARSER_VERSION = '3';
export const categories = ['all', 'crafting', 'skills', 'items', 'quests', 'mechanics'];

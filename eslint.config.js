import js from '@notmike101/eslint-config-js';
import jsdoc from '@notmike101/eslint-config-jsdoc/syntax';
import globals from 'globals';

export default [{ ignores: ['vendor/**', 'data/**'] }, ...js, ...jsdoc, {
    languageOptions: { globals: globals.node }, rules: {
        // Sequential requests respect source limits; named exports stay next to their JSDoc.
        'no-await-in-loop': 'off', 'import/exports-last': 'off', 'no-control-regex': 'off',
        // Keep compact callbacks readable without competing stylistic auto-fixes.
        '@stylistic/max-statements-per-line': 'off', 'unicorn/empty-brace-spaces': 'off',
        'no-nested-ternary': 'off', 'require-await': 'off',
    },
}];

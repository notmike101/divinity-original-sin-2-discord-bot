import eslintPluginJSDoc from 'eslint-plugin-jsdoc';

// https://github.com/gajus/eslint-plugin-jsdoc/blob/main/README.md

const jsdocRecommended = eslintPluginJSDoc.configs['flat/recommended'];
const coverageRules = [
  'jsdoc/require-jsdoc',
  'jsdoc/require-description',
  'jsdoc/require-param',
  'jsdoc/require-param-description',
  'jsdoc/require-param-name',
  'jsdoc/require-param-type',
  'jsdoc/require-property',
  'jsdoc/require-property-description',
  'jsdoc/require-property-name',
  'jsdoc/require-property-type',
  'jsdoc/require-returns',
  'jsdoc/require-returns-check',
  'jsdoc/require-returns-description',
  'jsdoc/require-returns-type',
  'jsdoc/require-yields',
  'jsdoc/require-yields-check',
];

const requireJsdocRule = ['warn', {
  require: {
    ArrowFunctionExpression: true,
    FunctionExpression: true,
    FunctionDeclaration: true,
    ClassExpression: true,
    ClassDeclaration: true,
    MethodDefinition: true,
  },
}];

const jsdocSyntaxRules = {
  ...Object.fromEntries(coverageRules.map((ruleName) => [ruleName, 'off'])),
  'jsdoc/no-defaults': 'off',
  'jsdoc/tag-lines': ['warn', 'any', {
    startLines: 1,
  }],
  'jsdoc/require-hyphen-before-param-description': ['warn', 'always'],
};

const jsdocCoverageRules = {
  ...Object.fromEntries(coverageRules.map((ruleName) => [ruleName, jsdocRecommended.rules[ruleName]])),
  'jsdoc/require-jsdoc': requireJsdocRule,
  'jsdoc/require-description': 'warn',
};

export const jsdocSyntax = [
  jsdocRecommended,
  {
    plugins: {
      jsdoc: eslintPluginJSDoc,
    },
    rules: jsdocSyntaxRules,
  },
];

export const jsdocRequired = [
  {
    plugins: {
      jsdoc: eslintPluginJSDoc,
    },
    rules: jsdocCoverageRules,
  },
];

export default [
  ...jsdocSyntax,
  ...jsdocRequired,
];

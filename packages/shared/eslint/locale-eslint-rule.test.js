/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
*/

import { RuleTester } from 'eslint';
import vueParser from 'vue-eslint-parser';
import localeRule from './locale-eslint-rule.js';

const locale = { foo: { bar: 'ok', baz: 'good {x}' }, top: '123' };

const ruleTester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    ecmaVersion: 2023,
  },
});

function testCase(code, errors) {
  return { code, errors, options: [locale], filename: 'test.ts' };
}

function testCaseVue(code, errors) {
  return { code, errors, options: [locale], filename: 'test.vue' };
}

ruleTester.run(
  'sharkey-locale',
  localeRule,
  {
    valid: [
      testCase('i18n.ts.foo.bar'),
      testCase('i18n.ts.top'),
      testCase('i18n.tsx.foo.baz({x:1})'),
      testCase('whatever.i18n.ts.blah.blah'),
      testCase('whatever.i18n.tsx.does.not.matter'),
      testCase('whatever(i18n.ts.foo.bar)'),
      testCaseVue('<template><p>{{ i18n.ts.foo.bar }}</p></template>'),
      testCaseVue('<template><I18n :src="i18n.ts.foo.baz"/></template>'),
      // we don't detect the problem here, but should still accept it
      testCase('i18n.ts.foo["something"]'),
      testCase('i18n.ts.foo[something]'),
    ],
    invalid: [
      testCase('i18n.ts.not', 1),
      testCase('i18n.tsx.deep.not', 1),
      testCase('i18n.tsx.deep.not({x:12})', 1),
      testCase('i18n.tsx.top({x:1})', 1),
      testCase('i18n.ts.foo.baz', 1),
      testCase('i18n.tsx.foo.baz', 1),
      testCase('i18n.tsx.foo.baz({y:2})', 2),
      testCaseVue('<template><p>{{ i18n.ts.not }}</p></template>', 1),
      testCaseVue('<template><I18n :src="i18n.ts.not"/></template>', 1),
    ],
  },
);

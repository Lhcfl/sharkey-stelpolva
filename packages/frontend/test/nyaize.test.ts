/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach } from 'vitest';
import { nyaize } from '@/scripts/nyaize.js';

function runTests(cases) {
    for (const c of cases) {
        const [input,expected] = c;
        const got = nyaize(input);
        assert.strictEqual(got, expected);
    }
}

describe('nyaize', () => {
    test('ja-JP', () => {
        runTests([
            ['きれいな','きれいにゃ'],
            ['ナナナ', 'ニャニャニャ'],
            ['ﾅﾅ','ﾆｬﾆｬ'],
        ]);
    });
    test('en-US', () => {
        runTests([
            ['bar','bar'],
            ['banana','banyanya'],
            ['booting','booting'],
            ['morning','mornyan'],
            ['mmmorning','mmmornyan'],
            ['someone','someone'],
            ['everyone','everynyan'],
            ['foreveryone','foreverynyan'],
        ]);
    });
});

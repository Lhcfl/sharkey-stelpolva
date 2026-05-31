/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
*/

/* This is a ESLint rule to report use of the `i18n.ts` and `i18n.tsx`
 * objects that reference translation items that don't actually exist
 * in the lexicon (the `locale/` files)
 */

/* given a MemberExpression node, collects all the member names
 *
 * e.g. for a bit of code like `foo=one.two.three`, `collectMembers`
 * called on the node for `three` would return `['one', 'two',
 * 'three']`
 */
function collectMembers(node) {
	if (!node) return [];
	if (node.type !== 'MemberExpression') return [];
	// this is something like `foo[bar]`
	if (node.computed) return [];
	return [node.property.name, ...collectMembers(node.parent)];
}

/* given an object and an array of names, recursively descends the
 * object via those names
 *
 * e.g. `walkDown({one:{two:{three:15}}},['one','two','three'])` would
 * return 15
 */
function walkDown(locale, path) {
	if (!locale) return null;
	if (!path || path.length === 0 || !path[0]) return locale;
	return walkDown(locale[path[0]], path.slice(1));
}

/* given a MemberExpression node, returns its attached CallExpression
 * node if present
 *
 * e.g. for a bit of code like `foo=one.two.three()`,
 * `findCallExpression` called on the node for `three` would return
 * the node for function call (which is the parent of the `one` and
 * `two` nodes, and holds the nodes for the argument list)
 *
 * if the code had been `foo=one.two.three`, `findCallExpression`
 * would have returned null, because there's no function call attached
 * to the MemberExpressions
 */
function findCallExpression(node) {
	if (!node.parent) return null;

	// the second half of this guard protects from cases like
	// `foo(one.two.three)` where the CallExpression is parent of the
	// MemberExpressions, but via `arguments`, not `callee`
	if (node.parent.type === 'CallExpression' && node.parent.callee === node) return node.parent;
	if (node.parent.type === 'MemberExpression') return findCallExpression(node.parent);
	return null;
}

// same, but for Vue expressions (`<I18n :src="i18n.ts.foo">`)
function findVueExpression(node) {
	if (!node.parent) return null;

	if (node.parent.type.match(/^VExpr/) && node.parent.expression === node) return node.parent;
	if (node.parent.type === 'MemberExpression') return findVueExpression(node.parent);
	return null;
}

function areArgumentsOneObject(node) {
	return node.arguments.length === 1 &&
		node.arguments[0].type === 'ObjectExpression';
}

// only call if `areArgumentsOneObject(node)` is true
function getArgumentObjectProperties(node) {
	return new Set(node.arguments[0].properties.map(
		p => {
			if (p.key && p.key.type === 'Identifier') return p.key.name;
			return null;
		},
	));
}

function getTranslationParameters(translation) {
	return new Set(Array.from(translation.matchAll(/\{(\w+)\}/g)).map(m => m[1]));
}

function setDifference(a, b) {
	const result = [];
	for (const element of a.values()) {
		if (!b.has(element)) {
			result.push(element);
		}
	}

	return result;
}

/* the actual rule body
 */
function theRuleBody(context, node) {
	// we get the locale/translations via the options; it's the data
	// that goes into a specific language's JSON file, see
	// `scripts/build-assets.mjs`
	const locale = context.options[0];

	// sometimes we get MemberExpression nodes that have a
	// *descendent* with the right identifier: skip them, we'll get
	// the right ones as well
	if (node.object?.name !== 'i18n') {
		return;
	}

	// `method` is going to be `'ts'` or `'tsx'`, `path` is going to
	// be the various translation steps/names
	const [method, ...path] = collectMembers(node);
	const pathStr = `i18n.${method}.${path.join('.')}`;

	// does that path point to a real translation?
	const translation = walkDown(locale, path);
	if (!translation) {
		context.report({
			node,
			message: `translation missing for ${pathStr}`,
		});
		return;
	}

	// we hit something weird, assume the programmers know what
	// they're doing (this is usually some complicated slicing of
	// the translation structure)
	if (typeof(translation) !== 'string') return;

	const callExpression = findCallExpression(node);
	const vueExpression = findVueExpression(node);

	// some more checks on how the translation is called
	if (method === 'ts') {
		// the `<I18n> component gets parametric translations via
		// `i18n.ts.*`, but we error out elsewhere
		if (translation.match(/\{/) && !vueExpression) {
			context.report({
				node,
				message: `translation for ${pathStr} is parametric, but called via 'ts'`,
			});
			return;
		}

		if (callExpression) {
			context.report({
				node,
				message: `translation for ${pathStr} is not parametric, but is called as a function`,
			});
		}
	}

	if (method === 'tsx') {
		if (!translation.match(/\{/)) {
			context.report({
				node,
				message: `translation for ${pathStr} is not parametric, but called via 'tsx'`,
			});
			return;
		}

		if (!callExpression && !vueExpression) {
			context.report({
				node,
				message: `translation for ${pathStr} is parametric, but not called as a function`,
			});
			return;
		}

		// we're not currently checking arguments when used via the
		// `<I18n>` component, because it's too complicated (also, it
		// would have to be done inside the `if (method === 'ts')`)
		if (!callExpression) return;

		if (!areArgumentsOneObject(callExpression)) {
			context.report({
				node,
				message: `translation for ${pathStr} should be called with a single object as argument`,
			});
			return;
		}

		const translationParameters = getTranslationParameters(translation);
		const parameterCount = translationParameters.size;
		const callArguments = getArgumentObjectProperties(callExpression);
		const argumentCount = callArguments.size;

		if (parameterCount !== argumentCount) {
			context.report({
				node,
				message: `translation for ${pathStr} has ${parameterCount} parameters, but is called with ${argumentCount} arguments`,
			});
		}

		// node 20 doesn't have `Set.difference`...
		const extraArguments = setDifference(callArguments, translationParameters);
		const missingArguments = setDifference(translationParameters, callArguments);

		if (extraArguments.length > 0) {
			context.report({
				node,
				message: `translation for ${pathStr} passes unused arguments ${extraArguments.join(' ')}`,
			});
		}

		if (missingArguments.length > 0) {
			context.report({
				node,
				message: `translation for ${pathStr} does not pass arguments ${missingArguments.join(' ')}`,
			});
		}
	}
}

function theRule(context) {
	// we get the locale/translations via the options; it's the data
	// that goes into a specific language's JSON file, see
	// `scripts/build-assets.mjs`
	// const locale = context.options[0];

	// for all object member access that have an identifier 'i18n'...
	return context.getSourceCode().parserServices.defineTemplateBodyVisitor(
		{
			// this is for <template> bits, needs work
			'MemberExpression:has(Identifier[name=i18n])': (node) => theRuleBody(context, node),
		},
		{
			// this is for normal code
			'MemberExpression:has(Identifier[name=i18n])': (node) => theRuleBody(context, node),
		},
	);
}

export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'assert that all translations used are present in the locale files',
		},
		schema: [
			// here we declare that we need the locale/translation as a
			// generic object
			{ type: 'object', additionalProperties: true },
		],
	},
	create: theRule,
};

/*
 * SPDX-FileCopyrightText: leah and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//store the URL and if its none of these its a custom one
export const searchEngineMap = {
	//The first one is the default search engine
	'https://www.google.com/search?q={query}': 'Google',
	'https://duckduckgo.com/?q={query}': 'Duckduckgo',
	'https://www.bing.com/search?q={query}': 'Bing',
	'https://search.yahoo.com/search?p={query}': 'Yahoo',
	'https://www.ecosia.org/search?q={query}': 'Ecosia',
	'https://www.qwant.com/?q={query}': 'Qwant',
	'https://search.aol.com/aol/search?q={query}': 'AOL',
	'https://yandex.com/search?text={query}': 'Yandex',
};

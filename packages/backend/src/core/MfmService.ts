/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { isText, isTag, Text } from 'domhandler';
import * as htmlparser2 from 'htmlparser2';
import { Node, Document, ChildNode, Element, ParentNode } from 'domhandler';
import * as domserializer from 'dom-serializer';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { intersperse } from '@/misc/prelude/array.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import type { IMentionedRemoteUsers } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import type * as mfm from 'mfm-js';

const urlRegex = /^https?:\/\/[\w\/:%#@$&?!()\[\]~.,=+\-]+/;
const urlRegexFull = /^https?:\/\/[\w\/:%#@$&?!()\[\]~.,=+\-]+$/;

export type Appender = (document: Document, body: Element) => void;

@Injectable()
export class MfmService {
	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
	}

	@bindThis
	public fromHtml(html: string, hashtagNames?: string[]): string {
		// some AP servers like Pixelfed use br tags as well as newlines
		html = html.replace(/<br\s?\/?>\r?\n/gi, '\n');

		const normalizedHashtagNames = hashtagNames == null ? undefined : new Set<string>(hashtagNames.map(x => normalizeForSearch(x)));

		const dom = htmlparser2.parseDocument(html);

		let text = '';

		for (const n of dom.childNodes) {
			analyze(n);
		}

		return text.trim();

		function getText(node: Node): string {
			if (isText(node)) return node.data;
			if (!isTag(node)) return '';
			if (node.tagName === 'br') return '\n';

			return node.childNodes.map(n => getText(n)).join('');
		}

		function appendChildren(childNodes: ChildNode[]): void {
			for (const n of childNodes) {
				analyze(n);
			}
		}

		function analyze(node: Node) {
			if (isText(node)) {
				text += node.data;
				return;
			}

			// Skip comment or document type node
			if (!isTag(node)) {
				return;
			}

			switch (node.tagName) {
				case 'br': {
					text += '\n';
					return;
				}
				case 'a': {
					const txt = getText(node);
					const rel = node.attribs.rel;
					const href = node.attribs.href;

					// ハッシュタグ
					if (normalizedHashtagNames && href && normalizedHashtagNames.has(normalizeForSearch(txt))) {
						text += txt;
						// メンション
					} else if (txt.startsWith('@') && !(rel && rel.startsWith('me '))) {
						const part = txt.split('@');

						if (part.length === 2 && href) {
							//#region ホスト名部分が省略されているので復元する
							const acct = `${txt}@${(new URL(href)).hostname}`;
							text += acct;
							//#endregion
						} else if (part.length === 3) {
							text += txt;
						}
						// その他
					} else {
						const generateLink = () => {
							if (!href && !txt) {
								return '';
							}
							if (!href) {
								return txt;
							}
							if (!txt || txt === href) {	// #6383: Missing text node
								if (href.match(urlRegexFull)) {
									return href;
								} else {
									return `<${href}>`;
								}
							}
							if (href.match(urlRegex) && !href.match(urlRegexFull)) {
								return `[${txt}](<${href}>)`;	// #6846
							} else {
								return `[${txt}](${href})`;
							}
						};

						text += generateLink();
					}
					return;
				}
			}

			// Don't produce invalid empty MFM
			if (node.childNodes.length < 1) {
				return;
			}

			switch (node.tagName) {
				case 'h1': {
					text += '**【';
					appendChildren(node.childNodes);
					text += '】**\n';
					break;
				}

				case 'h2':
				case 'h3': {
					text += '**';
					appendChildren(node.childNodes);
					text += '**\n';
					break;
				}

				case 'b':
				case 'strong': {
					text += '**';
					appendChildren(node.childNodes);
					text += '**';
					break;
				}

				case 'small': {
					text += '<small>';
					appendChildren(node.childNodes);
					text += '</small>';
					break;
				}

				case 's':
				case 'del': {
					text += '~~';
					appendChildren(node.childNodes);
					text += '~~';
					break;
				}

				case 'i':
				case 'em': {
					text += '<i>';
					appendChildren(node.childNodes);
					text += '</i>';
					break;
				}

				// this is here only to catch upstream changes!
				case 'ruby--': {
					let ruby: [string, string][] = [];
					for (const child of node.childNodes) {
						if (isText(child) && !/\s|\[|\]/.test(child.data)) {
							ruby.push([child.data, '']);
							continue;
						}
						if (!isTag(child)) {
							continue;
						}
						if (child.tagName === 'rp') {
							continue;
						}
						if (child.tagName === 'rt' && ruby.length > 0) {
							const rt = getText(child);
							if (/\s|\[|\]/.test(rt)) {
								// If any space is included in rt, it is treated as a normal text
								ruby = [];
								appendChildren(node.childNodes);
								break;
							} else {
								ruby.at(-1)![1] = rt;
								continue;
							}
						}
						// If any other element is included in ruby, it is treated as a normal text
						ruby = [];
						appendChildren(node.childNodes);
						break;
					}
					for (const [base, rt] of ruby) {
						text += `$[ruby ${base} ${rt}]`;
					}
					break;
				}

				// block code (<pre><code>)
				case 'pre': {
					if (node.childNodes.length === 1 && isTag(node.childNodes[0]) && node.childNodes[0].tagName === 'code') {
						text += '\n```\n';
						text += getText(node.childNodes[0]);
						text += '\n```\n';
					} else {
						appendChildren(node.childNodes);
					}
					break;
				}

				// inline code (<code>)
				case 'code': {
					text += '`';
					appendChildren(node.childNodes);
					text += '`';
					break;
				}

				case 'blockquote': {
					const t = getText(node);
					if (t) {
						text += '\n> ';
						text += t.split('\n').join('\n> ');
					}
					break;
				}

				case 'p':
				case 'h4':
				case 'h5':
				case 'h6': {
					text += '\n\n';
					appendChildren(node.childNodes);
					break;
				}

				// other block elements
				case 'div':
				case 'header':
				case 'footer':
				case 'article':
				case 'li':
				case 'dt':
				case 'dd': {
					text += '\n';
					appendChildren(node.childNodes);
					break;
				}

				case 'rp': break;
				case 'rt': {
					appendChildren(node.childNodes);
					break;
				}
				case 'ruby': {
					if (node.childNodes) {
						/*
							we get:
							```
							<ruby>
							some text <rp>(</rp> <rt>annotation</rt> <rp>)</rp>
							more text <rt>more annotation<rt>
							</ruby>
							```

							and we want to produce:
							```
							$[ruby $[group some text] annotation]
							$[ruby $[group more text] more annotation]
							```

							that `group` is a hack, because when the `ruby` render
							sees just text inside the `$[ruby]`, it splits on
							whitespace, considers the first "word" to be the main
							content, and the rest the annotation

							with that `group`, we force it to consider the whole
							group as the main content

							(note that the `rp` are to be ignored, they only exist
							for browsers who don't understand ruby)
						*/
						let nonRtNodes: ChildNode[] = [];
						// scan children, ignore `rp`, split on `rt`
						for (const child of node.childNodes) {
							if (isText(child)) {
								nonRtNodes.push(child);
								continue;
							}
							if (!isTag(child)) {
								continue;
							}
							if (child.tagName === 'rp') {
								continue;
							}
							if (child.tagName === 'rt') {
								// the only case in which we don't need a `$[group ]`
								// is when both sides of the ruby are simple words
								const needsGroup = nonRtNodes.length > 1 ||
									/\s|\[|\]/.test(getText(nonRtNodes[0])) ||
									/\s|\[|\]/.test(getText(child));
								text += '$[ruby ';
								if (needsGroup) text += '$[group ';
								appendChildren(nonRtNodes);
								if (needsGroup) text += ']';
								text += ' ';
								analyze(child);
								text += ']';
								nonRtNodes = [];
								continue;
							}
							nonRtNodes.push(child);
						}
						appendChildren(nonRtNodes);
					}
					break;
				}

				// Replace iframe with link so we can generate previews.
				// We shouldn't normally see this, but federated blogging platforms (WordPress, MicroBlog.Pub) can send it.
				case 'iframe': {
					const txt: string | undefined = node.attribs.title || node.attribs.alt;
					const href: string | undefined = node.attribs.src;
					if (href) {
						if (href.match(/[\s>]/)) {
							if (txt) {
								// href is invalid + has a label => render a pseudo-link
								text += `${text} (${href})`;
							} else {
								// href is invalid + no label => render plain text
								text += href;
							}
						} else {
							if (txt) {
								// href is valid + has a label => render a link
								const label = txt
									.replaceAll('[', '(')
									.replaceAll(']', ')')
									.replaceAll(/\r?\n/, ' ')
									.replaceAll('`', '\'');
								text += `[${label}](<${href}>)`;
							} else {
								// href is valid + no label => render a plain URL
								text += `<${href}>`;
							}
						}
					}
					break;
				}

				default:	// includes inline elements
				{
					appendChildren(node.childNodes);
					break;
				}
			}
		}
	}

	@bindThis
	public toHtml(nodes: mfm.MfmNode[] | null, mentionedRemoteUsers: IMentionedRemoteUsers = [], additionalAppenders: Appender[] = [], inline = false) {
		if (nodes == null) {
			return null;
		}

		const doc = new Document([]);

		const body = new Element('p', {});
		doc.childNodes.push(body);

		function appendChildren(children: mfm.MfmNode[], targetElement: ParentNode): void {
			for (const child of children.map(x => handle(x))) {
				targetElement.childNodes.push(child);
			}
		}

		function fnDefault(node: mfm.MfmFn) {
			const el = new Element('i', {});
			appendChildren(node.children, el);
			return el;
		}

		const handlers: { [K in mfm.MfmNode['type']]: (node: mfm.NodeType<K>) => ChildNode } = {
			bold: (node) => {
				const el = new Element('b', {});
				appendChildren(node.children, el);
				return el;
			},

			small: (node) => {
				const el = new Element('small', {});
				appendChildren(node.children, el);
				return el;
			},

			strike: (node) => {
				const el = new Element('del', {});
				appendChildren(node.children, el);
				return el;
			},

			italic: (node) => {
				const el = new Element('i', {});
				appendChildren(node.children, el);
				return el;
			},

			fn: (node) => {
				switch (node.props.name) {
					case 'unixtime': {
						const text = node.children[0].type === 'text' ? node.children[0].props.text : '';
						try {
							const date = new Date(parseInt(text, 10) * 1000);
							const el = new Element('time', {
								datetime: date.toISOString(),
							});
							el.childNodes.push(new Text(date.toISOString()));
							return el;
						} catch {
							return fnDefault(node);
						}
					}

					case 'ruby': {
						if (node.children.length === 1) {
							const child = node.children[0];
							const text = child.type === 'text' ? child.props.text : '';
							const rubyEl = new Element('ruby', {});
							const rtEl = new Element('rt', {});

							// ruby未対応のHTMLサニタイザーを通したときにルビが「劉備（りゅうび）」となるようにする
							const rpStartEl = new Element('rp', {});
							rpStartEl.childNodes.push(new Text('('));
							const rpEndEl = new Element('rp', {});
							rpEndEl.childNodes.push(new Text(')'));

							rubyEl.childNodes.push(new Text(text.split(' ')[0]));
							rtEl.childNodes.push(new Text(text.split(' ')[1]));
							rubyEl.childNodes.push(rpStartEl);
							rubyEl.childNodes.push(rtEl);
							rubyEl.childNodes.push(rpEndEl);
							return rubyEl;
						} else {
							const rt = node.children.at(-1);

							if (!rt) {
								return fnDefault(node);
							}

							const text = rt.type === 'text' ? rt.props.text : '';
							const rubyEl = new Element('ruby', {});
							const rtEl = new Element('rt', {});

							// ruby未対応のHTMLサニタイザーを通したときにルビが「劉備（りゅうび）」となるようにする
							const rpStartEl = new Element('rp', {});
							rpStartEl.childNodes.push(new Text('('));
							const rpEndEl = new Element('rp', {});
							rpEndEl.childNodes.push(new Text(')'));

							appendChildren(node.children.slice(0, node.children.length - 1), rubyEl);
							rtEl.childNodes.push(new Text(text.trim()));
							rubyEl.childNodes.push(rpStartEl);
							rubyEl.childNodes.push(rtEl);
							rubyEl.childNodes.push(rpEndEl);
							return rubyEl;
						}
					}

					// hack for ruby, should never be needed because we should
					// never send this out to other instances
					case 'group': {
						const el = new Element('span', {});
						appendChildren(node.children, el);
						return el;
					}

					default: {
						return fnDefault(node);
					}
				}
			},

			blockCode: (node) => {
				const pre = new Element('pre', {});
				const inner = new Element('code', {});
				inner.childNodes.push(new Text(node.props.code));
				pre.childNodes.push(inner);
				return pre;
			},

			center: (node) => {
				const el = new Element('div', {});
				appendChildren(node.children, el);
				return el;
			},

			emojiCode: (node) => {
				return new Text(`\u200B:${node.props.name}:\u200B`);
			},

			unicodeEmoji: (node) => {
				return new Text(node.props.emoji);
			},

			hashtag: (node) => {
				const a = new Element('a', {
					href: `${this.config.url}/tags/${node.props.hashtag}`,
					rel: 'tag',
				});
				a.childNodes.push(new Text(`#${node.props.hashtag}`));
				return a;
			},

			inlineCode: (node) => {
				const el = new Element('code', {});
				el.childNodes.push(new Text(node.props.code));
				return el;
			},

			mathInline: (node) => {
				const el = new Element('code', {});
				el.childNodes.push(new Text(node.props.formula));
				return el;
			},

			mathBlock: (node) => {
				const el = new Element('code', {});
				el.childNodes.push(new Text(node.props.formula));
				return el;
			},

			link: (node) => {
				const a = new Element('a', {
					href: node.props.url,
				});
				appendChildren(node.children, a);
				return a;
			},

			mention: (node) => {
				const { username, host, acct } = node.props;
				const remoteUserInfo = mentionedRemoteUsers.find(remoteUser => remoteUser.username.toLowerCase() === username.toLowerCase() && remoteUser.host?.toLowerCase() === host?.toLowerCase());

				const a = new Element('a', {
					href: remoteUserInfo
						? (remoteUserInfo.url ? remoteUserInfo.url : remoteUserInfo.uri)
						: `${this.config.url}/${acct.endsWith(`@${this.config.url}`) ? acct.substring(0, acct.length - this.config.url.length - 1) : acct}`,
					class: 'u-url mention',
				});
				a.childNodes.push(new Text(acct));
				return a;
			},

			quote: (node) => {
				const el = new Element('blockquote', {});
				appendChildren(node.children, el);
				return el;
			},

			text: (node) => {
				if (!node.props.text.match(/[\r\n]/)) {
					return new Text(node.props.text);
				}

				const el = new Element('span', {});
				const nodes = node.props.text.split(/\r\n|\r|\n/).map(x => new Text(x));

				for (const x of intersperse<FIXME | 'br'>('br', nodes)) {
					el.childNodes.push(x === 'br' ? new Element('br', {}) : x);
				}

				return el;
			},

			url: (node) => {
				const a = new Element('a', {
					href: node.props.url,
				});
				a.childNodes.push(new Text(node.props.url));
				return a;
			},

			search: (node) => {
				const a = new Element('a', {
					href: `https://www.google.com/search?q=${node.props.query}`,
				});
				a.childNodes.push(new Text(node.props.content));
				return a;
			},

			plain: (node) => {
				const el = new Element('span', {});
				appendChildren(node.children, el);
				return el;
			},
		};

		// Utility function to make TypeScript behave
		function handle<T extends mfm.MfmNode>(node: T): ChildNode {
			const handler = handlers[node.type] as (node: T) => ChildNode;
			return handler(node);
		}

		appendChildren(nodes, body);

		for (const additionalAppender of additionalAppenders) {
			additionalAppender(doc, body);
		}

		let result = domserializer.render(body, {
			encodeEntities: 'utf8'
		});

		if (inline) {
			result = result.replace(/^<p>/, '').replace(/<\/p>$/, '');
		}

		return result;
	}

	// the toMastoApiHtml function was taken from Iceshrimp and written by zotan and modified by marie to work with the current MK version
	// additionally modified by hazelnoot to remove async

	@bindThis
	public toMastoApiHtml(nodes: mfm.MfmNode[] | null, mentionedRemoteUsers: IMentionedRemoteUsers = [], inline = false, quoteUri: string | null = null) {
		if (nodes == null) {
			return null;
		}

		const doc = new Document([]);

		const body = new Element('p', {});
		doc.childNodes.push(body);

		function appendChildren(children: mfm.MfmNode[], targetElement: ParentNode): void {
			for (const child of children) {
				const result = handle(child);
				targetElement.childNodes.push(result);
			}
		}

		const handlers: {
			[K in mfm.MfmNode['type']]: (node: mfm.NodeType<K>) => ChildNode;
		} = {
			bold(node) {
				const el = new Element('span', {});
				el.childNodes.push(new Text('**'));
				appendChildren(node.children, el);
				el.childNodes.push(new Text('**'));
				return el;
			},

			small(node) {
				const el = new Element('small', {});
				appendChildren(node.children, el);
				return el;
			},

			strike(node) {
				const el = new Element('span', {});
				el.childNodes.push(new Text('~~'));
				appendChildren(node.children, el);
				el.childNodes.push(new Text('~~'));
				return el;
			},

			italic(node) {
				const el = new Element('span', {});
				el.childNodes.push(new Text('*'));
				appendChildren(node.children, el);
				el.childNodes.push(new Text('*'));
				return el;
			},

			fn(node) {
				switch (node.props.name) {
					case 'group': { // hack for ruby
						const el = new Element('span', {});
						appendChildren(node.children, el);
						return el;
					}
					case 'ruby': {
						if (node.children.length === 1) {
							const child = node.children[0];
							const text = child.type === 'text' ? child.props.text : '';
							const rubyEl = new Element('ruby', {});
							const rtEl = new Element('rt', {});

							const rpStartEl = new Element('rp', {});
							rpStartEl.childNodes.push(new Text('('));
							const rpEndEl = new Element('rp', {});
							rpEndEl.childNodes.push(new Text(')'));

							rubyEl.childNodes.push(new Text(text.split(' ')[0]));
							rtEl.childNodes.push(new Text(text.split(' ')[1]));
							rubyEl.childNodes.push(rpStartEl);
							rubyEl.childNodes.push(rtEl);
							rubyEl.childNodes.push(rpEndEl);
							return rubyEl;
						} else {
							const rt = node.children.at(-1);

							if (!rt) {
								const el = new Element('span', {});
								appendChildren(node.children, el);
								return el;
							}

							const text = rt.type === 'text' ? rt.props.text : '';
							const rubyEl = new Element('ruby', {});
							const rtEl = new Element('rt', {});

							const rpStartEl = new Element('rp', {});
							rpStartEl.childNodes.push(new Text('('));
							const rpEndEl = new Element('rp', {});
							rpEndEl.childNodes.push(new Text(')'));

							appendChildren(node.children.slice(0, node.children.length - 1), rubyEl);
							rtEl.childNodes.push(new Text(text.trim()));
							rubyEl.childNodes.push(rpStartEl);
							rubyEl.childNodes.push(rtEl);
							rubyEl.childNodes.push(rpEndEl);
							return rubyEl;
						}
					}

					default: {
						const el = new Element('span', {});
						el.childNodes.push(new Text('*'));
						appendChildren(node.children, el);
						el.childNodes.push(new Text('*'));
						return el;
					}
				}
			},

			blockCode(node) {
				const pre = new Element('pre', {});
				const inner = new Element('code', {});

				const nodes = node.props.code
					.split(/\r\n|\r|\n/)
					.map((x) => new Text(x));

				for (const x of intersperse<FIXME | 'br'>('br', nodes)) {
					inner.childNodes.push(x === 'br' ? new Element('br', {}) : x);
				}

				pre.childNodes.push(inner);
				return pre;
			},

			center(node) {
				const el = new Element('div', {});
				appendChildren(node.children, el);
				return el;
			},

			emojiCode(node) {
				return new Text(`\u200B:${node.props.name}:\u200B`);
			},

			unicodeEmoji(node) {
				return new Text(node.props.emoji);
			},

			hashtag: (node) => {
				const a = new Element('a', {
					href: `${this.config.url}/tags/${node.props.hashtag}`,
					rel: 'tag',
					class: 'hashtag',
				});
				a.childNodes.push(new Text(`#${node.props.hashtag}`));
				return a;
			},

			inlineCode(node) {
				const el = new Element('code', {});
				el.childNodes.push(new Text(node.props.code));
				return el;
			},

			mathInline(node) {
				const el = new Element('code', {});
				el.childNodes.push(new Text(node.props.formula));
				return el;
			},

			mathBlock(node) {
				const el = new Element('code', {});
				el.childNodes.push(new Text(node.props.formula));
				return el;
			},

			link(node) {
				const a = new Element('a', {
					rel: 'nofollow noopener noreferrer',
					target: '_blank',
					href: node.props.url,
				});
				appendChildren(node.children, a);
				return a;
			},

			mention(node) {
				const { username, host, acct } = node.props;
				const resolved = mentionedRemoteUsers.find(remoteUser => remoteUser.username === username && remoteUser.host === host);

				const el = new Element('span', {});
				if (!resolved) {
					el.childNodes.push(new Text(acct));
				} else {
					el.attribs.class = 'h-card';
					el.attribs.translate = 'no';
					const a = new Element('a', {
						href: resolved.url ? resolved.url : resolved.uri,
						class: 'u-url mention',
					});
					const span = new Element('span', {});
					span.childNodes.push(new Text(resolved.username || username));
					a.childNodes.push(new Text('@'));
					a.childNodes.push(span);
					el.childNodes.push(a);
				}

				return el;
			},

			quote(node) {
				const el = new Element('blockquote', {});
				appendChildren(node.children, el);
				return el;
			},

			text(node) {
				if (!node.props.text.match(/[\r\n]/)) {
					return new Text(node.props.text);
				}

				const el = new Element('span', {});
				const nodes = node.props.text
					.split(/\r\n|\r|\n/)
					.map((x) => new Text(x));

				for (const x of intersperse<FIXME | 'br'>('br', nodes)) {
					el.childNodes.push(x === 'br' ? new Element('br', {}) : x);
				}

				return el;
			},

			url(node) {
				const a = new Element('a', {
					rel: 'nofollow noopener noreferrer',
					target: '_blank',
					href: node.props.url,
				});
				a.childNodes.push(new Text(node.props.url.replace(/^https?:\/\//, '')));
				return a;
			},

			search: (node) => {
				const a = new Element('a', {
					href: `https://www.google.com/search?q=${node.props.query}`,
				});
				a.childNodes.push(new Text(node.props.content));
				return a;
			},

			plain(node) {
				const el = new Element('span', {});
				appendChildren(node.children, el);
				return el;
			},
		};

		// Utility function to make TypeScript behave
		function handle<T extends mfm.MfmNode>(node: T): ChildNode {
			const handler = handlers[node.type] as (node: T) => ChildNode;
			return handler(node);
		}

		appendChildren(nodes, body);

		if (quoteUri !== null) {
			const a = new Element('a', {
				href: quoteUri,
			});
			a.childNodes.push(new Text(quoteUri.replace(/^https?:\/\//, '')));

			const quote = new Element('span', {
				class: 'quote-inline',
			});
			quote.childNodes.push(new Element('br', {}));
			quote.childNodes.push(new Element('br', {}));
			quote.childNodes.push(new Text('RE: '));
			quote.childNodes.push(a);

			body.childNodes.push(quote);
		}

		let result = domserializer.render(body, {
			encodeEntities: 'utf8'
		});

		if (inline) {
			result = result.replace(/^<p>/, '').replace(/<\/p>$/, '');
		}

		return result;
	}
}

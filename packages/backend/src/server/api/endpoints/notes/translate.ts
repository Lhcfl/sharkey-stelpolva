/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URLSearchParams } from 'node:url';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { MetaService } from '@/core/MetaService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		optional: true, nullable: false,
		properties: {
			sourceLang: { type: 'string' },
			text: { type: 'string' },
		},
	},

	errors: {
		unavailable: {
			message: 'Translate of notes unavailable.',
			code: 'UNAVAILABLE',
			id: '50a70314-2d8a-431b-b433-efa5cc56444c',
		},
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'bea9b03f-36e0-49c5-a4db-627a029f8971',
		},
		cannotTranslateInvisibleNote: {
			message: 'Cannot translate invisible note.',
			code: 'CANNOT_TRANSLATE_INVISIBLE_NOTE',
			id: 'ea29f2ca-c368-43b3-aaf1-5ac3e74bbe5d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		targetLang: { type: 'string' },
	},
	required: ['noteId', 'targetLang'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private noteEntityService: NoteEntityService,
		private getterService: GetterService,
		private metaService: MetaService,
		private httpRequestService: HttpRequestService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me.id);
			if (!policies.canUseTranslator) {
				throw new ApiError(meta.errors.unavailable);
			}

			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			if (!(await this.noteEntityService.isVisibleForMe(note, me.id))) {
				throw new ApiError(meta.errors.cannotTranslateInvisibleNote);
			}

			if (note.text == null) {
				return;
			}

			const instance = await this.metaService.fetch();

			let targetLang = ps.targetLang;
			if (targetLang.includes('-')) targetLang = targetLang.split('-')[0];

			const translateByGoogle = async (text: string) => {
				const MAX_TRANSLATE = 15000;
				const MAX_TRANSLATE_PER_REQ = 1500;

				const toTranslate: string[] = [];

				for (
					let i = 0;
					i < text.length && i < MAX_TRANSLATE;
					i += MAX_TRANSLATE_PER_REQ
				) {
					toTranslate.push(text.slice(i, i + MAX_TRANSLATE_PER_REQ));
				}

				const googleTranslate = async (toTranslate: string) => {
					const googleUrl = new URL(
						'https://translate.google.com/translate_a/single?client=gtx&dt=t&dj=1&ie=UTF-8&sl=auto',
					);
					googleUrl.searchParams.append('tl', targetLang);
					googleUrl.searchParams.append('q', toTranslate);

					const res = await this.httpRequestService.send(googleUrl.toString());
					const json = (await res.json()) as {
						sentences: {
							/** translated text */
							trans: string;
							/** original text */
							orig: string;
						}[];
						src: string;
					};

					return {
						sourceLang: json.src,
						text: json.sentences.map((s) => s.trans).join(' '),
					};
				};

				const result: {
					sourceLang: string;
					text: string;
				} = {
					sourceLang: '',
					text: '',
				};

				for (const text of toTranslate) {
					// If it is not the first request, sleep 500 milliseconds to prevent 429 too many requests.
					if (!result.text) {
						await new Promise((r) => setTimeout(r, 500));
					}
					try {
						const res = await googleTranslate(text);
						result.sourceLang ||= res.sourceLang;
						result.text += res.text;
					} catch (err) {
						console.error(err);
						result.text += '... (an error occurred during translate)';
						return result;
					}
				}

				if (text.length > MAX_TRANSLATE + MAX_TRANSLATE_PER_REQ) {
					result.text += '... (text is too long to translate)';
				}

				return result;
			};

			if (instance.deeplAuthKey == null && !instance.deeplFreeMode || instance.deeplFreeMode && !instance.deeplFreeInstance) {
				return await translateByGoogle(note.text);
			}

			const params = new URLSearchParams();
			if (instance.deeplAuthKey) params.append('auth_key', instance.deeplAuthKey);
			params.append('text', note.text);
			params.append('target_lang', targetLang);

			const endpoint = instance.deeplFreeMode && instance.deeplFreeInstance ? instance.deeplFreeInstance : instance.deeplIsPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';

			const res = await this.httpRequestService.send(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json, */*',
				},
				body: params.toString(),
			});
			if (instance.deeplAuthKey) {
				const json = (await res.json()) as {
					translations: {
						detected_source_language: string;
						text: string;
					}[];
				};

				return {
					sourceLang: json.translations[0].detected_source_language,
					text: json.translations[0].text,
				};
			} else {
				const json = (await res.json()) as {
					code: number,
					message: string,
					data: string,
					source_lang: string,
					target_lang: string,
					alternatives: string[],
				};

				const languageNames = new Intl.DisplayNames(['en'], {
					type: 'language',
				});

				return {
					sourceLang: languageNames.of(json.source_lang),
					text: json.data,
				};
			}
		});
	}
}

import { miLocalStorage } from '@/local-storage.js';

const defaultFontsList = [
	'sharkey-default',
	'roboto',
	'misskey-biz',
	'arial',
	'times',
	'system-ui',
];

export async function loadFontStyle(fontId: string) {
	if (defaultFontsList.includes(fontId)) return;
	if (fontId === 'custom') {
		const font = miLocalStorage.getItem('customFontFaceName') ?? 'Arial';
		window.document.documentElement.style.setProperty('--STPV_custom-fontface', font);
		return;
	}
	try {
		await import(`@/styles-font/${fontId}.scss`);
	} catch (err) {
		console.warn(`Failed to load font style: ${fontId}`, err);
	}
}

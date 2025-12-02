/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

'use strict';

window.onload = async () => {
	const content = document.getElementById('content');

	document.getElementById('ls')?.addEventListener('click', () => {
		if (content) content.innerHTML = '';

		const lsEditor = document.createElement('div');
		lsEditor.id = 'lsEditor';

		const adder = document.createElement('div');
		adder.classList.add('adder');
		const addKeyInput = document.createElement('input');
		const addValueTextarea = document.createElement('textarea');
		const addButton = document.createElement('button');
		addButton.textContent = 'add';
		addButton.addEventListener('click', () => {
			localStorage.setItem(addKeyInput.value, addValueTextarea.value);
			location.reload();
		});

		adder.appendChild(addKeyInput);
		adder.appendChild(addValueTextarea);
		adder.appendChild(addButton);
		lsEditor.appendChild(adder);

		for (let i = 0; i < localStorage.length; i++) {
			const k = /** @type {string} */ (localStorage.key(i));
			const record = document.createElement('div');
			record.classList.add('record');
			const header = document.createElement('header');
			header.textContent = k;
			const textarea = document.createElement('textarea');
			textarea.textContent = localStorage.getItem(k);
			const saveButton = document.createElement('button');
			saveButton.textContent = 'save';
			saveButton.addEventListener('click', () => {
				localStorage.setItem(k, textarea.value);
				location.reload();
			});
			const removeButton = document.createElement('button');
			removeButton.textContent = 'remove';
			removeButton.addEventListener('click', () => {
				localStorage.removeItem(k);
				location.reload();
			});
			record.appendChild(header);
			record.appendChild(textarea);
			record.appendChild(saveButton);
			record.appendChild(removeButton);
			lsEditor.appendChild(record);
		}

		content?.appendChild(lsEditor);
	});
};

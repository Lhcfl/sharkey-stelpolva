/*
 * SPDX-FileCopyrightText: leah and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import tinycolor from 'tinycolor2';

class FavIconDot {
	private readonly canvas: HTMLCanvasElement;
	private src: string | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private faviconImage: HTMLImageElement | null = null;
	private faviconEL: HTMLLinkElement | undefined;
	private hasLoaded: Promise<void> | undefined;

	constructor() {
		this.canvas = window.document.createElement('canvas');
	}

	/**
	 * Must be called before calling any other functions
	 */
	public async setup() {
		this.faviconEL = await this.getOrMakeFaviconElement();
		this.src = this.faviconEL.getAttribute('href');
		this.ctx = this.canvas.getContext('2d');

		this.faviconImage = window.document.createElement('img');
		this.faviconImage.crossOrigin = 'anonymous';

		this.hasLoaded = new Promise((resolve, reject) => {
			(this.faviconImage as HTMLImageElement).addEventListener('load', () => {
				this.canvas.width = (this.faviconImage as HTMLImageElement).width;
				this.canvas.height = (this.faviconImage as HTMLImageElement).height;
				resolve();
			});
			(this.faviconImage as HTMLImageElement).addEventListener('error', () => {
				reject('Failed to create favicon img element');
			});
		});

		this.faviconImage.src = this.faviconEL.href;
	}

	private async getOrMakeFaviconElement(): Promise<HTMLLinkElement> {
		return new Promise((resolve, reject) => {
			const favicon = (window.document.querySelector('link[rel=icon]') ?? this.createFaviconElem()) as HTMLLinkElement;
			favicon.addEventListener('load', () => {
				resolve(favicon);
			});

			favicon.onerror = () => {
				reject('Failed to load favicon');
			};
			resolve(favicon);
		});
	}

	private createFaviconElem() {
		const newLink = window.document.createElement('link');
		newLink.setAttribute('rel', 'icon');
		newLink.setAttribute('href', '/favicon.ico');
		newLink.setAttribute('type', 'image/x-icon');

		window.document.head.appendChild(newLink);
		return newLink;
	}

	private drawIcon() {
		if (!this.ctx || !this.faviconImage) return;
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.drawImage(this.faviconImage, 0, 0, this.faviconImage.width, this.faviconImage.height);
	}

	private drawDot() {
		if (!this.ctx || !this.faviconImage) return;
		this.ctx.beginPath();
		const radius = Math.min(this.faviconImage.width, this.faviconImage.height) * 0.2;
		this.ctx.arc(this.faviconImage.width - radius, radius, radius, 0, 2 * Math.PI);
		const computedStyle = getComputedStyle(window.document.documentElement);
		this.ctx.fillStyle = tinycolor(computedStyle.getPropertyValue('--MI_THEME-navIndicator')).toHexString();
		this.ctx.strokeStyle = 'white';
		this.ctx.fill();
		this.ctx.stroke();
	}

	private setFavicon() {
		if (this.faviconEL) {
			try {
				URL.revokeObjectURL(this.faviconEL.href);
			} catch {
				// the href was probably not an object URL
			}
			this.canvas.toBlob((blob) => {
				const url = URL.createObjectURL(blob);
				this.faviconEL.href = url;
			});
		}
	}

	public async setVisible(isVisible: boolean) {
		// Wait for it to have loaded the icon
		await this.hasLoaded;
		this.drawIcon();
		if (isVisible) this.drawDot();
		this.setFavicon();
	}

	public async worksOnInstance() {
		try {
			await this.setVisible(true);
			await new Promise((resolve) => window.setTimeout(resolve, 1000));
			await this.setVisible(false);
		} catch (error) {
			console.error('error setting notification dot', error);
			return false;
		}
		return true;
	}
}

let icon: FavIconDot | undefined = undefined;

export async function setFavIconDot(visible: boolean) {
	const setIconVisibility = async () => {
		if (!icon) {
			icon = new FavIconDot();
			await icon.setup();
		}

		try {
			(icon as FavIconDot).setVisible(visible);
		} catch (error) {
			console.error('error setting notification dot', error);
		}
	};

	// If document is already loaded, set visibility immediately
	if (window.document.readyState === 'complete') {
		await setIconVisibility();
	} else {
		// Otherwise, set visibility when window loads
		window.addEventListener('load', setIconVisibility);
	}
}

export async function worksOnInstance() {
	if (!icon) {
		icon = new FavIconDot();
		await icon.setup();
	}

	return await icon.worksOnInstance();
}

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
		this.canvas = document.createElement('canvas');
	}

	/**
	 * Must be called before calling any other functions
	 */
	public async setup() {
		const element: HTMLLinkElement = await this.getOrMakeFaviconElement();

		this.faviconEL = element;
		this.src = this.faviconEL.getAttribute('href');
		this.ctx = this.canvas.getContext('2d');

		this.faviconImage = document.createElement('img');

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
			const favicon = (document.querySelector('link[rel=icon]') ?? this.createFaviconElem()) as HTMLLinkElement;
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
		const newLink = document.createElement('link');
		newLink.setAttribute('rel', 'icon');
		newLink.setAttribute('href', '/favicon.ico');
		newLink.setAttribute('type', 'image/x-icon');

		document.head.appendChild(newLink);
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
		this.ctx.arc(this.faviconImage.width - 10, 10, 10, 0, 2 * Math.PI);
		const computedStyle = getComputedStyle(document.documentElement);
		this.ctx.fillStyle = tinycolor(computedStyle.getPropertyValue('--navIndicator')).toHexString();
		this.ctx.strokeStyle = 'white';
		this.ctx.fill();
		this.ctx.stroke();
	}

	private setFavicon() {
		if (this.faviconEL) this.faviconEL.href = this.canvas.toDataURL('image/png');
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
			// Wait for it to have loaded the icon
			await this.hasLoaded;
			this.drawIcon();
			this.drawDot();
			this.canvas.toDataURL('image/png');
		} catch (error) {
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
			//Probably failed due to CORS and a dirty canvas
		}
	};

	// If document is already loaded, set visibility immediately
	if (document.readyState === 'complete') {
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

import type { History } from './history.js';

export interface Tag {
	name: string
	url: string
	history: Array<History>
	following?: boolean
}

import type { Status } from './status.js';

export interface Context {
	ancestors: Array<Status>
	descendants: Array<Status>
}

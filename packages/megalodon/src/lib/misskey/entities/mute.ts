import type { UserDetail } from './userDetail.js';

export interface Mute {
	id: string
	createdAt: string
	muteeId: string
	mutee: UserDetail
}

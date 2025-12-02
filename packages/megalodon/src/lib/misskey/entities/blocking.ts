import type { UserDetail } from './userDetail.js';

export interface Blocking {
	id: string
	createdAt: string
	blockeeId: string
	blockee: UserDetail
}

import type { UserDetail } from './userDetail.js';

export interface Follower {
	id: string
	createdAt: string
	followeeId: string
	followerId: string
	follower: UserDetail
}

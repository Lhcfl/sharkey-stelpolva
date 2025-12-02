import type { UserDetail } from './userDetail.js';

export interface Following {
	id: string
	createdAt: string
	followeeId: string
	followerId: string
	followee: UserDetail
}

import type { User } from './user.js';

export interface FollowRequest {
	id: string
	follower: User
	followee: User
}

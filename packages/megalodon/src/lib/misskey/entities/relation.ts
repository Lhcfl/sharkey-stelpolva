export interface Relation {
	id: string
	isFollowing: boolean
	hasPendingFollowRequestFromYou: boolean
	hasPendingFollowRequestToYou: boolean
	isFollowed: boolean
	isBlocking: boolean
	isBlocked: boolean
	isMuted: boolean
	isRenoteMuted: boolean
	isInstanceMuted?: boolean
	memo?: string | null
}

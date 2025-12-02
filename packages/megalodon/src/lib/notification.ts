export const Follow = 'follow' as const;
export const Favourite = 'favourite' as const;
export const Reblog = 'reblog' as const;
export const Mention = 'mention' as const;
export const EmojiReaction = 'emoji_reaction' as const;
export const FollowRequest = 'follow_request' as const;
export const Status = 'status' as const;
export const PollVote = 'poll_vote' as const;
export const PollExpired = 'poll_expired' as const;
export const Update = 'update' as const;
export const Move = 'move' as const;
export const AdminSignup = 'admin.sign_up' as const;
export const AdminReport = 'admin.report' as const;

export class UnknownNotificationTypeError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;
}

export const notificationTypes = [
	Follow,
	Favourite,
	Reblog,
	Mention,
	EmojiReaction,
	FollowRequest,
	Status,
	PollVote,
	PollExpired,
	Update,
	Move,
	AdminSignup,
	AdminReport,
];

export type NotificationType = typeof notificationTypes[number];

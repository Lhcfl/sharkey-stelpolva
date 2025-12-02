export const Mention = 'mention' as const;
export const Reblog = 'reblog' as const;
export const Favourite = 'favourite' as const;
export const Follow = 'follow' as const;
export const Poll = 'poll' as const;
export const FollowRequest = 'follow_request' as const;
export const Status = 'status' as const;
export const Update = 'update' as const;
export const AdminSignup = 'admin.sign_up' as const;
export const AdminReport = 'admin.report' as const;
export const Reaction = 'reaction' as const;
export const ModerationWarning = 'moderation_warning' as const;
export const SeveredRelationships = 'severed_relationships' as const;
export const AnnualReport = 'annual_report' as const;

export const mastodonNotificationTypes = [
	Mention,
	Reblog,
	Favourite,
	Follow,
	Poll,
	FollowRequest,
	Status,
	Update,
	AdminSignup,
	AdminReport,
	Reaction,
	ModerationWarning,
	SeveredRelationships,
	AnnualReport,
];

export type MastodonNotificationType = typeof mastodonNotificationTypes[number];

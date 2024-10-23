export const stpvDefaultStoreExtension = {
	chineseAutospacing: {
		where: 'device',
		default: null as 'all' | 'special' | null,
	},
	stpvDisableAllReactions: {
		where: 'device',
		default: false as boolean,
	},
	stpvClientMutedUsers: {
		where: 'account',
		default: [] as string[],
	},
	stpvClientMutedNotes: {
		where: 'account',
		default: [] as string[],
	},
	stpvClientMutedDomains: {
		where: 'account',
		default: [] as string[],
	},
} as const;

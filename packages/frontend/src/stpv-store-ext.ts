export const stpvDefaultStoreExtension = {
	chineseAutospacing: {
		where: 'device',
		default: null as 'all' | 'special' | null,
	},
	stpvDisableAllReactions: {
		where: 'device',
		default: false as boolean,
	},
} as const;

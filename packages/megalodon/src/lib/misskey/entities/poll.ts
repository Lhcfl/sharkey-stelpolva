export interface Choice {
	text: string
	votes: number
	isVoted: boolean
}

export interface Poll {
	multiple: boolean
	expiresAt: string
	choices: Array<Choice>
}

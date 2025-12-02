export interface App {
	id: string
	name: string
	callbackUrl: string
	permission: Array<string>
	secret?: string
}

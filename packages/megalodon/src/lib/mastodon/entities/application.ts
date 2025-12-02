export interface Application {
	name: string
	website?: string | null
	vapid_key?: string | null
	scopes: string[]
	redirect_uris: string[]
	redirect_uri?: string
}

/// <reference path="user.ts" />
/// <reference path="note.ts" />

namespace MisskeyEntity {
  export type Reaction = {
    id: string
    createdAt: string
    user: User
    type: string
  }

	export type NoteReaction = Reaction & {
		note: Note
	}
}

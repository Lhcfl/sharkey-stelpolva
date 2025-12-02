import type { User } from './user.js';
import type { Note } from './note.js';

export interface Reaction {
	id: string
	createdAt: string
	user: User
	type: string
}

export interface NoteReaction extends Reaction {
	note: Note
}

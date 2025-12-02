import type { Note } from './note.js';

export interface Favorite {
	id: string
	createdAt: string
	noteId: string
	note: Note
}

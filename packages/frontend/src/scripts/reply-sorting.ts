import * as Misskey from 'misskey-js';

// sorts replies to self before other replies to make threads easier to read
export function sortReplies(root: Misskey.entities.Note, replies: Misskey.entities.Note[]): Misskey.entities.Note[] {
	const result: Misskey.entities.Note[] = [];

	for (const reply of replies) {
		if (root.userId === reply.userId) {
			result.unshift(reply);
		} else {
			result.push(reply);
		}
	}

	return result;
}


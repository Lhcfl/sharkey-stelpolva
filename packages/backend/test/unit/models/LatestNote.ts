import { SkLatestNote } from '@/models/LatestNote.js';
import { MiNote } from '@/models/Note.js';

describe(SkLatestNote, () => {
	describe('keyFor', () => {
		it('should include userId', () => {
			const note = new MiNote({ userId: 'abc123', fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.userId).toBe(note.userId);
		});

		it('should include isPublic when is public', () => {
			const note = new MiNote({ visibility: 'public', fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isPublic).toBeTruthy();
		});

		it('should include isPublic when is home-only', () => {
			const note = new MiNote({ visibility: 'home', fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isPublic).toBeFalsy();
		});

		it('should include isPublic when is followers-only', () => {
			const note = new MiNote({ visibility: 'followers', fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isPublic).toBeFalsy();
		});

		it('should include isPublic when is specified', () => {
			const note = new MiNote({ visibility: 'specified', fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isPublic).toBeFalsy();
		});

		it('should include isReply when is reply', () => {
			const note = new MiNote({ replyId: 'abc123', fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isReply).toBeTruthy();
		});

		it('should include isReply when is not reply', () => {
			const note = new MiNote({ replyId: null, fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isReply).toBeFalsy();
		});

		it('should include isQuote when is quote', () => {
			const note = new MiNote({ renoteId: 'abc123', text: 'text', fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isQuote).toBeTruthy();
		});

		it('should include isQuote when is reblog', () => {
			const note = new MiNote({ renoteId: 'abc123', fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isQuote).toBeFalsy();
		});

		it('should include isQuote when is neither quote nor reblog', () => {
			const note = new MiNote({ renoteId: null, fileIds: [] });
			const key = SkLatestNote.keyFor(note);
			expect(key.isQuote).toBeFalsy();
		});
	});
});

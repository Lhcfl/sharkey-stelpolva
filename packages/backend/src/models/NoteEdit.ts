import { Entity, JoinColumn, Column, ManyToOne, PrimaryColumn, Index } from 'typeorm';
import { id } from './util/id.js';
import { MiNote } from './Note.js';
import type { MiDriveFile } from './DriveFile.js';

@Entity()
export class NoteEdit {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The ID of note.',
	})
	public noteId: MiNote['id'];

	@ManyToOne((type) => MiNote, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public note: MiNote | null;

	@Column('text', {
		nullable: true,
	})
	public oldText: string | null;

	@Column('text', {
		nullable: true,
	})
	public newText: string | null;

	@Column('varchar', {
		length: 512,
		nullable: true,
	})
	public cw: string | null;

	@Column('varchar', {
		length: 10,
		nullable: true,
	})
	public lang: string | null;

	@Column({
		...id(),
		array: true,
		default: '{}',
	})
	public fileIds: MiDriveFile['id'][];

	@Column('timestamp with time zone', {
		comment: 'The updated date of the Note.',
	})
	public updatedAt: Date;

	@Column('timestamp with time zone', {
		comment: 'The old date from before the edit',
	})
	public oldDate: Date;
}

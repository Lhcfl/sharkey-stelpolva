/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, PrimaryColumn, Index, Column, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiApp } from './App.js';

export const accessTokenRanks = ['user', 'mod', 'admin'] as const;
export type AccessTokenRank = typeof accessTokenRanks[number];

@Entity('access_token')
export class MiAccessToken {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public lastUsedAt: Date | null;

	@Index()
	@Column('varchar', {
		length: 128,
	})
	public token: string;

	@Index()
	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public session: string | null;

	@Index()
	@Column('varchar', {
		length: 128,
	})
	public hash: string;

	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column({
		...id(),
		nullable: true,
	})
	public appId: MiApp['id'] | null;

	@ManyToOne(type => MiApp, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public app: MiApp | null;

	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public name: string | null;

	@Column('varchar', {
		length: 512,
		nullable: true,
	})
	public description: string | null;

	@Column('varchar', {
		length: 512,
		nullable: true,
	})
	public iconUrl: string | null;

	@Column('varchar', {
		length: 64, array: true,
		default: '{}',
	})
	public permission: string[];

	@Column('boolean', {
		default: false,
	})
	public fetched: boolean;

	@Column('enum', {
		enum: accessTokenRanks,
		nullable: true,
		comment: 'Limits the user\' rank (user, moderator, or admin) when using this token. If null (default), then uses the user\'s actual rank.',
	})
	public rank: AccessTokenRank | null;

	@Index('IDX_access_token_granteeIds', { synchronize: false })
	@Column({
		...id(),
		array: true, default: '{}',
		comment: 'IDs of other users who are permitted to access and use this token.',
	})
	public granteeIds: string[];

	public constructor(props?: Partial<MiAccessToken>) {
		if (props) {
			Object.assign(this, props);
		}
	}
}

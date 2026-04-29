/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import type { AntennasRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { type Channel, NoteChannel, type MiChannelService } from '../channel.js';

class AntennaChannel extends NoteChannel {
	public readonly chName = 'antenna';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private antennaId: string;

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,

		private antennasRepository: AntennasRepository,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.user) return false;
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);

		if (typeof params.antennaId !== 'string') return false;
		this.antennaId = params.antennaId;

		const antenna = await this.antennasRepository.findOne({
			select: { id: true, userId: true },
			where: { id: this.antennaId },
		});
		if (!antenna) return false;
		if (antenna.userId !== this.user.id) return false;

		this.subscriber.on(`antennaStream:${this.antennaId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['antenna']['payload']) {
		const preparedNote = await this.noteEntityService.pack(data.body.id, this.user, { detail: true });

		// TODO this duplicate work could be avoided if the visibility data were returned from NoteEntityService.pack().
		const { accessible, silence } = await this.noteVisibilityService.checkNoteVisibilityAsync(preparedNote, this.user);
		if (!accessible || silence) return;

		this.send('note', preparedNote);
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber?.off(`antennaStream:${this.antennaId}`, this.onEvent);
	}
}

@Injectable()
export class AntennaChannelService implements MiChannelService<true> {
	public readonly shouldShare = AntennaChannel.shouldShare;
	public readonly requireCredential = AntennaChannel.requireCredential;
	public readonly kind = AntennaChannel.kind;

	constructor(
		@Inject(DI.antennasRepository)
		private readonly antennasRepository: AntennasRepository,

		private readonly noteEntityService: NoteEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): AntennaChannel {
		return new AntennaChannel(
			id,
			connection,
			this.noteEntityService,
			this.antennasRepository,
		);
	}
}

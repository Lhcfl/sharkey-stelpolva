import { expectType } from 'tsd';
import * as Misskey from '../src/index.js';
import Stream from '../src/streaming.js';

describe('Streaming', () => {
	test('emit type', async () => {
		const stream = new Stream('https://misskey.test', { token: 'TOKEN' });
		const mainChannel = stream.useChannel('main');
		mainChannel.on('notification', notification => {
			expectType<Misskey.entities.Notification>(notification);
		});
	});
});

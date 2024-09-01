import { Inject, Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import {
	collectDefaultMetrics,
	Registry,
} from "prom-client";
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

@Injectable()
export class MetricsServerService {
	private register: Registry;

	constructor(
	) {
		this.register = new Registry()
		collectDefaultMetrics({
			register: this.register,
		});
	}

 	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.get('/', async (request, reply) => {
			reply.code(200).send(
				await this.register.metrics()
			);
		});
		done()
	}
}

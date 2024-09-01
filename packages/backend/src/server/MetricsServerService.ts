import { Inject, Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import {
	AggregatorRegistry,
	collectDefaultMetrics,
} from "prom-client";
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

@Injectable()
export class MetricsServerService {
	private register: AggregatorRegistry;

	constructor(
	) {
		this.register = new AggregatorRegistry()
		collectDefaultMetrics({
			register: this.register,
		});
	}

 	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.get('/', async (request, reply) => {
			reply.code(200).send(
				await this.register.clusterMetrics()
			);
		});
		done()
	}
}

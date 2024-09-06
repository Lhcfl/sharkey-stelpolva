import { register, Counter, Gauge } from 'prom-client'

export const jobs_metrics = new Counter({
	name: "sharkey_jobs",
	help: "Metrics about jobs",
	labelNames: ['job', 'status', 'reason'] as const,
});

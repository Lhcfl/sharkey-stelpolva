import { DataSource } from 'typeorm';
import { loadConfig } from './built/config.js';
import { entities } from './built/postgres.js';
import { isConcurrentIndexMigrationEnabled } from "./migration/js/migration-config.js";
import { LoggerService } from './built/core/LoggerService.js';
import { NativeTimeService } from './built/global/TimeService.js';
import { EnvService } from './built/global/EnvService.js';

const loggerService = new LoggerService(console, new NativeTimeService(), new EnvService());
const config = loadConfig(loggerService);

export default new DataSource({
	type: 'postgres',
	host: config.db.host,
	port: config.db.port,
	username: config.db.user,
	password: config.db.pass,
	database: config.db.db,
	extra: {
		...config.db.extra,
		// migrations may be very slow, give them longer to run (that 10*1000 comes from postgres.ts)
		statement_timeout: (config.db.extra?.statement_timeout ?? 1000 * 10) * 100,
	},
	entities: entities,
	migrations: ['migration/*.js'],
	migrationsTransactionMode: isConcurrentIndexMigrationEnabled() ? 'each' : 'all',
});

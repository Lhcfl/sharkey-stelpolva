/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import chalk from 'chalk';
import { default as convertColor } from 'color-convert';
import { format as dateFormat } from 'date-fns';
import { bindThis } from '@/decorators.js';
import { TimeService, NativeTimeService } from '@/global/TimeService.js';
import { EnvService } from '@/global/EnvService.js';
import type { KEYWORD } from 'color-convert/conversions.js';

type Context = {
	name: string;
	color?: KEYWORD;
};

type Level = 'error' | 'success' | 'warning' | 'debug' | 'info';

export type Data = DataElement | DataElement[];
export type DataElement = DataObject | Error | string | null;
// https://stackoverflow.com/questions/61148466/typescript-type-that-matches-any-object-but-not-arrays
export type DataObject = Record<string, unknown> | (object & { length?: never; });

export type Console = Pick<typeof global.console, 'error' | 'warn' | 'info' | 'log' | 'debug'>;
export const nativeConsole: Console = global.console;

const fallbackTimeService = new NativeTimeService();
const fallbackEnvService = new EnvService();

const levelFuncs = {
	error: 'error',
	warning: 'warn',
	success: 'info',
	info: 'log',
	debug: 'debug',
} as const satisfies Record<Level, keyof Console>;

// eslint-disable-next-line import/no-default-export
export default class Logger {
	private context: Context;
	private parentLogger: Logger | null = null;
	private readonly timeService: TimeService;
	private readonly envService: EnvService;

	/**
	 * Where to send the actual log strings.
	 * Defaults to the native global.console instance.
	 */
	private readonly console: Console;

	constructor(context: string, color?: KEYWORD, envService?: EnvService, timeService?: TimeService, console?: Console) {
		this.context = {
			name: context,
			color: color,
		};
		this.envService = envService ?? fallbackEnvService;
		this.console = console ?? nativeConsole;
		this.timeService = timeService ?? fallbackTimeService;
	}

	@bindThis
	public createSubLogger(context: string, color?: KEYWORD): Logger {
		const logger = new Logger(context, color, this.envService, this.timeService, this.console);
		logger.parentLogger = this;
		return logger;
	}

	@bindThis
	private log(level: Level, message: string, data?: Data, important = false, subContexts: Context[] = []): void {
		if (this.envService.options.quiet) return;

		// Debugging logging is disabled in production unless MK_VERBOSE is set.
		if (level === 'debug' && this.envService.env.NODE_ENV === 'production' && !this.envService.options.verbose) {
			return;
		}

		if (this.parentLogger) {
			this.parentLogger.log(level, message, data, important, [this.context].concat(subContexts));
			return;
		}

		const time = dateFormat(this.timeService.date, 'HH:mm:ss');
		const worker = cluster.isPrimary ? '*' : cluster.worker!.id;
		const l =
			level === 'error' ? important ? chalk.bgRed.white('ERR ') : chalk.red('ERR ') :
			level === 'warning' ? chalk.yellow('WARN') :
			level === 'success' ? important ? chalk.bgGreen.white('DONE') : chalk.green('DONE') :
			level === 'debug' ? chalk.gray('VERB') :
			level === 'info' ? chalk.blue('INFO') :
			null;
		const contexts = [this.context].concat(subContexts).map(d => d.color ? chalk.rgb(...convertColor.keyword.rgb(d.color))(d.name) : chalk.white(d.name));
		const m =
			level === 'error' ? chalk.red(message) :
			level === 'warning' ? chalk.yellow(message) :
			level === 'success' ? chalk.green(message) :
			level === 'debug' ? chalk.gray(message) :
			level === 'info' ? message :
			null;

		let log = this.envService.options.hideWorkerId
			? `${l}\t[${contexts.join(' ')}]\t\t${m}`
			: `${l} ${worker}\t[${contexts.join(' ')}]\t\t${m}`;
		if (this.envService.options.withLogTime) log = chalk.gray(time) + ' ' + log;

		const args: unknown[] = [important ? chalk.bold(log) : log];
		if (Array.isArray(data)) {
			for (const d of data) {
				if (d != null) {
					args.push(d);
				}
			}
		} else if (data != null) {
			args.push(data);
		}
		this.console[levelFuncs[level]](...args);
	}

	@bindThis
	public error(x: string | Error, data?: Data, important = false): void { // 実行を継続できない状況で使う
		if (x instanceof Error) {
			data = data ? (Array.isArray(data) ? data : [data]) : [];
			data.unshift({ e: x });
			this.log('error', x.toString(), data, important);
		} else if (typeof x === 'object') {
			this.log('error', `${(x as any).message ?? (x as any).name ?? x}`, data, important);
		} else {
			this.log('error', `${x}`, data, important);
		}
	}

	@bindThis
	public warn(message: string, data?: Data, important = false): void { // 実行を継続できるが改善すべき状況で使う
		this.log('warning', message, data, important);
	}

	@bindThis
	public succ(message: string, data?: Data, important = false): void { // 何かに成功した状況で使う
		this.log('success', message, data, important);
	}

	@bindThis
	public debug(message: string, data?: Data, important = false): void { // デバッグ用に使う(開発者に必要だが利用者に不要な情報)
		this.log('debug', message, data, important);
	}

	@bindThis
	public info(message: string, data?: Data, important = false): void { // それ以外
		this.log('info', message, data, important);
	}
}

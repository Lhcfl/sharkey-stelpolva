/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';

export function getIpHash(ip: string): string {
	// "process" handles IPv4 addresses that have been mapped into IPv6 space.
	// It's important to detect those because we might otherwise mangle the address by applying IPv6 masking.
	const addr = ipaddr.process(ip);

	// because a single person may control many IPv6 addresses,
	// only a /64 subnet prefix of any IP will be taken into account.
	// (this means for IPv4 the entire address is used)
	if (addr instanceof ipaddr.IPv6) {
		// ipaddr.js represents IPv6 addresses as an array of 8x 16-bit integer values,
		// so 0xAABBCCDDEEFF0011 becomes [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11].
		// To mask off the last 64 bits (addr & 0xFFFFFFFF00000000), we can just zero out the last 4 parts.
		addr.parts[4] = 0;
		addr.parts[5] = 0;
		addr.parts[6] = 0;
		addr.parts[7] = 0;
	}

	// "hash" the final address into a deterministic, unique, and opaque identifier.
	// Previous implementation converted to a BigInt and encoded as base-36, but that's impractical with this library.
	// Instead, we compact to normalized short form and encode special characters for Redis safety.
	// That will produce a slightly longer output, but meeting all the same requirements.
	const hash = addr
		.toString()
		.replaceAll(/[:.]/g, '-')
		.replaceAll(/[%\/]/g, 'x');
	return `ip-${hash}`;
}

import { createHash } from 'crypto';
import locales from './index.js';

// MD5 is acceptable because we don't need cryptographic security.
const hash = createHash('md5');

// Derive the version hash from locale content exclusively.
// This avoids the problem of "stuck" translations after modifying locale files.
const localesText = JSON.stringify(locales);
hash.update(localesText, 'utf8');

// We can't use regular base64 since this becomes part of a filename.
// Base64URL avoids special characters that would cause an issue.
export const localesVersion = hash.digest().toString('base64url');

export function isSafari() {
	const ua = navigator.userAgent;
	const isSafariUA = /^((?!chrome|android).)*safari/i.test(ua);
	return isSafariUA;
}

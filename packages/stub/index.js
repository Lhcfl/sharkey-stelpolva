
// Infinitely-recursive object to allow destructuring
const proxy = new Proxy({}, {
	get() {
		return proxy;
	},
	set() {
		return false;
	},
	deleteProperty() {
		return false;
	},
});

module.exports = proxy;

import fs from "node:fs";
import yaml from "js-yaml";

const en = yaml.load(fs.readFileSync("sharkey-locales/en-US.yml").toString());

const lang = process.argv[process.argv.length - 1]
console.log("Reading", lang, "defination...");
const another = yaml.load(fs.readFileSync(`sharkey-locales/${lang}.yml`));

function deepCompare(obj1, obj2) {
	for (const k of Object.keys(obj1)) {
		if (obj2[k] == null) {
			obj2["__UNTRANSLATED_" + k] = obj1[k];
		}
		if (typeof obj2[k] === "object") {
			deepCompare(obj1[k], obj2[k]);
		}
	}
}

deepCompare(en, another);

fs.writeFileSync(`sharkey-locales/${lang}.yml`, "---\n" + yaml.dump(another, {
	quotingType: '"',
	lineWidth: 999,
	forceQuotes: true,
}));

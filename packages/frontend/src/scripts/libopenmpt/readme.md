modifications made to `libopenmpt.js` (can be taken from https://lib.openmpt.org/libopenmpt/download/):

at the beginning of the file:
```js
// @ts-nocheck
/* eslint-disable */
```

at the end of the file:
```js
Module.UTF8ToString = UTF8ToString;
Module.writeAsciiToMemory = writeAsciiToMemory;
export { Module }
```

replace
```
wasmBinaryFile="libopenmpt.wasm"
```
with
```
wasmBinaryFile=new URL("./libopenmpt.wasm", import.meta.url).href
```
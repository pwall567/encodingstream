encodingstream
==============

Synchronous (Buffer) and asynchronous (Stream) character set encoding and decoding for node.js

## Quick Summary

`encodingstream` provides a simple mechanism for character set encoding and decoding.  It can
be used asynchronously, as a `Transform` stream:

```js
var Encoding = require('encodingstream').Encoding;
var cp1252 = Encoding.getEncoding('windows-1252');
var enc = cp1252.encodeStream();
var out = require('fs').createWriteStream('file.txt');
enc.pipe(out);
enc.end('Test em dash \u2014 and \u201Csmart\u201D quotes.\n');
```

or synchronously:

```js
var Encoding = require('encodingstream').Encoding;
var cp1252 = Encoding.getEncoding('windows-1252');
var buf = cp1252.encode('Test em dash \u2014 and \u201Csmart\u201D quotes.\n');
console.log(buf);
```

To be continued...

## Licence

MIT

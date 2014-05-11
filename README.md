encodingstream
==============

Synchronous (Buffer) and asynchronous (Stream) encoding for node.js

## Quick Summary

`encodingstream` provides a simple mechanism for character set encoding and decoding.  It can
be used asynchronously, as a `Transform` stream, as follows:

```js
var Encoding = require('encodingstream').Encoding;
var cp1252 = Encoding.getEncoding('windows-1252');
var enc = cp1252.encodeStream();
var w = fs.createWriteStream('file.txt');
enc.pipe(w);
enc.write('Test em dash \u2014 and \u201Csmart\u201D quotes.\n');
enc.end();
```

or synchronously:

```js
var Encoding = require('encodingstream').Encoding;
var cp1252 = Encoding.getEncoding('windows-1252');
var buf = cp1252.encode('Test m dash \u2014 and \u201Csmart\u201D quotes.\n');
console.log(buf);
```

To be continued...

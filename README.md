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

## Background

'node.js' has only limited support for character set encodings.
The `stream` package and the `Buffer` class include support for UTF-8 and UTF-16 data, but a
great deal of data in existing systems uses encodings such as Windows-1252 (for Western
European and North American systems) or EUC-JP or GB18030 (in Asia).
For example, while most relational database systems allow multi-byte character encodings, very
few databases in Western countries use anything other than single-byte encodings.

Even the [HTTP 1.1 Specification](https://tools.ietf.org/html/rfc2068) specifies that data of
type 'text' is assumed to be in ISO-8859-1 encoding, not UTF-8.

`encodingstream` meets the requirement for flexible stream-based or synchronous character set
encoding and decoding in `node.js` systems.

## Class: Encoding

`Encoding` is the main class in the module (the module would have been named `encoding` but the
name was already taken in `npm`).
`Encoding` objects exists for the following encodings:

<table>
  <tr>
    <th>Name</th>
    <th>RegExp</th>
    <th>Examples</th>
  </tr>
  <tr style="font-family:monospace">
    <td>utf8</td>
    <td>/^utf[\-_]?8$/i</td>
    <td>utf8 UTF-8</td>
  </tr>
  <tr style="font-family:monospace">
    <td>utf16be</td>
    <td>/^utf[\-_]?16[\-_]?be$/i</td>
    <td>utf16-be UTF-16BE</td>
  </tr>
  <tr style="font-family:monospace">
    <td>utf16le</td>
    <td>/^utf[\-_]?16[\-_]?le$/i</td>
    <td>utf16-le UTF-16LE</td>
  </tr>
  <tr style="font-family:monospace">
    <td>usascii</td>
    <td>/^(us[\-_]?)?ascii$/i</td>
    <td>us-ascii ASCII</td>
  </tr>
  <tr style="font-family:monospace">
    <td>iso88591</td>
    <td>/^iso[\-_]?8859[\-_]?1$/i</td>
    <td>iso-8859-1 ISO8859-1</td>
  </tr>
  <tr style="font-family:monospace">
    <td>iso885915</td>
    <td>/^iso[\-_]?8859[\-_]?15$/i</td>
    <td>iso-8859-15 ISO8859-15</td>
  </tr>
  <tr style="font-family:monospace">
    <td>windows1252</td>
    <td>/^(windows|cp)[\-_]?1252$/i</td>
    <td>Windows-1252 cp1252</td>
  </tr>
</table>

Further encodings can be added as needed.  There are extensive comments in the source code to
assist in creating new encodings.

You can obtain an `Encoding` by name if you know its canonical name, or you can look it up using
the `getEncoding()` function &mdash; this performs a regular expression match on the string
provided and can therefore match the name in a variety of ways.

For example, each of these three lines will get the same `Encoding` object:

```js
var enc1 = Encoding.windows1252;
var enc2 = Encoding.getEncoding('Windows-1252');
var enc3 = Encoding.getEncoding('cp1252');
```

Having obtained an `Encoding`, you can then use it to encode a string to a `Buffer`, to decode a
'Buffer` to a string, or to obtain an `EncodeStream` or a 'DecodeStream` to perform the encoding
or decoding asynchronously.

In all cases, string data is assumed to be in UTF-16 encoding, that is, it consists of 16-bit
characters, with characters outside the Basic Multilingual Plane (BMP) represented by
surrogate sequences.

### Encoding.getEncoding(name)

+ name `String` The name to match against the RegExp for the encoding
+ Returns: `Encoding` The encoding

Static method to get the required encoding.

### encoding.encode(str, [options])

+ str `String` The string to encode
+ options `Object` An optional options object
+ Returns: `Buffer` The encoded data

Encode a string to a `Buffer` synchronously.
The options object contains the following options:

+ `errorFatal` - if true, any untranslatable characters cause an error to be thrown
  (default false)
+ `replChar` - the replacement character to use when `errorFatal` is set to false
  (default '\uFFFD')

### encoding.decode(buf, [options])

+ buf `Buffer` The buffer to decode
+ options `Object` An optional options object
+ Returns: `String` The decoded string

Decode a `Buffer` to a string synchronously.
The options object contains the following options:

+ `errorFatal` - if true, any invalid sequences cause an error to be thrown
  (default false)
+ `replChar` - the replacement character to use when `errorFatal` is set to false
  (default '\uFFFD')

### encoding.encodeStream([options])

+ options `Object` An optional options object

Obtain an `EncodeStream` to perform asynchronous encoding of a stream of data.
The options object is as described above.

### encoding.decodeStream([options])

+ options `Object` An optional options object

Obtain a `DecodeStream` to perform asynchronous decoding of a stream of data.
The options object is as described above.

## Class: EncodeStream

An object of the class `EncodeStream` is returned by the function `encoding.encodeStream()`.
The class is derived from `Transform` in the standard `stream` package, but it is restricted to
accepting input in `string` form, and outputting in the form of a `Buffer`.
This is a slight modification to the standard usage of the stream classes &mdash; readable
streams will usually provide a `Buffer` to the `data` event, unless the `setEncoding()`
function has been called.
This class overrides `setEncoding()` to a null function, and the argument to the `data` event
will always be a `Buffer`.
This behaviour is completely transparent in the common case of the `EncodeStream` being used in
a `pipe()` operation.

### encodeStream.write(chunk, [encoding], [callback])

+ chunk `String` The data to write
+ encoding `String` Ignored - implied by the specific subclass
+ callback `Function` Callback for when this chunk of data is flushed
+ Returns: `Boolean` True if the data was handled completely

This method writes a string to the `EncodeStream`.
The usage of the arguments and callback are exactly as specified in the
[node stream documentation](http://nodejs.org/api/stream.html), except that the chunk must be a
string and the encoding is ignored.

### encodeStream.end([chunk], [encoding], [callback])

+ chunk `String` Optional data to write
+ encoding `String` Ignored - implied by the specific subclass
+ callback `Function` Callback for when the stream is finished

This method is used when no further data is to be written to the `EncodeStream`.

### Event: 'readable'

This event indicates that a chunk of data can be read from the stream.

### Event: 'data'

+ chunk `String` Optional data to write

The use of the `data` event listener will cause the stream to be in flowing mode, as described
in the [node stream documentation](http://nodejs.org/api/stream.html).

### Event: 'end'

This event indicates that no more data will be provided by this stream.

## Class: DecodeStream

An object of the class `DecodeStream` is returned by the function `encoding.decodeStream()`.
The class is derived from `Transform` in the standard `stream` package, but it is restricted to
accepting input in `Buffer` form, and outputting in the form of a `String`.
This again is a slight modification to the standard usage of the stream classes.

This class overrides `setEncoding()` to a null function, and the argument to the `data` event
will always be a `String`.
As with the `EncodeStream`, this behaviour is completely transparent in the common case of the
`DecodeStream` being used in a `pipe()` operation.

### decodeStream.write(chunk, [encoding], [callback])

+ chunk `Buffer` The data to write
+ encoding `String` Ignored - implied by the specific subclass
+ callback `Function` Callback for when this chunk of data is flushed
+ Returns: `Boolean` True if the data was handled completely

This method writes a `Buffer` to the `DecodeStream`.
The usage of the arguments and callback are exactly as specified in the
[node stream documentation](http://nodejs.org/api/stream.html), except that the chunk must be a
`Buffer` and the encoding is ignored.

### decodeStream.end([chunk], [encoding], [callback])

+ chunk `Buffer` Optional data to write
+ encoding `String` Ignored - implied by the specific subclass
+ callback `Function` Callback for when the stream is finished

This method is used when no further data is to be written to the `DecodeStream`.

### Event: 'readable'

This event indicates that a chunk of data can be read from the stream.

### Event: 'data'

+ chunk `Buffer` Optional data to write

The use of the `data` event listener will cause the stream to be in flowing mode, as described
in the [node stream documentation](http://nodejs.org/api/stream.html).

### Event: 'end'

This event indicates that no more data will be provided by this stream.

## Examples

The following is a variation on the classic `node.js` example, but instead of responding with
constant text, it responds with a file which is known to be in ISO-8859-1 encoding:

```js
var http = require('http');
var fs = require('fs');
var Encoding = require('encodingstream').Encoding;
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
  var input = fs.createReadStream('helloworld.txt');
  var decodeStream = Encoding.getEncoding('iso8859-1').decodeStream();
  input.pipe(decodeStream).pipe(res);
}).listen(1337, '127.0.0.1');
```

More examples to follow.


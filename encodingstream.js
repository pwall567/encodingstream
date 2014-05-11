/*
 * @(#) encodingstream.js
 *
 * encodingstream JavaScript Character Set Encoding Module
 * Copyright (c) 2013, 2014 Peter Wall
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

'use strict';

var Transform = require('stream').Transform;

var byteOrderMark = 0xFEFF;
var defaultReplChar = '\uFFFD';
var defaultSubstByte = '?';

// EncodeDecodeStream - EncodeStream / DecodeStream common functionality

/**
 * This class contains common functionality for both the encode and decode stream classes.
 *
 * <p>The constructor takes an options object; the options common to all subclasses are:</p>
 * <dl>
 *   <dt><code>{Boolean} errorFatal</code></dt>
 *   <dd>if true, treat errors as fatal</dd>
 *   <dt><code>{String} replChar</code></dt>
 *   <dd>the character to use as the replacement character</dd>
 * </dl>
 *
 * @constructor
 * @param {Encoding}    encoding    the Encoding object for this encoding
 * @param {Object}      [options]   an options object
 */
function EncodeDecodeStream(encoding, options) {
    Transform.call(this);
    /** The {@link Encoding} object for this stream @type Encoding */
    this.encoding = encoding;
    /** Indication that errors should be treated as fatal (throw Error) @type Boolean */
    this.errorFatal = options && options.errorFatal;
    /** Replacement character to use in case of errors @type String */
    this.replChar = options && options.replChar || defaultReplChar;
}

EncodeDecodeStream.prototype = Object.create(Transform.prototype, {
    constructor: { value: EncodeDecodeStream, enumerable: false, writable: true,
            configurable: true }
});

/**
 * Block the encoding setting for the stream.  This function intercepts the call to set the
 * encoding for the underlying stream and ignores it - these classes require the stream to
 * operate in buffer mode.
 *
 * @param {String} encoding   the encoding name (ignored)
 */
EncodeDecodeStream.prototype.setEncoding = function (encoding) {
    // ignore - don't allow encoding to be set in this way
};

// EncodeStream

/**
 * The <code>EncodeStream</code> class is the base class for the various forms of encode stream.
 *
 * <p>The constructor takes an options object which is passed to the {@link EncodeDecodeStream}
 * constructor.  In addition, the following option is used by this class:</p>
 * <dl>
 *   <dt><code>{Boolean} outputBOM</code></dt>
 *   <dd>if true, output a BOM character at start of stream</dd>
 * </dl>
 *
 * @constructor
 * @param {Encoding}    encoding    the Encoding object for this encoding
 * @param {Object} [options]  a set of options (see above)
 */

function EncodeStream(encoding, options) {
    EncodeDecodeStream.call(this, encoding, options);
    this._writableState.decodeStrings = false;
    this.outputBOM = options && options.outputBOM;
    this.substByte = options && options.substByte || defaultSubstByte;
    this.highSurrogate = 0;
}

EncodeStream.prototype = Object.create(EncodeDecodeStream.prototype, {
    constructor: { value: EncodeStream, enumerable: false, writable: true, configurable: true }
});

/**
 * Transform a string into a buffer of encoded bytes.  This function is called by the
 * {@link Transform} class when data is available to be transformed.  The input chunk is
 * expected to be a UTF-16 string of characters, and the output will be a sequence of bytes in
 * the specified encoding.
 *
 * <p>The operation works in two passes: First, it calculates the required size of the buffer,
 * and then it allocates the buffer and fills it with the encoded output.  The derived classes
 * must provide implementations for the functions to calculate the bytes required for a
 * particular character, and to store the character in the buffer.</p>
 *
 * @param {String}   chunk    the string to be encoded
 * @param {String}   encoding the encoding name from the stream base class (ignored)
 * @param {Function} callback the function to call on completion
 */
EncodeStream.prototype._transform = function (chunk, encoding, callback) {
    // assert chunk is a String
    try {
        var len = 0, i = 0, ch, hs = this.highSurrogate;
        for (; i < chunk.length; i++) {
            ch = chunk.charCodeAt(i);
            if (hs == 0 && isHighSurrogate(ch))
                hs = ch;
            else {
                if (hs) {
                    if (!isLowSurrogate(ch)) {
                        ch = getReplCharCodeOrError(this, 'Invalid surrogate sequence');
                        len += this.encoding.lenCharacter(ch);
                        i--;
                    }
                    else
                        len += this.encoding.lenSurrogate(hs, ch);
                    hs = 0;
                }
                else {
                    if (isLowSurrogate(ch))
                        ch = getReplCharCodeOrError(this, 'Invalid surrogate sequence');
                    len += this.encoding.lenCharacter(ch);
                }
            }
        }
        if (this.outputBOM)
            len += this.encoding.lenCharacter(byteOrderMark);
        var buf = new Buffer(len);
        var offset = 0;
        if (this.outputBOM) {
            offset = this.encoding.storeCharacter(buf, 0, byteOrderMark, this);
            this.outputBOM = false;
        }
        for (i = 0; i < chunk.length; i++) {
            ch = chunk.charCodeAt(i);
            if (this.highSurrogate == 0 && isHighSurrogate(ch))
                this.highSurrogate = ch;
            else {
                if (this.highSurrogate) {
                    if (!isLowSurrogate(ch)) {
                        ch = getReplCharCodeOrError(this, 'Invalid surrogate sequence');
                        offset += this.encoding.storeCharacter(buf, offset, ch, this);
                        i--;
                    }
                    else {
                        offset += this.encoding.storeSurrogate(buf, offset, this.highSurrogate,
                                ch, this);
                    }
                    this.highSurrogate = 0;
                }
                else {
                    if (isLowSurrogate(ch))
                        ch = getReplCharCodeOrError(this, 'Invalid surrogate sequence');
                    offset += this.encoding.storeCharacter(buf, offset, ch, this);
                }
            }
        }
        this.push(buf);
        callback(null);
    }
    catch (e) {
        callback(e);
    }
};

/**
 * Complete the transformation process.  This function is called by the {@link Transform} class
 * when there is no more data (end of stream).  The function simply checks that there is no
 * outstanding surrogate sequence.
 *
 * @param {Function} callback the function to call on completion
 */
EncodeStream.prototype._flush = function (callback) {
    try {
        if (this.highSurrogate) {
            var ch = getReplCharCodeOrError(this, 'Incomplete surrogate sequence');
            var buf = new Buffer(this.encoding.lenCharacter(ch));
            this.encoding.storeCharacter(buf, 0, ch, this);
            this.push(buf);
            this.highSurrogate = 0;
        }
        callback(null);
    }
    catch (e) {
        callback(e);
    }
};

// DecodeStream

/**
 * The <code>DecodeStream</code> class is the base class for the various forms of decode stream.
 *
 * <p>The constructor takes an options object which is passed to the {@link EncodeDecodeStream}
 * constructor.  In addition, the following option is used by this class:</p>
 * <dl>
 *   <dt><code>{Boolean} dropBOM</code></dt>
 *   <dd>if true, drop any BOM character if present (don't pass through to receiver)</dd>
 * </dl>
 *
 * @constructor
 * @param {Encoding}    encoding    the Encoding object for this encoding
 * @param {Object}      [options]   a set of options (see above)
 */
function DecodeStream(encoding, options) {
    EncodeDecodeStream.call(this, encoding, options);
    this._writableState.objectMode = false;
    this._readableState.objectMode = true;
    this.dropBOM = options && options.dropBOM;
    this.hold = null;
}

DecodeStream.prototype = Object.create(EncodeDecodeStream.prototype, {
    constructor: { value: DecodeStream, enumerable: false, writable: true, configurable: true }
});

/**
 * Transform a buffer of encoded bytes into a string of UTF-16 characters.  This function is
 * called by the {@link Transform} class when data is available to be transformed.  The bulk of
 * the transformation is carried out by the specific subclass in the
 * {@link DecodeSteam#decodeBuffer} function.
 *
 * @param {Buffer}   chunk    the buffer to be decoded
 * @param {String}   encoding the encoding name from the stream base class (ignored)
 * @param {Function} callback the function to call on completion
 */
DecodeStream.prototype._transform = function (chunk, encoding, callback) {
    // assert chunk is a Buffer
    try {
        var a = this.decodeBuffer(chunk);
        if (a.length)
            this.push(a);
        callback(null);
    }
    catch (e) {
        callback(e);
    }
};

/**
 * Complete the transformation process.  This function is called by the {@link Transform} class
 * when there is no more data (end of stream).  The function simply checks that there is no
 * outstanding character sequence.
 *
 * @param {Function} callback the function to call on completion
 */
DecodeStream.prototype._flush = function (callback) {
    try {
        if (this.hold) {
            this.hold = null;
            this.push(getReplCharOrError(this, 'Incomplete character at end of stream'));
        }
        callback(null);
    }
    catch (e) {
        callback(e);
    }
};

/**
 * Decode the buffer into a string.
 *
 * @param {Buffer}   buf    the buffer to be decoded
 * @returns {String} the decoded string
 */
DecodeStream.prototype.decodeBuffer = function (buf) {
    return this.encoding.decode(buf, this);
};

/**
 * Create a 'hold' buffer to store an incomplete character sequence.
 *
 * @param {Buffer}   chunk    the buffer to be decoded
 * @param {Number}   index    the index into the buffer
 */
DecodeStream.prototype.createHoldBuffer = function (chunk, index) {
    var n = chunk.length - index;
    this.hold = new Buffer(n);
    for (var i = 0; i < n; i++)
        this.hold[i] = chunk[index + i];
};

// UTF8DecodeStream

/**
 * Construct a UTF-8 decode stream.  The constructor takes an options object which is passed to
 * the {@link DecodeStream} constructor.  There are no additional options specific to this
 * stream.
 *
 * @constructor
 * @param {Encoding}    encoding    the Encoding object for this encoding
 * @param {Object}      [options]   a set of options (see above)
 */
function UTF8DecodeStream(encoding, options) {
    DecodeStream.call(this, encoding, options);
}

UTF8DecodeStream.prototype = Object.create(DecodeStream.prototype, {
    constructor: { value: UTF8DecodeStream, enumerable: false, writable: true,
            configurable: true }
});

/**
 * Decode the buffer into a string.
 *
 * @param {Buffer}   buf    the buffer to be decoded
 * @returns {String} the decoded string
 */
UTF8DecodeStream.prototype.decodeBuffer = function (buf) {
    if (this.hold) {
        buf = Buffer.concat([ this.hold, buf ], this.hold.length + buf.length);
        this.hold = null;
    }
    var a = ''; // using string concatenation; now reported to be faster than Array.join()
    var i = 0, ch, ch2, ch3, ch4, cp;
    while (i < buf.length) {
        ch = buf[i++];
        if (ch < 0x80)
            a += String.fromCharCode(ch);
        else if (ch < 0xC0)
            a += getReplCharOrError(this, 'Illegal UTF-8 byte: 0x' + hexChar(ch));
        else if (ch < 0xE0) {
            if (i >= buf.length) {
                this.createHoldBuffer(buf, i - 1);
                break;
            }
            if (!isContinuationByte(ch2 = buf[i]))
                a += getReplCharOrError(this, 'Illegal UTF-8 byte: 0x' + hexChar(ch2));
            else {
                ++i;
                cp = (ch & 0x1F) << 6 | (ch2 & 0x3F);
                if (cp < 0x80)
                    a += getReplCharOrError(this, 'Illegal character');
                else
                    a += String.fromCharCode(cp);
            }
        }
        else if (ch < 0xF0) {
            if (i + 1 >= buf.length) {
                this.createHoldBuffer(buf, i - 1);
                break;
            }
            if (!isContinuationByte(ch2 = buf[i]) || !isContinuationByte(ch3 = buf[++i]))
                a += getReplCharOrError(this, 'Illegal UTF-8 byte: 0x' + hexChar(buf[i]));
            else {
                ++i;
                cp = (ch & 0x0F) << 12 | (ch2 & 0x3F) << 6 | (ch3 & 0x3F);
                if (cp < 0x800 || isSurrogate(cp))
                    a += getReplCharOrError(this, 'Illegal character');
                else {
                    if (!(this.dropBOM && cp == byteOrderMark))
                        a += String.fromCharCode(cp);
                }
            }
        }
        else if (ch < 0xF8) {
            if (i + 2 >= buf.length) {
                this.createHoldBuffer(buf, i - 1);
                break;
            }
            if (!isContinuationByte(ch2 = buf[i]) || !isContinuationByte(ch3 = buf[++i]) ||
                    !isContinuationByte(ch4 = buf[++i]))
                a += getReplCharOrError(this, 'Illegal UTF-8 byte: 0x' + hexChar(buf[i]));
            else {
                ++i;
                cp = (ch & 7) << 18 | (ch2 & 0x3F) << 12 | (ch3 & 0x3F) << 6 | (ch4 & 0x3F);
                if (cp < 0x10000 || cp > 0x10FFFF)
                    a += getReplCharOrError(this, 'Illegal surrogate sequence');
                else
                    a += createSurrogateString(cp);
            }
        }
        else
            a += getReplCharOrError(this, 'Illegal UTF-8 byte: 0x' + hexChar(ch));
        this.dropBOM = false;
    }
    return a;
};

// UTF16DecodeStream

/**
 * Construct a UTF-16 decode stream.  The constructor takes an options object which is passed to
 * the {@link DecodeStream} constructor.  There are no additional options specific to this
 * stream.
 *
 * @constructor
 * @param {Encoding}    encoding    the Encoding object for this encoding
 * @param {Object}      [options]   a set of options (see above)
 */
function UTF16DecodeStream(encoding, options) {
    DecodeStream.call(this, encoding, options);
}

UTF16DecodeStream.prototype = Object.create(DecodeStream.prototype, {
    constructor: { value: UTF16DecodeStream, enumerable: false, writable: true,
            configurable: true }
});

/**
 * Decode the buffer into a string.
 *
 * @param {Buffer}   buf    the buffer to be decoded
 * @returns {String} the decoded string
 */
UTF16DecodeStream.prototype.decodeBuffer = function (buf) {
    if (this.hold) {
        buf = Buffer.concat([ this.hold, buf ], this.hold.length + buf.length);
        this.hold = null;
    }
    var a = '';
    for (var i = 0; i < buf.length; i += 2) {
        if (i + 1 >= buf.length) {
            this.createHoldBuffer(buf, i);
            break;
        }
        var ch = this.encoding.readBuf(buf, i);
        if (!isHighSurrogate(ch)) {
            if (isLowSurrogate(ch))
                a += getReplCharOrError(this, 'Illegal surrogate sequence');
            else {
                if (!(this.dropBOM && ch == byteOrderMark))
                    a += String.fromCharCode(ch);
            }
        }
        else {
            if (i + 3 >= buf.length) {
                this.createHoldBuffer(buf, i);
                break;
            }
            var ch2 = this.encoding.readBuf(buf, i + 2);
            if (!isLowSurrogate(ch2))
                a += getReplCharOrError(this, 'Illegal surrogate sequence');
            else {
                i += 2;
                a += String.fromCharCode(ch, ch2);
            }
        }
        this.dropBOM = false;
    }
    return a;
};

// CodePageDecodeStream

/**
 * Construct a decode stream for a given code page.  The constructor takes an options object
 * which is passed to the {@link DecodeStream} constructor.  There are no additional options
 * specific to this stream.
 *
 * @constructor
 * @param {Encoding}    encoding    the Encoding object for this encoding
 * @param {Object}      [options]   a set of options (see above)
 */
function CodePageDecodeStream(encoding, options) {
    DecodeStream.call(this, encoding, options);
    this.codePage = encoding.codePage;
}

CodePageDecodeStream.prototype = Object.create(DecodeStream.prototype, {
    constructor: { value: CodePageDecodeStream, enumerable: false, writable: true,
            configurable: true }
});

// ASCIIDecodeStream

/**
 * Construct an ASCII decode stream.  The constructor takes an options object which is passed to
 * the {@link DecodeStream} constructor.  There are no additional options specific to this
 * stream.
 *
 * @constructor
 * @param {Encoding}    encoding    the Encoding object for this encoding
 * @param {Object}      [options]   a set of options (see above)
 */
function ASCIIDecodeStream(encoding, options) {
    DecodeStream.call(this, encoding, options);
}

ASCIIDecodeStream.prototype = Object.create(DecodeStream.prototype, {
    constructor: { value: ASCIIDecodeStream, enumerable: false, writable: true,
            configurable: true }
});

// general functions

/**
 * Tests whether a character code is in the surrogate range.
 *
 * @param {Number} ch   the numeric code for the character
 * @returns {Boolean}   <code>true</code> if the character is a surrogate
 */
function isSurrogate(ch) {
    return (ch & 0xF800) == 0xD800;
}

/**
 * Tests whether a character code represents a valid high surrogate character.
 *
 * @param {Number} ch   the numeric code for the character
 * @returns {Boolean}   <code>true</code> if the character is a high surrogate
 */
function isHighSurrogate(ch) {
    return (ch & 0xFC00) == 0xD800;
}

/**
 * Tests whether a character code represents a valid low surrogate character.
 *
 * @param {Number} ch   the numeric code for the character
 * @returns {Boolean}   <code>true</code> if the character is a low surrogate
 */
function isLowSurrogate(ch) {
    return (ch & 0xFC00) == 0xDC00;
}

/**
 * Combine high and low surrogate codes to create a combined codepoint number.
 *
 * @param {Number} high  the numeric code for the high surrogate
 * @param {Number} low   the numeric code for the low surrogate
 * @returns {Number}     the codepoint number for the character
 */
function combineSurrogates(high, low) {
    return ((high & 0x3FF) << 10) + (low & 0x3FF) + 0x10000;
}

/**
 * Create a two-character surrogate string from a codepoint number (must be a valid codepoint,
 * not in the BMP).
 *
 * @param {Number} cp the codepoint number
 * @returns {String}  a two-character string representing the codepoint as a pair of surrogates
 */
function createSurrogateString(cp) {
    cp -= 0x10000;
    return String.fromCharCode((cp >> 10 & 0x3FF) + 0xD800, (cp & 0x3FF) + 0xDC00);
}

/**
 * Check that a character is a valid UTF-8 continuation byte.
 *
 * @param {Number}  ch  the character (as retrieved from a Buffer)
 * @returns {Boolean}   <code>true</code> if the character is valid
 */
function isContinuationByte(ch) {
    return (ch & 0xC0) == 0x80;
}

/**
 * Test error handling setting and return the replacement character or throw an error, as
 * appropriate.
 *
 * @param {Object}    [options] an options object
 * @param {String}    msg       the text of the error message
 * @returns {String}            the replacement character
 * @throws Error    if the <code>errorFatal</code> option is set to <code>true</code>
 */
function getReplCharOrError(options, msg) {
    if (options && options.errorFatal)
        throw new Error(msg);
    return options && options.replChar || defaultReplChar;
}

/**
 * Test error handling setting and return the numeric code for the replacement character or
 * throw an error, as appropriate.
 *
 * @param {Object}    [options] an options object
 * @param {String}    msg       the text of the error message
 * @returns {Number}            the numeric code for the replacement character
 * @throws Error    if the <code>errorFatal</code> option is set to <code>true</code>
 */
function getReplCharCodeOrError(options, msg) {
    return getReplCharOrError(options, msg).charCodeAt(0);
}

// debugging functions

var hexDigits = '0123456789ABCDEF';

function hexChar(n) {
    var result = '';
    do {
        result = hexDigits.charAt(n & 0xF) + result;
        n >>>= 4;
    } while (n);
    return result;
}

function hexString(str) {
    var a = [];
    for (var i = 0; i < str.length; i++)
        a.push(hexChar(str.charCodeAt(i)));
    return a.join('.');
}

// Encoding

/**
 * Encoding table entry.
 *
 * @constructor
 * @param {String} name      the name of this encoding
 * @param {RegExp} test      a regular expression to compare for this encoding name
 * @param {Number} [qvalue]  the qvalue to use when creating "Accept-Charset" header
 */
function Encoding(name, test, qvalue) {
    this.name = name;
    this.test = test;
    this.qvalue = qvalue || 1.0;
}

/**
 * Encode a string to a Buffer.
 * 
 * @param {String}  str         the input string
 * @param {Object}  [options]   an options object
 * @returns {Buffer}            a Buffer containing the encoded string
 * @throws Error    if the string contains an invalid surrogate sequence and 'errorFatal' is
 *                  set to true in the options object
 */
Encoding.prototype.encode = function (str, options) {
    var len = 0, i = 0, ch, ls;
    for (; i < str.length; i++) {
        ch = str.charCodeAt(i);
        if (isHighSurrogate(ch)) {
            if (i + 1 >= str.length) {
                len += this.lenCharacter(getReplCharCodeOrError(options,
                        'Incomplete surrogate sequence'));
                break;
            }
            ls = str.charCodeAt(i + 1);
            if (!isLowSurrogate(ls))
                len += this.lenCharacter(getReplCharCodeOrError(options,
                        'Invalid surrogate sequence'));
            else {
                len += this.lenSurrogate(ch, ls);
                i++;
            }
        }
        else {
            if (isLowSurrogate(ch))
                ch = getReplCharCodeOrError(options, 'Invalid surrogate sequence');
            len += this.lenCharacter(ch);
        }
    }
    var buf = new Buffer(len);
    var offset = 0;
    for (i = 0; i < str.length; i++) {
        ch = str.charCodeAt(i);
        if (isHighSurrogate(ch)) {
            if (i + 1 >= str.length) {
                ch = getReplCharCodeOrError(options, 'Incomplete surrogate sequence');
                offset += this.storeCharacter(buf, offset, ch, options);
                break;
            }
            ls = str.charCodeAt(i + 1);
            if (!isLowSurrogate(ls)) {
                ch = getReplCharCodeOrError(options, 'Invalid surrogate sequence');
                offset += this.storeCharacter(buf, offset, ch, options);
            }
            else {
                offset += this.storeSurrogate(buf, offset, ch, ls, options);
                i++;
            }
        }
        else {
            if (isLowSurrogate(ch))
                ch = getReplCharCodeOrError(options, 'Invalid surrogate sequence');
            offset += this.storeCharacter(buf, offset, ch, options);
        }
    }
    return buf;
};

Encoding.prototype.decode = function (buf, options) {
    throw new Error('No decode method for ' + this.name);
};

Encoding.prototype.encodeStream = function (options) {
    return new EncodeStream(this, options);
};

Encoding.prototype.decodeStream = function (options) {
    throw new Error('No decodeStream method for ' + this.name);
};

/**
 * Calculate the number of bytes required to encode the given surrogate sequence.
 *
 * @param {Number} high    the numeric code for the high surrogate
 * @param {Number} low     the numeric code for the low surrogate
 * @returns {Number}       the length of the sequence for this character (always 1)
 */
Encoding.prototype.lenSurrogate = function (high, low) {
    return this.lenCharacter(combineSurrogates(high, low));
};

/**
 * Store the mapping for the surrogate sequence in the output buffer.
 *
 * @param {Buffer}  buf         the output buffer
 * @param {Number}  offset      the offset at which to store the mapped sequence
 * @param {Number}  high        the numeric code for the high surrogate
 * @param {Number}  low         the numeric code for the low surrogate
 * @param {Object}  [options]   an options object
 * @returns {Number}            the length of the sequence for this character (always 4)
 */
Encoding.prototype.storeSurrogate = function (buf, offset, high, low, options) {
    return this.storeCharacter(buf, offset, combineSurrogates(high, low), options);
};

// static functions

/**
 * Find the encoding that matches the given string, by testing against the regular expression
 * associated with the encoding.
 *
 * @param {String}  str   the string to match for the encoding name
 * @returns {Encoding}    the encoding, or <code>null</code> if not found
 */
Encoding.getEncoding = function (str) {
    var s = str.trim();
    var table = Encoding.encodings;
    for (var i = 0; i < table.length; i++) {
        var entry = table[i];
        if (entry.test.test(s))
            return entry;
    }
    return null;
};

/**
 * Create an "Accept-Charset" HTTP header, based on the encodings table.  Optionally add an
 * entry "*;q=0" which should, in theory, indicate that any encoding not explicitly mentioned
 * is not acceptable.
 *
 * @param {Boolean} blockOthers   if true, append an entry for "*" to block other encodings
 * @returns     the value for the header
 */
Encoding.getAcceptCharset = function (blockOthers) {
    var a = [];
    var table = Encoding.encodings;
    for (var i = 0; i < table.length; i++) {
        var entry = table[i];
        a.push(entry.qvalue == 1.0 ? entry.name : entry.name + ';q=' + entry.qvalue);
    }
    if (blockOthers)
        a.push('*;q=0');
    return a.join(',');
};

// CodePageEncoding

/**
 * Encoding table entry for a 'code page' encoding.  These encodings map the characters 0x00 to
 * 0x7F to the same values in the encoded form, and a predefined selection of characters (the
 * code page) into the values 0x80 to 0xFF.
 *
 * @constructor
 * @param {String} codePage  the code page - the characters that map to 0x80 to 0xFF
 * @param {String} name      the name of this encoding
 * @param {RegExp} test      a regular expression to compare for this encoding name
 * @param {Number} [qvalue]  the qvalue to use when creating "Accept-Charset" header
 */
function CodePageEncoding(codePage, name, test, qvalue) {
    Encoding.call(this, name, test, qvalue);
    this.codePage = codePage;
    this.mapping = null;
}

CodePageEncoding.prototype = Object.create(Encoding.prototype, {
    constructor: { value: CodePageEncoding, enumerable: false, writable: true,
            configurable: true }
});

/**
 * Calculate the number of bytes required to encode the given character.
 *
 * @param {Number} ch      the numeric code for the character
 * @returns {Number}       the length of the sequence for this character (always 1)
 */
CodePageEncoding.prototype.lenCharacter = function (ch) {
    return 1;
};

/**
 * Calculate the number of bytes required to encode the given surrogate sequence.
 *
 * @param {Number} high    the numeric code for the high surrogate
 * @param {Number} low     the numeric code for the low surrogate
 * @returns {Number}       the length of the sequence for this character (always 1)
 */
CodePageEncoding.prototype.lenSurrogate = function (high, low) {
    return 1;
};

/**
 * Store the mapping for the character in the output buffer.
 *
 * @param {Buffer}  buf         the output buffer
 * @param {Number}  offset      the offset at which to store the mapped sequence
 * @param {Number}  ch          the numeric code for the character
 * @param {Object}  [options]   an options object
 * @returns {Number}            the length of the sequence for this character (always 1)
 * @throws Error    if the character can not be encoded and 'errorFatal' is set to true in the
 *                  options object
 */
CodePageEncoding.prototype.storeCharacter = function (buf, offset, ch, options) {
    if (ch < 0x80)
        buf[offset] = ch;
    else {
        // binary search mapping table
        var mapping = this.getMappingTable();
        var lo = 0, hi = mapping.length;
        for (;;) {
            if (lo >= hi) { // no more entries
                if (options && options.errorFatal)
                    throw new Error('Character can not be encoded: 0x' + hexChar(ch));
                var substByte = options && options.substByte || defaultSubstByte;
                buf[offset] = substByte.charCodeAt(0);
                break;
            }
            var mid = (lo + hi) >> 1;
            var entry = mapping[mid];
            if (entry.cp == ch) {
                buf[offset] = entry.to;
                break;
            }
            if (entry.cp > ch)
                hi = mid;
            else
                lo = mid + 1;
        }
    }
    return 1;
};

/**
 * Decode a buffer encoded in a code page encoding to a string.
 *
 * @param   {Buffer}     buf        the buffer
 * @param   {Object}    [options]   an options object (unused)
 * @returns {String}    the decoded string
 */
CodePageEncoding.prototype.decode = function (buf, options) {
    var a = '';
    for (var i = 0; i < buf.length; i++) {
        var ch = buf[i];
        a += ch < 0x80 ? String.fromCharCode(ch) : this.codePage.charAt(ch - 0x80);
    }
    return a;
};

/**
 * Get the mapping table for the reverse mapping of code points to encoded values.  The table is
 * an array in code point order of mapping entries; it is lazily initialised from the code page
 * when required.
 *
 * @returns {Array} the mapping table
 */
CodePageEncoding.prototype.getMappingTable = function () {
    if (!this.mapping) {
        // create mapping table from code page
        this.mapping = [];
        for (var i = 0; i < 128; i++) {
            var ch = this.codePage.charCodeAt(i);
            // binary search to find insertion point
            var lo = 0, hi = this.mapping.length;
            while (lo < hi) {
                var mid = (lo + hi) >> 1;
                // assert this.mapping[mid].cp != ch (no duplicates)
                if (this.mapping[mid].cp > ch)
                    hi = mid;
                else
                    lo = mid + 1;
            }
            this.mapping.splice(lo, 0, { cp: ch, to: i + 128 });
        }
    }
    return this.mapping;
};

CodePageEncoding.prototype.encodeStream = function (options) {
    var stream = new EncodeStream(this, options);
    stream.outputBOM = false;
    return stream;
};

CodePageEncoding.prototype.decodeStream = function (options) {
    return new CodePageDecodeStream(this, options);
};

// Table of encodings

Encoding.encodings = [];

// UTF-8

Encoding.utf8 = new Encoding('utf-8', /^utf[\-_]?8$/i);

Encoding.utf8.decodeStream = function (options) {
    return new UTF8DecodeStream(this, options);
};

/**
 * Decode a UTF-8 encoded buffer to a string.
 *
 * @param {Buffer} buf          the buffer
 * @param {Object} [options]    an options object
 * @returns {String} the decoded string
 * @throws Error    if the string contains an invalid byte sequence and 'errorFatal' is set to
 *                  true in the options object
 */
Encoding.utf8.decode = function (buf, options) {
    var a = ''; // using string concatenation; now reported to be faster than Array.join()
    var i = 0, ch, ch2, ch3, ch4, cp;
    while (i < buf.length) {
        ch = buf[i++];
        if (ch < 0x80)
            a += String.fromCharCode(ch);
        else if (ch < 0xC0)
            a += getReplCharOrError(options, 'Illegal UTF-8 byte: 0x' + hexChar(ch));
        else if (ch < 0xE0) {
            if (i >= buf.length) {
                a += getReplCharOrError(options, 'Incomplete UTF-8 sequence');
                break;
            }
            if (!isContinuationByte(ch2 = buf[i]))
                a += getReplCharOrError(options, 'Illegal UTF-8 byte: 0x' + hexChar(ch2));
            else {
                ++i;
                cp = (ch & 0x1F) << 6 | (ch2 & 0x3F);
                a += cp < 0x80 ? getReplCharOrError(options, 'Illegal character') :
                        String.fromCharCode(cp);
            }
        }
        else if (ch < 0xF0) {
            if (i + 1 >= buf.length) {
                a += getReplCharOrError(options, 'Incomplete UTF-8 sequence');
                break;
            }
            if (!isContinuationByte(ch2 = buf[i]) || !isContinuationByte(ch3 = buf[++i]))
                a += getReplCharOrError(options, 'Illegal UTF-8 byte: 0x' + hexChar(buf[i]));
            else {
                ++i;
                cp = (ch & 0x0F) << 12 | (ch2 & 0x3F) << 6 | (ch3 & 0x3F);
                a += cp < 0x800 || isSurrogate(cp) ?
                        getReplCharOrError(options, 'Illegal character') :
                        String.fromCharCode(cp);
            }
        }
        else if (ch < 0xF8) {
            if (i + 2 >= buf.length) {
                a += getReplCharOrError(options, 'Incomplete UTF-8 sequence');
                break;
            }
            if (!isContinuationByte(ch2 = buf[i]) || !isContinuationByte(ch3 = buf[++i]) ||
                    !isContinuationByte(ch4 = buf[++i]))
                a += getReplCharOrError(options, 'Illegal UTF-8 byte: 0x' + hexChar(buf[i]));
            else {
                ++i;
                cp = (ch & 7) << 18 | (ch2 & 0x3F) << 12 | (ch3 & 0x3F) << 6 | (ch4 & 0x3F);
                a += cp < 0x10000 || cp > 0x10FFFF ?
                        getReplCharOrError(options, 'Illegal surrogate sequence') :
                        createSurrogateString(cp);
            }
        }
        else
            a += getReplCharOrError(options, 'Illegal UTF-8 byte: 0x' + hexChar(ch));
    }
    return a;
};

/**
 * Calculate the number of bytes required to encode the given character in UTF-8.
 *
 * @param {Number} ch      the numeric code for the character
 * @returns {Number}       the length of the sequence for this character
 */
Encoding.utf8.lenCharacter = function (ch) {
    return ch < 0x80 ? 1 : ch < 0x800 ? 2 : 3;
};

/**
 * Calculate the number of bytes required to encode the given surrogate sequence in UTF-8.
 *
 * @param {Number} high    the numeric code for the high surrogate
 * @param {Number} low     the numeric code for the low surrogate
 * @returns {Number}       the length of the sequence for this character (always 4)
 */
Encoding.utf8.lenSurrogate = function (high, low) {
    return 4;
};

/**
 * Store the mapping for the character in the output buffer.
 *
 * @param {Buffer}  buf         the output buffer
 * @param {Number}  offset      the offset at which to store the mapped sequence
 * @param {Number}  ch          the numeric code for the character
 * @param {Object}  [options]   an options object
 * @returns {Number}            the length of the sequence for this character
 */
Encoding.utf8.storeCharacter = function (buf, offset, ch, options) {
    if (ch < 0x80) {
        buf[offset] = ch;
        return 1;
    }
    else if (ch < 0x800) {
        buf[offset] = ch >>> 6 | 0xC0;
        buf[offset + 1] = ch & 0x3F | 0x80;
        return 2;
    }
    else {
        buf[offset] = ch >>> 12 | 0xE0;
        buf[offset + 1] = ch >>> 6 & 0x3F | 0x80;
        buf[offset + 2] = ch & 0x3F | 0x80;
        return 3;
    }
};

/**
 * Store the mapping for the surrogate sequence in the output buffer.
 *
 * @param {Buffer}  buf         the output buffer
 * @param {Number}  offset      the offset at which to store the mapped sequence
 * @param {Number}  high        the numeric code for the high surrogate
 * @param {Number}  low         the numeric code for the low surrogate
 * @param {Object}  [options]   an options object
 * @returns {Number}            the length of the sequence for this character (always 4)
 */
Encoding.utf8.storeSurrogate = function (buf, offset, high, low, options) {
    var ch = combineSurrogates(high, low);
    buf[offset] = ch >>> 18 | 0xF0;
    buf[offset + 1] = ch >>> 12 & 0x3F | 0x80;
    buf[offset + 2] = ch >>> 6 & 0x3F | 0x80;
    buf[offset + 3] = ch & 0x3F | 0x80;
    return 4;
};

Encoding.encodings.push(Encoding.utf8);

// UTF16Encoding

function UTF16Encoding(name, test, qvalue) {
    Encoding.call(this, name, test, qvalue);
}

UTF16Encoding.prototype = Object.create(Encoding.prototype, {
    constructor: { value: UTF16Encoding, enumerable: false, writable: true, configurable: true }
});

UTF16Encoding.prototype.decodeStream = function (options) {
    return new UTF16DecodeStream(this, options);
};

/**
 * Decode a UTF-16 encoded buffer to a string.
 *
 * @param {Buffer}   buf        the buffer
 * @param {Object}   [options]  an options object
 * @returns {String} the decoded string
 * @throws Error    if the string contains an invalid byte sequence and 'errorFatal' is set to
 *                  true in the options object
 */
UTF16Encoding.prototype.decode = function (buf, options) {
    var a = '';
    for (var i = 0; i < buf.length; i += 2) {
        if (i + 1 >= buf.length) {
            a += getReplCharOrError(options, 'Incomplete UTF-16 character');
            break;
        }
        var ch = this.readBuf(buf, i);
        if (!isHighSurrogate(ch)) {
            if (isLowSurrogate(ch))
                a += getReplCharOrError(options, 'Illegal surrogate sequence');
            else
                a += String.fromCharCode(ch);
        }
        else {
            if (i + 3 >= buf.length) {
                a += getReplCharOrError(options, 'Incomplete surrogate sequence');
                break;
            }
            var ch2 = this.readBuf(buf, i + 2);
            if (!isLowSurrogate(ch2))
                a += getReplCharOrError(options, 'Illegal surrogate sequence');
            else {
                i += 2;
                a += String.fromCharCode(ch, ch2);
            }
        }
    }
    return a;
};

/**
 * Calculate the number of bytes required to encode the given character.
 *
 * @param {Number} ch      the numeric code for the character
 * @returns {Number}       the length of the sequence for this character (always 2)
 */
UTF16Encoding.prototype.lenCharacter = function (ch) {
    return 2;
};

/**
 * Calculate the number of bytes required to encode the given surrogate sequence.
 *
 * @param {Number} high    the numeric code for the high surrogate
 * @param {Number} low     the numeric code for the low surrogate
 * @returns {Number}       the length of the sequence for this character (always 4)
 */
UTF16Encoding.prototype.lenSurrogate = function (high, low) {
    return 4;
};

/**
 * Store the mapping for the character in the output buffer.
 *
 * @param {Buffer}  buf         the output buffer
 * @param {Number}  offset      the offset at which to store the mapped sequence
 * @param {Number}  ch          the numeric code for the character
 * @param {Object}  [options]   an options object (unused)
 * @returns {Number}            the length of the sequence for this character
 */
UTF16Encoding.prototype.storeCharacter = function (buf, offset, ch, options) {
    this.writeBuf(buf, offset, ch);
    return 2;
};

/**
 * Store the mapping for the surrogate sequence in the output buffer.
 *
 * @param {Buffer}  buf         the output buffer
 * @param {Number}  offset      the offset at which to store the mapped sequence
 * @param {Number}  high        the numeric code for the high surrogate
 * @param {Number}  low         the numeric code for the low surrogate
 * @param {Object}  [options]   an options object (unused)
 * @returns {Number}            the length of the sequence for this character (always 4)
 */
UTF16Encoding.prototype.storeSurrogate = function (buf, offset, high, low, options) {
    this.writeBuf(buf, offset, high);
    this.writeBuf(buf, offset + 2, low);
    return 4;
};

// UTF-16LE

Encoding.utf16le = new UTF16Encoding('utf-16le', /^utf[\-_]?16[\-_]?le$/i, 0.9);

Encoding.utf16le.readBuf = function (buf, offset) {
    return buf.readUInt16LE(offset);
};

Encoding.utf16le.writeBuf = function (buf, offset, value) {
    buf.writeUInt16LE(value, offset);
};

Encoding.encodings.push(Encoding.utf16le);

// UTF-16BE

Encoding.utf16be = new UTF16Encoding('utf-16be', /^utf[\-_]?16[\-_]?be$/i, 0.9);

Encoding.utf16be.readBuf = function (buf, offset) {
    return buf.readUInt16BE(offset);
};

Encoding.utf16be.writeBuf = function (buf, offset, value) {
    buf.writeUInt16BE(value, offset);
};

Encoding.encodings.push(Encoding.utf16be);

// ASCII

Encoding.usascii = new Encoding('us-ascii', /^(us[\-_]?)?ascii$/i, 0.1);

Encoding.usascii.encodeStream = function (options) {
    var stream = new EncodeStream(this, options);
    stream.outputBOM = false;
    return stream;
};

Encoding.usascii.decodeStream = function (options) {
    return new ASCIIDecodeStream(this, options);
};

/**
 * Decode an ASCII encoded buffer to a string.
 *
 * @param   {Buffer}     buf        the buffer
 * @param   {Object}    [options]   an options object (unused)
 * @returns {String}    the decoded string
 */
Encoding.usascii.decode = function (buf, options) {
    var a = '';
    for (var i = 0; i < buf.length; i++)
        a += String.fromCharCode(buf[i] & 0x7F);
    return a;
};

/**
 * Calculate the number of bytes required to encode the given character.
 *
 * @param {Number} ch      the numeric code for the character
 * @returns {Number}       the length of the sequence for this character (always 1)
 */
Encoding.usascii.lenCharacter = function (ch) {
    return 1;
};

/**
 * Calculate the number of bytes required to encode the given surrogate sequence.
 *
 * @param {Number} high    the numeric code for the high surrogate
 * @param {Number} low     the numeric code for the low surrogate
 * @returns {Number}       the length of the sequence for this character (always 1)
 */
Encoding.usascii.lenSurrogate = function (high, low) {
    return 1;
};

/**
 * Store the mapping for the character in the output buffer.
 *
 * @param {Buffer}  buf         the output buffer
 * @param {Number}  offset      the offset at which to store the mapped sequence
 * @param {Number}  ch          the numeric code for the character
 * @param {Object}  [options]   an options object
 * @returns {Number}            the length of the sequence for this character
 * @throws Error    if the character can not be encoded and 'errorFatal' is set to true in the
 *                  options object
 */
Encoding.usascii.storeCharacter = function (buf, offset, ch, options) {
    if (ch < 0x80)
        buf[offset] = ch;
    else {
        if (options && options.errorFatal)
            throw new Error('Character can not be encoded: 0x' + hexChar(ch));
        var substByte = options && options.substByte || defaultSubstByte;
        buf[offset] = substByte.charCodeAt(0);
    }
    return 1;
};

Encoding.encodings.push(Encoding.usascii);

// ISO-8859-1

var iso88591CodePage =
        '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087' +
        '\u0088\u0089\u008A\u008B\u008C\u008D\u008E\u008F' +
        '\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097' +
        '\u0098\u0099\u009A\u009B\u009C\u009D\u009E\u009F' +
        '\u00A0\u00A1\u00A2\u00A3\u00A4\u00A5\u00A6\u00A7' +
        '\u00A8\u00A9\u00AA\u00AB\u00AC\u00AD\u00AE\u00AF' +
        '\u00B0\u00B1\u00B2\u00B3\u00B4\u00B5\u00B6\u00B7' +
        '\u00B8\u00B9\u00BA\u00BB\u00BC\u00BD\u00BE\u00BF' +
        '\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5\u00C6\u00C7' +
        '\u00C8\u00C9\u00CA\u00CB\u00CC\u00CD\u00CE\u00CF' +
        '\u00D0\u00D1\u00D2\u00D3\u00D4\u00D5\u00D6\u00D7' +
        '\u00D8\u00D9\u00DA\u00DB\u00DC\u00DD\u00DE\u00DF' +
        '\u00E0\u00E1\u00E2\u00E3\u00E4\u00E5\u00E6\u00E7' +
        '\u00E8\u00E9\u00EA\u00EB\u00EC\u00ED\u00EE\u00EF' +
        '\u00F0\u00F1\u00F2\u00F3\u00F4\u00F5\u00F6\u00F7' +
        '\u00F8\u00F9\u00FA\u00FB\u00FC\u00FD\u00FE\u00FF';

Encoding.iso88591 = new CodePageEncoding(iso88591CodePage, 'iso-8859-1',
        /^iso[\-_]?8859[\-_]?1$/i, 0.5);

Encoding.encodings.push(Encoding.iso88591);

// ISO-8859-15

// the following table is derived from http://encoding.spec.whatwg.org/index-iso-8859-15.txt
var iso885915CodePage =
        '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087' +
        '\u0088\u0089\u008A\u008B\u008C\u008D\u008E\u008F' +
        '\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097' +
        '\u0098\u0099\u009A\u009B\u009C\u009D\u009E\u009F' +
        '\u00A0\u00A1\u00A2\u00A3\u20AC\u00A5\u0160\u00A7' +
        '\u0161\u00A9\u00AA\u00AB\u00AC\u00AD\u00AE\u00AF' +
        '\u00B0\u00B1\u00B2\u00B3\u017D\u00B5\u00B6\u00B7' +
        '\u017E\u00B9\u00BA\u00BB\u0152\u0153\u0178\u00BF' +
        '\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5\u00C6\u00C7' +
        '\u00C8\u00C9\u00CA\u00CB\u00CC\u00CD\u00CE\u00CF' +
        '\u00D0\u00D1\u00D2\u00D3\u00D4\u00D5\u00D6\u00D7' +
        '\u00D8\u00D9\u00DA\u00DB\u00DC\u00DD\u00DE\u00DF' +
        '\u00E0\u00E1\u00E2\u00E3\u00E4\u00E5\u00E6\u00E7' +
        '\u00E8\u00E9\u00EA\u00EB\u00EC\u00ED\u00EE\u00EF' +
        '\u00F0\u00F1\u00F2\u00F3\u00F4\u00F5\u00F6\u00F7' +
        '\u00F8\u00F9\u00FA\u00FB\u00FC\u00FD\u00FE\u00FF';

Encoding.iso885915 = new CodePageEncoding(iso885915CodePage, 'iso-8859-15',
        /^iso[\-_]?8859[\-_]?15$/i, 0.5);

Encoding.encodings.push(Encoding.iso885915);

// Windows-1252

// the following table is derived from http://encoding.spec.whatwg.org/index-windows-1252.txt
var win1252CodePage =
        '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021' +
        '\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F' +
        '\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014' +
        '\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178' +
        '\u00A0\u00A1\u00A2\u00A3\u00A4\u00A5\u00A6\u00A7' +
        '\u00A8\u00A9\u00AA\u00AB\u00AC\u00AD\u00AE\u00AF' +
        '\u00B0\u00B1\u00B2\u00B3\u00B4\u00B5\u00B6\u00B7' +
        '\u00B8\u00B9\u00BA\u00BB\u00BC\u00BD\u00BE\u00BF' +
        '\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5\u00C6\u00C7' +
        '\u00C8\u00C9\u00CA\u00CB\u00CC\u00CD\u00CE\u00CF' +
        '\u00D0\u00D1\u00D2\u00D3\u00D4\u00D5\u00D6\u00D7' +
        '\u00D8\u00D9\u00DA\u00DB\u00DC\u00DD\u00DE\u00DF' +
        '\u00E0\u00E1\u00E2\u00E3\u00E4\u00E5\u00E6\u00E7' +
        '\u00E8\u00E9\u00EA\u00EB\u00EC\u00ED\u00EE\u00EF' +
        '\u00F0\u00F1\u00F2\u00F3\u00F4\u00F5\u00F6\u00F7' +
        '\u00F8\u00F9\u00FA\u00FB\u00FC\u00FD\u00FE\u00FF';

Encoding.windows1252 = new CodePageEncoding(win1252CodePage, 'windows-1252',
        /^(windows|cp)[\-_]?1252$/i, 0.5);

Encoding.encodings.push(Encoding.windows1252);

exports.Encoding = Encoding;
exports.CodePageEncoding = CodePageEncoding;
exports.EncodeStream = EncodeStream;
exports.DecodeStream = DecodeStream;
exports.CodePageDecodeStream = CodePageDecodeStream;
exports.hexChar = hexChar; // temporary
exports.hexString = hexString; // temporary

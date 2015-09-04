'use strict';

Object.defineProperty(exports, '__esModule', {
	value: true
});

var _zlib = require('zlib');

var _fs = require('fs');

function gzipFile(infile, outfile) {
	return (0, _fs.createReadStream)(infile).pipe((0, _zlib.createGzip)()).pipe((0, _fs.createWriteStream)(outfile));
}

exports['default'] = {
	gzipFile: gzipFile
};
module.exports = exports['default'];

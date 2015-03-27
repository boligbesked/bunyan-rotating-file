"use strict";

var createGzip = require("zlib").createGzip;

var _fs = require("fs");

var createReadStream = _fs.createReadStream;
var createWriteStream = _fs.createWriteStream;

function gzipFile(infile, outfile) {
	var gzip = createGzip();

	var readable = createReadStream(infile);
	var writeable = createWriteStream(outfile);

	return readable.pipe(gzip).pipe(writeable);
}

module.exports = {
	gzipFile: gzipFile
};

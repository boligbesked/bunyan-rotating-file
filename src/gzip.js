'use strict';

import { createGzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';

function gzipFile (infile, outfile) {
	const gzip = createGzip();

	const readable = createReadStream(infile);
	const writeable = createWriteStream(outfile);

	return readable.pipe(gzip).pipe(writeable);
}

export default {
	gzipFile
}

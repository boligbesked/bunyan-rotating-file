import { createGzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';

function gzipFile (infile, outfile) {
	return createReadStream(infile)
		.pipe(createGzip())
		.pipe(createWriteStream(outfile));
}

export default {
	gzipFile
}

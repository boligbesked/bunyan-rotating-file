'use strict';

var bunyan = require('bunyan');
var RotatingFile = require('../lib');

function onError (err) {
  console.log('we caught an error!');
  console.error(err);
}

var coreStream = new RotatingFile({
  path: __dirname + '/log/core.log',
  period: 'hourly',
  count: 5
});
coreStream.on('error', onError);

var gzipStream = new RotatingFile({
  path: __dirname + '/log/gzip.log',
  period: 'hourly',
  count: 5,
  gzip: true
});
gzipStream.on('error', onError);

var log = bunyan.createLogger({
  name: 'foo',
  streams: [{
    stream: coreStream
  }, {
    stream: gzipStream
  }]
});

setInterval(function(){
  log.info('Just a string %s', Date.now());
}, 5000);

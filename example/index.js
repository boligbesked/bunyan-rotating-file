'use strict';

var bunyan = require('bunyan');
var RotatingFile = require('../lib');

var log = bunyan.createLogger({
  name: 'foo',
  streams: [{
    stream: new RotatingFile({
      path: __dirname + '/log/rotating-gzip-file.log',
      period: 'hourly',
      count: 5,
      gzip: true
    })
  }]
});

setInterval(function(){
  log.info('just a string %s', Date.now());
}, 10000);

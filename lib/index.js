'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _assert = require('assert');

var _assert2 = _interopRequireDefault(_assert);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _util = require('util');

var _events = require('events');

var _gzip = require('./gzip');

var HOUR = 60 * 60 * 1000;
var DAY = 24 * HOUR;
var WEEK = 7 * DAY;

var PERIODS = {
  'hourly': '1h',
  'daily': '1d',
  'weekly': '1w',
  'monthly': '1m',
  'yearly': '1y'
};

// Cap timeout to Node's max setTimeout, see
// <https://github.com/joyent/node/issues/8656>.
var TIMEOUT_MAX = 2147483647; // 2^31-1

function RotatingFileStream(opts) {
  // Validate that `options.count` is a number, and at >= 0
  (0, _assert2['default'])(typeof opts.count === 'number', (0, _util.format)('RotatingFile; options.count is not a number: %j (%s) in %j', opts.count, typeof opts.count, this));
  (0, _assert2['default'])(opts.count >= 0, (0, _util.format)('RotatingFile; options.count is not >= 0: %j in %j', opts.count, this));

  // Parse `options.period`.
  if (opts.period) {
    // <number><scope> where scope is:
    //    h   hours (at the start of the hour)
    //    d   days (at the start of the day, i.e. just after midnight)
    //    w   weeks (at the start of Monday)
    //    m   months (on the first of the month)
    //    y   years (at the start of Jan 1st)
    // with special values 'hourly' (1h), 'daily' (1d), "weekly" (1w),
    // 'monthly' (1m) and 'yearly' (1y)
    var period = PERIODS[opts.period] || opts.period;
    var m = /^([1-9][0-9]*)([hdwmy]|ms)$/.exec(period);
    if (!m) {
      throw new Error((0, _util.format)('Invalid period: "%s"', opts.period));
    }
    this.periodNum = Number(m[1]);
    this.periodScope = m[2];
  } else {
    this.periodNum = 1;
    this.periodScope = 'd';
  }

  this.path = opts.path;
  this.count = opts.count;
  this.gzip = Boolean(opts.gzip);

  this._queue = [];
  this._rotating = false;

  this._createWriteStream();

  this._setupNextRotate();
}

(0, _util.inherits)(RotatingFileStream, _events.EventEmitter);

RotatingFileStream.prototype._getStreamPath = function () {
  // TODO: template support for backup files
  // template: <path to which to rotate>
  //      default is %P.%n
  //      '/var/log/archive/foo.log'  -> foo.log.%n
  //      '/var/log/archive/foo.log.%n'
  //      codes:
  //          XXX support strftime codes (per node version of those)
  //              or whatever module. Pick non-colliding for extra
  //              codes
  //          %P      `path` base value
  //          %n      integer number of rotated log (1,2,3,...)
  //          %d      datetime in YYYY-MM-DD_HH-MM-SS
  //                      XXX what should default date format be?
  //                          prior art? Want to avoid ':' in
  //                          filenames (illegal on Windows for one).

  return this.path;
};

RotatingFileStream.prototype._createWriteStream = function () {
  this.stream = _fs2['default'].createWriteStream(this._getStreamPath(), {
    flags: 'a',
    encoding: 'utf8'
  });
};

RotatingFileStream.prototype._setupNextRotate = function () {
  var _this2 = this;

  var rotateAt = this._rotateAt = this._nextRotateTime();

  var delay = rotateAt - Date.now();
  if (delay > TIMEOUT_MAX) {
    delay = TIMEOUT_MAX;
  }

  this.timeout = setTimeout(function () {
    _this2._rotate();
  }, delay);

  if (typeof this.timeout.unref === 'function') {
    this.timeout.unref();
  }
};

RotatingFileStream.prototype._nextRotateTime = function _nextRotateTime() {
  // TODO: Improve logic of next rotation time
  // 1) Full re-calculating each time
  // 2) Schedule a re-calculation some time before the
  //    actual rotation time to increase the precision,
  //    as a timeout is not precise over longer periods

  var d = new Date();

  switch (this.periodScope) {
    case 'ms':
      // Hidden millisecond period for debugging.
      return (this._rotateAt || Date.now()) + this.periodNum;
    case 'h':
      if (this._rotateAt) {
        return this._rotateAt + this.periodNum * HOUR;
      }
      // First time: top of the next hour.
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    case 'd':
      if (this._rotateAt) {
        return this._rotateAt + this.periodNum * DAY;
      }
      // First time: start of tomorrow (i.e. at the coming midnight) UTC.
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    case 'w':
      // Currently, always on Monday morning at 00:00:00 (UTC).
      if (this._rotateAt) {
        return this._rotateAt + this.periodNum * WEEK;
      }
      // First time: this coming Monday.
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (8 - d.getDay())).getTime();
    case 'm':
      if (this._rotateAt) {
        return new Date(d.getFullYear(), d.getMonth() + this.periodNum, 1).getTime();
      }
      // First time: the start of the next month.
      return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    case 'y':
      if (this._rotateAt) {
        return new Date(d.getFullYear() + this.periodNum, 0, 1).getTime();
      }
      // First time: the start of the next year.
      return new Date(d.getFullYear() + 1, 0, 1).getTime();
    default:
      _assert2['default'].fail((0, _util.format)('RotatingFile; Invalid period scope: "%s"', this.periodScope));
  }
};

RotatingFileStream.prototype.getNthFilePath = function getNthFilePath(n) {
  return this.path + (this.gzip ? '.gz' : '') + (n >= 0 ? '.' + String(n) : '');
};

RotatingFileStream.prototype._rotate = function _rotate() {
  var _this = this;
  var _rotateAt = this._rotateAt;
  var gzip = this.gzip;
  var count = this.count;

  // If rotation period is > ~25 days, we have to break into multiple
  // setTimeout's. See <https://github.com/joyent/node/issues/8656>.
  if (_rotateAt && _rotateAt > Date.now()) {
    return this._setupNextRotate();
  }

  if (this._rotating) {
    throw new TypeError('Cannot start a rotation when already rotating');
  }
  this._rotating = true;

  this.stream.end();

  var n = this.count;

  function del(basePath) {
    var delPath = basePath + (n === 0 ? '' : '.' + String(n - 1));
    n -= 1;
    _fs2['default'].unlink(delPath, function (err) {
      if (err) {
        if (err.code === 'ENOENT') {
          _this.emit('debug', err);
        } else {
          _this.emit('error', err);
        }
      }

      moves();
    });
  }

  function moves() {
    if (count === 0 || n < 0) {
      return finish();
    }

    var before = _this.getNthFilePath(n - 1);
    var after = _this.getNthFilePath(n);

    n -= 1;
    _fs2['default'].exists(before, function (exists) {
      if (!exists) {
        return moves();
      }
      _fs2['default'].rename(before, after, function (err) {
        if (err) {
          _this.emit('error', err);
          return finish();
        }
        return moves();
      });
    });
  }

  function finish() {
    _this._finalizeRotation();
  }

  function zip(basePath) {
    if (!gzip) {
      return del(basePath);
    }

    var gzipPath = basePath + '.gz';

    (0, _gzip.gzipFile)(basePath, gzipPath).on('finish', function () {
      _fs2['default'].unlink(basePath, function (err) {
        if (err) {
          _this.emit('error', err);
        }
        del(gzipPath);
      });
    }).on('error', function (err) {
      return _this.emit('error', err);
    });
  }

  zip(this.path);
};

RotatingFileStream.prototype._finalizeRotation = function _finalizeRotation() {
  var _this3 = this;

  this._createWriteStream();

  this._queue.forEach(function (data) {
    return _this3.stream.write(data);
  });
  this._queue = [];

  this._rotating = false;
  this._setupNextRotate();

  this.emit('drain');
};

RotatingFileStream.prototype.write = function write(data) {
  if (!this._rotating) {
    return this.stream.write(data);
  }
  this._queue.push(data);
  return false;
};

RotatingFileStream.prototype.end = function end() {
  this.stream.end();
};

RotatingFileStream.prototype.destroy = function destroy() {
  this.stream.destroy();
};

RotatingFileStream.prototype.destroySoon = function destroySoon() {
  this.stream.destroySoon();
};

exports['default'] = RotatingFileStream;
module.exports = exports['default'];

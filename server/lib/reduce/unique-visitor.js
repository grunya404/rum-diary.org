/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// count number of unique visitors

const util = require('util');

const ReduceStream = require('../reduce-stream');

util.inherits(UniqueVisitorsStream, ReduceStream);

function UniqueVisitorsStream(options) {
  this._data = 0;
  ReduceStream.call(this, options);
}

UniqueVisitorsStream.prototype.name = 'unique';
UniqueVisitorsStream.prototype.type = null;

UniqueVisitorsStream.prototype._write = function(chunk, encoding, callback) {
  if (! chunk.returning) this._data++;

  callback(null);
};

module.exports = UniqueVisitorsStream;

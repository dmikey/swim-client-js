'use strict';

var recon = require('recon-js');

function LineIterator(string, index, more) {
  recon.StringIterator.call(this, string, index, more);
}

LineIterator.prototype = Object.create(recon.StringIterator.prototype);
LineIterator.prototype.constructor = LineIterator;
LineIterator.prototype.isDone = function () {
  return this.index >= this.string.length && !this.more ||
    this.index < this.string.length && this.head() === 10 /*'\n'*/;
};
LineIterator.prototype.isEmpty = function () {
  return this.index >= this.string.length || this.head() === 10 /*'\n'*/;
};
LineIterator.prototype.isInputDone = function () {
  return recon.StringIterator.prototype.isDone.call(this);
};
LineIterator.prototype.isInputEmpty = function () {
  return recon.StringIterator.prototype.isEmpty.call(this);
};
module.exports = LineIterator;
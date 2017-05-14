module.exports = factory

var map = require("through2-map")
var splice = require("stream-splice")
var pivot = require("array-pivot")
var isNumber = require("isnumber")

var through2 = require("through2")
var moment = require("moment-timezone")

function factory(fn) {
  function mapAgg(seqKey, segment, option, tz) {
    if (isNumber(segment) && segment < 1) {
      // Looks like percentile, otherwise segments less than one don't make sense
      option = segment
      segment = null
    }
    if (segment == null) segment = Number.MAX_VALUE

    var rollup = agg(seqKey, segment, tz)
    var transform = map({objectMode: true}, function (record) {
      var pivoted = pivot(record.set)
      var aggregated = {}
      aggregated[seqKey] = record[seqKey]
      // For lots of keys a for() might be faster here...
      Object.keys(pivoted).forEach(function (key) {
        if (key == seqKey) return
	// (qp) preserve fields that are strings
	if (pivoted[key].length && typeof pivoted[key][0] == 'string') aggregated[key] = pivoted[key][0]
        else aggregated[key] = fn.call(null, pivoted[key], option)
      })
      return aggregated
    })

    return splice(rollup, transform)
  }

  return mapAgg
}

function agg(seqKey, segment, tz) {
  function slot(record, encoding, callback) {
    if (this._windowSet == null) this._windowSet = []
    var floored = ( segment == Number.MAX_VALUE ? 0 : moment( record[seqKey] ).tz( tz || 'UTC' ).startOf( segment ).valueOf() )
    if (this._windowKey != null && floored != this._windowKey) {
      var aggregate = {set: this._windowSet.splice(0)}
      aggregate[seqKey] = this._windowKey
      this.push(aggregate)
      this._windowSet = []
    }
    this._windowKey = floored
    record[seqKey] = floored
    this._windowSet.push(record)
    return callback()
  }

  function flush(callback) {
    var aggregate = {set: this._windowSet}
    aggregate[seqKey] = this._windowKey
    this.push(aggregate)
    return callback()
  }

  return through2({objectMode: true}, slot, flush)
}

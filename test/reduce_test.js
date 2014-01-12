/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const mocha = require('mocha');
const assert = require('chai').assert;
const moment = require('moment');
const navigationTimingData = require('./data/navigation-timing.json');

const reduce = require('../server/lib/reduce');

describe('reduce', function() {
  /*
  it('findMedianNavigationTimes', function(done) {
    reduce.findMedianNavigationTimes(navigationTimingData, function(err, medianInfo) {
      assert.isNull(err);

      assert.isNumber(medianInfo.unloadEventStart);
      assert.isNumber(medianInfo.unloadEventEnd);
      assert.isNumber(medianInfo.unloadEventDuration);

      assert.isNumber(medianInfo.navigationStart);
      assert.isNumber(medianInfo.redirectStart);
      assert.isNumber(medianInfo.redirectEnd);
      assert.isNumber(medianInfo.redirectDuration);

      assert.isNumber(medianInfo.fetchStart);

      assert.isNumber(medianInfo.domainLookupStart);
      assert.isNumber(medianInfo.domainLookupEnd);
      assert.isNumber(medianInfo.domainLookupDuration);

      assert.isNumber(medianInfo.connectStart);
      assert.isNumber(medianInfo.secureConnectionStart);
      assert.isNumber(medianInfo.connectEnd);
      assert.isNumber(medianInfo.connectDuration);

      assert.isNumber(medianInfo.requestStart);
      assert.isNumber(medianInfo.responseStart);
      assert.isNumber(medianInfo.responseEnd);
      assert.isNumber(medianInfo.requestResponseDuration);

      assert.isNumber(medianInfo.domLoading);
      assert.isNumber(medianInfo.domInteractive);
      assert.isNumber(medianInfo.domContentLoadedEventStart);
      assert.isNumber(medianInfo.domContentLoadedEventEnd);
      assert.isNumber(medianInfo.domContentLoadedEventDuration);
      assert.isNumber(medianInfo.domComplete);
      assert.isNumber(medianInfo.processingDuration);

      assert.isNumber(medianInfo.loadEventStart);
      assert.isNumber(medianInfo.loadEventEnd);
      assert.isNumber(medianInfo.loadEventDuration);

      done();
    });
  });
*/

  it('findNavigationTimingStats', function(done) {
    reduce.findNavigationTimingStats(
      navigationTimingData,
      ['range', 'median', 'amean', 'stddev'],
      function(err, stats) {
      assert.isNull(err);

      var medianInfo = stats.median;
      assert.isNumber(medianInfo.requestStart);
      assert.isNumber(medianInfo.responseStart);
      assert.isNumber(medianInfo.responseEnd);
      assert.isNumber(medianInfo.requestResponseDuration);

      assert.isNumber(medianInfo.domLoading);
      assert.isNumber(medianInfo.domInteractive);
      assert.isNumber(medianInfo.domContentLoadedEventStart);
      assert.isNumber(medianInfo.domContentLoadedEventEnd);
      assert.isNumber(medianInfo.domContentLoadedEventDuration);
      assert.isNumber(medianInfo.domComplete);
      assert.isNumber(medianInfo.processingDuration);

      assert.isNumber(medianInfo.loadEventStart);
      assert.isNumber(medianInfo.loadEventEnd);
      assert.isNumber(medianInfo.loadEventDuration);

      var rangeInfo = stats.range;
      assert.isArray(rangeInfo.requestStart);
      assert.isArray(rangeInfo.responseStart);
      assert.isArray(rangeInfo.responseEnd);
      assert.isArray(rangeInfo.requestResponseDuration);

      assert.isArray(rangeInfo.domLoading);
      assert.isArray(rangeInfo.domInteractive);
      assert.isArray(rangeInfo.domContentLoadedEventStart);
      assert.isArray(rangeInfo.domContentLoadedEventEnd);
      assert.isArray(rangeInfo.domContentLoadedEventDuration);
      assert.isArray(rangeInfo.domComplete);
      assert.isArray(rangeInfo.processingDuration);

      assert.isArray(rangeInfo.loadEventStart);
      assert.isArray(rangeInfo.loadEventEnd);
      assert.isArray(rangeInfo.loadEventDuration);
      done();
    });
  });

  /*
  it('findReferrers', function(done) {
    reduce.findReferrers(
      navigationTimingData,
      function(err, data) {

      assert.isNull(err);

      assert.equal(data.by_hostname['localhost'], 9);
      assert.equal(data.by_count[0].hostname, 'localhost');
      assert.equal(data.by_count[0].count, 9);

      done();
    });
  });
*/

  it('findHostnames', function(done) {
    reduce.findHostnames(
      navigationTimingData,
      function(err, data) {

      assert.isNull(err);

      assert.equal(data.localhost, 9);

      done();
    });
  });

  it('mapReduce', function(done) {
    var copy = [];

    // give us a respectable amount of data
    while(copy.length < 50000) {
      copy = copy.concat(navigationTimingData);
    }

    reduce.mapReduce(copy, [
      'hostnames',
      'hits_per_page',
      'referrers',
      'navigation',
      'hits_per_day'
    ], {
      start: moment(new Date()).subtract('days', 30),
      end: moment(),
      navigation: {
        calculate: ['median']
      }
    }).then(function(data) {
      console.log('processing time', data.processing_time);
      done();
    }).error(function(err) {
      assert.isTrue(false, err);
      done();
    });
  });
});


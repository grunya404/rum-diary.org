/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const moment = require('moment');
const Stats = require('fast-stats').Stats;
const url = require('url');
const SortedArray = require('sarray');
const Promise = require('bluebird');
const EasierObject = require('easierobject').easierObject;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function ensurePageInfo(returnedData, page, startDate, endDate) {
  if ( ! (page in returnedData)) {
    var numDays = diffDays(startDate, endDate);
    returnedData[page] = [];
    // <= to include both the start and end date
    for (var i = 0; i <= numDays; ++i) {
      var date = new Date();
      date.setTime(startDate + (i * MS_PER_DAY));
      returnedData[page][i] = {
        hits: 0,
        date: moment(date).format('YYYY-MM-DD')
      };
    }
  }

  return returnedData;
}

function diffDays(startDate, date) {
  return Math.floor((date - startDate) / MS_PER_DAY);
}

function getPageDateInfo(returnedData, page, startDate, date) {
  var index = diffDays(startDate, date);
  return returnedData[page][index];
}

function incrementDailyPageHit(returnedData, page, startDate, date) {
  var pageDateInfo = getPageDateInfo(returnedData, page, startDate, date);
  if ( ! pageDateInfo) return new Error('invalid date range');
  pageDateInfo.hits++;
}

function earliestDate(data, dateName) {
  return data.reduce(function(prevStart, item) {
            var currStart = new Date(item[dateName]);
            if ( ! prevStart) return currStart;
            if (currStart < prevStart) return currStart;
            return prevStart;
          }, null);
}

function latestDate(data, dateName) {
  return data.reduce(function(prevEnd, item) {
            var currEnd = new Date(item[dateName]);
            if ( ! prevEnd) return currEnd;
            if (currEnd > prevEnd) return currEnd;
            return prevEnd;
          }, null);
}

function updatePageHit(hitsPerDay, options, hit) {
  var date = new Date(hit.createdAt);

  if (hit.path) {
    ensurePageInfo(hitsPerDay, hit.path, options.start, options.end);
    incrementDailyPageHit(hitsPerDay, hit.path, options.start, date);
  }

  incrementDailyPageHit(hitsPerDay, '__all', options.start, date);
}

function toStatsToCalculate(userDefinedStats) {
  return userDefinedStats.reduce(function(prevValue, curr) {
    if (! isNaN(curr)) {
      prevValue.push({
        name: 'percentile',
        args: [ parseInt(curr, 10) ],
        outName: curr
      });
    }
    else if (curr === 'quartiles') {
      prevValue.push({
        name: 'percentile',
        args: [25],
        outName: '25'
      });
      prevValue.push({
        name: 'percentile',
        args: [50],
        outName: '50'
      });
      prevValue.push({
        name: 'percentile',
        args: [75],
        outName: '75'
      });
    }
    else {
      prevValue.push({
        name: curr,
        args: [],
        outName: curr
      });
    }
    return prevValue;
  }, []);
}

function calculateNavigationTimingStats(accumulators, statsUserWants) {
  return Promise.attempt(function() {
    var statsToCalculate = toStatsToCalculate(statsUserWants);
    var returnedStats = new EasierObject();

    for (var key in accumulators) {
      statsToCalculate.forEach(function(stat) {
        var accumulator = accumulators[key];
        var value = accumulator[stat.name].apply(accumulator, stat.args);
        returnedStats.setItem(stat.outName, key, value);
      });
    }

    return returnedStats.obj;
  });
}

exports.findNavigationTimingStats = function (hits, statsToFind, options, done) {
  if ( ! done && typeof options === 'function') {
    done = options;
    options = {};
  }

  if ( ! options.navigation) options.navigation = {};
  options.navigation.calculate = statsToFind;
  exports.mapReduce(hits, ['navigation'], options)
    .then(function(data) {
      done(null, data.navigation);
      return data;
    }).error(function(reason) {
      done(reason);
      return reason;
    });
};

function sortHostnamesByCount(countByHostname) {
  var sortedByCount = SortedArray(function(a, b) {
    return b.count - a.count;
  });

  Object.keys(countByHostname).forEach(function(hostname) {
    sortedByCount.add({
      hostname: hostname,
      count: countByHostname[hostname]
    });
  });

  return sortedByCount.items;
}

function createStat(options) {
  return new Stats(options);
}

function getNavigationTimingAccumulators(options) {
  // For descriptions, see:
  // https://dvcs.w3.org/hg/webperf/raw-file/tip/specs/NavigationTiming/Overview.html#processing-model

  // prompt for unload
  var stats = {
    navigationStart: createStat(options),

    // redirect - only visible if redirecting from the same domain.
    redirectStart: createStat(options),
    redirectEnd: createStat(options),
    redirectDuration: createStat(options),

    // App cache
    fetchStart: createStat(options),

    // DNS - will be the same as fetchStart if DNS is already resolved.
    domainLookupStart: createStat(options),
    domainLookupEnd: createStat(options),
    domainLookupDuration: createStat(options),

    // TCP - will be the same as domainLookupDuration if reusing a connection.
    connectStart: createStat(options),
    secureConnectionStart: createStat(options),
    connectEnd: createStat(options),
    connectDuration: createStat(options),

    // request & response
    requestStart: createStat(options),
    responseStart: createStat(options),
    responseEnd: createStat(options),
    requestResponseDuration: createStat(options),

    // unload previous page - only valid previous page was on the same domain.
    unloadEventStart: createStat(options),
    unloadEventEnd: createStat(options),
    unloadEventDuration: createStat(options),

    // processing
    domLoading: createStat(options),
    domInteractive: createStat(options),
    domContentLoadedEventStart: createStat(options),
    domContentLoadedEventEnd: createStat(options),
    domContentLoadedEventDuration: createStat(options),
    domComplete: createStat(options),

    // load
    loadEventStart: createStat(options),
    loadEventEnd: createStat(options),
    loadEventDuration: createStat(options),
    processingDuration: createStat(options)
  };

  return stats;
}

function updateNavigationTiming(stats, hit) {
    var navTiming = hit.navigationTiming;

    for (var key in navTiming) {
      if (stats.hasOwnProperty(key)) stats[key].push(navTiming[key]);
    }

    stats.redirectDuration.push(
              navTiming.redirectEnd - navTiming.redirectStart);

    stats.domainLookupDuration.push(
              navTiming.domainLookupEnd - navTiming.domainLookupStart);

    stats.connectDuration.push(
              navTiming.connectEnd - navTiming.connectStart);

    stats.requestResponseDuration.push(
              navTiming.responseEnd - navTiming.requestStart);

    stats.unloadEventDuration.push(
              navTiming.unloadEventEnd - navTiming.unloadEventStart);

    stats.domContentLoadedEventDuration.push(
              navTiming.domContentLoadedEventEnd - navTiming.domContentLoadedEventStart);

    stats.loadEventDuration.push(
              navTiming.loadEventEnd - navTiming.loadEventStart);

    stats.processingDuration.push(
              navTiming.loadEventEnd - navTiming.domLoading);
}

exports.findHostnames = function(hits, done) {
  exports.mapReduce(hits, ['hostnames'], function(err, data) {
    if (err) return done(err);
    done(null, data.hostnames);
  });
};


function updateHostname(hostnames, hit) {
  if (hit.hostname) {
    if ( ! (hit.hostname in hostnames)) {
      hostnames[hit.hostname] = 0;
    }

    hostnames[hit.hostname]++;
  }
}

function updateReferrer(referrers, hit) {
  if ( ! hit.referrer) return;

  var hostname = hit.referrer_hostname;
  if ( ! hostname) {
    try {
      var parsed = url.parse(hit.referrer);
      hostname = parsed.hostname;
    } catch(e) {
      return;
    }
  }

  if ( ! referrers[hostname]) {
    referrers[hostname] = 0;
  }

  referrers[hostname]++;
}

function updateHitsPerPage(hitsPerPage, hit) {
  hitsPerPage.__all++;

  var path = hit.path;
  if ( ! path) return;

  if ( ! (path in hitsPerPage)) hitsPerPage[path] = 0;

  hitsPerPage[path]++;
}

function updateBrowser(browsers, hit) {
  if (hit.browser && hit.browser.family) {
    var family = hit.browser.family;

    if (! (family in browsers)) {
      browsers[family] = 0;
    }

    browsers[family]++;
  }
}

function updateOs(os, hit) {
  if (hit.os) {
    var family = hit.os;

    if (! (family in os)) {
      os[family] = 0;
    }

    os[family]++;
  }
}

exports.mapReduce = function(hits, fields, options, done) {
  var startTime = new Date();
  return Promise.attempt(function() {
    if (typeof options === 'function' && !done) {
      done = options;
      options = {};
    }

    var data = {};

    var doHostnames = fields.indexOf('hostnames') > -1;
    if (doHostnames) data.hostnames = {};

    var doHitsPerPage = fields.indexOf('hits_per_page') > -1;
    if (doHitsPerPage) data.hits_per_page = { __all: 0 };

    var doReferrers = fields.indexOf('referrers') > -1;
    if (doReferrers) data.referrers = { by_hostname: {} };

    var doNavigation = fields.indexOf('navigation') > -1;
    if (doNavigation) data.navigation_accumulators = getNavigationTimingAccumulators(options);

    var doHitsPerDay = fields.indexOf('hits_per_day') > -1;
    if (doHitsPerDay) {
      if ( ! options.start) options.start = earliestDate(hits, 'createdAt');
      if ( ! options.end) options.end = latestDate(hits, 'createdAt');

      options.start = moment(options.start).startOf('day').toDate().getTime();
      options.end = moment(options.end).endOf('day').toDate().getTime();

      data.hits_per_day = {};
      ensurePageInfo(data.hits_per_day, '__all', options.start, options.end);
    }

    var doUniqueVisitors = fields.indexOf('unique') > -1;
    if (doUniqueVisitors) data.unique = 0;

    var doReturningVisitors = fields.indexOf('returning') > -1;
    if (doReturningVisitors) data.returning = 0;

    var doBrowsers = fields.indexOf('browsers') > -1;
    if (doBrowsers) data.browsers = {};

    var doOs = fields.indexOf('os') > -1;
    if (doOs) data.os = {};

    hits.forEach(function(hit) {
      if (doHostnames) updateHostname(data.hostnames, hit);
      if (doHitsPerPage) updateHitsPerPage(data.hits_per_page, hit);
      if (doReferrers) updateReferrer(data.referrers.by_hostname, hit);
      if (doNavigation) updateNavigationTiming(data.navigation_accumulators, hit);
      if (doHitsPerDay) updatePageHit(data.hits_per_day, options, hit);
      if (doUniqueVisitors) if (! hit.returning) data.unique++;
      if (doReturningVisitors) if (hit.returning) data.returning++;
      if (doBrowsers) updateBrowser(data.browsers, hit);
      if (doOs) updateOs(data.os, hit);
    });

    if (doReferrers) {
      data.referrers.by_count
              = sortHostnamesByCount(data.referrers.by_hostname);
    }

    if (! doNavigation) return data;

    return calculateNavigationTimingStats(
        data.navigation_accumulators, options.navigation.calculate)
      .then(function(navigationTimingStats) {
        data.navigation = navigationTimingStats;
        return data;
      });
  }).then(function(data) {
    data.processing_time = (new Date().getTime() - startTime.getTime());
    if (done) done(null, data);
    return data;
  }).error(function(reason) {
    if (done) done(reason);
    return reason;
  });
};

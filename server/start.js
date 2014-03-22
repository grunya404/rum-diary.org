/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const spdy = require('spdy');
const connect_fonts = require('connect-fonts');
const connect_fonts_vera_sans = require('connect-fonts-bitstream-vera-sans');
const gzip_static = require('connect-gzip-static');
const helmet = require('helmet');
const cachify = require('connect-cachify');

const config = require('./lib/config');
const logger = require('./lib/logger');
const routes = require('./lib/routes.js');
const ssl = require('./lib/ssl');

const SessionStore = require('./lib/session-store');

const STATIC_ROOT = path.join(config.get('static_root'),
                                config.get('static_dir'));


SessionStore.create().then(function (sessionStore) {
  const app = express();

  app.use(express.cookieParser());

  app.use(express.session({
    cookie: {
      maxAge: 1000 * 60 * 60 * 24  // 24 hours in milliseconds
    },
    secret: 'wild and crazy cats',
    store: sessionStore
  }));

  app.use(helmet.xframe('deny'));
  if (config.get('ssl')) {
    app.use(helmet.hsts());
  }
  app.use(helmet.iexss());
  app.use(helmet.contentTypeOptions());
  app.disable('x-powered-by');

  app.use(helmet.csp());
  const cspPolicy = {
    defaultPolicy: {
      'default-src': ['\'self\'', 'https://login.persona.org']
    }
  };
  helmet.csp.policy(cspPolicy);

  // Template setup.
  var env = nunjucks.configure(config.get('views_dir'), {
    autoescape: true,
    express: app
  });

  // sets up a filter to use in the templates that allows for cachifying.
  env.addFilter('cachify', function(str) {
    if (config.get('strong_http_caching')) return cachify.cachify(str);
    return str;
  });

  // We need to get info out of the request bodies sometimes.
  app.use(express.bodyParser());

  // Send all express logs to our logger.
  app.use(express.logger({
    format: 'tiny',
    stream: {
      write: function(x) {
        logger.info(typeof x === 'string' ? x.trim() : x);
      }
    }
  }));

  app.use(connect_fonts.setup({
    fonts: [ connect_fonts_vera_sans ],
    allow_origin: config.get('hostname'),
    maxage: 180 * 24 * 60 * 60 * 1000,   // 180 days
    compress: true
  }));

  // Get all of our routes.
  app.use(routes);

  // set up cachify before the static middleware to strip off any md5's then
  // serve up the correct gzipped item.
  app.use(cachify.setup({}, {
    root: STATIC_ROOT
  }));

  // Static middleware is last.
  app.use(gzip_static(STATIC_ROOT, { force: true }));


  // Set up SPDY.
  var spdyOptions = {
    key: ssl.getKey(),
    cert: ssl.getCert(),
    ssl: config.get('ssl'),
    plain: true
  };

  const HTTPS_PORT = config.get('https_port');
  spdy.createServer(spdyOptions, app).listen(HTTPS_PORT, function() {
    logger.info('https listening on port', HTTPS_PORT);
  });

  // set up http redirect. Put this on its own process perhaps?
  const HTTP_PORT = config.get('http_port');
  const http =  express();
  http.disable('x-powered-by');

  // allow http protocol for local testing.
  const protocol = config.get('ssl') ? 'https://' : 'http://';
  const redirectTo = protocol + config.get('hostname') + (HTTPS_PORT !== 443 ? ':' + HTTPS_PORT : '');
  http.get('*',function(req, res){
    res.redirect(301, redirectTo + req.url);
  });

  http.listen(HTTP_PORT, function() {
    logger.info('http listening on port', HTTP_PORT);
  });
});

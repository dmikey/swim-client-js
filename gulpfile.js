'use strict';

var args = require('yargs').argv;
var browserify = require('browserify');
var buffer = require('vinyl-buffer');
var coveralls = require('gulp-coveralls');
var del = require('del');
var fs = require('fs');
var gulp = require('gulp');
var gulpif = require('gulp-if');
var gutil = require('gulp-util');
var istanbul = require('gulp-istanbul');
var jscs = require('gulp-jscs');
var jshint = require('gulp-jshint');
var mocha = require('gulp-mocha');
var pkg = require('./package.json');
var source = require('vinyl-source-stream');
var sourcemaps = require('gulp-sourcemaps');
var stylish = require('gulp-jscs-stylish');
var uglify = require('gulp-uglify');

//
// Config
//

var devel = args.devel || false;
var debug = args.debug || devel; // --devel implies --debug

//
// Paths
//

var configFile = './config.json';
var main = './swim-client.js';
var scripts = [main, './src/*.js'];
var tests = ['./swim-client-test.js'];
var sources = scripts.concat(tests);

//
// Pipelines
//

function generatedConfig() {
  var config = {
    version: pkg.version
  };
  fs.writeFileSync(configFile, JSON.stringify(config) + '\n');
  return gulp.src(configFile);
}

function validatedSources() {
  return gulp.src(sources)
    .pipe(jshint())
    .pipe(jscs())
    .on('error', function () {})
    .pipe(stylish.combineWithHintResults())
    .pipe(jshint.reporter('jshint-stylish'));
}

function builtScripts() {
  generatedConfig();
  validatedSources();
  return browserify({
      standalone: 'swim',
      debug: devel || !debug
    })
    .require(main, {expose: 'swim-client-js'})
    .bundle()
    .pipe(source('swim-client.min.js'))
    .pipe(buffer())
    .pipe(gulpif(devel || !debug, sourcemaps.init({loadMaps: true})))
      .pipe(gulpif(devel || !debug, uglify()))
      .on('error', gutil.log)
    .pipe(gulpif(devel, sourcemaps.write(), gulpif(!debug, sourcemaps.write('./'))))
    .pipe(gulp.dest('./'));
}

function testResults(callback) {
  gulp.src(scripts)
    .pipe(istanbul())
    .pipe(istanbul.hookRequire())
    .on('finish', function () {
      gulp.src(tests)
        .pipe(mocha())
        .pipe(istanbul.writeReports({
          reporters: ['html', 'lcov', 'text-summary']
        }))
        .on('end', callback);
    });
}

function coverageReport() {
  return gulp.src('./coverage/lcov.info')
    .pipe(coveralls());
}

function builtLAndTestedLibrary(callback) {
  builtScripts();
  testResults(callback);
}

//
// Tasks
//

// Removes generated files.
gulp.task('clean', function () {
  del.sync([configFile, 'coverage']);
});

// Runs jshint and jscs on javascript sources.
gulp.task('validate', validatedSources);

// Validates, browserifies, and uglifies scripts.
gulp.task('build', builtScripts);

// Runs unit tests.
gulp.task('test', testResults);

// Generates a code coverage report.
gulp.task('coverage', coverageReport);

// Builds and tests the library.
gulp.task('build-test', builtLAndTestedLibrary);

// Defaults to a clean library build.
gulp.task('default', ['build-test']);

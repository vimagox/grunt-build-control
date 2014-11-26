/*jshint -W030 */

'use strict';

var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var childProcess = require('child_process');
var should = require('chai').should();


var GRUNT_EXEC = 'node ' + path.resolve('node_modules/grunt-cli/bin/grunt');



/**
 * Executes a Scenario given by tests.
 *
 * A Scenario can contain:
 *    repo - the folder to contain the repository
 *    repo/gruntfile.js - the gruntfile to be tested
 *    remote - (optional) can contain a setup cloud repository
 *    validate - (will be overwritten) it is cloned from remote (used to validate a push)
 *
 **
 * NOTE: this function DOES change the process's working directory to the `scenario` so that
 * validations are easier access.
 */
var execScenario = function(cb) {
  var mockRepoDir = path.normalize(__dirname + '/mock');

  var distDir = path.join(mockRepoDir, 'repo');
  var remoteDir = path.join(mockRepoDir, 'remote');
  var verifyDir = path.join(mockRepoDir, 'validate');


  var tasks = [];


  tasks.push(function createRemote(next) {
    fs.ensureDirSync(remoteDir);
    childProcess.exec('git init --bare', {cwd: remoteDir}, function(err) {
      if (err) throw new Error(err);
      next(err);
    });
  });


  tasks.push(function executeGruntCommand(next) {
    //options
    GRUNT_EXEC += ' --no-color';

    childProcess.exec(GRUNT_EXEC, {cwd: distDir}, function(err, stdout, stderr) {
      next(err, {stdout: stdout, stderr: stderr});
    });
  });


  tasks.push(function createVerifyFromRemote(next) {
    fs.removeSync(verifyDir); // since we're cloning from `remote/` we'll just remove the folder if it exists
    childProcess.exec('git clone remote validate', {cwd: mockRepoDir}, function(err) {
      if (err) throw new Error(err);
      next(err);
    });
  });


  async.series(tasks, function returnCallbackStatus(err, results) {
    // return results from executeGruntCommand
    cb(err, results[1].stdout, results[1].stderr);
  });
};



/**
 * Tests
 *
 * Each test is using the perspective as a "user", take a look at the "basic deploy" suite.
 *
 * `describe` suite's title should have the same name as the scenario folder.
 *
 * Assumptions:
 *    - each tests' current working directory has been set to `test/mock`
 */
describe('buildcontrol', function() {
  this.timeout(3500);


  beforeEach(function(done) {
    // ensure that we reset to `test/` dir
    process.chdir(__dirname);

    // clean testing folder `test/mock`
    fs.removeSync('mock');
    fs.ensureDirSync('mock');

    // copy scenario to `test/mock`
    fs.copySync('scenarios/' + this.currentTest.parent.title, 'mock');

    // ensure all tests are are using the working directory: `test/mock`
    process.chdir('mock');
    done();
  });



  describe('basic deployment', function() {
    it('should have pushed a file and had the correct commit in "verify" repo', function(done) {
      // the working directory is `test/mock`.
      var tasks = [];

      /**
       * Test case specific setup
       */
        // make `mock` a actual repository
      tasks.push(function git_init(next) {
        childProcess.exec('git init', next);
      });

      tasks.push(function git_add(next) {
        childProcess.exec('git add .', next);
      });

      tasks.push(function git_commit(next) {
        childProcess.exec('git commit -m "basic deployment"', next);
      });

      /**
       * Execute scenario
       */
      tasks.push(function execute_scenario(next) {
        execScenario(function(err) {
          should.not.exist(err);
          next();
        });
      });

      /**
       * Should style validations
       */
      tasks.push(function verify_file_exists(next) {
        fs.existsSync('validate/empty_file').should.be.true;
        next();
      });

      tasks.push(function verify_commit_message(next) {
        childProcess.exec('git rev-parse HEAD', function(err, sha) {
          sha = sha.substr(0, 7);

          childProcess.exec('git log --pretty=oneline --no-color', {cwd: 'validate'}, function(err, stdout) {
            stdout.should.have.string('from commit ' + sha);
            next();
          });
        });
      });

      async.series(tasks, done);
    });

  });


  describe('merge multiple repos', function() {
    it('merge multiple repos', function(done) {
      execScenario(function(err, results) {
        should.not.exist(err);
        var numberFile = fs.readFileSync('validate/numbers.txt', {encoding: 'utf8'});
        numberFile.should.be.eql('0 1 2\n');
        done();
      });
    });

  });


  describe('simple deploy', function() {
    it('should deploy multiple times with the correct commit message', function(done) {
      var tasks = [];

      tasks.push(function(next) {
        execScenario(function() {
          var numberFile = fs.readFileSync('validate/numbers.txt', {encoding: 'utf8'});
          numberFile.should.be.eql('1 2 3 4\n');
          next();
        });
      });

      tasks.push(function(next) {
        fs.writeFileSync('repo/dist/numbers.txt', '100 200');

        execScenario(function(err, results) {
          var numberFile = fs.readFileSync('validate/numbers.txt', {encoding: 'utf8'});
          numberFile.should.be.eql('100 200');
          next();
        });
      });

      tasks.push(function(next) {
        childProcess.exec('git log --pretty=oneline --abbrev-commit --no-color', {cwd: 'validate'}, function(err, stdout) {
          stdout.should.have.string('simple deploy commit message');
          next();
        });
      });

      async.series(tasks, done);
    });


    it('should not have <TOKEN> in the message', function(done) {
      execScenario(function(err, stdout) {
        should.not.exist(err);
        stdout.should.not.have.string('<TOKEN>');
        done();
      });
    });

  });


  describe('secure endpoint', function() {
    it('should not log out secure information', function(done) {
      var tasks = [];

      tasks.push(function(next) {
        execScenario(function(err, stdout) {
          stdout.should.not.have.string('privateUsername');
          stdout.should.not.have.string('1234567890abcdef');
          stdout.should.have.string('github.com/pubUsername/temp.git');
          stdout.should.have.string('<CREDENTIALS>');
          next();
        });
      });

      async.series(tasks, done);
    });


    it('should have the correct remote url in git', function(done) {
      var tasks = [];

      tasks.push(function(next) {
        execScenario(function() {
          next();
        });
      });

      tasks.push(function(next) {
        childProcess.exec('git remote -v', {cwd: 'repo/dist'}, function(err, stdout) {
          stdout.should.have.string('https://privateUsername:1234567890abcdef@github.com/pubUsername/temp.git');
          next();
        });
      });

      async.series(tasks, done);
    });

  });


  describe.only('preview build branch', function() {
    it('should have created a local branch "build"', function(done) {
      var tasks = [];

      tasks.push(function(next) {
        execScenario(function(err) {
          next(err);
        });
      });

      tasks.push(function(next) {
        childProcess.exec('git branch', {cwd: 'repo'}, function(err, stdout) {
          stdout.should.have.string('build');
          next();
        });
      });

      async.series(tasks, done);
    });

  });

});

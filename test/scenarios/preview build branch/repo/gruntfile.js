module.exports = function (grunt) {
  // add custom tasks
  // NOTE: cwd is `test/mock-repo`
  grunt.loadTasks('../../../tasks');


  // test config
  grunt.initConfig({
    buildcontrol: {
      options: {
        dir: '.',
        remote: '../remote',
        connectCommits: false
      },
      deploy: {
        options: {
          branch: 'build',
          commit: true,
          message: 'adding file to say hi',
          push: false
        }
      }
    }
  });

  // default task
  grunt.registerTask('default', ['buildcontrol']);
};

'use strict';

const service = require('feathers-mongoose');
const ltiTool = require('./model');
const hooks = require('./hooks');

module.exports = function() {
  const app = this;

	const options = {
    Model: ltiTool,
    paginate: {
      default: 100,
      max: 100
    },
		lean: true
  };

  // Initialize our service with any options it requires
  app.use('/ltiTools', service(options));

  // Get our initialize service to that we can bind hooks
  const ltiToolService = app.service('/ltiTools');

  ltiToolService.hooks({
		before: hooks.before,
		after: hooks.after
	});
};

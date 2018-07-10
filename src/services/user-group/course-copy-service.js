const hooks = require('./hooks/copyCourseHook');
const errors = require('feathers-errors');
const courseModel = require('./model').courseModel;
const homeworkModel = require('../homework/model').homeworkModel;
const lessonsModel = require('../lesson/model');
const _ = require('lodash');

const createHomework = (homework, courseId, lessonId, userId, app) => {
	return app.service('homework/copy').create({_id: homework._id, courseId, lessonId, userId})
		.then(res => {
			return res;
		})
		.catch(err => {
			return Promise.reject(err);
		});
};

const createLesson = (lessonId, newCourseId, courseId, userId, app) => {
	return app.service('lessons/copy').create({lessonId, newCourseId, courseId, userId})
		.then(res => {
			return res;
		})
		.catch(err => {
			return Promise.reject(err);
		});
};

class CourseCopyService {

	constructor(app) {
		this.app = app;
	}

	/**
	 * Copies a course and copies homework and lessons of that course.
	 * @param data object consisting of name, color, teacherIds, classIds, userIds, .... everything you can edit or what is required by a course.
	 * @param params user Object and other params.
	 * @returns newly created course.
	 */
	create(data, params) {
		let tempData = JSON.parse(JSON.stringify(data));
		tempData = _.omit(tempData, ['_id', 'courseId']);

		return courseModel.findOne({_id: data._id}).exec()
			.then(course => {
				let tempCourse = JSON.parse(JSON.stringify(course));
				tempCourse = _.omit(tempCourse, ['_id', 'createdAt', 'updatedAt', '__v', 'name', 'color', 'teacherIds', 'classIds', 'userIds', 'substitutionIds']);

				tempCourse = Object.assign(tempCourse, tempData, {userId: params.account.userId});

				return this.app.service('courses').create(tempCourse)
					.then(res => {
						let homeworkPromise = homeworkModel.find({courseId: data._id}).populate('lessonId');
						let lessonsPromise = lessonsModel.find({courseId: data._id});

						return Promise.all([homeworkPromise, lessonsPromise])
							.then(([homeworks, lessons]) => {
								let createdLessons = [];

								return Promise.all(lessons.map(lesson => {
									return createLesson(lesson._id, res._id, data._id, params.account.userId, this.app)
										.then(lessonRes => {
											createdLessons.push({_id: lessonRes._id, name: lessonRes.name});
										});
								}))
									.then(_ => {
										return Promise.all(homeworks.map(homework => {
											let convertedLesson = undefined;
											if (homework.archived.length > 0 || homework.teacherId.toString() !== params.account.userId.toString())
												return;
											else if (homework.lessonId) {
												convertedLesson = createdLessons.filter(h => {
													return h.name === homework.lessonId.name;
												});
												convertedLesson = convertedLesson[0]._id;
											}
											return createHomework(homework, res._id, convertedLesson, params.account.userId, this.app);
										}))
											.then(_ => {
												return res;
											});
									});
							});
				});
			});
	}

}

module.exports = function () {
	const app = this;

	// Initialize our service with any options it requires
	app.use('/courses/copy', new CourseCopyService(app));

	// Get our initialize service to that we can bind hooks
	const courseCopyService = app.service('/courses/copy');

	// Set up our before hooks
	courseCopyService.before(hooks.before);
};
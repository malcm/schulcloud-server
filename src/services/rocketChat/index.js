const request = require('request-promise-native');
//const service = require('feathers-mongoose');
const errors = require('feathers-errors');
const logger = require('winston');

const rocketChatModels = require('./model');
const hooks = require('./hooks');
const docs = require('./docs');
const { randomPass } = require('./randomPass');


const REQUEST_TIMEOUT = 4000; // in ms
const ROCKET_CHAT_URI = process.env.ROCKET_CHAT;

if (ROCKET_CHAT_URI === undefined)
    throw new errors.NotImplemented('Please set process.env.ROCKET_CHAT.');

class RocketChat {
    constructor(options) {
        this.options = options || {};
        this.docs = docs;
    }

    getOptions(shortUri, body, method) {
        return {
            uri: ROCKET_CHAT_URI + shortUri,
            method: method || 'POST',
            //  headers: {
            //     'Authorization': process.env.ROCKET_CHAT_SECRET
            // },
            body,
            json: true,
            timeout: REQUEST_TIMEOUT
        };
    }

    createRocketChatAccount(data, params) {
        const userId = data.userId;
        if (userId === undefined)
            throw new errors.BadRequest('Missing data value.');

        const internalParams = {
            query: { $populate: "schoolId" }
        };
        return this.app.service('users').get(userId, internalParams).then(user => {
            const email = user.email;
            const pass = randomPass();
            const username = ([user.schoolId.name, user.firstName, user.lastName].join('.')).replace(/\s/g, '_');
            const name = [user.firstName, user.lastName].join('.');

            return rocketChatModels.userModel.create({ userId, pass, username }).then((res) => {
                if (res.errors !== undefined)
                    throw new errors.BadRequest('Can not insert into collection.', res.errors);

                const body = { email, pass, username, name };
                return request(this.getOptions('/api/v1/users.register', body)).then(res => {
                    if (res.success === true && res.user !== undefined)
                        return res;
                    else
                        throw new errors.BadRequest('False response data from rocketChat');
                }).catch(err => {
                    throw new errors.BadRequest('Can not write user informations to rocketChat.', err);
                });
            });
        }).catch(err => {
            logger.warn(err);
            throw new errors.BadRequest('Can not create RocketChat Account');
        });
    }

    //todo secret for rocketChat
    create(data, params) {
        return this.createRocketChatAccount(data, params);
    }

    getOrCreateRocketChatAccount(userId, params) {
        return rocketChatModels.userModel.findOne({ userId })
        .then(login => {
            if (!login) {
                return this.createRocketChatAccount({userId}, params)
                .then(res => {
                    return rocketChatModels.userModel.findOne({ userId })
                })
            } else return Promise.resolve(login);
        })
        .then(login => {
            return Promise.resolve({ username: login.username, password: login.pass });
        }).catch(err => {
            logger.warn(err);
            reject(new errors.BadRequest('could not initialize rocketchat user', err));
        });
    }

    //todo: username nicht onfly generiert 
    get(userId, params) {
        return this.getOrCreateRocketChatAccount(userId, params)
        .then(login => {
            return request(this.getOptions('/api/v1/login', login)).then(res => {
                const authToken = (res.data || {}).authToken;
                if (res.status === "success" && authToken !== undefined)
                    return Promise.resolve({ authToken });
                else
                    return Promise.reject(new errors.BadRequest('False response data from rocketChat'));
            }).catch(err => {
                return Promise.reject(new errors.Forbidden('Can not take token from rocketChat.', err));
            });
        }).catch(err => {
            logger.warn(err);
            throw new errors.Forbidden('Can not create token.');
        });
    }

    /*
    requires secret (admin account)
    patch(userId, data, params) {
        return new Promise((resolve, reject) => {
            if (data.username === undefined)
                throw new errors.BadRequest('You can only patch username.');

            const update = { $set: { username: data.username, pass: randomPass() } };
            RocketChat.findOneAndUpdate({ userId }, update, (err, data) => {
                if (err !== null)
                    reject(err);
                if (data === null)
                    reject({ message: 'user not found' });

                //todo: update rocketChat!
                resolve(data);
            });
        }).catch(err => {
            logger.warn(err);
            throw new errors.BadRequest('Can not patch this user');
        });
    }
    */

    setup(app, path) {
        this.app = app;
    }
}

class RocketChatChannel {
    constructor(options) {
        this.options = options || {};
        this.docs = docs;
    }

    getOptions(shortUri, body, method) {
        return {
            uri: ROCKET_CHAT_URI + shortUri,
            method: method || 'POST',
            //  headers: {
            //     'Authorization': process.env.ROCKET_CHAT_SECRET
            // },
            body,
            json: true,
            timeout: REQUEST_TIMEOUT
        };
    }

    //todo secret for rocketChat
    create(data, params) {
        return true
    }

    //todo: username nicht onfly generiert 
    get(Id, params) {
        return true
    }

    setup(app, path) {
        this.app = app;
    }
}

module.exports = function () {
    const app = this;
	const channelOptions = {
		Model: rocketChatModels.channelModel,
		paginate: {
			default: 1,
			max: 1
		},
		lean: true
    };

    app.use('/rocketChat', new RocketChat());
    app.use('/rocketChat/channel', new RocketChatChannel(channelOptions));

    const rocketChatService = app.service('/rocketChat');
    const rocketChatChannelService = app.service('/rocketChat/channel')

    rocketChatService.before(hooks.before);
    rocketChatService.after(hooks.after);

    rocketChatChannelService.before(hooks.before);
    rocketChatChannelService.after(hooks.after);
};
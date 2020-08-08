#!/usr/bin/nodejs

//global variables


// INITIALIZATION STUFF

const express = require('express');
const app = express();

app.use(express.static('public'));
app.use(express.static('files'));

const simpleoauth2 = require('simple-oauth2');
const fs = require('fs');
const path = require('path');
const hbs = require('hbs');
const request = require('request');

var userToCookies = {};

var cookiesToUser = {};

var questions = [];

fs.readFile('files/questions.txt', 'utf8', (err, contents) => {
	parseMe = contents.split('\n');
	parseMe.forEach((item) => {
		items = item.split(':');
		parseAnswers = items[1].split(',');
		answers = [];
		parseAnswers.forEach((answer) => {
			answers.push(answer.trim());
		});
		questions.push([items[0], answers]);
	});
});

let getCookie = (name, cookies) => {
	if (!cookies) {
		return null;
	}

	var cookieArr = cookies.split(";");
	for (var i = 0; i < cookieArr.length; i++) {
		var cookiePair = cookieArr[i].split("=");
		if (name == cookiePair[0].trim()) {
			return decodeURIComponent(cookiePair[1]);
		}
	}
	return null;
};

let verifyNoIncrement = (req, res, next) => {
	res.locals.guest = false;

	if (!getCookie('ctf-auth', req.headers.cookie) || !(getCookie('ctf-auth', req.headers.cookie) in cookiesToUser)) {
		res.redirect('https://europemapgamectf.sites.tjhsst.edu/');
		return;
	} else if (cookiesToUser[getCookie('ctf-auth', req.headers.cookie)].guest) {
		if (cookiesToUser[getCookie('ctf-auth', req.headers.cookie)].guestPageCount > 5) {
			res.render('forcelogin');
			return;
		} else {
			res.locals.guest = true;
		}
	}

	next();
};

let verify = (req, res, next) => {
	res.locals.guest = false;

	if (!getCookie('ctf-auth', req.headers.cookie) || !(getCookie('ctf-auth', req.headers.cookie) in cookiesToUser)) {
		res.redirect('https://europemapgamectf.sites.tjhsst.edu/');
		return;
	} else if (cookiesToUser[getCookie('ctf-auth', req.headers.cookie)].guest) {
		if (cookiesToUser[getCookie('ctf-auth', req.headers.cookie)].guestPageCount > 5) {
			res.render('forcelogin');
			return;
		} else {
			cookiesToUser[getCookie('ctf-auth', req.headers.cookie)].guestPageCount++;
			res.locals.guest = true;
		}
	}

	next();
};

const ion_client_id = 'cIIA3uAkH4fRZYBcw8pqRsXIpb7H233buwQ9NFMP';
const ion_client_secret = 'Akzbchwie0jywDlM3kHBqIqZTW6lt3kXo6hHEOBvDKeZmjspOfI3o9VhBGridKgectAmssKkSw9WrH5vBwLOQKOxfhQE2xC2hbotyLO1wvspckvfG2I7Yi3q0SZzt0Cx';
const ion_redirect_uri = 'https://europemapgamectf.sites.tjhsst.edu/';

const oauth = simpleoauth2.create({
	client: {
		id: ion_client_id,
		secret: ion_client_secret
	},
	auth: {
		tokenHost: 'https://ion.tjhsst.edu/oauth/',
		authorizePath: 'https://ion.tjhsst.edu/oauth/authorize',
		tokenPath: 'https://ion.tjhsst.edu/oauth/token/'
	}
});

const login_url = oauth.authorizationCode.authorizeURL({
	scope: "read", // remove scope: read if you also want write access
	redirect_uri: ion_redirect_uri
});

app.get('/', (req, res) => {
	if (getCookie('ctf-auth', req.headers.cookie) && (getCookie('ctf-auth', req.headers.cookie) in cookiesToUser) && !cookiesToUser[getCookie('ctf-auth', req.headers.cookie)].guest) {
		res.render('europe');
	} else if (req.query.code) {

		var code = req.query.code; // GET parameter
		console.log(code)
		oauth.authorizationCode.getToken({
			code: code,
			redirect_uri: ion_redirect_uri
		}).then((result) => {
			var token = oauth.accessToken.create(result);
            console.log(token)
			var refresh_token = token.token.refresh_token;
			var access_token = token.token.access_token;
			var expires_in = token.token.expires_in;

			request.get({
				url: 'https://ion.tjhsst.edu/api/profile?format=json',
				method: 'GET',
				headers: {
					'Authorization': 'Bearer ' + access_token
				}
			}, (error, response, body) => {
				info = JSON.parse(body);
				console.log(info)
				if (info.ion_username in userToCookies) {
					res.cookie('ctf-auth', userToCookies[info.ion_username]);
				} else {
					user = {
						id: info.id,
						username: info.ion_username,
						name: info.display_name,
						currentQuestionId: Math.floor(Math.random() * questions.length),
						score: 0,
						timeOf100: null
					};

					request.get({
						url: info.picture,
						method: 'GET',
						encoding: null,
						headers: {
							'Authorization': 'Bearer ' + access_token
						}
					}, (error, response, body) => {
						console.log(body);
						fs.writeFile('files/profile_pictures/' + info.ion_username + '.jpg', body, (err) => {
							if (err) throw err;
						});
					});

					cookiesToUser[access_token] = user;
					userToCookies[user.username.toString()] = access_token;
					res.cookie('ctf-auth', access_token);
				}

				res.redirect('https://europemapgamectf.sites.tjhsst.edu/');
			});
		});
	} else {
		res.redirect(login_url);
	}
});

function getQuestion(id) {
	return questions[id][0];
}

function checkAnswer(id, answer) {
	return questions[id][1].includes(answer);
}

function getTopPlayers() {
	topPlayers = [];
	for (var cookie in cookiesToUser) {
		if (!cookiesToUser[cookie].guest) {
			topPlayers.push([cookiesToUser[cookie].score, cookiesToUser[cookie].name + ' (' + cookiesToUser[cookie].score + ' points)']);
		}
	}

	topPlayers.sort((first, second) => {
		return second[0] - first[0];
	});

	topNames = []
	for (n = 0; n < Math.min(5, topPlayers.length); n++) {
		topNames.push(topPlayers[n][1])
	}

	return topNames;
}

app.get('/map_worker', (req, res) => {
	const cookie = getCookie('ctf-auth', req.headers.cookie);

	if (!cookie || !(cookie in cookiesToUser)) {
		res.send(['You are not authenticated. Please visit the main page to log in.', 0]);
	}

	if (req.query.choice) {
		if (checkAnswer(cookiesToUser[cookie].currentQuestionId, req.query.choice)) {
			cookiesToUser[cookie].currentQuestionId = Math.floor(Math.random() * questions.length);
			cookiesToUser[cookie].score++;
		} else {
			cookiesToUser[cookie].score--;
		}
	}
    
    if(cookiesToUser[cookie].score == 100) {
        cookiesToUser[cookie].timeOf100 = Date.now();
    }
    
    console.log(cookiesToUser[cookie]);
    
    if (cookiesToUser[cookie].score == 975 && (Date.now() - cookiesToUser[cookie].timeOf100) > 600000) {
        cookiesToUser[cookie].score = 0;
        res.send([getQuestion(cookiesToUser[cookie].currentQuestionId), 'TOO SLOW LOL', getTopPlayers(), questions[cookiesToUser[cookie].currentQuestionId][1]]);
    } else if(cookiesToUser[cookie].score > 999) {
        res.send([getQuestion(cookiesToUser[cookie].currentQuestionId), 'flag{3ur0p3_630_60d?_v77h' + cookiesToUser[cookie].id.toString(16) + '}', getTopPlayers(), questions[cookiesToUser[cookie].currentQuestionId][1]]);
        console.log(cookiesToUser[cookie].username + ' solved challenge! Flag is ' + 'flag{3ur0p3_630_60d?_v77h' + cookiesToUser[cookie].id.toString(16) + '}');
    } else {
	    res.send([getQuestion(cookiesToUser[cookie].currentQuestionId), cookiesToUser[cookie].score, getTopPlayers(), questions[cookiesToUser[cookie].currentQuestionId][1]]);
	}
});

// -------------- express initialization -------------- //
// PORT SETUP - NUMBER SPECIFIC TO THIS SYSTEM
app.set('port', process.env.PORT || 8080);

//tell express that the view engine is hbs
app.set('view engine', 'hbs');

app.get('*', function (req, res) {
	res.status(404).send('Page not found.');
});

// -------------- listener -------------- //
// // The listener is what keeps node 'alive.' 

let listener = app.listen(app.get('port'), () => {
	console.log('Express server started on port: ' + listener.address().port);
});

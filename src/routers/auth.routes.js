const express = require('express');
const { AuthService } = require('../services/auth.service');
const { LogService } = require('../services/log.service');
const { checkSession } = require('../middleware');
const { makeRedirectURL } = require('../utils/server');
const {
    SessionInvalidError,
    UsernameTakenError,
} = require('../utils/errors');
const SpotifyWebApi = require('spotify-web-api-node');
const authRouter = express.Router();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

authRouter.post("/login", (req, res, next) => {
    //TODO: Add account lockout
    let returnedData = {};
    AuthService.login(req.body.username, req.body.password)
        .then((data) => {
            req.session.uid = data.user_id;
            req.session.timezone = data.time_zone;
            req.session.connected = !!(data.access_token || data.refresh_token);
            let redirectUrl = makeRedirectURL("/player");
            returnedData = {
                user_id: data.user_id,
                connected: req.session.connected,
                redirectUrl
            }
            LogService.logLogin(req.body.username);
            res.json(returnedData);
            res.end();
        })
        .catch((err) => {
            LogService.logFailedLogin(req.body.username);
            next(err);
        });
});

authRouter.post("/registration", (req, res, next) => {
    AuthService.createUser(req.body)
        .then((uuid) => {
            req.session.uid = uuid;
            req.session.connected = false;
            LogService.logRegistration(req.body.username, uuid);
            res.status(201).json({ status: "success", user_id: uuid });
        }).catch((err) => {
            if (err.name === "SqliteError") {
                next(UsernameTakenError);
            }
            else {
                next(err);
            }
        });
    return;
});

authRouter.get("/integrations/spotify", checkSession, (req, res, next) => {
    if (req.loggedIn) {
        const state = AuthService.makeUserOAuthState(req.session.uid);
        const scopes = ['user-read-private', 'user-read-email', 'playlist-read-private', 'user-modify-playback-state'];
        const spotifyApi = new SpotifyWebApi({
            clientId,
            redirectUri
        });
        res.json(spotifyApi.createAuthorizeURL(scopes, state));
    }
    else {
        next(SessionInvalidError);
    }
});

authRouter.get("/integrations/spotify/callback", checkSession, (req, res, next) => {
    if (req.loggedIn) {
        const code = req.query.code || null;
        const state = req.query.state || null;
        const user_id = req.session.uid;
        const spotifyApi = new SpotifyWebApi({
            clientId,
            clientSecret,
            redirectUri
        });
        if (AuthService.checkUserOAuthState(state, user_id)) {
            spotifyApi.authorizationCodeGrant(code)
                .then((data) => {
                    spotifyApi.setAccessToken(data.body.access_token);
                    spotifyApi.setRefreshToken(data.body.refresh_token);
                    let expiryDate = new Date();
                    expiryDate.setSeconds(expiryDate.getSeconds() + data.body.expires_in);
                    return AuthService.updateSpotifyTokens(
                        user_id,
                        data.body.access_token,
                        data.body.refresh_token,
                        expiryDate.getTime()
                    );
                })
                .then((access_token) => {
                    return spotifyApi.getMe();
                })
                .then((data) => {
                    return AuthService.updateSpotifyID(user_id, data.body.id);
                })
                .then(() => {
                    let redirectUrl = makeRedirectURL("/player");
                    res.redirect(redirectUrl);
                })
                .catch((err) => {
                    console.log(typeof err.message);
                    next(err);
                });
        }
        else {
            res.statusCode(401).json({ message: "Invalid State parameter" });
        }
    }
    else {
        next(SessionInvalidError);
    }
});

authRouter.get("/logout", checkSession, (req, res, next) => {
    if (req.loggedIn) {
        req.session.destroy(err => {
            if (err) {
                res.status(400).send('Unable to log out')
            } else {
                res.json({ redirectUrl: makeRedirectURL("/login") });
            }
        });
    }
    else{
        res.json({ redirectUrl: makeRedirectURL("/login") });
    }
});

authRouter.get("/login_check", checkSession, (req, res, next) => {
    let redirectUrl = "";
    if (req.loggedIn) {
        redirectUrl = makeRedirectURL("/player");
    }
    else {
        redirectUrl = makeRedirectURL("/login");
    }
    res.json({ loggedIn: req.loggedIn, redirectUrl });
});

module.exports = authRouter;
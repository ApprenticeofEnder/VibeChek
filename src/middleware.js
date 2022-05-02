const SpotifyWebApi = require('spotify-web-api-node');

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

function checkSession(req, res, next) {
    req.loggedIn = !!req.session.uid;
    next();
}

function spotifyApi(req, res, next) {
    req.spotifyApi = new SpotifyWebApi({
        clientId,
        clientSecret,
        redirectUri
    });
    next();
}

module.exports = {
    checkSession,
    spotifyApi
}
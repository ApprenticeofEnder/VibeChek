const express = require('express');
const {
    VibechekService
} = require('../services/vibechek.service');
const {
    checkSession,
    spotifyApi
} = require('../middleware');
const {
    DuplicateSaveError,
    NoScheduleSelectedError,
    SessionInvalidError,
    UnauthorizedError
} = require('../utils/errors');

const vibechekRouter = express.Router();

vibechekRouter.get("/player", checkSession, spotifyApi, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (!req.session.schedule) {
        next(NoScheduleSelectedError)
    }
    else {
        VibechekService.getSpotifyUserData(req.session.uid)
            .then(userData => {
                return new Promise((resolve, reject) => {
                    VibechekService.getCurrentBlockData(req.session.uid, req.session.schedule, req.session.timezone)
                        .then(blockData => {
                            if (!blockData.block_name) {
                                resolve(blockData);
                            }
                            else {
                                return VibechekService.playBlock(userData, req, blockData);
                            }
                        })
                        .then(blockData => {
                            resolve(blockData);
                        })
                        .catch(err => {
                            reject(err);
                        })
                })
            })
            .then(data => {
                res.json(data);
            })
            .catch(err => {
                console.log(err);
                next(err);
            })
    }
});

vibechekRouter.post("/player", checkSession, spotifyApi, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else {
        VibechekService.getSpotifyUserData(req.session.uid)
            .then(userData => {
                return new Promise((resolve, reject) => {
                    VibechekService.getCurrentBlockData(req.session.uid, req.body.schedule, req.session.timezone)
                        .then(blockData => {
                            if (!blockData.block_name) {
                                resolve(blockData);
                            }
                            else {
                                return VibechekService.playBlock(userData, req, blockData);
                            }
                        })
                        .then(blockData => {
                            resolve(blockData);
                        })
                        .catch(err => {
                            reject(err);
                        })
                })
            })
            .then(data => {
                req.session.schedule = req.body.schedule;
                res.json(data);
            })
            .catch(err => {
                next(err);
            })
    }
});

vibechekRouter.get("/users", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else {
        VibechekService.searchUsers(req.query.user)
            .then(users => {
                res.json({ users });
            })
            .catch(err => {
                next(err);
            })
    }
});

vibechekRouter.get("/users/:uid", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else {
        let returnedData = {};
        VibechekService.getUserData(req.params.uid, req.params.uid !== req.session.uid)
            .then((data) => {
                if (!data) {
                    throw UnauthorizedError;
                }
                returnedData = { ...data };
                return VibechekService.getUserSchedulesFull(req.params.uid, req.params.uid !== req.session.uid);
            })
            .then(scheduleData => {
                returnedData.scheduleData = scheduleData;
                res.json(returnedData);
            })
            .catch((err) => {
                next(err)
            })
    }

});

vibechekRouter.put("/users/:uid", (req, res, next) => {

});

vibechekRouter.delete("/users/:uid", (req, res, next) => {

});

vibechekRouter.get("/users/:uid/schedules", checkSession, (req, res, next) => {
    VibechekService.getUserSchedules(req.params.uid)
        .then((data) => {
            if (!data) {
                data = []
            }
            res.json({ schedules: data });
        })
        .catch((err) => {
            next(err)
        })
});

vibechekRouter.post("/users/:uid/schedules", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        VibechekService.createSchedule(req.session.uid, req.body.scheduleData, req.body.days)
            .then(() => {
                res.status(201).json({
                    message: "Schedule created successfully!"
                });
            })
            .catch(err => {
                next(err);
            });
    }
});

vibechekRouter.post("/users/:uid/schedules/saved", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        VibechekService.saveSchedule(req.params.uid, req.body.schedule)
            .then(() => {
                res.json({message: "Schedule saved successfully!"});
            })
            .catch(err => {
                if(err.name === "SqliteError"){
                    next(DuplicateSaveError);
                }
                else {
                    console.log(err);
                    next(err);
                }
            });
    }
});

vibechekRouter.get("/users/:uid/schedules/:sid", (req, res, next) => {

});

vibechekRouter.put("/users/:uid/schedules/:sid", (req, res, next) => {

});

vibechekRouter.delete("/users/:uid/schedules/:sid", (req, res, next) => {

});

vibechekRouter.get("/users/:uid/vibe_days", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        VibechekService.getUserDays(req.session.uid)
            .then(data => {
                res.json({ days: data });
            })
            .catch(err => {
                next(err);
            })
    }
});

vibechekRouter.post("/users/:uid/vibe_days", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        VibechekService.createVibeDay(req.session.uid, req.session.timezone, req.body.dayData, req.body.blocks)
            .then(blocksAdded => {
                if (blocksAdded < req.body.blocks.length) {
                    res.status(201).json({
                        message: "Some blocks could not be added due to conflicts in the schedule."
                    });
                }
                else {
                    res.status(201).json({
                        message: "Vibe day created successfully!"
                    });
                }
            })
            .catch(err => {
                next(err);
            });
    }
});

vibechekRouter.get("/users/:uid/vibe_days/:vdid", (req, res, next) => {

});

vibechekRouter.put("/users/:uid/vibe_days/:vdid", (req, res, next) => {

});

vibechekRouter.delete("/users/:uid/vibe_days/:vdid", (req, res, next) => {

});

vibechekRouter.get("/users/:uid/vibe_blocks", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        VibechekService.getUserBlocks(req.session.uid)
            .then(data => {
                if (!data) {
                    data = []
                }
                res.json({ blocks: data });
            })
            .catch(err => {
                next(err);
            });
    }
});

vibechekRouter.post("/users/:uid/vibe_blocks", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        VibechekService.createVibeBlock(req.session.uid, req.body)
            .then(() => {
                res.json({ message: "Block created successfully" });
            })
            .catch(err => {
                next(err);
            });
    }
});

vibechekRouter.get("/users/:uid/vibe_blocks/:vbid", (req, res, next) => {

});

vibechekRouter.put("/users/:uid/vibe_blocks/:vbid", (req, res, next) => {

});

vibechekRouter.delete("/users/:uid/vibe_blocks/:vbid", (req, res, next) => {

});

vibechekRouter.get("/users/:uid/playlists", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        VibechekService.getUserPlaylists(req.session.uid)
            .then(playlists => {
                res.json({
                    playlists
                });
            })
            .catch(err => {
                next(err);
            });
    }
});

vibechekRouter.get("/users/:uid/playlists/spotify", checkSession, spotifyApi, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        let user_data = null;
        VibechekService.getSpotifyUserData(req.params.uid)
            .then(data => {
                user_data = data;
                return VibechekService.playlistSearch(user_data, req);
            })
            .then(playlists => {
                playlists = playlists.map(playlist => {
                    return {
                        name: playlist.name,
                        uri: playlist.uri,
                        creator_name: user_data.username
                    };
                });
                res.json({
                    playlists
                });
            })
            .catch(err => {
                next(err);
            })
    }

});

vibechekRouter.post("/users/:uid/playlists", checkSession, (req, res, next) => {
    if (!req.loggedIn) {
        next(SessionInvalidError);
    }
    else if (req.session.uid != req.params.uid) {
        next(UnauthorizedError);
    }
    else {
        VibechekService.savePlaylist(req.session.uid, req.body)
            .then(() => {
                res.json({ message: "Playlist saved successfully" });
            })
            .catch(err => {
                next(err);
            });
    }
});

vibechekRouter.get("/users/:uid/playlists/:uri", (req, res, next) => {

});

vibechekRouter.put("/users/:uid/playlists/:uri", (req, res, next) => {

});

vibechekRouter.delete("/users/:uid/playlists/:uri", (req, res, next) => {

});

module.exports = vibechekRouter;
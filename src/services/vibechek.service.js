const db = require('../database');
const { AuthService } = require('./auth.service');
const {
    getTimeInSeconds,
    convertTimezone,
    getMidnight
} = require('../utils/server');
const {
    DataNotAddedError
} = require('../utils/errors');
const { v4: uuidv4 } = require('uuid');
const { LogService } = require('./log.service');

class VibechekService {
    static createVibeBlock(userId, blockData) {
        const uuid = uuidv4();
        const duration = getTimeInSeconds(blockData);
        return new Promise((resolve, reject) => {
            try {
                let createStatement = db.prepare("INSERT INTO vibe_blocks (vibe_block_id, name, duration, playlist_uri, playlist_owner) VALUES (?, ?, ?, ?, ?)");
                let result = createStatement.run(uuid, blockData.name, duration, blockData.playlist, userId);
                if (result.changes == 1) {
                    resolve();
                }
                else {
                    reject(result);
                }
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static createVibeDay(userId, timeZone, dayData, blocks) {
        const dayId = uuidv4();
        let createResult;
        let blocksAdded = 0;
        return new Promise((resolve, reject) => {
            try {
                let createStatement = db.prepare("INSERT INTO vibe_days (vibe_day_id, name, created_by) VALUES (?, ?, ?)");
                let blockMapStatement = db.prepare(`
                    INSERT INTO blocks_in_day (vibe_day, vibe_block, start_time) 
                    SELECT $day, $block, $start 
                    WHERE NOT EXISTS (
                        SELECT * FROM blocks_in_day bid 
                        INNER JOIN vibe_blocks vb 
                        ON bid.vibe_block = vb.vibe_block_id 
                        WHERE bid.start_time + vb.duration > $start 
                        AND bid.vibe_day = $day
                    )
                `);
                const createDay = db.transaction(blockList => {
                    createResult = createStatement.run(dayId, dayData.name, userId);
                    for (const blockSlot of blockList) {
                        let startSeconds = getTimeInSeconds(blockSlot);
                        const result = blockMapStatement.run({
                            day: dayId,
                            block: blockSlot.block.vibe_block_id,
                            start: startSeconds
                        });
                        blocksAdded += result.changes;
                    }
                });
                createDay(blocks);
                if (createResult.changes == 1) {
                    resolve(blocksAdded);
                }
                else {
                    reject(result);
                }
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static createSchedule(userId, scheduleData, days) {
        const scheduleId = uuidv4();
        let createResult;
        return new Promise((resolve, reject) => {
            try {
                let createStatement = db.prepare("INSERT INTO schedules (schedule_id, name, is_public, created_by) VALUES (?, ?, ?, ?)");
                let dayMapStatement = db.prepare(`
                    INSERT INTO days_in_schedules (schedule, vibe_day, day_of_week)
                    VALUES (?, ?, ?)
                `);
                const createSchedule = db.transaction(dayList => {
                    createResult = createStatement.run(scheduleId, scheduleData.name, scheduleData.is_public, userId);
                    for (let i = 0; i < dayList.length; ++i) {
                        if (dayList[i] === "") {
                            continue;
                        }
                        const result = dayMapStatement.run(scheduleId, dayList[i], i);
                        if (result.changes != 1) {
                            throw DataNotAddedError;
                        }
                    }
                });
                createSchedule(days);
                if (createResult.changes == 1) {
                    resolve();
                }
                else {
                    reject(result);
                }
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static getAllUsers() {
        let statement = "SELECT user_id, username, email, time_zone FROM users WHERE is_public = 1"; // Can't have passwords leaking
        return this.#getAll(statement);
    }

    static getCurrentBlockData(user, schedule, timeZone) {
        let currentDate = convertTimezone(new Date(), timeZone);
        let currentTimeData = {
            hours: currentDate.getHours(),
            minutes: currentDate.getMinutes(),
            seconds: currentDate.getSeconds(),
            weekday: currentDate.getDay(),
        };
        let returnData = {
            time: null,
            block_name: null,
            playlist_uri: null
        };
        let currentSeconds = getTimeInSeconds(currentTimeData);
        return new Promise((resolve, reject) => {
            try {
                let getScheduleStatement = db.prepare(`
                    WITH user_schedules (schedule, name, user) AS (
                        SELECT schedule_id, name, created_by FROM schedules
                        WHERE created_by=$user AND schedule_id=$schedule
                        UNION
                        SELECT schedule, name, user FROM saved
                        INNER JOIN schedules on saved.schedule = schedules.schedule_id
                        WHERE user=$user AND schedule=$schedule
                    ) 
                    SELECT us.schedule, user, us.name as schedule_name, start_time, vb.name as block_name, duration, playlist_uri 
                        FROM user_schedules us
                        INNER JOIN days_in_schedules dis ON us.schedule = dis.schedule
                        INNER JOIN blocks_in_day bid ON dis.vibe_day = bid.vibe_day
                        INNER JOIN vibe_blocks vb ON bid.vibe_block = vb.vibe_block_id
                    WHERE dis.day_of_week = $weekday
                    AND bid.start_time + vb.duration >= $timeNow
                    ORDER BY start_time
                `);
                let data = getScheduleStatement.all({
                    user,
                    schedule,
                    timeNow: currentSeconds,
                    weekday: currentTimeData.weekday
                });
                let block = data.shift();
                let nextTimePoint = getMidnight(timeZone);
                let nextTimePointData = {};
                let nextTimePointSeconds = 0;
                if (block) {
                    //If first block hasn't started, set a timeout for next start
                    if (block.start_time > currentSeconds) {
                        nextTimePoint.setSeconds(block.start_time);
                    }
                    //Otherwise, set a timeout for block end.
                    else {
                        nextTimePoint.setSeconds(block.start_time + block.duration);
                        returnData.block_name = block.block_name;
                        returnData.playlist_uri = block.playlist_uri;
                    }
                    nextTimePointData.hours = nextTimePoint.getHours();
                    nextTimePointData.minutes = nextTimePoint.getMinutes();
                    nextTimePointSeconds = getTimeInSeconds(nextTimePointData);
                    returnData.time = nextTimePointSeconds - currentSeconds;
                }
                else {
                    // No blocks left in day
                    // Don't play anything
                }
                resolve(returnData);
            }
            catch (err) {
                reject(err);
            }
        })
    }

    static getUserBlocks(uid) {
        let statement = "SELECT * FROM vibe_blocks WHERE playlist_owner=?";
        return this.#getAllByUserId(uid, statement);
    }

    static getUserData(uid, publicSearch) {
        let statement = "SELECT user_id, username, email, time_zone FROM users WHERE user_id=?";
        if (publicSearch) {
            statement += "AND is_public = 1";
        }
        return this.#getOneByUserId(uid, statement);
    }

    static getSpotifyUserData(uid) {
        let statement = "SELECT user_id, username, time_zone, expiry_time, access_token, refresh_token, spotify_id FROM users WHERE user_id=?";
        return this.#getOneByUserId(uid, statement);
    }

    static getUserDays(uid) {
        let statement = "SELECT * FROM vibe_days WHERE created_by=?";
        return this.#getAllByUserId(uid, statement);
    }

    static getUserSchedules(uid) {
        let statement = `
            SELECT * FROM schedules WHERE created_by = $user 
            UNION SELECT 
                schedule, 
                schedules.name as name, 
                schedules.is_public as is_public,
                user
            FROM saved INNER JOIN schedules ON saved.schedule = schedules.schedule_id
            WHERE saved.user = $user
        `;
        return this.#getAllByUserIdParam(uid, statement);
    }

    static getUserSchedulesFull(uid, publicSearch) {
        let statement = `
            SELECT
                schedule_id, 
                schedules.name as schedule_name, 
                is_public, 
                day_of_week, 
                vd.name as vibe_day_name, 
                start_time, 
                vb.name as vibe_block_name,
                playlists.name as playlist_name
            FROM schedules 
                INNER JOIN days_in_schedules dis ON dis.schedule = schedules.schedule_id
                INNER JOIN vibe_days vd ON dis.vibe_day = vd.vibe_day_id
                INNER JOIN blocks_in_day bid ON vd.vibe_day_id = bid.vibe_day
                INNER JOIN vibe_blocks vb ON vb.vibe_block_id = bid.vibe_block
                INNER JOIN playlists ON playlists.uri = vb.playlist_uri AND playlists.user = vb.playlist_owner
            WHERE schedules.created_by = ? `
        if (publicSearch) {
            statement += "AND schedules.is_public = 1 ";
        }
        statement += "ORDER BY schedule_id, day_of_week, start_time";
        return this.#getAllByUserId(uid, statement);
    }

    static getUserPlaylists(uid) {
        let statement = "SELECT * FROM playlists WHERE user=?";
        return this.#getAllByUserId(uid, statement);
    }

    static playlistSearch(userData, req) {
        return new Promise((resolve, reject) => {
            let storedPlaylists = [];
            let storedUris = new Set();
            this.refreshIfExpired(userData, req)
                .then((access_token) => {
                    req.spotifyApi.setAccessToken(access_token);
                    return VibechekService.getUserPlaylists(userData.user_id);
                })
                .then(data => {
                    storedPlaylists = data;
                    if (!!storedPlaylists && storedPlaylists.length) {
                        storedPlaylists.forEach(playlist => {
                            storedUris.add(playlist.uri);
                        });
                    }
                    return req.spotifyApi.getUserPlaylists(userData.spotify_id, { limit: 50 });
                })
                .then(data => {
                    let returnedPlaylists = data.body.items.filter((playlist) => {
                        return !storedUris.has(playlist.uri);
                    });
                    resolve(returnedPlaylists);
                })
                .catch(err => {
                    reject(err);
                })
        });
    }

    static playBlock(userData, req, blockData) {
        return new Promise((resolve, reject) => {
            this.refreshIfExpired(userData, req)
                .then(access_token => {
                    req.spotifyApi.setAccessToken(access_token);
                    return req.spotifyApi.play({ context_uri: blockData.playlist_uri });
                })
                .then(() => {
                    resolve(blockData);
                })
                .catch(err => {
                    reject(err);
                });
        })
    }

    static savePlaylist(userId, playlistData) {
        return new Promise((resolve, reject) => {
            try {
                let createStatement = db.prepare("INSERT INTO playlists (uri, name, user) VALUES (?, ?, ?)");
                let result = createStatement.run(playlistData.uri, playlistData.name, userId);
                if (result.changes == 1) {
                    resolve();
                }
                else {
                    reject(result);
                }
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static saveSchedule(userId, scheduleId) {
        return new Promise((resolve, reject) => {
            try {
                let createStatement = db.prepare("INSERT INTO saved (user, schedule) VALUES (?, ?)");
                let result = createStatement.run(userId, scheduleId);
                if (result.changes == 1) {
                    resolve();
                }
                else {
                    reject(result);
                }
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static searchUsers(search) {
        let statement = "SELECT user_id, username, email, time_zone FROM users WHERE is_public = 1 AND username LIKE ?"; // Can't have passwords leaking
        return this.#search(statement, search);
    }

    static refreshIfExpired(userData, req) {
        return new Promise((resolve, reject) => {
            let currentDate = new Date();
            let bufferedExpiryDate = new Date(userData.expiry_time);
            bufferedExpiryDate.setSeconds(bufferedExpiryDate.getSeconds() - 5);
            if (currentDate.getTime() < bufferedExpiryDate.getTime()) {
                resolve(userData.access_token);
            }
            else {
                console.log("Refreshing Spotify Token");
                req.spotifyApi.setAccessToken(userData.access_token);
                req.spotifyApi.setRefreshToken(userData.refresh_token);
                req.spotifyApi.refreshAccessToken()
                    .then(data => {
                        req.spotifyApi.setAccessToken(data.body.access_token);
                        let expiryDate = new Date();
                        expiryDate.setSeconds(expiryDate.getSeconds() + data.body.expires_in);
                        return AuthService.updateSpotifyTokens(
                            userData.user_id,
                            data.body.access_token,
                            userData.refresh_token,
                            expiryDate.getTime()
                        )
                    })
                    .then((new_access_token) => {
                        resolve(new_access_token);
                    })
                    .catch(err => {
                        reject(err);
                    })
            }
        });
    }

    static #getOneByUserId(uid, statement) {
        return new Promise((resolve, reject) => {
            try {
                const getStatement = db.prepare(statement);
                const data = getStatement.get(uid);
                resolve(data);
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static #getAllByUserId(uid, statement) {
        return new Promise((resolve, reject) => {
            try {
                const getStatement = db.prepare(statement);
                const data = getStatement.all(uid);
                resolve(data);
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static #getAllByUserIdParam(uid, statement) {
        return new Promise((resolve, reject) => {
            try {
                const getStatement = db.prepare(statement);
                const data = getStatement.all({
                    user: uid
                });
                resolve(data);
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static #getAll(statement) {
        return new Promise((resolve, reject) => {
            try {
                const getStatement = db.prepare(statement);
                const data = getStatement.all();
                resolve(data);
            }
            catch (err) {
                reject(err);
            }
        });
    }

    static #search(statement, searchTerm) {
        return new Promise((resolve, reject) => {
            try {
                const getStatement = db.prepare(statement);
                const sqlSearch = `%${String(searchTerm)}%`;
                const data = getStatement.all(sqlSearch);
                resolve(data);
            }
            catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = {
    VibechekService
}
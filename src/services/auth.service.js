const db = require('../database');
const argon2 = require('argon2');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const {
    LoginFailureError,
    NullFieldError
} = require('../utils/errors');

const algorithm = "aes-256-cbc"; 
const AESIV = process.env.VIBECHEK_IV || crypto.randomBytes(16);
const AESKey = process.env.VIBECHEK_AES_KEY || crypto.randomBytes(32);

class AuthService {
    static login(username, password) {
        return new Promise((resolve, reject) => {
            try {
                let retrieveStatement = db.prepare(
                    "SELECT * FROM users where username=?;"
                )
                const row = retrieveStatement.get(username);
                if (row) {
                    argon2.verify(row.password, password)
                    .then((correct) => {
                        if(correct) {
                            resolve(row);
                        }
                        else {
                            reject(LoginFailureError);
                        }
                    })
                }
                else {
                    // This is to prevent timing attacks
                    argon2.hash(password)
                    .then((hashed)=>{
                        reject(LoginFailureError);
                    })
                    .catch(()=>{
                        reject(LoginFailureError);
                    })
                }
            }
            catch (err) {
                reject(err)
            }
        });
    }

    static createUser(userData){
        const uuid = uuidv4();
        return new Promise((resolve, reject) => {
            if (!userData.username || !userData.password || !userData.email || !userData.timezone || ![0,1].includes(userData.is_public)) {
                reject(NullFieldError);
                return;
            }
            argon2.hash(userData.password).then((hashedPw) => {
                try {
                    let insertStatement = db.prepare(
                        "INSERT INTO users (user_id, username, password, email, time_zone, is_public) values (?,?,?,?,?,?);"
                    );
                    const result = insertStatement.run(uuid, userData.username, hashedPw, userData.email, userData.timezone, userData.is_public);
                    if(result.changes == 1) {
                        resolve(uuid);
                    }
                    else {
                        reject(result);
                    }
                }
                catch (err) {
                    reject(err);
                }
                
            }).catch((err)=>{
                reject(err);
            });
        });
        
    }

    static makeUserOAuthState(user_id) {
        if (!user_id) {
            return null;
        }
        const cipher = crypto.createCipheriv(algorithm, AESKey, AESIV);
        let state = cipher.update(user_id, 'utf-8', 'hex');
        state += cipher.final("hex");
        return state;
    }

    static checkUserOAuthState(state, user_id) {
        if (!state || !user_id) {
            return false;
        }
        const decipher = crypto.createDecipheriv(algorithm, AESKey, AESIV);
        let decrypted = decipher.update(state, 'hex', 'utf-8');
        decrypted += decipher.final("utf-8");
        return decrypted == user_id;
    }

    static updateSpotifyTokens(user_id, access_token, refresh_token, expiry_time) {
        console.log("Updating Spotify Tokens");
        return new Promise((resolve, reject) => {
            try {
                let updateStatment = db.prepare(
                    "UPDATE users SET access_token=?, refresh_token=?, expiry_time=? WHERE user_id=?;"
                );
                const result = updateStatment.run(access_token, refresh_token, expiry_time, user_id);
                if(result.changes == 1) {
                    resolve(access_token);
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

    static updateSpotifyID(user_id, spotify_user_id) {
        return new Promise((resolve, reject) => {
            try {
                let updateStatment = db.prepare(
                    "UPDATE users SET spotify_id=? WHERE user_id=?;"
                );
                const result = updateStatment.run(spotify_user_id, user_id);
                if(result.changes == 1) {
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

}

module.exports = {
    AuthService
}
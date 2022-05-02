class LogService {
    static logRegistration(username, user_id) {
        this.info(`Registration successful: user ${username} created with ID ${user_id}`);
    }

    static logLogin(username) {
        this.info(`Login successful: user ${username} successfully authenticated.`);
    }

    static logFailedLogin(username) {
        this.warn(`Login failed: user ${username} unsuccessfully authenticated.`);
    }

    static info(message){
        console.info(this.#getLogPrefix() + message);
    }

    static error(message){
        console.error(this.#getLogPrefix() + message);
    }

    static warn(message){
        console.warn(this.#getLogPrefix() + message);
    }

    static #getLogPrefix() {
        const today = new Date();
        const time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
        const date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
        return `[${date} | ${time}] `;
    }

}

module.exports = {
    LogService
};
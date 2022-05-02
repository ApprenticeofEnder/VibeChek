function makeRedirectURL(endpoint) {
    let protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    let hostname = process.env.VIBECHEK_HOST_NAME || 'localhost';
    let port = process.env.PORT || 3000;
    return `${protocol}://${hostname}:${port}${endpoint}`;
}

function getTimeInSeconds(timeData) {
    const hours = timeData.hours === undefined ? timeData.hour : timeData.hours;
    const minutes = timeData.minutes === undefined ? timeData.minute : timeData.minutes;
    return ((hours * 60) + minutes) * 60 + (timeData.seconds || 0);
}

function convertTimezone(dateObj, timeZone) {
    return new Date(dateObj.toLocaleString("en-US", { timeZone }));
}

function getMidnight(timeZone) {
    const date = convertTimezone(new Date(), timeZone);
    date.setHours(0, 0, 0, 0);
    return date;
}

module.exports = {
    makeRedirectURL,
    getTimeInSeconds,
    convertTimezone,
    getMidnight
}
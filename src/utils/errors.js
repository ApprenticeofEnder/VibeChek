const SessionInvalidError = {
    name: "SessionFailure",
    message: "User not logged in.",
    statusCode: 401
};

const LoginFailureError = {
    name: "LoginFailure",
    message: "Invalid credentials.",
    statusCode: 401
};

const NullFieldError = {
    name: "EmptyField",
    message: "One or more required fields is empty.",
    statusCode: 401
};

const UsernameTakenError = {
    name: "UsernameTaken",
    message: "Username taken, please try another.",
    statusCode: 409
};

const UnauthorizedError = {
    name: "Unauthorized",
    message: "Current user cannot access that resource.",
    statusCode: 403
};

const DataNotAddedError = {
    name: "DataNotAdded",
    message: "Due to database issues, your request could not be processed. Please try again or contact support.",
    statusCode: 500
}

const NoScheduleSelectedError = {
    name: "NoScheduleSelected",
    message: "You have not selected a schedule!",
    statusCode: 400
}

const DuplicateSaveError = {
    name: "DuplicateSave",
    message: "You have already saved that schedule!",
    statusCode: 409
}

module.exports = {
    DataNotAddedError,
    DuplicateSaveError,
    SessionInvalidError,
    LoginFailureError,
    NullFieldError,
    UsernameTakenError,
    UnauthorizedError,
    NoScheduleSelectedError,
}
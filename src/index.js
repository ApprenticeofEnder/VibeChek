require('dotenv').config();
const express = require('express');
const session = require('express-session');
const sqlite3 = require('better-sqlite3');
const cors = require('cors');
const bodyParser = require('body-parser');
const router = require('./routers/routes');

const app = express();
const port = process.env.PORT || 3000;

const SqliteStore = require("better-sqlite3-session-store")(session) //This is just so session storage is easier, that I don't have to login every time
const sessiondb = new sqlite3(__dirname + '/../db/sessions.db');

var sess = {
  secret: process.env.VIBECHEK_SECRET || 'keyboard cat',
  cookie: {},
  store: new SqliteStore({
    client: sessiondb,
    expired: {
      clear: true,
      intervalMs: 2147483000 //ms = 24, almost 25 days
    }
  }),
  resave: false,
  saveUninitialized: true,
}

if (app.get('env') === 'production') {
  app.set('trust proxy', 1) // trust first proxy
  sess.cookie.secure = true // serve secure cookies
}

app.use(session(sess));

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(cors());
app.use(express.static(__dirname + '/public'));
app.use(router);

/* Error handler middleware */
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error(err.message, err.stack);
  let message = err.message;
  if (statusCode === 500 && err.name !== "DataNotAdded") {
    message = "Error Occurred. Please try again or contact support."
  }
  res.status(statusCode).json({
    status: 'error', 
    message
  });
  
  return;
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Vibechek listening at http://localhost:${port}`)
});
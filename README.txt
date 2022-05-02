VIBECHEK

Notable Files/Folders:
Vibechek.pdf
db/vibechek.db
src/services

Files to Ignore:
db/sessions.db
.env.template

Explanation:

Vibechek.pdf contains the written explanation of the database as well as the ER model. 

db/vibechek.db is the actual database of Vibechek, containing the user details and schedules of 
the 2 users shown in the demo, plus a third user with a private account. Additionally you can see 
the N:N tables as well as playlists saved by all the users.

src/services is where the bulk of the SQL queries will reside, particularly in auth.service.js
and vibechek.service.js. They should be within adequately named functions.

db/sessions.db is not actually directly accessed with SQL. In reality, it is used as session storage 
so that during development I didn't have to constantly log back in whenever I made a change. Which, 
with the workflow I had, was frequent.

.env.template is a template for the .env file necessary to run the app. The actual .env app I kept 
hidden because it contains API secrets for the app, which are not good to expose. Should you need 
the .env file for any reason, please contact me at robertbabaev@cmail.carleton.ca
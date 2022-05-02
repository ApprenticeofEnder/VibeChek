drop table if exists users;
drop table if exists schedules;
drop table if exists playlists;
drop table if exists vibe_blocks;
drop table if exists vibe_days;
drop table if exists days_in_schedules;
drop table if exists blocks_in_day;
drop table if exists saved;

create table users(
    user_id text primary key not null,
    username text unique not null,
    password text not null,
    refresh_token text,
    access_token text,
    spotify_id text,
    expiry_time integer,
    email text not null,
    time_zone text not null,
    is_public integer not null --between 0 and 1
);

create table schedules(
    schedule_id text primary key not null,
    name text not null,
    is_public integer not null, --between 0 and 1
    created_by text not null references users(user_id)
);

create table playlists(
    uri text not null,
    name text not null,
    user text not null references users(user_id),
    primary key (user, uri)
);

create table vibe_days(
    vibe_day_id text primary key not null,
    name text not null,
    created_by text not null references users(user_id)
);

create table vibe_blocks(
    vibe_block_id text primary key not null,
    name text not null,
    duration integer not null, --duration in seconds
    playlist_uri text,
    playlist_owner text,
    foreign key (playlist_owner, playlist_uri)
        references playlists(user, uri)
);

create table days_in_schedules(
    schedule text not null references schedules(schedule_id),
    vibe_day text not null references vibe_days(vibe_day_id),
    day_of_week integer not null, --0-6, Monday to Sunday
    primary key(schedule, vibe_day, day_of_week)
);

create table blocks_in_day(
    vibe_day text not null references vibe_days(vibe_day_id),
    vibe_block text not null references vibe_blocks(vibe_block_id),
    start_time integer not null, --seconds from midnight local time
    primary key(vibe_day, vibe_block, start_time)
);

create table saved(
    user text not null references users(user_id),
    schedule text not null references schedules(schedule_id),
    primary key(schedule, user)
);
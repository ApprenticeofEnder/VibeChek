<script>
    import UserListEntry from "./components/common/UserListEntry.svelte";
    import {secondsToHoursAndMinutes, timePad} from "../utils/client";
    import { userId } from "../stores";

    let searchTerm = "";
    let users = [];
    let shownUserSchedules = {};
    let shownUser = null;

    let daysOfTheWeek = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ];

    function search() {
        let search = {
            user: searchTerm,
        };
        let searchParams = new URLSearchParams(search);
        fetch(`/api/vibechek/users?${searchParams.toString()}`)
            .then((response) => response.json())
            .then((data) => {
                users = data.users;
            })
            .catch((err) => {});
    }

    function showUser(event) {
        let userData = event.detail;
        fetch(`/api/vibechek/users/${userData.user_id}`)
            .then((response) => {
                if (response.status === 403) {
                    throw "Unauthorized Access";
                }
                return response.json();
            })
            .then((data) => {
                shownUserSchedules = {};
                shownUser = data;
                data.scheduleData.forEach(scheduleElement => {
                    if(!shownUserSchedules.hasOwnProperty(scheduleElement.schedule_id)){
                        shownUserSchedules[scheduleElement.schedule_id] = {
                            name: scheduleElement.schedule_name,
                            id: scheduleElement.schedule_id
                        }
                        daysOfTheWeek.forEach(day => {
                            shownUserSchedules[scheduleElement.schedule_id][day] = {
                                name: null,
                                blocks: []
                            };
                        });
                    }
                    const weekDay = daysOfTheWeek[scheduleElement.day_of_week];
                    shownUserSchedules[scheduleElement.schedule_id][weekDay].name = scheduleElement.vibe_day_name;
                    shownUserSchedules[scheduleElement.schedule_id][weekDay].blocks.push({
                        start: scheduleElement.start_time,
                        name: scheduleElement.vibe_block_name,
                        playlist: scheduleElement.playlist_name,
                        start_hours: timePad(secondsToHoursAndMinutes(scheduleElement.start_time).hours),
                        start_minutes: timePad(secondsToHoursAndMinutes(scheduleElement.start_time).minutes)
                    });
                });
            })
            .catch((err) => {
                alert(err);
            });
    }

    function save(schedule) {
        fetch(`/api/vibechek/users/${$userId}/schedules/saved`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                schedule,
            }),
        })
            .then(response => {
                if(response.status !== 200){
                    throw response
                }
                response.json()
            })
            .then(data => {
                alert("Schedule Saved!");
            })
            .catch(response => {
                response.json()
                    .then(data => {
                        alert(data.message);
                    })
                    .catch(err => {
                        alert(err);
                    })
            })
    }
</script>

<div>
    <!-- Side navigation -->
    <div class="sidebar">
        <!-- Search Form -->
        <label for="searchbar">Search for Users: </label>
        <input type="text" bind:value={searchTerm} />
        <button on:click="{search}" class="btn btn-primary">Search</button>
        <!-- List of Users -->
        {#each users as user}
            <UserListEntry on:selected={showUser} data={user} />
        {/each}
    </div>
    <div class="main">
        <h1>Users of Vibechek</h1>
        {#if shownUser}
            <h2>{shownUser.username}</h2>
            {#each Object.entries(shownUserSchedules) as [scheduleId, schedule]}
                <h3>Schedule: {schedule.name}</h3>
                <button class="btn btn-success" on:click="{() => {save(scheduleId)}}">Save</button>
                {#each daysOfTheWeek as weekDay}
                    <h4>{weekDay}: {schedule[weekDay].name}</h4>
                    {#each schedule[weekDay].blocks as block}
                        <div>
                            {block.start_hours}:{block.start_minutes} - {block.name}
                        </div>
                    {/each}
                {/each}
            {/each}
        {:else}
            <h2>No user selected.</h2>
        {/if}
    </div>
</div>

<style>
    .sidebar {
        height: 100%; 
        width: 480px; 
        position: fixed; 
        z-index: 1; 
        top: 0; 
        left: 0;
        overflow-x: hidden; 
        padding-top: 98px;
    }

    /* Style page content */
    .main {
        margin-left: 480px; /* Same as the width of the sidebar */
        padding: 0px 10px;
    }

    /* On smaller screens, where height is less than 450px, change the style of the sidebar (less padding and a smaller font size) */
    @media screen and (max-height: 450px) {
        .sidebar {
            padding-top: 15px;
        }
    }
</style>

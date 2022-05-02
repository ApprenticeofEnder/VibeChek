<script>
    import { onMount } from 'svelte';
    import { userId } from '../stores.js';
    import SchedulePlayer from './components/common/SchedulePlayer.svelte';
    import ButtonLink from "./components/common/ButtonLink.svelte";

    let schedules = [];
    let finished = false;

    let update = false;
    let time = null;
    let block_name = null;

    $: if(update) {
        update = false;
        if(!finished) {
            playerUpdate(time, block_name);
        }
    }

    function init(){
        fetch(`/api/vibechek/users/${$userId}/schedules`)
        .then((response) => response.json())
        .then((data) => {
            schedules = data.schedules;
        })
        .catch((err) => {

        })
    }

    function playerStart(event){
        time = event.detail.time;
        block_name = event.detail.block_name;
        if(time === null) {
            finished = true;
            return;
        }
        finished = false;
        update = true;
    }

    function playerUpdate(time, block_name){
        setTimeout(() => {
            fetch("/api/vibechek/player")
            .then(response => {
                if(response.status === 403){
                    response.json()
                    .then(data => {
                        throw data;
                    })
                    .catch(err => {
                        throw err;
                    })
                }
                return response.json()
            })
            .then(data => {
                if(time) {
                    time = data.time;
                    block_name = data.block_name;
                    update = true;
                }
            })
            .catch(err => {
                alert(err.message);
            });
        }, time * 1000);
    }

    function playerStop(){
        fetch("/api/vibechek/player", {
            method: "DELETE",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        })
        .then(response => response.json())
        .then(data => {
            time = null;
            block_name = null;
            finished = true;
        })
        .catch(err => {

        });
    }

    onMount(init);

</script>

<h1>Vibechek Player</h1>
{#if block_name}
    <h2>Now Playing: {block_name}</h2>
    <button on:click="{playerStop}" class="btn btn-alert">Stop</button>
{:else if finished}
    <h2>Vibe Day Finished</h2>
{/if}

{#if schedules.length}
    {#each schedules as schedule}
        <SchedulePlayer on:playing="{playerStart}" data={schedule} />
    {/each}
{:else}
    <h1>No schedules detected. Make some!</h1>
{/if}

<ButtonLink text="Create New Schedule" link="/creator" />


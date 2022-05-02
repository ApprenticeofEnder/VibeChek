<script>
    import { createEventDispatcher, onMount } from 'svelte';
    export let data;
    let name, scheduleId, isPublic;

    const dispatch = createEventDispatcher();

    onMount(() => {
        name = data.name;
        scheduleId = data.schedule_id;
        isPublic = data.is_public;
    });

    function play(){
        fetch("/api/vibechek/player", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                schedule: scheduleId
            }),
        })
        .then(response => {
            if(response.status === 403) {
                alert("You don't have Spotify Premium, so unfortunately we can't do this. Seriously. It's their decision, not ours. Gah.");
                throw response;
            }
            else {
                return response.json()
            }
        })
        .then(data => {
            dispatch('playing', data);
        })
        .catch(err => {

        });
    }
</script>

<div>
    <h3>{name}</h3>
    <h6>{#if isPublic}Public{:else}Private{/if} schedule</h6>
    <button on:click="{play}" class="btn btn-success btn-circle btn-sm"><i class="fa-solid fa-play"></i></button>
</div>

<style>
    .btn-circle.btn-sm {
        width: 30px;
        height: 30px;
        padding: 6px 0px;
        border-radius: 15px;
        font-size: 8px;
        text-align: center;
    }
</style>
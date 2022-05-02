<script>
    import { onMount } from 'svelte';
    import { userId } from '../stores.js';

    export let params;

    let username;
    let schedules = [];
    let failure = false;

    function getData(){
        let uid;
        if(!params) {
            uid = $userId;
        }
        else {
            uid = params.uid;
        }
        if (!uid) {
            failure = true;
            return;
        }
        fetch(`/api/vibechek/users/${uid}`)
        .then((response) => response.json())
        .then((data) => {
            username = data.username;
            return fetch(`/api/vibechek/users/${uid}/schedules`)
        })
        .then((response) => response.json())
        .then((data) => {
            
        })
        .catch((err) => {

        })
    }

    onMount(getData);

</script>

{#if username}
    <h1>{username}</h1>
    {#if schedules.length}
        <h2>Schedules</h2>
    {/if}
{:else if failure}
    <h1>User Not Logged In</h1>
{:else }
    <h1>Loading...</h1>
{/if}


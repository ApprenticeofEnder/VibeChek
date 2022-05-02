<script>
    import { onMount } from 'svelte';
    export let data;
    export let clickFunction;
    let name, scheduleId, isPublic;

    onMount(() => {
        name = data.name;
        scheduleId = data.schedule_id;
        isPublic = data.is_public;
    })
</script>

<div on:click="{() => {
    clickFunction(name, scheduleId, isPublic);
}}">
    <h3>{name}</h3>
    <h6>{#if isPublic}Public{:else}Private{/if} schedule</h6>
</div>
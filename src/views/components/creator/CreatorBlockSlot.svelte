<script>
    import { createEventDispatcher, onMount } from 'svelte';
    import { secondsToHoursAndMinutes, timePad } from "../../../utils/client";
    export let data;
    export let availableBlocks;

    let placeholder = "---Select a Vibe Block---";

    let selectedBlock = -1;
    let mounted = false;
    let changed = false;
    let civilianTime = "";
    let militaryTimeString = "";

    const dispatch = createEventDispatcher();

    $: if( mounted && changed ) {
        dispatch('selected', {
            selectedBlock,
            index: data.index
        });
        changed = false;
    }
    onMount(() => {
        if (data.block) {
            selectedBlock = data.index;
        }
        militaryTimeString = `${timePad(data.hour)}:${timePad(data.minute)}:00`;
        civilianTime = new Date('1970-01-01T' + militaryTimeString + 'Z')
            .toLocaleTimeString('en-US',
                {timeZone:'UTC',hour12:true,hour:'numeric',minute:'numeric'}
            );
        mounted = true;
    });

    function clear(){
        dispatch('clear');
        selectedBlock = -1;
    }

    
</script>

{#if data.state !== "taken"}
<div>
    {#if data.block}
        <h3>{data.block.name}</h3>
    {:else if data.state !== "taken"}
        <h3>Available Slot</h3>
    {/if}
    <h6>{timePad(data.hour)}:{timePad(data.minute)} | {civilianTime}</h6>
    <select bind:value="{selectedBlock}" on:change="{() => {
        changed = true;
    }}">
        {#if placeholder}
            <option value="{-1}" disabled selected>{placeholder}</option>
        {/if}
        {#each availableBlocks.map((block, i) => {
            return {
                block, 
                i, 
                hours: secondsToHoursAndMinutes(block.duration).hours, 
                minutes: secondsToHoursAndMinutes(block.duration).minutes
            };
        }) as {block, i, hours, minutes}}
            <option value={i}>{block.name} ({timePad(hours)}:{timePad(minutes)})</option>
        {/each}
    </select>
    <button class="btn btn-danger" on:click="{clear}">Clear</button>
</div>
{/if}

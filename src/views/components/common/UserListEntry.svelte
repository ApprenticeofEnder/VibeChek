<script>
    import { createEventDispatcher } from 'svelte';
    export let data;

    const dispatch = createEventDispatcher();
    
    function selectUser(){
        dispatch('selected', data);
    }

</script>

<div>
    <h3>{data?.username || "No Username Provided"}</h3>
    <button on:click="{selectUser}" class="btn btn-primary">Show User</button>
</div>
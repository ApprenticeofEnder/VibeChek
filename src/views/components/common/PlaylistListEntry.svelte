<script>
    import { onMount } from 'svelte';
    export let data;
    export let clickFunction;
    let name, uri, creatorName;

    onMount(() => {
        name = data.name;
        uri = data.uri;
        creatorName = data.creator_name;
    })
</script>

<div on:click="{() => {
    clickFunction(name, uri, creatorName);
}}">
    <h3>{name}</h3>
    <h6>Owned by {creatorName}</h6>
</div>
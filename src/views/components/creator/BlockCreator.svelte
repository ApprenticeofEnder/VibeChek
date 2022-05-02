<script>
    import { onMount } from "svelte";
    import { userId } from "../../../stores";
    let placeholder = "---Select a Playlist---";
    let vibe_blocks = [];
    let vibe_block = null;
    let loaded = false;
    let formData = {
        name: "",
        playlist: "",
        hours: 0,
        minutes: 0,
    };
    let availablePlaylists = [];
    const possibleHourValues = [...Array(13).keys()];
    const possibleMinuteValues = [0, 30];

    onMount(() => {
        fetch(`/api/vibechek/users/${$userId}/playlists`)
            .then((response) => response.json())
            .then((data) => {
                if (data.playlists) {
                    availablePlaylists = data.playlists;
                }
                loaded = true;
            })
            .catch((err) => {});
    });

    function createBlock() {
        fetch(`/api/vibechek/users/${$userId}/vibe_blocks`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(formData),
        })
            .then((response) => response.json())
            .then((data) => {
                if(data.statusCode) {
                    throw data.message;
                }
                else {
                    alert("Block created successfully!");
                }
            })
            .catch((err) => {

            });
    }
</script>

<div>
    <div>
        <!-- Block List -->
    </div>
    <div>
        {#if !availablePlaylists.length && loaded}
            <div class="alert alert-danger" role="alert">
                You don't have any playlists to put in your block. Save some in
                Playlist Search mode first and come back!
            </div>
        {/if}
        <!-- Block Form -->
        <label for="name">Vibe Block Name</label>
        <input bind:value={formData.name} name="name" />
        <div>
            <label for="playlist">Select a playlist: </label>
            <select
                bind:value={formData.playlist}
                name="playlist"
            >
                {#if placeholder}
                    <option value="" disabled selected={formData.playlist ? true : null}>{placeholder}</option>
                {/if}
                {#each availablePlaylists as playlist}
                    <option
                        value={playlist.uri}
                        selected={playlist.uri === formData.playlist || null}
                    >
                        {playlist.name}
                    </option>
                {/each}
            </select>
        </div>
        <div>
            <label for="block_hours">Hours:</label>
            <select bind:value={formData.hours} name="block_hours">
                {#each possibleHourValues as hours}
                    <option
                        value={hours}
                        selected={hours === formData.hours || null}
                    >
                        {hours}
                    </option>
                {/each}
            </select>
            <label for="block_minutes">Minutes:</label>
            <select
                bind:value={formData.minutes}
                name="block_minutes"
            >
                {#each possibleMinuteValues as minutes}
                    <option
                        value={minutes}
                        selected={minutes === formData.minutes || null}
                    >
                        {minutes}
                    </option>
                {/each}
            </select>
        </div>
        {#if vibe_block}
            <button class="btn btn-primary">Update</button>
        {:else}
            <button on:click="{createBlock}" class="btn btn-primary">Create</button>
        {/if}
    </div>
</div>

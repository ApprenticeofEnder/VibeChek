<script>
    import { userId } from '../../../stores';
    let playlists = [];

    let statusMessage = "Loading...";
    let firstSearch = false;
    
    function searchPlaylists(){
        fetch(`/api/vibechek/users/${$userId}/playlists/spotify`)
        .then(response => response.json())
        .then(data => {
            if(data.playlists) {
                playlists = data.playlists;
            }
            else {
                statusMessage = "You don't have any more playlists to add.";
            }
        })
        .catch(err => {

        });
    }

    function savePlaylist(name, uri, index_to_remove) {
        fetch(`/api/vibechek/users/${$userId}/playlists`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                uri
            })
        })
        .then(response => response.json())
        .then(data => {
            playlists = playlists.filter((playlist, playlist_index) => {
                return playlist_index !== index_to_remove;
            });
        })
        .catch(err => {

        });
    }
</script>

<div>
    <button on:click="{searchPlaylists}" class="btn btn-primary">Refresh Playlists</button>
    {#if playlists.length}
        {#each playlists as playlist, i}
        <div>
            <h3>{playlist.name}</h3>
            <button on:click="{() => {
                savePlaylist(playlist.name, playlist.uri, i);
            }}" class="btn btn-primary">Save Playlist</button>
        </div>
        {/each}
    {:else if !firstSearch}
        <h2>Hit "Refresh Playlists" to get your playlists from Spotify!</h2>    
    {:else}
        <h2>{statusMessage}</h2>
    {/if}
</div>
<script>
    import { creatorMode } from '../../../stores';
    function switchToScheduleMode() {
        creatorMode.update(value => "schedule");
    }

    function switchToDayMode() {
        creatorMode.update(value => "vibe_day");
    }

    function switchToBlockMode() {
        creatorMode.update(value => "vibe_block");
    }

    function switchToPlaylistMode() {
        creatorMode.update(value => "playlist_search");
    }
</script>

<button class="btn" on:click="{switchToScheduleMode}">Schedule Mode</button>
<button class="btn" on:click="{switchToDayMode}">Vibe Day Mode</button>
<button class="btn" on:click="{switchToBlockMode}">Vibe Block Mode</button>
<button class="btn" on:click="{switchToPlaylistMode}">Playlist Search Mode</button>
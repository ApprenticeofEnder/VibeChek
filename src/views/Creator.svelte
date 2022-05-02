<script>
    import { onMount } from 'svelte';
    import { creatorMode } from '../stores';
    import CreatorSwitch from './components/creator/CreatorSwitch.svelte';
    import ScheduleCreator from './components/creator/ScheduleCreator.svelte';
    import BlockCreator from './components/creator/BlockCreator.svelte';
    import DayCreator from './components/creator/DayCreator.svelte';
    import PlaylistSearch from './components/creator/PlaylistSearch.svelte';
</script>

<CreatorSwitch />

{#if $creatorMode === "schedule"}
    <h1>Schedule Mode</h1>
    <ScheduleCreator />
{:else if $creatorMode === "vibe_day"}
    <h1>Vibe Day Mode</h1>
    <DayCreator />
{:else if $creatorMode === "vibe_block"}
    <h1>Vibe Block Mode</h1>
    <BlockCreator />
{:else if $creatorMode === "playlist_search"}
    <h1>Playlist Search</h1>
    <PlaylistSearch />
{/if}
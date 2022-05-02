<script>
    import router from "page";
    import Player from "./Player.svelte";
    import Login from "./Login.svelte";
    import Logout from "./Logout.svelte";
    import Profile from "./Profile.svelte";
    import SessionCheck from "./SessionCheck.svelte";
    import NotFound from "./NotFound.svelte";
    import Creator from "./Creator.svelte";
    import Users from "./Users.svelte";
    import ButtonLink from "./components/common/ButtonLink.svelte";

    import { userId } from '../stores.js';
    let page = Login;
    let params;

    router("/", ()=> (page = SessionCheck));
    router("/login", () => (page = Login));
    router("/player", () => (page = Player));
    router(
        "/profiles/me", () => (page = Profile)
    );
    router("/creator", () => (page = Creator));
    router("/logout", () => (page = Logout));
    router("/users", ()=> (page = Users));
    router("*", () => (page = NotFound));

    router.start();
</script>

<span>Vibechek</span>
<nav>
    {#if $userId !== "null"}
        <ButtonLink text="Player" link="/player" />
        <ButtonLink text="Profile" link="/profiles/me" />
        <ButtonLink text="Creator" link="/creator" />
        <ButtonLink text="Users" link="/users" />
        <ButtonLink text="Logout" link="/logout" />
    {:else}
        <ButtonLink text="Login" link="/login" />
    {/if}
</nav>

<svelte:component this={page} />

<style>
    nav {
        text-align: right;
        margin: 15px;
    }
</style>

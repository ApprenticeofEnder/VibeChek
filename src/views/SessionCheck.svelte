<script>
    import {onMount} from "svelte";
    import {redirectFetch} from "../utils/client";

    onMount(() => {
        redirectFetch("/api/auth/login_check", window);
    })
</script>
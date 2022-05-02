<script>
    import {onMount} from "svelte";
    import {redirectFetch} from "../utils/client";
    import { userId } from '../stores.js';

    onMount(() => {
        userId.update(user_id => null);
        redirectFetch("/api/auth/logout", window);
    })
</script>
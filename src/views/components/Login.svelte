<script>
    import { loginErrors, userId } from '../../stores';

    let username = "";
    let password = "";

    function login(){
        fetch("/api/auth/login", {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password
            })
        })
        .then((response) => response.json())
        .then((data) => {
            if (data.connected) {
                userId.update(user_id => data.user_id);
                window.location.href = data.redirectUrl;
            }
            else if (data.status === "error") {
                throw data.message;
            }
            else {
                return fetch("/api/auth/integrations/spotify");
            }
        })
        .then((response) => response.json())
        .then((connectUrl) => {
            window.location.href = connectUrl;
        })
        .catch((err)=>{
            loginErrors.update(() => [err]);
        });
    }
</script>

<div class="login-portion d-flex flex-row col-md-6 justify-content-center">
    <div class="d-flex flex-column col-md-8">
        <h1>Login</h1>

        {#if $loginErrors.length}
            {#each $loginErrors as error}
                <div class="alert alert-danger" role="alert">
                    {error}
                </div>
            {/each}
        {/if}
        <label for="username">Username</label>
        <input bind:value={username} name="username">
        <label for="password">Password</label>
        <input bind:value={password} type="password" name="password">

        <button on:click={login} class="btn btn-primary mt-auto">Login</button>
    </div>    
</div>

<style>
    button {
        margin-top: 15px;
        margin-bottom: 15px;
    }

    .login-portion {
        text-align: center;
    }
</style>
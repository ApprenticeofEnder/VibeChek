<script>

    import { registrationErrors, userId } from '../../stores';
    import { timeZones } from '../../utils/client';

    let placeholder = "---Select a Timezone---";

    let formData = {
        username: "",
        password: "",
        email: "",
        timezone: "",
        is_public: 1
    }

    function register(){
        fetch("/api/auth/registration", {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then((response) => response.json())
        .then((data) => {
            if(data.status !== "success") {
                throw data.message;
            }
            userId.update(user_id => data.user_id);
            return fetch("/api/auth/integrations/spotify");
        })
        .then((response) => response.json())
        .then((connectUrl) => {
            window.location.href = connectUrl;
        })
        .catch((err)=>{
            registrationErrors.update(() => [err]);
        });
    }
</script>

<div class="login-portion d-flex flex-row col-md-6 justify-content-center">
    <div class="d-flex flex-column justify-content-center col-md-8">
        <h1>Register</h1>

        {#if $registrationErrors.length}
            {#each $registrationErrors as error}
                <div class="alert alert-danger" role="alert">
                    {error}
                </div>
            {/each}
        {/if}
        <label for="username">Username</label>
        <input bind:value={formData.username} name="username">
        <label for="email">Email Address</label>
        <input bind:value={formData.email} name="email">
        <label for="password">Password</label>
        <input bind:value={formData.password} type="password" name="password">
        <label for="timezone">Timezone</label>
        <select bind:value="{formData.timezone}" name="timezone">
            {#if placeholder}
                <option value="" disabled selected>{placeholder}</option>
            {/if}
            {#each timeZones as timezone}
                <option value={timezone}>{timezone}</option>
            {/each}
        </select>
        <label>
            <input
                type="radio"
                bind:group={formData.is_public}
                name="is_public"
                value={0}
            />
            Private Account
        </label>
        <label>
            <input
                type="radio"
                bind:group={formData.is_public}
                name="is_public"
                value={1}
            />
            Public Account
        </label>
        <button on:click={register} class="btn btn-primary">Register</button>
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
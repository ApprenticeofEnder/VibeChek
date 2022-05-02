<script>
    import Registration from './components/Registration.svelte';
    import Login from './components/Login.svelte';
</script>

<svelte:head>
    <title>Login</title>
</svelte:head>

<div class="d-flex flex-row justify-content-center">
    <div class="d-flex flex-row col-md-8">
        <Login />
        <Registration />
    </div>
</div>


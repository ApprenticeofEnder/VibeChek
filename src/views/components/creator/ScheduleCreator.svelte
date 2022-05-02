<script>
    import { onMount } from "svelte";
    import { userId } from "../../../stores";

    let schedules = [];
    let schedule = null;
    let formData = {
        name: "",
        id: "",
        is_public: 1,
    };

    let placeholder = "---Select a Vibe Day---";

    let availableVibeDays = [];
    let selectedVibeDays = ["", "", "", "", "", "", ""];
    let daysOfTheWeek = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ];

    let loaded = false;

    function selectVibeDay(index, day) {
        selectedVibeDays[index] = day;
    }

    onMount(() => {
        fetch(`/api/vibechek/users/${$userId}/vibe_days`)
            .then((response) => response.json())
            .then((data) => {
                if (data.days) {
                    availableVibeDays = data.days;
                }
                loaded = true;
            })
            .catch((err) => {});
    });

    function createSchedule() {
        fetch(`/api/vibechek/users/${$userId}/schedules`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                scheduleData: formData,
                days: selectedVibeDays,
            }),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.statusCode) {
                    throw data.message;
                } else {
                    alert("Schedule created successfully! Head on over to the home tab and listen!");
                }
            })
            .catch((err) => {});
    }
</script>

<div>
    <div>
        <!-- Schedule List -->
    </div>
    <div>
        {#if !availableVibeDays.length && loaded}
            <div class="alert alert-danger" role="alert">
                You don't have any Vibe Days to put in your schedule. Make some
                in Vibe Day mode first and come back!
            </div>
        {/if}
        <!-- Schedule Form -->
        <label for="schedule_name">Schedule Name</label>
        <input bind:value={formData.name} name="schedule_name" />
        <label>
            <input
                type="radio"
                bind:group={formData.is_public}
                name="is_public"
                value={0}
            />
            Private Schedule
        </label>
        <label>
            <input
                type="radio"
                bind:group={formData.is_public}
                name="is_public"
                value={1}
            />
            Public Schedule
        </label>
        <div>
            <table>
                {#each daysOfTheWeek as weekDay, i}
                    <tr>
                        <td>
                            <label for={weekDay}>{weekDay}</label>
                        </td>
                        <td>
                            <select
                                bind:value={selectedVibeDays[i]}
                                name={weekDay}
                            >
                                {#if placeholder}
                                    <option value="" disabled selected
                                        >{placeholder}</option
                                    >
                                {/if}
                                {#each availableVibeDays as vibeDay}
                                    <option value={vibeDay.vibe_day_id}
                                        >{vibeDay.name}</option
                                    >
                                {/each}
                            </select>
                        </td>
                    </tr>
                {/each}
            </table>
        </div>
        {#if schedule}
            <button class="btn btn-primary">Update</button>
        {:else}
            <button on:click={createSchedule} class="btn btn-primary"
                >Create</button
            >
        {/if}
    </div>
</div>

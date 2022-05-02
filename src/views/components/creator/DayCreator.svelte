<script>
    import { onMount } from "svelte";
    import { userId } from "../../../stores";
    import { secondsToBlocks } from "../../../utils/client";
    import CreatorBlockSlot from "./CreatorBlockSlot.svelte";

    const Available = "available";
    const Selected = "selected";
    const Taken = "taken";

    let vibe_days = [];
    let vibe_day = null;
    let loaded = false;
    let formData = {
        name: "",
    };
    let availableBlocks = [];
    const possibleHourValues = [...Array(24).keys()];
    const possibleMinuteValues = [0, 30];

    let slots = [];

    for (const hour of possibleHourValues) {
        for (const minute of possibleMinuteValues) {
            slots.push({
                hour,
                minute,
                state: Available,
                block: null,
                blocksTaken: 0,
            });
        }
    }

    onMount(() => {
        fetch(`/api/vibechek/users/${$userId}/vibe_blocks`)
            .then((response) => response.json())
            .then((data) => {
                if (data.blocks) {
                    availableBlocks = data.blocks;
                }
                loaded = true;
            })
            .catch((err) => {});
    });

    function createDay() {
        let blocks = [];
        slots
            .filter((slot) => slot.state === Selected)
            .forEach((slot) => {
                blocks.push(slot);
            });
        fetch(`/api/vibechek/users/${$userId}/vibe_days`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                dayData: formData,
                blocks,
            }),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.statusCode) {
                    throw data.message;
                } else {
                    alert("Day created successfully!");
                }
            })
            .catch((err) => {});
    }

    function updateSlots(event) {
        let { selectedBlock, index } = event.detail;
        let oldBlock = { ...slots[index] };
        let oldSlotState = [];
        for (let i = 0; i < slots.length; i++) {
            oldSlotState.push({ ...slots[i] });
        }
        clearSlots(index, oldBlock);
        if (selectedBlock >= 0) {
            slots[index].state = Selected;
            slots[index].block = availableBlocks[selectedBlock];
            slots[index].blocksTaken = secondsToBlocks(
                availableBlocks[selectedBlock].duration
            );
            for (let i = index + 1; i < index + slots[index].blocksTaken; i++) {
                if (slots[i].state === Selected) {
                    clearSlots(i, slots[i]);
                }
                slots[i].state = Taken;
                slots[i].block = null;
                slots[i].blocksTaken = 0;
            }
            slots = [...slots];
        }
    }

    function clearSlots(index, block) {
        let oldBlock = {...block};
        for (let i = index; i < index + oldBlock.blocksTaken; i++) {
            slots[i].state = Available;
            slots[i].block = null;
            slots[i].blocksTaken = 0;
        }
        slots = [...slots];
    }
</script>

<div>
    <div>
        <!-- Block List -->
    </div>
    <div>
        {#if !availableBlocks.length && loaded}
            <div class="alert alert-danger" role="alert">
                You don't have any blocks to put in your day. Make some in Block
                Creator mode first and come back!
            </div>
        {/if}
        <!-- Day Form -->
        <label for="name">Vibe Day Name</label>
        <input bind:value={formData.name} name="name" />

        {#if vibe_day}
            <button class="btn btn-primary">Update</button>
        {:else}
            <button on:click={createDay} class="btn btn-primary">Create</button>
        {/if}
        {#each slots as blockSlot, i}
            {#if blockSlot.status !== Taken}
                <CreatorBlockSlot
                    data={{ ...blockSlot, index: i }}
                    {availableBlocks}
                    on:selected={updateSlots}
                    on:clear={()=>{
                        clearSlots(i, blockSlot);
                    }}
                />
            {/if}
        {/each}
    </div>
</div>

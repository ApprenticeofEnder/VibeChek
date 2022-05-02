import { writable } from "svelte/store";

export const loginErrors = writable([]);

export const registrationErrors = writable([]);

const storedUserId = localStorage.getItem("userId");
export const userId = writable(storedUserId);
userId.subscribe(value => {
    localStorage.setItem("userId", value ? value : null);
})

const storedCreatorMode = localStorage.getItem("creatorMode");
export const creatorMode = writable(storedCreatorMode);
creatorMode.subscribe(value => {
    localStorage.setItem("creatorMode", value ? value : "playlist_search");
})
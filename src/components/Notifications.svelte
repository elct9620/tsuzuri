<script lang="ts">
  import { onDestroy } from "svelte";

  import { notificationStack } from "#/ui/notification.svelte.ts";
  import NotificationCard from "#/components/NotificationCard.svelte";

  // The Notifications go with the corner that shows them.
  onDestroy(() => notificationStack.clear());
</script>

<div class="toast toast-end toast-bottom z-40" data-notifications>
  {#each notificationStack.notifications as shownNotification (shownNotification.id)}
    <NotificationCard {shownNotification} />
  {/each}
</div>

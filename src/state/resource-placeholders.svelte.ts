/**
 * Whether Placeholders stand in for the Segments of a Resource being read: the Resource list shows
 * them as it selects one, and the Segment rows take them away as its Segments are shown.
 */
export class ResourcePlaceholders {
  isShown = $state(false);

  show(): void {
    this.isShown = true;
  }

  hide(): void {
    this.isShown = false;
  }
}

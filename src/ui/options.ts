/** An `<option>` of a menu, built without the `Option` constructor some DOMs lack. */
export function menuOption(value: string, label: string): HTMLOptionElement {
  const choice = document.createElement("option");
  choice.value = value;
  choice.textContent = label;
  return choice;
}

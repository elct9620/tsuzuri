import { Controller } from "@hotwired/stimulus";

import {
  recentProjects,
  type ProjectFeed,
  type RecentProjectView,
} from "../backend/project";
import { interfaceLanguageCode } from "../i18n";

/** A row of the start screen's list, opening its Project when clicked. */
function listRow(project: RecentProjectView): HTMLLIElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "list-col-grow min-w-0 text-left";
  const name = document.createElement("div");
  name.className = "truncate";
  name.textContent = project.name;
  const path = document.createElement("div");
  path.className = "truncate text-xs opacity-60";
  path.textContent = project.directory;
  button.append(name, path);
  const date = document.createElement("time");
  date.className = "text-xs tabular-nums opacity-60";
  date.dateTime = new Date(project.opened_at_ms).toISOString();
  date.textContent = new Intl.DateTimeFormat(interfaceLanguageCode(), {
    dateStyle: "medium",
  }).format(project.opened_at_ms);
  const row = document.createElement("li");
  row.className = "list-row cursor-pointer items-center hover:bg-base-200";
  row.dataset.action = "click->project#openRecent";
  row.dataset.projectDirectoryParam = project.directory;
  row.append(button, date);
  return row;
}

/** An item of the Open menu, naming its Project with the path in a tooltip. */
function menuItem(project: RecentProjectView): HTMLLIElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "project#openRecent";
  button.dataset.projectDirectoryParam = project.directory;
  button.dataset.tooltip = project.directory;
  const name = document.createElement("span");
  name.className = "min-w-0 truncate";
  name.textContent = project.name;
  button.append(name);
  const item = document.createElement("li");
  item.dataset.recentProjectsTarget = "menuItem";
  item.append(button);
  return item;
}

/** The Recent Projects Rust keeps, read again each time the Project changes. */
export default class RecentProjectsController extends Controller {
  static targets = ["list", "heading", "menuTitle", "menuItem"];

  /** The start screen's list, hidden while there are none. */
  declare readonly listTarget: HTMLUListElement;
  declare readonly headingTarget: HTMLLIElement;
  /** The Open menu's title over them, hidden while there are none; the items follow it. */
  declare readonly menuTitleTarget: HTMLLIElement;
  declare readonly menuItemTargets: HTMLLIElement[];

  declare readonly feed: ProjectFeed;

  private unfollow?: () => void;

  connect(): void {
    this.unfollow = this.feed.follow(() => void this.showRecentProjects());
  }

  disconnect(): void {
    this.unfollow?.();
  }

  private async showRecentProjects(): Promise<void> {
    // A list that cannot be read is shown as none: the start screen still opens a directory.
    const projects = await recentProjects().catch(() => []);
    this.listTarget.replaceChildren(
      this.headingTarget,
      ...projects.map(listRow),
    );
    this.listTarget.hidden = projects.length === 0;
    for (const item of this.menuItemTargets) item.remove();
    this.menuTitleTarget.after(...projects.map(menuItem));
    this.menuTitleTarget.hidden = projects.length === 0;
  }
}

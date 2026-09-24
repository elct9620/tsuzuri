import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { message, open } from "@tauri-apps/plugin-dialog";

import { describeFailure } from "../failure";

/** The toolbar's Project actions; what they make lives in Rust. */
export default class ProjectController extends Controller {
  async openSrt({ currentTarget }: Event): Promise<void> {
    (currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path === null) return;
    try {
      await invoke("open_srt", { path });
      this.dispatch("opened");
    } catch (error) {
      await message(describeFailure(error), { kind: "error" });
    }
  }
}

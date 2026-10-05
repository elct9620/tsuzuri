import {
  ArrowRightToLine,
  Captions,
  LocateFixed,
  Magnet,
  Pause,
  PictureInPicture2,
  Play,
  TriangleAlert,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  createIcons,
} from "lucide";

/** The Lucide icons the interface draws; only these are bundled. Markup names one in kebab case. */
const ICONS = {
  ArrowRightToLine,
  Captions,
  LocateFixed,
  Magnet,
  Pause,
  PictureInPicture2,
  Play,
  TriangleAlert,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
};

/** Draws each element under `root` that names an icon with `data-lucide` as that icon. */
export function showIcons(root: Element | Document = document): void {
  createIcons({ icons: ICONS, root, attrs: { "aria-hidden": "true" } });
}

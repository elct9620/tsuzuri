import {
  ArrowLeftRight,
  ArrowRightToLine,
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  EllipsisVertical,
  Info,
  Keyboard,
  LocateFixed,
  Magnet,
  MonitorPlay,
  PanelTopClose,
  PanelTopOpen,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
  createElement,
  createIcons,
} from "lucide";

/** The Lucide icons the interface draws; only these are bundled. Markup names one in kebab case. */
const ICONS = {
  ArrowLeftRight,
  ArrowRightToLine,
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  EllipsisVertical,
  Info,
  Keyboard,
  LocateFixed,
  Magnet,
  MonitorPlay,
  PanelTopClose,
  PanelTopOpen,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
};

export type IconName = keyof typeof ICONS;

/** One icon for code to place, hidden from assistive technology since what it sits in names it. */
export function iconElement(name: IconName, className = "size-4"): SVGElement {
  return createElement(ICONS[name], {
    class: className,
    "aria-hidden": "true",
  });
}

/** Draws each element under `root` that names an icon with `data-lucide` as that icon. */
export function showIcons(root: Element | Document = document): void {
  createIcons({ icons: ICONS, root, attrs: { "aria-hidden": "true" } });
}

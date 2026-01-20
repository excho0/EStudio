import {
  Folder,
  LayoutGrid,
  Settings,
  Sparkles,
  Upload,
  LucideIcon,
} from "lucide-react";

type Submenu = {
  href: string;
  label: string;
  active?: boolean;
};

type Menu = {
  href: string;
  label: string;
  active?: boolean;
  icon: LucideIcon;
  submenus?: Submenu[];
};

type Group = {
  groupLabel: string;
  menus: Menu[];
};

export function getMenuList(): Group[] {
  return [
    {
      groupLabel: "",
      menus: [
        {
          href: "/dashboard",
          label: "Overview",
          icon: LayoutGrid,
          submenus: [],
        }
      ],
    },
    {
      groupLabel: "Studio",
      menus: [
        {
          href: "/library",
          label: "Library",
          icon: Folder,
        },
        {
          href: "/upload",
          label: "Upload",
          icon: Upload,
        },
        {
          href: "/preview",
          label: "Preview",
          icon: Sparkles,
        },
      ],
    },
    {
      groupLabel: "Settings",
      menus: [
        {
          href: "/settings",
          label: "Settings",
          icon: Settings,
        },
      ],
    },
  ];
}

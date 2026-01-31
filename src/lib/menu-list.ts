import {
  BarChart3,
  Folder,
  LayoutGrid,
  Settings,
  Upload,
  LucideIcon,
  Globe,
  User,
  Palette,
  Cable,
} from "lucide-react";

type Submenu = {
  href: string;
  label: string;
  active?: boolean;
  icon?: LucideIcon;
  requiresAuth?: boolean;
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
        },
        {
          href: "/metrics",
          label: "Metrics",
          icon: BarChart3,
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
        }
      ],
    },
    {
      groupLabel: "Settings",
      menus: [
        {
          href: "/settings",
          label: "Settings",
          icon: Settings,
          submenus: [
            {
              href: "/settings/general",
              label: "General",
              icon: Globe,
            },
            {
              href: "/settings/profile",
              label: "Profile",
              icon: User,
              requiresAuth: true,
            },
            {
              href: "/settings/connections",
              label: "Connections",
              icon: Cable,
            },
            {
              href: "/settings/appearance",
              label: "Appearance",
              icon: Palette,
            }
          ],
        },
      ],
    },
  ];
}

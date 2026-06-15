import { Separator } from "@openai-demo/ui/components/separator";
import { Link } from "@tanstack/react-router";

import UserMenu from "./user-menu";

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  return (
    <header>
      <div className="flex h-12 flex-row items-center justify-between px-4">
        <nav className="flex gap-4 text-sm">
          {links.map(({ to, label }) => {
            return (
              <Link
                key={to}
                to={to}
                className="text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{
                  className: "text-foreground",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <UserMenu />
        </div>
      </div>
      <Separator />
    </header>
  );
}

import { SidebarNav } from "./sidebar-nav";
import { Bell, Search } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card/50 backdrop-blur-sm z-10">
          <div className="flex items-center w-full max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search catalog, artists, or ISRC..."
                className="w-full pl-9 bg-background/50 border-border focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" className="text-muted-foreground relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
            </Button>
            <div className="flex items-center space-x-3 border-l border-border pl-4">
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium leading-none text-foreground">Admin User</p>
                <p className="text-xs text-muted-foreground mt-1">admin@tajikmusic.com</p>
              </div>
              <Avatar className="h-9 w-9 border border-border">
                <AvatarImage src="" alt="Admin User" />
                <AvatarFallback className="bg-primary/20 text-primary">AU</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

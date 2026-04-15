import { SidebarNav } from "./sidebar-nav";
import { WaveBackground } from "./wave-background";
import { Bell, Search, Globe, ChevronDown } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useLang } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function Layout({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useLang();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-[60px] flex items-center justify-between px-5 border-b border-border/60 bg-card/40 backdrop-blur-md shrink-0 z-10">
          <div className="flex items-center flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                type="search"
                placeholder={t.header.search}
                className="w-full pl-9 h-9 text-sm bg-background/60 border-border/50 focus-visible:ring-primary/50 placeholder:text-muted-foreground/40 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="uppercase font-semibold tracking-wide">{lang}</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-28 bg-card border-border shadow-lg">
                <DropdownMenuItem
                  className={`text-xs cursor-pointer ${lang === "en" ? "text-primary font-semibold" : ""}`}
                  onClick={() => setLang("en")}
                >
                  🇬🇧 English
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={`text-xs cursor-pointer ${lang === "ru" ? "text-primary font-semibold" : ""}`}
                  onClick={() => setLang("ru")}
                >
                  🇷🇺 Русский
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="w-px h-5 bg-border/60 mx-1" />

            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground relative rounded-lg">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary shadow-sm shadow-primary/50" />
            </Button>

            <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-border/60">
              <div className="hidden md:block text-right">
                <p className="text-[12px] font-semibold text-foreground leading-tight">Admin User</p>
                <p className="text-[10px] text-muted-foreground/70 leading-tight">admin@tajikmusic.com</p>
              </div>
              <Avatar className="h-8 w-8 border border-border/50 ring-1 ring-primary/10">
                <AvatarImage src="" alt="Admin" />
                <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-[11px] font-bold">AU</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto relative">
          <WaveBackground />
          <div className="relative z-10 p-6 md:p-7 mx-auto max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useListArtists } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Filter, Users as UsersIcon, MoreHorizontal, FileEdit } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { useLang } from "@/lib/i18n";

export default function Artists() {
  const { user } = useAuth();
  const { t } = useLang();
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();

  const isAdminLike = user?.role === "admin" || user?.role === "manager";
  const isArtist    = user?.role === "artist";
  const isLabel     = user?.role === "label";

  const { data: artistsDataRaw, isLoading } = useListArtists({
    search: searchQuery || undefined,
    limit: 50,
    ...(isLabel && user?.labelId ? { label_id: user.labelId } : {}),
  });
  const artistsData = isArtist
    ? { ...artistsDataRaw, data: (artistsDataRaw?.data ?? []).filter(a => a.id === user?.artistId) }
    : artistsDataRaw;

  const title = isAdminLike ? t.artists.title_admin : isLabel ? t.artists.title_label : t.artists.title_artist;
  const subtitle = isAdminLike ? t.artists.subtitle_admin : isLabel ? t.artists.subtitle_label : t.artists.subtitle_artist;

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {(isAdminLike || isLabel) && (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {isLabel ? t.artists.sign_artist : t.artists.new_artist}
            </Button>
          )}
        </div>

        <Card className="flex-1 bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={t.artists.search_placeholder}
                    className="pl-8 bg-background/50 border-border"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" className="shrink-0 bg-background/50">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto">
            <Table>
              <TableHeader className="bg-background/50 sticky top-0 z-10">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[60px]">{t.artists.table.artist}</TableHead>
                  <TableHead>{t.artists.table.name}</TableHead>
                  <TableHead>{t.artists.table.label}</TableHead>
                  <TableHead>{t.artists.table.genre}</TableHead>
                  <TableHead>{t.artists.table.releases}</TableHead>
                  <TableHead>{t.artists.table.status}</TableHead>
                  <TableHead className="text-right">{t.artists.table.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><Skeleton className="h-10 w-10 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[40px]" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 rounded-md ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : artistsData?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                      {t.artists.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  artistsData?.data.map((artist) => (
                    <TableRow
                      key={artist.id}
                      className="border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
                    >
                      <TableCell>
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarImage src={artist.imageUrl || ""} alt={artist.name} />
                          <AvatarFallback className="bg-primary/20 text-primary">
                            {artist.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{artist.name}</TableCell>
                      <TableCell className="text-muted-foreground">{artist.labelName || t.artists.independent}</TableCell>
                      <TableCell className="text-muted-foreground">{artist.genre || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground">{artist.totalReleases}</TableCell>
                      <TableCell>
                        <StatusBadge status={artist.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-background/80">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuLabel>{t.artists.actions}</DropdownMenuLabel>
                            <DropdownMenuItem>
                              <FileEdit className="mr-2 h-4 w-4" />
                              {t.artists.edit_profile}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

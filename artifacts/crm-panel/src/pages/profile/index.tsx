import { Layout } from "@/components/layout";
import { useState, useRef, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  User as UserIcon, Link as LinkIcon, KeyRound, Users2,
  CheckCircle2, Phone, MapPin, Mail, ImagePlus, Eye, EyeOff,
  Music, Apple, Youtube, Facebook, Instagram, Linkedin, Twitter, Send as SendIcon,
  Loader2,
} from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  label: "Лейбл",
  artist: "Артист",
};

async function patchMe(body: Record<string, any>) {
  const res = await fetch("/api/users/me", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

async function changePassword(currentPassword: string, newPassword: string) {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export default function ProfilePage() {
  const { user, refresh, isLoading } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile form
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [phone, setPhone]           = useState("");
  const [address, setAddress]       = useState("");
  const [country, setCountry]       = useState("");
  const [region, setRegion]         = useState("");
  const [city, setCity]             = useState("");
  const [zip, setZip]               = useState("");
  const [about, setAbout]           = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // DSP Profiles
  const [appleId, setAppleId]   = useState("");
  const [spotifyId, setSpotifyId] = useState("");
  const [yandexId, setYandexId] = useState("");
  const [youtubeId, setYoutubeId] = useState("");

  // Social Links
  const [facebook, setFacebook]   = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [tiktok, setTiktok]       = useState("");
  const [linkedin, setLinkedin]   = useState("");
  const [xLink, setXLink]         = useState("");
  const [telegram, setTelegram]   = useState("");
  const [vk, setVk]               = useState("");

  // Password
  const [curPwd, setCurPwd]   = useState("");
  const [newPwd, setNewPwd]   = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCfm, setShowCfm] = useState(false);

  // Pending state
  const [savingProfile, setSavingProfile]   = useState(false);
  const [savingDsp, setSavingDsp]           = useState(false);
  const [savingSocial, setSavingSocial]     = useState(false);
  const [savingPwd, setSavingPwd]           = useState(false);

  // Hydrate form from user once loaded.
  useEffect(() => {
    if (!user) return;
    const parts = (user.name ?? "").trim().split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setPhone(user.phone ?? "");
    setAddress(user.address ?? "");
    setCountry(user.country ?? "");
    setRegion(user.region ?? "");
    setCity(user.city ?? "");
    setZip(user.zipCode ?? "");
    setAbout(user.about ?? "");

    setAppleId(user.dspProfiles?.appleMusic ?? "");
    setSpotifyId(user.dspProfiles?.spotify ?? "");
    setYandexId(user.dspProfiles?.yandex ?? "");
    setYoutubeId(user.dspProfiles?.youtube ?? "");

    setFacebook(user.socialLinks?.facebook ?? "");
    setInstagram(user.socialLinks?.instagram ?? "");
    setYoutubeUrl(user.socialLinks?.youtube ?? "");
    setTiktok(user.socialLinks?.tiktok ?? "");
    setLinkedin(user.socialLinks?.linkedin ?? "");
    setXLink(user.socialLinks?.x ?? "");
    setTelegram(user.socialLinks?.telegram ?? "");
    setVk(user.socialLinks?.vk ?? "");
  }, [user?.id]);

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || firstName.trim();
      await patchMe({
        name: fullName || undefined,
        phone: phone || null,
        address: address || null,
        country: country || null,
        region: region || null,
        city: city || null,
        zipCode: zip || null,
        about: about || null,
      });
      await refresh();
      toast({ title: "Профиль обновлён", description: "Изменения сохранены." });
    } catch (e: any) {
      toast({ title: "Не получилось сохранить", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveDsp() {
    setSavingDsp(true);
    try {
      await patchMe({
        dspProfiles: {
          appleMusic: appleId || undefined,
          spotify:    spotifyId || undefined,
          yandex:     yandexId || undefined,
          youtube:    youtubeId || undefined,
        },
      });
      await refresh();
      toast({ title: "DSP-профили обновлены" });
    } catch (e: any) {
      toast({ title: "Не получилось сохранить", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSavingDsp(false);
    }
  }

  async function handleSaveSocials() {
    setSavingSocial(true);
    try {
      await patchMe({
        socialLinks: {
          facebook:  facebook || undefined,
          instagram: instagram || undefined,
          youtube:   youtubeUrl || undefined,
          tiktok:    tiktok || undefined,
          linkedin:  linkedin || undefined,
          x:         xLink || undefined,
          telegram:  telegram || undefined,
          vk:        vk || undefined,
        },
      });
      await refresh();
      toast({ title: "Соцсети обновлены", description: "Ссылки сохранены." });
    } catch (e: any) {
      toast({ title: "Не получилось сохранить", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSavingSocial(false);
    }
  }

  async function handleChangePassword() {
    if (!curPwd || !newPwd || !confirmPwd) {
      toast({ title: "Заполни все поля", variant: "destructive" });
      return;
    }
    if (newPwd.length < 8) {
      toast({ title: "Слабый пароль", description: "Минимум 8 символов.", variant: "destructive" });
      return;
    }
    if (newPwd !== confirmPwd) {
      toast({ title: "Пароли не совпадают", variant: "destructive" });
      return;
    }
    setSavingPwd(true);
    try {
      await changePassword(curPwd, newPwd);
      toast({ title: "Пароль изменён", description: "Войди с новым паролем при следующем входе." });
      setCurPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e: any) {
      toast({ title: "Не удалось сменить пароль", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSavingPwd(false);
    }
  }

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/gif"].includes(f.type)) {
      toast({ title: "Неверный формат", description: "Только JPG, PNG, GIF.", variant: "destructive" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "Файл слишком большой", description: "Максимум 5 MB.", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(f);
    setAvatarPreview(url);
    toast({
      title: "Аватар выбран",
      description: "Загрузка на сервер появится в следующем обновлении (нужен файловый storage).",
    });
  }

  if (isLoading || !user) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка профиля...
        </div>
      </Layout>
    );
  }

  const displayAvatar = avatarPreview ?? user.avatarUrl ?? null;
  const isAdmin = user.role === "admin" || user.role === "manager";

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
          <h1 className="text-2xl font-bold tracking-tight">Профиль</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Добро пожаловать, <span className="text-foreground font-medium">{user.name}</span>
          </p>
        </div>

        {/* Profile hero */}
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="relative">
            <Avatar className="h-24 w-24 ring-2 ring-primary/30 shadow-lg shadow-primary/20">
              {displayAvatar && <AvatarImage src={displayAvatar} alt={user.name} />}
              <AvatarFallback className="bg-gradient-to-br from-primary/40 to-primary/10 text-primary text-2xl font-bold">
                {user.avatarInitials}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 bg-primary text-white rounded-full p-1 shadow-md">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold flex items-center justify-center gap-1.5">
              {user.name}
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </h2>
            <div className="flex items-center justify-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
              {phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {phone}</span>}
              {city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {city}</span>}
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {user.email}</span>
              <Badge variant="outline" className="text-[10px] text-primary bg-primary/10 border-primary/20">
                {ROLE_LABEL[user.role] ?? user.role}
              </Badge>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profile">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex-wrap mx-auto">
            <TabsTrigger value="profile" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <UserIcon className="h-3.5 w-3.5" /> Профиль
            </TabsTrigger>
            <TabsTrigger value="social" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" /> Соцсети
            </TabsTrigger>
            <TabsTrigger value="password" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> Сменить пароль
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="members" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
                <Users2 className="h-3.5 w-3.5" /> Участники
              </TabsTrigger>
            )}
          </TabsList>

          {/* ============== PROFILE TAB ============== */}
          <TabsContent value="profile" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              {/* Left: avatar upload + DSP profiles */}
              <div className="space-y-6">
                <Card className="card-surface no-lift border-border/60">
                  <CardContent className="p-4">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      aria-label="Загрузить изображение профиля"
                      className="w-full border-2 border-dashed border-border/60 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {displayAvatar ? (
                        <img src={displayAvatar} alt="Загруженный аватар" className="h-24 w-24 mx-auto rounded-lg object-cover" />
                      ) : (
                        <ImagePlus className="h-10 w-10 text-primary/60 mx-auto mb-2" />
                      )}
                      <p className="text-sm font-medium mt-2">Загрузить изображение</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Кликни или перетащи файл</p>
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center mt-2">
                      Допустимо: *.jpeg, *.jpg, *.png, *.gif
                    </p>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif" className="hidden" onChange={handleAvatarPick} />
                  </CardContent>
                </Card>

                <Card className="card-surface no-lift border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">DSP-профили</CardTitle>
                    <CardDescription className="text-xs">Ссылки на твои страницы на стриминге</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <DspInput icon={<Music className="h-3.5 w-3.5 text-rose-400" />} label="Apple Music ID" value={appleId} onChange={setAppleId} placeholder="Введи свой Apple Music profile" />
                    <DspInput icon={<Music className="h-3.5 w-3.5 text-emerald-400" />} label="Spotify ID" value={spotifyId} onChange={setSpotifyId} placeholder="Введи свой Spotify Music profile" />
                    <DspInput icon={<Apple className="h-3.5 w-3.5 text-amber-400" />} label="Yandex Music ID" value={yandexId} onChange={setYandexId} placeholder="Введи свой Yandex Music profile" />
                    <DspInput icon={<Youtube className="h-3.5 w-3.5 text-red-400" />} label="YouTube Topic ID" value={youtubeId} onChange={setYoutubeId} placeholder="Введи свой YouTube Topic profile" />
                    <Button size="sm" className="w-full mt-1" onClick={handleSaveDsp} disabled={savingDsp}>
                      {savingDsp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Сохранить"}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Your details */}
              <Card className="card-surface no-lift border-border/60">
                <CardHeader>
                  <CardTitle>Твои данные</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Имя">
                      <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="bg-background/50" />
                    </Field>
                    <Field label="Фамилия">
                      <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="bg-background/50" />
                    </Field>
                    <Field label="Email">
                      <Input type="email" value={user.email} disabled className="bg-background/50" />
                    </Field>
                    <Field label="Номер телефона">
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-background/50" />
                    </Field>
                  </div>

                  <Field label="Адрес">
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Введи адрес" className="bg-background/50" />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Страна">
                      <Select value={country || undefined} onValueChange={setCountry}>
                        <SelectTrigger className="bg-background/50"><SelectValue placeholder="Выбери страну" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tj">🇹🇯 Таджикистан</SelectItem>
                          <SelectItem value="ru">🇷🇺 Россия</SelectItem>
                          <SelectItem value="uz">🇺🇿 Узбекистан</SelectItem>
                          <SelectItem value="kz">🇰🇿 Казахстан</SelectItem>
                          <SelectItem value="es">🇪🇸 Испания</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Регион / Область">
                      <Input value={region} onChange={(e) => setRegion(e.target.value)} className="bg-background/50" />
                    </Field>
                    <Field label="Город">
                      <Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-background/50" />
                    </Field>
                    <Field label="Почтовый индекс">
                      <Input value={zip} onChange={(e) => setZip(e.target.value)} className="bg-background/50" />
                    </Field>
                  </div>

                  <Field label="Тип аккаунта">
                    <Input value={ROLE_LABEL[user.role] ?? user.role} disabled className="bg-background/50" />
                  </Field>

                  <Field label="О себе">
                    <textarea
                      value={about}
                      onChange={(e) => setAbout(e.target.value)}
                      placeholder="Расскажи о себе..."
                      className="w-full min-h-[110px] px-3 py-2 text-sm rounded-md bg-background/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                  </Field>

                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveProfile} disabled={savingProfile}>
                      {savingProfile ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Сохраняю...</> : "Сохранить изменения"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ============== SOCIAL LINKS TAB ============== */}
          <TabsContent value="social" className="mt-6">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Соцсети</CardTitle>
                <CardDescription>Добавь ссылки на свои страницы для увеличения охвата</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <SocialField icon={<Facebook className="h-4 w-4 text-blue-500" />} label="Facebook" value={facebook} onChange={setFacebook} />
                  <SocialField icon={<Instagram className="h-4 w-4 text-pink-500" />} label="Instagram" value={instagram} onChange={setInstagram} />
                  <SocialField icon={<Youtube className="h-4 w-4 text-red-500" />} label="YouTube" value={youtubeUrl} onChange={setYoutubeUrl} />
                  <SocialField icon={<Music className="h-4 w-4 text-white" />} label="TikTok" value={tiktok} onChange={setTiktok} />
                  <SocialField icon={<Linkedin className="h-4 w-4 text-sky-500" />} label="LinkedIn" value={linkedin} onChange={setLinkedin} />
                  <SocialField icon={<Twitter className="h-4 w-4 text-sky-400" />} label="X (Twitter)" value={xLink} onChange={setXLink} />
                  <SocialField icon={<SendIcon className="h-4 w-4 text-cyan-400" />} label="Telegram" value={telegram} onChange={setTelegram} />
                  <SocialField icon={<Music className="h-4 w-4 text-blue-400" />} label="VK" value={vk} onChange={setVk} />
                </div>
                <div className="flex justify-end mt-6">
                  <Button onClick={handleSaveSocials} disabled={savingSocial}>
                    {savingSocial ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Сохраняю...</> : "Сохранить изменения"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============== PASSWORD TAB ============== */}
          <TabsContent value="password" className="mt-6">
            <Card className="card-surface no-lift border-border/60 max-w-3xl mx-auto">
              <CardHeader>
                <CardTitle>Сменить пароль</CardTitle>
                <CardDescription>
                  Чтобы обновить пароль, введи текущий и новый пароль. Если возникнут проблемы —{" "}
                  <a href="#" className="text-primary underline-offset-2 hover:underline">свяжись с поддержкой</a>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Email">
                  <Input value={user.email} disabled className="bg-background/50" />
                </Field>
                <Field label="Текущий пароль">
                  <PwdInput value={curPwd} onChange={setCurPwd} show={showCur} onToggle={() => setShowCur(!showCur)} />
                </Field>
                <Field label="Новый пароль">
                  <PwdInput value={newPwd} onChange={setNewPwd} show={showNew} onToggle={() => setShowNew(!showNew)} />
                  <p className="text-[11px] text-muted-foreground mt-1">Минимум 8 символов, желательно с цифрами и спецсимволами</p>
                </Field>
                <Field label="Подтверди новый пароль">
                  <PwdInput value={confirmPwd} onChange={setConfirmPwd} show={showCfm} onToggle={() => setShowCfm(!showCfm)} />
                </Field>
                <div className="flex justify-end pt-2">
                  <Button onClick={handleChangePassword} disabled={savingPwd}>
                    {savingPwd ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Сохраняю...</> : "Сохранить изменения"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============== ACCOUNT MEMBERS TAB (admin only) ============== */}
          {isAdmin && (
            <TabsContent value="members" className="mt-6">
              <MembersTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}

// ─── Members tab — admin/manager only, real users from /api/users ───
function MembersTab() {
  const [members, setMembers] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users?limit=100", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        setMembers(j.data ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки");
      }
    })();
  }, []);

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Участники аккаунта</CardTitle>
          <CardDescription>Команда, имеющая доступ к этому аккаунту</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && <div className="p-4 text-sm text-rose-400">{error}</div>}
        {!members && !error && (
          <div className="p-6 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
          </div>
        )}
        {members && (
          <Table>
            <TableHeader className="bg-background/30">
              <TableRow className="hover:bg-transparent">
                <TableHead>Имя</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Последний вход</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m: any) => {
                const initials = String(m.name ?? "").split(/\s+/).map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
                const last = m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString("ru-RU") : "—";
                return (
                  <TableRow key={m.id} className="hover:bg-accent/20">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-[11px] font-bold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.email}</TableCell>
                    <TableCell className="text-xs">{ROLE_LABEL[m.role] ?? m.role}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{last}</TableCell>
                    <TableCell>
                      {m.status === "active"   && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">Активен</Badge>}
                      {m.status === "suspended" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">Заблокирован</Badge>}
                      {m.status === "inactive"  && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">Неактивен</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {members.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">Пользователей пока нет</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── helper components ───
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function DspInput({ icon, label, value, onChange, placeholder }: {
  icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2">{icon}</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-8 bg-background/50 text-xs"
        />
      </div>
    </div>
  );
}

function SocialField({ icon, label, value, onChange }: {
  icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`https://${label.toLowerCase()}.com/...`}
        className="bg-background/50"
      />
    </div>
  );
}

function PwdInput({ value, onChange, show, onToggle }: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background/50 pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Скрыть пароль" : "Показать пароль"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

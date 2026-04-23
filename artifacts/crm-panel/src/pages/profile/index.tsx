import { Layout } from "@/components/layout";
import { useState, useRef } from "react";
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
  Plus, MoreHorizontal,
} from "lucide-react";

const ACCOUNT_MEMBERS = [
  { name: "Фарход Гафуров",      email: "name@gmail.com",         role: "Owner",              lastLogin: "5 часов назад",  status: "active",   initials: "ФГ" },
  { name: "Ёсамин Давлатов",     email: "yosamindavlatova@gmail.com", role: "Admin",          lastLogin: "2 дня назад",    status: "active",   initials: "ЁД" },
  { name: "Афруза Ариана",       email: "afruzmusica@gmail.com",  role: "Content, Analytics", lastLogin: "3 года назад",   status: "disabled", initials: "АА" },
  { name: "—",                    email: "tmusic@gmail.com",       role: "Content, Analytics", lastLogin: "—",              status: "pending",  initials: "T"  },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile form
  const [firstName, setFirstName]   = useState("Фарход");
  const [lastName, setLastName]     = useState("Гафуров");
  const [email, setEmail]           = useState("name@mail.com");
  const [phone, setPhone]           = useState("+992955885588");
  const [address, setAddress]       = useState("");
  const [country, setCountry]       = useState("tj");
  const [region, setRegion]         = useState("Республиканского подчинения");
  const [city, setCity]             = useState("Душанбе");
  const [zip, setZip]               = useState("734000");
  const [accountType, setAccountType] = useState("label");
  const [about, setAbout]           = useState("");
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);

  // DSP Profiles
  const [appleId, setAppleId]   = useState("");
  const [spotifyId, setSpotifyId] = useState("");
  const [yandexId, setYandexId] = useState("");
  const [youtubeId, setYoutubeId] = useState("");

  // Social Links
  const [facebook, setFacebook]   = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube]     = useState("");
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

  function handleSaveProfile() {
    toast({ title: "Профиль обновлён", description: "Изменения сохранены." });
  }
  function handleSaveSocials() {
    toast({ title: "Соцсети обновлены", description: "Ссылки сохранены." });
  }
  function handleChangePassword() {
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
    toast({ title: "Пароль изменён", description: "Войди с новым паролем при следующем входе." });
    setCurPwd(""); setNewPwd(""); setConfirmPwd("");
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
    setAvatarUrl(url);
    toast({ title: "Аватар загружен" });
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
          <h1 className="text-2xl font-bold tracking-tight">Профиль</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Добро пожаловать, <span className="text-foreground font-medium">{user?.name ?? "—"}</span>
          </p>
        </div>

        {/* Profile hero */}
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="relative">
            <Avatar className="h-24 w-24 ring-2 ring-primary/30 shadow-lg shadow-primary/20">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={firstName} />}
              <AvatarFallback className="bg-gradient-to-br from-primary/40 to-primary/10 text-primary text-2xl font-bold">
                {(firstName[0] ?? "?") + (lastName[0] ?? "")}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 bg-primary text-white rounded-full p-1 shadow-md">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold flex items-center justify-center gap-1.5">
              {firstName} {lastName}
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </h2>
            <div className="flex items-center justify-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {phone}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {city}</span>
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {email}</span>
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
            <TabsTrigger value="members" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Users2 className="h-3.5 w-3.5" /> Участники
            </TabsTrigger>
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
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Загруженный аватар" className="h-24 w-24 mx-auto rounded-lg object-cover" />
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
                    <Button size="sm" className="w-full mt-1">Сохранить</Button>
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
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background/50" />
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
                      <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
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
                    <Select value={accountType} onValueChange={setAccountType}>
                      <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="artist">Артист</SelectItem>
                        <SelectItem value="label">Лейбл</SelectItem>
                        <SelectItem value="manager">Менеджер</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Button onClick={handleSaveProfile}>Сохранить изменения</Button>
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
                  <SocialField icon={<Youtube className="h-4 w-4 text-red-500" />} label="YouTube" value={youtube} onChange={setYoutube} />
                  <SocialField icon={<Music className="h-4 w-4 text-white" />} label="TikTok" value={tiktok} onChange={setTiktok} />
                  <SocialField icon={<Linkedin className="h-4 w-4 text-sky-500" />} label="LinkedIn" value={linkedin} onChange={setLinkedin} />
                  <SocialField icon={<Twitter className="h-4 w-4 text-sky-400" />} label="X (Twitter)" value={xLink} onChange={setXLink} />
                  <SocialField icon={<SendIcon className="h-4 w-4 text-cyan-400" />} label="Telegram" value={telegram} onChange={setTelegram} />
                  <SocialField icon={<Music className="h-4 w-4 text-blue-400" />} label="VK" value={vk} onChange={setVk} />
                </div>
                <div className="flex justify-end mt-6">
                  <Button onClick={handleSaveSocials}>Сохранить изменения</Button>
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
                  <Input value={email} disabled className="bg-background/50" />
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
                  <Button onClick={handleChangePassword}>Сохранить изменения</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============== ACCOUNT MEMBERS TAB ============== */}
          <TabsContent value="members" className="mt-6">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Участники аккаунта</CardTitle>
                  <CardDescription>Команда, имеющая доступ к этому аккаунту</CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Пригласить пользователя
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Имя</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Роль</TableHead>
                      <TableHead>Последний вход</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ACCOUNT_MEMBERS.map((m, i) => (
                      <TableRow key={i} className="hover:bg-accent/20">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-[11px] font-bold">
                                {m.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{m.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.email}</TableCell>
                        <TableCell className="text-xs">{m.role}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.lastLogin}</TableCell>
                        <TableCell>
                          {m.status === "active"   && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">Активен</Badge>}
                          {m.status === "disabled" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">Заблокирован</Badge>}
                          {m.status === "pending"  && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">В процессе</Badge>}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Действия для ${m.name}`}>
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
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
          className="pl-8 bg-background/50 text-xs h-9"
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
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${label} ссылка`}
          className="pl-10 bg-background/50"
        />
      </div>
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
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 rounded"
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

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
import { useLang } from "@/lib/i18n";
import {
  User as UserIcon, Link as LinkIcon, KeyRound, Users2,
  CheckCircle2, Phone, MapPin, Mail, ImagePlus, Eye, EyeOff,
  Music, Apple, Youtube, Facebook, Instagram, Linkedin, Twitter, Send as SendIcon,
  Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Banknote, Receipt,
  Upload, Trash2, FileText, AlertTriangle, ExternalLink,
} from "lucide-react";

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
  const { t } = useLang();
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
      toast({ title: t.profile.saved, description: t.profile.saved_desc });
    } catch (e: any) {
      toast({ title: t.profile.save_error, description: e?.message ?? "", variant: "destructive" });
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
      toast({ title: t.profile.dsp_saved });
    } catch (e: any) {
      toast({ title: t.profile.save_error, description: e?.message ?? "", variant: "destructive" });
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
      toast({ title: t.profile.social_saved, description: t.profile.social_saved_desc });
    } catch (e: any) {
      toast({ title: t.profile.save_error, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSavingSocial(false);
    }
  }

  async function handleChangePassword() {
    if (!curPwd || !newPwd || !confirmPwd) {
      toast({ title: t.profile.fill_all, variant: "destructive" });
      return;
    }
    if (newPwd.length < 8) {
      toast({ title: t.profile.weak_password, description: t.profile.weak_password_desc, variant: "destructive" });
      return;
    }
    if (newPwd !== confirmPwd) {
      toast({ title: t.profile.passwords_mismatch, variant: "destructive" });
      return;
    }
    setSavingPwd(true);
    try {
      await changePassword(curPwd, newPwd);
      toast({ title: t.profile.password_changed, description: t.profile.password_changed_desc });
      setCurPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e: any) {
      toast({ title: t.profile.password_error, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSavingPwd(false);
    }
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(f.type)) {
      toast({ title: t.profile.format_error, description: t.profile.format_error_desc, variant: "destructive" });
      input.value = "";
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: t.profile.size_error, description: t.profile.size_error_desc, variant: "destructive" });
      input.value = "";
      return;
    }

    const localUrl = URL.createObjectURL(f);
    setAvatarPreview(localUrl);

    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const updated = await res.json();
      const fresh = updated.avatarUrl ? `${updated.avatarUrl}?ts=${Date.now()}` : null;
      setAvatarPreview(fresh);
      await refresh();
      toast({ title: t.profile.avatar_updated });
    } catch (err: any) {
      setAvatarPreview(null);
      toast({
        title: t.profile.avatar_error,
        description: err?.message ?? "",
        variant: "destructive",
      });
    } finally {
      URL.revokeObjectURL(localUrl);
      input.value = "";
    }
  }

  if (isLoading || !user) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t.profile.loading}
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
          <h1 className="text-2xl font-bold tracking-tight">{t.profile.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {t.profile.welcome.replace("{name}", "")}<span className="text-foreground font-medium">{user.name}</span>
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
                {(t.profile.role as any)[user.role] ?? user.role}
              </Badge>
              <KycStatusBadge status={user.kycStatus} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profile">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex-wrap mx-auto">
            <TabsTrigger value="profile" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <UserIcon className="h-3.5 w-3.5" /> {t.profile.tabs.profile}
            </TabsTrigger>
            <TabsTrigger value="social" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" /> {t.profile.tabs.social}
            </TabsTrigger>
            <TabsTrigger value="password" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> {t.profile.tabs.password}
            </TabsTrigger>
            <TabsTrigger value="kyc" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> {t.profile.tabs.kyc}
            </TabsTrigger>
            <TabsTrigger value="bank" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> {t.profile.tabs.bank}
            </TabsTrigger>
            <TabsTrigger value="tax" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> {t.profile.tabs.tax}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="members" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
                <Users2 className="h-3.5 w-3.5" /> {t.profile.tabs.members}
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
                      aria-label={t.profile.avatar_label}
                      className="w-full border-2 border-dashed border-border/60 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {displayAvatar ? (
                        <img src={displayAvatar} alt={t.profile.avatar_uploaded_alt} className="h-24 w-24 mx-auto rounded-lg object-cover" />
                      ) : (
                        <ImagePlus className="h-10 w-10 text-primary/60 mx-auto mb-2" />
                      )}
                      <p className="text-sm font-medium mt-2">{t.profile.avatar_upload}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{t.profile.avatar_click_drag}</p>
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center mt-2">
                      {t.profile.avatar_allowed}
                    </p>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif" className="hidden" onChange={handleAvatarPick} />
                  </CardContent>
                </Card>

                <Card className="card-surface no-lift border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">{t.profile.dsp_title}</CardTitle>
                    <CardDescription className="text-xs">{t.profile.dsp_desc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <DspInput icon={<Music className="h-3.5 w-3.5 text-rose-400" />} label="Apple Music ID" value={appleId} onChange={setAppleId} placeholder={t.profile.dsp_placeholder_apple} />
                    <DspInput icon={<Music className="h-3.5 w-3.5 text-emerald-400" />} label="Spotify ID" value={spotifyId} onChange={setSpotifyId} placeholder={t.profile.dsp_placeholder_spotify} />
                    <DspInput icon={<Apple className="h-3.5 w-3.5 text-amber-400" />} label="Yandex Music ID" value={yandexId} onChange={setYandexId} placeholder={t.profile.dsp_placeholder_yandex} />
                    <DspInput icon={<Youtube className="h-3.5 w-3.5 text-red-400" />} label="YouTube Topic ID" value={youtubeId} onChange={setYoutubeId} placeholder={t.profile.dsp_placeholder_youtube} />
                    <Button size="sm" className="w-full mt-1" onClick={handleSaveDsp} disabled={savingDsp}>
                      {savingDsp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.profile.dsp_save}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Your details */}
              <Card className="card-surface no-lift border-border/60">
                <CardHeader>
                  <CardTitle>{t.profile.details_title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t.profile.first_name}>
                      <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="bg-background/50" />
                    </Field>
                    <Field label={t.profile.last_name}>
                      <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="bg-background/50" />
                    </Field>
                    <Field label="Email">
                      <Input type="email" value={user.email} disabled className="bg-background/50" />
                    </Field>
                    <Field label={t.profile.phone}>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-background/50" />
                    </Field>
                  </div>

                  <Field label={t.profile.address}>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t.profile.address_placeholder} className="bg-background/50" />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t.profile.country}>
                      <Select value={country || undefined} onValueChange={setCountry}>
                        <SelectTrigger className="bg-background/50"><SelectValue placeholder={t.profile.country_placeholder} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tj">🇹🇯 Таджикистан</SelectItem>
                          <SelectItem value="ru">🇷🇺 Россия</SelectItem>
                          <SelectItem value="uz">🇺🇿 Узбекистан</SelectItem>
                          <SelectItem value="kz">🇰🇿 Казахстан</SelectItem>
                          <SelectItem value="es">🇪🇸 Испания</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t.profile.region}>
                      <Input value={region} onChange={(e) => setRegion(e.target.value)} className="bg-background/50" />
                    </Field>
                    <Field label={t.profile.city}>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-background/50" />
                    </Field>
                    <Field label={t.profile.zip}>
                      <Input value={zip} onChange={(e) => setZip(e.target.value)} className="bg-background/50" />
                    </Field>
                  </div>

                  <Field label={t.profile.account_type}>
                    <Input value={(t.profile.role as any)[user.role] ?? user.role} disabled className="bg-background/50" />
                  </Field>

                  <Field label={t.profile.about}>
                    <textarea
                      value={about}
                      onChange={(e) => setAbout(e.target.value)}
                      placeholder={t.profile.about_placeholder}
                      className="w-full min-h-[110px] px-3 py-2 text-sm rounded-md bg-background/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                  </Field>

                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveProfile} disabled={savingProfile}>
                      {savingProfile ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> {t.profile.saving}</> : t.profile.save}
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
                <CardTitle>{t.profile.social_title}</CardTitle>
                <CardDescription>{t.profile.social_desc}</CardDescription>
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
                    {savingSocial ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> {t.profile.saving}</> : t.profile.save}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============== PASSWORD TAB ============== */}
          <TabsContent value="password" className="mt-6">
            <Card className="card-surface no-lift border-border/60 max-w-3xl mx-auto">
              <CardHeader>
                <CardTitle>{t.profile.password_title}</CardTitle>
                <CardDescription>
                  {t.profile.password_desc}{" "}
                  <a href="#" className="text-primary underline-offset-2 hover:underline">{t.profile.password_support_link}</a>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Email">
                  <Input value={user.email} disabled className="bg-background/50" />
                </Field>
                <Field label={t.profile.current_password}>
                  <PwdInput value={curPwd} onChange={setCurPwd} show={showCur} onToggle={() => setShowCur(!showCur)} />
                </Field>
                <Field label={t.profile.new_password}>
                  <PwdInput value={newPwd} onChange={setNewPwd} show={showNew} onToggle={() => setShowNew(!showNew)} />
                  <p className="text-[11px] text-muted-foreground mt-1">{t.profile.password_hint}</p>
                </Field>
                <Field label={t.profile.confirm_password}>
                  <PwdInput value={confirmPwd} onChange={setConfirmPwd} show={showCfm} onToggle={() => setShowCfm(!showCfm)} />
                </Field>
                <div className="flex justify-end pt-2">
                  <Button onClick={handleChangePassword} disabled={savingPwd}>
                    {savingPwd ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> {t.profile.saving}</> : t.profile.save}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============== KYC TAB (Task #6) ============== */}
          <TabsContent value="kyc" className="mt-6">
            <KycTab />
          </TabsContent>

          {/* ============== BANK TAB (Task #6) ============== */}
          <TabsContent value="bank" className="mt-6">
            <BankTab />
          </TabsContent>

          {/* ============== TAX TAB (Task #6) ============== */}
          <TabsContent value="tax" className="mt-6">
            <TaxTab />
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
  const { t } = useLang();
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
        setError(e?.message ?? t.profile.members_load_error);
      }
    })();
  }, []);

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t.profile.members_title}</CardTitle>
          <CardDescription>{t.profile.members_desc}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && <div className="p-4 text-sm text-rose-400">{error}</div>}
        {!members && !error && (
          <div className="p-6 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.profile.members_loading}
          </div>
        )}
        {members && (
          <Table>
            <TableHeader className="bg-background/30">
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.profile.members_col_name}</TableHead>
                <TableHead>{t.profile.members_col_email}</TableHead>
                <TableHead>{t.profile.members_col_role}</TableHead>
                <TableHead>{t.profile.members_col_last_login}</TableHead>
                <TableHead>{t.profile.members_col_status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m: any) => {
                const initials = String(m.name ?? "").split(/\s+/).map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
                const last = m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : "—";
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
                    <TableCell className="text-xs">{(t.profile.role as any)[m.role] ?? m.role}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{last}</TableCell>
                    <TableCell>
                      {m.status === "active"   && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">{t.profile.member_status_active}</Badge>}
                      {m.status === "suspended" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">{t.profile.member_status_suspended}</Badge>}
                      {m.status === "inactive"  && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">{t.profile.member_status_inactive}</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {members.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">{t.profile.members_empty}</TableCell></TableRow>
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

// ─── KYC status badge — compact badge for hero ──────────────────────────────
function KycStatusBadge({ status }: { status: "not_started" | "pending" | "approved" | "rejected" }) {
  const { t } = useLang();
  if (status === "approved") {
    return (
      <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/30 gap-1">
        <ShieldCheck className="h-3 w-3" /> {t.profile.kyc_badge_approved}
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/30 gap-1">
        <ShieldQuestion className="h-3 w-3" /> {t.profile.kyc_badge_pending}
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/30 gap-1">
        <ShieldAlert className="h-3 w-3" /> {t.profile.kyc_badge_rejected}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border gap-1">
      <ShieldQuestion className="h-3 w-3" /> {t.profile.kyc_not_passed}
    </Badge>
  );
}

const KYC_KIND_KEYS = ["passport", "id_card", "company_reg", "tax_certificate", "bank_statement", "other"] as const;
const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];
const MAX_BYTES = 25 * 1024 * 1024;

interface KycDoc {
  id: number;
  kind: string;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  uploadedAt: string;
}

function KycTab() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const { t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs]       = useState<KycDoc[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind]       = useState<string>("passport");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyDelId, setBusyDelId]   = useState<number | null>(null);

  function kycKindLabel(k: string): string {
    const map: Record<string, string> = {
      passport: t.profile.kyc_kind_passport,
      id_card: t.profile.kyc_kind_id_card,
      company_reg: t.profile.kyc_kind_company_reg,
      tax_certificate: t.profile.kyc_kind_tax_certificate,
      bank_statement: t.profile.kyc_kind_bank_statement,
      other: t.profile.kyc_kind_other,
    };
    return map[k] ?? k;
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/users/me/kyc-documents", { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDocs(j.data ?? []);
    } catch (err: any) {
      toast({ title: t.profile.kyc_load_error, description: err.message, variant: "destructive" });
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function handleUpload(file: File) {
    if (!ALLOWED_MIME.includes(file.type)) {
      toast({ title: t.profile.kyc_invalid_format, description: t.profile.kyc_invalid_format_desc, variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: t.profile.kyc_too_large, description: t.profile.kyc_too_large_desc, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      const res = await fetch("/api/users/me/kyc-documents", {
        method: "POST", credentials: "same-origin", body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: t.profile.kyc_uploaded });
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err: any) {
      toast({ title: t.profile.kyc_upload_error, description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: number) {
    if (!confirm(t.profile.kyc_delete_confirm)) return;
    setBusyDelId(docId);
    try {
      const res = await fetch(`/api/users/me/kyc-documents/${docId}`, {
        method: "DELETE", credentials: "same-origin",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      toast({ title: t.profile.kyc_deleted });
      await load();
    } catch (err: any) {
      toast({ title: t.profile.kyc_delete_error, description: err.message, variant: "destructive" });
    } finally {
      setBusyDelId(null);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/users/me/submit-kyc", {
        method: "POST", credentials: "same-origin",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: t.profile.kyc_submitted, description: t.profile.kyc_submitted_desc });
      await refresh();
      await load();
    } catch (err: any) {
      toast({ title: t.profile.kyc_submit_error, description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  const pendingDocsCount = (docs ?? []).filter((d) => d.status === "pending").length;
  const canSubmit = user.kycStatus === "not_started" || user.kycStatus === "rejected";
  const isLocked  = user.kycStatus === "pending" || user.kycStatus === "approved";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="card-surface no-lift border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> {t.profile.kyc_title}
          </CardTitle>
          <CardDescription>{t.profile.kyc_desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user.kycStatus === "approved" && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200/90">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{t.profile.kyc_approved_alert}</span>
            </div>
          )}
          {user.kycStatus === "pending" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
              <ShieldQuestion className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{t.profile.kyc_pending_alert}</span>
            </div>
          )}
          {user.kycStatus === "rejected" && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200/90">
              <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{t.profile.kyc_rejected_alert}</span>
            </div>
          )}

          {!isLocked && (
            <div className="rounded-lg border border-dashed border-border/60 p-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-[200px_1fr]">
                <Field label={t.profile.kyc_doc_type}>
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KYC_KIND_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>{kycKindLabel(k)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t.profile.kyc_file_label}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/png,image/jpeg,image/webp,image/heic"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 file:cursor-pointer"
                  />
                </Field>
              </div>
              {uploading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.profile.kyc_uploading}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t.profile.kyc_docs_header}</Label>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.profile.kyc_refresh}
              </Button>
            </div>
            {loading && !docs && <div className="p-6 text-center text-sm text-muted-foreground">{t.profile.kyc_docs_loading}</div>}
            {docs && docs.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border/40 rounded-lg">
                {t.profile.kyc_docs_empty}
              </div>
            )}
            {docs && docs.length > 0 && (
              <div className="space-y-2">
                {docs.map((d) => {
                  const objectId = d.objectPath.split("/").pop();
                  const sizeKb = Math.round(d.sizeBytes / 1024);
                  const statusCls =
                    d.status === "approved" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
                    d.status === "rejected" ? "text-rose-400 border-rose-500/30 bg-rose-500/10" :
                    "text-amber-400 border-amber-500/30 bg-amber-500/10";
                  const statusLabel =
                    d.status === "approved" ? t.profile.kyc_status_approved :
                    d.status === "rejected" ? t.profile.kyc_status_rejected : t.profile.kyc_status_pending;
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-background/40">
                      <div className="flex items-start gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{kycKindLabel(d.kind)}</div>
                          <div className="text-xs text-muted-foreground truncate">{d.originalFilename} · {sizeKb} KB</div>
                          {d.status === "rejected" && d.rejectionReason && (
                            <div className="text-[11px] text-rose-400/80 mt-1">{t.profile.kyc_rejected_reason} {d.rejectionReason}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`text-[10px] ${statusCls}`}>{statusLabel}</Badge>
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/storage/objects/uploads/${objectId}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        {d.status === "pending" && !isLocked && (
                          <Button
                            variant="outline" size="sm"
                            className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                            disabled={busyDelId === d.id}
                            onClick={() => handleDelete(d.id)}
                          >
                            {busyDelId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canSubmit && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
              <p className="text-xs text-muted-foreground">
                {t.profile.kyc_submit_note}
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitting || pendingDocsCount === 0}
              >
                {submitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> {t.profile.kyc_submitting}</> : (
                  <><Upload className="h-3.5 w-3.5 mr-2" /> {t.profile.kyc_submit_btn} ({pendingDocsCount})</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-surface no-lift border-border/60 self-start">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> {t.profile.kyc_req_title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-xs text-muted-foreground">
          <p>{t.profile.kyc_req_for_artist}</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>{t.profile.kyc_req_artist_1}</li>
            <li>{t.profile.kyc_req_artist_2}</li>
          </ul>
          <p className="pt-2">{t.profile.kyc_req_for_label}</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>{t.profile.kyc_req_label_1}</li>
            <li>{t.profile.kyc_req_label_2}</li>
            <li>{t.profile.kyc_req_label_3}</li>
          </ul>
          <p className="pt-3 border-t border-border/40 text-[11px]">
            {t.profile.kyc_privacy}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Bank tab ─────────────────────────────────────────────────────────────
function BankTab() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [bankName, setBankName]       = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [swift, setSwift]             = useState("");
  const [iban, setIban]               = useState("");
  const [holder, setHolder]           = useState("");
  const [country, setCountry]         = useState("");
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!user) return;
    setBankName(user.bankName ?? "");
    setSwift(user.bankSwift ?? "");
    setHolder(user.bankHolderName ?? "");
    setCountry(user.bankCountry ?? "");
    setAccountNumber("");
    setIban("");
  }, [user]);

  const hasExistingAccount = Boolean(user?.bankAccountNumber);
  const hasExistingIban    = Boolean(user?.bankIban);

  const { t } = useLang();

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string | null> = {
        bankName: bankName || null,
        bankSwift: swift || null,
        bankHolderName: holder || null,
        bankCountry: country || null,
      };
      if (accountNumber.trim()) body.bankAccountNumber = accountNumber.trim();
      if (iban.trim())          body.bankIban          = iban.trim();
      const res = await fetch("/api/users/me/bank-info", {
        method: "PATCH", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: t.profile.bank_saved });
      setAccountNumber("");
      setIban("");
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.profile.bank_error;
      toast({ title: t.profile.bank_error, description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  return (
    <Card className="card-surface no-lift border-border/60 max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" /> {t.profile.bank_title}
        </CardTitle>
        <CardDescription>{t.profile.bank_desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t.profile.bank_name_label}>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="bg-background/50" />
          </Field>
          <Field label={t.profile.bank_holder_label}>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} className="bg-background/50" />
          </Field>
          <Field label={t.profile.bank_account_label}>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder={hasExistingAccount ? t.profile.bank_account_placeholder : ""}
              className="bg-background/50 font-mono"
            />
          </Field>
          <Field label={t.profile.bank_iban_label}>
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder={hasExistingIban ? t.profile.bank_iban_placeholder : ""}
              className="bg-background/50 font-mono"
            />
          </Field>
          <Field label={t.profile.bank_swift_label}>
            <Input value={swift} onChange={(e) => setSwift(e.target.value)} className="bg-background/50 font-mono" />
          </Field>
          <Field label={t.profile.bank_country_label}>
            <Select value={country || undefined} onValueChange={setCountry}>
              <SelectTrigger className="bg-background/50"><SelectValue placeholder={t.profile.country_placeholder} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tj">🇹🇯 Таджикистан</SelectItem>
                <SelectItem value="ru">🇷🇺 Россия</SelectItem>
                <SelectItem value="uz">🇺🇿 Узбекистан</SelectItem>
                <SelectItem value="kz">🇰🇿 Казахстан</SelectItem>
                <SelectItem value="kg">🇰🇬 Кыргызстан</SelectItem>
                <SelectItem value="es">🇪🇸 Испания</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> {t.profile.saving}</> : t.profile.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tax tab ──────────────────────────────────────────────────────────────
function TaxTab() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const { t } = useLang();
  const [taxId, setTaxId]           = useState("");
  const [taxCountry, setTaxCountry] = useState("");
  const [taxFormType, setTaxFormType] = useState("");
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (!user) return;
    setTaxId(user.taxId ?? "");
    setTaxCountry(user.taxCountry ?? "");
    setTaxFormType(user.taxFormType ?? "");
  }, [user]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/users/me/tax-info", {
        method: "PATCH", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taxId: taxId || null,
          taxCountry: taxCountry || null,
          taxFormType: taxFormType || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: t.profile.tax_saved });
      await refresh();
    } catch (err: any) {
      toast({ title: t.profile.tax_error, description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  return (
    <Card className="card-surface no-lift border-border/60 max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" /> {t.profile.tax_title}
        </CardTitle>
        <CardDescription>{t.profile.tax_desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t.profile.tax_id_label}>
            <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="bg-background/50 font-mono" />
          </Field>
          <Field label={t.profile.tax_country_label}>
            <Select value={taxCountry || undefined} onValueChange={setTaxCountry}>
              <SelectTrigger className="bg-background/50"><SelectValue placeholder={t.profile.country_placeholder} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tj">🇹🇯 Таджикистан</SelectItem>
                <SelectItem value="ru">🇷🇺 Россия</SelectItem>
                <SelectItem value="uz">🇺🇿 Узбекистан</SelectItem>
                <SelectItem value="kz">🇰🇿 Казахстан</SelectItem>
                <SelectItem value="kg">🇰🇬 Кыргызстан</SelectItem>
                <SelectItem value="es">🇪🇸 Испания</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t.profile.tax_form_label}>
            <Select value={taxFormType || undefined} onValueChange={setTaxFormType}>
              <SelectTrigger className="bg-background/50"><SelectValue placeholder={t.profile.tax_form_placeholder} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="self_employed">{t.profile.tax_form_self_employed}</SelectItem>
                <SelectItem value="individual_entrepreneur">{t.profile.tax_form_ie}</SelectItem>
                <SelectItem value="w8">{t.profile.tax_form_w8}</SelectItem>
                <SelectItem value="w9">{t.profile.tax_form_w9}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> {t.profile.saving}</> : t.profile.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PwdInput({ value, onChange, show, onToggle }: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  const { t } = useLang();
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
        aria-label={show ? t.profile.hide_password : t.profile.show_password}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

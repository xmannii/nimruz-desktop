"use client";

import { SettingsSection } from "@/components/settings/settings-section";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MISSION_STATUSES, SAMPLE_MISSIONS, type Mission, type MissionStatus } from "@/lib/missions/types";
import { ListTodoIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const STATUS_LABELS: Record<MissionStatus, string> = {
  draft: "پیش‌نویس", planning: "در حال برنامه‌ریزی", waiting_for_confirmation: "منتظر تأیید",
  running: "در حال اجرا", waiting_for_approval: "منتظر مجوز", paused: "متوقف",
  blocked: "مسدود", failed: "ناموفق", cancelled: "لغوشده", completed: "تکمیل‌شده",
};

export function MissionsSettingsSection() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Mission | null>(null);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [stepsText, setStepsText] = useState("");

  async function refresh() {
    try { setMissions(await window.desktop.missions.list()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "بارگذاری مأموریت‌ها ناموفق بود."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  function resetDraft() { setTitle(""); setGoal(""); setWorkspacePath(""); setStepsText(""); }
  async function save() {
    if (!title.trim() || !goal.trim()) { toast.error("عنوان و هدف مأموریت الزامی است."); return; }
    setSaving(true);
    try {
      const next = await window.desktop.missions.create({
        title, goal, workspacePath: workspacePath || null,
        steps: stepsText.split(/\r?\n/).map((value) => ({ title: value.trim() })).filter((step) => step.title),
      });
      setMissions(next); setOpen(false); resetDraft(); toast.success("مأموریت به‌صورت پیش‌نویس ساخته شد.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "ساخت مأموریت ناموفق بود."); }
    finally { setSaving(false); }
  }
  async function setStatus(mission: Mission, status: MissionStatus) {
    try { setMissions(await window.desktop.missions.setStatus(mission.id, status)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تغییر وضعیت ناموفق بود."); }
  }
  async function plan(mission: Mission) {
    try { setMissions(await window.desktop.missions.plan(mission.id)); toast.success("برنامه پیشنهادی ساخته شد؛ آن را بررسی کنید."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "ساخت برنامه ناموفق بود."); }
  }
  async function confirmPlan(mission: Mission) {
    try { setMissions(await window.desktop.missions.confirmPlan(mission.id)); toast.success("برنامه مأموریت تأیید شد."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تأیید برنامه ناموفق بود."); }
  }
  async function remove() {
    if (!deleteTarget) return;
    try { setMissions(await window.desktop.missions.delete(deleteTarget.id)); setDeleteTarget(null); toast.success("مأموریت حذف شد."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "حذف مأموریت ناموفق بود."); }
  }
  async function createSample(sample: (typeof SAMPLE_MISSIONS)[number]) {
    try { setMissions(await window.desktop.missions.create(sample)); toast.success(`نمونه «${sample.label}» ساخته شد.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "ساخت نمونه ناموفق بود."); }
  }
  async function start(mission: Mission) {
    try { setMissions(await window.desktop.missions.start(mission.id)); toast.success("مأموریت شروع شد؛ هر مرحله پس از بررسی جلو می‌رود."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "شروع مأموریت ناموفق بود."); }
  }
  async function advance(mission: Mission) {
    try { setMissions(await window.desktop.missions.advance(mission.id)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "پیش‌برد مرحله ناموفق بود."); }
  }

  return <SettingsSection title="مأموریت‌ها" description="کارهای چندمرحله‌ای را به‌صورت محلی ذخیره کنید. این نسخه وضعیت و مراحل را نگه می‌دارد؛ اجرای ابزارها و مجوزها در مرحله بعد اضافه می‌شوند." icon={ListTodoIcon}>
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
        <div><p className="text-sm font-medium">Mission MVP</p><p className="mt-1 text-xs text-muted-foreground">پیشرفت، وضعیت و مراحل مأموریت را قابل مشاهده نگه می‌دارد.</p></div>
        <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setOpen(true)}><PlusIcon className="size-4" /> مأموریت جدید</Button>
      </div>
      <div><p className="mb-2 text-xs font-medium text-muted-foreground">نمونه‌های آماده</p><div className="grid gap-2 sm:grid-cols-3">{SAMPLE_MISSIONS.map((sample) => <Button key={sample.label} variant="outline" className="h-auto justify-start whitespace-normal text-start" onClick={() => void createSample(sample)}><PlusIcon className="me-2 size-3.5 shrink-0" />{sample.label}</Button>)}</div></div>
      {loading ? <div className="flex items-center justify-center p-8 text-sm text-muted-foreground"><Loader2Icon className="me-2 size-4 animate-spin" /> در حال بارگذاری…</div> : missions.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">هنوز مأموریتی ساخته نشده است.</div> : <div className="flex flex-col gap-3">{missions.map((mission) => <MissionCard key={mission.id} mission={mission} onStatus={setStatus} onPlan={plan} onConfirmPlan={confirmPlan} onStart={start} onAdvance={advance} onDelete={() => setDeleteTarget(mission)} />)}</div>}
    </div>
    <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>ساخت مأموریت</AlertDialogTitle><AlertDialogDescription>هدف را مشخص کنید و مراحل پیشنهادی را هرکدام در یک خط بنویسید.</AlertDialogDescription></AlertDialogHeader><div className="grid gap-3"><Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="عنوان، مثلاً گزارش هزینه‌ها" /><Textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="هدف مأموریت چیست؟" /><Input dir="ltr" value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} placeholder="مسیر workspace (اختیاری)" /><Textarea value={stepsText} onChange={(event) => setStepsText(event.target.value)} placeholder="مراحل پیشنهادی، هرکدام در یک خط (اختیاری)" /></div><AlertDialogFooter><AlertDialogCancel disabled={saving}>انصراف</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void save(); }}>{saving ? <Loader2Icon className="me-2 size-4 animate-spin" /> : null}ساخت پیش‌نویس</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(value) => !value && setDeleteTarget(null)}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>حذف مأموریت؟</AlertDialogTitle><AlertDialogDescription>«{deleteTarget?.title}» و مراحل آن حذف می‌شود.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>انصراف</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void remove()}>حذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </SettingsSection>;
}

function MissionCard({ mission, onStatus, onPlan, onConfirmPlan, onStart, onAdvance, onDelete }: { mission: Mission; onStatus: (mission: Mission, status: MissionStatus) => void; onPlan: (mission: Mission) => void; onConfirmPlan: (mission: Mission) => void; onStart: (mission: Mission) => void; onAdvance: (mission: Mission) => void; onDelete: () => void }) {
  const completed = mission.steps.filter((step) => step.status === "completed").length;
  return <div className="rounded-2xl border border-border/70 p-3.5"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{mission.title}</strong><Badge variant={mission.status === "completed" ? "default" : "secondary"}>{STATUS_LABELS[mission.status]}</Badge></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{mission.goal}</p></div><Button variant="ghost" size="icon-sm" aria-label="حذف مأموریت" onClick={onDelete}><Trash2Icon className="size-4" /></Button></div>{mission.steps.length ? <div className="mt-3 space-y-1.5">{mission.steps.map((step) => <div key={step.id} className="flex items-center gap-2 text-xs text-muted-foreground"><span className={step.status === "completed" ? "size-1.5 rounded-full bg-emerald-500" : step.status === "running" ? "size-1.5 rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground/40"} />{step.position + 1}. {step.title} {step.status === "running" ? <span className="text-primary">(در حال اجرا)</span> : null}</div>)}</div> : null}<div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground"><span>{completed}/{mission.steps.length || 0} مرحله تکمیل شده</span>{mission.status === "draft" || mission.status === "planning" ? <Button variant="outline" size="sm" onClick={() => void onPlan(mission)}>ساخت برنامه پیشنهادی</Button> : null}{mission.status === "planning" && mission.steps.length > 0 ? <Button size="sm" onClick={() => void onConfirmPlan(mission)}>تأیید برنامه</Button> : null}{mission.status === "waiting_for_confirmation" ? <Button size="sm" onClick={() => void onStart(mission)}>شروع مأموریت</Button> : null}{mission.status === "running" ? <><Button variant="outline" size="sm" onClick={() => onStatus(mission, "paused")}>توقف موقت</Button><Button variant="outline" size="sm" onClick={() => void onAdvance(mission)}>تکمیل مرحله فعلی</Button></> : null}{mission.status === "paused" ? <Button variant="outline" size="sm" onClick={() => void onStart(mission)}>ادامه</Button> : null}</div></div>;
}

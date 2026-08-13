import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch } from 'wouter';
import {
  ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, ChevronDown, ChevronUp,
  Clock3, Download, KeyRound, Loader2, LockKeyhole, MapPin, Play, RefreshCw, RotateCcw, Search,
  Shield, Sparkles, Square, Terminal, Trophy, Unlock, X, Zap,
} from 'lucide-react';
import {
  getGetAdminSessionQueryKey, getGetResultsSummaryQueryKey, getHealthCheckQueryKey, getListResultsQueryKey,
  useAdminLogin, useGetAdminSession, useGetResultsSummary, useHealthCheck, useListResults, useLogin, useResetPassword, useSaveProgress, useSubmitResult,
} from '@workspace/api-client-react';
import type { GameResultInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const PREVIEW = new URLSearchParams(window.location.search).has('preview');
const ADMIN_TEST = new URLSearchParams(window.location.search).has('adminTest');
const TEST_MODE = PREVIEW || ADMIN_TEST;
const PROGRAMME_START = new Date('2026-10-05T00:00:00');
const WEEK = 7 * 24 * 60 * 60 * 1000;
const KEY_LETTERS = ['U', 'L', 'V', 'N'];
const CHALLENGES = [
  { id: 'c1', short: 'Phishing', title: 'The suspicious message', eyebrow: 'Challenge 1 · Inbox zero', accent: 'cyan' },
  { id: 'c2', short: 'QR Hunt', title: 'Two beacons, one true', eyebrow: 'Challenge 2 · Physical signals', accent: 'violet' },
  { id: 'c3', short: 'Data Class.', title: 'The classified vault room', eyebrow: 'Challenge 3 · Information handling', accent: 'pink' },
  { id: 'c4', short: 'Deepfake', title: 'The face that was not there', eyebrow: 'Challenge 4 · Synthetic media', accent: 'gold' },
] as const;

type ChallengeId = (typeof CHALLENGES)[number]['id'];
type Choice = { text: string; correct: boolean; why: string };
type MultiChoice = { text: string; correct: boolean };
type Progress = { name: string; displayName?: string; score: number; won: number[]; times: Record<string, { start: number; seconds: number | null }>; submitted?: boolean };

const singleChoices: Record<string, Choice[]> = {
  c1q1: [
    { text: 'It looks legitimate — IT often sends warnings like this.', correct: false, why: 'This is a phishing email. Real IT teams do not threaten 24-hour deletion, use lookalike external domains, or ask you not to report a message.' },
    { text: 'It is a phishing email.', correct: true, why: 'External lookalike sender, urgency, a mismatched destination, generic greeting and a suspicious attachment are classic phishing signals.' },
  ],
  c1q3: [
    { text: 'Reply asking whether it is genuine.', correct: false, why: 'Never reply — you confirm your address is live. Report it with the phishing button or to Security, then delete it.' },
    { text: 'Click the link but enter a fake password to test it.', correct: false, why: 'Never interact with the link. The page itself can be malicious. Report it and delete the message.' },
    { text: 'Report it with the phishing button, then delete it.', correct: true, why: 'Exactly. Reporting protects colleagues too — Security can block the sender for everyone.' },
    { text: 'Forward it to colleagues to warn them.', correct: false, why: 'Forwarding spreads the dangerous link. Report it safely so Security can warn everyone.' },
  ],
  c2q1: [
    { text: 'Canteen beacon, 4th floor', correct: false, why: 'This one was the decoy. A poster on a wall is not proof of anything — verify who put it there before you trust it.' },
    { text: 'Deli beacon, 2nd floor', correct: true, why: 'Correct — this is this week’s genuine signal. Still verify the source before scanning anything in the real world.' },
    { text: 'Both — scan them to compare.', correct: false, why: 'Never scan an unverified QR code just to compare. Treat every unconfirmed code as live until its source is checked.' },
    { text: 'Neither — report both to Security first.', correct: false, why: 'That instinct is right in real life. For this challenge, one beacon is the genuine trail.' },
  ],
  c4q1: [
    { text: 'It is a real emergency — comply quickly to protect the company.', correct: false, why: 'Urgency is a classic manipulation tactic. Legitimate IT deployments go through ticketed, scheduled processes — never surprise video calls.' },
    { text: 'This is almost certainly a deepfake video call scam.', correct: true, why: 'Correct. AI can clone someone\'s face and voice in real time. An unscheduled call demanding you install software is a major red flag regardless of who appears on screen.' },
    { text: 'It is suspicious, but probably real since Teams is a secure platform.', correct: false, why: 'The platform is irrelevant — if an attacker compromises an account or spoofs a call, Teams provides no extra protection against what you see on screen.' },
  ],
};

const multiChoices: Record<string, MultiChoice[]> = {
  c1q2: [
    { text: 'Sender domain “microsoft-secure-login.com” does not belong to your company or Microsoft.', correct: true },
    { text: 'Extreme urgency and threats: “deactivated in 24 hours”.', correct: true },
    { text: 'Generic greeting — “Dear Employee” instead of your name.', correct: true },
    { text: 'The link says “Verify” but points to micros0ft-login.com with a zero.', correct: true },
    { text: 'It tells you not to report the message.', correct: true },
    { text: 'The email has a subject line.', correct: false },
    { text: 'It was sent early in the morning.', correct: false },
  ],
  c2q2: [
    { text: 'The QR code is a sticker stuck on top of another poster.', correct: true },
    { text: 'There is no named person or team you can check the poster with.', correct: true },
    { text: 'It urges you to scan “now” or “before it expires”.', correct: true },
    { text: 'After scanning, the page asks for your company username and password.', correct: true },
    { text: 'The poster is printed in your company colours.', correct: false },
    { text: 'It is displayed somewhere staff regularly walk past.', correct: false },
  ],
  c3q2: [
    { text: 'C1 material can be sent by standard company email within the bank.', correct: true },
    { text: 'C2 emails should be clearly labelled “C2”.', correct: true },
    { text: 'C2 data leaving the bank must use the secure external-sharing platform.', correct: true },
    { text: 'C3 material may only leave via encrypted email or secure sharing, never plain email.', correct: true },
    { text: 'It is fine to forward C3 material to your personal email.', correct: false },
    { text: 'A document is C1 as long as it has no classification label.', correct: false },
  ],
  c4q3: [
    { text: 'The call was completely unscheduled — no IT ticket, no prior notice.', correct: true },
    { text: 'Extreme urgency: "install it now or the network will be breached in minutes".', correct: true },
    { text: 'The link goes to an external domain, not an internal IT portal.', correct: true },
    { text: 'Slight visual glitches — edge flickering around the face, unnatural blinking.', correct: true },
    { text: 'The caller knows your first name.', correct: false },
    { text: 'The call came through the official Teams app.', correct: false },
  ],
};

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}
function releaseDate(id: ChallengeId) {
  return new Date(PROGRAMME_START.getTime() + CHALLENGES.findIndex((c) => c.id === id) * WEEK);
}
function isUnlocked(id: ChallengeId) { return TEST_MODE || Date.now() >= releaseDate(id).getTime(); }
function rankFor(score: number) {
  return score >= 90 ? 'Vault Master' : score >= 70 ? 'Master Navigator' : score >= 50 ? 'Deckhand Detective' : 'Cabin Recruit';
}
function readProgress(): Progress {
  try { return JSON.parse(localStorage.getItem('cth_progress') || '') as Progress; } catch { return { name: '', score: 0, won: [], times: {} }; }
}
function writeProgress(progress: Progress) {
  try { localStorage.setItem('cth_progress', JSON.stringify(progress)); } catch { /* local storage is optional */ }
}
function createAdminTestProgress(): Progress {
  return { name: 'organizer-test', displayName: 'Organizer test run', score: 0, won: [], times: {} };
}
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode('cth_v1:' + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function Brand({ admin = false }: { admin?: boolean }) {
  return <div className="flex items-center gap-3">
    <div className="grid size-10 place-items-center rounded-xl bg-[hsl(var(--foreground))] text-[hsl(var(--primary))] shadow-lg"><Terminal size={20} /></div>
    <div><div className="display text-base font-bold tracking-tight">Cyber <span className="text-[hsl(var(--secondary))]">Treasure Hunt</span></div><div className="mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">{admin ? 'Organizer console' : 'Security awareness expedition'}</div></div>
  </div>;
}

function TopBar({ progress, onReset, admin = false }: { progress?: Progress; onReset?: () => void; admin?: boolean }) {
  return <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-8">
    <Brand admin={admin} />
    {admin && <Link href="/?adminTest=1" className="btn-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold" data-testid="link-test-hunt"><Play size={14} /> Test the hunt</Link>}
    {progress && <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><div className="mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Operator</div><div className="text-sm font-bold">{progress.name || 'Unassigned'}</div></div><div className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-white/70 px-3 py-1.5"><Zap size={15} className="text-[hsl(43_96%_50%)]" /><b className="mono text-sm">{progress.score}</b><span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">/100</span></div>{onReset && <button type="button" onClick={onReset} className="btn-quiet rounded-xl p-2" aria-label="Reset progress" data-testid="button-reset-progress"><RotateCcw size={16} /></button>}</div>}
  </header>;
}

function ChallengeMap({ progress, current, onPick }: { progress: Progress; current: string; onPick: (id: ChallengeId) => void }) {
  return <div className="soft-card relative overflow-hidden rounded-3xl p-5 md:p-7">
    <div className="mb-4 flex items-center justify-between"><div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">Mission route</div><h2 className="display text-xl font-bold">The four-key protocol</h2></div><div className="mono text-xs text-[hsl(var(--muted-foreground))]">{progress.won.length}/4 keys secured</div></div>
    <div className="relative h-28 overflow-hidden rounded-2xl bg-[hsl(229_42%_11%)] p-3">
      <div className="scan-bar opacity-20" />
      <svg viewBox="0 0 800 150" className="h-full w-full" role="img" aria-label="Four challenge mission map">
        <path d="M50 88 C175 22 270 130 400 72 C530 22 660 130 750 58" fill="none" stroke="hsl(229 24% 28%)" strokeWidth="3" className="map-line" />
        <path d="M50 88 C175 22 270 130 400 72 C530 22 660 130 750 58" fill="none" stroke="hsl(187 78% 42%)" strokeWidth="4" strokeDasharray="100" strokeDashoffset={100 - (progress.won.length * 25)} />
        {CHALLENGES.map((challenge, i) => {
          const won = progress.won.includes(i); const available = isUnlocked(challenge.id) && (i === 0 || progress.won.includes(i - 1));
          const x = [50, 280, 510, 750][i]; const y = [88, 88, 60, 58][i];
          return <g key={challenge.id} onClick={() => available && onPick(challenge.id)} className={available ? 'cursor-pointer' : ''}>
            <circle cx={x} cy={y} r="19" fill={won ? 'hsl(43 96% 55%)' : available ? 'hsl(187 78% 42%)' : 'hsl(229 24% 28%)'} stroke="hsl(220 28% 95% / .7)" strokeWidth="2" />
            <text x={x} y={y + 5} textAnchor="middle" fontFamily="DM Mono" fontSize="13" fill={won || available ? 'hsl(229 42% 9%)' : 'hsl(223 16% 66%)'}>{won ? '✓' : i + 1}</text>
            <text x={x} y={y + 40} textAnchor="middle" fontFamily="DM Mono" fontSize="11" fill="hsl(220 28% 95%)">{available ? challenge.short : `WEEK ${i + 1}`}</text>
          </g>;
        })}
      </svg>
    </div>
    {PREVIEW && <div className="mt-4 flex items-center gap-2 rounded-xl bg-[hsl(var(--secondary)/.1)] px-3 py-2 text-xs text-[hsl(var(--secondary))]"><Sparkles size={14} /> Preview mode is live — weekly gates are bypassed for testing.</div>}
  </div>;
}

function SingleQuestion({ id, title, choices, points, onCorrect, completed, setCompleted }: { id: string; title: string; choices: Choice[]; points: number; onCorrect: (points: number) => void; completed: boolean; setCompleted: (v: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  if (completed && picked === null) return <div className="rounded-2xl border border-[hsl(153_59%_44%/.3)] bg-[hsl(153_59%_44%/.08)] p-4 text-sm text-[hsl(153_59%_28%)]"><CheckCircle2 className="mb-2" size={18} /><b>{title}</b><div className="mt-1">Answer locked in. Continue to the next signal.</div></div>;
  return <div className="space-y-3"><h3 className="display text-lg font-bold">{title}</h3>{choices.map((choice, i) => <button type="button" disabled={picked !== null} key={choice.text} onClick={() => { setPicked(i); setCompleted(true); if (choice.correct) onCorrect(points); }} className={`option-card flex w-full items-start gap-3 rounded-2xl p-4 text-left text-sm leading-6 ${picked === i ? (choice.correct ? 'correct' : 'wrong') : ''} ${picked !== null && choice.correct ? 'correct' : ''}`} data-testid={`button-answer-${id}-${i}`}><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-current text-[10px]">{picked === i ? (choice.correct ? <Check size={13} /> : <X size={13} />) : String.fromCharCode(65 + i)}</span><span>{choice.text}</span></button>)}{picked !== null && <div className={`rounded-xl p-4 text-sm ${choices[picked].correct ? 'bg-[hsl(153_59%_44%/.1)] text-[hsl(153_59%_28%)]' : 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]'}`}><b>{choices[picked].correct ? `Correct · +${points} points` : 'Not quite'}</b><p className="mt-1">{choices[picked].why}</p></div>}</div>;
}

function MultiQuestion({ id, title, choices, onEarn, completed, setCompleted }: { id: string; title: string; choices: MultiChoice[]; onEarn: (points: number) => void; completed: boolean; setCompleted: (v: boolean) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<number | null>(null);
  const earned = result == null ? 0 : Math.round((result / choices.length) * 10);
  return <div className="space-y-3"><div className="flex items-end justify-between gap-3"><h3 className="display text-lg font-bold">{title}</h3><span className="mono shrink-0 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Select all</span></div>{choices.map((choice, i) => <button type="button" disabled={completed} key={choice.text} onClick={() => setSelected((old) => old.includes(i) ? old.filter((x) => x !== i) : [...old, i])} className={`option-card flex w-full items-start gap-3 rounded-2xl p-4 text-left text-sm leading-6 ${selected.includes(i) && result === null ? 'selected' : ''} ${result !== null && (choice.correct ? 'correct' : selected.includes(i) ? 'wrong' : '')}`} data-testid={`button-multiselect-${id}-${i}`}><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${selected.includes(i) ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-current'}`}>{selected.includes(i) && <Check size={13} />}</span><span>{choice.text}</span></button>)}{result === null ? <button type="button" disabled={!selected.length || completed} onClick={() => { const exact = choices.filter((c, i) => c.correct === selected.includes(i)).length; const points = Math.round((exact / choices.length) * 10); setResult(exact); setCompleted(true); onEarn(points); }} className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold" data-testid={`button-check-${id}`}>Check my answers <ArrowRight size={15} /></button> : <div className={`rounded-xl p-4 text-sm ${earned >= 8 ? 'bg-[hsl(153_59%_44%/.1)] text-[hsl(153_59%_28%)]' : 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]'}`}><b>{earned} / 10 points</b><p className="mt-1">The real indicators are the specific signals that break trust: urgency, tampering, missing ownership, mismatched destinations and pressure to act.</p></div>}</div>;
}

function Timer({ seconds, running }: { seconds: number; running: boolean }) {
  return <div className={`mono inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${running ? 'border-[hsl(var(--primary)/.4)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}><Clock3 size={14} /> {formatDuration(seconds)}</div>;
}

function ChallengeScreen({ challenge, progress, setProgress, onClaim, onBack }: { challenge: ChallengeId; progress: Progress; setProgress: (p: Progress) => void; onClaim: () => void; onBack: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const i = CHALLENGES.findIndex((c) => c.id === challenge);
  const meta = CHALLENGES[i];
  const timer = progress.times[challenge];
  const completedKeys = useMemo(() => challenge === 'c1' ? ['c1q1', 'c1q2', 'c1q3'] : challenge === 'c2' ? ['c2q1', 'c2q2'] : challenge === 'c3' ? ['c3q1', 'c3q2', 'c3q3', 'c3q4'] : ['c4q1', 'c4q2', 'c4q3'], [challenge]);
  useEffect(() => { if (progress.won.includes(i)) setAnswers(Object.fromEntries(completedKeys.map((key) => [key, true]))); }, [i, progress.won, completedKeys]);
  useEffect(() => { const tick = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(tick); }, []);
  const seconds = timer?.seconds ?? (timer ? Math.round((now - timer.start) / 1000) : 0);
  const add = (points: number) => { const next = { ...progress, score: Math.min(100, progress.score + points) }; setProgress(next); };
  const done = (key: string) => setAnswers((old) => ({ ...old, [key]: true }));
  const allDone = challenge === 'c1' ? answers.c1q1 && answers.c1q2 && answers.c1q3 : challenge === 'c2' ? answers.c2q1 && answers.c2q2 : challenge === 'c3' ? answers.c3q1 && answers.c3q2 && answers.c3q3 && answers.c3q4 : answers.c4q1 && answers.c4q2 && answers.c4q3;
  const claim = () => { if (!progress.won.includes(i)) setProgress({ ...progress, won: [...progress.won, i], times: { ...progress.times, [challenge]: { ...(timer || { start: Date.now() }), seconds } } }); onClaim(); };
  return <div className="screen-enter mx-auto w-full max-w-6xl px-5 pb-16 md:px-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><button type="button" onClick={onBack} className="btn-quiet inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm" data-testid="button-back-map"><ArrowLeft size={15} /> Mission map</button><Timer seconds={seconds} running={!progress.won.includes(i)} /></div>
    <div className="soft-card challenge-panel overflow-hidden rounded-3xl p-6 md:p-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-6"><div><div className="mono mb-2 text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">{meta.eyebrow}</div><h1 className="display max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">{meta.title}</h1></div><div className="key-pill grid size-16 place-items-center rounded-2xl"><span className="mono text-xs text-[hsl(var(--muted-foreground))]">KEY</span><span className="display text-2xl font-bold">{KEY_LETTERS[i]}</span></div></div>
      {challenge === 'c1' && <ChallengeOne answers={answers} done={done} add={add} />}
      {challenge === 'c2' && <ChallengeTwo answers={answers} done={done} add={add} />}
      {challenge === 'c3' && <ChallengeThree answers={answers} done={done} add={add} />}
      {challenge === 'c4' && <ChallengeFour answers={answers} done={done} add={add} />}
      {allDone && <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[hsl(43_96%_55%/.45)] bg-[hsl(43_96%_55%/.09)] p-5"><div><div className="mono text-[10px] uppercase tracking-[.18em] text-[hsl(43_70%_35%)]">Signal secured</div><p className="mt-1 text-sm">Key {KEY_LETTERS[i]} is ready to claim. Your field time: <b>{formatDuration(seconds)}</b>.</p></div><button type="button" onClick={claim} className="btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold" data-testid={`button-claim-key-${i}`}>Claim key {KEY_LETTERS[i]} <ArrowRight size={16} /></button></div>}
    </div>
  </div>;
}

function ChallengeOne({ answers, done, add }: { answers: Record<string, boolean>; done: (k: string) => void; add: (n: number) => void }) {
  return <div className="space-y-8"><div className="rounded-2xl bg-[hsl(229_42%_11%)] p-5 text-sm text-[hsl(220_28%_95%)]"><div className="mono mb-3 text-[10px] uppercase tracking-[.2em] text-[hsl(187_78%_62%)]">Intercepted email · 08:42</div><p><b>From:</b> IT Support &lt;help@microsoft-secure-login.com&gt;</p><p><b>Subject:</b> Action required — account will be deactivated in 24 hours</p><p className="mt-3 text-[hsl(223_16%_76%)]">Dear Employee, verify your account immediately to avoid losing access. Do not report this message.</p></div><SingleQuestion id="c1q1" title="Q1 · Is this email legitimate or phishing?" choices={singleChoices.c1q1} points={10} onCorrect={add} completed={!!answers.c1q1} setCompleted={() => done('c1q1')} /><MultiQuestion id="c1q2" title="Q2 · Which phishing indicators can you spot?" choices={multiChoices.c1q2} onEarn={add} completed={!!answers.c1q2} setCompleted={() => done('c1q2')} /><SingleQuestion id="c1q3" title="Q3 · What is the right thing to do?" choices={singleChoices.c1q3} points={5} onCorrect={add} completed={!!answers.c1q3} setCompleted={() => done('c1q3')} /></div>;
}

function ChallengeTwo({ answers, done, add }: { answers: Record<string, boolean>; done: (k: string) => void; add: (n: number) => void }) {
  return <div className="space-y-8"><div className="grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.07)] p-5"><MapPin size={18} className="mb-3 text-[hsl(var(--secondary))]" /><div className="mono text-[10px] uppercase tracking-[.15em]">Beacon · Canteen</div><p className="mt-2 text-sm">4th floor, by the canteen. A polished poster with a QR sticker layered over an older notice.</p></div><div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--primary)/.07)] p-5"><MapPin size={18} className="mb-3 text-[hsl(var(--primary))]" /><div className="mono text-[10px] uppercase tracking-[.15em]">Beacon · Deli</div><p className="mt-2 text-sm">2nd floor, by the deli. Find the poster, preview where it leads, and verify its owner.</p></div></div><div className="rounded-2xl border border-[hsl(var(--border))] p-4 text-sm"><b>Before you scan:</b> a poster in the building is not automatically trustworthy. Confirm who placed it and what destination it shows.</div><SingleQuestion id="c2q1" title="Q1 · Which beacon carries the genuine trail?" choices={singleChoices.c2q1} points={15} onCorrect={add} completed={!!answers.c2q1} setCompleted={() => done('c2q1')} /><MultiQuestion id="c2q2" title="Q2 · Which signals make a QR poster risky?" choices={multiChoices.c2q2} onEarn={add} completed={!!answers.c2q2} setCompleted={() => done('c2q2')} /></div>;
}

function ChallengeThree({ answers, done, add }: { answers: Record<string, boolean>; done: (k: string) => void; add: (n: number) => void }) {
  const classify = (id: string, title: string, choices: Choice[]) => <SingleQuestion id={id} title={title} choices={choices} points={5} onCorrect={add} completed={!!answers[id]} setCompleted={() => done(id)} />;
  return <div className="space-y-8"><div className="rounded-2xl bg-[hsl(229_42%_11%)] p-5 text-sm text-[hsl(220_28%_95%)]"><div className="mono mb-3 text-[10px] uppercase tracking-[.2em] text-[hsl(334_86%_76%)]">Classification terminal · Three files waiting</div><p className="text-[hsl(223_16%_76%)]">Use C1 for internal, low-sensitivity information; C2 for confidential client material; C3 for non-public, market-sensitive information.</p></div>{classify('c3q1', 'Q1 · A bank-wide markets newsletter with no client or deal detail is…', [{ text: 'C3 — Strictly Confidential', correct: false, why: 'No client or deal detail and broadly public material make this C1.' }, { text: 'C2 — Confidential', correct: false, why: 'There is no client-identifiable data here, so it does not need C2 handling.' }, { text: 'C1 — Internal', correct: true, why: 'Correct. Bank-wide, low-sensitivity material is C1.' }])}{classify('c3q3', 'Q2 · A named client’s holdings and valuation report is…', [{ text: 'C2 — Confidential', correct: true, why: 'Correct. Named client and performance data are sensitive, but not necessarily market-moving.' }, { text: 'C3 — Strictly Confidential', correct: false, why: 'C3 is for the most sensitive market-moving material, such as a live deal.' }, { text: 'C1 — Internal', correct: false, why: 'Client-identifiable data needs more protection than C1.' }])}{classify('c3q4', 'Q3 · An undisclosed live acquisition known to five people is…', [{ text: 'C1 — Internal', correct: false, why: 'An undisclosed live acquisition is far beyond C1.' }, { text: 'C3 — Strictly Confidential', correct: true, why: 'Correct. Live, non-public, market-sensitive deal information is exactly what C3 protects.' }, { text: 'C2 — Confidential', correct: false, why: 'This is more than routine confidential client data — it is market-sensitive.' }])}<MultiQuestion id="c3q2" title="Q4 · Which handling statements are correct?" choices={multiChoices.c3q2} onEarn={add} completed={!!answers.c3q2} setCompleted={() => done('c3q2')} /></div>;
}

const DEEPFAKE_SCRIPT =
  'Hi, this is David Chen, IT Security Director. Listen carefully — ' +
  'we have a critical zero-day vulnerability actively hitting endpoints right now, and yours is flagged. ' +
  'I need you to click the link I just sent in the chat and run that patch immediately. ' +
  "Don't log a ticket — we simply don't have time. " +
  "This thing is spreading fast. You've got maybe ten minutes before it reaches the network core. " +
  'Just install it and message me the moment it finishes. Do it now, please.';

function ChallengeFour({ answers, done, add }: { answers: Record<string, boolean>; done: (k: string) => void; add: (n: number) => void }) {
  const [callTime, setCallTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [glitchVisible, setGlitchVisible] = useState(false);
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Call timer
  useEffect(() => {
    const t = setInterval(() => setCallTime((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Cleanup speech on unmount
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  // Face-edge glitch — fires more often while playing
  useEffect(() => {
    let cancelled = false;
    const flicker = () => {
      if (cancelled) return;
      setGlitchVisible(true);
      setTimeout(() => setGlitchVisible(false), 100 + Math.random() * 160);
    };
    const schedule = () => {
      if (cancelled) return;
      const delay = isPlaying ? 1500 + Math.random() * 2500 : 5000 + Math.random() * 7000;
      setTimeout(() => { flicker(); schedule(); }, delay);
    };
    schedule();
    return () => { cancelled = true; };
  }, [isPlaying]);

  const toggleVideo = () => {
    if (!window.speechSynthesis) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    const utt = new SpeechSynthesisUtterance(DEEPFAKE_SCRIPT);
    utt.rate = 0.92;
    utt.pitch = 0.97;
    utt.onend = () => { setIsPlaying(false); };
    utt.onerror = () => { setIsPlaying(false); };
    uttRef.current = utt;
    setIsPlaying(true);
    setHasPlayed(true);
    window.speechSynthesis.speak(utt);
  };

  const mins = String(Math.floor(callTime / 60)).padStart(2, '0');
  const secs = String(callTime % 60).padStart(2, '0');
  const waveHeights = [4, 8, 14, 20, 26, 30, 22, 16, 28, 18, 10, 24, 32, 20, 14, 28, 22, 12, 18, 26, 16, 8, 20, 28, 14, 10, 24, 6];

  return (
    <div className="space-y-8">
      {/* Mock Teams video call */}
      <div className="relative overflow-hidden rounded-2xl bg-[hsl(229_42%_8%)] text-[hsl(220_28%_95%)]">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[hsl(229_42%_12%)]">
          <div className="flex items-center gap-2">
            <div className="grid size-5 place-items-center rounded bg-[hsl(230_80%_55%)]"><span className="text-[9px] font-bold text-white">T</span></div>
            <span className="mono text-[10px] text-[hsl(220_28%_70%)]">Microsoft Teams</span>
          </div>
          <div className="mono flex items-center gap-2 text-[10px] text-[hsl(334_86%_76%)]">
            <span className="inline-block size-1.5 rounded-full bg-[hsl(334_86%_65%)] animate-pulse" />
            {mins}:{secs}
          </div>
        </div>

        {/* Video area */}
        <div className="relative flex flex-col items-center justify-center gap-4 bg-[hsl(229_42%_6%)] py-8" style={{ minHeight: 260 }}>

          {/* Caller avatar */}
          <div className="relative flex flex-col items-center gap-3">
            <div className="relative">
              <div
                className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-[hsl(229_42%_22%)] to-[hsl(229_42%_14%)]"
                style={{
                  boxShadow: isPlaying
                    ? '0 0 0 3px hsl(230 80% 60% / 0.8), 0 0 18px hsl(230 80% 55% / 0.4)'
                    : '0 0 0 2px hsl(230 80% 55% / 0.3)',
                  transition: 'box-shadow 0.2s',
                }}
              >
                <span className="text-4xl select-none">👤</span>
              </div>
              {/* Glitch edge artefact */}
              {glitchVisible && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{ boxShadow: '0 0 0 3px hsl(334 86% 65% / 0.75), 2px -2px 0 2px hsl(195 100% 60% / 0.4)', filter: 'blur(0.5px)' }}
                />
              )}
              <span className="mono absolute -bottom-1 -right-1 rounded bg-[hsl(229_42%_20%)] px-1 py-0.5 text-[8px] text-[hsl(220_28%_60%)]">HD</span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5">
                <div className="text-sm font-semibold">David Chen</div>
                {isPlaying && <span className="inline-block size-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse" />}
              </div>
              <div className="mono text-[10px] text-[hsl(220_28%_60%)]">IT Security Director</div>
            </div>
          </div>

          {/* Voice waveform — visible while playing */}
          <div className={`flex h-7 items-end gap-[3px] transition-opacity duration-300 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}>
            {waveHeights.map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-sm bg-[hsl(var(--primary))]"
                style={{
                  height: `${h}px`,
                  animation: isPlaying ? `waveBar 0.${6 + (i % 5)}s ease-in-out ${(i * 0.04).toFixed(2)}s infinite alternate` : 'none',
                }}
              />
            ))}
          </div>

          {/* Play/stop button overlay */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
              isPlaying
                ? 'bg-[hsl(334_86%_55%)] text-white'
                : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
            }`}
            data-testid="button-play-video"
          >
            {isPlaying
              ? <><Square size={13} fill="currentColor" /> Stop</>
              : <><Play size={14} fill="currentColor" /> {hasPlayed ? 'Replay video' : 'Play video'}</>}
          </button>

          {!hasPlayed && (
            <p className="mono text-[10px] text-[hsl(220_28%_45%)]">Press play to hear the call</p>
          )}

          {/* Small "you" pip */}
          <div className="absolute bottom-3 right-3 flex size-14 items-center justify-center rounded-lg bg-[hsl(229_42%_18%)] ring-1 ring-[hsl(220_28%_30%)]">
            <span className="text-xl select-none">🧑‍💻</span>
          </div>
        </div>

        {/* In-call chat */}
        <div className="border-t border-[hsl(220_28%_15%)] p-4 space-y-3">
          <div className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(43_96%_65%)]">Chat · In this call</div>
          <div className="rounded-xl bg-[hsl(229_42%_14%)] p-3 text-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="mono text-[10px] font-bold text-[hsl(230_80%_70%)]">David Chen</span>
              <span className="mono text-[9px] text-[hsl(220_28%_45%)]">just now</span>
            </div>
            <p className="text-[hsl(220_28%_85%)] leading-6">Hey, we've detected a critical vulnerability on endpoints like yours. I need you to install this emergency patch <span className="font-mono text-[hsl(334_86%_76%)] underline cursor-pointer">it-emergency-patch.exe (secure-corp-tools.net)</span> right now — we have maybe 10 minutes before this spreads.</p>
          </div>
          <div className="rounded-xl bg-[hsl(229_42%_14%)] p-3 text-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="mono text-[10px] font-bold text-[hsl(230_80%_70%)]">David Chen</span>
              <span className="mono text-[9px] text-[hsl(220_28%_45%)]">just now</span>
            </div>
            <p className="text-[hsl(220_28%_85%)] leading-6">Don't log a ticket, there's no time. Just click the link and run it. I'm watching your screen now to confirm.</p>
          </div>
        </div>

        {/* Hint bar */}
        <div className="border-t border-[hsl(220_28%_15%)] px-4 py-2.5 flex items-center gap-2">
          <span className="inline-block size-1.5 rounded-full bg-[hsl(43_96%_55%)]" />
          <span className="mono text-[10px] text-[hsl(220_28%_50%)]">Play the video and listen carefully — something is not right.</span>
        </div>
      </div>

      <SingleQuestion id="c4q1" title="Q1 · You receive this unscheduled Teams call from someone who looks and sounds like your IT Security Director. What is most likely happening?" choices={singleChoices.c4q1} points={5} onCorrect={add} completed={!!answers.c4q1} setCompleted={() => done('c4q1')} />
      <SingleQuestion id="c4q2" title="Q2 · What should you do right now?" choices={[
        { text: 'Click the link and install the patch — he looks and sounds real.', correct: false, why: 'Looking and sounding real is exactly what a deepfake is designed to achieve. Never install software based on an unscheduled call alone.' },
        { text: 'End the call and contact David Chen directly using his known number or by walking to his desk.', correct: true, why: 'Correct. Hanging up and verifying through a completely separate channel is the only safe move. A real emergency would still survive a 60-second verification call.' },
        { text: 'Reply in the Teams chat to ask if the link is safe.', correct: false, why: 'If the account is compromised, the attacker controls the chat too. Same channel, same threat.' },
        { text: 'Ask a colleague sitting nearby whether they have heard of this vulnerability.', correct: false, why: 'A colleague cannot verify the call. End it and contact IT through a known, trusted route.' },
      ]} points={10} onCorrect={add} completed={!!answers.c4q2} setCompleted={() => done('c4q2')} />
      <MultiQuestion id="c4q3" title="Q3 · Which details in this call should raise your suspicion?" choices={multiChoices.c4q3} onEarn={add} completed={!!answers.c4q3} setCompleted={() => done('c4q3')} />
    </div>
  );
}

function LockedScreen({ challenge, onBack }: { challenge: ChallengeId; onBack: () => void }) {
  const meta = CHALLENGES.find((c) => c.id === challenge)!; const date = releaseDate(challenge); const days = Math.max(1, Math.ceil((date.getTime() - Date.now()) / 86400000));
  return <div className="screen-enter mx-auto w-full max-w-2xl px-5 pb-16 md:px-8"><div className="soft-card rounded-3xl p-8 text-center md:p-12"><div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><LockKeyhole size={27} /></div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">{meta.eyebrow}</div><h1 className="display mt-3 text-3xl font-bold">Signal scheduled</h1><p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[hsl(var(--muted-foreground))]">This part of the map opens next week. New missions release one at a time so the whole crew has something fresh to solve.</p><div className="mono mt-7 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/.1)] px-4 py-2 text-xs text-[hsl(var(--primary))]"><Clock3 size={14} /> Unlocks {date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · {days} day{days === 1 ? '' : 's'}</div><div className="mt-8"><button type="button" onClick={onBack} className="btn-quiet inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" data-testid="button-return-locked"><ArrowLeft size={15} /> Return to map</button></div></div></div>;
}

function Finale({ progress, setProgress, onReset, passwordHash, testMode = false }: { progress: Progress; setProgress: (p: Progress) => void; onReset: () => void; passwordHash: string; testMode?: boolean }) {
  const [code, setCode] = useState('');
  const [opened, setOpened] = useState(progress.submitted || false);
  const [error, setError] = useState('');
  const submit = useSubmitResult();
  const qc = useQueryClient();
  const times = [0, 1, 2, 3].map((i) => progress.times[`c${i + 1}`]?.seconds ?? null);
  const total = times.every((x) => x != null) ? times.reduce((a, x) => a + (x || 0), 0) : null;
  const next = { ...progress, submitted: true };
  const label = progress.displayName || progress.name;
  const payload: GameResultInput = {
    playerName: progress.name.trim().toLowerCase(),
    passwordHash,
    firstName: label.split(' ')[0] || label,
    lastName: label.split(' ').slice(1).join(' ') || '—',
    score: progress.score,
    rank: rankFor(progress.score),
    timeC1: times[0],
    timeC2: times[1],
    timeC3: times[2],
    timeC4: times[3],
    totalTime: total,
    isTest: TEST_MODE,
  };
  const syncResult = () => {
    if (testMode) return;
    submit.mutate({ data: payload }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListResultsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetResultsSummaryQueryKey() });
      },
    });
  };
  const unlock = () => {
    if (opened || (!testMode && submit.isPending)) return;
    if (code.trim().toUpperCase() !== 'RISK') {
      setError('Not quite. Shift U-L-V-N three places backward.');
      return;
    }
    setError('');
    // Open the vault immediately. Result sync is separate so a slow API cannot
    // make a correct answer look broken; the completed view offers a retry.
    setProgress(next);
    setOpened(true);
    syncResult();
  };

  return (
    <div className="screen-enter mx-auto w-full max-w-4xl px-5 pb-16 md:px-8">
      <div className="soft-card rounded-3xl p-7 text-center md:p-12">
        {!opened ? (
          <>
            <div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">🔑 Four keys collected ✨</div>
            <h1 className="display mt-3 text-4xl font-bold md:text-5xl">One last lock <span aria-hidden="true">🔐</span></h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[hsl(var(--muted-foreground))]">The letters are encrypted. A Caesar cipher shifted each letter three places forward. Reverse the shift and open the vault.</p>
            <div className="my-9 flex justify-center gap-2 md:gap-3">{KEY_LETTERS.map((key) => <div key={key} className="key-pill grid size-16 place-items-center rounded-2xl md:size-20"><span className="display text-3xl font-bold">{key}</span></div>)}</div>
            <div className="mx-auto max-w-xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] p-5 text-left text-sm leading-7"><b className="display">🧩 Cipher note</b><br />U → T → S → <b>R</b>. Apply the same three-step backward move to every key. The answer is a word every good security operator keeps top of mind.</div>
            <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && unlock()} maxLength={10} placeholder="TYPE THE WORD" className="mono rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3 text-center text-lg tracking-[.3em] outline-none focus:border-[hsl(var(--primary))]" aria-label="Deciphered word" data-testid="input-vault-code" />
               <button type="button" onClick={unlock} disabled={!testMode && submit.isPending} className="btn-secondary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold" data-testid="button-unlock-vault"><Unlock size={16} /> {!testMode && submit.isPending ? 'Saving result…' : 'Unlock the vault 🔓'}</button>
              {error && <div className="rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(var(--destructive))]" role="alert">{error}</div>}
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-[hsl(43_96%_55%/.18)] text-[hsl(43_70%_35%)]"><Trophy size={29} /></div>
            <div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(43_70%_35%)]">🎉 Expedition complete 🎉</div>
            <h1 className="display mt-3 text-4xl font-bold">The vault opens ✨</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[hsl(var(--muted-foreground))]">Four keys turned, one cipher cracked, four safer habits learned. The real treasure is knowing when to slow down and verify.</p>
            <div className="my-8 flex justify-center gap-2 md:gap-3">{'RISK'.split('').map((key) => <div key={key} className="key-pill won grid size-16 place-items-center rounded-2xl md:size-20"><span className="display text-3xl font-bold">{key}</span></div>)}</div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[hsl(var(--primary)/.1)] p-5"><div className="display text-4xl font-bold text-[hsl(var(--primary))]">{progress.score}</div><div className="mono mt-1 text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">⭐ Points earned</div></div><div className="rounded-2xl bg-[hsl(var(--secondary)/.1)] p-5"><div className="display text-2xl font-bold text-[hsl(var(--secondary))]">{rankFor(progress.score)}</div><div className="mono mt-2 text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">🏆 Field rank</div></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-left md:grid-cols-5">{times.map((time, i) => <div key={i} className="rounded-xl border border-[hsl(var(--border))] p-3"><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">C{i + 1}</div><b className="mono text-sm">{formatDuration(time)}</b></div>)}<div className="rounded-xl border border-[hsl(var(--border))] p-3"><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">TOTAL</div><b className="mono text-sm">{formatDuration(total)}</b></div></div>
             {testMode ? <p className="mt-5 text-sm text-[hsl(var(--secondary))]">🧪 Admin test run only — no player progress or leaderboard result was saved.</p> : submit.isPending && <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">⏳ Syncing your result to the team leaderboard…</p>}
             {!testMode && submit.isError && <div className="mt-5 rounded-xl bg-[hsl(var(--destructive)/.1)] p-4 text-sm text-[hsl(var(--destructive))]"><p>✅ Vault opened, but the result could not sync yet.</p><button type="button" onClick={syncResult} className="mt-3 underline decoration-dotted underline-offset-4" data-testid="button-retry-result-sync">Try syncing again</button></div>}
             {!testMode && !submit.isPending && !submit.isError && <p className="mt-5 text-sm text-[hsl(153_59%_28%)]">✅ Result synced to the team leaderboard.</p>}
            <button type="button" onClick={onReset} className="btn-quiet mt-8 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" data-testid="button-play-again"><RotateCcw size={15} /> Play again</button>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerPage() {
  const adminSession = useGetAdminSession({ query: { enabled: ADMIN_TEST, queryKey: getGetAdminSessionQueryKey(), retry: false } });
  const [progress, setProgress] = useState<Progress>(() => ADMIN_TEST ? createAdminTestProgress() : readProgress());
  const [name, setName] = useState(() => ADMIN_TEST ? 'organizer-test' : readProgress().name || '');
  const [started, setStarted] = useState(false);
  const [screen, setScreen] = useState<string>('map');
  const [locked, setLocked] = useState<ChallengeId | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const loginMutation = useLogin();
  const resetMutation = useResetPassword();
  const saveProgress = useSaveProgress();
  const prevWonLen = useRef(progress.won.length);
  const passwordHashRef = useRef('');

  useEffect(() => {
    if (ADMIN_TEST && adminSession.data?.authenticated) {
      setStarted(true);
      setScreen('map');
    }
  }, [adminSession.data]);

  const update = useCallback((next: Progress) => { setProgress(next); if (!ADMIN_TEST) writeProgress(next); }, []);

  const syncToServer = useCallback((p: Progress) => {
    if (ADMIN_TEST) return;
    if (!p.name || !passwordHashRef.current) return;
    saveProgress.mutate({
      name: p.name.trim().toLowerCase(),
      data: { name: p.name, passwordHash: passwordHashRef.current, score: p.score, won: p.won, times: p.times as Record<string, { start: number; seconds: number | null }>, submitted: p.submitted ?? false },
    });
  }, []); // eslint-disable-line

  // Auto-save whenever a key is claimed or the finale is submitted
  useEffect(() => {
    if (ADMIN_TEST) return;
    if (!started || !progress.name) return;
    if (progress.won.length > prevWonLen.current || progress.submitted) {
      prevWonLen.current = progress.won.length;
      syncToServer(progress);
    }
  }, [progress.won.length, progress.submitted]); // eslint-disable-line

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const username = name.trim().toLowerCase();
    const fullName = displayName.trim();
    const pwd = password.trim();
    if (!username || !fullName || !pwd) return;
    setLoadingProfile(true);
    setLoginError('');
    try {
      const hash = await hashPassword(pwd);
      passwordHashRef.current = hash;
      const result = await loginMutation.mutateAsync({ data: { name: username, displayName: fullName, passwordHash: hash } });
      const restored: Progress = {
        name: username,
        displayName: result.displayName || fullName,
        score: result.score,
        won: result.won as number[],
        times: result.times as Progress['times'],
        submitted: result.submitted,
      };
      update(restored);
      prevWonLen.current = restored.won.length;
      setWelcomeBack(!result.isNew && (restored.won.length > 0 || !!restored.submitted));
      setStarted(true);
      setScreen(restored.submitted ? 'finale' : 'map');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) {
        setLoginError('Incorrect password. Please try again.');
      } else {
        setLoginError('Could not connect. Check your connection and try again.');
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  const doResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.trim().length < 4) { setResetError('Password must be at least 4 characters.'); return; }
    if (newPassword.trim() !== confirmPassword.trim()) { setResetError('Passwords do not match.'); return; }
    setResetLoading(true);
    setResetError('');
    try {
      const hash = await hashPassword(newPassword.trim());
      await resetMutation.mutateAsync({ data: { name: resetUsername.trim().toLowerCase(), newPasswordHash: hash } });
      setResetSuccess(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        setResetError('No account found with that username. Check the spelling and try again.');
      } else {
        setResetError('Could not connect. Check your connection and try again.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const reset = () => {
    if (ADMIN_TEST) {
      window.location.assign('/admin');
      return;
    }
    localStorage.removeItem('cth_progress'); setProgress({ name: '', score: 0, won: [], times: {} }); setName(''); setDisplayName(''); setPassword(''); setStarted(false); setScreen('map'); setLocked(null); setWelcomeBack(false); setLoginError(''); setForgotMode(false); setResetUsername(''); setNewPassword(''); setConfirmPassword(''); setResetError(''); setResetSuccess(false); prevWonLen.current = 0;
  };
  const pick = (id: ChallengeId) => { const i = CHALLENGES.findIndex((c) => c.id === id); if (!isUnlocked(id) || (i > 0 && !progress.won.includes(i - 1))) { setLocked(id); setScreen('locked'); return; } const next = progress.times[id] ? progress : { ...progress, times: { ...progress.times, [id]: { start: Date.now(), seconds: null } } }; update(next); setScreen(id); };

  if (ADMIN_TEST && adminSession.isPending) return <div className="mission-app"><div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5"><div className="soft-card w-full max-w-md rounded-3xl p-8 text-center"><Loader2 size={25} className="mx-auto mb-4 animate-spin text-[hsl(var(--primary))]" /><h1 className="display text-2xl font-bold">Verifying organizer access</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Checking your admin session before opening the test hunt.</p></div></div></div>;
  if (ADMIN_TEST && adminSession.isError) return <div className="mission-app"><div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5"><div className="soft-card w-full max-w-md rounded-3xl p-8 text-center"><LockKeyhole size={25} className="mx-auto mb-4 text-[hsl(var(--destructive))]" /><h1 className="display text-2xl font-bold">Admin access required</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Sign in as an organizer first, then use the test-hunt button from the dashboard.</p><Link href="/admin" className="btn-secondary mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"><ArrowLeft size={15} /> Go to organizer access</Link></div></div></div>;
  if (ADMIN_TEST && !started) return <div className="mission-app"><div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5"><div className="soft-card w-full max-w-md rounded-3xl p-8 text-center"><Loader2 size={25} className="mx-auto mb-4 animate-spin text-[hsl(var(--primary))]" /><h1 className="display text-2xl font-bold">Opening the test hunt</h1></div></div></div>;

  if (!started) return (
    <div className="mission-app">
      <TopBar />
      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-90px)] w-full max-w-6xl items-center px-5 pb-16 md:px-8">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
          <div className="screen-enter">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/.35)] bg-[hsl(var(--primary)/.08)] px-3 py-1.5 mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]"><Shield size={13} /> Team security mission · 4 weeks</div>
            <h1 className="display max-w-3xl text-5xl font-bold leading-[.96] tracking-[-.05em] md:text-7xl">Think sharp.<br /><span className="text-[hsl(var(--secondary))]">Stay curious.</span><br />Crack the vault.</h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-[hsl(var(--muted-foreground))]">A short, story-driven cyber-awareness expedition for teams. Spot the signal, learn the habit, earn the key — then beat the cipher.</p>
            <div className="mt-8 flex flex-wrap gap-4 text-sm text-[hsl(var(--muted-foreground))]"><span className="inline-flex items-center gap-2"><Clock3 size={16} className="text-[hsl(var(--primary))]" /> 10–15 min</span><span className="inline-flex items-center gap-2"><Zap size={16} className="text-[hsl(43_96%_50%)]" /> 100 points</span><span className="inline-flex items-center gap-2"><Trophy size={16} className="text-[hsl(var(--secondary))]" /> Team leaderboard</span></div>
          </div>
          <div className="soft-card screen-enter rounded-3xl p-7 md:p-9">
            {!forgotMode ? (
              <form onSubmit={start}>
                <div className="mb-7 flex items-center justify-between"><div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">Create or sign in</div><h2 className="display mt-1 text-2xl font-bold">Your mission profile</h2></div><div className="grid size-12 place-items-center rounded-2xl bg-[hsl(var(--foreground))] text-[hsl(var(--primary))]"><KeyRound size={20} /></div></div>
                <label className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]" htmlFor="player-display-name">Full name</label>
                <input id="player-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Alex Morgan" className="mt-2 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3.5 outline-none transition focus:border-[hsl(var(--primary))]" data-testid="input-player-display-name" required disabled={loadingProfile} autoComplete="name" />
                <label className="mono mt-4 block text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]" htmlFor="player-name">Username</label>
                <input id="player-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. alex.morgan" className="mt-2 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3.5 outline-none transition focus:border-[hsl(var(--primary))]" data-testid="input-player-name" required disabled={loadingProfile} autoComplete="username" />
                <label className="mono mt-4 block text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]" htmlFor="player-password">Password</label>
                <input id="player-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Choose or enter your password" className="mt-2 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3.5 outline-none transition focus:border-[hsl(var(--primary))]" data-testid="input-player-password" required disabled={loadingProfile} autoComplete="current-password" minLength={4} />
                {loginError && <div className="mt-3 rounded-xl bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm text-[hsl(var(--destructive))]" role="alert">{loginError}</div>}
                <button type="submit" disabled={loadingProfile} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold" data-testid="button-start-hunt">
                  {loadingProfile ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : <>Start the hunt <ArrowRight size={17} /></>}
                </button>
                 <div className="mt-4 flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
                  <span>New? Enter any password to create a profile.</span>
                  <button type="button" onClick={() => { setForgotMode(true); setLoginError(''); setResetUsername(name); }} className="underline decoration-dotted underline-offset-4 hover:text-[hsl(var(--foreground))]">Forgot password?</button>
                </div>
                 <div className="mt-5 border-t border-[hsl(var(--border))] pt-4 text-center">
                   <Link href="/admin" className="mono inline-flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))] underline decoration-dotted underline-offset-4 hover:text-[hsl(var(--foreground))]" data-testid="link-admin-login">Organizer / admin login <ArrowRight size={12} /></Link>
                 </div>
              </form>
            ) : (
              <form onSubmit={doResetPassword}>
                <div className="mb-7 flex items-center justify-between"><div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">Account recovery</div><h2 className="display mt-1 text-2xl font-bold">Reset your password</h2></div><div className="grid size-12 place-items-center rounded-2xl bg-[hsl(var(--foreground))] text-[hsl(var(--primary))]"><KeyRound size={20} /></div></div>
                {resetSuccess ? (
                  <div className="rounded-2xl bg-[hsl(var(--primary)/.08)] border border-[hsl(var(--primary)/.3)] px-5 py-6 text-center">
                    <CheckCircle2 size={28} className="mx-auto mb-3 text-[hsl(var(--primary))]" />
                    <p className="font-bold">Password reset!</p>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">You can now sign in with your new password.</p>
                    <button type="button" onClick={() => { setForgotMode(false); setResetSuccess(false); setNewPassword(''); setConfirmPassword(''); setResetUsername(''); }} className="btn-primary mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold">Back to sign in <ArrowRight size={16} /></button>
                  </div>
                ) : (
                  <>
                    <label className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]" htmlFor="reset-username">Username</label>
                    <input id="reset-username" value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} placeholder="e.g. alex.morgan" className="mt-2 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3.5 outline-none transition focus:border-[hsl(var(--primary))]" data-testid="input-reset-username" required disabled={resetLoading} autoComplete="username" />
                    <label className="mono mt-4 block text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]" htmlFor="reset-new-password">New password</label>
                    <input id="reset-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Choose a new password" className="mt-2 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3.5 outline-none transition focus:border-[hsl(var(--primary))]" data-testid="input-reset-new-password" required disabled={resetLoading} autoComplete="new-password" minLength={4} />
                    <label className="mono mt-4 block text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]" htmlFor="reset-confirm-password">Confirm new password</label>
                    <input id="reset-confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your new password" className="mt-2 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3.5 outline-none transition focus:border-[hsl(var(--primary))]" data-testid="input-reset-confirm-password" required disabled={resetLoading} autoComplete="new-password" minLength={4} />
                    {resetError && <div className="mt-3 rounded-xl bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm text-[hsl(var(--destructive))]" role="alert">{resetError}</div>}
                    <button type="submit" disabled={resetLoading} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold" data-testid="button-reset-password">
                      {resetLoading ? <><Loader2 size={16} className="animate-spin" /> Resetting…</> : <>Reset password <ArrowRight size={17} /></>}
                    </button>
                    <div className="mt-4 text-center">
                      <button type="button" onClick={() => { setForgotMode(false); setResetError(''); }} className="text-xs text-[hsl(var(--muted-foreground))] underline decoration-dotted underline-offset-4 hover:text-[hsl(var(--foreground))]"><ArrowLeft size={12} className="mr-1 inline" />Back to sign in</button>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );

  return (
    <div className="mission-app">
      <TopBar progress={progress} onReset={reset} />
      <main className="relative z-10">
        {ADMIN_TEST && <div className="mx-auto mb-6 flex w-full max-w-6xl items-center justify-between gap-3 px-5 md:px-8"><div className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--secondary)/.35)] bg-[hsl(var(--secondary)/.1)] px-4 py-3 text-sm text-[hsl(var(--secondary))]"><Sparkles size={16} /><span><b>Admin test mode</b> · This run is isolated and will not change player data or the leaderboard.</span></div><button type="button" onClick={reset} className="btn-quiet shrink-0 rounded-xl px-3 py-2 text-sm" data-testid="button-exit-admin-test">Exit test</button></div>}
        {screen === 'map' && (
          <div className="screen-enter mx-auto w-full max-w-6xl px-5 pb-16 md:px-8">
            {welcomeBack && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[hsl(43_96%_55%/.35)] bg-[hsl(43_96%_55%/.09)] px-5 py-3.5">
                <Trophy size={16} className="shrink-0 text-[hsl(43_70%_40%)]" />
                <p className="text-sm"><b>Welcome back, {(progress.displayName || progress.name).split(' ')[0]}!</b> Your progress has been restored — {progress.won.length} of 4 keys secured.</p>
                <button type="button" onClick={() => setWelcomeBack(false)} className="ml-auto shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><X size={15} /></button>
              </div>
            )}
            <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_300px]"><div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Mission control / active</div><h1 className="display mt-2 text-4xl font-bold tracking-tight md:text-6xl">Choose your next signal.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[hsl(var(--muted-foreground))]">Every challenge is a real-world habit disguised as a field operation. Clear one to reveal the next.</p></div><div className="soft-card rounded-2xl p-5"><div className="mono text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Current status</div><div className="mt-2 flex items-end justify-between"><b className="display text-3xl">{progress.score}<span className="text-base text-[hsl(var(--muted-foreground))]"> pts</span></b><span className="mono text-xs text-[hsl(var(--primary))]">{progress.won.length === 4 ? 'VAULT READY' : 'IN PROGRESS'}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${progress.won.length * 25}%` }} /></div></div></div>
            <ChallengeMap progress={progress} current={screen} onPick={pick} />
            <div className="mt-7 grid gap-3 md:grid-cols-2">{CHALLENGES.map((c, i) => { const open = isUnlocked(c.id) && (i === 0 || progress.won.includes(i - 1)); const won = progress.won.includes(i); return <button key={c.id} type="button" onClick={() => pick(c.id)} className={`soft-card group flex items-center justify-between rounded-2xl p-5 text-left ${!open ? 'opacity-70' : ''}`} data-testid={`button-open-${c.id}`}><span className="flex items-center gap-4"><span className={`grid size-10 place-items-center rounded-xl ${won ? 'bg-[hsl(43_96%_55%)] text-[hsl(229_42%_9%)]' : open ? 'bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{won ? <Check size={18} /> : open ? <Zap size={18} /> : <LockKeyhole size={17} />}</span><span><span className="mono block text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">0{i + 1} · {open ? c.short : `Releases ${releaseDate(c.id).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</span><b className="display mt-1 block">{c.title}</b></span></span><ArrowRight size={17} className="text-[hsl(var(--muted-foreground))] transition group-hover:translate-x-1" /></button>; })}</div>
            {progress.won.length === 4 && <button type="button" onClick={() => setScreen('finale')} className="btn-secondary mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-bold" data-testid="button-open-finale"><Unlock size={17} /> All keys secured — open the vault</button>}
          </div>
        )}
        {['c1', 'c2', 'c3', 'c4'].includes(screen) && <ChallengeScreen challenge={screen as ChallengeId} progress={progress} setProgress={update} onClaim={() => setScreen('map')} onBack={() => setScreen('map')} />}
        {screen === 'locked' && locked && <LockedScreen challenge={locked} onBack={() => setScreen('map')} />}
        {screen === 'finale' && <Finale progress={progress} setProgress={update} onReset={reset} passwordHash={passwordHashRef.current} testMode={ADMIN_TEST} />}
      </main>
      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 pb-8 md:px-8"><span className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">CTH // build 04</span><Link href="/admin" className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))] underline decoration-dotted underline-offset-4" data-testid="link-admin">Organizer access</Link></footer>
    </div>
  );
}

type SortKey = 'score' | 'name' | 'rank' | 'totalTime' | 'createdAt';
function AdminPage() {
  const [unlocked, setUnlocked] = useState(false); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [search, setSearch] = useState(''); const [showTest, setShowTest] = useState(true); const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' });
  const adminLogin = useAdminLogin();
  const results = useListResults({ query: { enabled: unlocked, queryKey: getListResultsQueryKey(), refetchInterval: 5000, refetchOnMount: 'always', refetchOnWindowFocus: true } }); const summary = useGetResultsSummary({ query: { enabled: unlocked, queryKey: getGetResultsSummaryQueryKey(), refetchInterval: 5000, refetchOnMount: 'always', refetchOnWindowFocus: true } }); const health = useHealthCheck({ query: { enabled: unlocked, queryKey: getHealthCheckQueryKey(), refetchInterval: 30000, refetchOnMount: 'always' } });
  const rows = useMemo(() => { const data = (results.data || []).filter((r) => showTest || !r.isTest).filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(search.toLowerCase())); return data.sort((a, b) => { const av = sort.key === 'name' ? `${a.firstName} ${a.lastName}` : a[sort.key]; const bv = sort.key === 'name' ? `${b.firstName} ${b.lastName}` : b[sort.key]; if (av == null) return 1; if (bv == null) return -1; if (av < bv) return sort.dir === 'asc' ? -1 : 1; if (av > bv) return sort.dir === 'asc' ? 1 : -1; return 0; }); }, [results.data, search, showTest, sort]);
  const podium = useMemo(() => [...(results.data || []).filter((r) => showTest || !r.isTest)].sort((a, b) => b.score - a.score || (a.totalTime || Infinity) - (b.totalTime || Infinity)).slice(0, 3), [results.data, showTest]);
  const unlock = async (e: FormEvent) => { e.preventDefault(); setError(''); try { await adminLogin.mutateAsync({ data: { username, password } }); setUnlocked(true); setPassword(''); } catch { setError('Incorrect admin username or password.'); } };
  const refresh = () => { void results.refetch(); void summary.refetch(); };
  const sortBy = (key: SortKey) => setSort((old) => ({ key, dir: old.key === key && old.dir === 'desc' ? 'asc' : 'desc' }));
  const exportExcel = () => { const escape = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); const lines = ['#\tName\tScore\tRank\tCh.1 (s)\tCh.2 (s)\tCh.3 (s)\tCh.4 (s)\tTotal time (s)\tCompleted', ...rows.map((r, i) => [i + 1, `${r.firstName} ${r.lastName}`, r.score, r.rank, r.timeC1, r.timeC2, r.timeC3, r.timeC4, r.totalTime, r.createdAt].map(escape).join('\t'))]; const blob = new Blob([lines.join('\n')], { type: 'application/vnd.ms-excel' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cyber-treasure-hunt-results.xls'; a.click(); URL.revokeObjectURL(a.href); };
   if (!unlocked) return <div className="mission-app"><div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5"><form onSubmit={unlock} className="soft-card w-full max-w-md rounded-3xl p-8 text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[hsl(var(--foreground))] text-[hsl(var(--primary))]"><LockKeyhole size={24} /></div><Brand admin /><h1 className="display mt-8 text-2xl font-bold">Organizer access</h1><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Admins sign in with their organizer username and password. No player profile or full name is required.</p><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Admin username" autoComplete="username" required className="mt-6 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3 outline-none focus:border-[hsl(var(--primary))]" data-testid="input-admin-username" /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" autoComplete="current-password" required className="mt-3 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3 outline-none focus:border-[hsl(var(--primary))]" data-testid="input-admin-password" /><button type="submit" disabled={adminLogin.isPending} className="btn-secondary mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold" data-testid="button-unlock-admin">{adminLogin.isPending ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : <><Unlock size={16} /> Open dashboard</>}</button>{error && <p className="mt-3 text-sm text-[hsl(var(--destructive))]" role="alert">{error}</p>}<Link href="/" className="mt-6 inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] underline decoration-dotted underline-offset-4" data-testid="link-back-hunt"><ArrowLeft size={13} /> Back to the hunt</Link></form></div></div>;
  const metric = summary.data; return <div className="mission-app"><TopBar admin /><main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-16 md:px-8"><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Organizer console / live</div><h1 className="display mt-2 text-4xl font-bold tracking-tight md:text-5xl">Leaderboard control room.</h1><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Competition ranking: highest score first, fastest total time breaks ties.</p></div><div className="flex flex-wrap gap-2"><Link href="/" className="btn-quiet inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" data-testid="link-back-player"><ArrowLeft size={15} /> Back to hunt</Link><button type="button" onClick={refresh} disabled={results.isFetching} className="btn-quiet inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" data-testid="button-refresh-results"><RefreshCw size={15} className={results.isFetching ? 'animate-spin' : ''} /> Refresh</button><button type="button" onClick={exportExcel} className="btn-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold" data-testid="button-export-results"><Download size={15} /> Export Excel</button></div></div><div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Participants', metric?.participantCount ?? '—'], ['Average score', metric ? Math.round(metric.averageScore) : '—'], ['Top score', metric?.topScore ?? '—'], ['Average time', formatDuration(metric?.averageTime)], ['Fastest', formatDuration(metric?.fastestTime)]].map(([label, value]) => <div key={String(label)} className="soft-card rounded-2xl p-4"><div className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">{label}</div><div className="display mt-2 text-2xl font-bold text-[hsl(var(--secondary))]">{value}</div></div>)}</div>{podium.length > 0 && <div className="mb-6 grid gap-3 md:grid-cols-3">{podium.map((r, i) => <div key={r.id} className={`soft-card rounded-2xl p-5 text-center ${i === 0 ? 'border-[hsl(43_96%_55%)] md:-translate-y-2' : ''}`}><div className="mono text-xs text-[hsl(var(--muted-foreground))]">RANK 0{i + 1}</div><div className="mx-auto my-3 grid size-12 place-items-center rounded-2xl bg-[hsl(var(--muted))]"><Trophy size={21} className={i === 0 ? 'text-[hsl(43_96%_50%)]' : 'text-[hsl(var(--secondary))]'} /></div><b className="display block">{r.firstName} {r.lastName}</b><span className="mono text-sm text-[hsl(var(--primary))]">{r.score} pts</span><div className="mono mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{formatDuration(r.totalTime)}</div></div>)}</div>}<div className="mb-4 flex flex-wrap items-center gap-3"><div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by participant name" className="w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-search-results" /></div><label className="inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} data-testid="checkbox-show-test" /> Show test runs</label><span className="mono text-xs text-[hsl(var(--muted-foreground))]">{rows.length} shown · API {health.data?.status === 'ok' ? 'connected' : health.isLoading ? 'checking' : 'offline'}</span></div><div className="soft-card overflow-hidden rounded-2xl"><div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-sm"><thead className="bg-[hsl(var(--muted)/.6)]"><tr>{[['score', 'Score'], ['name', 'Name'], ['rank', 'Rank'], ['timeC1', 'Ch.1'], ['timeC2', 'Ch.2'], ['timeC3', 'Ch.3'], ['timeC4', 'Ch.4'], ['totalTime', 'Total'], ['createdAt', 'Completed']].map(([key, label]) => <th key={key} className="cursor-pointer px-4 py-3 text-left mono text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]" onClick={() => sortBy(key as SortKey)}><span className="inline-flex items-center gap-1">{label}{sort.key === key && (sort.dir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />)}</span></th>)}</tr></thead><tbody>{results.isLoading ? [1, 2, 3].map((x) => <tr key={x} className="animate-pulse border-t border-[hsl(var(--border))]"><td colSpan={9} className="px-4 py-5"><div className="h-4 rounded bg-[hsl(var(--muted))]" /></td></tr>) : rows.map((r) => <tr key={r.id} className="border-t border-[hsl(var(--border))] transition hover:bg-[hsl(var(--primary)/.04)]"><td className="px-4 py-3 mono font-bold text-[hsl(var(--primary))]">{r.score}</td><td className="px-4 py-3 font-bold">{r.firstName} {r.lastName}{r.isTest && <span className="ml-2 rounded-full bg-[hsl(var(--accent)/.18)] px-2 py-0.5 mono text-[9px] text-[hsl(var(--accent))]">TEST</span>}</td><td className="px-4 py-3"><span className="rounded-full bg-[hsl(var(--secondary)/.1)] px-2 py-1 text-xs text-[hsl(var(--secondary))]">{r.rank}</span></td><td className="px-4 py-3 mono text-xs">{formatDuration(r.timeC1)}</td><td className="px-4 py-3 mono text-xs">{formatDuration(r.timeC2)}</td><td className="px-4 py-3 mono text-xs">{formatDuration(r.timeC3)}</td><td className="px-4 py-3 mono text-xs">{formatDuration(r.timeC4)}</td><td className="px-4 py-3 mono text-xs font-bold">{formatDuration(r.totalTime)}</td><td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td></tr>)}</tbody></table>{!results.isLoading && !rows.length && <div className="p-12 text-center"><BarChart3 className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" size={28} /><p className="display font-bold">{results.isError ? 'Could not load results.' : 'No matching participants yet.'}</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{results.isError ? 'Refresh to try the API again.' : 'Completed hunts will appear here.'}</p></div>}</div></div></main></div>;
}

function Router() { return <ErrorBoundary resetKey={window.location.pathname}><Switch><Route path="/" component={PlayerPage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;
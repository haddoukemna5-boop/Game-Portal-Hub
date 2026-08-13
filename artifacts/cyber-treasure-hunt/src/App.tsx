import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch } from 'wouter';
import {
  ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, ChevronDown, ChevronUp,
  Clock3, Download, KeyRound, Loader2, LockKeyhole, MapPin, Play, RefreshCw, RotateCcw, Search,
  Shield, Sparkles, Square, Terminal, Trophy, Unlock, X, Zap,
} from 'lucide-react';
import {
  getGetResultsSummaryQueryKey, getHealthCheckQueryKey, getListResultsQueryKey,
  useGetResultsSummary, useHealthCheck, useListResults, useLogin, useSaveProgress, useSubmitResult,
} from '@workspace/api-client-react';
import type { GameResultInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const PREVIEW = new URLSearchParams(window.location.search).has('preview');
const PROGRAMME_START = new Date('2026-10-05T00:00:00');
const WEEK = 7 * 24 * 60 * 60 * 1000;
const KEY_LETTERS = ['U', 'L', 'V', 'N'];
const CHALLENGES = [
  { id: 'c1', short: 'Phishing', title: 'The suspicious message', eyebrow: 'Challenge 1 · Inbox zero', accent: 'cyan' },
  { id: 'c2', short: 'QR Hunt', title: 'Two beacons, one true', eyebrow: 'Challenge 2 · Physical signals', accent: 'violet' },
  { id: 'c3', short: 'Data Class.', title: 'The classified vault room', eyebrow: 'Challenge 3 · Information handling', accent: 'pink' },
  { id: 'c4', short: 'Deepfake', title: 'The voice that was not there', eyebrow: 'Challenge 4 · Synthetic media', accent: 'gold' },
] as const;

type ChallengeId = (typeof CHALLENGES)[number]['id'];
type Choice = { text: string; correct: boolean; why: string };
type MultiChoice = { text: string; correct: boolean };
type Progress = { name: string; score: number; won: number[]; times: Record<string, { start: number; seconds: number | null }>; submitted?: boolean };

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
    { text: 'It is real — that really is a senior spokesperson.', correct: false, why: 'A familiar-sounding voice proves nothing. Subtle pacing artefacts and the lack of official corroboration are the real tells.' },
    { text: 'It is a deepfake — an AI-generated fabrication.', correct: true, why: 'Correct. The recording is fabricated, and no acquisition appears in any official channel.' },
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
    { text: 'Subtle unnatural pacing, tone or audio artefacts.', correct: true },
    { text: 'No matching announcement exists in official press releases or verified channels.', correct: true },
    { text: 'It arrived through an unverifiable unofficial route.', correct: true },
    { text: 'There is pressure to share or react before anyone official confirms it.', correct: true },
    { text: 'The file is an MP3 rather than another audio format.', correct: false },
    { text: 'The recording is fairly short.', correct: false },
  ],
};

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}
function releaseDate(id: ChallengeId) {
  return new Date(PROGRAMME_START.getTime() + CHALLENGES.findIndex((c) => c.id === id) * WEEK);
}
function isUnlocked(id: ChallengeId) { return PREVIEW || Date.now() >= releaseDate(id).getTime(); }
function rankFor(score: number) {
  return score >= 90 ? 'Vault Master' : score >= 70 ? 'Master Navigator' : score >= 50 ? 'Deckhand Detective' : 'Cabin Recruit';
}
function readProgress(): Progress {
  try { return JSON.parse(localStorage.getItem('cth_progress') || '') as Progress; } catch { return { name: '', score: 0, won: [], times: {} }; }
}
function writeProgress(progress: Progress) {
  try { localStorage.setItem('cth_progress', JSON.stringify(progress)); } catch { /* local storage is optional */ }
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
  if (completed) return <div className="rounded-2xl border border-[hsl(153_59%_44%/.3)] bg-[hsl(153_59%_44%/.08)] p-4 text-sm text-[hsl(153_59%_28%)]"><CheckCircle2 className="mb-2" size={18} /><b>{title}</b><div className="mt-1">Answer locked in. Continue to the next signal.</div></div>;
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

function ChallengeFour({ answers, done, add }: { answers: Record<string, boolean>; done: (k: string) => void; add: (n: number) => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  const toggleAudio = () => {
    if (!window.speechSynthesis) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    const utt = new SpeechSynthesisUtterance(
      'We are pleased to confirm the acquisition of Mercer Capital Partners for a sum of 2.1 billion dollars. ' +
      'This represents a transformative milestone for our firm and our clients. ' +
      'Further details will follow through the appropriate channels.'
    );
    utt.rate = 0.88;
    utt.pitch = 0.95;
    utt.onend = () => setIsPlaying(false);
    utt.onerror = () => setIsPlaying(false);
    utteranceRef.current = utt;
    setIsPlaying(true);
    window.speechSynthesis.speak(utt);
  };

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-[hsl(229_42%_11%)] p-6 text-[hsl(220_28%_95%)]">
        <div className="scan-bar" />
        <div className="mono mb-4 text-[10px] uppercase tracking-[.2em] text-[hsl(43_96%_65%)]">Audio attachment · acquisition-announcement.mp3</div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleAudio}
            className={`grid size-12 shrink-0 place-items-center rounded-full transition-colors ${isPlaying ? 'bg-[hsl(43_96%_55%)] text-[hsl(229_42%_9%)]' : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'}`}
            aria-label={isPlaying ? 'Stop audio' : 'Play audio sample'}
            data-testid="button-play-audio"
          >
            {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <div className="flex-1">
            <div className="flex h-8 items-end gap-[3px]">
              {Array.from({ length: 28 }).map((_, i) => {
                const h = [4, 8, 14, 20, 26, 30, 22, 16, 28, 18, 10, 24, 32, 20, 14, 28, 22, 12, 18, 26, 16, 8, 20, 28, 14, 10, 24, 6][i] ?? 8;
                return (
                  <div
                    key={i}
                    className={`w-1 rounded-sm transition-all ${isPlaying ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(220_28%_95%/.3)]'}`}
                    style={{
                      height: `${h}px`,
                      animation: isPlaying ? `waveBar 0.${6 + (i % 5)}s ease-in-out ${(i * 0.04).toFixed(2)}s infinite alternate` : 'none',
                    }}
                  />
                );
              })}
            </div>
            <div className="mono mt-2 flex justify-between text-[10px] text-[hsl(223_16%_70%)]">
              <span>{isPlaying ? '▶ playing…' : '00:00'}</span>
              <span>0:14</span>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-[hsl(223_16%_76%)]">
          {isPlaying
            ? <><span className="text-[hsl(43_96%_65%)]">● Live</span> — listen carefully for unnatural pacing or tonal artefacts.</>
            : '"We are pleased to confirm the acquisition…" Press play and listen for what the recording does not prove.'}
        </p>
      </div>
      <SingleQuestion id="c4q1" title="Q1 · Is this recording real, or a deepfake?" choices={singleChoices.c4q1} points={5} onCorrect={add} completed={!!answers.c4q1} setCompleted={() => done('c4q1')} />
      <SingleQuestion id="c4q2" title="Q2 · What is the right thing to do?" choices={[{ text: 'Forward it so colleagues know about the news.', correct: false, why: 'Sharing an unverified recording amplifies misinformation.' }, { text: 'Check official channels and report it to Security or Communications before treating it as real.', correct: true, why: 'Correct. A genuine acquisition would be confirmed through official channels — never a leaked clip.' }, { text: 'Ask the group chat if anyone can confirm it.', correct: false, why: 'That keeps the clip circulating without resolving anything.' }, { text: 'Do nothing and assume someone else will deal with it.', correct: false, why: 'Report what you saw so the organization can contain it quickly.' }]} points={10} onCorrect={add} completed={!!answers.c4q2} setCompleted={() => done('c4q2')} />
      <MultiQuestion id="c4q3" title="Q3 · Which are genuine indicators of a deepfake?" choices={multiChoices.c4q3} onEarn={add} completed={!!answers.c4q3} setCompleted={() => done('c4q3')} />
    </div>
  );
}

function LockedScreen({ challenge, onBack }: { challenge: ChallengeId; onBack: () => void }) {
  const meta = CHALLENGES.find((c) => c.id === challenge)!; const date = releaseDate(challenge); const days = Math.max(1, Math.ceil((date.getTime() - Date.now()) / 86400000));
  return <div className="screen-enter mx-auto w-full max-w-2xl px-5 pb-16 md:px-8"><div className="soft-card rounded-3xl p-8 text-center md:p-12"><div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><LockKeyhole size={27} /></div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">{meta.eyebrow}</div><h1 className="display mt-3 text-3xl font-bold">Signal scheduled</h1><p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[hsl(var(--muted-foreground))]">This part of the map opens next week. New missions release one at a time so the whole crew has something fresh to solve.</p><div className="mono mt-7 inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/.1)] px-4 py-2 text-xs text-[hsl(var(--primary))]"><Clock3 size={14} /> Unlocks {date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · {days} day{days === 1 ? '' : 's'}</div><div className="mt-8"><button type="button" onClick={onBack} className="btn-quiet inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" data-testid="button-return-locked"><ArrowLeft size={15} /> Return to map</button></div></div></div>;
}

function Finale({ progress, setProgress, onReset }: { progress: Progress; setProgress: (p: Progress) => void; onReset: () => void }) {
  const [code, setCode] = useState(''); const [opened, setOpened] = useState(progress.submitted || false); const [error, setError] = useState(''); const submit = useSubmitResult(); const qc = useQueryClient();
  const times = [0, 1, 2, 3].map((i) => progress.times[`c${i + 1}`]?.seconds ?? null); const total = times.every((x) => x != null) ? times.reduce((a, x) => a + (x || 0), 0) : null;
  const unlock = () => { if (code.trim().toUpperCase() !== 'RISK') { setError('Not quite. Shift U-L-V-N three places backward.'); return; } setOpened(true); setError(''); const next = { ...progress, submitted: true }; setProgress(next); const payload: GameResultInput = { firstName: progress.name.split(' ')[0] || progress.name, lastName: progress.name.split(' ').slice(1).join(' ') || 'Operator', score: progress.score, rank: rankFor(progress.score), timeC1: times[0], timeC2: times[1], timeC3: times[2], timeC4: times[3], totalTime: total, isTest: PREVIEW }; submit.mutate({ data: payload }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListResultsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetResultsSummaryQueryKey() }); } }); };
  return <div className="screen-enter mx-auto w-full max-w-4xl px-5 pb-16 md:px-8"><div className="soft-card rounded-3xl p-7 text-center md:p-12">{!opened ? <><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Four keys collected</div><h1 className="display mt-3 text-4xl font-bold md:text-5xl">One last lock</h1><p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[hsl(var(--muted-foreground))]">The letters are encrypted. A Caesar cipher shifted each letter three places forward. Reverse the shift and open the vault.</p><div className="my-9 flex justify-center gap-2 md:gap-3">{KEY_LETTERS.map((key) => <div key={key} className="key-pill grid size-16 place-items-center rounded-2xl md:size-20"><span className="display text-3xl font-bold">{key}</span></div>)}</div><div className="mx-auto max-w-xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] p-5 text-left text-sm leading-7"><b className="display">Cipher note</b><br />U → T → S → <b>R</b>. Apply the same three-step backward move to every key. The answer is a word every good security operator keeps top of mind.</div><div className="mx-auto mt-7 flex max-w-sm flex-col gap-3"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && unlock()} maxLength={10} placeholder="TYPE THE WORD" className="mono rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3 text-center text-lg tracking-[.3em] outline-none focus:border-[hsl(var(--primary))]" aria-label="Deciphered word" data-testid="input-vault-code" /><button type="button" onClick={unlock} disabled={submit.isPending} className="btn-secondary inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold" data-testid="button-unlock-vault"><Unlock size={16} /> {submit.isPending ? 'Saving result…' : 'Unlock the vault'}</button>{error && <div className="rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm text-[hsl(var(--destructive))]" role="alert">{error}</div>}</div></> : <><div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-[hsl(43_96%_55%/.18)] text-[hsl(43_70%_35%)]"><Trophy size={29} /></div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(43_70%_35%)]">Expedition complete</div><h1 className="display mt-3 text-4xl font-bold">The vault opens</h1><p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[hsl(var(--muted-foreground))]">Four keys turned, one cipher cracked, four safer habits learned. The real treasure is knowing when to slow down and verify.</p><div className="my-8 flex justify-center gap-2 md:gap-3">{'RISK'.split('').map((key) => <div key={key} className="key-pill won grid size-16 place-items-center rounded-2xl md:size-20"><span className="display text-3xl font-bold">{key}</span></div>)}</div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[hsl(var(--primary)/.1)] p-5"><div className="display text-4xl font-bold text-[hsl(var(--primary))]">{progress.score}</div><div className="mono mt-1 text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Points earned</div></div><div className="rounded-2xl bg-[hsl(var(--secondary)/.1)] p-5"><div className="display text-2xl font-bold text-[hsl(var(--secondary))]">{rankFor(progress.score)}</div><div className="mono mt-2 text-[10px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Field rank</div></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-left md:grid-cols-5">{times.map((time, i) => <div key={i} className="rounded-xl border border-[hsl(var(--border))] p-3"><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">C{i + 1}</div><b className="mono text-sm">{formatDuration(time)}</b></div>)}<div className="rounded-xl border border-[hsl(var(--border))] p-3"><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">TOTAL</div><b className="mono text-sm">{formatDuration(total)}</b></div></div>{submit.isError && <p className="mt-5 text-sm text-[hsl(var(--destructive))]">Your vault opened, but the result could not sync. It will remain saved on this device.</p>}<button type="button" onClick={onReset} className="btn-quiet mt-8 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" data-testid="button-play-again"><RotateCcw size={15} /> Play again</button></>}</div></div>;
}

function PlayerPage() {
  const [progress, setProgress] = useState<Progress>(() => readProgress());
  const [name, setName] = useState(() => readProgress().name || '');
  const [started, setStarted] = useState(() => !!readProgress().name);
  const [screen, setScreen] = useState<string>(() => readProgress().submitted ? 'finale' : 'map');
  const [locked, setLocked] = useState<ChallengeId | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const loginMutation = useLogin();
  const saveProgress = useSaveProgress();
  const prevWonLen = useRef(progress.won.length);

  const update = useCallback((next: Progress) => { setProgress(next); writeProgress(next); }, []);

  const syncToServer = useCallback((p: Progress) => {
    if (!p.name) return;
    saveProgress.mutate({
      name: p.name.trim().toLowerCase(),
      data: { name: p.name, score: p.score, won: p.won, times: p.times as Record<string, { start: number; seconds: number | null }>, submitted: p.submitted ?? false },
    });
  }, []); // eslint-disable-line

  // Auto-save whenever a key is claimed or the finale is submitted
  useEffect(() => {
    if (!started || !progress.name) return;
    if (progress.won.length > prevWonLen.current || progress.submitted) {
      prevWonLen.current = progress.won.length;
      syncToServer(progress);
    }
  }, [progress.won.length, progress.submitted]); // eslint-disable-line

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const pwd = password.trim();
    if (!trimmed || !pwd) return;
    setLoadingProfile(true);
    setLoginError('');
    try {
      const hash = await hashPassword(pwd);
      const result = await loginMutation.mutateAsync({ data: { name: trimmed.toLowerCase(), passwordHash: hash } });
      const restored: Progress = {
        name: trimmed,
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

  const reset = () => { localStorage.removeItem('cth_progress'); setProgress({ name: '', score: 0, won: [], times: {} }); setName(''); setPassword(''); setStarted(false); setScreen('map'); setLocked(null); setWelcomeBack(false); setLoginError(''); prevWonLen.current = 0; };
  const pick = (id: ChallengeId) => { const i = CHALLENGES.findIndex((c) => c.id === id); if (!isUnlocked(id) || (i > 0 && !progress.won.includes(i - 1))) { setLocked(id); setScreen('locked'); return; } const next = progress.times[id] ? progress : { ...progress, times: { ...progress.times, [id]: { start: Date.now(), seconds: null } } }; update(next); setScreen(id); };

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
          <form onSubmit={start} className="soft-card screen-enter rounded-3xl p-7 md:p-9">
            <div className="mb-7 flex items-center justify-between"><div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">Create or sign in</div><h2 className="display mt-1 text-2xl font-bold">Your mission profile</h2></div><div className="grid size-12 place-items-center rounded-2xl bg-[hsl(var(--foreground))] text-[hsl(var(--primary))]"><KeyRound size={20} /></div></div>
            <label className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]" htmlFor="player-name">Full name</label>
            <input id="player-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Morgan" className="mt-2 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3.5 outline-none transition focus:border-[hsl(var(--primary))]" data-testid="input-player-name" required disabled={loadingProfile} autoComplete="username" />
            <label className="mono mt-4 block text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]" htmlFor="player-password">Password</label>
            <input id="player-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Choose or enter your password" className="mt-2 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3.5 outline-none transition focus:border-[hsl(var(--primary))]" data-testid="input-player-password" required disabled={loadingProfile} autoComplete="current-password" minLength={4} />
            {loginError && <div className="mt-3 rounded-xl bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm text-[hsl(var(--destructive))]" role="alert">{loginError}</div>}
            <button type="submit" disabled={loadingProfile} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold" data-testid="button-start-hunt">
              {loadingProfile ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : <>Start the hunt <ArrowRight size={17} /></>}
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-[hsl(var(--muted-foreground))]">New here? Enter any password to create your profile. Returning? Use the same name and password to pick up where you left off.</p>
          </form>
        </div>
      </main>
    </div>
  );

  return (
    <div className="mission-app">
      <TopBar progress={progress} onReset={reset} />
      <main className="relative z-10">
        {screen === 'map' && (
          <div className="screen-enter mx-auto w-full max-w-6xl px-5 pb-16 md:px-8">
            {welcomeBack && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[hsl(43_96%_55%/.35)] bg-[hsl(43_96%_55%/.09)] px-5 py-3.5">
                <Trophy size={16} className="shrink-0 text-[hsl(43_70%_40%)]" />
                <p className="text-sm"><b>Welcome back, {progress.name.split(' ')[0]}!</b> Your progress has been restored — {progress.won.length} of 4 keys secured.</p>
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
        {screen === 'finale' && <Finale progress={progress} setProgress={update} onReset={reset} />}
      </main>
      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 pb-8 md:px-8"><span className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">CTH // build 04</span><Link href="/admin" className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))] underline decoration-dotted underline-offset-4" data-testid="link-admin">Organizer access</Link></footer>
    </div>
  );
}

type SortKey = 'score' | 'name' | 'rank' | 'totalTime' | 'createdAt';
function AdminPage() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('cth_admin_ok') === '1'); const [pass, setPass] = useState(''); const [error, setError] = useState(''); const [search, setSearch] = useState(''); const [showTest, setShowTest] = useState(PREVIEW); const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' });
  const results = useListResults({ query: { enabled: unlocked, queryKey: getListResultsQueryKey() } }); const summary = useGetResultsSummary({ query: { enabled: unlocked, queryKey: getGetResultsSummaryQueryKey() } }); const health = useHealthCheck({ query: { enabled: unlocked, queryKey: getHealthCheckQueryKey() } });
  const rows = useMemo(() => { const data = (results.data || []).filter((r) => showTest || !r.isTest).filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(search.toLowerCase())); return data.sort((a, b) => { const av = sort.key === 'name' ? `${a.firstName} ${a.lastName}` : a[sort.key]; const bv = sort.key === 'name' ? `${b.firstName} ${b.lastName}` : b[sort.key]; if (av == null) return 1; if (bv == null) return -1; if (av < bv) return sort.dir === 'asc' ? -1 : 1; if (av > bv) return sort.dir === 'asc' ? 1 : -1; return 0; }); }, [results.data, search, showTest, sort]);
  const podium = useMemo(() => [...(results.data || []).filter((r) => showTest || !r.isTest)].sort((a, b) => b.score - a.score || (a.totalTime || Infinity) - (b.totalTime || Infinity)).slice(0, 3), [results.data, showTest]);
  const unlock = (e: FormEvent) => { e.preventDefault(); if (pass === 'changeme123') { sessionStorage.setItem('cth_admin_ok', '1'); setUnlocked(true); setError(''); } else setError('Incorrect passcode.'); };
  const refresh = () => { void results.refetch(); void summary.refetch(); };
  const sortBy = (key: SortKey) => setSort((old) => ({ key, dir: old.key === key && old.dir === 'desc' ? 'asc' : 'desc' }));
  const exportExcel = () => { const escape = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); const lines = ['#\tName\tScore\tRank\tCh.1 (s)\tCh.2 (s)\tCh.3 (s)\tCh.4 (s)\tTotal time (s)\tCompleted', ...rows.map((r, i) => [i + 1, `${r.firstName} ${r.lastName}`, r.score, r.rank, r.timeC1, r.timeC2, r.timeC3, r.timeC4, r.totalTime, r.createdAt].map(escape).join('\t'))]; const blob = new Blob([lines.join('\n')], { type: 'application/vnd.ms-excel' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cyber-treasure-hunt-results.xls'; a.click(); URL.revokeObjectURL(a.href); };
  if (!unlocked) return <div className="mission-app"><div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5"><form onSubmit={unlock} className="soft-card w-full max-w-md rounded-3xl p-8 text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[hsl(var(--foreground))] text-[hsl(var(--primary))]"><LockKeyhole size={24} /></div><Brand admin /><h1 className="display mt-8 text-2xl font-bold">Organizer access</h1><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Enter the console passcode to view the team leaderboard.</p><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passcode" className="mono mt-6 w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 px-4 py-3 text-center tracking-[.2em] outline-none focus:border-[hsl(var(--primary))]" data-testid="input-admin-passcode" /><button type="submit" className="btn-secondary mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold" data-testid="button-unlock-admin"><Unlock size={16} /> Unlock leaderboard</button>{error && <p className="mt-3 text-sm text-[hsl(var(--destructive))]" role="alert">{error}</p>}<Link href="/" className="mt-6 inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] underline decoration-dotted underline-offset-4" data-testid="link-back-hunt"><ArrowLeft size={13} /> Back to the hunt</Link></form></div></div>;
  const metric = summary.data; return <div className="mission-app"><TopBar admin /><main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-16 md:px-8"><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><div className="mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--primary))]">Organizer console / live</div><h1 className="display mt-2 text-4xl font-bold tracking-tight md:text-5xl">Leaderboard control room.</h1><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Competition ranking: highest score first, fastest total time breaks ties.</p></div><div className="flex flex-wrap gap-2"><Link href="/" className="btn-quiet inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" data-testid="link-back-player"><ArrowLeft size={15} /> Back to hunt</Link><button type="button" onClick={refresh} disabled={results.isFetching} className="btn-quiet inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" data-testid="button-refresh-results"><RefreshCw size={15} className={results.isFetching ? 'animate-spin' : ''} /> Refresh</button><button type="button" onClick={exportExcel} className="btn-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold" data-testid="button-export-results"><Download size={15} /> Export Excel</button></div></div><div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Participants', metric?.participantCount ?? '—'], ['Average score', metric ? Math.round(metric.averageScore) : '—'], ['Top score', metric?.topScore ?? '—'], ['Average time', formatDuration(metric?.averageTime)], ['Fastest', formatDuration(metric?.fastestTime)]].map(([label, value]) => <div key={String(label)} className="soft-card rounded-2xl p-4"><div className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">{label}</div><div className="display mt-2 text-2xl font-bold text-[hsl(var(--secondary))]">{value}</div></div>)}</div>{podium.length > 0 && <div className="mb-6 grid gap-3 md:grid-cols-3">{podium.map((r, i) => <div key={r.id} className={`soft-card rounded-2xl p-5 text-center ${i === 0 ? 'border-[hsl(43_96%_55%)] md:-translate-y-2' : ''}`}><div className="mono text-xs text-[hsl(var(--muted-foreground))]">RANK 0{i + 1}</div><div className="mx-auto my-3 grid size-12 place-items-center rounded-2xl bg-[hsl(var(--muted))]"><Trophy size={21} className={i === 0 ? 'text-[hsl(43_96%_50%)]' : 'text-[hsl(var(--secondary))]'} /></div><b className="display block">{r.firstName} {r.lastName}</b><span className="mono text-sm text-[hsl(var(--primary))]">{r.score} pts</span><div className="mono mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{formatDuration(r.totalTime)}</div></div>)}</div>}<div className="mb-4 flex flex-wrap items-center gap-3"><div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by participant name" className="w-full rounded-xl border border-[hsl(var(--border))] bg-white/70 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-search-results" /></div><label className="inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} data-testid="checkbox-show-test" /> Show test runs</label><span className="mono text-xs text-[hsl(var(--muted-foreground))]">{rows.length} shown · API {health.data?.status === 'ok' ? 'connected' : health.isLoading ? 'checking' : 'offline'}</span></div><div className="soft-card overflow-hidden rounded-2xl"><div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-sm"><thead className="bg-[hsl(var(--muted)/.6)]"><tr>{[['score', 'Score'], ['name', 'Name'], ['rank', 'Rank'], ['timeC1', 'Ch.1'], ['timeC2', 'Ch.2'], ['timeC3', 'Ch.3'], ['timeC4', 'Ch.4'], ['totalTime', 'Total'], ['createdAt', 'Completed']].map(([key, label]) => <th key={key} className="cursor-pointer px-4 py-3 text-left mono text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]" onClick={() => sortBy(key as SortKey)}><span className="inline-flex items-center gap-1">{label}{sort.key === key && (sort.dir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />)}</span></th>)}</tr></thead><tbody>{results.isLoading ? [1, 2, 3].map((x) => <tr key={x} className="animate-pulse border-t border-[hsl(var(--border))]"><td colSpan={9} className="px-4 py-5"><div className="h-4 rounded bg-[hsl(var(--muted))]" /></td></tr>) : rows.map((r) => <tr key={r.id} className="border-t border-[hsl(var(--border))] transition hover:bg-[hsl(var(--primary)/.04)]"><td className="px-4 py-3 mono font-bold text-[hsl(var(--primary))]">{r.score}</td><td className="px-4 py-3 font-bold">{r.firstName} {r.lastName}{r.isTest && <span className="ml-2 rounded-full bg-[hsl(var(--accent)/.18)] px-2 py-0.5 mono text-[9px] text-[hsl(var(--accent))]">TEST</span>}</td><td className="px-4 py-3"><span className="rounded-full bg-[hsl(var(--secondary)/.1)] px-2 py-1 text-xs text-[hsl(var(--secondary))]">{r.rank}</span></td><td className="px-4 py-3 mono text-xs">{formatDuration(r.timeC1)}</td><td className="px-4 py-3 mono text-xs">{formatDuration(r.timeC2)}</td><td className="px-4 py-3 mono text-xs">{formatDuration(r.timeC3)}</td><td className="px-4 py-3 mono text-xs">{formatDuration(r.timeC4)}</td><td className="px-4 py-3 mono text-xs font-bold">{formatDuration(r.totalTime)}</td><td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td></tr>)}</tbody></table>{!results.isLoading && !rows.length && <div className="p-12 text-center"><BarChart3 className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" size={28} /><p className="display font-bold">{results.isError ? 'Could not load results.' : 'No matching participants yet.'}</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{results.isError ? 'Refresh to try the API again.' : 'Completed hunts will appear here.'}</p></div>}</div></div></main></div>;
}

function Router() { return <ErrorBoundary resetKey={window.location.pathname}><Switch><Route path="/" component={PlayerPage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;
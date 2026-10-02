// Nudgewell: polite, escalating reminders for unpaid invoices, written in your voice, with the late fee worked out.
import { useState } from "react";
import { moneyFmt } from "./lib/money";
import { mailLink, waLink } from "./lib/share";
import { uid, useStored } from "./lib/store";
import { addDays, todayISO } from "./lib/time";
import { CurrencySelect, Section, Stat, Stats } from "./ui/kit";

const T = "nudgewell";
type Inv = { id: string; no: string; client: string; contact: string; email: string; phone: string; amount: number; issued: string; due: string; paid?: string; sent: string[] };
type Step = { key: string; offset: number; label: string; tone: "friendly" | "firm" | "final"; body: string };
const STEPS: Step[] = [
  { key: "pre", offset: -3, label: "3 days before due", tone: "friendly", body: "Hi {contact}, a quick heads-up that invoice {no} for {amount} is due on {due}. Thanks again for the work together!" },
  { key: "due", offset: 0, label: "On the due date", tone: "friendly", body: "Hi {contact}, invoice {no} for {amount} is due today. Let me know if you need anything from me to process it." },
  { key: "d7", offset: 7, label: "7 days late", tone: "firm", body: "Hi {contact}, invoice {no} for {amount} was due on {due} and is now a week overdue. Could you confirm when it will be paid?" },
  { key: "d14", offset: 14, label: "14 days late", tone: "firm", body: "Hi {contact}, invoice {no} is now two weeks overdue. As per our terms, a late fee of {fee} now applies, bringing the total to {total}. Please arrange payment this week." },
  { key: "d30", offset: 30, label: "30 days late", tone: "final", body: "Hi {contact}, invoice {no} is 30 days overdue ({total} including late fees). If payment is not received within 7 days I will pause all work and pass this to collections. I would much rather sort it out directly." },
];
const late = (due: string) => Math.floor((new Date(todayISO()).getTime() - new Date(due).getTime()) / 86400000);

export default function Nudgewell() {
  const [invs, setInvs] = useStored<Inv[]>(T, "invs", [
    { id: "i1", no: "2026-031", client: "Studio Nord", contact: "Mehdi", email: "mehdi@studionord.tn", phone: "", amount: 2400, issued: addDays(todayISO(), -44), due: addDays(todayISO(), -16), sent: ["pre", "due", "d7"] },
    { id: "i2", no: "2026-034", client: "Glazeco", contact: "Sara", email: "sara@glazeco.com", phone: "", amount: 950, issued: addDays(todayISO(), -27), due: addDays(todayISO(), 2), sent: [] },
    { id: "i3", no: "2026-029", client: "Maison Jasmin", contact: "Nadia", email: "", phone: "21655000111", amount: 1800, issued: addDays(todayISO(), -60), due: addDays(todayISO(), -32), sent: ["pre", "due", "d7", "d14"] },
    { id: "i4", no: "2026-027", client: "Atelier Tools", contact: "Omar", email: "omar@atelier.tn", phone: "", amount: 600, issued: addDays(todayISO(), -70), due: addDays(todayISO(), -40), paid: addDays(todayISO(), -35), sent: ["pre", "due"] },
  ]);
  const [steps, setSteps] = useStored(T, "steps", STEPS);
  const [cur, setCur] = useStored(T, "cur", "TND");
  const [fee, setFee] = useStored(T, "fee", { kind: "percent" as "percent" | "fixed", value: 1.5, from: 14 });
  const [me, setMe] = useStored(T, "me", "Leila");
  const [d, setD] = useState({ no: "", client: "", contact: "", email: "", phone: "", amount: "", due: addDays(todayISO(), 30) });
  const [edit, setEdit] = useState(false);
  const money = moneyFmt(cur);

  const lateFee = (i: Inv) => { const l = late(i.due); if (l < fee.from) return 0; return fee.kind === "fixed" ? fee.value : (i.amount * fee.value / 100) * Math.max(1, Math.floor(l / 30) + 1); };
  const fill = (s: Step, i: Inv) => s.body.replace(/\{contact\}/g, i.contact || "there").replace(/\{no\}/g, i.no).replace(/\{amount\}/g, money(i.amount)).replace(/\{due\}/g, new Date(i.due).toLocaleDateString()).replace(/\{fee\}/g, money(lateFee(i))).replace(/\{total\}/g, money(i.amount + lateFee(i))) + `\n\n${me}`;
  const nextStep = (i: Inv) => steps.filter(s => !i.sent.includes(s.key) && late(i.due) >= s.offset).pop();
  const open = invs.filter(i => !i.paid);
  const overdue = open.filter(i => late(i.due) > 0);
  const toSend = open.filter(i => nextStep(i));
  const paidDays = invs.filter(i => i.paid).map(i => (new Date(i.paid!).getTime() - new Date(i.issued).getTime()) / 86400000);
  const mark = (i: Inv, key: string) => setInvs(invs.map(x => x.id === i.id ? { ...x, sent: [...x.sent, key] } : x));

  return (
    <div className="stack">
      <Section title="Money owed to you" aside={<CurrencySelect id="nw-cur" value={cur} onChange={setCur} />}>
        <Stats><Stat value={money(open.reduce((a, i) => a + i.amount, 0))} label="Outstanding" /><Stat value={money(overdue.reduce((a, i) => a + i.amount, 0))} label="Overdue" tone={overdue.length ? "bad" : "good"} /><Stat value={toSend.length} label="Reminders to send today" tone={toSend.length ? "warn" : undefined} /><Stat value={paidDays.length ? `${Math.round(paidDays.reduce((a, b) => a + b, 0) / paidDays.length)} days` : "–"} label="Average time to get paid" /></Stats>
      </Section>

      <Section title="Send today">
        {toSend.length === 0 ? <p className="empty-note">Nothing to chase today.</p> : toSend.map(i => { const s = nextStep(i)!; const text = fill(s, i); return (
          <div key={i.id} className="nw-send">
            <div className="row" style={{ justifyContent: "space-between" }}><strong>{i.client} · {i.no} · {money(i.amount)}</strong><span className={"pill " + (s.tone === "final" ? "bad" : s.tone === "firm" ? "warn" : "")}>{s.label}</span></div>
            <p className="nw-msg">{text}</p>
            <div className="row">
              {i.email && <a className="btn small primary" href={mailLink(i.email, `Invoice ${i.no}`, text)} onClick={() => mark(i, s.key)}>Email it</a>}
              {i.phone && <a className="btn small primary" href={waLink(text, i.phone)} target="_blank" rel="noreferrer" onClick={() => mark(i, s.key)}>WhatsApp it</a>}
              <button className="btn small" onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); mark(i, s.key); }}>Copy and mark sent</button>
              <button className="btn ghost small" onClick={() => setInvs(invs.map(x => x.id === i.id ? { ...x, paid: todayISO() } : x))}>It's paid</button>
            </div>
          </div>); })}
      </Section>

      <Section title="Invoices">
        <div className="table-wrap"><table className="t"><thead><tr><th>No.</th><th>Client</th><th className="r">Amount</th><th>Due</th><th>Status</th><th className="r">Late fee</th><th /></tr></thead>
          <tbody>{invs.sort((a, b) => a.due.localeCompare(b.due)).map(i => { const l = late(i.due); return (
            <tr key={i.id}><td>{i.no}</td><td>{i.client}</td><td className="r">{money(i.amount)}</td><td className="num">{i.due}</td>
              <td>{i.paid ? <span className="pill good">Paid {i.paid}</span> : l > 0 ? <span className="pill bad">{l} days late</span> : <span className="pill">Due in {-l} days</span>}</td>
              <td className="r">{!i.paid && lateFee(i) ? money(lateFee(i)) : ""}</td>
              <td className="r">{!i.paid && <button className="btn ghost small" onClick={() => setInvs(invs.map(x => x.id === i.id ? { ...x, paid: todayISO() } : x))}>Paid</button>}<button className="btn ghost small danger" onClick={() => setInvs(invs.filter(x => x.id !== i.id))}>Delete</button></td></tr>); })}</tbody></table></div>
        <form className="row" style={{ marginTop: 14, alignItems: "flex-end" }} onSubmit={e => { e.preventDefault(); if (!d.client.trim() || !parseFloat(d.amount)) return; setInvs([...invs, { id: uid(), no: d.no || `INV-${invs.length + 1}`, client: d.client.trim(), contact: d.contact, email: d.email, phone: d.phone, amount: parseFloat(d.amount), issued: todayISO(), due: d.due, sent: [] }]); setD({ ...d, no: "", client: "", contact: "", email: "", phone: "", amount: "" }); }}>
          <label className="field" style={{ flex: "0 0 100px" }}><span>No.</span><input id="nw-no" className="input" value={d.no} onChange={e => setD({ ...d, no: e.target.value })} /></label>
          <label className="field"><span>Client</span><input id="nw-cl" className="input" value={d.client} onChange={e => setD({ ...d, client: e.target.value })} /></label>
          <label className="field"><span>Contact name</span><input id="nw-ct" className="input" value={d.contact} onChange={e => setD({ ...d, contact: e.target.value })} /></label>
          <label className="field"><span>Email</span><input id="nw-em" className="input" value={d.email} onChange={e => setD({ ...d, email: e.target.value })} /></label>
          <label className="field"><span>or WhatsApp</span><input id="nw-ph" className="input" value={d.phone} onChange={e => setD({ ...d, phone: e.target.value })} /></label>
          <label className="field" style={{ flex: "0 0 110px" }}><span>Amount</span><input id="nw-am" className="input num" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} /></label>
          <label className="field" style={{ flex: "0 0 150px" }}><span>Due</span><input id="nw-due" type="date" className="input" value={d.due} onChange={e => setD({ ...d, due: e.target.value })} /></label>
          <button className="btn primary" type="submit">Add invoice</button>
        </form>
      </Section>

      <Section title="Your reminder style" aside={<button className="btn small" onClick={() => setEdit(!edit)}>{edit ? "Done" : "Edit messages"}</button>}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field"><span>Sign off as</span><input id="nw-me" className="input" value={me} onChange={e => setMe(e.target.value)} /></label>
          <label className="field"><span>Late fee</span><select id="nw-fk" className="input" value={fee.kind} onChange={e => setFee({ ...fee, kind: e.target.value as "percent" | "fixed" })}><option value="percent">% per month late</option><option value="fixed">Fixed amount</option></select></label>
          <label className="field"><span>{fee.kind === "percent" ? "Percent" : "Amount"}</span><input id="nw-fv" className="input num" value={fee.value} onChange={e => setFee({ ...fee, value: parseFloat(e.target.value) || 0 })} /></label>
          <label className="field"><span>Starting after (days late)</span><input id="nw-ff" className="input num" value={fee.from} onChange={e => setFee({ ...fee, from: parseInt(e.target.value) || 0 })} /></label>
        </div>
        {edit && <div className="stack" style={{ gap: 10, marginTop: 14 }}>
          {steps.map(s => <label key={s.key} className="field"><span>{s.label} · {s.tone}</span><textarea className="input" rows={3} value={s.body} onChange={e => setSteps(steps.map(x => x.key === s.key ? { ...x, body: e.target.value } : x))} /></label>)}
          <p className="note">Use {"{contact} {no} {amount} {due} {fee} {total}"}. Only charge late fees your contract allows.</p>
          <button className="btn ghost small" style={{ alignSelf: "flex-start" }} onClick={() => setSteps(STEPS)}>Reset messages</button>
        </div>}
      </Section>
      <style>{`.nw-send{padding:12px 0;border-bottom:1px solid var(--line);display:grid;gap:8px}.nw-msg{white-space:pre-wrap;padding:10px 12px;border-radius:8px;background:var(--sunk);font-size:15px}`}</style>
    </div>
  );
}

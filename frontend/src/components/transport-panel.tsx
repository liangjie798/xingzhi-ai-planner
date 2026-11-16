"use client";
import { WorkspaceHeading } from "./workspace-presentation";
import { useEffect, useRef, useState } from "react";
import { AirplaneTilt, Train, ArrowsLeftRight, ArrowUpRight } from "@phosphor-icons/react";
import type { AirlineQuote, AirlineStreamEvent } from "@/lib/airline-types";
import type { TicketOption } from "@/lib/ticket-types";
import s from "./transport-panel.module.css";

interface ProviderRow { code: string; name: string; state: string; quoteCount: number }
interface FlightView { phase: "idle" | "loading" | "done"; providers: ProviderRow[]; quotes: TicketOption[]; notes: string[] }
interface TrainView { phase: "idle" | "loading" | "done"; options: TicketOption[]; note: string }

const PROVIDER_STATES: Record<string, string> = {
  pending: "查询中…",
  quoted: "",
  "no-flights": "本次无航班",
  "login-required": "需登录官网",
  "verification-required": "需人工验证",
  "session-expired": "官网会话过期",
  "tls-error": "证书校验失败",
  timeout: "查询超时",
  "unverified-page": "页面未能核实",
  "unrecognized-price": "未取得可核实价格",
  cancelled: "未等待返回",
  busy: "查询繁忙",
  unsupported: "尚未接入",
  "not-configured": "浏览器未启用",
};

function providerStateText(row: ProviderRow) {
  if (row.state === "pending") return "查询中…";
  if (row.state === "quoted") return `${row.quoteCount} 条报价`;
  return PROVIDER_STATES[row.state] ?? "未取得报价";
}

function toTicketOption(quote: AirlineQuote): TicketOption {
  return {
    mode: "航班",
    service: quote.flightNumber,
    optionId: `${quote.airlineCode}:${quote.flightNumber}:${quote.date}:${quote.departure}`,
    seat: quote.cabin,
    price: quote.price,
    departure: quote.departure,
    arrival: quote.arrival,
    arrivalDayOffset: quote.arrivalDayOffset,
    originStation: quote.originStation,
    destinationStation: quote.destinationStation,
    sourceName: quote.sourceName,
    sourceUrl: quote.sourceUrl,
    checkedAt: quote.checkedAt,
    priceBasis: quote.priceBasis,
    stops: quote.stops,
    codeshare: quote.codeshare,
    operatingFlightNumber: quote.operatingFlightNumber,
  };
}

const EMPTY_FLIGHT: FlightView = { phase: "idle", providers: [], quotes: [], notes: [] };
const EMPTY_TRAIN: TrainView = { phase: "idle", options: [], note: "" };

export function TransportPanel() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flight, setFlight] = useState<FlightView>(EMPTY_FLIGHT);
  const [train, setTrain] = useState<TrainView>(EMPTY_TRAIN);
  const pending = useRef<AbortController | null>(null);
  const firstQuoteAt = useRef<number | null>(null);
  const [elapsedTicks, setElapsedTicks] = useState(0);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setElapsedTicks((value) => value + 1), 500);
    return () => window.clearInterval(timer);
  }, [busy]);

  function reset() {
    pending.current?.abort();
    setBusy(false);
    setFlight(EMPTY_FLIGHT);
    setTrain(EMPTY_TRAIN);
    setError("");
    firstQuoteAt.current = null;
  }

  function change() {
    reset();
  }

  function applyFlightEvent(event: AirlineStreamEvent) {
    if (event.type === "start") {
      setFlight({ phase: "loading", providers: event.providers.map((row) => ({ code: row.airlineCode, name: row.sourceName, state: "pending", quoteCount: 0 })), quotes: [], notes: [] });
      return;
    }
    if (event.type === "provider") {
      setFlight((current) => {
        if (current.phase === "done") return current;
        const quotes = [...current.quotes, ...event.quotes.map(toTicketOption)];
        if (quotes.length && firstQuoteAt.current === null) firstQuoteAt.current = Date.now();
        return {
          ...current,
          providers: current.providers.map((row) => row.code === event.attempt.airlineCode ? { ...row, state: event.attempt.state, quoteCount: event.attempt.quoteCount } : row),
          quotes,
        };
      });
      return;
    }
    setFlight((current) => ({ ...current, phase: "done", notes: event.notes, providers: current.providers.map((row) => row.state === "pending" ? { ...row, state: "cancelled" } : row) }));
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setFlight({ phase: "loading", providers: [], quotes: [], notes: [] });
    setTrain({ phase: "loading", options: [], note: "" });
    firstQuoteAt.current = null;
    setElapsedTicks(0);
    const request = { origin, destination, date };
    const flightJob = (async () => {
      try {
        const response = await fetch("/transport-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, mode: "flight", stream: true }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error("查询暂不可用，请稍后重试。");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consume = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try { applyFlightEvent(JSON.parse(trimmed) as AirlineStreamEvent); } catch { /* 忽略不完整行 */ }
        };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index: number;
          while ((index = buffer.indexOf("\n")) >= 0) {
            consume(buffer.slice(0, index));
            buffer = buffer.slice(index + 1);
          }
        }
        consume(buffer);
      } catch {
        if (!controller.signal.aborted) {
          setFlight((current) => ({ ...current, phase: "done" }));
          setError("部分来源查询失败，可重试。");
        }
      }
    })();
    const trainJob = (async () => {
      try {
        const response = await fetch("/transport-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, mode: "train" }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("查询暂不可用，请稍后重试。");
        const data = await response.json() as { train?: { options?: TicketOption[]; note?: string } };
        setTrain({ phase: "done", options: data.train?.options ?? [], note: data.train?.note ?? "" });
      } catch {
        if (!controller.signal.aborted) {
          setTrain((current) => ({ ...current, phase: "done" }));
          setError("部分来源查询失败，可重试。");
        }
      }
    })();
    await Promise.allSettled([flightJob, trainJob]);
    if (pending.current === controller) setBusy(false);
  }

  const pendingAirlines = flight.providers.filter((row) => row.state === "pending");
  const flightCount = new Set(flight.quotes.map((option) => option.service)).size;
  const trainCount = new Set(train.options.map((option) => option.service)).size;
  const flightBusy = flight.phase === "loading" || Boolean(pendingAirlines.length);
  const streamActive = busy && (flight.phase === "loading" || train.phase === "loading");

  function quoteList(options: TicketOption[], label: (option: TicketOption) => string) {
    return <div className={s.optionList}>{options.map((option, index) => (
      <article key={option.optionId || `${option.service}-${option.seat}-${option.departure}-${index}`} style={{ animationDelay: `${Math.min(index, 18) * 85}ms` }}>
        <div>
          <strong>{option.service}</strong>
          <span>{option.seat}</span>
          {option.stops ? <em className={s.transferBadge}>中转/经停</em> : null}
          <b>¥{option.price}<small>/人</small></b>
        </div>
        <div className={s.times}>
          <span><strong>{option.departure || "时间待核实"}</strong><small>{option.originStation || origin}</small></span>
          <span>→{option.durationMinutes ? <small>{Math.floor(option.durationMinutes / 60)}小时{option.durationMinutes % 60}分</small> : null}</span>
          <span><strong>{option.arrival || "时间待核实"}{option.arrivalDayOffset ? ` +${option.arrivalDayOffset}天` : ""}</strong><small>{option.destinationStation || destination}</small></span>
        </div>
        <footer>
          <span>{option.priceBasis === "total" ? "查询票面价" : "税费与最终支付金额待核实"}</span>
          <a href={option.sourceUrl} target="_blank" rel="noreferrer">{option.sourceName || "官网"}核实 <ArrowUpRight size={14} /></a>
        </footer>
        <span className="sr-only">{label(option)}</span>
      </article>
    ))}</div>;
  }

  return (
    <section className={s.page} aria-label="飞机与火车交通比价">
      <WorkspaceHeading view="transport" />
      <form onSubmit={search} className={s.form}>
        <label>出发地<input required maxLength={20} placeholder="城市或车站，如厦门" value={origin} onChange={(event) => { change(); setOrigin(event.target.value); }} /></label>
        <button type="button" aria-label="交换出发地和目的地" onClick={() => { change(); setOrigin(destination); setDestination(origin); }}><ArrowsLeftRight size={20} /></button>
        <label>目的地<input required maxLength={20} placeholder="城市或车站，如北京" value={destination} onChange={(event) => { change(); setDestination(event.target.value); }} /></label>
        <label>出发日期<input required type="date" value={date} onChange={(event) => { change(); setDate(event.target.value); }} /></label>
        <button type="submit" disabled={busy}>{busy ? `正在核对票价…${flight.quotes.length + train.options.length ? `（已返回 ${flight.quotes.length + train.options.length} 条）` : ""}` : "查询飞机与火车"}</button>
      </form>
      {error && <p role="alert" className={s.alert}>{error}</p>}
      {streamActive && (
        <p className={s.progress} role="status" aria-live="polite">
          <span className={s.spinner} aria-hidden="true" />
          已返回 {flight.quotes.length + train.options.length} 条报价
          {pendingAirlines.length > 0 ? ` · 正在查询 ${pendingAirlines.map((row) => row.name).join("、")}` : train.phase === "loading" ? " · 正在查询 12306 车次" : ""}
          <span className={s.progressTime}>{(elapsedTicks * 0.5).toFixed(1)}s</span>
        </p>
      )}
      <div className={s.results}>
        <section aria-label="航班比价结果">
          <h2>
            <AirplaneTilt size={24} /> 飞机
            <small key={`flight-${flight.quotes.length}-${flight.phase}`} className={s.count}>
              {flightBusy && !flight.quotes.length ? "查询中…" : `${flightCount} 个航班 · ${flight.quotes.length} 条报价`}
            </small>
          </h2>
          {flight.providers.length > 0 && (
            <div className={s.airlines} aria-label="已查询航司">
              {flight.providers.map((row, index) => (
                <span key={row.code} className={s.airlineChip} data-state={row.state} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                  {row.name}
                  <em>{providerStateText(row)}</em>
                </span>
              ))}
            </div>
          )}
          {flightBusy && !flight.quotes.length && (
            <p className={s.loading} role="status"><span className={s.spinner} aria-hidden="true" />正在查询官方来源，快的结果会先显示…</p>
          )}
          {flight.quotes.length > 0 && quoteList(flight.quotes, (option) => `${option.service} ${option.seat} ¥${option.price}`)}
          {flight.phase === "done" && !flight.quotes.length && (
            <div className={s.empty}><p>{flight.notes[0] || "本次未取得可核实的航司报价，请调整线路或前往官网查询。"}</p></div>
          )}
          {flight.phase === "done" && pendingAirlines.length > 0 && (
            <p className={s.streaming} role="status"><span className={s.spinner} aria-hidden="true" />仍在查询：{pendingAirlines.map((row) => row.name).join("、")}…</p>
          )}
          {flight.phase === "done" && flight.notes.length > 0 && (
            <ul className={s.notes}>{flight.notes.map((note) => <li key={note}>{note}</li>)}</ul>
          )}
        </section>
        <section aria-label="火车比价结果">
          <h2>
            <Train size={24} /> 火车
            <small key={`train-${train.options.length}-${train.phase}`} className={s.count}>
              {train.phase === "loading" && !train.options.length ? "查询中…" : `${trainCount} 个车次 · ${train.options.length} 条席别`}
            </small>
          </h2>
          {train.phase === "loading" && !train.options.length && (
            <p className={s.loading} role="status"><span className={s.spinner} aria-hidden="true" />正在查询12306官方来源…</p>
          )}
          {train.options.length > 0 && quoteList(train.options, (option) => `${option.service} ${option.seat} ¥${option.price}`)}
          {train.phase === "done" && !train.options.length && (
            <div className={s.empty}><p>{train.note || "本次未取得同时含票价和时刻的车次；请在12306核实。"}</p></div>
          )}
          {train.phase === "done" && train.note && train.options.length > 0 && <p className={s.note}>{train.note}</p>}
          <a className={s.official} href="https://kyfw.12306.cn/otn/leftTicket/init" target="_blank" rel="noreferrer">铁路12306官方查询 <ArrowUpRight size={16} /></a>
        </section>
      </div>
      <p className={s.note}>仅查询已验证有公开客运报价的航司；货运、集团实体及未取得有效票价的航司不参与抓取。火车预售范围以12306为准；无法查询不代表无票，不据此判断全网最低价。</p>
    </section>
  );
}

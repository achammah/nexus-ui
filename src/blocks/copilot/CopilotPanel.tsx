import * as React from "react";
import { Sparkles, X, ArrowUp, Cog } from "lucide-react";
import { ThinkingDots } from "../../primitives/ThinkingDots";
import { renderMarkdown } from "../../primitives/Markdown";
import "./copilot.css";

/* CopilotPanel — a reusable AI copilot side-panel. Presentation + conversation state
   only; the host injects the transport (`send`) and the per-turn `context`, so the
   panel is entity- and app-agnostic. One request-response turn per send (not
   streaming): the host's send resolves { reply, sessionId, tools } and the reply
   renders as Markdown with the invoked tools shown as chips. */

export interface CopilotReply { reply: string; sessionId: string; tools?: string[] }

export interface CopilotConfig {
  /* header label + the little brand mark glyph (1–2 chars); falls back to a sparkle */
  title?: string;
  mark?: string;
  /* the empty-state blurb + a few starter prompts (clicking one fills the input) */
  emptyStateCopy?: string;
  suggestions?: string[];
}

export interface CopilotPanelProps {
  open: boolean;
  onClose: () => void;
  config?: CopilotConfig;
  /* one turn: resolves the agent reply. sessionId threads the conversation. */
  send: (message: string, sessionId: string | undefined, context: string) => Promise<CopilotReply>;
  /* the context sent in FRONT of each message — what the user is looking at now */
  getContext?: () => string | Promise<string>;
}

interface Msg { role: "user" | "agent"; content: string; tools?: string[] }

function Mark({ mark }: { mark?: string }) {
  return mark ? <span aria-hidden>{mark}</span> : <Sparkles size={13} />;
}

export function CopilotPanel({ open, onClose, config, send, getContext }: CopilotPanelProps) {
  const title = config?.title ?? "Copilot";
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const sid = React.useRef<string | undefined>(undefined);
  const scroller = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);
  React.useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, sending]);

  async function submit() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const ctx = getContext ? await getContext() : "";
      const r = await send(text, sid.current, ctx);
      sid.current = r.sessionId;
      setMsgs((m) => [...m, { role: "agent", content: r.reply, tools: r.tools }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "agent", content: `I hit an error reaching the copilot. ${(e as Error).message}` }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }

  return (
    <aside className="nxCopilot" data-testid="copilot-panel" aria-hidden={!open}>
      <header className="nxCopilot-head">
        <span className="nxCopilot-title">
          <span className="nxCopilot-mark"><Mark mark={config?.mark} /></span> {title}
        </span>
        <button className="nxCopilot-x" data-testid="copilot-close" aria-label={`Close ${title}`} title="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <div className="nxCopilot-scroll" ref={scroller}>
        {msgs.length === 0 && !sending && (
          <div className="nxCopilot-empty">
            <Sparkles size={18} />
            {config?.emptyStateCopy && <p>{config.emptyStateCopy}</p>}
            {config?.suggestions && config.suggestions.length > 0 && (
              <div className="nxCopilot-suggest">
                {config.suggestions.map((s, i) => (
                  <button key={i} className="nxCopilot-chip" data-testid={`copilot-suggestion-${i}`} onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`nxCopilot-msg is-${m.role}`} data-testid={`copilot-msg-${m.role}`}>
            {m.role === "agent" && <div className="nxCopilot-avatar"><Mark mark={config?.mark} /></div>}
            <div className="nxCopilot-bubble">
              {m.role === "agent" ? (
                <>
                  {m.tools && m.tools.length > 0 && (
                    <div className="nxCopilot-tools">
                      {m.tools.map((t, k) => <span key={k} className="nxCopilot-tool" data-testid="copilot-tool"><Cog size={11} /> {t}</span>)}
                    </div>
                  )}
                  {renderMarkdown(m.content)}
                </>
              ) : m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="nxCopilot-msg is-agent">
            <div className="nxCopilot-avatar"><Mark mark={config?.mark} /></div>
            <div className="nxCopilot-bubble"><ThinkingDots label="Thinking" /></div>
          </div>
        )}
      </div>

      <div className="nxCopilot-inputbar">
        <textarea
          ref={inputRef} className="nxCopilot-input" data-testid="copilot-input" rows={1} value={input}
          placeholder={`Ask ${title}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
        />
        <button className="nxCopilot-send" data-testid="copilot-send" disabled={!input.trim() || sending} onClick={submit} aria-label="Send">
          <ArrowUp size={16} />
        </button>
      </div>
    </aside>
  );
}

/* CopilotToggle — the launch/toggle control. Host owns the open state + keybinding;
   this is the button (a keyboard hint is optional chrome). */
export function CopilotToggle({ open, onToggle, label = "Copilot", kbd }: { open: boolean; onToggle: () => void; label?: string; kbd?: string }) {
  return (
    <button
      className={`nxCopilotToggle${open ? " is-on" : ""}`}
      data-testid="copilot-toggle"
      aria-pressed={open}
      aria-label={`Toggle ${label}`}
      title={`Toggle ${label}`}
      onClick={onToggle}
    >
      <Sparkles size={14} /> <span>{label}</span>
      {kbd && <kbd className="nxCopilotToggle-kbd">{kbd}</kbd>}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, BUCKET, MAX_MB, mediaUrl } from "@/lib/supabase";

const CANVAS_N = 28;
const KIND_LABEL = { image: "Image", gif: "GIF", video: "Video", note: "Note", link: "Link", file: "File" };

const cap = s => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);
const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "folder";
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const fmtDate = d => { try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; } };
const fmtSize = b => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
function kindOf(it) {
  if (it.kind === "note" || it.kind === "link") return it.kind;
  const ct = it.content_type || "";
  if (ct === "image/gif") return "gif";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  return "file";
}
const isPic = it => it.storage_path && (kindOf(it) === "image" || kindOf(it) === "gif");
function spanFor(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; const r = h % 10; return r < 2 ? "w2 h2" : r < 4 ? "w2" : r < 6 ? "h2" : ""; }

export default function Board() {
  const [folders, setFolders] = useState([]);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [session, setSession] = useState(null);
  const [cur, setCur] = useState("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [canvas, setCanvas] = useState([]);
  const toastT = useRef();

  const toast = useCallback(m => { setToastMsg(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(""), 2800); }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [f, i] = await Promise.all([
      supabase.from("folders").select("*"),
      supabase.from("items").select("*").order("created_at", { ascending: false }).limit(5000),
    ]);
    if (f.error || i.error) { setLoadErr("Couldn't load the board. Reload to try again."); return; }
    setFolders(f.data); setItems(i.data); setLoaded(true); setLoadErr("");
  }, []);

  useEffect(() => {
    if (!supabase) return;
    load();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener("focus", onFocus); clearInterval(poll); };
  }, [load]);

  // hash routing: #folder-id
  useEffect(() => {
    const read = () => { const h = decodeURIComponent(location.hash.slice(1)); setCur(/^[a-z0-9-]+$/.test(h) ? h : ""); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = useCallback(id => { history.replaceState(null, "", id ? "#" + id : location.pathname); setCur(id); window.scrollTo({ top: 0 }); }, []);

  const byId = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);
  const children = useCallback(pid => folders.filter(f => (f.parent || "") === pid).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)), [folders]);
  const path = useCallback(id => { const out = []; let f = byId.get(id); while (f) { out.unshift(f); f = byId.get(f.parent); } return out; }, [byId]);
  const descendants = useCallback(function d(id) { return [id, ...children(id).flatMap(c => d(c.id))]; }, [children]);
  const countIn = useCallback(id => { const s = new Set(descendants(id)); return items.filter(i => s.has(i.folder)).length; }, [descendants, items]);
  const pathLabel = useCallback(id => path(id).map(f => cap(f.name)).join(" / "), [path]);

  const pics = useMemo(() => items.filter(isPic), [items]);
  // keep tiles already on screen, top up with random new ones
  useEffect(() => {
    setCanvas(prev => {
      const ids = new Set(pics.map(p => p.id));
      const keep = prev.filter(id => ids.has(id));
      return keep.concat(shuffle(pics.filter(p => !keep.includes(p.id)).map(p => p.id))).slice(0, CANVAS_N);
    });
  }, [pics]);
  // swap one tile every few seconds
  useEffect(() => {
    if (cur || q || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      setCanvas(prev => {
        const off = pics.filter(p => !prev.includes(p.id));
        if (!off.length || !prev.length) return prev;
        const next = [...prev];
        next[Math.floor(Math.random() * next.length)] = off[Math.floor(Math.random() * off.length)].id;
        return next;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [cur, q, pics]);

  if (!supabase) return <div className="notice">Setup needed: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the environment (see README).</div>;

  // members signed in with Google or email; guests get an anonymous session the first time they add something
  const member = !!session && !session.user.is_anonymous;
  const ensureSession = async () => {
    if (session) return session;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) { toast("Guest uploads aren't switched on yet. Sign in to add."); return null; }
    setSession(data.session);
    return data.session;
  };
  const f = byId.get(cur);
  const itemsById = new Map(items.map(i => [i.id, i]));
  const ctx = { folders, items, byId, children, path, pathLabel, descendants, countIn, session, member, ensureSession, toast, load, go, cur, setModal };
  const ql = q.trim().toLowerCase();
  const matches = it => !ql || [it.title, it.note, it.url, it.file_name, pathLabel(it.folder)].join(" ").toLowerCase().includes(ql);

  const Tree = ({ pid, depth }) => children(pid).map(fo => (
    <li key={fo.id}>
      <button className={"node" + (depth === 0 ? " brand" : "") + (cur === fo.id ? " on" : "")} onClick={() => go(fo.id)}>
        <span className="nm">{cap(fo.name)}</span><span className="ct">{countIn(fo.id) || ""}</span>
      </button>
      {children(fo.id).length > 0 && <ul><Tree pid={fo.id} depth={depth + 1} /></ul>}
    </li>
  ));

  let body;
  if (!loaded) body = <div className="notice">{loadErr || "Loading the team's board…"}</div>;
  else if (!f && !ql) {
    body = <>
      <div className="head">
        <div><h1>Everything, Shuffled</h1><div className="meta">{pics.length} images & GIFs · {folders.length} folders</div></div>
        <div className="toolbar">{pics.length > 1 && <button className="btn" onClick={() => setCanvas(shuffle(pics.map(p => p.id)).slice(0, CANVAS_N))}>↻ Shuffle</button>}</div>
      </div>
      <div className="canvas">
        {canvas.map(id => itemsById.get(id)).filter(Boolean).map(it => (
          <button key={it.id} className={"tile " + spanFor(it.id)} onClick={() => setModal({ type: "item", id: it.id })} aria-label={it.title || pathLabel(it.folder)}>
            <img src={mediaUrl(it.storage_path)} alt="" loading="lazy" />
            {kindOf(it) === "gif" && <span className="gif">GIF</span>}
            <span className="lbl">{pathLabel(it.folder)}{it.title ? " · " + it.title : ""}</span>
          </button>
        ))}
        {Array.from({ length: Math.max(0, 12 - canvas.length) }, (_, n) => <div key={"ph" + n} className={"tile ph" + (n === 0 && !canvas.length ? " w2 h2" : "")} />)}
      </div>
      {!pics.length && <div className="notice">The canvas fills itself with images and GIFs from every folder. Open a brand on the left and drop a few in to start.</div>}
      {children("").length > 0 && <section><p className="label" style={{ marginBottom: 8 }}>Brands</p><div className="folders">{children("").map(fo => <FolderCard key={fo.id} f={fo} ctx={ctx} />)}</div></section>}
    </>;
  } else {
    const scope = cur ? new Set(ql ? descendants(cur) : [cur]) : null;
    const list = items.filter(i => (!scope || scope.has(i.folder)) && byId.has(i.folder) && matches(i));
    const subs = children(cur);
    body = <>
      {f && <nav className="crumbs" aria-label="Breadcrumb"><button onClick={() => go("")}>Home</button>{path(cur).map(p => <span key={p.id}>/<button onClick={() => go(p.id)}>{cap(p.name)}</button></span>)}</nav>}
      <div className="head">
        <div><h1>{f ? cap(f.name) : "Search"}</h1>{f && <div className="meta">{countIn(f.id)} items</div>}</div>
        {f && <div className="toolbar">
          <button className="btn" onClick={() => setModal({ type: "note" })}>+ Note</button>
          <button className="btn" onClick={() => setModal({ type: "link" })}>+ Link</button>
          <button className="btn" onClick={() => setModal({ type: "folder", parent: f.id })}>+ Subfolder</button>
          {member && <button className="btn ghost" onClick={() => setModal({ type: "folder", parent: f.parent || "", existing: f })}>Edit</button>}
        </div>}
      </div>
      {f && <DropZone ctx={ctx} />}
      {subs.length > 0 && !ql && <section><p className="label" style={{ marginBottom: 8 }}>Subfolders</p><div className="folders">{subs.map(s => <FolderCard key={s.id} f={s} ctx={ctx} />)}</div></section>}
      {list.length ? <section><p className="label" style={{ marginBottom: 8 }}>{(ql ? `Results for “${q.trim()}”` : "Content") + " · " + list.length}</p><div className="board">{list.map(it => <ItemCard key={it.id} it={it} ctx={ctx} />)}</div></section>
        : ql ? <div className="empty"><h3>No Matches</h3>Try another keyword.</div>
        : <div className="empty"><h3>This Folder Is Empty</h3>Drop files above, or add the first note or link.</div>}
    </>;
  }

  return (
    <div className="app">
      <aside className="rail">
        <button className="logo" onClick={() => { setQ(""); go(""); }}><span className="mark" />Brand Idea Board</button>
        <input className="search" type="search" placeholder="Search names, notes…" aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />
        <p className="label">Brands</p>
        <ul className="tree"><Tree pid="" depth={0} /></ul>
        {member && <button className="btn wide" onClick={() => setModal({ type: "folder", parent: "" })}>+ New brand</button>}
        <div className="account">
          {member ? <>
            <span>Signed in as</span><span className="mono">{session.user.email}</span>
            <button className="btn sm ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
          </> : <>
            <span>Anyone can add images, notes and links. Sign in to edit or delete other people's posts.</span>
            <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setModal({ type: "auth" })}>Sign in</button>
          </>}
        </div>
      </aside>
      <main className="main">{body}</main>
      {modal?.type === "item" && itemsById.get(modal.id) && <ItemModal it={itemsById.get(modal.id)} ctx={ctx} close={() => setModal(null)} />}
      {modal?.type === "folder" && <FolderModal parent={modal.parent} existing={modal.existing} ctx={ctx} close={() => setModal(null)} />}
      {modal?.type === "note" && <NoteModal ctx={ctx} close={() => setModal(null)} />}
      {modal?.type === "link" && <LinkModal ctx={ctx} close={() => setModal(null)} />}
      {modal?.type === "auth" && <AuthModal ctx={ctx} close={() => setModal(null)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

function Thumb({ it }) {
  const k = kindOf(it);
  if ((k === "image" || k === "gif") && it.storage_path) return <img src={mediaUrl(it.storage_path)} alt="" loading="lazy" />;
  if (k === "video" && it.storage_path) return <video src={mediaUrl(it.storage_path) + "#t=0.5"} muted preload="metadata" />;
  return <div />;
}

function FolderCard({ f, ctx }) {
  const set = new Set(ctx.descendants(f.id));
  const media = ctx.items.filter(i => set.has(i.folder) && i.storage_path && ["image", "gif", "video"].includes(kindOf(i))).slice(0, 3);
  return (
    <button className="fcard" onClick={() => ctx.go(f.id)}>
      <div className="thumbs">{[0, 1, 2].map(n => (media[n] ? <Thumb key={n} it={media[n]} /> : <div key={n} />))}</div>
      <div className="fm"><b>{cap(f.name)}</b><span>{String(ctx.countIn(f.id)).padStart(2, "0")}</span></div>
    </button>
  );
}

function ItemCard({ it, ctx }) {
  const k = kindOf(it);
  const crumb = it.folder !== ctx.cur ? ctx.pathLabel(it.folder) : "";
  const sub = [crumb, fmtDate(it.created_at), it.author_email?.split("@")[0]].filter(Boolean).join(" · ");
  const open = () => ctx.setModal({ type: "item", id: it.id });
  if (k === "note") return (
    <button className="item note" onClick={open}>
      <div className="body">{it.note}</div>
      <div className="cap">{it.title && <b>{it.title}</b>}<small>{sub}</small></div>
    </button>
  );
  if (k === "link" || k === "file") return (
    <button className="item link" onClick={open}>
      <div className="body"><span className="ico">{k === "file" ? "PDF" : "↗"}</span>
        <div style={{ minWidth: 0 }}><b>{it.title || (k === "file" ? "Document" : "Link")}</b><div className="u">{k === "link" ? it.url : fmtSize(it.size_bytes || 0)}</div></div>
      </div>
      <div className="cap">{it.note && <small>{it.note.slice(0, 140)}</small>}<small>{sub}</small></div>
    </button>
  );
  return (
    <button className="item" onClick={open}>
      <Thumb it={it} />
      {k !== "image" && <span className="kind">{KIND_LABEL[k]}</span>}
      {(it.title || sub) && <div className="cap">{it.title && <b>{it.title}</b>}<small>{sub}</small></div>}
    </button>
  );
}

function DropZone({ ctx }) {
  const [over, setOver] = useState(false);
  const [prog, setProg] = useState("");
  const input = useRef();
  const upload = async files => {
    const s = await ctx.ensureSession(); if (!s) return;
    const email = s.user.is_anonymous ? null : s.user.email;
    const list = [...files]; const failed = []; let done = 0;
    setProg(`Uploading 0/${list.length}…`);
    for (const file of list) {
      if (file.size > MAX_MB * 1048576) failed.push(`${file.name} (over ${MAX_MB} MB, use + Link)`);
      else {
        const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
        const p = `${ctx.cur}/${crypto.randomUUID()}${ext}`;
        const up = await ctx_upload(p, file);
        if (up) failed.push(`${file.name} (${up})`);
        else {
          const { error } = await supabase.from("items").insert({
            folder: ctx.cur, kind: "file", storage_path: p, content_type: file.type || "application/octet-stream", size_bytes: file.size,
            file_name: file.name.slice(0, 200), title: file.name.replace(/\.[^.]+$/, "").slice(0, 120), author_email: email,
          });
          if (error) { failed.push(`${file.name} (couldn't save)`); supabase.storage.from(BUCKET).remove([p]); }
        }
      }
      done++; setProg(`Uploading ${done}/${list.length}…`);
    }
    setProg("");
    await ctx.load();
    ctx.toast(failed.length ? "Not uploaded: " + failed.join(", ") : `Uploaded ${list.length} file${list.length > 1 ? "s" : ""}`);
  };
  useEffect(() => {
    const onPaste = e => { if (document.querySelector(".scrim")) return; const fs = [...(e.clipboardData?.files || [])]; if (fs.length) upload(fs); };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });
  return (
    <div className={"drop" + (over ? " over" : "")}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
      <span>Drop images, GIFs or videos here, paste from clipboard, or{" "}
        <button className="btn sm" onClick={() => input.current.click()}>Browse</button></span>
      <span className="hint">{prog || `Max ${MAX_MB} MB per file · use + Link for longer videos`}</span>
      <input ref={input} type="file" multiple hidden accept="image/*,video/*,.gif,application/pdf" onChange={e => { upload(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
async function ctx_upload(path, file) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, cacheControl: "31536000" });
  if (!error) return "";
  return /size|large|exceed/i.test(error.message) ? "too large" : /mime|type/i.test(error.message) ? "unsupported format" : "upload failed";
}

function Modal({ close, wide, children }) {
  useEffect(() => {
    const esc = e => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [close]);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className={"dlg" + (wide ? " wide" : "")} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

async function run(ctx, fn, ok) {
  const { error } = await fn();
  if (error) { console.error(error); ctx.toast(/row-level|permission|JWT/i.test(error.message) ? "Sign in again to make changes." : "Couldn't save. Try again in a moment."); return false; }
  await ctx.load(); if (ok) ctx.toast(ok); return true;
}

function FolderModal({ parent, existing, ctx, close }) {
  const [name, setName] = useState(existing ? cap(existing.name) : "");
  const [confirm, setConfirm] = useState(false);
  const isBrand = !parent;
  const save = async () => {
    const n = cap(name.trim()).slice(0, 80); if (!n) return;
    if (existing) { if (await run(ctx, () => supabase.from("folders").update({ name: n }).eq("id", existing.id), "Saved")) close(); return; }
    if (!(await ctx.ensureSession())) return;
    const base = (parent ? parent + "-" : "") + slug(n);
    const id = ctx.byId.has(base) ? base + "-" + Math.random().toString(36).slice(2, 6) : base;
    if (await run(ctx, () => supabase.from("folders").insert({ id, name: n, parent: parent || null, sort: ctx.children(parent).length + 1 }), "Created " + n)) { close(); ctx.go(id); }
  };
  const n = existing ? ctx.countIn(existing.id) : 0, subs = existing ? ctx.descendants(existing.id).length - 1 : 0;
  return (
    <Modal close={close}>
      <h2>{existing ? "Edit Folder" : isBrand ? "New Brand" : "New Subfolder in " + cap(ctx.byId.get(parent)?.name)}</h2>
      <label>Name<input autoFocus value={name} placeholder={isBrand ? "e.g. Canon" : "e.g. Cinema"} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} /></label>
      {confirm && <div className="confirm">
        {n || subs ? <span>This folder still holds {n} items and {subs} subfolders. Move or delete them first.</span> : <>
          <span>Delete this empty folder? This can't be undone.</span>
          <div className="row"><button className="btn dng sm" onClick={async () => { if (await run(ctx, () => supabase.from("folders").delete().eq("id", existing.id), "Folder deleted")) { close(); ctx.go(existing.parent || ""); } }}>Delete</button></div>
        </>}
      </div>}
      <div className="row">
        {existing && <button className="btn dng" style={{ marginRight: "auto" }} onClick={() => setConfirm(true)}>Delete</button>}
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn pri" onClick={save}>{existing ? "Save" : "Create"}</button>
      </div>
    </Modal>
  );
}

function NoteModal({ ctx, close }) {
  const [title, setTitle] = useState(""); const [note, setNote] = useState("");
  const save = async () => {
    if (!note.trim()) return;
    const s = await ctx.ensureSession(); if (!s) return;
    if (await run(ctx, () => supabase.from("items").insert({ folder: ctx.cur, kind: "note", title: title.trim().slice(0, 120), note: note.slice(0, 20000), author_email: s.user.is_anonymous ? null : s.user.email }), "Note added")) close();
  };
  return (
    <Modal close={close}>
      <h2>New Note</h2>
      <label>Title<input autoFocus value={title} placeholder="Title (optional)" onChange={e => setTitle(e.target.value)} /></label>
      <label>Note<textarea value={note} placeholder="Idea, concept, caption, references…" onChange={e => setNote(e.target.value)} /></label>
      <div className="row"><button className="btn ghost" onClick={close}>Cancel</button><button className="btn pri" onClick={save}>Save Note</button></div>
    </Modal>
  );
}

function LinkModal({ ctx, close }) {
  const [url, setUrl] = useState(""); const [title, setTitle] = useState(""); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  const save = async () => {
    let u = url.trim(); if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
    try { new URL(u); } catch { setErr("That URL doesn't look right."); return; }
    const s = await ctx.ensureSession(); if (!s) return;
    if (await run(ctx, () => supabase.from("items").insert({ folder: ctx.cur, kind: "link", url: u.slice(0, 2000), title: title.trim().slice(0, 120), note: note.slice(0, 5000), author_email: s.user.is_anonymous ? null : s.user.email }), "Link added")) close();
  };
  return (
    <Modal close={close}>
      <h2>Add Link</h2>
      <p>For long videos, Google Drive files, YouTube, Behance, Pinterest…</p>
      <label>URL<input autoFocus type="url" value={url} placeholder="https://drive.google.com/…" onChange={e => { setUrl(e.target.value); setErr(""); }} /></label>
      <label>Title<input value={title} placeholder="e.g. TVC 60s rough cut" onChange={e => setTitle(e.target.value)} /></label>
      <label>Note<textarea style={{ minHeight: 70 }} value={note} onChange={e => setNote(e.target.value)} /></label>
      {err && <div className="err">{err}</div>}
      <div className="row"><button className="btn ghost" onClick={close}>Cancel</button><button className="btn pri" onClick={save}>Add Link</button></div>
    </Modal>
  );
}

function ItemModal({ it, ctx, close }) {
  const k = kindOf(it);
  // members edit anything; guests only what they added in this browser
  const can = ctx.member || (!!ctx.session && it.created_by === ctx.session.user.id);
  const [title, setTitle] = useState(it.title || ""); const [note, setNote] = useState(it.note || ""); const [folder, setFolder] = useState(it.folder);
  const [confirm, setConfirm] = useState(false);
  const src = it.storage_path ? mediaUrl(it.storage_path) : "";
  const opts = []; const add = (f, d) => { opts.push(<option key={f.id} value={f.id}>{"  ".repeat(d) + cap(f.name)}</option>); ctx.children(f.id).forEach(c => add(c, d + 1)); };
  ctx.children("").forEach(b => add(b, 0));
  let view;
  if ((k === "image" || k === "gif") && src) view = <img src={src} alt={it.title || ""} />;
  else if (k === "video" && src) view = <video src={src} controls playsInline />;
  else if (k === "note") view = <div className="notebig">{it.note}</div>;
  else if (k === "file") view = <a className="btn" href={src} target="_blank" rel="noopener">Open Document ↗</a>;
  else view = <a className="btn pri" href={it.url} target="_blank" rel="noopener noreferrer">Open Link ↗</a>;
  const save = async () => { if (await run(ctx, () => supabase.from("items").update({ title: title.trim().slice(0, 120), note: note.slice(0, 20000), folder }).eq("id", it.id), "Saved")) close(); };
  const del = async () => {
    if (await run(ctx, () => supabase.from("items").delete().eq("id", it.id), "Deleted")) {
      if (it.storage_path) supabase.storage.from(BUCKET).remove([it.storage_path]);
      close();
    }
  };
  return (
    <Modal close={close} wide>
      <div className="viewer">{view}</div>
      <div className="side">
        <span className="chip">{KIND_LABEL[k]} · {ctx.pathLabel(it.folder)}</span>
        <label>Title<input value={title} disabled={!can} onChange={e => setTitle(e.target.value)} /></label>
        <label>{k === "note" ? "Note" : "Notes"}<textarea value={note} disabled={!can} placeholder="Notes and ideas…" onChange={e => setNote(e.target.value)} /></label>
        <label>Folder<select value={folder} disabled={!can} onChange={e => setFolder(e.target.value)}>{opts}</select></label>
        <div className="who">{["Added " + fmtDate(it.created_at), "by " + (it.author_email ? it.author_email.split("@")[0] : "Guest"), it.file_name, it.size_bytes ? fmtSize(it.size_bytes) : ""].filter(Boolean).join(" · ")}</div>
        {src && <a className="btn sm" style={{ alignSelf: "flex-start" }} href={src} target="_blank" rel="noopener">Open Original ↗</a>}
        {confirm && <div className="confirm"><span>Delete this item? This can't be undone.</span>
          <div className="row"><button className="btn ghost sm" onClick={() => setConfirm(false)}>Keep</button><button className="btn dng sm" onClick={del}>Delete</button></div></div>}
        <div className="row">
          {can && <button className="btn dng sm" style={{ marginRight: "auto" }} onClick={() => setConfirm(true)}>Delete</button>}
          <button className="btn ghost" onClick={close}>Close</button>
          {can ? <button className="btn pri" onClick={save}>Save</button> : <button className="btn pri" onClick={() => ctx.setModal({ type: "auth" })}>Sign in to edit</button>}
        </div>
      </div>
    </Modal>
  );
}

function AuthModal({ ctx, close }) {
  const [mode, setMode] = useState("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const google = async () => {
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname + window.location.hash } });
    if (error) { setBusy(false); setErr(/not enabled|provider/i.test(error.message) ? "Google sign-in isn't switched on yet. Use email and password for now." : error.message); }
  };
  const submit = async e => {
    e.preventDefault(); setErr(""); setBusy(true);
    const fn = mode === "in" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email: email.trim(), password: pw });
    setBusy(false);
    if (error) { setErr(/invalid login/i.test(error.message) ? "Wrong email or password." : /registered/i.test(error.message) ? "This email already has an account. Sign in instead." : error.message); return; }
    if (mode === "up" && !data.session) { setErr("Check your inbox to confirm your email, then sign in."); return; }
    ctx.toast("Signed in"); close();
  };
  return (
    <Modal close={close}>
      <h2>{mode === "in" ? "Sign In" : "Create Account"}</h2>
      <p>Signing in lets you edit and delete any post and manage brands.</p>
      <button type="button" className="btn pri wide" disabled={busy} onClick={google} style={{ padding: "10px 14px" }}>
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continue with Google
      </button>
      <div className="who" style={{ textAlign: "center" }}>or use email and password</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>Email<input autoFocus type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={e => setPw(e.target.value)} /></label>
        {err && <div className="err">{err}</div>}
        <div className="row">
          <button type="button" className="btn ghost" style={{ marginRight: "auto" }} onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); }}>{mode === "in" ? "New here? Create account" : "Have an account? Sign in"}</button>
          <button type="submit" className="btn pri" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign In" : "Create Account"}</button>
        </div>
      </form>
    </Modal>
  );
}

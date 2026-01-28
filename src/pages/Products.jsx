import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext.jsx";

const rupeesToCents = (v) => Math.round(Number(String(v).replace(/[^0-9.]/g, "")) * 100) || 0;
const centsToRupeesStr = (c) => (Number(c || 0) / 100).toString();
const isUrl = (s) => { try { new URL(s); return true; } catch { return false; } };

// Always-clickable icon button
function IconBtn({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); console.log(`[IconBtn] ${title} clicked`); }}
      className="relative z-50 pointer-events-auto inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 shadow-sm"
    >
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, children, size = "sm" }) {
  // size: "sm" | "md" | "lg"
  if (!open) return null;

  const sizes = {
    sm: "max-w-xl",
    md: "max-w-2xl",
    lg: "max-w-3xl",
  };

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* panel */}
      <div className="absolute inset-0 flex items-start md:items-center justify-center p-3 md:p-6">
        <div className={`w-full ${sizes[size]} bg-white rounded-2xl shadow-soft border border-slate-100`}>
          <div className="flex items-center justify-between p-3 border-b border-slate-100">
            <h3 className="font-semibold text-sm">{title}</h3>
            <button type="button" onClick={onClose} className="h-8 px-2 rounded-lg hover:bg-slate-100">✕</button>
          </div>
          {/* Make only the content scroll, not the whole page */}
          <div className="p-3 max-h-[80vh] overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}


export default function Products() {
  const { user, can } = useAuth();

  // RBAC
  const canRead    = can?.(user, "products.read") || can?.(user, "products.view") || can?.(user, "products.list");
  const canCreate  = can?.(user, "products.create") || can?.(user, "products.write");
  const canUpdate  = can?.(user, "products.update") || can?.(user, "products.write");
  const canRemove  = can?.(user, "products.delete") || can?.(user, "products.write");

  const [list, setList] = useState([]);

  // Add/Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // View modal state
  const [viewOpen, setViewOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState(null);

  // Form state
  const [f, setF] = useState({
    image_url: "", images: [], video_url: "",
    name: "", description: "",
    price_rupees: "", printing_rupees: "",
    religion: "",
    material: "", orientation: "", dimension: "", weight: "", card_type: "", color_type: "",
    stock: 0,
  });
  const [errs, setErrs] = useState({});
  const [imgInput, setImgInput] = useState("");

  const isEditing = editingId !== null;

  // Load list
  const load = async () => {
    if (!canRead) { setList([]); return; } // 🚫 guard
    try {
      const res = await api.get("/api/products");
      setList(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || e.message || "Failed to load products");
    }
  };
  useEffect(() => { load(); }, [canRead]);

  function resetForm() {
    setF({
      image_url: "", images: [], video_url: "",
      name: "", description: "",
      price_rupees: "", printing_rupees: "",
      religion: "",
      material: "", orientation: "", dimension: "", weight: "", card_type: "", color_type: "",
      stock: 0,
    });
    setErrs({});
    setImgInput("");
    setEditingId(null);
  }

  function openAddModal() { if (!canCreate) return alert("Not allowed"); resetForm(); setModalOpen(true); }

  function openEditModal(p) {
    if (!canUpdate) return alert("Not allowed");
    setEditingId(p.id);
    setF({
      image_url: p.image_url || "",
      images: Array.isArray(p.images) ? p.images : [],
      video_url: p.video_url || "",
      name: p.name || "",
      description: p.description || "",
      price_rupees: centsToRupeesStr(p.price_cents),
      printing_rupees: centsToRupeesStr(p.printing_price_cents),
      religion: p.religion || "",
      material: p.details?.material || "",
      orientation: p.details?.orientation || "",
      dimension: p.details?.dimension || "",
      weight: p.details?.weight || "",
      card_type: p.details?.card_type || "",
      color_type: p.details?.color_type || "",
      stock: Number(p.stock || 0),
    });
    setModalOpen(true);
  }

  function openView(p) { setViewProduct(p); setViewOpen(true); }

  const validate = () => {
    const e = {};
    if (!f.image_url.trim() || !isUrl(f.image_url)) e.image_url = "Valid cover image URL required";
    if (!f.name.trim()) e.name = "Product name required";
    if (rupeesToCents(f.price_rupees) <= 0) e.price = "Price must be > 0";
    if (Number(f.stock) < 0) e.stock = "Stock cannot be negative";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  function addImg() {
    const u = imgInput.trim();
    if (!u) return;
    if (!isUrl(u)) return alert("Please enter a valid image URL");
    if (f.images.includes(u)) return alert("Already added");
    setF((p) => ({ ...p, images: [...p.images, u] }));
    setImgInput("");
  }
  function removeImg(u) { setF((p) => ({ ...p, images: p.images.filter((x) => x !== u) })); }

  async function save() {
    try {
      if (!validate()) return;
      const payload = {
        image_url: f.image_url.trim(),
        images: f.images,
        video_url: f.video_url.trim() || null,
        name: f.name.trim(),
        description: f.description.trim(),
        price_cents: rupeesToCents(f.price_rupees),
        printing_price_cents: rupeesToCents(f.printing_rupees),
        religion: f.religion.trim() || null,
        details: {
          material: f.material.trim() || null,
          orientation: f.orientation.trim() || null,
          dimension: f.dimension.trim() || null,
          weight: f.weight.trim() || null,
          card_type: f.card_type.trim() || null,
          color_type: f.color_type.trim() || null,
        },
        stock: Math.max(0, Number(f.stock || 0)),
      };

      if (isEditing) {
        if (!canUpdate) return alert("Not allowed");
        await api.patch(`/api/products/${editingId}`, payload);
        alert("✅ Product updated");
      } else {
        if (!canCreate) return alert("Not allowed");
        await api.post(`/api/products`, payload);
        alert("✅ Product created");
      }

      setModalOpen(false);
      resetForm();
      await load();
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || e.message || "Failed");
    }
  }

  async function onDelete(id) {
    if (!canRemove) return alert("Not allowed");
    if (!confirm("Delete this product?")) return;
    await api.delete(`/api/products/${id}`);
    await load();
  }

  if (!canRead) {
    return (
      <div className="relative z-10 grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Products</h2>
        </div>
        <div className="p-4 rounded-xl border bg-amber-50 text-amber-900">
          You don’t have permission to view products.
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 grid gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Products</h2>
        {canCreate && (
          <button
            type="button"
            onClick={openAddModal}
            className="relative z-50 pointer-events-auto btn btn-primary h-9 px-3 text-sm"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* LIST */}
      <div className="card p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="text-left font-medium pb-1 px-2">ID</th>
                <th className="text-left font-medium pb-1 px-2">Cover</th>
                <th className="text-left font-medium pb-1 px-2">Name</th>
                <th className="text-left font-medium pb-1 px-2">Price</th>
                <th className="text-left font-medium pb-1 px-2">Printing</th>
                <th className="text-left font-medium pb-1 px-2">Stock</th>
                <th className="text-left font-medium pb-1 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-2 py-2 align-middle">{p.id}</td>
                  <td className="px-2 py-2 align-middle">
                    {p.image_url ? (
                      <img src={p.image_url} className="h-10 w-10 rounded-md object-cover border border-slate-200" />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-slate-100 grid place-items-center text-slate-400">–</div>
                    )}
                  </td>
                  <td className="px-2 py-2 align-middle font-medium truncate max-w-[220px]" title={p.name}>{p.name}</td>
                  <td className="px-2 py-2 align-middle">₹ {(p.price_cents / 100).toFixed(2)}</td>
                  <td className="px-2 py-2 align-middle">₹ {(p.printing_price_cents / 100).toFixed(2)}</td>
                  <td className="px-2 py-2 align-middle">{p.stock}</td>
                  <td className="px-2 py-2 align-middle">
                    <div className="flex gap-1">
                      <IconBtn title="View" onClick={() => openView(p)}>👁</IconBtn>
                      {canUpdate && (
                        <IconBtn title="Edit" onClick={() => openEditModal(p)}>✎</IconBtn>
                      )}
                      {canRemove && (
                        <IconBtn title="Delete" onClick={() => onDelete(p.id)}>🗑</IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-slate-500">No products yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); resetForm(); }}
        title={isEditing ? `Edit Product #${editingId}` : 'Add Product'}
        size="md"
      >
        <div className="grid md:grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-slate-600">Cover Image URL *</span>
            <input className={"input text-sm " + (errs.image_url ? "ring-2 ring-red-500" : "")} placeholder="https://..." value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} />
            {errs.image_url && <span className="text-xs text-red-600">{errs.image_url}</span>}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-slate-600">Video URL</span>
            <input className="input text-sm" placeholder="https://youtube.com/watch?v=..." value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} />
          </label>
        </div>

        {/* Gallery URLs */}
  <div className="grid md:grid-cols-[1fr_auto] gap-2 mt-3">
    <input className="input text-sm" placeholder="Add image URL and click Add" value={imgInput} onChange={(e) => setImgInput(e.target.value)} />
    <button type="button" className="btn h-9 px-3 text-sm" onClick={addImg}>Add Image</button>
  </div>
  {!!f.images.length && (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {f.images.map((u) => (
        <div key={u} className="relative">
          <img src={u} alt="" className="w-full h-16 object-cover rounded-md border border-slate-200" />
          <button type="button" className="absolute top-1 right-1 h-6 px-2 rounded bg-white/80 hover:bg-white border border-slate-200" onClick={() => removeImg(u)}>✕</button>
        </div>
      ))}
    </div>
  )}

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-slate-600">Product Name</span>
            <input className={"input text-sm " + (errs.name ? "ring-2 ring-red-500" : "")} placeholder="Premium Royal Peacock Invite" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            {errs.name && <span className="text-xs text-red-600">{errs.name}</span>}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-slate-600">Religion</span>
            <input className="input text-sm" placeholder="Hindu / Muslim / Sikh / Christian / Other" value={f.religion} onChange={(e) => setF({ ...f, religion: e.target.value })} />
          </label>
        </div>

        <label className="grid gap-1 text-sm mt-3">
          <span className="text-xs text-slate-600">Product Description</span>
          <textarea className="input text-sm min-h-[120px]" placeholder="Write long description…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>

        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-slate-600">Price (₹)</span>
            <input className={"input text-sm " + (errs.price ? "ring-2 ring-red-500" : "")} placeholder="2499" value={f.price_rupees} onChange={(e) => setF({ ...f, price_rupees: e.target.value })} />
            {errs.price && <span className="text-xs text-red-600">{errs.price}</span>}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-slate-600">Printing Price (₹)</span>
            <input className="input text-sm" placeholder="499" value={f.printing_rupees} onChange={(e) => setF({ ...f, printing_rupees: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-slate-600">Available Stock</span>
            <input className={"input text-sm " + (errs.stock ? "ring-2 ring-red-500" : "")} type="number" min="0" value={f.stock} onChange={(e) => setF({ ...f, stock: Number(e.target.value || 0) })} />
            {errs.stock && <span className="text-xs text-red-600">{errs.stock}</span>}
          </label>
        </div>

        <div className="card p-3 mt-3">
          <h4 className="font-semibold text-sm mb-2">Product Details</h4>
          <div className="grid md:grid-cols-2 gap-2">
            <input className="input text-sm" placeholder="Card Material" value={f.material} onChange={e=>setF({...f, material:e.target.value})}/>
            <input className="input text-sm" placeholder="Orientation (Portrait/Landscape)" value={f.orientation} onChange={e=>setF({...f, orientation:e.target.value})}/>
            <input className="input text-sm" placeholder="Dimension (e.g., 7 x 5 inches)" value={f.dimension} onChange={e=>setF({...f, dimension:e.target.value})}/>
            <input className="input text-sm" placeholder="Weight (e.g., 250 GSM)" value={f.weight} onChange={e=>setF({...f, weight:e.target.value})}/>
            <input className="input text-sm" placeholder="Card Type (Single/Folded/Scroll…)" value={f.card_type} onChange={e=>setF({...f, card_type:e.target.value})}/>
            <input className="input text-sm" placeholder="Color Type (Pastel/Gold Foil/Multicolor…)" value={f.color_type} onChange={e=>setF({...f, color_type:e.target.value})}/>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button type="button" className="btn btn-primary h-9 px-3 text-sm" onClick={save}>{isEditing ? 'Update' : 'Save'}</button>
          <button type="button" className="h-9 px-3 rounded-lg border border-slate-200" onClick={() => { setModalOpen(false); resetForm(); }}>Cancel</button>
          <span className="text-xs text-slate-500">Prices saved in paise (₹×100).</span>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={viewProduct ? `Product #${viewProduct.id}` : 'Product'}
        size="sm" 
      >
        {viewProduct && (
          <div className="grid gap-3 text-sm">
            <div className="grid md:grid-cols-[160px_1fr] gap-3">
              <img
                src={viewProduct.image_url}
                className="w-full h-36 object-cover rounded-xl border border-slate-200"
                alt=""
              />
              <div className="grid gap-1">
                <div className="text-base font-semibold">{viewProduct.name || "—"}</div>
                <div className="text-slate-600">
                  ₹ {(Number(viewProduct.price_cents || 0)/100).toFixed(2)}
                  {viewProduct.printing_price_cents
                    ? ` • Printing ₹ ${(Number(viewProduct.printing_price_cents)/100).toFixed(2)}`
                    : ""}
                </div>
                <div className="text-slate-600">Stock: {viewProduct.stock ?? 0}</div>
                {viewProduct.religion && <div className="text-slate-600">Religion: {viewProduct.religion}</div>}
              </div>
            </div>

            {Array.isArray(viewProduct.images) && viewProduct.images.length > 0 && (
              <div>
                <div className="text-xs text-slate-600 mb-1">Gallery</div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {viewProduct.images.map((u, i) => (
                    <img key={u + i} src={u} className="w-full h-16 object-cover rounded-lg border border-slate-200" alt="" />
                  ))}
                </div>
              </div>
            )}

            {viewProduct.description && (
              <div>
                <div className="text-xs text-slate-600 mb-1">Description</div>
                <div className="whitespace-pre-wrap text-sm text-slate-800">{viewProduct.description}</div>
              </div>
            )}

            {viewProduct.details && Object.values(viewProduct.details).some(Boolean) && (
              <div className="p-3 rounded-xl border border-slate-100">
                <div className="text-xs font-semibold mb-2">Details</div>
                <div className="grid md:grid-cols-2 gap-2 text-sm">
                  {[
                    ["Material", viewProduct.details.material],
                    ["Orientation", viewProduct.details.orientation],
                    ["Dimension", viewProduct.details.dimension],
                    ["Weight", viewProduct.details.weight],
                    ["Card Type", viewProduct.details.card_type],
                    ["Color Type", viewProduct.details.color_type],
                  ].map(([k, v]) =>
                    v ? (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <div className="text-slate-600">{k}</div>
                        <div className="font-medium">{v}</div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {viewProduct.video_url && (
              <div>
                <div className="text-xs text-slate-600 mb-1">Video</div>
                {viewProduct.video_url.includes("youtube.com") || viewProduct.video_url.includes("youtu.be") ? (
                  <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-200">
                    <iframe
                      className="w-full h-full"
                      src={toYouTubeEmbed(viewProduct.video_url)}
                      title="Video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a className="text-indigo-600 underline" href={viewProduct.video_url} target="_blank" rel="noreferrer">
                    Open video
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function toYouTubeEmbed(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}
  return url;
}

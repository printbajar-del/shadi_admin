// src/pages/Coupons.jsx
import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext.jsx'
import { useEmployeeAuth } from '../context/EmployeeAuthContext.jsx'
import useEmployeePermissions from '../hooks/useEmployeePermissions'

export default function Coupons(){
  const { token: adminToken, user: adminUser } = useAuth()
  const { token: empToken } = useEmployeeAuth()
  const { can } = useEmployeePermissions()

  const isAdmin = !!adminUser
  const headers = useMemo(()=>{
    const t = adminToken || empToken
    return t ? { Authorization:'Bearer '+t } : {}
  },[adminToken, empToken])

  // granular permissions
  const canRead   = isAdmin ? true : (can('coupons.read') || can('coupons.view') || can('coupons.list'))
  const canCreate = isAdmin ? true : (can('coupons.create') || can('coupons.write'))
  const canUpdate = isAdmin ? true : (can('coupons.update') || can('coupons.write'))
  const canDelete = isAdmin ? true : (can('coupons.delete') || can('coupons.write'))

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)

  // Modal state: 'closed' | 'create' | 'edit' | 'view'
  const [mode, setMode] = useState('closed')
  const [current, setCurrent] = useState(null)

  const blank = { id:null, code:'', discount_percent:10, active:true, expires_at:'', customer_id: null }
  const [form, setForm] = useState(blank)

  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [query, setQuery] = useState('')

  const load = async()=>{
    if (!canRead) return; // 🚫 no fetch without read
    try{
      setLoading(true)
      const { data } = await api.get('/api/admin/coupons', { headers })
      setList(data || [])
    } finally{
      setLoading(false)
    }
  }
  useEffect(()=>{ load() },[adminToken, empToken, canRead])

  const fetchCustomerById = async (id)=>{
    if(!id) return null
    try{
      const { data } = await api.get(`/api/admin/customers/${id}`, { headers })
      return data || null
    }catch{ return null }
  }

  const openCreate = ()=>{
    if (!canCreate) return alert('Not allowed')
    setForm(blank); setSelectedCustomer(null); setCurrent(null); setMode('create')
  }
  const openEdit = async (c)=>{
    if (!canUpdate) return alert('Not allowed')
    const expires_at = toDatetimeLocalValue(c.expires_at)
    setForm({ ...c, expires_at, customer_id: c.customer_id ?? null })
    setCurrent(c)
    const cust = await fetchCustomerById(c.customer_id)
    setSelectedCustomer(cust ? { id: cust.id, name: cust.name || (cust.first_name ? `${cust.first_name} ${cust.last_name||''}`.trim() : cust.email || cust.phone || cust.id), email: cust.email, phone: cust.phone } : null)
    setMode('edit')
  }
  const openView = async (c)=>{
    setCurrent(c); setSelectedCustomer(null)
    const cust = await fetchCustomerById(c.customer_id)
    setSelectedCustomer(cust ? { id: cust.id, name: cust.name || (cust.first_name ? `${cust.first_name} ${cust.last_name||''}`.trim() : cust.email || cust.phone || cust.id), email: cust.email, phone: cust.phone } : null)
    setMode('view')
  }
  const closeModal = ()=>{ setMode('closed'); setCurrent(null); setForm(blank); setSelectedCustomer(null) }

  const save = async()=>{
    // create or update
    if (form.id ? !canUpdate : !canCreate) return alert('Not allowed')
    const payload = { ...form }
    if (!payload.expires_at) payload.expires_at = null
    if (payload.code) payload.code = payload.code.toUpperCase()
    payload.customer_id = selectedCustomer?.id || null

    if (form.id){
      await api.put('/api/admin/coupons/'+form.id, payload, { headers })
    } else {
      await api.post('/api/admin/coupons', payload, { headers })
    }
    closeModal(); await load()
  }

  const del = async(id)=>{
    if (!canDelete) return alert('Not allowed')
    if (!confirm('Delete this coupon?')) return
    await api.delete('/api/admin/coupons/'+id, { headers })
    await load()
  }

  const filtered = useMemo(()=>{
    if(!query) return list
    const q = query.toLowerCase()
    return list.filter(c => (c.code || '').toLowerCase().includes(q))
  },[list, query])

  // 🚫 UI for no read access
  if (!canRead) {
    return (
      <div className="section">
        <h2 className="text-xl font-semibold mb-2">Coupons</h2>
        <div className="p-4 rounded-xl border bg-amber-50 text-amber-900">
          You don’t have permission to view coupons.
        </div>
      </div>
    )
  }

  return (
    <div className="section space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-[220px]">
          <h2 className="text-xl font-semibold">Coupons</h2>
          <p className="text-sm text-slate-500">Create, view, edit and manage discount codes</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input type="text" placeholder="Search coupon code…" className="input w-full sm:w-72" value={query} onChange={e=>setQuery(e.target.value)} />
          {canCreate && <button className="btn btn-primary whitespace-nowrap" onClick={openCreate}>+ Add Coupon</button>}
        </div>
      </div>

      <div className="flex justify-center">
        <div className="card w-full max-w-4xl">
          <div className="overflow-x-auto">
            <table className="w-full border border-slate-200 text-sm rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <th className="px-3 py-2 text-center w-14">ID</th>
                  <th className="px-3 py-2 text-center">Code</th>
                  <th className="px-3 py-2 text-center">Discount</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Expires</th>
                  <th className="px-3 py-2 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No coupons found</td></tr>}
                {!loading && filtered.map(c=>{
                  const expired = isExpired(c.expires_at)
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition">
                      <td className="px-3 py-2 text-center text-slate-500 text-xs">{c.id}</td>
                      <td className="px-3 py-2 text-center font-medium tracking-wide">{c.code}</td>
                      <td className="px-3 py-2 text-center">{c.discount_percent}%</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Badge color={c.active ? 'green' : 'slate'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                          {c.expires_at && <Badge color={expired ? 'red' : 'amber'}>{expired ? 'Expired' : 'Expiring'}</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap text-slate-600 text-xs">
                        {c.expires_at ? safeDate(c.expires_at) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <IconButton title="View" onClick={()=>openView(c)}><EyeIcon /></IconButton>
                          {canUpdate && <IconButton title="Edit" onClick={()=>openEdit(c)}><PencilIcon /></IconButton>}
                          {canDelete && <IconButton title="Delete" onClick={()=>del(c.id)}><TrashIcon /></IconButton>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={mode !== 'closed'}
        onClose={closeModal}
        title={mode === 'create' ? 'Create Coupon' : mode === 'edit' ? 'Edit Coupon' : 'Coupon Details'}
      >
        {mode === 'view' && current && (
          <div className="space-y-3">
            <KV label="ID" value={current.id} />
            <KV label="Code" value={current.code} />
            <KV label="Discount" value={`${current.discount_percent}%`} />
            <KV label="Active" value={current.active ? 'Yes' : 'No'} />
            <KV label="Expires" value={current.expires_at ? safeDate(current.expires_at) : '—'} />
            <KV label="Customer">
              {selectedCustomer ? (
                <span className="font-medium">{selectedCustomer.name}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : selectedCustomer.email ? ` · ${selectedCustomer.email}` : ''}</span>
              ) : '— (All customers)'}
            </KV>
            <div className="pt-2 flex justify-end">
              {canUpdate && (
                <button className="btn" onClick={()=>{ setMode('edit'); setForm({ ...current, expires_at: toDatetimeLocalValue(current.expires_at) }) }}>
                  Edit
                </button>
              )}
            </div>
          </div>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <CouponEditor
            form={form}
            setForm={setForm}
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            headers={headers}
            onCancel={closeModal}
            onSave={save}
          />
        )}
      </Modal>
    </div>
  )
}

/* ---------- Extracted editor ---------- */
function CouponEditor({ form, setForm, selectedCustomer, setSelectedCustomer, headers, onCancel, onSave }){
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <input className="input" placeholder="CODE" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} />
        <input className="input" type="number" placeholder="Discount %" value={form.discount_percent} onChange={e=>setForm({...form,discount_percent:Number(e.target.value||0)})} />
        <input className="input" type="datetime-local" value={form.expires_at} onChange={e=>setForm({...form,expires_at:e.target.value})} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!form.active} onChange={e=>setForm({...form,active:e.target.checked})} />
          Active
        </label>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-slate-600">Specific Customer (optional)</label>
        <CustomerSelect
          headers={headers}
          value={selectedCustomer}
          onChange={(cust)=>{
            setSelectedCustomer(cust)
            setForm(f=>({ ...f, customer_id: cust?.id || null }))
          }}
        />
        <p className="text-xs text-slate-500">Leave empty to allow for all customers.</p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={onSave}>{form.id ? 'Save Changes' : 'Add Coupon'}</button>
      </div>
    </div>
  )
}

/* ───────────── CustomerSelect (same as before) ───────────── */
function CustomerSelect({ headers, value, onChange }){
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [timer, setTimer] = useState(null)

  const fetchOpts = async (query)=>{
    setLoading(true)
    try{
      const { data } = await api.get(`/api/admin/customers?q=${encodeURIComponent(query||'')}`, { headers })
      const items = (data?.items || data || []).slice(0, 10)
      const mapped = items.map(x=>({
        id: x.id,
        name: x.name || (x.first_name ? `${x.first_name} ${x.last_name||''}`.trim() : (x.email || x.phone || 'Unnamed')),
        phone: x.phone || '',
        email: x.email || '',
      }))
      setOpts(mapped)
    }catch{
      setOpts([])
    }finally{
      setLoading(false)
    }
  }

  const onInputChange = (v)=>{
    setQ(v); setOpen(true)
    if (timer) clearTimeout(timer)
    const t = setTimeout(()=>fetchOpts(v), 250)
    setTimer(t)
  }

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{value.name}</div>
            <div className="text-xs text-slate-500 truncate">{value.phone || value.email || value.id}</div>
          </div>
          <button type="button" className="ml-3 text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200" onClick={()=>{ onChange(null); setQ(''); setOpen(false) }}>
            Clear
          </button>
        </div>
      ) : (
        <input className="input" placeholder="Search by name / phone / email" value={q} onChange={e=>onInputChange(e.target.value)} onFocus={()=>{ setOpen(true); if(!opts.length) fetchOpts('') }} />
      )}

      {open && !value && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-auto">
          {loading && <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>}
          {!loading && opts.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No customers</div>}
          {!loading && opts.map(opt=>(
            <button key={opt.id} type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={()=>{ onChange(opt); setOpen(false) }}>
              <div className="font-medium">{opt.name}</div>
              <div className="text-xs text-slate-500">{opt.phone || opt.email || opt.id}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────── UI bits ───────────────────────────── */
function KV({ label, value, children }){ return (<div className="flex items-center justify-between border-b last:border-b-0 pb-2"><span className="text-slate-500">{label}</span><span className="font-medium">{children ?? String(value)}</span></div>) }
function Badge({ color='slate', children }){ const map={slate:'bg-slate-100 text-slate-700',green:'bg-green-100 text-green-700',red:'bg-red-100 text-red-700',amber:'bg-amber-100 text-amber-800'}; return (<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[color]||map.slate}`}>{children}</span>) }
function IconButton({ title, onClick, children }){ return (<button className="p-2 rounded-lg hover:bg-slate-100 transition" onClick={onClick} title={title} aria-label={title} type="button"><span className="inline-block w-5 h-5">{children}</span></button>) }
function Modal({ open, onClose, title, children }){ if (!open) return null; return (<div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/30" onClick={onClose} /><div className="absolute inset-0 flex items-center justify-center p-4"><div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border"><div className="flex items-center justify-between px-4 py-3 border-b"><h3 className="font-semibold">{title}</h3><button className="p-2 rounded hover:bg-slate-100" onClick={onClose} aria-label="Close"><CloseIcon /></button></div><div className="p-4">{children}</div></div></div></div>) }
function EyeIcon(){ return (<svg viewBox="0 0 24 24" fill="none"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/></svg>) }
function PencilIcon(){ return (<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l4.5-1 9.5-9.5a2.1 2.1 0 10-3-3L5.5 16 4 20Z" stroke="currentColor" strokeWidth="1.6"/><path d="M14 6l4 4" stroke="currentColor" strokeWidth="1.6"/></svg>) }
function TrashIcon(){ return (<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16" stroke="currentColor" strokeWidth="1.6"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.6"/><path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" stroke="currentColor" strokeWidth="1.6"/></svg>) }
function CloseIcon(){ return (<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8"/></svg>) }
function safeDate(isoish){ try{ const d = new Date(isoish); if (isNaN(d.getTime())) return '—'; return d.toLocaleString() }catch{ return '—' } }
function isExpired(isoish){ if (!isoish) return false; const d = new Date(isoish); if (isNaN(d.getTime())) return false; return d.getTime() < Date.now() }
function toDatetimeLocalValue(isoish){ if (!isoish) return ''; const d = new Date(isoish); if (isNaN(d.getTime())) return ''; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }

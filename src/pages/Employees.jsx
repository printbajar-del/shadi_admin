// src/pages/Employees.jsx
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from "../context/AuthContext.jsx";

// ======================= useApi (inline) =======================
function useApi() {
  const { token } = useAuth();

  async function apiJson(path, opts = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(
      (import.meta.env.VITE_API_URL || "http://localhost:5000") + path,
      { ...opts, headers, credentials: "include" }
    );

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const err = new Error(t || res.statusText);
      try { err.json = JSON.parse(t); } catch {}
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  return { apiJson };
}

// =============================================================
// Employees Admin — RBAC-guarded
// =============================================================
export default function Employees(){
  const { apiJson } = useApi();
  const { token, ready, can } = useAuth();

  // RBAC gates
  const canRead    = !!(can?.("employees.read"));
  const canCreate  = !!(can?.("employees.create"));
  const canUpdate  = !!(can?.("employees.update"));
  const canDelete  = !!(can?.("employees.delete"));
  const canAssign  = !!(can?.("roles.assign") || can?.("employees.update"));

  const [q,setQ] = useState('');
  const [list,setList] = useState([]);
  const [total,setTotal] = useState(0);
  const [page,setPage] = useState(1);
  const pageSize = 20;

  const [roles,setRoles] = useState([]);
  const [modal,setModal] = useState(null); // 'create' | 'edit' | 'view' | 'password' | 'advance' | 'permissions' | null
  const [current,setCurrent] = useState(null);
  const [toast, setToast] = useState('');

  // Master perm keys (for overrides UI)
  const ALL_PERMS = [
    'coupons.read','coupons.write',
    'customers.read','customers.write',
    'employees.read','employees.write',
    'orders.read','orders.write',
    'payments.read','payments.write',
    'products.read','products.write',
    'payroll.read','payroll.generate','payroll.process','payroll.pay',
  ];
  const [permKeys, setPermKeys] = useState(ALL_PERMS);
  const [empPerms, setEmpPerms] = useState({}); // perm_key -> true | false | null

  const totalPages = useMemo(()=> Math.max(1, Math.ceil(Number(total||0)/pageSize)), [total, pageSize]);

  function closeModal(){ setModal(null); setCurrent(null); }
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''), 1600); }

  async function refresh(){
    if (!canRead) { setList([]); setTotal(0); return; }
    const data = await apiJson(`/api/admin/employees?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
    setList(data.items || []);
    setTotal(Number(data.total || 0));
  }

  async function loadRoles(){
    const data = await apiJson(`/api/admin/roles`);
    setRoles(Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));
  }

  async function loadPermKeys(){
    try{
      const data = await apiJson(`/api/admin/permissions`);
      const arr = (data.items || data || []).map(x => x.perm_key || x.key || x.name).filter(Boolean);
      if(arr.length) setPermKeys(Array.from(new Set([...ALL_PERMS, ...arr])));
    }catch{/* fallback */}
  }

  useEffect(()=>{ if(ready && token) refresh() }, [q, page, ready, token, canRead]);
  useEffect(()=>{ if(ready && token) { loadRoles(); loadPermKeys(); } }, [ready, token]);

  if (!ready) return <div className="p-3 text-sm text-gray-500">Loading…</div>;
  if (!token || !canRead) {
    return (
      <div className="p-3 text-sm">
        <div className="rounded border bg-amber-50 text-amber-800 p-3">
          { !token ? "Unauthorized – please login as Admin." : "You don’t have permission to view Employees." }
        </div>
      </div>
    );
  }

  function blank(){
    return {
      emp_code:'', first_name:'', last_name:'',
      email:'', phone:'', role_id:'',
      status:'active', joined_on:'',
      salary_ctc:0, salary_monthly:0,
      password:''
    };
  }

  async function save(form){
    const body = {
      emp_code: form.emp_code || '',
      first_name: form.first_name || '',
      last_name: form.last_name || '',
      email: form.email || null,
      phone: form.phone || null,
      role_id: form.role_id ? Number(form.role_id) : null,
      status: form.status || 'active',
      joined_on: form.joined_on || null,
      salary_ctc: Number(form.salary_ctc || 0),
      salary_monthly: Number(form.salary_monthly || 0)
    };

    if(modal==='create'){
      if (!canCreate) return alert("Not allowed");
      const createBody = { ...body, password: form.password || '' };
      await apiJson(`/api/admin/employees`, { method: 'POST', body: JSON.stringify(createBody) });
      showToast('Employee created');
    }
    if(modal==='edit' && current?.id){
      if (!canUpdate) return alert("Not allowed");
      await apiJson(`/api/admin/employees/${current.id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Employee updated');
    }
    closeModal(); refresh();
  }

  async function onResetPassword(newPass){
    if (!canUpdate) return alert("Not allowed");
    await apiJson(`/api/admin/employees/${current.id}/reset-password`, {
      method: 'POST', body: JSON.stringify({ new_password: newPass }),
    });
    closeModal(); showToast('Password updated');
  }

  async function onAddAdvance(a){
    if (!canUpdate) return alert("Not allowed");
    try{
      await apiJson(`/api/admin/employees/${current.id}/salary-advance`, {
        method: 'POST', body: JSON.stringify({
          amount: Number(a.amount || 0), reason: a.reason || '', issued_on: a.issued_on || null
        })
      });
    }catch(e){
      if(e.status === 404){
        await apiJson(`/api/admin/salary-advances`, { method: 'POST', body: JSON.stringify({
          employee_id: current.id, amount: Number(a.amount || 0), reason: a.reason || '', issued_on: a.issued_on || null
        })});
      }else{ throw e; }
    }
    closeModal(); showToast('Advance added');
  }

  // -------------------- RBAC overrides --------------------
  async function openPermissions(emp){
    if (!canAssign) return alert("Not allowed");
    setCurrent(emp); setModal('permissions');
    try{
      const data = await apiJson(`/api/admin/employees/${emp.id}/permissions`);
      const map = {};
      for(const row of (data.items || data || [])){
        map[row.perm_key] = (row.allowed === true) ? true : (row.allowed === false) ? false : null;
      }
      const filled = {};
      for(const k of permKeys){ filled[k] = (k in map) ? map[k] : null; }
      setEmpPerms(filled);
    }catch{
      const empty = {}; for(const k of permKeys){ empty[k] = null }; setEmpPerms(empty);
    }
  }

  async function savePermissions(){
    if(!current?.id) return;
    if (!canAssign) return alert("Not allowed");
    const payload = Object.entries(empPerms)
      .filter(([,v]) => v !== null)
      .map(([perm_key, allowed])=>({ perm_key, allowed }));
    await apiJson(`/api/admin/employees/${current.id}/permissions`, {
      method: 'PUT', body: JSON.stringify({ permissions: payload })
    });
    showToast('Overrides saved'); closeModal();
  }

  async function onDelete(emp){
    if (!canDelete) return alert("Not allowed");
    if(!emp?.id) return; if(!confirm(`Delete ${emp.first_name} ${emp.last_name}?`)) return;
    await apiJson(`/api/admin/employees/${emp.id}`, { method:'DELETE' });
    showToast('Employee deleted'); refresh();
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <h1 className="text-lg font-semibold">Employees</h1>
        <div className="flex items-center gap-2">
          <input
            className="border p-1.5 rounded w-56 text-xs"
            placeholder="Search by code/name/email"
            value={q}
            onChange={e=>{ setPage(1); setQ(e.target.value) }}
          />
          {canCreate && (
            <button
              className="px-2.5 py-1.5 text-xs rounded bg-black text-white"
              onClick={()=>{ setModal('create'); setCurrent(blank()) }}
            >
              Add Employee
            </button>
          )}
        </div>
      </div>

      {toast ? <div className="px-2.5 py-1.5 text-xs rounded bg-emerald-50 border border-emerald-200 text-emerald-700">{toast}</div> : null}

      <div className="rounded-xl border overflow-auto">
        <table className="min-w-[1100px] w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-left">
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Monthly</Th>
              <Th>Status</Th>
              <Th>Password</Th>
              <Th>Advance</Th>
              <Th>Permissions</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={10} className="p-4 text-center text-gray-500">No employees found.</td></tr>
            ) : list.map(r=> (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <Td>{r.emp_code || '-'}</Td>
                <Td>
                  <div className="font-medium">{r.first_name} {r.last_name}</div>
                  <div className="text-[10px] text-gray-500">{r.phone || ''}</div>
                </Td>
                <Td className="text-gray-700">{r.email || '—'}</Td>
                <Td>{r.role_name || '—'}</Td>
                <Td>₹ {Number(r.salary_monthly||0).toFixed(2)}</Td>
                <Td>
                  <span className={
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] border " +
                    (r.status==='active'
                      ? "bg-green-50 text-green-700 border-green-200"
                      : r.status==='inactive'
                        ? "bg-gray-50 text-gray-700 border-gray-200"
                        : "bg-yellow-50 text-yellow-700 border-yellow-200")
                  }>{r.status}</span>
                </Td>

                {/* Password column */}
                <Td>
                  <button
                    className="px-2 py-1 text-[11px] border rounded-md disabled:opacity-50"
                    disabled={!canUpdate}
                    onClick={()=>{ if (!canUpdate) return; setCurrent(r); setModal('password') }}
                  >
                    Reset
                  </button>
                </Td>

                {/* Advance column */}
                <Td>
                  <button
                    className="px-2 py-1 text-[11px] border rounded-md disabled:opacity-50"
                    disabled={!canUpdate}
                    onClick={()=>{ if (!canUpdate) return; setCurrent(r); setModal('advance') }}
                  >
                    Add
                  </button>
                </Td>

                {/* Permissions column */}
                <Td>
                  <button
                    className="px-2 py-1 text-[11px] border rounded-md disabled:opacity-50"
                    disabled={!canAssign}
                    onClick={()=> canAssign && openPermissions(r)}
                  >
                    Edit
                  </button>
                </Td>

                {/* Actions column */}
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <button className="px-2 py-1 text-[11px] border rounded-md" onClick={()=>{ setCurrent(r); setModal('view') }}>View</button>
                    <button
                      className="px-2 py-1 text-[11px] border rounded-md disabled:opacity-50"
                      disabled={!canUpdate}
                      onClick={()=>{ if (!canUpdate) return; setCurrent(r); setModal('edit') }}
                    >
                      Edit
                    </button>
                    <button
                      className="px-2 py-1 text-[11px] border rounded-md disabled:opacity-50"
                      disabled={!canDelete}
                      onClick={()=> canDelete && onDelete(r)}
                    >
                      Delete
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button className="px-2.5 py-1.5 text-xs rounded border" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
        <div className="text-xs">Page {page} / {totalPages}</div>
        <button className="px-2.5 py-1.5 text-xs rounded border" disabled={list.length<pageSize} onClick={()=>setPage(p=>p+1)}>Next</button>
        <div className="text-xs text-gray-600 ml-2">Total: {total}</div>
      </div>

      {modal && (
        <Modal onClose={closeModal}>
          {modal==='view' && current && (
            <ViewCard data={current} onClose={closeModal} />
          )}

          {(modal==='create' || modal==='edit') && (
            <EmployeeForm
              roles={roles}
              value={modal==='create' ? blank() : { ...current, password: '' }}
              onSubmit={save}
              onCancel={closeModal}
              mode={modal}
            />
          )}

          {modal==='password' && (
            <PasswordForm onSubmit={onResetPassword} onCancel={closeModal} />
          )}

          {modal==='advance' && (
            <AdvanceForm onSubmit={onAddAdvance} onCancel={closeModal} />
          )}

          {modal==='permissions' && (
            <PermissionsForm
              employee={current}
              permKeys={permKeys}
              value={empPerms}
              onChange={setEmpPerms}
              onSave={savePermissions}
              onCancel={closeModal}
            />
          )}
        </Modal>
      )}
    </div>
  )
}

/* ======================= Small UI helpers ======================= */
function Th({ children }){ return <th className="p-1.5 border font-semibold text-xs">{children}</th> }
function Td({ children, className='' }){ return <td className={`p-1.5 border ${className}`}>{children}</td> }

/* ======================= Modal & Forms ======================= */
function Modal({ children, onClose }){
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow p-3 w-[720px] max-w-[95vw]">
        <div className="flex justify-end"><button onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  )
}

function ViewCard({ data, onClose }){
  return (
    <div className="space-y-2 text-sm">
      <h3 className="text-base font-semibold">Employee Details</h3>
      <div className="grid grid-cols-2 gap-2">
        <div><span className="text-gray-500">Code:</span> {data.emp_code||'-'}</div>
        <div><span className="text-gray-500">Status:</span> {data.status}</div>
        <div><span className="text-gray-500">Name:</span> {data.first_name} {data.last_name}</div>
        <div><span className="text-gray-500">Role:</span> {data.role_name||'—'}</div>
        <div><span className="text-gray-500">Email:</span> {data.email||'—'}</div>
        <div><span className="text-gray-500">Phone:</span> {data.phone||'—'}</div>
        <div><span className="text-gray-500">Monthly:</span> ₹ {Number(data.salary_monthly||0).toFixed(2)}</div>
        <div><span className="text-gray-500">CTC:</span> ₹ {Number(data.salary_ctc||0).toFixed(2)}</div>
      </div>
      <div className="text-right">
        <button className="px-2.5 py-1.5 text-xs border rounded" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

function EmployeeForm({ value, onSubmit, onCancel, mode, roles }){
  const [f,setF] = useState(value)
  useEffect(()=> setF(value),[value])

  return (
    <form className="space-y-2" onSubmit={e=>{ e.preventDefault(); onSubmit(f) }}>
      <h3 className="text-base font-semibold">{mode==='create'?'Add Employee':'Edit Employee'}</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <input className="border p-1.5 rounded" placeholder="Employee Code (e.g., PB-00123)" value={f.emp_code} onChange={e=>setF({...f, emp_code:e.target.value})} />
        <select className="border p-1.5 rounded" value={f.status} onChange={e=>setF({...f, status:e.target.value})}>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="terminated">terminated</option>
        </select>

        <input className="border p-1.5 rounded" placeholder="First Name" value={f.first_name} onChange={e=>setF({...f, first_name:e.target.value})} />
        <input className="border p-1.5 rounded" placeholder="Last Name" value={f.last_name} onChange={e=>setF({...f, last_name:e.target.value})} />

        <input className="border p-1.5 rounded" placeholder="Email" value={f.email} onChange={e=>setF({...f, email:e.target.value})} />
        <input className="border p-1.5 rounded" placeholder="Phone" value={f.phone} onChange={e=>setF({...f, phone:e.target.value})} />

        <input type="date" className="border p-1.5 rounded" value={f.joined_on||''} onChange={e=>setF({...f, joined_on:e.target.value})} />
        <select className="border p-1.5 rounded" value={f.role_id ?? ''} onChange={(e)=> setF({...f, role_id: e.target.value ? Number(e.target.value) : null})}>
          <option value="">No Role</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <input className="border p-1.5 rounded" type="number" step="0.01" placeholder="Salary Monthly" value={f.salary_monthly} onChange={e=>setF({...f, salary_monthly:e.target.value})} />
        <input className="border p-1.5 rounded" type="number" step="0.01" placeholder="Salary CTC" value={f.salary_ctc} onChange={e=>setF({...f, salary_ctc:e.target.value})} />

        {mode==='create' && (
          <input className="border p-1.5 rounded" placeholder="Initial Password" value={f.password} onChange={e=>setF({...f, password:e.target.value})} />
        )}
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <button className="px-2.5 py-1.5 text-xs border rounded" type="button" onClick={onCancel}>Cancel</button>
        <button className="px-2.5 py-1.5 text-xs bg-black text-white rounded" type="submit">{mode==='create'?'Create':'Save'}</button>
      </div>
    </form>
  )
}

function PasswordForm({ onSubmit, onCancel }){
  const [p,setP] = useState('')
  return (
    <form className="space-y-2" onSubmit={e=>{ e.preventDefault(); if(!p) return; onSubmit(p) }}>
      <h3 className="text-base font-semibold mb-1">Reset Password</h3>
      <input className="border p-1.5 rounded w-full text-xs" placeholder="New Password" value={p} onChange={e=>setP(e.target.value)} />
      <div className="text-right space-x-2">
        <button className="px-2.5 py-1.5 text-xs border rounded" type="button" onClick={onCancel}>Cancel</button>
        <button className="px-2.5 py-1.5 text-xs bg-black text-white rounded">Reset</button>
      </div>
    </form>
  )
}

function AdvanceForm({ onSubmit, onCancel }){
  const [a,setA] = useState({ amount:'', reason:'', issued_on:'' })
  return (
    <form className="space-y-2" onSubmit={e=>{ e.preventDefault(); if(!a.amount) return; onSubmit(a) }}>
      <h3 className="text-base font-semibold mb-1">Add Salary Advance</h3>
      <input className="border p-1.5 rounded w-full text-xs" type="number" step="0.01" placeholder="Amount" value={a.amount} onChange={e=>setA({...a, amount:e.target.value})} />
      <input className="border p-1.5 rounded w-full text-xs" placeholder="Reason (optional)" value={a.reason} onChange={e=>setA({...a, reason:e.target.value})} />
      <input className="border p-1.5 rounded w-full text-xs" type="date" value={a.issued_on} onChange={e=>setA({...a, issued_on:e.target.value})} />
      <div className="text-right space-x-2">
        <button className="px-2.5 py-1.5 text-xs border rounded" type="button" onClick={onCancel}>Cancel</button>
        <button className="px-2.5 py-1.5 text-xs bg-black text-white rounded">Add Advance</button>
      </div>
    </form>
  )
}

// ---------------- Permissions Form (tri-state) -----------------
function PermissionsForm({ employee, permKeys, value, onChange, onSave, onCancel }){
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Permissions — {employee?.first_name} {employee?.last_name}</h3>
        <p className="text-[10px] text-gray-500">— (no override) ⇒ role apply • Allow ⇒ explicit allow • Deny ⇒ explicit block</p>
      </div>
      <div className="overflow-auto max-h-[60vh] pr-1">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left">
              <th className="p-1.5">Module</th>
              <th className="p-1.5">read</th>
              <th className="p-1.5">write</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupByPrefix(permKeys)).map(([mod]) => {
              const readKey = `${mod}.read`
              const writeKey = `${mod}.write`
              return (
                <tr key={mod} className="border-t">
                  <td className="p-1.5 font-medium">{mod}</td>
                  <td className="p-1.5"><TriState value={value?.[readKey] ?? null} onChange={(v)=> onChange(prev=>({ ...prev, [readKey]: v }))} /></td>
                  <td className="p-1.5"><TriState value={value?.[writeKey] ?? null} onChange={(v)=> onChange(prev=>({ ...prev, [writeKey]: v }))} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-right space-x-2">
        <button onClick={onCancel} className="px-2.5 py-1.5 text-xs rounded border">Cancel</button>
        <button onClick={onSave} className="px-2.5 py-1.5 text-xs rounded bg-black text-white">Save Overrides</button>
      </div>
    </div>
  )
}

function groupByPrefix(keys){
  const g = {}; for(const k of keys){ const [p] = k.split('.'); if(!g[p]) g[p] = []; g[p].push(k) } return g
}

function TriState({ value, onChange }){
  function cycle(){ onChange(value===null ? true : value===true ? false : null) }
  return (
    <button type="button" onClick={cycle}
      className={"px-3 py-1 rounded-full border text-[10px] " + (value===true ? 'bg-green-100 border-green-300' : value===false ? 'bg-red-100 border-red-300' : 'bg-gray-100 border-gray-300')}
      title={value===null? 'No override (role applies)' : value? 'Allow' : 'Deny'}
    >{value===null ? '—' : value ? 'Allow' : 'Deny'}</button>
  )
}

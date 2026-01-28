// src/pages/Payroll.jsx
import { useEffect, useState } from 'react'
import { PayrollAPI } from '../apiEmployees'
import useEmployeePermissions from "../hooks/useEmployeePermissions";

export default function Payroll(){
  const { can } = useEmployeePermissions();

  const canRead      = !!can('payroll.read');
  const canGenerate  = !!can('payroll.generate');
  const canProcess   = !!can('payroll.process');
  const canPay       = !!can('payroll.pay');

  const [runs,setRuns] = useState([]);
  const [sel,setSel] = useState(null);
  const [slips,setSlips] = useState([]);

  async function refresh(){
    if (!canRead) { setRuns([]); setSel(null); setSlips([]); return; }
    setRuns(await PayrollAPI.payruns());
  }
  useEffect(()=>{ refresh() },[canRead]);

  async function load(id){
    if (!canRead) return;
    setSel(id);
    setSlips(await PayrollAPI.payslips(id));
  }

  if (!canRead) {
    return (
      <div className="p-4">
        <div className="p-3 rounded-xl border bg-amber-50 text-amber-900">
          You don’t have permission to view payroll.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MonthCreator
            disabled={!canGenerate}
            onCreate={async(m,y,pd)=>{ if(!canGenerate) return; await PayrollAPI.createRun(m,y,pd); refresh() }}
          />
        </div>

        <div className="border rounded divide-y">
          {runs.map(r=> (
            <div key={r.id} className={`p-2 ${sel===r.id?'bg-gray-100':''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.run_month}/{r.run_year}</div>
                  <div className="text-xs text-gray-500">
                    status: {r.status} {r.pay_date?` • pay date: ${r.pay_date}`:''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-2 py-1 border rounded" onClick={()=>load(r.id)}>Open</button>
                  <button
                    className="px-2 py-1 border rounded disabled:opacity-50"
                    disabled={!canGenerate}
                    onClick={async()=>{ if(!canGenerate) return; await PayrollAPI.generate(r.id); load(r.id) }}
                  >
                    Generate
                  </button>
                  <button
                    className="px-2 py-1 border rounded disabled:opacity-50"
                    disabled={!canProcess}
                    onClick={async()=>{ if(!canProcess) return; await PayrollAPI.markRunProcessed(r.id); refresh() }}
                  >
                    Mark Processed
                  </button>
                  <button
                    className="px-2 py-1 border rounded disabled:opacity-50"
                    disabled={!canPay}
                    onClick={async()=>{ if(!canPay) return; await PayrollAPI.markRunPaid(r.id); refresh() }}
                  >
                    Mark Paid
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!runs.length && <div className="p-3 text-sm text-gray-500">No payruns</div>}
        </div>
      </div>

      <div>
        {!sel ? (
          <div className="p-3 rounded-xl border">Select a payrun</div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Payslips</h2>
            </div>
            <table className="w-full border text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 border">Emp Code</th>
                  <th className="p-2 border">Name</th>
                  <th className="p-2 border">Net Pay</th>
                  <th className="p-2 border">Status</th>
                  <th className="p-2 border">Action</th>
                </tr>
              </thead>
              <tbody>
                {slips.map(s=> (
                  <tr key={s.id}>
                    <td className="p-2 border">{s.emp_code}</td>
                    <td className="p-2 border">{s.first_name} {s.last_name}</td>
                    <td className="p-2 border">₹ {Number(s.net_pay).toFixed(2)}</td>
                    <td className="p-2 border">{s.status}</td>
                    <td className="p-2 border">
                      {s.status==='unpaid' && (
                        <button
                          className="px-2 py-1 border rounded disabled:opacity-50"
                          disabled={!canPay}
                          onClick={async()=>{ if(!canPay) return; await PayrollAPI.markSlipPaid(s.id); setSlips(await PayrollAPI.payslips(sel)) }}
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!slips.length && <tr><td colSpan={5} className="p-3 text-center text-gray-500">No payslips</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function MonthCreator({ onCreate, disabled }){
  const [m,setM] = useState(''); const [y,setY] = useState(''); const [pd,setPd] = useState('')
  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="block text-xs text-gray-500">Month</label>
        <input className="border p-2 rounded w-24" placeholder="MM" value={m} onChange={e=>setM(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Year</label>
        <input className="border p-2 rounded w-28" placeholder="YYYY" value={y} onChange={e=>setY(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Pay Date</label>
        <input className="border p-2 rounded" type="date" value={pd} onChange={e=>setPd(e.target.value)} />
      </div>
      <button
        className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
        disabled={disabled}
        onClick={()=> onCreate(Number(m), Number(y), pd||null)}
      >
        Create Payrun
      </button>
    </div>
  )
}
